# DealSense

**Know if it's actually a good deal — before you buy.**

DealSense is India's shopping decision engine. Paste any Amazon.in or Flipkart link and it verifies
the live price, reads the real price history, compares stores and returns an honest verdict:
**BUY**, **WAIT** or **AVOID** — plus the *true landed price* after delivery, coupons and card offers.

Built as a clean, modern **Next.js 15** app that deploys free on Vercel.

---

## Why it's different

Most deal sites shout "70% OFF". DealSense does the maths that matters, and it has **one hard rule**:

> We never show you a fake deal.

- If a price can't be verified, it says so — it never estimates.
- If history is thin, it shows exactly how many real observations it has.
- If a discount is inflated, it calls it out.
- Every claim on a product page is labelled **[VERIFIED FACT]**, **[CALCULATION]**, **[MARKET CONTEXT]**
  or **[RECOMMENDATION]** — you always know what you're looking at.

---

## Price history for *any* product

When someone searches for a product DealSense has never tracked, the engine layers sources of
truth instead of showing an empty box:

| Layer | Source | Available |
| --- | --- | --- |
| 1 | **Our own observations** — immutable, timestamped | always, grows over time |
| 2 | **Imported history** — real series from a price-history provider, cached forever in our own DB | after the first fetch |
| 3 | **External provider** — Keepa / PriceHistory.app official APIs | when a key is set |
| 4 | **Cross-store proxy** — the same product's history on the other store | when the rival is tracked |
| 5 | **Market context** — the real typical price band for that category | always, computed from verified listings |

**We already ship a working, free provider.** PriceHistory.ai publishes public product pages
and a public catalogue API; we pull the real price series on demand (one product at a time,
throttled), persist it in our own database so it is never fetched twice, and always show
`Source: PriceHistory.ai` on the page. Measured results: the Samsung Galaxy S25 Ultra returns
**239 real price points spanning 20 months** (₹69,999 → ₹1,29,999).

Full survey of every competitor we tested, what each can give us and what it costs:
**[`PRICE-HISTORY-SOURCES.md`](./PRICE-HISTORY-SOURCES.md)**.

