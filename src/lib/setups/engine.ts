/**
 * Smart Setup composition.
 *
 * Fill a room blueprint with real, tracked products. Every item must have a
 * live listing in one of our tracked stores and a genuine recorded price.
 * Nothing is estimated, generated or padded.
 *
 * The selection model is deliberately simple and auditable:
 *
 *   score = 0.45 × budget fit
 *         + 0.35 × deal score
 *         + 0.10 × style affinity
 *         + 0.10 × price evidence
 *
 * Ties break on lower price, then listing id, so the same inputs always
 * produce the same setup.
 */

import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db, ensureSchema } from "../db/client";
import { listings, observations, products } from "../db/schema";
import { goPath } from "../affiliate";
import { storeMeta, priceTrackedMerchants } from "../config";
import type { Confidence, Verdict } from "../types";
import { computeStats } from "../engine/stats";
import { evaluateDeal, priceCautionNote } from "../engine/verdict";
import {
  DEFAULT_SPACE,
  getSetupSpace,
  getSetupStyle,
  getSetupTier,
  SETUP_SPACES,
  SETUP_STYLES,
  SETUP_TIERS,
  type SetupSlot,
  type SetupSpace,
  type SetupSpaceKey,
  type SetupStyleProfile,
  type SetupTierProfile,
} from "./blueprints";
import {
  detectMemoryGen,
  detectPlatform,
  hasIntegratedGraphics,
  memoryGensForPlatform,
  platformsCompatible,
  type MemoryGen,
  type PcPlatform,
} from "./compat";

const SUPPORTED_MERCHANTS = priceTrackedMerchants;
const MIN_EVIDENCE_OBS = 3;

export interface SetupBuildInput {
  space: string;
  budget: number;
  owned?: string[];
  style?: string;
}

export interface SetupItem {
  slotKey: string;
  slotLabel: string;
  phase: 1 | 2;
  rationale: string;
  listingId: string;
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  merchant: string;
  merchantName: string;
  price: number;
  mrp: number | null;
  discountPct: number;
  verdict: Verdict;
  score: number | null;
  confidence: Confidence;
  verdictReason: string | null;
  /**
   * Set when the pick is rated Avoid but the slot cannot be left empty
   * (a PC needs memory, a desk needs a chair). Explains the price honestly
   * instead of pretending the deal is good.
   */
  priceCaution: string | null;
  observationCount: number;
  /**
   * Deliberately no raw provenance string here: which internal feed recorded a
   * price is data we keep in the database, not something the browser sees.
   */
  sufficientHistory: boolean;
  observedAt: number | null;
  historicalLow: number | null;
  historicalMedian: number | null;
  targetSpend: number;
  selectionScore: number;
  affiliateUrl: string;
  spark: number[];
}

export interface UnfilledSlot {
  slotKey: string;
  slotLabel: string;
  phase: 1 | 2;
  targetSpend: number;
  /**
   * COVERED_BY_PROCESSOR is not a gap: the slot needs no purchase at this tier
   * because the processor that was chosen drives the display itself. It is
   * reported alongside the real gaps so the count of slots stays honest.
   */
  reason:
    | "NO_MATCHING_PRODUCT"
    | "OUT_OF_BUDGET_RANGE"
    | "ONLY_POOR_DEALS"
    | "COVERED_BY_PROCESSOR";
  detail: string;
}

export interface SetupTierResult {
  key: string;
  label: string;
  tagline: string;
  description: string;
  badge: string;
  accent: "deep" | "emerald" | "ink";
  effectiveBudget: number;
  items: SetupItem[];
  unfilled: UnfilledSlot[];
  /** Picks kept only because their slot cannot go empty. */
  cautionCount: number;
  totalPrice: number;
  totalMrp: number | null;
  savingsVsMrp: number | null;
  budgetRemaining: number;
  phase1Total: number;
  phase2Total: number;
  storeCount: number;
  setupScore: number | null;
  scoreBreakdown: {
    coverage: number;
    budgetFit: number;
    priceEvidence: number;
    dealQuality: number;
    note: string;
  } | null;
  completeness: {
    slotsTotal: number;
    filled: number;
    essentialTotal: number;
    essentialFilled: number;
    withHistory: number;
  };
}

