/**
 * Flipkart data via its own page API.
 *
 * Flipkart blocks plain requests and headless browsers, but its internal
 * page endpoint (POST /api/4/page/fetch) returns rich JSON without a proxy.
 * We use it as the primary Flipkart source and stay gentle (throttled + cached).
 */
import type { ExtractedProduct } from "../types";
import { inferCategory, parsePrice } from "./parse";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FKUA = `${UA} FKUA/website/41/website/Desktop`;

const MIN_INTERVAL_MS = 2500;
let lastCall = 0;
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deepFind(obj: unknown, key: string, out: unknown[] = [], depth = 0): unknown[] {
  if (!obj || typeof obj !== "object" || depth > 18) return out;
  if (!Array.isArray(obj) && key in (obj as Record<string, unknown>)) out.push(obj);
  for (const v of Object.values(obj as Record<string, unknown>)) deepFind(v, key, out, depth + 1);
  return out;
}

function first<T = Record<string, unknown>>(obj: unknown, key: string): T | null {
  const found = deepFind(obj, key);
  return (found[0] as T) ?? null;
}

/** POST the page API. Throttled + cached. Returns null on any failure. */
export async function fetchFlipkartJson(pageUri: string): Promise<unknown | null> {
  const cached = cache.get(pageUri);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCall));
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  try {
    const res = await fetch("https://www.flipkart.com/api/4/page/fetch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "User-Agent": UA,
        "x-user-agent": FKUA,
        "Accept-Language": "en-IN,en;q=0.9",
        origin: "https://www.flipkart.com",
        referer: "https://www.flipkart.com/",
      },
      body: JSON.stringify({ pageUri }),
      cache: "no-store",
    });
    if (res.status === 429) return null;
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length < 200) return null;
    const data = JSON.parse(text);
    const envelope = (data as Record<string, unknown>)?.RESPONSE as Record<string, unknown> | undefined;
    if (envelope?.ERROR_MESSAGE) return null;
    cache.set(pageUri, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

function resolveImage(template: string): string {
  return template
    .replace(/\{@width\}/g, "832")
    .replace(/\{@height\}/g, "832")
    .replace(/\{@quality\}/g, "90")
    .replace(/^http:\/\//, "https://");
}

export function extractFlipkartFromApi(json: unknown, pid: string, url: string): ExtractedProduct {
  // Pricing block: { fsp, finalPrice, mrp, specialPrice }
  const pricing = first<{ fsp?: number; mrp?: number; finalPrice?: number }>(json, "fsp");
  let price = pricing?.fsp ?? null;
  let mrp = pricing?.mrp ?? null;

  // Cross-check with the schema.org offer (most reliable when present).
  const offer = first<{ price?: number; availability?: string }>(json, "availability");
  if (offer?.price && typeof offer.price === "number") price = offer.price;
  if (price === null && pricing?.finalPrice) price = pricing.finalPrice;
  if (mrp !== null && price !== null && mrp <= price) mrp = null;

  // Rating / reviews
  const agg = first<{ ratingValue?: number; reviewCount?: number; ratingCount?: number; name?: string }>(
    json,
    "reviewCount",
  );
  const rating = typeof agg?.ratingValue === "number" ? Math.round(agg.ratingValue * 10) / 10 : null;
  const reviewCount = agg?.ratingCount ?? agg?.reviewCount ?? null;

  // Title — the schema.org aggregateRating carries the full branded product name.
  const aggMeta = first<{ name?: string }>(json, "aggregateRating");
  const subtitle = first<{ subtitle?: string }>(json, "subtitle");
  let title = (aggMeta?.name as string) || subtitle?.subtitle || "";
  if (!title) {
    const t = first<{ title?: string }>(json, "title");
    title = t?.title ?? `Flipkart product ${pid}`;
  }
  title = title.replace(/\s+/g, " ").replace(/\.$/, "").trim();

  // Images
  const imgTemplates = Array.from(
    new Set(
      deepFind(json, "imageUrl")
        .map((o) => (o as { imageUrl?: unknown }).imageUrl)
        .filter((s): s is string => typeof s === "string" && s.includes("flixcart")),
    ),
  );
  const images = imgTemplates.map(resolveImage).slice(0, 8);

  // Availability
  const availText = offer?.availability ?? "";
  const inStock = availText ? availText.includes("InStock") : price !== null;

  const confidence = (title ? 0.3 : 0) + (price !== null ? 0.5 : 0) + (images.length ? 0.2 : 0);

  return {
    merchant: "flipkart",
    merchantProductId: pid,
    url,
    title,
    brand: title.split(/\s+/)[0] ?? null,
    price,
    mrp,
    currency: "INR",
    inStock,
    rating,
    reviewCount,
    seller: null,
    imageUrl: images[0] ?? null,
    images,
    category: inferCategory(title),
    shipping: 0,
    coupon: null,
    extractionMethod: "flipkart_api",
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** Build the API pageUri from any Flipkart product URL. */
export function toPageUri(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("flipkart")) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export interface DiscoveredProduct {
  pid: string;
  url: string;
  title: string;
  price: number | null;
}

/** Discover real products from a Flipkart category page (for the deals feed). */
export function discoverFromJson(json: unknown): DiscoveredProduct[] {
  const out: DiscoveredProduct[] = [];
  const nodes = deepFind(json, "url");
  for (const node of nodes) {
    const n = node as { url?: string; title?: string; values?: string[] };
    if (typeof n.url !== "string" || !n.url.includes("/p/itm")) continue;
    const pidMatch = n.url.match(/[?&]pid=([A-Z0-9]+)/);
    if (!pidMatch) continue;
    const priceStr = n.values?.find((v) => /^Rs\.?/.test(v));
    out.push({
      pid: pidMatch[1],
      url: `https://www.flipkart.com${n.url.split("&lid=")[0]}`,
      title: n.title ?? "",
      price: priceStr ? parsePrice(priceStr) : null,
    });
  }
  return out.slice(0, 24);
}
