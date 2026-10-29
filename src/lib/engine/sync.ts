/**
 * Ongoing price-history sync with PriceHistory.ai.
 *
 * Our first import gives a product its full history. This module keeps that
 * history alive: it re-reads the provider's public series for a few tracked
 * listings per run and appends only the points that are newer than what we
 * already own. The listing's current price is refreshed from the same reading,
 * so the homepage deals, the verdict and the chart all move together.
 *
 * Rules:
 * - One listing at a time, throttled by the provider client (1.5s).
 * - Only exact merchant-id matches (enforced by the provider client).
 * - We never delete or rewrite points we already recorded.
 * - If our own direct store reading is fresher, it wins — the provider only
 *   fills the gap.
 */

import {
  addObservation,
  getLatestObservation,
  getSyncCandidates,
  recordEvent,
  updateListingState,
} from "../db/queries";
import {
  fetchPriceHistoryAiFor,
  PROVIDER_MERCHANTS,
  providerMerchant,
} from "./providers/pricehistoryAi";
import { isImportedSource } from "./history";

const HOUR = 60 * 60 * 1000;
/** How long a successfully synced listing waits before it is considered again. */
const SYNC_INTERVAL_MS = 20 * HOUR;
/** Failures back off instead of retrying the same listing forever. */
const RETRY_BASE_MS = 6 * HOUR;
const RETRY_MAX_MS = 72 * HOUR;

export interface SyncItem {
  listingId: string;
  merchant: string;
  title: string | null;
  status: "SYNCED" | "UP_TO_DATE" | "NO_MATCH" | "SKIPPED" | "ERROR";
  /** New readings appended to our own table. */
  added: number;
  /** The listing's price after the sync. */
  price: number | null;
  latestPointAt: number | null;
  message?: string;
}

export interface SyncReport {
  startedAt: number;
  finishedAt: number;
  scanned: number;
  updated: number;
  added: number;
  failed: number;
  results: SyncItem[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Candidate = Awaited<ReturnType<typeof getSyncCandidates>>[number];

async function scheduleRetry(listing: Candidate, message: string) {
  const failures = (listing.failureCount ?? 0) + 1;
  const wait = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(3, failures - 1));
  await updateListingState(listing.id, {
    nextCheckAt: Date.now() + wait,
    failureCount: failures,
    lastError: message,
  });
}

/** Top up one listing's history and current price from the provider. */
export async function syncListingHistory(listing: Candidate): Promise<SyncItem> {
  const merchant = providerMerchant(listing.merchant);
  const base = {
    listingId: listing.id,
    merchant: listing.merchant,
    title: listing.title,
    added: 0,
    price: listing.price,
    latestPointAt: null as number | null,
  };

  // Directly-readable stores are refreshed from their own page. A provider
  // price must never be paired with a first-party check timestamp.
  if (listing.merchant === "amazon" || listing.merchant === "flipkart") {
    return { ...base, status: "SKIPPED", message: "Direct store listings are refreshed from the store page." };
  }

  if (!(PROVIDER_MERCHANTS as readonly string[]).includes(merchant)) {
    return { ...base, status: "SKIPPED", message: "Merchant has no public tracker series." };
  }

  let ext: Awaited<ReturnType<typeof fetchPriceHistoryAiFor>>;
  try {
    ext = await fetchPriceHistoryAiFor(
      merchant,
      listing.merchantProductId,
      listing.title ?? undefined,
    );
  } catch (err) {
    const message = `Provider error: ${(err as Error).message}`;
    await scheduleRetry(listing, message);
    return { ...base, status: "ERROR", message };
  }

  if (!ext?.points.length) {
    const message = "No exact PriceHistory.ai match for this product id.";
    await scheduleRetry(listing, message);
    return { ...base, status: "NO_MATCH", message };
  }

  const latest = await getLatestObservation(listing.id);
  const cutoff = latest?.observedAt ?? 0;
  const fresh = ext.points.filter((p) => p.t > cutoff && p.price > 0);

  for (const p of fresh) {
    await addObservation({
      listingId: listing.id,
      price: p.price,
      source: `imported:${ext.provider}`,
      observedAt: p.t,
    });
  }

  const newest = ext.points[ext.points.length - 1];
  // A direct store reading newer than the provider's last point stays in
  // charge of the price; the provider is only a backfill for the gap.
  const directIsFresher = !!latest && !isImportedSource(latest.source) && latest.observedAt > newest.t;
  const nextPrice = directIsFresher ? listing.price : newest.price;
  const product = ext.product;
  const nextMrp =
    product?.original_price && nextPrice !== null && product.original_price > nextPrice
      ? product.original_price
      : undefined;

  const direct = listing.merchant === "amazon" || listing.merchant === "flipkart";
  const now = Date.now();
  await updateListingState(listing.id, {
    price: nextPrice,
    ...(nextMrp !== undefined ? { mrp: nextMrp } : {}),
    ...(product?.in_stock != null ? { inStock: product.in_stock } : {}),
    ...(product?.rating != null ? { rating: product.rating } : {}),
    ...(product?.review_count != null ? { reviewCount: product.review_count } : {}),
    ...(product?.image_url ? { imageUrl: product.image_url } : {}),
    // `lastCheckedAt`, the failure state and the refresh queue belong to the
    // direct store read. A provider point is not a first-party check, so a
    // direct listing keeps all three; only the provider-only stores rotate on
    // this 20–26 hour schedule.
    ...(direct
      ? {}
      : {
          nextCheckAt: now + SYNC_INTERVAL_MS + Math.random() * 6 * HOUR,
          failureCount: 0,
          lastError: null,
        }),
  });

  await recordEvent("provider_sync", {
    listingId: listing.id,
    merchant,
    added: fresh.length,
    price: nextPrice,
    provider: ext.provider,
  });

  return {
    ...base,
    status: fresh.length ? "SYNCED" : "UP_TO_DATE",
    added: fresh.length,
    price: nextPrice,
    latestPointAt: newest.t,
  };
}

/**
 * One controlled sync run. Sequential by design — the provider is a free
 * public service and we treat it like one.
 */
export async function runProviderSync(limit = 6): Promise<SyncReport> {
  const startedAt = Date.now();
  const candidates = await getSyncCandidates(limit);
  const results: SyncItem[] = [];
  let updated = 0;
  let added = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const result = await syncListingHistory(candidate);
      results.push(result);
      if (result.status === "SYNCED" || result.status === "UP_TO_DATE") updated++;
      else failed++;
      added += result.added;
    } catch (err) {
      failed++;
      results.push({
        listingId: candidate.id,
        merchant: candidate.merchant,
        title: candidate.title,
        status: "ERROR",
        added: 0,
        price: candidate.price,
        latestPointAt: null,
        message: (err as Error).message,
      });
    }
    await sleep(900);
  }

  return {
    startedAt,
    finishedAt: Date.now(),
    scanned: candidates.length,
    updated,
    added,
    failed,
    results,
  };
}