The rules we follow: **exact product-id match only** (a near-match would attach the wrong
product's history), **fetch once and own it forever**, **never bulk-harvest**, **always
attribute**, and **our affiliate links on every buy button** — never the provider's.

MRP discounts are reported separately as **advertised**, never as verified history.

---

## Quick start (2 minutes)

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — the database is a local SQLite file created automatically
(`./data/dealsense.db`). No signup, no config.

> On Windows you can also just double-click **`START-DealSense.bat`** — it installs dependencies,
> opens your browser and starts the site.

### Populate real data

```bash
npm run catalogue -- --products 120  # import products WITH real price history
npm run discover      # pull real products from Amazon + Flipkart
npm run crossstore    # find Amazon equivalents for the Flipkart products
npm run history       # import real price history for tracked products
npm run merge         # merge duplicate product rows, drop orphans
npm run db:seed -- https://www.amazon.in/dp/B0XXXXXXXX   # analyze specific links
npm run scrape        # refresh listings that are due
```

> `npm run merge` is worth running after any catalogue import. It merges
> products that were stored twice (same title, different rows) onto one row
> and removes products that have no listing — those would 404 and, worse,
> would split a product's price history across two records.

---

## How live prices are fetched (free, no keys needed)

Both stores work out of the box:

| Store | Method | Notes |
| --- | --- | --- |
| **Amazon.in** | Direct fetch with browser headers | Prices read from the product page markup. |
| **Flipkart** | Flipkart's own page API (`/api/4/page/fetch`) | Returns rich JSON — price, MRP, rating, reviews, images. Throttled + cached. |

Fallbacks are tried automatically if either is ever blocked:

1. Direct fetch → 2. Flipkart page API → 3. free reader (`r.jina.ai`) →
4. optional scraping provider → 5. optional local headless browser (`USE_PLAYWRIGHT=1`).

A scraping provider is **optional**. If you want extra insurance, set one in `.env.local`:

```bash
# SCRAPERAPI_KEY=...      # https://scraperapi.com    (1k free / month)
# SCRAPINGBEE_API_KEY=... # https://scrapingbee.com   (1k free credits)
# ZENROWS_API_KEY=...     # https://zenrows.com       (1k free credits)
```

> ⚠️ ScrapingAnt's **free** plan blocks Amazon/Flipkart domains, so it is not useful here.

### Optional: borrow competitors' historical data

Keepa and PriceHistory.app both expose official APIs. Set a key and DealSense merges their series
into its own, so **any** product gets real history instantly — and your affiliate link rides along
on the buy button.

```bash
KEEPA_API_KEY=...                    # keepa.com/#!api  (paid, token-metered)
PRICEHISTORY_API_KEY=...             # pricehistory.app/page/business (partner key)
PRICEHISTORY_API_URL=...
```

Cuelinks has **no** product feeds or price history — it is the monetisation layer, not the data
layer. Every outbound button already routes through it.

---

## Features

- **Live analyser** — paste any Amazon/Flipkart link, get a verdict with reasons.
- **Live cross-store search** — search both stores, open any result for its full analysis.
- **True landed price** — base + delivery − coupon − card offer, with selectable Indian bank offers.
- **Cross-store comparison** — exact-variant matching (128GB never matches 256GB).
- **Fake-discount detection** — inflated MRPs called out explicitly.
- **Price-drop alerts** — target price / % drop / deal score, with an atomic-claim state machine
  (no double notifications, no spam).
- **Live deals feed** with filters: All Drops, Steep Drops, All-Time Lows, Score 85+, per-category.
- **SEO** — server-rendered product pages with Product + Breadcrumb JSON-LD, sitemap, robots.
- **Categories**, **Price History** explorer and **Track** (your alerts) pages.
- Telegram delivery for alerts.

---

## Deploy free (Vercel + Turso)

1. **Database** — create a free database at [turso.tech](https://turso.tech) and copy the URL + token.
2. **Push to GitHub**, then import the repo on [vercel.com](https://vercel.com).
3. **Add environment variables** in Vercel (see `.env.example`):

   | Variable | Purpose |
   | --- | --- |
   | `TURSO_DATABASE_URL` | free serverless database |
   | `TURSO_AUTH_TOKEN` | free serverless database |
   | `NEXT_PUBLIC_SITE_URL` | your domain |
   | `NEXT_PUBLIC_AMAZON_TAG` | your Amazon Associates tag |
   | `NEXT_PUBLIC_CUELINKS_CHANNEL` | your Cuelinks channel id |
   | `TELEGRAM_BOT_TOKEN` | price-drop alerts (optional) |
   | `CRON_SECRET` | protects the refresh endpoint |

4. Deploy. Vercel runs a daily refresh; **GitHub Actions** (`.github/workflows/refresh.yml`) runs it
   hourly for free — add `DEALSENSE_URL` and `CRON_SECRET` as repo secrets.
5. Seed the production database once, from a machine that has `TURSO_DATABASE_URL` set:

   ```bash
   npm run catalogue -- --products 120   # products WITH real price history
   npm run merge                        # merge duplicates, drop orphans
   npm run scrape                       # pull live prices for everything tracked
   ```

   Run these against the **Turso** database (not the local SQLite file) so the
   deployed site starts with a real catalogue instead of an empty one.

---

## Project layout

```
src/
  app/            routes (landing, /analyze, /deals, /search, /categories,
                  /price-history, /track, /product/[slug], /api/*)
  components/     UI, motion primitives, analyzer, deal cards, search
  lib/
    db/           schema + queries + market context (Drizzle + libSQL/Turso)
    merchants/    resolver + Amazon/Flipkart extractors + Flipkart API + search
    engine/       bundle, verdict, landed price, identity, alerts, providers, worker
    notifications/ dispatcher (Telegram / console)
scripts/          discover, crossstore, seed, refresh
tests/            25 tests (npm test)
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the test suite |
| `npm run typecheck` | TypeScript check |
| `npm run discover` | Pull real products from Amazon + Flipkart |
| `npm run crossstore` | Find Amazon equivalents for Flipkart products |
| `npm run history` | Import real price history for tracked products |
| `npm run catalogue` | Import products *with* their real price history |
| `npm run merge` | Merge duplicate product rows, drop orphans |
| `npm run db:seed` | Init DB (+ analyze URLs you pass) |
| `npm run scrape` | Refresh due listings |
| `npm run shot <path> <out.png>` | Screenshot a page and audit it for overflow |

---

## Docs

- [`PRD.md`](./PRD.md) — what we're building and for whom
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design, history resolution, data model
- [`DESIGN.md`](./DESIGN.md) — visual identity and design tokens
- [`PHASES.md`](./PHASES.md) — roadmap
- [`MEMORY.md`](./MEMORY.md) — current state / decisions

---

## Monetisation

DealSense earns **affiliate commissions** (Amazon Associates + Cuelinks). The verdict is decoupled
from payout: if Flipkart is cheaper, it says Flipkart. See `/disclosure`.

## Licence

Private project. All rights reserved.
