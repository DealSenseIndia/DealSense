import type { Merchant } from "../config";

export interface ResolvedUrl {
  merchant: Merchant;
  merchantProductId: string;
  canonicalUrl: string;
  isShortlink: boolean;
}

const ASIN_RE = /\/(?:dp|gp\/product|gp\/aw\/d|product|ASIN)\/([A-Z0-9]{10})(?:[/?]|$)/i;
const ASIN_BARE_RE = /^[A-Z0-9]{10}$/;
const FK_PID_RE = /[?&]pid=([A-Z0-9]+)/i;
const FK_ITM_RE = /\/p\/(itm[A-Za-z0-9]+)/i;

export function detectMerchant(url: string): Merchant | null {
  const host = safeHost(url);
  if (!host) return null;
  if (host.includes("amazon.") || host.includes("amzn.") || host.includes("amzn.to")) return "amazon";
  if (host.includes("flipkart.") || host.includes("fkrt.it")) return "flipkart";
  return null;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extract merchant + product id from a URL without any network call. */
export function parseMerchantUrl(rawUrl: string): ResolvedUrl | null {
  const url = rawUrl.trim();
  const merchant = detectMerchant(url);
  if (!merchant) return null;

  const host = safeHost(url) ?? "";
  const isShortlink = host.includes("amzn.to") || host.includes("fkrt.it") || host.includes("amzn.in");

  if (merchant === "amazon") {
    const m = url.match(ASIN_RE);
    const bare = url.split(/[/?]/).find((s) => ASIN_BARE_RE.test(s));
    const asin = (m?.[1] || bare || "").toUpperCase();
    if (!asin) return null;
    return {
      merchant: "amazon",
      merchantProductId: asin,
      canonicalUrl: `https://www.amazon.in/dp/${asin}`,
      isShortlink,
    };
  }

  const pid = url.match(FK_PID_RE)?.[1];
  const itm = url.match(FK_ITM_RE)?.[1];
  const id = pid || itm;
  if (!id) return null;
  return {
    merchant: "flipkart",
    merchantProductId: id,
    canonicalUrl: pid
      ? `https://www.flipkart.com/x/p/itm?pid=${pid}`
      : `https://www.flipkart.com/x/p/${id}`,
    isShortlink,
  };
}

export function isSupportedUrl(url: string): boolean {
  return detectMerchant(url) !== null;
}

export function affiliateUrl(merchant: Merchant, url: string, tag: string, channel: string): string {
  const clean = stripTracking(url);
  try {
    if (merchant === "amazon") {
      const u = new URL(clean);
      u.searchParams.set("tag", tag);
      u.searchParams.set("linkCode", "ogi");
      u.searchParams.set("language", "en_IN");
      return u.toString();
    }
    // Flipkart & other merchants route through the Cuelinks affiliate channel.
    return `https://linksredirect.com/?cid=${channel}&source=linkShare&url=${encodeURIComponent(clean)}`;
  } catch {
    return clean;
  }
}

export function stripTracking(url: string): string {
  try {
    const u = new URL(url);
    const drop = [
      "ref", "ref_", "tag", "linkCode", "linkId", "psc", "pd_rd_i", "pd_rd_r", "pd_rd_w",
      "pd_rd_wg", "pf_rd_p", "pf_rd_r", "qid", "sr", "sprefix", "crid", "keywords",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "affid",
      "affExtParam1", "affExtParam2", "marketplace", "lid", "otracker", "otracker1", "icu",
    ];
    drop.forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return url;
  }
}
