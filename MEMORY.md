# DealSense — Memory / Current State

> Living document. Update it as the project moves so the next session starts with context.

## What exists

- **App:** Next.js 15 (App Router) + TypeScript + Tailwind v4 + Framer Motion.
- **DB:** libSQL/Turso via Drizzle. Zero-config locally (`./data/dealsense.db`), free in prod.
- **Engine:** resolver → provider chain → extractors → identity → observations → bundle → verdict → alerts.
- **Design:** rebuilt to the DealSense 1.0 language (light-first, emerald, dark terminal chart card,
  store pills, evidence-labelled verdict). See `DESIGN.md`.
- **Tests:** `npm test` → **25 passing** (`tests/engine.test.ts`).
- **Build:** `npm run build` passes.

## Verified working (real network)

- **Amazon.in** — live price, MRP, rating, stock, images. Fixed Amazon's missing-decimal quirk
  (`₹15,99900` → ₹15,999) and the new PUIS search layout.
- **Flipkart** — live price, MRP, rating, review count, images via Flipkart's own page API
  (`POST /api/4/page/fetch`). Throttled (2.5s) + cached (10 min). No key needed.
- **Historical price** — PriceHistory.ai public catalogue + server-rendered product pages give
  the real price series. Samsung Galaxy S25 Ultra: **239 points spanning 20 months**. Imported
  series are persisted in our own `observations` table (`source = "imported"`) so each product is
  fetched from the provider at most once. Exact product-id match only.
- **Live search** — Amazon HTML parse + Flipkart page API, real titles/ratings/images; price
  resolves when the user opens the product.
- **Cross-store matching** — 3+ genuine pairs, e.g. vivo T5 Lite 44W 5G: Flipkart ₹22,999 vs
  Amazon ₹27,100. Verified pairs only — a wrong comparison is worse than none.
- **Out-of-stock** products correctly return no price.

## Known limitations

1. Amazon **search** loads prices via JS, so search results show title/rating/image and the price
   resolves on click. (Product pages extract price fine.)
2. Amazon search relevance is imperfect when hunting rivals — a wrong product is rejected by
   `isSameProduct`, so it just doesn't pair.
3. PriceHistory.ai does not track every product — roughly 1 in 3 of our catalogue matched. Where
   they have no data we fall back to our own observations + category market context.
4. Playwright is a slow last-resort fallback, not the primary path.
5. Fresh products show **"not enough data"** by design until a series is imported or collected.
6. **ScrapingAnt's free tier blocks Amazon/Flipkart** — do not rely on it.
7. PriceHistory.app's API returns 403 without an official key; Keepa's API is paid (€49/mo).

## Key decisions

- **Truth over coverage.** No synthetic history, ever. Failure ≠ data.
- **Imported history is real, cached, and attributed.** We fetch once, store it as our own
  observation, and label the source on the page. Exact product-id match only.
- **Market context** is the answer to "history for any product": the real typical price band for
  the category, computed from everything we have verified.
- **Evidence labels** — every claim is tagged VERIFIED FACT / CALCULATION / MARKET CONTEXT /
  RECOMMENDATION. This is the trust moat.
- **Conflict-rule variant matching** — a spec stated on one side only is not a conflict.
- **Atomic alert claim** + dispatch-after-commit.
- **Light-first** design; dark theme available.

## Environment variables

See `.env.example`. Minimum for production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AMAZON_TAG`, `NEXT_PUBLIC_CUELINKS_CHANNEL`.
Optional: `KEEPA_API_KEY` / `PRICEHISTORY_API_KEY` + `PRICEHISTORY_API_URL` for external history.

## Next step

Pick one:
- Add email alerts (Resend) — small, high value.
- Add a `llms.txt` + richer programmatic SEO pages.
- Ship the Chrome extension as a thin client of `/api/analyze`.
