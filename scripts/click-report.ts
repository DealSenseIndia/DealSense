/**
 * Outbound click report, read from the `events` table that /go writes.
 *
 *   npx tsx scripts/click-report.ts [--days 30] [--json]
 *
 * Read-only. Every row counted here is a real click on a buy button that went
 * through /go/<listingId>; nothing is estimated or extrapolated.
 */
import "./env";
import { client } from "../src/lib/db/client";

interface Click {
  listingId: string | null;
  merchant: string | null;
  source: string | null;
  via: string | null;
  at: number;
}

const args = process.argv.slice(2);
const daysIdx = args.indexOf("--days");
const days = daysIdx !== -1 ? Number(args[daysIdx + 1]) || 30 : 30;
const asJson = args.includes("--json");

const DAY = 86400000;

(async () => {
  const res = await client.execute(
    "SELECT payload, created_at FROM events WHERE type = 'outbound_click' ORDER BY created_at DESC LIMIT 50000",
  );

  const clicks: Click[] = [];
  let unparsable = 0;
  for (const row of res.rows) {
    try {
      const p = JSON.parse(String(row.payload ?? "{}")) as Record<string, unknown>;
      clicks.push({
        listingId: (p.listingId as string) ?? null,
        merchant: (p.merchant as string) ?? null,
        source: (p.source as string) ?? null,
        via: (p.via as string) ?? null,
        at: Number(row.created_at),
      });
    } catch {
      unparsable++;
    }
  }

  // Our own smoke tests and manual /go probes are not reader clicks.
  const INTERNAL = new Set(["qa", "test"]);
  const internal = clicks.filter((c) => INTERNAL.has(c.source ?? ""));
  const readerClicks = clicks.filter((c) => !INTERNAL.has(c.source ?? ""));

  const now = Date.now();
  const since = now - days * DAY;
  const inWindow = readerClicks.filter((c) => c.at >= since);

  const byMerchant = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byListing = new Map<string, number>();
  const byDay = new Map<string, number>();
  let missingListing = 0;

  for (const c of inWindow) {
    if (!c.listingId) missingListing++;
    byMerchant.set(c.merchant ?? "unknown", (byMerchant.get(c.merchant ?? "unknown") ?? 0) + 1);
    bySource.set(c.source ?? "unknown", (bySource.get(c.source ?? "unknown") ?? 0) + 1);
    if (c.listingId) byListing.set(c.listingId, (byListing.get(c.listingId) ?? 0) + 1);
    const day = new Date(c.at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const topIds = [...byListing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const titles = new Map<string, string>();
  if (topIds.length) {
    const list = topIds.map(([id]) => `'${id.replace(/'/g, "''")}'`).join(",");
    const t = await client.execute(
      `SELECT l.id, l.title, p.title AS product FROM listings l JOIN products p ON p.id = l.product_id WHERE l.id IN (${list})`,
    );
    for (const r of t.rows) {
      titles.set(String(r.id), String(r.product ?? r.title ?? "—"));
    }
  }

  const windowTotal = inWindow.length;
  const last24 = readerClicks.filter((c) => c.at >= now - DAY).length;
  const last7 = readerClicks.filter((c) => c.at >= now - 7 * DAY).length;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          days,
          total: readerClicks.length,
          internalExcluded: internal.length,
          windowTotal,
          last24,
          last7,
          byMerchant: Object.fromEntries(byMerchant),
          bySource: Object.fromEntries(bySource),
          byDay: Object.fromEntries([...byDay.entries()].sort()),
          topListings: topIds.map(([id, n]) => ({ listingId: id, clicks: n, title: titles.get(id) ?? null })),
          unparsable,
          missingListing,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const first = readerClicks.length
    ? new Date(readerClicks[readerClicks.length - 1].at).toISOString()
    : "—";
  const last = readerClicks.length ? new Date(readerClicks[0].at).toISOString() : "—";
  console.log(`Outbound clicks — last ${days} days`);
  console.log(`  reader clicks all time: ${readerClicks.length}   first: ${first}   last: ${last}`);
  console.log(`  internal probes excluded: ${internal.length}`);
  console.log(`  window: ${windowTotal}   last 24h: ${last24}   last 7d: ${last7}\n`);

  const table = (label: string, m: Map<string, number>) => {
    if (!m.size) return console.log(`${label}: none`);
    console.log(label);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(5)}  ${k}`);
    }
    console.log("");
  };

  table("By store", byMerchant);
  table("By source", bySource);
  if (byDay.size) {
    console.log("By day");
    for (const [d, n] of [...byDay.entries()].sort().slice(-14)) {
      console.log(`  ${d}  ${String(n).padStart(4)}  ${"#".repeat(Math.min(n, 60))}`);
    }
    console.log("");
  }
  if (topIds.length) {
    console.log("Top listings");
    for (const [id, n] of topIds) {
      console.log(`  ${String(n).padStart(5)}  ${titles.get(id) ?? id}`);
    }
    console.log("");
  }

  if (unparsable || missingListing) {
    console.log(`Data quality: unparsable=${unparsable} missingListingId=${missingListing}`);
  }
  process.exit(0);
})();
