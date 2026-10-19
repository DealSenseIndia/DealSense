import * as cheerio from "cheerio";
import type { ExtractedProduct } from "../types";
import type { FetchResult } from "./http";
import { cleanTitle, extractBrandFromTitle, inferCategory, parseCount, parsePrice, parseRating } from "./parse";

function firstText($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const s of selectors) {
    const t = $(s).first().text().trim();
    if (t) return t;
  }
  return null;
}

function jsonLdProduct($: cheerio.CheerioAPI): Record<string, unknown> | null {
  for (const el of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const t = node?.["@type"];
        if (Array.isArray(t) ? t.includes("Product") : t === "Product") return node as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function extractFlipkart(res: FetchResult, pid: string, url: string): ExtractedProduct {
  const $ = cheerio.load(res.content);
  const ld = jsonLdProduct($);

  const title =
    cleanTitle(firstText($, ["span.VU-ZEz", "h1 span", "h1", "div.B_NuCI"])) ||
    cleanTitle((ld?.name as string) || "") ||
    `Flipkart product ${pid}`;

  let price = parsePrice(
    firstText($, ["div.Nx9bqj.CxhGGd", "div.Nx9bqj", "div._30jeq3._16Jk6d", "div._30jeq3", "div[class*='Nx9bqj']"]),
  );
  if (price === null && ld) {
    const offers = ld.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    price = parsePrice(String(offer?.price ?? ""));
  }
  if (price === null) {
    for (const m of res.content.matchAll(/"price"\s*:\s*"?₹?([\d,]{3,})"?/g)) {
      const n = parsePrice(m[1]);
      if (n && n > 49) {
        price = n;
        break;
      }
    }
  }

  let mrp = parsePrice(
    firstText($, ["div.yRaY8j.A6+E5n", "div.yRaY8j", "div._3I9_wc._2p6lqe", "div._3I9_wc", "div[class*='yRaY8j']"]),
  );
  if (mrp !== null && price !== null && mrp <= price) mrp = null;

  const rating =
    parseRating(firstText($, ["div.XQDdHH", "div._3LWZlK", "div[class*='XQDdHH']"])) ??
    parseRating(String((ld?.aggregateRating as Record<string, unknown>)?.ratingValue ?? ""));

  let reviewCount =
    parseCount(String((ld?.aggregateRating as Record<string, unknown>)?.ratingCount ?? "")) ?? null;
  if (reviewCount === null) {
    reviewCount = parseCount(firstText($, ["span.Wphh3N", "div._2GcJzG", "div._3kF8c2"]));
  }

  let images: string[] = [];
  if (ld?.image) {
    const li = Array.isArray(ld.image) ? (ld.image as string[]) : [ld.image as string];
    images.push(...li.filter((i): i is string => typeof i === "string"));
  }
  const domImgs = $("img._396cs4, img.DByuf4, img[class*='_396cs4'], img[class*='DByuf4'], img[class*='_53J4C-']")
    .toArray()
    .map((el) => $(el).attr("src") || "")
    .filter((s) => s.startsWith("http"));
  images.push(...domImgs);
  images = Array.from(new Set(images)).slice(0, 8);

  const availabilityText = firstText($, ["div._16FRp0", "div.Z8JjpR", "div[class*='_16FRp0']"]);
  let inStock: boolean | null = null;
  if (availabilityText) {
    const a = availabilityText.toLowerCase();
    if (a.includes("sold out") || a.includes("out of stock") || a.includes("coming soon")) inStock = false;
    else if (a.includes("in stock")) inStock = true;
  }
  if (inStock === null) inStock = price !== null ? true : null;

  const seller = firstText($, ["div#sellerName span", "div#sellerName", "div[class*='_1RLviY']"]) || null;

  const breadcrumbs = $("div._1MR4o5 a, div._2whKao a, a.R0cyWM")
    .toArray()
    .map((el) => $(el).text().trim())
    .filter(Boolean);
  const category = breadcrumbs.slice(1).join(" > ") || inferCategory(title);

  const confidence = (title ? 0.3 : 0) + (price !== null ? 0.5 : 0) + (images.length ? 0.2 : 0);

  return {
    merchant: "flipkart",
    merchantProductId: pid,
    url,
    title,
    brand: extractBrandFromTitle(title),
    price,
    mrp,
    currency: "INR",
    inStock,
    rating,
    reviewCount,
    seller,
    imageUrl: images[0] ?? null,
    images,
    category: category || null,
    shipping: null,
    coupon: null,
    extractionMethod: `flipkart_${res.via}`,
    confidence: Math.round(confidence * 100) / 100,
  };
}
