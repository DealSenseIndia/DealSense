"use client";

import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { VerdictResult } from "@/lib/types";
import type { Evidence } from "@/lib/engine/history";
import { cn, formatINR } from "@/lib/utils";

/** The verdict, in plain words and one colour. */
function verdictOf(score: number | null): {
  word: string;
  color: string;
  tint: string;
  ring: string;
} {
  if (score === null)
    return {
      word: "Not enough data",
      color: "#64748b",
      tint: "rgba(100,116,139,0.10)",
      ring: "rgba(100,116,139,0.28)",
    };
  if (score >= 78)
    return {
      word: "Buy now",
      color: "#059669",
      tint: "rgba(16,185,129,0.10)",
      ring: "rgba(16,185,129,0.30)",
    };
  if (score >= 55)
    return {
      word: "Good price",
      color: "#d97706",
      tint: "rgba(245,158,11,0.10)",
      ring: "rgba(245,158,11,0.30)",
    };
  if (score >= 32)
    return {
      word: "Wait",
      color: "#ea580c",
      tint: "rgba(249,115,22,0.10)",
      ring: "rgba(249,115,22,0.30)",
    };
  return {
    word: "Skip it",
    color: "#e11d48",
    tint: "rgba(225,29,72,0.10)",
    ring: "rgba(225,29,72,0.28)",
  };
}

/**
 * One card, one answer.
 *
 * The verdict, the score, what you pay and the single most useful fact
 * about the price. Nothing else.
 */
export function BuyVerdictCard({
  verdict,
  evidence,
  currentPrice,
  median,
  trackingDays,
  potentialSaving,
}: {
  verdict: VerdictResult | null;
  evidence: Evidence[];
  currentPrice: number | null;
  median: number | null;
  trackingDays: number;
  potentialSaving: number | null;
}) {
  const score = verdict?.score ?? null;
  const v = verdictOf(score);
  const insight = evidence.filter((e) => e.kind !== "RECOMMENDATION");

  const trend = verdict?.stats.trendPct ?? null;
  const falling = trend !== null && trend <= 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-5 py-5">
        {/* the verdict */}
        <div className="flex min-w-0 items-center gap-4">
          <motion.span
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[20px] font-black tabular"
            style={{ background: v.tint, color: v.color, boxShadow: `inset 0 0 0 1px ${v.ring}` }}
          >
            {score === null ? "—" : score}
          </motion.span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              Should you buy at this price?
            </div>
            <div
              className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-[-0.02em]"
              style={{ color: v.color }}
            >
              {v.word}
            </div>
          </div>
        </div>

        {/* the money */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-l border-hairline pl-6">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              Price now
            </div>
            <div className="tabular mt-0.5 text-[20px] font-extrabold leading-none text-headline">
              {currentPrice !== null ? formatINR(currentPrice) : "—"}
            </div>
          </div>

          {median !== null ? (
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                Typical price
              </div>
              <div className="tabular mt-0.5 flex items-center gap-1.5 text-[20px] font-extrabold leading-none text-headline">
                {formatINR(median)}
                {trend !== null ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[12px] font-extrabold",
                      falling ? "text-[var(--dw-green-mid)]" : "text-rose-500",
                    )}
                  >
                    {falling ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {Math.abs(trend).toFixed(1)}%
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {potentialSaving !== null && potentialSaving > 0 ? (
            <div>
              <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                You could save
              </div>
              <div className="tabular mt-0.5 text-[20px] font-extrabold leading-none text-[var(--dw-green-mid)]">
                {formatINR(potentialSaving)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* the one thing worth reading */}
      {insight.length ? (
        <div className="border-t border-hairline bg-subtle px-5 py-3.5">
          <p className="text-[13px] leading-relaxed text-body">
            {insight[0]?.text}
            {insight[1] ? ` ${insight[1].text}` : ""}
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted">
            {trackingDays > 0 ? `Tracked for ${trackingDays} days` : "Tracking now"}
            {verdict ? ` · ${verdict.stats.count} verified observations` : ""}
            {verdict?.fakeDiscount ? " · inflated MRP detected" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
