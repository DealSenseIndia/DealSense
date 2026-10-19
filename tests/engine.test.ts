import { test } from "node:test";
import assert from "node:assert/strict";

import { detectMerchant, parseMerchantUrl, stripTracking, affiliateUrl } from "../src/lib/merchants/resolve";
import { parsePrice, parseCount, parseRating, inferCategory } from "../src/lib/merchants/parse";
import { parseAmazonAmount, pricesFromText } from "../src/lib/merchants/amazon";
import { buildIdentityKey, sameVariant, variantTokens } from "../src/lib/engine/identity";
import { computeStats } from "../src/lib/engine/stats";
import { evaluateDeal } from "../src/lib/engine/verdict";
import { computeLandedPrice } from "../src/lib/engine/landedPrice";
import { alertConditionMet, type AlertContext } from "../src/lib/engine/alerts";
import type { AlertRow } from "../src/lib/db/queries";

/* ------------------------------ URL resolution ------------------------------ */

test("detects merchants from hosts", () => {
  assert.equal(detectMerchant("https://www.amazon.in/dp/B0ABCDEFGH"), "amazon");
  assert.equal(detectMerchant("https://amzn.to/3xYz"), "amazon");
  assert.equal(detectMerchant("https://www.flipkart.com/x/p/itmabc"), "flipkart");
  assert.equal(detectMerchant("https://www.myntra.com/x"), null);
});

test("parses Amazon URLs into canonical dp links", () => {
  const r = parseMerchantUrl("https://www.amazon.in/Some-Title/dp/B0ABCDEFGH/ref=sr_1_3?keywords=x");
  assert.ok(r);
  assert.equal(r!.merchant, "amazon");
  assert.equal(r!.merchantProductId, "B0ABCDEFGH");
  assert.equal(r!.canonicalUrl, "https://www.amazon.in/dp/B0ABCDEFGH");

  const gp = parseMerchantUrl("https://www.amazon.in/gp/product/B08N5WRWNW");
  assert.equal(gp?.merchantProductId, "B08N5WRWNW");
});

test("parses Flipkart URLs via pid", () => {
  const r = parseMerchantUrl("https://www.flipkart.com/phone/p/itmabc?pid=MOBGXXXXXX");
  assert.ok(r);
  assert.equal(r!.merchant, "flipkart");
  assert.equal(r!.merchantProductId, "MOBGXXXXXX");
});

test("shortlinks are flagged and cannot be parsed directly", () => {
  assert.equal(parseMerchantUrl("https://amzn.to/3abc"), null);
  assert.equal(detectMerchant("https://amzn.to/3abc"), "amazon");
});

test("stripTracking removes affiliate/ref params", () => {
  const out = stripTracking("https://www.amazon.in/dp/B0ABCDEFGH?ref=sr_1_1&tag=x-21&th=1");
  assert.ok(!out.includes("tag="));
  assert.ok(!out.includes("ref="));
  assert.ok(out.includes("/dp/B0ABCDEFGH"));
});

test("affiliateUrl injects the Amazon tag", () => {
  const out = affiliateUrl("amazon", "https://www.amazon.in/dp/B0ABCDEFGH", "mytag-21", "123");
  assert.ok(out.includes("tag=mytag-21"));
});

/* --------------------------------- Parsers --------------------------------- */

test("parsePrice handles Indian formats", () => {
  assert.equal(parsePrice("₹15,999.00"), 15999);
  assert.equal(parsePrice("1,23,456"), 123456);
  assert.equal(parsePrice("₹519"), 519);
  assert.equal(parsePrice("Free"), null);
  assert.equal(parsePrice(""), null);
});

test("parseCount handles ratings counts", () => {
  assert.equal(parseCount("12,450 ratings"), 12450);
  assert.equal(parseCount("1.2K"), 1200);
  assert.equal(parseCount("no numbers"), null);
});

test("parseRating validates range", () => {
  assert.equal(parseRating("4.3 out of 5 stars"), 4.3);
  assert.equal(parseRating("6.0"), null);
  assert.equal(parseRating(null), null);
});

test("parseAmazonAmount fixes Amazon's missing decimal", () => {
  assert.equal(parseAmazonAmount("₹15,99900"), 15999);
  assert.equal(parseAmazonAmount("₹519.00"), 519);
  assert.equal(parseAmazonAmount("1,23,456"), 123456);
  assert.equal(parseAmazonAmount("₹76,99900"), 76999);
});

test("pricesFromText picks the main price, not MRP", () => {
  const text = "Some product\nM.R.P.: ₹19,999\nDeal Price ₹15,999\nYou save ₹4,000";
  const { price, mrp } = pricesFromText(text);
  assert.equal(price, 15999);
  assert.equal(mrp, 19999);
});

test("inferCategory guesses from titles", () => {
  assert.equal(inferCategory("Apple iPhone 16 128GB"), "Smartphones");
  assert.equal(inferCategory("Sony WH-1000XM5 Headphones"), "Audio");
});

/* --------------------------------- Identity -------------------------------- */

test("identityKey matches the same product across stores", () => {
  const a = buildIdentityKey("Apple iPhone 16 (128 GB) - Black");
  const b = buildIdentityKey("Apple iPhone 16 128GB Black");
  assert.equal(a, b);
});

