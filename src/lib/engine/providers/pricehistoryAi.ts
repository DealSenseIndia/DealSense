/**
 * PriceHistory.ai provider.
 *
 * PriceHistory.ai is an Indian price-tracking competitor that publishes its
 * product pages publicly (no login, no paywall). Their pages are server
 * rendered and embed the raw price-history series, the low/high/average
 * statistics and a buy recommendation.
 *
 * We use it the way a browser would — one product at a time. A new product
 * gets one full backfill; a controlled hourly sync then re-reads a handful of
 * tracked listings and appends only points newer than ours. We never
 * bulk-harvest and we always attribute the source in the UI.
 *
 * Discovery is HTML-only. robots.txt (checked 2026-10-28) allows `/`,
 * `/product/`, `/products`, `/category/` and the published sitemaps, and
 * disallows `/api/`, any URL carrying `session_id` and `/maintenance`. This
 * provider therefore never calls `/api/v1/search` (or any other `/api/`
 * route). It discovers products from:
 *   • `/products?page=N` HTML listing pages, and
 *   • the sitemap index the site publishes for crawlers, whose product URLs
 *     point at the allowed `/product/<slug>-<ASIN>` HTML pages.
 * Product detail is always the HTML product page.
 *
 * Outbound buy buttons use OUR affiliate links (Cuelinks / Amazon tag), never
 * the provider's.
 */

import type { ExternalHistory } from "../providers";
import { priceTrackedMerchants } from "../../config";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BASE = "https://pricehistory.ai";
const MIN_INTERVAL_MS = 1500;
let lastCall = 0;

