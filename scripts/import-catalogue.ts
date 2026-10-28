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
import { sql } from "drizzle-orm";
import { uid, upsertListing, upsertProduct } from "../src/lib/db/queries";
import { fetchPriceHistoryAi, searchPriceHistoryAi } from "../src/lib/engine/providers/pricehistoryAi";
import { closePlaywright } from "../src/lib/merchants/http";
import { slugify } from "../src/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Collapse a title to a key that only equal product names share. */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function counts() {
  const [p] = await db.select({ n: sql<number>`count(*)` }).from(products);
  const [l] = await db.select({ n: sql<number>`count(*)` }).from(listings);
  const [o] = await db.select({ n: sql<number>`count(*)` }).from(observations);
  return { products: Number(p.n), listings: Number(l.n), observations: Number(o.n) };
}

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

/**
 * Second wave — the categories the first pass left thin. Only used when the
 * query list is not overridden through CATALOGUE_QUERIES, so an explicit run
 * always means exactly the queries given.
 */
if (!process.env.CATALOGUE_QUERIES) {
  QUERIES.push(
    ...[
      // phones the first pass missed
      "iphone 15", "iphone 14", "samsung galaxy s24", "samsung galaxy m35", "redmi note 14",
      "realme narzo", "poco x7", "iqoo z9", "vivo v50", "oppo k12", "motorola edge 50",
      "nothing phone 2a", "oneplus nord", "google pixel 9",
      // more computers
      "hp laptop 15", "lenovo thinkpad", "asus tuf gaming", "acer nitro", "macbook pro",
      "chromebook", "gaming laptop rtx 4060", "lenovo tab", "redmi pad",
      // tv and streaming
      "mi tv 43", "samsung 55 inch tv", "lg 43 inch tv", "oneplus tv", "fire tv stick",
      "benq monitor",
      // audio
      "sony wh-1000xm4", "bose quietcomfort", "jbl tune", "boat rockerz", "samsung galaxy buds",
      "airpods 4", "marshall speaker", "home theatre",
      // wearables
      "apple watch se", "garmin watch", "titan smart watch", "fastrack reflex",
      // appliances
      "daikin ac", "voltas ac", "lg washing machine", "samsung refrigerator",
      "whirlpool refrigerator", "ifb washing machine", "bajaj mixer grinder",
      "prestige pressure cooker", "philips air fryer", "kent water purifier",
      "eureka forbes", "havells ceiling fan", "water heater geyser", "microwave oven",
      // home, kitchen and furniture
      "sofa set", "study chair", "bookshelf", "dining table", "curtains", "bedsheet double",
      "mattress king", "cookware set", "storage cabinet", "shoe rack", "bean bag", "recliner",
      // fashion
      "adidas shoes", "puma sneakers", "levis tshirt", "fabindia kurta", "raymond shirt",
      "woodland shoes", "crocs", "titan watch", "wildcraft backpack", "samsonite luggage",
      "zara dress", "puma tshirt",
      // beauty
      "cerave moisturiser", "the ordinary serum", "minimalist serum", "dot and key",
      "plum serum", "mamaearth shampoo", "nivea cream", "loreal shampoo",
      "maybelline mascara", "mac lipstick",
      // baby and sport
      "pampers pants", "huggies", "baby stroller", "baby car seat", "yoga mat",
      "dumbbell set", "cricket bat", "badminton racket", "cycle helmet",
      // electronics and peripherals
      "logitech mouse", "webcam", "wifi router", "ssd 1tb", "external hard drive",
      "power bank", "printer", "keyboard",
    ].filter((q) => !QUERIES.includes(q)),
  );
}

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

  const before = await counts();
  const started = Date.now();
  console.log(
    `start  products ${before.products} · listings ${before.listings} · observations ${before.observations}`,
  );

  // Idempotency guards: an existing (merchant, merchant id) is never imported
  // again, and an existing product row is reused instead of duplicated.
  const existingListing = new Set<string>();
  const knownPids = new Set<string>();
  for (const row of await db
    .select({ merchant: listings.merchant, pid: listings.merchantProductId })
    .from(listings)) {
    existingListing.add(`${row.merchant}:${row.pid.toUpperCase()}`);
    knownPids.add(row.pid.toUpperCase());
  }
  const productByTitle = new Map<string, { id: string; slug: string }>();
  for (const row of await db
    .select({ id: products.id, slug: products.slug, title: products.title })
    .from(products)) {
    const key = titleKey(row.title);
    if (key && !productByTitle.has(key)) productByTitle.set(key, { id: row.id, slug: row.slug });
  }

  let imported = 0;
  let skippedExisting = 0;
  let reusedProduct = 0;
  let thin = 0;
  let rejected = 0;
  let points = 0;
  const seen = new Set<string>();

  for (const q of QUERIES) {
    if (imported >= target) break;

    // Deep discovery uses the site's published product sitemap, then confirms
    // every hit on its allowed HTML product page. No /api/ request is made.
    const need = Math.min(50, target - imported + 5);
    const hits = await searchPriceHistoryAi(q, need, { deep: true, skipAsins: knownPids });
    process.stdout.write(
      `  "${q}" → ${hits.length} tracked · imported ${imported}/${target}\n`,
    );

    for (const item of hits) {
      if (imported >= target) break;
      if (!PLATFORM_MERCHANTS[item.platform]) continue;
      if (item.current_price === null || item.current_price <= 0) continue;

      const merchant = PLATFORM_MERCHANTS[item.platform];
      const pid = (item.asin || String(item.id)).toUpperCase();
      const key = `${merchant}:${pid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (existingListing.has(key)) {
        skippedExisting++;
        continue;
      }

      try {
        const hist = await fetchPriceHistoryAi(item.id);
        if (!hist?.points.length) {
          thin++;
          continue;
        }

        const slug = `${slugify(item.title).slice(0, 70)}-${item.id}`;
        const category = item.category
          ? item.category.split(">").pop()?.trim() ?? null
          : null;
        const reuse = productByTitle.get(titleKey(item.title));
        const product = await upsertProduct({
          id: reuse?.id,
          slug: reuse?.slug ?? slug,
          title: item.title,
          brand: item.brand?.trim() || null,
          category,
          imageUrl: item.image_url ?? null,
          images: item.image_url ? [item.image_url] : [],
          identityKey: null,
        });
        if (reuse) reusedProduct++;
        else productByTitle.set(titleKey(item.title), { id: product.id, slug: product.slug });

        const listing = await upsertListing({
          productId: product.id,
          merchant,
          merchantProductId: pid,
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
        existingListing.add(key);
        knownPids.add(pid);

        // Only new listings receive history; every row is dated and sourced.
        const rows = hist.points
          .filter((p) => Number.isFinite(p.price) && p.price > 0 && Number.isFinite(p.t) && p.t > 0)
          .map((p) => ({
            id: uid(),
            listingId: listing.id,
            price: p.price,
            mrp: null,
            shipping: null,
            coupon: null,
            bankDiscount: null,
            effectivePrice: p.price,
            seller: null,
            rating: null,
            reviewCount: null,
            inStock: null,
            source: "imported:pricehistory.ai",
            observedAt: p.t,
            createdAt: Date.now(),
          }));
        if (rows.length !== hist.points.length) {
          throw new Error(
            `refusing to write: ${hist.points.length - rows.length} points missing a price or timestamp`,
          );
        }
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          if (!batch.every((r) => r.source && Number.isFinite(r.observedAt))) {
            throw new Error("refusing to write an observation without source/observed_at");
          }
          await db.insert(observations).values(batch);
        }
        points += rows.length;
        imported++;

        const first = hist.points[0];
        const last = hist.points[hist.points.length - 1];
        console.log(
          `  ✓ ${merchant.padEnd(13)} ${pid.padEnd(16)} ${String(rows.length).padStart(4)} pts  ` +
            `${new Date(first.t).toISOString().slice(0, 10)} → ${new Date(last.t).toISOString().slice(0, 10)}  ${item.title.slice(0, 46)}`,
        );
      } catch (err) {
        rejected++;
        console.log(`  ✗ ${pid} — ${(err as Error).message}`);
      }
    }
    await sleep(700);
  }

  const after = await counts();
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `\nimported ${imported}/${target} products · ${points} dated points · ${skippedExisting} already listed · ${reusedProduct} reused existing product rows · ${thin} without history · ${rejected} rejected`,
  );
  console.log(
    `counts  products ${before.products} → ${after.products} (+${after.products - before.products}) · ` +
      `listings ${before.listings} → ${after.listings} (+${after.listings - before.listings}) · ` +
      `observations ${before.observations} → ${after.observations} (+${after.observations - before.observations})`,
  );
  console.log(`duration ${seconds}s`);

  const productsAdded = after.products - before.products;
  const listingsAdded = after.listings - before.listings;
  if (productsAdded > listingsAdded) {
    console.error(
      `STOP: ${productsAdded} product rows added for ${listingsAdded} listings — duplicate product rows.`,
    );
    process.exitCode = 1;
  }

  await closePlaywright();
}

main().then(() => process.exit(process.exitCode ?? 0));

