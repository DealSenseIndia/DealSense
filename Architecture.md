# DealSense — System Architecture & Technical Specifications

## 1. High-Level Architecture Overview
```text
┌──────────────────────────────────────────────────────────────┐
│                    Client Surfaces                           │
│  - Web Frontend (Vanilla JS + Vite, Responsive Dark Mode)    │
│  - Chrome / Kiwi Browser Extension (Phase 4)                 │
│  - Telegram / WhatsApp Alert Subscribers (Phase 3)           │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / JSON API
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   FastAPI Backend Gateway                    │
│  - /api/resolve (Normalize URL, extract ASIN/PID)            │
│  - /api/extract (Live dual-store scrape)                     │
│  - /api/history/compare/{primary_id}/{rival_id} (Dual curve) │
│  - /api/alerts/subscribe (Threshold alert submissions)       │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│       Core Services          │ │   Autonomous Workers (ADK)   │
│ - resolver.py                │ │ - adk_deal_pipeline.py       │
│ - extractor.py               │ │   (Scraper -> Verifier ->    │
│ - bank_calculator.py         │ │    Dispatcher Graph)         │
│ - engine.py (Deal Score)     │ │ - alert_dispatcher_worker.py │
└──────────────┬───────────────┘ └─────────────┬────────────────┘
               │                               │
               └───────────────┬───────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│           SQLite Database (Product Identity Graph)           │
│  - Product (Canonical item metadata)                         │
│  - MerchantListing (Store-specific ASIN/PID & current state) │
│  - PriceObservation (Timestamped historical prices)          │
│  - PriceAlert (User threshold, channel, status)              │
└──────────────────────────────────────────────────────────────┘
```

## 2. Tech Stack & Tools
- **Backend Framework**: Python 3.14 + FastAPI + Pydantic v2 + Uvicorn.
- **Scraping & Parsing**: Requests / HTTPX, BeautifulSoup4, fake-useragent, challenge backoff heuristics.
- **Multi-Agent Runtime**: Google ADK (`adk.dev` / `google-adk`) for worker workflows.
- **Database**: SQLite with WAL mode enabled (`models.py`).
- **Frontend**: Vanilla JS (ES Modules) + Vite + Modern Dark Mode CSS + SVG Chart Renderer.
- **Testing Suite**: Pytest (48/48 baseline unit tests currently passing).

## 3. Directory Layout
```text
dealsense/
├── .agents/                    # AI pair programming configs & subagent specs
│   └── rules/
│       └── dealsense-rules.md
├── backend/
│   ├── api/                    # FastAPI route handlers
│   ├── services/               # Core business logic
│   │   ├── resolver.py         # URL cleaner & ID extractor
│   │   ├── extractor.py        # Amazon/Flipkart HTML scraper
│   │   ├── bank_calculator.py  # Instant card discount engine
│   │   ├── engine.py           # Deal score (0-100) & verdicts
│   │   ├── models.py           # SQLite relational schemas
│   │   └── deals_crawler.py    # Deals discovery module
│   ├── workers/                # Autonomous background workers
│   │   ├── adk_deal_pipeline.py # Google ADK multi-agent pipeline
│   │   └── alert_dispatcher.py # WhatsApp/Telegram/Email worker
│   └── tests/                  # 48 passing unit tests
├── frontend/                   # Vite + Vanilla JS web application
│   ├── src/                    # UI components & SVG charts
│   └── index.html
├── PRD.md
├── Architecture.md
├── Rules.md
├── Phases.md
├── Design.md
└── Memory.md
```

## 4. Product Identity Graph Schema
```text
[Product] (Canonical item: title, brand, category, canonical_image)
    │
    ├── 1:N ──> [MerchantListing] (store: Amazon|Flipkart, store_id: ASIN|PID, current_price)
                     │
                     └── 1:N ──> [PriceObservation] (observed_at, price, mrp, in_stock)
```
