/**
 * Grow cross-store coverage.
 *
 * For every product we track on one store, find the SAME product on the
 * other store and attach it to the SAME product row, so the compare panel
 * can price them side by side.
 *
 * PriceHistory.ai is the bridge: its catalogue lists the same product on
 * Amazon, Flipkart, Myntra and the rest, with the real store URL. We take
 * that URL, read the price off the store's own page, and store it. A wrong
 * pair is worse than none, so every candidate has to pass the same-product
 * and same-variant checks.
 *
 *   npx tsx scripts/compare-merge.ts --limit 120
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { upsertListing } from "../src/lib/db/queries";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";
import { searchPriceHistoryAi } from "../src/lib/engine/providers/pricehistoryAi";
import { isAccessory, isSameProduct, sameVariant, storageOf } from "../src/lib/engine/identity";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The store we already have → the store we want to add. */
const WANT: Record<string, string> = {
  amazon: "flipkart",
  flipkart: "amazon",
  myntra: "amazon",
};

function queryFromTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

function queryWithStorage(title: string): string | null {
  const storage = storageOf(title)[0];
  if (!storage) return null;
  return `${queryFromTitle(title)} ${storage.replace(/gb/i, " GB")}`;
}

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const idx = args.indexOf("--limit");
  const limit = idx !== -1 ? Number(args[idx + 1]) || 120 : 120;

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      merchant: listings.merchant,
      url: listings.url,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id));

  const stores = new Map<string, Set<string>>();
  const byProduct = new Map<string, { id: string; title: string; merchant: string }[]>();
  for (const r of rows) {
    if (!stores.has(r.id)) stores.set(r.id, new Set());
    stores.get(r.id)!.add(r.merchant);
    const list = byProduct.get(r.id) ?? [];
    if (!list.some((l) => l.merchant === r.merchant)) {
      list.push({ id: r.id, title: r.title, merchant: r.merchant });
    }
    byProduct.set(r.id, list);
  }

  const targets = [...byProduct.entries()]
    .filter(([id, list]) => list.length === 1 && WANT[list[0].merchant])
    .slice(0, limit);

  console.log(`looking for cross-store twins for ${targets.length} products\n`);

  let paired = 0;
  let tried = 0;

  for (const [id, list] of targets) {
    const me = list[0];
    const want = WANT[me.merchant];
    const queries = [queryFromTitle(me.title), queryWithStorage(me.title)].filter(
      Boolean,
    ) as string[];

    tried++;
    let done = false;

    for (const q of queries) {
      if (done) break;

      let hits: Awaited<ReturnType<typeof searchPriceHistoryAi>> = [];
      try {
        hits = await searchPriceHistoryAi(q, 16);
      } catch {
        hits = [];
      }
      if (!hits.length) {
        await sleep(1200);
        continue;
      }

      for (const hit of hits) {
        if (hit.platform !== want) continue;
        if (!hit.title || !hit.url) continue;
        if (isAccessory(hit.title)) continue;
        if (!isSameProduct(hit.title, me.title)) continue;
        if (!sameVariant(hit.title, me.title)) continue;

        // Read the real price off the store's own page.
        const out = await fetchProduct(hit.url);
        if (!out.ok || !out.product || out.product.price === null) {
          await sleep(700);
          continue;
        }
        const p = out.product;

        await upsertListing({
          productId: id,
          merchant: want,
          merchantProductId: p.merchantProductId,
          url: p.url,
          title: p.title,
          price: p.price,
          mrp: p.mrp,
          inStock: p.inStock,
          rating: p.rating,
          reviewCount: p.reviewCount,
          imageUrl: p.imageUrl,
          shipping: p.shipping,
          seller: p.seller,
        });

        console.log(
          `  ok  ${me.merchant} + ${want}  ${p.title?.slice(0, 44)}  Rs ${p.price}`,
        );
        paired++;
        done = true;
        break;
      }

      if (!done) await sleep(1200);
    }

    if (!done) console.log(`  --  ${me.title.slice(0, 50)}`);
    await sleep(700);
  }

  console.log(`\npaired ${paired} of ${tried} products across stores.`);

  // Moving a listing leaves the product row it came from empty. Those rows
  // would 404 and, worse, hold an identity key that could attract a new
  // listing and split the history again. Hand the key to the survivor and
  // delete the empty row.
  const all = await db
    .select({ id: products.id, slug: products.slug, identityKey: products.identityKey })
    .from(products);
  const withListings = new Set(
    (
      await db.select({ productId: listings.productId }).from(listings)
    ).map((l) => l.productId),
  );

  let removed = 0;
  for (const p of all) {
    if (withListings.has(p.id)) continue;

    // Give the identity key to a product that still has listings.
    if (p.identityKey) {
      const heir = all.find(
        (o) => o.id !== p.id && o.identityKey === p.identityKey && withListings.has(o.id),
      );
      if (heir) {
        await db
          .update(products)
          .set({ identityKey: p.identityKey })
          .where(eq(products.id, heir.id));
      }
    }
    await db.delete(products).where(eq(products.id, p.id));
    removed++;
  }
  console.log(`removed ${removed} empty product row(s).`);

  await closePlaywright();
}

main().then(() => process.exit(0));
