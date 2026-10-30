/**
 * Local-first refresh worker.
 *
 *   npx tsx scripts/local-worker.ts          # loop every minute
 *   npx tsx scripts/local-worker.ts --once   # one cycle
 *
 * Uses whatever TURSO_DATABASE_URL is in .env.local, so during the demo it
 * writes to the local SQLite file. Run it in its own terminal (or PM2) while
 * the demo server is up; the Vercel/Turso workers must stay paused.
 */
import "./env";
import { runRefreshCycle } from "../src/lib/engine/worker";

const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  do {
    const started = Date.now();
    try {
      const report = await runRefreshCycle(4);
      console.log(
        new Date().toISOString(),
        `scanned=${report.scanned} ok=${report.succeeded} failed=${report.failed} budgetHit=${report.budgetHit}`,
      );
    } catch (err) {
      console.error(new Date().toISOString(), "worker error:", (err as Error).message);
    }
    if (once) break;
    const wait = Math.max(0, 60_000 - (Date.now() - started));
    await sleep(wait);
  } while (true);
  process.exit(0);
})();
