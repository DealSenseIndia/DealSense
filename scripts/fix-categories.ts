/**
 * Map products whose stored category resolves to no taxonomy leaf.
 *
 *   npx tsx scripts/fix-categories.ts            # dry run
 *   npx tsx scripts/fix-categories.ts --apply    # write the mapping
 *
 * Only products that currently map to nothing are touched, and only where a
 * rule is unambiguous. A rule is a category pattern plus an optional title
 * pattern; a product that matches nothing is left exactly as it is. Every
 * change is logged to reports/category-fix-<date>.json.
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { client } from "../src/lib/db/client";
import { resolveLeaf } from "../src/lib/db/taxonomy";

const apply = process.argv.includes("--apply");

interface Rule {
  category?: RegExp;
  title?: RegExp;
  leaf: string;
  why: string;
}

const RULES: Rule[] = [
  { category: /^(Google|REDMI|POCO) Mobiles$/i, leaf: "Smartphones", why: "brand-labelled phones" },
  { category: /True Wireless|Neckband/i, leaf: "Earbuds", why: "true-wireless buds" },
  { category: /^(Bumpers|Basic Cases)$/i, leaf: "Cases & Covers", why: "phone cases" },
  { category: /^Sony PS5$/i, leaf: "Gaming Consoles", why: "console" },
  { category: /Gamepads/i, leaf: "Controllers", why: "game controller" },
  { category: /^Eau de Parfum$/i, leaf: "Fragrance", why: "perfume" },
  { category: /^Dress Material$/i, leaf: "Sarees", why: "saree" },
  { category: /^Foot Care$/i, leaf: "Kids Shoes", why: "kids shoes" },
  { category: /^(Handheld|Futon & Mattress) Vacuums$/i, leaf: "Vacuum Cleaners", why: "vacuum" },
  { category: /^Home & Kitchen$/i, title: /air fryer/i, leaf: "Air Fryers", why: "air fryer" },
  { category: /^Home & Kitchen$/i, title: /water purifier/i, leaf: "Water Purifiers", why: "purifier" },
  { category: /^Home & Kitchen$/i, title: /vacuum cleaner/i, leaf: "Vacuum Cleaners", why: "vacuum" },
  { category: /^Beauty & Personal Care$/i, title: /sunscreen/i, leaf: "Sunscreen", why: "sunscreen" },
  { category: /^Beauty & Personal Care$/i, title: /vitamin c/i, leaf: "Vitamin C", why: "vitamin C serum" },
  { category: /^Fashion & Apparel$/i, title: /running shoes|sports shoes/i, leaf: "Running Shoes", why: "running shoes" },
  { category: /^Fashion & Apparel$/i, title: /smart ?watch/i, leaf: "Smart Watches", why: "smartwatch" },
  { category: /^XBOX 360 PRICE$/i, leaf: "Laptops", why: "misfiled laptop" },
  { category: /ZOTAC Graphic Cards|RTX \d{4}/i, leaf: "Graphics Cards", why: "graphics card" },
  { category: /Kettles & Hot Water Dispensers/i, leaf: "Electric Kettles", why: "electric kettle" },
  { category: /Mixer Juicer Grinder/i, leaf: "Mixer Grinders", why: "mixer grinder" },
  { category: /GoPro Sports & Action/i, leaf: "Action Cameras", why: "action camera" },
  { category: /^(Computer Workstations|Lapdesks|Ganesh Enterprises Kids Table)$/i, leaf: "Tables", why: "study table" },
  { category: /^Cabinet Straps$/i, leaf: "Child Locks", why: "child-proof latch" },
];

(async () => {
  const rows = await client.execute(
    "SELECT id, title, category FROM products WHERE category IS NOT NULL AND TRIM(category) != ''",
  );

  const changes: { id: string; title: string; from: string; to: string; why: string }[] = [];
  let unmapped = 0;

  for (const row of rows.rows) {
    const category = String(row.category);
    if (resolveLeaf(category)) continue;
    unmapped++;
    const title = String(row.title ?? "");
    const rule = RULES.find(
      (r) => (!r.category || r.category.test(category)) && (!r.title || r.title.test(title)),
    );
    if (!rule) continue;
    if (!resolveLeaf(rule.leaf)) {
      console.log(`SKIP bad leaf "${rule.leaf}" for ${category}`);
      continue;
    }
    changes.push({ id: String(row.id), title, from: category, to: rule.leaf, why: rule.why });
  }

  const byLeaf = new Map<string, number>();
  for (const c of changes) byLeaf.set(c.to, (byLeaf.get(c.to) ?? 0) + 1);

  console.log(`unmapped before: ${unmapped} · will map: ${changes.length} · left: ${unmapped - changes.length}\n`);
  for (const [leaf, n] of [...byLeaf.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  → ${leaf}`);
  }

  if (!apply) {
    console.log("\ndry run — pass --apply to write these mappings.");
    process.exit(0);
  }

  mkdirSync("reports", { recursive: true });
  const file = `reports/category-fix-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), changes }, null, 2));

  let done = 0;
  for (const c of changes) {
    const res = await client.execute({
      sql: "UPDATE products SET category = ?, updated_at = ? WHERE id = ?",
      args: [c.to, Date.now(), c.id],
    });
    done += res.rowsAffected;
  }
  console.log(`\nupdated ${done} products · ${file}`);
  process.exit(0);
})();
