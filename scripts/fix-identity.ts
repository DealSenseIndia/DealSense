/**
 * Fix mis-associated listings and duplicate price points.
 *
 *   npx tsx scripts/fix-identity.ts          # dry run (default)
 *   npx tsx scripts/fix-identity.ts --apply  # write
 *
 * Rules:
 *  - A listing whose title is a different product/variant is not edited. If it
 *    has real observations it is moved to its own product; if it has none it is
 *    removed. Nothing is invented, nothing with a price is deleted.
 *  - A product whose only listing carries a different real title takes the
 *    listing's title, because the listing is the source of truth for its page.
 *  - Duplicate (listing_id, observed_at) rows collapse to one, preferring a
 *    row we read ourselves over an imported one.
 */
import "./env";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, client } from "../src/lib/db/client";
import { listings, observations, products } from "../src/lib/db/schema";
import { slugify } from "../src/lib/utils";

const apply = process.argv.includes("--apply");

const SPLITS = [
  "1f7980ed-9ca3-4308-b604-ed3446bbfdcf", // Galaxy S25 Plus listing on the S25 page
  "85386b77-8825-4a4f-87ea-c2cc62026553", // Galaxy M17 Sapphire Black on the Silver page
];
const DROP = [
  "d6481a46-0b0d-4363-a6b7-7a78f5092a75", // Pixel 10a Fog, zero observations
  "fcbf6217-bfba-4943-a0d0-c914b0cb6a07", // Jordan Legacy 312, zero observations
];
const RENAME = {
  productId: "396b6d4f-dc15-45ab-97dc-566f86bae484",
  title: "Flomaster Towelmate Seat Cover for Maruti Swift (Set of 3, White)",
};

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base).slice(0, 70);
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const hit = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate));
    if (!hit.length) return candidate;
  }
}

(async () => {
  const [before] = (await client.execute("SELECT COUNT(*) AS n FROM observations")).rows;
  console.log(`observations before: ${before.n}  mode: ${apply ? "APPLY" : "dry-run"}\n`);

  for (const id of SPLITS) {
    const [l] = await db.select().from(listings).where(eq(listings.id, id));
    if (!l) continue;
    const [p] = await db.select().from(products).where(eq(products.id, l.productId));
    const [o] = await db
      .select({ n: sql<number>`count(*)` })
      .from(observations)
      .where(eq(observations.listingId, id));
    console.log(`SPLIT ${id} (${o.n} points)  ←  ${p?.title}\n                       →  ${l.title}`);
    if (!apply) continue;
    const now = Date.now();
    const newId = randomUUID();
    const title = l.title ?? p?.title ?? "Untitled product";
    const slug = await uniqueSlug(`${title}-${l.merchantProductId}`);
    await db.insert(products).values({
      id: newId,
      slug,
      title,
      brand: p?.brand ?? null,
      category: p?.category ?? null,
      imageUrl: null,
      images: null,
      specs: null,
      identityKey: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.update(listings).set({ productId: newId }).where(eq(listings.id, id));
    console.log(`  created product ${newId} (${slug})`);
  }

  for (const id of DROP) {
    const [l] = await db.select().from(listings).where(eq(listings.id, id));
    if (!l) continue;
    const [o] = await db
      .select({ n: sql<number>`count(*)` })
      .from(observations)
      .where(eq(observations.listingId, id));
    console.log(`DROP  ${id} (${o.n} points)  ${l.merchant} ${l.merchantProductId} | ${(l.title ?? "").slice(0, 60)}`);
    if (apply && o.n === 0) await db.delete(listings).where(eq(listings.id, id));
  }

  {
    const [p] = await db.select().from(products).where(eq(products.id, RENAME.productId));
    console.log(`RENAME ${RENAME.productId}\n  ← ${p?.title}\n  → ${RENAME.title}`);
    if (apply) {
      await db
        .update(products)
        .set({ title: RENAME.title, updatedAt: Date.now() })
        .where(eq(products.id, RENAME.productId));
    }
  }

  const [dup] = (
    await client.execute(
      "SELECT COUNT(*) AS n FROM (SELECT listing_id, observed_at FROM observations GROUP BY listing_id, observed_at HAVING COUNT(*) > 1)",
    )
  ).rows;
  console.log(`\nduplicate (listing, observed_at) groups: ${dup.n}`);

  if (apply) {
    const a = await client.execute(
      "DELETE FROM observations WHERE source LIKE 'imported%' AND EXISTS (SELECT 1 FROM observations o2 WHERE o2.listing_id = observations.listing_id AND o2.observed_at = observations.observed_at AND o2.source NOT LIKE 'imported%')",
    );
    const b = await client.execute(
      "DELETE FROM observations WHERE rowid NOT IN (SELECT MIN(rowid) FROM observations GROUP BY listing_id, observed_at)",
    );
    const [after] = (await client.execute("SELECT COUNT(*) AS n FROM observations")).rows;
    console.log(`deleted imported twins: ${a.rowsAffected}; duplicates: ${b.rowsAffected}`);
    console.log(`observations after: ${after.n}`);
  }
  process.exit(0);
})();
