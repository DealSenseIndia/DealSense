/**
 * Backfill REAL customer reviews for listings we already track.
 *   npx tsx scripts/seed-reviews.ts --limit 40
 *
 * Fetches each listing's store page once and stores the reviews it finds.
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { upsertReviews } from "../src/lib/db/queries";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const idx = args.indexOf("--limit");
  const limit = idx !== -1 ? Number(args[idx + 1]) || 40 : 40;

  const rows = await db
    .select({
      listingId: listings.id,
      url: listings.url,
      merchant: listings.merchant,
      title: listings.title,
    })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(isNotNull(listings.price));

  const amazon = rows.filter((r) => r.merchant === "amazon").slice(0, limit);
  console.log(`fetching real reviews for ${amazon.length} Amazon listings…\n`);

  let totalReviews = 0;
  let withReviews = 0;

  for (const [i, r] of amazon.entries()) {
    try {
      const out = await fetchProduct(r.url);
      const revs = out.product?.reviews ?? [];
      if (revs.length) {
        const added = await upsertReviews(
          r.listingId,
          revs.map((v) => ({
            author: v.author,
            stars: v.stars,
            title: v.title,
            body: v.body,
            reviewedAt: v.date,
            verified: v.verified,
            variant: v.variant,
            helpful: v.helpful,
          })),
        );
        totalReviews += revs.length;
        withReviews++;
        console.log(
          `  ${String(i + 1).padStart(3)} ${String(revs.length).padStart(3)} rev  (+${added} new)  ${String(r.title ?? "").slice(0, 46)}`,
        );
      } else {
        console.log(`  ${String(i + 1).padStart(3)}   0 rev  ${String(r.title ?? "").slice(0, 46)}`);
      }
    } catch (e) {
      console.log(`  ${String(i + 1).padStart(3)}  ERR  ${(e as Error).message.slice(0, 50)}`);
    }
    await sleep(3500);
  }

  console.log(
    `\n${withReviews} listings had real reviews — ${totalReviews} review records read from store pages.`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
