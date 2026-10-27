import { client, ensureSchema } from "./db/client";
import { addObservation, uid, upsertListing, upsertProduct } from "./db/queries";
import { fetchPriceHistoryAiFor } from "./engine/providers/pricehistoryAi";
import { publishFromFreshImport, publishFromLead } from "./live";
import { slugify } from "./utils";

/**
 * Lead ingestion.
 *
 * A public deal channel tells us *where to look*; it never provides the facts.
 * We read the Telegram web preview of a handful of channels, take only outbound
 * links, resolve them to a store product id, and then use our own provider to
 * fetch the price history. Nothing is copied: no title, image, text or
 * affiliate link from the source ever reaches the site. If the product is not
 * already tracked and has no real history, it is dropped.
 *
 * Sources are deliberately few and public. Each run fetches one page per
 * channel and processes at most a couple of new links, which keeps the crawl
 * polite and the provider quota intact. "Processed" counts attempts, not
 * successes — an unresolved link still costs a fetch and must consume budget.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export const LEAD_SOURCES = [
  { key: "idoffers", url: "https://t.me/s/idoffers" },
  { key: "flipshope", url: "https://t.me/s/flipshope" },
] as const;

const ALLOWED_HOSTS = [
  "link.amazon",
  "amzn.to",
  "amzn.in",
  "amazon.in",
  "dl.flipkart.com",
  "flipkart.com",
  "fkrt.it",
  "mynt.ro",
  "myntra.com",
  "amznn.cc",
  "fpkrt.cc",
  "mytr.cc",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#33;/g, "!")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/");
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

function linksFrom(html: string): string[] {
  const out = new Set<string>();
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const raw = decode(match[1]);
    if (!/^https?:\/\//i.test(raw)) continue;
    try {
      const host = new URL(raw).hostname.replace(/^www\./, "");
      if (ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
        out.add(raw);
      }
    } catch {
      /* malformed link */
    }
  }
  return [...out];
}

function isStoreHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.endsWith("amazon.in") || host.endsWith("flipkart.com") || host.endsWith("myntra.com");
  } catch {
    return false;
  }
}

/** A meta-refresh, canonical or og:url hop. Some shorteners use HTML, not 30x. */
function htmlRedirect(html: string, base: string): string | null {
  const meta = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'\s>]+)/i);
  const candidates = [
    meta?.[1],
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1],
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)?.[1],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const next = new URL(decode(raw), base).toString();
      if (/^https?:\/\//i.test(next) && next !== base) return next;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function pageTitle(html: string | null): string | undefined {
  if (!html) return undefined;
  const raw = html.match(/<title[^>]*>([^<]{8,300})<\/title>/i)?.[1];
  if (!raw) return undefined;
  const title = decode(raw)
    .replace(/\s*[|\-–]\s*(Amazon\.in|Flipkart\.com|Myntra|Online Shopping.*)$/i, "")
    .trim();
  if (title.length < 12 || /^(amazon|flipkart|myntra|access denied|attention required)/i.test(title)) {
    return undefined;
  }
  return title;
}

/**
 * Follow HTTP redirects, then one HTML meta/canonical hop if the landing page
 * is an intermediate host. Returns the final URL and, when cheap, its HTML.
 */
async function resolve(url: string): Promise<{ url: string; html: string | null }> {
  let current = url;
  let html: string | null = null;
  for (let hop = 0; hop < 6; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
    } catch {
      return { url: current, html };
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      try {
        current = new URL(location, current).toString();
      } catch {
        return { url: current, html };
      }
      continue;
    }
    if (res.ok) {
      html = await res.text().catch(() => null);
      if (html && !isStoreHost(current)) {
        const next = htmlRedirect(html, current);
        if (next) {
          current = next;
          continue;
        }
      }
    }
    return { url: current, html };
  }
  return { url: current, html };
}

interface Identity {
  merchant: "amazon" | "flipkart" | "myntra";
  pid: string;
  url: string;
}

/** Turn a resolved store URL into a merchant + product id, stripping tracking. */
function identify(raw: string): Identity | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");

  if (host.endsWith("amazon.in")) {
    const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (!match) return null;
    const asin = match[1].toUpperCase();
    return { merchant: "amazon", pid: asin, url: `https://www.amazon.in/dp/${asin}` };
  }
  if (host.endsWith("flipkart.com")) {
    const pid = url.searchParams.get("pid");
    const itm = url.pathname.match(/\/p\/(itm[a-z0-9]+)/i);
    if (!pid || !itm) return null;
    return {
      merchant: "flipkart",
      pid: pid.toUpperCase(),
      // Flipkart needs the slug path; /p/itm… alone returns a 404.
      url: `https://www.flipkart.com${url.pathname}?pid=${pid}`,
    };
  }
  if (host.endsWith("myntra.com")) {
    const match = url.pathname.match(/\/(\d{6,})/);
    if (!match) return null;
    return { merchant: "myntra", pid: match[1], url: `https://www.myntra.com/${match[1]}` };
  }
  return null;
}

