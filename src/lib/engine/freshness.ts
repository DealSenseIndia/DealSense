import { freshness } from "../config";
import type { CheckFailureKind, CheckInfo, CheckState } from "../types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long to wait before trying a failing listing again.
 *
 * A blocked page will not unblock in thirty minutes, and an unpriced page is
 * usually out of stock. Retrying those on the default schedule burns the
 * worker's 50-second budget and pushes healthy listings back in the queue.
 * These schedules deliberately stretch to a week; a listing is never dropped.
 */
const BLOCKED_RETRY_MS = [6 * HOUR, 24 * HOUR, 72 * HOUR, 7 * DAY];
const UNPRICED_RETRY_MS = [24 * HOUR, 72 * HOUR, 7 * DAY];
const DEFAULT_RETRY_MS = [30 * MINUTE, HOUR, 2 * HOUR, 4 * HOUR, 8 * HOUR, 16 * HOUR, 24 * HOUR];

/** The failure family behind a stored `last_error` message. */
export function failureKindOf(message: string | null | undefined): CheckFailureKind {
  if (!message) return null;
  const text = message.toUpperCase();
  if (text.includes("BLOCKED")) return "BLOCKED";
  if (text.includes("UNPRICED") || text.includes("NO_PRICE")) return "UNPRICED";
  return "ERROR";
}

/** The next retry delay, by failure family and the *new* failure count (1-based). */
export function retryDelayMs(status: string, failures: number): number {
  const kind = failureKindOf(status);
  const schedule =
    kind === "BLOCKED"
      ? BLOCKED_RETRY_MS
      : kind === "UNPRICED"
        ? UNPRICED_RETRY_MS
        : DEFAULT_RETRY_MS;
  const index = Math.min(schedule.length - 1, Math.max(0, failures - 1));
  return schedule[index];
}

export interface CheckSource {
  lastCheckedAt: number | null;
  failureCount: number;
  lastError: string | null;
}

/**
 * What we can honestly say about the last attempt to read a listing.
 *
 * `checkedAt` is the last *successful* read, never the last attempt: a failed
 * retry does not make a two-hour-old price fresh. `retrying` only says the most
 * recent attempt failed; the age still comes from the last success.
 */
export function checkInfoFor(listing: CheckSource, now = Date.now()): CheckInfo {
  const checkedAt = listing.lastCheckedAt;
  const retrying = listing.failureCount > 0;
  const failureKind = retrying ? failureKindOf(listing.lastError) : null;

  if (checkedAt === null) {
    return { state: "NEVER", checkedAt: null, ageMs: null, retrying, failureKind };
  }

  const ageMs = Math.max(0, now - checkedAt);
  const state: CheckState =
    ageMs < freshness.live
      ? "FRESH"
      : ageMs < freshness.observed
        ? "OBSERVED"
        : ageMs < freshness.stale
          ? "STALE"
          : "EXPIRED";

  return { state, checkedAt, ageMs, retrying, failureKind };
}
