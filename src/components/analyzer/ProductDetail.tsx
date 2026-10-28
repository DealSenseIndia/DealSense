import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import type { AnalysisResult } from "@/lib/types";
import type { ReviewRow } from "@/lib/db/queries";
import type { SimilarProduct } from "@/lib/db/similar";
import type { StoreComparison } from "@/lib/db/compare";
import type { VariantSibling } from "@/lib/db/variantSiblings";
import { parseTitleVariant } from "@/lib/db/variantSiblings";
import { storeMeta } from "@/lib/config";
import { buildOptions, variantMatches } from "@/lib/db/variants";
import { timeAgo } from "@/lib/utils";
import {
  analysisBullets,
  findEvents,
  forecastNext,
  priceInsights,
  recommendation,
} from "@/lib/engine/insights";
import { ProductHeaderStrip } from "./ProductHeaderStrip";import { ProductGallery } from "./ProductGallery";
import { PriceHistoryPanel, type StoreSeries } from "./PriceHistoryPanel";
import { AnalysisCards } from "./AnalysisCards";
import { StoreComparisonPanel } from "./StoreComparisonPanel";
import { ReviewsPanel } from "./ReviewsPanel";
import { ProductOptions } from "./ProductOptions";
import { SimilarProducts } from "./SimilarProducts";
import { StatCards, buildStatCards } from "./StatCards";
import { BuyVerdictCard } from "./BuyVerdictCard";
import { LandedPriceCard } from "./LandedPriceCard";
import { AlertPanel } from "./AlertPanel";

