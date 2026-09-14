"""
Unit & Integration Tests for DealSense Cross-Store Live Price Matcher.
Tests:
- Search query extraction
- Accessory mismatch guard
- Flipkart & Amazon search HTML parsers
- Candidate scoring with storage variant alignment
- Dual-store price difference and recommendation calculations
"""

import pytest
from unittest.mock import patch, MagicMock

from backend.matcher import (
    build_search_query,
    _is_accessory_mismatch,
    _tokenize,
    search_flipkart_live,
    search_amazon_live,
    find_rival_store_match,
    CompetitorComparison,
)
from backend.services.store_comparison import build_compare_stores_table


def test_build_search_query():
    """Verify search queries are stripped of noise words and keep brand + model."""
    title = "Apple iPhone 15 (128 GB) - Black Online Best Price with Free Delivery"
    query = build_search_query(title, brand="Apple")
    assert "Apple" in query
    assert "iPhone" in query
    assert "15" in query
    assert "Online" not in query
    assert "Price" not in query


def test_is_accessory_mismatch():
    """Ensure devices are never matched with cases, covers, or tempered glass."""
    phone = "Apple iPhone 15 128GB Black"
    case = "Spigen Ultra Hybrid Back Case Cover for iPhone 15"
    tempered = "Tempered Glass Screen Protector for Apple iPhone 15"
    actual_phone = "Apple iPhone 15 (Blue, 128 GB)"

    assert _is_accessory_mismatch(phone, case) is True
    assert _is_accessory_mismatch(phone, tempered) is True
    assert _is_accessory_mismatch(phone, actual_phone) is False


