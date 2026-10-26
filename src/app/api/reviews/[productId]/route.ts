import { NextResponse } from "next/server";
import { getListingsByProduct, getReviewsForListing, upsertReviews } from "@/lib/db/queries";
import { fetchReviewsForListing } from "@/lib/merchants/reviewsFetch";
import { closePlaywright } from "@/lib/merchants/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A tiny in-process guard so one product page cannot be hammered. This is a
 * best-effort throttle, not a security boundary: the endpoint only reads
 * public store pages and caches what it finds.
 */
const recent = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000;

export async function POST(_req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  if (!productId) return NextResponse.json({ ok: false, error: "Missing product" }, { status: 400 });

  const last = recent.get(productId);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return NextResponse.json({
      ok: true,
      added: 0,
      checked: 0,
      cooldown: true,
      message: "We checked this store a moment ago. Try again in a few minutes.",
    });
  }
  recent.set(productId, Date.now());

  const listings = await getListingsByProduct(productId);
  if (!listings.length) {
    return NextResponse.json({ ok: false, error: "Unknown product" }, { status: 404 });
  }

  // Prefer the listing the store shows most ratings for, but try at most three.
  const withCounts = await Promise.all(
    listings.map(async (listing) => ({
      listing,
      existing: (await getReviewsForListing(listing.id)).length,
    })),
  );
  const candidates = withCounts
    .filter((c) => c.existing === 0 && c.listing.url)
    .sort((a, b) => (b.listing.reviewCount ?? 0) - (a.listing.reviewCount ?? 0))
    .slice(0, 3);

  if (!candidates.length) {
    return NextResponse.json({
      ok: true,
      added: 0,
      checked: 0,
      message: "We already hold the reviews this store publishes.",
    });
  }

  let added = 0;
  let checked = 0;
  let reachable = false;
  const merchants: string[] = [];

  try {
    for (const { listing } of candidates) {
      checked++;
      const harvest = await fetchReviewsForListing(listing.merchant, listing.url);
      if (harvest.reachable) reachable = true;
      if (!harvest.reviews.length) continue;
      merchants.push(listing.merchant);
      added += await upsertReviews(
        listing.id,
        harvest.reviews.map((r) => ({
          author: r.author,
          stars: r.stars,
          title: r.title,
          body: r.body,
          reviewedAt: r.date,
          verified: r.verified,
          variant: r.variant,
          helpful: r.helpful,
          source: `store:${listing.merchant}`,
        })),
      );
    }
  } finally {
    await closePlaywright();
  }

  return NextResponse.json({
    ok: true,
    added,
    checked,
    reachable,
    merchants: Array.from(new Set(merchants)),
    message:
      added > 0
        ? `Added ${added} real review${added === 1 ? "" : "s"} from the store.`
        : reachable
          ? "The store page is reachable but does not publish written review text."
          : "We could not reach the store page just now. Try again later.",
  });
}
