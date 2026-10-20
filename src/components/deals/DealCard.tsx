import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Flame, Heart } from "lucide-react";
import type { DealRow } from "@/lib/db/deals";
import { cn, formatINR } from "@/lib/utils";

export function DealCard({ deal }: { deal: DealRow }) {
  const isLow = deal.observations >= 3 && deal.low !== null && deal.price <= deal.low;
  const isBuy = deal.discountPct >= 20;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-hairline bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:shadow-[0_22px_55px_-26px_rgba(16,185,129,0.5)]">
      <Link href={`/product/${deal.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-subtle">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.title}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-contain p-3 transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="grid h-full place-items-center text-2xl text-muted">🛍️</div>
        )}

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

        <span
          className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg text-[8px] font-black text-white shadow-sm"
          style={{ background: deal.storeColor }}
          title={deal.merchant}
        >
          {deal.storeShort}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <Link
          href={`/product/${deal.slug}`}
          className="line-clamp-2 min-h-[2.2rem] text-[12px] font-bold leading-snug text-headline transition-colors hover:text-[var(--dw-green-mid)]"
        >
          {deal.title}
        </Link>

        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold text-muted">
          {deal.rating ? (
            <span className="inline-flex items-center gap-0.5">
              <span className="text-amber-500">★</span>
              {deal.rating}
            </span>
          ) : null}
          <span className="tabular">{deal.observations} pts tracked</span>
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
          className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-btn bg-gradient-brand text-[11.5px] font-extrabold text-white transition-transform hover:-translate-y-0.5"
        >
          Check deal <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}
