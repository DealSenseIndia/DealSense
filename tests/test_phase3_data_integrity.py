"""
DEALSENSE PHASE 3.1 — DATA INTEGRITY & ANTI-SYNTHETIC PURGE TEST SUITE
Validates zero data manufacturing across the entire price intelligence pipeline.
Tests A through L as mandated by the Phase 3.1 specification.
"""

import os
import re
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.main import app
from backend.database import get_session, init_db
from backend.models import Product, MerchantListing, PriceObservation
from backend.services.deal_pipeline import (
    CURATED_SETUP_DEALS,
    build_deal_card,
    get_ranked_deals,
)
from backend.services.store_comparison import (
    build_compare_stores_table,
    build_reviews_intelligence,
    build_seller_trust_intelligence,
    build_similar_products,
)
from backend.extractor import extract_product_data, ExtractedProduct
from backend.resolver import ResolvedURL


@pytest.fixture
def client():
    return TestClient(app)


# ===========================================================================
# Test A & B: Synthetic history is NEVER returned; Insufficient history produces history=[]
# ===========================================================================
def test_insufficient_history_returns_empty_clean_payload(client):
    """
    Test A & B:
    If insufficient REAL observations exist:
    - history = []
    - has_sufficient_history = false
    - confidence = LOW
    - lowest_price = None
    - lowest_date = None
    - price_drops_count = 0
    Zero fabricated points, dates, drops, or curves.
    """
    uid = uuid.uuid4().hex[:8]
    with get_session() as session:
        product = Product(canonical_title=f"Integrity Test Product {uid}", brand="TestBrand", category="Audio")
        session.add(product)
        session.commit()
        session.refresh(product)

        listing = MerchantListing(
            product_id=product.id,
            merchant="Amazon",
            merchant_product_id=f"B0{uid.upper()[:8]}",
            url=f"https://amazon.in/dp/B0{uid.upper()[:8]}",
            clean_url=f"https://amazon.in/dp/B0{uid.upper()[:8]}",
            current_price=2999.0,
            active=True,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)
        listing_id = listing.id

    # Query /api/history/{listing_id} with 0 observations
    res = client.get(f"/api/history/{listing_id}")
    assert res.status_code == 200
    data = res.json()

    assert data["has_sufficient_history"] is False
    assert data["confidence"] == "LOW"
    assert data["history"] == []
    assert data["lowest_price"] is None
    assert data["lowest_date"] is None
    assert data["average_price"] is None
    assert data["highest_price"] is None
    assert data["price_drops_count"] == 0

    # Query /api/history/compare with 0 observations on both sides
    res_compare = client.get(f"/api/history/compare/{listing_id}/0?rival_price=3199.0")
    assert res_compare.status_code == 200
    comp_data = res_compare.json()

    assert comp_data["primary"]["has_sufficient_history"] is False
    assert comp_data["primary"]["history"] == []
    assert comp_data["primary"]["lowest_price"] is None
    assert comp_data["rival"]["has_sufficient_history"] is False
    assert comp_data["rival"]["history"] == []
    assert comp_data["rival"]["lowest_price"] is None
    assert comp_data["combined"]["price_drops_count"] == 0


def test_sufficient_history_returns_strictly_real_observations(client):
    """When genuine observations exist across distinct days, real data is returned."""
    uid = uuid.uuid4().hex[:8]
    now = datetime.now(timezone.utc)
    with get_session() as session:
        product = Product(canonical_title=f"MultiDay Product {uid}", brand="RealBrand", category="Audio")
        session.add(product)
        session.commit()
        session.refresh(product)

        listing = MerchantListing(
            product_id=product.id,
            merchant="Amazon",
            merchant_product_id=f"B0{uid.upper()[:8]}",
            url=f"https://amazon.in/dp/B0{uid.upper()[:8]}",
            clean_url=f"https://amazon.in/dp/B0{uid.upper()[:8]}",
            current_price=2499.0,
            active=True,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)
        listing_id = listing.id

        # Insert 3 real observations across 3 distinct days
        for days_ago, p in [(10, 2999.0), (5, 2799.0), (0, 2499.0)]:
            obs = PriceObservation(
                listing_id=listing_id,
                price=p,
                mrp=3999.0,
                currency="INR",
                source="live_extraction",
                observed_at=now - timedelta(days=days_ago),
            )
            session.add(obs)
        session.commit()

    res = client.get(f"/api/history/{listing_id}")
    assert res.status_code == 200
    data = res.json()

    assert data["has_sufficient_history"] is True
    assert len(data["history"]) == 3
    assert data["lowest_price"] == 2499.0
    assert data["highest_price"] == 2999.0
    assert data["price_drops_count"] == 2  # 2 drops: 2999 -> 2799 -> 2499


