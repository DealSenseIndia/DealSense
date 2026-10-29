import { client, ensureSchema } from "./db/client";
import { uid } from "./db/queries";
import { storeMeta } from "./config";

/**
 * The live feed: deals we verified ourselves and are currently standing behind.
 *
 * Rules that keep it honest:
 *   • a card is only published from a store page the refresh worker actually
 *     read; its `verifiedAt` is that read, never the time we fetched a feed;
 *   • only the two stores we can read directly (Amazon and Flipkart) are
 *     eligible — a provider series for a store we cannot read is not a check;
 *   • a deal must be at or near its own recorded low, or well under its own
 *     average, and carry at least four recorded points;
 *   • the feed only shows checks from the last 20 minutes, so a stalled worker
 *     empties it rather than showing stale "live" prices.
 */

const VERIFY_AFTER_MS = 3 * 60 * 1000;
const FEED_TTL_MS = 20 * 60 * 1000;
const DIRECT_MERCHANTS = new Set(["amazon", "flipkart"]);

export interface LiveDealCard {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  merchantName: string;
  price: number;
  mrp: number | null;
  lowPrice: number | null;
  avgPrice: number | null;
  verifiedAt: number;
  expiresAt: number | null;
  badge: "low" | "drop";
  dropPct: number | null;
}