/** Products rendered server-side on each `/products` page. */
const LISTING_PAGE_SIZE = 20;
/** Request budget for one runtime search (20 products per page). */
const SEARCH_PAGE_BUDGET = 12;
/** Sitemaps change slowly; keep the index for the life of the process. */
const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000;
/** Parsed product pages kept in memory (small: points + fields only). */
const CACHE_LIMIT = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PHAIProduct {
  id: number;
  title: string;
  brand: string | null;
  category: string | null;
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

/** Stores the tracker publishes, named the way DealSense stores them. */
export const PROVIDER_MERCHANTS = priceTrackedMerchants;

/** A few platform spellings differ between the tracker and DealSense. */
export function providerMerchant(platform: string): string {
  const p = platform.trim().toLowerCase();
  if (p === "reliance") return "reliancedigital";
  if (p === "tata_cliq" || p === "tata-cliq") return "tatacliq";
  return p;
}

/* ------------------------------------------------------------------ */
/* Allowed HTTP surface                                                */
/* ------------------------------------------------------------------ */

/**
 * Single gate for every outbound request: the 1.5s throttle, the browser UA
 * and redirect following. Nothing in this module may bypass it.
 */
async function fetchAllowed(
  url: string,
  accept: string,
): Promise<{ res: Response; html: string } | null> {
  await throttle();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return { res, html: await res.text() };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* HTML listing pages (/products?page=N)                               */
/* ------------------------------------------------------------------ */

function mapProduct(r: Record<string, unknown>): PHAIProduct {
  const category = Array.isArray(r.category)
    ? r.category.map(String).join(" > ")
    : typeof r.category === "string"
      ? r.category
      : null;
  const outOfStock = r.out_of_stock;
  return {
    id: Number(r.id),
    title: String(r.title ?? ""),
    brand: (r.brand as string) || null,
    category,
    platform: providerMerchant(String(r.platform ?? "")),
    asin: String(r.asin ?? ""),
    current_price: r.current_price != null ? Number(r.current_price) : null,
    original_price: r.original_price != null ? Number(r.original_price) : null,
    discount_percentage:
      r.discount_percentage != null ? Number(r.discount_percentage) : null,
    rating: parseRatingText(r.avg_rating as string),
    review_count: parseIntText(r.review_count as string),
    image_url: (r.image_url as string) || null,
    url: String(r.url ?? ""),
    in_stock: outOfStock === false ? true : outOfStock === true ? false : null,
  };
}

/** Parse the products the listing page server-rendered into its payload. */
export function parseListingPage(html: string): PHAIProduct[] {
  const flight = extractFlight(html);
  const arr = sliceJson(flight, '"initialProducts"');
  if (!arr) return [];
  try {
    const rows = JSON.parse(arr) as Record<string, unknown>[];
    return rows
      .map(mapProduct)
      .filter((p) => Number.isFinite(p.id) && p.id > 0 && p.title);
  } catch {
    return [];
  }
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length > 1);
}

/** Every token must appear in the title; no fuzzy near-matches. */
function matchesQuery(title: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const t = title.toLowerCase();
  return tokens.every((tok) => t.includes(tok));
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

interface SitemapEntry {
  url: string;
  /** Title words recovered from the slug (used only for ranking a query). */
  name: string;
  asin: string;
}

let sitemapCache: { at: number; entries: SitemapEntry[] } | null = null;
let sitemapInFlight: Promise<SitemapEntry[]> | null = null;

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The sitemap index is the crawl entry point the site itself publishes
 * (robots.txt declares it). Product URLs carry the title slug and the exact
 * merchant id, and resolve to allowed HTML product pages. No `/api/` call.
 */
async function loadSitemapEntries(): Promise<SitemapEntry[]> {
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) {
    return sitemapCache.entries;
  }
  if (sitemapInFlight) return sitemapInFlight;

  sitemapInFlight = (async () => {
    const index = await fetchAllowed(`${BASE}/sitemap-index.xml`, "application/xml");
    const entries: SitemapEntry[] = [];
    const seen = new Set<string>();
    if (!index) return entries;

    const maps = [...index.html.matchAll(/<loc>([^<]*sitemap-products\/\d+\.xml)<\/loc>/g)].map(
      (m) => m[1].trim(),
    );
    for (const map of maps) {
      const child = await fetchAllowed(map, "application/xml");
      if (!child) continue;
      for (const m of child.html.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        const url = m[1].trim();
        const slug = decodeSlug(url.split("/product/")[1] ?? "");
        if (!slug) continue;
        const idMatch = slug.match(/-([A-Z0-9]{8,20})$/);
        if (!idMatch) continue;
        const asin = idMatch[1];
        if (seen.has(asin)) continue;
        seen.add(asin);
        entries.push({
          url,
          name: slug.slice(0, slug.length - asin.length - 1).replace(/-/g, " "),
          asin,
        });
      }
    }
    sitemapCache = { at: Date.now(), entries };
    return entries;
  })();

  try {
    return await sitemapInFlight;
  } finally {
    sitemapInFlight = null;
  }
}

/** Detail parsed from one product page, cached so an import fetches once. */
interface ParsedProductPage {
  product: PHAIProduct;
  history: PHAIHistory;
  finalUrl: string;
}

const pageCache = new Map<string, ParsedProductPage>();
const historyById = new Map<number, ParsedProductPage>();

function cachePage(key: string, page: ParsedProductPage) {
  pageCache.set(key, page);
  historyById.set(page.product.id, page);
  if (pageCache.size > CACHE_LIMIT) {
    const oldest = pageCache.keys().next().value;
    if (oldest !== undefined) pageCache.delete(oldest);
  }
  if (historyById.size > CACHE_LIMIT) {
    const oldest = historyById.keys().next().value;
    if (oldest !== undefined) historyById.delete(oldest);
  }
}

/** Pull the page's own product record (not a related-product card). */
export function parseProductFromPage(html: string): PHAIProduct | null {
  const flight = extractFlight(html);
  const obj = sliceObject(flight, '"product":{');
  if (!obj) return null;
  try {
    const p = JSON.parse(obj) as Record<string, unknown>;
    const product = mapProduct(p);
    return Number.isFinite(product.id) && product.id > 0 ? product : null;
  } catch {
    return null;
  }
}

async function loadProductPage(url: string): Promise<ParsedProductPage | null> {
  const cached = pageCache.get(url);
  if (cached) return cached;
  const fetched = await fetchAllowed(url, "text/html");
  if (!fetched) return null;
  const product = parseProductFromPage(fetched.html);
  if (!product) return null;
  const history = parseProductPage(fetched.html);
  const page: ParsedProductPage = {
    product,
    history,
    finalUrl: fetched.res.url || url,
  };
  cachePage(url, page);
  return page;
}

/** Bounded scan of allowed HTML listing pages. */
async function searchHtml(
  query: string,
  limit: number,
  opts: { platform?: string; offset?: number; pages?: number },
): Promise<PHAIProduct[]> {
  const tokens = tokenize(query);
  const wanted = opts.platform ? providerMerchant(opts.platform) : null;
  const offset = opts.offset ?? 0;
  const pages = Math.max(1, opts.pages ?? SEARCH_PAGE_BUDGET);
  const matches: PHAIProduct[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= pages; page++) {
    const fetched = await fetchAllowed(`${BASE}/products?page=${page}`, "text/html");
    if (!fetched) break;
    const items = parseListingPage(fetched.html);
    if (!items.length) break;
    for (const item of items) {
      if (wanted && item.platform !== wanted) continue;
      if (!matchesQuery(item.title, tokens)) continue;
      const key = `${item.platform}:${item.asin || item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(item);
    }
    if (matches.length >= offset + limit) break;
  }

  return matches.slice(offset, offset + limit);
}

/**
 * Deeper discovery for catalogue scripts: the published product sitemaps give
 * full title coverage, then each hit is confirmed on its allowed HTML product
 * page (platform, price, stock and history all come from that page).
 */
async function searchDeep(
  query: string,
  limit: number,
  opts: { platform?: string; offset?: number; skipAsins?: Set<string> },
): Promise<PHAIProduct[]> {
  const entries = await loadSitemapEntries();
  if (!entries.length) return [];
  const tokens = tokenize(query);
  const wanted = opts.platform ? providerMerchant(opts.platform) : null;
  const offset = opts.offset ?? 0;
  const out: PHAIProduct[] = [];
  const seen = new Set<string>();
  const skip = opts.skipAsins;

  const candidates = (tokens.length
    ? entries.filter((e) => matchesQuery(e.name, tokens))
    : entries
  ).filter((e) => !skip?.has(e.asin.toUpperCase()));

  // Cheap relevance order: exact phrase first, then ids whose shape suggests
  // a large tracked store (Amazon 10-char ASIN, Flipkart 16-char pid).
  const phrase = tokens.join(" ");
  const shape = (asin: string) => {
    if (/^B0[A-Z0-9]{8}$/.test(asin)) return 0;
    if (/^[A-Z0-9]{16}$/.test(asin)) return 1;
    return 2;
  };
  candidates.sort((a, b) => {
    const ap = a.name.includes(phrase) ? 0 : 1;
    const bp = b.name.includes(phrase) ? 0 : 1;
    return ap - bp || shape(a.asin) - shape(b.asin) || a.name.length - b.name.length;
  });

  for (const entry of candidates) {
    if (out.length >= offset + limit) break;
    const page = await loadProductPage(entry.url);
    if (!page) continue;
    const item = page.product;
    if (!item.title || item.current_price === null) continue;
    if (wanted && item.platform !== wanted) continue;
    if (!matchesQuery(item.title, tokens)) continue;
    const key = `${item.platform}:${item.asin || item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out.slice(offset, offset + limit);
}

/**
 * Search the public catalogue, optionally inside one store.
 *
 * Default is a bounded HTML scan (runtime-safe). `deep` uses the published
 * sitemap index and is meant for offline catalogue scripts only.
 */
export async function searchPriceHistoryAi(
  query: string,
  limit = 50,
  opts: {
    platform?: string;
    offset?: number;
    deep?: boolean;
    pages?: number;
    skipAsins?: Set<string>;
  } = {},
): Promise<PHAIProduct[]> {
  if (opts.deep) return searchDeep(query, limit, opts);
  return searchHtml(query, limit, opts);
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
  const cached = historyById.get(productId);
  if (cached) return toResult(cached);

  // `/product/<id>` answers with a 308 to the canonical slug URL; following it
  // is one logical request and stays inside the allowed HTML surface.
  const fetched = await fetchAllowed(`${BASE}/product/${productId}`, "text/html");
  if (!fetched) return null;
  const parsed = parseProductPage(fetched.html);
  if (!parsed.points.length) return null;

  const product = parseProductFromPage(fetched.html);
  const finalUrl = fetched.res.url || `${BASE}/product/${productId}`;
  if (product) {
    cachePage(finalUrl, { product, history: parsed, finalUrl });
  }
  return {
    points: parsed.points,
    provider: "pricehistory.ai",
    sourceUrl: finalUrl,
    product,
    statistics: parsed.statistics,
    recommendation: parsed.recommendation,
  };
}

function toResult(page: ParsedProductPage): PHAIResult {
  return {
    points: page.history.points,
    provider: "pricehistory.ai",
    sourceUrl: page.finalUrl,
    product: page.product,
    statistics: page.history.statistics,
    recommendation: page.history.recommendation,
  };
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
 * Resolve one exact merchant id on the allowed HTML product surface.
 * `/product/<ASIN or store pid>` answers 308 to the canonical slug page when
 * the tracker knows the product; the page itself states the asin and platform,
 * which we re-check before trusting it.
 */
async function fetchPriceHistoryAiByMerchantId(
  wantedMerchant: string,
  wantedId: string,
): Promise<PHAIResult | null> {
  const fetched = await fetchAllowed(
    `${BASE}/product/${encodeURIComponent(wantedId)}`,
    "text/html",
  );
  if (!fetched) return null;

  const product = parseProductFromPage(fetched.html);
  if (!product) return null;
  if (product.asin.toUpperCase() !== wantedId) return null;
  if (product.platform !== wantedMerchant) return null;

  const parsed = parseProductPage(fetched.html);
  if (!parsed.points.length) return null;

  const finalUrl = fetched.res.url || `${BASE}/product/${wantedId}`;
  const page: ParsedProductPage = { product, history: parsed, finalUrl };
  cachePage(finalUrl, page);
  return toResult(page);
}

/**
 * One-shot: find a product by merchant id and return its price history.
 *
 * We ONLY accept an exact match on the merchant product id. A near-match
 * would attach the wrong product's price history, which is far worse than
 * showing no external history at all.
 */
export async function fetchPriceHistoryAiFor(
  merchant: string,
  merchantProductId: string,
  titleHint?: string,
): Promise<PHAIResult | null> {
  const wanted = merchantProductId.trim().toUpperCase();
  if (!wanted) return null;
  const wantedMerchant = providerMerchant(merchant);

  // 1) The id resolves directly on the HTML product route when it exists.
  const byId = await fetchPriceHistoryAiByMerchantId(wantedMerchant, wanted);
  if (byId) return byId;

  // 2) Bounded HTML title scan, still gated on an exact id + merchant match.
  const queries: string[] = [];
  if (titleHint) queries.push(cleanQuery(titleHint));

  for (const q of queries) {
    if (!q) continue;
    const hits = await searchPriceHistoryAi(q, 50);
    const exact = hits.find(
      (h) => h.asin?.toUpperCase() === wanted && h.platform === wantedMerchant,
    );
    if (!exact?.id) continue;

    const history = await fetchPriceHistoryAi(exact.id);
    if (!history) continue;
    return { ...history, product: exact };
  }

  // No exact match — we deliberately do not fall back to a similar product.
  return null;
}
