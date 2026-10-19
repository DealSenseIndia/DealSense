import type { LandedPrice, PricePoint, VerdictResult } from "../types";
import type { MarketContext } from "../db/market";
import type { ExternalHistory } from "./providers";

export type EvidenceKind = "VERIFIED FACT" | "CALCULATION" | "RECOMMENDATION" | "MARKET CONTEXT";

export interface Evidence {
  kind: EvidenceKind;
  text: string;
}

export type HistorySource = "own" | "cross_store" | "external" | "none";

export interface HistoryBundle {
  /** Series to chart. */
  points: PricePoint[];
  /** Where the series came from. */
  source: HistorySource;
  sourceLabel: string;
  /** How much history we actually have (points). */
  observationCount: number;
  /** All-time low/high across the merged series. */
  low: number | null;
  high: number | null;
  median: number | null;
  median90: number | null;
  /** Real category market context — available even for untracked products. */
  market: MarketContext | null;
  /** MRP-based advertised discount (NOT verified against history). */
  advertisedDiscountPct: number | null;
  /** Labelled reasoning, ready to render. */
  evidence: Evidence[];
  /** True when we have enough real points to score confidently. */
  hasSufficientHistory: boolean;
}

export const MIN_POINTS_FOR_SCORE = 3;

function mergeSeries(series: PricePoint[][]): PricePoint[] {
  const all = series.flat().filter((p) => p.price > 0 && p.t > 0);
  const byDay = new Map<number, PricePoint>();
  for (const p of all.sort((a, b) => a.t - b.t)) {
    const day = Math.floor(p.t / 86_400_000);
    // keep the last observation of each day
    byDay.set(day, p);
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t);
}

export function mergeExternal(existing: PricePoint[], ext: ExternalHistory): PricePoint[] {
  return mergeSeries([existing, ext.points.map((p) => ({ t: p.t, price: p.price }))]);
}

export function statsFrom(points: PricePoint[]) {
  if (!points.length) {
    return { low: null, high: null, median: null, median90: null, count: 0, trendPct: null };
  }
  const prices = points.map((p) => p.price);
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const cutoff = Date.now() - 90 * 86_400_000;
  const recent = points.filter((p) => p.t >= cutoff).map((p) => p.price);
  const sortedRecent = [...recent].sort((a, b) => a - b);
  const midR = Math.floor(sortedRecent.length / 2);
  const med90 = recent.length
    ? sortedRecent.length % 2
      ? sortedRecent[midR]
      : (sortedRecent[midR - 1] + sortedRecent[midR]) / 2
    : med;
  const first = prices[0];
  const last = prices[prices.length - 1];
  return {
    low: Math.min(...prices),
    high: Math.max(...prices),
    median: med,
    median90: med90,
    count: points.length,
    trendPct: first > 0 ? ((last - first) / first) * 100 : null,
  };
}

/**
 * Build the labelled evidence list.
 * Every line states exactly what we know and how we know it.
 */
export function buildEvidence(input: {
  verdict: VerdictResult | null;
  stats: { low: number | null; high: number | null; median: number | null; median90: number | null; count: number };
  currentPrice: number | null;
  mrp: number | null;
  landed: LandedPrice | null;
  rival: { merchant: string; price: number | null } | null;
  market: MarketContext | null;
  lastCheckedAt: number | null;
  sourceLabel: string;
}): Evidence[] {
  const out: Evidence[] = [];
  const { verdict, stats, currentPrice, mrp, landed, rival, market } = input;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  if (currentPrice !== null) {
    out.push({
      kind: "VERIFIED FACT",
      text: `Current price observed at ${inr(currentPrice)}${input.lastCheckedAt ? ` on ${new Date(input.lastCheckedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}.`,
    });
  }

  if (stats.count > 0 && stats.low !== null && stats.low !== currentPrice) {
    out.push({
      kind: "VERIFIED FACT",
      text: `Lowest observed price in ${input.sourceLabel} is ${inr(stats.low)}.`,
    });
  } else if (stats.count > 0 && stats.low !== null) {
    out.push({
      kind: "VERIFIED FACT",
      text: `Lowest observed price in ${input.sourceLabel} is ${inr(stats.low)} — this is the record low.`,
    });
  }

  if (stats.count > 1 && stats.median !== null) {
    out.push({
      kind: "CALCULATION",
      text: `Median typical price across ${stats.count} observations is ${inr(stats.median)}.`,
    });
  }

  if (currentPrice !== null && stats.median !== null && stats.median > 0) {
    const pct = ((stats.median - currentPrice) / stats.median) * 100;
    out.push({
      kind: "CALCULATION",
      text:
        pct >= 0
          ? `Current price is ${pct.toFixed(1)}% below the typical median.`
          : `Current price is ${Math.abs(pct).toFixed(1)}% above the typical median.`,
    });
  }

  if (rival?.price != null && currentPrice != null) {
    const diff = currentPrice - rival.price;
    out.push({
      kind: "VERIFIED FACT",
      text:
        diff === 0
          ? `${rival.merchant} lists the same product at the same price ${inr(rival.price)}.`
          : diff < 0
            ? `This store is ${inr(Math.abs(diff))} cheaper than ${rival.merchant} (${inr(rival.price)}).`
            : `${rival.merchant} is ${inr(Math.abs(diff))} cheaper (${inr(rival.price)}).`,
    });
  }

  if (landed && landed.bankDiscount > 0) {
    out.push({
      kind: "CALCULATION",
      text: `With the best available card offer, the landed price is ${inr(landed.effective)} — ${inr(landed.savings)} less than the sticker price.`,
    });
  }

  if (market) {
    out.push({
      kind: "MARKET CONTEXT",
      text: `${market.category} typically cost ${inr(market.low)}–${inr(market.high)} across ${market.sampleSize} verified listings (median ${inr(market.median)}).`,
    });
  }

  if (verdict && verdict.verdict !== "INSUFFICIENT") {
    out.push({
      kind: "RECOMMENDATION",
      text: `${verdict.verdict === "BUY" ? "BUY NOW" : verdict.verdict === "FAIR" ? "FAIR — buying now is reasonable" : verdict.verdict === "WAIT" ? "WAIT — the price is likely to fall" : "AVOID — this is a poor time to buy"} — deal score ${verdict.score}/100 (${verdict.confidence} confidence).`,
    });
  } else if (stats.count < MIN_POINTS_FOR_SCORE) {
    out.push({
      kind: "MARKET CONTEXT",
      text: `DealSense has ${stats.count} verified observation${stats.count === 1 ? "" : "s"} for this product so far — tracking it is building the record.`,
    });
  }

  return out;
}