export interface SetupBuildResult {
  space: SetupSpaceKey;
  title: string;
  tagline: string;
  requestedBudget: number;
  style: string;
  styleLabel: string;
  owned: { count: number; labels: string[]; note: string | null };
  catalogueSize: number;
  tiers: SetupTierResult[];
  generatedAt: string;
}

interface Candidate {
  listingId: string;
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  merchant: string;
  merchantName: string;
  price: number;
  mrp: number | null;
  inStock: boolean | null;
  lastCheckedAt: number | null;
  haystack: string;
  obsCount: number;
  sources: string[];
  stats: ReturnType<typeof computeStats>;
  verdict: ReturnType<typeof evaluateDeal>;
  spark: number[];
}

function styleAffinity(text: string, style: SetupStyleProfile): number {
  if (!style.preferTokens.length) return 0;
  const hits = style.preferTokens.filter((t) => tokenInText(t, text)).length;
  return Math.min(1, hits / 3);
}

/**
 * Token matching that respects word boundaries.
 *
 * Plain substring matching made "cot" hit "cotton", "bed" hit "bedside" and
 * "cushion" hit "cushioned", which is how a mattress or a yoga mat ended up in
 * the wrong slot. Every token now matches whole words (with an optional plural)
 * so a word like "camera" cannot quietly match a phone's "50MP Rear Camera"
 * description without an explicit exclusion.
 */
