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

/**
 * Turn whatever date format a store gives us into the one we display.
 * ISO dates and epoch timestamps become "26 October 2026"; dates that are
 * already human-readable are left as they are.
 */
export function formatReviewDate(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;

  let date: Date | null = null;
  if (/^\d{10,13}$/.test(value)) {
    const n = Number(value);
    date = new Date(value.length === 10 ? n * 1000 : n);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    date = new Date(value.slice(0, 10));
  }
  if (!date || Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** A review node as it appears inside a store's JSON-LD payload. */
type JsonLdNode = Record<string, unknown>;

function asNode(value: unknown): JsonLdNode | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonLdNode) : null;
}

function nodeType(node: JsonLdNode): string {
  const t = node["@type"];
  if (Array.isArray(t)) return t.join(",");
  return typeof t === "string" ? t : "";
}

function authorName(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.replace(/\s+/g, " ").trim();
  const node = asNode(value);
  if (!node) return null;
  const name = node.name;
  return typeof name === "string" && name.trim() ? name.replace(/\s+/g, " ").trim() : null;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/**
 * Real reviews out of any store that publishes schema.org Review objects
 * (Flipkart and several fashion sites do). Nothing is invented: if the page
 * has no review array we return an empty list.
 */
export function extractJsonLdReviews(html: string): StoreReview[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const out: StoreReview[] = [];
  const seen = new Set<string>();

  const visitNode = (node: JsonLdNode, depth: number) => {
    if (depth > 6) return;
    if (nodeType(node) === "Review") return; // handled by its parent
    const raw = node.review;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const entry of list) {
      const review = asNode(entry);
      if (!review) continue;
      const body = textValue(review.reviewBody) ?? textValue(review.description);
      const title = textValue(review.name) ?? textValue(review.headline);
      if (!body && !title) continue;

      const rating = asNode(review.reviewRating);
      const starsRaw = rating?.ratingValue;
      const stars =
        typeof starsRaw === "number"
          ? starsRaw
          : typeof starsRaw === "string"
            ? Number(starsRaw)
            : null;

      const author = authorName(review.author);
      const key = `${author ?? ""}|${title ?? ""}|${(body ?? "").slice(0, 80)}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        author,
        stars: stars !== null && Number.isFinite(stars) ? stars : null,
        title,
        body,
        date: formatReviewDate(
          typeof review.datePublished === "string" ? review.datePublished : null,
        ),
        verified: review.verified === true,
        variant: null,
        helpful: null,
      });
    }
    for (const key of ["@graph", "mainEntity", "itemListElement"]) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          const n = asNode(c);
          if (n) visitNode(n, depth + 1);
        }
      } else {
        const n = asNode(child);
        if (n) visitNode(n, depth + 1);
      }
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const n = asNode(node);
      if (n) visitNode(n, 0);
    }
  });

  return out;
}

/**
 * Myntra embeds the product page state in `window.__myx`. Its
 * `topReviews` array contains the same reviews the site renders.
 */
export function extractMyntraReviews(html: string): StoreReview[] {
  if (!html) return [];
  const marker = html.indexOf("window.__myx");
  if (marker < 0) return [];

  const start = html.indexOf("{", marker);
  if (start < 0) return [];

  // Walk the object to its matching brace, respecting strings and escapes.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(html.slice(start, end)) as Record<string, unknown>;
  } catch {
    return [];
  }

  const pdpData = asNode(data.pdpData);
  const ratings = asNode(pdpData?.ratings);
  const reviewInfo = asNode(ratings?.reviewInfo);
  const top = reviewInfo?.topReviews;
  if (!Array.isArray(top)) return [];

  const out: StoreReview[] = [];
  for (const entry of top) {
    const review = asNode(entry);
    if (!review) continue;
    const body = textValue(review.reviewText);
    if (!body) continue;
    const starsRaw = review.userRating;
    const stars =
      typeof starsRaw === "number" ? starsRaw : typeof starsRaw === "string" ? Number(starsRaw) : null;
    const helpfulRaw = review.upvotes;
    const helpful =
      typeof helpfulRaw === "number"
        ? helpfulRaw
        : typeof helpfulRaw === "string" && helpfulRaw.trim()
          ? Number(helpfulRaw) || null
          : null;

    out.push({
      author: textValue(review.userName),
      stars: stars !== null && Number.isFinite(stars) ? stars : null,
      title: null,
      body,
      date: formatReviewDate(
        typeof review.timestamp === "string" || typeof review.timestamp === "number"
          ? String(review.timestamp)
          : null,
      ),
      verified: false,
      variant: null,
      helpful,
    });
  }
  return out;
}

/**
 * Flipkart's product pages publish a handful of genuine reviews as
 * schema.org Review objects. Older markup gets a loose DOM fallback.
 */
export function extractFlipkartReviews(html: string): StoreReview[] {
  if (!html) return [];
  const fromJsonLd = extractJsonLdReviews(html);
  if (fromJsonLd.length) return fromJsonLd;

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

/**
 * Pick the right review parser for a store, falling back to generic
 * schema.org reviews wherever a site publishes them.
 */
export function extractStoreReviews(merchant: string, html: string): StoreReview[] {
  if (!html) return [];
  if (merchant === "amazon") return extractAmazonReviews(html);
  if (merchant === "myntra") {
    const myntra = extractMyntraReviews(html);
    if (myntra.length) return myntra;
  }
  if (merchant === "flipkart") return extractFlipkartReviews(html);
  return extractJsonLdReviews(html);
}
