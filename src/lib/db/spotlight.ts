import { client, ensureSchema } from "./client";

export interface HistorySpotlight {
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  rating: number | null;
  href: string;
  /** Number of recorded price points. */
  points: number;
  /** Oldest -> newest price series (capped). */
  series: number[];
  /** Full recorded series for the interactive chart. */
  history: { t: number; price: number }[];
  /** Records imported from a public tracker (all legacy imports are PriceHistory.ai). */
  importedPoints: number;
  /** All-time low with the date it was observed. */
  low: { price: number; at: number } | null;
  /** Most recent real drop (price went down). */
  lastDrop: { amount: number; at: number } | null;
  /** Span covered by the recorded history, in days. */
  spanDays: number;
}

const SERIES_POINTS = 24;
/** How many of the deepest listings get a full series for scoring. Each one
 * costs a slice of network transfer, and the winner is always among the very
 * deepest — eight is enough to keep the choice honest without the payload. */
const CANDIDATES = 8;

/**
 * Pick one product that tells a complete, TRUE price story:
 * it has the deepest recorded history AND a genuine recent price drop.
 * Everything the hero renders comes from this — no invented numbers.
 *
 * The first version read every observation row (219k) across three joined
 * tables and grouped them in JavaScript. Against the local file that was fast
 * enough to hide; against production it was a 48-second download for one hero
 * card. The shortlist is now ranked in SQL and only its series is fetched.
 */
export async function getHistorySpotlight(): Promise<HistorySpotlight | null> {
  await ensureSchema();

  // One row per listing. Ordering by span as a tie-breaker keeps long-lived
  // products ahead of flash-in-the-pan imports with the same count.
  const ranked = await client.execute({
    sql: `
      SELECT o.listing_id AS listingId, COUNT(*) AS n
      FROM observations o
      JOIN listings l ON l.id = o.listing_id
      WHERE o.price IS NOT NULL AND o.price > 0 AND l.price IS NOT NULL
      GROUP BY o.listing_id
      HAVING COUNT(*) >= 3
      ORDER BY n DESC, (MAX(o.observed_at) - MIN(o.observed_at)) DESC
      LIMIT ${CANDIDATES}
    `,
    args: [],
  });
  const ids = ranked.rows.map((r) => String(r.listingId));
  if (!ids.length) return null;

  const placeholders = ids.map(() => "?").join(", ");
  const series = await client.execute({
    sql: `
      SELECT o.listing_id AS listingId, o.price AS price, o.observed_at AS at,
             o.source AS source, p.slug AS slug, p.title AS title,
             p.image_url AS imageUrl, l.merchant AS merchant,
             l.price AS curPrice, l.mrp AS mrp, l.rating AS rating
      FROM observations o
      JOIN listings l ON l.id = o.listing_id
      JOIN products p ON p.id = l.product_id
      WHERE o.listing_id IN (${placeholders}) AND o.price IS NOT NULL AND o.price > 0
      ORDER BY o.observed_at ASC
    `,
    args: ids,
  });

  type Meta = {
    slug: string;
    title: string;
    imageUrl: string | null;
    merchant: string;
    curPrice: number;
    mrp: number | null;
    rating: number | null;
  };
  const byListing = new Map<
    string,
    { meta: Meta; points: { price: number; at: number }[]; imported: number }
  >();

  for (const row of series.rows) {
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const listingId = String(row.listingId);
    const entry = byListing.get(listingId) ?? {
      meta: {
        slug: String(row.slug),
        title: String(row.title),
        imageUrl: row.imageUrl ? String(row.imageUrl) : null,
        merchant: String(row.merchant),
        curPrice: Number(row.curPrice),
        mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
        rating: row.rating === null || row.rating === undefined ? null : Number(row.rating),
      },
      points: [],
      imported: 0,
    };
    entry.points.push({ price, at: Number(row.at) });
    const source = String(row.source);
    if (source === "imported" || source.startsWith("imported:")) entry.imported++;
    byListing.set(listingId, entry);
  }

  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
  let best: HistorySpotlight | null = null;
  let bestScore = -1;

  for (const { meta, points, imported } of byListing.values()) {
    if (points.length < 3) continue;

    const prices = points.map((p) => p.price);
    const lowPrice = Math.min(...prices);
    const lowIdx = prices.indexOf(lowPrice);
    const low = { price: lowPrice, at: points[lowIdx].at };

    // Most recent genuine drop.
    let lastDrop: { amount: number; at: number } | null = null;
    for (let i = points.length - 1; i > 0; i--) {
      const amount = points[i - 1].price - points[i].price;
      if (amount > 0) {
        lastDrop = { amount, at: points[i].at };
        break;
      }
    }

    const curPrice = meta.curPrice;
    const mrp = meta.mrp && meta.mrp > curPrice ? meta.mrp : null;
    const spanDays = Math.max(
      1,
      Math.round((points[points.length - 1].at - points[0].at) / (24 * 60 * 60 * 1000)),
    );

    // Prefer: recent drop + deep history + long span.
    const score =
      points.length * 3 +
      spanDays * 0.5 +
      (lastDrop && lastDrop.at >= cutoff ? 2000 : 0) +
      (lastDrop ? 200 : 0);

    if (score <= bestScore) continue;
    bestScore = score;

    const step = Math.max(1, Math.ceil(points.length / SERIES_POINTS));
    const capped = points.filter((_, i) => i % step === 0).map((p) => p.price);
    if (capped.length > SERIES_POINTS) capped.length = SERIES_POINTS;

    best = {
      slug: meta.slug,
      title: meta.title,
      imageUrl: meta.imageUrl,
      merchant: meta.merchant,
      price: curPrice,
      mrp,
      discountPct: mrp ? Math.round(((mrp - curPrice) / mrp) * 100) : 0,
      rating: meta.rating,
      href: `/product/${meta.slug}`,
      points: points.length,
      series: capped,
      history: points.map((p) => ({ t: p.at, price: p.price })),
      importedPoints: imported,
      low,
      lastDrop,
      spanDays,
    };
  }

  return best;
}