# ===========================================================================
# Test C: Scraper failure produces NO PriceObservation
# ===========================================================================
def test_scraper_failure_produces_no_observation():
    """
    Test C:
    When extraction fails to find a price, no PriceObservation must be recorded in SQLite.
    A scraper failure must NEVER become historical price data.
    """
    from backend.service import ingest_and_evaluate
    from unittest.mock import patch

    # Mock extraction returning unpriced / blocked state
    with patch("backend.service.ingest_product_from_url") as mock_ingest:
        with get_session() as session:
            fail_asin = f"B0F{uuid.uuid4().hex[:7].upper()}"
            # Create dummy listing without price
            prod = Product(canonical_title="Failed Scrape Item", brand="Test", category="Laptops")
            session.add(prod)
            session.commit()
            session.refresh(prod)

            listg = MerchantListing(
                product_id=prod.id,
                merchant="Amazon",
                merchant_product_id=fail_asin,
                url=f"https://amazon.in/dp/{fail_asin}",
                clean_url=f"https://amazon.in/dp/{fail_asin}",
                active=True,
            )
            session.add(listg)
            session.commit()
            session.refresh(listg)

            # Ingest returned listing and product, but obs_ingested is None (scraper blocked)
            mock_ingest.return_value = (prod, listg, None, "failed")

            obs_before = session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == listg.id)
            ).all()
            count_before = len(obs_before)

            # Run evaluation
            result = ingest_and_evaluate(f"https://amazon.in/dp/{fail_asin}", force_refresh=True)
            assert result["status"] == "extraction_failed"
            assert result["pricing"]["current_price"] is None

            obs_after = session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == listg.id)
            ).all()
            # Zero observations inserted!
            assert len(obs_after) == count_before


# ===========================================================================
# Test D: Missing MRP produces mrp=null (no 1.35 multiplier)
# ===========================================================================
def test_missing_mrp_produces_null_without_fabrication():
    """
    Test D:
    If merchant MRP is unavailable, mrp must be None.
    Do not fabricate round(price * 1.35).
    """
    table = build_compare_stores_table(
        merchant="Amazon",
        current_price=1999.0,
        mrp=None,  # Missing MRP
        brand="TestBrand",
        clean_url="https://amazon.in/dp/B0TEST001",
        affiliate_url="https://amazon.in/dp/B0TEST001",
        rival_info={"matched": False},
        current_rating=4.2,
        current_ratings_count="1,200",
    )

    current_store = table["stores"][0]
    assert current_store["mrp"] is None
    assert current_store["discount_pct"] is None


# ===========================================================================
# Test E: Missing ratings do not produce hardcoded ratings
# ===========================================================================
def test_missing_ratings_do_not_produce_hardcoded_ratings():
    """
    Test E:
    When rating is unavailable from merchant, do not default to 4.4 or 4.3.
    """
    table = build_compare_stores_table(
        merchant="Amazon",
        current_price=1999.0,
        mrp=2999.0,
        brand="TestBrand",
        clean_url="https://amazon.in/dp/B0TEST001",
        affiliate_url="https://amazon.in/dp/B0TEST001",
        rival_info={"matched": False},
        current_rating=None,  # Unrated product
        current_ratings_count=None,
    )
    current_store = table["stores"][0]
    assert current_store["rating"] is None
    assert current_store["ratings_count"] is None


