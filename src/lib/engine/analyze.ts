import { affiliate, MIN_OBSERVATIONS_FOR_SCORE, type Merchant } from "../config";
import type { AnalysisResult, LandedPrice, VerdictResult } from "../types";
import {
  addObservation,
  countObservations,
  findProductByIdentityKey,
  getLatestObservation,
  getListingByMerchantProduct,
  getListingsByProduct,
  getObservations,
  getProductById,
  getProductBySlug,
  recordEvent,
  uid,
  updateListingState,
  upsertListing,
  upsertProduct,
  upsertReviews,
} from "../db/queries";
import { buildIdentityKey, sameVariant } from "./identity";
import { buildBundle, findRivalListing } from "./bundle";
import { computeLandedPrice } from "./landedPrice";
import { computeStats, priceSeries } from "./stats";
import { evaluateDeal } from "./verdict";
import { affiliateUrl } from "../merchants/resolve";
import { goPath } from "../affiliate";
import { fetchProduct } from "../merchants";
import { slugify } from "../utils";

const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
const MIN_SPACING_MS = 5 * 60 * 1000;

async function uniqueSlug(title: string, identityKey: string): Promise<string> {
  const base = slugify(title) || "product";
  const existing = await getProductBySlug(base);
  if (!existing) return base;
  if (existing.identityKey === identityKey) return base;
  return `${base}-${identityKey.slice(0, 6)}`;
}

/**
 * The canonical DealSense analysis: URL → resolve → extract → observe →
 * score → verdict. This is the one and only ingestion path.
 */
