import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, observations, products } from "./schema";
import { STORE_META } from "./shelves";

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
}

/** Full stats for every listing that has a price. */
async function baseRows() {
  await ensureSchema();
  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      category: products.category,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      url: listings.url,
      listingId: listings.id,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(isNotNull(listings.price));

  const out: DealRow[] = [];
  for (const r of rows) {
    const price = r.price ?? 0;
    if (price <= 0) continue;
    const obs = await db
      .select({ price: observations.price, t: observations.observedAt })
      .from(observations)
      .where(eq(observations.listingId, r.listingId));
    const prices = obs.map((o) => o.price).filter((p): p is number => p !== null && p > 0);
    const mrp = r.mrp && r.mrp > price ? r.mrp : null;
    const meta = STORE_META[r.merchant] ?? {
      name: r.merchant,
      short: r.merchant.slice(0, 2).toUpperCase(),
      color: "#64748B",
    };
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
      url: r.url,
      listingId: r.listingId,
      observations: prices.length,
      low: prices.length ? Math.min(...prices) : null,
      high: prices.length ? Math.max(...prices) : null,
      median: prices.length ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)] : null,
      lastDropAt: null,
      dropAmount: null,
      lastSeenAt: obs.length ? Math.max(...obs.map((o) => o.t)) : null,
    });
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

  return base
    .filter((b) => b.lastDropAt !== null && (b.dropAmount ?? 0) > 0)
    .sort((a, b) => (b.lastDropAt ?? 0) - (a.lastDropAt ?? 0))
    .slice(0, limit);
}

/** Products whose current price IS their all-time low. */
export async function getAllTimeLows(limit = 12): Promise<DealRow[]> {  const rows = await baseRows();
  return rows
    .filter((r) => r.observations >= 3 && r.low !== null && r.price <= r.low)
    .sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations)
    .slice(0, limit);
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
export async function getPlatformShelves(limit = 8): Promise<{ merchant: string; meta: (typeof STORE_META)[string]; deals: DealRow[] }[]> {
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
      meta: STORE_META[merchant] ?? {
        name: merchant,
        short: merchant.slice(0, 2).toUpperCase(),
        color: "#64748B",
      },
      deals: deals
        .sort((a, b) => b.discountPct - a.discountPct || b.observations - a.observations)
        .slice(0, limit),
    }))
    .filter((s) => s.deals.length >= 3);
}

/** Newest observations — "latest deals". */
export async function getLatestDeals(limit = 12): Promise<DealRow[]> {
  const rows = await baseRows();
  return rows.sort((a, b) => b.observations - a.observations).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Filtering (drives /deals?priceMax=…&discountMin=…&store=…&category=…*/
/* ------------------------------------------------------------------ */

export interface DealFilters {
  priceMax?: number;
  discountMin?: number;
  store?: string;
  category?: string;
  sort?: "drop" | "allTimeLow" | "discount" | "history";
}

export async function getFilteredDeals(f: DealFilters): Promise<DealRow[]> {
  const rows = await baseRows();
  let out = rows;

  if (f.priceMax) out = out.filter((r) => r.price <= f.priceMax!);
  if (f.discountMin) out = out.filter((r) => r.discountPct >= f.discountMin!);
  if (f.store) out = out.filter((r) => r.merchant === f.store);
  if (f.category) {
    const needle = f.category.toLowerCase();
    out = out.filter((r) => (r.title + " " + (r.category ?? "")).toLowerCase().includes(needle));
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

  return out.slice(0, 120);
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
    if (c) catMap.set(c, (catMap.get(c) ?? 0) + 1);
  }

  return {
    priceCaps,
    discounts,
    stores: [...storeMap.entries()].map(([merchant, count]) => ({ merchant, count })),
    categories: [...catMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
  };
}
