# DealSense — Codebase Analysis

**Date:** 12 September 2026
**Scope:** Static analysis of `D:\Gursher\Affiliate\Deal Intelligence` (backend, frontend, tests, tooling). Code was read, not executed — the Linux sandbox is unavailable on this machine, so nothing here was verified by running it.

---

## 1. What the project is

DealSense is a shopping-intelligence web application for the Indian e-commerce market, covering Amazon.in and Flipkart. A user submits a product URL; the system resolves it to a canonical merchant product, scrapes the live selling price and MRP, records a price observation, accumulates history over time, and returns an explainable verdict of BUY, WAIT, SKIP, or NOT ENOUGH DATA. Revenue comes from affiliate links, either direct (Amazon `tag=`, Flipkart `affid=`) or wrapped through a Cuelinks aggregator redirect.

The stack is FastAPI with SQLModel over SQLite on the backend, and a deliberately framework-free frontend of vanilla JavaScript, CSS custom properties, and semantic HTML. `DESIGN.md` explicitly forbids introducing React, Tailwind, or Vue, and describes the intended aesthetic as "Bloomberg terminal meets premium Indian shopping app" — high information density, sharp typography, and above all visible data provenance.

The project is organised into numbered delivery phases tracked in `CHANGELOG.md`. As of 10 September 2026 it had reached "Phase 4.2 Layer 2B," covering live candidate discovery, with a stated convention of pausing for review before starting each subsequent phase.

## 2. Architecture

The backend entry point is `backend/main.py`, a single ~1,465-line module holding roughly thirty endpoints. It also mounts the frontend as static files, so one `uvicorn backend.main:app` process serves both API and UI. Its lifespan hook initialises the database, regenerates the homepage HTML, and starts a background price-observation worker thread.

Beneath that sit about thirty modules in `backend/services/`. The most important separation is between four independent concerns: `extractor.py`, `resolver.py`, and `matcher.py` handle scraping and URL canonicalisation; `price_service.py` computes historical statistics purely from stored observations; `observation_service.py` and `observation_worker.py` run scheduled polling; and `alert_service.py` with the `telegram_*` modules handle notification delivery. A separate `services/discovery/` package implements autonomous candidate intake with its own queue, circuit breaker, and provider abstraction.

The verdict logic lives in `backend/engine.py` and is the strongest part of the codebase. It is fully deterministic with explicitly documented thresholds — BUY when within 3% of the historical low or 12% below median, WAIT when 8% above median or 15% above the low — and it returns a list of classified evidence items tagged `VERIFIED FACT`, `CALCULATION`, or `RECOMMENDATION`. There is no machine learning and no opaque scoring, which makes every verdict auditable. It correctly short-circuits to `NOT ENOUGH DATA` rather than guessing when history is thin.

The frontend is a hybrid. `index.html` is a *generated artifact*: `scripts/build_html.py` uses Jinja2 purely as an HTML concatenator over `frontend/templates/`, rendered with no context variables. The other two pages, `deals.html` and `categories.html`, are hand-maintained and duplicate the header and footer markup by hand. Within `index.html`, three views coexist in the DOM and `js/ui.js` toggles `style.display` between them, with no History API usage at all — so product detail pages have no URL of their own and cannot be linked, shared, or reached with the back button.

## 3. The central problem: real infrastructure, fabricated outputs

The single most important finding is a systematic gap between what the code claims and what it does. `DESIGN.md` states an "Anti-Fabrication Mandate" — no fake placeholders, no fake curves, show `--` rather than an estimate. The scraping and observation layers honour this scrupulously. The user-facing surfaces do not.

What is genuinely real: `backend/extractor.py` performs actual HTTP scraping with `httpx` and BeautifulSoup, with real DOM selectors, JSON-LD parsing, and mobile-user-agent retry. There is no mocking layer and no random price generation anywhere in the price path. `price_service.py` computes minimum, maximum, median, and mean strictly from stored observations, and requires at least three prices across at least two distinct dates before reporting sufficient history. `observation_service.py` never writes an observation when a scrape fails. This is disciplined, honest engineering.

What is fabricated, in descending order of severity:

