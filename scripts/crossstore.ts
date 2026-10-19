import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { closePlaywright } from "../src/lib/merchants/http";
import { searchAmazon } from "../src/lib/merchants/search";
import { isSameProduct, storageOf, titleSimilarity } from "../src/lib/engine/identity";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** "Apple iPhone 17 (White, 256 GB)" → "Apple iPhone 17" */
function queryFromTitle(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

/** Extra query form including the storage capacity. */
function queryWithStorage(title: string): string | null {
  const storage = storageOf(title)[0];
  if (!storage) return null;
  return `${queryFromTitle(title)} ${storage.replace(/gb/i, " GB")}`;
}

async function main() {
  await ensureSchema();

  const fkRows = await db
    .select({ id: products.id, title: products.title })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(eq(listings.merchant, "flipkart"));

  const unique = new Map<string, string>();
  for (const p of fkRows) unique.set(p.id, p.title);

  console.log(`Searching Amazon for ${unique.size} Flipkart products…\n`);
  let found = 0;

  for (const [, title] of unique) {
    const queries = [queryFromTitle(title), queryWithStorage(title)].filter(Boolean) as string[];
    let matched = false;

    for (const q of queries) {
      if (matched) break;
      // Up to 2 attempts per query form (Amazon occasionally serves a blank page).
      for (let attempt = 1; attempt <= 2 && !matched; attempt++) {
        const hits = await searchAmazon(q, 8);
        if (!hits.length) {
          await sleep(2000 * attempt);
          continue;
        }
        for (const hit of hits) {
          // Only accept a genuine match — never pair two different products.
          if (!isSameProduct(hit.title, title)) continue;
          const r = await analyzeUrl(hit.url);
          if (r.ok) {
            console.log(
              `✓ "${q}" → ${r.product?.title?.slice(0, 52)} (₹${r.listing?.price}) [match ${(titleSimilarity(hit.title, title) * 100).toFixed(0)}%]`,
            );
            matched = true;
            found++;
            break;
          }
          await sleep(700);
        }
        if (!matched) await sleep(1800 * attempt);
      }
    }

    if (!matched) console.log(`✗ "${queryFromTitle(title)}" → no Amazon match`);
    await sleep(1200);
  }

  console.log(`\nAmazon matches added: ${found}`);
  await closePlaywright();
}

main().then(() => process.exit(0));
