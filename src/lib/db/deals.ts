import { cache } from "react";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, observations, products } from "./schema";
import { storeMeta } from "../config";
import { resolveLeaf } from "./taxonomy";

export interface DealRow {
  slug: string;
  title: string;
  imageUrl: string | null;
  category: string | null;
  merchant: string;
  storeColor: string;
  storeShort: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  rating: number | null;
  /** Real review count from the store, when we recorded one. */
  reviewCount: number | null;
  url: string;
  observations: number;
  low: number | null;
  high: number | null;
  median: number | null;
  listingId?: string;
  lastDropAt: number | null;
  dropAmount: number | null;
  /** Timestamp of the most recent recorded price point. */
  lastSeenAt: number | null;
  /** Recent recorded prices, oldest -> newest. Drives the mini price-history graph. */
  spark: number[];
  /** How many stores we track this product in. */
  stores: number;
  /** The store where this product costs the least, right now. */
  bestStore: string | null;
  /** How much you save by buying it at the cheapest store instead of this one. */
  storeSaving: number;
}

/**
 * Full stats for every listing that has a price.
 *
 * Wrapped in `cache` so the several homepage queries that all need the
 * catalogue do the heavy read once per request, not once per section.
 */
const baseRows = cache(async () => {
  await ensureSchema();
  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      category: products.category,
      productId: products.id,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      reviewCount: listings.reviewCount,
      url: listings.url,
      listingId: listings.id,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(isNotNull(listings.price));

  // How many DIFFERENT stores carry each product, and the cheapest one.
  const storeRows = await db
    .select({ productId: listings.productId, merchant: listings.merchant, price: listings.price })
    .from(listings)
    .where(isNotNull(listings.price));
  const storeCount = new Map<
    string,
    { merchants: Set<string>; best: string | null; bestPrice: number }
  >();
  for (const s of storeRows) {
    if (!s.price || s.price <= 0) continue;
    const e = storeCount.get(s.productId) ?? {
      merchants: new Set<string>(),
      best: null,
      bestPrice: Number.POSITIVE_INFINITY,
    };
    e.merchants.add(s.merchant);
    if (s.price < e.bestPrice) {
      e.bestPrice = s.price;
      e.best = s.merchant;
    }
    storeCount.set(s.productId, e);
  }

  // One bulk read of the whole price history, grouped in memory. A per-listing
  // query here turns into hundreds of round trips once the catalogue grows,
  // which is exactly what made the homepage slow after the multi-store import.
  const allObs = await db
    .select({
      listingId: observations.listingId,
      price: observations.price,
      t: observations.observedAt,
    })
    .from(observations)
    .orderBy(asc(observations.observedAt));
  const obsByListing = new Map<string, { price: number | null; t: number }[]>();
  for (const o of allObs) {
    const list = obsByListing.get(o.listingId) ?? [];
    list.push({ price: o.price, t: o.t });
    obsByListing.set(o.listingId, list);
  }

  const out: DealRow[] = [];
  for (const r of rows) {
    const price = r.price ?? 0;
    if (price <= 0) continue;
    const obs = obsByListing.get(r.listingId) ?? [];
    const clean = obs.filter((o): o is { price: number; t: number } => o.price !== null && o.price > 0);
    const prices = clean.map((o) => o.price);
    // The most recent real drop in this listing's own series.
    let lastDropAt: number | null = null;
    let dropAmount: number | null = null;
    for (let i = clean.length - 1; i > 0; i--) {
      if (clean[i].price < clean[i - 1].price) {
        lastDropAt = clean[i].t;
        dropAmount = clean[i - 1].price - clean[i].price;
        break;
      }
    }
    const mrp = r.mrp && r.mrp > price ? r.mrp : null;
    const meta = storeMeta(r.merchant);
    const stores = storeCount.get(r.productId);
    const median = prices.length
      ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]
      : null;
    // An extreme outlier is a recording error or a seller placeholder until a
    // store re-read says otherwise; keep it out of discovery.
    if (median !== null && prices.length >= 5 && price < median * 0.25) continue;
    out.push({
      slug: r.slug,
      title: r.title,
      imageUrl: r.imageUrl,
      category: r.category,
      merchant: r.merchant,
      storeColor: meta.color,
      storeShort: meta.short,
      price,
      mrp,
      discountPct: mrp ? Math.round(((mrp - price) / mrp) * 100) : 0,
      rating: r.rating,
      reviewCount: r.reviewCount,
      url: r.url,
      listingId: r.listingId,
      observations: prices.length,
      low: prices.length ? Math.min(...prices) : null,
      high: prices.length ? Math.max(...prices) : null,
      median,
      lastDropAt,
      dropAmount,
      lastSeenAt: obs.length ? Math.max(...obs.map((o) => o.t)) : null,
      spark: sparkSeries(obs.map((o) => o.price)),
      stores: stores?.merchants.size ?? 1,
      bestStore: stores?.best ?? null,
      storeSaving:
        stores && stores.best && stores.bestPrice < price ? price - stores.bestPrice : 0,
    });
  }
  return out;
});

