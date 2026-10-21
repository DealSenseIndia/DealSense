"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";
import type { DealRow } from "@/lib/db/deals";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { cn, formatINR } from "@/lib/utils";
import { DealCard } from "./DealCard";

export interface Facets {
  priceCaps: { max: number; count: number }[];
  discounts: { min: number; count: number }[];
  stores: { merchant: string; count: number }[];
  categories: { category: string; count: number }[];
  multiStore: number;
}

export function DealGrid({
  deals,
  facets,
  active,
}: {
  deals: DealRow[];
  facets: Facets;
  active: {
    priceMax?: number;
    discountMin?: number;
    store?: string;
    category?: string;
    multiStore?: boolean;
    sort?: string;
  };
}) {
  const router = useRouter();
  const PAGE = 48;
  const [shown, setShown] = useState(PAGE);
  const visible = deals.slice(0, shown);

  // A new filter set starts from the top again.
  useEffect(() => {
    setShown(PAGE);
  }, [deals]);

  function go(params: Record<string, string | number | boolean | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === "" || v === false) continue;
      q.set(k, String(v));
    }
    router.push(`/deals${q.toString() ? `?${q}` : ""}`);
  }

  const hasFilter = !!(
    active.priceMax ||
    active.discountMin ||
    active.store ||
    active.category ||
    active.multiStore ||
    active.sort
  );

  const groups: {
    label: string;
    items: { key: string; label: string; count?: number; color?: string; active: boolean; onClick: () => void }[];
  }[] = [
    {
      label: "Under",
      items: facets.priceCaps
        .filter((f) => f.count > 0)
        .map((f) => ({
          key: `p${f.max}`,
          label: `₹${f.max.toLocaleString("en-IN")}`,
          count: f.count,
          active: active.priceMax === f.max,
          onClick: () => go({ ...active, priceMax: active.priceMax === f.max ? undefined : f.max }),
        })),
    },
    {
      label: "Min off",
      items: facets.discounts
        .filter((f) => f.count > 0)
        .map((f) => ({
          key: `d${f.min}`,
          label: `${f.min}%`,
          count: f.count,
          active: active.discountMin === f.min,
          onClick: () => go({ ...active, discountMin: active.discountMin === f.min ? undefined : f.min }),
        })),
    },
    {
      label: "Store",
      items: facets.stores
        .filter((f) => f.count > 0)
        .map((f) => ({
          key: f.merchant,
          label: f.merchant.charAt(0).toUpperCase() + f.merchant.slice(1),
          count: f.count,
          active: active.store === f.merchant,
          onClick: () => go({ ...active, store: active.store === f.merchant ? undefined : f.merchant }),
        })),
    },
    {
      label: "Category",
      items: facets.categories
        .filter((f) => f.count > 0)
        .slice(0, 12)
        .map((f) => ({
          key: f.category,
          label: f.category,
          count: f.count,
          active: active.category === f.category,
          onClick: () => go({ ...active, category: active.category === f.category ? undefined : f.category }),
        })),
    },
    {
      label: "Compare",
      items: [
        {
          key: "multi",
          label: "Tracked on 2+ stores",
          count: facets.multiStore,
          active: active.multiStore === true,
          onClick: () => go({ ...active, multiStore: active.multiStore ? undefined : "1" }),
        },
      ],
    },
    {
      label: "Sort",
      items: [
        { key: "drop", label: "Biggest drop", active: active.sort === "drop", onClick: () => go({ ...active, sort: active.sort === "drop" ? undefined : "drop" }) },
        { key: "allTimeLow", label: "All-time low", active: active.sort === "allTimeLow", onClick: () => go({ ...active, sort: active.sort === "allTimeLow" ? undefined : "allTimeLow" }) },
        { key: "discount", label: "Biggest discount", active: active.sort === "discount", onClick: () => go({ ...active, sort: active.sort === "discount" ? undefined : "discount" }) },
        { key: "history", label: "Most tracked", active: active.sort === "history", onClick: () => go({ ...active, sort: active.sort === "history" ? undefined : "history" }) },
      ],
    },
  ];

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[236px_1fr]">
      {/* ---- sidebar ---- */}
      <aside className="h-fit rounded-2xl border border-hairline bg-card p-4 shadow-card lg:sticky lg:top-20">
        <div className="mb-3 flex items-center justify-between px-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold text-headline">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </h2>
          {hasFilter && (
            <button
              onClick={() => go({})}
              className="inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--dw-green-mid)] hover:underline"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        <div className="space-y-4">
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.label}>
                <div className="mb-1.5 px-2 text-[10.5px] font-extrabold uppercase tracking-wider text-muted">
                  {g.label}
                </div>
                <div className="space-y-0.5">
                  {g.items.map((i) => (
                    <button
                      key={i.key}
                      onClick={i.onClick}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold transition-colors",
                        i.active
                          ? "bg-[var(--dw-green-surface)] text-[var(--dw-green-mid)]"
                          : "text-body hover:bg-elevated hover:text-headline",
                      )}
                    >
                      {i.color && (
                        <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      {i.count !== undefined && (
                        <span className="tabular shrink-0 text-[10.5px] font-bold text-muted">{i.count}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      </aside>

      {/* ---- grid ---- */}
      <div>
        {deals.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <div className="text-4xl">🌱</div>
            <h2 className="mt-4 text-lg font-extrabold text-headline">Nothing matches those filters</h2>
            <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
              Try widening the price or discount range — we only show products with real recorded
              history.
            </p>
            <button
              onClick={() => go({})}
              className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-brand px-5 text-[12.5px] font-extrabold text-white"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {visible.map((d) => (
                <DealCard key={`${d.slug}-${d.merchant}`} deal={d} />
              ))}
            </div>

            {shown < deals.length ? (
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-[12.5px] font-semibold text-muted">
                  Showing {shown} of {deals.length} products
                </p>
                <button
                  onClick={() => setShown((s) => s + PAGE)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-emerald-600/30 bg-[var(--dw-green-surface)] px-6 text-[13px] font-extrabold text-[var(--dw-green-mid)] transition-all hover:-translate-y-0.5 hover:bg-emerald-600 hover:text-white"
                >
                  Show more products
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="mt-8 text-center text-[12.5px] font-semibold text-muted">
                That&apos;s every product we track.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
