# DealSense — Visual Identity & Design System (Frontend 2.0)

## 1. Aesthetic Identity & Dual-Theme Architecture
- **Dual-Theme Engine**:
  - **Default Theme (Light)**: Clean, high-legibility Pure White & Slate aesthetic (`#FFFFFF` void, `#F8FAFC` slate canvas, crisp `#0F172A` headlines, `#E2E8F0` micro-borders).
  - **Alternative Theme (Dark)**: Premium Deep Obsidian Glassmorphism (`#080C14` dark void, `#0B101D` surface, `rgba(15, 23, 42, 0.72)` glass cards, glowing emerald accents).
  - **Switching & Persistence**: Seamless Sun/Moon toggle (`#themeToggleBtn`), instant anti-FOUC inline execution, and `localStorage` persistence (`dealsense_theme`).
- **Inspiration**: High-performance fintech dashboards (Linear / Stripe / Raycast) fused with premier e-commerce intelligence (Buyhatke / PriceBefore / Keepa).
- **Core Principle**: Zero fake clutter, maximum transparency, high visual impact, instant comprehension of deal quality in both bright sunlight and dark settings.

## 2. Color Tokens (Dual Theme)

### A. Light Theme (Default: `:root`, `[data-theme="light"]`)
- **Backgrounds**:
  - Root Canvas: `#FFFFFF` (Pure White)
  - Subtle Surface: `#F8FAFC` (Slate 50)
  - Card & Container Surface: `#FFFFFF` (Crisp White Card with `box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05)`)
  - Elevated / Interactive Surface: `#F1F5F9` (Slate 100)
  - Modal / Drawer Overlays: `rgba(15, 23, 42, 0.6)` with `backdrop-filter: blur(12px)`
- **Borders & Strokes**:
  - Card Border Default: `#E2E8F0` (Slate 200)
  - Card Border Hover: `rgba(16, 185, 129, 0.45)` (Emerald Highlight)
  - Hairline Dividers: `#F1F5F9` (Slate 100)
- **Typography**:
  - Primary Text: `#0F172A` (Slate 900)
  - Secondary Text: `#334155` (Slate 700)
  - Muted Text: `#64748B` (Slate 500)
  - Accent Green: `#10B981` / `#059669` (Vibrant Emerald)
  - Accent Blue: `#2563EB` / `#0284C7` (Sky / Royal Blue)

### B. Dark Theme (`[data-theme="dark"]`)
- **Backgrounds**:
  - Root App: `#080C14` (Deep Obsidian Void)
  - Secondary Surface: `#0B101D` (Subtle Midnight Surface)
  - Card & Container Surface: `rgba(15, 23, 42, 0.72)` with `backdrop-filter: blur(16px)`
  - Elevated / Interactive Surface: `rgba(30, 41, 59, 0.85)`
  - Modal / Drawer Overlays: `rgba(4, 7, 13, 0.82)` with `backdrop-filter: blur(12px)`
- **Borders & Strokes**:
  - Card Border Default: `rgba(255, 255, 255, 0.08)`
  - Card Border Hover: `rgba(34, 197, 94, 0.35)` (Emerald Glow)
  - Hairline Dividers: `rgba(255, 255, 255, 0.06)`
- **Typography**:
  - Primary Text: `#F8FAFC` (Slate 50)
  - Secondary Text: `#94A3B8` (Slate 400)
  - Muted Text: `#64748B` (Slate 500)
  - Accent Green: `#22C55E` / `#10B981` (Vibrant Emerald)
  - Accent Blue: `#38BDF8` / `#06B6D4` (Cyan / Sky)

### C. Shared Brand & Semantic Identifiers
- **Store Identifiers**:
  - Amazon: Brand Orange `#FF9900`
  - Flipkart: Brand Blue `#2874F0`
  - Croma: Teal `#00E8BF`
  - Reliance Digital: Crimson `#E42529`
- **Deal Verdict Badges**:
  - `BUY_NOW`: `#10B981` (Emerald)
  - `FAIR_PRICE`: `#38BDF8` (Sky Blue)
  - `WAIT_FOR_DROP`: `#F59E0B` (Amber)
  - `AVOID_FAKE_DEAL`: `#EF4444` (Crimson)

## 3. Typography & Hierarchy
- **Headline Font**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif` (weight 700 / 800 / 900).
- **Body & Labels**: `Inter` (weight 400 / 500 / 600).
- **Price Figures & Metrics**: `JetBrains Mono`, `monospace` with `font-variant-numeric: tabular-nums`.

## 4. Component Standards

### A. High-Density Deal Cards (Live Feeds & Feeds Grid)
- Glassmorphic card surface with smooth hover elevation (`transform: translateY(-4px)` with emerald radial box shadow).
- Top meta row: Merchant badge (Amazon/Flipkart) + Deal Score pill (e.g. `9.4/10 🔥 CRAZY DROP`) + All-Time Low badge when applicable.
- Product photo with self-healing image fallback (`/assets/fallback.svg`) and clean aspect ratio.
- Micro-SVG Sparkline: Real historical price trajectory with emerald line (`#22C55E`) for falling prices and amber line (`#F59E0B`) for rising prices.
- Transparent price block: Live verified price (large, bold), MRP with strike-through, and discount badge (`xx% OFF`).
- 1-Click Action Button: Direct store affiliate redirect with store icon and external link arrow.

### B. Interactive Product Detail & Intelligence (PDP)
- **Price at a Glance Strip (PriceBefore style)**: 4 clean metric tiles: Current Price, All-Time Low (with date badge), All-Time High, and 90D Average Benchmark.
- **Dual-Curve SVG Price History Chart**:
  - Native `<svg>` bezier curves for Amazon (amber) vs Flipkart (blue).
  - Timeframe toggles: `1M`, `3M`, `6M`, `1Y`, `All`.
  - Glassmorphic hover crosshair tooltip showing exact date, store prices, and delta.
- **True Landed Price Calculator Card (Buyhatke style)**:
  - Interactive Indian bank card pills: SBI Card (10%), HDFC (10%), ICICI (5%), Axis, and No Offer.
  - Step-down accounting receipt showing Base Price, Eligible Coupon deduction, Instant Card discount, and final Landed Total.
- **Live Multi-Store Comparison Matrix**:
  - Direct side-by-side table comparing price, delivery, return policy, and stock across Amazon & Flipkart.
  - Callout banner showing exact price differential.
- **Deal Score & Evidence Card**:
  - Radial score meter, AI verdict explanation, and seller trust audit badge.
  - One-click WhatsApp & email Price Drop Alert modal.

### C. Hero Omni-Search Section
- Glassmorphic search card with neon-glow focus ring.
- Store shortcut badges (Amazon, Flipkart, Croma, Reliance Digital).
- Instant autocomplete dropdown showing verified products with prices and store badges.
- Popular deal pill tags with instant search execution.

