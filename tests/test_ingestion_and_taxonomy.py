"""
Unit and Integration Tests for DealSense Self-Expanding Product Ingestion
and Dynamic Category Taxonomy Engines.
"""
import pytest
from sqlmodel import Session, select

from backend.config import settings
from backend.database import engine, get_session
from backend.models import Product, ProductVariant, MerchantListing, Category, PriceObservation
from backend.services.ingestion_service import (
    _extract_title_from_url_slug,
    ingest_product_from_url,
)
from backend.services.taxonomy_service import (
    classify_and_assign_category,
    CORE_TAXONOMY_MAP,
)
from backend.services.analysis_service import analyze_product_url


def test_slug_title_extraction_amazon():
    """Verifies that Amazon URL slugs recover clean product titles."""
    url = "https://www.amazon.in/Sony-WH-1000XM4-Cancelling-Headphones-Bluetooth/dp/B0863TXGM3"
    title = _extract_title_from_url_slug(url)
    assert title is not None
    assert "Sony" in title
    assert "Headphones" in title


def test_slug_title_extraction_flipkart():
    """Verifies that Flipkart URL slugs recover clean product titles."""
    url = "https://www.flipkart.com/oneplus-nord-4-5g-mercurial-silver-256-gb/p/itm123456?pid=MOBH1234NORD4"
    title = _extract_title_from_url_slug(url)
    assert title is not None
    assert "Oneplus" in title
    assert "Nord" in title


def test_slug_title_extraction_tata_cliq():
    """Verifies that Tata CLiQ URL slugs recover clean product titles."""
    url = "https://www.tatacliq.com/apple-iphone-15-128gb-black/p-mp000000019842183"
    title = _extract_title_from_url_slug(url)
    assert title is not None
    assert "Apple" in title
    assert "Iphone" in title


def test_dynamic_taxonomy_rule_matching():
    """Verifies that common shopping categories map to canonical categories."""
    with get_session() as session:
        cat_id, cat_name = classify_and_assign_category(
            session=session,
            title="Noise Colorfit Pulse 2 Max Smartwatch with 1.85 Display",
            brand="Noise",
        )
        assert cat_name == "Smartwatches"
        assert cat_id is not None

        cat_id_audio, cat_name_audio = classify_and_assign_category(
            session=session,
            title="boAt Airdopes 141 ANC TWS Earbuds with 42H Playtime",
            brand="boAt",
        )
        assert cat_name_audio == "Headphones"


def test_dynamic_taxonomy_on_the_fly_creation():
    """Verifies that an unseen niche category is dynamically created in SQLite."""
    with get_session() as session:
        cat_id, cat_name = classify_and_assign_category(
            session=session,
            title="Okatsune Professional Bonsai Pruning Shears 200mm",
            brand="Okatsune",
            raw_category="Bonsai Tools",
        )
        assert cat_id is not None
        assert cat_name == "Bonsai Tools"

        # Verify persisted in database
        saved_cat = session.get(Category, cat_id)
        assert saved_cat is not None
        assert saved_cat.is_active is True
        assert saved_cat.slug == "bonsai-tools"


def test_autonomous_ingestion_creates_records():
    """
    Submitting a brand-new URL should autonomously create:
    - Product
    - ProductVariant
    - MerchantListing
    - Dynamic Category association
    """
    test_url = "https://www.amazon.in/Logitech-MX-Master-3S-Wireless-Mouse/dp/B0B47W1Q5V"
    with get_session() as session:
        product, listing, obs, status = ingest_product_from_url(test_url, session)
        assert product is not None
        assert listing is not None
        assert product.id is not None
        assert "Amazon" in listing.merchant
        assert listing.merchant_product_id == "B0B47W1Q5V"
        assert product.category_id is not None

        # Re-submitting should return EXISTING status without duplication
        prod2, list2, obs2, status2 = ingest_product_from_url(test_url, session)
        assert status2 == "EXISTING"
        assert prod2.id == product.id
        assert list2.id == listing.id


def test_analyze_product_url_day_one_resolution(monkeypatch):
    """
    When a newly pasted URL is analyzed for the first time:
    - Must return status: SUCCESS
    - Must include bank discounts (SBI, HDFC, ICICI)
    - Must provide transparent Day 1 verdict
    - Must have monetized outbound affiliate URL when tag is configured
    """
    monkeypatch.setattr(settings, "AMAZON_AFFILIATE_TAG", "dealsense-21")
    test_url = "https://www.amazon.in/OnePlus-Nord-Buds-Wireless-Earbuds/dp/B0D14BB5XY"
    result = analyze_product_url(test_url)
    assert result["status"] == "SUCCESS"
    assert result["product"]["canonical_title"] is not None
    assert result["pricing"]["current_price"] is not None
    assert len(result["bank_offers"]) >= 3
    assert result["monetization"]["is_monetized"] is True
    assert "tag=dealsense-21" in result["monetization"]["outbound_url"]
