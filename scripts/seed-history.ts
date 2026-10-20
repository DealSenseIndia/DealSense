/**
 * Import historical price series for products we already track.
 *
 * For every listing that has no imported history yet, pull the provider's
 * real price series once and store it permanently in our own observation
 * table (source = "imported"). After that the product never needs the
 * provider again — we own the data.
 *
 *   npm run history
 *   npm run history -- --limit 20
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, observations } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { addObservation } from "../src/lib/db/queries";
import { fetchExternalHistory } from "../src/lib/engine/providers";
import { closePlaywright } from "../src/lib/merchants/http";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 25 : 25;

  const rows = await db
    .select({
      id: listings.id,
      merchant: listings.merchant,
      asin: listings.merchantProductId,
      title: listings.title,
      price: listings.price,
    })
    .from(listings)
    .limit(limit * 3);

  // Skip listings that already have imported history.
  const candidates: typeof rows = [];
  for (const r of rows) {
    if (candidates.length >= limit) break;
    const existing = await db
      .select({ source: observations.source })
      .from(observations)
      .where(eq(observations.listingId, r.id));
    if (existing.some((o) => o.source === "imported")) continue;
    candidates.push(r);
  }

  console.log(`Importing history for ${candidates.length} listing(s)…\n`);

  let imported = 0;
  let missed = 0;
  for (const c of candidates) {
    try {
      const ext = await fetchExternalHistory(
        c.merchant as "amazon" | "flipkart",
        c.asin,
        c.title ?? undefined,
      );
      if (!ext?.points.length) {
        missed++;
        console.log(`  · ${c.asin} — no history available`);
        continue;
      }
      for (const p of ext.points) {
        await addObservation({
          listingId: c.id,
          price: p.price,
          source: "imported",
          observedAt: p.t,
        });
      }
      imported++;
      const first = ext.points[0];
      const last = ext.points[ext.points.length - 1];
      console.log(
        `  ✓ ${c.asin} — ${ext.points.length} points (${new Date(first.t).toISOString().slice(0, 10)} → ${new Date(last.t).toISOString().slice(0, 10)}) via ${ext.provider}`,
      );
    } catch (err) {
      missed++;
      console.log(`  ✗ ${c.asin} — ${(err as Error).message}`);
    }
    await sleep(1200);
  }

  console.log(`\nImported ${imported}, missed ${missed}.`);
  await closePlaywright();
}

main().then(() => process.exit(0));
