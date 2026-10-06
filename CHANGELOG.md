# Changelog

All notable changes to the DealSense project are documented in this file.

---

## [Phase 14] - 2026-10-06

### Objective
Automated Observation Scheduler, Multi-Channel Price Alert Notification Bot (WhatsApp & Webhook), and Real-Time Watchlist REST APIs.

### Changes Implemented
- **Scheduled Observation Worker Sweep (`backend/services/observation_worker.py`, `backend/main.py`)**:
  - Implemented `ObservationWorker.run_cycle()` to execute on-demand sweeps across due listings without waiting for background thread idle sleeps.
  - Added HTTP diagnostics and trigger endpoints: `GET /api/observation/worker/status` and `POST /api/observation/worker/trigger`.
- **Multi-Channel Alert Dispatchers (`backend/services/whatsapp_dispatcher.py`, `backend/services/webhook_dispatcher.py`)**:
  - Implemented `WhatsAppDispatcher` with high-converting viral WhatsApp deal cards, rupee formatting, and audit logging into `AlertDeliveryLog`.
  - Implemented `WebhookDispatcher` supporting Discord embeds and Slack/universal JSON payloads with persistent delivery logging.
  - Dynamically wired WhatsApp and Webhook dispatchers into `CompositeDispatcher`.
- **Complete Price Alert Lifecycle REST APIs (`backend/main.py`)**:
  - Added `GET /api/alerts` to query active price watches by recipient contact.
  - Added `DELETE /api/alerts/{alert_id}` to deactivate and cleanly remove user price alerts.
  - Added `GET /api/alerts/recent` returning recently triggered deal drop events for live ticker/toast feeds.
- **Frontend Watchlist Drawer & Header Bell Dot (`frontend/js/tracked_deals.js`)**:
  - Connected the slide-out alert drawer to real backend APIs.
  - Added active price alert green indicator dot to the header bell icon on initial load.
- **Test Integrity & Regression Verification**:
  - Added 10 unit and integration tests across `tests/test_alert_dispatcher_channels.py` and `tests/test_observation_worker_cycle.py`.
  - Full regression test suite expanded to **255 / 255 passing tests (100% green)** in 40.7s.

---

## [Phase 13] - 2026-10-06

### Objective
Catalog-Wide Competitor History Backfill, Observation Service Resilient Fallback, and Anti-Mismatched Search Hardening.

### Changes Implemented
- **Resilient Observation Service Fallback (`backend/services/observation_service.py`)**:
  - Integrated competitor archive fallback into `observe_listing` on scraper blocks (`ObservationStatus.BLOCKED`), rate limits, network timeouts, and unpriced responses.
  - Implemented price-ratio sanity validation (0.4x - 2.5x vs `prev_price`) to reject accessories and wrong products.
  - Corrected `ObservationStatus` enum mappings and preserved verified competitor fields when falling back.
- **Competitor Search Hardening & Guarded Bootstrapping (`backend/services/competitor_adapter.py`)**:
  - Added URL slug keyword token matching to search result sublink extraction, preventing accidental accessory matches (e.g., bike GPS tracker or phone covers).
  - Added brand/model token overlap validation against canonical product titles before accepting competitor history points.
  - Guarded `bootstrap_listing_history` so that verified `live_extraction` listing prices are never overwritten by older or approximate competitor points.
- **Catalog-Wide Backfill (`scripts/backfill_all_catalog_history.py`)**:
  - Script safely backfills up to 365 days of genuine historical daily observations across thin listings (`< 5` points).
  - Enriched catalog with 3,463 genuine daily price observations with UTF-8 console safety and zero botwall delays.
- **Serverless & Feed Resynchronization (`scripts/sync_deals_to_serverless.py`)**:
  - Updated `api/deals/live.js`, `frontend/api/deals/live.js`, and `frontend/js/live_deals.js` with 48 clean deals (42 with full historical sparklines).
- **Test Integrity & Regression Verification**:
  - Full test suite verified at 245/245 green tests (100% passing across all 11 test modules).
  - Added unit test `test_competitor_fallback_on_scraper_blocked` in `tests/test_observation_service.py`.

---

## [Phase 12] - 2026-10-06

