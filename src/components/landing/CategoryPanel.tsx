import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { Shelf } from "@/lib/db/shelves";
import { STORE_META } from "@/lib/db/shelves";
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
        <div className="flex flex-wrap items-center gap-4">
          <span className="rounded-xl bg-gradient-brand px-4 py-2.5 text-[15px] font-extrabold text-white shadow-[0_10px_26px_-12px_rgba(5,150,105,0.9)]">
            Up to {shelf.maxDiscount}% off
          </span>
          <h2 className="text-[22px] font-extrabold tracking-tight text-headline sm:text-[26px]">
            {shelf.category}
          </h2>
        </div>

        {/* sub filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-secondary">
          {["Top Brands", "Best Deals", "Max Savings"].map((f) => (
            <span key={f} className="inline-flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded bg-emerald-600 text-[7px] font-black text-white">
                d
              </span>
              {f}
            </span>
          ))}
        </div>

        {/* product row */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {shelf.products.map((p) => {
            const store = STORE_META[p.merchant] ?? {
              name: p.merchant,
              short: p.merchant.slice(0, 2).toUpperCase(),
              color: "#64748B",
            };
            return (
              <Link
                key={p.slug}
                href={`/product/${p.slug}`}
                className="group flex flex-col rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.55)]"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.title}
                      fill
                      sizes="(max-width: 640px) 50vw, 200px"
                      className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-2xl text-muted">🛍️</div>
                  )}
                </div>

                <div className="mt-2.5 line-clamp-2 min-h-[2.1rem] text-[11.5px] font-bold leading-snug text-headline">
                  {p.title}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className="grid h-4 w-4 place-items-center rounded text-[7px] font-black text-white"
                    style={{ background: store.color }}
                    title={store.name}
                  >
                    {store.short}
                  </span>
                  <span className="tabular text-[13px] font-extrabold text-headline">
                    {formatINR(p.price)}
                  </span>
                </div>

                {p.discountPct > 0 && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-[var(--dw-green-mid)]">
                    <span className="inline-flex items-center gap-0.5">
                      <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-600 text-[6px] font-black text-white">
                        d
                      </span>
                      {p.discountPct}%
                    </span>
                    {p.mrp && (
                      <span className="tabular font-medium text-muted line-through">
                        ({formatINR(p.mrp)})
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
            href={`/search?q=${encodeURIComponent(shelf.category)}`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-card px-7 text-[13px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:bg-emerald-500 hover:text-white"
          >
            View all {shelf.category} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Horizontal scroll row of category tiles (Buyhatke's "browse categories" strip). */
export function CategoryStrip({
  items,
}: {
  items: { name: string; count: number; emoji: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {items.map((c) => (
        <Link
          key={c.name}
          href={`/search?q=${encodeURIComponent(c.name)}`}
          className="group inline-flex items-center gap-2 rounded-full border border-hairline bg-card px-4 py-2.5 text-[13px] font-bold text-body transition-all hover:-translate-y-0.5 hover:border-emerald-400/50 hover:text-headline"
        >
          <span aria-hidden>{c.emoji}</span>
          {c.name}
          <span className="tabular rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-extrabold text-muted">
            {c.count}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  );
}
