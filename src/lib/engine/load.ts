import { type Merchant } from "../config";
import type { AnalysisResult } from "../types";
import { getListingsByProduct, getObservations, getProductById, getProductBySlug } from "../db/queries";
import type { ListingRow, ProductRow } from "../db/queries";
import { goPath } from "../affiliate";
import { buildBundle, findRivalListing } from "./bundle";
import { buildIdentityKey } from "./identity";

/** Build a full analysis result from stored data (used by SSR product pages). */
export async function buildResultForListing(
  product: ProductRow,
  listing: ListingRow,
): Promise<AnalysisResult> {
  const merchant = listing.merchant as Merchant;
  const rivalListing = await findRivalListing(product, listing);
  const { bundle, verdict, landed, rival, points, rivalPoints } = await buildBundle({
    product,
    listing,
    rivalListing,
  });

  return {
    ok: true,
    status: "SUCCESS",
    product: {
      id: product.id,
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl,
      images: safeParseArray(product.images),
    },
    listing: {
      id: listing.id,
      merchant,
      merchantProductId: listing.merchantProductId,
      url: listing.url,
      title: listing.title,
      price: listing.price,
      mrp: listing.mrp,
      inStock: listing.inStock,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      seller: listing.seller,
      imageUrl: listing.imageUrl,
      affiliateUrl: goPath(listing.id, "pdp"),
      lastCheckedAt: listing.lastCheckedAt,
    },
    rival,
    landed,
    verdict,
    history: { primary: points, rival: rivalPoints },
    bundle,
  };
}

function safeParseArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function loadAnalysisBySlug(slug: string): Promise<AnalysisResult | null> {
  const product = await getProductBySlug(slug);
  if (!product) return null;
  const siblings = await getListingsByProduct(product.id);
  if (!siblings.length) return null;
  const primary = [...siblings].sort((a, b) => (b.lastCheckedAt ?? 0) - (a.lastCheckedAt ?? 0))[0];
  return buildResultForListing(product, primary);
}

export async function loadAnalysisByListingId(listingId: string): Promise<AnalysisResult | null> {
  const { getListingById } = await import("../db/queries");
  const listing = await getListingById(listingId);
  if (!listing) return null;
  const product = await getProductById(listing.productId);
  if (!product) return null;
  return buildResultForListing(product, listing);
}

export { buildIdentityKey, getObservations };
