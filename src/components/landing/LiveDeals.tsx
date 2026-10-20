"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
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
 * to the next scheduled price check. Expands in place; "View all" opens
 * the full /deals page.
 */
export function LiveDeals({
  deals,
  title = "Live Deals",
  viewAllHref = "/deals",
  collapsed = 4,
}: {
  deals: DealRow[];
  title?: string;
  viewAllHref?: string;
  collapsed?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!deals.length) return null;

  const rows = expanded ? deals : deals.slice(0, collapsed);
  const hidden = deals.length - rows.length;

  return (
    <section className="py-9">
      <Container size="wide">
        <div className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
          {/* header */}
          <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-[15px] font-extrabold tracking-tight text-headline">{title}</h2>
              <span className="tabular hidden text-[11.5px] font-bold text-muted sm:inline">
                {deals.length} tracked
              </span>
            </div>
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
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
                  className="group grid grid-cols-[auto_1fr] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-subtle sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] sm:gap-4 sm:px-5"
                >
                  {/* thumb */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-hairline bg-subtle sm:h-14 sm:w-14">
                    <ProductThumb
                      imageUrl={d.imageUrl}
                      alt={d.title}
                      merchant={d.merchant}
                      sizes="56px"
                    />
                  </div>

                  {/* title + rating */}
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-extrabold text-headline transition-colors group-hover:text-[var(--dw-green-mid)]">
                      {d.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
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
                    <PriceSpark series={d.spark} width={82} height={26} />
                  </div>

                  {/* store */}
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <StoreLogo merchant={d.merchant} size={16} />
                    <span className="text-[11.5px] font-bold capitalize text-body">{d.merchant}</span>
                  </div>

                  {/* price */}
                  <div className="flex items-baseline justify-end gap-1.5 sm:min-w-[138px] sm:justify-start">
                    <span className="tabular text-[14px] font-extrabold text-headline">
                      {formatINR(d.price)}
                    </span>
                    {d.mrp ? (
                      <span className="tabular hidden text-[10.5px] text-muted line-through sm:inline">
                        {formatINR(d.mrp)}
                      </span>
                    ) : null}
                    {d.discountPct > 0 ? (
                      <span className="rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--dw-green-mid)]">
                        {d.discountPct}% OFF
                      </span>
                    ) : null}
                  </div>

                  {/* countdown */}
                  <div className="hidden shrink-0 flex-col items-center sm:flex">
                    <span className="mb-0.5 text-[8px] font-bold uppercase tracking-wider text-muted">
                      Next check
                    </span>
                    <NextCheckCountdown />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* footer */}
          <div className="flex items-center justify-between gap-3 border-t border-hairline bg-subtle px-4 py-2.5 sm:px-5">
            {hidden > 0 || expanded ? (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" /> Show {hidden} more
                  </>
                )}
              </button>
            ) : (
              <span />
            )}
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              See all {deals.length} live deals <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
