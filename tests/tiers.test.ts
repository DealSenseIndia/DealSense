import { test } from "node:test";
import assert from "node:assert/strict";

import {
  averagePrice,
  countPriceChanges,
  intervalForTier,
  refreshTierFor,
} from "../src/lib/engine/tiers";

const HOUR = 3_600_000;

/* ------------------------------- averages -------------------------------- */

test("average price ignores zero and negative points", () => {
  assert.equal(
    averagePrice([
      { t: 1, price: 100 },
      { t: 2, price: 200 },
      { t: 3, price: 0 },
      { t: 4, price: -5 },
    ]),
    150,
  );
  assert.equal(averagePrice([]), null);
});

/* ------------------------------- changes --------------------------------- */

test("counts price changes only inside the window, using the point before it", () => {
  const points = [
    { t: 1_000, price: 100 },
    { t: 2_000, price: 100 },
    { t: 3_000, price: 90 },
    { t: 4_000, price: 90 },
    { t: 5_000, price: 95 },
  ];
  assert.equal(countPriceChanges(points, 2_500), 2);
  assert.equal(countPriceChanges(points, 0), 2);
  assert.equal(countPriceChanges(points, 4_500), 1);
  assert.equal(countPriceChanges([], 0), 0);
});

/* -------------------------------- tiers ---------------------------------- */

test("a live deal is always hot", () => {
  assert.equal(
    refreshTierFor({
      live: true,
      price: 100,
      low: 80,
      avg: 100,
      changes90d: 0,
      count: 20,
    }),
    "hot",
  );
});

test("a thin series is checked quickly until it can be scored", () => {
  assert.equal(
    refreshTierFor({
      live: false,
      price: 100,
      low: 100,
      avg: 100,
      changes90d: 0,
      count: 2,
    }),
    "hot",
  );
});

test("a deep discount with movement is hot, a smaller one is warm", () => {
  assert.equal(
    refreshTierFor({
      live: false,
      price: 80,
      low: 70,
      avg: 140,
      changes90d: 5,
      count: 20,
    }),
    "hot",
  );
  assert.equal(
    refreshTierFor({
      live: false,
      price: 80,
      low: 70,
      avg: 100,
      changes90d: 5,
      count: 20,
    }),
    "warm",
  );
});

test("a flat long-tail listing is standard", () => {
  assert.equal(
    refreshTierFor({
      live: false,
      price: 100,
      low: 100,
      avg: 100,
      changes90d: 0,
      count: 20,
    }),
    "standard",
  );
});

test("an unpriced listing falls back to standard", () => {
  assert.equal(
    refreshTierFor({
      live: false,
      price: 0,
      low: null,
      avg: null,
      changes90d: 0,
      count: 0,
    }),
    "standard",
  );
});

test("the three cadences are three, six and twenty-four hours", () => {
  assert.equal(intervalForTier("hot"), 3 * HOUR);
  assert.equal(intervalForTier("warm"), 6 * HOUR);
  assert.equal(intervalForTier("standard"), 24 * HOUR);
});
