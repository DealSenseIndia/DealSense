"""
Unit & Integration Tests for DealSense Autonomous Price Observation Worker.
Verifies rate limits, inter-request spacing, failure backoff, priority tiers,
FastAPI lifespan lifecycle, and administrative endpoints.
"""

from datetime import datetime, timezone, timedelta
import time
import uuid
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.database import get_session, init_db
from backend.main import app
from backend.models import Product, ProductVariant, MerchantListing, PriceAlert
from backend.services.observation_worker import (
    ObservationWorker,
    compute_failure_backoff_seconds,
    determine_listing_priority,
    TIER_INTERVALS,
)
from backend.services.observation_service import ObservationResult, ObservationStatus


@pytest.fixture(autouse=True)
def ensure_db():
    init_db()


def _create_worker_test_listing(merchant: str = "Amazon", price: float = 19999.0):
    unique_id = f"WRK_{uuid.uuid4().hex[:8].upper()}"
    with get_session() as session:
        prod = Product(canonical_title=f"Worker Test Product {unique_id}", brand="BrandX")
        session.add(prod)
        session.commit()
        session.refresh(prod)

        variant = ProductVariant(product_id=prod.id, variant_name="Standard")
        session.add(variant)
        session.commit()
        session.refresh(variant)

        listing = MerchantListing(
            product_id=prod.id,
            variant_id=variant.id,
            merchant=merchant,
            merchant_product_id=unique_id,
            url=f"https://www.amazon.in/dp/{unique_id}",
            clean_url=f"https://www.amazon.in/dp/{unique_id}",
            current_price=price,
            active=True,
            availability="in_stock",
            failure_count=0,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)

        return listing.id, prod.id


def test_failure_backoff_is_correct():
    """10. Failure backoff follows strict deterministic escalation."""
    assert compute_failure_backoff_seconds(1) == 5 * 60       # 5 minutes
    assert compute_failure_backoff_seconds(2) == 30 * 60      # 30 minutes
    assert compute_failure_backoff_seconds(3) == 2 * 3600     # 2 hours
    assert compute_failure_backoff_seconds(4) == 8 * 3600     # 8 hours
    assert compute_failure_backoff_seconds(5) == 24 * 3600    # 24 hours
    assert compute_failure_backoff_seconds(10) == 24 * 3600   # 24 hours max


def test_priority_tier_determination():
    """Priority tiers assign HOT when alerts exist and COLD when out of stock."""
    listing_id, prod_id = _create_worker_test_listing()

    # Default should be NORMAL
    assert determine_listing_priority(listing_id, prod_id) == "NORMAL"

    # Add active PriceAlert -> should become HOT
    with get_session() as session:
        alert = PriceAlert(
            product_id=prod_id,
            product_title="Worker Test",
            target_price=15000.0,
            current_price=19999.0,
            channel="whatsapp",
            contact="+919876543210",
            is_active=True,
        )
        session.add(alert)
        session.commit()

    assert determine_listing_priority(listing_id, prod_id) == "HOT"

    # Out of stock listing -> should become COLD
    with get_session() as session:
        listing = session.get(MerchantListing, listing_id)
        listing.availability = "out_of_stock"
        session.add(listing)
        session.commit()

    assert determine_listing_priority(listing_id, None) == "COLD"


def test_successful_extraction_resets_failure_count():
    """11. A successful observation resets listing.failure_count to 0."""
    listing_id, prod_id = _create_worker_test_listing()

    with get_session() as session:
        listing = session.get(MerchantListing, listing_id)
        listing.failure_count = 4
        listing.last_error = "Previous 503 error"
        session.add(listing)
        session.commit()

    worker = ObservationWorker()
    mock_result = ObservationResult(
        listing_id=listing_id,
        merchant="Amazon",
        merchant_product_id="TEST",
        status=ObservationStatus.SUCCESS,
        price=18999.0,
        price_changed=True,
    )

    with patch("backend.services.observation_worker.observe_listing", return_value=mock_result):
        worker._process_listing(listing_id, "amazon", prod_id)

    with get_session() as session:
        updated = session.get(MerchantListing, listing_id)
        assert updated.failure_count == 0
        assert updated.last_error is None
        assert updated.next_check_at is not None


def test_worker_respects_merchant_spacing():
    """12 & 13. Worker enforces minimum spacing delay between sequential requests."""
    worker = ObservationWorker()

    # Immediate first check is allowed
    assert worker._can_scrape_merchant("amazon") is True
    assert worker._can_scrape_merchant("flipkart") is True

    # Record request for Amazon
    worker._record_merchant_request_time("amazon")

    # Second check immediately after should be blocked by spacing
    assert worker._can_scrape_merchant("amazon") is False
    # But Flipkart should still be eligible (independent queue)
    assert worker._can_scrape_merchant("flipkart") is True


def test_worker_starts_and_shuts_down_cleanly():
    """15 & 16. Worker thread starts, reports running, and terminates cleanly on stop()."""
    test_worker = ObservationWorker(poll_interval_seconds=0.1)
    assert test_worker.is_running is False

    test_worker.start()
    assert test_worker.is_running is True

    test_worker.stop(timeout=2.0)
    assert test_worker.is_running is False


def test_worker_status_endpoint():
    """17. GET /api/worker/status returns expected diagnostics."""
    with TestClient(app) as client:
        resp = client.get("/api/worker/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "is_running" in data
        assert "active_merchant_queues" in data
        assert "stats" in data
        assert "scanned_today" in data["stats"]


def test_worker_manual_trigger_endpoint():
    """18. POST /api/worker/trigger-check/{listing_id} executes immediate observation."""
    listing_id, _ = _create_worker_test_listing()

    mock_result = ObservationResult(
        listing_id=listing_id,
        merchant="Amazon",
        merchant_product_id="TEST",
        status=ObservationStatus.SUCCESS,
        price=17500.0,
        price_changed=True,
    )

    with patch("backend.main.observe_listing", return_value=mock_result):
        with TestClient(app) as client:
            resp = client.post(f"/api/worker/trigger-check/{listing_id}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["listing_id"] == listing_id
            assert data["status"] == "SUCCESS"
            assert data["price"] == 17500.0
