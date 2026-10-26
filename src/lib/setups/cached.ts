import { unstable_cache } from "next/cache";
import { buildSetup, type SetupBuildResult } from "./engine";

/**
 * The room builder is the most expensive read in the app: it loads the whole
 * candidate pool, then fills twenty slots at three budgets. The answer depends
 * only on these four inputs, so a short cache per combination turns a seven
 * second page into a sub-second one without ever showing a price older than
 * the two-hour sync window.
 *
 * Deliberately not imported by scripts/ — `next/cache` only exists inside the
 * Next server, and the import scripts call `buildSetup` directly.
 */
export const buildSetupCached = unstable_cache(
  async (
    space: string,
    budget: number,
    style: string,
    owned: string[],
  ): Promise<SetupBuildResult> => buildSetup({ space, budget, style, owned }),
  ["setup-build-v1"],
  { revalidate: 120 },
);
