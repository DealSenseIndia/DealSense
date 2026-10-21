/**
 * Grow cross-store coverage.
 *
 * For every product we track on one store, look for the SAME product on the
 * other stores, and attach the match to the SAME product row so the compare
 * panel can price it side by side. A wrong pair is worse than none, so every
 * candidate has to pass the same-product check.
 *
 *   npx tsx scripts/compare-merge.ts --limit 40
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { upsertListing } from "../src/lib/db/queries";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";
import { searchAmazon } from "../src/lib/merchants/search";
import { isAccessory, isSameProduct, storageOf, titleSimilarity } from "../src/lib/engine/identity";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const limit = idx !== -1 ? Number(args[idx + 1]) || 40 : 40;

  // Products that only live on one store right now.
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
  const product = new Map<string, { id: string; title: string; merchant: string; url: string }[]>();
  for (const r of rows) {
    if (!stores.has(r.id)) stores.set(r.id, new Set());
    stores.get(r.id)!.add(r.merchant);
    const list = product.get(r.id) ?? [];
    list.push({ id: r.id, title: r.title, merchant: r.merchant, url: r.url });
    product.set(r.id, list);
  }

  // Only Amazon <-> Flipkart for now — those are the two we scrape live.
  const targets = [...product.entries()]
    .filter(([id, list]) => {
      const s = stores.get(id)!;
      return list.length === 1 && (s.has("amazon") || s.has("flipkart"));
    })
    .slice(0, limit);

  console.log(`looking for cross-store twins for ${targets.length} products\n`);

  let paired = 0;
  let tried = 0;

  for (const [id, list] of targets) {
    const me = list[0];
    const wantAmazon = me.merchant === "flipkart";
    const queries = [queryFromTitle(me.title), queryWithStorage(me.title)].filter(
      Boolean,
    ) as string[];

    tried++;
    let done = false;

    for (const q of queries) {
      if (done) break;
      for (let attempt = 1; attempt <= 2 && !done; attempt++) {
        const hits = await searchAmazon(q, 8);
        if (!hits.length) {
          await sleep(1500 * attempt);
          continue;
        }
        for (const hit of hits) {
          if (isAccessory(hit.title)) continue;
          if (!isSameProduct(hit.title, me.title)) continue;

          // Fetch the real page so we get a real price, not a search snippet.
          const out = await fetchProduct(hit.url);
          if (!out.ok || !out.product || out.product.price === null) {
            await sleep(600);
            continue;
          }
          const p = out.product;

          // Attach the listing to the product we already track.
          await upsertListing({
            productId: id,
            merchant: wantAmazon ? "amazon" : "flipkart",
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
            `  ok  ${me.merchant} -> ${wantAmazon ? "amazon" : "flipkart"}  ${p.title?.slice(0, 46)}  ₹${p.price}  [match ${(titleSimilarity(hit.title, me.title) * 100).toFixed(0)}%]`,
          );
          paired++;
          done = true;
          break;
        }
        if (!done) await sleep(1500 * attempt);
      }
    }

    if (!done) console.log(`  --  ${me.title.slice(0, 52)}`);
    await sleep(900);
  }

  console.log(`\npaired ${paired} of ${tried} products across stores.`);
  await closePlaywright();
}

main().then(() => process.exit(0));