export async function analyzeUrl(rawUrl: string): Promise<AnalysisResult> {
  const empty: AnalysisResult = {
    ok: false,
    status: "INVALID_URL",
    product: null,
    listing: null,
    rival: null,
    landed: null,
    verdict: null,
    history: { primary: [], rival: [] },
  };

  const outcome = await fetchProduct(rawUrl);
  if (!outcome.ok || !outcome.product || !outcome.resolved) {
    return {
      ...empty,
      status: outcome.status,
      message: outcome.message,
      product: outcome.product
        ? {
            id: "",
            slug: "",
            title: outcome.product.title,
            brand: outcome.product.brand,
            category: outcome.product.category,
            imageUrl: outcome.product.imageUrl,
            images: outcome.product.images,
          }
        : null,
    };
  }

  const p = outcome.product;
  const merchant: Merchant = p.merchant;
  const identityKey = buildIdentityKey(p.title);

  // 1) Canonical product.
  //    If we already track this exact store product, reuse the product that
  //    owns that listing — never create a second row for the same item
  //    (that used to orphan products and split their price history).
  const existingListing = await getListingByMerchantProduct(merchant, p.merchantProductId);
  const owner = existingListing ? await getProductById(existingListing.productId) : null;

  let product = owner ?? (await findProductByIdentityKey(identityKey));

  if (product) {
    product = await upsertProduct({
      slug: product.slug,
      title: product.title,
      brand: product.brand,
      category: product.category,
      imageUrl: product.imageUrl ?? p.imageUrl,
      images: p.images,
      identityKey,
    });
  } else {
    const slug = await uniqueSlug(p.title, identityKey);
    product = await upsertProduct({
      slug,
      title: p.title,
      brand: p.brand,
      category: p.category,
      imageUrl: p.imageUrl,
      images: p.images,
      identityKey,
    });
  }

  // 2) Store-specific listing.
  const listing = await upsertListing({
    productId: product.id,
    merchant,
    merchantProductId: p.merchantProductId,
    url: p.url,
    title: p.title,
    price: p.price,
    mrp: p.mrp,
    inStock: p.inStock,
    seller: p.seller,
    rating: p.rating,
    reviewCount: p.reviewCount,
    imageUrl: p.imageUrl,
    shipping: p.shipping,
  });

  // 3) Observation — only from a verified price, with honest dedupe.
  const latest = await getLatestObservation(listing.id);
  const ts = Date.now();  if (p.price !== null) {
    const obsCount = await countObservations(listing.id);
    const priceChanged = !latest || latest.price !== p.price;
    const sinceLast = latest ? ts - latest.observedAt : Number.POSITIVE_INFINITY;
    const stale = sinceLast >= HEARTBEAT_MS;
    // Bootstrap: record a few early points so a verdict can form quickly,
    // without spamming identical rows on rapid re-checks.
    const bootstrap = obsCount < MIN_OBSERVATIONS_FOR_SCORE && sinceLast >= MIN_SPACING_MS;

    if (priceChanged || stale || bootstrap) {
      await addObservation({
        listingId: listing.id,
        price: p.price,
        mrp: p.mrp,
        shipping: p.shipping,
        seller: p.seller,
        rating: p.rating,
        reviewCount: p.reviewCount,
        inStock: p.inStock,
        source: priceChanged ? "live_extraction" : "live_heartbeat",
        observedAt: ts,
      });
    }
  }

  // 4) Reviews — real ones, read off the store's own product page.
  if (p.reviews?.length) {
    try {
      await upsertReviews(
        listing.id,
        p.reviews.map((r) => ({
          author: r.author,
          stars: r.stars,
          title: r.title,
          body: r.body,
          reviewedAt: r.date,
          verified: r.verified,
          variant: r.variant,
          helpful: r.helpful,
        })),
      );
    } catch {
      /* reviews are a bonus — never fail the analysis over them */
    }
  }

  // 5) Next refresh.
  const nextCheckAt = ts + (p.price !== null ? 10 * 60 * 60 * 1000 : 30 * 60 * 1000);
  await updateListingState(listing.id, {
    lastCheckedAt: ts,
    nextCheckAt,
    failureCount: 0,
    lastError: null,
  });

  // 5) History + verdict. The bundle's verdict uses the merged history
  //    (our observations + any imported provider series), so it is the
  //    authoritative one.
  const rivalListing = await findRivalListing(product, listing);
  const { bundle, verdict, landed, rival, rivalPoints } = await buildBundle({
    product,
    listing,
    rivalListing,
  });

  await recordEvent("analyze", {
    merchant,
    productId: product.id,
    verdict: verdict?.verdict,
    score: verdict?.score,
  });

  // 6) Alert evaluation happens AFTER the observation is committed.
  //    Failures here must never affect the analysis response.
  try {
    const { evaluateAlerts } = await import("./alerts");
    if (verdict && landed) {
      await evaluateAlerts({
        listingId: listing.id,
        productId: product.id,
        productTitle: product.title,
        merchant,
        effectivePrice: landed.effective,
        verdict: verdict.verdict,
        confidence: verdict.confidence,
        score: verdict.score,
        reasons: verdict.reasons,
        affiliateUrl: affiliateUrl(
          merchant,
          listing.url,
          affiliate.amazonTag,
          affiliate.cuelinksChannel,
        ),
        observedAt: ts,
      });
    }
  } catch {
    /* alert delivery is best-effort */
  }

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
      images: p.images,
    },
    listing: {
      id: listing.id,
      merchant,
      merchantProductId: p.merchantProductId,
      url: listing.url,
      title: p.title,
      price: p.price,
      mrp: p.mrp,
      inStock: p.inStock,
      rating: p.rating,
      reviewCount: p.reviewCount,
      seller: p.seller,
      imageUrl: p.imageUrl,
      affiliateUrl: goPath(listing.id, "analyze"),
      lastCheckedAt: ts,
    },
    rival,
    landed,
    verdict,
    history: { primary: bundle.points, rival: rivalPoints },
    bundle,
  };
}

/** Re-observe an existing listing (used by the refresh worker + manual trigger). */
export async function observeListing(listingId: string): Promise<AnalysisResult> {
  const { getListingById } = await import("../db/queries");
  const listing = await getListingById(listingId);
  if (!listing) {
    return {
      ok: false,
      status: "LISTING_NOT_FOUND",
      product: null,
      listing: null,
      rival: null,
      landed: null,
      verdict: null,
      history: { primary: [], rival: [] },
      message: "Listing not found.",
    };
  }
  return analyzeUrl(listing.url);
}

export type { LandedPrice, VerdictResult };
export { uid };
