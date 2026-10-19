import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

/**
 * A single libSQL client.
 * - Local dev:  file:./data/dealsense.db  (zero config)
 * - Production: libsql://…turso.io        (free tier)
 */
function resolveUrl(): string {
  return process.env.TURSO_DATABASE_URL || "file:./data/dealsense.db";
}

function ensureLocalDir(url: string) {
  if (!url.startsWith("file:")) return;
  const path = url.replace(/^file:/, "");
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* ignore */
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __dealsense_client: Client | undefined;
  // eslint-disable-next-line no-var
  var __dealsense_db: LibSQLDatabase<typeof schema> | undefined;
  // eslint-disable-next-line no-var
  var __dealsense_ready: Promise<void> | undefined;
}

const url = resolveUrl();
ensureLocalDir(url);

export const client: Client =
  global.__dealsense_client ??
  createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

export const db: LibSQLDatabase<typeof schema> =
  global.__dealsense_db ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  global.__dealsense_client = client;
  global.__dealsense_db = db;
}

/** Idempotent schema creation so the app works with zero setup. */
const DDL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  image_url TEXT,
  images TEXT,
  specs TEXT,
  identity_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_idx ON products (slug);
CREATE INDEX IF NOT EXISTS products_identity_idx ON products (identity_key);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  merchant_product_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  price REAL,
  mrp REAL,
  currency TEXT NOT NULL DEFAULT 'INR',
  in_stock INTEGER,
  seller TEXT,
  rating REAL,
  review_count INTEGER,
  image_url TEXT,
  shipping REAL,
  last_checked_at INTEGER,
  next_check_at INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_merchant_product_idx ON listings (merchant, merchant_product_id);
CREATE INDEX IF NOT EXISTS listings_product_idx ON listings (product_id);
CREATE INDEX IF NOT EXISTS listings_next_check_idx ON listings (next_check_at);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  price REAL,
  mrp REAL,
  shipping REAL,
  coupon REAL,
  bank_discount REAL,
  effective_price REAL,
  seller TEXT,
  rating REAL,
  review_count INTEGER,
  in_stock INTEGER,
  source TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS observations_listing_idx ON observations (listing_id);
CREATE INDEX IF NOT EXISTS observations_observed_idx ON observations (observed_at);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  alert_type TEXT NOT NULL DEFAULT 'TARGET_PRICE',
  target_price REAL,
  baseline_price REAL,
  target_percent REAL,
  target_score INTEGER,
  status TEXT NOT NULL DEFAULT 'ARMED',
  channel TEXT NOT NULL DEFAULT 'telegram',
  contact TEXT,
  cooldown_until INTEGER,
  last_triggered_at INTEGER,
  last_trigger_price REAL,
  trigger_count INTEGER NOT NULL DEFAULT 0,
  is_persistent INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_listing_idx ON alerts (listing_id);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status);

CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);
`;

export function ensureSchema(): Promise<void> {
  if (!global.__dealsense_ready) {
    global.__dealsense_ready = (async () => {
      await client.execute("PRAGMA journal_mode=WAL;").catch(() => {});
      await client.execute("PRAGMA busy_timeout=5000;").catch(() => {});
      await client.executeMultiple(DDL);
    })();
  }
  return global.__dealsense_ready;
}

export { schema };
