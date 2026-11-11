import { test } from "node:test";
import assert from "node:assert/strict";

import {
  selectAlternatives,
  MAX_ALTERNATIVES,
} from "../src/lib/setups/alternatives";
import { applySwaps, recomputeTier, swapCompatibilityError } from "../src/lib/setups/swap";
import type {
  SetupAlternative,
  SetupItem,
  SetupTierResult,
} from "../src/lib/setups/engine";

type Candidate = { listingId: string; verdict: { verdict: "BUY" | "FAIR" | "WAIT" | "AVOID" | "INSUFFICIENT" } };

function scored(id: string, verdict: Candidate["verdict"]["verdict"], score = 0.5) {
  return { score, candidate: { listingId: id, verdict: { verdict } } as Candidate };
}

/* --------------------------- runner-up selection -------------------------- */

test("alternatives keep rank, drop used listings and never offer Avoid", () => {
  const ranked = [
    scored("a", "BUY", 0.9),
    scored("avoid", "AVOID", 0.8),
    scored("used", "BUY", 0.7),
    scored("b", "FAIR", 0.6),
    scored("c", "WAIT", 0.5),
    scored("d", "BUY", 0.4),
  ];
  const picked = selectAlternatives(ranked, new Set(["chosen", "used"]));
  assert.deepEqual(
    picked.map((c) => c.listingId),
    ["a", "b", "c"],
  );
  assert.equal(picked.length, MAX_ALTERNATIVES);
});

test("a slot whose only candidate is the pick has no alternatives", () => {
  const ranked = [scored("only", "BUY", 1)];
  assert.deepEqual(selectAlternatives(ranked, new Set(["only"])), []);
});

test("an Avoid-only pool yields no alternatives, not a padded shortlist", () => {
  const ranked = [
    scored("a", "AVOID", 0.9),
    scored("b", "AVOID", 0.8),
    scored("chosen", "AVOID", 1),
  ];
  assert.deepEqual(selectAlternatives(ranked, new Set(["chosen"])), []);
});

test("the same product from two listings is offered once", () => {
  const ranked = [scored("a", "BUY", 0.9), scored("b", "BUY", 0.8), scored("c", "FAIR", 0.7)];
  const titles: Record<string, string> = {
    a: "ASUS TUF 24 inch Gaming Monitor",
    b: "ASUS TUF 24 inch Gaming Monitor",
    c: "Samsung 27 inch Monitor",
  };
  const picked = selectAlternatives(
    ranked,
    new Set(),
    3,
    (c) => titles[c.listingId],
    ["ASUS TUF 24 inch Gaming Monitor"],
  );
  assert.deepEqual(
    picked.map((c) => c.listingId),
    ["c"],
  );
});

/* -------------------------------- fixtures -------------------------------- */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11);

function item(overrides: Partial<SetupItem> & Pick<SetupItem, "slotKey">): SetupItem {
  return {
    slotLabel: overrides.slotKey,
    phase: 1,
    rationale: "Real recorded price.",
    listingId: `${overrides.slotKey}-pick`,
    productId: `${overrides.slotKey}-product`,
    slug: `${overrides.slotKey}-pick`,
    title: "Test part",
    brand: null,
    imageUrl: null,
    merchant: "amazon",
    merchantName: "Amazon",
    price: 1000,
    mrp: null,
    discountPct: 0,
    verdict: "BUY",
    score: 70,
    confidence: "HIGH",
    verdictReason: "Below its usual price.",
    priceCaution: null,
    observationCount: 12,
    sufficientHistory: true,
    observedAt: NOW - 3 * DAY,
    historicalLow: 900,
    historicalMedian: 1200,
    targetSpend: 1000,
    selectionScore: 0.8,
    affiliateUrl: `/go/${overrides.slotKey}-pick?src=setup`,
    spark: [1000, 1100, 1000],
    alternatives: [],
    ...overrides,
    slotKey: overrides.slotKey,
  };
}

function alt(base: SetupItem, overrides: Partial<SetupAlternative>): SetupAlternative {
  const { slotKey, slotLabel, phase, rationale, priceCaution, targetSpend, alternatives, ...rest } = base;
  return { ...rest, ...overrides };
}

