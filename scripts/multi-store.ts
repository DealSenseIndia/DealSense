import { db, ensureSchema } from "../src/lib/db/client";
import { listings, products } from "../src/lib/db/schema";
import { eq, sql } from "drizzle-orm";

async function main() {
  await ensureSchema();
  const r = await db
    .select({
      slug: products.slug,
      title: products.title,
      n: sql<number>`count(distinct ${listings.merchant})`,
      l: sql<number>`count(${listings.id})`,
    })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .groupBy(products.slug)
    .having(sql`count(distinct ${listings.merchant}) > 1`)
    .orderBy(sql`count(distinct ${listings.merchant}) desc`)
    .limit(12);
  for (const x of r) console.log(String(x.n), "stores |", String(x.l), "listings |", x.slug, "|", String(x.title).slice(0, 48));
  const total = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .innerJoin(listings, eq(listings.productId, products.id))
    .groupBy(products.slug)
    .having(sql`count(distinct ${listings.merchant}) > 1`);
  console.log("\nproducts on 2+ stores:", total.length);
  process.exit(0);
}

main();
