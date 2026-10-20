/**
 * PriceHistory.ai provider.
 *
 * PriceHistory.ai is an Indian price-tracking competitor that publishes its
 * product pages publicly (no login, no paywall). Their pages are server
 * rendered and embed the raw price-history series, the low/high/average
 * statistics and a buy recommendation.
 *
 * We use it the way a browser would — one product at a time, on demand, when
 * a user analyses a product we have no history for. Every result is cached
 * permanently in our own database, so each product is fetched at most once.
 * We never bulk-harvest and we always attribute the source in the UI.
 *
 * Outbound buy buttons use OUR affiliate links (Cuelinks / Amazon tag), never
 * the provider's.
 */

import type { ExternalHistory } from "../providers";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BASE = "https://pricehistory.ai";
const MIN_INTERVAL_MS = 1500;
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PHAIProduct {
  id: number;
  title: string;
  brand: string | null;
  platform: "amazon" | "flipkart" | string;
  asin: string;
  current_price: number | null;
  original_price: number | null;
  discount_percentage: number | null;
  rating: number | null;
  review_count: number | null;
  image_url: string | null;
  url: string;
  in_stock: boolean | null;
}

export interface PHAIStats {
  highest: number | null;
  lowest: number | null;
  average: number | null;
  dataPoints: number;
}

export interface PHAIRecommendation {
  score: number | null;
  label: string | null;
  summary: string | null;
  trend: string | null;
  confidence: string | null;
}

export interface PHAIResult extends ExternalHistory {
  provider: "pricehistory.ai";
  product: PHAIProduct | null;
  statistics: PHAIStats | null;
  recommendation: PHAIRecommendation | null;
}
async function throttle() {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/** Search the public catalogue. */
export async function searchPriceHistoryAi(query: string, limit = 50): Promise<PHAIProduct[]> {
  await throttle();
  try {
    const url = `${BASE}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=0&compact=true`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: Record<string, unknown>[] };
    return (data.results ?? []).map((r) => ({
      id: Number(r.id),
      title: String(r.title ?? ""),
      brand: (r.brand as string) || null,
      platform: String(r.platform ?? ""),
      asin: String(r.asin ?? ""),
      current_price: r.current_price != null ? Number(r.current_price) : null,
      original_price: r.original_price != null ? Number(r.original_price) : null,
      discount_percentage:
        r.discount_percentage != null ? Number(r.discount_percentage) : null,
      rating: parseRatingText(r.avg_rating as string),
      review_count: parseIntText(r.review_count as string),
      image_url: (r.image_url as string) || null,
      url: String(r.url ?? ""),
      in_stock: r.in_stock === true,
    }));
  } catch {
    return [];
  }
}

function parseRatingText(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function parseIntText(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Pull the Next.js flight payload out of a server-rendered product page. */
function extractFlight(html: string): string {
  const chunks: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      chunks.push(JSON.parse(`"${m[1]}"`));
    } catch {
      chunks.push(m[1]);
    }
  }
  return chunks.join("");
}

/** Grab a balanced JSON array/object that follows `key` in the payload. */
function sliceJson(flight: string, key: string): string | null {
  const idx = flight.indexOf(key);
  if (idx === -1) return null;
  const start = flight.indexOf("[", idx);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const ch = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return flight.slice(start, i + 1);
    }
  }
  return null;
}

function sliceObject(flight: string, key: string): string | null {
  const idx = flight.indexOf(key);
  if (idx === -1) return null;
  const start = flight.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < flight.length; i++) {
    const ch = flight[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return flight.slice(start, i + 1);
    }
  }
  return null;
}

/** React's flight format prefixes Date values with `$D`. */
function parseFlightDate(v: string): number | null {
  const raw = v.startsWith("$D") ? v.slice(2) : v;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

export interface PHAIHistory {
  points: { t: number; price: number }[];
  statistics: PHAIStats | null;
  recommendation: PHAIRecommendation | null;
}

/** Parse the embedded product payload from a product page. */
export function parseProductPage(html: string): PHAIHistory {
  const flight = extractFlight(html);

  const points: { t: number; price: number }[] = [];
  const arr = sliceJson(flight, '"priceHistory"');
  if (arr) {
    try {
      const rows = JSON.parse(arr) as Record<string, unknown>[];
      for (const r of rows) {
        const t = parseFlightDate(String(r.timestamp ?? ""));
        const price = Number(r.price);
        if (t && Number.isFinite(price) && price > 0) points.push({ t, price });
      }
    } catch {
      /* ignore */
    }
  }
  points.sort((a, b) => a.t - b.t);

  let statistics: PHAIStats | null = null;
  const statObj = sliceObject(flight, '"statistics"');
  if (statObj) {
    try {
      const s = JSON.parse(statObj) as Record<string, string>;
      statistics = {
        highest: s.highest_price != null ? Number(s.highest_price) : null,
        lowest: s.lowest_price != null ? Number(s.lowest_price) : null,
        average: s.average_price != null ? Number(s.average_price) : null,
        dataPoints: Number(s.data_points ?? points.length),
      };
    } catch {
      /* ignore */
    }
  }

  let recommendation: PHAIRecommendation | null = null;
  const recObj = sliceObject(flight, '"buyRecommendation"');
  if (recObj) {
    try {
      const r = JSON.parse(recObj) as Record<string, unknown>;
      recommendation = {
        score: r.score != null ? Number(r.score) : null,
        label: (r.label as string) ?? null,
        summary: (r.summary as string) ?? null,
        trend: (r.trendDirection as string) ?? null,
        confidence: (r.confidenceLevel as string) ?? null,
      };
    } catch {
      /* ignore */
    }
  }

  return { points, statistics, recommendation };
}

/** Fetch and parse the price history for one product id. */
export async function fetchPriceHistoryAi(productId: number): Promise<PHAIResult | null> {
  await throttle();
  try {
    const res = await fetch(`${BASE}/product/${productId}`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const parsed = parseProductPage(html);
    if (!parsed.points.length) return null;
    return {
      points: parsed.points,
      provider: "pricehistory.ai",
      sourceUrl: `${BASE}/product/${productId}`,
      product: null,
      statistics: parsed.statistics,
      recommendation: parsed.recommendation,
    };
  } catch {
    return null;
  }
}

/** "Apple iPhone 17 (White, 256 GB)" → "Apple iPhone 17" */
function cleanQuery(title: string): string {
  return title
    .replace(/\([^)]*\)/g, " ")
    .replace(/[|,:].*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 5)
    .join(" ");
}

/**
 * One-shot: find a product by merchant id and return its price history.
 *
 * We ONLY accept an exact match on the merchant product id. A near-match
 * would attach the wrong product's price history, which is far worse than
 * showing no external history at all.
 */
export async function fetchPriceHistoryAiFor(
  merchant: "amazon" | "flipkart",
  merchantProductId: string,
  titleHint?: string,
): Promise<PHAIResult | null> {
  const wanted = merchantProductId.toUpperCase();

  const queries: string[] = [];
  if (titleHint) queries.push(cleanQuery(titleHint));
  queries.push(merchantProductId);

  for (const q of queries) {
    if (!q) continue;
    const hits = await searchPriceHistoryAi(q, 50);
    const exact = hits.find(
      (h) => h.asin?.toUpperCase() === wanted && h.platform === merchant,
    );
    if (!exact?.id) continue;

    const history = await fetchPriceHistoryAi(exact.id);
    if (!history) continue;
    return { ...history, product: exact };
  }

  // No exact match — we deliberately do not fall back to a similar product.
  return null;
}
