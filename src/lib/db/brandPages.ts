import { client } from "./client";
import { slugify } from "../utils";
import type { CategoryProduct } from "./categoryPages";

/** A brand page only exists when there is enough to show. */
export const BRAND_PAGE_MIN = 5;

const CACHE_MS = 10 * 60 * 1000;

export interface BrandPageData {
  name: string;
  slug: string;
  products: CategoryProduct[];
  count: number;
}

let cache: { at: number; pages: BrandPageData[]; bySlug: Map<string, BrandPageData> } | null = null;

async function load(): Promise<NonNullable<typeof cache>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const res = await client.execute(`
    SELECT p.id, p.slug, p.title, p.brand, p.image_url,
           l.merchant, l.price,
           (SELECT COUNT(*) FROM observations o
             WHERE o.listing_id IN (SELECT id FROM listings l2 WHERE l2.product_id = p.id)) AS points
    FROM products p
    JOIN listings l ON l.id = (
      SELECT id FROM listings l3
      WHERE l3.product_id = p.id AND l3.price IS NOT NULL
      ORDER BY l3.price ASC LIMIT 1
    )
    WHERE p.brand IS NOT NULL AND TRIM(p.brand) != ''
  `);

  // Brand strings arrive with inconsistent casing ("APPLE", "Apple"), so group
  // on a lower-case key and keep the spelling that appears most often.
  const groups = new Map<
    string,
    { spellings: Map<string, number>; products: CategoryProduct[] }
  >();

  for (const row of res.rows) {
    const raw = String(row.brand).trim();
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    const group: { spellings: Map<string, number>; products: CategoryProduct[] } =
      groups.get(key) ?? { spellings: new Map<string, number>(), products: [] };
    group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1);
    group.products.push({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      imageUrl: row.image_url ? String(row.image_url) : null,
      merchant: String(row.merchant),
      price: Number(row.price),
      points: Number(row.points ?? 0),
    });
    groups.set(key, group);
  }

  const pages: BrandPageData[] = [];
  const bySlug = new Map<string, BrandPageData>();
  for (const { spellings, products } of groups.values()) {
    if (products.length < BRAND_PAGE_MIN) continue;
    const winner = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    // Stores shout ("APPLE"); headings should not. Short acronyms such as
    // ASUS, LG and HP keep their casing.
    const name = winner.length > 4 && winner === winner.toUpperCase()
      ? winner[0] + winner.slice(1).toLowerCase()
      : winner;
    const slug = slugify(name);
    if (!slug || bySlug.has(slug)) continue;
    products.sort((a, b) => b.points - a.points || a.title.localeCompare(b.title));
    const page: BrandPageData = { name, slug, products, count: products.length };
    pages.push(page);
    bySlug.set(slug, page);
  }

  pages.sort((a, b) => b.count - a.count);
  const next = { at: Date.now(), pages, bySlug };
  cache = next;
  return next;
}

export async function listBrandPages(): Promise<BrandPageData[]> {
  return (await load()).pages;
}

/**
 * Cheap existence check for a single product page: brand totals only, no
 * catalogue join. The full `load()` is for the brand pages themselves.
 */
let countIndex: { at: number; counts: Map<string, { total: number; spellings: Map<string, number> }> } | null =
  null;

async function brandCounts() {
  if (countIndex && Date.now() - countIndex.at < CACHE_MS) return countIndex.counts;
  const res = await client.execute(
    "SELECT brand, COUNT(*) AS n FROM products WHERE brand IS NOT NULL AND TRIM(brand) != '' GROUP BY brand",
  );
  const counts = new Map<string, { total: number; spellings: Map<string, number> }>();
  for (const row of res.rows) {
    const raw = String(row.brand).trim();
    const key = raw.toLowerCase().replace(/\s+/g, " ");
    const entry = counts.get(key) ?? { total: 0, spellings: new Map<string, number>() };
    entry.total += Number(row.n);
    entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + Number(row.n));
    counts.set(key, entry);
  }
  countIndex = { at: Date.now(), counts };
  return counts;
}

/** The brand page URL for a raw store brand, or null when none exists. */
export async function brandPageHref(brand: string | null): Promise<string | null> {
  if (!brand) return null;
  const key = brand.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  const entry = (await brandCounts()).get(key);
  if (!entry || entry.total < BRAND_PAGE_MIN) return null;
  const winner = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const name =
    winner.length > 4 && winner === winner.toUpperCase()
      ? winner[0] + winner.slice(1).toLowerCase()
      : winner;
  return `/brands/${slugify(name)}`;
}

export async function getBrandPage(slug: string): Promise<BrandPageData | null> {
  return (await load()).bySlug.get(slug) ?? null;
}