function makeTier(items: SetupItem[], budget: number): SetupTierResult {
  const skeleton: SetupTierResult = {
    key: "value",
    label: "Best value",
    tagline: "",
    description: "",
    badge: "",
    accent: "emerald",
    effectiveBudget: budget,
    items: [],
    unfilled: [],
    cautionCount: 0,
    totalPrice: 0,
    totalMrp: null,
    savingsVsMrp: null,
    budgetRemaining: budget,
    phase1Total: 0,
    phase2Total: 0,
    storeCount: 0,
    setupScore: null,
    scoreBreakdown: null,
    completeness: {
      slotsTotal: items.length,
      filled: 0,
      essentialTotal: items.filter((i) => i.phase === 1).length,
      essentialFilled: 0,
      withHistory: 0,
    },
  };
  return recomputeTier(skeleton, items, budget);
}

/* ------------------------------ swap sums -------------------------------- */

test("a swap recomputes total, phases, budget remaining and savings", () => {
  const cpu = item({
    slotKey: "cpu",
    price: 2000,
    mrp: 3000,
    discountPct: 33,
    score: 70,
    merchant: "amazon",
  });
  const chair = item({
    slotKey: "chair",
    phase: 2,
    price: 1000,
    score: null,
    sufficientHistory: false,
    merchant: "flipkart",
    merchantName: "Flipkart",
  });
  const cpuAlt = alt(cpu, {
    listingId: "cpu-alt",
    slug: "cpu-alt",
    title: "AMD Ryzen 7 7700 Processor with Radeon Graphics",
    price: 2500,
    mrp: 3500,
    discountPct: 29,
    score: 78,
    affiliateUrl: "/go/cpu-alt?src=setup",
  });
  const base = makeTier([{ ...cpu, alternatives: [cpuAlt] }, chair], 4000);

  const result = applySwaps(base, { cpu: "cpu-alt" }, 4000);

  assert.equal(result.customized, true);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.tier.totalPrice, 3500);
  assert.equal(result.tier.phase1Total, 2500);
  assert.equal(result.tier.phase2Total, 1000);
  assert.equal(result.tier.budgetRemaining, 500);
  assert.equal(result.tier.totalMrp, 3500);
  assert.equal(result.tier.savingsVsMrp, 1000);
  assert.equal(result.tier.storeCount, 2);
  assert.equal(result.tier.completeness.filled, 2);
  // coverage 1, budget fit 1, evidence 0.5, deal quality 0.78 -> 85.6 -> 86
  assert.equal(result.tier.setupScore, 86);
  assert.equal(result.tier.items.find((i) => i.slotKey === "cpu")?.price, 2500);
  assert.equal(result.tier.items.find((i) => i.slotKey === "cpu")?.verdict, "BUY");
});

test("an empty swap map is the untouched build", () => {
  const chair = item({ slotKey: "chair", price: 1200, mrp: 2000, discountPct: 40 });
  const base = makeTier([chair], 3000);
  const result = applySwaps(base, {}, 3000);
  assert.equal(result.customized, false);
  assert.equal(result.tier.totalPrice, base.totalPrice);
  assert.equal(result.tier.savingsVsMrp, base.savingsVsMrp);
  assert.deepEqual(result.applied, {});
});

