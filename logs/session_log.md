# Deal Intelligence — Project Session Log

This file is the persistent working memory for the AI cofounder session.
It is automatically maintained across every conversation.
Read this at the start of every new chat to restore context.

**Project:** Deal Intelligence — India-focused shopping intelligence platform  
**Stack:** FastAPI (Python) + SQLite + Vanilla HTML/CSS/JS frontend  
**Server:** uvicorn on port 8000  
**Root:** `d:\Gursher\Affiliate\Deal Intelligence`

---

## [2026-09-04 12:02 IST] — Session Entry

**User Request:**
Start the backend server.

**Actions Taken:**
- Read `backend/main.py` to understand the FastAPI app structure
- Started server using: `.venv\Scripts\uvicorn.exe backend.main:app --reload --host 0.0.0.0 --port 8000`
- Confirmed server running successfully on http://localhost:8000

**Key Decisions / Findings:**
- App uses FastAPI with SQLite (dealwise.db), SQLModel ORM
- Frontend is served as static files mounted at `/` via FastAPI StaticFiles
- Hot reload is enabled for development
- CORS is open (`*`) — acceptable for dev, needs tightening before production

**Status:** COMPLETE

**Open Items / Next Steps:**
- Server is running and ready for frontend/backend development

---

## [2026-09-04 12:02 IST] — Session Entry

**User Request:**
Add persistent session logging system — log every conversation to a file so context survives across new chats.

**Actions Taken:**
- Created `.agents/rules/rule5.md` — new mandatory rule (Rules 38–40) that:
  - Requires reading `logs/session_log.md` at the start of every new conversation
  - Requires appending a log entry after every substantive reply
  - Defines the log entry format (date, request, actions, decisions, status, next steps)
  - Defines log rotation policy (archive after 500 entries)
- Created `logs/session_log.md` (this file) as the initial persistent log

**Key Decisions / Findings:**
- Log lives in project root under `logs/` so it's part of the codebase and version-controllable
- Newest entries appended at the bottom (chronological order)
- Rule is structured so any new chat session immediately has full project context

**Status:** COMPLETE

**Open Items / Next Steps:**
- Log is now active. Every future session will auto-append here.
- Consider adding `logs/` to `.gitignore` if you don't want logs committed, or keep it for full history.

---

## [2026-09-05 02:20 IST] — Session Entry

**User Request:**
Clean up DealWise by removing/disabling all unofficial Amazon and Flipkart scraping/extraction paths, background threads, captcha solvers, and search scrapers without altering DB models, price histories, or frontend UI.

**Actions Taken:**
- Removed `DealsScheduler` background daemon thread from `backend/main.py`.
- Replaced periodic scrape loop in `backend/services/deal_pipeline.py` with database-backed deal loading (`load_deals_from_db`).
- Decommissioned HTML scraping, captcha handling (`validateCaptcha`), and bot spoofing from `backend/extractor.py`; preserved `ExtractedProduct` schema and replaced extraction with safe non-scraping stubs returning `None`.
- Removed live HTML web search scraping from `backend/matcher.py`; updated cross-store matching to evaluate against SQLite `MerchantListing` and canonical `Product` records.
- Removed live Amazon search HTML fallback from `backend/resolver.py`; updated keyword discovery to query local SQLite catalog.
- Stopped `backend/service.py` from attempting scrapes on cache misses; catalog items evaluate against SQLite observations.
- Removed obsolete scraper settings (`DEAL_SCRAPE_DELAY_MIN`, `DEAL_SCRAPE_DELAY_MAX`, `DEAL_MAX_RETRIES`) from `backend/config.py`.
- Verified and updated `scripts/tracker.py` and `scripts/test_extractor.py`.
- Executed all unit, foundation, pipeline, and API test suites (all PASSED).
- Verified live server endpoints (`/api/health`, `/api/homepage`, `/api/categories`, `/deals`).

**Key Decisions / Findings:**
- All 39 canonical products, 42 merchant listings, and 246 price observations in SQLite remain completely intact.
- Zero background network scraping calls occur on startup or during deal checks.
- Codebase is clean, modular, and ready for official affiliate / API data integrations.

**Status:** COMPLETE

**Open Items / Next Steps:**
- Awaiting next roadmap instruction (e.g. data integration architecture, official APIs / feeds).

---

## [2026-09-05 02:40 IST] — Session Entry

**User Request:**
Prepare Cuelinks V3 environment configuration for DealWise. Protect .env, verify gitignore, configure backend to read CUELINKS_API_KEY safely without exposing credentials or modifying scraping/product logic.

**Actions Taken:**
- Verified `.env` file location at project root: `D:\Gursher\Affiliate\Deal Intelligence\.env`.
- Verified `.gitignore` contains `.env` (line 5).
- Updated `backend/config.py` to securely parse `.env` at startup using Python standard library without external dependencies.
- Added `CUELINKS_API_KEY` and `CUELINKS_BASE_URL` to `Settings`.
- Confirmed `backend.config.settings` can safely read the key and base URL (key length = 43 chars, presence = True) with zero exposure in code, logs, or chat.
- All foundation tests passed (7/7 OK).

**Key Decisions / Findings:**
- Cuelinks is strictly quarantined as an affiliate/monetization layer, not a product or price scraping source.
- Zero API clients, endpoints, or product logic changes made.

**Status:** COMPLETE — Awaiting user's next instruction.

---

## [2026-09-05 02:42 IST] — Session Entry

**User Request:**
Perform ONLY the Cuelinks V3 /ping connection test using `Authorization: Token <CUELINKS_API_KEY>` against `https://developers.cuelinks.com/pub_api/v3/ping`. Create `scripts/test_cuelinks_ping.py`, never expose the API key, and report results.

