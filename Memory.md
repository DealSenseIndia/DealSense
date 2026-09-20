# DealSense / Deal Intelligence — Living State Machine & Memory Ledger

> **Notice to AI Pair Programmers**: Consult this file BEFORE making any edits. Update this file whenever you complete a task, encounter a blocker, or modify system architecture.

---

## 1. Project Health & Verified Baseline Status
- **Repository**: `D:\Gursher\Affiliate\Deal Intelligence`
- **Active Workspace**: Deal Intelligence (Antigravity IDE)
- **Current Milestone**: Phase 4 (Distribution Wedge & Chrome/Kiwi Mobile Extension)
- **Unit Test Health**: **216 / 216 Passing Unit Tests (100% Green)**
- **Test Runner Command**: `.venv\Scripts\pytest.exe -q` (59.9s execution)
- **Verified Working Test Suites**:
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

---

## 3. Verified Architecture Decisions (ADRs)
- **ADR-001 (Product Identity Graph)**: Modeled as `Product` (canonical) → `MerchantListing` (store listing) → `PriceObservation` (timestamped observation). Clean cross-store comparison between Amazon.in and Flipkart.
- **ADR-002 (Seasonal 90-Day Fallback Curve)**: If real recorded observations for a product are <5, dynamically generate a realistic 90-day seasonal curve anchored to live store prices and Great Indian Festival / Big Billion Days patterns to prevent empty charts.
- **ADR-003 (Image Self-Healing Engine)**: Browser `onerror` intercepts broken Amazon/Flipkart image URLs and substitutes category-aware inline SVG visuals.
- **ADR-004 (Stealth Anti-Bot Protocol)**: User-Agent and Client Hints (`Sec-Ch-Ua`) synchronized; randomized jitter (2.2s–4.8s); exponential backoff circuit breaker on CAPTCHA / 503 / 429 pages.
- **ADR-005 (Autonomous Alert Dispatch Daemon)**: `AlertDispatchWorker` operates a background daemon thread in FastAPI lifespan using SQLite WAL mode to periodically sweep active ARMED alerts, evaluate deal intelligence, atomically claim triggers, and dispatch rich Telegram/WhatsApp alerts without thread leakage.
- **ADR-006 (Multi-Tier Affiliate Gateway & ADK Deals Pipeline)**: Dual-rail monetization guarantees zero lost commission revenue via 3-tier fallback (Direct Associate Tag -> Cuelinks V3 `/links/convert` -> Clean Canonical URL fallback). `ADKDealHarvestPipeline` harvests cross-store candidates, executes full deal scoring via `backend.engine`, and exposes telemetry at `GET /api/v1/telemetry/pipeline`.


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


