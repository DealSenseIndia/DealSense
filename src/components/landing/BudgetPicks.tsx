"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, BadgeCheck, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { StoreCompareBadge } from "@/components/ui/StoreCompareBadge";
import type { BudgetBand } from "@/lib/db/deals";
import { storeMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";

/**
 * A live, budget-first slice of the catalogue. Every tab is ranked by the
 * same rule: a genuine price against recorded history + a good rating,
 * not just the biggest sticker discount. Rebuilt on every price check.
 */
export function BudgetPicks({ bands }: { bands: BudgetBand[] }) {
  const filled = useMemo(() => bands.filter((b) => b.deals.length > 0), [bands]);
  const [activeId, setActiveId] = useState(filled[0]?.id ?? "");
  const active = filled.find((b) => b.id === activeId) ?? filled[0];
  if (!active) return null;

  return (
    <section className="py-12">
      <Container size="wide">
        <div className="relative overflow-hidden rounded-[28px] border border-hairline bg-panel-wash p-5 sm:p-7 dark:bg-panel-wash-dark">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 select-none text-[200px] font-black leading-none text-emerald-900/[0.04] dark:text-emerald-50/[0.05]"
          >
            ₹
          </span>

          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--dw-green-mid)]">
                  <Wallet className="h-3.5 w-3.5" />
                  Smart picks by budget
                </div>
                <h2 className="mt-2 text-[26px] font-extrabold tracking-[-0.03em] text-headline sm:text-[30px]">
                  Good stuff, at a price you wanted
                </h2>
                <p className="mt-1.5 max-w-[640px] text-[14px] leading-[1.55] text-body">
                  Cheapest strong buys in every band, chosen from all our stores — ranked by
                  recorded price history and real ratings, then refreshed with every price check.
                </p>
              </div>
              <Link
                href="/deals"
                className="text-[13px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
              >
                Compare every deal →
              </Link>
            </div>

            {/* budget tabs */}
            <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-1">
              {filled.map((b) => {
                const isActive = b.id === active.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveId(b.id)}
                    className={
                      isActive
                        ? "inline-flex shrink-0 items-center gap-2 rounded-full bg-gradient-brand px-4 py-2 text-[12.5px] font-extrabold text-white shadow-[0_10px_24px_-14px_rgba(5,150,105,0.9)]"
                        : "inline-flex shrink-0 items-center gap-2 rounded-full border border-hairline bg-card px-4 py-2 text-[12.5px] font-bold text-body transition-all hover:-translate-y-px hover:border-emerald-400/50 hover:text-headline"
                    }
                  >
                    {b.label}
                    <span
                      className={
                        isActive
                          ? "tabular rounded-full bg-white/20 px-1.5 text-[10px] font-bold"
                          : "tabular rounded-full bg-subtle px-1.5 text-[10px] font-semibold text-secondary"
                      }
                    >
                      {b.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* products */}
            <div
              key={active.id}
              className="mt-5 grid animate-rise grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
            >
              {active.deals.map((d) => {
                const atLow =
                  d.low !== null && d.observations >= 3 && d.price <= d.low * 1.01;
                const recentDrop =
                  d.dropAmount !== null &&
                  d.lastDropAt !== null &&
                  Date.now() - d.lastDropAt < 30 * 24 * 60 * 60 * 1000;
                return (
                  <Link
                    key={d.listingId ?? `${d.slug}-${d.merchant}`}
                    href={`/product/${d.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card p-3 shadow-card transition-all hover:-translate-y-1 hover:border-emerald-400/50 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.55)]"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-xl bg-subtle">
                      <ProductThumb
                        imageUrl={d.imageUrl}
                        alt={d.title}
                        merchant={d.merchant}
                        sizes="(max-width: 640px) 50vw, 190px"
                        imageClassName="transition-transform duration-500 group-hover:scale-105"
                      />
                      {atLow ? (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white shadow-sm">
                          <BadgeCheck className="h-2.5 w-2.5" /> Lowest ever
                        </span>
                      ) : recentDrop ? (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[8.5px] font-extrabold text-white shadow-sm">
                          <ArrowDown className="h-2.5 w-2.5" />₹
                          {(d.dropAmount ?? 0).toLocaleString("en-IN")}
                        </span>
                      ) : d.discountPct > 0 ? (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[8.5px] font-extrabold text-white shadow-sm">
                          {d.discountPct}% off
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-snug text-headline">
                      {d.title}
                    </div>
                    <div className="mt-1">
                      <Rating rating={d.rating} reviewCount={d.reviewCount} />
                    </div>
                    {d.stores > 1 ? (
                      <div className="mt-1">
                        <StoreCompareBadge
                          stores={d.stores}
                          bestStore={d.bestStore}
                          saving={d.storeSaving}
                          compact
                        />
                      </div>
                    ) : null}

                    <div className="mt-auto pt-2">
                      <div className="flex items-center gap-1.5">
                        <StoreLogo merchant={d.merchant} size={14} />
                        <span className="text-[10px] font-bold text-muted">
                          {storeMeta(d.merchant).name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="tabular text-[14px] font-extrabold text-headline">
                          {formatINR(d.price)}
                        </span>
                        {d.mrp ? (
                          <span className="tabular text-[10px] font-medium text-muted line-through">
                            {formatINR(d.mrp)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[9.5px] font-semibold text-muted">
                        {atLow
                          ? "lowest price in our record"
                          : recentDrop && d.lastDropAt
                            ? `dropped ${timeAgo(d.lastDropAt)}`
                            : `${d.observations} price points tracked`}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
              <p className="text-[11.5px] font-semibold text-muted">
                Ranked on price against each product&apos;s own recorded history — never on a
                store&apos;s printed MRP alone.
              </p>
              <Link
                href={active.max ? `/deals?priceMax=${active.max}` : "/deals"}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-card px-4 py-2 text-[12px] font-extrabold text-[var(--dw-green-mid)] transition-colors hover:bg-emerald-500 hover:text-white"
              >
                See all {active.label.toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
