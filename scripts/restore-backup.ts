/**
 * Restore a JSONL backup into a local SQLite database.
 *
 *   npx tsx scripts/restore-backup.ts --from backups/turso-... --to data/dealsense-local.db
 *
 * Creates the tables from the backup's schema.sql and streams every JSONL row
 * in 500-row batches. It never touches the source backup. The __rowid field
 * added by the dumper is dropped; every real column is preserved.
 */
import { createClient } from "@libsql/client";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name: string): string | null {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] ?? null : null;
}
function latestBackup(): string {
  const dirs = readdirSync("backups")
    .filter((d) => d.startsWith("turso-"))
    .map((d) => ({ d, t: statSync(path.join("backups", d)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!dirs.length) throw new Error("No backups/turso-* directory found");
  return path.join("backups", dirs[0].d);
}

const from = path.resolve(arg("--from") ?? latestBackup());
const to = path.resolve(arg("--to") ?? "data/dealsense-local.db");
const force = args.includes("--force");

if (!existsSync(path.join(from, "manifest.json"))) {
  throw new Error(`No manifest.json in ${from}`);
}
if (existsSync(to) && !force) {
  throw new Error(`${to} already exists; pass --force to replace it`);
}

const manifest = JSON.parse(readFileSync(path.join(from, "manifest.json"), "utf8")) as {
  tables: { name: string; rows: number; file: string }[];
};
const schema = readFileSync(path.join(from, "schema.sql"), "utf8");
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

const client = createClient({ url: `file:${to}` });

function quote(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

(async () => {
  await client.execute("PRAGMA journal_mode=WAL");
  for (const statement of statements) {
    await client.execute(statement);
  }
  console.log(`schema: ${statements.length} statements`);

  for (const table of manifest.tables) {
    const file = path.join(from, table.file);
    if (!existsSync(file) || table.rows === 0) {
      console.log(`${table.name}: 0 rows`);
      continue;
    }
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
    let columns: string[] | null = null;
    let sql = "";
    let batch: { sql: string; args: any[] }[] = [];
    let inserted = 0;

    const flush = async () => {
      if (!batch.length) return;
      await client.batch(batch as never);
      inserted += batch.length;
      batch = [];
    };

    for await (const line of rl) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as Record<string, unknown>;
      delete row.__rowid;
      if (!columns) {
        columns = Object.keys(row);
        sql = `INSERT INTO ${quote(table.name)} (${columns.map(quote).join(", ")}) VALUES (${columns
          .map(() => "?")
          .join(", ")})`;
      }
      batch.push({ sql, args: columns!.map((c) => row[c] as never) });
      if (batch.length >= 500) await flush();
    }
    await flush();
    console.log(`${table.name}: ${inserted} rows${inserted === table.rows ? "" : ` (expected ${table.rows})`}`);
  }

  for (const table of manifest.tables) {
    const r = await client.execute(`SELECT COUNT(*) AS n FROM ${quote(table.name)}`);
    const n = Number(r.rows[0]?.n ?? 0);
    if (n !== table.rows) throw new Error(`${table.name}: restored ${n}, expected ${table.rows}`);
  }
  console.log(`restored ${to}`);
  client.close();
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
