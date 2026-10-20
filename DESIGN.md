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
| `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` | browser favicon |
| `apple-touch-icon.png` | iOS home-screen icon |

`src/app/icon.png`, `src/app/favicon.ico` and `src/app/apple-icon.png` are wired to the same brand files.

### Store logos — fetched fresh from online

`public/brand/stores/` is **not** from the legacy project. Sources:

| Store | Source | File |
| --- | --- | --- |
| Amazon | Simple Icons (jsDelivr) | `amazon.svg` (recoloured `#FF9900`) |
| Flipkart | Simple Icons (jsDelivr) | `flipkart.svg` (recoloured `#2874F0`) |
| Myntra | myntra.com's own `logo_2021.png` | `myntra.png` |
| Tata CLiQ, Croma, Reliance Digital, Meesho, Nykaa | Wikimedia Commons | `.png` |

All normalised with sharp to ≤180px / ≤4 KB each (~20 KB total). Wordmarks are wide, so
`<StoreLogo />` renders them with `max-width: size × 3.4` instead of crushing them into a square.
Stores without art fall back to a coloured initial tile.

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

## Cleanliness rules (the site must read as icons + logos, not labels)

- **One search only.** The homepage has the big hero search; inner pages get a compact
  `PageSearch`. The header never duplicates it.
- **Header is icon-led.** Logo, 4 short nav labels, then icon buttons (search · alerts · theme) and one
  gradient CTA with an icon.
- **Real store logos, never letter tiles.** `public/brand/stores/*.svg` (carried from DealSense 1.0)
  rendered through `<StoreLogo />`; a coloured initial tile is only the fallback.
- **No fake affordances.** Filter labels that don't filter are removed.
- **Headings only where needed.** Data strips are one compact row of chips (`Under ₹999 40`,
  `50% 39`) with no explanatory paragraph.
- **Counts as badges**, not sentences.

## Key components

- **Header (DealWise style)** — logo + tagline "Shop smarter. Save more.", 4 short nav labels
  (Deals · Categories · History · Track), icon buttons (search · alerts · theme) and one gradient
  CTA with an icon.
- **Breadcrumbs** on every inner page: Home › Deals › product.
- **Sidebar + grid** on `/categories` and `/deals` — "Shop by Category" / "Filters" with icon
  tiles, active item in a green pill, chevrons, and live counts.
- **Category cards** — real product image, name, green "N deals" count, subcategory list, green
  "Explore →".
- **Icon-tile trust strip** (5-up) on `/categories` and the PDP: line icon in a soft green circle +
  title + one line.
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
- **Category shelf panels (Buyhatke)** — mint gradient card, "% off" badge, category title,
  product row, "View all".
- **"Top deals by platform"** — one row per store (Amazon, Flipkart, Myntra…), each headed by
  the store's real logo.
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
