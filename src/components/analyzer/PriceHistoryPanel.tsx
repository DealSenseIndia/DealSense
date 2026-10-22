"use client";

import { useMemo, useState } from "react";
import { Expand, LineChart } from "lucide-react";
import type { PricePoint } from "@/lib/types";
import type { DealEvent } from "@/lib/engine/insights";
import { curvePath, monotoneSegments } from "@/lib/engine/curve";
import { cn, formatINR } from "@/lib/utils";

const W = 1440;
const H = 360;
const PAD = { top: 26, right: 26, bottom: 40, left: 78 };

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

export interface ChartStat {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "muted" | "plain";
}

/**
 * The price history of one store, as one clean curve.
 *
 * The line is coloured by direction — green where the price rose, red where
 * it fell — and it is drawn as a smooth curve so the shape of the history
 * reads at a glance instead of a picket fence. Point at any spot to read
 * the exact price we recorded for that day.
 */
export function PriceHistoryPanel({
  storeName,
  points,
  events = [],
  stats = [],
  className,
}: {
  /** The store this history belongs to. */
  storeName: string;
  points: PricePoint[];
  events?: DealEvent[];
  stats?: ChartStat[];
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const [hover, setHover] = useState<{ x: number; p: PricePoint } | null>(null);
  const [hoverEvent, setHoverEvent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  /** The points inside the chosen window, oldest first. */
  const shown = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return points
      .filter((p) => p.t >= cut && p.price > 0)
      .sort((a, b) => a.t - b.t);
  }, [points, range]);

  const minT = shown.length ? shown[0].t : 0;
  const maxT = shown.length ? shown[shown.length - 1].t : 1;
  const minP = shown.length ? Math.min(...shown.map((p) => p.price)) : 0;
  const maxP = shown.length ? Math.max(...shown.map((p) => p.price)) : 1;

  // A little air above and below so the line never touches the frame.
  const pad = (maxP - minP) * 0.12 || maxP * 0.05 || 1;
  const loP = Math.max(0, minP - pad);
  const hiP = maxP + pad;

  const x = (t: number) =>
    PAD.left + ((t - minT) / Math.max(1, maxT - minT)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - loP) / Math.max(1, hiP - loP)) * (H - PAD.top - PAD.bottom);

  /** The curve, split so each piece can take the colour of its move. */
  const curve = useMemo(() => {
    const pts = shown.map((p) => ({ x: x(p.t), y: y(p.price) }));
    const segs = monotoneSegments(pts);
    return {
      segs: segs.map((s) => ({
        ...s,
        colour:
          s.to.y < s.from.y - 0.4 ? UP : s.to.y > s.from.y + 0.4 ? DOWN : FLAT,
      })),
      area: segs.length
        ? `${curvePath(segs, pts[0])} L ${pts[pts.length - 1].x.toFixed(1)},${H - PAD.bottom} L ${pts[0].x.toFixed(1)},${H - PAD.bottom} Z`
        : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, minT, maxT, loP, hiP]);

  const yTicks = 5;
  const ticks = Array.from({ length: yTicks }, (_, i) => {
    const price = hiP - (i / (yTicks - 1)) * (hiP - loP);
    return { price, y: y(price) };
  });

  const xCount = 7;
  const xLabels: { x: number; label: string }[] = [];
  let lastLabel = "";
  for (let i = 0; i < xCount; i++) {
    const t = minT + ((maxT - minT) * i) / (xCount - 1);
    const full = new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const label = full === lastLabel ? "" : full;
    lastLabel = full;
    xLabels.push({ x: x(t), label });
  }

  /** The price we recorded for the day the pointer is nearest. */
  const readAt = (clientX: number, rect: DOMRect): PricePoint | null => {
    const relX = ((clientX - rect.left) / rect.width) * W;
    let best: PricePoint | null = null;
    let bestD = Infinity;
    for (const p of shown) {
      const d = Math.abs(x(p.t) - relX);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  };

  /** The colour of the move the hovered point belongs to. */
  const hoverColour = useMemo(() => {
    if (!hover) return UP;
    for (const s of curve.segs) {
      if (Math.abs(s.to.x - hover.x) < 1.5) return s.colour;
    }
    return UP;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, curve]);

  /** Only the events inside the visible window. */
  const shownEvents = useMemo(() => {
    const cfg = RANGES.find((r) => r.key === range)!;
    const cut = cfg.days ? Date.now() - cfg.days * 86400000 : 0;
    return events.filter((e) => e.at >= cut);
  }, [events, range]);

  if (shown.length < 2) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
          className,
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-headline">
              Price history
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              We are still collecting prices for this product. Check back soon.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-card shadow-card",
        className,
      )}
    >
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-headline">
              Price history
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {storeName} · every price we recorded. Point anywhere on the line to read that day.
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
                  "rounded-lg px-3 py-1.5 text-[12px] font-bold transition-colors",
                  range === r.key
                    ? "bg-emerald-600 text-white shadow-[0_2px_8px_-2px_rgba(5,150,105,0.8)]"
                    : "text-muted hover:bg-elevated hover:text-headline",
                )}
              >
                {r.key}
              </button>
            ))}
          </div>

          <button
            onClick={() => setExpanded((e) => !e)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-subtle text-muted transition-colors hover:text-headline"
            aria-label={expanded ? "Collapse chart" : "Expand chart"}
          >
            <Expand className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ---------- the numbers, on the chart ---------- */}
      {stats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2.5 border-y border-hairline bg-subtle px-6 py-3.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-baseline gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                {s.label}
              </span>
              <span
                className={cn(
                  "tabular text-[17px] font-extrabold leading-none",
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
          className="h-auto w-full min-w-[720px]"
          role="img"
          aria-label="Recorded price history"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const p = readAt(e.clientX, rect);
            if (p) setHover({ x: x(p.t), p });
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="phArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <filter id="phGlow" x="-10%" y="-30%" width="120%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.16" />
            </filter>
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
                strokeOpacity="0.08"
                strokeWidth="1"
                strokeDasharray="4 8"
                className="text-slate-500"
              />
              <text
                x={PAD.left - 12}
                y={t.y + 4}
                textAnchor="end"
                fontSize="12.5"
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
              y={H - 14}
              textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
              fontSize="12.5"
              fontWeight="600"
              className="fill-muted"
            >
              {l.label}
            </text>
          ))}

          {/* the area under the curve */}
          {curve.area ? <path d={curve.area} fill="url(#phArea)" /> : null}

          {/* the curve, coloured by the move it makes */}
          <g filter="url(#phGlow)">
            {curve.segs.map((s, i) => (
              <path
                key={i}
                d={s.d}
                fill="none"
                stroke={s.colour}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* sale and deal markers */}
          {shownEvents.map((e, ei) => {
            const key = `${e.kind}-${e.at}-${ei}`;
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
                <circle cx={ex} cy={ey} r="12" fill="transparent" />
                <circle
                  cx={ex}
                  cy={ey}
                  r={active ? 6 : 4}
                  fill={active ? "#ffffff" : "#0f172a"}
                  stroke={active ? UP : "#ffffff"}
                  strokeWidth="2.5"
                />
                {active ? (
                  <g
                    transform={`translate(${Math.max(PAD.left, Math.min(ex - 64, W - PAD.right - 128))}, ${Math.max(PAD.top, ey - 62)})`}
                  >
                    <rect
                      width="128"
                      height="44"
                      rx="10"
                      fill="var(--bg-card)"
                      stroke={UP}
                      strokeOpacity="0.5"
                      strokeWidth="1.5"
                    />
                    <text x="11" y="18" fontSize="10.5" fontWeight="700" className="fill-muted">
                      {e.label}
                    </text>
                    <text x="11" y="35" fontSize="14" fontWeight="800" className="tabular fill-headline">
                      {formatINR(e.price)}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}

          {/* the point we are pointing at */}
          {hover ? (
            <g>
              <line
                x1={hover.x}
                y1={PAD.top}
                x2={hover.x}
                y2={H - PAD.bottom}
                stroke="currentColor"
                strokeOpacity="0.22"
                strokeWidth="1.5"
                strokeDasharray="4 5"
                className="text-slate-500"
              />
              <circle
                cx={hover.x}
                cy={y(hover.p.price)}
                r="8"
                fill="var(--bg-card)"
                stroke={hoverColour}
                strokeWidth="3.5"
              />
              <g
                transform={`translate(${Math.max(PAD.left, Math.min(hover.x - 66, W - PAD.right - 132))}, ${Math.max(PAD.top, y(hover.p.price) - 64)})`}
              >
                <rect
                  width="132"
                  height="46"
                  rx="11"
                  fill="var(--bg-card)"
                  stroke="currentColor"
                  strokeOpacity="0.22"
                  strokeWidth="1.5"
                  className="text-slate-500"
                />
                <text x="12" y="18" fontSize="10.5" fontWeight="700" className="fill-muted">
                  {new Date(hover.p.t).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </text>
                <text x="12" y="36" fontSize="15" fontWeight="800" className="tabular fill-headline">
                  {formatINR(hover.p.price)}
                </text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>

      {/* ---------- legend ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-5 pt-2">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-body">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: UP }} />
          {storeName} price
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <span className="h-0.5 w-5 rounded" style={{ background: UP }} /> price rose
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
            <span className="h-0.5 w-5 rounded" style={{ background: DOWN }} /> price fell
          </span>
        </div>
      </div>
    </section>
  );
}
