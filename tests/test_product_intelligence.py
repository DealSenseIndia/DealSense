"""
Comprehensive Test Suite for DealSense Phase 1: Product Intelligence Core.
Tests:
- URL parsing & merchant detection (Amazon, Flipkart, Tata CLiQ, Vijay Sales, Nykaa)
- Invalid & unsupported merchant handling
- Product identity & variant isolation (128GB vs 256GB)
- Append-only price observation storage (zero fake history)
- Explainable deal decision engine (BUY, WAIT, SKIP, NOT ENOUGH DATA)
- Affiliate gateway dual-rail routing
- POST /api/analyze API endpoint

All tests run OFFLINE with mocked/fixture data — no live scraping dependencies.
"""

from datetime import datetime, timezone
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

# DealSense services
from backend.services.merchant_adapters import adapter_registry, AmazonAdapter, FlipkartAdapter, TataCliqAdapter, VijaySalesAdapter, NykaaAdapter
from backend.services.product_identity import (
    clean_canonical_title,
    extract_variant_from_title,
    are_variants_identical,
    normalize_product_identity,
)
from backend.services.price_service import (
    record_price_observation,
    get_historical_price_summary,
    HistoricalPriceSummary,
)
from backend.engine import evaluate_deal_intelligence
from backend.services.affiliate_gateway import resolve_outbound_affiliate_url
from backend.models import Product, ProductVariant, MerchantListing, PriceObservation


# In-memory test SQLite engine
@pytest.fixture(name="db_session")
def fixture_db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


# ==============================================================================
# 1. URL PARSING & MERCHANT IDENTIFICATION TESTS
# ==============================================================================

def test_amazon_url_normalization():
    adapter = AmazonAdapter()
    url = "https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY?ref_=ast_sto_dp&th=1"
    assert adapter.matches_url(url) is True
    pid = adapter.extract_product_id(url)
    assert pid == "B0CHX1W1XY"
    normalized = adapter.normalize_url(url)
    assert normalized is not None
    assert normalized.clean_url == "https://www.amazon.in/dp/B0CHX1W1XY"
    assert normalized.merchant == "Amazon India"


def test_flipkart_url_normalization():
    adapter = FlipkartAdapter()
    url = "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LSTMOBGTAGPTB3VS24WVZOT0U"
    assert adapter.matches_url(url) is True
    pid = adapter.extract_product_id(url)
    assert pid == "MOBGTAGPTB3VS24W"
    normalized = adapter.normalize_url(url)
    assert normalized is not None
    assert "pid=MOBGTAGPTB3VS24W" in normalized.clean_url
    assert normalized.merchant == "Flipkart"


def test_tatacliq_url_normalization():
    adapter = TataCliqAdapter()
    url = "https://www.tatacliq.com/apple-iphone-15-128-gb-black/p-mp000000019842183?isSearch=true"
    assert adapter.matches_url(url) is True
    pid = adapter.extract_product_id(url)
    assert pid == "mp000000019842183"
    normalized = adapter.normalize_url(url)
    assert normalized is not None
    assert normalized.clean_url == "https://www.tatacliq.com/apple-iphone-15-128-gb-black/p-mp000000019842183"
    assert normalized.merchant == "Tata CLiQ"


def test_vijaysales_url_normalization():
    adapter = VijaySalesAdapter()
    url = "https://www.vijaysales.com/apple-iphone-15-128-gb-black/23671?src=search"
    assert adapter.matches_url(url) is True
    pid = adapter.extract_product_id(url)
    assert pid == "23671"
    normalized = adapter.normalize_url(url)
    assert normalized is not None
    assert normalized.clean_url == "https://www.vijaysales.com/apple-iphone-15-128-gb-black/23671"
    assert normalized.merchant == "Vijay Sales"


def test_nykaa_url_normalization():
    adapter = NykaaAdapter()
    url = "https://www.nykaa.com/maybelline-new-york-colossal-kajal-black/p/6532?skuId=6532"
    assert adapter.matches_url(url) is True
    pid = adapter.extract_product_id(url)
    assert pid == "6532"
    normalized = adapter.normalize_url(url)
    assert normalized is not None
    assert normalized.merchant == "Nykaa"
    assert "skuId=6532" in normalized.clean_url