/** The full priced catalogue, with recorded history for every row. */
export async function getCatalogueRows(): Promise<DealRow[]> {
  return baseRows();
}

/** Last 24 recorded prices, oldest -> newest. Drives the mini price-history graph. */
const SPARK_POINTS = 24;

function sparkSeries(prices: (number | null)[]): number[] {
  const clean = prices.filter((p): p is number => p !== null && p > 0);
  if (clean.length <= SPARK_POINTS) return clean;
  const step = Math.ceil(clean.length / SPARK_POINTS);
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += step) out.push(clean[i]);
  if (out[out.length - 1] !== clean[clean.length - 1]) out.push(clean[clean.length - 1]);
  return out.slice(-SPARK_POINTS);
}

/** One card per product, even when it has two tracked listings. */
function dedupeBySlug(rows: DealRow[], limit: number): DealRow[] {
  const seen = new Set<string>();
  const out: DealRow[] = [];
  for (const r of rows) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Most recent real price drops — "deals moving now". */
export async function getRecentDrops(limit = 14): Promise<DealRow[]> {
  await ensureSchema();
  const since = Date.now() - 21 * 24 * 60 * 60 * 1000;

  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      url: listings.url,
      listingId: listings.id,
      prevPrice: observations.price,
      prevAt: observations.observedAt,
    })
    .from(observations)
    .innerJoin(listings, eq(observations.listingId, listings.id))
    .innerJoin(products, eq(products.id, listings.productId))
    .where(and(gte(observations.observedAt, since), isNotNull(listings.price)))
    .orderBy(desc(observations.observedAt));

  // Find the most recent actual DROP per listing (price went down).
  const drops = new Map<string, { at: number; amount: number }>();

  const byListing = new Map<string, typeof rows>();
  for (const r of rows) {
    const l = byListing.get(r.listingId) ?? [];
    l.push(r);
    byListing.set(r.listingId, l);
  }

  for (const [listingId, list] of byListing) {
    list.sort((a, b) => b.prevAt - a.prevAt);
    for (let i = 0; i < list.length - 1; i++) {
      const now = list[i];
      const before = list[i + 1];
      if (now.prevPrice !== null && before.prevPrice !== null && now.prevPrice < before.prevPrice) {
        const amount = before.prevPrice - now.prevPrice;
        const cur = drops.get(listingId);
        if (!cur || now.prevAt > cur.at) drops.set(listingId, { at: now.prevAt, amount });
        break;
      }
    }
  }

  const base = await baseRows();
  for (const b of base) {
    if (!b.listingId) continue;
    const d = drops.get(b.listingId) ?? null;
    if (!d) continue;
    b.lastDropAt = d.at;
    b.dropAmount = d.amount;
  }

  return dedupeBySlug(
    base
      .filter((b) => b.lastDropAt !== null && (b.dropAmount ?? 0) > 0)
      .sort((a, b) => (b.lastDropAt ?? 0) - (a.lastDropAt ?? 0)),
    limit,
  );
}

/** Products whose current price IS their all-time low. */
export async function getAllTimeLows(limit = 12): Promise<DealRow[]> {
  const rows = await baseRows();
  return dedupeBySlug(
    rows
      .filter((r) => r.observations >= 3 && r.low !== null && r.price <= r.low)
      .sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations),
    limit,
  );
}

/** Price buckets — "deals under ₹X". */
export async function getPriceBuckets(): Promise<{ max: number; count: number; best: number }[]> {
  const rows = await baseRows();
  const caps = [999, 1999, 4999, 9999, 24999];
  return caps.map((max) => {
    const inBucket = rows.filter((r) => r.price <= max);
    const discounts = inBucket.map((r) => r.discountPct);
    return {
      max,
      count: inBucket.length,
      best: discounts.length ? Math.max(...discounts) : 0,
    };
  });
}

