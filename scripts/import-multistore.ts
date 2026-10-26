/**
 * Import a broad, real catalogue from every store the public tracker covers.
 *
 *   npx tsx scripts/import-multistore.ts
 *   npx tsx scripts/import-multistore.ts --store myntra --limit 20
 *   npx tsx scripts/import-multistore.ts --dry
 *
 * Only products with a real recorded price series are stored: each one is
 * read from its own product page and must return at least three genuine
 * points. Buy buttons always go through DealSense's own affiliate redirect;
 * the tracker's links are never used.
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings } from "../src/lib/db/schema";
import {
  addObservation,
  getListingByMerchantProduct,
  upsertListing,
  upsertProduct,
} from "../src/lib/db/queries";
import {
  fetchPriceHistoryAi,
  searchPriceHistoryAi,
  type PHAIProduct,
} from "../src/lib/engine/providers/pricehistoryAi";
import { closePlaywright } from "../src/lib/merchants/http";
import { merchantFromUrl } from "../src/lib/merchants/resolve";
import { slugify } from "../src/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? (args[i + 1] ?? "") : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);

type Plan = { platform: string; cap: number; pages: number };

/**
 * How much of each store to bring in. Small stores (Biba, AJIO, Tata CLiQ,
 * Reliance Digital) publish only a handful of tracked products, so we take
 * all of them. The big catalogues are sampled by category, not by page order.
 */
const PLAN: Plan[] = [
  { platform: "nykaa", cap: 110, pages: 2 },
  { platform: "firstcry", cap: 70, pages: 2 },
  { platform: "myntra", cap: 140, pages: 3 },
  { platform: "libas", cap: 35, pages: 1 },
  { platform: "biba", cap: 8, pages: 1 },
  { platform: "ajio", cap: 16, pages: 1 },
  { platform: "tatacliq", cap: 20, pages: 1 },
  { platform: "reliancedigital", cap: 8, pages: 1 },
  { platform: "flipkart", cap: 80, pages: 2 },
  { platform: "amazon", cap: 80, pages: 2 },
];

