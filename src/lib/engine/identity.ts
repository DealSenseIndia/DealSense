/**
 * Product identity — matches the SAME real-world item across stores while
 * refusing to match genuinely different variants (128GB ≠ 256GB, 6GB RAM ≠ 8GB).
 *
 * Strategy:
 *  1. Build a stable key from brand + model words (parentheticals, colours and
 *     spec lists stripped) plus storage/connectivity tokens.
 *  2. For comparison, use a *conflict* rule: two titles conflict only when they
 *     both state a spec and disagree. A spec present on one side only is not a
 *     conflict (stores list specs inconsistently).
 */

const STOPWORDS = new Set([
  "the", "and", "with", "for", "new", "latest", "edition", "model", "series",
  "smartphone", "mobile", "phone", "inch", "inches", "cm", "gb", "tb", "mb",
  "storage", "ram", "rom", "memory", "internal", "capacity", "variant", "version",
  "black", "white", "blue", "red", "green", "grey", "gray", "silver", "gold",
  "midnight", "starlight", "titanium", "graphite", "purple", "pink", "yellow",
  "amazon", "flipkart", "special", "offer", "buy", "online", "india", "free",
  "delivery", "shipping", "combo", "pack", "set", "colour", "color",
]);

/** Storage tokens (GB/TB), excluding RAM. */
export function storageOf(title: string): string[] {
  const t = title.toLowerCase().replace(/\b\d{1,3}\s?gb\s?ram\b/g, " ");
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(\d{2,4})\s?(gb|tb)\b/g)) out.add(`${m[1]}${m[2]}`);
  return [...out].sort();
}

/** RAM tokens, e.g. "6GB RAM" → "6gb". */
export function ramOf(title: string): string[] {
  const t = title.toLowerCase();
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(\d{1,3})\s?gb\s?ram\b/g)) out.add(`${m[1]}gb`);
  return [...out].sort();
}

/** Stable variant tokens used in the identity key (storage + connectivity + size). */
export function variantTokens(title: string): string[] {
  const t = title.toLowerCase();
  const tokens = new Set<string>(storageOf(title));
  const scan = (re: RegExp) => {
    for (const m of t.matchAll(re)) tokens.add(m[0].replace(/\s+/g, ""));
  };
  scan(/\b5g\b/g);
  scan(/\b4g\b/g);
  scan(/\b(gen|generation)\s?\d+\b/g);
  scan(/\b(mk|mark)\s?\d+\b/g);
  scan(/\b\d{2,3}(?:\.\d+)?\s?(?:mm|inch|")\b/g);
  return [...tokens].sort();
}

/** Reduce a marketplace title to its stable model words. */
export function modelWords(title: string): string[] {
  const base = title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop parentheticals (colour, specs)
    .split(/[|:]/)[0] // drop "| Free delivery" / ": 5G Mobile Phone…"
    .split(",")[0] // drop ", 40 Hours Battery, Dual Pair…"
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d{2,4}\s?(gb|tb)\b/g, " ") // capacity handled as a variant
    .replace(/\b\d{1,3}\s?gb\s?ram\b/g, " ");

  return base
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** The brand is the first meaningful word of the title. */
export function brandOf(title: string): string | null {
  const w = modelWords(title)[0];
  return w ?? null;
}

/**
 * 0–1 similarity of two product titles, based on shared model words.
 * Used to confirm a cross-store match before we claim two listings are
 * the same product.
 */
export function titleSimilarity(a: string, b: string): number {
  const wa = new Set(modelWords(a));
  const wb = new Set(modelWords(b));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.min(wa.size, wb.size);
}

/** Words that indicate an accessory rather than the product itself. */
const ACCESSORY_WORDS = [
  "cover", "case", "casing", "sleeve", "pouch", "holder", "stand", "mount",
  "charger", "cable", "adapter", "protector", "guard", "tempered", "skin",
  "strap", "band", "sticker", "refill", "spare", "replacement", "compatible",
  "for", "fits", "screen", "back", "front",
];

/** True when the title clearly describes an accessory, not the product. */
export function isAccessory(title: string): boolean {
  const t = ` ${title.toLowerCase()} `;
  return ACCESSORY_WORDS.some((w) => t.includes(` ${w} `) || t.includes(`${w} `) || t.includes(` ${w}`));
}

/**
 * True when two listings are confidently the same product.
 *
 * Deliberately strict: a wrong comparison is worse than no comparison.
 *  - brands must match
 *  - a stated storage/RAM spec must be stated on BOTH sides and agree
 *  - neither side may be an accessory
 *  - model words must overlap substantially
 */
export function isSameProduct(a: string, b: string): boolean {
  if (isAccessory(a) || isAccessory(b)) return false;

  const ba = brandOf(a);
  const bb = brandOf(b);
  if (ba && bb && ba !== bb) return false;

  // A device spec stated on one side only means we cannot confirm the match.
  const sa = storageOf(a);
  const sb = storageOf(b);
  if (sa.length !== sb.length) return false;
  if (sa.length && sa.join("|") !== sb.join("|")) return false;

  const ra = ramOf(a);
  const rb = ramOf(b);
  if (ra.length && rb.length && ra.join("|") !== rb.join("|")) return false;

  return titleSimilarity(a, b) >= 0.6;
}

export function buildIdentityKey(title: string): string {
  const variants = variantTokens(title);
  const words = modelWords(title).filter(
    (w) => !variants.some((v) => v === w || w.includes(v) || v.includes(w)),
  );
  const core = Array.from(new Set(words)).slice(0, 4);
  return [...core, ...variants].join("-").slice(0, 120);
}

/** True unless the two titles state the same spec with different values. */
export function sameVariant(a: string, b: string): boolean {
  const sa = storageOf(a);
  const sb = storageOf(b);
  if (sa.length && sb.length && sa.join("|") !== sb.join("|")) return false;

  const ra = ramOf(a);
  const rb = ramOf(b);
  if (ra.length && rb.length && ra.join("|") !== rb.join("|")) return false;

  return true;
}
