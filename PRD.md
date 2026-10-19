# DealSense — Product Requirements (PRD)

## 1. Problem

Indian online shoppers face three recurring frictions:

1. **Fake discounts.** MRPs are inflated before sales so ordinary prices look like huge "70% OFF" deals.
2. **Buy-or-wait anxiety.** Nobody knows whether today's price is good or if it will crash next week.
3. **Fragmented offers.** The real cost depends on shipping, coupons and card offers — and Amazon vs Flipkart.

Existing tools (PriceHistory, Buyhatke, Flipshope) cover *price tracking* well, but their data is
often stale or wrong. Users say they can't trust it.

## 2. Product

A **shopping decision engine**, not another price tracker.

> Paste a product link → get an honest BUY / WAIT / AVOID verdict, with real price history,
> true landed cost and cross-store comparison.

## 3. Target user (ICP)

- Indian shoppers making **medium/high-value purchases** (₹5,000–₹2,00,000): phones, laptops, TVs,
  appliances, audio, gaming.
- Price-conscious, deal-aware, active during sale events (Great Indian Festival, Big Billion Days).
- Comfortable buying online; often researching on mobile.

## 4. Core features (v1)

| Feature | Status |
| --- | --- |
| Paste Amazon.in / Flipkart link → live analysis | ✅ |
| Real, timestamped price observations (no synthetic data) | ✅ |
| Explainable deal score + BUY/WAIT/AVOID verdict | ✅ |
| True landed price (delivery − coupon − card offer) | ✅ |
| Cross-store comparison with exact-variant matching | ✅ |
| Fake-discount / inflated-MRP detection | ✅ |
| Price alerts (target / % drop / deal score) | ✅ |
| Server-rendered product pages + JSON-LD for SEO | ✅ |
| Live deals feed | ✅ |
| Telegram delivery | ✅ (needs bot token) |
| Email delivery | ⏳ |
| Chrome extension | ⏳ |
| More merchants | ⏳ |

## 5. Success metrics

- **Trust:** share of verdicts backed by ≥3 real observations (target: rising over time).
- **Conversion:** outbound affiliate click-through rate per analysis.
- **Retention:** alerts set per active user; alert → click rate.
- **Acquisition:** organic sessions landing on `/product/*` pages.

## 6. Non-goals (for now)

- Cashback wallet, coupons database, community/social, native iOS/Android apps, 1,000-store coverage,
  an AI chatbot. These are crowded and do not prove the core loop.

## 7. Principles

1. **Truth over coverage.** "Not enough data" beats a beautiful lie.
2. **Explainable.** Every verdict lists its reasons in plain language.
3. **Free to the user.** Monetised by affiliate commission, never by selling the verdict.
4. **Mobile-first.** Most users arrive on a phone from a shared link.
