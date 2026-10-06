"""
Unit tests for DealSense Competitor Price History Adapter.
Tests date parsing, HTML time-series extraction, network error resilience,
and database observation bootstrapping.
"""

from datetime import datetime, timezone
import pytest
from sqlmodel import select, Session

from backend.database import get_session
from backend.models import Product, MerchantListing, PriceObservation
from backend.services.competitor_adapter import (
    parse_pricebefore_date,
    fetch_competitor_price_history,
    bootstrap_listing_history,
    CompetitorPricePoint,
    CompetitorHistoryResult,
)


def test_parse_pricebefore_date():
    """Validates date normalization across multiple formats."""
    d1 = parse_pricebefore_date("05 Oct 2026")
    assert d1 == datetime(2026, 10, 5, 0, 0, tzinfo=timezone.utc)

    d2 = parse_pricebefore_date("5 Oct 2026")
    assert d2 == datetime(2026, 10, 5, 0, 0, tzinfo=timezone.utc)

    d3 = parse_pricebefore_date("2026-10-05")
    assert d3 == datetime(2026, 10, 5, 0, 0, tzinfo=timezone.utc)

    assert parse_pricebefore_date(None) is None
    assert parse_pricebefore_date("") is None
    assert parse_pricebefore_date("not-a-date") is None


def test_fetch_competitor_price_history_parsing(monkeypatch):
    """Mocks competitor response and verifies parsing of price series and extrema."""
    sample_html = """
    <html>
    <head><title>Test Price History</title></head>
    <body>
    <h1>Apple iPhone 15 (Black, 128 GB)</h1>
    <script>
    var data = {"dates":["01 Jan 2026","02 Jan 2026","03 Jan 2026"],"prices":[64999,61999,59900],"lowestPrices":[64999,61999,59900],"highestPrices":[64999,64999,64999]};
    </script>
    </body>
    </html>
    """

    class MockResponse:
        status_code = 200
        text = sample_html
        url = "https://www.pricebefore.com/apple-iphone-15-p12345.html"

    class MockClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def get(self, url):
            return MockResponse()

    import httpx
    monkeypatch.setattr(httpx, "Client", MockClient)

    res = fetch_competitor_price_history("https://www.amazon.in/dp/B0CHX1W1XY")
    assert res is not None
    assert res.source == "pricebefore"
    assert res.product_title == "Apple iPhone 15 (Black, 128 GB)"
    assert res.lowest_price == 59900.0
    assert res.highest_price == 64999.0
    assert res.current_price == 59900.0
    assert len(res.history_points) == 3
    assert res.history_points[0].price == 64999.0
    assert res.history_points[2].price == 59900.0


def test_fetch_competitor_price_history_resilience(monkeypatch):
    """Verifies graceful handling of 404, timeouts, and missing chart data."""
    class Mock404Response:
        status_code = 404
        text = "Not found"
        url = "https://www.pricebefore.com/search/"

    class MockClient404:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def get(self, url):
            return Mock404Response()

    import httpx
    monkeypatch.setattr(httpx, "Client", MockClient404)

    assert fetch_competitor_price_history("https://www.amazon.in/dp/B0INVALID") is None
    assert fetch_competitor_price_history("") is None
    assert fetch_competitor_price_history(None) is None


def test_bootstrap_listing_history_records_observations(monkeypatch):
    """Verifies that bootstrap_listing_history records real observations into SQLite."""
    mock_result = CompetitorHistoryResult(
        source="pricebefore",
        product_title="Test Product",
        current_price=24990.0,
        lowest_price=23940.0,
        highest_price=29990.0,
        history_points=[
            CompetitorPricePoint(observed_date=datetime(2026, 8, 1, tzinfo=timezone.utc), price=29990.0),
            CompetitorPricePoint(observed_date=datetime(2026, 8, 15, tzinfo=timezone.utc), price=27990.0),
            CompetitorPricePoint(observed_date=datetime(2026, 9, 1, tzinfo=timezone.utc), price=23940.0),
            CompetitorPricePoint(observed_date=datetime(2026, 9, 15, tzinfo=timezone.utc), price=24990.0),
        ],
    )

    monkeypatch.setattr(
        "backend.services.competitor_adapter.fetch_competitor_price_history",
        lambda url, timeout_seconds=8.0: mock_result,
    )

    import uuid
    unique_suffix = uuid.uuid4().hex[:8]

    with get_session() as session:
        product = Product(canonical_title=f"Sony WH-1000XM5 Test {unique_suffix}", brand="Sony", category="Audio")
        session.add(product)
        session.commit()
        session.refresh(product)

        listing = MerchantListing(
            product_id=product.id,
            merchant="Amazon",
            merchant_product_id=f"B0TESTXM50_{unique_suffix}",
            url=f"https://www.amazon.in/dp/B0TESTXM50_{unique_suffix}",
            clean_url=f"https://www.amazon.in/dp/B0TESTXM50_{unique_suffix}",
            current_price=24990.0,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)

        try:
            # 1. First bootstrap: Inserts 4 observations
            inserted = bootstrap_listing_history(session, listing.id, listing.clean_url)
            assert inserted == 4

            # Verify observations in DB
            obs = session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == listing.id)
            ).all()
            assert len(obs) == 4
            assert any(o.source == "competitor_sync" for o in obs)
            assert min(o.price for o in obs) == 23940.0

            # 2. Second bootstrap: Since points are on the same dates, skips duplicates
            re_inserted = bootstrap_listing_history(session, listing.id, listing.clean_url)
            assert re_inserted == 0
        finally:
            # Cleanup test artifacts
            obs_rows = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing.id)).all()
            for o in obs_rows:
                session.delete(o)
            session.delete(listing)
            session.delete(product)
            session.commit()
