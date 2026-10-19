# DealSense — Roadmap

## ✅ Phase 0 — Foundation (done)

Clean rebuild from scratch: Next.js 15, Tailwind v4, Framer Motion, Drizzle + libSQL.
No legacy code carried over.

## ✅ Phase 1 — Core engine (done)

- URL resolver (Amazon ASIN, Flipkart PID, shortlinks).
- Provider chain extraction: direct → free reader → free scraping API → local headless browser.
- Honest extractors (real price/MRP/rating/seller or `null`).
- Canonical product identity + exact-variant matching.
- Append-only price observations with provenance.
- Deal scoring + BUY/WAIT/AVOID verdict + inflated-MRP detection.
- True landed price + Indian card-offer matrix.

## ✅ Phase 2 — Product surface (done)

- Aurora/glass landing page with motion (scroll reveals, magnetic buttons, tilt cards, marquee, counters).
- Interactive analyzer with live progress states.
- Animated SVG price chart with crosshair tooltip.
- Live deals feed (real data only, honest empty state).
- SSR product pages with Product + Breadcrumb JSON-LD, sitemap, robots.
- Dark/light theme, mobile-first.

## ✅ Phase 3 — Alerts & automation (done)

- Alert intelligence engine with an atomic claim state machine.
- Alert types: target price, % drop, deal score.
- Anti-spam: 24h cooldown + hysteresis recovery.
- Notification dispatcher (Telegram + console).
- Refresh worker with priority tiers, spacing and backoff.
- Free cron (Vercel daily + GitHub Actions hourly).
- Telegram webhook for one-tap alert binding.

## ⏳ Phase 4 — Reach (next)

- [ ] **Email delivery** (Resend free tier) alongside Telegram.
- [ ] **Flipkart reliability** — document/enable a scraping provider; add more providers.
- [ ] **Programmatic SEO** — category and price-history pages, `llms.txt`, richer internal linking.
- [ ] **Chrome extension** — floating verdict pill on product pages (thin client of the API).
- [ ] **More merchants** — Croma, Reliance Digital, Tata CLiQ via Cuelinks.

## ⏳ Phase 5 — Scale

- [ ] Postgres migration when concurrency demands it.
- [ ] Embedding-based product matching to boost cross-store coverage.
- [ ] Sale-calendar awareness (Great Indian Festival, Big Billion Days) for "when to buy".
- [ ] WhatsApp delivery.
- [ ] Public price-history API.

## Guardrails (never break these)

1. No synthetic price history in production.
2. A failed scrape never becomes an observation.
3. Never invent MRP, ratings, reviews or sellers.
4. The verdict is never influenced by affiliate payout.
