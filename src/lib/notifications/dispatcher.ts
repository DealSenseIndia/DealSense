import type { Confidence, Verdict } from "../types";

export interface AlertNotification {
  alertId: string;
  alertType: string;
  productTitle: string;
  merchant: string;
  channel: string;
  contact: string | null;
  currentPrice: number;
  effectivePrice: number;
  targetPrice: number | null;
  baselinePrice: number | null;
  savingsAmount: number | null;
  savingsPct: number | null;
  dealScore: number | null;
  verdict: Verdict;
  confidence: Confidence;
  reasons: string[];
  affiliateUrl: string;
  observedAt: number;
}

export interface DispatchResult {
  ok: boolean;
  channel: string;
  error?: string;
}

export interface NotificationDispatcher {
  readonly channel: string;
  send(n: AlertNotification): Promise<DispatchResult>;
}

/** Used in dev/tests and when no real channel is configured. */
export class ConsoleDispatcher implements NotificationDispatcher {
  readonly channel = "console";
  async send(n: AlertNotification): Promise<DispatchResult> {
    // eslint-disable-next-line no-console
    console.log(
      `[DealSense alert] ${n.productTitle} — ${n.merchant} ₹${n.effectivePrice} (${n.verdict})`,
    );
    return { ok: true, channel: this.channel };
  }
}

/** Telegram delivery via the official Bot API. No-op if unconfigured. */
export class TelegramDispatcher implements NotificationDispatcher {
  readonly channel = "telegram";
  constructor(private token: string) {}

  async send(n: AlertNotification): Promise<DispatchResult> {
    const chatId = n.contact;
    if (!chatId) return { ok: false, channel: this.channel, error: "missing chat id" };

    const lines = [
      `🔥 <b>PRICE ALERT — DealSense</b>`,
      ``,
      `<b>${escapeHtml(n.productTitle)}</b>`,
      `${n.merchant} · ₹${Math.round(n.effectivePrice).toLocaleString("en-IN")}`,
    ];
    if (n.targetPrice) lines.push(`Target: ₹${Math.round(n.targetPrice).toLocaleString("en-IN")}`);
    if (n.savingsAmount) lines.push(`You save ₹${Math.round(n.savingsAmount).toLocaleString("en-IN")}`);
    if (n.dealScore !== null) lines.push(`Deal score: <b>${n.dealScore}/100</b> — ${n.verdict}`);

    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[{ text: "🛒 Buy now", url: n.affiliateUrl }]],
          },
        }),
      });
      if (!res.ok) {
        return { ok: false, channel: this.channel, error: `telegram ${res.status}` };
      }
      return { ok: true, channel: this.channel };
    } catch (err) {
      return { ok: false, channel: this.channel, error: (err as Error).message };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function getDispatcher(channel: string): NotificationDispatcher {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (channel === "telegram" && token) return new TelegramDispatcher(token);
  return new ConsoleDispatcher();
}
