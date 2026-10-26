# Price History Data Sources — who can give us data, and how

Researched Oct 2026. Every source below was **tested live**, not taken from marketing copy.

---

## Summary

| Source | What it gives | Access | Cost | Status |
| --- | --- | --- | --- | --- |
| **PriceHistory.ai** | Full price series (up to 2 yrs), low/high/avg, buy verdict | Public API + server-rendered pages | **Free** | ✅ **Wired in and working** |
| **Keepa** | Full price history since 2011, 11 marketplaces | Official API | €49/mo (€29 Pro gives 1 token/min) | 🔌 Implemented, needs a key |
| **PriceHistory.app** | Amazon + Flipkart history, offer prices | Official partner API | Contact `info@pricehistory.app` | 🔌 Implemented, needs a key |
| **PriceBefore** | Amazon.in + Flipkart history, free, public product pages | No public API found | Free | ❌ Not wired (see below) |
| **pricehistory.in** → pricehistoryapp.com | Amazon/Flipkart/Myntra/Nykaa history | No public API found | Free | ❌ Not wired (see below) |
| **DataYuge** | Current prices across 15+ Indian stores, **your affiliate id** | Official API | Free tier | 🔌 Prepared (needs a key) |
| **Amazon.in** | Amazon's own 30/90/365-day graph | Loaded via JS, not in HTML | Free | ❌ Not extractable |
| **CamelCamelCamel** | Amazon history (US-centric) | Paid API | Paid | ❌ Not viable for India |
| **Flipshope / Buyhatke** | Price history | No public API | — | ❌ Not viable |

---

## ✅ PriceHistory.ai — the one that works (free)

An Indian price-tracking competitor. Public product pages, no login, and a public JSON API.

**What it exposes**

```
GET https://pricehistory.ai/api/v1/search?q=<query>&limit=50&offset=0&compact=true
GET https://pricehistory.ai/product/<id>          → 308 to the canonical slug URL
```

The product page embeds a server-rendered Next.js flight payload containing:

```json
"priceHistory": [
  { "timestamp": "$D2025-02-15T...", "price": "99999.00",
    "original_price": "129999.00", "in_stock": true, "is_deal": false }
],
"statistics": { "highest_price": "129999.00", "lowest_price": "69999.00",
                "average_price": "96541.55", "data_points": "94" },
"buyRecommendation": { "score": 60, "label": "Okay",
                       "summary": "Price is reasonable, 36% above the lowest.",
                       "trendDirection": "stable", "confidenceLevel": "high" }
```

**Measured results**

| Product | Points | Span |
| --- | --- | --- |
| Samsung Galaxy S25 Ultra (`B0DSKNKCYX`) | **239** | 2025-02-15 → 2026-10-20 (20 months) |
| Apple iPhone 17 512GB (`B0FQG1YHYR`) | **129** | 2025-09-11 → 2026-10-20 (13 months) |
| Apple iPhone 17 Flipkart (`MOBHQV9YDG7CGRAM`) | 14 | 2026-09-17 → 2026-10-18 |
| OnePlus Nord Buds 3r (`B0FMDL81GS`) | 33 | 2025-08-31 → 2026-10-17 |

**How we use it (the rules we follow)**

1. **Exact match only.** We match on the merchant product id (ASIN / PID). A near-match would
   attach the wrong product's history — far worse than no history. If there is no exact match we
   return nothing.
2. **We own the record.** Every imported point is written into our own `observations` table
   (`source = "imported:pricehistory.ai"`, legacy rows `"imported"`). We never rewrite or delete
   a point we already stored.
3. **Top-up, never bulk.** New listings get one full backfill when a user analyses them. After
   that, a controlled hourly sync (`/api/cron/sync`) re-reads **5 listings per run**, appends
   only points newer than our latest observation, and refreshes the listing price. Each listing
   is revisited at most once every ~20 hours. Throttled to 1.5s between provider requests.
4. **Always attributed.** Charts and the product page show a visible `PriceHistory.ai` link
   wherever imported points are used.
5. **Our affiliate links, not theirs.** The buy button always routes through our Cuelinks /
   Amazon Associates tag. We never use the provider's affiliate link.

**Coverage:** they do not track everything — roughly 1 in 3 of our catalogue matched. Where they
have no data, DealSense falls back to our own observations plus category market context.

---

## 🔌 Ready to switch on with a key

- **Keepa** — `KEEPA_API_KEY`. `GET https://api.keepa.com/product?key=…&domain=21&asin=…`
  (`domain=21` is amazon.in). Returns `price.NEW` + `priceTimeNEW` arrays. Implemented in
  `src/lib/engine/providers.ts`. Also offers a **Graph Image API** that renders a price-history
  chart as a PNG.
- **PriceHistory.app** — `PRICEHISTORY_API_KEY` + `PRICEHISTORY_API_URL` (partner-scoped shape).
- **DataYuge** — `https://price-api.datayuge.com/api/v1/compare/search?api_key=…&product=…`
  returns prices from 15+ Indian stores. Premium lets you set **your own affiliate id** on the
  returned store URLs — the cleanest "attach my referral" route for cross-store pricing.

---

## ❌ Why the others are not wired

- **PriceBefore** — product pages are public and free, but there is **no discoverable JSON
  endpoint**; the chart is rendered server-side with no machine-readable payload we could find.
  Their "Price History Tracker" Chrome extension talks to a private backend.
- **pricehistory.in** (now pricehistoryapp.com) — same shape: RSC-rendered product pages, no
  public API. The only documented client is a 2021 GitHub repo for a different API shape.
- **Amazon.in's own price history** — the product page ships the `NileDPApexPriceHistory` widget
  but loads the series over a separate authenticated JS call, so it is not in the HTML.
- **CamelCamelCamel** — US-focused; no India coverage, API is paid.
- **Flipshope / Buyhatke** — no public API; their data is behind their own apps.

---

## The honest position

PriceHistory.ai's series is *real merchant data* (Amazon/Flipkart prices), publicly served, and
we treat it the way a browser would: one product at a time, on demand, cached in our own
database, always attributed, and never used to build a competing bulk dataset. Our own
observation engine remains the source of truth and keeps growing underneath it.

The moment a provider gives us a key (Keepa, PriceHistory.app, DataYuge), drop it in
`.env.local` — the provider chain picks it up automatically and prefers the keyed source.

---

## Usage

```bash
# Backfill history for products we already track (one full fetch each)
npm run history
npm run history -- --limit 30

# Top up the newest points + current prices (safe to run repeatedly)
npm run sync
npm run sync -- --limit 10

# Or let the analyser do it automatically when someone analyses an untracked product
```

The hourly GitHub Actions workflow calls `/api/cron/sync?limit=5` and then
`/api/cron/refresh?limit=2`. Vercel's daily cron runs both as a fallback if the workflow is
disabled.

The flow is automatic: analyse → no history yet → provider fetch → persisted → chart + verdict
with HIGH confidence, in one request.