### Objective
Synchronize Curated Hero Deals into Homepage & Serverless Live Feeds with Real Price History Sparklines, True All-Time Low Badges, and Instant Dual-Curve Chart Deep Linking.

### Changes Implemented
- **Curated Deals Synchronizer (`scripts/sync_deals_to_serverless.py`)**:
  - Pulls ranked deals from SQLite database via `get_ranked_deals()` and samples real price history points.
  - Synchronizes top 48 deals across 7 categories into `api/deals/live.js`, `frontend/api/deals/live.js`, and `frontend/js/live_deals.js`.
- **Interactive SVG Sparklines (`frontend/js/live_deals.js`, `frontend/css/home_feed.css`)**:
  - Implemented `renderSparkline(priceHistory)`: computes dynamic cubic-bezier SVG paths (`M ... C ...`), rendering falling price trends in emerald green (`#10B981`) and rising trends in amber (`#F59E0B`).
  - Strict Zero-Synthetic fallback: returns honest `<span class="deal-sparkline-empty">Not enough price history yet</span>` when points are `< 3`.
  - Added scoped container styling `.deal-sparkline-wrap` and `.deal-sparkline-svg` in `frontend/css/home_feed.css`.
- **Dual CTAs & Price Chart Modal Deep Linking**:
  - Every deal card features dual CTAs (`📊 Price History` to open the modal and `🛒 View Deal ↗` for direct merchant link).
  - Clicking "Price History" triggers `analyzeUrl(deal.url)`, which loads the full 365-day dual-curve comparison chart modal.
- **Test Integrity & Regression Verification**:
  - Full test suite verified: 244 / 244 passing tests in 39.28s.
  - Phase 3.1 Data Integrity Suite verified: 12 / 12 tests passed.

---

## [Phase 11] - 2026-10-06

### Objective
Execute Catalog Purge of Uncategorized and Orphaned Items, Establish Curated Hero Product Seed List, and Bootstrap Genuine Price History via Competitor Tracking.

### Changes Implemented
- **Safety Snapshot & Database Purge (`scripts/purge_junk_catalog.py`, `scripts/deep_clean_catalog.py`)**:
  - Created pre-purge database backup: `data/deal_intelligence.backup_pre_purge.db`.
  - Cascading deletion of 4,500+ out-of-scope non-tech products (wedding carpets, soap dispensers, pillows, kajal) and 399 old test fixture residues.
  - Reclaimed database storage via SQLite `VACUUM`. Clean catalog reduced to 261 high-intent tech products.
- **Cleaned Catalog Seeds (`data/catalog_seeds.json`, `data/curated_catalog_seeds.json`)**:
  - Replaced legacy mixed seeds with 7 core affiliate categories: Mobiles, Laptops, Audio, Smartwatches, Smart TVs, Appliances, and Gaming.
- **Hero Product Price History Bootstrapping (`scripts/bootstrap_curated_catalog.py`)**:
  - Ingested 5,500+ real daily price observations into SQLite (`source="competitor_sync"`) for hero tech items (iPhone 15, MacBook Air, Sony WH-1000XM5, Philips Air Fryer, etc.).
- **Performance & Test Validation**:
  - Test suite runtime decreased by 43% (from 68s to 38.6s) due to catalog compacting.
  - All 244 unit tests passing (100% green).

---

## [Phase 10] - 2026-10-06

### Objective
Implement Automated Competitor Price Tracking & Historical Bootstrapping Adapter to backfill genuine daily price curves (up to 1,000 observations) without synthetic fabrication or anti-bot blocks.

### Changes Implemented
- **Competitor Price History Adapter (`backend/services/competitor_adapter.py`)**:
  - Engineered zero-botwall competitor adapter fetching up to 1,000 days of real daily price points from public competitor archives (PriceBefore).
  - Robust date parser (`parse_pricebefore_date`) supporting diverse Indian and ISO date formats (`05 Oct 2026`, `5 October 2026`, `2026-10-05`).
  - Extrema detection parsing true all-time lowest, highest, and latest prices.
  - Built `bootstrap_listing_history(session, listing_id, product_url, max_days=365)`: backfills historical observations into `PriceObservation` (`source="competitor_sync"`), deduplicating on observation dates and updating listing summary stats.
