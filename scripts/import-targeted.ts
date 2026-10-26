/**
 * Targeted catalogue top-up.
 *
 * The broad store import samples each marketplace's front page, which leaves
 * whole functional categories thin (fitness, pet, car care, hosting, travel).
 * This pass searches the public tracker for specific product families and
 * imports only titles that genuinely match, with at least three recorded
 * price points. One real listing per product — never a placeholder.
 *
 *   npx tsx scripts/import-targeted.ts
 *   npx tsx scripts/import-targeted.ts --dry
 *   npx tsx scripts/import-targeted.ts --only kettle
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings } from "../src/lib/db/schema";
import { addObservation, upsertListing, upsertProduct } from "../src/lib/db/queries";
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

interface Target {
  key: string;
  query: string;
  include: RegExp;
  exclude?: RegExp;
  category: string;
  max: number;
}

/**
 * Matching is done on the title, not on the tracker's category: the same
 * search can return a necklace for "tripod". Anything that fails the include
 * pattern is skipped rather than dumped into a shelf.
 */
const TARGETS: Target[] = [
  // Fitness
  { key: "dumbbell", query: "dumbbell", include: /dumbbell|kettlebell|home gym set/i, exclude: /stand only|rack only|cover/i, category: "Fitness", max: 3 },
  { key: "yoga-mat", query: "yoga mat", include: /yoga mat|exercise mat|gym mat/i, category: "Yoga Mats", max: 2 },
  { key: "bands", query: "resistance bands", include: /resistance band|loop band|exercise band/i, exclude: /watch|hair/i, category: "Fitness", max: 2 },
  { key: "rope", query: "skipping rope", include: /skipping rope|jump rope/i, category: "Fitness", max: 2 },
  { key: "shaker", query: "shaker bottle", include: /shaker/i, category: "Fitness", max: 2 },
  { key: "tracker", query: "fitness band", include: /fitness band|smart ?watch|smartwatch/i, exclude: /strap|cover|wristband|pack of 2/i, category: "Smart Watches", max: 2 },

  // Tea & hosting
  { key: "kettle", query: "electric kettle", include: /kettle/i, exclude: /descaler|cleaner/i, category: "Electric Kettles", max: 3 },
  { key: "cups", query: "tea cup set", include: /tea cup|cup set|mug set|coffee mug/i, exclude: /gift|belt/i, category: "Cups & Mugs", max: 3 },
  { key: "tray", query: "serving tray", include: /serving tray|serving platter|tea tray|wood.*tray/i, exclude: /baking|ash|dry fruit|container/i, category: "Serveware", max: 2 },
  { key: "dinner", query: "dinner set", include: /dinner set|dinnerware|crockery/i, exclude: /paper|disposable/i, category: "Dinnerware", max: 3 },
  { key: "cushion", query: "cushion cover", include: /cushion cover|cushion/i, exclude: /sofa cover|bed cover|bedsheet|bedding|comforter|5 piece/i, category: "Cushions", max: 3 },
  { key: "candle", query: "scented candle", include: /candle/i, exclude: /cake|number/i, category: "Home Decor", max: 2 },
  { key: "vase", query: "vase", include: /vase/i, exclude: /artificial flower only/i, category: "Home Decor", max: 2 },

  // Festive
  { key: "diya", query: "diya", include: /diya|oil lamp/i, exclude: /led|string|curtain/i, category: "Home Decor", max: 3 },
  { key: "pooja", query: "pooja thali", include: /pooja thali|puja thali|pooja set|puja set/i, exclude: /artificial|fake|foam/i, category: "Home Decor", max: 2 },
  { key: "fairy", query: "fairy lights", include: /fairy light|string light|decorative light/i, exclude: /solar|street/i, category: "Lamps & Lights", max: 2 },
  { key: "live-plant", query: "live plant", include: /live plant|indoor plant|money plant|snake plant|aglaonema|peace lily/i, exclude: /artificial|fairy|string light|wall hanging|showpiece|panda|planter only/i, category: "Plants", max: 3 },
  { key: "makeup-bag", query: "makeup organizer", include: /makeup bag|cosmetic bag|makeup organizer|cosmetic organizer|toiletry bag/i, exclude: /brush|mirror|stand only|trolley/i, category: "Makeup Bags", max: 3 },
  { key: "jewellery", query: "oxidised earrings", include: /earring|necklace|jewellery set|jewelry set/i, exclude: /box|organizer|stand|holder|display/i, category: "Jewellery", max: 3 },
  { key: "pet-toy", query: "dog toy", include: /dog toy|pet toy|chew toy|rope toy|squeaky toy/i, exclude: /kids|baby|human|car|model|figurine|showpiece|gift/i, category: "Pet Supplies", max: 2 },

  // Hostel & garden
  { key: "mattress", query: "single mattress", include: /mattress/i, exclude: /cover|protector|topper/i, category: "Mattresses", max: 2 },
  { key: "fan", query: "personal fan", include: /fan/i, exclude: /ceiling|exhaust/i, category: "Fans", max: 2 },
  { key: "lamp", query: "table lamp", include: /lamp/i, exclude: /street|ceiling|holder/i, category: "Lamps & Lights", max: 2 },
  { key: "planter", query: "plant pot", include: /planter|plant pot|pot with/i, exclude: /artificial/i, category: "Planters", max: 2 },
  { key: "garden-tools", query: "garden tools", include: /garden tool|gardening|trowel|pruner/i, category: "Garden Tools", max: 2 },
  { key: "chair", query: "balcony chair", include: /balcony|outdoor|garden|folding chair|arm chair/i, exclude: /study|office|jhula|swing|hanging/i, category: "Chairs", max: 2 },
  { key: "garden-bench", query: "garden bench", include: /garden bench|outdoor bench|balcony bench|patio bench/i, exclude: /cover|mat|gym|weight|table/i, category: "Outdoor Furniture", max: 2 },

  // Gaps surfaced by the setup audit
  { key: "vanity-mirror", query: "vanity mirror", include: /vanity mirror|makeup mirror|led mirror|mirror with light|hollywood mirror/i, exclude: /car|bike|rear|phone|camera|wall sticker|side mirror/i, category: "Mirrors", max: 3 },
  { key: "makeup-mirror", query: "makeup mirror", include: /makeup.*mirror|mirror.*makeup|table top mirror|dressing mirror/i, exclude: /fan|bathroom|wall-mounted|wall mounted|phone|car|comb|dressing table|dressingtable|drawer|vanity table/i, category: "Mirrors", max: 3 },
  { key: "baby-cot", query: "baby cot", include: /baby cot|baby crib|crib|cradle/i, exclude: /mattress|sheet|mosquito|net|rail|toy|bumper|pillow/i, category: "Baby Care", max: 2 },
  { key: "storage-basket", query: "storage basket", include: /storage basket|woven basket|jute basket|organizer basket/i, exclude: /kitchen|laundry|fruit|spice|shoe|paper|gift|tricycle|cycle|stroller|pram|walker|babyhug|chair|rocking|recliner|sofa|bed/i, category: "Storage", max: 3 },
  { key: "decorative-basket", query: "decorative basket", include: /decorative basket|storage basket|woven basket|jute basket/i, exclude: /fruit|vegetable|artificial|flower|jacket|clothes|shoe|tricycle|stroller|babyhug|planter|plant stand/i, category: "Storage", max: 2 },

  // Pet
  { key: "pet-bed", query: "dog bed", include: /dog|cat|pet/i, exclude: /food|shampoo|toy|story|book|human/i, category: "Pet Supplies", max: 2 },
  { key: "pet-bowl", query: "pet bowl", include: /pet bowl|dog bowl|cat bowl|pet feeder/i, category: "Pet Supplies", max: 2 },
  { key: "pet-food", query: "dog food", include: /dog food|cat food|pet food/i, exclude: /bowl|feeder|litter|book/i, category: "Pet Supplies", max: 2 },
  { key: "pet-grooming", query: "pet grooming", include: /pet grooming|grooming wipes|pet wipes|pet shampoo|dog shampoo/i, exclude: /human|hair|kitchen|dishwashing/i, category: "Pet Supplies", max: 2 },

  // Creator
  { key: "tripod", query: "camera tripod", include: /tripod/i, exclude: /wooden|decor/i, category: "Tripods", max: 3 },
  { key: "mic", query: "wireless microphone", include: /microphone|mic/i, exclude: /cover|holder only|karaoke|singing|speaker/i, category: "Microphones", max: 3 },
  { key: "video-light", query: "video light", include: /video light|studio light|softbox|led panel/i, exclude: /phone|mobile|fairy|string|candle|decorative|surface|spot|car|selfie/i, category: "Lighting", max: 2 },
  { key: "sd-card", query: "memory card", include: /sd card|memory card|microsd/i, exclude: /phone|console|game|speaker|reader only|adapter|camera|security|cctv|robot|recorder|gpu|graphics/i, category: "Storage", max: 2 },
  { key: "sd-card-64", query: "memory card 64gb", include: /sd card|memory card|microsd/i, exclude: /reader|adapter|case|phone|camera|security|cctv|robot|recorder|gpu|graphics/i, category: "Storage", max: 2 },
  { key: "ring-light", query: "ring light", include: /(?:^|[^a-z])ring light(?:s)?(?:[^a-z]|$)|selfie light/i, exclude: /phone|mobile|cover|tripod only|stand only|string light|curtain|fairy|diwali|chandelier/i, category: "Lighting", max: 2 },
  { key: "ssd", query: "external ssd", include: /external ssd|portable ssd/i, exclude: /cable|enclosure|case/i, category: "Storage", max: 2 },

  // Travel
  { key: "neck-pillow", query: "neck pillow", include: /neck pillow|travel pillow/i, exclude: /baby|mosquito|sleep pillow|bed pillow|46 x 69/i, category: "Travel Accessories", max: 2 },
  { key: "adapter", query: "universal adapter", include: /universal.*adapter|travel adapter/i, category: "Travel Accessories", max: 2 },
  { key: "scale", query: "luggage scale", include: /luggage.*scale|baggage.*scale/i, category: "Travel Accessories", max: 2 },
  { key: "toiletry", query: "toiletry bag", include: /toiletry|travel organizer|packing/i, category: "Travel Accessories", max: 2 },

  // Car
  { key: "car-vacuum", query: "car vacuum", include: /car vacuum|handheld vacuum|wet & dry|spot cleaner|upholstery cleaner/i, exclude: /robot|mattress|stick|home vacuum|filter|bag only/i, category: "Car Care", max: 3 },
  { key: "inflator", query: "tyre inflator", include: /inflator|air compressor/i, exclude: /blower/i, category: "Car Care", max: 2 },
  { key: "microfibre", query: "microfiber cloth", include: /microfiber|microfibre/i, exclude: /kitchen|laptop|screen|gloves/i, category: "Car Care", max: 3 },
  { key: "dashcam", query: "dashcam", include: /dash ?cam|driving recorder/i, exclude: /cctv|action/i, category: "Car Care", max: 2 },
  { key: "mount", query: "car phone holder", include: /car mount|car phone holder|magnetic.*car|car.*holder|mobile holder/i, exclude: /desk|desktop|table|wall|laptop|tv|holster|belt/i, category: "Car Care", max: 2 },

  // Style & beauty
  { key: "sunglasses", query: "sunglasses", include: /sunglass/i, exclude: /art|frame only/i, category: "Sunglasses", max: 3 },
  { key: "dressing", query: "dressing table", include: /dressing table|vanity/i, exclude: /storage|organizer|compartment/i, category: "Beds", max: 2 },
  { key: "straightener", query: "hair straightener", include: /straightener/i, category: "Hair Styling", max: 2 },
  { key: "dryer", query: "hair dryer", include: /hair dryer|blow dryer/i, category: "Hair Dryers", max: 2 },

  // Nursery
  { key: "wipes", query: "baby wipes", include: /wipes/i, category: "Baby Care", max: 2 },
  { key: "lotion", query: "baby lotion", include: /lotion/i, category: "Baby Care", max: 2 },

  // Home theatre
  { key: "stream", query: "fire tv stick", include: /fire tv|chromecast|android tv|tv stick/i, category: "Streaming Devices", max: 2 },
];