function tokenInText(token: string, text: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:s|es)?(?:[^a-z0-9]|$)`).test(text);
}

export function matchesSlot(text: string, slot: SetupSlot): boolean {
  // The builder feeds this a lowercased haystack, but a title straight from the
  // store or a test never is. Matching is a property of the words, not of their
  // case, so normalise here instead of trusting every caller to pre-lowercase.
  const haystack = text.toLowerCase();
  if (slot.exclude.some((bad) => tokenInText(bad, haystack))) return false;
  return slot.matchAny.some((good) => tokenInText(good, haystack));
}

function evidenceFor(obsCount: number): number {
  if (obsCount >= MIN_EVIDENCE_OBS) return 1;
  if (obsCount > 1) return 0.5;
  return 0;
}

export async function loadCandidates(): Promise<Candidate[]> {
  await ensureSchema();

  const rows = await db
    .select({
      listingId: listings.id,
      productId: listings.productId,
      merchant: listings.merchant,
      listingUrl: listings.url,
      listingTitle: listings.title,
      price: listings.price,
      mrp: listings.mrp,
      inStock: listings.inStock,
      lastCheckedAt: listings.lastCheckedAt,
      listingImage: listings.imageUrl,
      productTitle: products.title,
      brand: products.brand,
      category: products.category,
      productImage: products.imageUrl,
      slug: products.slug,
    })
    .from(listings)
    .innerJoin(products, eq(products.id, listings.productId))
    .where(
      and(
        inArray(listings.merchant, [...SUPPORTED_MERCHANTS]),
        isNotNull(listings.price),
        gt(listings.price, 0),
      ),
    );

  const ids = rows.map((r) => r.listingId);
  if (!ids.length) return [];

  const obsRows = await db
    .select({
      listingId: observations.listingId,
      price: observations.price,
      observedAt: observations.observedAt,
      source: observations.source,
    })
    .from(observations)
    .where(inArray(observations.listingId, ids));

  const obsByListing = new Map<
    string,
    { price: number; observedAt: number; source: string }[]
  >();
  for (const o of obsRows) {
    if (o.price === null || o.price <= 0) continue;
    const list = obsByListing.get(o.listingId) ?? [];
    list.push({ price: o.price, observedAt: o.observedAt, source: o.source ?? "live_extraction" });
    obsByListing.set(o.listingId, list);
  }

  const out: Candidate[] = [];
  for (const r of rows) {
    const price = r.price ?? 0;
    if (!price) continue;
    if (r.inStock === false) continue;

    const obs = obsByListing.get(r.listingId) ?? [];
    if (!obs.length) continue;

    const stats = computeStats(obs);
    if (!stats.count) continue;

    // A live price far under the product's own record is a listing error, not
    // a deal: a ₹899 flagship board was poisoning the PC build and dragging
    // the memory slot onto an expensive generation. Keep it off the shelves.
    const median = stats.median;
    if (stats.count >= 5 && median !== null && median > 0 && price < median * 0.25) continue;

    const verdict = evaluateDeal({ current: price, mrp: r.mrp, stats });
    const series = [...obs].sort((a, b) => a.observedAt - b.observedAt);
    const title = r.listingTitle || r.productTitle;
    const sources = Array.from(new Set(obs.map((o) => o.source))).sort();

    out.push({
      listingId: r.listingId,
      productId: r.productId,
      slug: r.slug,
      title,
      brand: r.brand,
      category: r.category,
      imageUrl: r.productImage ?? r.listingImage,
      merchant: r.merchant,
      merchantName: storeMeta(r.merchant).name,
      price,
      mrp: r.mrp && r.mrp > price ? r.mrp : null,
      inStock: r.inStock,
      lastCheckedAt: r.lastCheckedAt,
      // Matching deliberately reads titles and brand, not the catalogue
      // category. A category such as "Bedside Tables" or "Desk Chairs" made a
      // TV stand look like decor and a chair look like a desk.
      haystack: [r.listingTitle, r.productTitle, r.brand]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      obsCount: stats.count,
      sources,
      stats,
      verdict,
      spark: series.slice(-18).map((p) => p.price),
    });
  }
  return out;
}

function activeSlots(space: SetupSpace, owned: string[]): {
  active: SetupSlot[];
  skipped: SetupSlot[];
} {
  const ownedSet = new Set(owned.map((o) => o.trim().toLowerCase()).filter(Boolean));
  const active = space.slots.filter((s) => !ownedSet.has(s.ownedKey));
  const skipped = space.slots.filter((s) => ownedSet.has(s.ownedKey));
  return { active, skipped };
}

function weightOf(slot: SetupSlot, active: SetupSlot[]): number {
  const total = active.reduce((sum, s) => sum + s.impactWeight, 0);
  return total > 0 ? slot.impactWeight / total : 0;
}

function chooseForTier(
  tier: SetupTierProfile,
  space: SetupSpace,
  budget: number,
  active: SetupSlot[],
  candidates: Candidate[],
  style: SetupStyleProfile,
): { items: SetupItem[]; unfilled: UnfilledSlot[] } {
  const effectiveBudget = budget * tier.budgetFactor;
  const used = new Set<string>();
  const items: SetupItem[] = [];
  const unfilled: UnfilledSlot[] = [];
  /**
   * The PC build has to fit together. Slots are walked in blueprint order
   * (processor, then board, then memory), so each choice can constrain the
   * next one instead of leaving a reader with an AM5 chip and an LGA1700 board.
   */
  let platform: PcPlatform | null = null;
  let memory: MemoryGen | null = null;
  /** Memory generations the chosen socket can take, until a board decides it. */
  let allowedMems: MemoryGen[] | null = null;
  /** Money still uncommitted. Caps every later pick so the build stays buyable. */
  let remaining = effectiveBudget;
  /**
   * Each slot gets its weighted share of the money. It may stretch above that
   * share (maxFactor is the blueprint's tolerance) using two pools: what the
   * earlier slots left behind, and the phase-2 "buy it later" money. It may
   * never reach into the share a later *essential* still needs — otherwise one
   * expensive category silently deletes half the build, which is exactly how a
   * ₹75,000 plan used to end up costing ₹90,000 or filling 8 of 20 slots.
   *
   * A later essential only gets its share reserved if something tracked can
   * actually be bought with it. Reserving ₹2,250 for the power-supply slot —
   * which no store in our catalogue fills today — would starve the SSD next to
   * it for money that was never going to be spent.
   */
  const slotTargets = active.map((s) => effectiveBudget * weightOf(s, active));
  const reserve = active.map((slot, i) => {
    if (slot.phase !== 1) return 0;
    const band = slotTargets[i] * slot.maxFactor;
    const fillable = candidates.some(
      (c) => matchesSlot(c.haystack, slot) && c.price <= band,
    );
    return fillable ? slotTargets[i] : 0;
  });
  const owedLater: number[] = new Array(active.length).fill(0);
  for (let i = active.length - 1; i >= 0; i--) {
    owedLater[i - 1] = owedLater[i] + reserve[i];
  }

  for (let index = 0; index < active.length; index++) {
    const slot = active[index];
    const target = slotTargets[index];
    const stretch = remaining - (owedLater[index] ?? 0);
    const ceiling = stretch >= target ? stretch : Math.min(target, remaining);
    const hi = Math.max(0, Math.min(target * slot.maxFactor, ceiling));
    let matchedAny = false;
    const matching: Candidate[] = [];

    for (const c of candidates) {
      if (used.has(c.listingId)) continue;
      if (!matchesSlot(c.haystack, slot)) continue;
      matchedAny = true;
      matching.push(c);
    }

    // Only the three slots that physically interlock are filtered; everything
    // else in the room is a matter of taste and budget.
    let pool = matching;
    let clashed = false;
    let clashWith: string | null = null;
    if (slot.key === "motherboard" && platform) {
      const fits = matching.filter((c) => platformsCompatible(platform, detectPlatform(c.haystack)));
      clashed = matching.length > 0 && fits.length === 0;
      clashWith = `${platform} processor`;
      pool = fits;

      // A DDR5 board silently doubles the memory bill: the cheapest 16GB DDR5
      // kit we track is ₹19,999 against ₹9,699 for DDR4. Saver and value tiers
      // therefore prefer a board that is not DDR5-only, but never at the cost
      // of leaving the slot empty. Premium keeps both options.
      if (tier.key !== "premium") {
        const notDdr5 = pool.filter((c) => detectMemoryGen(c.haystack) !== "ddr5");
        if (notDdr5.length) pool = notDdr5;
      }
    } else if (slot.key === "ram") {
      // A priced board fixes the memory generation. When the board slot stayed
      // open, the processor's socket still rules out the generations it cannot
      // take, so a DDR3 stick never lands next to a DDR5-only build.
      const gens = memory ? [memory] : allowedMems;
      if (gens) {
        const fits = matching.filter((c) => {
          const gen = detectMemoryGen(c.haystack);
          return gen === null || gens.includes(gen);
        });
        clashed = matching.length > 0 && fits.length === 0;
        clashWith = memory
          ? `${memory} motherboard`
          : `${platform} processor`;
        pool = fits;
      }
    }

    const scoreOf = (c: Candidate): number => {
      const budgetFit =
        target > 0 ? Math.max(0, 1 - Math.abs(c.price - target) / target) : 0;
      const dealComponent = (c.verdict.score ?? 50) / 100;
      return (
        0.45 * budgetFit +
        0.35 * dealComponent +
        0.1 * styleAffinity(c.haystack, style) +
        0.1 * evidenceFor(c.obsCount)
      );
    };

    // A setup should not hand a reader a bad price, so Avoid-rated products are
    // only ever picked when the slot cannot go empty — see the forced band
    // below, where the item keeps its Avoid chip and gains an explicit note.
    const viable = pool.filter((c) => c.verdict.verdict !== "AVOID");

    // Any genuine candidate under the slot's ceiling is eligible; the score's
    // budget-fit term already prefers prices near the target. A hard lower
    // bound used to exclude genuine bargains and could make a higher tier pick
    // a cheaper item than a lower tier — and even lose slots entirely.
    const inBand = viable.filter((c) => c.price <= hi);

    /**
     * When a whole category is currently priced above its own history (RAM and
     * graphics cards both are, right now) a phase-1 slot would otherwise vanish
     * from the build. That is unhelpful and quietly misleading too: a reader
     * would just go buy the first stick they find. So essentials keep their
     * slot, carry the Avoid chip the product page already shows, and add one
     * factual line about what the price looks like historically. Phase-2
     * nice-to-haves stay open — waiting on those is the actual advice.
     */
    const forced =
      inBand.length === 0 && slot.phase === 1
        ? pool.filter((c) => c.verdict.verdict === "AVOID" && c.price <= hi)
        : [];

    /**
     * A build has to output a picture. The card slot is walked before the
     * processor, so by now we know whether this tier got one. When it did not,
     * only a chip with integrated graphics can carry the build — otherwise a
     * ₹50,000 saver happily recommended a Ryzen 5 3500, which has no graphics
     * at all, next to an empty card slot, and the room would not switch on.
     */
    const base = inBand.length ? inBand : forced;
    const needsDisplay = slot.key === "cpu" && !items.some((i) => i.slotKey === "gpu");
    const withDisplay = needsDisplay
      ? base.filter((c) => hasIntegratedGraphics(c.haystack))
      : base;
    const pickingFrom = withDisplay.length ? withDisplay : base;

    const ranked = pickingFrom.map((candidate) => ({
      // A forced pick is the least-bad option in a slot that cannot stay open.
      // Inside the band, price is the only honest signal of capability we have
      // (a 4GB stick is cheaper than the 16GB kit this build actually needs),
      // so forced picks rank by what they can do rather than by budget fit.
      score: inBand.length
        ? scoreOf(candidate)
        : candidate.price / 1_000_000 + (candidate.verdict.score ?? 0) / 100_000,
      candidate,
    }));

    if (!ranked.length) {
      const bandExists = pool.some((c) => c.price <= hi);
      // Less than a third of the slot's own share left means the money went to
      // the parts above it, not that this category is short of products.
      const spentEverything = remaining < target * 0.35;
      unfilled.push({
        slotKey: slot.key,
        slotLabel: slot.label,
        phase: slot.phase,
        targetSpend: Math.round(target),
        reason: !matchedAny || clashed
          ? "NO_MATCHING_PRODUCT"
          : bandExists
            ? "ONLY_POOR_DEALS"
            : "OUT_OF_BUDGET_RANGE",
        detail: clashed
          ? `Nothing we can price for this slot fits the ${clashWith ?? "part"} already chosen in this build, so it stays open rather than recommending a mismatch.`
          : !matchedAny
          ? `No tracked ${slot.label.toLowerCase()} in our store catalogue yet.`
          : bandExists
            ? `Everything we track for this slot is rated Avoid at its current price. It is a later purchase, so we left it out rather than recommend a bad deal — watch it and buy on the drop.`
            : spentEverything
              ? `This tier's budget is already committed to the parts above. Raise the budget, or mark something you already own, to open room here.`
              : `Tracked products exist, but none at or below ₹${Math.round(hi).toLocaleString("en-IN")} for this tier.`,
      });
      continue;
    }

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.candidate.price !== b.candidate.price) return a.candidate.price - b.candidate.price;
      return a.candidate.listingId.localeCompare(b.candidate.listingId);
    });

    const chosen = ranked[0];
    used.add(chosen.candidate.listingId);
    const c = chosen.candidate;
    remaining -= c.price;
    const forcedPick = inBand.length === 0;
    if (slot.key === "cpu" || slot.key === "motherboard") {
      platform = platform ?? detectPlatform(c.haystack);
      allowedMems = memoryGensForPlatform(platform);
    }
    if (slot.key === "motherboard" || slot.key === "ram") {
      memory = memory ?? detectMemoryGen(c.haystack);
    }
    const discountPct = c.mrp
      ? Math.round(((c.mrp - c.price) / c.mrp) * 100)
      : 0;

    items.push({
      slotKey: slot.key,
      slotLabel: slot.label,
      phase: slot.phase,
      rationale: slot.rationale,
      listingId: c.listingId,
      productId: c.productId,
      slug: c.slug,
      title: c.title,
      brand: c.brand,
      imageUrl: c.imageUrl,
      merchant: c.merchant,
      merchantName: c.merchantName,
      price: c.price,
      mrp: c.mrp,
      discountPct,
      verdict: c.verdict.verdict,
      score: c.verdict.score,
      confidence: c.verdict.confidence,
      verdictReason: c.verdict.reasons[0] ?? null,
      priceCaution: forcedPick ? priceCautionNote(c.price, c.stats) : null,
      observationCount: c.obsCount,
      sufficientHistory: c.obsCount >= MIN_EVIDENCE_OBS,
      observedAt: c.stats.lastObservedAt,
      historicalLow: c.stats.low,
      historicalMedian: c.stats.median,
      targetSpend: Math.round(target),
      selectionScore: Number(chosen.score.toFixed(4)),
      affiliateUrl: goPath(c.listingId, "setup"),
      spark: c.spark,
    });
  }

  /**
   * Say what an empty graphics slot actually means. If the processor that got
   * picked has its own display silicon, the build works today and the card is a
   * later upgrade rather than a missing part — which is a different sentence to
   * write than "we could not find you one".
   */
  const cpuItem = items.find((i) => i.slotKey === "cpu");
  if (cpuItem && hasIntegratedGraphics(cpuItem.title)) {
    const openCardSlot = unfilled.findIndex((u) => u.slotKey === "gpu");
    if (openCardSlot !== -1) {
      unfilled[openCardSlot] = {
        ...unfilled[openCardSlot],
        reason: "COVERED_BY_PROCESSOR",
        detail:
          "No discrete card fits this tier, and the build does not stop working because of it: the processor chosen here has integrated graphics, so the monitor runs off the CPU. A graphics card is the first upgrade, not a missing part.",
      };
    }
  }

  return { items, unfilled };
}

