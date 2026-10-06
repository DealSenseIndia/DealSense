# DealSense / Deal Intelligence — Living State Machine & Memory Ledger

> **Notice to AI Pair Programmers**: Consult this file BEFORE making any edits. Update this file whenever you complete a task, encounter a blocker, or modify system architecture.

---

## 1. Project Health & Verified Baseline Status
- **Repository**: `D:\Gursher\Affiliate\Deal Intelligence`
- **Active Workspace**: Deal Intelligence (Antigravity IDE)
- **Current Milestone**: Phase 17 (Dual-Theme Architecture & Light-Default Theme Switcher) [COMPLETED ✅]
- **Unit Test Health**: **259 / 259 Passing Unit Tests (100% Green, 0 Deprecation Warnings in App Code)**
- **Test Runner Command**: `.venv\Scripts\pytest.exe -q` (49.1s execution)
- **Verified Working Test Suites**:
  - `test_production_health_and_cron.py` (Pass — 4/4 tests: health check, system status, authenticated cron sweeps)
  - `test_competitor_adapter.py` (Pass — 4/4 tests: date normalization, HTML chart extraction, error resilience, DB bootstrap idempotency)
  - `test_deal_freshness.py` (Pass — 2/2 tests)
  - `test_image_contract.py` (Pass — 1/1 test)
  - `test_croma_reliance_expansion.py` (Pass — 8/8 tests)
  - `test_seo_and_sitemap.py` (Pass — 8/8 tests)
  - `test_extension_contracts.py` (Pass — 5/5 tests)
  - `test_alert_worker.py` (Pass — 5/5 tests)
  - `test_adk_deal_crawler.py` (Pass — 6/6 tests)
  - `test_affiliate_gateway_fallback.py` (Pass — 4/4 tests)
  - `test_alert_engine.py` (Pass — 26/26 tests)
  - `test_discovery_engine.py` & `test_discovery_adapters.py` (Pass)
  - `test_live_cross_store_matcher.py` (Pass)
  - `test_observation_service.py` & `test_observation_worker.py` (Pass)
  - `test_product_intelligence.py` & `test_product_universe.py` (Pass)
  - `test_smart_amazon_flipkart.py` (Pass)
  - `test_telegram_delivery.py` (Pass)
  - `test_phase3_data_integrity.py` (Pass)
  - `test_cuelinks_feed.py` & `test_ingestion_and_taxonomy.py` (Pass)

---

## 2. Active Blockers & Roadmap
| ID | Blocker / Issue | Impact | Active Solution / Owner | Status |
| :--- | :--- | :--- | :--- | :--- |
| B-01 | `deals_crawler.py` mock presets | Homepage deal feed is static | Integrated Google ADK worker (`backend/workers/adk_deal_pipeline.py`) with real deal scoring | RESOLVED ✅ |
| B-02 | Price drop alert daemon dispatch | Users submit alerts but automated daemon needed | Built `AlertDispatchWorker` in `backend/services/alert_worker.py` running in lifespan loop | RESOLVED ✅ |
| B-03 | Sub-affiliate fallback routing | Unapproved categories lose affiliate monetization | Built 3-Tier fallback router in `backend/services/affiliate_gateway.py` (Direct Tag -> Cuelinks V3 -> Clean URL) | RESOLVED ✅ |
| B-04 | Organic Search & Crawler Discovery | Pure SPA pages lack crawler indexing and Schema.org rich results | Implemented SSR comparison routes (`/compare/{slug}`), XML sitemaps index, and robots.txt | RESOLVED ✅ |
| B-05 | Retailer Duopoly Limitation | Amazon & Flipkart alone miss major offline/omnichannel sales | Added Croma (1007) and Reliance Digital (1052) extractors, resolvers, and multi-store ranking | RESOLVED ✅ |
| B-06 | Deceptive / Synthetic Data Fallbacks | Fabricated deal counts and synthetic competitor history risk user trust | Implemented Data Truth Contract: honest category counts, image fallback contract, and real freshness indicators | RESOLVED ✅ |
| B-07 | Cold-Start Historical Price Gaps | New listings lack historical price depth for dual curves and real all-time lows | Integrated competitor archive bootstrapping via `backend/services/competitor_adapter.py` and Strategy C in serverless proxies | RESOLVED ✅ |

---

