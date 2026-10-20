"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, RefreshCw, TrendingDown, Trophy, Zap } from "lucide-react";
import type { DealItem } from "@/lib/engine/deals";
import { DealCard } from "@/components/deals/DealCard";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

type Filter =
  | "all"
  | "steep"
  | "low"
  | "score85"
  | "under999"
  | "phones"
  | "laptops"
  | "audio"
  | "tv"
  | "wearables";

const FILTERS: { id: Filter; label: string; icon?: React.ReactNode }[] = [
  { id: "all", label: "All Drops", icon: <Flame className="h-3.5 w-3.5" /> },
  { id: "steep", label: "Steep Drops", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  { id: "low", label: "All-Time Lows", icon: <Trophy className="h-3.5 w-3.5" /> },
  { id: "score85", label: "Score 85+", icon: <Zap className="h-3.5 w-3.5" /> },
  { id: "phones", label: "Mobiles & 5G" },
  { id: "laptops", label: "Laptops" },
  { id: "audio", label: "Audio & ANC" },
  { id: "tv", label: "4K Smart TVs" },
  { id: "wearables", label: "Smartwatches" },
  { id: "under999", label: "Under ₹999" },
];

const CAT_MAP: Record<string, RegExp> = {
  phones: /smartphone|mobile|phone/i,
  laptops: /laptop|notebook|computer/i,
  audio: /audio|headphone|earbud|speaker/i,
  tv: /television|\btv\b/i,
  wearables: /wearable|watch/i,
};

export function DealsSection({ deals }: { deals: DealItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "steep":
        return deals.filter((d) => d.verdict.genuineDiscountPct !== null && d.verdict.genuineDiscountPct >= 8);
      case "low":
        return deals.filter(
          (d) => d.observationCount >= 3 && d.verdict.stats.low !== null && d.price <= d.verdict.stats.low,
        );
      case "score85":
        return deals.filter((d) => (d.verdict.score ?? 0) >= 85);
      case "under999":
        return deals.filter((d) => d.price < 999);
      default:
        if (CAT_MAP[filter]) return deals.filter((d) => CAT_MAP[filter].test(d.category ?? d.title));
        return deals;
    }
  }, [deals, filter]);

  const buyCount = deals.filter((d) => d.verdict.verdict === "BUY").length;

  return (
    <section className="relative py-12" id="deals">
      <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
            <span className="h-1.5 w-1.5 animate-pulse-ring rounded-full bg-emerald-500" />
            Live Price Tracker · Updated Hourly
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-extrabold tracking-tight text-headline sm:text-[34px]">
              🔥 Today&apos;s Biggest Price Drops
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-body">
              Real, verified price drops across Amazon and Flipkart. Track genuine price history and
              spot fake discounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-hairline bg-card px-3 py-2 text-[12.5px] font-bold text-secondary">
              <span className="tabular text-headline">{deals.length}</span> Products Found
            </span>
            <ButtonLink href="/analyze" variant="outline" size="sm">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Live Prices
            </ButtonLink>
          </div>
        </div>

        {/* filters */}
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-bold transition-all",
                  active
                    ? "border-emerald-accent bg-emerald-accent text-white shadow-[0_6px_16px_-8px_rgba(16,185,129,0.9)]"
                    : "border-hairline bg-card text-body hover:-translate-y-0.5 hover:border-emerald-accent/50 hover:text-headline",
                )}
              >
                {f.icon}
                {f.label}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-hairline bg-subtle p-12 text-center">
            <div className="text-4xl">🌱</div>
            <h3 className="mt-4 text-lg font-extrabold text-headline">Nothing here yet</h3>
            <p className="mx-auto mt-2 max-w-md text-[13.5px] text-body">
              DealSense only shows real, verified observations. This filter has no matching products
              yet — try another filter or track a product to start building history.
            </p>
            <ButtonLink href="/analyze" className="mt-6">
              Analyze a product
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((d, i) => (
              <DealCard key={d.listingId} deal={d} index={i} />
            ))}
          </div>
        )}

        {buyCount > 0 && (
          <p className="mt-6 text-center text-[13px] text-secondary">
            <span className="tabular font-extrabold text-[var(--dw-green-mid)]">{buyCount}</span> of these
            are verified <span className="font-extrabold text-headline">BUY NOW</span> deals right now.
          </p>
        )}
      </div>
    </section>
  );
}
