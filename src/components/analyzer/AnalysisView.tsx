"use client";

import Image from "next/image";
import { useState } from "react";
import { ExternalLink, ShieldCheck, Star } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { merchantMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";
import { FreshnessBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { VerdictPanel } from "./VerdictPanel";
import { PriceChart } from "./PriceChart";
import { LandedPriceCard } from "./LandedPriceCard";
import { StoreCompare } from "./StoreCompare";
import { AlertPanel } from "./AlertPanel";

function freshnessOf(ts: number | null): "LIVE" | "OBSERVED" | "STALE" | "EXPIRED" | "UNKNOWN" {
  if (!ts) return "UNKNOWN";
  const d = Date.now() - ts;
  if (d < 60 * 60 * 1000) return "LIVE";
  if (d < 24 * 60 * 60 * 1000) return "OBSERVED";
  if (d < 3 * 24 * 60 * 60 * 1000) return "STALE";
  return "EXPIRED";
}

export function AnalysisView({ result }: { result: AnalysisResult }) {
  const listing = result.listing!;
  const product = result.product!;
  const meta = merchantMeta[listing.merchant];
  const [imgError, setImgError] = useState(false);
  const image = product.imageUrl || listing.imageUrl;

  const discountPct =
    listing.mrp && listing.price && listing.mrp > listing.price
      ? Math.round(((listing.mrp - listing.price) / listing.mrp) * 100)
      : null;

  return (
    <div className="space-y-8">
      {/* Hero row */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-3xl border border-line bg-surface">
            {image && !imgError ? (
              <Image
                src={image}
                alt={product.title}
                fill
                sizes="(max-width: 1024px) 100vw, 380px"
                className="object-contain p-6"
                onError={() => setImgError(true)}
                unoptimized
              />
            ) : (
              <div className="grid h-full place-items-center text-ink-muted">
                <span className="text-4xl">🛍️</span>
              </div>
            )}
            <div className="absolute left-3 top-3">
              <FreshnessBadge freshness={freshnessOf(listing.lastCheckedAt)} ts={listing.lastCheckedAt} />
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold text-white"
                style={{ background: meta.color }}
              >
                {meta.name}
              </span>
              {listing.rating !== null && (
                <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {listing.rating}
                  {listing.reviewCount ? (
                    <span className="text-ink-muted">({listing.reviewCount.toLocaleString("en-IN")})</span>
                  ) : null}
                </span>
              )}
            </div>

            <div className="mt-4 flex items-end gap-3">
              <span className="tabular text-3xl font-extrabold tracking-tight">
                {formatINR(listing.price)}
              </span>
              {listing.mrp && listing.mrp > (listing.price ?? 0) && (
                <>
                  <span className="tabular text-base text-ink-muted line-through">
                    {formatINR(listing.mrp)}
                  </span>
                  {discountPct !== null && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-300">
                      {discountPct}% off
                    </span>
                  )}
                </>
              )}
            </div>

            {listing.inStock === false && (
              <p className="mt-2 text-xs font-semibold text-red-300">Currently out of stock</p>
            )}

            <ButtonLink href={listing.affiliateUrl} size="lg" className="mt-5 w-full">
              Buy on {meta.name} <ExternalLink className="h-4 w-4" />
            </ButtonLink>
            <p className="mt-2 text-center text-[11px] text-ink-muted">
              Price verified {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt) : "recently"} · confirm
              at checkout
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
              {product.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              {product.brand && <span className="rounded-full border border-line px-2.5 py-1">{product.brand}</span>}
              {product.category && (
                <span className="rounded-full border border-line px-2.5 py-1">{product.category}</span>
              )}
            </div>
          </div>

          {result.verdict && <VerdictPanel verdict={result.verdict} />}

          <div className="rounded-3xl border border-line bg-surface p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">Price history</h3>
            <div className="mt-4">
              <PriceChart
                primary={result.history.primary}
                rival={result.history.rival}
                primaryLabel={meta.name}
                rivalLabel={result.rival ? merchantMeta[result.rival.merchant].name : undefined}
                height={280}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Lower grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {listing.price !== null && (
          <LandedPriceCard base={listing.price} merchant={listing.merchant} />
        )}
        <StoreCompare
          listing={listing}
          rival={result.rival}
          landedEffective={result.landed?.effective ?? listing.price}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,420px)]">
        <div className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink-muted">How we verified this</h3>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-ink-soft">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              We read the live merchant page directly — no estimates, no invented prices.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              Every price point is a real, timestamped observation stored permanently.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              If we lack enough real history, we say &ldquo;not enough data&rdquo; instead of guessing.
            </li>
          </ul>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-5 text-center">
            <div>
              <div className="tabular text-xl font-bold">{result.verdict?.stats.count ?? 0}</div>
              <div className="text-[11px] text-ink-muted">observations</div>
            </div>
            <div>
              <div className="tabular text-xl font-bold">
                {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt).replace(" ago", "") : "—"}
              </div>
              <div className="text-[11px] text-ink-muted">since last check</div>
            </div>
            <div>
              <div className="tabular text-xl font-bold">
                {result.verdict?.confidence ?? "—"}
              </div>
              <div className="text-[11px] text-ink-muted">confidence</div>
            </div>
          </div>
        </div>

        <AlertPanel
          productId={product.id}
          listingId={listing.id}
          currentPrice={listing.price}
          productTitle={product.title}
        />
      </div>
    </div>
  );
}
