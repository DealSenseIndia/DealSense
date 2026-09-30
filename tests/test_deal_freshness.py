from datetime import datetime, timedelta, timezone

from backend.models import MerchantListing, PriceObservation, Product
from backend.services.deal_pipeline import build_deal_card


def make_card(observed_at):
    product = Product(canonical_title="Freshness test product")
    listing = MerchantListing(
        product_id=1,
        merchant="Amazon",
        merchant_product_id="FRESHNESS1",
        url="https://amazon.in/dp/FRESHNESS1",
        clean_url="https://amazon.in/dp/FRESHNESS1",
    )
    observation = PriceObservation(
        listing_id=1,
        price=999,
        observed_at=observed_at,
    )
    return build_deal_card(listing, product, [observation])


def test_recent_observation_is_fresh():
    card = make_card(datetime.now(timezone.utc) - timedelta(minutes=1))
    assert card["freshness_status"] == "fresh"
    assert card["age_minutes"] >= 1


def test_old_observation_is_stale():
    card = make_card(datetime.now(timezone.utc) - timedelta(days=2))
    assert card["freshness_status"] == "stale"
    assert card["freshness_label"] == "Price check is stale"
