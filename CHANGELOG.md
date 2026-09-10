# Changelog

All notable changes to the DealSense project are documented in this file.

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
