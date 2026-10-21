/**
 * Backfill the full product gallery for every listing we track.
 *
 * The main image is only one photo. The store publishes a whole gallery, and
 * we want every one of them. Re-reading each store page captures it.
 *
 *   npx tsx scripts/backfill-gallery.ts --limit 91
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const idx = args.indexOf("--limit");
  const limit = idx !== -1 ? Number(args[idx + 1]) || 91 : 91;

  const rows = await db
    .select({
      listingId: listings.id,
      productId: listings.productId,
      url: listings.url,
      merchant: listings.merchant,
      title: products.title,
      images: products.images,
    })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(isNotNull(listings.price))
    .limit(limit);

  let done = 0;
  let withGallery = 0;
  let skipped = 0;

  for (const r of rows) {
    // Already have a full gallery? Leave it alone.
    let have = 0;
    try {
      have = r.images ? (JSON.parse(r.images) as string[]).length : 0;
    } catch {
      have = 0;
    }
    if (have > 2) {
      skipped++;
      continue;
    }

    try {
      const out = await fetchProduct(r.url);
      const imgs = out.product?.images ?? [];
      if (imgs.length > 1) {
        await db
          .update(products)
          .set({ images: JSON.stringify(imgs) })
          .where(eq(products.id, r.productId));
        withGallery++;
        console.log(
          `  ${String(imgs.length).padStart(2)} imgs  ${r.title?.slice(0, 46)}`,
        );
      }
    } catch (e) {
      console.log(`  ERR  ${r.title?.slice(0, 40)} — ${(e as Error).message.slice(0, 40)}`);
    }
    done++;
    await sleep(r.merchant === "amazon" ? 3500 : 1200);
  }

  console.log(
    `\n${withGallery} listings gained a gallery, ${skipped} already had one, ${done} checked.`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
