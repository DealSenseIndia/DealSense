/**
 * Remove impossible points from recorded price series.
 *
 *   npx tsx scripts/clean-series.ts            # dry run
 *   npx tsx scripts/clean-series.ts --apply    # delete the flagged points
 *
 * A point is impossible when it sits more than 10x above, or 10x below, the
 * median of its own listing's series of ten or more points. A ₹5,49,900 point
 * on a ₹5,699 air fryer is an import error, not a price. Every deletion is
 * written to reports/series-cleanup-<date>.json so it can be audited.
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { client } from "../src/lib/db/client";

const apply = process.argv.includes("--apply");
const FACTOR = 10;
const MIN_POINTS = 10;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Point {
  rid: number;
  listingId: string;
  price: number;
  at: number;
  source: string;
  median: number;
  title: string;
}

(async () => {
  const rows = await client.execute(`
    SELECT o.rowid AS rid, o.listing_id, o.price, o.observed_at, o.source, l.title
    FROM observations o JOIN listings l ON l.id = o.listing_id
    WHERE o.price IS NOT NULL AND o.price > 0
    ORDER BY o.listing_id`);

  const by = new Map<string, { rid: number; price: number; at: number; source: string; title: string }[]>();
  for (const r of rows.rows) {
    const id = String(r.listing_id);
    const list = by.get(id) ?? [];
    list.push({ rid: Number(r.rid), price: Number(r.price), at: Number(r.observed_at), source: String(r.source), title: String(r.title ?? "") });
    by.set(id, list);
  }

  const bad: Point[] = [];
  for (const [listingId, series] of by) {
    if (series.length < MIN_POINTS) continue;
    const med = median(series.map((s) => s.price));
    if (!med) continue;
    for (const s of series) {
      if (s.price > med * FACTOR || s.price < med / FACTOR) {
        bad.push({ ...s, listingId, median: Math.round(med) });
      }
    }
  }

  console.log(`flagged ${bad.length} points across ${new Set(bad.map((b) => b.listingId)).size} listings`);
  for (const b of bad.slice(0, 12)) {
    console.log(`  ₹${b.price} (median ₹${b.median}) ${new Date(b.at).toISOString().slice(0, 10)} · ${b.title.slice(0, 60)}`);
  }

  if (!apply) {
    console.log("\ndry run — pass --apply to delete these points.");
    process.exit(0);
  }

  mkdirSync("reports", { recursive: true });
  const file = `reports/series-cleanup-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ deletedAt: new Date().toISOString(), factor: FACTOR, points: bad }, null, 2));

  let deleted = 0;
  for (const b of bad) {
    const res = await client.execute(`DELETE FROM observations WHERE rowid = ${b.rid}`);
    deleted += res.rowsAffected;
  }
  const left = await client.execute("SELECT COUNT(*) AS n FROM observations");
  console.log(`\ndeleted ${deleted} points · ${file} · remaining ${left.rows[0].n}`);
  process.exit(0);
})();
