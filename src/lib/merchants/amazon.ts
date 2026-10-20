import * as cheerio from "cheerio";
import type { ExtractedProduct, StoreReview } from "../types";
import type { FetchResult } from "./http";
import { cleanTitle, extractBrandFromTitle, inferCategory, parseCount, parsePrice, parseRating } from "./parse";
import { extractAmazonReviews } from "./reviews";

function firstText($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const s of selectors) {
    const t = $(s).first().text().trim();
    if (t) return t;
  }
  return null;
}

function firstAttr($: cheerio.CheerioAPI, selectors: string[], attr: string): string | null {
  for (const s of selectors) {
    const v = $(s).first().attr(attr);
    if (v) return v.trim();
  }
  return null;
}

function jsonLdProduct($: cheerio.CheerioAPI): Record<string, unknown> | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const t = node?.["@type"];
        if (Array.isArray(t) ? t.includes("Product") : t === "Product") return node as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Regex price sweep over raw HTML — catches JSON blobs and inline scripts. */
function regexPrices(html: string): number[] {
  const found: number[] = [];
  const patterns = [
    /"priceAmount"\s*:\s*"?([0-9.]+)"?/g,
    /"buyingPrice"\s*:\s*"?([0-9.]+)"?/g,
    /"displayPrice"\s*:\s*"₹?([\d,]+)"/g,
    /"priceToPay"\s*:\s*"₹?([\d,]+)"/g,
    /"price"\s*:\s*"?₹?([\d,]{3,})"?/g,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) {
      const n = parsePrice(m[1]);
      if (n) found.push(n);
    }
  }
  return found;
}

/** Extract main price + MRP from rendered plain text (reader fallback). */
export function pricesFromText(text: string): { price: number | null; mrp: number | null } {
  const idx = text.indexOf("M.R.P");
  const mrp = idx !== -1 ? parsePrice(text.slice(idx, idx + 60).match(/₹\s?([\d,]+)/)?.[1]) : null;

  const hits = [...text.matchAll(/₹\s?([\d,]{2,})/g)];
  let prevEnd = 0;
  for (const h of hits) {
    const segment = text.slice(prevEnd, h.index ?? 0);
    prevEnd = (h.index ?? 0) + h[0].length;
    // Skip a price whose immediately preceding label is the MRP.
    if (/M\.?R\.?P/i.test(segment)) continue;
    const n = parsePrice(h[1]);
    if (n && n >= 50) return { price: n, mrp };
  }
  return { price: null, mrp };
}

/** Amazon sometimes emits the paise without a decimal point, e.g. "₹15,99900". */
export function parseAmazonAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.replace(/[^\d.,]/g, "");
  if (!t) return null;
  if (t.includes(".")) return parsePrice(t);
  const groups = t.split(",");
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.length > 3) {
    const joined = groups.join("");
    return Number(joined.slice(0, -2)) + Number(joined.slice(-2)) / 100;
  }
  return parsePrice(t);
}

/** Prefer the scoped whole/fraction spans — the most reliable Amazon price markup. */
function amazonAmount($: cheerio.CheerioAPI, kind: "price" | "mrp"): number | null {
  const scopes =
    kind === "price"
      ? [
          "#corePriceDisplay_desktop_feature_div",
          "#corePrice_feature_div",
          "#apex_desktop",
          "#apex_offerDisplay_desktop",
          "#buybox",
          "#tp_price_block_total_price_ww",
          ".a-price",
        ]
      : ["#corePriceDisplay_desktop_feature_div", "#corePrice_feature_div", "#apex_desktop", ".a-price"];

  for (const sc of scopes) {
    const sel = kind === "price" ? "span.a-price-whole" : ".a-text-price span.a-offscreen";
    const whole = $(`${sc} ${sel}`).first().text();
    if (kind === "price" && whole) {
      const frac = $(`${sc} span.a-price-fraction`).first().text();
      const w = Number(whole.replace(/[^\d]/g, ""));
      const f = frac ? Number(frac.replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2)) : 0;
      if (Number.isFinite(w) && w > 0) return w + f / 100;
    }
    if (kind === "mrp" && whole) {
      const m = parseAmazonAmount(whole);
      if (m) return m;
    }
  }
  const off = $(".a-price .a-offscreen").first().text();
  return parseAmazonAmount(off);
}

