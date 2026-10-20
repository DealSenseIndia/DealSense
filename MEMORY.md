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

## Hero background + artwork (important)

- The hero is a **green wash**, never black:
  `radial-gradient(48% 52% at 77% 62%, rgba(233,252,242,0.95) 0%, transparent 72%)` over
  `linear-gradient(160deg, #F5FDF9 0%, #EDFBF3 42%, #DEF5E9 100%)`.
  Dark theme: the same shape in deep forest green (`#062B20 → #04211A`), never `#0F172A`.
- **The artwork is feathered.** The source cut-out has a hard pale-mint (`#E9FCF2`) halo that
  read as a pasted rectangle. `npm run art:soften` blurs the alpha channel (sigma 7) and writes
  it back, producing `public/brand/hero-illustration-soft.png/.webp`. The hero uses the soft
  webp; the mint pool in the background matches the artwork's halo exactly, so the girl
  dissolves into the page.
- **`dark:` is not the media query here.** The app stores the theme on
  `<html data-theme="light|dark">`. Tailwind's stock `dark:` variant follows the OS, which meant
  every `dark:` utility in the app followed the OPERATING SYSTEM rather than the theme the
  visitor picked — a dark hero appearing on a light page. Fixed globally in `globals.css` with
  `@custom-variant dark (&:where([data-theme="dark"] *, [data-theme="dark"]));`.

## Homepage (current)

The hero is a **verbatim rebuild of the DealSense 1.0 hero** — the sizes, spacing, colours and
floating-card geometry come straight from the old `frontend/css/hero.css`:

- Green gradient hero (`#F0FDF4 → #F7FEE7 → #FFFFFF`), grid `54% / 46%`, gap 36px.
- Green trust badge "India's Most Trusted Shopping Intelligence Platform" (11.5px).
- Headline "Shop smarter. / Save bigger." — **52px**, weight 900, line-height 1.08.
- Sub-copy at 15.5px / 1.6, max-width 520px.
- Search card: radius 16px, padding `6px 8px`, max-width 680px, 46px input, the three store
  app icons inside a pill, green "Analyze Deal" button.
- Popular pills at 12.5px.
- Artwork frame: `max-width 550px`, `height 420px`, artwork **bottom-aligned** at max-width 500px.
- Floating cards at the old positions: Price History `top 75 / left -20 / 245px`,
  Price Drop Alert `top 205 / left 0 / 240px`, featured product `top 15 / right -5 / 320px`.
- The float loop is the old one — `floatCardMotionA/B/C` at 5.2s / 5.8s / 4.6s, and hovering a
  card pauses it. (Amplified from ±6px to ±11px so the motion actually reads.)
- The "Lowest Price" box sits **over** the chart at `top -10px / right 6px`, like the old design.

**The floating cards are not decoration.** `getHistorySpotlight()` picks the product with the
deepest recorded history *and* a genuine recent drop, then every number on the three cards
(sparkline, all-time low + date, drop amount + date) comes from that product. No hardcoded
prices anywhere on the homepage.

**The page is product-first.** After the hero it goes straight to products:

1. Today's Biggest Price Drops — 14 products + a working filter-pill row (all real filters).
2. At their all-time low — 12 products.
3. Category shelves — 6 panels of products.
4. Per-store rows.
5. How DealSense works → FAQ → footer.

No stat bands, no "join our community" bar, no trust-pillar strip, no CTA band. Those were
removed — the user asked for a clean look that shows products, not the site's own marketing.

## Footer

Rebuilt on the old project's "deep forest emerald" footer (`footer.css`): dark
`#061A12 → #030D09` gradient, the method ribbon (stores tracked / prices observed / discount
honesty / no paid placements), a 4-column grid (brand + store app icons, Explore, Tools, How
DealSense Works), the affiliate & trust disclosure, and the bottom legal bar. Improved over the
old one: the QR-code column is replaced by a 3-step "How DealSense Works" explainer, and the
links all point at real routes.

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
