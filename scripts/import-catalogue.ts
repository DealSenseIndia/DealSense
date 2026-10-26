/**
 * Import a real product catalogue — products AND their real price history —
 * from PriceHistory.ai, which is the only catalogue where we can guarantee
 * price history for every product.
 *
 * We only ever list products that have real history. Our own scrapers then keep
 * Amazon/Flipkart prices live on top of that record.
 *
 *   npm run catalogue -- --products 120
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, observations, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { addObservation, upsertListing, upsertProduct } from "../src/lib/db/queries";
import { fetchPriceHistoryAi, searchPriceHistoryAi, type PHAIProduct } from "../src/lib/engine/providers/pricehistoryAi";
import { closePlaywright } from "../src/lib/merchants/http";
import { slugify } from "../src/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Search terms that map to the categories we want shelves for. */
const QUERIES = (process.env.CATALOGUE_QUERIES ?? "").split("|").filter(Boolean).length
  ? process.env.CATALOGUE_QUERIES!.split("|").filter(Boolean)
  : [
      // phones
      "iphone 17", "iphone 16", "samsung galaxy s25", "samsung galaxy a56", "oneplus 13",
      "nothing phone 3", "vivo t5 lite", "realme 14", "xiaomi 15", "oppo reno 13", "moto g85",
      // laptops & computers
      "macbook air", "dell inspiron 15", "hp pavilion", "lenovo ideapad", "asus vivobook",
      "acer aspire 5", "msi laptop", "tablet samsung", "ipad air",
      // tv & monitors
      "samsung crystal uhd tv", "sony bravia tv", "lg c2 oled tv", "lg ultragear monitor",
      "dell monitor 27", "acer monitor", "mi smart tv",
      // audio
      "sony wh-1000xm5", "airpods pro 2", "jbl flip 6", "boat airdopes", "sennheiser momentum",
      "oneplus buds 3", "realme buds", "noise headphones",
      // wearables
      "apple watch series 9", "samsung galaxy watch ultra", "noise colorfit pro", "amazfit gts 4",
      "fireboltt smart watch", "boAt wave call",
      // appliances
      "air fryer", "mixer grinder", "induction cooktop", "washing machine 8kg", "refrigerator",
      "air conditioner 1.5 ton", "water purifier", "vacuum cleaner", "electric kettle",
      // gaming
      "playstation 5 slim", "xbox series x", "nintendo switch oled", "gaming monitor 144hz",
      "graphics card rtx", "gaming mouse", "mechanical keyboard",
      // fashion
      "nike air max", "nike running shoes", "levis jeans", "allen solly shirt", "peter england shirt",
      "blackberrys dress", "w for women kurti", "saree", "sunglasses uv protection",
      "backpack laptop", "handbag women", "sports shoes",
      // beauty
      "lipstick matte", "maybelline lipstick", "lakme eyeliner", "sunscreen spf 50",
      "serum vitamin c", "face wash", "perfume men",
      // home & office
      "study table", "office chair", "bed mattress", "floor lamp", "wall clock",
      // cameras
      "canon dslr", "nikon d560", "gopro hero", "action camera", "instant camera",
    ];

const PLATFORM_MERCHANTS: Record<string, string> = {
  amazon: "amazon",
  flipkart: "flipkart",
  myntra: "myntra",
  ajio: "ajio",
  firstcry: "firstcry",
  libas: "libas",
  biba: "biba",
  tatacliq: "tatacliq",
  reliancedigital: "reliancedigital",
  nykaa: "nykaa",
};

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const idx = args.indexOf("--products");
  const target = idx !== -1 ? Number(args[idx + 1]) || 120 : 120;

  // 1) Collect candidates from their search API.
  const candidates = new Map<number, PHAIProduct>();
  const seenTitles = new Set<string>();

  for (const q of QUERIES) {
    if (candidates.size >= target * 2) break;
    const hits = await searchPriceHistoryAi(q, 50);
    for (const h of hits) {
      if (!PLATFORM_MERCHANTS[h.platform]) continue;
      if (h.current_price === null) continue;
      const key = `${h.platform}:${h.asin}`;
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      candidates.set(h.id, h);
    }
    process.stdout.write(`  searched "${q}" → ${candidates.size} candidates\n`);
    await sleep(700);
  }

  const list = [...candidates.values()].slice(0, target);
  console.log(`\nFetching real price history for ${list.length} products…\n`);

  let done = 0;
  let withHistory = 0;

  for (const item of list) {
    try {
      const hist = await fetchPriceHistoryAi(item.id);
      if (!hist?.points.length) {
        done++;
        await sleep(600);
        continue;
      }
      withHistory++;

      const brand = item.brand?.trim() || null;
      const slug = `${slugify(item.title).slice(0, 70)}-${item.id}`;
      const product = await upsertProduct({
        slug,
        title: item.title,
        brand,
        category: item.category ? item.category.split(">").pop()?.trim() ?? null : null,
        imageUrl: item.image_url ?? null,
        images: item.image_url ? [item.image_url] : [],
        identityKey: null,
      });

      const merchant = PLATFORM_MERCHANTS[item.platform] ?? item.platform;
      const listing = await upsertListing({
        productId: product.id,
        merchant,
        merchantProductId: item.asin || String(item.id),
        url: item.url,
        title: item.title,
        price: item.current_price,
        mrp: item.original_price,
        inStock: item.in_stock,
        rating: item.rating,
        reviewCount: item.review_count,
        imageUrl: item.image_url ?? null,
        shipping: 0,
      });

      // Store the real history in our own observation table.
      const existing = await db
        .select({ id: observations.id })
        .from(observations)
        .where(eq(observations.listingId, listing.id));
      if (!existing.length) {
        for (const p of hist.points) {
          await addObservation({
            listingId: listing.id,
            price: p.price,
            source: "imported:pricehistory.ai",
            observedAt: p.t,
          });
        }
      }

      const first = hist.points[0];
      const last = hist.points[hist.points.length - 1];
      console.log(
        `  ✓ ${merchant.padEnd(9)} ${String(item.id).padEnd(7)} ${hist.points.length.toString().padStart(4)} pts  ${new Date(first.t).toISOString().slice(0, 10)} → ${new Date(last.t).toISOString().slice(0, 10)}  ${item.title.slice(0, 42)}`,
      );
    } catch (err) {
      console.log(`  ✗ ${item.id} — ${(err as Error).message}`);
    }
    done++;
    await sleep(500);
  }

  console.log(`\nImported ${withHistory}/${done} products with real price history.`);
  await closePlaywright();
}

main().then(() => process.exit(0));
