/**
 * Fill in the main image for products that have none.
 *
 *   npx tsx scripts/backfill-images.ts [--limit 200]
 *
 * Reads the store product page (read-only) and stores the image URL it
 * publishes. The refresh worker also fills these over time; this just gets
 * the current backlog done now instead of over ten hours.
 */
import "./env";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db, client } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";

const apply = !process.argv.includes("--dry-run");
const idx = process.argv.indexOf("--limit");
const limit = idx !== -1 ? Number(process.argv[idx + 1]) || 200 : 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const rows = await db
    .select({
      productId: products.id,
      title: products.title,
      url: listings.url,
      merchant: listings.merchant,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .where(
      and(
        or(sql`${products.imageUrl} IS NULL`, sql`TRIM(${products.imageUrl}) = ''`),
        isNotNull(listings.url),
      ),
    )
    .limit(limit);

  console.log(`products without an image: ${rows.length}`);
  let filled = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const out = await fetchProduct(row.url);
      const image = out.product?.imageUrl ?? null;
      const images = out.product?.images ?? [];
      if (image) {
        if (apply) {
          await db
            .update(products)
            .set({
              imageUrl: image,
              images: images.length ? JSON.stringify(images) : null,
              updatedAt: Date.now(),
            })
            .where(eq(products.id, row.productId));
        }
        filled++;
        console.log(`  ✓ ${row.merchant} ${row.title.slice(0, 55)}`);
      } else {
        failed++;
        console.log(`  ✗ no image · ${row.title.slice(0, 55)}`);
      }
    } catch (err) {
      failed++;
      console.log(`  ✗ ${(err as Error).message.slice(0, 40)} · ${row.title.slice(0, 45)}`);
    }
    await sleep(2000);
  }

  const left = await client.execute(
    "SELECT COUNT(*) AS n FROM products WHERE image_url IS NULL OR TRIM(image_url) = ''",
  );
  console.log(`\n${apply ? "filled" : "would fill"} ${filled} · failed ${failed} · remaining ${left.rows[0].n}`);
  await closePlaywright();
  process.exit(0);
})();
