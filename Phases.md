# DealSense — Tactical Phases & Milestone Roadmap

## Phase 1: Core Service Pipeline & Data Graph [STATUS: COMPLETED ✅]
- [x] URL Resolver & Shortlink Expander (`resolver.py`)
- [x] Dual-Store Live Extractor for Amazon & Flipkart (`extractor.py`)
- [x] Indian Bank Card Offer Calculator (`bank_calculator.py`)
- [x] Deal Score (0–100) & Fake Discount Engine (`engine.py`)
- [x] Product Identity Graph SQLite Models (`models.py`)
- [x] 48/48 Baseline Unit Tests Passing

## Phase 2: Web UI & True Landed Price Integration [STATUS: COMPLETED ✅]
- [x] Responsive Dark Mode Dashboard (Vite + Vanilla JS)
- [x] Interactive SVG Dual-Curve Price History Chart (Cubic Bezier curves)
- [x] True Landed Price Breakdown (Base + Shipping - Coupon - Bank Card Offer)
- [x] Category-Aware Image Self-Healing Engine (Zero broken image display)
- [x] Zoom Controls (1M, 3M, 6M, 1Y, All) & Store Legend Toggles

## Phase 3: Live Deals Feed & Alert Dispatchers [STATUS: COMPLETED ✅]
- [x] Task 3.1: Build autonomous background crawler (`adk_deal_pipeline.py`) to rotate 100+ live deals. *(Owner: `scraper_specialist` & `backend_engineer`)*
- [x] Task 3.2: Implement Price Drop Alert Dispatcher Worker for Telegram & WhatsApp (`backend/services/alert_worker.py`). *(Owner: `bot_dispatcher` & `backend_engineer`)*
- [x] Task 3.3: Integrate Sub-Affiliate API routing (Cuelinks / EarnKaro fallback). *(Owner: `backend_engineer` & `scraper_specialist`)*
- [x] Task 3.4: Add health check and crawler telemetry dashboard endpoint. *(Owner: `backend_engineer` & `frontend_engineer`)*
- [x] Continuous QA Sentinel Guardian: Enforce Rule #1 (216/216 passing tests, zero regressions). *(Owner: `qa_sentinel`)*

## Phase 4: Distribution Wedge & Chrome/Kiwi Mobile Extension [STATUS: COMPLETED ✅]
- [x] Task 4.1: Manifest V3 Chrome / Kiwi mobile browser extension foundation (`extension/manifest.json`, popup, background service worker). *(Owner: `extension_engineer`)*
- [x] Task 4.2: In-page floating price comparison pill on Amazon.in & Flipkart product detail pages via encapsulated Shadow DOM. *(Owner: `extension_engineer`)*
- [x] Task 4.3: One-click "Set Deal Alert" modal inside extension syncing with backend `/api/v1/alerts` and Telegram deep linking. *(Owner: `extension_engineer` & `bot_dispatcher`)*
- [x] Continuous QA Sentinel Guardian: Enforce Rule #1 (221/221 passing tests, zero regressions). *(Owner: `qa_sentinel`)*

## Phase 5: Programmatic SSR SEO & Scale [STATUS: COMPLETED ✅]
- [x] Task 5.1: Programmatic SSR dynamic route `/compare/{slug}` with Jinja2 rendering, OpenGraph social cards, and Schema.org `AggregateOffer` JSON-LD microdata. *(Owner: `frontend_engineer` & `backend_engineer`)*
- [x] Task 5.2: Dynamic XML sitemaps (`/sitemap.xml`, `/sitemap-main.xml`, `/sitemap-products.xml`) with 1-hour in-memory cache and crawler-compliant `/robots.txt`. *(Owner: `backend_engineer`)*
- [x] Task 5.3: Production multi-stage Docker containerization (`Dockerfile`, `docker-compose.yml`, `.dockerignore`) with persistent SQLite WAL volume. *(Owner: `backend_engineer`)*
- [x] Continuous QA Sentinel Guardian: Enforce Rule #1 (229/229 passing tests, zero regressions). *(Owner: `qa_sentinel`)*
