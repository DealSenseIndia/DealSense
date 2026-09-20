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
- **Testing Suite**: Pytest (237/237 unit tests currently passing, 100% green).
- **Multi-Merchant Arbitrage**: Direct extractors and adapters for Amazon India, Flipkart, Croma, and Reliance Digital.
- **SEO & SSR Engine**: Jinja2 SSR comparison templates (`frontend/templates/seo_compare.html`), Schema.org `AggregateOffer` JSON-LD microdata, dynamic XML sitemaps (`/sitemap.xml`, `/sitemap-main.xml`, `/sitemap-products.xml`) with 1-hour in-memory caching.
- **Containerization**: Multi-stage Docker build (`Dockerfile`), `docker-compose.yml`, persistent WAL database volume.

## 3. Directory Layout
```text
dealsense/
├── .agents/                    # AI pair programming configs & subagent specs
│   ├── agents/                 # 8 specialized subagent definitions
│   └── plugins/dealsense/      # DealSense native plugin manifest & agents
├── backend/
│   ├── services/               # Core business logic
│   │   ├── resolver.py         # URL cleaner & ID extractor
│   │   ├── extractor.py        # Amazon/Flipkart HTML scraper
│   │   ├── bank_calculator.py  # Instant card discount engine
│   │   ├── engine.py           # Deal score (0-100) & verdicts
│   │   ├── affiliate_gateway.py # 3-Tier monetization routing
│   │   ├── alert_worker.py     # Background alert daemon
│   │   ├── deals_crawler.py    # Deals discovery module
│   │   └── seo_service.py      # SSR SEO, JSON-LD, and XML sitemaps
│   ├── workers/                # Autonomous background workers
│   │   └── adk_deal_pipeline.py # Google ADK multi-agent pipeline
│   └── main.py                 # FastAPI application lifespan, API, & SSR routes
├── extension/                  # Manifest V3 Chrome & Kiwi Mobile Extension
│   ├── manifest.json           # MV3 specification & permissions
│   ├── background.js           # Service worker (caching & API relay)
│   ├── content.js              # In-page Shadow DOM detector & injector
│   ├── styles.css              # Scoped Shadow-DOM CSS styling
│   ├── popup/                  # Action popup (analyzer, watchlist, settings)
│   └── icons/                  # 16px, 48px, 128px branded icons
├── frontend/                   # Vite + Vanilla JS web application
│   └── templates/              # Server-Side Rendered (SSR) Jinja2 SEO templates
│       └── seo_compare.html    # Programmatic compare page with Schema.org JSON-LD
├── tests/                      # 237 passing unit & contract tests
├── Dockerfile                  # Production multi-stage python:3.12-slim image
├── docker-compose.yml          # Production container orchestration
├── .dockerignore               # Container build exclusions
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