- **Analysis & Comparative Chart Integration (`backend/services/analysis_service.py`, `backend/main.py`)**:
  - Hooked automated competitor bootstrapping into `analyze_product_url`: if listing has <3 historical observations, it triggers backfill and recalculates statistical price summaries.
  - Hooked automated bootstrapping into dual-curve comparative endpoint `/api/history/compare/{primary_id}/{rival_id}` so dual-store comparison charts immediately display rich real historical curves.
- **Vercel Serverless Function Upgrades (`api/check-deal.js`, `frontend/api/check-deal.js`)**:
  - Added Strategy C (PriceBefore competitor price tracking archive) to serverless extractors.
  - Extracts real all-time lows and latest prices if store page blocks direct extraction.
  - Strictly adheres to Data Integrity and Anti-Synthetic rules (zero synthetic generators, dynamic bracket syntax for verdict, targetEndpoint compliance).
- **Unit Test Suite (`tests/test_competitor_adapter.py`)**:
  - 4 comprehensive unit tests: date normalization, HTML time-series extraction, network error resilience, and DB bootstrap idempotency.
  - Validated full test suite: **244 / 244 passing unit tests (100% Green, 0 Regressions)**.

---

## [Phase 9] - 2026-10-06

### Objective
Implement Resilient Multi-Stage Serverless Scraper and Synchronize Multi-Category Live Deals Feed across Vercel and Backend Surfaces.

### Changes Implemented
- **Resilient Multi-Stage Serverless Scraper (`frontend/api/check-deal.js`, `api/check-deal.js`)**:
  - Implemented 4-tier anti-bot extraction pipeline: persistent `BACKEND_URL` proxying, in-memory verified catalog lookup, Microlink & Jina Reader metadata extraction bypassing AWS datacenter IP CAPTCHA walls on Amazon.in and Flipkart.
  - Eliminated synthetic fallback trap (fabricated ₹2,999 prices and fake BUY verdicts); honest unverified price reporting when store botwalls block extraction.
  - Automatic affiliate parameter injection (`tag=dealsense-21`).
- **Synchronized Multi-Merchant Deals Feed (`frontend/api/deals/live.js`, `api/deals/live.js`)**:
  - Upgraded live deals endpoint from 7 static items to 48 verified deals across all categories (Mobiles, Audio, Laptops, Smartwatches, TVs, Appliances).
  - Dynamic category counting and instant category filtering.
  - Automatic proxying to persistent backend when `BACKEND_URL` is configured.
- **Data Truth Contract & Integrity (`backend/services/deal_pipeline.py`, `backend/config.py`)**:
  - Gated "🔥 All-Time Low" badges on genuine multi-date historical records.
  - Gated "⚡ Price Drop Today" badges on fresh observations.
  - Cleaned placeholder `"dealintel"` default in `FLIPKART_AFFILIATE_ID`.
- **Vercel Serverless Function Runtime Fix (`api/check-deal.js`, `frontend/api/check-deal.js`)**:
  - Replaced legacy CJS `require("https")` / `require("http")` with native ES module `fetch()` and `AbortSignal.timeout` to eliminate `ReferenceError: require is not defined in ES module scope` causing `FUNCTION_INVOCATION_FAILED` (HTTP 500) on Vercel.
  - Declared `discountPct` and `dealScore` variables to resolve strict-mode `ReferenceError`.
  - Verified clean HTTP 200 execution and zero false "Could not reach the DealSense analyser" client errors.
- **Test Suite Verification**:
  - All 240 unit tests passing (100% green, zero regressions).

---

## [Phase 8] - 2026-09-30

### Objective
Implement Data Truth, Observation Freshness Contract, and Synthetic Fallback Elimination across frontend and backend surfaces.

### Changes Implemented
- **Deal Freshness Signals (`backend/services/deal_pipeline.py`, `frontend/js/deals.js`, `frontend/js/live_deals.js`, `frontend/css/deals.css`)**:
  - Attached `freshness_status` (`fresh`, `aging`, `stale`, `unknown`), `freshness_label`, and `age_minutes` to all deal cards.
  - Added visual color-coded freshness dots and tooltips across modern deals cards and deal list items.
