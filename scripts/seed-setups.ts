/**
 * Seed the Smart Setups catalogue with real, tracked products.
 *
 * The setup engine is only allowed to use listings that have genuine price
 * history. This script imports a small, curated set of furniture, lighting,
 * monitors and kitchen products from PriceHistory.ai — one product at a time,
 * throttled — so every space blueprint can actually be built from real data.
 *
 *   npm run setups:seed
 *   npm run setups:seed -- --limit 20
 *
 * It is deliberately not a general crawler: the ids below are hand-picked per
 * category and it never harvests beyond this list.
 */
import "./env";
import { ensureSchema } from "../src/lib/db/client";
import { addObservation, getListingByMerchantProduct, upsertListing, upsertProduct } from "../src/lib/db/queries";
import { searchPriceHistoryAi, fetchPriceHistoryAi } from "../src/lib/engine/providers/pricehistoryAi";
import { closePlaywright } from "../src/lib/merchants/http";
import { slugify } from "../src/lib/utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const SUPPORTED: Record<string, string> = {
  amazon: "amazon",
  flipkart: "flipkart",
  myntra: "myntra",
  nykaa: "nykaa",
  firstcry: "firstcry",
  reliancedigital: "reliancedigital",
  reliance: "reliancedigital",
  biba: "biba",
  libas: "libas",
  tatacliq: "tatacliq",
  ajio: "ajio",
};

/** Query → curated provider product ids. Each id was reviewed by title/price. */
const SEED_GROUPS: { query: string; ids: number[] }[] = [
  // ── Bedroom ────────────────────────────────────────────────────────────
  { query: "bed frame wooden", ids: [6355, 6353, 6354] },
  { query: "queen size bed", ids: [140815] },
  { query: "wakefit mattress", ids: [147306, 141839] },
  { query: "sleepycat mattress", ids: [158482] },
  { query: "mattress queen size", ids: [168237, 148038] },
  { query: "blackout curtains", ids: [140821, 140819, 140742] },
  { query: "curtains window set", ids: [44177] },
  { query: "study lamp", ids: [35995, 30512] },
  { query: "desk lamp", ids: [74926] },
  { query: "bedside table", ids: [140940, 140683] },
  { query: "nightstand", ids: [140640, 140320] },
  { query: "carpet rug", ids: [82939, 82976, 82866] },
  { query: "bookshelf", ids: [140657] },
  { query: "desk mat", ids: [82886] },

  // ── Work-from-home desk ────────────────────────────────────────────────
  { query: "green soul office chair", ids: [168100, 147633, 147626, 147623, 147398] },
  { query: "study table", ids: [168259, 168079, 140890] },
  { query: "computer table", ids: [140620, 140475] },
  { query: "monitor 24 inch", ids: [146846, 28749, 168385, 147765] },
  { query: "samsung monitor 27", ids: [1798, 28199] },
  { query: "monitor light bar", ids: [1732] },
  { query: "logitech keyboard mouse combo", ids: [150552, 29877, 150554] },
  { query: "dell keyboard mouse", ids: [150553] },
  { query: "laptop stand", ids: [146840, 146837] },
  { query: "monitor stand", ids: [27985] },
  { query: "monitor stand", ids: [168335] },

  // ── Living room ────────────────────────────────────────────────────────
  { query: "single seater sofa", ids: [147864, 140344, 6234, 6117, 6334] },
  { query: "coffee table", ids: [140677, 140521, 140402] },
  { query: "tv entertainment unit", ids: [168392, 147347, 147247, 140339] },

  // ── Gaming ─────────────────────────────────────────────────────────────
  { query: "gaming monitor", ids: [147871, 147257, 1789, 147259] },
  { query: "gaming monitor 144hz", ids: [1636, 1559, 1672, 1556] },
  { query: "gaming chair", ids: [156904, 146049, 80906, 168188] },
  { query: "gaming headset", ids: [3700, 3693, 3642, 147127, 75137] },
  { query: "study table", ids: [140911] },
  { query: "mechanical keyboard", ids: [28456, 26797, 11313, 6918] },
  { query: "gaming mouse", ids: [147130, 67951] },
  { query: "rgb light strip", ids: [168384, 145433] },
  { query: "gaming desk", ids: [147233, 26372] },
  { query: "desk mat", ids: [83319, 83317, 83492, 83321] },

  // ── Student ────────────────────────────────────────────────────────────
  { query: "study chair", ids: [29259, 147630, 11977, 147634] },
  { query: "study lamp", ids: [30553, 66984] },
  { query: "bookshelf", ids: [147359, 140870, 140665] },
  { query: "wired headphones", ids: [3761, 44128] },
  { query: "desk organizer", ids: [140336, 140272, 28866, 11095] },

  // ── Kitchen ────────────────────────────────────────────────────────────
  { query: "coffee maker", ids: [99333, 83529, 83525] },
  { query: "moka pot", ids: [5905] },
  { query: "air fryer", ids: [83175, 83161, 141009, 168225] },
  { query: "air fryer", ids: [27989, 27355, 27279] },
  { query: "airtight containers kitchen", ids: [145275, 31031, 30712, 28365, 26852] },
  { query: "kitchen rack organizer", ids: [145274, 140918, 140917] },
  { query: "kitchen rack organizer", ids: [27976, 140484] },
  { query: "led strip light", ids: [30716, 141729] },

  // ── Finishing decor (bedroom / living) ─────────────────────────────────
  { query: "indoor plant pot", ids: [146029, 44149] },
  { query: "wall shelf", ids: [140869, 140669, 168205] },
];

