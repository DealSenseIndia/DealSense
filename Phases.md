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

## Phase 6: Multi-Store Retail Arbitrage (Croma & Reliance Digital) [STATUS: COMPLETED ✅]
- [x] Task 6.1: Croma & Reliance Digital URL normalization and SSRF domain allowlisting (`backend/resolver.py`). *(Owner: `scraper_specialist`)*
- [x] Task 6.2: Stealth extraction engines for Croma & Reliance Digital (`extract_croma_data`, `extract_reliance_digital_data` in `backend/extractor.py`). *(Owner: `scraper_specialist`)*
- [x] Task 6.3: Cuelinks affiliate monetization routing (Croma campaign 1007, Reliance Digital campaign 1052 in `merchant_adapters.py`). *(Owner: `backend_engineer`)*
- [x] Task 6.4: Multi-store comparison ranking engine with lowest price badges and SVG retailer brand assets (`store_comparison.py`). *(Owner: `backend_engineer` & `frontend_engineer`)*
- [x] Continuous QA Sentinel Guardian: Enforce Rule #1 (237/237 passing tests, zero regressions). *(Owner: `qa_sentinel`)*

## Phase 7: Product-First Homepage & Price Drop Showcase (Buyhatke & PriceHistory Paradigm) [STATUS: COMPLETED ✅]
- [x] Task 7.1: Reorganize homepage visual hierarchy to place "🔥 Today's Biggest Price Drops" (`#liveDeals`) immediately under the hero search bar, demoting coupons to bottom utility status. *(Owner: `frontend_engineer`)*
- [x] Task 7.2: Implement rich product cards with dual CTAs (`📊 Price History` & `🛒 View Deal ↗`), merchant logo pills (Amazon, Flipkart, Croma, Reliance Digital), real price drop delta callouts (`↓ ₹X,XXX saved`), and Deal Score badges. *(Owner: `frontend_engineer`)*
- [x] Task 7.3: Build "⚡ All-Time Low Hall of Fame" (`#allTimeLowsSection`) highlighting 365-day historic lows across categories. *(Owner: `frontend_engineer`)*
## Phase 11: Junk Catalog Purge & Curated Hero Ingestion Pipeline [STATUS: COMPLETED ✅]
- [x] Task 11.1: Safety database snapshot backup (`data/deal_intelligence.backup_pre_purge.db`). *(Owner: `backend_engineer`)*
- [x] Task 11.2: Cascading catalog purge (`scripts/purge_junk_catalog.py`, `scripts/deep_clean_catalog.py`) deleting 4,500+ out-of-scope non-tech items (carpets, kajal, soap dispensers, pillows) and 399 historical test residues. *(Owner: `backend_engineer`)*
- [x] Task 11.3: Cleaned catalog seed definitions (`data/catalog_seeds.json` and `data/curated_catalog_seeds.json`) anchoring 7 high-intent tech & appliance categories. *(Owner: `planner_architect`)*
- [x] Task 11.4: Batch competitor historical bootstrapper (`scripts/bootstrap_curated_catalog.py`) pulling up to 1,000 real daily points from PriceBefore for hero products. *(Owner: `backend_engineer` & `scraper_specialist`)*
- [x] Task 11.5: SQLite database `VACUUM` and full test suite verification (244/244 passing tests in 38.6s). *(Owner: `qa_sentinel`)*

## Phase 12: Hero Deals Synchronization & Interactive Sparklines [STATUS: COMPLETED ✅]
- [x] Task 12.1: Serverless & local feed deal synchronizer (`scripts/sync_deals_to_serverless.py`) selecting top 48 deals with real price histories across 7 tech categories. *(Owner: `backend_engineer`)*
- [x] Task 12.2: Synchronized clean deals and real price history arrays into `api/deals/live.js`, `frontend/api/deals/live.js`, and `frontend/js/live_deals.js`. *(Owner: `backend_engineer`)*
- [x] Task 12.3: Implemented SVG sparkline micro-chart renderer (`renderSparkline`) in `frontend/js/live_deals.js` with cubic-bezier paths, green falling/amber rising strokes, and zero-synthetic fallback. *(Owner: `frontend_engineer`)*
- [x] Task 12.4: Added responsive styling for `.deal-sparkline-wrap`, `.deal-sparkline-svg`, and `.deal-sparkline-empty` in `frontend/css/home_feed.css`. *(Owner: `frontend_engineer`)*
## Phase 13: Catalog-Wide Competitor History Backfill & Observation Resilience [STATUS: COMPLETED ✅]
- [x] Task 13.1: Resilient competitor archive fallback in `observe_listing` (`backend/services/observation_service.py`) with price-ratio sanity validation (0.4x - 2.5x) and `ObservationStatus.BLOCKED` recovery. *(Owner: `backend_engineer`)*
- [x] Task 13.2: Sublink search token matching and title/brand overlap verification in `backend/services/competitor_adapter.py` preventing spurious search result matches (e.g. mobile cases/GPS trackers). *(Owner: `scraper_specialist`)*
- [x] Task 13.3: Guarded listing `current_price` updates in `bootstrap_listing_history` ensuring verified `live_extraction` prices are preserved. *(Owner: `backend_engineer`)*
- [x] Task 13.4: Catalog-wide backfill execution (`scripts/backfill_all_catalog_history.py`) enriching thin catalog listings with 3,463 genuine daily price points. *(Owner: `backend_engineer`)*
- [x] Task 13.5: Synchronized 48 curated deals and 42 genuine price histories into serverless endpoints (`api/deals/live.js`, `frontend/api/deals/live.js`). *(Owner: `frontend_engineer`)*
- [x] Task 13.6: Test suite expanded and maintained at 245/245 green tests with zero regressions. *(Owner: `qa_sentinel`)*

