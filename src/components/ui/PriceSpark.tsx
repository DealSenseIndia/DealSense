import { cn } from "@/lib/utils";

/**
 * Mini price-history graph for a product card.
 * Drawn from the actual recorded price series — never a stock curve.
 */
export function PriceSpark({
  series,
  className,
  width = 96,
  height = 30,
  stroke = "#10b981",
}: {
  series: number[];
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
}) {
  const pts = series.filter((p) => Number.isFinite(p) && p > 0);

  if (pts.length < 2) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-dashed border-hairline text-[9.5px] font-semibold text-muted",
          className,
        )}
        style={{ width, height }}
      >
        no history
      </span>
    );
  }

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 3;

  const xy = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((p - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L ${xy[xy.length - 1][0].toFixed(1)},${height} L ${xy[0][0].toFixed(1)},${height} Z`;
  const gid = `spk-${stroke.replace("#", "")}-${width}x${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={`Price history, ${pts.length} recorded prices`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2" fill={stroke} />
    </svg>
  );
}
