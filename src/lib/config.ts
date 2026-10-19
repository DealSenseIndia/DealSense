/**
 * DealSense — global configuration.
 * Everything here is safe to import from client or server unless noted.
 */

export const site = {
  name: "DealSense",
  tagline: "Know if it's actually a good deal.",
  description:
    "Paste any Amazon or Flipkart link and DealSense tells you whether to BUY, WAIT or AVOID — with real price history, true landed cost and cross-store comparison.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://dealsense.in",
  locale: "en_IN",
  twitter: "@dealsense",
} as const;

export const affiliate = {
  amazonTag: process.env.NEXT_PUBLIC_AMAZON_TAG || "dealsense-21",
  cuelinksChannel: process.env.NEXT_PUBLIC_CUELINKS_CHANNEL || "317867",
} as const;

export const supportedMerchants = ["amazon", "flipkart"] as const;
export type Merchant = (typeof supportedMerchants)[number];

export const merchantMeta: Record<
  Merchant,
  { name: string; color: string; short: string }
> = {
  amazon: { name: "Amazon", color: "#FF9900", short: "AZ" },
  flipkart: { name: "Flipkart", color: "#2874F0", short: "FK" },
};

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
