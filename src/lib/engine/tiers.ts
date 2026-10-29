import { workerConfig } from "../config";
import type { PricePoint } from "../types";

export type RefreshTier = "hot" | "warm" | "standard";

export interface TierSignals {
  /** An active live deal is the strongest signal we have. */
  live: boolean;
  price: number;
  low: number | null;
  avg: number | null;
  /** Price changes in the last 90 days (a proxy for how fast this listing moves). */
  changes90d: number;
  /** Recorded points; a thin series needs a few quick checks to become scoreable. */
  count: number;
}

/**
 * Calibrated against the 2026-10-30 direct catalogue: the top 150 scores are
 * hot, the next 450 warm, the rest standard. That is roughly 4,300 reads a
 * day. Re-calibrate when the catalogue or the market moves the mix.
 */
const HOT_SCORE = 99.5;
const WARM_SCORE = 41.4;

export function averagePrice(points: PricePoint[]): number | null {
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.price > 0) {
      sum += p.price;
      n++;
    }
  }
  return n ? sum / n : null;
}

export function countPriceChanges(points: PricePoint[], since: number): number {
  let changes = 0;
  let previous: number | null = null;
  for (const p of points) {
    if (p.price <= 0) continue;
    if (p.t < since) {
      previous = p.price;
      continue;
    }
    if (previous !== null && p.price !== previous) changes++;
    previous = p.price;
  }
  return changes;
}

/**
 * A listing is hot when it is live, deeply under its average, at its low with
 * movement behind it, or still building its first few points. Warm is the
 * middle band; everything else is checked once a day.
 */
export function refreshTierFor(signals: TierSignals): RefreshTier {
  if (signals.price <= 0) return "standard";
  if (signals.count < 3) return "hot";

  const atLow = signals.low !== null && signals.low > 0 && signals.price <= signals.low * 1.02;
  const discount =
    signals.avg !== null && signals.avg > 0
      ? ((signals.avg - signals.price) / signals.avg) * 100
      : 0;
  const score =
    (signals.live ? 100 : 0) +
    (atLow ? 25 : 0) +
    Math.max(0, discount) * 2 +
    Math.min(Math.max(0, signals.changes90d), 10) * 3;

  if (score >= HOT_SCORE) return "hot";
  if (score >= WARM_SCORE) return "warm";
  return "standard";
}

export function intervalForTier(tier: RefreshTier): number {
  return workerConfig.tiers[tier];
}
