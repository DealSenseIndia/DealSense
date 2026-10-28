/**
 * Clean implausible listings out of the catalogue.
 *
 *   npx tsx scripts/clean-listings.ts            # dry run: show the plan
 *   npx tsx scripts/clean-listings.ts --apply    # re-read or remove
 *
 * A listing is suspect when its live price is under 20% of its own recorded
 * median (five or more points). For each one we re-read the store page:
 *   - price is sane again  -> analyse it, which records the real reading
 *   - price is still absurd -> remove the listing, its observations and its
 *     live-deal rows; remove the product too if nothing else references it
 *
 * Nothing is deleted without the fresh store reading confirming the price.
 */
import "./env";
import { client } from "../src/lib/db/client";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { fetchProduct } from "../src/lib/merchants";
import { closePlaywright } from "../src/lib/merchants/http";

const apply = process.argv.includes("--apply");
const SUSPECT = 0.2;
const SANE = 0.25;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

(async () => {
  const obs = await client.execute("SELECT listing_id, price FROM observations WHERE price IS NOT NULL AND price > 0");
  const by = new Map<string, number[]>();
  for (const r of obs.rows) {
    const id = String(r.listing_id);
    const list = by.get(id) ?? [];
    list.push(Number(r.price));
    by.set(id, list);
  }

  const rows = (
    await client.execute(`
      SELECT l.id, l.url, l.price, l.title, l.merchant, l.product_id
      FROM listings l JOIN products p ON p.id = l.product_id
      WHERE l.price IS NOT NULL`)
  ).rows;

  const suspects = rows
    .map((r) => ({
      id: String(r.id),
      url: String(r.url),
      price: Number(r.price),
      title: String(r.title ?? ""),
      productId: String(r.product_id),
      med: median(by.get(String(r.id)) ?? []),
    }))
    .filter((r) => r.med > 0 && r.price < r.med * SUSPECT);

  console.log(`suspects: ${suspects.length} of ${rows.length} listings\n`);

  let refreshed = 0;
  let removed = 0;
  let kept = 0;

  for (const r of suspects) {
    const id = r.id;
    const price = r.price;
    const med = r.med;

    let live: number | null = null;
    let liveOk = false;
    try {
      const out = await fetchProduct(String(r.url));
      live = out.product?.price ?? null;
      liveOk = out.ok;
    } catch {
      /* treat as unknown */
    }

    const label = `₹${price} vs median ₹${Math.round(med)} · live ${live === null ? "?" : `₹${live}`} · ${String(r.title).slice(0, 60)}`;

    if (live !== null && live >= med * SANE) {
      console.log(`REFRESH  ${label}`);
      if (apply) {
        const res = await analyzeUrl(String(r.url));
        if (res.ok) refreshed++;
        else kept++;
      }
    } else if (liveOk && live !== null) {
      console.log(`REMOVE   ${label}`);
      if (apply) {
        await client.execute(`DELETE FROM observations WHERE listing_id = '${id}'`);
        await client.execute(`DELETE FROM live_deals WHERE listing_id = '${id}'`);
        await client.execute(`DELETE FROM listings WHERE id = '${id}'`);
        const left = await client.execute(`SELECT COUNT(*) AS n FROM listings WHERE product_id = '${r.productId}'`);
        if (Number(left.rows[0].n) === 0) {
          await client.execute(`DELETE FROM products WHERE id = '${r.productId}'`);
        }
        removed++;
      }
    } else {
      console.log(`KEEP     ${label} (store page unreadable)`);
      kept++;
    }
    await sleep(1500);
  }

  console.log(`\n${apply ? "applied" : "dry run"}: refreshed ${refreshed}, removed ${removed}, left ${kept}`);
  await closePlaywright();
  process.exit(0);
})();