/** One readable category per product, so shelves and filters stay useful. */
function normaliseCategory(raw: string | null, fallback: string, title = ""): string {
  const text = `${raw ?? ""} ${fallback} ${title}`.toLowerCase();

  const rules: [RegExp, string][] = [
    [/smart\s*watch/, "Smart Watches"],
    [/wrist\s*watch|\bwatch\b/, "Wrist Watches"],
    [/lipstick|lip gloss|lip liner|lip crayon/, "Lipstick"],
    [/foundation|concealer|bb cream|compact/, "Face Makeup"],
    [/mascara|kajal|eyeliner|eye shadow|eyeshadow|eye palette/, "Eye Makeup"],
    [/nail (polish|paint|care)|manicure/, "Nail Care"],
    [/makeup kit|make-up kit|makeup combo|makeup set|makeup gift/, "Makeup Kits"],
    [/perfume|fragrance|eau de|deodorant|body spray/, "Perfume"],
    [/face wash|face cleanser|cleansing/, "Face Wash"],
    [/serum|essence/, "Serums"],
    [/moistur|day cream|night cream/, "Moisturisers"],
    [/sunscreen|sunblock|spf/, "Sunscreen"],
    [/shampoo/, "Shampoo"],
    [/conditioner/, "Conditioner"],
    [/hair oil|hair serum|hair mask/, "Hair Care"],
    [/body lotion|body butter|body wash/, "Body Care"],
    [/diaper|nappy/, "Diapers"],
    [/baby|infant|toddler|newborn|kids/, "Baby Care"],
    [/jeans|denim/, "Jeans"],
    [/kurta|kurti|salwar|suit set|anarkali/, "Kurtas & Kurtis"],
    [/saree|sari\b/, "Sarees"],
    [/leggings?|jeggings?/, "Leggings"],
    [/t-shirt|tshirt|\btee\b/, "Tshirts"],
    [/\bshirts?\b/, "Shirts"],
    [/\btrousers?\b|\bcargos?\b|\bchinos?\b/, "Trousers"],
    [/\bshorts?\b/, "Shorts"],
    [/\bboxers?\b|\bbriefs?\b|\btrunks?\b|innerwear/, "Innerwear"],
    [/sandals?|flip flops?|flip-flops?|sliders?|clogs?/, "Sandals & Slides"],
    [/dress/, "Dresses"],
    [/\btops?\b|blouse/, "Tops"],
    [/sweatshirt|hoodie|sweater/, "Sweatshirts"],
    [/sneaker|sports shoe|running shoe|casual shoe|shoe/, "Sports Shoes"],
    [/backpack|handbag|tote|\bbag\b|luggage|trolley/, "Bags"],
    [/sunglass|eyewear/, "Sunglasses"],
    [/jewel|earring|necklace|bracelet|pendant/, "Jewellery"],
    [/\bwallet|\bbelt\b|scarf|scarves/, "Accessories"],
    [/nightwear|nightdress|pyjama|pajama/, "Nightwear"],
    [/monitor/, "Monitors"],
    [/keyboard/, "Keyboards"],
    [/\bmouse\b|mice\b/, "Mice"],
    [/headphone|earphone|earbud|headset/, "Headphones & Earbuds"],
    [/speaker|soundbar/, "Audio"],
    [/power bank|charger|charging/, "Chargers & Power Banks"],
    [/router|wi-fi|wifi/, "Routers"],
    [/webcam|web cam/, "Webcams"],
    [/laptop|notebook pc|macbook/, "Laptops"],
    [/smartphone|mobile phone|\bphone\b|mobiles?\b/, "Smartphones"],
    [/tablet/, "Tablets"],
    [/\btv\b|television/, "Televisions"],
    [/air fryer/, "Air Fryers"],
    [/mixer|grinder|blender/, "Mixer Grinders"],
    [/coffee maker|coffee machine|espresso|moka/, "Coffee Makers"],
    [/kettle/, "Electric Kettles"],
    [/cookware|\bpan\b|kadhai|tawa|pressure cooker/, "Cookware"],
    [/knife|cutlery/, "Knives & Cutlery"],
    [/dinner set|\bplate\b|\bbowl\b|dinnerware/, "Dinnerware"],
    [/container|\bjar\b|storage/, "Jars & Containers"],
    [/refrigerator|fridge/, "Refrigerators"],
    [/washing machine/, "Washing Machines"],
    [/air conditioner|\bac\b/, "Air Conditioners"],
    [/microwave/, "Microwaves"],
    [/vacuum/, "Vacuum Cleaners"],
    [/\bfan\b/, "Fans"],
    [/purifier/, "Water Purifiers"],
    [/mattress/, "Mattresses"],
    [/bedsheet|bed linen|bedding/, "Bed Linen"],
    [/bed frame|\bbed\b|bedroom/, "Beds"],
    [/sofa|couch|recliner/, "Sofas"],
    [/coffee table/, "Coffee Tables"],
    [/curtain/, "Curtains"],
    [/carpet|\brug\b|dhurrie/, "Rugs & Carpets"],
    [/lamp|\blight\b|lighting|led strip/, "Lamps & Lights"],
    [/candle|wall art|painting|\bvase\b|mirror|\bclock\b|showpiece|decor/, "Home Decor"],
    [/shelf|bookcase|bookshelf/, "Shelves"],
    [/plant|planter/, "Planters"],
    [/cushion|pillow/, "Cushions"],
    [/towel/, "Towels"],
    [/water bottle|bottle/, "Water Bottles"],
    [/yoga/, "Yoga Mats"],
    [/dumbbell|\bgym\b|fitness|treadmill/, "Fitness"],
    [/trimmer|shaver|grooming/, "Grooming"],
    [/hair dryer/, "Hair Dryers"],
    [/straightener|curler|hair styling/, "Hair Styling"],
  ];

  for (const [re, label] of rules) if (re.test(text)) return label;

  const leaf = (raw ?? "").split(">").pop()?.trim() ?? "";
  if (leaf && leaf.length <= 28 && !/^(fashion|beauty|home|electronics)/i.test(leaf)) return leaf;
  return fallback || "Other";
}

/** Popularity × discount: what people are actually buying on offer. */
function desirability(p: PHAIProduct): number {
  const mrp = p.original_price && p.current_price && p.original_price > p.current_price
    ? p.original_price
    : null;
  const disc = p.discount_percentage ?? (mrp && p.current_price ? ((mrp - p.current_price) / mrp) * 100 : 0);
  const rating = p.rating ?? 0;
  const reviews = Math.log10((p.review_count ?? 0) + 1);
  return Math.min(65, disc) * 0.9 + rating * 7 + Math.min(reviews, 4) * 5;
}

