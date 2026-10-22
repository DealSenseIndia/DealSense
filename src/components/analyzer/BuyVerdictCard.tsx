"use client";

import { motion } from "framer-motion";
import { Bot, Info, TrendingDown, TrendingUp } from "lucide-react";
import type { VerdictResult } from "@/lib/types";
import type { Evidence } from "@/lib/engine/history";
import { cn, formatINR } from "@/lib/utils";

const SCALE = [
  { label: "Skip", color: "#ef4444" },
  { label: "Wait", color: "#f59e0b" },
  { label: "Okay", color: "#eab308" },
  { label: "Yes", color: "#22c55e" },
];

function labelFor(score: number | null): { text: string; color: string; knob: number } {
  if (score === null) return { text: "Not enough data", color: "#94a3b8", knob: 0 };
  if (score >= 78) return { text: "Buy now", color: "#22c55e", knob: 100 };
  if (score >= 55) return { text: "Good", color: "#eab308", knob: 78 };
  if (score >= 32) return { text: "Wait", color: "#f59e0b", knob: 55 };
  return { text: "Skip", color: "#ef4444", knob: 18 };
}

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
  const l = labelFor(score);
  const insight = evidence.filter((e) => e.kind !== "RECOMMENDATION");

  return (
    <div className="overflow-hidden rounded-3xl bg-[#0B1220] text-white shadow-[0_30px_80px_-30px_rgba(11,18,32,0.8)]">
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_230px]">
        <div className="min-w-0">
          {/* header row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <Info className="h-4 w-4" />
              </span>
              <h2 className="text-[16px] font-extrabold tracking-tight sm:text-[18px]">
                Should you buy at this price?
              </h2>
            </div>

            <div className="flex items-center gap-2.5 border-l border-white/10 pl-5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400">
                Buy score
              </span>
              <span className="text-[10.5px] font-bold text-slate-300">{l.text}</span>
              <span className="tabular text-[30px] font-extrabold leading-none" style={{ color: l.color }}>
                {score === null ? "ΓÇö" : `${score}%`}
              </span>
            </div>

            <div className="flex items-center gap-2.5 border-l border-white/10 pl-5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400">
                Trend
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-200">
                {verdict?.stats.trendPct !== null && verdict?.stats.trendPct !== undefined && verdict.stats.trendPct <= 0 ? (
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
                )}
                {verdict?.stats.trendPct === null || verdict?.stats.trendPct === undefined
                  ? "ΓÇö"
                  : `${verdict.stats.trendPct > 0 ? "+" : ""}${verdict.stats.trendPct.toFixed(1)}%`}
              </span>
            </div>
          </div>

          {/* gradient scale */}
          <div className="mt-6">
            <div className="relative">
              <div className="h-2.5 w-full rounded-full bg-gradient-verdict" />
              <motion.div
                initial={{ left: "0%" }}
                animate={{ left: `${l.knob}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white bg-white shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
              />
            </div>
            <div className="mt-2 flex justify-between">
              {SCALE.map((s) => (
                <span
                  key={s.label}
                  className="text-[11.5px] font-bold"
                  style={{ color: s.color }}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {/* tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {verdict && (
              <>
                <span className="rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-slate-300">
                  Confidence: <span className="text-white">{verdict.confidence}</span>
                </span>
                <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                  {verdict.stats.count} verified observations
                </span>
                {verdict.fakeDiscount && (
                  <span className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                    ΓÜá Inflated MRP detected
                  </span>
                )}
              </>
            )}
          </div>

          {/* insight */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex items-center gap-2 text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400">
              <Bot className="h-3.5 w-3.5 text-emerald-400" />
              Price insight
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-slate-300">
              {insight.length ? (
                <>
                  {insight[0]?.text}{" "}
                  {insight[1] && (
                    <>
                      {insight[1].text}{" "}
                    </>
                  )}
                  {verdict && (
                    <span className="font-semibold text-slate-100">
                      {verdict.reasons[0]}
                    </span>
                  )}
                </>
              ) : (
                "DealSense has not collected enough verified observations for this product yet. Track it and the insight builds as we record real prices."
              )}
            </p>
          </div>
        </div>

        {/* right rail ΓÇö a row on small screens, a rail on large */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4 lg:block lg:space-y-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <Rail label="Tracking" value={`${trackingDays}d`} />
          <Rail label="Typical price" value={median !== null ? formatINR(median) : "ΓÇö"} />
          <Rail
            label="Potential saving"
            value={potentialSaving !== null ? formatINR(potentialSaving) : "ΓÇö"}
            accent
          />
          <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:col-span-1">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              Current price
            </div>
            <div className="tabular mt-1 text-[20px] font-extrabold text-white">
              {currentPrice !== null ? formatINR(currentPrice) : "ΓÇö"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Rail({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-extrabold uppercase tracking-widest text-slate-400">{label}</div>
      <div
        className={cn(
          "tabular mt-0.5 text-[16px] font-extrabold",
          accent ? "text-emerald-400" : "text-white",
        )}
      >
        {value}
      </div>
    </div>
  );
}
