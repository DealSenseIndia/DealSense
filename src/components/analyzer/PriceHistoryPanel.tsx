"use client";

import { useMemo, useState } from "react";
import { Expand, LineChart } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent } from "@/lib/engine/insights";
import { cn, formatINR } from "@/lib/utils";

const W = 1100;
const H = 320;
const PAD = { top: 20, right: 22, bottom: 38, left: 66 };

const RANGES = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "2Y", days: 730 },
  { key: "ALL", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** The line is coloured by what the price just did. */
const UP = "#10b981";
const DOWN = "#f43f5e";
const FLAT = "#94a3b8";

const SERIES = [
  { key: "a", stroke: UP, fill: "rgba(16,185,129,0.14)", label: "Store price" },
  { key: "b", stroke: "#38bdf8", fill: "rgba(56,189,248,0.12)", label: "Other store" },
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
 * The line is coloured by direction — green where the price rose, red where
 * it fell — so you can see the shape of the history at a glance. Point at
 * any spot to read the price we recorded for that day.
 */
export function PriceHistoryPanel({
  series,
  events,
  currentPrice,
  stats = [],
  className,
}: {
  series: StoreSeries[];
  events: DealEvent[];
  currentPrice: number | null;
  stats?: ChartStat[];
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hidden, setHidden] = useState<string[]>([]);
  const [hover, setHover] = useState<{ x: number; p: PricePoint; merchant: string } | null>(null);
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

  const x = (t: number) =>
    PAD.left + ((t - minT) / Math.max(1, maxT - minT)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - minP) / Math.max(1, maxP - minP)) * (H - PAD.top - PAD.bottom);

  /** Only the events inside the visible window. */
  const shownEvents = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return events.filter((e) => e.at >= cut);
  }, [events, range]);

  /** Which store does each event belong to? The one whose series contains it. */
  const eventStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
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
  }, [events, windowed]);

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

  /** Split the line into runs so each stretch gets the colour of its move. */
  const runs = useMemo(() => {
    return windowed.map((s, si) => {
      const out: { d: string; colour: string; from: PricePoint; to: PricePoint }[] = [];
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1];
        const b = s.points[i];
        const colour = b.price > a.price ? UP : b.price < a.price ? DOWN : FLAT;
        out.push({
          d: `M ${x(a.t).toFixed(1)},${y(a.price).toFixed(1)} L ${x(b.t).toFixed(1)},${y(b.price).toFixed(1)}`,
          colour,
          from: a,
          to: b,
        });
      }
      return { merchant: s.merchant, si, out };
    });
  }, [windowed, minT, maxT, minP, maxP]);

  /** The price we recorded for the day the pointer is nearest. */
  const readAt = (clientX: number, rect: DOMRect): { p: PricePoint; merchant: string } | null => {
    const relX = ((clientX - rect.left) / rect.width) * W;
    let best: { p: PricePoint; merchant: string; d: number } | null = null;
    for (const s of windowed) {
      for (const p of s.points) {
        const d = Math.abs(x(p.t) - relX);
        if (!best || d < best.d) best = { p, merchant: s.merchant, d };
      }
    }
    return best ? { p: best.p, merchant: best.merchant } : null;
  };

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
              Every price we recorded. Point anywhere on the line to read that day.
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
      <div className="max-w-full overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label="Recorded price history"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const r = readAt(e.clientX, rect);
            if (r) setHover({ x: x(r.p.t), ...r });
          }}
          onMouseLeave={() => setHover(null)}
        >
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

          {/* the line, coloured by direction */}
          {runs.map((r) => (
            <g key={r.merchant}>
              {r.out.map((seg, i) => (
                <path
                  key={i}
                  d={seg.d}
                  fill="none"
                  stroke={seg.colour}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}

          {/* the point we are pointing at */}
          {hover ? (
            <g>
              <line
                x1={hover.x}
                y1={PAD.top}
                x2={hover.x}
                y2={H - PAD.bottom}
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="1"
                strokeDasharray="4 4"
                className="text-slate-500"
              />
              <circle
                cx={hover.x}
                cy={y(hover.p.price)}
                r="6"
                fill="var(--bg-card)"
                stroke={UP}
                strokeWidth="3"
              />
              <g
                transform={`translate(${Math.max(PAD.left, Math.min(hover.x - 62, W - PAD.right - 124))}, ${Math.max(PAD.top, y(hover.p.price) - 58)})`}
              >
                <rect
                  width="124"
                  height="42"
                  rx="9"
                  fill="var(--bg-card)"
                  stroke="currentColor"
                  strokeOpacity="0.2"
                  className="text-slate-500"
                />
                <text x="10" y="17" fontSize="10.5" fontWeight="700" className="fill-muted">
                  {new Date(hover.p.t).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </text>
                <text x="10" y="34" fontSize="13.5" fontWeight="800" className="tabular fill-headline">
                  {formatINR(hover.p.price)}
                </text>
              </g>
            </g>
          ) : null}

          {/* sale and deal markers, in that store's colour */}
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
                <circle cx={ex} cy={ey} r="11" fill="transparent" />
                <circle
                  cx={ex}
                  cy={ey}
                  r={active ? 5.5 : 3.5}
                  fill={colour}
                  stroke="var(--bg-card)"
                  strokeWidth="2"
                />
                {active ? (
                  <g
                    transform={`translate(${Math.max(PAD.left, Math.min(ex - 62, W - PAD.right - 124))}, ${Math.max(PAD.top, ey - 58)})`}
                  >
                    <rect
                      width="124"
                      height="42"
                      rx="9"
                      fill="var(--bg-card)"
                      stroke={colour}
                      strokeOpacity="0.45"
                    />
                    <text x="10" y="17" fontSize="10.5" fontWeight="700" className="fill-muted">
                      {e.label}
                    </text>
                    <text x="10" y="34" fontSize="13.5" fontWeight="800" className="tabular fill-headline">
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
              {si === 0 ? "This store" : s.merchant}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <span className="h-0.5 w-4 rounded bg-emerald-500" /> price rose
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <span className="h-0.5 w-4 rounded bg-rose-500" /> price fell
          </span>
        </div>
      </div>
    </section>
  );
}
