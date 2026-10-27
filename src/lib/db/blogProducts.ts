import { client, ensureSchema } from "./client";

export interface BlogProductCard {
  slug: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  mrp: number | null;
  merchant: string;
}

/**
 * The products an article points at, read from the live catalogue.
 *
 * Only the cheapest listing per product is shown, preferring one that is in
 * stock. If a slug no longer exists (a product was dropped), it is simply
 * absent from the result — the article keeps rendering without a dead card.
 */
export async function getBlogProducts(slugs: string[]): Promise<BlogProductCard[]> {
  const wanted = [...new Set(slugs.filter(Boolean))].slice(0, 12);
  if (!wanted.length) return [];
  await ensureSchema();
  const placeholders = wanted.map(() => "?").join(", ");
  const res = await client.execute({
    sql: `SELECT p.slug AS slug, p.title AS title, p.image_url AS imageUrl,
                 l.price AS price, l.mrp AS mrp, l.merchant AS merchant, l.in_stock AS inStock
          FROM products p
          JOIN listings l ON l.product_id = p.id
          WHERE p.slug IN (${placeholders})`,
    args: wanted,
  });

  const best = new Map<string, { card: BlogProductCard; stock: boolean }>();
  for (const row of res.rows) {
    const slug = String(row.slug);
    const price = row.price === null || row.price === undefined ? null : Number(row.price);
    const stock = row.inStock === null || row.inStock === undefined ? true : Boolean(Number(row.inStock));
    const card: BlogProductCard = {
      slug,
      title: String(row.title),
      imageUrl: row.imageUrl ? String(row.imageUrl) : null,
      price,
      mrp: row.mrp === null || row.mrp === undefined ? null : Number(row.mrp),
      merchant: String(row.merchant),
    };
    const prev = best.get(slug);
    // In-stock beats out-of-stock; within the same state, the cheaper listing wins.
    const better =
      !prev ||
      (stock && !prev.stock) ||
      (stock === prev.stock && (card.price ?? Infinity) < (prev.card.price ?? Infinity));
    if (better) best.set(slug, { card, stock });
  }
  return wanted.map((s) => best.get(s)?.card).filter((c): c is BlogProductCard => Boolean(c));
}
