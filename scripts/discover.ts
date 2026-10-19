import "./env";
import { ensureSchema } from "../src/lib/db/client";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { discoverFromJson, fetchFlipkartJson } from "../src/lib/merchants/flipkartApi";
import { closePlaywright } from "../src/lib/merchants/http";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const AMAZON_CATEGORIES = ["electronics", "computers", "home-kitchen"];
const FLIPKART_CATEGORIES = ["/mobiles", "/electronics", "/televisions", "/laptops", "/audio"];

// Searched on BOTH stores to force genuine cross-store matches.
const CROSS_STORE_QUERIES = ["iPhone 17 256GB", "vivo T5 Lite 5G", "OnePlus Nord Buds 3r", "Redmi 15C 5G"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function amazonSearchAsins(query: string, n = 5): Promise<string[]> {
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

async function discoverAmazon(limit: number): Promise<string[]> {
  const asins = new Set<string>();
  for (const cat of AMAZON_CATEGORIES) {
    if (asins.size >= limit) break;
    try {
      const res = await fetch(`https://www.amazon.in/gp/bestsellers/${cat}/`, {
        headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
      });
      const html = await res.text();
      for (const m of html.matchAll(/\/dp\/([A-Z0-9]{10})/g)) {
        if (asins.size >= limit) break;
        asins.add(m[1]);
      }
    } catch {
      /* ignore */
    }
    await sleep(1200);
  }
  return [...asins].slice(0, limit);
}

async function discoverFlipkart(limit: number) {
  const out: { url: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const cat of FLIPKART_CATEGORIES) {
    if (out.length >= limit) break;
    const json = await fetchFlipkartJson(cat);
    if (!json) continue;
    for (const p of discoverFromJson(json)) {
      if (out.length >= limit) break;
      if (seen.has(p.pid)) continue;
      seen.add(p.pid);
      out.push({ url: p.url, title: p.title });
    }
  }
  return out.slice(0, limit);
}

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const amazonCount = Number(args[0] ?? 10);
  const flipkartCount = Number(args[1] ?? 12);

  console.log(`Discovering ${amazonCount} Amazon + ${flipkartCount} Flipkart products…\n`);

  const asins = await discoverAmazon(amazonCount);
  console.log(`Amazon: found ${asins.length} ASINs`);
  const fk = await discoverFlipkart(flipkartCount);
  console.log(`Flipkart: found ${fk.length} products\n`);

  let ok = 0;
  let fail = 0;

  for (const asin of asins) {
    const r = await analyzeUrl(`https://www.amazon.in/dp/${asin}`);
    if (r.ok) ok++;
    else fail++;
    console.log(`${r.ok ? "✓" : "✗"} [amazon] ${r.ok ? `${r.listing?.price} — ${r.product?.title?.slice(0, 55)}` : r.status}`);
    await sleep(900);
  }

  for (const p of fk) {
    const r = await analyzeUrl(p.url);
    if (r.ok) ok++;
    else fail++;
    console.log(`${r.ok ? "✓" : "✗"} [flipkart] ${r.ok ? `${r.listing?.price} — ${r.product?.title?.slice(0, 55)}` : r.status}`);
  }

  console.log(`\nDone. ok=${ok} failed=${fail}`);

  // Cross-store pass: find the same product on Amazon for products we have on Flipkart.
  console.log("\nCross-store matching…");
  for (const q of CROSS_STORE_QUERIES) {
    const asins = await amazonSearchAsins(q, 5);
    let matched = false;
    for (const asin of asins) {
      const r = await analyzeUrl(`https://www.amazon.in/dp/${asin}`);
      if (r.ok) {
        console.log(`✓ [cross] ${q} → amazon ${asin} "${r.product?.title?.slice(0, 50)}"`);
        matched = true;
        break;
      }
      await sleep(700);
    }
    if (!matched) console.log(`✗ [cross] ${q} → no Amazon match`);
    await sleep(900);
  }

  await closePlaywright();
}

main().then(() => process.exit(0));
