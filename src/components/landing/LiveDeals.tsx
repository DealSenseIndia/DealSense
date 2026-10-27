"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { ProductThumb } from "@/components/ui/ProductThumb";
import { Rating } from "@/components/ui/Rating";
import { PriceSpark } from "@/components/ui/PriceSpark";
import { NextCheckCountdown } from "@/components/ui/NextCheckCountdown";
import { StoreCompareBadge } from "@/components/ui/StoreCompareBadge";
import type { DealRow } from "@/lib/db/deals";
import { storeMeta } from "@/lib/config";
import { cn, formatINR, timeAgo } from "@/lib/utils";

type TabKey = "all" | "lows" | "drops" | "tracked";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "lows", label: "All-time lows" },
  { key: "drops", label: "Biggest drops" },
  { key: "tracked", label: "Most tracked" },
];

const isAllTimeLow = (d: DealRow) => d.low !== null && d.low > 0 && d.price <= d.low * 1.01;

/**
 * "Live deals" — the watchlist, not a hero grid.
 *
 * One row per product: the real rating, the recorded price line, the store
 * that holds it, today's price against its own floor, and the countdown to the
 * next scheduled check. Tabs re-cut the same data instead of inventing
 * sections: every row is a listing with history behind it.
 */
export function LiveDeals({
  deals,
  title = "Live deals",
  viewAllHref = "/deals",
  collapsed = 5,
}: {
  deals: DealRow[];
  title?: string;
  viewAllHref?: string;
  collapsed?: number;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [expanded, setExpanded] = useState(false);

  const sets = useMemo(() => {
    const lows = deals
      .filter(isAllTimeLow)
      .sort((a, b) => a.price / (a.low || 1) - b.price / (b.low || 1));
    const drops = deals
      .filter((d) => d.discountPct >= 10)
      .sort((a, b) => b.discountPct - a.discountPct);
    const tracked = [...deals].sort((a, b) => b.observations - a.observations);
    return { all: deals, lows, drops, tracked } as Record<TabKey, DealRow[]>;
  }, [deals]);

  if (!deals.length) return null;

  const active = sets[tab];
  const rows = expanded ? active : active.slice(0, collapsed);
  const hidden = active.length - rows.length;

  return (
    <section className="py-9">
      <Container size="wide">
        <div className="overflow-hidden rounded-3xl border border-hairline bg-card shadow-card">
          {/* header */}
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hairline px-4 pb-3 pt-4 sm:px-5">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--dw-green-mid)]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Live · {deals.length} tracked
              </span>
              <h2 className="mt-1 flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.03em] text-headline">
                {title}
                <Sparkles className="h-4 w-4 text-[var(--dw-green-mid)]" />
              </h2>
              <p className="mt-0.5 text-[12px] text-secondary">
                Today&apos;s price against each product&apos;s own recorded floor.
              </p>
            </div>
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* tabs */}
          <div className="px-3 pb-3 pt-3 sm:px-5">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-subtle p-1 [scrollbar-width:none]">
              {TABS.map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTab(t.key);
                      setExpanded(false);
                    }}
                    aria-pressed={on}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition-all",
                      on
                        ? "bg-card text-headline shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                        : "text-secondary hover:text-headline",
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 py-0.5 text-[9px] font-extrabold",
                        on
                          ? "bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                          : "bg-card/70 text-muted",
                      )}
                    >
                      {sets[t.key].length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* rows */}
          {rows.length ? (
            <ul className="divide-y divide-hairline border-t border-hairline">
              {rows.map((d) => (
                <li key={d.listingId ?? `${d.slug}-${d.merchant}`}>
                  <Link
                    href={`/product/${d.slug}`}
                    className="group grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/70 sm:grid-cols-[46px_minmax(0,1fr)_104px_auto] sm:gap-4 sm:px-5 lg:grid-cols-[46px_minmax(0,1fr)_112px_120px_150px_112px]"
                  >
                    <div className="relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-xl border border-hairline bg-subtle">
                      <ProductThumb imageUrl={d.imageUrl} alt={d.title} merchant={d.merchant} sizes="46px" />
                    </div>

                    <div className="min-w-0">
                      <div className="line-clamp-2 text-[12.5px] font-bold leading-snug text-headline transition-colors group-hover:text-[var(--dw-green-mid)]">
                        {d.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <Rating rating={d.rating} reviewCount={d.reviewCount} />
                        {d.observations > 1 ? (
                          <span className="text-[10px] font-semibold text-muted">
                            {d.observations} pts
                          </span>
                        ) : null}
                        {isAllTimeLow(d) ? (
                          <span className="rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-[var(--dw-green-mid)]">
                            All-time low
                          </span>
                        ) : d.lastDropAt ? (
                          <span className="text-[10px] font-semibold text-[var(--dw-green-mid)]">
                            dropped {timeAgo(d.lastDropAt)}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted sm:hidden">
                          <StoreLogo merchant={d.merchant} size={11} />
                          {storeMeta(d.merchant).name}
                        </span>
                        <span className="hidden sm:inline">
                          <StoreCompareBadge
                            stores={d.stores}
                            bestStore={d.bestStore}
                            saving={d.storeSaving}
                            compact
                          />
                        </span>
                      </div>
                    </div>

                    {/* recorded line */}
                    <div className="hidden justify-self-start rounded-lg border border-hairline bg-subtle/60 px-1.5 py-1 sm:block">
                      {d.spark.length > 1 ? (
                        <PriceSpark series={d.spark} width={92} height={26} />
                      ) : (
                        <span className="text-[9px] text-muted">no line</span>
                      )}
                    </div>

                    {/* store */}
                    <div className="hidden items-center gap-1.5 lg:flex">
                      <StoreLogo merchant={d.merchant} size={15} />
                      <span className="truncate text-[11px] font-bold text-body">
                        {storeMeta(d.merchant).name}
                      </span>
                    </div>

                    {/* price */}
                    <div className="flex flex-col items-end justify-self-end text-right">
                      <div className="flex items-baseline gap-1.5">
                        <span className="tabular text-[14.5px] font-extrabold tracking-[-0.01em] text-headline">
                          {formatINR(d.price)}
                        </span>
                        {d.discountPct > 0 ? (
                          <span className="rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[9.5px] font-extrabold text-[var(--dw-green-mid)]">
                            {d.discountPct}%
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {d.mrp ? (
                          <span className="tabular text-[10px] text-muted line-through">
                            {formatINR(d.mrp)}
                          </span>
                        ) : null}
                        {d.low !== null && d.low > 0 && !isAllTimeLow(d) ? (
                          <span className="text-[9.5px] font-semibold text-muted">
                            low {formatINR(d.low)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* next check */}
                    <div className="hidden shrink-0 flex-col items-center justify-self-end lg:flex">
                      <span className="mb-0.5 text-[7.5px] font-extrabold uppercase tracking-[0.12em] text-muted">
                        Next check
                      </span>
                      <NextCheckCountdown />
                    </div>

                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="border-t border-hairline px-5 py-10 text-center">
              <p className="text-[13px] font-extrabold text-headline">Nothing in this cut right now</p>
              <p className="mt-1 text-[11.5px] text-secondary">
                The tab only lists products we track with enough recorded history to judge.
              </p>
            </div>
          )}

          {/* footer */}
          <div className="flex items-center justify-between gap-3 border-t border-hairline bg-subtle px-4 py-2.5 sm:px-5">
            {hidden > 0 || expanded ? (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
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
              className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
            >
              See all {deals.length} tracked deals <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