/** Pick a category-diverse slice, cheapest-to-priciest inside each category. */
function selectDiverse(hits: PHAIProduct[], cap: number): PHAIProduct[] {
  const viable = hits.filter(
    (h) =>
      h.current_price !== null &&
      h.current_price > 0 &&
      h.title.length > 8 &&
      /^https?:\/\//.test(h.url) &&
      h.in_stock !== false,
  );

  const byCategory = new Map<string, PHAIProduct[]>();
  const seen = new Set<string>();
  for (const h of viable) {
    const key = `${h.platform}:${(h.asin || String(h.id)).toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cat = normaliseCategory(h.category, "", h.title);
    const list = byCategory.get(cat) ?? [];
    list.push(h);
    byCategory.set(cat, list);
  }

  for (const list of byCategory.values()) {
    list.sort((a, b) => desirability(b) - desirability(a));
    // Keep the popular, genuinely discounted two-thirds, then arrange those by
    // alternating the cheapest and the priciest so a shelf spans price bands.
    const keep = Math.max(6, Math.ceil(list.length * 0.7));
    const preferred = list.slice(0, keep);
    const byPrice = [...preferred].sort(
      (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0),
    );
    const spread: PHAIProduct[] = [];
    while (byPrice.length) {
      const cheap = byPrice.shift();
      if (cheap) spread.push(cheap);
      const premium = byPrice.pop();
      if (premium) spread.push(premium);
    }
    list.splice(0, list.length, ...spread);
  }

  const queues = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length).map(([, list]) => list);
  const picked: PHAIProduct[] = [];
  let round = 0;
  while (picked.length < cap && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      if (picked.length >= cap) break;
      const next = q.shift();
      if (next) picked.push(next);
      if (round > 200) break;
    }
    round++;
  }
  return picked;
}

async function main() {
  await ensureSchema();

  const dry = has("dry");
  const onlyStore = (arg("store") ?? "").trim().toLowerCase();
  const totalCap = Number(arg("limit")) || 0;

  const plan = PLAN.filter((p) => !onlyStore || p.platform === onlyStore);

  const existing = await db
    .select({ merchant: listings.merchant, merchantProductId: listings.merchantProductId })
    .from(listings);
  const known = new Set(existing.map((r) => `${r.merchant}:${r.merchantProductId.toUpperCase()}`));

  console.log(
    `browsing ${plan.length} stores — ${dry ? "dry run, nothing will be written" : "importing real products"}\n`,
  );

  let imported = 0;
  let skipped = 0;
  let thin = 0;
  let failed = 0;
  let seenIds = new Set<number>();
  const started = Date.now();

  for (const p of plan) {
    if (totalCap && imported >= totalCap) break;

    const hits: PHAIProduct[] = [];
    for (let page = 0; page < p.pages; page++) {
      const rows = await searchPriceHistoryAi("", 50, {
        platform: p.platform,
        offset: page * 50,
      });
      if (!rows.length) break;
      hits.push(...rows);
      await sleep(400);
    }
    if (!hits.length) {
      console.log(`${p.platform.padEnd(16)} no catalogue results`);
      continue;
    }

    const cap = totalCap ? Math.min(p.cap, totalCap - imported) : p.cap;
    const selected = selectDiverse(hits, cap);
    console.log(`\n${p.platform.padEnd(16)} ${hits.length} tracked, picking ${selected.length}`);

    for (const item of selected) {
      if (totalCap && imported >= totalCap) break;
      if (seenIds.has(item.id)) {
        skipped++;
        continue;
      }
      seenIds.add(item.id);

      // The provider occasionally labels a listing with the wrong store; the
      // destination host is the source of truth for the merchant key.
      const merchant = merchantFromUrl(item.url) ?? item.platform;
      const pid = item.asin || String(item.id);
      if (known.has(`${merchant}:${pid.toUpperCase()}`)) {
        skipped++;
        continue;
      }

      const cat = normaliseCategory(item.category, item.brand ?? "Other", item.title);
      if (dry) {
        console.log(
          `  · ${merchant.padEnd(14)} ₹${String(item.current_price).padStart(7)}  ${cat.padEnd(20)} ${item.title.slice(0, 52)}`,
        );
        continue;
      }

      try {
        const hist = await fetchPriceHistoryAi(item.id);
        const points = hist?.points ?? [];
        if (points.length < 3) {
          thin++;
          continue;
        }
        const latest = points[points.length - 1];
        if (Date.now() - latest.t > 45 * 86400000) {
          thin++;
          continue;
        }

        const slug = `${slugify(item.title).slice(0, 68)}-${item.id}`;
        const product = await upsertProduct({
          slug,
          title: item.title,
          brand: item.brand?.trim() || null,
          category: cat,
          imageUrl: item.image_url ?? null,
          images: item.image_url ? [item.image_url] : [],
          identityKey: null,
        });

        const listing = await upsertListing({
          productId: product.id,
          merchant,
          merchantProductId: pid,
          url: item.url,
          title: item.title,
          price: item.current_price,
          mrp: item.original_price && item.original_price > (item.current_price ?? 0) ? item.original_price : null,
          inStock: item.in_stock,
          rating: item.rating,
          reviewCount: item.review_count,
          imageUrl: item.image_url ?? null,
          shipping: 0,
        });

        for (const point of points) {
          await addObservation({
            listingId: listing.id,
            price: point.price,
            source: "imported:pricehistory.ai",
            observedAt: point.t,
          });
        }

        known.add(`${merchant}:${pid.toUpperCase()}`);
        imported++;
        console.log(
          `  ✓ ${merchant.padEnd(14)} ₹${String(item.current_price).padStart(7)} ${String(points.length).padStart(4)} pts  ${cat.padEnd(20)} ${item.title.slice(0, 46)}`,
        );
      } catch (err) {
        failed++;
        console.log(`  ✗ ${merchant.padEnd(14)} ${item.id} — ${(err as Error).message.slice(0, 60)}`);
      }
      await sleep(250);
    }
  }

  console.log(
    `\nDone: ${imported} imported · ${skipped} already known · ${thin} without enough fresh history · ${failed} failed · ${Math.round((Date.now() - started) / 60000)} min`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
