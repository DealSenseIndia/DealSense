/**
 * Identity cleanup for case-insensitive merchant ids.
 *
 *   npx tsx scripts/identity-cleanup.ts            # dry run
 *   npx tsx scripts/identity-cleanup.ts --apply    # write, with a backup already taken
 *
 * Two listings can share one real store product under different casings but be
 * attached to different products. This script resolves the clear cases from
 * the store URL slug and product titles, moves the losing listing's price
 * history and reviews onto the winning listing, and removes the losing row.
 *
 * It never deletes a product. If the losing product would be left with no
 * listing, the pair is skipped and reported. Ambiguous pairs are left alone.
 */
import "./env";
import { writeFileSync } from "node:fs";
import { canonicalListingWhere } from "../src/lib/db/canonical";
import { client } from "../src/lib/db/client";
import { titleSimilarity } from "../src/lib/engine/identity";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 0 : 0;

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function clean(s: string | null): string {
  let n = norm(s);
  n = n.replace(/^take a look at this /, "").replace(/ on flipkart$/, "");
  n = n.replace(/^amazon in buy /, "").replace(/ online at low prices.*$/, "");
  n = n.replace(/ (?:i )?more$/, "");
  return n;
}
function slugOf(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const p = parts.indexOf("p");
    const seg = p > 0 ? parts[p - 1] : parts[parts.length - 1];
    return norm((seg ?? "").replace(/-/g, " ").replace(/\b\d{6,}\b/g, ""));
  } catch {
    return "";
  }
}
function modelTokens(s: string): Set<string> {
  const n = norm(s);
  const out = new Set<string>();
  const patterns = [
    /\bi[3579]\b/g,
    /\b(?:rtx|gtx)\s?\d{3,4}\b/g,
    /\b\d{4,5}[a-z]{2,}\b/g,
    /\b(?:snapdragon|dimensity|ryzen)\s?[a-z0-9]+\b/g,
  ];
  for (const re of patterns) for (const m of n.matchAll(re)) out.add(m[0].replace(/\s+/g, ""));
  return out;
}
function score(productTitle: string, listing: { title: string | null; url: string }) {
  const title = clean(listing.title);
  const slug = slugOf(listing.url);
  const sim = Math.max(
    title ? titleSimilarity(productTitle, title) : 0,
    slug ? titleSimilarity(productTitle, slug) : 0,
  );
  const pt = modelTokens(productTitle);
  const lt = new Set([...modelTokens(title), ...modelTokens(slug)]);
  let match = 0;
  let missing = 0;
  for (const t of lt) {
    if (pt.has(t)) match++;
    else missing++;
  }
  return { score: sim + match * 0.08 - missing * 0.04, sim, match, missing };
}

async function getListing(id: string) {
  const r = await client.execute({
    sql: `SELECT id, product_id AS productId, merchant, merchant_product_id AS mpid, url, title, price, mrp,
                 in_stock AS inStock, last_checked_at AS checkedAt, next_check_at AS nextCheck,
                 (SELECT COUNT(*) FROM observations o WHERE o.listing_id=listings.id) AS obs,
                 (SELECT COUNT(*) FROM reviews r WHERE r.listing_id=listings.id) AS reviews
          FROM listings WHERE id = ?`,
    args: [id],
  });
  return r.rows[0] ?? null;
}
async function getProduct(id: string) {
  const r = await client.execute({
    sql: `SELECT p.id, p.slug, p.title,
                 (SELECT COUNT(*) FROM listings l WHERE l.product_id=p.id) AS listings
          FROM products p WHERE p.id = ?`,
    args: [id],
  });
  return r.rows[0] ?? null;
}

