import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";

export interface ShelfProduct {
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  rating: number | null;
  url: string;
  affiliateUrl: string;
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
};

export const SUPPORTED_STORES = Object.keys(STORE_META);

/**
 * Group the catalogue into category shelves (Buyhatke-style panels).
 * Only products with a real price are included.
 *
 * @param perCategory how many products to keep per category shelf
 * @param maxCategories how many category shelves to return (0 = all)
 */
/** Categories we want to lead the homepage, in priority order. */
const CATEGORY_PRIORITY = [
  "Smartphones",
  "APPLE Mobiles",
  "OnePlus Mobiles",
  "Samsung Mobiles",
  "Mobiles & Gadgets",
  "Laptops",
  "Traditional Laptops",
  "All in One PCs",
  "Televisions",
  "In-Ear",
  "Over-Ear",
  "Bluetooth Speakers",
  "Wrist Watches",
  "Sunglasses",
  "Air Fryers",
  "Refrigerators",
  "Washing Machines",
  "Dresses",
  "Kurtas & Kurtis",
  "Sarees",
  "Tshirts",
  "Backpacks",
  "Perfume",
  "Lipstick",
  "Serum and Gel",
];

/** Accessories are noise on a homepage — never show them in a shelf. */
const ACCESSORY_RE =
  /\b(case|cases|cover|covers|back cover|tempered glass|screen guard|protector|charger|chargers|adapter|cable|cables|data cable|earphones? case|pouch|holder|stand|wallet|bag for|strap|band for|stickers?)\b/i;

export async function getShelves(perCategory = 8, maxCategories = 0): Promise<Shelf[]> {
  const limit = perCategory;
  await ensureSchema();

  const rows = await db
    .select({
      slug: products.slug,
      title: products.title,
      category: products.category,
      imageUrl: products.imageUrl,
      brand: products.brand,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
      rating: listings.rating,
      url: listings.url,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(and(isNotNull(listings.price), isNotNull(products.category)))
    .orderBy(desc(listings.price));

  const byCategory = new Map<string, ShelfProduct[]>();

  for (const r of rows) {
    const price = r.price ?? 0;
    if (price <= 0) continue;
    if (ACCESSORY_RE.test(r.title)) continue;
    const cat = (r.category ?? "Other").trim();
    const mrp = r.mrp && r.mrp > price ? r.mrp : null;
    const discountPct = mrp ? Math.round(((mrp - price) / mrp) * 100) : 0;

    const list = byCategory.get(cat) ?? [];
    if (list.length >= limit) continue;
    if (list.some((p) => p.title.slice(0, 30).toLowerCase() === r.title.slice(0, 30).toLowerCase()))
      continue;

    const meta = STORE_META[r.merchant] ?? { name: r.merchant, short: r.merchant.slice(0, 2).toUpperCase(), color: "#64748B" };
    list.push({
      slug: r.slug,
      title: r.title,
      imageUrl: r.imageUrl,
      merchant: r.merchant,
      price,
      mrp,
      discountPct,
      rating: r.rating,
      url: r.url,
      affiliateUrl: r.url,
    });
    byCategory.set(cat, list);
  }

  const rank = (c: string) => {
    const i = CATEGORY_PRIORITY.findIndex((p) => c.toLowerCase().includes(p.toLowerCase()));
    return i === -1 ? 999 : i;
  };

  return [...byCategory.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([category, list]) => ({
      category,
      maxDiscount: Math.max(...list.map((p) => p.discountPct), 0),
      products: list,
    }))
    .sort(
      (a, b) =>
        rank(a.category) - rank(b.category) ||
        b.maxDiscount - a.maxDiscount ||
        b.products.length - a.products.length,
    )
    .slice(0, maxCategories > 0 ? maxCategories : undefined);
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
