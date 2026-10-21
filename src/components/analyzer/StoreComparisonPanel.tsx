import Link from "next/link";
import { ArrowUpRight, Check, Crown, Truck, Wallet } from "lucide-react";
import { StoreLogo } from "@/components/ui/StoreLogo";
import { Rating } from "@/components/ui/Rating";
import type { StoreComparison, StoreOffer } from "@/lib/db/compare";
import { cn, formatINR, timeAgo } from "@/lib/utils";

/**
 * Compare the price of this exact product across every store we track it in,
 * priced end to end — delivery, coupon and the best card offer included — so
 * the best place to buy is obvious.
 */
export function StoreComparisonPanel({
  comparison,
  primaryListingId,
}: {
  comparison: StoreComparison;
  primaryListingId: string;
}) {
  const { offers, best, spread, storesCompared } = comparison;

  if (offers.length < 1) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-4">
        <div>
          <h2 className="text-[17px] font-extrabold tracking-tight text-headline">
            Compare store prices
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {storesCompared > 1
              ? `We track this product in ${storesCompared} stores. These are the prices you actually pay.`
              : "We track this product in one store so far. Add the same product on another store and we will compare them."}
          </p>
        </div>
        {best && storesCompared > 1 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dw-green-surface)] px-3 py-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
            <Crown className="h-3.5 w-3.5" />
            Save {formatINR(spread)} at {best.merchantName}
          </span>
        ) : null}
      </div>

      <div className="p-5">
        <div className="space-y-3">
          {offers.map((o) => (
            <OfferRow
              key={o.listingId}
              offer={o}
              primary={o.listingId === primaryListingId}
            />
          ))}
        </div>

        {best && storesCompared > 1 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-4 py-3">
            <Check className="h-4 w-4 shrink-0 text-[var(--dw-green-mid)]" />
            <p className="text-[12.5px] font-semibold text-body">
              Buy it on{" "}
              <strong className="text-headline">{best.merchantName}</strong> and you pay{" "}
              <strong className="text-headline">{formatINR(best.landed)}</strong> —{" "}
              {formatINR(spread)} less than the most expensive store.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OfferRow({ offer, primary }: { offer: StoreOffer; primary: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border p-3.5 transition-colors sm:flex-nowrap sm:gap-4",
        offer.isBest
          ? "border-[var(--dw-green-border)] bg-[var(--dw-green-surface)]"
          : "border-hairline bg-subtle",
      )}
    >
      {/* store */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <StoreLogo merchant={offer.merchant} size={30} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-extrabold text-headline">
              {offer.merchantName}
            </span>
            {offer.isBest ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
                <Crown className="h-2.5 w-2.5" /> Best price
              </span>
            ) : null}
            {primary ? (
              <span className="rounded-full border border-hairline bg-card px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-muted">
                You are here
              </span>
            ) : null}
            {offer.extraListings > 0 ? (
              <span className="rounded-full border border-hairline bg-card px-2 py-0.5 text-[9.5px] font-bold text-muted">
                +{offer.extraListings} more here
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
            <Rating rating={offer.rating} reviewCount={offer.reviewCount} />
            <span className="text-[10.5px] font-semibold text-muted">
              {offer.lastCheckedAt ? `Checked ${timeAgo(offer.lastCheckedAt)}` : "From history"}
            </span>
          </div>
        </div>
      </div>

      {/* price breakdown */}
      <div className="flex items-center gap-4 sm:justify-end">
        <div className="text-right">
          <div className="tabular text-[17px] font-extrabold leading-none text-headline">
            {formatINR(offer.landed)}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {offer.mrp ? (
              <span className="tabular text-[10.5px] text-muted line-through">
                {formatINR(offer.mrp)}
              </span>
            ) : null}
            {offer.discountPct > 0 ? (
              <span className="text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
                {offer.discountPct}% off
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[9.5px] font-semibold text-muted">
            {offer.shipping > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Truck className="h-2.5 w-2.5" /> +{formatINR(offer.shipping)} delivery
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Truck className="h-2.5 w-2.5" /> free delivery
              </span>
            )}
            {offer.bankDiscount > 0 ? (
              <span className="inline-flex items-center gap-1 text-[var(--dw-green-mid)]">
                <Wallet className="h-2.5 w-2.5" /> −{formatINR(offer.bankDiscount)} card
              </span>
            ) : null}
          </div>
        </div>

        <a
          href={offer.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[12px] font-extrabold transition-all hover:-translate-y-0.5",
            offer.isBest
              ? "bg-emerald-600 text-white"
              : "border border-hairline bg-card text-headline hover:border-emerald-400/60",
          )}
        >
          Buy
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
