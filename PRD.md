# DealSense — Project Requirements Document (PRD)

## 1. Executive Summary & Problem Statement
- **The Problem**: Indian e-commerce shoppers face fragmented prices across Amazon.in and Flipkart, deceptive "discounts" that inflate MRP right before festival sales, and complex checkout pricing (bank card discounts, delivery fees, and coupons). Existing price trackers only track Amazon or lack true landed price calculations.
- **The Solution**: **DealSense** is an AI-powered, real-time price tracker and deal arbitrage engine for Indian shoppers. It resolves shortlinks, extracts live prices from both Amazon and Flipkart, calculates true landed costs with Indian bank card offers (HDFC, ICICI, SBI, Axis), tracks historical price curves, and issues instant "BUY NOW" vs "AVOID FAKE DEAL" verdicts.
- **Ideal Customer Profile (ICP)**: Value-conscious Indian consumers, tech enthusiasts, festival sale deal hunters (Great Indian Festival / Big Billion Days), and student/budget buyers.

## 2. Success Metrics & Key Performance Indicators
- **Scraper Reliability**: >98% success rate on URL resolution and price extraction without IP blocks.
- **Verdict Accuracy**: 100% mathematical consistency in 0–100 Deal Scores and True Landed Price calculations.
- **Test Integrity**: Maintain 100% test pass rate across all unit and integration test suites (currently 48/48 passing).
- **Distribution Velocity**: Reach 5,000 active Indian shoppers via Telegram/WhatsApp deal feeds and Chrome/Kiwi mobile extension.

## 3. Core Features & Capabilities

### Current Working Baseline (Phase 1 & 2 Completed)
1. **URL Normalizer & Shortlink Resolver** (`backend/services/resolver.py`): Resolves `amzn.to` and `fkrt.it` shortlinks, strips tracking parameters, extracts canonical ASINs and PIDs.
2. **Dual-Store Live Extractor** (`backend/services/extractor.py`): Extracts live price, MRP, seller, stock, delivery charges, and ratings for Amazon.in and Flipkart with challenge detection and user-agent rotation.
3. **Indian Bank Card Calculator** (`backend/services/bank_calculator.py`): Real-time calculation of instant 10% card discounts for HDFC, ICICI, SBI, Axis, Flipkart Axis, and Amazon Pay ICICI.
4. **Deal Scoring & Fake Deal Detector** (`backend/services/engine.py`): Generates 0–100 Deal Scores and strict verdicts (`BUY_NOW`, `FAIR_PRICE`, `WAIT_FOR_DROP`, `AVOID_FAKE_DEAL`).
5. **Product Identity Graph** (`backend/services/models.py`): SQLite schema linking `Product` (canonical) → `MerchantListing` (ASIN/PID) → `PriceObservation` (timestamped history).
6. **Dual-Curve Interactive Chart** (`frontend/`): SVG-based dual price comparison (Amazon vs Flipkart) with cubic bezier smoothing, zoom controls (1M/3M/6M/1Y/All), vertical hover crosshairs, and image self-healing fallbacks.

### Phase 3 Must-Have Targets (Active Horizon)
1. **Autonomous Live Deals Feed**: Migrate `deals_crawler.py` from static fallback presets to an automated background worker fetching 100+ rotating hot deals.
2. **Multi-Channel Alert Dispatcher**: Background worker checking user price-drop alert thresholds and dispatching real-time notifications via WhatsApp, Telegram, and Email.
3. **Sub-Affiliate Fallback Layer**: Implement Cuelinks / EarnKaro routing for unapproved product categories or missing direct Amazon/Flipkart affiliate approvals.

### Phase 4 & 5 Targets
1. **Chrome & Kiwi Mobile Browser Extension**: Direct in-browser deal comparison overlay on Amazon and Flipkart mobile/desktop PDPs.
2. **Programmatic SSR SEO**: Search-indexed public comparison pages (`/compare/{product-slug}`).

## 4. Out of Scope (Guardrails)
- Direct in-app payments or order placement (DealSense is an arbitrage & affiliate engine, not a retailer).
- Untrusted third-party marketplaces (focus exclusively on Amazon.in and Flipkart.com).
