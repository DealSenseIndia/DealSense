import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { closePlaywright } from "../src/lib/merchants/http";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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

async function amazonSearchAsins(query: string, n = 4): Promise<string[]> {
  try {
    const res = await fetch(`https://www.amazon.in/s?k=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
    });
    const html = await res.text();
    const set = new Set<string>();
    for (const m of html.matchAll(/\/dp\/([A-Z0-9]{10})/g)) {
      set.add(m[1]);
      if (set.size >= n) break;
    }
    return [...set];
  } catch {
    return [];
  }
}

async function main() {
  await ensureSchema();

  const fkProducts = await db
    .select({ id: products.id, title: products.title, slug: products.slug })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(eq(listings.merchant, "flipkart"));

  const unique = new Map<string, string>();
  for (const p of fkProducts) unique.set(p.id, p.title);

  console.log(`Searching Amazon for ${unique.size} Flipkart products…\n`);
  let found = 0;

  for (const [, title] of unique) {
    const q = queryFromTitle(title);
    const asins = await amazonSearchAsins(q, 4);
    let matched = false;
    for (const asin of asins) {
      const r = await analyzeUrl(`https://www.amazon.in/dp/${asin}`);
      if (r.ok) {
        console.log(`✓ "${q}" → amazon: ${r.product?.title?.slice(0, 52)} (₹${r.listing?.price})`);
        matched = true;
        found++;
        break;
      }
      await sleep(600);
    }
    if (!matched) console.log(`✗ "${q}" → no Amazon match`);
    await sleep(900);
  }

  console.log(`\nAmazon matches added: ${found}`);
  await closePlaywright();
}

main().then(() => process.exit(0));
