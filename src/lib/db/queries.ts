import { and, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { canonicalListingWhere } from "./canonical";
import { alerts, alertEvents, events, listings, liveDeals, observations, products, reviews } from "./schema";
import { priceTrackedMerchants } from "../config";

const now = () => Date.now();
export const uid = () => crypto.randomUUID();

export type ProductRow = typeof products.$inferSelect;
export type ListingRow = typeof listings.$inferSelect;
export type ObservationRow = typeof observations.$inferSelect;
export type AlertRow = typeof alerts.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;

/* ------------------------------------------------------------------ */
/* Reviews (real, read off the store's own product page)              */
/* ------------------------------------------------------------------ */

/** Store a batch of real reviews for a listing. Duplicates are skipped. */
export async function upsertReviews(
  listingId: string,
  items: {
    author: string | null;
    stars: number | null;
    title: string | null;
    body: string | null;
    reviewedAt: string | null;
    verified: boolean;
    variant: string | null;
    helpful: number | null;
    source?: string;
  }[],
): Promise<number> {
  if (!items.length) return 0;
  await ensureSchema();

  const existing = await db
    .select({ id: reviews.id, title: reviews.title, body: reviews.body })
    .from(reviews)
    .where(eq(reviews.listingId, listingId));
  const seen = new Set(existing.map((r) => reviewKey(r.title, r.body)));

  let added = 0;
  for (const r of items) {
    const key = reviewKey(r.title, r.body);
    if (seen.has(key)) continue;
    seen.add(key);
    await db.insert(reviews).values({
      id: uid(),
      listingId,
      author: r.author,
      stars: r.stars,
      title: r.title,
      body: r.body,
      reviewedAt: r.reviewedAt,
      verified: r.verified,
      variant: r.variant,
      helpful: r.helpful,
      source: r.source ?? "store",
      createdAt: now(),
    });
    added++;
  }
  return added;
}

function reviewKey(title: string | null, body: string | null): string {
  return `${(title ?? "").trim().toLowerCase()}|${(body ?? "").trim().slice(0, 120).toLowerCase()}`;
}

/** Every real review we have for a listing, newest rating first. */
export async function getReviewsForListing(listingId: string): Promise<ReviewRow[]> {
  await ensureSchema();
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.listingId, listingId))
    .orderBy(desc(reviews.stars), desc(reviews.createdAt));
}

/** Reviews across every listing of a product (all stores). */
export async function getReviewsForProduct(productId: string): Promise<ReviewRow[]> {
  await ensureSchema();
  const rows = await db
    .select({ listingId: listings.id })
    .from(listings)
    .where(eq(listings.productId, productId));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.listingId);
  const out: ReviewRow[] = [];
  for (const id of ids) out.push(...(await getReviewsForListing(id)));
  return out.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0) || b.createdAt - a.createdAt);
}

