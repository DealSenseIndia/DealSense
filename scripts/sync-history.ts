/**
 * Top up price history and current prices from PriceHistory.ai.
 *
 *   npm run sync
 *   npm run sync -- --limit 10
 *
 * Appends only points newer than what we already own, so it is safe to run
 * as often as you like. A listing that synced is left alone for ~20 hours.
 */
import "./env";
import { ensureSchema } from "../src/lib/db/client";
import { runProviderSync } from "../src/lib/engine/sync";

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) || 6 : 6;

  console.log(`Syncing ${limit} listing(s) from PriceHistory.ai…\n`);
  const report = await runProviderSync(limit);

  report.results.forEach((r) => {
    const price = r.price !== null ? `₹${r.price.toLocaleString("en-IN")}` : "—";
    const when = r.latestPointAt
      ? new Date(r.latestPointAt).toISOString().slice(0, 10)
      : "—";
    console.log(
      `  ${r.status.padEnd(11)} +${String(r.added).padStart(3)} pts  ${price.padStart(10)}  last ${when}  ${r.merchant} ${r.title?.slice(0, 52) ?? r.listingId}`,
    );
    if (r.message) console.log(`              ${r.message}`);
  });

  console.log(
    `\nScanned ${report.scanned} · updated ${report.updated} · ${report.added} new points · failed ${report.failed} in ${report.finishedAt - report.startedAt}ms`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
