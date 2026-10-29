import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, observations, products } from "./schema";
import { resolveLeaf } from "./taxonomy";

export interface SimilarProduct {
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  rating: number | null;
  reviewCount: number | null;
  observations: number;
  /** Recent recorded prices, oldest -> newest. */
  spark: number[];
  href: string;
  /** Why we picked it — shown as a small label. */
  reason: string;
}

/**
 * Real products that are close to this one, from our own catalogue.
 *
 * Ranked by: same brand AND same category first, then same brand, then
 * same category, then a lower price for the same category.
 */
export async function getSimilarProducts(
  productId: string,
  limit = 8,
): Promise<SimilarProduct[]> {
  await ensureSchema();

  const current = await db
    .select({
      id: products.id,
      title: products.title,
      brand: products.brand,
      category: products.category,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const me = current[0];
  if (!me) return [];

  const myLeaf = resolveLeaf(me.category);
  const myBrand = (me.brand ?? "").trim().toLowerCase();

  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      brand: products.brand,
      category: products.category,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      reviewCount: listings.reviewCount,
      listingId: listings.id,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(and(isNotNull(listings.price), sql`${products.id} <> ${productId}`));

  // Best listing per product. Series are fetched only for the handful we end
  // up showing — reading every observation here cost seconds per page.
  const byProduct = new Map<string, { row: (typeof rows)[number] }>();

  for (const r of rows) {
    const prev = byProduct.get(r.slug);
    if (!prev) {
      byProduct.set(r.slug, { row: r });
      continue;
    }
    if ((r.rating ?? 0) > (prev.row.rating ?? 0)) {
      byProduct.set(r.slug, { row: r });
    }
  }

  const scored: (SimilarProduct & { score: number; listingId: string })[] = [];

  for (const { row: r } of byProduct.values()) {
    if (!r.price) continue;
    const leaf = resolveLeaf(r.category);
    const brand = (r.brand ?? "").trim().toLowerCase();
    const sameLeaf = !!myLeaf && leaf === myLeaf;
    const sameBrand = !!myBrand && brand === myBrand;

    if (!sameLeaf && !sameBrand) continue;

    let score = 0;
    let reason = "";
    if (sameLeaf && sameBrand) {
      score = 100;
      reason = "Same brand & category";
    } else if (sameBrand) {
      score = 70;
      reason = "Same brand";
    } else {
      score = 50;
      reason = "Same category";
    }

    // Prefer products we have actually tracked more of.
    score += Math.min(10, (r.reviewCount ?? 0) / 5000);
    if ((r.rating ?? 0) >= 4) score += 3;

    const mrp = r.mrp && r.mrp > r.price ? r.mrp : null;
    scored.push({
      slug: r.slug,
      title: r.title,
      imageUrl: r.imageUrl,
      merchant: r.merchant,
      price: r.price,
      mrp,
      discountPct: mrp ? Math.round(((mrp - r.price) / mrp) * 100) : 0,
      rating: r.rating,
      reviewCount: r.reviewCount,
      observations: 0,
      spark: [],
      href: `/product/${r.slug}`,
      reason,
      score,
      listingId: r.listingId,
    });
  }

  const top = scored
    .sort((a, b) => b.score - a.score || b.rating! - a.rating!)
    .slice(0, limit);

  if (top.length) {
    const ids = top.map((t) => t.listingId);
    const seriesRows = await db
      .select({ listingId: observations.listingId, price: observations.price })
      .from(observations)
      .where(and(isNotNull(observations.price), inArray(observations.listingId, ids)))
      .orderBy(asc(observations.observedAt));
    const seriesByListing = new Map<string, number[]>();
    for (const o of seriesRows) {
      if (!o.price || o.price <= 0) continue;
      const list = seriesByListing.get(o.listingId) ?? [];
      list.push(o.price);
      seriesByListing.set(o.listingId, list);
    }
    for (const t of top) {
      const series = seriesByListing.get(t.listingId) ?? [];
      t.observations = series.length;
      t.spark = series.length > 24 ? series.slice(-24) : series;
    }
  }

  return top.map(({ score: _score, listingId: _listingId, ...rest }) => rest);
}