test("sameVariant rejects different capacities", () => {
  assert.equal(sameVariant("iPhone 16 128GB Black", "iPhone 16 128GB Black"), true);
  assert.equal(sameVariant("iPhone 16 128GB Black", "iPhone 16 256GB Black"), false);
  assert.equal(sameVariant("Sony WH-1000XM5", "Sony WH-1000XM5"), true);
});

test("variantTokens extracts capacity and connectivity", () => {
  const t = variantTokens("Redmi Note 13 Pro 5G 8GB RAM 256GB");
  assert.ok(t.includes("256gb"));
  assert.ok(t.includes("5g"));
});

/* ---------------------------------- Stats ---------------------------------- */

test("computeStats ignores invalid prices", () => {
  const now = Date.now();
  const stats = computeStats([
    { price: 100, observedAt: now - 3000 },
    { price: null, observedAt: now - 2000 },
    { price: 200, observedAt: now - 1000 },
    { price: 150, observedAt: now },
  ]);
  assert.equal(stats.count, 3);
  assert.equal(stats.low, 100);
  assert.equal(stats.high, 200);
  assert.equal(stats.median, 150);
});

/* --------------------------------- Verdict --------------------------------- */

test("verdict is INSUFFICIENT with too few observations", () => {
  const stats = computeStats([{ price: 1000, observedAt: Date.now() }]);
  const v = evaluateDeal({ current: 1000, mrp: 2000, stats });
  assert.equal(v.verdict, "INSUFFICIENT");
  assert.equal(v.score, null);
  assert.equal(v.confidence, "INSUFFICIENT");
});

test("verdict is BUY near the historical low", () => {
  const now = Date.now();
  const stats = computeStats([
    { price: 1200, observedAt: now - 4000 },
    { price: 1300, observedAt: now - 3000 },
    { price: 1400, observedAt: now - 2000 },
    { price: 1500, observedAt: now - 1000 },
    { price: 1000, observedAt: now },
  ]);
  const v = evaluateDeal({ current: 1000, mrp: 1500, stats });
  assert.equal(v.verdict, "BUY");
  assert.ok((v.score ?? 0) >= 75);
  assert.ok(v.reasons.length > 0);
});

test("verdict flags an inflated MRP discount", () => {
  const now = Date.now();
  const stats = computeStats([
    { price: 1000, observedAt: now - 4000 },
    { price: 1010, observedAt: now - 3000 },
    { price: 1005, observedAt: now - 2000 },
    { price: 1000, observedAt: now },
  ]);
  const v = evaluateDeal({ current: 1000, mrp: 2500, stats });
  assert.equal(v.fakeDiscount, true);
  assert.equal(v.advertisedDiscountPct, 60);
});

/* ------------------------------- Landed price ------------------------------ */

test("landed price subtracts coupon and best card offer", () => {
  const landed = computeLandedPrice({ base: 10000, shipping: 0, coupon: 500, merchant: "amazon" });
  // best amazon offer = 10% capped at 1500 -> 1000
  assert.equal(landed.bankDiscount, 1000);
  assert.equal(landed.effective, 8500);
  assert.equal(landed.savings, 1500);
});

test("landed price respects minimum spend", () => {
  const landed = computeLandedPrice({ base: 1000, merchant: "flipkart" });
  // 10% offers need ₹5,000 min; Flipkart Axis 5% unlimited -> 50
  assert.equal(landed.bankDiscount, 50);
  assert.equal(landed.effective, 950);
});

/* ---------------------------------- Alerts --------------------------------- */

const makeAlert = (over: Partial<AlertRow>): AlertRow => ({
  id: "a1",
  productId: "p1",
  listingId: "l1",
  alertType: "TARGET_PRICE",
  targetPrice: null,
  baselinePrice: null,
  targetPercent: null,
  targetScore: null,
  status: "ARMED",
  channel: "console",
  contact: null,
  cooldownUntil: null,
  lastTriggeredAt: null,
  lastTriggerPrice: null,
  triggerCount: 0,
  isPersistent: true,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const makeCtx = (over: Partial<AlertContext>): AlertContext => ({
  listingId: "l1",
  productId: "p1",
  productTitle: "Test",
  merchant: "amazon",
  effectivePrice: 1000,
  verdict: "BUY",
  confidence: "HIGH",
  score: 90,
  reasons: [],
  affiliateUrl: "https://example.com",
  observedAt: Date.now(),
  ...over,
});

test("target price triggers at or below, including exact equality", () => {
  const alert = makeAlert({ targetPrice: 1000 });
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 1000 })), true);
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 999 })), true);
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 1001 })), false);
});

test("target price suppresses missing/zero prices", () => {
  const alert = makeAlert({ targetPrice: 1000 });
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 0 })), false);
});

test("percentage drop uses the immutable baseline", () => {
  const alert = makeAlert({ alertType: "PERCENT_DROP", baselinePrice: 1000, targetPercent: 10 });
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 900 })), true);
  assert.equal(alertConditionMet(alert, makeCtx({ effectivePrice: 901 })), false);
});

test("deal score requires BUY and non-low confidence", () => {
  const alert = makeAlert({ alertType: "DEAL_SCORE", targetScore: 80 });
  assert.equal(alertConditionMet(alert, makeCtx({ score: 85, verdict: "BUY", confidence: "HIGH" })), true);
  assert.equal(alertConditionMet(alert, makeCtx({ score: 85, verdict: "WAIT", confidence: "HIGH" })), false);
  assert.equal(alertConditionMet(alert, makeCtx({ score: 85, verdict: "BUY", confidence: "LOW" })), false);
});
