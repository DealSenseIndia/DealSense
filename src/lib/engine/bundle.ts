import type { AnalysisResult, LandedPrice, PricePoint, VerdictResult } from "../types";
import { getCategoryContext } from "../db/market";
import { getListingsByProduct, getObservations } from "../db/queries";
import type { ListingRow, ProductRow } from "../db/queries";
import { computeLandedPrice } from "./landedPrice";
import { computeStats, priceSeries } from "./stats";
import { evaluateDeal } from "./verdict";
import { fetchExternalHistory } from "./providers";
import {
  buildEvidence,
  mergeExternal,
  statsFrom,
  type Evidence,
  type HistoryBundle,
} from "./history";
import { isSameProduct, sameVariant, titleSimilarity } from "./identity";

/**
 * Assemble everything a product page needs: history (ours + external + proxy),
 * market context, verdict, landed price and labelled evidence.
 */
export async function buildBundle(input: {
  product: ProductRow;
  listing: ListingRow;
  rivalListing?: ListingRow | null;
}): Promise<{
  bundle: HistoryBundle;
  verdict: VerdictResult | null;
  landed: LandedPrice | null;
  rival: AnalysisResult["rival"];
  points: PricePoint[];
  rivalPoints: PricePoint[];
}> {
  const { product, listing, rivalListing } = input;

  const ownObs = await getObservations(listing.id);
  const ownPoints = priceSeries(ownObs);

  // 1. External provider (Keepa / PriceHistory) if keyed.
  let points = ownPoints;
  let source: HistoryBundle["source"] = ownPoints.length ? "own" : "none";
  let sourceLabel = "DealSense observations";

  if (ownPoints.length < 3) {
    const ext = await fetchExternalHistory(
      listing.merchant as "amazon" | "flipkart",
      listing.merchantProductId,
    );
    if (ext?.points.length) {
      points = mergeExternal(ownPoints, ext);
      source = "external";
      sourceLabel = `${ext.provider} historical data`;
    }
  }

  // 2. Cross-store proxy — the same product on the other store's history.
  if (points.length < 3 && rivalListing) {
    const rivalObs = await getObservations(rivalListing.id);
    const rivalPoints = priceSeries(rivalObs);
    if (rivalPoints.length) {
      points = [...rivalPoints];
      source = "cross_store";
      sourceLabel = `${rivalListing.merchant} history for the same product`;
    }
  }

  // 3. Market context — real, computed from everything we have verified.
  const market = await getCategoryContext(product.category);

  const stats = statsFrom(points);
  const current = listing.price;
  const verdict =
    current !== null && stats.count >= 1
      ? evaluateDeal({
          current,
          mrp: listing.mrp,
          stats: {
            count: stats.count,
            low: stats.low,
            high: stats.high,
            median: stats.median,
            median90: stats.median90,
            firstObservedAt: points[0]?.t ?? null,
            lastObservedAt: points[points.length - 1]?.t ?? null,
            trendPct: stats.trendPct,
          },
        })
      : null;

  const landed =
    current !== null
      ? computeLandedPrice({ base: current, shipping: listing.shipping, merchant: listing.merchant as never })
      : null;

  // Rival
  let rival: AnalysisResult["rival"] = null;
  let rivalPoints: PricePoint[] = [];
  if (rivalListing) {
    const rObs = await getObservations(rivalListing.id);
    rivalPoints = priceSeries(rObs);
    rival = {
      merchant: rivalListing.merchant as never,
      price: rivalListing.price ?? (rivalPoints.length ? rivalPoints[rivalPoints.length - 1].price : null),
      effectivePrice: rivalListing.price ?? null,
      url: rivalListing.url,
      affiliateUrl: rivalListing.url,
      lastCheckedAt: rivalListing.lastCheckedAt,
    };
  }

  const advertisedDiscountPct =
    listing.mrp && current && listing.mrp > current
      ? Math.round(((listing.mrp - current) / listing.mrp) * 100 * 10) / 10
      : null;

  const evidence: Evidence[] = buildEvidence({
    verdict,
    stats: {
      low: stats.low,
      high: stats.high,
      median: stats.median,
      median90: stats.median90,
      count: stats.count,
    },
    currentPrice: current,
    mrp: listing.mrp,
    landed,
    rival: rival ? { merchant: rival.merchant, price: rival.price } : null,
    market,
    lastCheckedAt: listing.lastCheckedAt,
    sourceLabel,
  });

  const bundle: HistoryBundle = {
    points,
    source,    sourceLabel,
    observationCount: stats.count,
    low: stats.low,
    high: stats.high,
    median: stats.median,
    median90: stats.median90,
    market,
    advertisedDiscountPct,
    evidence,
    hasSufficientHistory: stats.count >= 3,
  };

  return { bundle, verdict, landed, rival, points, rivalPoints };
}

export async function findRivalListing(product: ProductRow, listing: ListingRow): Promise<ListingRow | null> {
  const siblings = await getListingsByProduct(product.id);
  const direct = siblings.find(
    (l) => l.merchant !== listing.merchant && l.title && sameVariant(l.title, listing.title ?? ""),
  );
  if (direct) return direct;

  // Fall back to a title-similarity scan so a genuine same product stored
  // under a slightly different identity still gets compared — but only when
  // we are confident it is the same item.
  const candidates = siblings.filter(
    (l) => l.merchant !== listing.merchant && l.title && listing.title,
  );
  let best: { listing: ListingRow; score: number } | null = null;
  for (const c of candidates) {
    const score = titleSimilarity(c.title!, listing.title!);
    if (score >= 0.6 && isSameProduct(c.title!, listing.title!)) {
      if (!best || score > best.score) best = { listing: c, score };
    }
  }
  return best?.listing ?? null;
}
