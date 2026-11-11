import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_WINDOW_MS,
  MAX_MRP_MULTIPLE,
  ageLabel,
  discountFromMrp,
  isHotDeal,
  isLiveCheck,
  recordedAgeLabel,
  saneMrp,
  trackedAgeLabel,
} from "../src/lib/deal-honesty";

/**
 * Display honesty is a claim layer: these tests pin the two states that
 * production got wrong — a "live" badge over a feed with nothing in it, and a
 * discount computed from an MRP that is a seller placeholder.
 */

const NOW = Date.UTC(2026, 10, 11, 10, 0, 0);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/* ------------------------------ live window ------------------------------ */

test("zero live deals: no check on record is not live", () => {
  assert.equal(isLiveCheck(null, NOW), false);
  assert.equal(isLiveCheck(undefined, NOW), false);
  assert.equal(isLiveCheck(0, NOW), false);
});

test("zero live deals: a 13-day-old check is not live", () => {
  assert.equal(isLiveCheck(NOW - 13 * DAY, NOW), false);
});

test("a check inside the 20-minute window is live; one outside is not", () => {
  assert.equal(isLiveCheck(NOW - 19 * MIN, NOW), true);
  assert.equal(isLiveCheck(NOW - LIVE_WINDOW_MS, NOW), true);
  assert.equal(isLiveCheck(NOW - LIVE_WINDOW_MS - 1, NOW), false);
});

test("a timestamp in the future is not claimed as live", () => {
  assert.equal(isLiveCheck(NOW + 5 * MIN, NOW), false);
});

/* -------------------------------- age copy ------------------------------- */

test("tracked age is the real age, never a fabricated 'minutes ago'", () => {
  assert.equal(trackedAgeLabel(NOW - 13 * DAY, NOW), "last checked 13d ago");
  assert.equal(trackedAgeLabel(NOW - 3 * 60 * MIN, NOW), "last checked 3h ago");
  assert.equal(trackedAgeLabel(null, NOW), "no store check on record");
});

test("a shelf of recorded rows is labelled by its own newest record", () => {
  assert.equal(recordedAgeLabel(NOW - 11 * DAY, NOW), "newest record 11d ago");
  assert.equal(recordedAgeLabel(null, NOW), "no recorded price");
});

test("age label rounds down and starts at 'just now'", () => {
  assert.equal(ageLabel(NOW - 20_000, NOW), "just now");
  assert.equal(ageLabel(NOW - 14 * MIN, NOW), "14m ago");
  assert.equal(ageLabel(null, NOW), "never");
});

/* ------------------------------- MRP sanity ------------------------------ */

test("inflated MRP: the PS5 controller at 100× is not a discount", () => {
  // Production row: price 8,990, mrp 8,99,000.
  assert.equal(saneMrp(8990, 899000), null);
  assert.equal(discountFromMrp(8990, 899000), 0);
  assert.equal(isHotDeal(8990, 899000), false);
});

test("inflated MRP: a ₹99 jersey against ₹1,999 is not 95% off", () => {
  assert.equal(saneMrp(99, 1999), null);
  assert.equal(discountFromMrp(99, 1999), 0);
  assert.equal(isHotDeal(99, 1999), false);
});

test("a believable MRP still renders its real discount", () => {
  assert.equal(saneMrp(1000, 2500), 2500);
  assert.equal(discountFromMrp(1000, 2500), 60);
  assert.equal(isHotDeal(1000, 2500), true);
});

test("the MRP cap is a boundary, not a guess", () => {
  const price = 2000;
  assert.equal(saneMrp(price, price * MAX_MRP_MULTIPLE), price * MAX_MRP_MULTIPLE);
  assert.equal(saneMrp(price, price * MAX_MRP_MULTIPLE + 1), null);
});

test("MRP at or below price is not a discount", () => {
  assert.equal(saneMrp(1000, 1000), null);
  assert.equal(saneMrp(1000, 900), null);
  assert.equal(discountFromMrp(1000, 900), 0);
});

test("missing or non-finite values never invent a discount", () => {
  assert.equal(saneMrp(1000, null), null);
  assert.equal(saneMrp(null, 2000), null);
  assert.equal(saneMrp(0, 2000), null);
  assert.equal(saneMrp(1000, Number.NaN), null);
  assert.equal(discountFromMrp(null, 2000), 0);
});
