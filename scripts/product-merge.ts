/**
 * Merge exact duplicate products.
 *
 *   npx tsx scripts/product-merge.ts            # dry run
 *   npx tsx scripts/product-merge.ts --apply    # write, with a backup already taken
 *
 * Only groups whose product titles are identical after normalisation and whose
 * categories do not conflict (same category, or one side null) are merged.
 * Variant pairs and category conflicts are reported, never touched.
 *
 * A loser product is deleted only after every one of its listings has been
 * reassigned or merged into the winner. Its slug gets a permanent redirect.
 */
import "./env";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { canonicalListingWhere } from "../src/lib/db/canonical";
import { client } from "../src/lib/db/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const titleKey = (s: string) => norm(s).replace(/\s*(\.\.\.|…)?\s*more\s*$/, "").trim();

async function listing(id: string) {
  const r = await client.execute({
    sql: `SELECT id, product_id AS productId, merchant, merchant_product_id AS mpid,
                 (SELECT COUNT(*) FROM observations o WHERE o.listing_id=listings.id) AS obs,
                 (SELECT COUNT(*) FROM reviews r WHERE r.listing_id=listings.id) AS reviews
          FROM listings WHERE id = ?`,
    args: [id],
  });
  return r.rows[0] ?? null;
}

(async () => {
  const excluded = await client.execute({
    sql: `SELECT listings.id, listings.product_id AS pid FROM listings
          WHERE listings.merchant IN ('amazon','flipkart')
            AND NOT (${canonicalListingWhere("listings", "twin")})`,
    args: [],
  });

  const productIds = new Set<string>();
  for (const row of excluded.rows) productIds.add(String(row.pid));
  for (const row of excluded.rows) {
    const t = await client.execute({
      sql: `SELECT l.product_id AS pid FROM listings l JOIN listings d ON d.id = ?
            WHERE l.merchant = d.merchant AND lower(l.merchant_product_id)=lower(d.merchant_product_id)
              AND l.id <> d.id
            ORDER BY COALESCE(l.last_checked_at,0) DESC, l.id ASC LIMIT 1`,
      args: [String(row.id)],
    });
    if (t.rows[0]) productIds.add(String(t.rows[0].pid));
  }

  const ids = [...productIds];
  if (!ids.length) {
    console.log("no excluded products");
    process.exit(0);
  }
  const products = await client.execute({
    sql: `SELECT p.id, p.slug, p.title, p.category, p.created_at AS createdAt,
                 (SELECT COUNT(*) FROM listings l WHERE l.product_id=p.id) AS listings,
                 (SELECT COUNT(*) FROM observations o JOIN listings l ON l.id=o.listing_id WHERE l.product_id=p.id) AS obs
          FROM products p WHERE p.id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });

  const groups = new Map<string, any[]>();
  for (const p of products.rows) {
    const key = titleKey(String(p.title));
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(p);
    groups.set(key, arr);
  }

  const mergeGroups: { key: string; winner: any; losers: any[]; redirects: any[] }[] = [];
  const skipped: any[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const cats = [...new Set(group.map((p) => String(p.category ?? "")).filter((c) => c !== ""))];
    if (cats.length > 1) {
      skipped.push({ key, reason: "category conflict", products: group.map((p) => ({ slug: p.slug, cat: p.category })) });
      continue;
    }
    const winner = [...group].sort((a, b) => {
      const an = a.category ? 1 : 0;
      const bn = b.category ? 1 : 0;
      if (an !== bn) return bn - an;
      if (Number(b.listings) !== Number(a.listings)) return Number(b.listings) - Number(a.listings);
      if (Number(b.obs) !== Number(a.obs)) return Number(b.obs) - Number(a.obs);
      if (Number(a.createdAt) !== Number(b.createdAt)) return Number(a.createdAt) - Number(b.createdAt);
      return String(a.id).localeCompare(String(b.id));
    })[0];
    const losers = group.filter((p) => p.id !== winner.id);
    mergeGroups.push({
      key,
      winner,
      losers,
      redirects: losers
        .filter((p) => p.slug !== winner.slug)
        .map((p) => ({ source: `/product/${p.slug}`, destination: `/product/${winner.slug}`, permanent: true })),
    });
  }

  console.log(
    `groups: ${mergeGroups.length} mergeable · ${skipped.length} skipped · products in groups: ${products.rows.length}`,
  );
  for (const g of mergeGroups) {
    console.log(
      `MERGE ${g.winner.slug} (${g.winner.category ?? "no category"}, ${g.winner.listings} listings) <- ${g.losers
        .map((p) => `${p.slug} (${p.listings})`)
        .join(", ")}`,
    );
  }
  for (const s of skipped.slice(0, 12)) {
    console.log(`SKIP ${s.key}: ${s.reason} · ${JSON.stringify(s.products)}`);
  }

  const report: any = {
    at: new Date().toISOString(),
    applied: apply,
    groups: mergeGroups.map((g) => ({
      winner: g.winner.slug,
      losers: g.losers.map((p) => p.slug),
      redirects: g.redirects,
    })),
    skipped,
    results: [],
  };

  if (!apply) {
    writeFileSync(`reports/product-merge-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}.json`, JSON.stringify(report, null, 2));
    console.log("dry run only; re-run with --apply");
    process.exit(0);
  }

  const committedRedirects: any[] = [];
  let committed = 0;
  for (const g of mergeGroups) {
    const tx = await client.transaction("write");
    try {
      for (const loser of g.losers) {
        const loserListings = await tx.execute({
          sql: `SELECT id FROM listings WHERE product_id = ?`,
          args: [String(loser.id)],
        });
        for (const row of loserListings.rows) {
          const lid = String(row.id);
          const twin = await tx.execute({
            sql: `SELECT id FROM listings
                  WHERE product_id = ? AND merchant = (SELECT merchant FROM listings WHERE id = ?)
                    AND lower(merchant_product_id) = (SELECT lower(merchant_product_id) FROM listings WHERE id = ?)
                  LIMIT 1`,
            args: [String(g.winner.id), lid, lid],
          });
          const winnerListingId = twin.rows[0]?.id ? String(twin.rows[0].id) : null;
          if (winnerListingId) {
            const obs = await tx.execute({
              sql: `INSERT INTO observations
                      (id, listing_id, price, mrp, shipping, coupon, bank_discount, effective_price,
                       seller, rating, review_count, in_stock, source, observed_at, created_at)
                    SELECT lower(hex(randomblob(16))), ?, o.price, o.mrp, o.shipping, o.coupon, o.bank_discount, o.effective_price,
                           o.seller, o.rating, o.review_count, o.in_stock, o.source, o.observed_at, o.created_at
                    FROM observations o
                    WHERE o.listing_id = ?
                      AND NOT EXISTS (
                        SELECT 1 FROM observations w
                        WHERE w.listing_id = ? AND w.observed_at = o.observed_at AND w.price IS o.price
                      )`,
              args: [winnerListingId, lid, winnerListingId],
            });
            const reviews = await tx.execute({
              sql: `INSERT INTO reviews
                      (id, listing_id, author, stars, title, body, reviewed_at, verified, variant, helpful, source, created_at)
                    SELECT lower(hex(randomblob(16))), ?, r.author, r.stars, r.title, r.body, r.reviewed_at, r.verified,
                           r.variant, r.helpful, r.source, r.created_at
                    FROM reviews r
                    WHERE r.listing_id = ?
                      AND NOT EXISTS (
                        SELECT 1 FROM reviews w
                        WHERE w.listing_id = ? AND w.reviewed_at IS r.reviewed_at AND w.body IS r.body
                      )`,
              args: [winnerListingId, lid, winnerListingId],
            });
            await tx.execute({ sql: `UPDATE live_deals SET status='EXPIRED', updated_at=? WHERE listing_id=?`, args: [Date.now(), lid] });
            await tx.execute({ sql: `UPDATE alerts SET listing_id=?, product_id=?, updated_at=? WHERE listing_id=?`, args: [winnerListingId, String(g.winner.id), Date.now(), lid] });
            await tx.execute({ sql: `DELETE FROM listings WHERE id = ?`, args: [lid] });
            report.results.push({ group: g.winner.slug, listing: lid, outcome: "merged", observations: obs.rowsAffected, reviews: reviews.rowsAffected });
          } else {
            await tx.execute({ sql: `UPDATE listings SET product_id=?, updated_at=? WHERE id=?`, args: [String(g.winner.id), Date.now(), lid] });
            await tx.execute({ sql: `UPDATE live_deals SET product_id=? WHERE listing_id=?`, args: [String(g.winner.id), lid] });
            await tx.execute({ sql: `UPDATE alerts SET product_id=? WHERE listing_id=?`, args: [String(g.winner.id), lid] });
            report.results.push({ group: g.winner.slug, listing: lid, outcome: "reassigned" });
          }
        }
        const remaining = await tx.execute({
          sql: `SELECT COUNT(*) AS n FROM listings WHERE product_id = ?`,
          args: [String(loser.id)],
        });
        if (Number(remaining.rows[0]?.n ?? 0) > 0) {
          throw new Error(`loser product ${loser.slug} still has listings`);
        }
        await tx.execute({ sql: `DELETE FROM products WHERE id = ?`, args: [String(loser.id)] });
        report.results.push({ group: g.winner.slug, product: loser.slug, outcome: "deleted" });
      }
      await tx.execute({ sql: `UPDATE products SET updated_at=? WHERE id=?`, args: [Date.now(), String(g.winner.id)] });
      await tx.commit();
      committed++;
      committedRedirects.push(...g.redirects);
      report.results.push({ group: g.winner.slug, outcome: "committed" });
    } catch (err) {
      await tx.rollback().catch(() => {});
      report.results.push({ group: g.winner.slug, outcome: "rolled-back", error: (err as Error).message });
    }
  }

  const path = "data/product-redirects.json";
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
  const bySource = new Map<string, any>();
  for (const r of [...existing, ...committedRedirects]) bySource.set(r.source, r);
  writeFileSync(path, JSON.stringify([...bySource.values()], null, 2));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const reportPath = `reports/product-merge-${stamp}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`applied ${committed} of ${mergeGroups.length} groups · report ${reportPath} · redirects ${path}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
