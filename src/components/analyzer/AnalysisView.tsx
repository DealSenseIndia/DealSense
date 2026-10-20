"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Heart,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Zap,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { merchantMeta } from "@/lib/config";
import { cn, formatINR, timeAgo } from "@/lib/utils";
import { FreshnessBadge, Tag } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { PriceChart } from "./PriceChart";
import { LandedPriceCard } from "./LandedPriceCard";
import { AlertPanel } from "./AlertPanel";
import { buildStatCards, StatCards } from "./StatCards";
import { BuyVerdictCard } from "./BuyVerdictCard";

function freshnessOf(ts: number | null) {
  if (!ts) return "UNKNOWN" as const;
  const d = Date.now() - ts;
  if (d < 60 * 60 * 1000) return "LIVE" as const;
  if (d < 24 * 60 * 60 * 1000) return "OBSERVED" as const;
  if (d < 3 * 24 * 60 * 60 * 1000) return "STALE" as const;
  return "EXPIRED" as const;
}

export function AnalysisView({ result }: { result: AnalysisResult }) {
  const listing = result.listing!;
  const product = result.product!;
  const bundle = result.bundle;
  const meta = merchantMeta[listing.merchant];
  const rivalMeta = result.rival ? merchantMeta[result.rival.merchant] : null;
  const [imgError, setImgError] = useState(false);

  const discount =
    listing.mrp && listing.price && listing.mrp > listing.price
      ? Math.round(((listing.mrp - listing.price) / listing.mrp) * 100)
      : null;

  const rivalDiff =
    result.rival?.price != null && listing.price != null ? listing.price - result.rival.price : null;
  const cheaper = rivalDiff === null ? null : rivalDiff < 0 ? listing.merchant : result.rival?.merchant;

  const points = bundle?.points ?? result.history.primary;
  const hasHistory = (bundle?.observationCount ?? 0) >= 3;
  const trackingDays = points.length
    ? Math.max(1, Math.round((Date.now() - points[0].t) / 86400000))
    : 0;
  const potentialSaving =
    bundle?.low !== null && bundle?.low !== undefined && listing.price !== null
      ? Math.max(0, listing.price - bundle.low)
      : null;

  const statCards = buildStatCards({
    current: listing.price,
    low: bundle?.low ?? null,
    high: bundle?.high ?? null,
    median: bundle?.median90 ?? bundle?.median ?? null,
    spark: points.slice(-40).map((p) => p.price),
    hasHistory,
  });

  return (
    <div className="space-y-6">
      {/* ---------- top store pills ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <StorePill
          merchant={listing.merchant}
          price={listing.price}
          inStock={listing.inStock}
          primary
        />
        {result.rival && (
          <StorePill
            merchant={result.rival.merchant}
            price={result.rival.price}
            inStock={null}
          />
        )}
        {cheaper && rivalDiff !== null && rivalDiff !== 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-3 py-1.5 text-[11.5px] font-extrabold text-[var(--dw-green-mid)]">
            <Zap className="h-3.5 w-3.5" />
            {cheaper === listing.merchant ? listing.merchant : rivalMeta?.name} is ₹
            {Math.abs(rivalDiff).toLocaleString("en-IN")} cheaper
          </span>
        )}
        <span className="ml-auto">
          <FreshnessBadge freshness={freshnessOf(listing.lastCheckedAt)} ts={listing.lastCheckedAt} />
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        {/* ---------- left column ---------- */}
        <div className="space-y-4 lg:max-w-[340px]">
          <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl border border-hairline bg-card lg:max-w-none">
            {product.imageUrl && !imgError ? (
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                sizes="(max-width: 1024px) 100vw, 340px"
                className="object-contain p-5"
                onError={() => setImgError(true)}
                unoptimized
              />
            ) : (
              <div className="grid h-full place-items-center text-4xl text-muted">🛍️</div>
            )}
          </div>

          <div className="mx-auto rounded-2xl border border-hairline bg-card p-4 shadow-card lg:mx-0">
            {listing.rating !== null && (
              <div className="mb-2 flex items-center gap-1.5 text-[12.5px]">
                <span className="text-amber-500">★</span>
                <span className="font-bold text-headline">{listing.rating}</span>
                {listing.reviewCount ? (
                  <span className="text-muted">({listing.reviewCount.toLocaleString("en-IN")})</span>
                ) : null}
              </div>
            )}
            <div className="flex items-end gap-2">
              <span className="tabular text-[30px] font-extrabold leading-none tracking-tight text-headline">
                {formatINR(listing.price)}
              </span>
              {listing.mrp && listing.mrp > (listing.price ?? 0) && (
                <span className="tabular text-[14px] text-muted line-through">{formatINR(listing.mrp)}</span>
              )}
            </div>
            {discount !== null && (
              <div className="mt-1.5 text-[12px] font-extrabold text-[var(--dw-green-mid)]">
                {discount}% off
              </div>
            )}
            <ButtonLink
              href={listing.affiliateUrl}
              size="lg"
              variant="gradient"
              className="mt-4 w-full"
            >
              View deal on {meta.name} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <p className="mt-2 text-center text-[10.5px] font-semibold text-muted">
              Verified {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt) : "recently"} · confirm
              at checkout
            </p>
          </div>
        </div>

        {/* ---------- right column ---------- */}
        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {product.brand && (
                <span className="rounded-md border border-hairline bg-subtle px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-secondary">
                  {product.brand}
                </span>
              )}
              {product.category && (
                <span className="rounded-md border border-hairline bg-subtle px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-secondary">
                  {product.category}
                </span>
              )}
            </div>
            <h1 className="text-[21px] font-extrabold leading-snug tracking-[-0.015em] text-headline sm:text-[26px]">
              {product.title}
            </h1>
          </div>

          {/* stat cards */}
          <StatCards cards={statCards} />

          {/* dark buy-verdict card */}
          <BuyVerdictCard
            verdict={result.verdict}
            evidence={bundle?.evidence ?? []}
            currentPrice={listing.price}
            median={bundle?.median90 ?? bundle?.median ?? null}
            trackingDays={trackingDays}
            potentialSaving={potentialSaving}
          />

          {/* chart */}
          <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                Price history
              </h2>
              {bundle && bundle.source !== "none" && (
                <span className="text-[10.5px] font-bold text-muted">
                  Source:{" "}
                  {bundle.source === "external" ? (
                    <a
                      href="https://pricehistory.ai"
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--dw-green-mid)]"
                    >
                      PriceHistory.ai
                    </a>
                  ) : (
                    bundle.sourceLabel
                  )}
                </span>
              )}
            </div>
            <PriceChart
              primary={points}
              rival={result.history.rival}
              primaryLabel={meta.name}
              rivalLabel={rivalMeta?.name}
              primaryColor="#F59E0B"
              rivalColor="#3B82F6"
            />
          </div>

          {/* market context */}
          {bundle?.market && (
            <div className="rounded-2xl border border-hairline bg-subtle p-4">
              <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                Market context
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-body">
                <span className="font-extrabold text-headline">{bundle.market.category}</span> typically
                cost{" "}
                <span className="tabular font-bold text-headline">
                  {formatINR(bundle.market.low)}–{formatINR(bundle.market.high)}
                </span>{" "}
                across {bundle.market.sampleSize} verified listings (median{" "}
                {formatINR(bundle.market.median)}).
              </p>
              {listing.price != null && (
                <p className="mt-1.5 text-[12.5px] font-semibold text-secondary">
                  {listing.price < bundle.market.low
                    ? "This price is below what this category normally costs."
                    : listing.price > bundle.market.high
                      ? "This price is above what this category normally costs."
                      : "This price sits inside the normal range for this category."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- store comparison (Buyhatke style) ---------- */}
      {result.rival && (
        <div className="rounded-3xl border border-hairline bg-card p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-extrabold tracking-tight text-headline">
                Compare & find the lowest price
              </h2>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Same product, verified across stores — including shipping and card offers.
              </p>
            </div>
            {cheaper && rivalDiff !== null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-[12px] font-extrabold text-white">
                <TrendingDown className="h-3.5 w-3.5" />
                You save ₹{Math.abs(rivalDiff).toLocaleString("en-IN")}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StoreRow
              merchant={listing.merchant}
              price={listing.price}
              inStock={listing.inStock}
              rating={listing.rating}
              reviewCount={listing.reviewCount}
              affiliateUrl={listing.affiliateUrl}
              best={cheaper === listing.merchant}
              saving={rivalDiff !== null && rivalDiff < 0 ? Math.abs(rivalDiff) : 0}
              others={rivalDiff !== null && rivalDiff > 0 ? Math.abs(rivalDiff) : 0}
            />
            {result.rival && (
              <StoreRow
                merchant={result.rival.merchant}
                price={result.rival.price}
                inStock={null}
                affiliateUrl={result.rival.affiliateUrl}
                best={cheaper === result.rival.merchant}
                saving={rivalDiff !== null && rivalDiff > 0 ? Math.abs(rivalDiff) : 0}
                others={rivalDiff !== null && rivalDiff < 0 ? Math.abs(rivalDiff) : 0}
              />
            )}
          </div>
        </div>
      )}

      {/* ---------- lower grid ---------- */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr_320px]">
        {listing.price !== null && (
          <LandedPriceCard base={listing.price} merchant={listing.merchant} />
        )}

        <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
            How we know
          </div>
          <ul className="mt-3 space-y-2.5">
            {(bundle?.evidence ?? []).map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                <span className="mt-0.5 shrink-0">
                  {e.kind === "VERIFIED FACT" ? (
                    <Check className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" />
                  ) : (
                    <span className="block h-2 w-2 rounded-full bg-sky-400" />
                  )}
                </span>
                <span className="text-body">
                  <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-muted">
                    [{e.kind}]
                  </span>{" "}
                  {e.text}
                </span>
              </li>
            ))}
          </ul>
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

/* ------------------------------------------------------------------ */

function StorePill({
  merchant,
  price,
  inStock,
  primary,
}: {
  merchant: keyof typeof merchantMeta;
  price: number | null;
  inStock: boolean | null;
  primary?: boolean;
}) {
  const m = merchantMeta[merchant];
  const color = merchant === "amazon" ? "#FF9900" : "#2874F0";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border-2 bg-card px-3 py-1.5 text-[12px] font-bold",
      )}
      style={{ borderColor: color }}
    >
      <span
        className="grid h-5 w-5 place-items-center rounded-md text-[8px] font-black text-white"
        style={{ background: color }}
      >
        {m.short}
      </span>
      <span className="text-headline">{m.name}</span>
      <span className="tabular text-headline">{formatINR(price)}</span>
      {inStock === false && (
        <span className="text-[10.5px] font-extrabold text-[var(--verdict-avoid)]">Out of stock</span>
      )}
      {inStock === true && (
        <span className="text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">In stock</span>
      )}
      {primary && <span className="text-[10px] font-extrabold uppercase text-muted">Primary</span>}
    </span>
  );
}

