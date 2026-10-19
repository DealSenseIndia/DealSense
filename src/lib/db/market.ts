import { sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { median } from "../utils";

export interface MarketContext {
  category: string;
  low: number;
  high: number;
  median: number;
  sampleSize: number;
}

/**
 * Real market context for a category, computed from every product DealSense
 * has verified. Lets us describe a product's price sensibly even before it
 * has its own history.
 */
export async function getCategoryContext(category: string | null): Promise<MarketContext | null> {
  if (!category) return null;
  await ensureSchema();

  const rows = await db
    .select({ price: listings.price })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(and(eq(products.category, category), isNotNull(listings.price)));

  const prices = rows.map((r) => r.price as number).filter((p) => p > 0);
  if (prices.length < 3) return null;

  prices.sort((a, b) => a - b);
  const med = median(prices) as number;
  // 15th–85th percentile band = the "typical price range" shoppers care about.
  const lo = prices[Math.floor(prices.length * 0.15)];
  const hi = prices[Math.floor(prices.length * 0.85)];

  return {
    category,
    low: lo,
    high: hi,
    median: med,
    sampleSize: prices.length,
  };
}

/** All distinct categories we have verified products in, with counts. */
export async function listCategories() {
  await ensureSchema();
  return db
    .select({
      category: products.category,
      count: sql<number>`count(distinct ${products.id})`,
    })
    .from(products)
    .where(isNotNull(products.category))
    .groupBy(products.category)
    .orderBy(sql`count(distinct ${products.id}) desc`);
}

/** Price bands across the whole catalogue (used on the homepage). */
export async function getCatalogueStats() {
  await ensureSchema();
  const rows = await db
    .select({ price: listings.price })
    .from(listings)
    .where(isNotNull(listings.price));
  const prices = rows.map((r) => r.price as number).filter((p) => p > 0);
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  return {
    count: prices.length,
    low: prices[0],
    high: prices[prices.length - 1],
    median: median(prices) as number,
  };
}
