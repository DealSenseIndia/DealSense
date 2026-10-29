import { isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";
import { goPath } from "../affiliate";
import { groupForCategory, resolveLeaf } from "./taxonomy";
import { dealQuality, getCatalogueRows, type DealRow } from "./deals";

export interface ShelfProduct {
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  listingId: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  rating: number | null;
  reviewCount: number | null;
  url: string;
  affiliateUrl: string;
  /** True when this price is the lowest we have ever recorded for it. */
  atLow: boolean;
  /** Recorded price points behind this product. */
  observations: number;
}

export interface Shelf {
  category: string;
  maxDiscount: number;
  products: ShelfProduct[];
}

/** Store brand colours for every marketplace we support. */
export const STORE_META: Record<
  string,
  { name: string; short: string; color: string }
> = {
  amazon: { name: "Amazon", short: "AZ", color: "#FF9900" },
  flipkart: { name: "Flipkart", short: "FK", color: "#2874F0" },
  myntra: { name: "Myntra", short: "MY", color: "#FF3F6C" },
  ajio: { name: "AJIO", short: "AJ", color: "#2C4152" },
  firstcry: { name: "FirstCry", short: "FC", color: "#F48C06" },
  libas: { name: "Libas", short: "LB", color: "#8B1E5B" },
  biba: { name: "Biba", short: "BB", color: "#C2185B" },
  tatacliq: { name: "Tata CLiQ", short: "TC", color: "#6E2B8B" },
  reliancedigital: { name: "Reliance Digital", short: "RD", color: "#D71920" },
  nykaa: { name: "Nykaa", short: "NY", color: "#E5008E" },
  croma: { name: "Croma", short: "CR", color: "#00A0E9" },
  meesho: { name: "Meesho", short: "MS", color: "#57057A" },
  shopsy: { name: "Shopsy", short: "SH", color: "#6D22B8" },
};

export const SUPPORTED_STORES = Object.keys(STORE_META);

/**
 * Group the catalogue into category shelves (Buyhatke-style panels).
 * Only products with a real price are included.
 *
 * @param perCategory how many products to keep per category shelf
 * @param maxCategories how many category shelves to return (0 = all)
 */
/** Accessories are noise on a homepage — never show them in a shelf. */
const ACCESSORY_RE =
  /\b(case|cases|cover|covers|back cover|tempered glass|screen guard|protector|charger|chargers|adapter|cable|cables|data cable|earphones? case|pouch|holder|stand|wallet|bag for|strap|band for|stickers?)\b/i;

/** Store shelves that are just navigation, not a product category. */
/**
 * Store categories are sometimes a shelf next to the product, not the product
 * itself. A TV filed under "Smartphones" or a sideboard under "File Cabinets"
 * must not headline that category. These are the obvious cross-category words.
 */
const FOREIGN_TITLE: Record<string, RegExp> = {
  Smartphones:
    /\b(buds|earbuds|headphones?|speakers?|soundbar|tv|television|qled|oled|laptops?|shoes?|sneakers?|shirts?|kurtas?|sarees?|sofas?|mattress|chairs?|desks?|tables?|cabinets?|printers?|routers?|ssd|gpus?|graphics card|processors?|motherboards?|cameras?|watches?)\b/i,
  "Smart TVs":
    /\b(cabinets?|sideboards?|phones?|smartphones?|laptops?|earbuds?|buds|shoes?|shirts?|kurtas?|sofas?|chairs?|desks?|tables?|processors?|motherboards?|graphics card)\b/i,
  Televisions:
    /\b(cabinets?|sideboards?|phones?|smartphones?|laptops?|earbuds?|buds|shoes?|shirts?|kurtas?|sofas?|chairs?|desks?|tables?|processors?|motherboards?|graphics card)\b/i,
  "Mobiles & Gadgets":
    /\b(buds|earbuds?|headphones?|speakers?|soundbar|tv|television|laptops?|shoes?|sneakers?|shirts?|kurtas?|sarees?|sofas?|mattress|chairs?|desks?|tables?|cabinets?|printers?|routers?|ssd|gpus?|graphics card|processors?|motherboards?)\b/i,
  "Home Decor":
    /\b(glue gun|drill|saw|screwdriver|power tool|charger|cable|adapter|battery)\b/i,
  Earbuds:
    /\b(phones?|smartphones?|laptops?|tv|television|shoes?|sneakers?|shirts?|kurtas?|sarees?|sofas?|mattress|chairs?|desks?|tables?|cabinets?|processors?|motherboards?|graphics card|routers?|printers?)\b/i,
  Headphones:
    /\b(phones?|smartphones?|laptops?|tv|television|shoes?|sneakers?|shirts?|kurtas?|sofas?|chairs?|desks?|tables?|cabinets?|processors?|motherboards?|graphics card)\b/i,
  Processors:
    /\b(motherboards?|combo kit|tv|phones?|laptops?|shoes?|shirts?|kurtas?|sofas?|chairs?|desks?|tables?|cabinets?|graphics card)\b/i,
  "Graphics Cards":
    /\b(phones?|laptops?|tv|earbuds?|shoes?|shirts?|kurtas?|sofas?|chairs?|desks?|tables?|cabinets?|processors?|motherboards?)\b/i,
  "Running Shoes":
    /\b(phones?|laptops?|tv|earbuds?|buds|shirts?|kurtas?|sarees?|sofas?|mattress|chairs?|desks?|tables?|cabinets?|processors?|motherboards?|graphics card)\b/i,
};

const GENERIC_CATEGORY = new Set([
  "other",
  "all",
  "clothing",
  "apparel",
  "fashion",
  "new arrivals",
  "best sellers",
  "featured",
  "accessories",
  "combos @ nykaa",
  "jewellery",
]);

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1);
}

