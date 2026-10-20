"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import type { DealRow } from "@/lib/db/deals";
import { cn, formatINR } from "@/lib/utils";
import { DealCard } from "./DealCard";

export interface Facets {
  priceCaps: { max: number; count: number }[];
  discounts: { min: number; count: number }[];
  stores: { merchant: string; count: number }[];
  categories: { category: string; count: number }[];
}

export function DealGrid({
  deals,
  facets,
  active,
  storeMeta,
}: {
  deals: DealRow[];
  facets: Facets;
  active: {
    priceMax?: number;
    discountMin?: number;
    store?: string;
    category?: string;
    sort?: string;
  };
  storeMeta: Record<string, { name: string; short: string; color: string }>;
}) {
  const router = useRouter();

  function go(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
    router.push(`/deals${q.toString() ? `?${q}` : ""}`);
  }

  const hasFilter =
    active.priceMax || active.discountMin || active.store || active.category || active.sort;

  return (
    <div className="mt-8">
      {/* filter bar */}
      <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
        <div className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wider text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </div>

        <div className="mt-3 space-y-3">
          <FilterRow
            label="Under"
            items={facets.priceCaps
              .filter((f) => f.count > 0)
              .map((f) => ({
                key: `p${f.max}`,
                label: `₹${f.max.toLocaleString("en-IN")}`,
                count: f.count,
                active: active.priceMax === f.max,
                onClick: () => go({ ...active, priceMax: active.priceMax === f.max ? undefined : String(f.max) }),
              }))}
          />
          <FilterRow
            label="Min off"
            items={facets.discounts
              .filter((f) => f.count > 0)
              .map((f) => ({
                key: `d${f.min}`,
                label: `${f.min}%`,
                count: f.count,
                active: active.discountMin === f.min,
                onClick: () =>
                  go({ ...active, discountMin: active.discountMin === f.min ? undefined : String(f.min) }),
              }))}
          />
          <FilterRow
            label="Store"
            items={facets.stores
              .filter((f) => f.count > 0)
              .map((f) => ({
                key: f.merchant,
                label: storeMeta[f.merchant]?.name ?? f.merchant,
                color: storeMeta[f.merchant]?.color,
                count: f.count,
                active: active.store === f.merchant,
                onClick: () => go({ ...active, store: active.store === f.merchant ? undefined : f.merchant }),
              }))}
          />
          <FilterRow
            label="Category"
            items={facets.categories
              .filter((f) => f.count > 0)
              .slice(0, 12)
              .map((f) => ({
                key: f.category,
                label: f.category,
                count: f.count,
                active: active.category === f.category,
                onClick: () =>
                  go({ ...active, category: active.category === f.category ? undefined : f.category }),
              }))}
          />
          <FilterRow
            label="Sort"
            items={[
              { key: "drop", label: "Biggest drop", active: active.sort === "drop", onClick: () => go({ ...active, sort: active.sort === "drop" ? undefined : "drop" }) },
              { key: "allTimeLow", label: "All-time low", active: active.sort === "allTimeLow", onClick: () => go({ ...active, sort: active.sort === "allTimeLow" ? undefined : "allTimeLow" }) },
              { key: "discount", label: "Biggest discount", active: active.sort === "discount", onClick: () => go({ ...active, sort: active.sort === "discount" ? undefined : "discount" }) },
              { key: "history", label: "Most tracked", active: active.sort === "history", onClick: () => go({ ...active, sort: active.sort === "history" ? undefined : "history" }) },
            ]}
          />
        </div>

        {hasFilter && (
          <button
            onClick={() => go({})}
            className="mt-4 text-[12px] font-extrabold text-[var(--dw-green-mid)] hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* grid */}
      {deals.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-hairline bg-subtle p-12 text-center">
          <div className="text-4xl">🌱</div>
          <h2 className="mt-4 text-lg font-extrabold text-headline">Nothing matches those filters</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
            Try widening the price or discount range — DealSense only shows products with real
            recorded history.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {deals.map((d) => (
            <DealCard key={d.slug} deal={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({
  label,
  items,
}: {
  label: string;
  items: {
    key: string;
    label: string;
    count?: number;
    color?: string;
    active: boolean;
    onClick: () => void;
  }[];
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-[11.5px] font-bold text-muted">{label}</span>
      {items.map((i) => (
        <button
          key={i.key}
          onClick={i.onClick}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-all",
            i.active
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-hairline bg-card text-body hover:border-emerald-400/60 hover:text-headline",
          )}
        >
          {i.color && (
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: i.active ? "#fff" : i.color }}
            />
          )}
          {i.label}
          {i.count !== undefined && (
            <span
              className={cn(
                "tabular rounded-full px-1.5 text-[9.5px] font-extrabold",
                i.active ? "bg-white/20" : "bg-elevated text-muted",
              )}
            >
              {i.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
