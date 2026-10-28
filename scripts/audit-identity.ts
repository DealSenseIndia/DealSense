/**
 * Read-only identity audit.
 *
 *   npx tsx scripts/audit-identity.ts [--limit 25]
 *
 * Flags listings whose real title is a different product or variant from the
 * product they are attached to, plus duplicate rows and orphan records. It
 * reports evidence only; it never edits anything.
 */
import "./env";
import { client } from "../src/lib/db/client";
import { isSameProduct, sameVariant, titleSimilarity } from "../src/lib/engine/identity";

const args = process.argv.slice(2);
const idx = args.indexOf("--limit");
const limit = idx !== -1 ? Number(args[idx + 1]) || 25 : 25;

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function one(sql: string): Promise<number> {
  const r = await client.execute(sql);
  return Number(r.rows[0]?.n ?? 0);
}

(async () => {
  const allProducts = await client.execute("SELECT id, title FROM products");
  const allListings = await client.execute(
    "SELECT id, product_id, merchant, merchant_product_id, title FROM listings",
  );
  const byId = new Map(allProducts.rows.map((p) => [String(p.id), String(p.title ?? "")]));

  const flagged: {
    listingId: string;
    merchant: string;
    pid: string;
    product: string;
    listing: string;
    sim: number;
    variant: boolean;
  }[] = [];

  for (const l of allListings.rows) {
    const product = byId.get(String(l.product_id));
    if (!product) continue;
    const listingTitle = String(l.title ?? "");
    if (!listingTitle) continue;
    if (norm(product) === norm(listingTitle)) continue;
    const variant = sameVariant(product, listingTitle);
    const sim = titleSimilarity(product, listingTitle);
    if (!variant || !isSameProduct(product, listingTitle) || sim < 0.45) {
      flagged.push({
        listingId: String(l.id),
        merchant: String(l.merchant),
        pid: String(l.merchant_product_id),
        product,
        listing: listingTitle,
        sim: Math.round(sim * 100) / 100,
        variant,
      });
    }
  }

  flagged.sort((a, b) => Number(a.variant) - Number(b.variant) || a.sim - b.sim);

  const variantBreaks = flagged.filter((f) => !f.variant);
  console.log(`catalogue: ${allProducts.rows.length} products, ${allListings.rows.length} listings`);
  console.log(`flagged: ${flagged.length}  ·  variant breaks: ${variantBreaks.length}\n`);

  for (const f of flagged.slice(0, limit)) {
    console.log(
      `${f.variant ? "same-variant" : "VARIANT-BREAK"} sim=${f.sim} | ${f.merchant} ${f.pid} | ${f.listingId}\n  P: ${f.product}\n  L: ${f.listing}`,
    );
  }

  const orphans = await one(
    "SELECT COUNT(*) AS n FROM products p WHERE NOT EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id)",
  );
  const emptyListings = await one(
    "SELECT COUNT(*) AS n FROM listings l WHERE NOT EXISTS (SELECT 1 FROM observations o WHERE o.listing_id = l.id)",
  );
  const dupes = await one(
    "SELECT COUNT(*) AS n FROM (SELECT listing_id, observed_at FROM observations GROUP BY listing_id, observed_at HAVING COUNT(*) > 1)",
  );
  const dupMerchant = await one(
    "SELECT COUNT(*) AS n FROM (SELECT merchant, merchant_product_id FROM listings GROUP BY merchant, merchant_product_id HAVING COUNT(*) > 1)",
  );
  console.log(
    `\norphan products: ${orphans} · empty listings: ${emptyListings} · duplicate points: ${dupes} · duplicate merchant ids: ${dupMerchant}`,
  );
  process.exit(0);
})();