- **Image Contract Enforcement (`backend/services/deal_pipeline.py`, `frontend/templates/views/detail_view.html`, `frontend/index.html`)**:
  - Ensured backend deal cards never emit `null`, `"null"`, or empty strings for image URLs; fallbacks route directly to `/assets/fallback.svg`.
  - Replaced empty `src=""` on PDP sticky bars, main photo, and lightbox thumbnails with `/assets/fallback.svg`.
- **Elimination of Synthetic Comparative History (`frontend/js/pdp.js`)**:
  - Removed artificial competitor price curve generation in `buildClientComparativeFallback`, returning an honest unmatched state when competitor data is missing.
- **Honest Catalogue & Extractor Counts (`backend/main.py`, `backend/extractor.py`)**:
  - Removed fabricated baseline counts (5,000) for empty categories in `/api/v1/categories`.
  - Removed artificial price/MRP synthetic fallback in Amazon extractor when data cannot be extracted.
- **Test Suite Expansion & Worker Isolation (`tests/test_deal_freshness.py`, `tests/test_image_contract.py`, `tests/test_alert_worker.py`)**:
  - Added unit test suites verifying freshness calculations and image contract guarantees.
  - Hardened `test_alert_worker.py` fixtures to ensure background alert daemon isolation across full test suite runs.
  - Verified 100% green test suite: 240 / 240 passing tests.

---

## [Phase 4.2 Layer 2B] - 2026-09-10

### Objective
Build Phase 4.2 Layer 2B: Live Candidate Discovery. Establish the first real autonomous candidate discovery pipeline that continuously discovers products for the DealSense Product Universe while preserving strict boundaries: candidate discovery remains separate from price observation, deal scoring, deal publishing, and affiliate routing.

### Architecture Implemented
- **Provider Abstraction Architecture (`backend/services/discovery/providers/`)**:
  - `DiscoveryProvider` base abstraction defining consistent contract: `is_available()` and `discover_query(query, category, max_results)`.
  - `CreatorsAPIProvider`: Official Amazon Creators API abstraction using `SearchItems`. Fails gracefully as unavailable if credentials are not configured without fabricating API responses or claiming access.
  - `AmazonWebDiscoveryProvider`: Controlled Amazon India category and search discovery provider protected by circuit breaker and query budgets.
  - `FlipkartWebDiscoveryProvider`: Controlled Flipkart category and search discovery provider extracting verified PIDs and clean URLs under circuit breaker protection.
- **Configuration-Driven Category Registry (`backend/services/discovery/categories.py`)**:
  - `CategoryRegistry` with 10 initial benchmark categories:
    1. `smartphones` (priority 100, budget 50)
    2. `monitors` (priority 95, budget 50)
    3. `laptops` (priority 95, budget 50)
    4. `GPUs` (priority 90, budget 40)
    5. `SSD` (priority 85, budget 40)
    6. `RAM` (priority 80, budget 30)
    7. `headphones` (priority 85, budget 40)
    8. `smartwatches` (priority 80, budget 40)
    9. `TVs` (priority 80, budget 40)
    10. `gaming peripherals` (priority 85, budget 40)
  - Decouples all category/query logic from discovery workers and ingestion pipelines.
  - Provides priority-weighted, round-robin query selection.
- **Rate Limiting, Safety & Circuit Breaker (`backend/services/discovery/safety.py`)**:
  - `CircuitBreaker` implementing state transitions (`CLOSED`, `OPEN`, `HALF_OPEN`), failure thresholds, and automatic cooldown periods (default 60s).
  - Immediate trip to `OPEN` on severe status codes (403, 429, 503) or CAPTCHA detection.
  - `DiscoverySafetyManager` managing source-level circuit breakers, timeout bounds, and exponential backoff calculations.
  - Provider failure isolation: errors in one merchant source never crash or block discovery cycles on remaining sources.
- **Full Provenance Preservation (`backend/models.py`, `backend/database.py`, `backend/services/discovery/base.py`)**:
  - Candidate records preserve complete provenance: `merchant`, `source_name`, `source_type`, `discovery_method`, `category_hint`, `query`, and `discovered_at`.
  - Added `query` indexed column to `DiscoveryCandidate` SQLModel table with automated idempotent SQLite migration in `init_db()`.
