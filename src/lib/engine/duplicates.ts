/**
 * A queued listing can resolve to a different listing row: the URL was stored
 * with one case of a case-insensitive merchant id, and the extractor returns
 * the canonical case. The queued row would otherwise stay due forever.
 */
export const DUPLICATE_PARK_MS = 30 * 24 * 60 * 60 * 1000;

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
