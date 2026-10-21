"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Crown,
  Expand,
  Rocket,
  ShoppingCart,
  Tag,
  TrendingDown,
} from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent, IntensityBucket, PriceForecast } from "@/lib/engine/insights";
import { storeMeta } from "@/lib/config";
import { cn, formatINR } from "@/lib/utils";

const W = 1180;
const H = 360;
const PAD = { top: 108, right: 150, bottom: 46, left: 76 };

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "ALL", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const EVENT_ICON: Record<DealEvent["kind"], typeof Crown> = {
  LAUNCH: Rocket,
  FESTIVAL: ShoppingCart,
  BIG_BILLION: ShoppingCart,
  REPUBLIC_DAY: Tag,
  SUMMER_SALE: ShoppingCart,
  PRIME_DAY: ShoppingCart,
  PRICE_HIKE: ArrowUpRight,
  BIGGEST_DROP: ArrowDownRight,
  LOWEST: Crown,
  HIGHEST: ArrowUpRight,
};

const TONE: Record<
  number,
  { chip: string; icon: string; text: string; hex: string }
> = {
  0: {
    chip: "border-emerald-500/30 bg-emerald-500/10",
    icon: "text-emerald-400",
    text: "text-emerald-400",
    hex: "#34d399",
  },
  1: {
    chip: "border-rose-500/30 bg-rose-500/10",
    icon: "text-rose-400",
    text: "text-rose-400",
    hex: "#fb7185",
  },
  2: {
    chip: "border-sky-500/30 bg-sky-500/10",
    icon: "text-sky-400",
    text: "text-sky-400",
    hex: "#38bdf8",
  },
  3: {
    chip: "border-amber-500/30 bg-amber-500/10",
    icon: "text-amber-400",
    text: "text-amber-400",
    hex: "#fbbf24",
  },
  4: {
    chip: "border-slate-400/30 bg-slate-500/10",
    icon: "text-slate-300",
    text: "text-slate-300",
    hex: "#94a3b8",
  },
};

export interface StoreSeries {
  merchant: string;
  points: PricePoint[];
}

/**
 * The full price-history panel: every store we track the product in, the
 * events we can prove from the record, a forecast built from past behaviour
 * at the same price, and a deal-intensity strip.
 */
