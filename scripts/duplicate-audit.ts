/**
 * Read-only duplicate audit.
 *
 *   npx tsx scripts/duplicate-audit.ts [--limit 15]
 *
 * Flipkart ids are case-insensitive, so two listings can share one real store
 * product under different casings. The refresh queue keeps the row with the
 * latest check. This report shows every excluded row and, crucially, whether
 * the twin belongs to the **same product** (a safe merge candidate) or a
 * different one (a mis-association that needs identity work first).
 *
 * It never edits anything. The JSON report lands in the gitignored reports/.
 */
import "./env";
import { writeFileSync } from "node:fs";
import { canonicalListingWhere } from "../src/lib/db/canonical";
import { client } from "../src/lib/db/client";

const args = process.argv.slice(2);
const idx = args.indexOf("--limit");
const limit = idx !== -1 ? Number(args[idx + 1]) || 15 : 15;

interface Dupe {
  id: string;
  productId: string;
  merchant: string;
  mpid: string;
  url: string;
  title: string | null;
  productTitle: string;
  checkedAt: number | null;
  observations: number;
  reviews: number;
}

interface Twin {
  id: string;
  productId: string;
  mpid: string;
  url: string;
  title: string | null;
  productTitle: string;
  checkedAt: number | null;
  observations: number;
  reviews: number;
}

(async () => {
  const dupes = await client.execute({
    sql: `SELECT listings.id, listings.product_id AS productId, listings.merchant,
                 listings.merchant_product_id AS mpid, listings.url, listings.title,
                 listings.last_checked_at AS checkedAt,
                 products.title AS productTitle,
                 (SELECT COUNT(*) FROM observations o WHERE o.listing_id = listings.id) AS observations,
                 (SELECT COUNT(*) FROM reviews r WHERE r.listing_id = listings.id) AS reviews
          FROM listings JOIN products ON products.id = listings.product_id
          WHERE listings.merchant IN ('amazon','flipkart')
            AND NOT (${canonicalListingWhere("listings", "twin")})
          ORDER BY listings.merchant, lower(listings.merchant_product_id)`,
    args: [],
  });

  const rows: { dupe: Dupe; twin: Twin | null; sameProduct: boolean }[] = [];
  for (const raw of dupes.rows) {
    const dupe = raw as unknown as Dupe;
    const twinRes = await client.execute({
      sql: `SELECT listings.id, listings.product_id AS productId, listings.merchant_product_id AS mpid,
                   listings.url, listings.title, listings.last_checked_at AS checkedAt,
                   products.title AS productTitle,
                   (SELECT COUNT(*) FROM observations o WHERE o.listing_id = listings.id) AS observations,
                   (SELECT COUNT(*) FROM reviews r WHERE r.listing_id = listings.id) AS reviews
            FROM listings JOIN products ON products.id = listings.product_id
            WHERE listings.merchant = ? AND lower(listings.merchant_product_id) = lower(?) AND listings.id <> ?
            ORDER BY COALESCE(listings.last_checked_at, 0) DESC, listings.id ASC LIMIT 1`,
      args: [String(dupe.merchant), String(dupe.mpid), String(dupe.id)],
    });
    const twin = (twinRes.rows[0] as unknown as Twin | undefined) ?? null;
    rows.push({
      dupe,
      twin,
      sameProduct: twin !== null && String(twin.productId) === String(dupe.productId),
    });
  }

  const sameProduct = rows.filter((r) => r.sameProduct).length;
  const crossProduct = rows.length - sameProduct;
  const payload = {
    at: new Date().toISOString(),
    total: rows.length,
    sameProduct,
    crossProduct,
    rows,
  };
  writeFileSync("reports/duplicate-audit-2026-10-30.json", JSON.stringify(payload, null, 2));

  console.log(
    `excluded rows: ${rows.length} · same product: ${sameProduct} · cross product: ${crossProduct}`,
  );
  const cross = rows.filter((r) => !r.sameProduct).slice(0, limit);
  if (cross.length) {
    console.log("\ncross-product (needs identity work before any merge):");
    for (const row of cross) {
      console.log(
        `  ${row.dupe.merchant} ${row.dupe.mpid} · ${row.dupe.id} -> ${row.twin?.id ?? "missing"}\n` +
          `    dupe product: ${row.dupe.productTitle}\n` +
          `    dupe listing: ${row.dupe.title ?? "(no title)"}\n` +
          `    twin product: ${row.twin?.productTitle ?? "(missing)"}`,
      );
    }
  }
  const same = rows.filter((r) => r.sameProduct).slice(0, limit);
  if (same.length) {
    console.log("\nsame-product (merge candidate after point dedupe):");
    for (const row of same) {
      console.log(
        `  ${row.dupe.merchant} ${row.dupe.mpid} · ${row.dupe.id} -> ${row.twin?.id ?? "missing"} · ` +
          `${row.dupe.observations} obs / ${row.dupe.reviews} reviews`,
      );
    }
  }
  console.log("\nreport: reports/duplicate-audit-2026-10-30.json");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
