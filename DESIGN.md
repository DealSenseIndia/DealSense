# DealSense — Design System 4.0

**Aesthetic:** a blend of the two best Indian price-tracking products — **PriceHistory.ai**'s bold
gradient + stat-card system and **Buyhatke**'s airy layout + store-comparison cards. Light-first,
emerald/cyan/violet signature gradient, huge tight headlines, dark "should you buy" insight panel.

## Brand assets

Original DealSense brand assets live in `public/brand/` and are carried over from DealSense 1.0:

| File | Use |
| --- | --- |
| `hero-illustration.png` / `.webp` | homepage hero — shopper on the green sofa with her phone (PNG 128 KB, WebP 80 KB) |
| `dealsense-icon.png` | the logo mark — nav, footer, app icon (256px) |
| `dealsense-horizontal.png` | horizontal wordmark lockup |
| `favicon.ico`, `favicon-16x32.png`, `favicon-32x32.png` | browser favicon |
| `apple-touch-icon.png` | iOS home-screen icon |

`src/app/icon.png`, `src/app/favicon.ico` and `src/app/apple-icon.png` are wired to the same brand files.

## Colour tokens (`src/app/globals.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg-pure` | `#ffffff` | `#05070d` | page background |
| `--bg-subtle` | `#f8fafc` | `#080c16` | section fills, inputs |
| `--bg-card` | `#ffffff` | `#0d1424` | cards |
| `--bg-elevated` | `#f1f5f9` | `#131c2e` | chips, hover |
| `--text-headline` | `#0f172a` | `#f8fafc` | headings |
| `--text-body` | `#334155` | `#cbd5e1` | body copy |
| `--border-card` | `#e2e8f0` | `rgba(255,255,255,.09)` | hairlines |

**Brand emerald:** `#10b981` (main) / `#059669` (mid) / `#047857` (deep).
**Iris (secondary):** `#6366f1` / `#818cf8` / `#4f46e5`.
**Store colours:** Amazon `#FF9900`, Flipkart `#2874F0`, Croma `#00A0E9`, Myntra `#FF3F6C`.
**Chart series:** Amazon amber `#F59E0B`, Flipkart blue `#3B82F6`.

**Verdicts:** BUY `#059669` · FAIR `#0284c7` · WAIT `#d97706` · AVOID `#dc2626`.

### Signature gradients

| Utility | Gradient | Used for |
| --- | --- | --- |
| `bg-gradient-brand` | emerald → cyan → iris | primary CTAs, number tiles, icon tiles |
| `bg-gradient-iris` | iris → violet → fuchsia | header CTA |
| `bg-gradient-buy` | amber → orange → red | store buy buttons (per store) |
| `bg-gradient-verdict` | red → amber → yellow → green | the Skip→Wait→Okay→Yes scale |
| `text-gradient-brand` / `text-gradient-deep` | — | the hero headline |
| `bg-wash` / `bg-wash-strong` | radial indigo/emerald/sky | ambient page background |

## Typography

- **Headlines / body:** Inter (800–900 for headlines, `-0.025em` tracking).
- **Figures:** JetBrains Mono, `font-variant-numeric: tabular-nums` (`.tabular` utility).
  Every price, score and delta is monospaced so columns line up.

## Key components

- **Header (Buyhatke style)** — brand mark + nav, then a **full-width search bar** underneath with
  store logos, a mic button and a gradient "Find best deals" CTA. Right side: alert bell, theme
  toggle, gradient "Check a deal" button.
- **Hero (PriceHistory.ai style)** — green-dot stat pill, `PRICE HISTORY & TRACKER` eyebrow, huge
  two-line headline (`Never overpay` navy / `online` green gradient) with a blinking cursor, big
  rounded search with a gradient CTA, emoji "Popular:" pills, two CTAs, a trust row, and **our girl
  illustration** on the right with four floating widget cards layered over her.
- **Community bar** — WhatsApp / Telegram pill bar.
- **"Deals moving now"** — a **live ticker of real recorded price drops** with the exact drop
  amount and timestamp ("dropped 2h ago"). We know *when* every price changed, so this is
  genuinely live — not a label.
- **Stats strip** — price points tracked · stores compared · products tracked · % real.
- **"At their all-time low"** — products whose *current* price equals the lowest we ever recorded
  for them. Computed from history, not asserted.
- **"Hot deals by price"** — budget buckets (Under ₹999 … ₹49,999) with live counts.
- **"Best discounts by percentage"** — tiers (min 20% … 70% off) with live counts.
- **Category shelf panels (Buyhatke)** — mint gradient card, "Up to N% off" badge, category title,
  Top Brands / Best Deals / Max Savings sub-filters, product row, "View all".
- **"Top deals by platform"** — one row per store (Amazon, Flipkart, Myntra…).
- **Category strip** → How it works → One rule → FAQ → CTA → Footer.

### Filter URLs (shareable, SEO-friendly)

`/deals?priceMax=999` · `?discountMin=50` · `?store=amazon` · `?category=Jeans` ·
`?sort=drop|allTimeLow|discount|history`

### PDP

- **4 colour-coded stat cards** — emerald *Highest*, rose *Lowest*, sky *Average*, teal *Current*,
  each with a gradient icon tile, tag pill, "±x% vs current" delta and a mini sparkline.
- **Buy-verdict panel (dark)** — "Should you buy at this price?", a big **BUY SCORE**, a **TREND**
  readout, the gradient Skip→Wait→Okay→Yes scale with an animated knob, confidence chips, a
  natural-language **PRICE INSIGHT** paragraph, and a right rail (Tracking · Typical price ·
  Potential saving · Current price).
- **Store comparison (Buyhatke style)** — "Compare & find the lowest price", a green
  "You save ₹X" pill, per-store cards with a **BEST DEAL** badge, "₹X more than the best store",
  rating, stock and a store-coloured buy button.
- **How we know** — every claim labelled `[VERIFIED FACT]` / `[CALCULATION]` / `[MARKET CONTEXT]` /
  `[RECOMMENDATION]`.

## Motion

Framer Motion + CSS keyframes, all respecting `prefers-reduced-motion`.
Scroll reveals (`Reveal` / `Stagger`), float, pulse-ring, count-up, marquee, blinking cursor,
animated verdict knob and score ring.

## Trust UI

Freshness is always explicit: **LIVE · OBSERVED · STALE · EXPIRED · No data**.
Unavailable values render as `—` or an explicit "not enough data" panel — never a placeholder
that mimics real data. Advertised (MRP) discounts are labelled *advertised* and never presented
as verified against history.
