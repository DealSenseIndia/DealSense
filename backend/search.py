"""
DealWise Omni-Search Engine.
Searches across the local product graph and integrates live merchant catalog deals,
allowing users to search "Air Fryer" or "boAt headphones" directly without needing to paste URLs.
"""

from typing import List, Dict, Any
from sqlmodel import select
from backend.database import get_session
from backend.models import Product, MerchantListing, PriceObservation


# Seed live catalog presets for instant, high-converting keyword searches in India
CATALOG_PRESETS: List[Dict[str, Any]] = [
    {
        "title": "PHILIPS Air Fryer NA120/00, 4.2 Litre, 1500W, Rapid Air Tech",
        "brand": "PHILIPS",
        "category": "Kitchen",
        "merchant": "Amazon",
        "price": 4706,
        "mrp": 5995,
        "discount_pct": 21.5,
        "rating": 4.4,
        "ratings_count": "8,230",
        "image_url": "https://m.media-amazon.com/images/I/31bes8eD4kL._SY300_SX300_QL70_ML2_.jpg",
        "url": "https://www.amazon.in/dp/B0D14BB5XY",
        "badge": "Amazon's Choice",
    },
    {
        "title": "boAt Rockerz 450 Bluetooth On Ear Headphones with Mic",
        "brand": "boAt",
        "category": "Audio",
        "merchant": "Amazon",
        "price": 1499,
        "mrp": 3990,
        "discount_pct": 62,
        "rating": 4.3,
        "ratings_count": "118,450",
        "image_url": "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=240&q=80",
        "url": "https://www.amazon.in/dp/B07PR1CL3S",
        "badge": "Top Seller",
    },
    {
        "title": "Status Multi Print Contract Flat Woven Grey Carpet 4x6 Feet",
        "brand": "Status",
        "category": "Home Decor",
        "merchant": "Amazon",
        "price": 999,
        "mrp": 3599,
        "discount_pct": 72,
        "rating": 4.4,
        "ratings_count": "5,829",
        "image_url": "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=240&q=80",
        "url": "https://www.amazon.in/dp/B0DHDF8RKB",
        "badge": "Verified Deal",
    },
    {
        "title": "Apple Watch Series 9 GPS 45mm Midnight Aluminum Sport Band",
        "brand": "Apple",
        "category": "Wearables",
        "merchant": "Amazon",
        "price": 41900,
        "mrp": 44900,
        "discount_pct": 7,
        "rating": 4.6,
        "ratings_count": "3,410",
        "image_url": "/assets/apple-watch-s9.png",
        "url": "https://www.amazon.in/dp/B0CHX6PXX6",
        "badge": "Premium Choice",
    },
    {
        "title": "Prestige Nutrifry Digital Electric Air Fryer 4.5 Litre",
        "brand": "Prestige",
        "category": "Kitchen",
        "merchant": "Flipkart",
        "price": 3999,
        "mrp": 6995,
        "discount_pct": 43,
        "rating": 4.3,
        "ratings_count": "3,410",
        "image_url": "https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=240&q=80",
        "url": "https://www.flipkart.com",
        "badge": "Flipkart Assured",
    },
    {
        "title": "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones with DSEE",
        "brand": "Sony",
        "category": "Audio",
        "merchant": "Amazon",
        "price": 3490,
        "mrp": 5990,
        "discount_pct": 42,
        "rating": 4.5,
        "ratings_count": "12,340",
        "image_url": "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=240&q=80",
        "url": "https://www.amazon.in/dp/B0BS1QCFHX",
        "badge": "Pro Sound",
    },
    {
        "title": "Wakefit Taurus Engineered Wood Queen Bed with Headboard",
        "brand": "Wakefit",
        "category": "Furniture",
        "merchant": "Amazon",
        "price": 8999,
        "mrp": 14999,
        "discount_pct": 40,
        "rating": 4.4,
        "ratings_count": "18,920",
        "image_url": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=240&q=80",
        "url": "https://www.amazon.in/dp/B07P7V9H2L",
        "badge": "Best Seller",
    },
    {
        "title": "Wipro Smart 16M Color WiFi Ambient Floor Lamp with Alexa",
        "brand": "Wipro",
        "category": "Lighting",
        "merchant": "Amazon",
        "price": 1199,
        "mrp": 2499,
        "discount_pct": 52,
        "rating": 4.3,
        "ratings_count": "6,740",
        "image_url": "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=240&q=80",
        "url": "https://www.amazon.in",
        "badge": "Smart Deal",
    },
    {
        "title": "Green Soul Minimal Ergonomic Computer Desk 47-Inch",
        "brand": "Green Soul",
        "category": "Furniture",
        "merchant": "Amazon",
        "price": 3499,
        "mrp": 6999,
        "discount_pct": 50,
        "rating": 4.4,
        "ratings_count": "4,150",
        "image_url": "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=240&q=80",
        "url": "https://www.amazon.in",
        "badge": "Editor's Pick",
    },
]


