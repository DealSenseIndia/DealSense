import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, observations, products } from "./schema";

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

/**
 * Pick one product that tells a complete, TRUE price story:
 * it has the deepest recorded history AND a genuine recent price drop.
 * Everything the hero renders comes from this — no invented numbers.
 */
export async function getHistorySpotlight(): Promise<HistorySpotlight | null> {
  await ensureSchema();

  const rows = await db
    .select({
      listingId: observations.listingId,
      price: observations.price,
      at: observations.observedAt,
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      merchant: listings.merchant,
      curPrice: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      source: observations.source,
    })
    .from(observations)
    .innerJoin(listings, eq(observations.listingId, listings.id))
    .innerJoin(products, eq(products.id, listings.productId))
    .where(and(isNotNull(listings.price), isNotNull(observations.price)))
    .orderBy(asc(observations.observedAt));

  const byListing = new Map<
    string,
    {
      meta: (typeof rows)[number];
      points: { price: number; at: number }[];
      imported: number;
    }
  >();

  for (const r of rows) {
    const price = r.price as number;
    if (!Number.isFinite(price) || price <= 0) continue;
    const entry = byListing.get(r.listingId) ?? { meta: r, points: [], imported: 0 };
    entry.points.push({ price, at: r.at });
    if (r.source === "imported" || r.source.startsWith("imported:")) entry.imported++;
    byListing.set(r.listingId, entry);
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

    const curPrice = meta.curPrice as number;
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
    const series = points.filter((_, i) => i % step === 0).map((p) => p.price);
    if (series.length > SERIES_POINTS) series.length = SERIES_POINTS;

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
      series,
      history: points.map((p) => ({ t: p.at, price: p.price })),
      importedPoints: imported,
      low,
      lastDrop,
      spanDays,
    };
  }

  return best;
}