/** Discount tiers — "minimum N% off". */
export async function getDiscountTiers(): Promise<{ min: number; count: number }[]> {
  const rows = await baseRows();
  return [40, 50, 60, 70].map((min) => ({
    min,
    count: rows.filter((r) => r.discountPct >= min).length,
  }));
}

/** Per-store shelves — "top deals by platform". */
export async function getPlatformShelves(
  limit = 8,
): Promise<{ merchant: string; meta: { name: string; short: string; color: string }; deals: DealRow[] }[]> {
  const rows = await baseRows();
  const byMerchant = new Map<string, DealRow[]>();
  for (const r of rows) {
    const list = byMerchant.get(r.merchant) ?? [];
    list.push(r);
    byMerchant.set(r.merchant, list);
  }
  return [...byMerchant.entries()]
    .map(([merchant, deals]) => ({
      merchant,
      meta: storeMeta(merchant),
      deals: deals
        .sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations)
        .slice(0, limit),
    }))
    .filter((s) => s.deals.length >= 3);
}

/** Newest observations — "latest deals". */
export async function getLatestDeals(limit = 12): Promise<DealRow[]> {
  const rows = await baseRows();
  return dedupeBySlug(rows.sort((a, b) => b.observations - a.observations), limit);
}

/** Prices at or within 2% of their own recorded low. */
export async function getNearLowDeals(limit = 24): Promise<DealRow[]> {
  const rows = await baseRows();
  return dedupeBySlug(
    rows
      .filter((r) => r.observations >= 3 && r.low !== null && r.price <= r.low * 1.02)
      .sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations),
    limit,
  );
}

/* ------------------------------------------------------------------ */
/* Filtering (drives /deals?priceMax=…&discountMin=…&store=…&category=…*/
/* ------------------------------------------------------------------ */

export interface DealFilters {
  priceMax?: number;
  discountMin?: number;
  store?: string;
  category?: string;
  /** Only products we track on more than one store. */
  multiStore?: boolean;
  sort?: "drop" | "allTimeLow" | "discount" | "history";
}

export async function getFilteredDeals(f: DealFilters): Promise<DealRow[]> {
  const rows = await baseRows();
  let out = rows;

  if (f.priceMax) out = out.filter((r) => r.price <= f.priceMax!);
  if (f.discountMin) out = out.filter((r) => r.discountPct >= f.discountMin!);
  if (f.store) out = out.filter((r) => r.merchant === f.store);
  if (f.multiStore) out = out.filter((r) => r.stores > 1);
  if (f.category) {
    // Match on the taxonomy leaf, so "Smartphones" also picks up the
    // "APPLE Mobiles" / "OnePlus Mobiles" shelves a store files them under.
    // The title is only used when the leaf itself is unknown.
    const leaf = resolveLeaf(f.category);
    const needle = f.category.toLowerCase();
    out = out.filter((r) => {
      if (leaf) {
        return r.category ? resolveLeaf(r.category) === leaf : false;
      }
      return (r.title + " " + (r.category ?? "")).toLowerCase().includes(needle);
    });
  }

  switch (f.sort) {
    case "drop":
      out = out.filter((r) => (r.dropAmount ?? 0) > 0).sort((a, b) => (b.dropAmount ?? 0) - (a.dropAmount ?? 0));
      break;
    case "allTimeLow":
      out = out
        .filter((r) => r.observations >= 3 && r.low !== null && r.price <= r.low)
        .sort((a, b) => b.discountPct - a.discountPct);
      break;
    case "discount":
      out = out.sort((a, b) => b.discountPct - a.discountPct);
      break;
    case "history":
      out = out.sort((a, b) => b.observations - a.observations);
      break;
    default:
      out = out.sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations);
  }

  return out.slice(0, 400);
}

