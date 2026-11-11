import { test } from "node:test";
import assert from "node:assert/strict";

import { canPublishFromRead } from "../src/lib/live";
import { failureKindOf, retryDelayMs } from "../src/lib/engine/freshness";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = 1_800_000_000_000;

/* --------------------------- probe publish rule --------------------------- */

const base = {
  readOk: true,
  checkedAt: NOW - MINUTE,
  now: NOW,
  price: 1_000,
  inStock: true,
  n: 8,
  low: 1_000,
  avg: 1_500,
};

test("a fresh read at the recorded low may be published", () => {
  assert.equal(canPublishFromRead(base), true);
});

test("a fresh read at least 10% under the average may be published", () => {
  assert.equal(
    canPublishFromRead({ ...base, price: 1_300, low: 1_000, avg: 1_500 }),
    true,
  );
});

test("a read that failed never publishes, however good the stored series looks", () => {
  assert.equal(canPublishFromRead({ ...base, readOk: false }), false);
});

test("a read older than the twenty-minute window never publishes", () => {
  assert.equal(canPublishFromRead({ ...base, checkedAt: NOW - 19 * MINUTE }), true);
  assert.equal(canPublishFromRead({ ...base, checkedAt: NOW - 20 * MINUTE }), true);
  assert.equal(canPublishFromRead({ ...base, checkedAt: NOW - 21 * MINUTE }), false);
});

test("a listing with no successful read is not publishable", () => {
  assert.equal(canPublishFromRead({ ...base, checkedAt: null }), false);
});

test("fewer than four recorded points is not a live deal", () => {
  assert.equal(canPublishFromRead({ ...base, n: 3 }), false);
});

test("an out-of-stock read is not a live deal", () => {
  assert.equal(canPublishFromRead({ ...base, inStock: false }), false);
});

test("a price above the low and under 10% off the average is not a live deal", () => {
  assert.equal(
    canPublishFromRead({ ...base, price: 1_420, low: 1_000, avg: 1_500 }),
    false,
  );
});

test("a missing price is not a live deal", () => {
  assert.equal(canPublishFromRead({ ...base, price: null }), false);
});

/* ------------------------------ delisted label ----------------------------- */

test("a delisted page is not treated as a transient failure", () => {
  const message = "DELISTED_404: the store returned 404 Page Not Found (verified 2026-11-11).";
  assert.equal(failureKindOf(message), "BLOCKED");
  assert.equal(retryDelayMs(message, 1), 6 * HOUR);
});

test("a real block keeps its own label", () => {
  assert.equal(failureKindOf("BLOCKED: store served a captcha"), "BLOCKED");
  assert.equal(failureKindOf("EXTRACTION_FAILED_UNPRICED"), "UNPRICED");
  assert.equal(failureKindOf("ERROR: fetch failed"), "ERROR");
});
