import { client } from "./client";
import { resolveLeaf } from "./taxonomy";
import { slugify } from "../utils";

/** A category page only exists when there is enough to show. */
export const CATEGORY_PAGE_MIN = 5;

const CACHE_MS = 10 * 60 * 1000;

export interface CategoryProduct {
  id: string;
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  /** Number of dated price points we hold across this product's listings. */
  points: number;
}

export interface CategoryPageData {
  name: string;
  slug: string;
  products: CategoryProduct[];
  count: number;
  lowest: number;
}

let cache: { at: number; pages: CategoryPageData[]; bySlug: Map<string, CategoryPageData> } | null = null;

async function load(): Promise<NonNullable<typeof cache>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const res = await client.execute(`
    SELECT p.id, p.slug, p.title, p.category, p.image_url,
           l.merchant, l.price,
           (SELECT COUNT(*) FROM observations o
             WHERE o.listing_id IN (SELECT id FROM listings l2 WHERE l2.product_id = p.id)) AS points
    FROM products p
    JOIN listings l ON l.id = (
      SELECT id FROM listings l3
      WHERE l3.product_id = p.id AND l3.price IS NOT NULL
      ORDER BY l3.price ASC LIMIT 1
    )
    WHERE p.category IS NOT NULL
  `);

  const byLeaf = new Map<string, CategoryProduct[]>();
  for (const row of res.rows) {
    const leaf = resolveLeaf(row.category ? String(row.category) : null);
    if (!leaf) continue;
    const product: CategoryProduct = {
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      imageUrl: row.image_url ? String(row.image_url) : null,
      merchant: String(row.merchant),
      price: Number(row.price),
      points: Number(row.points ?? 0),
    };
    const list = byLeaf.get(leaf) ?? [];
    list.push(product);
    byLeaf.set(leaf, list);
  }

  const pages: CategoryPageData[] = [];
  const bySlug = new Map<string, CategoryPageData>();
  for (const [name, products] of byLeaf) {
    if (products.length < CATEGORY_PAGE_MIN) continue;
    const slug = slugify(name);
    // Slugs must be unique; a collision would serve the wrong shelf.
    if (bySlug.has(slug)) continue;
    products.sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));
    const page: CategoryPageData = {
      name,
      slug,
      products,
      count: products.length,
      lowest: Math.min(...products.map((p) => p.price)),
    };
    pages.push(page);
    bySlug.set(slug, page);
  }

  pages.sort((a, b) => b.count - a.count);
  const next = { at: Date.now(), pages, bySlug };
  cache = next;
  return next;
}

/** Every category that qualifies for its own page, biggest first. */
export async function listCategoryPages(): Promise<CategoryPageData[]> {
  return (await load()).pages;
}

export async function getCategoryPage(slug: string): Promise<CategoryPageData | null> {
  return (await load()).bySlug.get(slug) ?? null;
}
