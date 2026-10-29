/**
 * Queue health — read-only. Answers the one question the price promise rests
 * on: how much of the directly-readable catalogue is actually being checked,
 * what is failing, and how far behind the refresh queue is.
 *
 *   npx tsx scripts/queue-health.ts
 *
 * Reads whichever database the environment points at. It never writes, calls a
 * worker or triggers a scrape, so it is safe to run against production.
 */
import "./env";
import { canonicalListingWhere } from "../src/lib/db/canonical";
import { client } from "../src/lib/db/client";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DIRECT = "('amazon','flipkart')";
const CANONICAL = canonicalListingWhere("listings", "twin");

function human(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "never";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (ms < DAY) return `${(ms / HOUR).toFixed(1)}h`;
  return `${(ms / DAY).toFixed(1)}d`;
}

function share(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))];
}

async function main() {
  const now = Date.now();
  const direct = await client.execute({
    sql: `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN last_checked_at IS NULL THEN 1 ELSE 0 END) AS never_checked,
            SUM(CASE WHEN last_checked_at > ? THEN 1 ELSE 0 END) AS within_24h,
            SUM(CASE WHEN last_checked_at IS NOT NULL AND last_checked_at <= ? THEN 1 ELSE 0 END) AS stale_24h
          FROM listings WHERE merchant IN ${DIRECT} AND ${CANONICAL}`,
    args: [now - DAY, now - DAY],
  });
  const d = direct.rows[0];

  const dupes = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM listings WHERE merchant IN ${DIRECT} AND NOT (${CANONICAL})`,
    args: [],
  });

  const due = await client.execute({
    sql: `SELECT COUNT(*) AS due, MIN(next_check_at) AS oldest_due
          FROM listings
          WHERE merchant IN ${DIRECT} AND next_check_at IS NOT NULL AND next_check_at <= ?
            AND ${CANONICAL}`,
    args: [now],
  });
  const q = due.rows[0];

  const ages = await client.execute({
    sql: `SELECT last_checked_at FROM listings WHERE merchant IN ${DIRECT} AND ${CANONICAL}`,
    args: [],
  });
  const sorted = ages.rows
    .map((row) => (row.last_checked_at === null ? Infinity : now - Number(row.last_checked_at)))
    .sort((a, b) => a - b);

  const failures = await client.execute({
    sql: `SELECT merchant, substr(last_error, 1, 80) AS error, COUNT(*) AS n
          FROM listings
          WHERE merchant IN ${DIRECT} AND failure_count > 0
          GROUP BY merchant, error
          ORDER BY n DESC`,
    args: [],
  });

  const tiers = await client.execute({
    sql: `SELECT COALESCE(json_extract(payload, '$.tier'), 'unknown') AS tier, COUNT(*) AS n
          FROM events
          WHERE type = 'analyze' AND created_at > ?
          GROUP BY tier
          ORDER BY n DESC`,
    args: [now - DAY],
  });

  const imported = await client.execute({
    sql: `SELECT COUNT(*) AS total,
                 SUM(CASE WHEN newest > ? THEN 1 ELSE 0 END) AS fresh_7d
          FROM (
            SELECT l.id, MAX(o.observed_at) AS newest
            FROM listings l
            LEFT JOIN observations o ON o.listing_id = l.id
            WHERE l.merchant NOT IN ${DIRECT}
            GROUP BY l.id
          )`,
    args: [now - 7 * DAY],
  });
  const importedRow = imported.rows[0];

  const total = Number(d.total ?? 0);
  const never = Number(d.never_checked ?? 0);
  const within = Number(d.within_24h ?? 0);
  const stale = Number(d.stale_24h ?? 0);
  const oldestDue = q.oldest_due === null ? null : now - Number(q.oldest_due);

  console.log(`DealSense queue health — ${new Date(now).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
  console.log(
    `\nDirect listings (Amazon/Flipkart): ${total} canonical · ${dupes.rows[0].n} duplicate rows excluded from the queue`,
  );
  console.log(`  checked <24h: ${within} (${share(within, total)})`);
  console.log(`  stale 24h+:    ${stale}`);
  console.log(`  never checked: ${never}`);
  console.log(`  check age: median ${human(percentile(sorted, 0.5))} · p90 ${human(percentile(sorted, 0.9))}`);

  console.log(`\nQueue: ${Number(q.due ?? 0)} due · oldest ${human(oldestDue)} overdue`);

  console.log("\nFailing listings:");
  if (!failures.rows.length) console.log("  none");
  for (const row of failures.rows) {
    console.log(`  ${String(row.merchant).padEnd(9)} ${String(row.error).padEnd(36)} ${row.n}`);
  }

  console.log("\nTier mix (reads, last 24h):");
  if (!tiers.rows.length) console.log("  none recorded yet");
  for (const row of tiers.rows) {
    console.log(`  ${String(row.tier).padEnd(9)} ${row.n}`);
  }

  const importedTotal = Number(importedRow.total ?? 0);
  console.log(
    `\nImported-only listings (no direct read): ${importedTotal} · newest point <7d: ${Number(importedRow.fresh_7d ?? 0)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