function setupScore(
  items: SetupItem[],
  active: SetupSlot[],
  budget: number,
): { score: number | null; breakdown: SetupTierResult["scoreBreakdown"] } {
  if (!items.length) return { score: null, breakdown: null };

  const essential = active.filter((s) => s.phase === 1).length;
  const essentialFilled = items.filter((i) => i.phase === 1).length;
  const coverage = essential ? essentialFilled / essential : 1;
  const total = items.reduce((sum, i) => sum + i.price, 0);
  // Staying inside the budget is a win, not a shortfall. Overspending is what
  // this factor is meant to catch.
  const budgetFit =
    budget > 0
      ? total <= budget
        ? 1
        : Math.max(0, 1 - (total - budget) / budget)
      : 0;
  const withHistory = items.filter((i) => i.sufficientHistory);
  const evidence = withHistory.length / items.length;
  const dealQuality = withHistory.length
    ? withHistory.reduce((sum, i) => sum + (i.score ?? 50), 0) / withHistory.length / 100
    : 0;

  return {
    score: Math.round(40 * coverage + 20 * budgetFit + 20 * evidence + 20 * dealQuality),
    breakdown: {
      coverage: Number(coverage.toFixed(3)),
      budgetFit: Number(budgetFit.toFixed(3)),
      priceEvidence: Number(evidence.toFixed(3)),
      dealQuality: Number(dealQuality.toFixed(3)),
      note: `${essentialFilled}/${essential} essentials filled · ${withHistory.length}/${items.length} items have enough recorded history for a confident verdict.`,
    },
  };
}

