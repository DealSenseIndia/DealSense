import type { StoreReview } from "./reviews";
import { extractStoreReviews } from "./reviews";
import { fetchPage } from "./http";
import { fetchProduct } from "./index";

export interface ReviewHarvest {
  /** Real reviews read off the store's page. Never synthesised. */
  reviews: StoreReview[];
  /** Which fetch path produced the page, for logging only. */
  via: string;
  /** The page was reachable but this store exposes no written reviews. */
  reachable: boolean;
}

/**
 * Read the written reviews a store publishes on one product page.
 *
 * Amazon needs the full fetch pipeline (it blocks plain requests often);
 * every other store is read from a single page candidate, which is fast and
 * free. Returns an empty list rather than inventing anything.
 */
export async function fetchReviewsForListing(
  merchant: string,
  url: string,
): Promise<ReviewHarvest> {
  if (merchant === "amazon") {
    const out = await fetchProduct(url);
    return {
      reviews: out.product?.reviews ?? [],
      via: out.product?.extractionMethod ?? "amazon",
      reachable: Boolean(out.product),
    };
  }

  const page = await fetchPage(url);
  if (!page) return { reviews: [], via: "none", reachable: false };

  let reviews: StoreReview[] = [];
  try {
    reviews = extractStoreReviews(merchant, page.content);
  } catch {
    reviews = [];
  }
  return { reviews, via: page.via, reachable: true };
}
