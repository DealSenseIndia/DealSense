"""
Unit & Regression Tests for DealSense Canonical Observation Service.
Verifies zero-fabrication guarantees, deduplication policy, heartbeat provenance,
and error handling.
"""

from datetime import datetime, timezone, timedelta
import uuid
import pytest
from unittest.mock import patch, MagicMock
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import Product, ProductVariant, MerchantListing, PriceObservation
from backend.services.observation_service import (
    observe_listing,
    ObservationStatus,
    ObservationResult,
    HEARTBEAT_THRESHOLD_HOURS,
)


@pytest.fixture(autouse=True)
def ensure_db():
    init_db()


def _create_test_listing(
    merchant: str = "Amazon",
    initial_price: float = 49999.0,
    variant_name: str = "Standard",
    active: bool = True,
):
    """Helper to create an isolated test listing and optional baseline observation."""
    unique_id = f"TEST_{uuid.uuid4().hex[:8].upper()}"
    with get_session() as session:
        prod = Product(
            canonical_title=f"Test Phone {unique_id}",
            brand="TestBrand",
        )
        session.add(prod)
        session.commit()
        session.refresh(prod)

        variant = ProductVariant(
            product_id=prod.id,
            variant_name=variant_name,
        )
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
            current_price=initial_price,
            active=active,
            availability="in_stock",
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)

        listing_id = listing.id

    return listing_id, unique_id


def test_price_change_creates_live_extraction_observation():
    """1. Price change creates a new observation with source='live_extraction'."""
    listing_id, _ = _create_test_listing(initial_price=50000.0)

    mock_extracted = MagicMock()
    mock_extracted.price = 45000.0  # Price drop
    mock_extracted.mrp = 55000.0
    mock_extracted.in_stock = True
    mock_extracted.title = "Test Phone 128GB Black"
    mock_extracted.seller_name = "Cloudtail"
    mock_extracted.delivery_fee = 0.0

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(mock_extracted, None, None)):
        res: ObservationResult = observe_listing(listing_id)

    assert res.status == ObservationStatus.SUCCESS
    assert res.price == 45000.0
    assert res.price_changed is True
    assert res.observation_id is not None

    with get_session() as session:
        obs = session.get(PriceObservation, res.observation_id)
        assert obs is not None
        assert obs.price == 45000.0
        assert obs.source == "live_extraction"

        listing = session.get(MerchantListing, listing_id)
        assert listing.current_price == 45000.0
        assert listing.failure_count == 0


def test_same_price_under_12h_skips_observation():
    """2. Same price observed within 12 hours updates last_checked_at and skips row insertion."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    # Insert an existing observation from 2 hours ago
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    with get_session() as session:
        obs1 = PriceObservation(
            listing_id=listing_id,
            price=45000.0,
            mrp=55000.0,
            source="live_extraction",
            observed_at=two_hours_ago,
        )
        session.add(obs1)
        session.commit()

        initial_count = len(session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all())

    mock_extracted = MagicMock()
    mock_extracted.price = 45000.0  # Same price
    mock_extracted.mrp = 55000.0
    mock_extracted.in_stock = True
    mock_extracted.title = "Test Phone"
    mock_extracted.seller_name = "Cloudtail"
    mock_extracted.delivery_fee = 0.0

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(mock_extracted, None, None)):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.UNCHANGED_SKIPPED
    assert res.price_changed is False

    with get_session() as session:
        final_count = len(session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all())
        assert final_count == initial_count  # Zero new observations inserted!


def test_same_price_after_12h_creates_live_heartbeat():
    """3. Same price observed >= 12 hours after previous observation records live_heartbeat."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    # Insert an existing observation from 14 hours ago
    fourteen_hours_ago = datetime.now(timezone.utc) - timedelta(hours=14)
    with get_session() as session:
        obs1 = PriceObservation(
            listing_id=listing_id,
            price=45000.0,
            mrp=55000.0,
            source="live_extraction",
            observed_at=fourteen_hours_ago,
        )
        session.add(obs1)
        session.commit()

    mock_extracted = MagicMock()
    mock_extracted.price = 45000.0  # Same price
    mock_extracted.mrp = 55000.0
    mock_extracted.in_stock = True
    mock_extracted.title = "Test Phone"
    mock_extracted.seller_name = "Cloudtail"
    mock_extracted.delivery_fee = 0.0

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(mock_extracted, None, None)):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.UNCHANGED_HEARTBEAT
    assert res.price_changed is False
    assert res.observation_id is not None

    with get_session() as session:
        heartbeat_obs = session.get(PriceObservation, res.observation_id)
        assert heartbeat_obs is not None
        assert heartbeat_obs.price == 45000.0
        assert heartbeat_obs.source == "live_heartbeat"


def test_scrape_failure_creates_zero_observations():
    """4. General scraper failure creates zero observations and increments failure_count."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(None, ObservationStatus.EXTRACTION_FAILED_UNPRICED, "Parser error")):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.EXTRACTION_FAILED_UNPRICED

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0

        listing = session.get(MerchantListing, listing_id)
        assert listing.failure_count == 1


def test_captcha_creates_zero_observations():
    """5. Captcha/Robot check creates zero observations and marks BLOCKED."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(None, ObservationStatus.BLOCKED, "Amazon Robot Check")):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.BLOCKED

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0

        listing = session.get(MerchantListing, listing_id)
        assert listing.failure_count == 1


def test_rate_limit_creates_zero_observations():
    """6. HTTP 429 creates zero observations and marks RATE_LIMITED."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(None, ObservationStatus.RATE_LIMITED, "HTTP 429 Too Many Requests")):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.RATE_LIMITED

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0


def test_network_error_creates_zero_observations():
    """7. Network timeout creates zero observations and marks NETWORK_ERROR."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(None, ObservationStatus.NETWORK_ERROR, "Connection timed out")):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.NETWORK_ERROR

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0


def test_out_of_stock_does_not_create_fake_zero_price():
    """8. Out-of-stock marks availability without creating a fake zero price."""
    listing_id, _ = _create_test_listing(initial_price=45000.0)

    mock_extracted = MagicMock()
    mock_extracted.price = None
    mock_extracted.in_stock = False
    mock_extracted.title = "Currently unavailable"

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(mock_extracted, None, None)):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.OUT_OF_STOCK
    assert res.in_stock is False

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0  # No fake 0.0 price observation!

        listing = session.get(MerchantListing, listing_id)
        assert listing.availability == "out_of_stock"


def test_variant_mismatch_creates_zero_observations():
    """9. Variant mismatch creates zero observations and flags VARIANT_MISMATCH."""
    listing_id, _ = _create_test_listing(initial_price=79999.0, variant_name="256GB Black")

    mock_extracted = MagicMock()
    mock_extracted.price = 69999.0
    mock_extracted.mrp = 89999.0
    mock_extracted.in_stock = True
    mock_extracted.title = "Smartphone 128GB White"  # Conflicts with 256GB Black!

    with patch("backend.services.observation_service._fetch_merchant_data", return_value=(mock_extracted, None, None)):
        res = observe_listing(listing_id)

    assert res.status == ObservationStatus.VARIANT_MISMATCH

    with get_session() as session:
        obs_list = session.exec(select(PriceObservation).where(PriceObservation.listing_id == listing_id)).all()
        assert len(obs_list) == 0
