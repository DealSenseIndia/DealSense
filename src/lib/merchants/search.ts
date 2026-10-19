import type { Merchant } from "../config";
import { parseCount, parsePrice, parseRating, cleanTitle } from "./parse";
import * as cheerio from "cheerio";

export interface SearchHit {
  merchant: Merchant;
  merchantProductId: string;
  title: string;
  price: number | null;
  mrp: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  url: string;
  inStock: boolean | null;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Search Amazon.in for a query. */
export async function searchAmazon(query: string, limit = 12): Promise<SearchHit[]> {
  try {
    const res = await fetch(`https://www.amazon.in/s?k=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": UA, "Accept-Language": "en-IN,en;q=0.9" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseAmazonResults(html, limit);
  } catch {
    return [];
  }
}

export function parseAmazonResults(html: string, limit = 12): SearchHit[] {
  // Amazon search result cards
  const $ = cheerio.load(html);
  const out: SearchHit[] = [];
  const seen = new Set<string>();

  const cards = $('div[data-component-type="s-search-result"], div.s-result-item[data-asin], div[data-cy="asin-faceout-container"]').toArray();

  for (const card of cards) {
    if (out.length >= limit) break;
    const $c = $(card);
    const asin =
      $c.attr("data-asin") ??
      $c.attr("data-csa-c-asin") ??
      $c.find("[data-asin]").first().attr("data-asin") ??
      "";
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);

    // Title — Amazon's new PUIS layout puts it in a recipe span, not the h2.
    // The reliable source is the product link with the most text.
    let title = "";
    $c.find("a.a-link-normal").each((_, el) => {
      const t = cleanTitle($(el).text());
      if (t.length > title.length) title = t;
    });
    if (!title) title = cleanTitle($c.find("span[data-cy='title-recipe']").first().text());
    if (!title) title = cleanTitle($c.find("h2").first().text());
    if (!title || title.length < 4 || title.split(/\s+/).length < 2) continue;

    let price: number | null = parsePrice($c.find(".a-price .a-offscreen").first().text());
    if (price === null) {
      price = parsePrice($c.find("span[data-cy='price-recipe']").first().text());
    }
    if (price === null) {
      const whole = $c.find("span.a-price-whole").first().text();
      const frac = $c.find("span.a-price-fraction").first().text();
      if (whole) {
        const w = Number(whole.replace(/[^\d]/g, ""));
        const f = frac ? Number(frac.replace(/[^\d]/g, "").padEnd(2, "0").slice(0, 2)) : 0;
        if (Number.isFinite(w) && w > 0) price = w + f / 100;
      }
    }

    const mrp = parsePrice($c.find(".a-text-price .a-offscreen").first().text());
    const rating = parseRating(
      $c.find("[aria-label*='out of 5 stars']").first().attr("aria-label") ??
        $c.find("span.a-icon-alt").first().text(),
    );
    const reviewCount = parseCount(
      $c.find("span.s-underline-text, a[href*='#customerReviews'] span").first().text(),
    );
    const img = $c.find("img.s-image").first().attr("src") ?? $c.find("img").first().attr("src");

    out.push({
      merchant: "amazon",
      merchantProductId: asin,
      title,
      price,
      mrp: mrp && price && mrp <= price ? null : mrp,
      rating,
      reviewCount,
      imageUrl: img && img.startsWith("http") ? img : null,
      url: `https://www.amazon.in/dp/${asin}`,
      inStock: null,
    });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Search Flipkart via its own page API. */
export async function searchFlipkart(query: string, limit = 12): Promise<SearchHit[]> {
  const { fetchFlipkartJson } = await import("./flipkartApi");
  const json = await fetchFlipkartJson(`/search?q=${encodeURIComponent(query)}`);
  if (!json) return [];

  const out: SearchHit[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, depth = 0): void {
    if (!node || typeof node !== "object" || depth > 16) return;
    const n = node as Record<string, unknown>;
    const title = n.title as string | undefined;
    const url = n.url as string | undefined;
    if (typeof title === "string" && typeof url === "string" && url.includes("/p/itm")) {
      const pid = url.match(/[?&]pid=([A-Z0-9]+)/)?.[1];
      if (pid && !seen.has(pid)) {
        seen.add(pid);
        const values = (n.values as string[] | undefined) ?? [];
        const priceStr = values.find((v) => /^Rs\.?/.test(v));
        out.push({
          merchant: "flipkart",
          merchantProductId: pid,
          title: title.replace(/\s+/g, " ").trim(),
          price: priceStr ? parsePrice(priceStr) : null,
          mrp: null,
          rating: null,
          reviewCount: null,
          imageUrl: null,
          url: `https://www.flipkart.com${url.split("&lid=")[0]}`,
          inStock: null,
        });
      }
    }
    for (const v of Object.values(n)) walk(v, depth + 1);
  }
  walk(json);

  return out.slice(0, limit);
}

/** Search both stores in parallel. */
export async function searchAll(query: string, limit = 12): Promise<SearchHit[]> {
  const [a, f] = await Promise.all([searchAmazon(query, limit), searchFlipkart(query, limit)]);
  return [...a, ...f].slice(0, limit * 2);
}