/** "14 Mar 2024" in Indian dates, so the start day never shifts with the server. */
function historyStartLabel(t: number): string {
  return new Date(t).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function ProductDetail({
  result,
  reviews,
  similar,
  comparison,
  siblings = [],
  option = null,
  slug = "",
  brandHref = null,
  categoryHref = null,
}: {
  result: AnalysisResult;
  reviews: ReviewRow[];
  similar: SimilarProduct[];
  comparison: StoreComparison | null;
  siblings?: VariantSibling[];
  option?: { key: string; value: string } | null;
  slug?: string;
  /** Set only when the brand has its own page. */
  brandHref?: string | null;
  /** Set only when the product's category has its own page. */
  categoryHref?: string | null;
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
  // The oldest point of the series the chart is built from. Imported and
  // observed points are merged in date order, so the first one is the start of
  // the record — null when there is nothing to draw. The chart's range buttons
  // narrow the window they draw, not the record itself.
  const historyStart = points.length ? points[0].t : null;
  const potentialSaving =
    bundle?.low !== null && bundle?.low !== undefined && listing.price !== null
      ? Math.max(0, listing.price - bundle.low)
      : null;

  // ---- the intelligence ----
  const current = listing.price ?? points[points.length - 1]?.price ?? null;
  const events = findEvents(points);
  const forecast = forecastNext(points, current);
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

  // The history we analysed for this listing — our own observations plus the
  // imported series, so the chart, the events and the insights all read the
  // same numbers.
  const statCards = buildStatCards({
    current: listing.price,
    low: bundle?.low ?? null,
    high: bundle?.high ?? null,
    median: bundle?.median90 ?? bundle?.median ?? null,
    spark: points.slice(-40).map((p) => p.price),
    hasHistory,
  });

  // One line per store. The primary line is the merged record we analysed
  // (our observations plus imported history) so the chart, the events, the
  // insights and the forecast are all reading the same numbers.
  const series: StoreSeries[] = [{ merchant: listing.merchant, points }];
  for (const [merchant, pts] of Object.entries(comparison?.seriesByStore ?? {})) {
    if (merchant !== listing.merchant && pts.length > 1) {
      series.push({ merchant, points: pts });
    }
  }

  // Every photo the store published for this product.
  const gallery = useMemo(() => {
    const list = product.images?.length ? product.images : [];
    const all = [product.imageUrl, ...list].filter(Boolean) as string[];
    return Array.from(new Set(all));
  }, [product.imageUrl, product.images]);

  // The product's real options — colours, sizes, configurations — read off
  // the variant each reviewer actually bought.
  const options = useMemo(() => buildOptions(reviews), [reviews]);

  /** The colour this listing is, as the store named it. */
  const currentColour = useMemo(
    () => parseTitleVariant(product.title).colour,
    [product.title],
  );

  // Reviews for the option the visitor picked, if any.
  const shownReviews = useMemo(
    () => reviews.filter((r) => variantMatches(r.variant, option)),
    [reviews, option],
  );

  return (
    <div className="space-y-5">
      {/* ---------- breadcrumb ---------- */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-muted">
        <Link href="/" className="text-[var(--dw-green-mid)] hover:underline">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/deals" className="text-[var(--dw-green-mid)] hover:underline">
          Deals
        </Link>
        {product.category ? (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link
              href={categoryHref ?? `/deals?category=${encodeURIComponent(product.category)}`}
              className="text-[var(--dw-green-mid)] hover:underline"
            >
              {product.category}
            </Link>
          </>
        ) : null}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="line-clamp-1 min-w-0">{product.title}</span>
      </nav>

      {/* ---------- the strip ---------- */}
      <ProductHeaderStrip
        title={product.title}
        rating={listing.rating}
        reviewCount={listing.reviewCount}
        brand={product.brand}
        brandHref={brandHref}
        category={product.category}
        currentPrice={listing.price}
        mrp={listing.mrp}
        score={result.verdict?.score ?? null}
      />

      {/* ---------- gallery + price panel ---------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)_320px]">
        <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <ProductGallery images={gallery} alt={product.title} />
        </div>

        <div className="min-w-0 space-y-5">
          {/* the options this product actually comes in */}
          {(options.dimensions.length > 0 || siblings.length > 0) && (
            <ProductOptions
              options={options}
              siblings={siblings}
              slug={slug}
              active={option}
              matched={shownReviews.length}
              currentImageUrl={gallery[0] ?? null}
              currentColour={currentColour}
            />
          )}

          <BuyVerdictCard
            verdict={result.verdict ?? null}
            evidence={bundle?.evidence ?? []}
            currentPrice={listing.price}
            median={bundle?.median90 ?? bundle?.median ?? null}
            trackingDays={trackingDays}
            potentialSaving={potentialSaving}
          />
        </div>

        <div className="min-w-0 space-y-4">
          {/* the buy button */}
          <a
            href={listing.affiliateUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="btn-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-extrabold"
          >
            View deal on {meta.name}
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>

          {/* compare across stores — compact, up top */}
          {comparison && comparison.offers.length > 0 ? (
            <StoreComparisonPanel
              comparison={comparison}
              primaryListingId={listing.id}
              compact
            />
          ) : null}

          {listing.price !== null && (
            <LandedPriceCard base={listing.price} merchant={listing.merchant} />
          )}

          <AlertPanel
            productId={product.id}
            listingId={listing.id}
            currentPrice={listing.price}
            productTitle={product.title}
          />
        </div>
      </div>

      {/* ---------- the price history, full width ---------- */}
      <PriceHistoryPanel series={series} events={events} />
      {/* ---------- insights ---------- */}
      <AnalysisCards
        bullets={bullets}
        recommendation={rec.recommendation}
        headline={rec.headline}
        sub={rec.sub}
        showRecommendation={false}
      />

      {/* ---------- compare stores is up in the right rail ---------- */}

      {/* ---------- reviews ---------- */}
      {/* Always rendered: an honest empty state with a store link beats a
          section that silently vanishes and looks like a broken page. */}
      <div id="reviews">
        {option ? (
          <p className="mb-3 rounded-xl border border-[var(--dw-green-border)] bg-[var(--dw-green-surface)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--dw-green-bot)]">
            Showing reviews for the selected option only —{" "}
            {shownReviews.length} of {reviews.length} reviews.
          </p>
        ) : null}
        <ReviewsPanel
          reviews={shownReviews}
          storeRating={listing.rating}
          storeReviewCount={listing.reviewCount}
          productId={product.id}
          storeHref={`/go/${listing.id}`}
          storeName={meta.name}
        />
      </div>

      {/* ---------- similar ---------- */}
      {similar.length > 0 ? (
        <SimilarProducts products={similar} category={product.category} />
      ) : null}

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
        {historyStart !== null ? (
          <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-muted">
            <p>History starts {historyStartLabel(historyStart)}.</p>
          </div>
        ) : null}
        {(() => {
          // The newest recorded price is the only date we can honestly stand
          // behind. `lastCheckedAt` moves whenever we refresh, even when the
          // store had nothing new to say; the series' last point is the price.
          const latestPoint = points.length ? points[points.length - 1].t : null;
          const ageDays = latestPoint ? Math.floor((Date.now() - latestPoint) / 86400000) : null;
          const stale = ageDays !== null && ageDays >= 3;
          return (
            <p
              className={`mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed ${
                stale ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted"
              }`}
            >
              {stale
                ? `Newest price on record is ${ageDays} days old — it may have moved since. `
                : `Price last recorded ${latestPoint ? timeAgo(latestPoint) : "—"}. `}
              {points.length} points from {meta.name}
              {listing.lastCheckedAt ? ` · refreshed ${timeAgo(listing.lastCheckedAt)}` : ""}
            </p>
          );
        })()}
      </div>
    </div>
  );
}
