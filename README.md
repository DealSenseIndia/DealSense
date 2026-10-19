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

---

## Quick start (2 minutes)

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — the database is a local SQLite file created automatically
(`./data/dealsense.db`). No signup, no config.

### Populate real data

```bash
# Analyze specific products (records genuine observations)
npm run db:seed -- https://www.amazon.in/dp/B0XXXXXXXX

# Or refresh listings that are due
npm run scrape
```

---

## Getting reliable live prices (free)

Amazon.in and Flipkart render prices with JavaScript and block plain server requests. DealSense
tries several free methods in order:

1. **Direct fetch** — fast, free, works for some pages.
2. **Free reader** (`r.jina.ai`) — renders some JavaScript.
3. **A free-tier scraping API** — reliable; set **one** key below.
4. **Local headless browser** — optional (`USE_PLAYWRIGHT=1`).

For a production site you should set **one** free scraping key in `.env.local` (all have free plans,
ScrapingAnt gives 10,000 requests/month):

```bash
SCRAPINGANT_API_KEY=...   # https://scrapingant.com   (10k free / month)  ← recommended
# SCRAPERAPI_KEY=...      # https://scraperapi.com    (1k free / month)
# SCRAPINGBEE_API_KEY=... # https://scrapingbee.com   (1k free credits)
# ZENROWS_API_KEY=...     # https://zenrows.com       (1k free credits)
```

Nothing else changes — the provider chain picks it up automatically.

---

## Deploy free (Vercel + Turso)

1. **Database** — create a free database at [turso.tech](https://turso.tech) and copy the URL + token.
2. **Push to GitHub**, then import the repo on [vercel.com](https://vercel.com).
3. **Add environment variables** in Vercel (see `.env.example`):

   | Variable | Purpose |
   | --- | --- |
   | `TURSO_DATABASE_URL` | free serverless database |
   | `TURSO_AUTH_TOKEN` | free serverless database |
   | `SCRAPINGANT_API_KEY` | reliable live prices (free tier) |
   | `NEXT_PUBLIC_SITE_URL` | your domain |
   | `NEXT_PUBLIC_AMAZON_TAG` | your Amazon Associates tag |
   | `NEXT_PUBLIC_CUELINKS_CHANNEL` | your Cuelinks channel id |
   | `TELEGRAM_BOT_TOKEN` | price-drop alerts (optional) |
   | `CRON_SECRET` | protects the refresh endpoint |

4. Deploy. Vercel runs a daily refresh; **GitHub Actions** (`.github/workflows/refresh.yml`) runs it
   hourly for free — add `DEALSENSE_URL` and `CRON_SECRET` as repo secrets.

---

## How it works

```
URL → Resolve merchant → Fetch live page → Extract real facts
    → Store an immutable observation → Score the deal → Verdict
    → (optional) fire a price alert
```

- **Product identity** matches the *same variant* across stores (128GB ≠ 256GB), so comparisons are honest.
- **Observations are append-only** and timestamped — the price history is never synthetic.
- **Alerts** use an atomic state machine (ARMED → TRIGGERED → COOLDOWN → ARMED) so you're never spammed.

### Project layout

```
src/
  app/            routes (landing, /analyze, /deals, /product/[slug], /api/*)
  components/     UI, motion primitives, analyzer, deal cards
  lib/
    db/           schema + queries (Drizzle + libSQL/Turso)
    merchants/    resolver + Amazon/Flipkart extractors + provider chain
    engine/       verdict scoring, landed price, bank offers, alerts, worker
    notifications/ dispatcher (Telegram / console)
scripts/          db:seed, scrape (refresh)
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Init DB (+ analyze URLs you pass) |
| `npm run scrape` | Refresh due listings |

---

## Docs

- [`PRD.md`](./PRD.md) — what we're building and for whom
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system design and data model
- [`DESIGN.md`](./DESIGN.md) — visual identity and design tokens
- [`PHASES.md`](./PHASES.md) — roadmap
- [`MEMORY.md`](./MEMORY.md) — current state / decisions

---

## Monetisation

DealSense earns **affiliate commissions** (Amazon Associates + Cuelinks). The verdict is decoupled
from payout: if Flipkart is cheaper, it says Flipkart. See `/disclosure`.

## Licence

Private project. All rights reserved.