- **Discovery Orchestrator (`backend/services/discovery/orchestrator.py`)**:
  - `DiscoveryOrchestrator` coordinates multi-source discovery, budget enforcement (max 10 queries per run per merchant), queue deduplication, and worker intake execution.
- **Lightweight Discovery Analytics (`backend/services/discovery/analytics.py`)**:
  - `get_discovery_analytics()` computes KPI telemetry: candidates by source, category, query, valid listing conversion rate, observation rate, and deal candidate conversion rate.

### Invariants Maintained
1. **Candidate $\neq$ PriceObservation**: Discovery records provenance and presence only. Discovery price hints never fabricate `PriceObservation` records.
2. **Candidate $\neq$ DealCandidate**: Discovery results never enter public deal feeds or receive `status="DEAL_CANDIDATE"`.
3. **Strict Deduplication**: Canonical dedupe keys (`amazon:{ASIN}` and `flipkart:{PID}`) prevent duplicate queue and listing creation.

### Test Suite (tests/test_live_discovery.py)
Added 16 deterministic tests covering:
1. `test_provider_selection`: Provider priority and fallback resolution.
2. `test_creators_api_unavailable_fallback`: Graceful unconfigured Creators API handling.
3. `test_malformed_api_response`: Rejection of malformed API/HTML payloads without crashing.
4. `test_amazon_normalization_with_provenance`: End-to-end normalization of Amazon candidate with query metadata.
5. `test_flipkart_normalization_with_provenance`: End-to-end normalization of Flipkart candidate with query metadata.
6. `test_category_registry`: Verification of all 10 benchmark categories, priority ordering, and query retrieval.
7. `test_query_budget`: Strict enforcement of per-run query limits.
8. `test_candidate_budget`: Strict enforcement of per-query candidate output limits.
9. `test_source_provenance_preservation`: Complete provenance persistence into SQLite.
10. `test_deduplication_live_candidates`: Filtering duplicates across live queries.
11. `test_retry_and_exponential_backoff`: Verified exponential delay calculation.
12. `test_circuit_breaker`: State machine transitions (`CLOSED` &rarr; `OPEN` &rarr; `HALF_OPEN` &rarr; `CLOSED`) and severe error tripping.
13. `test_candidate_queue_integration`: Proper enqueuing and priority-based queue telemetry.
14. `test_no_synthetic_price_observation`: Guaranteed 0 fabricated PriceObservations.
15. `test_no_deal_candidate_creation`: Guaranteed 0 DealCandidates created.
16. `test_provider_failure_isolation`: Failure in one source isolates gracefully without crashing others.

### Controlled Live Smoke Test (scripts/live_discovery_smoke_test.py)
Executed controlled live search discovery across Amazon India and Flipkart:
- **Amazon Raw Candidates**: 193 (193 verified 10-char ASINs, 193 unique)
- **Flipkart Raw Candidates**: 200 (200 verified PIDs, 200 unique)
- **Total Raw Candidates**: 393
- **In-batch / Existing Duplicates Filtered**: 0
- **Unique Candidates Queued**: 393
- **Worker Batch Accepted**: 10
- **Worker Batch Rejected**: 0
- **Listings Created (delta)**: 10
- **Listings Reused**: 0
- **Products Created (delta)**: 10
- **PriceObservations Created (delta)**: 10
- **Synthetic Observations**: 0 (MUST BE 0)
- **DealCandidates Created**: 0 (MUST BE 0)

### Known Limitations & Next Steps
- Controlled Live Discovery only: maximum 10 queries per run per merchant.
- No broad crawling, infinite pagination, high concurrency, stealth browsers, proxy rotation, or challenge bypass in this phase.
- Live Deals Feed UI and Stitch design intentionally deferred until genuine DealCandidates are produced.

---

## [Phase 4.2 Layer 2A] - 2026-09-10

### Objective
Build Phase 4.2 Layer 2A: Discovery Adapter Framework. Establish unified adapter architecture for candidate discovery with `AmazonDiscoverySource` and `FlipkartDiscoverySource` operating in controlled fixture/adapter mode without uncontrolled live scraping.

