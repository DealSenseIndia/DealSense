"use client";

import { ArrowDownRight, ArrowUpRight, BarChart3, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils";

export interface StatCardSpec {
  key: string;
  title: string;
  tag?: string;
  value: number | null;
  sub: string;
  deltaPct?: number | null;
  spark?: number[];
  tone: "emerald" | "rose" | "sky" | "violet";
  icon: React.ReactNode;
}

const TONES: Record<
  StatCardSpec["tone"],
  { ring: string; tile: string; text: string; chip: string; stroke: string }
> = {
  emerald: {
    ring: "border-emerald-400/40",
    tile: "bg-gradient-to-br from-emerald-400 to-emerald-600",
    text: "text-emerald-600 dark:text-emerald-300",
    chip: "border-emerald-400/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    stroke: "#10b981",
  },
  rose: {
    ring: "border-rose-400/40",
    tile: "bg-gradient-to-br from-rose-400 to-rose-600",
    text: "text-rose-600 dark:text-rose-300",
    chip: "border-rose-400/40 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    stroke: "#f43f5e",
  },
  sky: {
    ring: "border-sky-400/40",
    tile: "bg-gradient-to-br from-sky-400 to-sky-600",
    text: "text-sky-600 dark:text-sky-300",
    chip: "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    stroke: "#0ea5e9",
  },
  violet: {
    ring: "border-teal-400/40",
    tile: "bg-gradient-to-br from-teal-400 to-teal-600",
    text: "text-teal-600 dark:text-teal-300",
    chip: "border-teal-400/40 bg-teal-500/10 text-teal-600 dark:text-teal-300",
    stroke: "#14b8a6",
  },
};

function MiniSpark({ points, stroke }: { points: number[]; stroke: string }) {
  if (points.length < 2) return <div className="h-7" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 84;
  const h = 28;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-[84px] shrink-0" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function StatCards({ cards }: { cards: StatCardSpec[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const t = TONES[c.tone];
        const delta = c.deltaPct ?? null;
        return (
          <div
            key={c.key}
            className={cn(
              "rounded-2xl border-2 bg-card p-4 transition-shadow hover:shadow-[0_16px_40px_-22px_rgba(15,23,42,0.35)]",
              t.ring,
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white", t.tile)}>
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="text-[12.5px] font-extrabold leading-tight text-headline">
                    {c.title}
                  </span>
                  {c.tag && (
                    <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold", t.chip)}>
                      {c.tag}
                    </span>
                  )}
                </div>
                <div className={cn("tabular mt-1 text-[20px] font-extrabold leading-none tracking-tight", t.text)}>
                  {c.value === null ? "—" : formatINR(c.value)}
                </div>
              </div>
            </div>

            <div className="mt-2.5 text-[11.5px] font-medium text-muted">{c.sub}</div>

            <div className="mt-2 flex items-end justify-between gap-2">
              <span className={cn("text-[11.5px] font-extrabold", t.text)}>
                {delta === null || delta === undefined ? (
                  "—"
                ) : (
                  <>
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}% vs current
                  </>
                )}
              </span>
              <MiniSpark points={c.spark ?? []} stroke={t.stroke} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function buildStatCards(input: {
  current: number | null;
  low: number | null;
  high: number | null;
  median: number | null;
  spark: number[];
  hasHistory: boolean;
  /** True when the current price was just verified on the store page. */
  isLive?: boolean;
}): StatCardSpec[] {
  const { current, low, high, median, spark, hasHistory, isLive = false } = input;
  const pct = (v: number | null) =>
    v !== null && current ? ((v - current) / current) * 100 : null;

  return [
    {
      key: "high",
      title: "Highest price",
      tag: hasHistory ? "All time" : undefined,
      value: high,
      sub: "Highest ever observed",
      deltaPct: pct(high),
      spark,
      tone: "emerald",
      icon: <ArrowUpRight className="h-4.5 w-4.5" />,
    },
    {
      key: "low",
      title: "Lowest price",
      tag: hasHistory ? "All time low" : undefined,
      value: low,
      sub: "Best recorded price",
      deltaPct: pct(low),
      spark,
      tone: "rose",
      icon: <ArrowDownRight className="h-4.5 w-4.5" />,
    },
    {
      key: "avg",
      title: "Average price",
      tag: "Typical",
      value: median,
      sub: "Median of observed prices",
      deltaPct: pct(median),
      spark,
      tone: "sky",
      icon: <BarChart3 className="h-4.5 w-4.5" />,
    },
    {
      key: "current",
      title: "Current price",
      tag: isLive ? "Live" : "Latest",
      value: current,
      sub: isLive ? "Verified on the store right now" : "Last recorded price",
      deltaPct: 0,
      spark,
      tone: "violet",
      icon: <Flame className="h-4.5 w-4.5" />,
    },
  ];
}
