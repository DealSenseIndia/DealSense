import type { Merchant } from "./config";

export type { Merchant };

export type Verdict = "BUY" | "FAIR" | "WAIT" | "AVOID" | "INSUFFICIENT";
export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type Freshness = "LIVE" | "OBSERVED" | "STALE" | "EXPIRED" | "UNKNOWN";
export type ObservationSource =
  | "live_extraction"
  | "live_heartbeat"
  | "user_triggered"
  | "imported"
  | "seed";

/** The normalized result of reading a merchant product page. */
export interface ExtractedProduct {
  merchant: Merchant;
  merchantProductId: string;
  url: string;
  title: string;
  brand: string | null;
  price: number | null;
  mrp: number | null;
  currency: "INR";
  inStock: boolean | null;
  rating: number | null;
  reviewCount: number | null;
  seller: string | null;
  imageUrl: string | null;
  images: string[];
  category: string | null;
  shipping: number | null;
  coupon: number | null;
  extractionMethod: string;
  confidence: number;
}

export interface DealStats {
  count: number;
  low: number | null;
  high: number | null;
  median: number | null;
  median90: number | null;
  firstObservedAt: number | null;
  lastObservedAt: number | null;
  trendPct: number | null;
}

export interface VerdictResult {
  score: number | null;
  verdict: Verdict;
  confidence: Confidence;
  reasons: string[];
  stats: DealStats;
  genuineDiscountPct: number | null;
  advertisedDiscountPct: number | null;
  fakeDiscount: boolean;
}

export interface LandedBreakdownRow {
  label: string;
  amount: number;
  note?: string;
}

export interface LandedPrice {
  base: number;
  shipping: number;
  coupon: number;
  bankDiscount: number;
  effective: number;
  savings: number;
  breakdown: LandedBreakdownRow[];
}

export interface BankOffer {
  id: string;
  bank: string;
  merchant: Merchant | "any";
  label: string;
  rate: number;
  cap: number;
  minSpend: number;
  card: string;
}

export interface PricePoint {
  t: number;
  price: number;
}

export interface AnalysisResult {
  ok: boolean;
  status: string;
  product: {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    category: string | null;
    imageUrl: string | null;
    images: string[];
  } | null;
  listing: {
    id: string;
    merchant: Merchant;
    merchantProductId: string;
    url: string;
    price: number | null;
    mrp: number | null;
    inStock: boolean | null;
    rating: number | null;
    reviewCount: number | null;
    seller: string | null;
    imageUrl: string | null;
    affiliateUrl: string;
    lastCheckedAt: number | null;
  } | null;
  rival: {
    merchant: Merchant;
    price: number | null;
    effectivePrice: number | null;
    url: string;
    affiliateUrl: string;
    lastCheckedAt: number | null;
  } | null;
  landed: LandedPrice | null;
  verdict: VerdictResult | null;
  history: { primary: PricePoint[]; rival: PricePoint[] };
  /** Rich context: market band, evidence, history provenance. */
  bundle?: {
    source: "own" | "cross_store" | "external" | "none";
    sourceLabel: string;
    observationCount: number;
    points: PricePoint[];
    low: number | null;
    high: number | null;
    median: number | null;
    median90: number | null;
    market: {
      category: string;
      low: number;
      high: number;
      median: number;
      sampleSize: number;
    } | null;
    advertisedDiscountPct: number | null;
    evidence: {
      kind: "VERIFIED FACT" | "CALCULATION" | "MARKET CONTEXT" | "RECOMMENDATION";
      text: string;
    }[];
    hasSufficientHistory: boolean;
  };
  message?: string;
}
