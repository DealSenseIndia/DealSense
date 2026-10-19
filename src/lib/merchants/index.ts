import type { ExtractedProduct } from "../types";
import { extractAmazon } from "./amazon";
import { extractFlipkart } from "./flipkart";
import { extractFlipkartFromApi, fetchFlipkartJson, toPageUri } from "./flipkartApi";
import { expandUrl, fetchCandidates, looksBlocked } from "./http";
import { detectMerchant, parseMerchantUrl, stripTracking, type ResolvedUrl } from "./resolve";

export * from "./resolve";

export interface FetchOutcome {
  ok: boolean;
  status:
    | "SUCCESS"
    | "UNSUPPORTED_MERCHANT"
    | "INVALID_URL"
    | "BLOCKED"
    | "NETWORK_ERROR"
    | "EXTRACTION_FAILED_UNPRICED";
  resolved?: ResolvedUrl;
  product?: ExtractedProduct;
  message?: string;
}

/**
 * Full pipeline: resolve → fetch (escalating providers) → extract.
 * Returns the first candidate that yields a REAL price. Never fabricates one.
 */
export async function fetchProduct(rawUrl: string): Promise<FetchOutcome> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let resolved = parseMerchantUrl(url);

  // Expand shortlinks (amzn.to, fkrt.it) when we cannot parse an id directly.
  if (!resolved || resolved.isShortlink) {
    const expanded = await expandUrl(url);
    const fromExpanded = parseMerchantUrl(expanded);
    if (fromExpanded) {
      resolved = fromExpanded;
      url = stripTracking(expanded);
    }
  }

  if (!resolved) {
    const merchant = detectMerchant(url);
    return {
      ok: false,
      status: merchant ? "INVALID_URL" : "UNSUPPORTED_MERCHANT",
      message: merchant
        ? "Could not find a product id in that link."
        : "Only Amazon.in and Flipkart links are supported right now.",
    };
  }

  let best: ExtractedProduct | null = null;
  let sawContent = false;
  let sawBlocked = false;

  // Flipkart: its own page API is the most reliable free source (no proxy needed).
  if (resolved.merchant === "flipkart") {
    const pageUri = toPageUri(url) ?? toPageUri(resolved.canonicalUrl);
    if (pageUri) {
      const json = await fetchFlipkartJson(pageUri);
      if (json) {
        const product = extractFlipkartFromApi(json, resolved.merchantProductId, resolved.canonicalUrl);
        if (product.price !== null) {
          return { ok: true, status: "SUCCESS", resolved, product };
        }
        best = product;
      }
    }
  }

  for await (const candidate of fetchCandidates(resolved.canonicalUrl)) {
    if (looksBlocked(candidate.content)) {
      sawBlocked = true;
      continue;
    }
    sawContent = true;

    const product =
      resolved.merchant === "amazon"
        ? extractAmazon(candidate, resolved.merchantProductId, resolved.canonicalUrl)
        : extractFlipkart(candidate, resolved.merchantProductId, resolved.canonicalUrl);

    if (product.price !== null) {
      return { ok: true, status: "SUCCESS", resolved, product };
    }
    if (!best || (product.title.length > (best.title.length ?? 0) && !product.title.startsWith("Flipkart product") && !product.title.startsWith("Amazon product"))) {
      best = product;
    }
  }

  if (best) {
    return {
      ok: false,
      status: "EXTRACTION_FAILED_UNPRICED",
      resolved,
      product: best,
      message:
        "We reached the product page but could not verify a live price (it may be out of stock, or the store served a stripped page).",
    };
  }

  return {
    ok: false,
    status: sawBlocked || !sawContent ? "BLOCKED" : "NETWORK_ERROR",
    resolved,
    message: sawBlocked
      ? "The store blocked our request. Configure a free scraping key (see README) for reliable prices."
      : "Could not reach the merchant.",
  };
}
