"use client";

import { useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/types";
import { formatINR } from "@/lib/utils";

const W = 800;
const H = 300;
const PAD = { top: 24, right: 18, bottom: 30, left: 8 };

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
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

export function PriceChart({
  primary,
  rival,
  height = 300,
  primaryLabel = "Primary",
  rivalLabel = "Rival",
}: {
  primary: PricePoint[];
  rival?: PricePoint[];
  height?: number;
  primaryLabel?: string;
  rivalLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const all = useMemo(() => [...primary, ...(rival ?? [])], [primary, rival]);

  const model = useMemo(() => {
    if (all.length === 0) return null;
    const ts = all.map((p) => p.t);
    const prices = all.map((p) => p.price);
    let minT = Math.min(...ts);
    let maxT = Math.max(...ts);
    if (minT === maxT) {
      minT -= 86400000;
      maxT += 86400000;
    }
    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const span = maxP - minP || Math.max(maxP * 0.08, 1);
    minP = Math.max(0, minP - span * 0.18);
    maxP = maxP + span * 0.18;

    const x = (t: number) =>
      PAD.left + ((t - minT) / (maxT - minT)) * (W - PAD.left - PAD.right);
    const y = (p: number) =>
      PAD.top + (1 - (p - minP) / (maxP - minP)) * (H - PAD.top - PAD.bottom);

    return { minT, maxT, minP, maxP, x, y };
  }, [all]);

  const points = useMemo(() => {
    if (!model) return { primary: [], rival: [] };
    return {
      primary: primary.map((p) => ({ x: model.x(p.t), y: model.y(p.price), p })),
      rival: (rival ?? []).map((p) => ({ x: model.x(p.t), y: model.y(p.price), p })),
    };
  }, [model, primary, rival]);

  if (!model || primary.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-2xl border border-line bg-surface text-sm text-ink-muted"
        style={{ height }}
      >
        Not enough verified observations yet.
      </div>
    );
  }

  const primaryPath = smoothPath(points.primary);
  const rivalPath = smoothPath(points.rival);
  const areaPath =
    points.primary.length > 1
      ? `${primaryPath} L ${points.primary[points.primary.length - 1].x} ${H - PAD.bottom} L ${points.primary[0].x} ${H - PAD.bottom} Z`
      : "";

  const hovered = hoverIdx !== null ? points.primary[hoverIdx] : null;

  function onMove(e: React.MouseEvent) {
    const svg = svgRef.current;
    if (!svg || points.primary.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    points.primary.forEach((pt, i) => {
      const d = Math.abs(pt.x - relX);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  const gridLines = 4;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>

        {/* horizontal grid */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = PAD.top + (i / gridLines) * (H - PAD.top - PAD.bottom);
          const price = model.maxP - (i / gridLines) * (model.maxP - model.minP);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--line)" strokeWidth="1" />
              <text x={W - PAD.right} y={y - 6} textAnchor="end" fontSize="11" fill="var(--ink-muted)">
                {formatINR(Math.round(price))}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#areaFill)" />}

        {points.rival.length > 1 && (
          <path d={rivalPath} fill="none" stroke="#2874F0" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
        )}

        <path
          d={primaryPath}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.primary.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={hoverIdx === i ? 5 : 2.5}
            fill="#05070d"
            stroke="#34d399"
            strokeWidth="2"
            className="transition-all"
          />
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            y1={PAD.top}
            x2={hovered.x}
            y2={H - PAD.bottom}
            stroke="var(--line-strong)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-3 rounded-xl border border-line bg-surface-solid/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{
            left: `${(hovered.x / W) * 100}%`,
            transform: `translateX(${hovered.x > W * 0.7 ? "-105%" : "8px"})`,
          }}
        >
          <div className="font-semibold text-ink">{formatINR(hovered.p.price)}</div>
          <div className="text-ink-muted">
            {new Date(hovered.p.t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-4 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> {primaryLabel}
        </span>
        {rival && rival.length > 1 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2874F0]" /> {rivalLabel}
          </span>
        )}
        <span className="ml-auto tabular">{primary.length} verified observations</span>
      </div>
    </div>
  );
}
