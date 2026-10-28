import { client } from "../db/client";
import { fetchProduct } from "../merchants";

/**
 * Automated price-plausibility audit.
 *
 * The average is only a cheap pre-filter: it is skewed by a series that used to
 * be much more expensive, and that once removed a genuine ₹5,699 air fryer.
 * The real decision uses the median of the listing's own recorded prices.
 *
 *   1. SQL finds listings under 40% of their own average (five or more points).
 *   2. Each candidate's median is computed; under 20% of it is the suspect bar.
 *   3. A suspect is re-read at the store. A sane price is left alone (the
 *      refresh worker records readings); an absurd one removes the listing,
 *      its observations and its live-deal rows, and the product if orphaned.
 *   4. An unreadable page is skipped, never guessed at.
 */
export const SUSPECT_RATIO = 0.2;
export const SANE_RATIO = 0.25;
const PREFILTER_RATIO = 0.4;

export interface AuditItem {
  listingId: string;
  title: string;
  price: number;
  median: number;
  livePrice: number | null;
  action: "REMOVED" | "SANE" | "UNREADABLE";
}

export interface AuditReport {
  startedAt: number;
  finishedAt: number;
  checked: number;
  suspects: number;
  removed: number;
  sane: number;
  unreadable: number;
  results: AuditItem[];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function runPriceAudit(limit = 5): Promise<AuditReport> {
  const startedAt = Date.now();
  const cap = Math.max(1, Math.min(limit, 10));

  const rows = (
    await client.execute(`
      SELECT l.id, l.url, l.price, l.title, l.product_id
      FROM listings l
      JOIN observations o ON o.listing_id = l.id
      WHERE l.price IS NOT NULL AND l.price > 0 AND o.price > 0
      GROUP BY l.id
      HAVING COUNT(o.id) >= 5 AND l.price < AVG(o.price) * ${PREFILTER_RATIO}
      ORDER BY l.price / AVG(o.price) ASC
      LIMIT ${cap * 5}
    `)
  ).rows;

  const results: AuditItem[] = [];
  let suspects = 0;
  let removed = 0;
  let sane = 0;
  let unreadable = 0;

  for (const row of rows) {
    if (suspects >= cap) break;
    const listingId = String(row.id);
    const price = Number(row.price);

    const series = await client.execute(
      `SELECT price FROM observations WHERE listing_id = '${listingId}' AND price > 0`,
    );
    const med = median(series.rows.map((r) => Number(r.price)));
    if (!med || price >= med * SUSPECT_RATIO) continue;

    suspects++;
    const base = { listingId, title: String(row.title ?? ""), price, median: Math.round(med) };

    let livePrice: number | null = null;
    try {
      const out = await fetchProduct(String(row.url));
      livePrice = out.product?.price ?? null;
    } catch {
      livePrice = null;
    }

    if (livePrice === null) {
      unreadable++;
      results.push({ ...base, livePrice, action: "UNREADABLE" });
      continue;
    }

    if (livePrice >= med * SANE_RATIO) {
      sane++;
      results.push({ ...base, livePrice, action: "SANE" });
      continue;
    }

    await client.execute(`DELETE FROM observations WHERE listing_id = '${listingId}'`);
    await client.execute(`DELETE FROM live_deals WHERE listing_id = '${listingId}'`);
    await client.execute(`DELETE FROM listings WHERE id = '${listingId}'`);
    const left = await client.execute(
      `SELECT COUNT(*) AS n FROM listings WHERE product_id = '${String(row.product_id)}'`,
    );
    if (Number(left.rows[0]?.n ?? 0) === 0) {
      await client.execute(`DELETE FROM products WHERE id = '${String(row.product_id)}'`);
    }
    removed++;
    results.push({ ...base, livePrice, action: "REMOVED" });
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    checked: rows.length,
    suspects,
    removed,
    sane,
    unreadable,
    results,
  };
}
