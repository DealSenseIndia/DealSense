import type { SetupAlternative, SetupItem, SetupTierResult } from "./engine";
import {
  detectMemoryGen,
  detectPlatform,
  hasIntegratedGraphics,
  memoryGensForPlatform,
  platformsCompatible,
} from "./compat";

/**
 * Reader-driven substitutions.
 *
 * A swap only ever exchanges one engine pick for one of that slot's own
 * runner-ups — no arbitrary listing can be injected. Before it is accepted the
 * build is re-checked for the two facts that make a PC a PC: the socket must
 * match the board, and the memory generation must match what the board (or the
 * processor, when no board was priced) can take. The totals are recomputed from
 * the real prices that remain, never estimated.
 */

export interface SwapRejection {
  slotKey: string;
  reason: string;
}

export interface ApplySwapsResult {
  tier: SetupTierResult;
  customized: boolean;
  /** The swaps that actually took effect, in slot order. */
  applied: Record<string, string>;
  rejected: SwapRejection[];
}

type PartLike = Pick<SetupItem, "slotKey" | "title" | "brand">;

function textOf(part: PartLike): string {
  return `${part.title} ${part.brand ?? ""}`;
}

function platformLabel(value: string | null): string {
  return value ? value.toUpperCase() : "an unknown socket";
}

/**
 * One honest sentence when the incoming part would break the build, or null
 * when it fits. Unknown sockets/generations are treated as compatible, exactly
 * as the builder itself does: absence of a claim is not evidence of a clash.
 */
export function swapCompatibilityError(
  slotKey: string,
  incoming: PartLike,
  others: PartLike[],
): string | null {
  const cpu = others.find((i) => i.slotKey === "cpu") ?? null;
  const board = others.find((i) => i.slotKey === "motherboard") ?? null;
  const ram = others.find((i) => i.slotKey === "ram") ?? null;

  const incomingPlatform = detectPlatform(textOf(incoming));
  const incomingMemory = detectMemoryGen(textOf(incoming));

  if (slotKey === "cpu") {
    if (
      board &&
      !platformsCompatible(incomingPlatform, detectPlatform(textOf(board)))
    ) {
      return `That processor is ${platformLabel(
        incomingPlatform,
      )}, and the motherboard in this build is ${platformLabel(
        detectPlatform(textOf(board)),
      )}.`;
    }
    // The socket itself dictates the memory generation. When the board's
    // platform is unreadable, the board's own "DDR4" blurb is the fallback —
    // but it can never override the processor's requirement (an AM5 chip in a
    // DDR4 build is a mismatch even if a no-name board says DDR4).
    const cpuMemory = memoryGensForPlatform(incomingPlatform);
    const boardMemory = board ? detectMemoryGen(textOf(board)) : null;
    const allowed = cpuMemory ?? (boardMemory ? [boardMemory] : null);
    if (ram && allowed) {
      const ramMemory = detectMemoryGen(textOf(ram));
      if (ramMemory && !allowed.includes(ramMemory)) {
        return `That processor takes ${allowed
          .map((g) => g.toUpperCase())
          .join("/")} memory, and the build has a ${ramMemory.toUpperCase()} kit.`;
      }
    }
    if (!others.some((i) => i.slotKey === "gpu") && !hasIntegratedGraphics(textOf(incoming))) {
      return "That processor has no integrated graphics, and this build has no graphics card.";
    }
    return null;
  }

  if (slotKey === "motherboard") {
    if (
      cpu &&
      !platformsCompatible(incomingPlatform, detectPlatform(textOf(cpu)))
    ) {
      return `That motherboard is ${platformLabel(
        incomingPlatform,
      )}, and the processor in this build is ${platformLabel(
        detectPlatform(textOf(cpu)),
      )}.`;
    }
    if (ram && incomingMemory) {
      const ramMemory = detectMemoryGen(textOf(ram));
      if (ramMemory && ramMemory !== incomingMemory) {
        return `That motherboard takes ${incomingMemory.toUpperCase()} memory, and the build has a ${ramMemory.toUpperCase()} kit.`;
      }
    }
    return null;
  }

  if (slotKey === "ram") {
    const boardMemory = board ? detectMemoryGen(textOf(board)) : null;
    if (boardMemory) {
      if (incomingMemory && incomingMemory !== boardMemory) {
        return `That memory is ${incomingMemory.toUpperCase()}, and the motherboard in this build takes ${boardMemory.toUpperCase()}.`;
      }
      return null;
    }
    if (cpu) {
      const allowed = memoryGensForPlatform(detectPlatform(textOf(cpu)));
      if (allowed && incomingMemory && !allowed.includes(incomingMemory)) {
        return `That memory is ${incomingMemory.toUpperCase()}, and the processor in this build takes ${allowed
          .map((g) => g.toUpperCase())
          .join("/")}.`;
      }
    }
    return null;
  }

  return null;
}

