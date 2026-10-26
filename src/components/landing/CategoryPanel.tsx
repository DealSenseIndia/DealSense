import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import type { Shelf } from "@/lib/db/shelves";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { cn, formatINR } from "@/lib/utils";

/**
 * Buyhatke-style category panel: a soft gradient card with a "Up to N% off"
 * badge, the category title, three sub-filters and a row of products.
 */
export function CategoryPanel({ shelf }: { shelf: Shelf }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-hairline bg-panel-wash p-5 sm:p-7 dark:bg-panel-wash-dark">
      {/* oversized watermark */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-4 top-0 select-none text-[180px] font-black leading-none text-emerald-900/[0.05] dark:text-emerald-50/[0.06]"
      >
        d
      </span>

      <div className="relative">
        {/* badge + title */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl bg-gradient-brand px-3.5 py-2 text-[14px] font-extrabold text-white shadow-[0_10px_26px_-12px_rgba(5,150,105,0.9)]">
            {shelf.maxDiscount > 0 ? `Up to ${shelf.maxDiscount}% off` : "Live picks"}
          </span>
          <h2 className="text-[21px] font-extrabold tracking-tight text-headline sm:text-[25px]">
            {shelf.category}
          </h2>
          <span className="text-[11.5px] font-bold text-muted">
            cheapest strong buys across our stores
          </span>
        </div>

        {/* product row */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {shelf.products.map((p) => {
            return (
              <Link
                key={p.listingId ?? `${p.slug}-${p.merchant}`}
                href={`/product/${p.slug}`}
                className="group flex flex-col rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.55)]"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                  <ProductThumb
                    imageUrl={p.imageUrl}
                    alt={p.title}
                    merchant={p.merchant}
                    sizes="(max-width: 640px) 50vw, 200px"
                    imageClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                  {p.atLow ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                      <BadgeCheck className="h-2.5 w-2.5" /> Lowest ever
                    </span>
                  ) : null}
                </div>

                <div className="mt-2.5 line-clamp-2 min-h-[2.1rem] text-[11.5px] font-bold leading-snug text-headline">
                  {p.title}
                </div>

                <div className="mt-1">
                  <Rating rating={p.rating} reviewCount={p.reviewCount} />
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <StoreLogo merchant={p.merchant} size={16} />
                  <span className="tabular text-[13px] font-extrabold text-headline">
                    {formatINR(p.price)}
                  </span>
                </div>

                {p.discountPct > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[var(--dw-green-mid)]">
                    {p.discountPct}%
                    {p.mrp && (
                      <span className="tabular font-medium text-muted line-through">
                        {formatINR(p.mrp)}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href={`/deals?category=${encodeURIComponent(shelf.category)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-card px-6 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:bg-emerald-500 hover:text-white"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Horizontal scroll row of category tiles. */
export function CategoryStrip({
  items,
}: {
  items: { name: string; count: number; emoji: string }[];
}) {
  return (
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
      {items.map((c) => (
        <Link
          key={c.name}
          href={`/search?q=${encodeURIComponent(c.name)}`}
          title={`${c.count} products`}
          className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-card px-3.5 py-2 text-[12.5px] font-bold text-body transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:text-headline"
        >
          <span aria-hidden className="text-[15px] leading-none">
            {c.emoji}
          </span>
          {c.name}
        </Link>
      ))}
    </div>
  );
}
