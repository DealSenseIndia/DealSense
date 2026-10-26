"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent } from "@/lib/engine/insights";
import { storeMeta } from "@/lib/config";
import { cn, formatINR } from "@/lib/utils";

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "ALL", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const TONE: Record<DealEvent["tone"], string> = {
  0: "#10b981",
  1: "#f43f5e",
  2: "#0ea5e9",
  3: "#f59e0b",
  4: "#64748b",
};

const RANGE_LABEL: Record<RangeKey, string> = {
  "1M": "month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "year",
  "2Y": "2 years",
  ALL: "all time",
};

export interface StoreSeries {
  merchant: string;
  points: PricePoint[];
}

/** Where imported records came from — shown, never hidden. */
export interface HistoryAttribution {
  label: string;
  href: string;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** First useful view: 3M, widening until there are at least two readings. */
function firstDrawableRange(points: PricePoint[]): RangeKey {
  if (points.length < 2) return "3M";
  const now = Date.now();
  for (const key of ["3M", "6M", "1Y", "2Y", "ALL"] as RangeKey[]) {
    const cfg = RANGES.find((r) => r.key === key)!;
    const cut = cfg.days ? now - cfg.days * 86400000 : 0;
    if (points.filter((p) => p.t >= cut).length >= 2) return key;
  }
  return "ALL";
}

function dayLabel(t: number, long = false): string {
  return new Date(t).toLocaleDateString(
    "en-IN",
    long
      ? { day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short" },
  );
}

/**
 * The price history for one store at a time.
 *
 * The two stores are never drawn on top of each other: pick a store and the
 * card shows only that store's recorded line, its own low, average and peak.
 * Point anywhere on the line to read what it cost that day.
 */
export function PriceHistoryPanel({
  series,
  events,
  attribution = null,
  className,
}: {
  series: StoreSeries[];
  events: DealEvent[];
  /** Shown in the footer when some points were imported from a public tracker. */
  attribution?: HistoryAttribution | null;
  className?: string;
}) {
  const stores = useMemo(
    () =>
      series
        .filter((s) => s.points.length > 0)
        .map((s) => ({
          ...s,
          points: [...s.points].sort((a, b) => a.t - b.t),
        })),
    [series],
  );

  const primary = stores[0]?.merchant;
  const [activeMerchant, setActiveMerchant] = useState(primary ?? "");
  const [range, setRange] = useState<RangeKey>(() =>
    firstDrawableRange(stores[0]?.points ?? []),
  );
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The chart is drawn in the width it actually has, so the whole timeline
  // fits on a phone instead of hiding behind a horizontal scroll.
  const [width, setWidth] = useState(1100);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = width;
  const narrow = W < 560;
  const H = narrow ? 250 : 320;
  const PAD = narrow
    ? { top: 18, right: 12, bottom: 34, left: 52 }
    : { top: 24, right: 28, bottom: 42, left: 70 };

  const store = stores.find((s) => s.merchant === activeMerchant) ?? stores[0];
  const isPrimary = store?.merchant === primary;
  const meta = store ? storeMeta(store.merchant) : null;

  const stats = useMemo(() => {
    if (!store?.points.length) return null;
    const prices = store.points.map((p) => p.price);
    const latest = store.points[store.points.length - 1];
    const low = store.points.reduce((a, b) => (b.price < a.price ? b : a));
    const high = store.points.reduce((a, b) => (b.price > a.price ? b : a));
    const average = Math.round(mean(prices));
    const fromPeak =
      high.price > 0 ? Math.round(((high.price - latest.price) / high.price) * 100) : 0;
    return {
      now: latest.price,
      low,
      high,
      average,
      fromPeak,
      offPeak: Math.max(0, high.price - latest.price),
      readings: prices.length,
    };
  }, [store]);

  const selected = RANGES.find((r) => r.key === range)!;
  const inRange = useMemo(() => {
    if (!store) return [];
    const cut = selected.days ? Date.now() - selected.days * 86400000 : 0;
    return store.points.filter((p) => p.t >= cut);
  }, [store, selected.days]);

  // A short selected window (or a product whose record is older than the
  // window) must never hide the graph we DO have. Widening to the full
  // record is labelled, never silent.
  const fellBack = inRange.length < 2 && (store?.points.length ?? 0) > 1;
  const points = fellBack ? (store?.points ?? []) : inRange;

  const shownEvents = useMemo(() => {
    if (!isPrimary) return [];
    const cut = fellBack || !selected.days ? 0 : Date.now() - selected.days * 86400000;
    return events.filter((e) => e.at >= cut);
  }, [events, isPrimary, fellBack, selected.days]);

  const minT = points[0]?.t ?? 0;
  const maxT = points[points.length - 1]?.t ?? 1;
  const minP = points.length ? Math.min(...points.map((p) => p.price)) : 0;
  const maxP = points.length ? Math.max(...points.map((p) => p.price)) : 1;

  const x = (t: number) =>
    PAD.left + ((t - minT) / Math.max(1, maxT - minT)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - minP) / Math.max(1, maxP - minP)) * (H - PAD.top - PAD.bottom);

  const line = points
    .map((p, i) =>
      i === 0
        ? `M ${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`
        : `H ${x(p.t).toFixed(1)} V ${y(p.price).toFixed(1)}`,
    )
    .join(" ");
  const area =
    points.length > 1
      ? `${line} L ${x(points[points.length - 1].t).toFixed(1)},${H - PAD.bottom} L ${x(points[0].t).toFixed(1)},${H - PAD.bottom} Z`
      : "";

  const yTicks = narrow ? 4 : 5;
  const ticks = Array.from({ length: yTicks }, (_, i) => {
    const price = maxP - (i / (yTicks - 1)) * (maxP - minP);
    return { price, y: y(price) };
  });

  const xTicks = narrow ? 4 : 6;
  const xLabels: { x: number; label: string }[] = [];
  let lastLabel = "";
  for (let i = 0; i < xTicks; i++) {
    const t = minT + ((maxT - minT) * i) / (xTicks - 1);
    const label = dayLabel(t, false);
    if (label !== lastLabel) {
      xLabels.push({ x: x(t), label });
      lastLabel = label;
    }
  }

  const hovered = points.find((p) => p.t === hover) ?? null;
  const hoveredX = hovered ? x(hovered.t) : 0;
  const hoveredY = hovered ? y(hovered.price) : 0;
  const hoveredEvent =
    hovered && isPrimary
      ? shownEvents.find((e) => Math.abs(e.at - hovered.t) <= 86400000)
      : null;

  const tooltipW = 168;
  const tooltipH = hoveredEvent ? 66 : 50;
  const tooltipX = hovered
    ? Math.max(
        PAD.left,
        Math.min(
          hoveredX + 14,
          W - PAD.right - tooltipW,
        ),
      )
    : 0;
  const tooltipY = hovered
    ? Math.max(PAD.top, Math.min(hoveredY - tooltipH - 14, H - PAD.bottom - tooltipH))
    : 0;

  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || points.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((e.clientX - rect.left) / rect.width) * W;
    const t = minT + ((viewX - PAD.left) / (W - PAD.left - PAD.right)) * (maxT - minT);
    let nearest = points[0];
    let dist = Math.abs(nearest.t - t);
    for (const p of points) {
      const d = Math.abs(p.t - t);
      if (d < dist) {
        nearest = p;
        dist = d;
      }
    }
    setHover(nearest.t);
  }

