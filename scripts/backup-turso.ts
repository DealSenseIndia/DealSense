/**
 * Full logical backup of the Turso database to a local folder.
 *
 *   npx tsx scripts/backup-turso.ts [--out backups]
 *
 * Writes one JSONL file per table (keyset-paginated, so a 200k-row table does
 * not have to fit in one response), the original CREATE statements, and a
 * manifest with per-file row counts and SHA-256 so a restore can be verified.
 * Never prints credentials or connection strings.
 */
import "./env";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { client } from "../src/lib/db/client";

const PAGE = 10_000;

function stamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const root = path.resolve(outIdx !== -1 ? args[outIdx + 1] : "backups");
  const dir = path.join(root, `turso-${stamp()}`);
  await mkdir(dir, { recursive: true });

  const tablesRes = await client.execute(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_drizzle%' ORDER BY name",
  );
  const tables = tablesRes.rows.map((r) => ({ name: String(r.name), sql: String(r.sql ?? "") }));

  const schema = tables
    .map((t) => `${t.sql};`)
    .join("\n\n")
    .concat("\n");
  await writeFile(path.join(dir, "schema.sql"), schema, "utf8");

  const manifest: {
    createdAt: string;
    dir: string;
    tables: { name: string; rows: number; file: string; sha256: string }[];
  } = { createdAt: new Date().toISOString(), dir, tables: [] };

  for (const { name } of tables) {
    const file = path.join(dir, `${name}.jsonl`);
    const hash = createHash("sha256");
    let rows = 0;
    let buffer = "";
    let lastRowid: number | null = null;

    for (;;) {
      const page: Awaited<ReturnType<typeof client.execute>> =
        lastRowid === null
          ? await client.execute(
              `SELECT rowid AS __rowid, * FROM "${name}" ORDER BY rowid LIMIT ${PAGE}`,
            )
          : await client.execute(
              `SELECT rowid AS __rowid, * FROM "${name}" WHERE rowid > ${lastRowid} ORDER BY rowid LIMIT ${PAGE}`,
            );
      if (!page.rows.length) break;
      for (const row of page.rows) {
        buffer += JSON.stringify(row) + "\n";
        rows++;
      }
      lastRowid = Number(page.rows[page.rows.length - 1].__rowid);
      if (page.rows.length < PAGE) break;
    }

    hash.update(buffer);
    await writeFile(file, buffer, "utf8");
    manifest.tables.push({
      name,
      rows,
      file: path.basename(file),
      sha256: hash.digest("hex"),
    });
    process.stdout.write(`  ${name}: ${rows} rows\n`);
  }

  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nbackup written to ${dir}`);
  console.log(`verify: ${manifest.tables.map((t) => `${t.name}=${t.rows}`).join(" ")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
