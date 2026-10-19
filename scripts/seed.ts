/**
 * Initialize the DealSense database (idempotent) and optionally analyze
 * real product URLs to seed genuine observations.
 *
 *   npm run db:seed
 *   npm run db:seed -- https://www.amazon.in/dp/B0XXXXXXX https://www.flipkart.com/...
 *
 * This script NEVER creates synthetic price data — only real observations.
 */
import { ensureSchema } from "../src/lib/db/client";
import { analyzeUrl } from "../src/lib/engine/analyze";

async function main() {
  await ensureSchema();
  console.log("✓ Schema ready (tables created if missing).");

  const urls = process.argv.slice(2).filter((a) => a.startsWith("http"));
  if (urls.length === 0) {
    console.log("No URLs passed. Pass real product links to record genuine observations:");
    console.log("  npm run db:seed -- https://www.amazon.in/dp/B0XXXXXXX");
    return;
  }

  for (const url of urls) {
    try {
      const res = await analyzeUrl(url);
      console.log(
        res.ok
          ? `✓ ${res.product?.title?.slice(0, 60)} — ${res.verdict?.verdict} (${res.verdict?.score ?? "n/a"})`
          : `✗ ${url} — ${res.status}${res.message ? `: ${res.message}` : ""}`,
      );
    } catch (err) {
      console.error(`✗ ${url} — ${(err as Error).message}`);
    }
  }
}

main().then(() => process.exit(0));
