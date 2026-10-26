/**
 * DealSense — global configuration.
 * Everything here is safe to import from client or server unless noted.
 */

export const site = {
  name: "DealSense",
  tagline: "Know if it's actually a good deal.",
  description:
    "Paste a product link from Amazon, Flipkart, Myntra, Nykaa and more — DealSense tells you whether to BUY, WAIT or AVOID, with real price history and cross-store comparison.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://dealsense.in",
  locale: "en_IN",
  twitter: "@dealsense",
} as const;

export const affiliate = {
  amazonTag: process.env.NEXT_PUBLIC_AMAZON_TAG || "dealsense-21",
  cuelinksChannel: process.env.NEXT_PUBLIC_CUELINKS_CHANNEL || "317867",
} as const;

/**
 * Every store we can hold a listing for. The first two are the ones we
 * actively scrape live prices for; the rest come from the catalogue import
 * and are still compared and tracked.
 */
export const supportedMerchants = [
  "amazon",
  "flipkart",
  "myntra",
  "tatacliq",
  "croma",
  "reliancedigital",
  "ajio",
  "firstcry",
  "libas",
  "biba",
  "meesho",
  "nykaa",
  "shopsy",
] as const;
export type Merchant = (typeof supportedMerchants)[number];

/**
 * Stores whose price series the public tracker publishes. Every one of these
 * can appear in deals, shelves, search and Smart Setups.
 */
export const priceTrackedMerchants = [
  "amazon",
  "flipkart",
  "myntra",
  "nykaa",
  "firstcry",
  "reliancedigital",
  "biba",
  "libas",
  "tatacliq",
  "ajio",
] as const;

/** Store display details. Lookup is always safe — see `storeMeta()`. */
export const merchantMeta: Record<
  Merchant,
  { name: string; color: string; short: string }
> = {
  amazon: { name: "Amazon", color: "#FF9900", short: "AZ" },
  flipkart: { name: "Flipkart", color: "#2874F0", short: "FK" },
  myntra: { name: "Myntra", color: "#FF3F6C", short: "MY" },
  tatacliq: { name: "Tata CLiQ", color: "#6E2B8B", short: "TC" },
  croma: { name: "Croma", color: "#00A0E9", short: "CR" },
  reliancedigital: { name: "Reliance Digital", color: "#D71920", short: "RD" },
  ajio: { name: "AJIO", color: "#2C4152", short: "AJ" },
  firstcry: { name: "FirstCry", color: "#F48C06", short: "FC" },
  libas: { name: "Libas", color: "#8B1E5B", short: "LB" },
  biba: { name: "Biba", color: "#C2185B", short: "BB" },
  meesho: { name: "Meesho", color: "#57057A", short: "MS" },
  nykaa: { name: "Nykaa", color: "#E5008E", short: "NY" },
  shopsy: { name: "Shopsy", color: "#6D22B8", short: "SH" },
};

/**
 * Never-throw lookup for a store name that may not be in the table above
 * (a listing can name a store we have not seen before).
 */export function storeMeta(merchant: string): {
  name: string;
  color: string;
  short: string;
} {
  const key = merchant.toLowerCase().replace(/[^a-z]/g, "") as Merchant;
  const found = merchantMeta[key];
  if (found) return found;
  return {
    name: merchant.charAt(0).toUpperCase() + merchant.slice(1),
    color: "#64748B",
    short: merchant.slice(0, 2).toUpperCase(),
  };
}

/**
 * The stores we track, in the order we show them. Same list we publish in
 * the footer and cycle through the search bar.
 */
export const trackedStores = [
  { key: "amazon", name: "Amazon" },
  { key: "flipkart", name: "Flipkart" },
  { key: "myntra", name: "Myntra" },
  { key: "nykaa", name: "Nykaa" },
  { key: "firstcry", name: "FirstCry" },
  { key: "reliancedigital", name: "Reliance Digital" },
  { key: "biba", name: "Biba" },
  { key: "libas", name: "Libas" },
  { key: "tatacliq", name: "Tata CLiQ" },
  { key: "ajio", name: "AJIO" },
] as const;

/** Freshness thresholds (ms). Drives the trust badges. */
export const freshness = {
  live: 60 * 60 * 1000, // < 1h  → LIVE
  observed: 24 * 60 * 60 * 1000, // < 24h → OBSERVED
  stale: 3 * 24 * 60 * 60 * 1000, // < 3d  → STALE
  // beyond  → EXPIRED
} as const;

/** Minimum real observations before we are willing to score a deal. */
export const MIN_OBSERVATIONS_FOR_SCORE = 3;
/** Observations needed for HIGH confidence. */
export const OBSERVATIONS_FOR_HIGH_CONFIDENCE = 8;

export const workerConfig = {
  /** ms between scheduler ticks */
  tickInterval: 60_000,
  /** max concurrent network requests */
  maxConcurrency: 2,
  /** per-merchant spacing (ms) */
  spacing: {
    amazon: [6000, 10000] as [number, number],
    flipkart: [5000, 8000] as [number, number],
  },
  /** refresh tiers (ms) */
  tiers: {
    hot: 45 * 60 * 1000,
    active: 3 * 60 * 60 * 1000,
    normal: 10 * 60 * 60 * 1000,
    cold: 30 * 60 * 60 * 1000,
  },
  /** backoff schedule (ms) by failure count */
  backoff: [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 8 * 60 * 60_000, 24 * 60 * 60_000],
} as const;
