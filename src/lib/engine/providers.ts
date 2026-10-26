/**
 * External price-history providers.
 *
 * Competitors like PriceHistory.ai, Keepa and PriceHistory.app have years of
 * historical price data. We use them as a **bootstrap**: when a user analyses
 * a product we have never tracked, we pull the real series once and cache it
 * in our own database. From then on a controlled top-up sync
 * (src/lib/engine/sync.ts) only appends points newer than ours.
 *
 * Our own observations remain the source of truth — external series are
 * labelled with their provider so the user always knows where the data
 * came from.
 *
 * Nothing here is required: without any provider DealSense uses its own
 * observations plus category market context.
 */

export interface ExternalPoint {
  t: number;
  price: number;
}

export interface ExternalHistory {
  points: ExternalPoint[];
  provider: string;
  sourceUrl?: string;
}

export type ProviderName = "pricehistory.ai" | "keepa" | "pricehistory.app";

const KEEPA_DOMAIN_IN = 21; // amazon.in

/** Keepa — https://keepa.com/#!api  (paid, token-metered). */
export async function fetchKeepaHistory(asin: string): Promise<ExternalHistory | null> {
  const key = process.env.KEEPA_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.keepa.com/product?key=${key}&domain=${KEEPA_DOMAIN_IN}&asin=${asin}&stats=180&buybox=1`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    const product = data?.products?.[0];
    if (!product) return null;

    const prices: number[] = product?.price?.NEW ?? product?.csv?.[0]?.NEW ?? [];
    const times: number[] = product?.priceTimeNEW ?? product?.csv?.[0]?.NEW ?? [];
    const points: ExternalPoint[] = [];
    for (let i = 0; i < Math.min(prices.length, times.length); i++) {
      const p = prices[i];
      const t = times[i];
      if (p > 0 && t > 0) points.push({ t: t, price: p / 100 });
    }
    if (!points.length) return null;
    return {
      points,
      provider: "keepa",
      sourceUrl: `https://keepa.com/#!product/${KEEPA_DOMAIN_IN}-${asin}`,
    };
  } catch {
    return null;
  }
}

/**
 * PriceHistory.app — official API (business/affiliate key required).
 * Endpoint shape is configurable because their API is partner-scoped.
 */
export async function fetchPriceHistoryApi(
  merchant: string,
  merchantProductId: string,
): Promise<ExternalHistory | null> {
  const key = process.env.PRICEHISTORY_API_KEY;
  const base = process.env.PRICEHISTORY_API_URL;
  if (!key || !base) return null;
  try {
    const url = `${base}?key=${key}&merchant=${merchant}&product_id=${merchantProductId}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const data = await res.json();
    const rows: unknown[] = data?.history ?? data?.prices ?? data?.data ?? [];
    const points: ExternalPoint[] = [];
    for (const row of rows) {
      const r = row as { t?: number | string; date?: number | string; price?: number; value?: number };
      const raw = r.t ?? r.date;
      const t = typeof raw === "string" ? Date.parse(raw) : (raw ?? 0);
      const price = r.price ?? r.value ?? 0;
      if (t > 0 && price > 0) points.push({ t, price });
    }
    if (!points.length) return null;
    return { points, provider: "pricehistory.app" };
  } catch {
    return null;
  }
}

/** Try every configured provider in order of preference. */
export async function fetchExternalHistory(
  merchant: string,
  merchantProductId: string,
  titleHint?: string,
): Promise<ExternalHistory | null> {
  // 1. PriceHistory.ai — free public catalogue, works without a key.
  const { fetchPriceHistoryAiFor } = await import("./providers/pricehistoryAi");
  const phai = await fetchPriceHistoryAiFor(merchant, merchantProductId, titleHint);
  if (phai?.points.length) return phai;

  // 2. Keepa (Amazon) — needs a key.
  if (merchant === "amazon") {
    const keepa = await fetchKeepaHistory(merchantProductId);
    if (keepa) return keepa;
  }

  // 3. PriceHistory.app — needs a partner key.
  return fetchPriceHistoryApi(merchant, merchantProductId);
}