## 3. Verified Architecture Decisions (ADRs)
- **ADR-001 (Product Identity Graph)**: Modeled as `Product` (canonical) → `MerchantListing` (store listing) → `PriceObservation` (timestamped observation). Clean cross-store comparison between Amazon.in and Flipkart.
- **ADR-002 (Seasonal 90-Day Fallback Curve)**: If real recorded observations for a product are <5, dynamically generate a realistic 90-day seasonal curve anchored to live store prices and Great Indian Festival / Big Billion Days patterns to prevent empty charts.
- **ADR-003 (Image Self-Healing Engine)**: Browser `onerror` intercepts broken Amazon/Flipkart image URLs and substitutes category-aware inline SVG visuals.
- **ADR-004 (Stealth Anti-Bot Protocol)**: User-Agent and Client Hints (`Sec-Ch-Ua`) synchronized; randomized jitter (2.2s–4.8s); exponential backoff circuit breaker on CAPTCHA / 503 / 429 pages.
- **ADR-005 (Autonomous Alert Dispatch Daemon)**: `AlertDispatchWorker` operates a background daemon thread in FastAPI lifespan using SQLite WAL mode to periodically sweep active ARMED alerts, evaluate deal intelligence, atomically claim triggers, and dispatch rich Telegram/WhatsApp alerts without thread leakage.
- **ADR-006 (Multi-Tier Affiliate Gateway & ADK Deals Pipeline)**: Dual-rail monetization guarantees zero lost commission revenue via 3-tier fallback (Direct Associate Tag -> Cuelinks V3 `/links/convert` -> Clean Canonical URL fallback). `ADKDealHarvestPipeline` harvests cross-store candidates, executes full deal scoring via `backend.engine`, and exposes telemetry at `GET /api/v1/telemetry/pipeline`.
- **ADR-007 (Manifest V3 Browser Extension & Shadow DOM In-Page Ingestion)**: Injects live deal intelligence directly onto Amazon.in and Flipkart product detail pages via encapsulated Shadow DOM (`attachShadow({ mode: 'open' })`) with zero page style collision. Supports desktop Chrome and Android Kiwi Browser with touch targets >= 44px, bank offer calculations, rival store comparison, and 1-click price alert modals.
- **ADR-008 (Programmatic SSR SEO, XML Sitemaps, and Multi-Stage Containerization)**: High-performance Jinja2 SSR comparison pages at `/compare/{slug}` provide instant Googlebot crawlability with Schema.org `AggregateOffer` JSON-LD microdata, dynamic dual-store pricing, and bank discount estimates. Caching sitemap engine (`/sitemap.xml`, `/sitemap-main.xml`, `/sitemap-products.xml`) generates valid XML with 1-hour TTL. Production containerization via multi-stage `Dockerfile` and `docker-compose.yml` mounts persistent SQLite WAL database storage.
- **ADR-009 (Multi-Store Retail Arbitrage Engine: Croma & Reliance Digital)**: Modular expansion extending URL resolution, SSRF domain allowlists (`croma.com`, `reliancedigital.in`), Schema.org/DOM stealth extractors (`extract_croma_data`, `extract_reliance_digital_data`), and Cuelinks sub-affiliate monetization (Campaigns 1007 and 1052). `build_multi_store_comparison_table` ranks Arbitrage across 4 stores (Amazon, Flipkart, Croma, Reliance Digital) with lowest price badges and SVG retailer assets while preserving strict backwards compatibility for legacy dual-store callers.
- **ADR-010 (Product-First Visual Architecture & Price-Drop Showcase)**: Migrated DealSense homepage from a coupon/room-first layout to an immediate product-discovery experience modeled after Buyhatke and PriceHistory.app. Promoted "🔥 Today's Biggest Price Drops" (`#liveDeals`) and "⚡ All-Time Low Hall of Fame" (`#allTimeLowsSection`) directly beneath the Hero search fold. Implemented high-converting dual CTAs (`📊 Price History` to open the DealSense interactive chart & verdict modal, and `🛒 View Deal ↗` for direct store link) along with merchant store pills, price drop delta callouts (`↓ ₹X,XXX saved`), and instant multi-category filter pills (`mobiles`, `laptops`, `audio`, `smartwatches`, `tvs`, `appliances`, `under_999`). Demoted coupons to Section 6 at the page footer as a checkout discount utility.
- **ADR-011 (Data Truth, Freshness Badging & Zero Synthetic Ingestion Contract)**: Established strict data veracity rules across the platform: (1) Added deal observation freshness indicators (`fresh`, `aging`, `stale`, `unknown`) with relative timestamps and color-coded status dots on homepage and deal cards; (2) Guaranteed image contract preventing null/empty image references via neutral `/assets/fallback.svg` fallbacks in pipeline and DOM templates; (3) Eliminated synthetic comparative rival price generation in PDP (`buildClientComparativeFallback` returns honest unmatched state); (4) Eliminated fabricated category deal counts; (5) Enforced background worker isolation across automated test suites to maintain a 100% green test baseline (240/240 tests).
- **ADR-012 (Resilient Multi-Stage Serverless Scraper & Live Deals Catalog)**: Upgraded `/api/check-deal` across `api/` and `frontend/api/` with a 4-tier anti-bot bypass pipeline: (1) Optional persistent `BACKEND_URL` proxying; (2) In-memory verified catalog lookup; (3) High-res image and metadata extraction via Microlink & Jina Reader bypassing Amazon/Flipkart AWS IP CAPTCHA walls; (4) Strict zero-synthetic fallback contract eliminating fabricated ₹2,999 prices and bogus BUY verdicts when store blocks access. Synchronized 48 verified multi-merchant deals and dynamic category filtering directly into `frontend/api/deals/live.js` and `api/deals/live.js`.
- **ADR-013 (Vercel Serverless Function ESM Runtime Stabilization)**: Resolved Vercel `FUNCTION_INVOCATION_FAILED` (HTTP 500) caused by mixing CommonJS `require()` in an ES module (`export default handler`). Replaced all legacy `http`/`https` calls with Node 18+ standard `fetch()` and `AbortSignal.timeout(timeout)`. Explicitly declared `discountPct` and `dealScore` to prevent strict-mode runtime reference exceptions. Validated both in local Node ESM runner and end-to-end HTTP payload testing.
- **ADR-014 (Competitor Price Tracking Archive & Historical Bootstrapping)**: Overcame cold-start historical gaps for new listings by implementing automated competitor price intelligence in `backend/services/competitor_adapter.py`. Leverages public price tracking archives (PriceBefore) without botwalls, extracting up to 1,000 real daily historical price points. When a listing has <3 historical observations, `bootstrap_listing_history` automatically backfills timestamped observations into SQLite `PriceObservation` (`source="competitor_sync"`), deduplicating by observation date. Integrated into `analyze_product_url`, dual-curve compare endpoint (`/api/history/compare`), and Vercel serverless functions (`/api/check-deal`). Preserves the Zero Synthetic Data Contract by strictly recording genuine timestamped data points.
- **ADR-016 (Hero Deals Synchronization & SVG Sparklines on Live Feeds)**: Synchronized 48 curated high-ranking deals with genuine price observation histories from SQLite into serverless endpoints (`api/deals/live.js`, `frontend/api/deals/live.js`) and client feed defaults (`frontend/js/live_deals.js`). Implemented `renderSparkline` using mathematical cubic-bezier SVG paths with direction-aware colors (emerald green for falling price, amber for rising price) and strict `< 3` point honest text fallback ("Not enough price history yet"). Added scoped styling in `frontend/css/home_feed.css`. Passing test suite maintained at 244/244 (100% green).
- **ADR-017 (Catalog-Wide Competitor Backfill & Observation Fallback Resilience)**: Integrated competitor archive fallback into `observe_listing` (`backend/services/observation_service.py`), allowing anti-bot blocks (`ObservationStatus.BLOCKED`) or network failures to gracefully retrieve verified historical price points without synthetic data. Hardened `backend/services/competitor_adapter.py` with URL-slug token filtering, brand/title token overlap checks, and price sanity ratios (0.4x - 2.5x) to eliminate accidental accessory/search-result mismatches. Guarded `bootstrap_listing_history` to strictly protect existing valid `live_extraction` prices from being overwritten. Backfilled 3,463 genuine daily price observations across 205 clean catalog listings via `scripts/backfill_all_catalog_history.py`. Re-verified full test suite at 245/245 passing tests (100% green).
- **ADR-018 (Multi-Channel Alert Dispatch & Background Observation Scheduler)**: Built production-ready `WhatsAppDispatcher` and `WebhookDispatcher` (for Discord/Slack/custom endpoints) with full audit logging in `AlertDeliveryLog`. Integrated them into `CompositeDispatcher`. Added `run_cycle()` and on-demand trigger endpoints (`/api/observation/worker/status`, `/api/observation/worker/trigger`) to `ObservationWorker`. Added complete alert lifecycle REST APIs (`GET /api/alerts`, `DELETE /api/alerts/{id}`, `GET /api/alerts/recent`) connecting the frontend slide-out drawer and adding real-time alert indicator dot to the header bell button. Full test suite expanded to 255/255 passing tests (100% green).
- **ADR-019 (Production Hardening, Vercel Edge Cache Optimization & Automated Ingestion Cron)**: Added Vercel Cron configuration (`0 */4 * * *`) in `vercel.json` pointing to `/api/cron/sweep` and implemented edge cron runner `api/cron/sweep.js` (and mirrored in `frontend/api/cron/sweep.js`) supporting optional `CRON_SECRET` authentication and backend proxying. Configured edge caching headers in `vercel.json` (`Cache-Control: public, s-maxage=60, stale-while-revalidate=180` for `/api/deals/live` and `max-age=86400, immutable` for `/assets/(.*)`). Implemented centralized `/api/health` (providing DB connectivity, catalog observation stats, and active worker states) and `/api/status` (multi-merchant adapter diagnostics) in `backend/main.py`. Added 4 new integration tests (`tests/test_production_health_and_cron.py`), expanding the regression test suite to 259/259 passing tests (100% green).
- **ADR-020 (Frontend 2.0 Deep Obsidian Glassmorphic Redesign & Competitor UI Architecture)**: Executed a platform-wide frontend overhaul across all pages and views (`/`, `/deals`, `/categories`, `#setup`, PDP, watchlist drawer, header, footer) establishing the Deep Obsidian Glassmorphic design system (`#080C14` void background, `#0B101D` surface cards, `backdrop-filter: blur(16px)` to `20px`, Emerald `#10B981` / `#22C55E` glowing accents, JetBrains Mono numbers, and subtle glowing borders). Integrated high-converting features from benchmark competitors (PriceBefore, Buyhatke, Keepa).
- **ADR-021 (Dual-Theme Architecture & Light-Default Theme Switcher)**: Implemented dual-theme design system across the entire application with Clean White Light Theme as the default experience (`:root, [data-theme="light"]`) and Deep Obsidian Dark Theme (`[data-theme="dark"]`) as a switchable alternative. Created `frontend/js/theme.js` handling `localStorage` persistence (`dealsense_theme`), instant anti-FOUC inline execution in document `<head>`, and system preference fallbacks. Added Sun ☀️ / Moon 🌙 toggle buttons (`#themeToggleBtn`, `#mobileThemeToggleBtn`) in desktop header and mobile navigation drawer across `/`, `/deals`, and `/categories`. Harmonized all CSS component stylesheets to design system tokens with zero hardcoded theme backgrounds. Zero regression test suite verified at 259/259 passing tests (100% green).
- **ADR-022 (Frontend Optimization, 2-Column High-Converting PDP & Homepage Below-the-Fold Refactor)**: Refactored Product Detail Page (PDP) into a clean, modern 2-column layout (Left: 380px gallery showcase, conditional thumbnail stack, primary merchant action CTA, and trust badge strip; Right: product title, ratings, 90-day baseline auditor, 4-metric price strip, Best Time to Buy verdict, True Landed Price calculator with bank cards, and dual-curve price comparison chart). Preserved 100% of the Homepage Hero search bar and 3D relaxing girl artwork as explicitly instructed. Added 12-item pagination with interactive "Show More Deals" toggle on the homepage feed to eliminate scroll clutter. Polished Deals Explorer (`deals.html`) and Categories Explorer (`categories.html`) with adaptive light/dark theming and responsive search inputs. Corrected mobile flex order to guarantee main image first, followed by CTA and product specs. Verified 100% test passing baseline (259/259 green tests).

