import { client } from "../db/client";
import { createAlert, getAlertsForListing, recordAlertEvent, updateAlert } from "../db/queries";
import type { AlertRow } from "../db/queries";
import type { Confidence, Verdict } from "../types";
import { getDispatcher, type AlertNotification } from "../notifications/dispatcher";

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface AlertContext {
  listingId: string;
  productId: string;
  productTitle: string;
  merchant: string;
  effectivePrice: number;
  targetPriceHint?: number | null;
  verdict: Verdict;
  confidence: Confidence;
  score: number | null;
  reasons: string[];
  affiliateUrl: string;
  observedAt: number;
}

export interface AlertTrigger {
  alertId: string;
  type: string;
  notification: AlertNotification;
  dispatched: boolean;
  dispatchError?: string;
}

export interface CreateAlertInput {
  productId: string;
  listingId: string;
  alertType?: "TARGET_PRICE" | "PERCENT_DROP" | "DEAL_SCORE";
  targetPrice?: number | null;
  baselinePrice?: number | null;
  targetPercent?: number | null;
  targetScore?: number | null;
  channel?: string;
  contact?: string | null;
  isPersistent?: boolean;
}

export async function addAlert(input: CreateAlertInput): Promise<AlertRow> {
  return createAlert({
    productId: input.productId,
    listingId: input.listingId,
    alertType: input.alertType ?? "TARGET_PRICE",
    targetPrice: input.targetPrice ?? null,
    baselinePrice: input.baselinePrice ?? null,
    targetPercent: input.targetPercent ?? null,
    targetScore: input.targetScore ?? null,
    channel: input.channel ?? "telegram",
    contact: input.contact ?? null,
    isPersistent: input.isPersistent ?? true,
  });
}

function rearmThreshold(alert: AlertRow): number {
  const target = alert.targetPrice ?? alert.baselinePrice ?? 0;
  if (!target) return 0;
  return Math.max(target * 1.02, target + 100);
}

export function alertConditionMet(alert: AlertRow, ctx: AlertContext): boolean {
  const price = ctx.effectivePrice;
  if (!price || price <= 0) return false;

  switch (alert.alertType) {
    case "PERCENT_DROP": {
      const baseline = alert.baselinePrice ?? 0;
      const target = alert.targetPercent ?? 0;
      if (!baseline || !target) return false;
      return ((baseline - price) / baseline) * 100 >= target;
    }
    case "DEAL_SCORE": {
      const target = alert.targetScore ?? 100;
      return (
        ctx.score !== null &&
        ctx.score >= target &&
        ctx.verdict === "BUY" &&
        (ctx.confidence === "HIGH" || ctx.confidence === "MEDIUM")
      );
    }
    case "TARGET_PRICE":
    default: {
      const target = alert.targetPrice ?? 0;
      if (!target) return false;
      return price <= target; // exact equality triggers
    }
  }
}

function savings(alert: AlertRow, ctx: AlertContext): { amount: number | null; pct: number | null } {
  const ref = alert.targetPrice ?? alert.baselinePrice ?? null;
  if (!ref) return { amount: null, pct: null };
  return { amount: ref - ctx.effectivePrice, pct: ((ref - ctx.effectivePrice) / ref) * 100 };
}

/**
 * Evaluate all active alerts for a listing against a fresh observation.
 * The ARMED → COOLDOWN transition is an atomic claim, so two concurrent
 * evaluations can never produce two notifications for the same alert.
 */
export async function evaluateAlerts(ctx: AlertContext): Promise<AlertTrigger[]> {
  const list = await getAlertsForListing(ctx.listingId);
  const triggers: AlertTrigger[] = [];
  const now = Date.now();

  for (const alert of list) {
    if (alert.status === "DISABLED" || alert.status === "PAUSED") continue;

    // Recovery / cooldown handling.
    if (alert.status === "COOLDOWN") {
      const stillCooling = alert.cooldownUntil && now < alert.cooldownUntil;
      const recovered = ctx.effectivePrice >= rearmThreshold(alert);
      if (recovered && !stillCooling) {
        await updateAlert(alert.id, { status: "ARMED" });
      }
      continue;
    }

    if (alert.status !== "ARMED") continue;
    if (!alertConditionMet(alert, ctx)) continue;

    // Atomic claim.
    const claimed = await client.execute({
      sql: `UPDATE alerts
              SET status = 'COOLDOWN',
                  last_triggered_at = ?,
                  last_trigger_price = ?,
                  trigger_count = trigger_count + 1,
                  cooldown_until = ?,
                  updated_at = ?
            WHERE id = ? AND status = 'ARMED'`,
      args: [now, ctx.effectivePrice, now + COOLDOWN_MS, now, alert.id],
    });

    if (claimed.rowsAffected !== 1) continue; // someone else won the race

    const s = savings(alert, ctx);
    const notification: AlertNotification = {
      alertId: alert.id,
      alertType: alert.alertType,
      productTitle: ctx.productTitle,
      merchant: ctx.merchant,
      channel: alert.channel,
      contact: alert.contact,
      currentPrice: ctx.effectivePrice,
      effectivePrice: ctx.effectivePrice,
      targetPrice: alert.targetPrice,
      baselinePrice: alert.baselinePrice,
      savingsAmount: s.amount,
      savingsPct: s.pct,
      dealScore: ctx.score,
      verdict: ctx.verdict,
      confidence: ctx.confidence,
      reasons: ctx.reasons,
      affiliateUrl: ctx.affiliateUrl,
      observedAt: ctx.observedAt,
    };

    // State is already committed — dispatch AFTER, and never roll back on failure.
    let dispatched = false;
    let dispatchError: string | undefined;
    try {
      const res = await getDispatcher(alert.channel).send(notification);
      dispatched = res.ok;
      dispatchError = res.error;
    } catch (err) {
      dispatchError = (err as Error).message;
    }

    await recordAlertEvent(alert.id, "TRIGGERED", { notification, dispatched, dispatchError });

    if (!alert.isPersistent) {
      await updateAlert(alert.id, { status: "DISABLED" });
    }

    triggers.push({ alertId: alert.id, type: alert.alertType, notification, dispatched, dispatchError });
  }

  return triggers;
}
