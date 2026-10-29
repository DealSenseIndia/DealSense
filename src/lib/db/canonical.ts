/**
 * SQL for "this row is the canonical one among case-insensitive merchant ids".
 *
 * Flipkart ids are case-insensitive, but the unique index is not. Keep exactly
 * one row per (merchant, lower(merchant_product_id)): the row with the latest
 * successful check, ties by the lower id. The other row is excluded from the
 * refresh queue so a never-advanced twin cannot head-of-line block the worker.
 *
 * The table aliases are internal constants, never user input. They are
 * parameters so the same predicate can be used with `listings` or an alias.
 */
export function canonicalListingWhere(outer = "listings", twin = "twin"): string {
  const safe = (name: string) => (/^[a-z_][a-z0-9_]*$/i.test(name) ? name : "listings");
  const o = safe(outer);
  const t = safe(twin);
  return `NOT EXISTS (
    SELECT 1 FROM listings ${t}
    WHERE ${t}.merchant = ${o}.merchant
      AND ${t}.id <> ${o}.id
      AND lower(${t}.merchant_product_id) = lower(${o}.merchant_product_id)
      AND (
        COALESCE(${t}.last_checked_at, 0) > COALESCE(${o}.last_checked_at, 0)
        OR (
          COALESCE(${t}.last_checked_at, 0) = COALESCE(${o}.last_checked_at, 0)
          AND ${t}.id < ${o}.id
        )
      )
  )`;
}