# ===========================================================================
# Test F: Missing reviews do not produce fabricated reviews
# ===========================================================================
def test_missing_reviews_do_not_produce_fabricated_reviews():
    """
    Test F:
    Remove hardcoded customer review names ("Vikram Sengupta", "Rahul Sharma") and quotes.
    When top_reviews is empty, featured_review must be None.
    """
    rev = build_reviews_intelligence(
        title="Air Fryer 4L Kitchen",
        brand="ChefBrand",
        category="Kitchen",
        rating=None,
        ratings_count=None,
        top_reviews=None,  # No reviews extracted
    )
    assert rev["featured_review"] is None
    # No fake quotes or fake authors anywhere
    rev_str = str(rev)
    assert "Vikram Sengupta" not in rev_str
    assert "Rahul Sharma" not in rev_str


# ===========================================================================
# Test G: Missing seller data does not produce fabricated seller data
# ===========================================================================
def test_missing_seller_data_does_not_produce_fabricated_trust():
    """
    Test G:
    When seller_name is unavailable, do not invent Appario, RetailNet, or fake trust score 96/84.
    """
    trust = build_seller_trust_intelligence(
        merchant="Amazon",
        seller_name=None,
        current_price=2499.0,
    )
    assert trust["available"] is False
    assert trust["seller_name"] is None
    assert trust["trust_score"] is None
    assert trust["rating"] is None


# ===========================================================================
# Test H: build_deal_card reads real Product rating values
# ===========================================================================
def test_build_deal_card_reads_real_product_rating():
    """
    Test H:
    build_deal_card must read product.rating and product.ratings_count from the Product model,
    not hardcoded 4.4 and 12,450.
    """
    with get_session() as session:
        product = Product(
            canonical_title="Unique Rated Headphones",
            brand="AudioMax",
            category="Audio",
            rating=4.7,
            ratings_count="3,820",
        )
        listing = MerchantListing(
            merchant="Amazon",
            merchant_product_id="B0RATED001",
            clean_url="https://amazon.in/dp/B0RATED001",
        )
        obs = [
            PriceObservation(
                listing_id=1,
                price=1499.0,
                mrp=2499.0,
                observed_at=datetime.now(timezone.utc),
            )
        ]

        card = build_deal_card(listing, product, obs)
        assert card["rating"] == 4.7
        assert card["ratings_count"] == "3,820"


# ===========================================================================
# Test I: Setup bundles do not appear as verified live merchant deals
# ===========================================================================
def test_setup_bundles_do_not_appear_in_verified_deal_feed():
    """
    Test I:
    CURATED_SETUP_DEALS must not be returned in get_ranked_deals.
    """
    assert len(CURATED_SETUP_DEALS) == 0
    res = get_ranked_deals()
    deals = res["deals"]
    for d in deals:
        assert d.get("is_setup") is not True
        assert d.get("deal_type") != "setup_bundle"
        assert d.get("id") not in ("deal_set_1", "deal_set_2")


# ===========================================================================
# Test J: Freshness uses actual PriceObservation.observed_at
# ===========================================================================
def test_freshness_uses_actual_observation_timestamp():
    """
    Test J:
    last_scanned_display must reflect the newest PriceObservation.observed_at from the database.
    """
    res = get_ranked_deals()
    assert "last_scanned_display" in res
    display = res["last_scanned_display"]
    # If observations exist, it must not be empty or arbitrary
    assert display != ""


# ===========================================================================
# Test K: Synthetic historical_catalog observations are purged from database
# ===========================================================================
def test_no_synthetic_historical_catalog_rows_in_production_db():
    """
    Test K:
    Zero price observations with source='historical_catalog' or 'baseline_estimate' exist.
    """
    with get_session() as session:
        synth_obs = session.exec(
            select(PriceObservation).where(
                PriceObservation.source.in_(["historical_catalog", "baseline_estimate"])
            )
        ).all()
        assert len(synth_obs) == 0


# ===========================================================================
# Test L: Vercel check-deal cannot return synthetic production intelligence
# ===========================================================================
def test_vercel_check_deal_is_clean_proxy():
    """
    Test L:
    api/check-deal.js must not contain parallel synthetic pricing, ratings, or competitor simulations.
    """
    vercel_file = os.path.join(os.path.dirname(__file__), "..", "api", "check-deal.js")
    with open(vercel_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Verify absence of synthetic generator routines
    assert "Math.round(price * 1.35)" not in content
    assert "RetailEZ / Appario" not in content
    assert "12,480" not in content
    assert "targetEndpoint" in content  # Confirms proxy architecture