### Architecture Implemented
- **Unified Adapter Contract (`backend/services/discovery/base.py`)**:
  - Defined consistent discovery adapter interface on `DiscoverySource`:
    - `discover_candidates()`: Discovers candidate payloads from configured source.
    - `normalize_candidate(raw)`: Validates merchant IDs and normalizes candidate dictionary to `CandidatePayload`.
    - `dedupe_key(product_id)`: Generates canonical deduplication key (`{merchant}:{product_id}`).
    - `source_metadata()`: Returns provenance metadata dictionary.
  - Enhanced `CandidatePayload` with `source_type`, `discovery_method`, and `discovered_at` fields.
- **DiscoveryObservation Semantics**:
  - Formally introduced `DiscoveryObservation` dataclass: records that DealSense discovered a product/listing at time T from source S.
  - Strictly decoupled from `PriceObservation`: contains zero price or deal data. Discovery hints never convert to deal claims.
- **Amazon Discovery Adapter (`backend/services/discovery/sources/amazon.py`)**:
  - `AmazonDiscoverySource` operating in controlled fixture mode.
  - Enforces 10-character uppercase ASIN validation (`[A-Z0-9]{10}`).
  - Canonical dedupe key: `amazon:{ASIN}`.
  - Clean URL normalization: `https://www.amazon.in/dp/{ASIN}`.
  - Source metadata: `source_name="amazon"`, `source_type="category"`, `discovery_method="bestseller"`.
- **Flipkart Discovery Adapter (`backend/services/discovery/sources/flipkart.py`)**:
  - `FlipkartDiscoverySource` operating in controlled fixture mode.
  - Extracts and normalizes Flipkart Product ID (PID) from URL parameters or explicit payload.
  - Canonical dedupe key: `flipkart:{PID}`.
  - Clean URL normalization: `https://www.flipkart.com/p/itm...?...pid={PID}`.
  - Source metadata: `source_name="flipkart"`, `source_type="category"`, `discovery_method="popular"`.
- **Database Schema & Migrations (`backend/models.py`, `backend/database.py`)**:
  - Added `source_type` and `discovery_method` indexed columns to `DiscoveryCandidate`.
  - Added safe automated SQLite table migration in `init_db()` using `ALTER TABLE discovery_candidates ADD COLUMN`.
- **Candidate Queue Service Integration (`backend/services/discovery/queue.py`)**:
  - Updated `CandidateQueueService.enqueue()` to store `source_type` and `discovery_method`.
- **Controlled Fixtures & Verification (`scripts/adapter_smoke_test.py`)**:
  - Created deterministic 5-candidate fixtures for Amazon and Flipkart featuring valid items, duplicates, malformed URLs, and existing listings.

### Test Suite (tests/test_discovery_adapters.py)
Implemented 14 comprehensive tests verifying:
1. `test_amazon_candidate_normalization`: ASIN extraction, clean URL, priority, and metadata normalization.
2. `test_flipkart_candidate_normalization`: PID extraction, clean URL, priority, and metadata normalization.
3. `test_amazon_asin_dedupe`: Canonical `amazon:{ASIN}` deduplication prevents queue duplication.
4. `test_flipkart_pid_dedupe`: Canonical `flipkart:{PID}` deduplication prevents queue duplication.
5. `test_malformed_candidate_rejection`: Invalid ASINs/PIDs and malformed URLs rejected with `None`.
6. `test_existing_listing_reuse`: Candidate matching existing `MerchantListing` reuses listing without creating duplicate rows.
7. `test_source_metadata_preservation`: `source_name`, `source_type`, and `discovery_method` preserved end-to-end.
8. `test_discovery_observation_semantics`: `DiscoveryObservation` captures presence/provenance without price attributes.
9. `test_candidate_to_queue`: Discovered candidates properly enqueue into `discovery_candidates`.
10. `test_queue_to_discovery_worker`: Worker dequeues and progresses candidate through state machine.
11. `test_discovery_worker_canonical_ingestion`: Autonomous discovery ingests new candidate into Product Graph.
12. `test_candidate_does_not_create_price_observation`: Candidate discovery/enqueueing creates 0 PriceObservations.
13. `test_candidate_never_surfaces_as_deal_candidate`: Discovery intake never promotes candidate to `DEAL_CANDIDATE`.
14. `test_mixed_amazon_flipkart_queue_ordering`: Mixed Amazon and Flipkart candidates ordered strictly by priority.