`backend/services/discount_auditor.py` is the most misleading code in the project, and it runs live from `service.py:254` and `service.py:496`. When MRP is missing it invents one at `current_price * 1.35`; when history is missing it invents a baseline at `current_price * 1.12`. That second multiplier mathematically guarantees a computed "real discount" of about 10.7%, which trips the branch at line 34 and emits the message: *"Verified Genuine Discount: Selling price is legitimately 10% below the 90-day typical baseline ... with no artificial price spike."* That sentence is presented to the user as verified fact while resting on two invented constants and no history whatsoever.

`frontend/js/api.js` implements a three-tier fallback where the third tier fabricates an entire deal response in the browser — roughly 320 lines inferring category, brand, and price from URL substring matching, and generating competitor prices as plain arithmetic (Croma at `price * 1.06`, Reliance at `* 1.08`, Tata CLiQ at `* 1.10`) which are then rendered as a real "Compare Stores" table. Because that tier always returns a well-formed object, the function essentially cannot fail, so the user has no way to distinguish fabricated data from real data, and the calling code's error handler is effectively unreachable.

`frontend/js/deals.js` defines six hardcoded `REFERENCE_DEALS` with hand-written price sparklines, merged *ahead* of live API data, and the default grid view is sliced to exactly those six. The landing state of `/deals` is therefore always static mock content regardless of backend state.

`backend/main.py` serves hardcoded marketing statistics as though they were live metrics — 450,000+ shoppers, ₹9.2 Crore+ saved, 210,000+ fake discounts flagged — alongside a `DEAL_COUNTS_MAP` of invented per-category counts that the frontend independently duplicates.

Compounding this, the deals feed is structurally disconnected from the scraper. `services/deal_pipeline.py` `refresh_deal_pool()` no longer scrapes; it only reloads from the database, as its own comment admits. `backend/data/deal_seeds.json` is loaded three times but never creates a listing — in one case it is loaded, sliced, and then discarded unused. On a fresh database the feed returns zero deals, so what users actually see comes from `seed_taxonomy.py`, which inserts hand-authored demo products, some with URLs that do not exist (`itm112233`), each carrying exactly one observation and therefore no history.

The net position is that DealSense *can* fetch real prices and reason about them correctly, but by default the surfaces a user touches are showing seeded or invented numbers dressed in the language of verification.

## 4. What works well

The alerting pipeline is the most production-ready subsystem and appears functional end to end. The chain from observation through alert evaluation to Telegram dispatch is real, with genuine outbound HTTP to `api.telegram.org`, distinct handling for 200, 403, 429, and 5xx responses, automatic alert disabling when a user blocks the bot, token-bucket rate limiting, and an audit log row per delivery. The alert state machine claims transitions with a conditional UPDATE and a rowcount check, which is genuinely race-safe, and it applies cooldown hysteresis to avoid retrigger storms.

The observation worker is real and does start. It runs as a daemon thread with coherent priority tiers (HOT at 45 minutes through COLD at 24 hours), exponential failure backoff, per-merchant concurrency locks, and a circuit breaker that pauses a merchant after three consecutive blocks.

The test suite is better than the directory layout suggests. `tests/` holds thirteen files of genuine automated tests with proper assertions and `monkeypatch`-based network isolation, covering alerts, discovery, observation, taxonomy, data integrity, and Telegram delivery — the CHANGELOG cites 155 passing tests. Notably, several tests exist specifically to assert that no synthetic price observations are ever created, which shows the fabrication problem is understood in some parts of the codebase even as it persists in others.

## 5. Security and correctness issues

There is an unauthenticated **SSRF** vulnerability. `resolver.py:130` calls `unwind_redirects()`, which issues `httpx.get(url, follow_redirects=True)`, *before* the merchant-domain validation that only occurs at line 200. It is reachable from `/api/check-deal`, `/api/analyze`, and `/api/discover` with an arbitrary URL, and there is no scheme or IP allowlist, so internal hosts and cloud metadata endpoints can be fetched. The fix is to validate the hostname against the merchant allowlist and block private and link-local ranges before making any request.

A second SSRF exists in `frontend/api/check-deal.js`, a Vercel serverless function that reimplements the same endpoint in JavaScript. It accepts any URL, fetches it server-side with a spoofed user agent, and sets `Access-Control-Allow-Origin: *`. It also disagrees with the Python backend on affiliate scheme, emitting Cuelinks redirects where Python emits direct tags — meaning revenue attribution depends on which implementation happens to serve the request. On scrape failure it substitutes fixed prices and images, then labels the result verdict BUY with HIGH confidence.

