/**
 * Refresh worker (manual / cron).
 *
 *   npm run scrape               → refresh listings that are due
 *   npm run scrape -- --url URL  → analyze a specific URL now
 */
import { ensureSchema } from "../src/lib/db/client";
import { analyzeUrl } from "../src/lib/engine/analyze";
import { runRefreshCycle } from "../src/lib/engine/worker";

async function main() {
  await ensureSchema();
  const args = process.argv.slice(2);

  const urlFlag = args.indexOf("--url");
  if (urlFlag !== -1 && args[urlFlag + 1]) {
    const res = await analyzeUrl(args[urlFlag + 1]);
    console.log(JSON.stringify(res, null, 2));
    return;
  }

  const report = await runRefreshCycle(5);
  console.log(
    `Scanned ${report.scanned} · ok ${report.succeeded} · failed ${report.failed} in ${report.finishedAt - report.startedAt}ms`,
  );
  report.results.forEach((r) => console.log(`  ${r.status.padEnd(28)} ${r.verdict ?? ""} ${r.url}`));
}

main().then(() => process.exit(0));
