# DealSense Engineering Design System (DESIGN.md)

> **Design Source of Truth Layer 2**
>
> 1. **Google Stitch**: Visual design source of truth.
> 2. **DESIGN.md (this document)**: Engineering design-system source of truth.
> 3. **Production Frontend**: Implementation (Vanilla JS, CSS variables, semantic HTML).

---

## 1. Aesthetic DNA: "Bloomberg Terminal Meets Premium Indian Shopping App"

DealSense is a high-density, real-time consumer shopping intelligence platform for India.
It combines the uncompromising data provenance, compact hierarchy, and analytical rigor of a financial terminal with the consumer clarity, merchant familiarity, and mobile fluidity of a tier-1 e-commerce product.

- **NOT**: A generic AI SaaS dashboard with purple neon gradients, excessive whitespace, or meaningless decorative widgets.
- **IS**: High information density, razor-sharp typography, clear BUY / WAIT / AVOID verdict hierarchy, prominent rupee price visibility, explicit data provenance, and restrained, intentional micro-interactions.

---

## 2. Design Tokens & Variables

### 2.1 Color Palette

#### Primary Brand (DealSense Emerald Green)
```css
--dw-green-top: #4ADE80;        /* Light accent / highlight */
--dw-green-mid: #22C55E;        /* Active element green */
--dw-green-main: #16A34A;       /* Primary brand green */
--dw-green-bot: #159447;        /* Pressed / hover state */
--dw-green-deep: #166534;       /* Deep high-contrast text */
--dw-green-pastel: #ECFDF3;     /* Subtle tint background */
--dw-green-surface: #DCFCE7;    /* Active badge surface */
--dw-green-border: #BBF7D0;     /* Highlight border */
--dw-green-shadow: rgba(22, 163, 74, 0.18);
```

#### Terminal Neutrals & Surfaces
```css
--bg-pure: #FFFFFF;             /* Pure white container / card */
--bg-subtle: #F7FAF8;           /* Canvas background */
--bg-card: #FFFFFF;             /* Standard card background */
--bg-terminal: #0F172A;         /* Slate dark accent / header */
--bg-terminal-subtle: #1E293B;  /* Slate dark secondary */

--border-card: #E5E7EB;         /* Standard card border */
--border-subtle: #EEF2F4;       /* Inner dividing border */
--border-strong: #CBD5E1;       /* Emphasized element border */
```

#### Typography Colors
```css
--text-headline: #0F172A;       /* Dark slate primary titles */
--text-body: #1E293B;           /* Primary readable text */
--text-secondary: #64748B;      /* Secondary metadata / timestamps */
--text-muted: #94A3B8;          /* Captions / disabled labels */
--text-white: #FFFFFF;          /* Pure white on dark surfaces */
```

#### Decision Verdict Colors (BUY / WAIT / AVOID)
```css
/* BUY (Deal Active / Lowest Price) */
--verdict-buy: #16A34A;
--verdict-buy-bg: #ECFDF3;
--verdict-buy-border: #BBF7D0;

/* WAIT (Moderate / Price Likely to Drop) */
--verdict-wait: #D97706;
--verdict-wait-bg: #FFFBEB;
--verdict-wait-border: #FDE68A;

/* AVOID (Overpriced / Inflated Price) */
--verdict-avoid: #DC2626;
--verdict-avoid-bg: #FEF2F2;
--verdict-avoid-border: #FECACA;
```

---

## 3. Trust UI: Data Provenance Hierarchy

DealSense **never** synthesizes fake prices, reviews, ratings, or merchant metrics.
The UI visibly and unapologetically distinguishes the provenance and freshness of every data point:

