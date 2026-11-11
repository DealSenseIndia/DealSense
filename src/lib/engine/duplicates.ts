/**
 * A queued listing can resolve to a different listing row: the URL was stored
 * with one case of a case-insensitive merchant id, and the extractor returns
 * the canonical case. The queued row would otherwise stay due forever.
 */
export const DUPLICATE_PARK_MS = 30 * 24 * 60 * 60 * 1000;

/** The stored marker for a parked case-variant twin. */
export const PARKED_DUPLICATE_PREFIX = "DUPLICATE:";

/**
 * The same rule the builder's read-side filter applies. SQLite's LIKE is
 * case-insensitive, so this predicate is too; the writer uses the uppercase
 * marker but older rows may not.
 */
export function isParkedDuplicate(lastError: string | null | undefined): boolean {
  return Boolean(
    lastError && lastError.trim().toUpperCase().startsWith(PARKED_DUPLICATE_PREFIX),
  );
}

export interface DuplicateParkPatch {
  nextCheckAt: number;
  failureCount: number;
  lastError: string;
}

export function duplicateParkPatch(
  queuedId: string,
  resolvedId: string | null | undefined,
  now = Date.now(),
): DuplicateParkPatch | null {
  if (!resolvedId || resolvedId === queuedId) return null;
  return {
    nextCheckAt: now + DUPLICATE_PARK_MS,
    failureCount: 0,
    lastError: `DUPLICATE: canonical listing ${resolvedId}`,
  };
}
