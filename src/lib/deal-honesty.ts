/**
 * Display-side honesty rules.
 *
 * These live outside the database layer on purpose: they decide what the UI is
 * allowed to *claim*, not what the database holds. Nothing here edits a row —
 * it drops a claim that the recorded data cannot support.
 *
 * Kept dependency-free and deterministic (`now` is always passed in) so the
 * zero-live and inflated-MRP cases can be unit tested without a database.
 */

/** A store check is only "live" for this long. Mirrors the feed's own TTL. */
export const LIVE_WINDOW_MS = 20 * 60 * 1000;

/**
 * The highest MRP-to-price ratio we will render as a discount.
 *
 * Five times the asking price is 80% off, the top of the believable band for
 * Indian retail. Above that the MRP is a seller placeholder, not a reference
 * price: production holds listings at 10× and even 100× (₹8,990 against
 * ₹8,99,000), and rendering those produces "99% off" badges that are false.
 */
export const MAX_MRP_MULTIPLE = 5;

/** The discount that earns the "Hot" badge on a deal card. */
export const HOT_DISCOUNT_MIN = 20;

/** Was a store check made recently enough to call itself live? */
export function isLiveCheck(ts: number | null | undefined, now: number): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return false;
  const age = now - ts;
  return age >= 0 && age <= LIVE_WINDOW_MS;
}

/** "just now", "14m ago", "3h ago", "13d ago" — never a fabricated value. */
export function ageLabel(ts: number | null | undefined, now: number): string {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return "never";
  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A full sentence for a section header: "last checked 13d ago". */
export function trackedAgeLabel(ts: number | null | undefined, now: number): string {
  return typeof ts === "number" && Number.isFinite(ts) && ts > 0
    ? `last checked ${ageLabel(ts, now)}`
    : "no store check on record";
}

/** The same, for a shelf whose rows carry recorded prices rather than checks. */
export function recordedAgeLabel(ts: number | null | undefined, now: number): string {
  return typeof ts === "number" && Number.isFinite(ts) && ts > 0
    ? `newest record ${ageLabel(ts, now)}`
    : "no recorded price";
}

/**
 * The MRP we are willing to show, or null when the recorded value is not a
 * believable reference price. An MRP at or below the asking price is not a
 * discount at all, and one above `MAX_MRP_MULTIPLE` is a placeholder.
 */
export function saneMrp(price: number | null | undefined, mrp: number | null | undefined): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  if (typeof mrp !== "number" || !Number.isFinite(mrp) || mrp <= price) return null;
  if (mrp > price * MAX_MRP_MULTIPLE) return null;
  return mrp;
}

/** Whole-percent discount against a believable MRP; 0 when there is none. */
export function discountFromMrp(price: number | null | undefined, mrp: number | null | undefined): number {
  const base = saneMrp(price, mrp);
  if (base === null || typeof price !== "number") return 0;
  return Math.round(((base - price) / base) * 100);
}

/** Whether the recorded MRP supports a "Hot" badge. */
export function isHotDeal(
  price: number | null | undefined,
  mrp: number | null | undefined,
  min = HOT_DISCOUNT_MIN,
): boolean {
  return discountFromMrp(price, mrp) >= min;
}