function tierResult(
  tier: SetupTierProfile,
  space: SetupSpace,
  budget: number,
  active: SetupSlot[],
  candidates: Candidate[],
  style: SetupStyleProfile,
): SetupTierResult {
  const { items, unfilled } = chooseForTier(
    tier,
    space,
    budget,
    active,
    candidates,
    style,
  );

  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const mrpItems = items.filter((i) => i.mrp && i.mrp > i.price);
  const totalMrp = mrpItems.length
    ? mrpItems.reduce((sum, i) => sum + (i.mrp ?? 0), 0)
    : null;
  const savingsVsMrp = totalMrp
    ? Math.round(mrpItems.reduce((sum, i) => sum + ((i.mrp ?? 0) - i.price), 0))
    : null;
  const { score, breakdown } = setupScore(items, active, budget);

  return {
    key: tier.key,
    label: tier.label,
    tagline: tier.tagline,
    description: tier.description,
    badge: tier.badge,
    accent: tier.accent,
    effectiveBudget: Math.round(budget * tier.budgetFactor),
    items,
    unfilled: [...unfilled].sort((a, b) => a.phase - b.phase),
    totalPrice: Math.round(totalPrice),
    totalMrp,
    savingsVsMrp,
    budgetRemaining: Math.round(budget - totalPrice),
    phase1Total: Math.round(
      items.filter((i) => i.phase === 1).reduce((sum, i) => sum + i.price, 0),
    ),
    phase2Total: Math.round(
      items.filter((i) => i.phase === 2).reduce((sum, i) => sum + i.price, 0),
    ),
    storeCount: new Set(items.map((i) => i.merchant)).size,
    cautionCount: items.filter((i) => i.priceCaution).length,
    setupScore: score,
    scoreBreakdown: breakdown,
    completeness: {
      slotsTotal: active.length,
      filled: items.length,
      essentialTotal: active.filter((s) => s.phase === 1).length,
      essentialFilled: items.filter((i) => i.phase === 1).length,
      withHistory: items.filter((i) => i.sufficientHistory).length,
    },
  };
}