test("a swap to a listing the slot never offered is refused", () => {
  const chair = item({ slotKey: "chair" });
  const base = makeTier([chair], 2000);
  const result = applySwaps(base, { chair: "not-an-option" }, 2000);
  assert.equal(result.customized, false);
  assert.equal(result.rejected[0]?.slotKey, "chair");
  assert.match(result.rejected[0]?.reason ?? "", /not one of this slot's tracked alternatives/i);
});

test("a listing already used in another slot cannot be swapped in", () => {
  const cpu = item({ slotKey: "cpu", title: "AMD Ryzen 5 7600 with Radeon Graphics" });
  const chair = item({ slotKey: "chair" });
  const duplicate = alt(cpu, {
    listingId: "chair-pick",
    slug: "chair-pick",
    title: "AMD Ryzen 7 7700 with Radeon Graphics",
  });
  const base = makeTier([{ ...cpu, alternatives: [duplicate] }, chair], 4000);
  const result = applySwaps(base, { cpu: "chair-pick" }, 4000);
  assert.equal(result.customized, false);
  assert.match(result.rejected[0]?.reason ?? "", /already used in another slot/i);
});

/* --------------------------- compatibility ------------------------------- */

const cpu = item({
  slotKey: "cpu",
  title: "AMD Ryzen 5 7600 Processor",
  brand: "AMD",
  price: 20000,
});
const board = item({
  slotKey: "motherboard",
  title: "MSI B650M Gaming Plus DDR5 Motherboard",
  brand: "MSI",
  price: 15000,
});
const ram = item({
  slotKey: "ram",
  title: "Corsair Vengeance DDR5 16GB Kit",
  brand: "Corsair",
  price: 8000,
});

test("a processor on the wrong socket is refused with the reason", () => {
  const am4 = alt(cpu, {
    listingId: "cpu-am4",
    slug: "cpu-am4",
    title: "AMD Ryzen 5 5600X Processor",
  });
  const base = makeTier([{ ...cpu, alternatives: [am4] }, board, ram], 60000);
  const result = applySwaps(base, { cpu: "cpu-am4" }, 60000);
  assert.equal(result.customized, false);
  assert.match(result.rejected[0]?.reason ?? "", /AM4/);
  assert.match(result.rejected[0]?.reason ?? "", /AM5/);
});

test("a motherboard on the wrong socket is refused", () => {
  const am4Board = alt(board, {
    listingId: "board-am4",
    slug: "board-am4",
    title: "MSI B450M Pro VDH Motherboard",
  });
  const base = makeTier([cpu, { ...board, alternatives: [am4Board] }, ram], 60000);
  const result = applySwaps(base, { motherboard: "board-am4" }, 60000);
  assert.equal(result.customized, false);
  assert.match(result.rejected[0]?.reason ?? "", /AM4/);
  assert.match(result.rejected[0]?.reason ?? "", /AM5/);
});

test("a memory kit of the wrong generation is refused", () => {
  const ddr4 = alt(ram, {
    listingId: "ram-ddr4",
    slug: "ram-ddr4",
    title: "Corsair Vengeance DDR4 8GB Kit",
  });
  const base = makeTier([cpu, board, { ...ram, alternatives: [ddr4] }], 60000);
  const result = applySwaps(base, { ram: "ram-ddr4" }, 60000);
  assert.equal(result.customized, false);
  assert.match(result.rejected[0]?.reason ?? "", /DDR4/);
  assert.match(result.rejected[0]?.reason ?? "", /DDR5/);
});

test("a compatible processor swap is allowed", () => {
  const am5 = alt(cpu, {
    listingId: "cpu-am5",
    slug: "cpu-am5",
    title: "AMD Ryzen 7 7700 Processor with Radeon Graphics",
    price: 26000,
  });
  const base = makeTier([{ ...cpu, alternatives: [am5] }, board, ram], 60000);
  const result = applySwaps(base, { cpu: "cpu-am5" }, 60000);
  assert.equal(result.customized, true);
  assert.deepEqual(result.rejected, []);
  assert.equal(result.tier.items.find((i) => i.slotKey === "cpu")?.price, 26000);
});

test("a socket that needs DDR5 is refused next to a DDR4 kit", () => {
  const intel = item({
    slotKey: "cpu",
    title: "Intel i5-13400F Desktop Processor",
    brand: "Intel",
    price: 13749,
  });
  // No readable socket on purpose: this isolates the memory-generation rule
  // from the socket rule (X99 is now a known LGA2011 board).
  const unknownBoard = item({
    slotKey: "motherboard",
    title: "OEM Micro-ATX Desktop Motherboard DDR4",
    brand: null,
    price: 12999,
  });
  const ddr4 = item({
    slotKey: "ram",
    title: "Patriot Viper Steel DDR4 16GB Kit",
    brand: "Patriot",
    price: 12199,
  });
  const gpu = item({ slotKey: "gpu", title: "RTX 2060 Super 8GB", price: 30550 });
  const am5 = alt(intel, {
    listingId: "cpu-am5",
    slug: "cpu-am5",
    title: "AMD 7000 Series Ryzen 5 7600X Desktop Processor",
    brand: "AMD",
    price: 17699,
  });
  const base = makeTier(
    [{ ...intel, alternatives: [am5] }, unknownBoard, ddr4, gpu],
    125000,
  );
  const result = applySwaps(base, { cpu: "cpu-am5" }, 125000);
  assert.equal(result.customized, false);
  assert.match(result.rejected[0]?.reason ?? "", /DDR5/);
  assert.match(result.rejected[0]?.reason ?? "", /DDR4/);
});

test("compatibility is checked directly, not only through applySwaps", () => {
  const incoming = { slotKey: "ram", title: "Kingston DDR4 8GB", brand: null };
  const error = swapCompatibilityError("ram", incoming, [cpu, board]);
  assert.ok(error);
  assert.match(error ?? "", /DDR4/);
  assert.equal(
    swapCompatibilityError("ram", { slotKey: "ram", title: "Kingston DDR5 8GB", brand: null }, [cpu, board]),
    null,
  );
});
