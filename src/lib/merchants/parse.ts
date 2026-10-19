/** Small parsers shared by all merchant extractors. */

export function parsePrice(input: string | null | undefined): number | null {
  if (!input) return null;
  const cleaned = input.replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Guard against obviously bogus values (e.g. EMI fragments).
  if (n > 100_00_00_000) return null;
  return Math.round(n * 100) / 100;
}

export function parseCount(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = input.replace(/,/g, "").match(/(\d[\d.]*)\s*([kKmM])?/);
  if (!m) return null;
  let n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2]?.toLowerCase() === "k") n *= 1000;
  if (m[2]?.toLowerCase() === "m") n *= 1_000_000;
  return Math.round(n);
}

export function parseRating(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = input.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

export function absolute(url: string | null | undefined, base?: string): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http")) return url;
  if (base) {
    try {
      return new URL(url, base).toString();
    } catch {
      return null;
    }
  }
  return null;
}

export function cleanTitle(t: string | null | undefined): string {
  if (!t) return "";
  return t.replace(/\s+/g, " ").replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim();
}

export function extractBrandFromTitle(title: string): string | null {
  if (!title) return null;
  const first = title.split(/[\s,|–—-]/)[0];
  if (first && first.length >= 2 && first.length <= 20 && /^[A-Za-z]/.test(first)) {
    return first;
  }
  return null;
}

/** Best-effort category inference from a title when the page gives none. */
const CATEGORY_HINTS: Array<[RegExp, string]> = [
  [/\b(iphone|galaxy|redmi|realme|poco|oneplus|smartphone|mobile phone|5g phone)\b/i, "Smartphones"],
  [/\b(laptop|notebook|macbook|ultrabook|chromebook)\b/i, "Laptops"],
  [/\b(monitor|display|144hz|165hz)\b/i, "Monitors"],
  [/\b(tv|television|smart tv|oled|qled)\b/i, "Televisions"],
  [/\b(headphone|earbuds?|earphone|airpods|neckband|headset|speakers?|soundbar|tws)/i, "Audio"],
  [/\b(camera|dslr|mirrorless|gopro|webcam)\b/i, "Cameras"],
  [/\b(watch|smartwatch|fitness band)\b/i, "Wearables"],
  [/\b(console|playstation|xbox|gaming|controller|gpu|graphics card)\b/i, "Gaming"],
  [/\b(fridge|refrigerator|washing machine|ac|air conditioner|microwave|dishwasher)\b/i, "Appliances"],
  [/\b(shoe|sneaker|shirt|tshirt|jeans|kurta|dress|saree|jacket)\b/i, "Fashion"],
  [/\b(cream|serum|shampoo|lipstick|perfume|sunscreen)\b/i, "Beauty"],
  [/\b(book|novel|kindle)\b/i, "Books"],
  [/\b(chair|desk|sofa|mattress|bed|table|lamp)\b/i, "Home"],
  [/\b(power bank|charger|cable|adapter|router|ssd|hard drive|pendrive)\b/i, "Accessories"],
];

export function inferCategory(title: string): string | null {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(title)) return cat;
  return null;
}