The Telegram webhook has two problems: `TELEGRAM_WEBHOOK_SECRET` defaults to empty and the authentication check is skipped entirely when unset, making it a public unauthenticated endpoint by default, and the comparison uses `!=` rather than `hmac.compare_digest`. Separately, the handler is declared `async def` but calls blocking synchronous HTTP, which stalls the event loop.

Deployment configuration is contradictory. Two `vercel.json` files exist with mutually inconsistent assumptions about the project root, and only one applies depending on a dashboard setting. The root config has no `/api/*` rewrite and no `functions` block, so if it is the live one the serverless function is not mounted and every request degrades to client-side fabrication. Neither config rewrites `/categories/(.*)`, so subcategory links that work locally under FastAPI's catch-all will 404 in production.

Smaller items: CORS is `allow_origins=["*"]` combined with `allow_credentials=True`; `scripts/migrate_db.py` is hand-rolled `ALTER TABLE` with no versioning or down-migrations rather than Alembic; heavy bare-`except` usage in `extractor.py` masks parse failures; and `DiscoveryOrchestrator` is never imported by `main.py`, making the full multi-source discovery path dead code from the API's perspective.

## 6. Tooling traps

`pytest.ini` sets `testpaths = tests`, so a bare `pytest` run collects only the real suite. The four files named `scripts/test_*.py` are *not* collected and are manual smoke scripts of mixed quality: `test_pipeline.py` has zero assertions and hits live Amazon and Flipkart, `test_api.py` performs network and database work at import time, and `test_foundation.py` requires a manually started uvicorn. Running `pytest scripts/` would fire live network calls during collection, so it should be avoided.

Two scripts are machine-specific one-offs that cannot run elsewhere: `crop_categories.py` reads from an absolute path under `C:\Users\Khanna Computer\.gemini\`, and `restore_hero.py` destructively rewrites `home_view.html` by splicing lines from a different project directory on disk.

There is no CI configuration, no frontend tests of any kind, and no test for `build_html.py` — so drift between `frontend/templates/` and the committed `index.html` artifact would go undetected. `style.css` serially `@import`s nine of the eleven CSS files, producing nine blocking round-trips before first paint with no bundling step; `pdp.css` alone is 3,945 lines.

## 7. Recommendations, in priority order

**Fix before any public deployment.** Move merchant-domain validation ahead of the first HTTP request in `resolver.py` and add a private-IP block, which closes the SSRF. Make `TELEGRAM_WEBHOOK_SECRET` mandatory and compare it with `hmac.compare_digest`. Then decide deliberately whether the Vercel function or the Python backend owns `/api/check-deal` and delete the loser, because keeping both guarantees inconsistent affiliate attribution and leaves a second SSRF open. Resolve the duplicate `vercel.json` at the same time.

**Then close the honesty gap**, which is the project's real differentiator and the thing most at risk. Rewrite `discount_auditor.py` so that absent MRP or absent history produces an explicit "insufficient data" state instead of a 1.35× or 1.12× invention — `DESIGN.md` already specifies exactly what those empty states should look like, so this is aligning code with a decision already made. Then remove the tier-three fabrication in `api.js` and let the UI show a real error, and stop merging `REFERENCE_DEALS` ahead of live data. The hardcoded homepage statistics should either be computed or removed.

**Then structural work.** Connect the deals feed to the observation pipeline so it reflects real accumulated data, or else be explicit in the UI that it is a demo. Add URL routing to the frontend so product pages are linkable. Move `scripts/test_*.py` out of the `test_` namespace to remove the collection hazard, and add a CI workflow that runs the real `tests/` suite. Consider splitting `main.py` into routers by domain, and adopt Alembic before the schema grows further.

One process note: the CHANGELOG is unusually thorough and the phase discipline is real, but it documents intent more than outcome — it asserts "Zero data manufacturing" as an invariant while `discount_auditor.py` was manufacturing data throughout. Adding a test that asserts the *absence of fabricated user-facing values*, in the same spirit as the existing `test_no_synthetic_price_observation`, would make that invariant enforceable rather than aspirational.
