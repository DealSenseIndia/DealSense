# DealSense — Memory / Current State

> Living document. Update it as the project moves so the next session starts with context.

## What exists

- **App:** Next.js 15 (App Router) + TypeScript + Tailwind v4 + Framer Motion.
- **DB:** libSQL/Turso via Drizzle. Zero-config locally (`./data/dealsense.db`), free in prod.
- **Engine:** resolver → provider chain → extractors → identity → observations → bundle → verdict → alerts.
- **Design:** rebuilt to the DealSense 1.0 language (light-first, emerald, dark terminal chart card,
  store pills, evidence-labelled verdict). See `DESIGN.md`.
- **Tests:** `npm test` → **31 passing** (`tests/engine.test.ts`).
- **Build:** `npm run build` passes. All 13 routes return 200.
- **Catalogue:** 242 products / 299 listings / 32,805 recorded price points across
  Amazon, Flipkart, Myntra and Tata CLiQ. Every point is a real observation.

## Homepage (current)

The hero is the DealSense 1.0 layout, rebuilt on the DealWise visual language:

- Green trust badge "India's Most Trusted Shopping Intelligence Platform".
- Headline "Shop smarter. / Save bigger." with the two key words in emerald.
- Sub-copy: "Track price history, compare across stores, get price drop alerts and know the
  best time to buy."
- Search bar carries the real Amazon / Flipkart / Myntra **app icons** and a green
  "Analyze Deal" button. Below it, "Analyze a Deal" (solid green) and
  "Browse live deals" (light green).
- **No "Popular:" chips.** They are replaced by a category quick-nav strip built from the
  real taxonomy (Electronics / Fashion & Apparel / Sports & Fitness) with accurate
  "N Drops Today" counts, plus an "All Categories" tile.
- Three floating cards flank the girl (Price History, Price Drop Alert, live product card).
  On phones they stack below the illustration instead of overflowing.
- A five-pillar trust strip: products tracked, real price history, deal authenticity score,
  store comparison, instant alerts — all with live numbers.

**The floating cards are not decoration.** `getHistorySpotlight()` picks the product with the
deepest recorded history *and* a genuine recent drop, then every number on the three cards
(sparkline, all-time low + date, drop amount + date) comes from that product. No hardcoded
prices anywhere on the homepage.

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

## Catalogue hygiene

`npm run merge` is the fix for the two failure modes we hit:

1. **Duplicate product rows** — the same product stored twice (same title, different rows), each
   with its own listing and history. The verdict then only ever saw half the record. 48 of these
   were merged on the last pass; all 32,805 observations were preserved.
2. **Orphan product rows** — a product with no listing. It 404s, and worse, its identity key
   attracts a brand-new listing and splits the product's price history in two.

`analyze()` now reuses the product that already owns a store listing instead of creating a
second row, so orphans no longer appear. Run `npm run merge` after any catalogue import.

## Key decisions

- **Truth over coverage.** No synthetic history, ever. Failure ≠ data.
- **No invented numbers on the homepage.** Every price, low, drop and count is read from the
  database. Copy that claims "Live" or "Verified" only does so when a store page was actually
  fetched — otherwise it says "Recorded" / "Last recorded price".
- **Imported history is real, cached, and attributed.** We fetch once, store it as our own
  observation, and label the source on the page. Exact product-id match only.
- **Market context** is the answer to "history for any product": the real typical price band for
  the category, computed from everything we have verified.
- **Evidence labels** — every claim is tagged VERIFIED FACT / CALCULATION / MARKET CONTEXT /
  RECOMMENDATION. This is the trust moat.
- **Conflict-rule variant matching** — a spec stated on one side only is not a conflict.
- **Atomic alert claim** + dispatch-after-commit.
- **Light-first** design; dark theme available.
- **Green is the only brand colour.** No indigo/violet accents on the homepage.

## Environment variables

See `.env.example`. Minimum for production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AMAZON_TAG`, `NEXT_PUBLIC_CUELINKS_CHANNEL`.
Optional: `KEEPA_API_KEY` / `PRICEHISTORY_API_KEY` + `PRICEHISTORY_API_URL` for external history.

## Next step

Pick one:
- **Build a Setup** — setup builder (budget, room type, AI suggestions) powered by the real
  price history, based on the DealWise "Setup Dashboard" artwork. Offered, not yet confirmed.
- Add email alerts (Resend) — small, high value; Telegram already works.
- Add a `llms.txt` + richer programmatic SEO pages.
- Ship the Chrome extension as a thin client of `/api/analyze`.
- Deploy: Vercel + Turso. `README.md` has the steps; the catalogue must be seeded against
  Turso (`npm run catalogue` → `npm run merge` → `npm run scrape`).