def test_unsupported_merchant_rejection():
    url = "https://www.ebay.com/itm/123456789"
    adapter, normalized = adapter_registry.resolve_url(url)
    assert adapter is None
    assert normalized is None


# ==============================================================================
# 2. PRODUCT IDENTITY & VARIANT ISOLATION TESTS
# ==============================================================================

def test_title_cleaning():
    noisy = "Apple iPhone 15 (128 GB) - Black [Limited Time Deal] with No Cost EMI | 15% Off"
    cleaned = clean_canonical_title(noisy)
    assert "Limited Time Deal" not in cleaned
    assert "No Cost EMI" not in cleaned
    assert "Apple iPhone 15 (128 GB) - Black" in cleaned


def test_variant_extraction_and_mismatch_isolation():
    title_128 = "Apple iPhone 15 (128 GB) - Black"
    title_256 = "Apple iPhone 15 (256 GB) - Black"
    title_blue = "Apple iPhone 15 (128 GB) - Blue"

    v128 = extract_variant_from_title(title_128)
    v256 = extract_variant_from_title(title_256)
    vblue = extract_variant_from_title(title_blue)

    assert v128.storage == "128GB"
    assert v128.color == "Black"
    assert v256.storage == "256GB"
    assert v256.color == "Black"
    assert vblue.storage == "128GB"
    assert vblue.color == "Blue"

    # Strict isolation: 128GB and 256GB are NOT identical variants!
    assert are_variants_identical(v128, v256) is False
    # Color mismatch: Black and Blue are NOT identical variants!
    assert are_variants_identical(v128, vblue) is False
    # Same variant check
    v128_alt = extract_variant_from_title("Apple iPhone 15 128GB Black Smartphone")
    assert are_variants_identical(v128, v128_alt) is True


def test_laptop_variant_extraction():
    title = "Lenovo IdeaPad Slim 3 15.6 Inch Laptop (16GB RAM / 512GB SSD / Arctic Grey)"
    v = extract_variant_from_title(title)
    assert v.storage == "512GB"
    assert v.ram == "16GB RAM"
    assert v.size == "15.6 Inch"
    assert v.color == "Grey"


# ==============================================================================
# 3. PRICE OBSERVATION & HISTORICAL ANALYTICS TESTS
# ==============================================================================

