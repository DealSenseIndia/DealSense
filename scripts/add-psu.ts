/**
 * Find standalone power supplies on Amazon.in / Flipkart and track them.
 *
 *   npx tsx scripts/add-psu.ts            # dry run: list candidates
 *   npx tsx scripts/add-psu.ts --apply    # read each product page, one at a time
 *
 * The public tracker does not carry power supplies at all, so discovery has to
 * come from the stores themselves. Each accepted product gets a real reading
 * with its own timestamp; nothing is seeded or estimated. A listing is skipped
 * when we already track that merchant id.
 */
import "./env";
import { and, eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { listings } from "../src/lib/db/schema";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { closePlaywright } from "../src/lib/merchants/http";
import { searchAmazon, searchFlipkart, type SearchHit } from "../src/lib/merchants/search";

const apply = process.argv.includes("--apply");
const MAX = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QUERIES = [
  "650w power supply",
  "550w power supply",
  "450w power supply",
  "750w power supply",
  "smps 650w",
  "80 plus bronze power supply",
  "power supply unit 650w",
];

const GOOD = /\b(power supply|smps|psu)\b/i;
const WATT = /\b(4[5-9]0|5[0-9]0|6[0-9]0|7[0-9]0|850)\s?w\b/i;
const BAD = /(cable|extension|ups|inverter|battery|charger|adapter|jumpsuit|capsule)/i;

function isPsu(hit: SearchHit): boolean {
  const t = hit.title ?? "";
  if (!GOOD.test(t) || !WATT.test(t) || BAD.test(t)) return false;
  if (!hit.merchantProductId || !hit.url) return false;
  return true;
}

(async () => {
  const candidates = new Map<string, SearchHit>();
  for (const q of QUERIES) {
    const [amazon, flipkart] = await Promise.all([
      searchAmazon(q, 12).catch(() => []),
      searchFlipkart(q, 12).catch(() => []),
    ]);
    for (const hit of [...amazon, ...flipkart]) {
      if (!isPsu(hit)) continue;
      const key = `${hit.merchant}:${hit.merchantProductId}`;
      if (!candidates.has(key)) candidates.set(key, hit);
    }
    await sleep(2000);
  }

  const fresh: SearchHit[] = [];
  for (const hit of candidates.values()) {
    const rows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.merchant, hit.merchant),
          eq(listings.merchantProductId, hit.merchantProductId),
        ),
      )
      .limit(1);
    if (!rows.length) fresh.push(hit);
  }

  console.log(`candidates ${candidates.size} · already tracked ${candidates.size - fresh.length} · new ${fresh.length}`);
  for (const h of fresh.slice(0, MAX)) {
    console.log(`  ${h.merchant} ₹${h.price ?? "?"} ${h.title.slice(0, 85)}`);
  }

  if (!apply) {
    console.log("\ndry run — pass --apply to read these pages and record a dated price.");
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  for (const h of fresh.slice(0, MAX)) {
    try {
      const res = await analyzeUrl(h.url);
      if (res.ok && res.listing) {
        ok++;
        console.log(`  ✓ ${res.listing.merchant} ₹${res.listing.price} ${res.product?.title?.slice(0, 70)}`);
      } else {
        failed++;
        console.log(`  ✗ ${res.status} ${h.title.slice(0, 60)}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${(err as Error).message}`);
    }
    await sleep(6000);
  }
  console.log(`\nrecorded ${ok}, failed ${failed}`);
  await closePlaywright();
  process.exit(0);
})();
