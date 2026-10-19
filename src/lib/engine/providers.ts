/**
 * External price-history providers.
 *
 * Competitors like Keepa and PriceHistory.app have years of historical price
 * data. Both offer official APIs. When a key is configured we merge their
 * series into our own so users get real history for *any* product immediately —
 * including products DealSense has never tracked.
 *
 * Nothing here is required: without a key DealSense uses its own observations.
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

export type ProviderName = "keepa" | "pricehistory";

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
  merchant: "amazon" | "flipkart",
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
    return { points, provider: "pricehistory" };
  } catch {
    return null;
  }
}

/** Try every configured provider in order of preference. */
export async function fetchExternalHistory(
  merchant: "amazon" | "flipkart",
  merchantProductId: string,
): Promise<ExternalHistory | null> {
  if (merchant === "amazon") {
    const keepa = await fetchKeepaHistory(merchantProductId);
    if (keepa) return keepa;
  }
  return fetchPriceHistoryApi(merchant, merchantProductId);
}