export async function getFilterFacets() {
  const rows = await baseRows();
  const priceCaps = [999, 1999, 4999, 9999, 24999, 49999].map((max) => ({
    max,
    count: rows.filter((r) => r.price <= max).length,
  }));
  const discounts = [20, 40, 50, 60, 70].map((min) => ({
    min,
    count: rows.filter((r) => r.discountPct >= min).length,
  }));

  const storeMap = new Map<string, number>();
  const catMap = new Map<string, number>();
  for (const r of rows) {
    storeMap.set(r.merchant, (storeMap.get(r.merchant) ?? 0) + 1);
  }
  for (const r of rows) {
    const c = r.category;
    if (!c) continue;
    // Group the store's own category names into the taxonomy leaf they sit in.
    const key = resolveLeaf(c) ?? c;
    catMap.set(key, (catMap.get(key) ?? 0) + 1);
  }

  return {
    priceCaps,
    discounts,
    stores: [...storeMap.entries()].map(([merchant, count]) => ({ merchant, count })),
    multiStore: rows.filter((r) => r.stores > 1).length,
    categories: [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* Smart budget rails — cheap, well-rated, genuinely-discounted stuff  */
/* across every store we track                                          */
/* ------------------------------------------------------------------ */

export interface BudgetBand {
  id: string;
  label: string;
  min: number;
  max: number | null;
  /** How many tracked products fall in this band. */
  count: number;
  deals: DealRow[];
}

/**
 * How strong a buy this row is right now: cheap against its own recorded
 * median, discounted against MRP, well rated, and backed by evidence.
 * Used to rank budget rails and category shelves — not shown as a number.
 */
export function dealQuality(r: DealRow): number {
  const median = r.median && r.median > 0 ? r.median : r.price;
  const vsMedian = median > 0 ? clamp((median - r.price) / median, 0, 0.6) / 0.6 : 0;
  const discount = clamp(r.discountPct, 0, 80) / 80;
  const rating = r.rating !== null ? clamp(r.rating / 5, 0, 1) : 0.5;
  const reviews = clamp(Math.log10(1 + (r.reviewCount ?? 0)) / 4, 0, 1);
  const quality = rating * 0.7 + reviews * 0.3;
  const evidence = clamp(r.observations / 24, 0, 1);
  const atLow =
    r.low !== null && r.observations >= 3 && r.price <= r.low * 1.01 ? 0.1 : 0;
  return 0.35 * vsMedian + 0.28 * discount + 0.17 * quality + 0.1 * evidence + atLow;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * The homepage "smart picks" rail: five live price bands, each filled with
 * the best current buys across all stores. Deliberately spread across
 * categories and merchants so a single storefront cannot take over a band.
 */
export async function getBudgetPicks(perBand = 8): Promise<BudgetBand[]> {
  const rows = (await baseRows()).filter((r) => r.observations >= 3);
  const bands: { id: string; label: string; min: number; max: number | null }[] = [
    { id: "under-499", label: "Under ₹499", min: 0, max: 499 },
    { id: "500-1999", label: "₹500 – ₹1,999", min: 500, max: 1999 },
    { id: "2000-4999", label: "₹2,000 – ₹4,999", min: 2000, max: 4999 },
    { id: "5000-9999", label: "₹5,000 – ₹9,999", min: 5000, max: 9999 },
    { id: "10000-plus", label: "₹10,000+", min: 10000, max: null },
  ];

  return bands.map((band) => {
    const inBand = rows.filter(
      (r) => r.price >= band.min && (band.max === null || r.price <= band.max!),
    );
    const ranked = [...inBand].sort((a, b) => dealQuality(b) - dealQuality(a));

    const chosen: DealRow[] = [];
    const byStore = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const seen = new Set<string>();
    const keyOf = (r: DealRow) => r.title.slice(0, 26).toLowerCase();

    // First pass: a strict diversity budget (3 per store, 2 per category).
    for (const r of ranked) {
      if (chosen.length >= perBand) break;
      if ((byStore.get(r.merchant) ?? 0) >= 3) continue;
      const cat = r.category ?? "Other";
      if ((byCategory.get(cat) ?? 0) >= 2) continue;
      if (seen.has(keyOf(r))) continue;
      chosen.push(r);
      seen.add(keyOf(r));
      byStore.set(r.merchant, (byStore.get(r.merchant) ?? 0) + 1);
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + 1);
    }
    // Second pass: fill the rest with the best remaining, still unique.
    if (chosen.length < perBand) {
      for (const r of ranked) {
        if (chosen.length >= perBand) break;
        if (seen.has(keyOf(r))) continue;
        chosen.push(r);
        seen.add(keyOf(r));
      }
    }

    return {
      ...band,
      count: inBand.length,
      deals: chosen,
    };
  });
}
