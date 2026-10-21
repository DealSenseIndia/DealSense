import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, observations, products } from "./schema";
import { sameVariant, titleSimilarity, isSameProduct } from "../engine/identity";
import { computeLandedPrice } from "../engine/landedPrice";
import { offerDiscount, offersFor } from "../engine/bankOffers";
import { storeMeta, type Merchant, affiliate } from "../config";
import { affiliateUrl } from "../merchants/resolve";
import type { PricePoint } from "../types";

export interface StoreOffer {
  listingId: string;
  merchant: string;
  merchantName: string;
  color: string;
  url: string;
  affiliateUrl: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  shipping: number;
  coupon: number;
  bankDiscount: number;
  bestBankOffer: string | null;
  /** What you actually pay, after delivery, coupon and the best card offer. */
  landed: number;
  /** How much this store is cheaper than the most expensive store. */
  savingVsWorst: number;
  rating: number | null;
  reviewCount: number | null;
  inStock: boolean | null;
  lastCheckedAt: number | null;
  observations: number;
  isBest: boolean;
  /** How many more listings this store has for the same product. */
  extraListings: number;
  /** This store's own recorded price series, oldest -> newest. */
  series: PricePoint[];
}

export interface StoreComparison {
  offers: StoreOffer[];
  best: StoreOffer | null;
  /** The price difference between the best and the worst store. */
  spread: number;
  /** Which stores we actually hold a verified price for. */
  storesCompared: number;
  /** Each store's own price series, so the chart can plot them side by side. */
  seriesByStore: Record<string, PricePoint[]>;
}

/**
 * Every store we hold this exact product in, priced end to end.
 *
 * Only stores where we have actually read a price are included, and the
 * variant has to match the listing you are looking at — we never compare a
 * different size or colour as if it were the same thing.
 */
export async function getStoreComparison(
  productId: string,
  primaryListingId: string,
  primaryTitle: string | null,
): Promise<StoreComparison> {
  await ensureSchema();

  const siblings = await db
    .select()
    .from(listings)
    .where(and(eq(listings.productId, productId), isNotNull(listings.price)));

  const primary = siblings.find((l) => l.id === primaryListingId);
  const title = primary?.title ?? primaryTitle;

  const priced = siblings.filter((l) => (l.price ?? 0) > 0);

  // Coupons are recorded against the observation, not the listing.
  const couponRows = await db
    .select({
      listingId: observations.listingId,
      coupon: observations.coupon,
      at: observations.observedAt,
    })
    .from(observations)
    .where(isNotNull(observations.coupon))
    .orderBy(desc(observations.observedAt));
  const couponByListing = new Map<string, number>();
  for (const c of couponRows) {
    if (!couponByListing.has(c.listingId) && c.coupon) {
      couponByListing.set(c.listingId, c.coupon);
    }
  }

  // Only the same variant, never a different size or colour.
  const sameVariantOnly = title
    ? priced.filter((l) => l.id === primaryListingId || (l.title ? sameVariant(l.title, title) : false))
    : priced;

  const pool = sameVariantOnly.length ? sameVariantOnly : priced;

  // Each listing's own recorded price series — this is what the chart draws.
  const seriesRows = await db
    .select({
      listingId: observations.listingId,
      price: observations.price,
      at: observations.observedAt,
    })
    .from(observations)
    .where(isNotNull(observations.price))
    .orderBy(asc(observations.observedAt));
  const seriesByListing = new Map<string, PricePoint[]>();
  for (const s of seriesRows) {
    if (!s.price || s.price <= 0) continue;
    const list = seriesByListing.get(s.listingId) ?? [];
    list.push({ t: s.at, price: s.price });
    seriesByListing.set(s.listingId, list);
  }

  const offers: StoreOffer[] = [];

  for (const l of pool) {
    const price = l.price ?? 0;
    if (price <= 0) continue;

    const coupon = Math.min(Math.max(couponByListing.get(l.id) ?? 0, 0), price);
    const shipping = Math.max(l.shipping ?? 0, 0);

    // The best card offer we know of for this store and price.
    const best = offersFor(l.merchant as Merchant)
      .map((o) => ({ o, d: offerDiscount(o, price) }))
      .sort((a, b) => b.d - a.d)[0];
    const bankDiscount = best && best.d > 0 ? best.d : 0;

    const landed = Math.max(price + shipping - coupon - bankDiscount, 0);
    const mrp = l.mrp && l.mrp > price ? l.mrp : null;

    offers.push({
      listingId: l.id,
      merchant: l.merchant,
      merchantName: storeMeta(l.merchant).name,
      color: storeMeta(l.merchant).color,
      url: l.url,
      affiliateUrl: affiliateUrl(
        l.merchant as Merchant,
        l.url,
        affiliate.amazonTag,
        affiliate.cuelinksChannel,
      ),
      price,
      mrp,
      discountPct: mrp ? Math.round(((mrp - price) / mrp) * 100) : 0,
      shipping,
      coupon,
      bankDiscount,
      bestBankOffer: best && bankDiscount > 0 ? `${best.o.bank} · ${best.o.label}` : null,
      landed,
      savingVsWorst: 0,
      rating: l.rating,
      reviewCount: l.reviewCount,
      inStock: l.inStock,
      lastCheckedAt: l.lastCheckedAt,
      observations: 0,
      isBest: false,
      extraListings: 0,
      series: seriesByListing.get(l.id) ?? [],
    });
  }

  if (!offers.length) {
    return { offers: [], best: null, spread: 0, storesCompared: 0, seriesByStore: {} };
  }

  // One row per store — the cheapest listing we hold there. A store can file
  // the same product twice (different sellers); the shopper only cares about
  // the best price at that store.
  const byStore = new Map<string, StoreOffer>();
  for (const o of offers) {
    const prev = byStore.get(o.merchant);
    if (!prev) {
      byStore.set(o.merchant, { ...o, extraListings: 0 });
      continue;
    }
    prev.extraListings += 1;
    if (o.landed < prev.landed) {
      const extra = prev.extraListings;
      byStore.set(o.merchant, { ...o, extraListings: extra });
    }
  }

  const rows = [...byStore.values()].sort((a, b) => a.landed - b.landed);
  const worst = rows[rows.length - 1].landed;
  rows.forEach((o, i) => {
    o.isBest = i === 0;
    o.savingVsWorst = Math.max(0, worst - o.landed);
  });

  // The chart plots one line per store, using the longest series we hold.
  const seriesByStore: Record<string, PricePoint[]> = {};
  for (const o of rows) {
    if (o.series.length > 1) seriesByStore[o.merchant] = o.series;
  }

  return {
    offers: rows,
    best: rows[0],
    spread: Math.max(0, worst - rows[0].landed),
    storesCompared: rows.length,
    seriesByStore,
  };
}

/**
 * How sure are we that two listings are the same product?
 * Used when a product row holds a listing that was filed under a different name.
 */
export function compareConfidence(a: string, b: string): number {
  return titleSimilarity(a, b) >= 0.6 && isSameProduct(a, b) ? 1 : 0;
}
