import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/** Canonical product (a real-world item, independent of store). */
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    brand: text("brand"),
    category: text("category"),
    imageUrl: text("image_url"),
    images: text("images"), // JSON array
    specs: text("specs"), // JSON object
    identityKey: text("identity_key"), // normalized match key across merchants
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("products_slug_idx").on(t.slug),
    identityIdx: index("products_identity_idx").on(t.identityKey),
  }),
);

/** A store-specific listing for a product (Amazon ASIN, Flipkart PID…). */
export const listings = sqliteTable(
  "listings",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    merchant: text("merchant").notNull(),
    merchantProductId: text("merchant_product_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    price: real("price"),
    mrp: real("mrp"),
    currency: text("currency").notNull().default("INR"),
    inStock: integer("in_stock", { mode: "boolean" }),
    seller: text("seller"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    imageUrl: text("image_url"),
    shipping: real("shipping"),
    lastCheckedAt: integer("last_checked_at"),
    nextCheckAt: integer("next_check_at"),
    failureCount: integer("failure_count").notNull().default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    merchantProductIdx: uniqueIndex("listings_merchant_product_idx").on(
      t.merchant,
      t.merchantProductId,
    ),
    productIdx: index("listings_product_idx").on(t.productId),
    nextCheckIdx: index("listings_next_check_idx").on(t.nextCheckAt),
  }),
);

/** Append-only, immutable price observation. The heart of DealSense. */
export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull(),
    price: real("price"),
    mrp: real("mrp"),
    shipping: real("shipping"),
    coupon: real("coupon"),
    bankDiscount: real("bank_discount"),
    effectivePrice: real("effective_price"),
    seller: text("seller"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    inStock: integer("in_stock", { mode: "boolean" }),
    source: text("source").notNull(),
    observedAt: integer("observed_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    listingIdx: index("observations_listing_idx").on(t.listingId),
    observedIdx: index("observations_observed_idx").on(t.observedAt),
  }),
);

/** A user's price watch on a listing. */
export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    listingId: text("listing_id").notNull(),
    alertType: text("alert_type").notNull().default("TARGET_PRICE"),
    targetPrice: real("target_price"),
    baselinePrice: real("baseline_price"),
    targetPercent: real("target_percent"),
    targetScore: integer("target_score"),
    status: text("status").notNull().default("ARMED"),
    channel: text("channel").notNull().default("telegram"),
    contact: text("contact"),
    cooldownUntil: integer("cooldown_until"),
    lastTriggeredAt: integer("last_triggered_at"),
    lastTriggerPrice: real("last_trigger_price"),
    triggerCount: integer("trigger_count").notNull().default(0),
    isPersistent: integer("is_persistent", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => ({
    listingIdx: index("alerts_listing_idx").on(t.listingId),
    statusIdx: index("alerts_status_idx").on(t.status),
  }),
);

/** Immutable record of a triggered alert (for analytics + delivery audit). */
export const alertEvents = sqliteTable("alert_events", {
  id: text("id").primaryKey(),
  alertId: text("alert_id").notNull(),
  type: text("type").notNull(),
  payload: text("payload"),
  createdAt: integer("created_at").notNull(),
});

/** Lightweight product analytics (no PII). */
export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payload: text("payload"),
  createdAt: integer("created_at").notNull(),
});