function merchantFor(platform: string): string | null {
  return SUPPORTED[platform?.toLowerCase()] ?? null;
}

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 999 : 999;

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let missing = 0;
  const seen = new Set<number>();

  for (const group of SEED_GROUPS) {
    if (imported >= limit) break;
    const hits = await searchPriceHistoryAi(group.query, 50);
    if (!hits.length) {
      console.log(`! "${group.query}" returned no results`);
      continue;
    }
    const byId = new Map(hits.map((h) => [h.id, h]));

    for (const id of group.ids) {
      if (imported >= limit) break;
      if (seen.has(id)) continue;
      seen.add(id);

      const item = byId.get(id);
      if (!item) {
        missing++;
        console.log(`  · ${id} not in current results for "${group.query}"`);
        continue;
      }
      const merchant = merchantFor(item.platform);
      if (!merchant || item.current_price === null) {
        skipped++;
        continue;
      }

      try {
        const existing = await getListingByMerchantProduct(
          merchant,
          item.asin || String(item.id),
        );
        if (existing) {
          skipped++;
          continue;
        }

        const hist = await fetchPriceHistoryAi(item.id);
        if (!hist?.points.length) {
          skipped++;
          console.log(`  · ${item.id} has no price history — skipped`);
          continue;
        }

        const slug = `${slugify(item.title).slice(0, 70)}-${item.id}`;
        const product = await upsertProduct({
          slug,
          title: item.title,
          brand: item.brand?.trim() || null,
          category: item.category ? item.category.split(">").pop()?.trim() ?? null : null,
          imageUrl: item.image_url ?? null,
          images: item.image_url ? [item.image_url] : [],
          identityKey: null,
        });

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

        for (const p of hist.points) {
          await addObservation({
            listingId: listing.id,
            price: p.price,
            source: "imported:pricehistory.ai",
            observedAt: p.t,
          });
        }

        imported++;
        const first = hist.points[0];
        const last = hist.points[hist.points.length - 1];
        console.log(
          `  ✓ ${merchant.padEnd(9)} ${String(item.id).padEnd(7)} ${hist.points.length.toString().padStart(4)} pts  ${new Date(first.t).toISOString().slice(0, 10)} → ${new Date(last.t).toISOString().slice(0, 10)}  ${item.title.slice(0, 54)}`,
        );
      } catch (err) {
        failed++;
        console.log(`  ✗ ${item.id} — ${(err as Error).message}`);
      }
      await sleep(500);
    }
  }

  console.log(
    `\nSmart Setups seed: ${imported} imported, ${skipped} skipped (existing/no history), ${missing} not found, ${failed} failed.`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
