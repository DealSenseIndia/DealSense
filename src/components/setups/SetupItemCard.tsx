"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Database,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import type { SetupItem } from "@/lib/setups/engine";
import type { Verdict } from "@/lib/types";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { PriceSpark } from "@/components/ui/PriceSpark";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { cn, formatINR, timeAgo } from "@/lib/utils";

const VERDICT_STYLE: Record<Verdict, string> = {
  BUY: "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] text-[var(--verdict-buy)]",
  FAIR: "border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  WAIT: "border-amber-400/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  AVOID: "border-red-400/40 bg-red-500/10 text-red-600 dark:text-red-300",
  INSUFFICIENT: "border-hairline bg-elevated text-secondary",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  BUY: "Buy",
  FAIR: "Fair",
  WAIT: "Wait",
  AVOID: "Avoid",
  INSUFFICIENT: "Learning",
};

export function SetupItemCard({ item }: { item: SetupItem }) {
  const freshLabel = item.observedAt ? `checked ${timeAgo(item.observedAt)}` : "observation recorded";

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/45 hover:shadow-[0_22px_55px_-28px_rgba(16,185,129,0.55)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-subtle">
        <ProductThumb
          imageUrl={item.imageUrl}
          alt={item.title}
          merchant={item.merchant}
          sizes="(max-width: 640px) 50vw, (max-width: 1100px) 33vw, 300px"
          padding="p-4"
          imageClassName="transition-transform duration-500 group-hover:scale-[1.04]"
        />

        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-hairline bg-card/92 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-secondary backdrop-blur">
          {item.phase === 1 ? "Phase 1" : "Phase 2"} · {item.slotLabel}
        </span>

        <span
          className={cn(
            "absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-extrabold",
            VERDICT_STYLE[item.verdict],
          )}
        >
          {VERDICT_LABEL[item.verdict]}
          {item.score !== null && (
            <span className="tabular border-l border-current/25 pl-1.5">{item.score}</span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/product/${item.slug}`}
          className="line-clamp-2 text-[13.5px] font-extrabold leading-snug tracking-[-0.01em] text-headline transition-colors hover:text-[var(--dw-green-mid)]"
        >
          {item.title}
        </Link>

        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
          {item.rationale}
        </p>

        {item.priceCaution && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-red-400/30 bg-red-500/[0.07] px-2.5 py-2 text-[10.5px] font-semibold leading-relaxed text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            <span>{item.priceCaution}</span>
          </p>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="tabular text-[20px] font-extrabold leading-none text-headline">
              {formatINR(item.price)}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[10.5px]">
              {item.mrp ? (
                <>
                  <span className="tabular text-muted line-through">{formatINR(item.mrp)}</span>
                  <span className="font-extrabold text-[var(--dw-green-mid)]">
                    {item.discountPct}% below MRP
                  </span>
                </>
              ) : (
                <span className="text-muted">No MRP recorded</span>
              )}
            </div>
          </div>
          <PriceSpark series={item.spark} width={72} height={26} />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9.5px] font-semibold text-muted">
          <span className="inline-flex items-center gap-1">
            <Database className="h-3 w-3" />
            {item.observationCount} recorded {item.observationCount === 1 ? "price" : "prices"}
          </span>
          <span aria-hidden className="text-hairline-strong">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {freshLabel}
          </span>
          {item.historicalLow !== null && (
            <>
              <span aria-hidden className="text-hairline-strong">·</span>
              <span className="inline-flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                low {formatINR(item.historicalLow)}
              </span>
            </>
          )}
        </div>

        {!item.sufficientHistory && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
              <Sparkles className="h-2.5 w-2.5" /> thin history
            </span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline-soft pt-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[10.5px] font-bold text-secondary">
            <StoreLogo merchant={item.merchant} size={16} />
            {item.merchantName}
          </span>
          <a
            href={item.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:text-[var(--dw-green-top)]"
          >
            Check price
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}
