"use client";

import { useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/types";
import { formatINR } from "@/lib/utils";

const W = 900;
const H = 300;
const PAD = { top: 22, right: 14, bottom: 28, left: 58 };

export type Timeframe = "1M" | "3M" | "6M" | "1Y" | "ALL";

const RANGES: Record<Timeframe, number | null> = {
  "1M": 30 * 86400000,
  "3M": 90 * 86400000,
  "6M": 182 * 86400000,
  "1Y": 365 * 86400000,
  ALL: null,
};

function smooth(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/**
 * The price history chart. Dark terminal card (like DealSense 1.0), with
 * store-coloured series, price rail, date rail and a crosshair readout.
 */
export function PriceChart({
  primary,
  rival,
  height = 300,
  primaryLabel = "Store price",
  rivalLabel = "Other store",
  primaryColor = "#10B981",
  rivalColor = "#3B82F6",
}: {
  primary: PricePoint[];
  rival?: PricePoint[];
  height?: number;
  primaryLabel?: string;
  rivalLabel?: string;
  primaryColor?: string;
  rivalColor?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tf, setTf] = useState<Timeframe>("ALL");
  const [hover, setHover] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const range = RANGES[tf];
    const cut = range ? Date.now() - range : 0;
    const p = primary.filter((x) => x.t >= cut);
    const r = (rival ?? []).filter((x) => x.t >= cut);
    return { p: p.length ? p : primary, r };
  }, [primary, rival, tf]);

  const model = useMemo(() => {
    const all = [...filtered.p, ...filtered.r];
    if (!all.length) return null;
    const ts = all.map((x) => x.t);
    const ps = all.map((x) => x.price);
    let minT = Math.min(...ts);
    let maxT = Math.max(...ts);
    if (minT === maxT) {
      minT -= 86400000;
      maxT += 86400000;
    }
    let minP = Math.min(...ps);
    let maxP = Math.max(...ps);
    const span = maxP - minP || Math.max(maxP * 0.1, 1);
    minP = Math.max(0, minP - span * 0.12);
    maxP = maxP + span * 0.12;
    return {
      minT,
      maxT,
      minP,
      maxP,
      x: (t: number) => PAD.left + ((t - minT) / (maxT - minT)) * (W - PAD.left - PAD.right),
      y: (p: number) => PAD.top + (1 - (p - minP) / (maxP - minP)) * (H - PAD.top - PAD.bottom),
    };
  }, [filtered]);

  const pts = useMemo(() => {
    if (!model) return { p: [], r: [] };
    return {
      p: filtered.p.map((q) => ({ x: model.x(q.t), y: model.y(q.price), q })),
      r: filtered.r.map((q) => ({ x: model.x(q.t), y: model.y(q.price), q })),
    };
  }, [model, filtered]);

  if (!model || !pts.p.length) {
    return (
      <div
        className="grid place-items-center rounded-2xl border border-dashed border-white/15 bg-[var(--bg-terminal)] text-center text-[13px] text-slate-400"
        style={{ height }}
      >
        <div className="px-6">
          <div className="text-3xl">📈</div>
          <p className="mt-2 font-semibold text-slate-300">No verified price history yet</p>
          <p className="mt-1 text-[12px]">
            DealSense charts only real observations. Track this product and the chart fills in as we
            record prices.
          </p>
        </div>
      </div>
    );
  }

  const hovered = hover !== null ? pts.p[hover] : null;
  const priceTicks = 4;

  /** Typical price line, lowest point and the current point — the three
      numbers a price-history graph is actually read for. */
  const marks = useMemo(() => {
    if (!pts.p.length || !model) return null;
    const prices = pts.p.map((p) => p.q.price);
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const lowPt = pts.p.reduce((a, b) => (b.q.price < a.q.price ? b : a));
    const lastPt = pts.p[pts.p.length - 1];
    // The band we call "typical" — the middle half of everything on the record.
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    return {
      median,
      medianY: model.y(median),
      bandTop: model.y(q3),
      bandBottom: model.y(q1),
      lowPt,
      lastPt,
    };
  }, [pts, model]);

  /** With hundreds of points the dots turn into noise — draw the line only. */
  const showDots = pts.p.length <= 90;

  function onMove(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg || !pts.p.length) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    pts.p.forEach((pt, i) => {
      const d = Math.abs(pt.x - relX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  const dateTicks = 4;
  const datePoints = Array.from({ length: dateTicks + 1 }).map((_, i) => {
    const t = model.minT + ((model.maxT - model.minT) * i) / dateTicks;
    return { t, x: model.x(t) };
  });

  return (
    <div>
      {/* timeframe pills */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["1M", "3M", "6M", "1Y", "ALL"] as Timeframe[]).map((f) => (
          <button
            key={f}
            onClick={() => setTf(f)}
            className={`rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
              tf === f
                ? "bg-emerald-accent/15 text-emerald-300 ring-1 ring-emerald-accent/30"
                : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[11.5px] font-semibold">
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: primaryColor }} />
            {primaryLabel}
          </span>
          {pts.r.length > 1 && (
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ background: rivalColor }} />
              {rivalLabel}
            </span>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--bg-terminal)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pcArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity="0.22" />
              <stop offset="100%" stopColor={primaryColor} stopOpacity="0" />
            </linearGradient>
            <filter id="pcGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* the typical price band — where this product usually sits */}
          {marks ? (
            <>
              <rect
                x={PAD.left}
                y={marks.bandTop}
                width={W - PAD.left - PAD.right}
                height={Math.max(2, marks.bandBottom - marks.bandTop)}
                fill="rgba(148,163,184,0.10)"
                rx="3"
              />
              <text
                x={PAD.left + 6}
                y={marks.bandTop - 5}
                fontSize="9.5"
                fontWeight="700"
                fill="#64748B"
              >
                usual price range
              </text>
            </>
          ) : null}

          {Array.from({ length: priceTicks + 1 }).map((_, i) => {
            const y = PAD.top + (i / priceTicks) * (H - PAD.top - PAD.bottom);
            const price = model.maxP - (i / priceTicks) * (model.maxP - model.minP);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="#64748B" className="tabular">
                  {formatINR(Math.round(price))}
                </text>
              </g>
            );
          })}

          {datePoints.map((d, i) => (
            <text key={i} x={d.x} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#64748B">
              {new Date(d.t).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </text>
          ))}

          {pts.p.length > 1 && (
            <path
              d={`${smooth(pts.p)} L ${pts.p[pts.p.length - 1].x} ${H - PAD.bottom} L ${pts.p[0].x} ${H - PAD.bottom} Z`}
              fill="url(#pcArea)"
            />
          )}

          {pts.r.length > 1 && (
            <path d={smooth(pts.r)} fill="none" stroke={rivalColor} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
          )}

          {pts.p.length > 1 && (
            <path
              d={smooth(pts.p)}
              fill="none"
              stroke={primaryColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              filter="url(#pcGlow)"
            />
          )}

          {/* typical price line */}
          {marks ? (
            <>
              <line
                x1={PAD.left}
                y1={marks.medianY}
                x2={W - PAD.right}
                y2={marks.medianY}
                stroke="rgba(255,255,255,0.34)"
                strokeWidth="1"
                strokeDasharray="5 4"
              />
              <text
                x={W - PAD.right - 4}
                y={marks.medianY - 5}
                textAnchor="end"
                fontSize="10"
                fontWeight="700"
                fill="#94A3B8"
                className="tabular"
              >
                typical {formatINR(Math.round(marks.median))}
              </text>
            </>
          ) : null}

          {showDots &&
            pts.p.map((pt, i) => (
              <circle
                key={i}
                cx={pt.x}
                cy={pt.y}
                r={hover === i ? 4.5 : 2}
                fill="#0F172A"
                stroke={primaryColor}
                strokeWidth="2"
              />
            ))}

          {/* lowest price marker */}
          {marks ? (
            <g>
              <circle
                cx={marks.lowPt.x}
                cy={marks.lowPt.y}
                r="5"
                fill="#10B981"
                stroke="#0F172A"
                strokeWidth="2.5"
              />
              <text
                x={marks.lowPt.x}
                y={marks.lowPt.y - 11}
                textAnchor="middle"
                fontSize="10.5"
                fontWeight="800"
                fill="#34D399"
                className="tabular"
              >
                low {formatINR(marks.lowPt.q.price)}
              </text>
            </g>
          ) : null}

          {/* where the price is right now */}
          {marks ? (
            <g>
              <circle
                cx={marks.lastPt.x}
                cy={marks.lastPt.y}
                r="5.5"
                fill="#F8FAFC"
                stroke={primaryColor}
                strokeWidth="3"
              />
              <line
                x1={marks.lastPt.x}
                y1={marks.lastPt.y}
                x2={W - PAD.right}
                y2={marks.lastPt.y}
                stroke="rgba(248,250,252,0.28)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={W - PAD.right - 4}
                y={marks.lastPt.y - 9}
                textAnchor="end"
                fontSize="10.5"
                fontWeight="800"
                fill="#F8FAFC"
                className="tabular"
              >
                now {formatINR(marks.lastPt.q.price)}
              </text>
            </g>
          ) : null}

          {hovered && (
            <line
              x1={hovered.x}
              y1={PAD.top}
              x2={hovered.x}
              y2={H - PAD.bottom}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}
        </svg>

        {hovered && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur">
            <div className="tabular text-[13px] font-extrabold text-white">{formatINR(hovered.q.price)}</div>
            <div className="text-[10.5px] font-semibold text-slate-400">
              {new Date(hovered.q.t).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
