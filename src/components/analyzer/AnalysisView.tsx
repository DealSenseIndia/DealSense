"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowRight, Check, ExternalLink, ShieldCheck, Sparkles, Zap } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { merchantMeta } from "@/lib/config";
import { cn, formatINR, timeAgo } from "@/lib/utils";
import { FreshnessBadge, Tag, VerdictBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { PriceChart } from "./PriceChart";
import { LandedPriceCard } from "./LandedPriceCard";
import { AlertPanel } from "./AlertPanel";

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
  const cheaper =
    rivalDiff === null ? null : rivalDiff < 0 ? listing.merchant : result.rival?.merchant;

  return (
    <div className="space-y-6">
      {/* ---------- top: store pills + cheaper badge ---------- */}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr_300px]">
        {/* ---------- left: image + buy ---------- */}
        <div className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-hairline bg-card">
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

          <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
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
              <div className="mt-1.5 text-[12px] font-extrabold text-[var(--dw-green-mid)]">{discount}% off</div>
            )}
            <ButtonLink href={listing.affiliateUrl} size="lg" className="mt-4 w-full">
              View on {meta.name} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <p className="mt-2 text-center text-[10.5px] font-semibold text-muted">
              Verified {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt) : "recently"} · confirm at
              checkout
            </p>
          </div>
        </div>

        {/* ---------- center: title + chart + stats ---------- */}
        <div className="space-y-5">
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
            <h1 className="text-[22px] font-extrabold leading-snug tracking-tight text-headline sm:text-[26px]">
              {product.title}
            </h1>
          </div>

          {result.verdict && (
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={result.verdict.verdict} />
              {result.verdict.score !== null && (
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-secondary">
                  <span className="tabular rounded-md bg-elevated px-2 py-1 text-headline">
                    {result.verdict.score}/100
                  </span>
                  {result.verdict.confidence.toLowerCase()} confidence
                </span>
              )}
              {bundle && (
                <span className="text-[11.5px] font-semibold text-muted">
                  {bundle.observationCount} verified observation
                  {bundle.observationCount === 1 ? "" : "s"}
                  {bundle.source !== "own" && ` · ${bundle.sourceLabel}`}
                </span>
              )}
            </div>
          )}

          {/* chart */}
          <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                Price History
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
                      title="Historical price data sourced from PriceHistory.ai and cached by DealSense"
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
              primary={bundle?.points.length ? bundle.points : result.history.primary}
              rival={result.history.rival}
              primaryLabel={meta.name}
              rivalLabel={rivalMeta?.name}
              primaryColor="#F59E0B"
              rivalColor="#3B82F6"
            />
          </div>

          {/* stat tiles */}
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Lowest observed"
              value={formatINR(bundle?.low ?? null)}
              tag={bundle?.source === "cross_store" ? "Other store" : undefined}
              tone="brand"
            />
            <StatTile label="Typical price" value={formatINR(bundle?.median90 ?? bundle?.median ?? null)} tag="Benchmark" tone="blue" />
            <StatTile label="Highest observed" value={formatINR(bundle?.high ?? null)} />
            <StatTile
              label="Price drops"
              value={String(result.verdict?.stats.count ?? 0)}
              tag="Observations"
              tone="amber"
            />
          </div>

          {/* market context — the "describe the product better" layer */}
          {bundle?.market && (
            <div className="rounded-2xl border border-hairline bg-subtle p-4">
              <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                <Sparkles className="h-3.5 w-3.5 text-emerald-accent" />
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

          {/* store comparison table */}
          {result.rival && (
            <div className="overflow-hidden rounded-2xl border border-hairline bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <div>
                  <h3 className="text-[13px] font-extrabold text-headline">Live Store Comparison</h3>
                  <p className="text-[11.5px] text-muted">Direct comparison across stores</p>
                </div>
                {cheaper && rivalDiff !== null && (
                  <span className="rounded-full border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-2.5 py-1 text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">
                    {cheaper === listing.merchant ? meta.name : rivalMeta?.name} cheaper
                  </span>
                )}
              </div>
              <div className="divide-y divide-[var(--border-subtle)]">
                <StoreRow
                  merchant={listing.merchant}
                  price={listing.price}
                  inStock={listing.inStock}
                  rating={listing.rating}
                  reviewCount={listing.reviewCount}
                  affiliateUrl={listing.affiliateUrl}
                  primary
                />
                {result.rival && (
                  <StoreRow
                    merchant={result.rival.merchant}
                    price={result.rival.price}
                    inStock={null}
                    affiliateUrl={result.rival.affiliateUrl}
                  />
                )}
              </div>
              {rivalDiff !== null && rivalDiff !== 0 && (
                <div className="flex items-center justify-between bg-subtle px-4 py-2.5 text-[12px] font-bold">
                  <span className="text-secondary">
                    Price difference:{" "}
                    <span className="tabular text-[var(--dw-green-mid)]">
                      ₹{Math.abs(rivalDiff).toLocaleString("en-IN")} cheaper on{" "}
                      {cheaper === listing.merchant ? meta.name : rivalMeta?.name}
                    </span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------- right: verdict + evidence + alert ---------- */}
        <div className="space-y-4">
          {result.verdict && <VerdictCard result={result} />}

          {bundle && bundle.evidence.length > 0 && (
            <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-accent" />
                How we know
              </div>
              <ul className="space-y-2.5">
                {bundle.evidence.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed">
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
          )}

          <AlertPanel
            productId={product.id}
            listingId={listing.id}
            currentPrice={listing.price}
            productTitle={product.title}
          />
        </div>
      </div>

      {listing.price !== null && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
          <LandedPriceCard base={listing.price} merchant={listing.merchant} />
          <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
            <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-accent" />
              Our one rule
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-body">
              We never show you a fake deal. Every price here is a real, timestamped observation. If we
              don&apos;t have enough history yet, we say so instead of inventing a chart.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 border-t border-hairline pt-4 text-[12px]">
              <span className="text-muted">
                <span className="tabular font-extrabold text-headline">
                  {bundle?.observationCount ?? 0}
                </span>{" "}
                observations
              </span>
              <span className="text-muted">
                <span className="tabular font-extrabold text-headline">
                  {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt).replace(" ago", "") : "—"}
                </span>{" "}
                since last check
              </span>
              <span className="text-muted">
                <span className="font-extrabold text-headline">{result.verdict?.confidence ?? "—"}</span>{" "}
                confidence
              </span>
            </div>
          </div>
        </div>
      )}
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
      {inStock === false && <span className="text-[10.5px] font-extrabold text-[var(--verdict-avoid)]">Out of Stock</span>}
      {inStock === true && <span className="text-[10.5px] font-extrabold text-[var(--dw-green-mid)]">In Stock</span>}
      {primary && <span className="text-[10px] font-extrabold uppercase text-muted">Primary</span>}
    </span>
  );
}

function StatTile({
  label,
  value,
  tag,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tag?: string;
  tone?: "neutral" | "brand" | "blue" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted">{label}</span>
        {tag && <Tag tone={tone}>{tag}</Tag>}
      </div>
      <div
        className={cn(
          "tabular mt-1.5 text-[22px] font-extrabold tracking-tight",
          tone === "brand" ? "text-[var(--dw-green-mid)]" : tone === "blue" ? "text-[var(--verdict-fair)]" : "text-headline",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function StoreRow({
  merchant,
  price,
  inStock,
  rating,
  reviewCount,
  affiliateUrl,
  primary,
}: {
  merchant: keyof typeof merchantMeta;
  price: number | null;
  inStock: boolean | null;
  rating?: number | null;
  reviewCount?: number | null;
  affiliateUrl: string;
  primary?: boolean;
}) {
  const m = merchantMeta[merchant];
  const color = merchant === "amazon" ? "#FF9900" : "#2874F0";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[9px] font-black text-white"
        style={{ background: color }}
      >
        {m.short}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-extrabold text-headline">{m.name}</span>
          {primary && <span className="rounded bg-elevated px-1.5 py-0.5 text-[9.5px] font-extrabold text-secondary">Primary</span>}
        </div>
        {rating !== null && rating !== undefined && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-secondary">
            <span className="text-amber-500">★</span> {rating}
            {reviewCount ? <span className="text-muted">({reviewCount.toLocaleString("en-IN")})</span> : null}
          </div>
        )}
      </div>
      <div className="tabular text-[15px] font-extrabold text-headline">{formatINR(price)}</div>
      {inStock === true && (
        <span className="hidden text-[10.5px] font-extrabold text-[var(--dw-green-mid)] sm:inline">In Stock</span>
      )}
      <a
        href={affiliateUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[11.5px] font-extrabold text-white transition-opacity hover:opacity-90",
        )}
        style={{ background: color }}
      >
        View on {m.name} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function VerdictCard({ result }: { result: AnalysisResult }) {
  const v = result.verdict!;
  const meta = {
    BUY: { c: "#10B981", t: "Buy Now" },
    FAIR: { c: "#0284C7", t: "Fair Price" },
    WAIT: { c: "#D97706", t: "Wait" },
    AVOID: { c: "#DC2626", t: "Avoid" },
    INSUFFICIENT: { c: "#64748B", t: "Building history" },
  }[v.verdict];
  const score = v.score ?? 0;
  const c = 2 * Math.PI * 34;

  return (
    <div className="rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="relative grid h-[72px] w-[72px] shrink-0 place-items-center">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border-card)" strokeWidth="7" />
            <motion.circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke={meta.c}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={c}
              initial={{ strokeDashoffset: c }}
              animate={{ strokeDashoffset: v.score === null ? c : c * (1 - score / 100) }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <span className="tabular absolute text-[17px] font-extrabold text-headline">
            {v.score === null ? "—" : score}
            <span className="text-[10px] font-bold text-muted">%</span>
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold" style={{ color: meta.c }}>
            {meta.t}
          </div>
          <div className="mt-0.5 text-[11.5px] font-semibold leading-snug text-secondary">
            {v.verdict === "BUY"
              ? "This is a genuinely good price right now."
              : v.verdict === "FAIR"
                ? "A normal price — fine to buy, no urgency."
                : v.verdict === "WAIT"
                  ? "Likely to get cheaper. Hold on."
                  : v.verdict === "AVOID"
                    ? "Poor price right now. Do not buy."
                    : "DealSense is still recording this product's real price range."}
          </div>
        </div>
      </div>
    </div>
  );
}
