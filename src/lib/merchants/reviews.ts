import * as cheerio from "cheerio";

export interface StoreReview {
  /** Reviewer display name. */
  author: string | null;
  /** Star rating, 1-5. */
  stars: number | null;
  /** Review headline. */
  title: string | null;
  /** Review body text. */
  body: string | null;
  /** e.g. "14 October 2026" */
  date: string | null;
  /** The store marked it "Verified Purchase". */
  verified: boolean;
  /** Variation the buyer picked, e.g. "Size: 12GB + 256GB · Colour: Titanium Black". */
  variant: string | null;
  /** How many people found it helpful. */
  helpful: number | null;
}

/** First non-empty text under a selector, scoped to one element. */
function pick($: cheerio.CheerioAPI, root: unknown, sel: string): string | null {
  const t = $(root as never).find(sel).first().text().replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/** "Reviewed in India on 14 October 2026" -> "14 October 2026" */
function cleanDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw
    .replace(/^Reviewed\s+(in|on)\s*/i, "")
    .replace(/^India\s+(in|on)\s*/i, "")
    .replace(/^in\s+/i, "")
    .replace(/^on\s+/i, "")
    .trim();
  return d.length ? d : null;
}

const NOISE = /^(brief content visible|full content visible|read more|read less|read)$/i;

/**
 * Real customer reviews out of an Amazon product page.
 *
 * Nothing here is invented: every field comes out of the markup Amazon
 * rendered. If the page has no reviews we return an empty list.
 */
export function extractAmazonReviews(html: string): StoreReview[] {
  if (!html) return [];
  const $ = cheerio.load(html);

  const blocks = $('[data-hook="review"]').toArray();
  if (!blocks.length) return [];

  const out: StoreReview[] = [];

  for (const el of blocks) {
    const $b = $(el);

    // Stars: "5 out of 5 stars" (or an aria-label on the icon).
    const starText =
      $b.find('[data-hook="review-star-rating"]').first().text() ||
      $b.find('i[class*="a-star-"]').first().attr("aria-label") ||
      "";
    const starMatch = starText.match(/([0-5](?:\.[0-9])?)/);
    const stars = starMatch ? Number(starMatch[1]) : null;

    // Body: the peek/expand card holds the full text in a content div.
    const rawBody = pick($, el, '[data-hook="reviewText"] .a-cardui-content');
    const body = rawBody
      ? rawBody
          .replace(/Brief content visible[^.]*\./gi, "")
          .replace(/Full content visible[^.]*\./gi, "")
          .replace(/Read more$/i, "")
          .trim()
      : null;

    const title = pick($, el, '[data-hook="reviewTitle"]') ?? pick($, el, "h5");

    const author =
      pick($, el, ".a-profile-name") ?? pick($, el, '[data-hook="review-author"]');

    const date = cleanDate(pick($, el, '[data-hook="review-date"]'));

    // Variant: "Size: 12GB + 256GB", "Colour: Titanium Silverblue"
    // Amazon renders the strip twice (collapsed + expanded), so dedupe.
    const variantLines: string[] = [];
    $b.find('[data-hook="format-strip"] .a-size-base.a-color-secondary').each((_, n) => {
      const t = $(n).text().replace(/\s+/g, " ").trim();
      if (t && t.length < 120 && !NOISE.test(t) && !variantLines.includes(t)) {
        variantLines.push(t);
      }
    });
    const variant = variantLines.length ? variantLines.join(" · ") : null;

    const verified = $b.find('[data-hook="avp-badge"]').length > 0;

    const helpfulText = pick($, el, '[data-hook="helpful-vote-statement"]');
    const helpful = helpfulText ? Number(helpfulText.replace(/[^\d]/g, "")) || null : null;

    if (!stars && !body && !title) continue;

    out.push({
      author,
      stars,
      title,
      body: body && body.length > 1 ? body : null,
      date,
      verified,
      variant,
      helpful,
    });
  }

  return out;
}

/** Flipkart product pages carry ratings but rarely review text. */
export function extractFlipkartReviews(html: string): StoreReview[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const out: StoreReview[] = [];

  $('[class*="review"]').each((_, el) => {
    const body = $(el).text().replace(/\s+/g, " ").trim();
    if (body.length < 25 || body.length > 1200) return;
    if (!/[a-z]{12,}\s+[a-z]{12,}/i.test(body)) return; // must contain prose
    const ratingMatch = body.match(/\b([1-5](?:\.\d)?)\s*(?:star|rating|★)/i);
    out.push({
      author: null,
      stars: ratingMatch ? Number(ratingMatch[1]) : null,
      title: null,
      body,
      date: null,
      verified: false,
      variant: null,
      helpful: null,
    });
  });

  return out.slice(0, 20);
}
