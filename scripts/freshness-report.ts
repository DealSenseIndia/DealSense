/**
 * Freshness report — how old is the price on every tracked listing?
 *
 *   npx tsx scripts/freshness-report.ts
 *
 * Reads whichever database the environment points at, so the same command is
 * used before launch (TURSO_DATABASE_URL unset → local file), after the
 * migration, and against production. The point is to answer one question the
 * deal site lives or dies by: can a visitor trust that the number on screen is
 * recent? Percentiles are computed here rather than in SQL so the output is the
 * same on SQLite and Turso.
 */
import "./env";
import { ensureSchema, client } from "../src/lib/db/client";

const DAY = 86_400_000;

function pct(values: number[], p: number): number {
  if (!values.length) return 0;
  const i = Math.min(values.length - 1, Math.max(0, Math.round((p / 100) * (values.length - 1))));
  return values[i];
}

function human(ms: number): string {
  if (ms < 60_000) return "under a minute";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

async function main() {
  await ensureSchema();
  const res = await client.execute(`
    SELECT l.id, l.merchant, l.title, MAX(o.observed_at) AS latest
    FROM listings l
    JOIN observations o ON o.listing_id = l.id
    GROUP BY l.id
  `);
  const now = Date.now();
  const rows = res.rows
    .map((r) => ({
      merchant: String(r.merchant),
      title: r.title ? String(r.title) : "(untitled)",
      latest: Number(r.latest),
    }))
    .filter((r) => Number.isFinite(r.latest))
    .sort((a, b) => a.latest - b.latest);

  if (!rows.length) {
    console.log("No listings with recorded prices yet.");
    return;
  }

  const ages = rows.map((r) => Math.max(0, now - r.latest));
  const day = (d: number) => ages.filter((a) => a <= d * DAY).length;
  console.log(`${rows.length} tracked listings`);
  console.log(`  updated in the last 24h   ${String(day(1)).padStart(5)}  ${((day(1) / rows.length) * 100).toFixed(0)}%`);
  console.log(`  updated in the last 7d    ${String(day(7)).padStart(5)}  ${((day(7) / rows.length) * 100).toFixed(0)}%`);
  console.log(`  updated in the last 30d   ${String(day(30)).padStart(5)}  ${((day(30) / rows.length) * 100).toFixed(0)}%`);

  console.log(
    `\nage of newest price: median ${human(pct(ages, 50))} · p90 ${human(pct(ages, 90))} · oldest ${human(ages[ages.length - 1])}`,
  );

  console.log("\noldest ten:");
  for (const r of rows.slice(0, 10)) {
    console.log(
      `  ${String(Math.round((now - r.latest) / DAY)).padStart(4)}d  ${r.merchant.padEnd(10)} ${r.title.slice(0, 64)}`,
    );
  }

  const byMerchant = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byMerchant.get(r.merchant) ?? [];
    arr.push(now - r.latest);
    byMerchant.set(r.merchant, arr);
  }
  console.log("\nby store (median age):");
  for (const [merchant, list] of [...byMerchant].sort((a, b) => b[1].length - a[1].length)) {
    list.sort((a, b) => a - b);
    console.log(`  ${merchant.padEnd(10)} ${String(list.length).padStart(5)} listings · median ${human(pct(list, 50))}`);
  }
}

main().then(() => process.exit(0));
