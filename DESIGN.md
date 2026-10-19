# DealSense — Design System 3.0

**Aesthetic:** premium Indian shopping intelligence. Light-first, emerald accent, slate neutrals,
navy headline ink, tabular rupee figures. Inspired by the original DealSense 1.0 UI, rebuilt
cleaner and denser.

## Themes

Default **light** (`--bg-pure: #ffffff`), with a **dark** alternate (obsidian `#05070d`).
Persisted in `localStorage` (`dealsense_theme`), applied with an inline anti-FOUC script.

## Colour tokens (`src/app/globals.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg-pure` | `#ffffff` | `#05070d` | page background |
| `--bg-subtle` | `#f8fafc` | `#080c16` | section fills, inputs |
| `--bg-card` | `#ffffff` | `#0d1424` | cards |
| `--bg-elevated` | `#f1f5f9` | `#131c2e` | chips, hover |
| `--bg-terminal` | `#0f172a` | `#060a13` | **the chart card** |
| `--text-headline` | `#0f172a` | `#f8fafc` | headings |
| `--text-body` | `#334155` | `#cbd5e1` | body copy |
| `--text-secondary` | `#64748b` | `#94a3b8` | captions |
| `--border-card` | `#e2e8f0` | `rgba(255,255,255,.09)` | hairlines |

**Brand emerald:** `#10b981` (main) / `#059669` (mid) / `#047857` (deep).
**Store colours:** Amazon `#FF9900`, Flipkart `#2874F0`.
**Chart series:** Amazon amber `#F59E0B`, Flipkart blue `#3B82F6`.

**Verdicts:** BUY `#059669` · FAIR `#0284C7` · WAIT `#D97706` · AVOID `#DC2626`.

## Typography

- **Headlines / body:** Inter (800–900 for headlines).
- **Figures:** JetBrains Mono, `font-variant-numeric: tabular-nums` (`.tabular` utility).
  Every price, score and delta is monospaced so columns line up.

## Radii & shadow

`--radius-xs 6 · sm 8 · btn 12 · card 18 · lg 24`.
`--shadow-card` (rest) → `--shadow-lift` (hover) → `--shadow-pop` (floating hero cards).

## Key components

- **Header** — logo + "Shop smart. Save more." + nav + inline search + alert bell + theme toggle.
- **Hero** — badge pill, `Shop smarter. / Save bigger.` headline with emerald accent, search bar
  with store logos + "Analyze Deal" CTA, popular pills, and four floating widget cards
  (price-history sparkline, price-drop alert, recently-viewed product, verdict ring) on a soft
  emerald/sky ambient wash.
- **Deals section** — "Live Price Tracker · Updated Hourly" pill, "Today's Biggest Price Drops",
  filter pills (All Drops / Steep Drops / All-Time Lows / Score 85+ / per-category / Under ₹999),
  and a product grid.
- **Product card** — ALL-TIME LOW or Steep-drop badge, store logo, image, sparkline, price + MRP,
  score, affiliate CTA.
- **PDP** — store pills (with in-stock state), "X is ₹Y cheaper" badge, **dark terminal chart
  card** with 1M/3M/6M/1Y/All pills, four stat tiles, market-context panel, live store
  comparison table, price-difference bar, right rail with the verdict ring, the **evidence list**
  and the alert box.
- **Evidence list** — every claim is labelled `[VERIFIED FACT]`, `[CALCULATION]`, `[MARKET CONTEXT]`
  or `[RECOMMENDATION]`. This is the trust mechanism.

## Motion

Framer Motion + CSS keyframes, all respecting `prefers-reduced-motion`.
- Scroll reveals (`Reveal`), staggers, float, pulse-ring, count-up, marquee, draw-in chart lines.

## Trust UI

Freshness is always explicit: **LIVE · OBSERVED · STALE · EXPIRED · No data**.
Unavailable values render as `—` or an explicit "not enough data" panel — never a placeholder
that mimics real data. Advertised (MRP) discounts are labelled *advertised* and never presented
as verified against history.