export async function countReviewsForProduct(productId: string): Promise<number> {
  await ensureSchema();
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(reviews)
    .innerJoin(listings, eq(reviews.listingId, listings.id))
    .where(eq(listings.productId, productId));
  return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

export async function getProductById(id: string) {
  await ensureSchema();
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getProductBySlug(slug: string) {
  await ensureSchema();
  const rows = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function findProductByIdentityKey(identityKey: string) {
  await ensureSchema();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.identityKey, identityKey))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertProduct(input: {
  id?: string;
  slug: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  images?: string[];
  specs?: Record<string, unknown>;
  identityKey?: string | null;
}): Promise<ProductRow> {
  await ensureSchema();
  const existing = await getProductBySlug(input.slug);
  const ts = now();
  if (existing) {
    await db
      .update(products)
      .set({
        title: input.title || existing.title,
        brand: input.brand ?? existing.brand,
        category: input.category ?? existing.category,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        images: input.images ? JSON.stringify(input.images) : existing.images,
        specs: input.specs ? JSON.stringify(input.specs) : existing.specs,
        identityKey: input.identityKey ?? existing.identityKey,
        updatedAt: ts,
      })
      .where(eq(products.id, existing.id));
    return (await getProductById(existing.id))!;
  }
  const id = input.id ?? uid();
  await db.insert(products).values({
    id,
    slug: input.slug,
    title: input.title,
    brand: input.brand ?? null,
    category: input.category ?? null,
    imageUrl: input.imageUrl ?? null,
    images: input.images ? JSON.stringify(input.images) : null,
    specs: input.specs ? JSON.stringify(input.specs) : null,
    identityKey: input.identityKey ?? null,
    createdAt: ts,
    updatedAt: ts,
  });
  return (await getProductById(id))!;
}

export async function listProducts(limit = 60) {
  await ensureSchema();
  return db.select().from(products).orderBy(desc(products.updatedAt)).limit(limit);
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export async function getListingById(id: string) {
  await ensureSchema();
  const rows = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getListingByMerchantProduct(merchant: string, merchantProductId: string) {
  await ensureSchema();
  const rows = await db
    .select()
    .from(listings)
    .where(and(eq(listings.merchant, merchant), eq(listings.merchantProductId, merchantProductId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getListingsByProduct(productId: string) {
  await ensureSchema();
  return db.select().from(listings).where(eq(listings.productId, productId));
}

export async function upsertListing(input: {
  productId: string;
  merchant: string;
  merchantProductId: string;
  url: string;
  title?: string | null;
  price?: number | null;
  mrp?: number | null;
  inStock?: boolean | null;
  seller?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  imageUrl?: string | null;
  shipping?: number | null;
}): Promise<ListingRow> {
  await ensureSchema();
  const ts = now();
  const existing = await getListingByMerchantProduct(input.merchant, input.merchantProductId);
  if (existing) {
    await db
      .update(listings)
      .set({
        productId: input.productId,
        url: input.url,
        title: input.title ?? existing.title,
        price: input.price ?? existing.price,
        mrp: input.mrp ?? existing.mrp,
        inStock: input.inStock ?? existing.inStock,
        seller: input.seller ?? existing.seller,
        rating: input.rating ?? existing.rating,
        reviewCount: input.reviewCount ?? existing.reviewCount,
        imageUrl: input.imageUrl ?? existing.imageUrl,
        shipping: input.shipping ?? existing.shipping,
        updatedAt: ts,
      })
      .where(eq(listings.id, existing.id));
    return (await getListingById(existing.id))!;
  }
  const id = uid();
  await db.insert(listings).values({
    id,
    productId: input.productId,
    merchant: input.merchant,
    merchantProductId: input.merchantProductId,
    url: input.url,
    title: input.title ?? null,
    price: input.price ?? null,
    mrp: input.mrp ?? null,
    currency: "INR",
    inStock: input.inStock ?? null,
    seller: input.seller ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    imageUrl: input.imageUrl ?? null,
    shipping: input.shipping ?? null,
    lastCheckedAt: null,
    nextCheckAt: null,
    failureCount: 0,
    lastError: null,
    createdAt: ts,
    updatedAt: ts,
  });
  return (await getListingById(id))!;
}

export async function updateListingState(
  id: string,
  patch: Partial<{
    price: number | null;
    mrp: number | null;
    inStock: boolean | null;
    seller: string | null;
    rating: number | null;
    reviewCount: number | null;
    imageUrl: string | null;
    shipping: number | null;
    lastCheckedAt: number | null;
    nextCheckAt: number | null;
    failureCount: number;
    lastError: string | null;
  }>,
) {
  await ensureSchema();
  await db
    .update(listings)
    .set({ ...patch, updatedAt: now() })
    .where(eq(listings.id, id));
}

/** True when this listing is on the live feed inside its 20-minute window. */
export async function hasActiveLiveDeal(listingId: string): Promise<boolean> {
  await ensureSchema();
  const cutoff = Date.now() - 20 * 60 * 1000;
  const rows = await db
    .select({ id: liveDeals.id })
    .from(liveDeals)
    .where(
      and(
        eq(liveDeals.listingId, listingId),
        eq(liveDeals.status, "ACTIVE"),
        gte(liveDeals.verifiedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getDueListings(limit = 10) {
  await ensureSchema();
  const ts = now();
  return db
    .select()
    .from(listings)
    .where(
      and(
        // Only stores we can actually read directly.
        inArray(listings.merchant, ["amazon", "flipkart"]),
        or(isNull(listings.nextCheckAt), lte(listings.nextCheckAt, ts)),
        // Flipkart ids are case-insensitive, but the unique index is not.
        sql.raw(canonicalListingWhere("listings", "twin")),
      ),
    )
    .orderBy(sql`${listings.nextCheckAt} IS NULL DESC`, listings.nextCheckAt)
    .limit(limit);
}

/**
 * Listings worth topping up from the public price tracker, freshest-value first:
 * the deepest records (what the homepage shows) that have waited longest.
 * After a sync the listing is rescheduled, so the queue rotates on its own.
 */
export async function getSyncCandidates(limit = 6) {
  await ensureSchema();
  return db
    .select({
      id: listings.id,
      merchant: listings.merchant,
      merchantProductId: listings.merchantProductId,
      title: listings.title,
      price: listings.price,
      lastCheckedAt: listings.lastCheckedAt,
      failureCount: listings.failureCount,
    })
    .from(listings)
    .innerJoin(observations, eq(observations.listingId, listings.id))
    // The provider only fills stores we cannot read directly. Amazon and
    // Flipkart have a store-page worker of their own, and a provider point
    // must never be mistaken for a first-party check.
    .where(
      and(
        inArray(listings.merchant, [...priceTrackedMerchants]),
        notInArray(listings.merchant, ["amazon", "flipkart"]),
      ),
    )
    .groupBy(
      listings.id,
      listings.merchant,
      listings.merchantProductId,
      listings.title,
      listings.price,
      listings.lastCheckedAt,
      listings.failureCount,
      listings.nextCheckAt,
    )
    .orderBy(
      sql`${listings.nextCheckAt} IS NULL DESC`,
      sql`${listings.nextCheckAt} ASC`,
      sql`count(${observations.id}) DESC`,
      sql`max(${observations.observedAt}) ASC`,
    )
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Observations                                                        */
/* ------------------------------------------------------------------ */

export async function addObservation(input: {
  listingId: string;
  price: number | null;
  mrp?: number | null;
  shipping?: number | null;
  coupon?: number | null;
  bankDiscount?: number | null;
  effectivePrice?: number | null;
  seller?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  inStock?: boolean | null;
  source: string;
  observedAt?: number;
}): Promise<ObservationRow> {
  await ensureSchema();
  const id = uid();
  const ts = input.observedAt ?? now();
  await db.insert(observations).values({
    id,
    listingId: input.listingId,
    price: input.price,
    mrp: input.mrp ?? null,
    shipping: input.shipping ?? null,
    coupon: input.coupon ?? null,
    bankDiscount: input.bankDiscount ?? null,
    effectivePrice: input.effectivePrice ?? input.price ?? null,
    seller: input.seller ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    inStock: input.inStock ?? null,
    source: input.source,
    observedAt: ts,
    createdAt: now(),
  });
  const rows = await db.select().from(observations).where(eq(observations.id, id)).limit(1);
  return rows[0];
}

export async function getObservations(listingId: string, sinceTs?: number) {
  await ensureSchema();
  const where = sinceTs
    ? and(eq(observations.listingId, listingId), gte(observations.observedAt, sinceTs))
    : eq(observations.listingId, listingId);
  return db.select().from(observations).where(where).orderBy(observations.observedAt);
}

export async function getLatestObservation(listingId: string) {
  await ensureSchema();
  const rows = await db
    .select()
    .from(observations)
    .where(eq(observations.listingId, listingId))
    .orderBy(desc(observations.observedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function countObservations(listingId: string) {
  await ensureSchema();
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(observations)
    .where(eq(observations.listingId, listingId));
  return rows[0]?.n ?? 0;
}

/** Listings with recent observations, for the live deals feed. */
export async function getRecentListings(limit = 120) {
  await ensureSchema();
  return db
    .select()
    .from(listings)
    .where(sql`${listings.lastCheckedAt} IS NOT NULL`)
    .orderBy(desc(listings.lastCheckedAt))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export async function createAlert(input: {
  productId: string;
  listingId: string;
  alertType?: string;
  targetPrice?: number | null;
  baselinePrice?: number | null;
  targetPercent?: number | null;
  targetScore?: number | null;
  channel?: string;
  contact?: string | null;
  isPersistent?: boolean;
}): Promise<AlertRow> {
  await ensureSchema();
  const id = uid();
  const ts = now();
  await db.insert(alerts).values({
    id,
    productId: input.productId,
    listingId: input.listingId,
    alertType: input.alertType ?? "TARGET_PRICE",
    targetPrice: input.targetPrice ?? null,
    baselinePrice: input.baselinePrice ?? null,
    targetPercent: input.targetPercent ?? null,
    targetScore: input.targetScore ?? null,
    status: "ARMED",
    channel: input.channel ?? "telegram",
    contact: input.contact ?? null,
    cooldownUntil: null,
    lastTriggeredAt: null,
    lastTriggerPrice: null,
    triggerCount: 0,
    isPersistent: input.isPersistent ?? true,
    createdAt: ts,
    updatedAt: ts,
  });
  return (await getAlertById(id))!;
}

export async function getAlertById(id: string) {
  await ensureSchema();
  const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getAlertsForListing(listingId: string) {
  await ensureSchema();
  return db.select().from(alerts).where(eq(alerts.listingId, listingId));
}

export async function listAlerts(limit = 100) {
  await ensureSchema();
  return db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(limit);
}

export async function listAlertsByContact(contact: string) {
  await ensureSchema();
  return db.select().from(alerts).where(eq(alerts.contact, contact)).orderBy(desc(alerts.createdAt));
}

export async function updateAlert(id: string, patch: Partial<AlertRow>) {
  await ensureSchema();
  await db
    .update(alerts)
    .set({ ...patch, updatedAt: now() })
    .where(eq(alerts.id, id));
  return getAlertById(id);
}

export async function recordAlertEvent(alertId: string, type: string, payload: unknown) {
  await ensureSchema();
  await db.insert(alertEvents).values({
    id: uid(),
    alertId,
    type,
    payload: JSON.stringify(payload),
    createdAt: now(),
  });
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export async function recordEvent(type: string, payload: Record<string, unknown> = {}) {
  try {
    await ensureSchema();
    await db.insert(events).values({
      id: uid(),
      type,
      payload: JSON.stringify(payload),
      createdAt: now(),
    });
  } catch {
    /* analytics must never break the request */
  }
}

export async function getEventCounts(sinceTs: number) {
  await ensureSchema();
  return db
    .select({ type: events.type, n: sql<number>`count(*)` })
    .from(events)
    .where(gte(events.createdAt, sinceTs))
    .groupBy(events.type);
}
