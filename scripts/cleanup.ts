import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products, observations } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { isAccessory } from "../src/lib/engine/identity";

/** Remove catalogue entries that are accessories, not the product itself. */
async function main() {
  await ensureSchema();

  const rows = await db
    .select({ id: products.id, slug: products.slug, title: products.title, category: products.category })
    .from(products);

  let removed = 0;
  let normalised = 0;
  for (const p of rows) {
    if (isAccessory(p.title)) {
      const ls = await db.select({ id: listings.id }).from(listings).where(eq(listings.productId, p.id));
      for (const l of ls) {
        await db.delete(observations).where(eq(observations.listingId, l.id));
        await db.delete(listings).where(eq(listings.id, l.id));
      }
      await db.delete(products).where(eq(products.id, p.id));
      console.log(`✗ removed accessory: ${p.title.slice(0, 80)}`);
      removed++;
      continue;
    }
    // Normalise "A > B > C" category paths down to the leaf segment.
    if (p.category?.includes(">")) {
      const leaf = p.category.split(">").pop()!.trim();
      if (leaf && leaf !== p.category) {
        await db.update(products).set({ category: leaf }).where(eq(products.id, p.id));
        normalised++;
      }
    }
  }
  console.log(`\nRemoved ${removed} accessory product(s), normalised ${normalised} categories.`);
}

main().then(() => process.exit(0));