**Actions Taken:**
- Created `scripts/test_cuelinks_ping.py` using `httpx` and `settings.CUELINKS_API_KEY`.
- Executed `python -m scripts.test_cuelinks_ping`.
- Request to `https://developers.cuelinks.com/pub_api/v3/ping` returned HTTP 200.
- Authentication succeeded with publisher data returned (`id: 271809`, `currency: INR`).
- Zero API keys or Authorization headers exposed.

**Status:** COMPLETE — Awaiting next instruction.

---

## [2026-09-05 02:44 IST] — Session Entry

**User Request:**
Inspect Cuelinks V3 Flipkart campaigns (`GET /campaigns?q=flipkart` and `GET /campaigns/:id`). Create `scripts/test_cuelinks_flipkart_campaign.py`. Report matching campaigns, ID, status, payouts, platforms, restrictions. Never expose API key. Do not modify frontend, database, or pricing logic.

**Actions Taken:**
- Created `scripts/test_cuelinks_flipkart_campaign.py`.
- Queried `https://developers.cuelinks.com/pub_api/v3/campaigns?q=flipkart` with token auth.
- Discovered 3 matching campaigns:
  1. Campaign ID `1`: Flipkart (`domain: flipkart.com`, `access_status: not_applied`, default payout up to 6%, deeplinks allowed, cookie 30 mins).
  2. Campaign ID `66947`: Flipkart Seller Kids (`access_status: open`).
  3. Campaign ID `38854`: SBI Flipkart Credit Card (`access_status: open`).
- Deep-inspected Campaign `1` (`GET /campaigns/1`): Allowed on Web, Mobile Web, Android App, iOS App. Disallowed media includes POP traffic, SEM brand bidding, and Facebook ads.
- Noted key finding: `access_status` is `not_applied` for Flipkart ID 1 (requires application/approval in Cuelinks publisher dashboard if not auto-approved).

**Status:** COMPLETE — Awaiting next instruction.

---

## [2026-09-05 02:46 IST] — Session Entry

**User Request:**
Inspect Cuelinks V3 documentation for campaign access requests (`POST /pub_api/v3/campaigns/1/request_access`). Determine if supported, exact requirements, whether dashboard vs API is preferable, and expected approval status. Do not submit request.

**Actions Taken:**
- Researched primary documentation from `https://developers.cuelinks.com/docs/reference/campaigns/request-access`.
- Confirmed endpoint `POST /pub_api/v3/campaigns/:id/request_access` is officially supported under `read:campaigns` scope.
- Identified request schema: path `id=1`, JSON body `promotion_details` (string) and optional `channel_id` (integer).
- Identified operational behavior: transitions status from `not_applied` to `pending` (HTTP 201).
- Evaluated dashboard vs API: Dashboard or detailed API submission with vetted promotional explanation is strongly recommended due to Flipkart tier guidelines.

**Status:** COMPLETE — Awaiting user's next instruction.

---

## [2026-09-05 02:49 IST] — Session Entry

**User Request:**
Inspect Cuelinks publisher channel configuration prior to requesting Flipkart Campaign 1 access. Determine configured channels, DealWise channel suitability, approval status, and channel ID/domain without exposing API keys.

**Actions Taken:**
- Created `scripts/test_cuelinks_channels.py`.
- Queried `GET https://developers.cuelinks.com/pub_api/v3/channels`.
- Returned HTTP 403: `This API key lacks the 'read:channels' scope` (current key has `read:campaigns`, `read:offers`, `write:links`).
- Inspected campaign tracking URLs returned by API for account `271809` and discovered default Channel ID (`cid`): `317262`.
- Noted that detailed channel metadata (website domain, name, verification status) requires either viewing the Cuelinks publisher dashboard under Channels or adding `read:channels` scope to the API key.

**Status:** COMPLETE — Awaiting user's next instruction.

---

## [2026-09-05 02:51 IST] — Session Entry

**User Request:**
Use the existing DealWise Admin Cuelinks API key with `read:channels` to call `GET /pub_api/v3/channels` and report channel ID, name, source_url, category, status, is_default. Do not print API keys or modify anything.

**Actions Taken:**
- Ran `scripts/test_cuelinks_channels.py` against `https://developers.cuelinks.com/pub_api/v3/channels`.
- Request returned HTTP 403: `This API key lacks the 'read:channels' scope`.
- Verified that `.env` on disk still holds the initial API key (which lacks `read:channels`), meaning the new "DealWise Admin" key has not yet been pasted into `.env` (or the `.env` file was not saved after pasting).

**Status:** COMPLETE — Awaiting user key paste/update in `.env`.

---

## [2026-09-05 02:54 IST] — Session Entry

**User Request:**
Use the DealWise Admin Cuelinks API key (with `read:channels`) to query `GET /pub_api/v3/channels` and report: channel ID, name, source_url, category, status, is_default. Do not expose keys or modify frontend/models/APIs.

**Actions Taken:**
- Confirmed `.env` updated with DealWise Admin key.
- Executed `scripts/test_cuelinks_channels.py` against `https://developers.cuelinks.com/pub_api/v3/channels`.
- Request succeeded with HTTP 200:
  - Channel ID: `317262`
  - Name: `My Channel`
  - source_url: `https://dealwise.com/`
  - category: `Website / Blog`
  - status: `pending`
  - is_default: `false`
  - created_at: `2026-09-04T08:43:48Z`
- Zero keys exposed or printed. No campaign access requested.

**Status:** COMPLETE — Awaiting next instruction.