### Controlled Fixture Smoke Test (scripts/adapter_smoke_test.py)
- **Total Candidate Inputs**: 10 (Amazon: 5, Flipkart: 5)
- **Malformed Candidates Rejected**: 2 (Amazon: 1, Flipkart: 1)
- **Duplicate Candidates Filtered**: 2 (Amazon: 1, Flipkart: 1)
- **Unique Accepted Candidates**: 6
- **Existing Listings Reused**: 2
- **Products Created (delta)**: 0
- **Listings Created (delta)**: 2
- **Observations Created (delta)**: 0 (ZERO fabricated price observations)
- **Deal Candidates Created**: 0 (ZERO candidates surfaced as deals)
- **Duplicate Listings**: 0 (ZERO duplicate listings)

### Limitations & Next Steps
- **Zero Live Scraping**: No live crawling of Amazon or Flipkart category pages, search results, or bestseller feeds in this phase.
- **Controlled Fixtures Only**: Adapters currently yield deterministic fixtures; live scraping loops, proxy rotation, and anti-bot handling are deferred to subsequent layers.

---

## [Phase 4.2 Layer 1] - 2026-09-10

### Objective
Implement Layer 1 of the DealSense Autonomous Discovery Engine: a quarantined intake pipeline that processes candidate product URLs into canonical catalog records without public deal pollution, synthetic data fabrication, or duplicate listing creation.

### Architecture Implemented
- **Intake Pipeline & Base Layer (`backend/services/discovery/base.py`)**:
  - `CandidatePayload`: Strict validation schema enforcing URL syntax, priority boundaries ($[0.0, 100.0]$), and automated deduplication metadata generation.
  - `DiscoverySource`: Abstract base class establishing standard candidate generation interface.
- **Two-Tier Deduplication Strategy**:
  - **Tier 1 (Store-Specific Product IDs)**:
    - Amazon: `amazon:{ASIN}` (normalized uppercase 10-character ASIN).
    - Flipkart: `flipkart:{PID}` (normalized clean product ID).
    - Other supported adapters: `{merchant}:{PID}`.
  - **Tier 2 (Cryptographic URL Fallback)**:
    - `sha256(normalized_clean_url)` with query stripping and lowercase normalization.
- **Candidate Queue Service (`backend/services/discovery/queue.py`)**:
  - State machine enforcing strict candidate progression.
  - Duplicate queue prevention: Enqueuing an existing `dedupe_key` returns the existing candidate record without database duplication.
  - Priority-ordered batch dequeue (`discovery_priority.desc()`, `created_at.asc()`).
  - Exponential backoff retry engine: `backoff_seconds = DISCOVERY_BASE_BACKOFF_SECONDS * (2 ** (attempts - 1))`.
  - Requeuing of due retry candidates whose backoff elapsed.
- **Controlled Curated Seed Source (`backend/services/discovery/sources/curated_seed.py`)**:
  - Configuration/JSON-driven source implementing `DiscoverySource`.
  - Bundles 5 verified benchmark products across Amazon and Flipkart.
  - Completely non-scraping: operates purely as a structured data feed.
- **Autonomous Discovery Worker (`backend/services/discovery/worker.py`)**:
  - Standalone worker consuming quarantined candidates.
  - Resolves candidate URLs via `adapter_registry.resolve_url`.
  - Detects pre-existing `MerchantListing` records by product ID and marks candidates `ACCEPTED` without creating duplicate listings.
  - Invokes canonical ingestion (`ingest_product_from_url`) with `discovery_source="AUTONOMOUS_DISCOVERY"`.
  - Verifies presence of genuine `PriceObservation` records before promoting candidates to `TRACKING`.
  - Schedules standard observation priority (`determine_listing_priority`).
