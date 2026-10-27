import { client, ensureSchema } from "./db/client";
import { uid } from "./db/queries";
import { priceTrackedMerchants, storeMeta } from "./config";
import { PROVIDER_MERCHANTS } from "./engine/providers/pricehistoryAi";
import { syncListingHistory } from "./engine/sync";

/**
 * The live feed: deals we verified ourselves and are currently standing behind.
 *
 * Rules that keep it honest:
 *   • nothing is published until the price and stock are re-fetched from the
 *     source we track — a lead is only a hint of where to look;
 *   • a deal must be at or near its own recorded low, or well under its own
 *     average, and carry at least four recorded points;
 *   • every card is re-checked a few minutes later; the moment the price moves
 *     or the listing goes out of stock, it leaves the feed;
 *   • the feed only shows deals verified in the last 20 minutes, so a stalled
 *     worker empties it rather than showing stale "live" prices.
 */

const VERIFY_AFTER_MS = 3 * 60 * 1000;
const FEED_TTL_MS = 20 * 60 * 1000;
/** Don't probe the same listing again for six hours after a look. */
const PROBE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Re-fetch one listing; returns its fresh price and whether it still qualifies. */
async function verifyOne(listing: ListingRow) {
  await syncListingHistory({
    id: listing.id,
    merchant: listing.merchant,
    merchantProductId: listing.merchantProductId,
    title: listing.title,
    price: listing.price,
    lastCheckedAt: listing.lastCheckedAt,
    failureCount: listing.failureCount,
  }).catch(() => null);

  const fresh = await loadListing(listing.id);
  const stats = await seriesStats(listing.id);
  const price = fresh?.price ?? null;
  return {
    listing: fresh,
    stats,
    price,
    ok: fresh ? qualifies(price, fresh.inStock, stats.n, stats.low, stats.avg) : false,
  };
}

async function publish(
  listing: ListingRow,
  price: number,
  stats: { low: number | null; avg: number | null },
  source: string,
) {
  const now = Date.now();
  const existing = await client.execute({
    sql: `SELECT id, price, starts_at AS startsAt FROM live_deals
          WHERE listing_id = ? AND status = 'ACTIVE' ORDER BY verified_at DESC LIMIT 1`,
    args: [listing.id],
  });
  const row = existing.rows[0];
  if (row) {
    const startedAt = Number(row.startsAt);
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
        changed ? now : startedAt,
        now,
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
    args: [id, listing.id, listing.productId, price, listing.mrp, stats.low, stats.avg, source, now, now, now, now],
  });
  return id;
}

async function expire(dealId: string) {
  await client.execute({
    sql: `UPDATE live_deals SET status = 'EXPIRED', updated_at = ? WHERE id = ?`,
    args: [Date.now(), dealId],
  });
}

async function recordProbe(listingId: string, ok: boolean, price: number | null) {
  await client.execute({
    sql: `INSERT INTO events (id, type, payload, created_at) VALUES (?, 'live_probe', ?, ?)`,
    args: [uid(), JSON.stringify({ listingId, ok, price }), Date.now()],
  }).catch(() => {});
}

/** Re-check the deals that are due, expiring any that no longer hold. */
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
    const checked = await verifyOne(listing);
    if (checked.ok && checked.price !== null) {
      await publish(listing, checked.price, checked.stats, "price_watch");
      results.push({ dealId, outcome: "still-live", price: checked.price });
    } else {
      await expire(dealId);
      results.push({ dealId, outcome: "expired", price: checked.price });
    }
    await sleep(700);
  }
  return results;
}

/**
 * Find listings whose current price is at/near their own low or well under
 * their average, verify a few, and publish the ones that survive.
 */
export async function promoteLiveDeals(limit = 3) {
  await ensureSchema();
  const merchants = priceTrackedMerchants.filter((m) => (PROVIDER_MERCHANTS as readonly string[]).includes(m));
  if (!merchants.length) return [];
  const placeholders = merchants.map(() => "?").join(", ");
  const probeCutoff = Date.now() - PROBE_COOLDOWN_MS;

  const candidates = await client.execute({
    sql: `SELECT l.id AS listingId
          FROM listings l
          JOIN observations o ON o.listing_id = l.id
          WHERE l.in_stock = 1 AND l.price IS NOT NULL AND l.price >= 199
            AND l.merchant IN (${placeholders})
            AND NOT EXISTS (
              SELECT 1 FROM live_deals d WHERE d.listing_id = l.id AND d.status = 'ACTIVE'
            )
            AND NOT EXISTS (
              SELECT 1 FROM events e
              WHERE e.type = 'live_probe' AND e.created_at > ?
                AND json_extract(e.payload, '$.listingId') = l.id
            )
          GROUP BY l.id
          HAVING COUNT(o.id) >= 4
             AND (l.price <= MIN(o.price) * 1.02 OR l.price <= AVG(o.price) * 0.9)
          ORDER BY (l.price * 1.0 / NULLIF(MIN(o.price), 0)) ASC, COUNT(o.id) DESC
          LIMIT ?`,
    args: [...merchants, probeCutoff, limit],
  });

  const results: { listingId: string; outcome: string; price: number | null }[] = [];
  for (const row of candidates.rows) {
    const listingId = String(row.listingId);
    const listing = await loadListing(listingId);
    if (!listing) continue;
    const checked = await verifyOne(listing);
    await recordProbe(listingId, checked.ok, checked.price);
    if (checked.ok && checked.price !== null && checked.listing) {
      await publish(checked.listing, checked.price, checked.stats, "price_watch");
      results.push({ listingId, outcome: "published", price: checked.price });
    } else {
      results.push({ listingId, outcome: "rejected", price: checked.price });
    }
    await sleep(700);
  }
  return results;
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
