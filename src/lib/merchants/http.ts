/**
 * Multi-provider page fetcher.
 *
 * Order (first success wins):
 *   1. direct  — plain fetch with browser headers (fast, free, sometimes works)
 *   2. jina    — free reader fallback (renders some JS)
 *   3. provider — a free-tier scraping API if a key is configured
 *      (ScrapingAnt / ScraperAPI / ScrapingBee / ZenRows / custom)
 *   4. playwright — optional local headless browser (self-hosted worker)
 *
 * Every provider returns either HTML (parsed with cheerio) or plain text
 * (parsed with regex). The extractors handle both.
 */

export interface FetchResult {
  content: string;
  format: "html" | "text";
  via: string;
  status: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

export function looksBlocked(html: string): boolean {
  const h = html.slice(0, 40000).toLowerCase();
  if (html.length < 1500) return true;
  return (
    h.includes("enter the characters you see below") ||
    h.includes("/errors/validatecaptcha") ||
    h.includes("type the characters you see in this image") ||
    h.includes("api-services-support@amazon.com") ||
    h.includes("robot check") ||
    h.includes("access denied") ||
    h.includes("request blocked")
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function direct(url: string): Promise<FetchResult | null> {
  try {
    const res = await withTimeout(
      fetch(url, { headers: BASE_HEADERS, redirect: "follow", cache: "no-store" }),
      9000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    return { content: html, format: "html", via: "direct", status: res.status };
  } catch {
    return null;
  }
}

async function jina(url: string): Promise<FetchResult | null> {
  try {
    const res = await withTimeout(
      fetch(`https://r.jina.ai/${url}`, {
        headers: { "X-Return-Format": "html", "User-Agent": UA },
        cache: "no-store",
      }),
      20000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length < 1500) return null;
    return { content: html, format: "html", via: "jina", status: res.status };
  } catch {
    return null;
  }
}

/** Free-tier scraping APIs. Configure one with a single env var. */
async function providerFetch(url: string): Promise<FetchResult | null> {
  const ant = process.env.SCRAPINGANT_API_KEY;
  const scraper = process.env.SCRAPERAPI_KEY;
  const bee = process.env.SCRAPINGBEE_API_KEY;
  const zen = process.env.ZENROWS_API_KEY;
  const custom = process.env.SCRAPER_ENDPOINT;

  try {
    if (ant) {
      const u = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&x-api-key=${ant}&browser=true`;
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 45000);
      if (res.ok) return { content: await res.text(), format: "html", via: "scrapingant", status: res.status };
    }
    if (scraper) {
      const u = `https://api.scraperapi.com/?api_key=${scraper}&url=${encodeURIComponent(url)}&country_code=in`;
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 45000);
      if (res.ok) return { content: await res.text(), format: "html", via: "scraperapi", status: res.status };
    }
    if (bee) {
      const u = `https://app.scrapingbee.com/api/v1/?api_key=${bee}&url=${encodeURIComponent(url)}&render_js=true&country_code=in`;
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 45000);
      if (res.ok) return { content: await res.text(), format: "html", via: "scrapingbee", status: res.status };
    }
    if (zen) {
      const u = `https://api.zenrows.com/v1/?apikey=${zen}&url=${encodeURIComponent(url)}&js_render=true&proxy_country=in`;
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 45000);
      if (res.ok) return { content: await res.text(), format: "html", via: "zenrows", status: res.status };
    }
    if (custom) {
      const u = custom.includes("{url}")
        ? custom.replace("{url}", encodeURIComponent(url))
        : `${custom}${custom.includes("?") ? "&" : "?"}url=${encodeURIComponent(url)}`;
      const res = await withTimeout(fetch(u, { cache: "no-store" }), 45000);
      if (res.ok) return { content: await res.text(), format: "html", via: "custom", status: res.status };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Optional local headless browser (loaded lazily; only if installed). */
let pwBrowserPromise: Promise<import("playwright").Browser> | null = null;

async function getPwBrowser() {
  if (!pwBrowserPromise) {
    pwBrowserPromise = (async () => {
      const mod = (await import(/* webpackIgnore: true */ "playwright")) as typeof import("playwright");
      return mod.chromium.launch({ headless: true });
    })();
  }
  return pwBrowserPromise;
}

export async function closePlaywright() {
  if (pwBrowserPromise) {
    const b = await pwBrowserPromise.catch(() => null);
    await b?.close().catch(() => {});
    pwBrowserPromise = null;
  }
}

async function playwrightFetch(url: string): Promise<FetchResult | null> {
  if (process.env.USE_PLAYWRIGHT !== "1") return null;
  try {
    const browser = await getPwBrowser();
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: "en-IN",
      viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { "Accept-Language": "en-IN,en;q=0.9" },
    });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    try {
      const page = await ctx.newPage();
      // Flipkart rejects cold headless navigations; warm the session first.
      if (url.includes("flipkart.com")) {
        await page
          .goto("https://www.flipkart.com/", { waitUntil: "domcontentloaded", timeout: 25000 })
          .catch(() => {});
        await page.waitForTimeout(1500);
      }
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(2500);
      const html = await page.content();
      return { content: html, format: "html", via: "playwright", status: 200 };
    } finally {
      await ctx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * Yield page candidates in priority order, lazily.
 * The caller extracts each one and stops at the first that yields a real price,
 * escalating to the next provider otherwise.
 */
export async function* fetchCandidates(url: string): AsyncGenerator<FetchResult> {
  const directRes = await direct(url);
  if (directRes && !looksBlocked(directRes.content)) yield directRes;

  const providerRes = await providerFetch(url);
  if (providerRes && !looksBlocked(providerRes.content)) yield providerRes;

  const jinaRes = await jina(url);
  if (jinaRes && !looksBlocked(jinaRes.content)) yield jinaRes;

  const pwRes = await playwrightFetch(url);
  if (pwRes && !looksBlocked(pwRes.content)) yield pwRes;

  // Last resort: hand back a blocked/partial page so the caller can at least
  // surface a title and an honest failure (never a fabricated price).
  if (directRes) yield directRes;
  else if (jinaRes) yield jinaRes;
}

/** Convenience single-shot fetch (used by shortlink expansion / probes). */
export async function fetchPage(url: string): Promise<FetchResult | null> {
  for await (const c of fetchCandidates(url)) return c;
  return null;
}

export async function expandUrl(url: string): Promise<string> {
  try {
    const res = await withTimeout(
      fetch(url, { headers: BASE_HEADERS, redirect: "follow", method: "GET", cache: "no-store" }),
      8000,
    );
    return res.url || url;
  } catch {
    return url;
  }
}
