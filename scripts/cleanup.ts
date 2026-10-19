import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products, observations } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAccessory } from "../src/lib/engine/identity";

/** Remove catalogue entries that are accessories, not the product itself. */
async function main() {
  await ensureSchema();

  const rows = await db
    .select({ id: products.id, slug: products.slug, title: products.title })
    .from(products);

  let removed = 0;
  for (const p of rows) {
    if (!isAccessory(p.title)) continue;
    const ls = await db.select({ id: listings.id }).from(listings).where(eq(listings.productId, p.id));
    for (const l of ls) {
      await db.delete(observations).where(eq(observations.listingId, l.id));
      await db.delete(listings).where(eq(listings.id, l.id));
    }
    await db.delete(products).where(eq(products.id, p.id));
    console.log(`✗ removed accessory: ${p.title}`);
    removed++;
  }
  console.log(`\nRemoved ${removed} accessory product(s).`);
}

main().then(() => process.exit(0));