/**
 * Score a candidate for a category shelf. Cheapness inside the category,
 * how good today's price is against its own recorded history, rating and
 * review volume all matter. Expensive outliers never win.
 */
function shelfScore(r: DealRow, categoryMedian: number): number {
  const cheapness = clamp01(1 - r.price / Math.max(categoryMedian * 1.9, 1));
  const fresh =
    r.lastSeenAt && Date.now() - r.lastSeenAt < 10 * 24 * 60 * 60 * 1000 ? 0.04 : 0;
  return dealQuality(r) * 0.74 + cheapness * 0.22 + fresh;
}

/**
 * Category shelves built from live deal data, not from the store's own
 * merchandising order. Every product has at least three recorded price
 * points, and each shelf is filled with the cheapest strong buys in its
 * category — across every store we track.
 */
export async function getShelves(perCategory = 8, maxCategories = 0): Promise<Shelf[]> {
  await ensureSchema();
  const rows = await getCatalogueRows();

  const byCategory = new Map<string, DealRow[]>();
  for (const r of rows) {
    if (!r.category) continue;
    if (r.observations < 3) continue;
    if (ACCESSORY_RE.test(r.title)) continue;
    let leaf = resolveLeaf(r.category);
    if (!leaf) continue;
    // Store shelves called "Cabinets" are too broad: a TV sideboard is not a
    // file cabinet, and a storage unit is not one either.
    if (leaf === "File Cabinets") {
      if (/\b(tv|sideboard|crockery)\b/i.test(r.title)) leaf = "TV Units";
      else if (/\b(cabinet|storage)\b/i.test(r.title)) leaf = "Storage";
    }
    if (GENERIC_CATEGORY.has(leaf.toLowerCase())) continue;
    const foreign = FOREIGN_TITLE[leaf];
    if (foreign && foreign.test(r.title)) continue;
    const list = byCategory.get(leaf) ?? [];
    list.push(r);
    byCategory.set(leaf, list);
  }

  interface BuiltShelf {
    shelf: Shelf;
    heat: number;
    groupKey: string;
  }
  const built: BuiltShelf[] = [];

  for (const [category, group] of byCategory) {
    if (group.length < 3) continue;

    // Median-price ceiling trims the one flagship product that would
    // otherwise represent a whole budget category with a ₹1.2L item.
    const med = median(group.map((r) => r.price));
    const affordable = group.filter((r) => r.price <= med * 1.55);
    const pool = affordable.length >= 3 ? affordable : group;

    const ranked = [...pool]
      .map((r) => ({ r, score: shelfScore(r, med) }))
      .sort((a, b) => b.score - a.score);

    // Spread across stores, then fill without the cap if we still need rows.
    const picks: { r: DealRow; score: number }[] = [];
    const perStore: Record<string, number> = {};
    const seen = new Set<string>();
    for (const item of ranked) {
      if (picks.length >= perCategory) break;
      const key = item.r.title.slice(0, 28).toLowerCase();
      if (seen.has(key)) continue;
      if ((perStore[item.r.merchant] ?? 0) >= 2) continue;
      picks.push(item);
      seen.add(key);
      perStore[item.r.merchant] = (perStore[item.r.merchant] ?? 0) + 1;
    }
    for (const item of ranked) {
      if (picks.length >= perCategory) break;
      const key = item.r.title.slice(0, 28).toLowerCase();
      if (seen.has(key)) continue;
      picks.push(item);
      seen.add(key);
    }
    if (!picks.length) continue;

    const products: ShelfProduct[] = picks.map(({ r }) => {
      const mrp = r.mrp && r.mrp > r.price ? r.mrp : null;
      return {
        slug: r.slug,
        title: r.title,
        imageUrl: r.imageUrl,
        merchant: r.merchant,
        listingId: r.listingId ?? "",
        price: r.price,
        mrp,
        discountPct: r.discountPct,
        rating: r.rating,
        reviewCount: r.reviewCount,
        url: r.url,
        affiliateUrl: goPath(r.listingId ?? "", "shelf"),
        atLow:
          r.low !== null && r.observations >= 3 && r.price <= r.low * 1.01,
        observations: r.observations,
      };
    });

    const taxonomyGroup = groupForCategory(category);
    const groupKey = taxonomyGroup?.slug ?? `cat:${category.toLowerCase()}`;
    const heat =
      picks.slice(0, 3).reduce((sum, p) => sum + p.score, 0) /
      Math.min(3, picks.length) +
      Math.min(group.length, 40) / 1000;

    built.push({
      shelf: {
        category,
        maxDiscount: Math.max(...products.map((p) => p.discountPct), 0),
        products,
      },
      heat,
      groupKey,
    });
  }

  // Hottest shelves first, but never let one umbrella (e.g. beauty) flood
  // the homepage: at most two leaves from the same taxonomy group.
  built.sort((a, b) => b.heat - a.heat);
  const wanted = maxCategories > 0 ? maxCategories : built.length;
  const out: Shelf[] = [];
  const perGroup: Record<string, number> = {};
  for (const b of built) {
    if (out.length >= wanted) break;
    if ((perGroup[b.groupKey] ?? 0) >= 2) continue;
    out.push(b.shelf);
    perGroup[b.groupKey] = (perGroup[b.groupKey] ?? 0) + 1;
  }
  // If diversity capped us below the requested number, take the rest.
  if (out.length < wanted) {
    const have = new Set(out.map((s) => s.category));
    for (const b of built) {
      if (out.length >= wanted) break;
      if (have.has(b.shelf.category)) continue;
      out.push(b.shelf);
      have.add(b.shelf.category);
    }
  }
  return out;
}

/** Headline numbers for the homepage stats strip. */
export async function getCatalogueStats() {
  await ensureSchema();
  const [prodCount, listCount, priceSum] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(products),
    db.select({ n: sql<number>`count(*)` }).from(listings).where(isNotNull(listings.price)),
    db.select({ s: sql<number>`sum(${listings.price})` }).from(listings).where(isNotNull(listings.price)),
  ]);
  const storeRows = await db
    .select({ m: listings.merchant, n: sql<number>`count(*)` })
    .from(listings)
    .where(isNotNull(listings.price))
    .groupBy(listings.merchant);
  return {
    products: prodCount[0]?.n ?? 0,
    listings: listCount[0]?.n ?? 0,
    stores: storeRows.length,
    storeRows: storeRows.map((r) => ({ merchant: r.m, count: r.n })),
    catalogueValue: priceSum[0]?.s ?? 0,
  };
}

/** Observation count across the whole catalogue (our "price points tracked"). */
export async function getTotalObservations(): Promise<number> {
  await ensureSchema();
  const rows = await db.select({ n: sql<number>`count(*)` }).from(
    sql`observations`,
  );
  return rows[0]?.n ?? 0;
}
