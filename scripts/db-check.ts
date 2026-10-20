import { db, ensureSchema } from "../src/lib/db/client";
import { listings, observations, products } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  await ensureSchema();
  const p = await db.select({ n: sql<number>`count(*)` }).from(products);
  const l = await db.select({ n: sql<number>`count(*)` }).from(listings);
  const o = await db.select({ n: sql<number>`count(*)` }).from(observations);
  console.log("products", p[0].n, "listings", l[0].n, "observations", o[0].n);
  process.exit(0);
}

main();