## Phase 14: Automated Observation Scheduler, Price Alert Notification Bot & Real-Time Dispatch [STATUS: COMPLETED ✅]
- [x] Task 14.1: Scheduled background price refresh worker with `ObservationWorker.run_cycle()` and `/api/observation/worker/status` & `/api/observation/worker/trigger` endpoints. *(Owner: `backend_engineer`)*
- [x] Task 14.2: Built `WhatsAppDispatcher` and `WebhookDispatcher` with persistent `AlertDeliveryLog` auditing and integrated into `CompositeDispatcher`. *(Owner: `bot_dispatcher`)*
- [x] Task 14.3: Implemented `GET /api/alerts`, `DELETE /api/alerts/{id}`, and `GET /api/alerts/recent` for frontend watchlist drawer and real-time alert bell notification badge. *(Owner: `frontend_engineer`)*
- [x] Task 14.4: 10 new unit & integration tests covering channels, workers, and APIs, expanding test suite to 255/255 green tests (100%). *(Owner: `qa_sentinel`)*

## Phase 15: Production Hardening, Vercel Edge Cache Optimization & Automated Ingestion Cron [STATUS: COMPLETED ✅]
- [x] Task 15.1: Vercel Cron (`vercel.json`) configuration (`0 */4 * * *`) and edge handler (`api/cron/sweep.js`) for periodic observation sweeps and alert dispatching on edge deployments. *(Owner: `backend_engineer`)*
- [x] Task 15.2: Edge caching headers (`Cache-Control: public, s-maxage=60, stale-while-revalidate=180` for live deals; `max-age=86400` for assets) in `vercel.json`. *(Owner: `frontend_engineer`)*
- [x] Task 15.3: Production health-check (`/api/health`, `/api/v1/health`) and multi-merchant status monitoring (`/api/status`, `/api/v1/status`) diagnostics. *(Owner: `planner_architect`)*
- [x] Task 15.4: Automated cron sweep route (`/api/cron/sweep`) with optional `CRON_SECRET` authentication and worker execution. *(Owner: `backend_engineer`)*
- [x] Task 15.5: End-to-end regression audit expanding test suite to 259/259 green tests (100% passing). *(Owner: `qa_sentinel`)*

## Phase 16: Frontend 2.0 — Deep Obsidian Glassmorphism & Competitor-Grade Intelligence UI [STATUS: COMPLETED ✅]
- [x] Task 16.1: Core Design Tokens & Glassmorphism foundation in `frontend/css/base.css`, `header.css`, `buttons.css`, and `footer.css`. *(Owner: `frontend_engineer`)*
- [x] Task 16.2: Homepage Hero & Omni-Search overhaul in `frontend/css/hero.css`, `home_feed.css`, and `frontend/templates/views/home_view.html`. *(Owner: `frontend_engineer`)*
- [x] Task 16.3: High-Density Deal Cards elevation with dynamic SVG sparklines, Deal Score badges (9.4/10), and direct 1-click affiliate redirect buttons. *(Owner: `frontend_engineer`)*
- [x] Task 16.4: Interactive Product Detail Page (PDP) & Price Intelligence Modal overhaul in `frontend/css/pdp.css` and `frontend/templates/views/detail_view.html` (PriceBefore stats bar, dual-curve SVG chart, Buyhatke bank card calculator, store comparison matrix). *(Owner: `frontend_engineer`)*
- [x] Task 16.5: Dedicated Deals Page (`frontend/deals.html`, `frontend/css/deals.css`) and Categories Explorer (`frontend/categories.html`, `frontend/css/categories.css`) redesign. *(Owner: `frontend_engineer`)*
- [x] Task 16.6: HTML Compilation (`scripts/build_html.py`) and full regression test suite verification (259/259 green). *(Owner: `qa_sentinel`)*

## Phase 17: Dual-Theme Architecture (Default Clean White Theme + Switchable Deep Obsidian Dark Mode) [STATUS: COMPLETED ✅]
- [x] Task 17.1: Dual-Theme token architecture in `frontend/css/base.css` with Light Theme as the default experience (`:root, [data-theme="light"]`) and Deep Obsidian as `[data-theme="dark"]`. *(Owner: `frontend_engineer`)*
- [x] Task 17.2: CSS variable refactoring across all component stylesheets (`header.css`, `footer.css`, `hero.css`, `home_feed.css`, `pdp.css`, `setup_builder.css`, `categories.css`, `deals.css`, `coupons.css`, `drawer.css`). *(Owner: `frontend_engineer`)*
- [x] Task 17.3: Anti-FOUC hydration script and theme engine in `frontend/js/theme.js` with `localStorage` persistence (`dealsense_theme`) and system preference fallback. *(Owner: `frontend_engineer`)*
- [x] Task 17.4: Interactive theme toggle buttons (Sun ☀️ / Moon 🌙) integrated into desktop header and mobile drawer across `/`, `/deals`, and `/categories`. *(Owner: `frontend_engineer`)*
- [x] Task 17.5: HTML Compilation (`scripts/build_html.py`) and full regression test suite verification (259/259 green). *(Owner: `qa_sentinel`)*


