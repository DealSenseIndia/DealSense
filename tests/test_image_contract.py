from datetime import datetime, timezone

from backend.models import MerchantListing, PriceObservation, Product
from backend.services.deal_pipeline import build_deal_card


def test_deal_card_never_returns_null_image_url():
    product = Product(canonical_title="Image-less product", image_url=None)
    listing = MerchantListing(
        product_id=1,
        merchant="Amazon",
        merchant_product_id="IMAGELESS1",
        url="https://amazon.in/dp/IMAGELESS1",
        clean_url="https://amazon.in/dp/IMAGELESS1",
    )
    observation = PriceObservation(
        listing_id=1,
        price=999,
        observed_at=datetime.now(timezone.utc),
    )

    card = build_deal_card(listing, product, [observation])

    assert card is not None
    assert card["image_url"] == "/assets/fallback.svg"
    assert card["image_url"] not in {"null", "None", "/null"}
