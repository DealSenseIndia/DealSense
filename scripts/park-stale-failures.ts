/**
 * Park stale hard-failures instead of leaving them at the head of the queue.
 *
 *   npx tsx scripts/park-stale-failures.ts            # dry run, prints the plan
 *   npx tsx scripts/park-stale-failures.ts --apply    # writes next_check_at
 *
 * What it touches, and nothing else:
 *   • listings whose last_error is UNPRICED / BLOCKED / SQL-forbidden AND whose
 *     last attempt is more than 24 hours old (a failure from today keeps its
 *     normal backoff), and that are not already parked;
 *   • the one Amazon URL verified as a delisted 404 today, whose label is
 *     corrected from BLOCKED to DELISTED_404 and parked for 30 days.
 *
 * It never deletes a row, never changes failure_count, and never rewrites
 * updated_at: a deferral is not a new attempt, so the freshness numbers keep
 * counting only real store reads. A JSON manifest of the previous values is
 * written outside the database first, so every change can be reversed.
 */
import "./env";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { client } from "../src/lib/db/client";

const PARK_MS = 7 * 24 * 60 * 60 * 1000;
const DELISTED_PARK_MS = 30 * 24 * 60 * 60 * 1000;
/** A failure from the last day keeps its normal backoff. */
const STALE_MS = 24 * 60 * 60 * 1000;
/** Do not touch a row already parked for a week or more. */
const ALREADY_PARKED_MS = 6 * 24 * 60 * 60 * 1000;
/** Verified by hand on 2026-11-11: HTTP 404, "Page Not Found". */
const DELISTED_IDS = new Set(["B0FB91Q75H"]);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const allowLocal = args.includes("--allow-local");

interface Row {
  id: string;
  merchant: string;
  merchant_product_id: string;
  url: string;
  next_check_at: number | null;
  failure_count: number;
  last_error: string | null;
  family: "unpriced" | "blocked" | "sql" | "other";
}

function familyOf(message: string | null): Row["family"] {
  const t = (message ?? "").toUpperCase();
  if (t.includes("SQL") || t.includes("FORBIDDEN")) return "sql";
  if (t.includes("UNPRICED")) return "unpriced";
  if (t.includes("BLOCKED")) return "blocked";
  return "other";
}

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "";
  const host = url.startsWith("file:") ? "LOCAL_FILE" : url.split("://")[1]?.split(".")[0] ?? "unknown";
  if (url.startsWith("file:") && !allowLocal) {
    console.error("refusing to run against a local file without --allow-local");
    process.exit(2);
  }
  console.log(`database = ${host}${apply ? " (APPLY)" : " (dry run)"}`);

  const now = Date.now();
  const res = await client.execute({
    sql: `SELECT id, merchant, merchant_product_id, url, next_check_at, failure_count, last_error
          FROM listings
          WHERE (last_error LIKE '%EXTRACTION_FAILED_UNPRICED%'
                 OR last_error LIKE '%BLOCKED%'
                 OR last_error LIKE '%SQL%'
                 OR last_error LIKE '%forbidden%')
            AND updated_at < ?
            AND (next_check_at IS NULL OR next_check_at < ?)
          ORDER BY next_check_at ASC`,
    args: [now - STALE_MS, now + ALREADY_PARKED_MS],
  });

  const rows: Row[] = res.rows.map((r) => ({
    id: String(r.id),
    merchant: String(r.merchant),
    merchant_product_id: String(r.merchant_product_id),
    url: String(r.url),
    next_check_at: r.next_check_at === null ? null : Number(r.next_check_at),
    failure_count: Number(r.failure_count ?? 0),
    last_error: r.last_error === null ? null : String(r.last_error),
    family: familyOf(r.last_error === null ? null : String(r.last_error)),
  }));

  const byFamily = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.family] = (acc[r.family] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`selected ${rows.length} rows:`, JSON.stringify(byFamily));

  const delisted = rows.filter((r) => DELISTED_IDS.has(r.merchant_product_id));
  console.log(`delisted relabel: ${delisted.length} (${delisted.map((d) => d.merchant_product_id).join(", ") || "none"})`);

  if (!apply) {
    for (const r of rows.slice(0, 8)) {
      console.log(
        JSON.stringify({
          merchant: r.merchant,
          pid: r.merchant_product_id,
          failure_count: r.failure_count,
          error: (r.last_error ?? "").slice(0, 40),
          due: r.next_check_at ? new Date(r.next_check_at).toISOString() : null,
        }),
      );
    }
    console.log("dry run only; pass --apply to write next_check_at");
    process.exit(0);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    database: host,
    parkUntil: new Date(now + PARK_MS).toISOString(),
    rows: rows.map((r) => ({
      id: r.id,
      merchant: r.merchant,
      merchant_product_id: r.merchant_product_id,
      family: r.family,
      previous_next_check_at: r.next_check_at,
      previous_last_error: r.last_error,
      failure_count: r.failure_count,
    })),
  };
  const payload = JSON.stringify(manifest, null, 2);
  const dir = path.resolve("C:/Users/Khanna Computer/DealSense-backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `triage-${stamp()}.json`);
  writeFileSync(file, payload, "utf8");
  console.log(`manifest: ${file}`);
  console.log(`manifest sha256: ${createHash("sha256").update(payload).digest("hex")}`);

  let written = 0;
  for (const r of rows) {
    const isDelisted = DELISTED_IDS.has(r.merchant_product_id);
    const nextCheckAt = now + (isDelisted ? DELISTED_PARK_MS : PARK_MS);
    if (isDelisted) {
      await client.execute({
        sql: "UPDATE listings SET next_check_at = ?, last_error = ? WHERE id = ?",
        args: [nextCheckAt, "DELISTED_404: the store returned 404 Page Not Found (verified 2026-11-11).", r.id],
      });
    } else {
      await client.execute({
        sql: "UPDATE listings SET next_check_at = ? WHERE id = ?",
        args: [nextCheckAt, r.id],
      });
    }
    written++;
  }
  console.log(`parked ${written} rows until ${new Date(now + PARK_MS).toISOString()}`);

  const left = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM listings
          WHERE (last_error LIKE '%EXTRACTION_FAILED_UNPRICED%' OR last_error LIKE '%BLOCKED%'
                 OR last_error LIKE '%SQL%' OR last_error LIKE '%forbidden%')
            AND updated_at < ? AND (next_check_at IS NULL OR next_check_at < ?)`,
    args: [now - STALE_MS, now + ALREADY_PARKED_MS],
  });
  console.log(`recheck: still at the head = ${Number(left.rows[0]?.n ?? 0)} (idempotent re-run would select this many)`);

  const due = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM listings WHERE merchant IN ('amazon','flipkart')
          AND (next_check_at IS NULL OR next_check_at <= ?)`,
    args: [Date.now()],
  });
  console.log(`direct due queue now = ${Number(due.rows[0]?.n ?? 0)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("triage failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
