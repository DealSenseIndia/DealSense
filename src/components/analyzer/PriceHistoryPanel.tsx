"use client";

import { useMemo, useState } from "react";
import { Expand, LineChart } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent, IntensityBucket, PriceForecast } from "@/lib/engine/insights";
import { cn, formatINR } from "@/lib/utils";

const W = 1100;
const H = 320;
const PAD = { top: 22, right: 24, bottom: 40, left: 66 };

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "ALL", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** The two series colours ΓÇö the site's emerald and sky, matching the stat cards. */
const SERIES = [
  { key: "a", stroke: "#10b981", fill: "rgba(16,185,129,0.16)", label: "Store price" },
  { key: "b", stroke: "#38bdf8", fill: "rgba(56,189,248,0.14)", label: "Other store" },
];

export interface StoreSeries {
  merchant: string;
  points: PricePoint[];
}

export interface ChartStat {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "muted" | "plain";
}

/**
 * The price history, kept simple.
 *
 * Sale and deal markers sit on the line in that store's colour. Their details
 * only appear when you point at them, so the chart stays readable.
 */
export function PriceHistoryPanel({
  series,
  events,
  forecast,
  intensity,
  currentPrice,
  stats = [],
  className,
}: {
  series: StoreSeries[];
  events: DealEvent[];
  forecast: PriceForecast | null;
  intensity: IntensityBucket[];
  currentPrice: number | null;
  stats?: ChartStat[];
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hidden, setHidden] = useState<string[]>([]);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visible = series.filter((s) => !hidden.includes(s.merchant));

  const windowed = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return visible
      .map((s) => ({ ...s, points: s.points.filter((p) => p.t >= cut) }))
      .filter((s) => s.points.length > 1);
  }, [visible, range]);

  const all = windowed.flatMap((s) => s.points);
  const minT = all.length ? Math.min(...all.map((p) => p.t)) : 0;
  const maxT = all.length ? Math.max(...all.map((p) => p.t)) : 1;
  const minP = all.length ? Math.min(...all.map((p) => p.price)) : 0;
  const maxP = all.length ? Math.max(...all.map((p) => p.price)) : 1;

  const horizon = forecast ? forecast.horizonDays * 86400000 : 0;
  const chartMaxT = maxT + horizon;

  const x = (t: number) =>
    PAD.left + ((t - minT) / Math.max(1, chartMaxT - minT)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - minP) / Math.max(1, maxP - minP)) * (H - PAD.top - PAD.bottom);

  const shownEvents = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return events.filter((e) => e.at >= cut);
  }, [events, range]);

  // Which store does each event belong to? The one whose series contains it.
  const eventStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of shownEvents) {
      let best = 0;
      let bestDist = Infinity;
      windowed.forEach((s, si) => {
        for (const p of s.points) {
          const d = Math.abs(p.t - e.at);
          if (d < bestDist) {
            bestDist = d;
            best = si;
          }
        }
      });
      map.set(`${e.kind}-${e.at}`, best);
    }
    return map;
  }, [shownEvents, windowed]);

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, i) => {
    const price = maxP - (i / (yTicks - 1)) * (maxP - minP);
    return { price, y: y(price) };
  });

  const xCount = 6;
  const xLabels: { x: number; label: string }[] = [];
  let lastLabel = "";
  for (let i = 0; i < xCount; i++) {
    const t = minT + ((maxT - minT) * i) / (xCount - 1);
    const full = new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const label = full === lastLabel ? "" : full;
    lastLabel = full;
    xLabels.push({ x: x(t), label });
  }

  const forecastPoint = useMemo(() => {
    if (!forecast || !currentPrice) return null;
    const to = maxT + forecast.horizonDays * 86400000;
    const fx2 = x(to);
    const fy2 = y(forecast.predicted);
    return {
      x1: x(maxT),
      y1: y(currentPrice),
      x2: fx2,
      y2: fy2,
      lx: Math.max(PAD.left, Math.min(fx2 - 68, W - PAD.right - 140)),
      ly: Math.max(PAD.top + 2, Math.min(fy2 + 12, H - PAD.bottom - 40)),
      price: forecast.predicted,
    };
  }, [forecast, currentPrice, maxT, minT, minP, maxP]);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
        className,
      )}
    >
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-3 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-headline">
              Price history
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Every price we recorded. Hover a marker to see what happened.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-hairline bg-subtle p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors",
                  range === r.key
                    ? "bg-emerald-600 text-white"
                    : "text-muted hover:bg-elevated hover:text-headline",
                )}
              >
                {r.key}
              </button>
            ))}
          </div>

          {series.length > 1 ? (
            <div className="flex items-center gap-1.5">
              {series.map((s, i) => {
                const on = !hidden.includes(s.merchant);
                return (
                  <button
                    key={s.merchant}
                    onClick={() =>
                      setHidden((h) =>
                        h.includes(s.merchant)
                          ? h.filter((x) => x !== s.merchant)
                          : [...h, s.merchant],
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                      on
                        ? "border-hairline bg-subtle text-headline"
                        : "border-dashed border-hairline bg-card text-muted",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: SERIES[i % SERIES.length].stroke }}
                    />
                    {i === 0 ? "This store" : s.merchant}
                  </button>
                );
              })}
            </div>
          ) : null}

          <button
            onClick={() => setExpanded((e) => !e)}
            className="grid h-8 w-8 place-items-center rounded-lg border border-hairline bg-subtle text-muted transition-colors hover:text-headline"
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
          >
            <Expand className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ---------- the numbers, on the chart ---------- */}
      {stats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-hairline bg-subtle px-5 py-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                {s.label}
              </span>
              <span
                className={cn(
                  "tabular text-[16px] font-extrabold leading-none",
                  s.tone === "good" && "text-[var(--dw-green-mid)]",
                  s.tone === "muted" && "text-muted",
                  s.tone === "plain" && "text-headline",
                )}
              >
                {s.value}
              </span>
              {s.note ? (
                <span className="text-[10.5px] font-semibold text-muted">{s.note}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* ---------- chart ---------- */}
      <div className="overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label="Recorded price history"
        >
          <defs>
            {SERIES.map((s, i) => (
              <linearGradient key={s.key} id={`phg-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.stroke} stopOpacity="0.24" />
                <stop offset="100%" stopColor={s.stroke} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* gridlines */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={t.y}
                x2={W - PAD.right}
                y2={t.y}
                stroke="currentColor"
                strokeOpacity="0.09"
                strokeWidth="1"
                strokeDasharray="3 6"
                className="text-slate-500"
              />
              <text
                x={PAD.left - 10}
                y={t.y + 4}
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                className="tabular fill-muted"
              >
                {formatINR(Math.round(t.price))}
              </text>
            </g>
          ))}

          {/* x labels */}
          {xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={H - 12}
              textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
              fontSize="12"
              fontWeight="600"
              className="fill-muted"
            >
              {l.label}
            </text>
          ))}

          {/* series */}
          {windowed.map((s, si) => {
            const colour = SERIES[si % SERIES.length];
            const d = s.points
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`,
              )
              .join(" ");
            const area = `${d} L ${x(s.points[s.points.length - 1].t).toFixed(1)},${H - PAD.bottom} L ${x(s.points[0].t).toFixed(1)},${H - PAD.bottom} Z`;
            return (
              <g key={s.merchant}>
                <path d={area} fill={`url(#phg-${si})`} />
                <path
                  d={d}
                  fill="none"
                  stroke={colour.stroke}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* forecast projection */}
          {forecastPoint ? (
            <g>
              <line
                x1={forecastPoint.x1}
                y1={forecastPoint.y1}
                x2={forecastPoint.x2}
                y2={forecastPoint.y2}
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="2"
                strokeDasharray="5 5"
                className="text-slate-500"
              />
              <circle
                cx={forecastPoint.x2}
                cy={forecastPoint.y2}
                r="4.5"
                fill="currentColor"
                fillOpacity="0.35"
                className="text-slate-500"
              />
              <text
                x={forecastPoint.lx}
                y={forecastPoint.ly}
                fontSize="11.5"
                fontWeight="700"
                className="fill-muted"
              >
                may reach {formatINR(forecastPoint.price)}
              </text>
            </g>
          ) : null}

          {/* event markers ΓÇö details on hover only */}
          {shownEvents.map((e) => {
            const key = `${e.kind}-${e.at}`;
            const si = eventStore.get(key) ?? 0;
            const colour = SERIES[si % SERIES.length].stroke;
            const ex = x(e.at);
            const ey = y(e.price);
            const active = hoverEvent === key;
            return (
              <g
                key={key}
                onMouseEnter={() => setHoverEvent(key)}
                onMouseLeave={() => setHoverEvent(null)}
                className="cursor-pointer"
              >
                {/* generous hit area */}
                <circle cx={ex} cy={ey} r="12" fill="transparent" />
                <circle
                  cx={ex}
                  cy={ey}
                  r={active ? 6 : 4}
                  fill={colour}
                  stroke="currentColor"
                  strokeWidth={active ? 2.5 : 2}
                  className="text-card transition-all"
                />
                {active ? (
                  <g transform={`translate(${Math.max(PAD.left, Math.min(ex - 62, W - PAD.right - 124))}, ${Math.max(PAD.top, ey - 56)})`}>
                    <rect
                      width="124"
                      height="40"
                      rx="9"
                      fill="var(--bg-card)"
                      stroke={colour}
                      strokeOpacity="0.4"
                    />
                    <text x="10" y="16" fontSize="10.5" fontWeight="700" className="fill-muted">
                      {e.label}
                    </text>
                    <text x="10" y="32" fontSize="13" fontWeight="800" className="tabular fill-headline">
                      {formatINR(e.price)}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ---------- legend ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-1">
        <div className="flex flex-wrap items-center gap-4">
          {windowed.map((s, si) => (
            <span
              key={s.merchant}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-body"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: SERIES[si % SERIES.length].stroke }}
              />
              {s.merchant === series[0]?.merchant ? "This store" : s.merchant}
            </span>
          ))}
          {shownEvents.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted">
              <span className="h-2 w-2 rounded-full border-2 border-emerald-500" />
              {shownEvents.length} sale{shownEvents.length === 1 ? "" : "s"} &amp; deal
              {shownEvents.length === 1 ? "" : "s"} found
            </span>
          ) : null}
        </div>
        {forecast ? (
          <span className="text-[11.5px] font-semibold text-muted">
            {forecast.basis} ┬╖ {forecast.confidence.toLowerCase()} confidence
          </span>
        ) : null}
      </div>

      {/* ---------- deal intensity ---------- */}
      {intensity.length > 1 ? (
        <div className="border-t border-hairline px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-extrabold text-headline">Deal intensity</span>
            <span className="flex items-center gap-3 text-[11px] font-semibold text-muted">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      l === "LOW" && "bg-emerald-700",
                      l === "MEDIUM" && "bg-emerald-500",
                      l === "HIGH" && "bg-emerald-400",
                    )}
                  />
                  {l[0] + l.slice(1).toLowerCase()}
                </span>
              ))}
            </span>
          </div>
          <div className="mt-2 flex h-8 items-end gap-[2px]">
            {intensity.map((b, i) => (
              <div
                key={i}
                title={`${new Date(b.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ΓÇö ${b.drops} price falls`}
                className={cn(
                  "flex-1 rounded-t-[2px] transition-all",
                  b.level === "LOW" && "bg-emerald-700/50",
                  b.level === "MEDIUM" && "bg-emerald-500/70",
                  b.level === "HIGH" && "bg-emerald-400",
                )}
                style={{
                  height: `${Math.max(12, (b.drops / Math.max(1, ...intensity.map((x) => x.drops))) * 100)}%`,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
