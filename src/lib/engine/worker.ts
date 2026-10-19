import { getDueListings } from "../db/queries";
import { analyzeUrl } from "./analyze";
import { workerConfig } from "../config";

export interface RefreshReport {
  startedAt: number;
  finishedAt: number;
  scanned: number;
  succeeded: number;
  failed: number;
  results: { listingId: string; url: string; status: string; verdict?: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spacing(merchant: string): number {
  const [min, max] = workerConfig.spacing[merchant as "amazon" | "flipkart"] ?? [5000, 8000];
  return min + Math.random() * (max - min);
}

/**
 * One controlled refresh cycle. Sequential by design — never hammers a merchant.
 * A failed scrape produces no observation; the listing is simply rescheduled.
 */
export async function runRefreshCycle(limit = 5): Promise<RefreshReport> {
  const startedAt = Date.now();
  const due = await getDueListings(limit);
  const results: RefreshReport["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const listing of due) {
    try {
      const res = await analyzeUrl(listing.url);
      if (res.ok) {
        succeeded++;
        results.push({ listingId: listing.id, url: listing.url, status: res.status, verdict: res.verdict?.verdict });
      } else {
        failed++;
        results.push({ listingId: listing.id, url: listing.url, status: res.status });
      }
    } catch (err) {
      failed++;
      results.push({ listingId: listing.id, url: listing.url, status: `ERROR: ${(err as Error).message}` });
    }
    await sleep(spacing(listing.merchant));
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    scanned: due.length,
    succeeded,
    failed,
    results,
  };
}