function StoreRow({
  merchant,
  price,
  inStock,
  rating,
  reviewCount,
  affiliateUrl,
  best,
  saving,
  others,
}: {
  merchant: keyof typeof merchantMeta;
  price: number | null;
  inStock: boolean | null;
  rating?: number | null;
  reviewCount?: number | null;
  affiliateUrl: string;
  best: boolean;
  saving: number;
  others: number;
}) {
  const m = merchantMeta[merchant];
  const color = merchant === "amazon" ? "#FF9900" : "#2874F0";
  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 p-4 transition-shadow",
        best ? "border-brand-400/60 bg-[var(--dw-green-surface)]" : "border-hairline bg-subtle",
      )}
    >
      {best && (
        <span className="absolute -top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
          <Heart className="h-2.5 w-2.5" /> Best deal
        </span>
      )}

      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-black text-white"
          style={{ background: color }}
        >
          {m.short}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-headline">{m.name}</div>
          {rating !== null && rating !== undefined && (
            <div className="flex items-center gap-1 text-[11.5px] font-semibold text-secondary">
              <span className="text-amber-500">★</span> {rating}
              {reviewCount ? (
                <span className="text-muted">({reviewCount.toLocaleString("en-IN")})</span>
              ) : null}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="tabular text-[19px] font-extrabold leading-none text-headline">
            {formatINR(price)}
          </div>
          {inStock === true && (
            <div className="mt-1 text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
              In stock
            </div>
          )}
        </div>
      </div>

      {others > 0 && (
        <div className="mt-3 text-[12px] font-extrabold text-secondary">
          {others.toLocaleString("en-IN")}₹ more than the best store
        </div>
      )}

      <a
        href={affiliateUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={cn(
          "mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-extrabold text-white transition-transform hover:-translate-y-0.5",
        )}
        style={{ background: color }}
      >
        Buy on {m.name} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
