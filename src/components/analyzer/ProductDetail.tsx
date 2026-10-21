import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import type { ReviewRow } from "@/lib/db/queries";
import type { SimilarProduct } from "@/lib/db/similar";
import type { StoreComparison } from "@/lib/db/compare";
import { storeMeta } from "@/lib/config";
import { formatINR, timeAgo } from "@/lib/utils";
import {
  analysisBullets,
  dealIntensity,
  findEvents,
  forecastNext,
  priceInsights,
  recommendation,
} from "@/lib/engine/insights";
import { ProductHeaderStrip } from "./ProductHeaderStrip";
import { PriceHistoryPanel, type StoreSeries } from "./PriceHistoryPanel";
import { AnalysisCards } from "./AnalysisCards";
import { StoreComparisonPanel } from "./StoreComparisonPanel";
import { ReviewsPanel } from "./ReviewsPanel";
import { SimilarProducts } from "./SimilarProducts";
import { StatCards, buildStatCards } from "./StatCards";
import { BuyVerdictCard } from "./BuyVerdictCard";
import { LandedPriceCard } from "./LandedPriceCard";
import { AlertPanel } from "./AlertPanel";

export function ProductDetail({
  result,
  reviews,
  similar,
  comparison,
}: {
  result: AnalysisResult;
  reviews: ReviewRow[];
  similar: SimilarProduct[];
  comparison: StoreComparison | null;
}) {
  const listing = result.listing!;
  const product = result.product!;
  const bundle = result.bundle;
  const meta = storeMeta(listing.merchant);

  const points = bundle?.points ?? result.history.primary;
  const hasHistory = (bundle?.observationCount ?? 0) >= 3;
  const trackingDays = points.length
    ? Math.max(1, Math.round((Date.now() - points[0].t) / 86400000))
    : 0;
  const potentialSaving =
    bundle?.low !== null && bundle?.low !== undefined && listing.price !== null
      ? Math.max(0, listing.price - bundle.low)
      : null;

  // ---- the intelligence ----
  const current = listing.price ?? points[points.length - 1]?.price ?? null;
  const events = findEvents(points);
  const forecast = forecastNext(points, current);
  const intensity = dealIntensity(points);
  const insights = priceInsights(points);
  const bullets = analysisBullets({
    points,
    current,
    insights,
    forecast,
    events,
    score: result.verdict?.score ?? null,
    confidence: result.verdict?.confidence ?? "",
  });
  const rec = recommendation(
    result.verdict?.score ?? null,
    result.verdict?.verdict ?? null,
    bullets,
    forecast,
    current,
  );

  // One line per store. The primary line is the merged record we analysed
  // (our observations plus imported history) so the chart, the events, the
  // insights and the forecast are all reading the same numbers.
  const series: StoreSeries[] = [{ merchant: listing.merchant, points }];
  for (const [merchant, pts] of Object.entries(comparison?.seriesByStore ?? {})) {
    if (merchant !== listing.merchant && pts.length > 1) {
      series.push({ merchant, points: pts });
    }
  }

  const statCards = buildStatCards({
    current: listing.price,
    low: bundle?.low ?? null,
    high: bundle?.high ?? null,
    median: bundle?.median90 ?? bundle?.median ?? null,
    spark: points.slice(-40).map((p) => p.price),
    hasHistory,
  });

  const scoreOutOfTen = result.verdict?.score ? result.verdict.score / 10 : null;
  const lowestEver = insights.lowest;

  return (
    <div className="space-y-5">
      {/* ---------- breadcrumb ---------- */}
      <nav className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
        <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/deals" className="text-[var(--dw-green-mid)] hover:underline">
          Deals
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate">{product.title}</span>
      </nav>

      {/* ---------- the strip ---------- */}
      <ProductHeaderStrip
        title={product.title}
        imageUrl={product.imageUrl}
        merchant={listing.merchant}
        rating={listing.rating}
        reviewCount={listing.reviewCount}
        brand={product.brand}
        category={product.category}
        currentPrice={listing.price}
        mrp={listing.mrp}
        lowest={lowestEver}
        score={scoreOutOfTen}
      />

      {/* ---------- verdict + side panels ---------- */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <StatCards cards={statCards} />

          <BuyVerdictCard
            verdict={result.verdict ?? null}
            evidence={bundle?.evidence ?? []}
            currentPrice={listing.price}
            median={bundle?.median90 ?? bundle?.median ?? null}
            trackingDays={trackingDays}
            potentialSaving={potentialSaving}
          />
        </div>

        <div className="space-y-5">
          {listing.price !== null && (
            <LandedPriceCard base={listing.price} merchant={listing.merchant} />
          )}

          <AlertPanel
            productId={product.id}
            listingId={listing.id}
            currentPrice={listing.price}
            productTitle={product.title}
          />

          {bundle?.market ? (
            <div className="rounded-2xl border border-hairline bg-subtle p-4">
              <div className="text-[12px] font-extrabold uppercase tracking-wider text-secondary">
                Market context
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-body">
                <strong className="text-headline">{bundle.market.category}</strong> typically cost{" "}
                {formatINR(bundle.market.low)}–{formatINR(bundle.market.high)} across{" "}
                {bundle.market.sampleSize} verified listings (median{" "}
                {formatINR(bundle.market.median)}).
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ---------- the big price history ---------- */}
      <PriceHistoryPanel
        series={series}
        events={events}
        forecast={forecast}
        intensity={intensity}
        currentPrice={current}
      />

      {/* ---------- insights, analysis, recommendation ---------- */}
      <AnalysisCards
        insights={insights}
        bullets={bullets}
        recommendation={rec.recommendation}
        headline={rec.headline}
        sub={rec.sub}
      />

      {/* ---------- compare stores ---------- */}
      {comparison && comparison.offers.length > 0 ? (
        <StoreComparisonPanel
          comparison={comparison}
          primaryListingId={listing.id}
        />
      ) : null}

      {/* ---------- reviews ---------- */}
      {reviews.length > 0 || listing.reviewCount ? (
        <ReviewsPanel
          reviews={reviews}
          storeRating={listing.rating}
          storeReviewCount={listing.reviewCount}
        />
      ) : null}

      {/* ---------- similar ---------- */}
      {similar.length > 0 ? <SimilarProducts products={similar} /> : null}

      {/* ---------- how we know ---------- */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
          How we know
        </div>
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
          {(bundle?.evidence ?? []).map((e, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
              <span className="mt-0.5 shrink-0">
                {e.kind === "VERIFIED FACT" ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[var(--dw-green-mid)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
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
        <p className="mt-4 border-t border-hairline pt-3 text-[11px] text-muted">
          Last checked on {listing.lastCheckedAt ? timeAgo(listing.lastCheckedAt) : "the store"} ·{" "}
          {meta.name} · {points.length} price points on record
        </p>
      </div>
    </div>
  );
}