(async () => {
  const excluded = await client.execute({
    sql: `SELECT listings.id FROM listings
          WHERE listings.merchant IN ('amazon','flipkart')
            AND NOT (${canonicalListingWhere("listings", "twin")})`,
    args: [],
  });

  type Plan = {
    dupe: any;
    twin: any;
    dupeProduct: any;
    twinProduct: any;
    isSame: boolean;
    winner: "dupe" | "twin" | null;
    reason: string;
    loserProductListings: number;
    skip: string | null;
  };
  const plans: Plan[] = [];

  for (const row of excluded.rows) {
    const dupe = await getListing(String(row.id));
    if (!dupe) continue;
    const twinRes = await client.execute({
      sql: `SELECT id FROM listings
            WHERE merchant = ? AND lower(merchant_product_id) = lower(?) AND id <> ?
            ORDER BY COALESCE(last_checked_at,0) DESC, id ASC LIMIT 1`,
      args: [String(dupe.merchant), String(dupe.mpid), String(dupe.id)],
    });
    const twin = twinRes.rows[0] ? await getListing(String(twinRes.rows[0].id)) : null;
    if (!twin) continue;
    const dupeProduct = await getProduct(String(dupe.productId));
    const twinProduct = await getProduct(String(twin.productId));
    if (!dupeProduct || !twinProduct) continue;

    const isSame = String(dupe.productId) === String(twin.productId);
    let winner: "dupe" | "twin" | null = null;
    let reason = "";
    if (isSame) {
      winner = "twin";
      reason = "same product";
    } else {
      const dOwn = score(String(dupeProduct.title), { title: dupe.title as string | null, url: String(dupe.url) });
      const dOther = score(String(twinProduct.title), { title: dupe.title as string | null, url: String(dupe.url) });
      const tOwn = score(String(twinProduct.title), { title: twin.title as string | null, url: String(twin.url) });
      const tOther = score(String(dupeProduct.title), { title: twin.title as string | null, url: String(twin.url) });
      const dp =
        dOwn.score >= dOther.score
          ? { p: "dupe" as const, s: dOwn.score }
          : { p: "twin" as const, s: dOther.score };
      const tp =
        tOwn.score >= tOther.score
          ? { p: "twin" as const, s: tOwn.score }
          : { p: "dupe" as const, s: tOther.score };
      if (dp.p === tp.p) {
        winner = dp.p;
        reason = "listings agree";
      } else {
        const dupeScore = Math.max(dOwn.score, dOther.score);
        const twinScore = Math.max(tOwn.score, tOther.score);
        if (Math.abs(dupeScore - twinScore) >= 0.08) {
          winner = dupeScore > twinScore ? "dupe" : "twin";
          reason = "stronger evidence";
        } else {
          winner = null;
          reason = "conflicting evidence";
        }
      }
    }

    const loserProduct = winner === "dupe" ? twinProduct : winner === "twin" ? dupeProduct : null;
    const loserProductListings = loserProduct ? Number(loserProduct.listings) : 0;
    let skip: string | null = null;
    if (!winner) skip = "ambiguous";
    else if (loserProductListings <= 1) skip = "would orphan the losing product";
    plans.push({ dupe, twin, dupeProduct, twinProduct, isSame, winner, reason, loserProductListings, skip });
  }

  const ready = plans.filter((p) => !p.skip);
  const ambiguous = plans.filter((p) => p.skip === "ambiguous");
  const orphanRisk = plans.filter((p) => p.skip === "would orphan the losing product");
  console.log(
    `excluded rows: ${plans.length} · ready: ${ready.length} · ambiguous: ${ambiguous.length} · orphan risk: ${orphanRisk.length}`,
  );

  const results: any[] = [];
  let done = 0;
  for (const plan of ready) {
    if (limit && done >= limit) break;
    const winnerListing = plan.winner === "dupe" ? plan.dupe : plan.twin;
    const loserListing = plan.winner === "dupe" ? plan.twin : plan.dupe;
    const winnerProduct = plan.winner === "dupe" ? plan.dupeProduct : plan.twinProduct;
    const loserProduct = plan.winner === "dupe" ? plan.twinProduct : plan.dupeProduct;

    if (!apply) {
      results.push({
        winnerListing: winnerListing.id,
        loserListing: loserListing.id,
        winnerProduct: winnerProduct.slug,
        loserProduct: loserProduct.slug,
        reason: plan.reason,
        obs: loserListing.obs,
        reviews: loserListing.reviews,
      });
      done++;
      continue;
    }

    const tx = await client.transaction("write");
    try {
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
        args: [winnerListing.id, loserListing.id, winnerListing.id],
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
        args: [winnerListing.id, loserListing.id, winnerListing.id],
      });
      await tx.execute({
        sql: `UPDATE live_deals SET status = 'EXPIRED', updated_at = ? WHERE listing_id = ?`,
        args: [Date.now(), loserListing.id],
      });
      await tx.execute({
        sql: `UPDATE alerts SET listing_id = ?, product_id = ?, updated_at = ? WHERE listing_id = ?`,
        args: [winnerListing.id, winnerListing.productId, Date.now(), loserListing.id],
      });
      if (
        loserListing.checkedAt !== null &&
        (winnerListing.checkedAt === null || Number(loserListing.checkedAt) > Number(winnerListing.checkedAt))
      ) {
        await tx.execute({
          sql: `UPDATE listings
                SET price = ?, mrp = ?, in_stock = ?, last_checked_at = ?, next_check_at = ?,
                    failure_count = 0, last_error = NULL, updated_at = ?
                WHERE id = ?`,
          args: [
            loserListing.price,
            loserListing.mrp,
            loserListing.inStock,
            loserListing.checkedAt,
            loserListing.nextCheck,
            Date.now(),
            winnerListing.id,
          ],
        });
      }
      await tx.execute({ sql: `DELETE FROM listings WHERE id = ?`, args: [loserListing.id] });
      await tx.commit();
      results.push({
        winnerListing: winnerListing.id,
        loserListing: loserListing.id,
        winnerProduct: winnerProduct.slug,
        loserProduct: loserProduct.slug,
        reason: plan.reason,
        observationsMoved: obs.rowsAffected,
        reviewsMoved: reviews.rowsAffected,
      });
      done++;
    } catch (err) {
      await tx.rollback().catch(() => {});
      results.push({ error: (err as Error).message, loserListing: loserListing.id });
    }
  }

  const report = {
    at: new Date().toISOString(),
    applied: apply,
    excluded: plans.length,
    ready: ready.length,
    ambiguous: ambiguous.length,
    orphanRisk: orphanRisk.length,
    done,
    results,
    left: plans
      .filter((p) => p.skip)
      .slice(0, 100)
      .map((p) => ({
        skip: p.skip,
        dupe: p.dupe.id,
        twin: p.twin.id,
        dupeProduct: p.dupeProduct.slug,
        twinProduct: p.twinProduct.slug,
        dupeTitle: p.dupe.title,
        twinTitle: p.twin.title,
      })),
  };
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const reportPath = `reports/identity-cleanup-${stamp}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      excluded: report.excluded,
      ready: report.ready,
      ambiguous: report.ambiguous,
      orphanRisk: report.orphanRisk,
      done,
    }),
  );
  console.log(`report: ${reportPath}`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
