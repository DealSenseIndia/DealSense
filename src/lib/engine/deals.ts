import type { Merchant } from "../config";
import type { VerdictResult } from "../types";
import { getObservations, getRecentListings, getProductById } from "../db/queries";
import { goPath } from "../affiliate";
import { computeStats, priceSeries } from "./stats";
import { evaluateDeal } from "./verdict";

export interface DealItem {
  listingId: string;
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  merchant: Merchant;
  price: number;
  mrp: number | null;
  url: string;
  affiliateUrl: string;
  lastCheckedAt: number | null;
  observationCount: number;
  verdict: VerdictResult;
  spark: number[];
}

/**
 * The homepage feed is a window into the real observation engine.
 * Only listings with genuine observations appear. No seed, no fiction.
 */
export async function getLiveDeals(limit = 48): Promise<DealItem[]> {
  const listings = await getRecentListings(200);
  const items: DealItem[] = [];

  for (const listing of listings) {
    if (listing.price === null || listing.price <= 0) continue;
    const obs = await getObservations(listing.id);
    const stats = computeStats(obs);
    if (stats.count === 0) continue;

    const verdict = evaluateDeal({ current: listing.price, mrp: listing.mrp, stats });
    const product = await getProductById(listing.productId);
    if (!product) continue;

    items.push({
      listingId: listing.id,
      productId: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl ?? listing.imageUrl,
      merchant: listing.merchant as Merchant,
      price: listing.price,
      mrp: listing.mrp,
      url: listing.url,
      affiliateUrl: goPath(listing.id, "live_deals"),
      lastCheckedAt: listing.lastCheckedAt,
      observationCount: stats.count,
      verdict,
      spark: priceSeries(obs)
        .slice(-24)
        .map((p) => p.price),
    });
  }

  // Rank: scored deals first (by score), then unscored by recency.
  items.sort((a, b) => {
    const sa = a.verdict.score ?? -1;
    const sb = b.verdict.score ?? -1;
    if (sb !== sa) return sb - sa;
    return (b.lastCheckedAt ?? 0) - (a.lastCheckedAt ?? 0);
  });

  return items.slice(0, limit);
}