function alternativeToItem(base: SetupItem, alt: SetupAlternative): SetupItem {
  return {
    ...base,
    listingId: alt.listingId,
    productId: alt.productId,
    slug: alt.slug,
    title: alt.title,
    brand: alt.brand,
    imageUrl: alt.imageUrl,
    merchant: alt.merchant,
    merchantName: alt.merchantName,
    price: alt.price,
    mrp: alt.mrp,
    discountPct: alt.discountPct,
    verdict: alt.verdict,
    score: alt.score,
    confidence: alt.confidence,
    verdictReason: alt.verdictReason,
    // A runner-up is not a forced bad pick: it passed the Avoid filter.
    priceCaution: null,
    observationCount: alt.observationCount,
    sufficientHistory: alt.sufficientHistory,
    observedAt: alt.observedAt,
    historicalLow: alt.historicalLow,
    historicalMedian: alt.historicalMedian,
    selectionScore: alt.selectionScore,
    affiliateUrl: alt.affiliateUrl,
    spark: alt.spark,
  };
}

/**
 * Recompute everything the summary shows from the items that remain. The
 * scoring formula is the builder's own, so a customised build is judged by the
 * same rules as the default one.
 */
export function recomputeTier(
  base: SetupTierResult,
  items: SetupItem[],
  requestedBudget: number,
): SetupTierResult {
  const totalPrice = items.reduce((sum, i) => sum + i.price, 0);
  const mrpItems = items.filter((i) => i.mrp && i.mrp > i.price);
  const totalMrp = mrpItems.length
    ? mrpItems.reduce((sum, i) => sum + (i.mrp ?? 0), 0)
    : null;
  const savingsVsMrp = totalMrp
    ? Math.round(mrpItems.reduce((sum, i) => sum + ((i.mrp ?? 0) - i.price), 0))
    : null;

  const essentialTotal = base.completeness.essentialTotal;
  const essentialFilled = items.filter((i) => i.phase === 1).length;
  const coverage = essentialTotal ? essentialFilled / essentialTotal : 1;
  const budgetFit =
    requestedBudget > 0
      ? totalPrice <= requestedBudget
        ? 1
        : Math.max(0, 1 - (totalPrice - requestedBudget) / requestedBudget)
      : 0;
  const withHistory = items.filter((i) => i.sufficientHistory);
  const evidence = items.length ? withHistory.length / items.length : 0;
  const dealQuality = withHistory.length
    ? withHistory.reduce((sum, i) => sum + (i.score ?? 50), 0) / withHistory.length / 100
    : 0;
  const setupScore = items.length
    ? Math.round(40 * coverage + 20 * budgetFit + 20 * evidence + 20 * dealQuality)
    : null;

  return {
    ...base,
    items,
    totalPrice: Math.round(totalPrice),
    totalMrp,
    savingsVsMrp,
    budgetRemaining: Math.round(requestedBudget - totalPrice),
    phase1Total: Math.round(
      items.filter((i) => i.phase === 1).reduce((sum, i) => sum + i.price, 0),
    ),
    phase2Total: Math.round(
      items.filter((i) => i.phase === 2).reduce((sum, i) => sum + i.price, 0),
    ),
    storeCount: new Set(items.map((i) => i.merchant)).size,
    cautionCount: items.filter((i) => i.priceCaution).length,
    setupScore,
    scoreBreakdown: items.length
      ? {
          coverage: Number(coverage.toFixed(3)),
          budgetFit: Number(budgetFit.toFixed(3)),
          priceEvidence: Number(evidence.toFixed(3)),
          dealQuality: Number(dealQuality.toFixed(3)),
          note: `${essentialFilled}/${essentialTotal} essentials filled · ${withHistory.length}/${items.length} items have enough recorded history for a confident verdict.`,
        }
      : null,
    completeness: {
      slotsTotal: base.completeness.slotsTotal,
      filled: items.length,
      essentialTotal,
      essentialFilled,
      withHistory: withHistory.length,
    },
  };
}

/**
 * Apply every requested swap in slot order. Invalid swaps are skipped and
 * reported individually; valid ones still apply, so one stale choice cannot
 * poison the rest of the build.
 */
export function applySwaps(
  original: SetupTierResult,
  swaps: Record<string, string>,
  requestedBudget: number,
): ApplySwapsResult {
  const items = original.items.map((i) => ({ ...i }));
  const applied: Record<string, string> = {};
  const rejected: SwapRejection[] = [];

  for (const item of items) {
    const target = swaps[item.slotKey];
    if (!target || target === item.listingId) continue;

    const alt = original.items
      .find((i) => i.slotKey === item.slotKey)
      ?.alternatives.find((a) => a.listingId === target);
    if (!alt) {
      rejected.push({
        slotKey: item.slotKey,
        reason: "That listing is not one of this slot's tracked alternatives.",
      });
      continue;
    }
    if (items.some((i) => i.slotKey !== item.slotKey && i.listingId === target)) {
      rejected.push({
        slotKey: item.slotKey,
        reason: "That listing is already used in another slot of this build.",
      });
      continue;
    }

    const incoming = alternativeToItem(item, alt);
    const others = items.filter((i) => i.slotKey !== item.slotKey);
    const error = swapCompatibilityError(item.slotKey, incoming, others);
    if (error) {
      rejected.push({ slotKey: item.slotKey, reason: error });
      continue;
    }

    Object.assign(item, incoming);
    applied[item.slotKey] = target;
  }

  return {
    tier: recomputeTier(original, items, requestedBudget),
    customized: Object.keys(applied).length > 0,
    applied,
    rejected,
  };
}
