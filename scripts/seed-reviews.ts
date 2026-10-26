/**
 * Backfill REAL customer reviews for products we already track.
 *
 *   npx tsx scripts/seed-reviews.ts --limit 60
 *   npx tsx scripts/seed-reviews.ts --merchant flipkart,myntra --limit 100
 *   npx tsx scripts/seed-reviews.ts --product <productId>
 *
 * One store page is read per product. Nothing is invented: if a store page
 * exposes no written review text, the product is simply skipped.
 *
 * Defaults favour fast, reliable stores (Flipkart, Myntra, TataCliQ, Nykaa,
 * FirstCry, AJIO, Biba, Libas, Reliance Digital). Amazon is slower and more
 * likely to block a plain request, so at most a handful are attempted unless
 * you ask for more with --amazon N.
 */
import "./env";
import { ensureSchema, db } from "../src/lib/db/client";
import { listings, products, reviews } from "../src/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { upsertReviews } from "../src/lib/db/queries";
import { fetchReviewsForListing } from "../src/lib/merchants/reviewsFetch";
import { closePlaywright } from "../src/lib/merchants/http";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? (args[i + 1] ?? "") : null;
}

const FAST_MERCHANTS = [
  "flipkart",
  "myntra",
  "tatacliq",
  "nykaa",
  "firstcry",
  "ajio",
  "biba",
  "libas",
  "reliancedigital",
];

async function main() {
  await ensureSchema();

  const limit = Number(arg("limit")) || 60;
  const amazonCap = Number(arg("amazon")) || 6;
  const onlyProduct = arg("product");
  const requested = (arg("merchant") ?? "")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  const allowed = requested.length ? new Set(requested) : null;

  const rows = await db
    .select({
      listingId: listings.id,
      productId: listings.productId,
      url: listings.url,
      merchant: listings.merchant,
      reviewCount: listings.reviewCount,
      title: products.title,
    })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(isNotNull(listings.price));

  const existing = await db
    .select({ listingId: reviews.listingId })
    .from(reviews);
  const perListing = new Map<string, number>();
  for (const r of existing) {
    perListing.set(r.listingId, (perListing.get(r.listingId) ?? 0) + 1);
  }

  // One candidate page per product: the listing with the most ratings,
  // preferring stores whose pages are quick and open.
  type Candidate = {
    listingId: string;
    productId: string;
    url: string;
    merchant: string;
    reviewCount: number;
    title: string;
  };
  const byProduct = new Map<string, Candidate[]>();
  for (const r of rows) {
    if (onlyProduct && r.productId !== onlyProduct) continue;
    if (allowed && !allowed.has(r.merchant.toLowerCase())) continue;
    if ((perListing.get(r.listingId) ?? 0) > 0) continue;
    const list = byProduct.get(r.productId) ?? [];
    list.push({
      listingId: r.listingId,
      productId: r.productId,
      url: r.url,
      merchant: r.merchant.toLowerCase(),
      reviewCount: r.reviewCount ?? 0,
      title: r.title,
    });
    byProduct.set(r.productId, list);
  }

  const priority = (m: string) => {
    const i = FAST_MERCHANTS.indexOf(m);
    return i === -1 ? (m === "amazon" ? 99 : 50) : i;
  };

  const candidates: Candidate[] = [];
  for (const list of byProduct.values()) {
    list.sort(
      (a, b) => priority(a.merchant) - priority(b.merchant) || b.reviewCount - a.reviewCount,
    );
    const pick = list[0];
    if (!onlyProduct && pick.reviewCount <= 0) continue; // only rated products by default
    candidates.push(pick);
  }

  candidates.sort(
    (a, b) => priority(a.merchant) - priority(b.merchant) || b.reviewCount - a.reviewCount,
  );

  let amazonAttempts = 0;
  const shortlist: Candidate[] = [];
  for (const c of candidates) {
    if (shortlist.length >= limit) break;
    if (c.merchant === "amazon") {
      if (amazonAttempts >= amazonCap) continue;
      amazonAttempts++;
    }
    shortlist.push(c);
  }

  console.log(
    `reading store pages for ${shortlist.length} products ` +
      `(${shortlist.filter((c) => c.merchant !== "amazon").length} fast-store, ` +
      `${shortlist.filter((c) => c.merchant === "amazon").length} Amazon)\n`,
  );

  let totalReviews = 0;
  let withReviews = 0;
  let attempted = 0;

  for (const [i, c] of shortlist.entries()) {
    attempted++;
    try {
      const harvest = await fetchReviewsForListing(c.merchant, c.url);
      const found = harvest.reviews.length;
      if (found) {
        const added = await upsertReviews(
          c.listingId,
          harvest.reviews.map((v) => ({
            author: v.author,
            stars: v.stars,
            title: v.title,
            body: v.body,
            reviewedAt: v.date,
            verified: v.verified,
            variant: v.variant,
            helpful: v.helpful,
            source: `store:${c.merchant}`,
          })),
        );
        totalReviews += found;
        withReviews++;
        console.log(
          `  ${String(i + 1).padStart(3)} ${String(found).padStart(3)} rev (+${added} new) ` +
            `${c.merchant.padEnd(15)} ${c.title.slice(0, 44)}`,
        );
      } else {
        console.log(
          `  ${String(i + 1).padStart(3)}   0 rev ${harvest.reachable ? "no text" : "unreachable"} ` +
            `${c.merchant.padEnd(15)} ${c.title.slice(0, 44)}`,
        );
      }
    } catch (e) {
      console.log(
        `  ${String(i + 1).padStart(3)}  ERR  ${c.merchant.padEnd(15)} ${(e as Error).message.slice(0, 48)}`,
      );
    }

    await sleep(c.merchant === "amazon" ? 2500 : 1200);
  }

  console.log(
    `\n${withReviews}/${attempted} store pages had written reviews — ` +
      `${totalReviews} real reviews read and stored.`,
  );
  await closePlaywright();
}

main().then(() => process.exit(0));
