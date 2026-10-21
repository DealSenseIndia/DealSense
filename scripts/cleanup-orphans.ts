/**
 * Remove product rows that have no listing left.
 *
 * Moving a listing onto another product (the cross-store merge does this)
 * leaves the row it came from empty. Those rows 404, and they hold an
 * identity key that could attract a new listing and split the price history
 * in two. The key is handed to the surviving product first.
 *
 *   npx tsx scripts/cleanup-orphans.ts
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  await ensureSchema();

  const all = await db
    .select({ id: products.id, slug: products.slug, identityKey: products.identityKey })
    .from(products);
  const withListings = new Set(
    (await db.select({ productId: listings.productId }).from(listings)).map((l) => l.productId),
  );

  let removed = 0;
  let keyed = 0;

  for (const p of all) {
    if (withListings.has(p.id)) continue;

    if (p.identityKey) {
      const heir = all.find(
        (o) => o.id !== p.id && o.identityKey === p.identityKey && withListings.has(o.id),
      );
      if (heir) {
        await db
          .update(products)
          .set({ identityKey: p.identityKey })
          .where(eq(products.id, heir.id));
        keyed++;
      }
    }

    await db.delete(products).where(eq(products.id, p.id));
    removed++;
  }

  console.log(`removed ${removed} empty product row(s), moved ${keyed} identity key(s).`);
}

main().then(() => process.exit(0));
