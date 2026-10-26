import { test } from "node:test";
import assert from "node:assert/strict";

import { detectMerchant, parseMerchantUrl, stripTracking, affiliateUrl } from "../src/lib/merchants/resolve";
import { parsePrice, parseCount, parseRating, inferCategory } from "../src/lib/merchants/parse";
import { parseAmazonAmount, pricesFromText } from "../src/lib/merchants/amazon";
import { parseAmazonResults, isProductTitle } from "../src/lib/merchants/search";
import { buildIdentityKey, sameVariant, variantTokens, storageOf, ramOf, titleSimilarity, isSameProduct, isAccessory } from "../src/lib/engine/identity";
import { computeStats } from "../src/lib/engine/stats";
import { evaluateDeal, priceCautionNote } from "../src/lib/engine/verdict";
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

test("sameVariant survives a store title that got cut short", () => {
  // Flipkart truncates: "(12 GB ...more" leaves a bare 12 GB where the RAM is.
  const amazon =
    "Samsung Galaxy S25 Ultra 5G AI Smartphone (Titanium Silverblue, 12GB RAM, 256GB Storage), 200MP Camera";
  const flipkart = "Samsung Galaxy S25 Ultra 5G (Titanium Silverblue, 256 GB) (12 GB ...more";
  assert.equal(sameVariant(amazon, flipkart), true);
});

test("sameVariant still rejects a genuinely different size", () => {
  const a = "Samsung Galaxy S25 Ultra (Titanium Silverblue, 12GB RAM, 256GB Storage)";
  const b = "Samsung Galaxy S25 Ultra (Titanium Silverblue, 12GB RAM, 512GB Storage)";
  assert.equal(sameVariant(a, b), false);
});

test("variantTokens extracts capacity and connectivity", () => {
  const t = variantTokens("Redmi Note 13 Pro 5G 8GB RAM 256GB");
  assert.ok(t.includes("256gb"));
  assert.ok(t.includes("5g"));
});

test("storageOf and ramOf separate capacity from memory", () => {
  assert.deepEqual(storageOf("vivo T5 Lite 128 GB 6 GB RAM"), ["128gb"]);
  assert.deepEqual(ramOf("vivo T5 Lite 128 GB 6 GB RAM"), ["6gb"]);
  assert.deepEqual(ramOf("vivo T5 Lite 128 GB"), []);
});

test("titleSimilarity scores matching products highly", () => {
  const a = "vivo T5 Lite 44W 5G (Wave Blue, 128 GB) (6 GB RAM)";
  const b = "vivo T5 Lite 44W 5G (Wave Blue, 128 GB)";
  assert.ok(titleSimilarity(a, b) > 0.9);
  assert.ok(titleSimilarity(a, "Samsung Galaxy S25 Ultra 5G") < 0.3);
});

test("isSameProduct rejects different brands, capacities and RAM", () => {
  const fk = "vivo T5 Lite 44W 5G (Wave Blue, 128 GB) (6 GB RAM)";
  assert.equal(isSameProduct(fk, "vivo T5 Lite 44W 5G (Wave Blue, 128 GB)"), true);
  assert.equal(isSameProduct(fk, "vivo T5 Lite 44W 5G (Wave Blue, 64 GB)"), false);
  assert.equal(isSameProduct(fk, "vivo T5 Lite 44W 5G (Twilight Shadow, 64 GB)"), false);
  assert.equal(isSameProduct(fk, "Samsung Galaxy S25 Ultra 5G"), false);
});

test("isSameProduct ignores colour differences", () => {
  assert.equal(
    isSameProduct("Apple iPhone 17 (White, 256 GB)", "Apple iPhone 17 (Black, 256 GB)"),
    true,
  );
});

test("isSameProduct rejects accessories", () => {
  assert.equal(isAccessory("Amazon Basics HMD Vibe 2 5G Flip Cover | Card Pocket"), true);
  assert.equal(isAccessory("vivo T5 Lite 44W 5G (Wave Blue, 128 GB)"), false);
  assert.equal(
    isSameProduct(
      "HMD Vibe2 5G 128 GB",
      "Amazon Basics HMD Vibe 2 5G Flip Cover | Card Pocket",
    ),
    false,
  );
});

test("isSameProduct requires a stated capacity on both sides", () => {
  assert.equal(
    isSameProduct("vivo T5 Lite 44W 5G 128 GB", "vivo T5 Lite 44W 5G 128 GB"),
    true,
  );
  // one side omits the capacity — we cannot confirm it is the same device
  assert.equal(
    isSameProduct("vivo T5 Lite 44W 5G 128 GB", "vivo T5 Lite 44W 5G"),
    false,
  );
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

test("an unavoidable Avoid pick explains its price in today's terms", () => {
  const now = Date.now();
  const stats = computeStats([
    { price: 2449, observedAt: now - 4000 },
    { price: 3784, observedAt: now - 3000 },
    { price: 3000, observedAt: now - 2000 },
    { price: 12199, observedAt: now - 1000 },
    { price: 12199, observedAt: now },
  ]);
  const note = priceCautionNote(12199, stats);
  assert.ok(note.includes("Avoid-rated"), note);
  assert.ok(note.includes("₹12,199"), note);
  // Says what the usual price was, without promising a future drop.
  assert.match(note, /usual ₹3,784/, note);
  assert.ok(!/will|going to|expect/i.test(note), note);
});

test("a caution note with no usable history still admits the gap", () => {
  const note = priceCautionNote(5000, computeStats([]));
  assert.ok(note.includes("Rated Avoid today"), note);
  assert.ok(!note.includes("NaN"), note);
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

/* ---------------------------- Search result parsing --------------------------- */

test("Amazon search uses the real title, never the price block", () => {
  const html = `
    <div data-component-type="s-search-result" data-asin="B0TEST1234">
      <h2><span>Apple iPhone 18 (Black, 256 GB)</span></h2>
      <a class="a-link-normal" href="/dp/B0TEST1234">₹1,19,900₹1,19,900 M.R.P.: ₹1,49,900 M.R.P.: ₹1,49,900</a>
      <span class="a-price"><span class="a-offscreen">₹1,19,900</span></span>
    </div>`;
  const hits = parseAmazonResults(html, 5);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, "Apple iPhone 18 (Black, 256 GB)");
});

test("Amazon search skips a card whose only text is a price", () => {
  const html = `
    <div data-component-type="s-search-result" data-asin="B0PRICE123">
      <a class="a-link-normal" href="/dp/B0PRICE123">₹1,19,900₹1,19,900 M.R.P.: ₹1,49,900</a>
      <span class="a-price"><span class="a-offscreen">₹1,19,900</span></span>
    </div>`;
  assert.equal(parseAmazonResults(html, 5).length, 0);
});

test("isProductTitle rejects price-only strings", () => {
  assert.equal(isProductTitle("₹1,19,900₹1,19,900 M.R.P.: ₹1,49,900"), false);
  assert.equal(isProductTitle("₹54,900"), false);
  assert.equal(isProductTitle("Apple iPhone 18 (Black, 256 GB)"), true);
});
