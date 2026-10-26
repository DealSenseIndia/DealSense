/**
 * Outbound affiliate routing.
 *
 * Every buy button points at our own /go/<listingId> endpoint. The actual
 * monetized destination is resolved server-side at click time, so we never
 * expose a provider's link and can add tracking without slowing page renders:
 *
 *   Amazon  → our Amazon Associates tag (best direct payout).
 *   Others  → Cuelinks Publisher API conversion when the account is approved,
 *             otherwise a Cuelinks channel link, otherwise the clean store URL.
 *
 * The Cuelinks API key is server-only. Never import this module from a client
 * component that reads process.env.CUELINKS_API_KEY.
 */

import { affiliate, site } from "./config";
import { stripTracking } from "./merchants/resolve";

export interface AffiliateTargetInput {
  url: string;
  merchant: string;
  listingId?: string;
  source?: string;
}

export interface AffiliateTarget {
  url: string;
  monetized: boolean;
  via: "amazon_tag" | "cuelinks_api" | "cuelinks_channel" | "clean";
}

/** Relative, same-origin click path used by every buy button. */
export function goPath(listingId: string, source = "site"): string {
  const src = sanitiseSource(source);
  return `/go/${encodeURIComponent(listingId)}${src ? `?src=${src}` : ""}`;
}

/** Absolute version, for Telegram / WhatsApp / email. */
export function goUrl(listingId: string, source = "site"): string {
  return `${site.url.replace(/\/$/, "")}${goPath(listingId, source)}`;
}

function sanitiseSource(source: string): string {
  return String(source || "site")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

function sanitiseSubid(value: string, fallback = ""): string {
  return String(value || fallback)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 64);
}

function safeHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u;
  } catch {
    return null;
  }
}

/** Direct, untracked Amazon tag link. */
function amazonTagUrl(clean: string): string {
  const u = safeHttpUrl(clean);
  if (!u) return clean;
  u.searchParams.set("tag", affiliate.amazonTag);
  u.searchParams.set("linkCode", "ogi");
  u.searchParams.set("language", "en_IN");
  return u.toString();
}

/** Cuelinks shared-channel redirect. Works without API approval. */
function cuelinksChannelUrl(
  clean: string,
  listingId?: string,
  source?: string,
): string {
  const params = new URLSearchParams({
    cid: affiliate.cuelinksChannel,
    source: "linkShare",
    url: clean,
  });
  if (listingId) params.set("subid", sanitiseSubid(listingId));
  if (source) params.set("subid2", sanitiseSubid(source));
  return `https://linksredirect.com/?${params.toString()}`;
}

interface CacheEntry {
  target: AffiliateTarget;
  expires: number;
}

const CONVERSION_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const conversionCache = new Map<string, CacheEntry>();

async function viaCuelinksApi(
  clean: string,
  merchant: string,
  listingId?: string,
  source?: string,
): Promise<AffiliateTarget | null> {
  const apiKey = process.env.CUELINKS_API_KEY?.trim();
  if (!apiKey) return null;

  const cacheKey = `${listingId ?? ""}|${merchant}|${clean}`;
  const cached = conversionCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.target.monetized || cached.target.via === "cuelinks_channel"
      ? cached.target
      : null;
  }

  try {
    const res = await fetch("https://developers.cuelinks.com/pub_api/v3/links/convert", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense/1.0 (+https://dealsense.in)",
      },
      body: JSON.stringify({
        url: clean,
        channel_id: Number(affiliate.cuelinksChannel) || 317867,
        subid: sanitiseSubid(listingId ?? "0"),
        subid2: sanitiseSubid(merchant),
        subid3: sanitiseSubid(source ?? "deal_analyze"),
      }),
      signal: AbortSignal.timeout(4500),
    });

    const raw = (await res.json().catch(() => null)) as
      | { data?: Record<string, unknown> }
      | Record<string, unknown>
      | null;
    const data = ((raw && "data" in raw ? raw.data : raw) ?? {}) as Record<string, unknown>;
    const tracking =
      (data.tracking_url as string) ||
      (data.affiliate_url as string) ||
      (data.url as string) ||
      "";
    const affiliated = data.affiliated === true;
    const parsed = tracking ? safeHttpUrl(tracking) : null;

    if (res.ok && affiliated && parsed) {
      const target: AffiliateTarget = {
        url: parsed.toString(),
        monetized: true,
        via: "cuelinks_api",
      };
      conversionCache.set(cacheKey, { target, expires: Date.now() + CONVERSION_TTL_MS });
      return target;
    }

    // Cache the negative result briefly; fall back to the channel link.
    conversionCache.set(cacheKey, {
      target: {
        url: cuelinksChannelUrl(clean, listingId, source),
        monetized: true,
        via: "cuelinks_channel",
      },
      expires: Date.now() + FAILURE_TTL_MS,
    });
    return null;
  } catch {
    conversionCache.set(cacheKey, {
      target: {
        url: cuelinksChannelUrl(clean, listingId, source),
        monetized: true,
        via: "cuelinks_channel",
      },
      expires: Date.now() + FAILURE_TTL_MS,
    });
    return null;
  }
}

/** Resolve the final, monetized outbound URL for a real tracked listing. */
export async function resolveAffiliateTarget(
  input: AffiliateTargetInput,
): Promise<AffiliateTarget> {
  const parsed = safeHttpUrl(input.url);
  if (!parsed) return { url: input.url, monetized: false, via: "clean" };

  const clean = stripTracking(parsed.toString());
  const merchant = (input.merchant || "").toLowerCase();

  if (merchant.includes("amazon")) {
    return { url: amazonTagUrl(clean), monetized: true, via: "amazon_tag" };
  }

  const converted = await viaCuelinksApi(
    clean,
    merchant,
    input.listingId,
    input.source,
  );
  if (converted) return converted;

  if (affiliate.cuelinksChannel) {
    return {
      url: cuelinksChannelUrl(clean, input.listingId, input.source),
      monetized: true,
      via: "cuelinks_channel",
    };
  }

  return { url: clean, monetized: false, via: "clean" };
}
