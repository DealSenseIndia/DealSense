/**
 * Product identity — used to match the SAME real-world item across stores
 * while refusing to match different variants (128GB vs 256GB, colours, etc.).
 */

const STOPWORDS = new Set([
  "the", "and", "with", "for", "new", "latest", "edition", "model", "series",
  "smartphone", "mobile", "phone", "inch", "inches", "cm", "gb", "tb", "mb",
  "black", "white", "blue", "red", "green", "grey", "gray", "silver", "gold",
  "midnight", "starlight", "titanium", "graphite", "purple", "pink", "yellow",
  "amazon", "flipkart", "special", "offer", "buy", "online", "india", "free",
  "delivery", "shipping", "combo", "pack", "set",
]);

/** Extract meaningful variant tokens (capacity, connectivity, generation…). */
export function variantTokens(title: string): string[] {
  const t = title.toLowerCase();
  const tokens = new Set<string>();
  const push = (re: RegExp) => {
    const m = t.match(re);
    if (m) tokens.add(m[0].replace(/\s+/g, ""));
  };
  push(/\b\d{2,4}\s?(gb|tb)\b/g); // 128GB, 1TB
  push(/\b\d{1,2}\s?gb\s?ram\b/g); // 8GB RAM
  push(/\b5g\b/g);
  push(/\b4g\b/g);
  push(/\b(gen|generation)\s?\d+\b/g);
  push(/\b(mk|mark)\s?\d+\b/g);
  push(/\b\d{2,3}\s?(mm|inch|")\b/g); // sizes
  push(/\b(wi-?fi|cellular|gps)\b/g);
  return Array.from(tokens).sort();
}

/** A stable key for matching the same product across merchants. */
export function buildIdentityKey(title: string): string {
  const variants = variantTokens(title);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 1 &&
        !STOPWORDS.has(w) &&
        !/^\d+$/.test(w) &&
        // Drop words that are just a variant token (e.g. "128gb") — they are appended below.
        !variants.some((v) => v === w || w.includes(v) || v.includes(w)),
    );

  const core = Array.from(new Set(words)).slice(0, 6);
  return [...core, ...variants].join("-").slice(0, 120);
}

/** True only when both titles clearly describe the same variant. */
export function sameVariant(a: string, b: string): boolean {
  const va = variantTokens(a);
  const vb = variantTokens(b);
  if (!va.length && !vb.length) return true;
  if (va.length !== vb.length) return false;
  return va.every((t, i) => t === vb[i]);
}