export async function buildSetup(input: SetupBuildInput): Promise<SetupBuildResult> {
  const space = getSetupSpace(input.space || DEFAULT_SPACE);
  const style = getSetupStyle(input.style ?? "no_preference");
  const owned = (input.owned ?? [])
    .map((o) => o.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

  const rawBudget = Number.isFinite(input.budget) ? input.budget : space.budgetDefault;
  const budget = Math.min(
    space.budgetMax * 1.5,
    Math.max(Math.max(1000, space.budgetMin * 0.5), Math.round(rawBudget || space.budgetDefault)),
  );

  const { active, skipped } = activeSlots(space, owned);
  const candidates = await loadCandidates();

  // The tiers are the whole point of the builder, but we persist nothing: a
  // request is always priced from the current observation table.
  const tiers = SETUP_TIERS.map((tier) =>
    tierResult(tier, space, budget, active, candidates, style),
  );

  return {
    space: space.key,
    title: space.title,
    tagline: space.tagline,
    requestedBudget: budget,
    style: style.key,
    styleLabel: style.label,
    owned: {
      count: skipped.length,
      labels: skipped.map((s) => s.label),
      note: skipped.length
        ? "Those slots were removed and their budget share was spread across the remaining items."
        : null,
    },
    catalogueSize: candidates.length,
    tiers,
    generatedAt: new Date().toISOString(),
  };
}

export interface SetupCoverageSlot {
  key: string;
  label: string;
  phase: 1 | 2;
  matchingProducts: number;
  /** In-stock listings whose own verdict is not Avoid right now. */
  buyableProducts: number;
}

export interface SetupCoverage {
  space: SetupSpaceKey;
  title: string;
  slotsTotal: number;
  slotsReady: number;
  coveragePct: number;
  /** Slots that have at least one non-Avoid product to recommend. */
  slotsWithGoodDeal: number;
  slots: SetupCoverageSlot[];
}

/**
 * Honest health check: how much of each blueprint the catalogue can fill, and
 * how much of it is fillable at a price we would actually stand behind. Reads
 * the same candidate table the builder uses, so the two can never disagree.
 */
export async function getSetupCoverage(): Promise<{
  candidates: number;
  spaces: SetupCoverage[];
}> {
  const candidates = await loadCandidates();

  const spaces = Object.values(SETUP_SPACES).map((space) => {
    const slots = space.slots.map((slot) => {
      const matching = candidates.filter((c) => matchesSlot(c.haystack, slot));
      return {
        key: slot.key,
        label: slot.label,
        phase: slot.phase,
        matchingProducts: matching.length,
        buyableProducts: matching.filter((c) => c.verdict.verdict !== "AVOID").length,
      };
    });
    const ready = slots.filter((s) => s.matchingProducts > 0).length;
    const withDeal = slots.filter((s) => s.buyableProducts > 0).length;
    return {
      space: space.key,
      title: space.title,
      slotsTotal: slots.length,
      slotsReady: ready,
      coveragePct: slots.length ? Math.round((ready / slots.length) * 100) : 0,
      slotsWithGoodDeal: withDeal,
      slots,
    };
  });

  return { candidates: candidates.length, spaces };
}

export { SETUP_SPACES, SETUP_STYLES, SETUP_TIERS, getSetupTier };
