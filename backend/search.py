"""
DealSense Omni-Search Engine.

Searches the local product graph (Product -> MerchantListing -> PriceObservation)
by keyword, so a user can search "air fryer" or "boAt headphones" without
pasting a URL.

Data rules enforced here:
  1. Every result is backed by a real row in the product graph. There is no
     seed/preset catalog -- a hardcoded price attached to a real ASIN is a
     claim we cannot support, and it goes stale silently.
  2. Prices come from the newest PriceObservation. If nothing has been
     observed, `price` is None and the frontend renders "--".
  3. `rating`, `ratings_count` and `badge` are passed through only when we
     actually recorded them. No default star rating, no invented review
     count, and never a synthesized "Amazon's Choice" -- that is a real
     merchant programme and claiming it falsely is a lie about the product.
  4. Scope is Amazon and Flipkart only.
"""

from typing import Any, Dict, List, Optional

from sqlmodel import Session, select

from backend.database import get_session
from backend.models import MerchantListing, PriceObservation, Product

# Merchants in scope. A listing on any other merchant is not returned rather
# than being relabelled as one of these.
SUPPORTED_MERCHANTS = ("amazon", "flipkart")


def search_catalog(
    query: str,
    limit: int = 8,
    session_id: Optional[str] = None,
    session: Optional[Session] = None,
) -> List[Dict[str, Any]]:
    """
    Searches the canonical Product Universe by keyword or partial title.
    Emits USER_SEARCH discovery telemetry for matched products.

    Returns an empty list when nothing matches. An empty result is a truthful
    answer; it is not padded with catalog filler.
    """
    q_norm = query.lower().strip()
    if not q_norm:
        return []

    results: List[Dict[str, Any]] = []

    def _do_search(s: Session) -> None:
        query_pattern = f"%{q_norm}%"
        products = s.exec(
            select(Product)
            .where(
                Product.canonical_title.ilike(query_pattern)
                | Product.brand.ilike(query_pattern)
                | Product.category.ilike(query_pattern)
            )
            .limit(limit)
        ).all()

        for p in products:
            # Only consider listings on merchants we actually support.
            listing = s.exec(
                select(MerchantListing).where(
                    MerchantListing.product_id == p.id,
                    MerchantListing.active == True,  # noqa: E712 - SQLModel needs ==
                )
            ).first()

            if listing is None or (listing.merchant or "").lower() not in SUPPORTED_MERCHANTS:
                continue

            last_obs = s.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == listing.id)
                .order_by(PriceObservation.observed_at.desc())
            ).first()

            # Newest observed price, falling back to the price cached on the
            # listing. Both may legitimately be absent.
            price = last_obs.price if last_obs else listing.current_price
            mrp = last_obs.mrp if (last_obs and last_obs.mrp) else None

            # A discount is only real if we hold both numbers and MRP is
            # genuinely higher. Otherwise it stays None, not 0, so the
            # frontend can omit the badge instead of printing "0% OFF".
            discount_pct = None
            if price is not None and mrp is not None and mrp > price:
                discount_pct = round(((mrp - price) / mrp) * 100)

            try:
                from backend.services.universe_service import record_discovery_event

                record_discovery_event(
                    product_id=p.id,
                    source="USER_SEARCH",
                    listing_id=listing.id,
                    query_text=query,
                    session_id=session_id,
                    session=s,
                )
            except Exception:
                # Telemetry must never break a user-facing search.
                pass

            results.append(
                {
                    "id": p.id,
                    "title": p.canonical_title,
                    "brand": p.brand,
                    "category": p.category or "General",
                    "merchant": listing.merchant,
                    "price": round(price) if price is not None else None,
                    "mrp": round(mrp) if mrp is not None else None,
                    "discount_pct": discount_pct,
                    # Passed through only when recorded. No default rating.
                    "rating": p.rating,
                    "ratings_count": p.ratings_count,
                    # None means "no image"; the frontend draws a neutral
                    # placeholder rather than a stock photo of something else.
                    "image_url": p.image_url,
                    "url": listing.clean_url or f"/product/{p.id}",
                    "badge": p.badge,
                    "source": "database",
                }
            )

    if session:
        _do_search(session)
    else:
        with get_session() as s_ctx:
            _do_search(s_ctx)

    return results[:limit]
