import type { DealStats } from "../types";
import { median } from "../utils";

export interface ObservationLike {
  price: number | null;
  effectivePrice?: number | null;
  observedAt: number;
}

/** Statistics derived ONLY from real observations. Never synthetic. */
export function computeStats(obs: ObservationLike[]): DealStats {
  const priced = obs
    .filter((o) => o.price !== null && (o.price as number) > 0)
    .sort((a, b) => a.observedAt - b.observedAt);

  if (!priced.length) {
    return {
      count: 0,
      low: null,
      high: null,
      median: null,
      median90: null,
      firstObservedAt: null,
      lastObservedAt: null,
      trendPct: null,
    };
  }

  const prices = priced.map((o) => o.price as number);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const med = median(prices);

  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const recent = priced.filter((o) => o.observedAt >= cutoff).map((o) => o.price as number);
  const med90 = recent.length >= 2 ? median(recent) : med;

  const first = priced[0].price as number;
  const last = priced[priced.length - 1].price as number;
  const trendPct = first > 0 ? ((last - first) / first) * 100 : null;

  return {
    count: priced.length,
    low,
    high,
    median: med,
    median90: med90,
    firstObservedAt: priced[0].observedAt,
    lastObservedAt: priced[priced.length - 1].observedAt,
    trendPct,
  };
}

export function priceSeries(obs: ObservationLike[]): { t: number; price: number }[] {
  return obs
    .filter((o) => o.price !== null && (o.price as number) > 0)
    .sort((a, b) => a.observedAt - b.observedAt)
    .map((o) => ({ t: o.observedAt, price: o.price as number }));
}