  const dates = (() => {
    if (!stats) return "";
    const parts: string[] = [];
    if (isPrimary && shownEvents.length) {
      parts.push(
        `${shownEvents.length} sale${shownEvents.length === 1 ? "" : "s"} & deal${
          shownEvents.length === 1 ? "" : "s"
        } in this view`,
      );
    }
    parts.push(`${points.length} recorded price${points.length === 1 ? "" : "s"}`);
    return parts.join(" · ");
  })();

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
        className,
      )}
    >
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-headline">
              Price history
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              One store at a time. Point anywhere on the line to read that day.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 rounded-xl border border-hairline bg-subtle p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => {
                setRange(r.key);
                setHover(null);
              }}
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
      </div>

      {/* store switcher — never two stores on the same line */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
          Store
        </span>
        {stores.map((s) => {
          const on = s.merchant === store?.merchant;
          return (
            <button
              key={s.merchant}
              onClick={() => {
                setActiveMerchant(s.merchant);
                setHover(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-bold transition-all",
                on
                  ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--dw-green-bot)] ring-1 ring-emerald-500/20"
                  : "border-hairline bg-card text-body hover:border-emerald-400/60 hover:text-headline",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  on ? "bg-emerald-500" : "bg-slate-400/70",
                )}
              />
              {storeMeta(s.merchant).name}
              <span className="tabular text-[10px] font-semibold text-muted">
                {s.points.length}
              </span>
            </button>
          );
        })}
      </div>

      {fellBack ? (
        <p className="mx-5 mb-4 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-body">
          Only {inRange.length} reading{inRange.length === 1 ? "" : "s"} in the last{" "}
          {RANGE_LABEL[range]} — showing the full {points.length}-point record instead.
        </p>
      ) : null}

      {/* numbers for the selected store */}
      {stats ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-hairline bg-subtle px-5 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              Now
            </span>
            <span className="tabular text-[16px] font-extrabold leading-none text-headline">
              {formatINR(stats.now)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              Lowest ever
            </span>
            <span className="tabular text-[16px] font-extrabold leading-none text-[var(--dw-green-mid)]">
              {formatINR(stats.low.price)}
            </span>
            <span className="text-[10.5px] font-semibold text-muted">
              {dayLabel(stats.low.t, true)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              Average
            </span>
            <span className="tabular text-[16px] font-extrabold leading-none text-headline">
              {formatINR(stats.average)}
            </span>
            <span className="text-[10.5px] font-semibold text-muted">
              peak {formatINR(stats.high.price)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
              From peak
            </span>
            <span className="tabular text-[16px] font-extrabold leading-none text-[var(--dw-green-mid)]">
              {stats.fromPeak}%
            </span>
            {stats.offPeak > 0 ? (
              <span className="text-[10.5px] font-semibold text-muted">
                {formatINR(stats.offPeak)} off the top
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* chart */}
      <div ref={wrapRef}>
        {points.length > 1 ? (
          <div className="px-2 pt-3">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full touch-pan-y"
            role="img"
            aria-label={`Recorded price history for ${meta?.name ?? "this store"}`}
            onPointerMove={move}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="ph-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>
            </defs>

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

            <path d={area} fill="url(#ph-area)" />
            <path
              d={line}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* sale / drop markers, only for the store these events belong to */}
            {shownEvents.map((e) => {
              if (e.at < minT || e.at > maxT) return null;
              const ex = x(e.at);
              const ey = y(e.price);
              return (
                <g key={`${e.kind}-${e.at}`}>
                  <circle
                    cx={ex}
                    cy={ey}
                    r="3.6"
                    fill={TONE[e.tone]}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="text-card"
                  />
                  <title>{`${e.label} · ${formatINR(e.price)} · ${dayLabel(e.at, true)}`}</title>
                </g>
              );
            })}

            {/* the latest reading */}
            <circle
              cx={x(points[points.length - 1].t)}
              cy={y(points[points.length - 1].price)}
              r="4.5"
              fill="#10b981"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-card"
            />

            {/* day hover */}
            {hovered ? (
              <g pointerEvents="none">
                <line
                  x1={hoveredX}
                  y1={PAD.top}
                  x2={hoveredX}
                  y2={H - PAD.bottom}
                  stroke="#10b981"
                  strokeOpacity="0.35"
                  strokeWidth="1.5"
                  strokeDasharray="3 4"
                />
                <circle
                  cx={hoveredX}
                  cy={hoveredY}
                  r="5.5"
                  fill="#10b981"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className="text-card"
                />
                <rect
                  x={tooltipX}
                  y={tooltipY}
                  width={tooltipW}
                  height={tooltipH}
                  rx="9"
                  fill="var(--bg-card)"
                  stroke="#10b981"
                  strokeOpacity="0.35"
                />
                <text
                  x={tooltipX + 11}
                  y={tooltipY + 18}
                  fontSize="10.5"
                  fontWeight="700"
                  className="fill-muted"
                >
                  {dayLabel(hovered.t, true)}
                </text>
                <text
                  x={tooltipX + 11}
                  y={tooltipY + 38}
                  fontSize="14"
                  fontWeight="800"
                  className="tabular fill-headline"
                >
                  {formatINR(hovered.price)}
                </text>
                {hoveredEvent ? (
                  <text
                    x={tooltipX + 11}
                    y={tooltipY + 56}
                    fontSize="10.5"
                    fontWeight="700"
                    fill={TONE[hoveredEvent.tone]}
                  >
                    {hoveredEvent.label}
                  </text>
                ) : null}
              </g>
            ) : null}
          </svg>
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center px-6 py-10 text-center">
            <div>
              <p className="text-[13.5px] font-bold text-headline">
                The graph starts with the second reading.
              </p>
              <p className="mt-1 text-[12.5px] text-muted">
                {points.length === 1
                  ? `One price is on record for ${meta?.name ?? "this store"}. One more check and the line begins.`
                  : "We only draw a line from real observations, never an estimate."}
              </p>
              <Link
                href="/price-history"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1.5 text-[12px] font-extrabold text-[var(--dw-green-mid)] transition-colors"
              >
                See the deepest tracked histories
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-4 pt-2 text-[11px] font-semibold text-muted">
        <span>
          Showing <span className="text-body">{meta?.name ?? "this store"}</span>
        </span>
        <span className="text-hairline">·</span>
        <span>{dates}</span>
        {attribution ? (
          <>
            <span className="text-hairline">·</span>
            <span>
              includes{" "}
              <a
                href={attribution.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[var(--dw-green-mid)] underline decoration-dotted underline-offset-2"
              >
                {attribution.label}
              </a>{" "}
              records
            </span>
          </>
        ) : null}
        {hovered ? (
          <>
            <span className="text-hairline">·</span>
            <span className="text-body">
              {dayLabel(hovered.t, true)} · {formatINR(hovered.price)}
            </span>
          </>
        ) : null}
      </div>
    </section>
  );
}
