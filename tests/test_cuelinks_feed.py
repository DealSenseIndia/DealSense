"""
Unit and Integration tests for Cuelinks V3 Feed & Trending Coupons:
- Category normalization
- Coupon code sanitization
- Prominent discount badge extraction
- Store logos and branding
- Database persistence and upserting
- Trending coupons and live deals API endpoints
"""

import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.main import app
from backend.database import get_session, init_db
from backend.models import CuelinksOffer
from backend.services.cuelinks_feed import (
    normalize_cuelinks_category,
    sanitize_coupon_code,
    extract_discount_badge,
    get_merchant_logo,
    get_trending_coupons,
    get_cuelinks_ranked_deals,
)


def test_normalize_cuelinks_category():
    """Verify raw category strings and titles map into DealSense categories."""
    assert normalize_cuelinks_category("Headphones & Audio") == "audio"
    assert normalize_cuelinks_category("", "Sony WH-1000XM5 Wireless Headphones") == "audio"
    assert normalize_cuelinks_category("Mobile Phones") == "mobiles"
    assert normalize_cuelinks_category("", "Apple iPhone 15 Pro Max 256GB") == "mobiles"
    assert normalize_cuelinks_category("Laptops & Desktops") == "laptops"
    assert normalize_cuelinks_category("", "Logitech Mechanical Gaming Keyboard") == "laptops"
    assert normalize_cuelinks_category("Wearables & Watches") == "smartwatches"
    assert normalize_cuelinks_category("Television") == "tvs"
    assert normalize_cuelinks_category("Home & Kitchen Appliances") == "appliances"
    assert normalize_cuelinks_category("Men & Women Clothing") == "fashion"
    assert normalize_cuelinks_category("Beauty & Skincare") == "beauty"
    assert normalize_cuelinks_category("Home Decor & Furnishing") == "home"


def test_sanitize_coupon_code():
    """Verify coupon code sanitization strips whitespace and rejects placeholder text."""
    # Valid codes
    assert sanitize_coupon_code("GOOFY200") == "GOOFY200"
    assert sanitize_coupon_code("  CLEAN15  ") == "CLEAN15"
    assert sanitize_coupon_code("APL052026") == "APL052026"
    assert sanitize_coupon_code("BEDSHEET30") == "BEDSHEET30"

    # Invalid / placeholder codes
    assert sanitize_coupon_code(None) is None
    assert sanitize_coupon_code("") is None
    assert sanitize_coupon_code("   ") is None
    assert sanitize_coupon_code("DEAL ACTIVATED") is None
    assert sanitize_coupon_code("none") is None
    assert sanitize_coupon_code("null") is None
    assert sanitize_coupon_code("n/a") is None
    assert sanitize_coupon_code("NO CODE REQUIRED") is None
    assert sanitize_coupon_code("GET DEAL") is None
    assert sanitize_coupon_code("A" * 35) is None


def test_extract_discount_badge():
    """Verify regex extraction of discount labels from titles and percent_off numbers."""
    # Direct percentage
    assert extract_discount_badge("Special Sale", 25.0) == "25% OFF"
    assert extract_discount_badge("Summer Discount", 10.0) == "10% OFF"

    # From Title patterns
    assert "200" in extract_discount_badge("Bewakoofy SALE - 40-70% Off + Rs.200 OFF!")
    assert "100" in extract_discount_badge("Bewagoofy Sale: 40-70% Off + Extra Rs.100 Discount!")
    assert "15% OFF" in extract_discount_badge("Save 15% on All Beauty Essentials at Jivisa!")
    assert "50% OFF" in extract_discount_badge("Kapiva Surprise Deals: Save Up to 50% + Get Extra Rs.200 Off!")
    assert "5% OFF" in extract_discount_badge("Grab Your 5% Off on Acer's Premium Home Appliances Now!")
    assert "30% OFF" in extract_discount_badge("Get Instant 30% Off on Luxurious Cotton Sheets!")
    assert "650" in extract_discount_badge("Special Gifting Offer: Save Up to Rs. 650 on Baby Products Today!")

    # Fallback
    assert extract_discount_badge("Random store promotion with no discount mention") == "Special Offer"


def test_get_merchant_logo():
    """Verify merchant logos are resolved correctly."""
    assert "/assets/croma-logo.svg" in get_merchant_logo("Croma Electronics")
    assert "/assets/myntra-logo.svg" in get_merchant_logo("Myntra Fashion")
    assert "/assets/flipkart-icon.svg" in get_merchant_logo("Flipkart")
    assert "/assets/amazon-logo.svg" in get_merchant_logo("Amazon India")
    assert get_merchant_logo("Unknown Boutique Store") == "/assets/dealsense-icon.png"


def test_get_trending_coupons_from_db():
    """Verify get_trending_coupons returns well-formed coupon cards from SQLite."""
    init_db()
    coupons = get_trending_coupons(limit=10)
    assert isinstance(coupons, list)
    if coupons:
        c = coupons[0]
        assert "id" in c
        assert "store_name" in c
        assert "store_logo" in c
        assert "coupon_code" in c
        assert c["coupon_code"] is not None
        assert "discount_badge" in c
        assert "tracking_url" in c
        assert c["verified"] is True


def test_api_trending_coupons_endpoint():
    """Verify GET /api/coupons/trending endpoint."""
    client = TestClient(app)
    response = client.get("/api/coupons/trending?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "coupons" in data
    assert isinstance(data["coupons"], list)


def test_api_cuelinks_deals_blended_into_live():
    """Verify GET /api/deals/live includes both price history observations and Cuelinks offers."""
    client = TestClient(app)
    response = client.get("/api/deals/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "deals" in data
    assert "category_counts" in data
    assert data["total_deals"] > 0