def test_flipkart_search_parser_with_html():
    """Test Flipkart HTML search parsing with mock response."""
    mock_html = """
    <html>
      <body>
        <div class="row">
          <a href="/oneplus-nord-ce4-dark-chrome-128-gb/p/itm5a09089114afb?pid=MOBGZNH6QUUVZGZN">
            <div class="KzDlHZ">OnePlus Nord CE4 (Dark Chrome, 128 GB)</div>
            <div class="Nx9bqj">₹24,999</div>
            <div class="XQDdHH">4.4 ★</div>
          </a>
        </div>
      </body>
    </html>
    """
    with patch("curl_cffi.requests.Session.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = mock_html
        mock_get.return_value = mock_resp

        results = search_flipkart_live("OnePlus Nord CE4")
        assert len(results) >= 1
        item = results[0]
        assert item["product_id"] == "itm5a09089114afb"
        assert "OnePlus Nord CE4" in item["title"]
        assert item["price"] == 24999.0
        assert item["rating"] == 4.4
        assert "flipkart.com/product/p/itm5a09089114afb" in item["clean_url"]


def test_amazon_search_parser_with_html():
    """Test Amazon HTML search parsing with mock response."""
    mock_html = """
    <html>
      <body>
        <div data-component-type="s-search-result" data-asin="B0CLJHP3RF">
          <h2><span>Apple iPhone 15 (128 GB) - Black</span></h2>
          <span class="a-price"><span class="a-offscreen">₹65,999</span></span>
          <span class="a-icon-alt">4.5 out of 5 stars</span>
        </div>
      </body>
    </html>
    """
    with patch("curl_cffi.requests.Session.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = mock_html
        mock_get.return_value = mock_resp

        results = search_amazon_live("Apple iPhone 15")
        assert len(results) >= 1
        item = results[0]
        assert item["product_id"] == "B0CLJHP3RF"
        assert "iPhone 15" in item["title"]
        assert item["price"] == 65999.0
        assert item["rating"] == 4.5
        assert item["clean_url"] == "https://www.amazon.in/dp/B0CLJHP3RF"


def test_find_rival_store_match_cheaper_rival():
    """Test rival store matching calculation when rival store is cheaper."""
    mock_candidates = [
        {
            "product_id": "itm5a09089114afb",
            "title": "OnePlus Nord CE4 (Dark Chrome, 128 GB)",
            "price": 23499.0,
            "clean_url": "https://www.flipkart.com/product/p/itm5a09089114afb",
            "rating": 4.4,
            "ratings_count": "28,000",
            "in_stock": True,
        }
    ]

    with patch("backend.matcher.search_flipkart_live", return_value=mock_candidates):
        comp: CompetitorComparison = find_rival_store_match(
            current_merchant="Amazon",
            source_title="OnePlus Nord CE4 5G (Dark Chrome, 128GB)",
            current_price=24999.0,
            brand="OnePlus",
            live_search=True,
            verify_live_price=False,
        )

        assert comp.matched is True
        assert comp.rival_merchant == "Flipkart"
        assert comp.rival_price == 23499.0
        assert comp.price_difference == 1500.0  # 24999 - 23499
        assert "Flipkart is cheaper by Rs. 1,500!" in comp.recommendation


def test_find_rival_store_match_cheaper_primary():
    """Test rival store matching calculation when current primary store is cheaper."""
    mock_candidates = [
        {
            "product_id": "itm5a09089114afb",
            "title": "OnePlus Nord CE4 (Dark Chrome, 128 GB)",
            "price": 26999.0,
            "clean_url": "https://www.flipkart.com/product/p/itm5a09089114afb",
            "rating": 4.4,
            "ratings_count": "28,000",
            "in_stock": True,
        }
    ]

    with patch("backend.matcher.search_flipkart_live", return_value=mock_candidates):
        comp: CompetitorComparison = find_rival_store_match(
            current_merchant="Amazon",
            source_title="OnePlus Nord CE4 5G (Dark Chrome, 128GB)",
            current_price=24999.0,
            brand="OnePlus",
            live_search=True,
            verify_live_price=False,
        )

        assert comp.matched is True
        assert comp.rival_merchant == "Flipkart"
        assert comp.rival_price == 26999.0
        assert comp.price_difference == -2000.0  # 24999 - 26999
        assert "Current store (Amazon) is cheaper by Rs. 2,000." in comp.recommendation


def test_find_rival_store_match_with_deep_page_verification():
    """Verify that visiting the rival product page updates the price with real buy-box pricing."""
    mock_candidates = [
        {
            "product_id": "itm7ddc2f24ed7e3",
            "title": "Logitech K120 Wired Keyboard",
            "price": 751.0,  # Old search snippet price
            "clean_url": "https://www.flipkart.com/product/p/itm7ddc2f24ed7e3",
            "rating": 4.1,
            "ratings_count": "5,000",
            "in_stock": True,
        }
    ]
    verified_data = {
        "price": 625.0,  # Live product page buy-box price
        "mrp": 895.0,
        "title": "Logitech K120 / Full-Size, Spill-Resistant Wired Keyboard",
        "rating": 4.4,
        "ratings_count": "9,628",
        "in_stock": True,
        "delivery_fee": 0.0,
    }

    with patch("backend.matcher.search_flipkart_live", return_value=mock_candidates), \
         patch("backend.matcher._verify_rival_listing", return_value=verified_data):
        comp = find_rival_store_match(
            current_merchant="Amazon",
            source_title="Logitech K120 Wired Keyboard for Windows",
            current_price=625.0,
            brand="Logitech",
            live_search=True,
            verify_live_price=True,
        )

        assert comp.matched is True
        assert comp.rival_price == 625.0  # Successfully updated to verified product page price!
        assert comp.price_difference == 0.0
        assert "virtually identical" in comp.recommendation.lower()


def test_smart_matcher_model_codes_and_brand_gating():
    """Test model code extraction, brand conflict gating, and combo mismatch rejection."""
    from backend.matcher import _extract_model_codes, _is_brand_conflict, _is_combo_mismatch

    # Model code extraction
    assert "k120" in _extract_model_codes("Logitech K120 Wired Keyboard")
    assert "wh-1000xm5" in _extract_model_codes("Sony WH-1000XM5 Wireless Headphones")
    assert "mk270" in _extract_model_codes("Logitech MK270 Wireless Combo")

    # Brand conflict rejection: Logitech source vs HP / Zebronics candidate
    assert _is_brand_conflict("Logitech", "HP K120 Wired Standard Keyboard") is True
    assert _is_brand_conflict("Logitech", "Zebronics Zeb-K20 Standard Keyboard") is True
    assert _is_brand_conflict("Logitech", "Logitech K120 / Full-Size Keyboard") is False

    # Combo vs standalone mismatch rejection
    assert _is_combo_mismatch("Logitech K120 Keyboard", "Logitech MK120 Keyboard and Mouse Combo") is True
    assert _is_combo_mismatch("Logitech K120 Keyboard", "Logitech K120 Wired USB Keyboard") is False


def test_build_compare_stores_table_integration():
    """Verify compare table integrates seamlessly with live rival comparison result."""
    rival_info = {
        "matched": True,
        "rival_merchant": "Flipkart",
        "rival_price": 23499.0,
        "rival_clean_url": "https://www.flipkart.com/product/p/itm5a09089114afb",
        "rival_affiliate_url": "https://cuelinks.com/sample-fk-url",
        "price_difference": 1500.0,
        "rival_rating": 4.4,
        "rival_ratings_count": "28,000",
        "rival_in_stock": True,
        "rival_delivery": "FREE",
    }

    result = build_compare_stores_table(
        merchant="Amazon",
        current_price=24999.0,
        mrp=27999.0,
        brand="OnePlus",
        clean_url="https://www.amazon.in/dp/B0CX24C65M",
        affiliate_url="https://www.amazon.in/dp/B0CX24C65M?tag=dealintel-21",
        rival_info=rival_info,
        current_rating=4.3,
        current_ratings_count="15,200",
    )

    stores = result["stores"]
    assert len(stores) == 2
    # Because Flipkart is cheaper, it should be marked as lowest
    fk_store = next(s for s in stores if s["name"] == "Flipkart")
    amz_store = next(s for s in stores if s["name"] == "Amazon")

    assert fk_store["is_lowest"] is True
    assert amz_store["is_lowest"] is False
    assert result["price_difference"] == 1500
    assert "Flipkart is ₹1,500 cheaper than Amazon" in result["savings_callout"]
