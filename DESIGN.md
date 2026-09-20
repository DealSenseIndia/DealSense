# DealSense — Visual Identity & Design System

## 1. Aesthetic Identity
- **Theme**: Premium Sleek Dark Mode (Slate / Midnight Blue base).
- **Inspiration**: High-performance fintech dashboards (Linear / Stripe style) tuned for Indian deal-hunting psychology.

## 2. Color Tokens
- **Backgrounds**:
  - Root App: `#0B0F19` (Deep Obsidian)
  - Card Surfaces: `#111827` (Rich Gray 900)
  - Interactive Panels / Modals: `#1F2937` (Gray 800)
- **Store Identifiers**:
  - Amazon Orange: `#FF9900`
  - Flipkart Blue: `#2874F0`
- **Deal Verdict Badges**:
  - `BUY_NOW`: `#10B981` (Vibrant Emerald)
  - `FAIR_PRICE`: `#38BDF8` (Sky Blue)
  - `WAIT_FOR_DROP`: `#F59E0B` (Amber Orange)
  - `AVOID_FAKE_DEAL`: `#EF4444` (Crimson Red)

## 3. Typography
- **Primary Font**: Inter (`font-sans`), geometric, highly legible at small sizes.
- **Data & Price Figures**: Monospace font (`font-mono` / JetBrains Mono) with tabular numbers enabled (`font-variant-numeric: tabular-nums`).

## 4. Interactive Components
- **Dual-Curve SVG Price Chart**:
  - Rendered via native `<svg>` path with cubic bezier calculations (`M x y C ...`).
  - Vertical crosshair hover guide synchronized with tooltip.
  - Quick range pills: `1M` | `3M` | `6M` | `1Y` | `All`.
- **True Landed Price Calculator Card**:
  - Step-down accounting layout showing Base Price, Shipping, Coupon, and Bank Card Instant Discount.
