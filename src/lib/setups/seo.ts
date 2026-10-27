import { getSetupSpace, listSetupSpaces } from "./blueprints";

/**
 * Helpers for the indexable setup pages.
 *
 * A room guide lives at /setups/<space> for the room's own default budget, and
 * at /setups/<space>/<budget> for the two marketing variants around it. Keeping
 * the variant list here (instead of letting any number through) means the
 * sitemap advertises a finite, deliberately chosen set of pages rather than an
 * infinite crawl space of budgets.
 */

/** Round a budget to something a person would actually type into a search. */
export function roundBudget(value: number): number {
  if (value >= 100_000) return Math.round(value / 10_000) * 10_000;
  if (value >= 20_000) return Math.round(value / 5_000) * 5_000;
  if (value >= 5_000) return Math.round(value / 1_000) * 1_000;
  return Math.round(value / 100) * 100;
}

/** The budgets worth a page of their own: the default plus one down, one up. */
export function budgetVariants(spaceKey: string): number[] {
  const space = getSetupSpace(spaceKey);
  const d = space.budgetDefault;
  const wanted = new Set<number>([d, roundBudget(d * 0.6), roundBudget(d * 1.6)]);
  return [...wanted]
    .filter((b) => b >= space.budgetMin && b <= space.budgetMax)
    .sort((a, b) => a - b);
}

/** Canonical path for a room at a budget; the default budget has no number. */
export function setupHref(spaceKey: string, budget?: number | null): string {
  const space = getSetupSpace(spaceKey);
  if (!budget || budget === space.budgetDefault) return `/setups/${spaceKey}`;
  return `/setups/${spaceKey}/${budget}`;
}

/** Every setup guide URL, for the sitemap. */
export function setupGuidePaths(): string[] {
  const paths: string[] = [];
  for (const space of listSetupSpaces()) {
    for (const budget of budgetVariants(space.key)) {
      paths.push(setupHref(space.key, budget));
    }
  }
  return paths;
}
