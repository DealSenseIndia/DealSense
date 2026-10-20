/**
 * Catalogue hygiene: merge duplicate product rows and remove orphans.
 *
 * Two problems this fixes:
 *  1. ORPHANS — a product row with no listing. It can never render a PDP
 *     (404) and, worse, its identity key would attract a brand-new listing
 *     and split the price history away from the real product.
 *  2. DUPLICATES — the same product stored twice (same title), each with its
 *     own listing and history. The verdict then only ever saw half the record.
 *
 *   npm run merge
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, observations, products } from "../src/lib/db/schema";
import { eq, sql } from "drizzle-orm";

function norm(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function main() {
  await ensureSchema();

  // ---------- group products by normalised title ----------
  const all = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      identityKey: products.identityKey,
      imageUrl: products.imageUrl,
    })
    .from(products);

  const groups = new Map<string, typeof all>();
  for (const p of all) {
    const k = norm(p.title);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(p);
    groups.set(k, g);
  }

  let merged = 0;
  let deleted = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Pick the survivor: most listings, then most observations, then oldest.
    const scored = await Promise.all(
      group.map(async (p) => {
        const [l] = await db
          .select({ n: sql<number>`count(*)` })
          .from(listings)
          .where(eq(listings.productId, p.id));
        const [o] = await db
          .select({ n: sql<number>`count(*)` })
          .from(observations)
          .innerJoin(listings, eq(observations.listingId, listings.id))
          .where(eq(listings.productId, p.id));
        return { p, listings: l?.n ?? 0, obs: o?.n ?? 0 };
      }),
    );

    scored.sort((a, b) => b.obs - a.obs || b.listings - a.listings);
    const keep = scored[0];

    for (const s of scored.slice(1)) {
      // Move listings (and their observations) onto the survivor.
      if (s.listings > 0) {
        await db
          .update(listings)
          .set({ productId: keep.p.id })
          .where(eq(listings.productId, s.p.id));
        console.log(
          `  moved ${s.listings} listing(s) / ${s.obs} obs → ${keep.p.slug}`,
        );
        merged++;
      } else {
        deleted++;
      }
      await db.delete(products).where(eq(products.id, s.p.id));
    }

    // The survivor inherits any identity key the duplicates had.
    const keys = group.map((g) => g.identityKey).filter(Boolean) as string[];
    if (keys.length && keep.p.identityKey !== keys[0]) {
      await db.update(products).set({ identityKey: keys[0] }).where(eq(products.id, keep.p.id));
      console.log(`  identityKey → ${keys[0]} on ${keep.p.slug}`);
    }
  }

  // ---------- remove any remaining orphans ----------
  const orphans = await db
    .select({ id: products.id, slug: products.slug, identityKey: products.identityKey })
    .from(products)
    .where(sql`not exists (select 1 from listings l where l.product_id = ${products.id})`);

  for (const o of orphans) {
    console.log(`  removed orphan: ${o.slug}`);
    await db.delete(products).where(eq(products.id, o.id));
    deleted++;
  }

  console.log(`\nMerged ${merged} duplicate product(s), removed ${deleted} orphan row(s).`);
}

main().then(() => process.exit(0));