/** Popularity × discount, used only to order same-category candidates. */
function desirability(p: PHAIProduct): number {
  const mrp =
    p.original_price && p.current_price && p.original_price > p.current_price
      ? p.original_price
      : null;
  const disc =
    p.discount_percentage ??
    (mrp && p.current_price ? ((mrp - p.current_price) / mrp) * 100 : 0);
  const rating = p.rating ?? 0;
  const reviews = Math.log10((p.review_count ?? 0) + 1);
  return Math.min(65, disc) * 0.9 + rating * 7 + Math.min(reviews, 4) * 5;
}

async function main() {
  await ensureSchema();
  const dry = has("dry");
  const only = (arg("only") ?? "").toLowerCase();
  const targets = TARGETS.filter((t) => !only || t.key === only);

  const existing = await db
    .select({ merchant: listings.merchant, merchantProductId: listings.merchantProductId })
    .from(listings);
  const known = new Set(
    existing.map((r) => `${r.merchant}:${r.merchantProductId.toUpperCase()}`),
  );

  let imported = 0;
  let skipped = 0;
  let thin = 0;
  let failed = 0;
  const seenIds = new Set<number>();
  const started = Date.now();

  for (const target of targets) {
    const hits = await searchPriceHistoryAi(target.query, 50);
    const viable = hits
      .filter(
        (h) =>
          h.current_price !== null &&
          h.current_price > 0 &&
          h.title.length > 8 &&
          /^https?:\/\//.test(h.url) &&
          h.in_stock !== false &&
          target.include.test(h.title) &&
          !(target.exclude && target.exclude.test(h.title)),
      )
      .sort((a, b) => desirability(b) - desirability(a));

    console.log(
      `\n${target.key.padEnd(14)} "${target.query}" → ${viable.length} genuine matches`,
    );

    let took = 0;
    for (const item of viable) {
      if (took >= target.max) break;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      // Trust the link's real host over the provider's store label.
      const merchant = merchantFromUrl(item.url) ?? item.platform;
      const pid = item.asin || String(item.id);
      if (known.has(`${merchant}:${pid.toUpperCase()}`)) {
        skipped++;
        continue;
      }

      if (dry) {
        console.log(
          `  · ${merchant.padEnd(14)} ₹${String(item.current_price).padStart(7)}  ${target.category.padEnd(16)} ${item.title.slice(0, 58)}`,
        );
        took++;
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
          category: target.category,
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
          mrp:
            item.original_price && item.original_price > (item.current_price ?? 0)
              ? item.original_price
              : null,
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
        took++;
        console.log(
          `  ✓ ${merchant.padEnd(14)} ₹${String(item.current_price).padStart(7)} ${String(points.length).padStart(4)} pts  ${item.title.slice(0, 56)}`,
        );
      } catch (err) {
        failed++;
        console.log(
          `  ✗ ${merchant.padEnd(14)} ${item.id} — ${(err as Error).message.slice(0, 60)}`,
        );
      }
      await sleep(250);
    }
  }

  console.log(
    `\nDone: ${imported} imported · ${skipped} already known · ${thin} thin history · ${failed} failed · ${Math.round((Date.now() - started) / 60000)} min`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
