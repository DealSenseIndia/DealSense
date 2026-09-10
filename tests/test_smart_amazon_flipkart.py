"""
Tests for Smart Amazon & Flipkart Deal Intelligence:
- Store-specific return policies, Prime/F-Assured badges, delivery fees
- Landed checkout price calculation
- Store-aware bank offers (Amazon Pay ICICI vs Flipkart Axis Bank)
- Amazon vs Flipkart 2-store comparison with ratings and exclusive states
"""

import pytest
from backend.services.bank_calculator import calculate_bank_effective_prices, calculate_checkout_total, get_best_bank_offer
from backend.services.store_comparison import build_compare_stores_table


def test_bank_calculator_amazon_vs_flipkart():
    """Verify store-specific bank cards for Amazon and Flipkart."""
    # Amazon with Prime
    amz_prime_offers = calculate_bank_effective_prices(20000.0, merchant="Amazon", is_prime=True)
    amz_icici = next(o for o in amz_prime_offers if o["bank_id"] == "icici")
    assert amz_icici["discount_amount"] == 1000  # 5% of 20,000
    assert "Prime" in amz_icici["eligibility_note"]

    # Amazon non-Prime
    amz_nonprime_offers = calculate_bank_effective_prices(20000.0, merchant="Amazon", is_prime=False)
    amz_icici_nonprime = next(o for o in amz_nonprime_offers if o["bank_id"] == "icici")
    assert amz_icici_nonprime["discount_amount"] == 600  # 3% of 20,000

    # Flipkart
    fk_offers = calculate_bank_effective_prices(20000.0, merchant="Flipkart")
    fk_axis = next(o for o in fk_offers if o["bank_id"] == "axis")
    assert fk_axis["discount_amount"] == 1000  # 5% unlimited
    assert "Flipkart Axis Bank" in fk_axis["bank_name"]
    # Check that ICICI is not in Flipkart list
    assert not any(o["bank_id"] == "icici" for o in fk_offers)


def test_calculate_checkout_total():
    """Verify landed checkout calculation: Base + Delivery - Coupon - Bank = Landed."""
    result = calculate_checkout_total(
        price=5499.0,
        delivery_fee=40.0,
        coupon_discount=300.0,
        bank_discount=500.0,
    )
    assert result["base_price"] == 5499.0
    assert result["delivery_fee"] == 40.0
    assert result["coupon_discount"] == 300.0
    assert result["bank_discount"] == 500.0
    assert result["total_savings"] == 800.0
    assert result["landed_price"] == 4739.0  # 5499 + 40 - 300 - 500
    assert result["is_free_delivery"] is False

    # Free delivery case
    free_res = calculate_checkout_total(
        price=2999.0,
        delivery_fee=0.0,
        coupon_discount=150.0,
        bank_discount=200.0,
    )
    assert free_res["landed_price"] == 2649.0
    assert free_res["is_free_delivery"] is True


def test_compare_stores_table_strictly_two_stores():
    """Verify store comparison strictly returns Amazon and Flipkart only (no Croma/Reliance/Brand Official)."""
    rival_info = {
        "matched": True,
        "rival_merchant": "Flipkart",
        "rival_price": 42999.0,
        "rival_clean_url": "https://www.flipkart.com/item/p/itm123",
        "rival_affiliate_url": "https://cuelinks.com/fk-aff",
        "price_difference": -1000.0,
        "rival_rating": 4.4,
        "rival_ratings_count": "18,400",
        "rival_in_stock": True,
        "rival_delivery": "FREE",
    }

    result = build_compare_stores_table(
        merchant="Amazon",
        current_price=41999.0,
        mrp=49900.0,
        brand="Apple",
        clean_url="https://www.amazon.in/dp/B09G9FPHY6",
        affiliate_url="https://amazon.in/dp/B09G9FPHY6?tag=deal-21",
        rival_info=rival_info,
        current_rating=4.5,
        current_ratings_count="34,200",
    )

    stores = result["stores"]
    # Must have strictly 2 entries: Amazon and Flipkart
    assert len(stores) == 2
    store_names = [s["name"] for s in stores]
    assert "Amazon" in store_names
    assert "Flipkart" in store_names

    # Ensure no tertiary stores exist
    assert "Croma" not in store_names
    assert "Reliance Digital" not in store_names
    assert "Official Store" not in store_names

    fk_store = next(s for s in stores if s["name"] == "Flipkart")
    assert fk_store["price"] == 42999.0
    assert fk_store["rating"] == 4.4
    assert fk_store["ratings_count"] == "18,400"
    assert fk_store["matched"] is True


def test_compare_stores_table_unmatched_exclusive():
    """Verify when rival is not available, status shows exclusive and button is disabled."""
    rival_info = {
        "matched": False,
        "rival_merchant": "Amazon",
        "recommendation": "Not listed on Amazon / Exclusive to Flipkart",
    }

    result = build_compare_stores_table(
        merchant="Flipkart",
        current_price=12999.0,
        mrp=15999.0,
        brand="Realme",
        clean_url="https://www.flipkart.com/p/itm999",
        affiliate_url="https://cuelinks.com/fk-itm999",
        rival_info=rival_info,
        current_rating=4.2,
        current_ratings_count="1,400",
    )

    stores = result["stores"]
    assert len(stores) == 2
    amz_store = next(s for s in stores if s["name"] == "Amazon")
    assert amz_store["matched"] is False
    assert amz_store["price"] is None
    assert "Not available on Amazon" in amz_store["status"]
    assert "Store Exclusive" in result["savings_callout"]


def test_compare_history_api_response():
    """Verify the /api/history/compare endpoint returns dual-store comparative payload."""
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.database import get_session
    from backend.models import MerchantListing, Product

    client = TestClient(app)

    import uuid

    unique_asin = f"B0TEST_{uuid.uuid4().hex[:8]}"
    with get_session() as session:
        product = Product(canonical_title=f"Boat Airdopes Test {unique_asin}", brand="boAt", category="Audio")
        session.add(product)
        session.commit()
        session.refresh(product)

        amz_listing = MerchantListing(
            product_id=product.id,
            merchant="Amazon",
            merchant_product_id=unique_asin,
            url=f"https://amazon.in/dp/{unique_asin}",
            clean_url=f"https://amazon.in/dp/{unique_asin}",
            current_price=1499.0,
            active=True,
        )
        session.add(amz_listing)
        session.commit()
        session.refresh(amz_listing)

        res = client.get(f"/api/history/compare/{amz_listing.id}/0?rival_price=1699.0")
        assert res.status_code == 200
        data = res.json()
        assert "primary" in data
        assert "rival" in data
        assert "combined" in data
        assert data["primary"]["merchant"] == "Amazon"
        assert data["primary"]["price"] == 1499.0
        assert data["rival"]["merchant"] == "Flipkart"
        assert data["rival"]["price"] == 1699.0
        assert data["combined"]["price_difference"] == 200.0
        assert data["primary"]["has_sufficient_history"] is False
        assert data["primary"]["history"] == []
        assert data["rival"]["has_sufficient_history"] is False
        assert data["rival"]["history"] == []