def search_catalog(
    query: str,
    limit: int = 8,
    session_id: Optional[str] = None,
    session: Optional[Session] = None,
) -> List[Dict[str, Any]]:
    """
    Searches canonical Product Universe and seed merchant catalog by keyword or partial title.
    Emits USER_SEARCH discovery telemetry for matched products.
    """
    q_norm = query.lower().strip()
    if not q_norm:
        return []

    results = []
    seen_titles = set()

    def _do_search(s: Session):
        query_pattern = f"%{q_norm}%"
        products = s.exec(
            select(Product).where(
                Product.canonical_title.ilike(query_pattern)
                | Product.brand.ilike(query_pattern)
                | Product.category.ilike(query_pattern)
            ).limit(limit)
        ).all()

        for p in products:
            listing = s.exec(
                select(MerchantListing).where(MerchantListing.product_id == p.id)
            ).first()

            last_obs = None
            if listing:
                last_obs = s.exec(
                    select(PriceObservation)
                    .where(PriceObservation.listing_id == listing.id)
                    .order_by(PriceObservation.observed_at.desc())
                ).first()

            p_price = last_obs.price if last_obs else (listing.current_price if listing else None)
            p_mrp = last_obs.mrp if last_obs and last_obs.mrp else None
            disc = round(((p_mrp - p_price) / p_mrp) * 100) if (p_mrp and p_price and p_mrp > p_price) else 0

            # Record search discovery event
            try:
                from backend.services.universe_service import record_discovery_event
                record_discovery_event(
                    product_id=p.id,
                    source="USER_SEARCH",
                    listing_id=listing.id if listing else None,
                    query_text=query,
                    session_id=session_id,
                    session=s,
                )
            except Exception:
                pass

            results.append({
                "id": p.id,
                "title": p.canonical_title,
                "brand": p.brand,
                "category": p.category or "General",
                "merchant": listing.merchant if listing else "Amazon",
                "price": p_price,
                "mrp": p_mrp,
                "discount_pct": disc,
                "rating": p.rating,
                "ratings_count": p.ratings_count,
                "image_url": p.image_url or "/assets/placeholder-product.png",
                "url": listing.clean_url if listing else f"/product/{p.id}",
                "badge": p.badge or (f"{listing.merchant}'s Choice" if listing else "Verified"),
                "source": "database",
            })
            seen_titles.add(p.canonical_title.lower())

    if session:
        _do_search(session)
    else:
        with get_session() as s_ctx:
            _do_search(s_ctx)

    # 2. Search catalog presets for supplementary seed candidates
    for item in CATALOG_PRESETS:
        if len(results) >= limit:
            break
        t_low = item["title"].lower()
        b_low = item["brand"].lower()
        c_low = item["category"].lower()
        if q_norm in t_low or q_norm in b_low or q_norm in c_low or any(w in t_low for w in q_norm.split()):
            if t_low not in seen_titles:
                results.append({**item, "source": "market_catalog"})
                seen_titles.add(t_low)

    return results[:limit]
