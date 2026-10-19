# DealSense — Memory / Current State

> Living document. Update it as the project moves so the next session starts with context.

## What exists

- **App:** Next.js 15 (App Router) + TypeScript + Tailwind v4 + Framer Motion.
- **DB:** libSQL/Turso via Drizzle. Zero-config locally (`./data/dealsense.db`), free in prod.
- **Engine:** resolver → provider chain → extractors → identity → observations → verdict → alerts.
- **Tests:** `npm test` → **25 passing** (`tests/engine.test.ts`), covering URL parsing, price parsing
  (incl. Amazon's `₹15,99900` quirk), identity/variant matching, stats, verdict, landed price and
  alert conditions.
- **Build:** `npm run build` passes (static + dynamic routes).

## Verified working (real network)

- Amazon.in: live price, MRP, rating, stock, images extracted successfully for in-stock products
  (verified against bestseller ASINs). Prices are correct after fixing Amazon's missing decimal.
- End-to-end: `analyzeUrl` → product + listing + observation persisted → verdict computed.
  With history, produced a correct **BUY 92/100** with human-readable reasons.
- Out-of-stock products correctly return no price (honest behaviour, not a bug).

## Known limitations

1. **Flipkart blocks server + headless requests** (redirects to homepage / HTTP 500).
   → Fix: set a free scraping key (`SCRAPINGANT_API_KEY` etc.) in `.env.local`. The provider chain
   uses it automatically. Cross-store comparison appears once Flipkart data is available.
2. **Playwright is slow (~2–8s/request)** and heavy for serverless. It is intended for the local
   refresh worker (`USE_PLAYWRIGHT=1`), not Vercel.
3. Fresh products start at **"not enough data"** (by design). A verdict forms after ~3 real
   observations, which the worker collects within a few hours.

## Key decisions

- **Truth over coverage.** No synthetic history, ever. Failure ≠ data.
- **Provider chain**, not a single scraper — reliability without a budget.
- **Atomic alert claim** (`UPDATE … WHERE status='ARMED'`) to prevent double notifications.
- **Dispatch after commit** — a delivery failure never rolls back alert state.
- **Observation policy:** record when the price changes, when ≥6h have passed, or while bootstrapping
  (<3 observations) with a 5-minute minimum spacing.
- **Dark-first** design; light theme available.

## Environment variables

See `.env.example`. Minimum for production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`NEXT_PUBLIC_SITE_URL`, `SCRAPINGANT_API_KEY`, `NEXT_PUBLIC_AMAZON_TAG`, `NEXT_PUBLIC_CUELINKS_CHANNEL`.

## Next step

Pick one:
- Add email alerts (Resend) — small, high value.
- Add a second scraping provider + retry/rotation for Flipkart reliability.
- Ship the Chrome extension as a thin client of `/api/analyze`.
