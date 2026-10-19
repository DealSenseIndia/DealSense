import type { Confidence, DealStats, Verdict, VerdictResult } from "../types";
import { MIN_OBSERVATIONS_FOR_SCORE, OBSERVATIONS_FOR_HIGH_CONFIDENCE } from "../config";
import { clamp, formatINR, round } from "../utils";

export interface VerdictInput {
  current: number;
  mrp?: number | null;
  stats: DealStats;
}

function confidenceFor(count: number): Confidence {
  if (count >= OBSERVATIONS_FOR_HIGH_CONFIDENCE) return "HIGH";
  if (count >= 5) return "MEDIUM";
  if (count >= MIN_OBSERVATIONS_FOR_SCORE) return "LOW";
  return "INSUFFICIENT";
}

/**
 * The DealSense verdict. Deliberately explainable and honest:
 * if we do not have enough REAL observations, we say so instead of guessing.
 */
export function evaluateDeal(input: VerdictInput): VerdictResult {
  const { current, mrp, stats } = input;
  const count = stats.count;

  const advertisedDiscountPct =
    mrp && mrp > current ? round(((mrp - current) / mrp) * 100, 1) : null;

  if (count < MIN_OBSERVATIONS_FOR_SCORE || stats.median === null) {
    return {
      score: null,
      verdict: "INSUFFICIENT",
      confidence: "INSUFFICIENT",
      reasons: [
        `DealSense has only ${count} verified observation${count === 1 ? "" : "s"} for this product.`,
        "Not enough real price history yet to judge this deal honestly.",
      ],
      stats,
      genuineDiscountPct: null,
      advertisedDiscountPct,
      fakeDiscount: false,
    };
  }

  const low = stats.low ?? current;
  const high = stats.high ?? current;
  const median = stats.median;

  // 1) Position within the observed range (0 = at low, 1 = at high).
  const span = high - low;
  const position = span > 0 ? clamp((current - low) / span, 0, 1) : 0.5;
  const positionScore = (1 - position) * 100;

  // 2) How far below the typical (median) price we are.
  const genuineDiscountPct = median > 0 ? round(((median - current) / median) * 100, 1) : 0;
  const medianScore = clamp(50 + genuineDiscountPct * 2, 0, 100);

  let score = positionScore * 0.55 + medianScore * 0.45;

  const reasons: string[] = [];

  // Fake-discount detection: big MRP "discount" but not genuinely below typical.
  const fakeDiscount =
    advertisedDiscountPct !== null &&
    advertisedDiscountPct >= 20 &&
    (genuineDiscountPct <= 3 || genuineDiscountPct === 0);

  if (fakeDiscount) {
    score -= 18;
    reasons.push(
      `Advertised ${advertisedDiscountPct}% off is measured against an inflated MRP — it is only ${genuineDiscountPct}% below the typical price.`,
    );
  }

  // All-time-low proximity bonus.
  const nearLow = low > 0 && (current - low) / low <= 0.03;
  if (nearLow) {
    score += 8;
    reasons.push(`Within 3% of the lowest price DealSense has ever observed (${formatINR(low)}).`);
  }

  score = clamp(round(score), 0, 100);

  let verdict: Verdict;
  if (score >= 75) verdict = "BUY";
  else if (score >= 50) verdict = "FAIR";
  else if (score >= 25) verdict = "WAIT";
  else verdict = "AVOID";

  const diff = round(median - current);
  if (diff > 0) reasons.push(`${formatINR(diff)} below the typical observed price of ${formatINR(median)}.`);
  else if (diff < 0) reasons.push(`${formatINR(Math.abs(diff))} above the typical observed price of ${formatINR(median)}.`);

  if (genuineDiscountPct > 5 && !fakeDiscount) {
    reasons.push(`${genuineDiscountPct}% cheaper than the usual market price.`);
  }
  if (stats.trendPct !== null && stats.trendPct <= -5) {
    reasons.push(`Price has been trending down (${Math.abs(round(stats.trendPct, 1))}% since tracking began).`);
  }
  if (verdict === "WAIT") {
    reasons.push("Prices for this product have historically dropped — waiting could save you money.");
  }
  if (verdict === "AVOID" && !fakeDiscount) {
    reasons.push("Current price is high relative to what DealSense has observed. Not a good time to buy.");
  }

  return {
    score,
    verdict,
    confidence: confidenceFor(count),
    reasons,
    stats,
    genuineDiscountPct,
    advertisedDiscountPct,
    fakeDiscount,
  };
}

export const verdictMeta: Record<
  Verdict,
  { label: string; blurb: string; color: string; emoji: string }
> = {
  BUY: { label: "Buy now", blurb: "This is a genuinely good price.", color: "#22c55e", emoji: "🔥" },
  FAIR: { label: "Fair price", blurb: "A normal price. Fine to buy, no rush.", color: "#38bdf8", emoji: "🙂" },
  WAIT: { label: "Wait", blurb: "Likely to get cheaper. Hold on.", color: "#f59e0b", emoji: "⏳" },
  AVOID: { label: "Avoid", blurb: "Bad price right now. Do not buy.", color: "#ef4444", emoji: "🚫" },
  INSUFFICIENT: {
    label: "Not enough data",
    blurb: "DealSense is still learning this product's real price range.",
    color: "#94a3b8",
    emoji: "🕐",
  },
};
