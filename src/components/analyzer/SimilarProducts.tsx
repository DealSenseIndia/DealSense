import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { PriceSpark } from "@/components/ui/PriceSpark";
import type { SimilarProduct } from "@/lib/db/similar";
import { formatINR } from "@/lib/utils";

/**
 * Products close to this one, from our own catalogue — same brand, same
 * category, and every one of them has real recorded price history.
 */
export function SimilarProducts({ products }: { products: SimilarProduct[] }) {
  if (!products.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-4">
        <div>
          <h2 className="text-[17px] font-extrabold tracking-tight text-headline">
            Similar products
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Same brand or same category — every one with a recorded price history.
          </p>
        </div>
        <Link
          href="/deals"
          className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
        >
          Browse all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <Link
            key={p.slug}
            href={p.href}
            className="group flex flex-col overflow-hidden rounded-xl border border-hairline bg-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-lift"
          >
            <div className="relative aspect-square overflow-hidden bg-subtle">
              <ProductThumb
                imageUrl={p.imageUrl}
                alt={p.title}
                merchant={p.merchant}
                sizes="(max-width: 640px) 50vw, 240px"
                padding="p-3"
                imageClassName="transition-transform duration-500 group-hover:scale-105"
              />
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                <Sparkles className="h-2.5 w-2.5" />
                {p.reason}
              </span>
            </div>

            <div className="flex flex-1 flex-col p-3">
              <div className="line-clamp-2 min-h-[2rem] text-[11.5px] font-bold leading-snug text-headline transition-colors group-hover:text-[var(--dw-green-mid)]">
                {p.title}
              </div>

              <div className="mt-1.5">
                <Rating rating={p.rating} reviewCount={p.reviewCount} />
              </div>

              {p.spark.length > 1 ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <PriceSpark series={p.spark} width={72} height={22} />
                  <span className="text-[9.5px] font-semibold text-muted">
                    {p.observations} pts
                  </span>
                </div>
              ) : null}

              <div className="mt-auto pt-2.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="tabular text-[14px] font-extrabold text-headline">
                    {formatINR(p.price)}
                  </span>
                  {p.mrp ? (
                    <span className="tabular text-[10.5px] text-muted line-through">
                      {formatINR(p.mrp)}
                    </span>
                  ) : null}
                  {p.discountPct > 0 ? (
                    <span className="text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
                      {p.discountPct}% off
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <StoreLogo merchant={p.merchant} size={14} />
                  <span className="text-[10.5px] font-semibold capitalize text-muted">
                    {p.merchant}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