| Status Badge | Background | Text / Border | Definition & Visual Behavior |
| :--- | :--- | :--- | :--- |
| `LIVE` | `#DCFCE7` | `#15803D` | Active real-time ping verified within last 15 minutes. Includes glowing pulse dot. |
| `VERIFIED` | `#EFF6FF` | `#1D4ED8` | Cross-checked across multiple merchant listings or verified deep scrape. |
| `OBSERVED` | `#F1F5F9` | `#475569` | Real observation captured from merchant within active retention window. |
| `STALE` | `#FEF3C7` | `#B45309` | Last observed > 24 hours ago. Explicitly states "Last verified X days ago". |
| `INSUFFICIENT DATA` | `#F8FAFC` | `#64748B` | Insufficient data points to declare high confidence. Explicitly shown as un-scored. |

### The Anti-Fabrication Mandate:
- **No fake placeholders**: If an MRP or rating is not provided by the merchant, do **not** show an estimated number or grayed-out "4.4 ★". Show `--` or an explicit `Unavailable` badge.
- **No fake curves**: If a listing has < 3 observations, do **not** render a smooth chart. Display an honest empty state: `"Collecting price snapshots... 1/3 observations logged."`

---

## 4. Typography & Numbers

- **Headings & Body**: `Inter`, `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - High legibility at small sizes (11px–13px) for dense data rows.
- **Numbers, Prices, Timestamps & Identifiers**: `'JetBrains Mono', monospace`
  - All Indian Rupee figures (`₹XX,XXX`) and percentage shifts (`-14%`) render in tabular monospace figures to ensure clean column alignment.
- **Scale**:
  - Micro Tag: `10.5px`, uppercase, tracking `0.5px`, font-weight `700`
  - Body Caption: `12px`, line-height `16px`
  - Body Default: `13.5px`, line-height `20px`
  - Subhead: `15px`, font-weight `600`
  - Section Title: `18px`, font-weight `700`
  - Hero Price: `28px–32px`, font-weight `800`, monospace

---

## 5. Component Patterns

### 5.1 Card Anatomy
- Radius: `16px` (`--radius-card`)
- Border: `1px solid var(--border-card)`
- Shadow: `0 2px 8px rgba(0, 0, 0, 0.04)`
- Internal Padding: `20px` (desktop), `16px` (mobile)
- Header: Compact row with title + provenance badge (`LIVE` / `OBSERVED`)

### 5.2 Verdict Banner
- Full-width hero widget displaying:
  1. Main Recommendation Badge (`BUY NOW`, `WAIT FOR DROP`, `OVERPRICED`)
  2. Confidence Indicator (`HIGH CONFIDENCE`, `MODERATE`, `LOW / INSUFFICIENT`)
  3. Short rationale grounded in real numbers: `"Current price ₹54,999 is ₹3,000 below 90-day average (₹57,999)."`

### 5.3 Store Comparison Table
- High-density comparative rows:
  - Merchant logo/pill (Amazon, Flipkart, Croma, Reliance Digital)
  - Base selling price
  - Verified bank card discount (ICICI, HDFC, SBI, Axis)
  - Net effective price (bold green, monospace)
  - Direct affiliate CTA button with clean attribution tag

### 5.4 Empty & Unavailable States
- Explicit, informative, respectful of user intelligence:
  - Icon: Minimalist slash/alert outline.
  - Headline: "Real Merchant Data Unavailable"
  - Subtext: "We do not show estimated or simulated prices. DealSense will log observations automatically as soon as the merchant listing responds."

---

## 6. Implementation Workflow (Stitch MCP -> Frontend)

1. **New UI Task**: When a new screen or substantial component is required, query Stitch MCP.
2. **Design Language Extraction**: Align generated designs with the tokens in `DESIGN.md`.
3. **No Framework Rewrite**: Translate Stitch designs into the native DealSense stack (Vanilla JS, CSS variables, semantic HTML). Do not introduce React, Tailwind, or Vue.
4. **Visual & Responsive Verification**:
   - Inspect layout in the integrated browser at `1440px` (desktop) and `375px` (mobile).
   - Verify that all data provenance states render honestly.
5. **Backend Priority**: Backend correctness and real-world merchant data integrity always take precedence over aesthetic flair.
