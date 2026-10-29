import { test } from "node:test";
import assert from "node:assert/strict";

import { checkInfoFor, failureKindOf, retryDelayMs } from "../src/lib/engine/freshness";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;

/* ------------------------------ check state ------------------------------ */

test("a listing checked minutes ago is fresh", () => {
  const info = checkInfoFor(
    { lastCheckedAt: NOW - 10 * MINUTE, failureCount: 0, lastError: null },
    NOW,
  );
  assert.equal(info.state, "FRESH");
  assert.equal(info.ageMs, 10 * MINUTE);
  assert.equal(info.checkedAt, NOW - 10 * MINUTE);
  assert.equal(info.retrying, false);
  assert.equal(info.failureKind, null);
});

test("freshness thresholds follow the shared config", () => {
  const at = (age: number) =>
    checkInfoFor({ lastCheckedAt: NOW - age, failureCount: 0, lastError: null }, NOW).state;
  assert.equal(at(HOUR - 1), "FRESH");
  assert.equal(at(HOUR), "OBSERVED");
  assert.equal(at(23 * HOUR), "OBSERVED");
  assert.equal(at(24 * HOUR), "STALE");
  assert.equal(at(3 * DAY - 1), "STALE");
  assert.equal(at(3 * DAY), "EXPIRED");
  assert.equal(at(30 * DAY), "EXPIRED");
});

test("a listing with no successful read is never, not stale", () => {
  const info = checkInfoFor({ lastCheckedAt: null, failureCount: 0, lastError: null }, NOW);
  assert.equal(info.state, "NEVER");
  assert.equal(info.checkedAt, null);
  assert.equal(info.ageMs, null);
  assert.equal(info.retrying, false);
});

test("a failed retry does not make an old price look fresh", () => {
  const info = checkInfoFor(
    { lastCheckedAt: NOW - 5 * DAY, failureCount: 3, lastError: "BLOCKED" },
    NOW,
  );
  assert.equal(info.state, "EXPIRED");
  assert.equal(info.ageMs, 5 * DAY);
  assert.equal(info.retrying, true);
  assert.equal(info.failureKind, "BLOCKED");
});

test("a failure after a recent success keeps the successful check date", () => {
  const info = checkInfoFor(
    { lastCheckedAt: NOW - 2 * HOUR, failureCount: 1, lastError: "BLOCKED" },
    NOW,
  );
  assert.equal(info.state, "OBSERVED");
  assert.equal(info.checkedAt, NOW - 2 * HOUR);
  assert.equal(info.retrying, true);
});

/* ----------------------------- failure kinds ----------------------------- */

test("classifies the store outcomes we actually persist", () => {
  assert.equal(failureKindOf("BLOCKED"), "BLOCKED");
  assert.equal(failureKindOf("EXTRACTION_FAILED_UNPRICED"), "UNPRICED");
  assert.equal(failureKindOf("ERROR: fetch timed out"), "ERROR");
  assert.equal(failureKindOf("NETWORK_ERROR"), "ERROR");
  assert.equal(failureKindOf(null), null);
  assert.equal(failureKindOf(""), null);
});

/* ------------------------------ retry delays ----------------------------- */

test("blocked pages back off by days, not hours", () => {
  assert.equal(retryDelayMs("BLOCKED", 1), 6 * HOUR);
  assert.equal(retryDelayMs("BLOCKED", 2), 24 * HOUR);
  assert.equal(retryDelayMs("BLOCKED", 3), 72 * HOUR);
  assert.equal(retryDelayMs("BLOCKED", 4), 7 * DAY);
  assert.equal(retryDelayMs("BLOCKED", 9), 7 * DAY);
});

test("unpriced pages wait a day before the first retry", () => {
  assert.equal(retryDelayMs("EXTRACTION_FAILED_UNPRICED", 1), 24 * HOUR);
  assert.equal(retryDelayMs("EXTRACTION_FAILED_UNPRICED", 2), 72 * HOUR);
  assert.equal(retryDelayMs("EXTRACTION_FAILED_UNPRICED", 3), 7 * DAY);
  assert.equal(retryDelayMs("EXTRACTION_FAILED_UNPRICED", 8), 7 * DAY);
});

test("ordinary errors keep the short backoff and cap at a day", () => {
  assert.equal(retryDelayMs("NETWORK_ERROR", 1), 30 * MINUTE);
  assert.equal(retryDelayMs("NETWORK_ERROR", 2), HOUR);
  assert.equal(retryDelayMs("NETWORK_ERROR", 3), 2 * HOUR);
  assert.equal(retryDelayMs("NETWORK_ERROR", 8), 24 * HOUR);
  assert.equal(retryDelayMs("NETWORK_ERROR", 20), 24 * HOUR);
});
