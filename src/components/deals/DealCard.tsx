import Link from "next/link";
import { ArrowUpRight, Flame, Heart } from "lucide-react";
import type { DealRow } from "@/lib/db/deals";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { PriceSpark } from "@/components/ui/PriceSpark";
import { StoreCompareBadge } from "@/components/ui/StoreCompareBadge";
import { cn, formatINR } from "@/lib/utils";

export function DealCard({ deal }: { deal: DealRow }) {
  const isLow = deal.observations >= 3 && deal.low !== null && deal.price <= deal.low;
  const isBuy = deal.discountPct >= 20;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-[0_22px_55px_-26px_rgba(16,185,129,0.5)]">
      <Link href={`/product/${deal.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-subtle">
        <ProductThumb
          imageUrl={deal.imageUrl}
          alt={deal.title}
          merchant={deal.merchant}
          sizes="(max-width: 640px) 50vw, 240px"
          padding="p-3"
          imageClassName="transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {isBuy && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-brand px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
              <Heart className="h-2.5 w-2.5" /> Hot
            </span>
          )}
          {isLow && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">
              <Flame className="h-2.5 w-2.5" /> All-time low
            </span>
          )}
        </div>

        <StoreLogo
          merchant={deal.merchant}
          size={22}
          className="absolute right-2 top-2 rounded-md shadow-sm"
        />
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link
          href={`/product/${deal.slug}`}
          className="line-clamp-2 min-h-[2.2rem] text-[12px] font-bold leading-snug text-headline transition-colors hover:text-[var(--dw-green-mid)]"
        >
          {deal.title}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Rating rating={deal.rating} reviewCount={deal.reviewCount} />
          <span className="tabular text-[10px] font-bold text-muted">
            {deal.observations} pts tracked
          </span>
        </div>

        <div className="mt-1.5">
          <StoreCompareBadge
            stores={deal.stores}
            bestStore={deal.bestStore}
            saving={deal.storeSaving}
            compact
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <PriceSpark series={deal.spark} width={82} height={26} />
          {deal.observations > 1 ? (
            <span className="tabular text-[9.5px] font-semibold text-muted">
              low {formatINR(deal.low)}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2.5">
          <div>
            <div className="tabular text-[17px] font-extrabold leading-none text-headline">
              {formatINR(deal.price)}
            </div>
            {deal.mrp && deal.mrp > deal.price && (
              <div className="tabular mt-1 text-[10.5px] text-muted line-through">
                {formatINR(deal.mrp)}
              </div>
            )}
          </div>
          {deal.discountPct > 0 && (
            <div className="text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
              {deal.discountPct}% off
            </div>
          )}
        </div>

        <a
          href={deal.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="btn-cta mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-btn text-[11.5px] font-extrabold"
        >
          Check deal <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}
