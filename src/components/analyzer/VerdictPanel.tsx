"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { VerdictResult } from "@/lib/types";
import { verdictMeta } from "@/lib/engine/verdict";
import { formatINR } from "@/lib/utils";
import { ConfidenceBadge, VerdictBadge } from "@/components/ui/Badge";

export function VerdictPanel({ verdict }: { verdict: VerdictResult }) {
  const meta = verdictMeta[verdict.verdict];
  const score = verdict.score ?? 0;
  const c = 2 * Math.PI * 52;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 backdrop-blur-xl sm:p-8">
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `${meta.color}33` }}
      />
      <div className="relative flex flex-col gap-8 sm:flex-row sm:items-center">
        {/* Score ring */}
        <div className="relative grid h-36 w-36 shrink-0 place-items-center">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line)" strokeWidth="9" />
            <motion.circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={meta.color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: verdict.score === null ? c : c * (1 - score / 100) }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute grid place-items-center text-center">
            {verdict.score === null ? (
              <span className="text-3xl">🕐</span>
            ) : (
              <>
                <span className="tabular text-4xl font-extrabold leading-none">{score}</span>
                <span className="text-[11px] uppercase tracking-wider text-ink-muted">/ 100</span>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <VerdictBadge verdict={verdict.verdict} />
            <ConfidenceBadge confidence={verdict.confidence} />
          </div>
          <h3 className="mt-3 text-2xl font-bold tracking-tight">{meta.blurb}</h3>

          <ul className="mt-4 space-y-2">
            {verdict.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink-soft">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Stat strip */}
      <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Lowest observed" value={formatINR(verdict.stats.low)} />
        <Stat label="Typical price" value={formatINR(verdict.stats.median)} />
        <Stat label="Highest observed" value={formatINR(verdict.stats.high)} />
        <Stat
          label="Trend"
          value={
            verdict.stats.trendPct === null
              ? "—"
              : `${verdict.stats.trendPct > 0 ? "+" : ""}${verdict.stats.trendPct.toFixed(1)}%`
          }
          icon={
            verdict.stats.trendPct === null ? (
              <Minus className="h-3.5 w-3.5" />
            ) : verdict.stats.trendPct <= 0 ? (
              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-amber-400" />
            )
          }
        />
      </div>

      {verdict.fakeDiscount && (
        <div className="relative mt-5 flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong className="font-semibold">Inflated discount detected.</strong> The advertised
            discount is based on an inflated MRP, not a real drop below the typical price.
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised/40 p-3.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {icon}
        <span className="tabular text-lg font-bold">{value}</span>
      </div>
    </div>
  );
}
