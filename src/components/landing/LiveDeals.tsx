import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { PriceSpark } from "@/components/ui/PriceSpark";
import { NextCheckCountdown } from "@/components/ui/NextCheckCountdown";
import type { DealRow } from "@/lib/db/deals";
import { cn, formatINR, timeAgo } from "@/lib/utils";

/**
 * "Live Deals" — the compact feed panel. One row per product, with the
 * real rating, the real price-history graph, the store, and a live countdown
 * to the next scheduled price check. "View all" opens the full /deals page.
 */
export function LiveDeals({
  deals,
  title = "Live Deals",
  viewAllHref = "/deals",
  limit = 6,
}: {
  deals: DealRow[];
  title?: string;
  viewAllHref?: string;
  limit?: number;
}) {
  const rows = deals.slice(0, limit);
  if (!rows.length) return null;

  return (
    <section className="py-12">
      <Container size="wide">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
          {/* header */}
          <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-[17px] font-extrabold tracking-tight text-headline">{title}</h2>
              <span className="tabular hidden text-[12px] font-bold text-muted sm:inline">
                {deals.length} tracked
              </span>
            </div>
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* rows */}
          <ul className="divide-y divide-hairline">
            {rows.map((d) => (
              <li key={`${d.slug}-${d.merchant}`}>
                <Link
                  href={`/product/${d.slug}`}
                  className="group grid grid-cols-[auto_1fr] items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] sm:gap-4 sm:px-5"
                >
                  {/* thumb */}
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-hairline bg-subtle sm:h-16 sm:w-16">
                    <ProductThumb
                      imageUrl={d.imageUrl}
                      alt={d.title}
                      merchant={d.merchant}
                      sizes="64px"
                    />
                  </div>

                  {/* title + rating */}
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-extrabold text-headline transition-colors group-hover:text-[var(--dw-green-mid)]">
                      {d.title}
                    </div>
                    {d.category ? (
                      <div className="mt-0.5 truncate text-[11.5px] text-muted">{d.category}</div>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Rating rating={d.rating} reviewCount={d.reviewCount} />
                      {d.observations > 1 ? (
                        <span className="text-[10.5px] font-semibold text-muted">
                          {d.observations} pts tracked
                        </span>
                      ) : null}
                      {d.lastDropAt ? (
                        <span className="text-[10.5px] font-semibold text-[var(--dw-green-mid)]">
                          dropped {timeAgo(d.lastDropAt)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* price history graph */}
                  <div className="hidden sm:block">
                    <PriceSpark series={d.spark} width={92} height={30} />
                  </div>

                  {/* store */}
                  <div className="hidden items-center gap-2 sm:flex">
                    <StoreLogo merchant={d.merchant} size={18} />
                    <span className="text-[12px] font-bold capitalize text-body">{d.merchant}</span>
                  </div>

                  {/* price */}
                  <div className="flex items-baseline justify-end gap-1.5 sm:min-w-[150px] sm:justify-start">
                    <span className="tabular text-[15px] font-extrabold text-headline">
                      {formatINR(d.price)}
                    </span>
                    {d.mrp ? (
                      <span className="tabular hidden text-[11px] text-muted line-through sm:inline">
                        {formatINR(d.mrp)}
                      </span>
                    ) : null}
                    {d.discountPct > 0 ? (
                      <span
                        className={cn(
                          "rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10.5px] font-extrabold text-[var(--dw-green-mid)]",
                        )}
                      >
                        {d.discountPct}% OFF
                      </span>
                    ) : null}
                  </div>

                  {/* countdown */}
                  <div className="hidden shrink-0 flex-col items-center sm:flex">
                    <span className="mb-1 text-[8.5px] font-bold uppercase tracking-wider text-muted">
                      Next check
                    </span>
                    <NextCheckCountdown />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* footer */}
          <div className="border-t border-hairline bg-subtle px-5 py-3">
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              See all {deals.length} live deals <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
