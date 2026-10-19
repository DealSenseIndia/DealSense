# DealSense — Design System

**Aesthetic:** "Bloomberg terminal meets a premium Indian shopping app."
Dark-first, aurora-lit, glass surfaces, kinetic type, tabular rupee figures.

## Themes

Default **dark** (premium), with a **light** alternative. Persisted in `localStorage`
(`dealsense_theme`), applied with an inline anti-FOUC script.

## Colour tokens (`src/app/globals.css`)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--void` | `#05070d` | `#ffffff` | page background |
| `--canvas` | `#080c16` | `#f7f9fc` | sections |
| `--surface` | `rgba(17,24,39,.62)` | `rgba(255,255,255,.85)` | glass cards |
| `--line` | `rgba(255,255,255,.08)` | `#e5e9f0` | hairlines |
| `--ink` | `#f8fafc` | `#0b1220` | primary text |
| `--ink-soft` | `#cbd5e1` | `#334155` | body |
| `--ink-muted` | `#7c8aa3` | `#64748b` | captions |

**Brand:** emerald `#10b981` → `#34d399`. **Accents:** sky `#38bdf8`, violet `#a78bfa`, amber `#f59e0b`.

**Stores:** Amazon `#FF9900`, Flipkart `#2874F0`.

**Verdicts:** BUY `#22c55e` · FAIR `#38bdf8` · WAIT `#f59e0b` · AVOID `#ef4444` · INSUFFICIENT slate.

## Typography

- **Headlines / body:** Inter (700–900 for headlines).
- **Figures:** JetBrains Mono, `font-variant-numeric: tabular-nums` (`.tabular` utility).

## Motion

Framer Motion + CSS keyframes. Everything respects `prefers-reduced-motion`.

- `Reveal` / `Stagger` — scroll-in.
- `Counter` — animated metrics.
- `Magnetic` / `TiltCard` — pointer-reactive depth.
- `Marquee` — infinite tickers.
- `Aurora` — ambient gradient blobs.

## Components

- **Buttons** — pill, emerald primary with glow + lift on hover.
- **Pills / VerdictBadge / FreshnessBadge** — semantic, always labelled.
- **DealCard** — image, score pill, sparkline, price + MRP, affiliate CTA.
- **VerdictPanel** — animated score ring, reasons, stat strip, fake-discount warning.
- **PriceChart** — hand-built SVG, smooth curves, crosshair tooltip, dual store series.
- **LandedPriceCard** — itemised receipt + selectable bank offers.
- **AlertPanel** — target / % / score tabs, channel + contact, Telegram deep link.

## Trust UI

DealSense must always distinguish **LIVE · OBSERVED · STALE · EXPIRED · INSUFFICIENT DATA**.
Unavailable values show an explicit `—`, never a placeholder that looks like real data.

## Layout

- Max width 1200px (1400 wide, 768 narrow), 5–7 padding.
- Mobile-first: 2-column deal grid, stacked PDP, no horizontal clipping.