export function extractAmazon(res: FetchResult, asin: string, url: string): ExtractedProduct {
  const $ = cheerio.load(res.content);
  const ld = jsonLdProduct($);

  const title =
    cleanTitle(firstText($, ["#productTitle", "#title", "h1#title", "h1 span", "h1"])) ||
    cleanTitle((ld?.name as string) || "") ||
    `Amazon product ${asin}`;

  // ---- Price ----
  let price: number | null = null;
  let mrp: number | null = null;

  if (res.format === "html") {
    price = amazonAmount($, "price");

    if (price === null && ld) {
      const offers = ld.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      price = parsePrice(String(offer?.price ?? ""));
    }

    if (price === null) {
      const rp = regexPrices(res.content);
      if (rp.length) price = Math.min(...rp.filter((n) => n > 99));
    }

    mrp = amazonAmount($, "mrp");
  } else {
    const t = pricesFromText(res.content);
    price = t.price;
    mrp = t.mrp;
  }

  if (mrp !== null && price !== null && mrp <= price) mrp = null;

  // ---- Rating / reviews / stock ----
  const rating =
    parseRating(firstAttr($, ["#acrPopover"], "title")) ??
    parseRating(firstText($, ["span[data-hook='rating-out-of-text']", "i.a-icon-star span.a-icon-alt"])) ??
    parseRating(String((ld?.aggregateRating as Record<string, unknown>)?.ratingValue ?? ""));

  const reviewCount =
    parseCount(firstText($, ["#acrCustomerReviewText", "span[data-hook='total-review-count']"])) ??
    parseCount(String((ld?.aggregateRating as Record<string, unknown>)?.ratingCount ?? ""));

  const availability = firstText($, ["#availability span", "#availability", "#outOfStock"]);
  let inStock: boolean | null = null;
  if (availability) {
    const a = availability.toLowerCase();
    if (a.includes("in stock") || a.includes("available")) inStock = true;
    else if (a.includes("unavailable") || a.includes("out of stock")) inStock = false;
  }
  if (inStock === null && price !== null) inStock = true;

  // ---- Images ----
  let images: string[] = [];
  const dyn = firstAttr($, ["#landingImage", "#imgTagWrapperId img"], "data-a-dynamic-image");
  if (dyn) {
    try {
      images = Object.keys(JSON.parse(dyn));
    } catch {
      /* ignore */
    }
  }
  const mainImg = firstAttr($, ["#landingImage", "#imgTagWrapperId img", "#main-image"], "src");
  if (mainImg) images.unshift(mainImg);
  if (ld?.image) {
    const li = Array.isArray(ld.image) ? (ld.image as string[]) : [ld.image as string];
    li.forEach((i) => typeof i === "string" && images.push(i));
  }
  images = Array.from(new Set(images.filter((i) => typeof i === "string" && i.startsWith("http")))).slice(0, 8);

  const seller =
    firstText($, ["#sellerProfileTriggerId", "#merchant-info", "#tabular-buybox .tabular-buybox-text"]) || null;

  const category =
    $(".a-unordered-list.a-horizontal.a-size-small li a")
      .toArray()
      .map((el) => $(el).text().trim())
      .filter(Boolean)
      .slice(1)
      .join(" > ") || inferCategory(title);

  const confidence = (title ? 0.3 : 0) + (price !== null ? 0.5 : 0) + (images.length ? 0.2 : 0);

  // Real customer reviews, straight off the page.
  let reviews: StoreReview[] = [];
  if (res.format === "html") {
    try {
      reviews = extractAmazonReviews(res.content);
    } catch {
      reviews = [];
    }
  }

  return {
    merchant: "amazon",
    merchantProductId: asin,
    url,
    title,
    brand: extractBrandFromTitle(title),
    price,
    mrp,
    currency: "INR",
    inStock,
    rating,
    reviewCount,
    seller,
    imageUrl: images[0] ?? null,
    images,
    category: category || null,
    shipping: null,
    coupon: null,
    extractionMethod: `amazon_${res.via}`,
    confidence: Math.round(confidence * 100) / 100,
    reviews,
  };
}