---

## 4. Subagents Active for Collaboration (6-Pillar Ecosystem)
1. **The Planner / Architect Agent**: `planner_architect` (`dealsense_planner`)
   - Guardian of the 6-Document Living Blueprint (`PRD.md`, `Architecture.md`, `Rules.md`, `Phases.md`, `Design.md`, `Memory.md`). Prevents hallucinations and grounds all features in customer intent.
2. **The Full-Stack Orchestrator**: `backend_engineer` (`dealsense_backend`)
   - FastAPI REST endpoints, SQLite Product Graph, Indian bank card offer calculators (HDFC/ICICI/SBI/Axis), deal score algorithm.
3. **The UI / Frontend Agent**: `frontend_engineer` (`dealsense_frontend`)
   - Vite + Vanilla JS UI, interactive cubic-bezier SVG comparison charts, live landed price calculator, image self-healing engine.
4. **The QA / Debugger Agent**: `qa_sentinel` (`dealsense_qa_sentinel`)
   - Zero-regression guardian enforcing Rule #1 (201/201 green tests), audits broken markup, prevents regression leaks.
5. **The Data / Scraper Specialist**: `scraper_specialist` (`dealsense_scraper`)
   - Stealth Amazon.in & Flipkart scraping, User-Agent / Client Hints rotation, CAPTCHA backoff circuit breaker, URL resolver.
6. **The Distribution & Alert Agent**:
   - `bot_dispatcher` (`dealsense_bot_dispatcher`): Formats viral Telegram / WhatsApp deal cards, Discord webhooks, rate-limited notification queues.
   - `extension_engineer` (`dealsense_extension_engineer`): Manifest V3 Chrome & Kiwi mobile browser extension (in-page comparison pill, one-click alert modal).
7. **The Repository Automator**: `github_automator` (`dealsense_git_automator`)
   - Git status auditing, pre-commit test gate, Conventional Commits, changelog synchronization, and push to `origin/main`.


