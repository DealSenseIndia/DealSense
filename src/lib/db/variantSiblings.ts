import { and, asc, eq, isNotNull, like, sql } from "drizzle-orm";
import { db, ensureSchema } from "./client";
import { listings, products } from "./schema";

/**
 * The other versions of the same product — the same phone in another colour,
 * the same shoe in another size. Stores publish these as separate products,
 * each with its own photo and its own price, so we can show the buyer the
 * real alternatives instead of a made-up list.
 */

export interface VariantSibling {
  slug: string;
  title: string;
  imageUrl: string | null;
  merchant: string;
  price: number;
  mrp: number | null;
  colour: string | null;
  size: string | null;
  href: string;
}

const COLOUR_RE =
  /\b(black|white|blue|green|red|grey|gray|silver|gold|golden|pink|purple|orange|brown|navy|beige|titanium|midnight|graphite|charcoal|rose|ivory|cream|khaki|olive|maroon|magenta|teal|cyan|lime|wine|burgundy|jet|onyx|alabaster|porcelain|platinum|bronze|copper|sand|stone|mint|peach|lavender|indigo|violet|turquoise|aqua|tan|coral|mustard|indigo|stonewash|wash|multi|multicolou?r)\b/i;

const SIZE_RE =
  /\b(gb|tb|mb|kb|inch|inches|"|'|uk|us|eu|size|ml|l\b|litre|ltr|pack|count|rating|ssd|ram|storage|memory|variant)\b/i;

/** Pull the colour and the size out of a store title. */
export function parseTitleVariant(title: string): {
  colour: string | null;
  size: string | null;
} {
  const m = title.match(/\(([^)]*)\)/);
  if (!m) return { colour: null, size: null };

  const parts = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let colour: string | null = null;
  const sizeParts: string[] = [];

  for (const p of parts) {
    if (!colour && COLOUR_RE.test(p) && !SIZE_RE.test(p)) {
      colour = p;
      continue;
    }
    sizeParts.push(p);
  }

  return { colour, size: sizeParts.length ? sizeParts.join(", ") : null };
}

/**
 * The family key: the first few words of the title, before any bracketed
 * variant. "Samsung Galaxy S25 Ultra 5G (Titanium Black, 256 GB)" and
 * "Samsung Galaxy S25 Ultra 5G AI Smartphone (Titanium Silverblue, ...)"
 * both reduce to "samsung galaxy s25 ultra".
 */
export function familyKey(title: string): string {
  const head = title.split("(")[0].trim();
  return head.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
}

/** The word-prefix we use to pull candidates out of the database. */
function sqlPrefix(title: string): string {
  const head = title.split("(")[0].trim();
  return head.split(/\s+/).slice(0, 3).join(" ") + " ";
}

export async function getVariantSiblings(
  productId: string,
  limit = 8,
): Promise<VariantSibling[]> {
  await ensureSchema();

  const me = await db
    .select({
      id: products.id,
      title: products.title,
      brand: products.brand,
      category: products.category,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  const current = me[0];
  if (!current) return [];

  const key = familyKey(current.title);
  const prefix = sqlPrefix(current.title);

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      imageUrl: products.imageUrl,
      merchant: listings.merchant,
      price: listings.price,
      mrp: listings.mrp,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(
      and(
        isNotNull(listings.price),
        sql`${products.id} <> ${productId}`,
        like(products.title, `${prefix}%`),
      ),
    )
    .orderBy(asc(listings.price));

  // One row per product — the cheapest listing we hold for it.
  const byProduct = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (familyKey(r.title) !== key) continue;
    const prev = byProduct.get(r.id);
    if (!prev || (r.price ?? Infinity) < (prev.price ?? Infinity)) {
      byProduct.set(r.id, r);
    }
  }

  const out: VariantSibling[] = [];
  for (const r of byProduct.values()) {
    if (!r.price) continue;
    const v = parseTitleVariant(r.title);
    if (!v.colour && !v.size) continue;
    out.push({
      slug: r.slug,
      title: r.title,
      imageUrl: r.imageUrl,
      merchant: r.merchant,
      price: r.price,
      mrp: r.mrp && r.mrp > r.price ? r.mrp : null,
      colour: v.colour,
      size: v.size,
      href: `/product/${r.slug}`,
    });
    if (out.length >= limit) break;
  }

  return out;
}
