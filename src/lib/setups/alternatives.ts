import type { Verdict } from "../types";

/**
 * Runner-up selection for a filled slot.
 *
 * Deliberately separate from the engine and free of database access so the
 * rules can be tested directly:
 *   • only candidates from the exact pool the pick came from are eligible;
 *   • listings already used anywhere in the build are never offered twice;
 *   • an Avoid-rated candidate is never offered as an "option" — a slot whose
 *     only candidates are Avoid has no alternatives, and the UI says so;
 *   • order is the engine's own rank (score, then price, then listing id).
 */

export interface AlternativeCandidate {
  listingId: string;
  verdict: { verdict: Verdict };
}

export const MAX_ALTERNATIVES = 3;

/** Same product name, even from two listings, is one option to a reader. */
export function alternativeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

export function selectAlternatives<T extends AlternativeCandidate>(
  ranked: { score: number; candidate: T }[],
  exclude: Set<string>,
  limit = MAX_ALTERNATIVES,
  keyOf?: (candidate: T) => string,
  seedKeys?: Iterable<string>,
): T[] {
  const out: T[] = [];
  const seen = new Set(seedKeys ?? []);
  for (const entry of ranked) {
    if (out.length >= limit) break;
    const candidate = entry.candidate;
    if (exclude.has(candidate.listingId)) continue;
    if (candidate.verdict.verdict === "AVOID") continue;
    if (keyOf) {
      const key = keyOf(candidate);
      if (!key || seen.has(key)) continue;
      seen.add(key);
    }
    out.push(candidate);
  }
  return out;
}
