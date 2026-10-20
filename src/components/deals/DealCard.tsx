import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Flame } from "lucide-react";
import type { DealItem } from "@/lib/engine/deals";
import { merchantMeta } from "@/lib/config";
import { cn, formatINR, timeAgo } from "@/lib/utils";
import { Tag } from "@/components/ui/Badge";

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-8" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 200;
  const h = 34;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const down = points[points.length - 1] <= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={down ? "#10B981" : "#F59E0B"} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DealCard({ deal, index = 0 }: { deal: DealItem; index?: number }) {
  const meta = merchantMeta[deal.merchant];
  const discount =
    deal.mrp && deal.mrp > deal.price ? Math.round(((deal.mrp - deal.price) / deal.mrp) * 100) : null;

  // Only claim an all-time low once we have a real history to compare against.
  const hasHistory = deal.observationCount >= 3;
  const isLow = hasHistory && deal.verdict.stats.low !== null && deal.price <= deal.verdict.stats.low;
  const score = deal.verdict.score;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-emerald-accent/40 hover:shadow-lift">
      <Link href={`/product/${deal.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-subtle">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.title}
            fill
            sizes="(max-width: 768px) 50vw, 320px"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-muted">🛍️</div>
        )}

        {/* badge row */}
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
          {isLow && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)] backdrop-blur">
              <Flame className="h-2.5 w-2.5" />
              All-time low
            </span>
          )}
          {hasHistory && score !== null && score >= 85 && !isLow && (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-600 backdrop-blur dark:text-amber-300">
              Steep drop
            </span>
          )}
          {!hasHistory && (
            <span className="rounded-full border border-hairline-strong bg-card/85 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-secondary backdrop-blur">
              Building history
            </span>
          )}
        </div>

        {/* store logo */}
        <span
          className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg text-[9px] font-black text-white shadow-sm"
          style={{ background: meta.color }}
          title={meta.name}
        >
          {meta.short}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <Link
          href={`/product/${deal.slug}`}
          className="line-clamp-2 min-h-[2.4rem] text-[13px] font-bold leading-snug text-headline transition-colors hover:text-[var(--dw-green-mid)]"
        >
          {deal.title}
        </Link>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Tag tone="neutral">{timeAgo(deal.lastCheckedAt)}</Tag>
          {deal.observationCount > 0 && <Tag tone="brand">{deal.observationCount} obs</Tag>}
        </div>

        <div className="mt-2">
          <Sparkline points={deal.spark} />
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <div className="tabular text-[20px] font-extrabold leading-none tracking-tight text-headline">
              {formatINR(deal.price)}
            </div>
            {deal.mrp && deal.mrp > deal.price && (
              <div className="tabular mt-1 text-[11px] text-muted line-through">{formatINR(deal.mrp)}</div>
            )}
          </div>
          <div className="text-right">
            {discount !== null && (
              <div className="text-[12px] font-extrabold text-[var(--dw-green-mid)]">{discount}% off</div>
            )}
            {score !== null && (
              <div className="tabular text-[11px] font-bold text-muted">score {score}</div>
            )}
          </div>
        </div>

        <a
          href={deal.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-btn bg-emerald-accent text-[12px] font-extrabold text-white transition-colors hover:bg-[var(--dw-green-mid)]"
        >
          Check deal on {meta.name} <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}
