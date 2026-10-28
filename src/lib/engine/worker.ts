import { getDueListings, updateListingState } from "../db/queries";
import { analyzeUrl } from "./analyze";
import { workerConfig } from "../config";

const RETRY_BASE_MS = 30 * 60 * 1000;
const RETRY_MAX_MS = 24 * 60 * 60 * 1000;
/**
 * The route has a 60s ceiling. Stop starting new listings at 50s so a slow
 * scrape is never cut off mid-flight; the rest stay due for the next run.
 * Measured locally: ~12s per listing including the 5–8s store spacing, so a
 * run of four fits and a fifth is deferred.
 */
const TIME_BUDGET_MS = 50 * 1000;

export interface RefreshReport {
  startedAt: number;
  finishedAt: number;
  scanned: number;
  succeeded: number;
  failed: number;
  /** True when the run stopped on the time budget before the queue was empty. */
  budgetHit: boolean;
  results: { listingId: string; url: string; status: string; verdict?: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function spacing(merchant: string): number {
  const [min, max] = workerConfig.spacing[merchant as "amazon" | "flipkart"] ?? [5000, 8000];
  return min + Math.random() * (max - min);
}

/**
 * One controlled refresh cycle. Sequential by design — never hammers a merchant.
 * A failed scrape produces no observation and the listing backs off, so one
 * blocked product can never sit at the front of every queue forever.
 */
export async function runRefreshCycle(limit = 5): Promise<RefreshReport> {
  const startedAt = Date.now();
  const due = await getDueListings(limit);
  const results: RefreshReport["results"] = [];
  let succeeded = 0;
  let failed = 0;
  let budgetHit = false;

  for (const listing of due) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      budgetHit = true;
      break;
    }
    try {
      const res = await analyzeUrl(listing.url);
      if (res.ok) {
        succeeded++;
        results.push({ listingId: listing.id, url: listing.url, status: res.status, verdict: res.verdict?.verdict });
      } else {
        failed++;
        results.push({ listingId: listing.id, url: listing.url, status: res.status });
        await rescheduleFailed(listing, res.status);
      }
    } catch (err) {
      failed++;
      const message = `ERROR: ${(err as Error).message}`;
      results.push({ listingId: listing.id, url: listing.url, status: message });
      await rescheduleFailed(listing, message);
    }
    await sleep(spacing(listing.merchant));
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    scanned: results.length,
    succeeded,
    failed,
    budgetHit,
    results,
  };
}

async function rescheduleFailed(listing: { id: string; failureCount: number }, message: string) {
  const failures = (listing.failureCount ?? 0) + 1;
  const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(5, failures - 1));
  await updateListingState(listing.id, {
    nextCheckAt: Date.now() + wait,
    failureCount: failures,
    lastError: message.slice(0, 500),
  });
}