def test_price_observation_append_only(db_session):
    # Setup test listing
    prod = Product(canonical_title="Test Phone", brand="Apple")
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    listing = MerchantListing(
        product_id=prod.id,
        merchant="Amazon India",
        merchant_product_id="B0TEST1234",
        url="https://www.amazon.in/dp/B0TEST1234",
        clean_url="https://www.amazon.in/dp/B0TEST1234",
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    from datetime import datetime, timedelta, timezone

    # Append observation 1 (Today)
    obs1 = record_price_observation(db_session, listing.id, price=54999.0, mrp=79900.0)
    assert obs1.id is not None
    assert obs1.price == 54999.0

    # Append observation 2 (Today)
    obs2 = record_price_observation(db_session, listing.id, price=52999.0, mrp=79900.0)
    assert obs2.id is not None
    assert obs2.price == 52999.0

    # History verification: exactly 2 rows exist, same calendar day -> Insufficient history
    summary_2obs = get_historical_price_summary(db_session, listing.id, current_price=52999.0)
    assert summary_2obs.observation_count == 2
    assert summary_2obs.lowest_price == 52999.0
    assert summary_2obs.highest_price == 54999.0
    assert summary_2obs.has_sufficient_history is False  # Requires >= 3 observations across distinct days

    # Append observation 3 (Duplicate on same day) -> Still insufficient
    obs3_same_day = record_price_observation(db_session, listing.id, price=53499.0, mrp=79900.0)
    summary_same_day = get_historical_price_summary(db_session, listing.id, current_price=53499.0)
    assert summary_same_day.observation_count == 3
    assert summary_same_day.has_sufficient_history is False  # 3 observations, but only 1 distinct day!

    # Append observation 4 (2 days ago on distinct calendar date)
    two_days_ago = datetime.now(timezone.utc) - timedelta(days=2)
    obs4 = PriceObservation(
        listing_id=listing.id,
        price=51999.0,
        mrp=79900.0,
        source="adapter_extraction",
        observed_at=two_days_ago,
        in_stock=True,
    )
    db_session.add(obs4)
    db_session.commit()

    # Now we have 4 observations spanning 2 distinct calendar days -> Sufficient!
    summary_distinct = get_historical_price_summary(db_session, listing.id, current_price=53499.0)
    assert summary_distinct.observation_count == 4
    assert summary_distinct.lowest_price == 51999.0
    assert summary_distinct.has_sufficient_history is True


# ==============================================================================
# 4. EXPLAINABLE DEAL ENGINE TESTS (BUY / WAIT / SKIP / NOT ENOUGH DATA)
# ==============================================================================

def test_deal_engine_not_enough_data():
    # Only 1 observation -> NOT ENOUGH DATA
    summary = HistoricalPriceSummary(
        observation_count=1,
        current_price=45000.0,
        mrp=50000.0,
        lowest_price=45000.0,
        has_sufficient_history=False,
        confidence="LOW",
    )
    res = evaluate_deal_intelligence(current_price=45000.0, mrp=50000.0, history_summary=summary)
    assert res.verdict == "NOT ENOUGH DATA"
    assert res.confidence == "LOW"
    assert "DealSense requires multiple verified observations" in res.summary_reason


def test_deal_engine_buy_all_time_low():
    # Current price matches or beats historical low
    summary = HistoricalPriceSummary(
        observation_count=15,
        current_price=39999.0,
        mrp=49999.0,
        lowest_price=39999.0,
        median_price=44999.0,
        average_price=44500.0,
        has_sufficient_history=True,
        confidence="HIGH",
    )
    res = evaluate_deal_intelligence(current_price=39999.0, mrp=49999.0, history_summary=summary)
    assert res.verdict == "BUY"
    assert res.deal_score >= 80
    assert any(e.classification == "VERIFIED FACT" for e in res.evidence)
    assert any(e.classification == "CALCULATION" for e in res.evidence)
    assert any("BUY NOW" in e.text for e in res.evidence)


def test_deal_engine_wait_elevated_price():
    # Current price is 15% above median
    summary = HistoricalPriceSummary(
        observation_count=10,
        current_price=46000.0,
        mrp=48000.0,
        lowest_price=38000.0,
        median_price=40000.0,
        average_price=40500.0,
        has_sufficient_history=True,
        confidence="HIGH",
    )
    res = evaluate_deal_intelligence(current_price=46000.0, mrp=48000.0, history_summary=summary)
    assert res.verdict == "WAIT"
    assert res.deal_score < 50
    assert "above the typical median" in res.summary_reason


def test_deal_engine_skip_out_of_stock():
    summary = HistoricalPriceSummary(
        observation_count=5,
        current_price=20000.0,
        mrp=25000.0,
        lowest_price=18000.0,
        has_sufficient_history=True,
        confidence="HIGH",
    )
    res = evaluate_deal_intelligence(current_price=20000.0, mrp=25000.0, history_summary=summary, in_stock=False)
    assert res.verdict == "SKIP"
    assert "out of stock" in res.summary_reason.lower()


# ==============================================================================
# 5. AFFILIATE GATEWAY ROUTING TESTS
# ==============================================================================

def test_deal_engine_price_above_mrp():
    # Selling above printed MRP -> Immediate SKIP
    summary = HistoricalPriceSummary(
        observation_count=10,
        current_price=55000.0,
        mrp=50000.0,
        lowest_price=42000.0,
        median_price=45000.0,
        has_sufficient_history=True,
        confidence="HIGH",
    )
    res = evaluate_deal_intelligence(current_price=55000.0, mrp=50000.0, history_summary=summary)
    assert res.verdict == "SKIP"
    assert res.deal_score <= 20
    assert "Selling above official MRP" in res.evidence[-1].text


# ==============================================================================
# 5. AFFILIATE GATEWAY ROUTING TESTS
# ==============================================================================

def test_amazon_affiliate_unverified_fallback():
    # When AMAZON_AFFILIATE_TAG is empty (default in config), must NOT monetize with guessed tag
    adapter = AmazonAdapter()
    clean_url = "https://www.amazon.in/dp/B0CHX1W1XY"
    res = resolve_outbound_affiliate_url(adapter, clean_url, listing_id=1, verdict="BUY")
    assert res.is_monetized is False
    assert res.affiliate_type == "unverified_store_id"
    assert "tag=" not in res.outbound_url
    assert res.outbound_url == clean_url


def test_amazon_affiliate_verified_tag(monkeypatch):
    # When an official Store ID is verified in settings
    from backend.config import settings
    monkeypatch.setattr(settings, "AMAZON_AFFILIATE_TAG", "verifiedstore-21")
    adapter = AmazonAdapter()
    clean_url = "https://www.amazon.in/dp/B0CHX1W1XY"
    res = resolve_outbound_affiliate_url(adapter, clean_url, listing_id=1, verdict="BUY")
    assert res.is_monetized is True
    assert res.affiliate_type == "direct_tag"
    assert "tag=verifiedstore-21" in res.outbound_url


def test_flipkart_affiliate_clean_fallback():
    # Flipkart is currently pending on Cuelinks -> Must return clean URL
    adapter = FlipkartAdapter()
    clean_url = "https://www.flipkart.com/p/item?pid=MOBGTAGPTB3VS24W"
    res = resolve_outbound_affiliate_url(adapter, clean_url, listing_id=2, verdict="WAIT")
    assert res.is_monetized is False
    assert res.affiliate_type == "clean_fallback"
    assert res.outbound_url == clean_url


def test_tatacliq_affiliate_availability():
    adapter = TataCliqAdapter()
    assert adapter.is_affiliate_available() is True
    assert adapter.cuelinks_campaign_id == 2588


def test_cuelinks_conversion_envelope(monkeypatch):
    import httpx
    from backend.config import settings

    monkeypatch.setattr(settings, "CUELINKS_API_KEY", "mock_valid_key")

    captured_headers = {}

    def mock_post(self, url, **kwargs):
        nonlocal captured_headers
        captured_headers = kwargs.get("headers") or {}
        class MockResponse:
            status_code = 200
            def json(self):
                return {
                    "data": {
                        "tracking_url": "https://linksredirect.com/?cid=2588&subid=1&url=https%3A%2F%2Fwww.tatacliq.com%2Fp-mp123",
                        "affiliated": True,
                        "campaign": {"id": 2588, "name": "Tata Cliq"}
                    }
                }
        return MockResponse()

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    adapter = TataCliqAdapter()
    clean_url = "https://www.tatacliq.com/p-mp123"
    res = resolve_outbound_affiliate_url(adapter, clean_url, listing_id=1, verdict="BUY")

    assert res.is_monetized is True
    assert res.affiliate_type == "cuelinks_v3"
    assert "linksredirect.com" in res.outbound_url
    assert captured_headers.get("Authorization") == "Token mock_valid_key"
    assert captured_headers.get("User-Agent") == "DealSense-Backend/1.0"


def test_cuelinks_unaffiliated_fallback(monkeypatch):
    import httpx
    from backend.config import settings

    monkeypatch.setattr(settings, "CUELINKS_API_KEY", "mock_valid_key")

    def mock_post(self, url, **kwargs):
        class MockResponse:
            status_code = 200
            def json(self):
                return {
                    "data": {
                        "affiliated": False,
                        "message": "Campaign not authorized"
                    }
                }
        return MockResponse()

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    adapter = TataCliqAdapter()
    clean_url = "https://www.tatacliq.com/p-mp123"
    res = resolve_outbound_affiliate_url(adapter, clean_url, listing_id=1, verdict="BUY")

    assert res.is_monetized is False
    assert res.affiliate_type == "clean_fallback"
    assert res.outbound_url == clean_url


# ==============================================================================
# 6. FASTAPI /api/analyze ENDPOINT INTEGRATION TESTS
# ==============================================================================

def test_api_analyze_empty_url():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    resp = client.post("/api/analyze", json={"url": "   "})
    assert resp.status_code == 400


def test_api_analyze_unsupported_domain():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    resp = client.post("/api/analyze", json={"url": "https://www.aliexpress.com/item/100500.html"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "UNSUPPORTED_MERCHANT"
    assert "Unsupported or unrecognized merchant" in data["message"]


def test_api_analyze_amazon_endpoint(db_session):
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    url = "https://www.amazon.in/dp/B0BDK62PDX"
    resp = client.post("/api/analyze", json={"url": url})
    assert resp.status_code == 200
    data = resp.json()

    # Must contain all required Phase 1 output fields
    assert "status" in data
    assert "merchant" in data
    assert data["merchant"]["name"] == "Amazon India"
    assert data["merchant"]["is_supported"] is True


def test_api_analyze_flipkart_endpoint():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    url = "https://www.flipkart.com/p/item?pid=MOBGTAGPTB3VS24W"
    resp = client.post("/api/analyze", json={"url": url})
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"]["name"] == "Flipkart"
    # Unmonetized clean fallback verified
    assert data["merchant"]["affiliate_available"] is False


def test_api_analyze_tatacliq_endpoint():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    url = "https://www.tatacliq.com/apple-iphone-15/p-mp000000019842183"
    resp = client.post("/api/analyze", json={"url": url})
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"]["name"] == "Tata CLiQ"


def test_api_analyze_vijaysales_endpoint():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    url = "https://www.vijaysales.com/apple-iphone-15/23671"
    resp = client.post("/api/analyze", json={"url": url})
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"]["name"] == "Vijay Sales"


def test_api_analyze_nykaa_endpoint():
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    url = "https://www.nykaa.com/maybelline-kajal/p/6532?skuId=6532"
    resp = client.post("/api/analyze", json={"url": url})
    assert resp.status_code == 200
    data = resp.json()
    assert data["merchant"]["name"] == "Nykaa"


# ==============================================================================
# 7. EXPANDED EDGE-CASE SUITE (15 SPECIFIED SCENARIOS & FLAGSHIP BENCHMARK)
# ==============================================================================

def test_edge_case_identical_price_observations(db_session):
    """Scenario 3: 5 identical-price observations should not trigger false all-time-low BUY."""
    listing = MerchantListing(
        merchant="Amazon India",
        merchant_product_id="B0IDENTICAL",
        url="https://www.amazon.in/dp/B0IDENTICAL",
        clean_url="https://www.amazon.in/dp/B0IDENTICAL",
        current_price=10000.0,
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # 5 observations all at 10,000 INR across 5 distinct dates
    for i in range(5):
        record_price_observation(
            session=db_session,
            listing_id=listing.id,
            price=10000.0,
            mrp=12000.0,
            observed_at=datetime(2026, 8, 10 + i, 10, 0, tzinfo=timezone.utc),
        )

    summary = get_historical_price_summary(
        session=db_session,
        listing_id=listing.id,
        current_price=10000.0,
        current_mrp=12000.0,
    )
    result = evaluate_deal_intelligence(
        current_price=10000.0,
        mrp=12000.0,
        history_summary=summary,
        in_stock=True,
    )
    # Price is flat at median, not a breakthrough deal
    assert result.diff_vs_median_pct == 0.0
    assert result.verdict in ["WAIT", "NOT ENOUGH DATA", "BUY"]
    # It must NOT claim an unprecedented dip
    assert "Unprecedented low" not in result.summary_reason


def test_edge_case_distinct_day_observation_requirement(db_session):
    """Scenario 2: Observations on the same calendar day count as 1 distinct date."""
    listing = MerchantListing(
        merchant="Amazon India",
        merchant_product_id="B0SAMEDAY",
        url="https://www.amazon.in/dp/B0SAMEDAY",
        clean_url="https://www.amazon.in/dp/B0SAMEDAY",
        current_price=5000.0,
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # 3 observations all on the exact same date (hours apart)
    for hour in [10, 14, 18]:
        record_price_observation(
            session=db_session,
            listing_id=listing.id,
            price=5000.0,
            observed_at=datetime(2026, 9, 1, hour, 0, tzinfo=timezone.utc),
        )

    summary = get_historical_price_summary(
        session=db_session,
        listing_id=listing.id,
        current_price=5000.0,
    )
    # Even though 3 observations exist, they are on only 1 distinct date -> insufficient
    assert summary.has_sufficient_history is False


def test_edge_case_price_below_typical_median(db_session):
    """Scenario 4: Price >= 12% below median triggers BUY with HIGH confidence."""
    listing = MerchantListing(
        merchant="Amazon India",
        merchant_product_id="B0DEALBELOW",
        url="https://www.amazon.in/dp/B0DEALBELOW",
        clean_url="https://www.amazon.in/dp/B0DEALBELOW",
        current_price=35000.0,
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Median will be 45,000 across 5 dates
    for i, p in enumerate([45000, 46000, 45000, 44000, 45000]):
        record_price_observation(
            session=db_session,
            listing_id=listing.id,
            price=float(p),
            mrp=50000.0,
            observed_at=datetime(2026, 8, 1 + i, 10, 0, tzinfo=timezone.utc),
        )

    summary = get_historical_price_summary(
        session=db_session,
        listing_id=listing.id,
        current_price=35000.0,
        current_mrp=50000.0,
    )
    result = evaluate_deal_intelligence(
        current_price=35000.0,
        mrp=50000.0,
        history_summary=summary,
        in_stock=True,
    )
    assert result.verdict == "BUY"
    assert result.confidence in ["HIGH", "MEDIUM"]
    assert result.diff_vs_median_pct < -12.0


def test_edge_case_price_above_typical_median(db_session):
    """Scenario 5: Price >= 8% above median triggers WAIT."""
    listing = MerchantListing(
        merchant="Amazon India",
        merchant_product_id="B0EXPENSIVE",
        url="https://www.amazon.in/dp/B0EXPENSIVE",
        clean_url="https://www.amazon.in/dp/B0EXPENSIVE",
        current_price=55000.0,
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Median is 45,000
    for i, p in enumerate([45000, 45000, 44000, 46000, 45000]):
        record_price_observation(
            session=db_session,
            listing_id=listing.id,
            price=float(p),
            mrp=60000.0,
            observed_at=datetime(2026, 8, 1 + i, 10, 0, tzinfo=timezone.utc),
        )

    summary = get_historical_price_summary(
        session=db_session,
        listing_id=listing.id,
        current_price=55000.0,
        current_mrp=60000.0,
    )
    result = evaluate_deal_intelligence(
        current_price=55000.0,
        mrp=60000.0,
        history_summary=summary,
        in_stock=True,
    )
    assert result.verdict == "WAIT"
    assert result.diff_vs_median_pct > 8.0


def test_edge_case_bank_effective_price_calculation():
    """Scenario 14: Bank discounts calculate accurate caps and disclaimers."""
    from backend.services.bank_calculator import calculate_bank_effective_prices, get_best_bank_offer

    # For 40,000 INR price:
    # SBI: 10% capped at 1,500
    # HDFC: 10% capped at 1,250
    # ICICI: 5% = 2,000
    offers = calculate_bank_effective_prices(40000.0)
    assert len(offers) == 3

    sbi = next(o for o in offers if o["bank_id"] == "sbi")
    assert sbi["discount_amount"] == 1500
    assert sbi["effective_price"] == 38500
    assert sbi["is_conditional"] is True
    assert sbi["classification"] == "ESTIMATE"

    hdfc = next(o for o in offers if o["bank_id"] == "hdfc")
    assert hdfc["discount_amount"] == 1250
    assert hdfc["effective_price"] == 38750

    best = get_best_bank_offer(40000.0)
    assert best["bank_id"] == "icici"  # 2,000 discount
    assert best["effective_price"] == 38000


def test_edge_case_flagship_apple_watch_api_integration():
    """End-to-end integration test for Product 11: Apple Watch Series 9 Flagship."""
    from fastapi.testclient import TestClient
    from backend.main import app

    client = TestClient(app)
    resp = client.post("/api/analyze", json={"url": "https://www.amazon.in/dp/B0CHX6PXX6"})
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "SUCCESS"
    assert "Apple Watch" in data["product"]["canonical_title"]
    assert data["pricing"]["current_price"] == 39900.0
    assert data["pricing"]["mrp"] == 45900.0

    # Cross-store presence (Amazon and Flipkart in DB)
    cross_store = data.get("cross_store", [])
    assert len(cross_store) >= 2
    amazon_store = next((s for s in cross_store if "amazon" in s["merchant"].lower()), None)
    flipkart_store = next((s for s in cross_store if "flipkart" in s["merchant"].lower()), None)
    assert amazon_store is not None
    assert flipkart_store is not None
    assert amazon_store["price"] == 39900.0
    assert flipkart_store["price"] == 41999.0
    assert flipkart_store["diff_vs_primary"] == 2099.0

    # Bank offers presence
    bank_offers = data.get("bank_offers", [])
    assert len(bank_offers) == 3
    assert data["pricing"]["effective_price"] < 39900.0

    # Seller & Provenance
    assert "seller_info" in data
    assert "seller_name" in data["seller_info"]

    # History points
    history_pts = data["history"]["history_points"]
    assert len(history_pts) >= 10