async function findListing(merchant: string, pid: string): Promise<string | null> {
  const res = await client.execute({
    sql: `SELECT id FROM listings WHERE merchant = ? AND merchant_product_id = ? LIMIT 1`,
    args: [merchant, pid],
  });
  const row = res.rows[0];
  return row ? String(row.id) : null;
}

async function seen(url: string): Promise<boolean> {
  const res = await client.execute({
    sql: `SELECT 1 FROM events WHERE type = 'live_lead' AND json_extract(payload, '$.url') = ? LIMIT 1`,
    args: [url],
  });
  return res.rows.length > 0;
}

async function recordLead(input: {
  url: string;
  source: string;
  outcome: string;
  listingId: string | null;
  price: number | null;
  merchant?: string;
  pid?: string;
}) {
  await client
    .execute({
      sql: `INSERT INTO events (id, type, payload, created_at) VALUES (?, 'live_lead', ?, ?)`,
      args: [uid(), JSON.stringify(input), Date.now()],
    })
    .catch(() => {});
}

/** Fetch a lead's history ourselves and create the product only if it is real. */
async function importLead(identity: Identity, titleHint?: string) {
  const ext = await fetchPriceHistoryAiFor(identity.merchant, identity.pid, titleHint);
  if (!ext || ext.points.length < 4) return { outcome: "no-history", listingId: null };
  const product = ext.product;
  if (!product?.title) return { outcome: "no-product", listingId: null };

  const slug = `${slugify(product.title).slice(0, 68)}-${product.id ?? identity.pid}`;
  const created = await upsertProduct({
    slug,
    title: product.title,
    brand: product.brand,
    category: product.category,
    imageUrl: product.image_url,
    images: product.image_url ? [product.image_url] : [],
    identityKey: null,
  });

  const latest = ext.points[ext.points.length - 1];
  const listing = await upsertListing({
    productId: created.id,
    merchant: identity.merchant,
    merchantProductId: identity.pid,
    url: identity.url,
    title: product.title,
    price: latest.price,
    mrp: product.original_price,
    inStock: product.in_stock,
    rating: product.rating,
    reviewCount: product.review_count,
    imageUrl: product.image_url,
    shipping: 0,
  });

  for (const point of ext.points) {
    if (!Number.isFinite(point.price) || point.price <= 0) continue;
    await addObservation({
      listingId: listing.id,
      price: point.price,
      source: `imported:${ext.provider}`,
      observedAt: point.t,
    });
  }

  return { outcome: "imported", listingId: listing.id };
}

export interface LeadResult {
  source: string;
  url: string;
  merchant?: string;
  pid?: string;
  outcome: string;
  price: number | null;
}

export async function ingestLeads(limit = 3): Promise<LeadResult[]> {
  await ensureSchema();
  const results: LeadResult[] = [];
  let processed = 0;

  for (const source of LEAD_SOURCES) {
    if (processed >= limit) break;
    const html = await fetchHtml(source.url);
    if (!html) {
      results.push({ source: source.key, url: source.url, outcome: "source-unreachable", price: null });
      continue;
    }

    let used = 0;
    for (const link of linksFrom(html)) {
      if (processed >= limit || used >= 2) break;
      if (await seen(link)) continue;

      // An attempt costs a fetch even when it fails, so it counts against the
      // budget before we know whether it will resolve.
      processed++;
      used++;

      const resolved = await resolve(link);
      const identity = identify(resolved.url);
      if (!identity) {
        await recordLead({ url: link, source: source.key, outcome: "unresolved", listingId: null, price: null });
        results.push({ source: source.key, url: link, outcome: "unresolved", price: null });
        continue;
      }

      let listingId = await findListing(identity.merchant, identity.pid);
      let imported = false;
      if (!listingId) {
        const result = await importLead(identity, pageTitle(resolved.html));
        if (!result.listingId) {
          await recordLead({
            url: link,
            source: source.key,
            outcome: result.outcome,
            listingId: null,
            price: null,
            merchant: identity.merchant,
            pid: identity.pid,
          });
          results.push({
            source: source.key,
            url: link,
            merchant: identity.merchant,
            pid: identity.pid,
            outcome: result.outcome,
            price: null,
          });
          continue;
        }
        listingId = result.listingId;
        imported = true;
      }

      const published = imported
        ? await publishFromFreshImport(listingId, `lead:${source.key}`)
        : await publishFromLead(listingId, `lead:${source.key}`);

      await recordLead({
        url: link,
        source: source.key,
        outcome: `${imported ? "imported+" : ""}${published.outcome}`,
        listingId,
        price: published.price,
        merchant: identity.merchant,
        pid: identity.pid,
      });
      results.push({
        source: source.key,
        url: link,
        merchant: identity.merchant,
        pid: identity.pid,
        outcome: `${imported ? "imported+" : ""}${published.outcome}`,
        price: published.price,
      });
      await sleep(800);
    }
  }

  return results;
}
