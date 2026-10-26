import type { AnalysisResult, LandedPrice, PricePoint, VerdictResult } from "../types";
import { getCategoryContext } from "../db/market";
import { getListingsByProduct, getObservations, addObservation } from "../db/queries";
import type { ListingRow, ProductRow } from "../db/queries";
import { computeLandedPrice } from "./landedPrice";
import { computeStats, priceSeries } from "./stats";
import { evaluateDeal } from "./verdict";
import { fetchExternalHistory } from "./providers";
import {
  buildEvidence,
  importedProvider,
  isImportedSource,
  mergeExternal,
  statsFrom,
  type Evidence,
  type HistoryBundle,
} from "./history";
import { isSameProduct, sameVariant, titleSimilarity } from "./identity";
import { goPath } from "../affiliate";

/**
 * Assemble everything a product page needs: history (ours + external + proxy),
 * market context, verdict, landed price and labelled evidence.
 */
/**
 * How many of our own observations are enough before we stop importing
 * provider history. Imported points are kept forever, so this only controls
 * whether we fetch a provider series for a freshly-discovered product.
 */
const EXTERNAL_BOOTSTRAP_LIMIT = 50;

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
}> {  const { product, listing, rivalListing } = input;

  const ownObs = await getObservations(listing.id);
  const ownPoints = priceSeries(ownObs);

  // 1. External provider (PriceHistory.ai / Keepa / PriceHistory.app).
  //    Imported points are persisted into our own observation table the first
  //    time, so each product is fetched from the provider at most once.
  let points = ownPoints;
  let source: HistoryBundle["source"] = ownPoints.length ? "own" : "none";
  let sourceLabel = "DealSense observations";
  let importedCount = 0;
  let externalProvider: string | null = null;

  const imported = ownObs.filter((o) => isImportedSource(o.source));
  if (imported.length) {
    const importedPoints = priceSeries(imported);
    importedCount = importedPoints.length;
    externalProvider = importedProvider(imported[0].source);
    points = mergeExternal(ownPoints, {
      points: importedPoints.map((p) => ({ t: p.t, price: p.price })),
      provider: externalProvider,
    });
    source = ownPoints.length ? "own" : "external";
    sourceLabel = ownPoints.length ? "DealSense tracked history" : "tracked price history";
  } else if (ownPoints.length < EXTERNAL_BOOTSTRAP_LIMIT) {
    // We only have a thin record of our own. Pull the provider's longer
    // history once (it is cached permanently in our observation table).
    const ext = await fetchExternalHistory(
      listing.merchant,
      listing.merchantProductId,
      listing.title ?? product.title,
    );
    if (ext?.points.length) {
      // Persist the imported series so we never need a full backfill again.
      // The source records exactly who observed these prices.
      for (const p of ext.points) {
        await addObservation({
          listingId: listing.id,
          price: p.price,
          mrp: null,
          source: `imported:${ext.provider}`,
          observedAt: p.t,
        });
      }
      importedCount = ext.points.length;
      externalProvider = ext.provider;
      points = mergeExternal(ownPoints, ext);
      source = "external";
      sourceLabel = "tracked price history";
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
      affiliateUrl: goPath(rivalListing.id, "compare"),
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
    source,
    sourceLabel,
    importedPoints: importedCount,
    externalProvider,
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

  return {
    bundle,
    verdict,
    landed,
    rival,
    points,
    rivalPoints,
  };
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
