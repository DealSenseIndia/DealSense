/**
 * Local catalogue → Turso (the database the deployed site reads).
 *
 * The whole site is developed against `data/dealsense.db`, a file nothing on
 * the internet can see. Production runs on a remote libSQL database. This
 * script is the bridge: it creates the schema on the destination if needed,
 * then copies every table row-for-row with INSERT OR REPLACE, so it is safe to
 * re-run after every new import pass.
 *
 *   # dry run — show what would be copied
 *   npx tsx scripts/migrate-to-turso.ts --dry
 *
 *   # the real thing (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN from .env.local)
 *   npx tsx scripts/migrate-to-turso.ts
 *
 *   # prove the copy works without a Turso account
 *   TURSO_DATABASE_URL=file:./data/migration-test.db \
 *     npx tsx scripts/migrate-to-turso.ts --allow-file-dest
 *
 * Rules:
 *   • never overwrites the source; refuses if source and destination match;
 *   • column list is read from the live source, so schema drift is visible;
 *   • verifies row counts per table at the end and exits non-zero on a mismatch.
 */
import "./env";
import { createClient, type Client, type Row } from "@libsql/client";
import { SCHEMA_DDL } from "../src/lib/db/client";

const TABLES = [
  // Parents first: a reader opening the site mid-copy should never see an
  // observation without its listing.
  "products",
  "listings",
  "observations",
  "reviews",
  "alerts",
  "alert_events",
  "events",
] as const;

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const num = (v: unknown) => (v === undefined || v === null ? 0 : Number(v));

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? "");
}

async function count(db: Client, table: string): Promise<number> {
  const res = await db.execute(`SELECT COUNT(*) AS n FROM ${ident(table)}`);
  return num(res.rows[0]?.n);
}

async function main() {
  const dry = process.argv.includes("--dry");
  const allowFileDest = process.argv.includes("--allow-file-dest");
  const only = (arg("tables") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tables = TABLES.filter((t) => !only.length || only.includes(t));

  const srcUrl = process.env.LOCAL_DATABASE_URL || "file:./data/dealsense.db";
  const dstUrl = process.env.TURSO_DATABASE_URL || "";
  if (!dstUrl) {
    throw new Error(
      "TURSO_DATABASE_URL is empty. Set it to the database the deployed site reads, or pass a file: URL with --allow-file-dest to rehearse the copy.",
    );
  }
  if (!allowFileDest && !/^(libsql|https|wss):\/\//.test(dstUrl)) {
    throw new Error("Refusing to treat a non-remote URL as the destination without --allow-file-dest.");
  }
  if (dstUrl === srcUrl) throw new Error("Source and destination are the same database.");

  const src = createClient({ url: srcUrl });
  const dst = createClient({ url: dstUrl, authToken: process.env.TURSO_AUTH_TOKEN || undefined });

  // Fold the WAL into the main file so the snapshot we read is complete.
  await src.execute("PRAGMA wal_checkpoint(TRUNCATE)").catch(() => {});
  await dst.execute("PRAGMA busy_timeout=8000").catch(() => {});

  const host = dstUrl.replace(/^[a-z]+:\/\//, "").split(/[/?]/)[0];
  console.log(`source      ${srcUrl}`);
  console.log(`destination ${host}`);
  console.log(dry ? "mode        DRY RUN — nothing is written\n" : "mode        WRITE\n");

  if (!dry) await dst.executeMultiple(SCHEMA_DDL);

  let failed = false;
  for (const table of tables) {
    let info;
    try {
      info = await src.execute(`PRAGMA table_info(${ident(table)})`);
    } catch {
      console.log(`${table.padEnd(14)} missing in source — skipped`);
      continue;
    }
    const cols = info.rows.map((r: Row) => String(r.name));
    if (!cols.length) {
      console.log(`${table.padEnd(14)} missing in source — skipped`);
      continue;
    }
    const before = await count(src, table);
    if (dry) {
      let destCount = 0;
      try {
        destCount = await count(dst, table);
      } catch {
        /* destination has no schema yet */
      }
      console.log(`${table.padEnd(14)} ${String(before).padStart(8)} rows → destination currently ${destCount}`);
      continue;
    }
    if (!before) {
      console.log(`${table.padEnd(14)} ${String(0).padStart(8)} rows — nothing to copy`);
      continue;
    }

    const data = await src.execute(`SELECT ${cols.map(ident).join(", ")} FROM ${ident(table)}`);
    const perStatement = Math.max(1, Math.floor(750 / cols.length));
    const statements: { sql: string; args: never[] }[] = [];
    for (let i = 0; i < data.rows.length; i += perStatement) {
      const chunk = data.rows.slice(i, i + perStatement);
      const placeholders = chunk.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
      const args = chunk.flatMap((row) =>
        cols.map((c) => (row[c] === undefined ? null : row[c])),
      ) as never[];
      statements.push({
        sql: `INSERT OR REPLACE INTO ${ident(table)} (${cols.map(ident).join(", ")}) VALUES ${placeholders}`,
        args,
      });
    }

    // One network round trip per 25 statements; the whole batch is a transaction.
    const started = Date.now();
    for (let i = 0; i < statements.length; i += 25) {
      await dst.batch(statements.slice(i, i + 25), "write");
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`${table.padEnd(14)} ${String(before).padStart(8)} rows copied in ${secs}s`);
  }

  if (dry) {
    console.log("\nDry run finished. Re-run without --dry to write.");
    return;
  }

  console.log("\nVerifying row counts");
  for (const table of tables) {
    let a = 0;
    let b = 0;
    try {
      a = await count(src, table);
      b = await count(dst, table);
    } catch {
      failed = true;
    }
    const ok = a === b;
    if (!ok) failed = true;
    console.log(`${table.padEnd(14)} source ${String(a).padStart(8)} · destination ${String(b).padStart(8)} ${ok ? "ok" : "MISMATCH"}`);
  }

  // The most recent recorded price is the thing the deployed site must get right.
  try {
    const latest = await dst.execute("SELECT MAX(observed_at) AS t FROM observations");
    const t = Number(latest.rows[0]?.t ?? 0);
    console.log(`\nLatest observation in destination: ${t ? new Date(t).toISOString() : "none"}`);
  } catch {
    /* ignore */
  }

  if (failed) {
    console.error("\nOne or more tables did not match. Do not deploy on this database.");
    process.exitCode = 1;
  } else {
    console.log("\nCopy verified. The deployed site can read this database.");
  }
}

main().catch((err) => {
  console.error(`\nMigration failed: ${(err as Error).message}`);
  process.exit(1);
});