export function PriceHistoryPanel({
  series,
  events,
  forecast,
  intensity,
  currentPrice,
  className,
}: {
  series: StoreSeries[];
  events: DealEvent[];
  forecast: PriceForecast | null;
  intensity: IntensityBucket[];
  currentPrice: number | null;
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hidden, setHidden] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  const visible = series.filter((s) => !hidden.includes(s.merchant));

  const windowed = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    const kept = visible.map((s) => ({
      ...s,
      points: s.points.filter((p) => p.t >= cut),
    }));
    return kept.filter((s) => s.points.length > 1);
  }, [visible, range]);

  const all = windowed.flatMap((s) => s.points);
  const minT = all.length ? Math.min(...all.map((p) => p.t)) : 0;
  const maxT = all.length ? Math.max(...all.map((p) => p.t)) : 1;
  const minP = all.length ? Math.min(...all.map((p) => p.price)) : 0;
  const maxP = all.length ? Math.max(...all.map((p) => p.price)) : 1;

  // The forecast needs room to the right of the last real price.
  const horizon = forecast ? forecast.horizonDays * 86400000 : 0;
  const chartMaxT = maxT + horizon;

  const x = (t: number) =>
    PAD.left + ((t - minT) / Math.max(1, chartMaxT - minT)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - minP) / Math.max(1, maxP - minP)) * (H - PAD.top - PAD.bottom);

  const shownEvents = useMemo(() => {
    const cut = RANGES.find((r) => r.key === range)!.days
      ? Date.now() - RANGES.find((r) => r.key === range)!.days! * 86400000
      : 0;
    return events.filter((e) => e.at >= cut);
  }, [events, range]);

  // The forecast, drawn as a dashed projection.
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
      // Keep the label on screen even if the point sits near an edge.
      lx: Math.max(PAD.left, Math.min(fx2 - 78, W - PAD.right - 40)),
      ly: Math.max(PAD.top - 4, Math.min(fy2 + 14, H - PAD.bottom - 50)),
      price: forecast.predicted,
    };
  }, [forecast, currentPrice, maxT, minT, minP, maxP]);

  // Where each event's callout goes, so they never sit on top of each other.
  const placements = useMemo(() => {
    const lanes: { until: number }[] = [];
    return shownEvents.map((e) => {
      const ex = x(e.at);
      const label = `${e.label} ${formatINR(e.price)}`;
      const w = Math.max(120, Math.min(210, label.length * 7.2));
      const bx = Math.max(PAD.left, Math.min(ex - w / 2, W - PAD.right - w));

      // First lane that is free at this x position.
      let lane = 0;
      while (lane < lanes.length && lanes[lane].until > bx) lane++;
      if (lane < lanes.length) lanes[lane].until = bx + w + 10;
      else lanes.push({ until: bx + w + 10 });

      return { event: e, ex, w, bx, lane };
    });
  }, [shownEvents, minT, maxT, minP, maxP]);

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, i) => {
    const price = maxP - (i / (yTicks - 1)) * (maxP - minP);
    return { price, y: y(price) };
  });

  const xCount = 7;
  const xLabels: { t: number; x: number; label: string }[] = [];
  let lastLabel = "";
  for (let i = 0; i < xCount; i++) {
    // Labels cover the real record only — the forecast sits to the right.
    const t = minT + ((maxT - minT) * i) / (xCount - 1);
    const full = new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const label = full === lastLabel ? "" : full;
    lastLabel = full;
    xLabels.push({ t, x: x(t), label });
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[#080d18] text-slate-100",
        className,
      )}
    >
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-2 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-400">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17l5-5 4 3 8-8" />
              <path d="M15 7h5v5" />
            </svg>
          </span>
          <div>
            <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-white">
              Price History
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-400">
              Every price we recorded for this product, across every store, with the events we can
              prove and what history says happens next.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ranges */}
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/5 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors",
                  range === r.key
                    ? "bg-emerald-500 text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-slate-100",
                )}
              >
                {r.key}
              </button>
            ))}
          </div>

          {/* stores */}
          <div className="flex items-center gap-1.5">
            {series.map((s) => {
              const meta = storeMeta(s.merchant);
              const on = !hidden.includes(s.merchant);
              return (
                <button
                  key={s.merchant}
                  onClick={() =>
                    setHidden((h) =>
                      h.includes(s.merchant) ? h.filter((x) => x !== s.merchant) : [...h, s.merchant],
                    )
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                    on
                      ? "border-emerald-500/40 bg-emerald-500/12 text-white"
                      : "border-white/10 bg-white/5 text-slate-500",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: meta.color }}
                  />
                  {meta.name}
                </button>
              );
            })}
            <button
              onClick={() => setExpanded((e) => !e)}
              className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-colors hover:text-white"
              aria-label={expanded ? "Collapse chart" : "Expand chart"}
            >
              <Expand className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ---------- chart ---------- */}
      <div className="overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[720px]"
          role="img"
          aria-label="Recorded price history"
        >
          <defs>
            {series.map((s) => (
              <linearGradient
                key={s.merchant}
                id={`phg-${s.merchant}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={storeMeta(s.merchant).color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={storeMeta(s.merchant).color} stopOpacity="0.02" />
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
                stroke="rgba(148,163,184,0.14)"
                strokeWidth="1"
                strokeDasharray="3 6"
              />
              <text
                x={PAD.left - 12}
                y={t.y + 4}
                textAnchor="end"
                fontSize="12.5"
                fontWeight="600"
                className="tabular fill-slate-400"
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
              y={H - 14}
              textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
              fontSize="12.5"
              fontWeight="600"
              className="fill-slate-400"
            >
              {l.label}
            </text>
          ))}

          {/* series */}
          {windowed.map((s) => {
            const color = storeMeta(s.merchant).color;
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`)
              .join(" ");
            const area = `${d} L ${x(s.points[s.points.length - 1].t).toFixed(1)},${H - PAD.bottom} L ${x(s.points[0].t).toFixed(1)},${H - PAD.bottom} Z`;
            return (
              <g key={s.merchant}>
                <path d={area} fill={`url(#phg-${s.merchant})`} />
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.6"
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
                stroke="rgba(148,163,184,0.55)"
                strokeWidth="2"
                strokeDasharray="6 6"
              />
              <circle
                cx={forecastPoint.x2}
                cy={forecastPoint.y2}
                r="5"
                fill="rgba(148,163,184,0.5)"
                stroke="#080d18"
                strokeWidth="2"
              />
              <g transform={`translate(${forecastPoint.lx}, ${forecastPoint.ly})`}>
                <rect
                  width="156"
                  height="44"
                  rx="10"
                  fill="#0f172a"
                  stroke="rgba(148,163,184,0.25)"
                />
                <text x="12" y="19" fontSize="11.5" fontWeight="600" className="fill-slate-400">
                  Price may drop to
                </text>
                <text x="12" y="36" fontSize="14" fontWeight="800" className="tabular fill-slate-100">
                  ~{formatINR(forecastPoint.price)}
                </text>
              </g>
            </g>
          ) : null}

          {/* event markers */}
          {placements.map((p, i) => {
            const color = TONE[p.event.tone];
            const ey = y(p.event.price);
            // Callouts stack upwards from the top of the plot area.
            const by = PAD.top - 52 - p.lane * 50;
            return (
              <g key={`${p.event.kind}-${p.event.at}-${i}`}>
                <line
                  x1={p.ex}
                  y1={ey}
                  x2={p.ex}
                  y2={by + 44}
                  stroke={color.hex}
                  strokeOpacity="0.4"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={p.ex}
                  cy={ey}
                  r="6.5"
                  fill={color.hex}
                  stroke="#080d18"
                  strokeWidth="2.5"
                />
                {/* callout */}
                <g transform={`translate(${p.bx}, ${by})`}>
                  <rect
                    width={p.w}
                    height="44"
                    rx="10"
                    fill="#0f172a"
                    stroke={color.hex}
                    strokeOpacity="0.28"
                  />
                  <text x="11" y="18" fontSize="10.5" fontWeight="700" className="fill-slate-400">
                    {p.event.label}
                  </text>
                  <text x="11" y="35" fontSize="13" fontWeight="800" className="tabular fill-white">
                    {formatINR(p.event.price)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* ---------- legend + forecast note ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3">
        <div className="flex flex-wrap items-center gap-4">
          {windowed.map((s) => (
            <span key={s.merchant} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-300">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: storeMeta(s.merchant).color }}
              />
              {storeMeta(s.merchant).name} Price
            </span>
          ))}
          {forecast ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400">
              <span className="h-0.5 w-5 rounded bg-slate-500/60" />
              {forecast.horizonDays}-day projection
            </span>
          ) : null}
        </div>
        {forecast ? (
          <span className="text-[11.5px] font-semibold text-slate-500">
            {forecast.basis} · {forecast.confidence.toLowerCase()} confidence
          </span>
        ) : null}
      </div>

      {/* ---------- deal intensity ---------- */}
      {intensity.length > 1 ? (
        <div className="px-5 pb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-[13px] font-extrabold text-white">
              Deal Intensity
              <span
                title="How often the price fell in each stretch of the record."
                className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-white/20 text-[9px] font-bold text-slate-400"
              >
                ?
              </span>
            </span>
            <span className="flex items-center gap-3 text-[11px] font-semibold">
              {(["LOW", "MEDIUM", "HIGH"] as const).map((l) => (
                <span key={l} className="inline-flex items-center gap-1.5 text-slate-400">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      l === "LOW" && "bg-emerald-800",
                      l === "MEDIUM" && "bg-emerald-500",
                      l === "HIGH" && "bg-emerald-300",
                    )}
                  />
                  {l[0] + l.slice(1).toLowerCase()}
                </span>
              ))}
            </span>
          </div>
          <div className="mt-2 flex h-9 items-end gap-[2px]">
            {intensity.map((b, i) => (
              <div
                key={i}
                title={`${new Date(b.from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — ${b.drops} price falls`}
                className={cn(
                  "flex-1 rounded-t-[2px] transition-all",
                  b.level === "LOW" && "bg-emerald-800/70",
                  b.level === "MEDIUM" && "bg-emerald-500/80",
                  b.level === "HIGH" && "bg-emerald-300",
                )}
                style={{ height: `${Math.max(12, (b.drops / Math.max(1, ...intensity.map((x) => x.drops))) * 100)}%` }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- key events ---------- */}
      {shownEvents.length > 0 ? (
        <div className="border-t border-white/10 px-5 py-4">
          <h3 className="text-[13px] font-extrabold text-white">Key Deal Events</h3>
          <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {shownEvents.map((e, i) => {
              const Icon = EVENT_ICON[e.kind];
              const color = TONE[e.tone];
              return (
                <div
                  key={`${e.kind}-${e.at}-${i}`}
                  className={cn(
                    "flex min-w-[190px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5",
                    color.chip,
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5">
                    <Icon className={cn("h-4 w-4", color.icon)} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11.5px] font-bold text-slate-300">{e.label}</div>
                    <div className="tabular text-[13.5px] font-extrabold text-white">
                      {formatINR(e.price)}
                    </div>
                    <div className="text-[10.5px] font-semibold text-slate-500">
                      {new Date(e.at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
