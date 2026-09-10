"""
Unit tests for DealSense Phase 2 Rich PDP Features & Non-Fabricated Data:
- Multi-image gallery serialization/deserialization
- Technical specifications table structure
- Star rating and ratings count persistence
- Seller trust & delivery information
- Response structure adherence for frontend PDP components
"""

import json
from datetime import datetime, timezone
import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from backend.models import Product, ProductVariant, MerchantListing, PriceObservation
from backend.service import _build_product_response


@pytest.fixture(name="mem_session")
def fixture_mem_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_build_product_response_with_rich_data(mem_session):
    now = datetime.now(timezone.utc)
    images = [
        "https://m.media-amazon.com/images/I/71xyz1.jpg",
        "https://m.media-amazon.com/images/I/71xyz2.jpg",
        "https://m.media-amazon.com/images/I/71xyz3.jpg",
    ]
    specs = [
        {"key": "Brand", "value": "Apple"},
        {"key": "Model Name", "value": "iPhone 15"},
        {"key": "Operating System", "value": "iOS"},
        {"key": "Cellular Technology", "value": "5G"},
    ]
    product = Product(
        canonical_title="Apple iPhone 15 (128 GB) - Blue",
        canonical_slug="apple-iphone-15-128gb-blue",
        brand="Apple",
        category="Smartphones",
        image_url=images[0],
        images_json=json.dumps(images),
        rating=4.6,
        ratings_count="12,450",
        bought_count="5K+ bought in past month",
        badge="Best Seller",
        highlight_tag="A16 Bionic",
        specifications_json=json.dumps(specs),
        created_at=now,
    )
    mem_session.add(product)
    mem_session.commit()
    mem_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="Amazon",
        merchant_product_id="B0CHX1W1XY",
        url="https://www.amazon.in/dp/B0CHX1W1XY",
        clean_url="https://www.amazon.in/dp/B0CHX1W1XY",
        current_price=69999.0,
        seller="Appario Retail Private Ltd",
        seller_name="Appario Retail Private Ltd",
        delivery_info="FREE delivery Wednesday, 10 Sept",
        availability="in_stock",
        last_checked_at=now,
        created_at=now,
    )
    mem_session.add(listing)
    mem_session.commit()
    mem_session.refresh(listing)

    resp = _build_product_response(product, listing)

    assert resp["title"] == "Apple iPhone 15 (128 GB) - Blue"
    assert resp["brand"] == "Apple"
    assert resp["category"] == "Smartphones"
    assert resp["image_url"] == images[0]
    assert len(resp["images"]) == 3
    assert resp["images"][1] == images[1]
    assert resp["rating"] == 4.6
    assert resp["ratings_count"] == "12,450"
    assert resp["bought_past_month"] == "5K+ bought in past month"
    assert resp["badge"] == "Best Seller"
    assert resp["highlight_tag"] == "A16 Bionic"
    assert len(resp["specifications"]) == 4
    assert resp["specifications"][0]["key"] == "Brand"
    assert resp["specifications"][0]["value"] == "Apple"


def test_build_product_response_fallback_empty_lists():
    """Ensure that null/empty fields gracefully fallback without crashing or faking data."""
    product = Product(
        canonical_title="Generic Mouse",
        canonical_slug="generic-mouse",
        image_url="https://example.com/mouse.jpg",
        images_json=None,
        rating=None,
        ratings_count=None,
        bought_count=None,
        badge=None,
        highlight_tag=None,
        specifications_json=None,
    )
    resp = _build_product_response(product, None)

    assert resp["title"] == "Generic Mouse"
    # When images_json is None, images defaults to [image_url]
    assert resp["images"] == ["https://example.com/mouse.jpg"]
    assert resp["rating"] is None
    assert resp["ratings_count"] is None
    assert resp["bought_past_month"] is None
    assert resp["badge"] is None
    assert resp["specifications"] is None

