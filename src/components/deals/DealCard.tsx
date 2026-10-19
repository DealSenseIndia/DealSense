"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DealItem } from "@/lib/engine/deals";
import { merchantMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";
import { VerdictBadge } from "@/components/ui/Badge";

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-8" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 100;
  const h = 32;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const down = points[points.length - 1] <= points[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={down ? "#22c55e" : "#f59e0b"} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DealCard({ deal }: { deal: DealItem }) {
  const meta = merchantMeta[deal.merchant];
  const [imgError, setImgError] = useState(false);
  const discount =
    deal.mrp && deal.mrp > deal.price ? Math.round(((deal.mrp - deal.price) / deal.mrp) * 100) : null;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40 hover:shadow-[0_20px_60px_-24px_rgba(16,185,129,0.5)]">
      <Link href={`/product/${deal.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-surface-raised">
        {deal.imageUrl && !imgError ? (
          <Image
            src={deal.imageUrl}
            alt={deal.title}
            fill
            sizes="(max-width: 768px) 50vw, 300px"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-ink-muted">🛍️</div>
        )}
        <span
          className="absolute left-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-[10px] font-extrabold text-white"
          style={{ background: meta.color }}
        >
          {meta.short}
        </span>
        {deal.verdict.score !== null && (
          <span className="absolute right-3 top-3 rounded-full border border-line bg-surface-solid/90 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
            {deal.verdict.score}/100
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link href={`/product/${deal.slug}`} className="line-clamp-2 text-sm font-semibold leading-snug hover:text-brand-300">
          {deal.title}
        </Link>

        <div className="mt-2 flex items-center gap-2">
          <VerdictBadge verdict={deal.verdict.verdict} className="!px-2 !py-0.5 !text-[10px]" />
          <span className="text-[11px] text-ink-muted">{timeAgo(deal.lastCheckedAt)}</span>
        </div>

        <div className="mt-3">
          <Sparkline points={deal.spark} />
        </div>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="tabular text-xl font-extrabold">{formatINR(deal.price)}</div>
            {deal.mrp && deal.mrp > deal.price && (
              <div className="tabular text-xs text-ink-muted line-through">{formatINR(deal.mrp)}</div>
            )}
          </div>
          {discount !== null && (
            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-300">
              {discount}% off
            </span>
          )}
        </div>

        <a
          href={deal.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="mt-4 inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-500 text-xs font-bold text-[#04140d] transition-colors hover:bg-brand-400"
        >
          Buy on {meta.name} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