- **Database Schema & Migration (`backend/models.py`, `backend/database.py`)**:
  - `discovery_candidates` SQLModel table with composite index on `(status, discovery_priority, next_attempt_at)` and unique index on `dedupe_key`.
  - Automated SQLite index creation in `init_db()`.
- **API Endpoints (`backend/main.py`)**:
  - `POST /api/discovery/seed`: Enqueues curated candidates.
  - `POST /api/discovery/run-cycle`: Triggers intake batch execution.
  - `GET /api/discovery/queue`: Reports queue metrics and configured budget limits.
  - `GET /api/discovery/candidates`: Retrieves candidate records with optional status filtering.

### Candidate State Machine
- **Progression**:
  `DISCOVERED` &rarr; `QUEUED` &rarr; `PROCESSING` &rarr; `IDENTIFIED` &rarr; `OBSERVED` &rarr; `TRACKING` &rarr; `DEAL_CANDIDATE`
- **Failure & Recovery**:
  `PROCESSING` &rarr; `FAILED` &rarr; `RETRY` &rarr; `REJECTED`
- **Candidate $\neq$ Deal Rule**:
  Discovery candidates are strictly quarantined in `discovery_candidates` and never surface in the live deals feed or public deal endpoints.

### Separation from ObservationWorker
- `DiscoveryWorker` finds, normalizes, and ingests new candidate URLs.
- `ObservationWorker` polls prices on established `MerchantListing` records.
- The two workers are separate classes running distinct lifecycles; discovery errors or timeouts have zero impact on ongoing price observation loops.

### Cuelinks Architectural Decision
- **Cuelinks is NOT a product catalog feed**.
- Source renamed to `CuelinksOfferSource` (subclass of `DiscoverySource`) and deferred to later phases.
- Cuelinks API will only be used for affiliate conversion, campaign/offer discovery, and commission intelligence—never for catalog product enumeration.

### Configurable Discovery Budgets
Configured in `backend/config.py` via environment variables:
- `DISCOVERY_TARGET_PRODUCTS = 1500`
- `CATEGORY_SEED_BUDGET = 250`
- `OFFER_CANDIDATE_BUDGET = 500`
- `BESTSELLER_CANDIDATE_BUDGET = 750`
- `DISCOVERY_MAX_ATTEMPTS = 3`
- `DISCOVERY_BASE_BACKOFF_SECONDS = 300`

### Exact Files Created & Modified
- **Created**:
  - `backend/services/discovery/__init__.py`
  - `backend/services/discovery/base.py`
  - `backend/services/discovery/queue.py`
  - `backend/services/discovery/sources/__init__.py`
  - `backend/services/discovery/sources/curated_seed.py`
  - `backend/services/discovery/worker.py`
  - `tests/test_discovery_engine.py`
  - `scripts/discovery_smoke_test.py`
  - `CHANGELOG.md`
- **Modified**:
  - `backend/config.py`
  - `backend/database.py`
  - `backend/main.py`
  - `backend/models.py`
  - `backend/services/ingestion_service.py`

### Test Suite Status
- **Test Count Before**: 138 passing
- **Test Count After**: 155 passing (17 new tests, 0 failures, 0 regressions)

### Controlled 5-Product Smoke Test Audit
- **Candidates Discovered**: 5
- **Candidates Accepted**: 5
- **Candidates Rejected**: 0
- **Candidates In Retry**: 0
- **Products Created (delta)**: 0 (matched and re-used canonical identities)
- **MerchantListings Created (delta)**: 3
- **PriceObservations Created (delta)**: 0
- **Synthetic Observations**: **0 (MUST BE 0 — Verified)**
- **Duplicate Listings**: **0 (MUST BE 0 — Verified)**

### Explicit Exclusions & Known Limitations
- **NOT Implemented**:
  - `AmazonDiscoverySource` autonomous catalog spider is **NOT** implemented.
  - `FlipkartDiscoverySource` autonomous catalog spider is **NOT** implemented.
  - Cuelinks catalog enumeration is **NOT** implemented.
  - Live Deals Feed UI is **NOT** modified.
- Current Phase 4.2 scope is strictly restricted to Layer 1 intake and candidate queue management.

### Next Approved Step
Await user review and approval before proceeding to Phase 4.3 (Autonomous Category/Bestseller Discovery Adapters).
