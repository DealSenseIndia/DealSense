"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, LineChart, TrendingDown } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import { cn, formatINR } from "@/lib/utils";

const W = 900;
const H = 300;
const PAD = { top: 26, right: 78, bottom: 36, left: 92 };

export type HistoryRange = "1M" | "3M" | "6M" | "1Y" | "ALL";

const RANGES: { key: HistoryRange; label: string; days: number | null }[] = [
  { key: "1M", label: "Last 1 month", days: 30 },
  { key: "3M", label: "Last 3 months", days: 90 },
  { key: "6M", label: "Last 6 months", days: 182 },
  { key: "1Y", label: "Last 1 year", days: 365 },
  { key: "ALL", label: "All time", days: null },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "6-month", "1-year", "all-time" — used in the stat labels and the insight. */
const RANGE_SHORT: Record<HistoryRange, string> = {
  "1M": "1-month",
  "3M": "3-month",
  "6M": "6-month",
  "1Y": "1-year",
  ALL: "all-time",
};

/** Round an axis to human numbers: 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span: number, target: number): number {
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

/**
 * The price history card.
 *
 * Light in light mode, dark in dark mode, and every number on it comes from
 * the recorded price series — the low, the average and the current price are
 * all read off the same data the chart draws.
 */
export function PriceHistoryCard({
  points,
  currentPrice,
  className,
  viewAllHref = "/price-history",
  attribution = null,
}: {
  points: PricePoint[];
  currentPrice: number | null;
  className?: string;
  viewAllHref?: string;
  /** Shown when part of the series was imported from a public tracker. */
  attribution?: { label: string; href: string } | null;
}) {
  const [range, setRange] = useState<HistoryRange>("6M");
  const [open, setOpen] = useState(false);

  const series = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    const inRange = points.filter((p) => p.t >= cut);
    return inRange.length > 1 ? inRange : points;
  }, [points, range]);

  const stats = useMemo(() => {
    if (!series.length) return null;
    const prices = series.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const last = series[series.length - 1].price;
    const lowIdx = prices.indexOf(min);
    return {
      min,
      max,
      avg,
      last,
      lowIdx,
      belowAvg: avg > 0 ? ((avg - last) / avg) * 100 : 0,
    };
  }, [series]);

  if (!points.length || !stats) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-hairline bg-card p-6 text-center shadow-card",
          className,
        )}
      >
        <LineChart className="mx-auto h-7 w-7 text-muted" />
        <p className="mt-2.5 text-[13.5px] font-extrabold text-headline">
          No price history yet
        </p>
        <p className="mx-auto mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-body">
          DealSense only charts prices it actually recorded. Track this product and the graph
          fills in as we read the store page.
        </p>
      </div>
    );
  }

  const current = currentPrice ?? stats.last;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
        className,
      )}
    >
      {/* ---------- title row ---------- */}
      <div className="flex items-center justify-between gap-4 px-5 pt-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-5 w-5" />
          </span>
          <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-headline">
            Price history
          </h2>
        </div>

        {/* range picker */}
        <div className="relative">
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-bold text-headline transition-colors hover:bg-elevated"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {RANGES.find((r) => r.key === range)!.label}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-hairline bg-card py-1 shadow-pop">
                {RANGES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => {
                      setRange(r.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] font-semibold transition-colors hover:bg-elevated",
                      range === r.key
                        ? "text-[var(--dw-green-mid)]"
                        : "text-body",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        range === r.key ? "bg-emerald-500" : "bg-transparent",
                      )}
                    />
                    {r.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ---------- stat row ---------- */}
      <div className="mt-5 grid grid-cols-3 border-y border-hairline">
        <Stat
          label="Current price"
          value={formatINR(current)}
          className="border-r border-hairline"
        />
        <Stat
          label={`${RANGE_SHORT[range]} low`}
          value={formatINR(stats.min)}
          valueClass="text-emerald-600 dark:text-emerald-400"
          className="border-r border-hairline"
        />
        <Stat
          label={`${RANGE_SHORT[range]} avg`}
          value={formatINR(Math.round(stats.avg))}
          valueClass="text-muted"
        />
      </div>

      {/* ---------- chart ---------- */}
      <Chart series={series} stats={stats} current={current} />

      {/* ---------- footer ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-5 pt-1">
        {stats.belowAvg > 0.5 ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--dw-green-surface)] px-3.5 py-2 text-[12.5px] font-extrabold text-[var(--dw-green-mid)]">
            <TrendingDown className="h-4 w-4" />
            {Math.round(stats.belowAvg)}% below {RANGE_SHORT[range]} average
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg bg-[var(--dw-green-surface)] px-3.5 py-2 text-[12.5px] font-extrabold text-[var(--dw-green-mid)]">
            <TrendingDown className="h-4 w-4 rotate-180" />
            {Math.abs(Math.round(stats.belowAvg))}% above the {RANGE_SHORT[range]} average
          </span>
        )}

        <Link
          href={viewAllHref}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
        >
          View full history
          <span aria-hidden>→</span>
        </Link>
      </div>

      {attribution ? (
        <p className="border-t border-hairline px-5 py-3 text-[10.5px] font-semibold leading-relaxed text-muted">
          Includes{" "}
          <a
            href={attribution.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-[var(--dw-green-mid)] underline decoration-dotted underline-offset-2"
          >
            {attribution.label}
          </a>{" "}
          public price records — DealSense keeps adding its own store readings.
        </p>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
  className,
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-4 sm:px-5", className)}>
      <div className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      <div
        className={cn(
          "tabular mt-1 text-[21px] font-extrabold leading-none tracking-[-0.02em] text-headline sm:text-[26px]",
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Chart({
  series,
  stats,
  current,
}: {
  series: PricePoint[];
  stats: {
    min: number;
    max: number;
    avg: number;
    last: number;
    lowIdx: number;
    belowAvg: number;
  };
  current: number;
}) {
  const geom = useMemo(() => {
    const prices = series.map((p) => p.price);
    const times = series.map((p) => p.t);
    let minT = Math.min(...times);
    let maxT = Math.max(...times);
    if (minT === maxT) {
      minT -= 86400000;
      maxT += 86400000;
    }
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const pad = (maxP - minP) * 0.18 || maxP * 0.1 || 1;
    minP = Math.max(0, minP - pad);
    maxP = maxP + pad;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (t: number) => PAD.left + ((t - minT) / (maxT - minT)) * plotW;
    const y = (p: number) => PAD.top + (1 - (p - minP) / (maxP - minP)) * plotH;

    const pts = series.map((q) => ({ x: x(q.t), y: y(q.price), t: q.t, p: q.price }));

    // Smooth curve through the points.
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = (p0.x + p1.x) / 2;
      d += ` C ${cx.toFixed(1)} ${p0.y.toFixed(1)}, ${cx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }

    const area = `${d} L ${pts[pts.length - 1].x.toFixed(1)} ${H - PAD.bottom} L ${pts[0].x.toFixed(1)} ${H - PAD.bottom} Z`;

    // Y axis ticks, rounded to human numbers.
    const step = niceStep(maxP - minP, 5);
    const yTicks: { price: number; y: number }[] = [];
    for (let p = Math.ceil(minP / step) * step; p <= maxP; p += step) {
      yTicks.push({
        price: p,
        y: PAD.top + (1 - (p - minP) / (maxP - minP)) * plotH,
      });
    }
    if (!yTicks.length) {
      yTicks.push({ price: maxP, y: PAD.top }, { price: minP, y: PAD.top + plotH });
    }

    // X axis: month labels at even steps, skipping a repeat of the same month.
    const xCount = 6;
    const xLabels: { t: number; x: number; label: string }[] = [];
    let lastMonth = "";
    for (let i = 0; i < xCount; i++) {
      const t = minT + ((maxT - minT) * i) / (xCount - 1);
      const d = new Date(t);
      const month = MONTHS[d.getMonth()];
      const label = month === lastMonth ? "" : month;
      lastMonth = month;
      xLabels.push({ t, x: x(t), label });
    }

    const lowPt = pts[stats.lowIdx];
    const lastPt = pts[pts.length - 1];

    return { pts, d, area, yTicks, xLabels, lowPt, lastPt, minT, maxT };
  }, [series, stats]);

  return (
    <div className="px-2 pt-4 sm:px-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Recorded price history"
      >
        <defs>
          <linearGradient id="phcArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* gridlines + y labels */}
        {geom.yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={t.y}
              x2={W - PAD.right}
              y2={t.y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 5"
              className="text-slate-300/70 dark:text-white/10"
            />
            <text
              x={PAD.left - 12}
              y={t.y + 4}
              textAnchor="end"
              fontSize="13"
              fontWeight="600"
              className="tabular fill-slate-500 dark:fill-slate-400"
            >
              {formatINR(Math.round(t.price))}
            </text>
          </g>
        ))}

        {/* x labels */}
        {geom.xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={H - 10}
            textAnchor={i === 0 ? "start" : i === geom.xLabels.length - 1 ? "end" : "middle"}
            fontSize="13"
            fontWeight="600"
            className="fill-slate-500 dark:fill-slate-400"
          >
            {l.label}
          </text>
        ))}

        {/* area + line */}
        <path d={geom.area} fill="url(#phcArea)" />
        <path
          d={geom.d}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* low marker + pill */}
        {geom.lowPt ? (
          <g>
            <circle
              cx={geom.lowPt.x}
              cy={geom.lowPt.y}
              r="6"
              fill="#10b981"
              className="dark:stroke-slate-900"
              strokeWidth="2.5"
              stroke="#ffffff"
            />
            <g transform={`translate(${geom.lowPt.x - 52}, ${geom.lowPt.y - 42})`}>
              <rect
                width="104"
                height="30"
                rx="15"
                fill="#ffffff"
                className="dark:fill-slate-800"
                stroke="currentColor"
                strokeOpacity="0.1"
              />
              <text
                x="52"
                y="19.5"
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="700"
                className="fill-emerald-600 dark:fill-emerald-400"
              >
                Low {formatINR(geom.lowPt.p)}
              </text>
            </g>
          </g>
        ) : null}

        {/* current marker + pill */}
        {geom.lastPt ? (
          <g>
            <circle
              cx={geom.lastPt.x}
              cy={geom.lastPt.y}
              r="6"
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth="2.5"
              className="dark:stroke-slate-900"
            />
            <g
              transform={`translate(${Math.min(geom.lastPt.x - 50, W - PAD.right - 100)}, ${geom.lastPt.y - 42})`}
            >
              <rect
                width="100"
                height="30"
                rx="15"
                fill="#ffffff"
                className="dark:fill-slate-800"
                stroke="currentColor"
                strokeOpacity="0.12"
              />
              <text
                x="50"
                y="19.5"
                textAnchor="middle"
                fontSize="13.5"
                fontWeight="700"
                className="fill-slate-800 dark:fill-slate-100"
              >
                {formatINR(current)}
              </text>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