interface ListingRow {
  id: string;
  productId: string;
  merchant: string;
  merchantProductId: string;
  title: string | null;
  price: number | null;
  mrp: number | null;
  inStock: boolean | null;
  lastCheckedAt: number | null;
  failureCount: number;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadListing(id: string): Promise<ListingRow | null> {
  const res = await client.execute({
    sql: `SELECT id, product_id AS productId, merchant, merchant_product_id AS merchantProductId,
                 title, price, mrp, in_stock AS inStock, last_checked_at AS lastCheckedAt,
                 failure_count AS failureCount
          FROM listings WHERE id = ? LIMIT 1`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    productId: String(row.productId),
    merchant: String(row.merchant),
    merchantProductId: String(row.merchantProductId),
    title: row.title ? String(row.title) : null,
    price: num(row.price),
    mrp: num(row.mrp),
    inStock: row.inStock === null ? null : Boolean(Number(row.inStock)),
    lastCheckedAt: num(row.lastCheckedAt),
    failureCount: Number(row.failureCount ?? 0),
  };
}

async function seriesStats(listingId: string) {
  const res = await client.execute({
    sql: `SELECT COUNT(*) AS n, MIN(price) AS low, AVG(price) AS avg, MAX(observed_at) AS lastAt
          FROM observations WHERE listing_id = ? AND price IS NOT NULL AND price > 0`,
    args: [listingId],
  });
  const row = res.rows[0] ?? {};
  return {
    n: Number(row.n ?? 0),
    low: num(row.low),
    avg: num(row.avg),
    lastAt: num(row.lastAt),
  };
}

function qualifies(price: number | null, stock: boolean | null, n: number, low: number | null, avg: number | null) {
  if (stock === false) return false;
  if (!price || price <= 0) return false;
  if (n < 4) return false;
  if (low !== null && price <= low * 1.005) return true;
  if (avg !== null && price <= avg * 0.9) return true;
  return false;
}

/**
 * Publish a deal only with the time the store page was actually read. The
 * worker is the source of `verifiedAt`; a provider fetch cannot move it.
 */
async function publish(
  listing: ListingRow,
  price: number,
  stats: { low: number | null; avg: number | null },
  source: string,
  verifiedAt: number,
) {
  const now = Date.now();
  const checkedAt = Math.min(verifiedAt, now);
  const existing = await client.execute({
    sql: `SELECT id, price, starts_at AS startsAt, verified_at AS verifiedAt FROM live_deals
          WHERE listing_id = ? AND status = 'ACTIVE' ORDER BY verified_at DESC LIMIT 1`,
    args: [listing.id],
  });
  const row = existing.rows[0];
  if (row) {
    const startedAt = Number(row.startsAt);
    const previousVerifiedAt = Number(row.verifiedAt ?? 0);
    const nextVerifiedAt = Math.max(previousVerifiedAt, checkedAt);
    const changed = Math.abs(Number(row.price) - price) > 0.5;
    await client.execute({
      sql: `UPDATE live_deals
            SET price = ?, mrp = ?, low_price = ?, avg_price = ?, source = ?,
                starts_at = ?, verified_at = ?, status = 'ACTIVE', updated_at = ?
            WHERE id = ?`,
      args: [
        price,
        listing.mrp,
        stats.low,
        stats.avg,
        source,
        changed ? nextVerifiedAt : startedAt,
        nextVerifiedAt,
        now,
        String(row.id),
      ],
    });
    return String(row.id);
  }
  const id = uid();
  await client.execute({
    sql: `INSERT INTO live_deals
            (id, listing_id, product_id, price, mrp, low_price, avg_price, source,
             starts_at, verified_at, expires_at, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', ?, ?)`,
    args: [
      id,
      listing.id,
      listing.productId,
      price,
      listing.mrp,
      stats.low,
      stats.avg,
      source,
      checkedAt,
      checkedAt,
      now,
      now,
    ],
  });
  return id;
}

async function expire(dealId: string) {
  await client.execute({
    sql: `UPDATE live_deals SET status = 'EXPIRED', updated_at = ? WHERE id = ?`,
    args: [Date.now(), dealId],
  });
}

/** Expire deals whose store check is no longer recent, or no longer qualifies. */
export async function verifyLiveDeals(limit = 4) {
  await ensureSchema();
  const now = Date.now();
  await client
    .execute({
      sql: `UPDATE live_deals SET status = 'EXPIRED', updated_at = ?
            WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < ?`,
      args: [now, now],
    })
    .catch(() => {});

  const due = await client.execute({
    sql: `SELECT id, listing_id AS listingId FROM live_deals
          WHERE status = 'ACTIVE' AND verified_at < ?
          ORDER BY verified_at ASC LIMIT ?`,
    args: [now - VERIFY_AFTER_MS, limit],
  });

  const results: { dealId: string; outcome: string; price: number | null }[] = [];
  for (const row of due.rows) {
    const dealId = String(row.id);
    const listingId = String(row.listingId);
    const listing = await loadListing(listingId);
    if (!listing) {
      await expire(dealId);
      results.push({ dealId, outcome: "expired-listing", price: null });
      continue;
    }
    const checkedAt = listing.lastCheckedAt;
    const recent =
      DIRECT_MERCHANTS.has(listing.merchant) &&
      checkedAt !== null &&
      now - checkedAt <= FEED_TTL_MS;
    const stats = recent ? await seriesStats(listing.id) : null;
    const price = listing.price;
    if (
      recent &&
      checkedAt !== null &&
      stats &&
      price !== null &&
      qualifies(price, listing.inStock, stats.n, stats.low, stats.avg)
    ) {
      await publish(listing, price, stats, "price_watch", checkedAt);
      results.push({ dealId, outcome: "still-live", price });
    } else {
      await expire(dealId);
      results.push({
        dealId,
        outcome: recent ? "no-longer-qualifies" : "check-too-old",
        price,
      });
    }
  }
  return results;
}

/**
 * Publish deals from checks the refresh worker made in the last twenty
 * minutes. No second store read and no provider guess: the card's timestamp
 * is the worker's check.
 */
export async function promoteLiveDeals(limit = 3) {
  await ensureSchema();
  const cutoff = Date.now() - FEED_TTL_MS;

  const candidates = await client.execute({
    sql: `SELECT l.id AS listingId
          FROM listings l
          JOIN observations o ON o.listing_id = l.id
          WHERE l.in_stock = 1 AND l.price IS NOT NULL AND l.price >= 199
            AND l.merchant IN ('amazon', 'flipkart')
            AND l.last_checked_at IS NOT NULL AND l.last_checked_at > ?
            AND NOT EXISTS (
              SELECT 1 FROM live_deals d WHERE d.listing_id = l.id AND d.status = 'ACTIVE'
            )
          GROUP BY l.id
          HAVING COUNT(o.id) >= 4
             AND (l.price <= MIN(o.price) * 1.02 OR l.price <= AVG(o.price) * 0.9)
          ORDER BY l.last_checked_at DESC,
                   (l.price * 1.0 / NULLIF(MIN(o.price), 0)) ASC,
                   COUNT(o.id) DESC
          LIMIT ?`,
    args: [cutoff, limit],
  });

  const results: { listingId: string; outcome: string; price: number | null }[] = [];
  for (const row of candidates.rows) {
    const listingId = String(row.listingId);
    const listing = await loadListing(listingId);
    if (!listing || listing.lastCheckedAt === null) continue;
    const stats = await seriesStats(listingId);
    if (
      listing.price !== null &&
      qualifies(listing.price, listing.inStock, stats.n, stats.low, stats.avg)
    ) {
      await publish(listing, listing.price, stats, "price_watch", listing.lastCheckedAt);
      results.push({ listingId, outcome: "published", price: listing.price });
    } else {
      results.push({ listingId, outcome: "rejected", price: listing.price });
    }
  }
  return results;
}

/** A direct store read in the last twenty minutes is the only proof we accept. */
function recentlyChecked(
  listing: ListingRow,
): listing is ListingRow & { lastCheckedAt: number } {
  return (
    DIRECT_MERCHANTS.has(listing.merchant) &&
    listing.lastCheckedAt !== null &&
    Date.now() - listing.lastCheckedAt <= FEED_TTL_MS
  );
}

/**
 * Publish from a store page we read seconds ago (a lead we just imported).
 * If the import was not a direct read, it is not a live deal.
 */
export async function publishFromFreshImport(listingId: string, source: string) {
  await ensureSchema();
  const listing = await loadListing(listingId);
  if (!listing) return { outcome: "missing" as const, price: null };
  if (!recentlyChecked(listing)) return { outcome: "rejected" as const, price: listing.price };
  const stats = await seriesStats(listing.id);
  if (!listing.price || !qualifies(listing.price, listing.inStock, stats.n, stats.low, stats.avg)) {
    return { outcome: "rejected" as const, price: listing.price };
  }
  await publish(listing, listing.price, stats, source, listing.lastCheckedAt);
  return { outcome: "published" as const, price: listing.price };
}

/** Publish a lead only when its listing has a direct store check from the last twenty minutes. */
export async function publishFromLead(listingId: string, source: string) {
  await ensureSchema();
  const listing = await loadListing(listingId);
  if (!listing) return { outcome: "missing" as const, price: null };
  if (!recentlyChecked(listing)) return { outcome: "rejected" as const, price: listing.price };
  const stats = await seriesStats(listing.id);
  if (!listing.price || !qualifies(listing.price, listing.inStock, stats.n, stats.low, stats.avg)) {
    return { outcome: "rejected" as const, price: listing.price };
  }
  await publish(listing, listing.price, stats, source, listing.lastCheckedAt);
  return { outcome: "published" as const, price: listing.price };
}

/** Active deals verified recently enough to call themselves live. */
export async function getLiveDeals(limit = 24): Promise<LiveDealCard[]> {
  await ensureSchema();
  const now = Date.now();
  const res = await client.execute({
    sql: `SELECT d.id, d.price, d.mrp, d.low_price AS lowPrice, d.avg_price AS avgPrice,
                 d.verified_at AS verifiedAt, d.expires_at AS expiresAt,
                 p.slug, p.title, p.image_url AS imageUrl, l.merchant
          FROM live_deals d
          JOIN products p ON p.id = d.product_id
          JOIN listings l ON l.id = d.listing_id
          WHERE d.status = 'ACTIVE' AND d.verified_at >= ?
            AND (d.expires_at IS NULL OR d.expires_at > ?)
            AND l.merchant IN ('amazon', 'flipkart') AND l.in_stock = 1
          ORDER BY d.verified_at DESC, (d.price * 1.0 / NULLIF(d.avg_price, 0)) ASC
          LIMIT ?`,
    args: [now - FEED_TTL_MS, now, limit],
  });

  return res.rows.map((row) => {
    const price = Number(row.price);
    const lowPrice = num(row.lowPrice);
    const avgPrice = num(row.avgPrice);
    const merchant = String(row.merchant);
    const atLow = lowPrice !== null && price <= lowPrice * 1.005;
    const dropPct = avgPrice && avgPrice > price ? Math.round(((avgPrice - price) / avgPrice) * 100) : null;
    return {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      imageUrl: row.imageUrl ? String(row.imageUrl) : null,
      merchant,
      merchantName: storeMeta(merchant).name,
      price,
      mrp: num(row.mrp),
      lowPrice,
      avgPrice,
      verifiedAt: Number(row.verifiedAt),
      expiresAt: num(row.expiresAt),
      badge: atLow ? "low" : "drop",
      dropPct,
    };
  });
}
