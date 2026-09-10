# RULE 7: GOOGLE STITCH MCP DESIGN WORKFLOW & DESIGN TRUTHFULNESS

Google Stitch MCP is an official part of the DealSense development workflow.
Follow these rules unconditionally for all user interface and design tasks.

---

## 1. Scope & Execution Boundaries
- **Use Stitch MCP for**: All NEW or substantially redesigned user-interface work.
- **Do NOT redesign existing UI**: Do not touch existing UI unless explicitly requested by the user.
- **Backend Priority**: Backend correctness and real-time merchant observation integrity always take precedence over visual polish.
- **No UI Required = No Stitch**: If a backend or worker task requires no UI, DO NOT invoke Stitch.
- **No Framework Rewrites**: Never replace Vanilla JS/Vite with React, Vue, or Tailwind unless explicitly approved. Translate Stitch visual designs into existing semantic HTML, Vanilla JS, and CSS variables.

---

## 2. The Three Layers of Design Truth
1. **Google Stitch**: Visual design source of truth.
2. **DESIGN.md**: Engineering design-system source of truth (tokens, typography, spacing, component patterns).
3. **Production Frontend**: Native implementation.

---

## 3. Aesthetic DNA
- **Theme**: "Bloomberg Terminal meets premium Indian shopping app".
- **NOT**: Generic AI SaaS dashboard with purple gradients or low-density fluff.
- **Key Traits**: High information density, clear BUY / WAIT / AVOID hierarchy, strong monospace rupee price visibility, restrained animations, excellent mobile responsiveness.

---

## 4. Trust UI & Anti-Fabrication Mandate
The DealSense UI must visibly distinguish data provenance:
- `LIVE` (Freshly verified within 15 mins)
- `VERIFIED` (Cross-checked or deep-scraped)
- `OBSERVED` (Standard real merchant observation)
- `STALE` (Older than 24 hours)
- `INSUFFICIENT DATA` (Uncertain / collecting observations)

Never visually present missing data as positive data.
If a value (MRP, rating, review, seller trust, similar products) is unavailable, render an explicit unavailable state (`--` or honest badge). Never create synthetic visual placeholders.

---

## 5. UI Implementation Steps
When a new UI component is required:
1. Query Stitch MCP to inspect existing project/design system.
2. Align with tokens in `DESIGN.md`.
3. Generate screen/component using Stitch MCP.
4. Translate into existing Vanilla JS/CSS architecture.
5. Inspect in browser (desktop + mobile).
6. Verify anti-fabrication compliance.
7. Run test suite.
