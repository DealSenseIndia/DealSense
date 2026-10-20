# DealSense — Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router)** | SSR/SEO + API routes in one deployable |
| Language | **TypeScript** | safety across the engine |
| UI | **Tailwind CSS v4** + **Framer Motion** | fast, themeable, motion-native |
| Database | **libSQL / Turso** (SQLite-compatible) | free tier, zero-config locally |
| ORM | **Drizzle** | typed schema + queries |
| Extraction | provider chain + merchant-native APIs | reliable without a budget |
| Search | Amazon HTML parse + Flipkart page API | live search across both stores |
| Hosting | **Vercel** (free) + **GitHub Actions** cron (free) | genuinely free |

## Pipeline

```
POST /api/analyze { url }
        │
        ▼
   resolve merchant + product id           lib/merchants/resolve.ts
        │
        ▼
   fetch (provider chain)                   lib/merchants/http.ts
        │  Amazon  → direct HTML fetch
        │  Flipkart→ own page API (JSON)   lib/merchants/flipkartApi.ts
        ▼
   extract real facts                      lib/merchants/{amazon,flipkart}.ts
        │
        ▼
   canonical product (identity key)        lib/engine/identity.ts
        │
        ▼
   upsert listing + append observation     lib/db/queries.ts
        │
        ▼
   buildBundle()                           lib/engine/bundle.ts
        │   ├─ our observations
        │   ├─ external provider (Keepa / PriceHistory)   lib/engine/providers.ts
        │   ├─ cross-store proxy (same product, other store)
        │   └─ category market context                    lib/db/market.ts
        ▼
   stats → verdict → landed price → evidence
        │
        ├──► response (AnalysisResult)
        └──► alert evaluation              lib/engine/alerts.ts
                     │
                     ▼
             notification dispatcher        lib/notifications/dispatcher.ts
```

## History resolution (the key idea)

A product DealSense has never tracked still gets a useful, honest description. The engine layers
five sources, in order of trust:

1. **Our own observations** — immutable, timestamped, authoritative.
2. **Imported history** — a real series pulled from a price-history provider (PriceHistory.ai by
   default) and stored permanently in our own `observations` table as `source = "imported"`.
   Fetched once per product, then we own it.
3. **External provider** — Keepa or PriceHistory.app via their official APIs, if a key is set.
4. **Cross-store proxy** — the same product's history from the *other* store.
5. **Category market context** — the real typical price band for that category, computed from
   every listing we have verified. This is always available and always real.

The MRP discount is reported separately as **advertised**, never as verified history.

Provider rules (see `PRICE-HISTORY-SOURCES.md`):
- **Exact product-id match only** — a near-match would attach the wrong product's history.
- **On demand, one product at a time, throttled** — never a bulk harvest.
- **Always attributed** in the UI.
- **Our affiliate links** on every outbound button, never the provider's.

## Data model

```
products ──< listings ──< observations
                  │
                  └──< alerts ──< alert_events
```

- **products** — canonical real-world item (`identity_key` for cross-store matching).
- **listings** — store-specific (Amazon ASIN / Flipkart PID) + current state + scheduling
  (`last_checked_at`, `next_check_at`, `failure_count`, `last_error`).
- **observations** — append-only, immutable, timestamped price points with provenance (`source`).
- **alerts** — the watch, with a state machine and anti-spam fields.
- **alert_events** / **events** — audit + anonymous analytics.

## Identity matching

- `buildIdentityKey` — brand + model words (parentheticals/colours stripped) + storage/connectivity.
- `sameVariant` — **conflict rule**: two titles conflict only when both state a spec and disagree
  (128GB ≠ 256GB, 6GB RAM ≠ 8GB). A spec present on one side only is not a conflict.
- `titleSimilarity` + `isSameProduct` — used to confirm a cross-store match before claiming it.
  A wrong comparison is worse than no comparison.

## Integrity rules (non-negotiable)

1. A failed extraction creates **no** observation. Failure is not data.
2. MRP is `null` if the merchant doesn't provide it — never `price × 1.35`.
3. Ratings/reviews/seller are real or `null` — never invented.
4. Price history is **only** real observations. Fewer than 3 → "not enough data".
5. Freshness comes from the actual `observed_at`, never a process timestamp.
6. Cross-store comparison only for verified same-variant products.

## Alert state machine

```
ARMED ──condition met──► TRIGGERED ──► COOLDOWN ──recovery──► ARMED
  │                                                        (persistent)
  └── after trigger ──► DISABLED                           (single-shot)

PAUSED  ── resume ──► ARMED
```

- The `ARMED → COOLDOWN` transition is an **atomic claim** (`UPDATE … WHERE status='ARMED'`),
  so concurrent evaluations can never double-notify.
- Notification is dispatched **after** the state is committed — a delivery failure never rolls back.
- Recovery threshold: `max(target × 1.02, target + ₹100)`.

## Refresh worker

- Priority tiers: HOT 45m · ACTIVE 3h · NORMAL 10h · COLD 30h.
- Sequential with randomised per-merchant spacing (Amazon 6–10s, Flipkart 5–8s), max 2 concurrent.
- Failure backoff: 5m → 30m → 2h → 8h → 24h pause.
- Never HTTP inside a DB transaction; writes are short.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /` | landing |
| `GET /analyze?url=` | interactive analyzer |
| `GET /deals` | live deals feed |
| `GET /search?q=` | live cross-store product search |
| `GET /categories` | category index built from real data |
| `GET /price-history` | price-history explorer (SEO) |
| `GET /track` | your price alerts |
| `GET /product/[slug]` | SSR product page (SEO + JSON-LD) |
| `POST /api/analyze` | core analysis |
| `GET /api/search` | live product search |
| `GET /api/deals` | feed JSON |
| `GET /api/history/[listingId]` | observation series |
| `GET/POST /api/alerts`, `POST/DELETE /api/alerts/[id]` | alert CRUD |
| `GET /api/cron/refresh` | scheduled refresh (secret-protected) |
| `GET /api/worker/status` | health |
| `POST /api/telegram/webhook` | alert binding |
| `/sitemap.xml`, `/robots.txt` | SEO |
