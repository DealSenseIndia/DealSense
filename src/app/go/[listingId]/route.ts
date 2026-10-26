import { NextResponse } from "next/server";
import { resolveAffiliateTarget } from "@/lib/affiliate";
import { getListingById, recordEvent } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Buy-button redirect. The listing id is resolved against our own database, so
 * this endpoint can never be used as an open redirect for arbitrary URLs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ listingId: string }> },
) {
  const { listingId } = await params;
  const url = new URL(request.url);
  const source = (url.searchParams.get("src") || "site").slice(0, 32);

  const listing = await getListingById(listingId).catch(() => null);
  if (!listing?.url) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const target = await resolveAffiliateTarget({
    url: listing.url,
    merchant: listing.merchant,
    listingId: listing.id,
    source,
  });

  void recordEvent("outbound_click", {
    listingId: listing.id,
    merchant: listing.merchant,
    source,
    via: target.via,
  });

  const response = NextResponse.redirect(target.url, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer-when-downgrade");
  return response;
}
