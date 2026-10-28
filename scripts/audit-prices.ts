/**
 * Read-only price-plausibility audit.
 *
 *   npx tsx scripts/audit-prices.ts [--limit 25]
 *
 * Flags listings whose live price is implausible against their own recorded
 * series or their MRP. It changes nothing; it prints evidence.
 */
import "./env";
import { client } from "../src/lib/db/client";

const args = process.argv.slice(2);
const idx = args.indexOf("--limit");
const limit = idx !== -1 ? Number(args[idx + 1]) || 25 : 25;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

(async () => {
  const obs = await client.execute("SELECT listing_id, price FROM observations WHERE price IS NOT NULL AND price > 0");
  const byListing = new Map<string, number[]>();
  for (const r of obs.rows) {
    const id = String(r.listing_id);
    const list = byListing.get(id) ?? [];
    list.push(Number(r.price));
    byListing.set(id, list);
  }

  const listings = await client.execute(`
    SELECT l.id, l.price, l.mrp, l.in_stock, l.title AS ltitle, p.title AS ptitle, p.slug
    FROM listings l JOIN products p ON p.id = l.product_id
    WHERE l.price IS NOT NULL`);

  const flags: { id: string; slug: string; price: number; median: number; mrp: number | null; reason: string; title: string }[] = [];
  for (const row of listings.rows) {
    const id = String(row.id);
    const price = Number(row.price);
    const mrp = row.mrp !== null ? Number(row.mrp) : null;
    const series = byListing.get(id) ?? [];
    const med = median(series);
    const title = String(row.ptitle ?? row.ltitle ?? "");
    const reasons: string[] = [];
    if (price < 50) reasons.push("under ₹50");
    if (series.length >= 5 && med > 0 && price < med * 0.25) reasons.push(`${Math.round((1 - price / med) * 100)}% under median ₹${Math.round(med)}`);
    if (series.length >= 5 && med > 0 && price > med * 3) reasons.push(`${Math.round((price / med - 1) * 100)}% over median ₹${Math.round(med)}`);
    if (mrp && mrp > 5000 && price < mrp * 0.05) reasons.push(`${Math.round((1 - price / mrp) * 100)}% under MRP`);
    if (reasons.length) flags.push({ id, slug: String(row.slug), price, median: Math.round(med), mrp, reason: reasons.join("; "), title });
  }

  flags.sort((a, b) => (a.median ? a.price / a.median : 0) - (b.median ? b.price / b.median : 0));
  console.log(`flagged ${flags.length} of ${listings.rows.length} listings\n`);
  for (const f of flags.slice(0, limit)) {
    console.log(`₹${f.price} (median ₹${f.median}) · ${f.reason}\n  ${f.title.slice(0, 90)}\n  ${f.slug}\n`);
  }
  process.exit(0);
})();
