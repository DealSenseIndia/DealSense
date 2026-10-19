# DealSense — Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 15 (App Router)** | SSR/SEO + API routes in one deployable |
| Language | **TypeScript** | safety across the engine |
| UI | **Tailwind CSS v4** + **Framer Motion** | fast, themeable, motion-native |
| Database | **libSQL / Turso** (SQLite-compatible) | free tier, zero-config locally |
| ORM | **Drizzle** | typed schema + queries |
| Extraction | provider chain (direct → reader → free scraping API → Playwright) | reliable without a budget |
| Hosting | **Vercel** (free) + **GitHub Actions** cron (free) | genuinely free |

## Pipeline

```
POST /api/analyze { url }
        │
        ▼
   resolve merchant + product id           lib/merchants/resolve.ts
        │
        ▼
   fetch page (provider chain)             lib/merchants/http.ts
        │
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
   stats + verdict + landed price          lib/engine/{stats,verdict,landedPrice}.ts
        │
        ├──► response (AnalysisResult)
        └──► alert evaluation              lib/engine/alerts.ts
                     │
                     ▼
             notification dispatcher        lib/notifications/dispatcher.ts
```

## Data model

```
products ──< listings ──< observations
                  │
                  └──< alerts ──< alert_events
```

- **products** — canonical real-world item (`identity_key` used for cross-store matching).
- **listings** — store-specific (Amazon ASIN / Flipkart PID) + current state + scheduling
  (`last_checked_at`, `next_check_at`, `failure_count`, `last_error`).
- **observations** — append-only, immutable, timestamped price points with provenance (`source`).
- **alerts** — the watch, with a state machine and anti-spam fields.
- **alert_events** / **events** — audit + anonymous analytics.

## Integrity rules (non-negotiable)

1. A failed extraction creates **no** observation. Failure is not data.
2. MRP is `null` if the merchant doesn't provide it — never `price × 1.35`.
3. Ratings/reviews/seller are real or `null` — never invented.
4. Price history is **only** real observations. Fewer than 3 → "not enough data".
5. Freshness comes from the actual `observed_at`, never a process timestamp.

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
| `GET /product/[slug]` | SSR product page (SEO + JSON-LD) |
| `POST /api/analyze` | core analysis |
| `GET /api/deals` | feed JSON |
| `GET /api/history/[listingId]` | observation series |
| `GET/POST /api/alerts`, `POST/DELETE /api/alerts/[id]` | alert CRUD |
| `GET /api/cron/refresh` | scheduled refresh (secret-protected) |
| `GET /api/worker/status` | health |
| `POST /api/telegram/webhook` | alert binding |
| `/sitemap.xml`, `/robots.txt` | SEO |
