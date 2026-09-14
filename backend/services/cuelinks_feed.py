"""
Cuelinks Feed Service:
Fetches, normalizes, and syncs verified live merchant deals, promotions,
and active coupon codes from the Cuelinks V3 Publisher API into SQLite.
Powers the Trending Coupons & Promo Codes feed and multi-merchant sale events.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx
from sqlmodel import select

from backend.config import settings
from backend.database import get_session
from backend.models import CuelinksOffer

logger = logging.getLogger(__name__)

# Merchant logo mapping for top Indian stores
MERCHANT_LOGOS = {
    "croma": "/assets/croma-logo.svg",
    "myntra": "/assets/myntra-logo.svg",
    "meesho": "/assets/meesho-logo.svg",
    "flipkart": "/assets/flipkart-icon.svg",
    "amazon": "/assets/amazon-logo.svg",
    "ajio": "/assets/stores/showcase-myntra.png",
    "nykaa": "/assets/stores/showcase-croma.png",
    "tata cliq": "/assets/stores/showcase-croma.png",
    "vijay sales": "/assets/croma-logo.svg",
}

INVALID_CODE_PATTERNS = {
    "none", "null", "n/a", "", "deal activated", "no code required",
    "get deal", "grab now", "deal", "active", "activate", "claim offer",
    "auto applied", "shop now", "click here", "verified"
}


def sanitize_coupon_code(raw_code: Optional[str]) -> Optional[str]:
    """Sanitizes raw coupon code, rejecting placeholders like 'DEAL ACTIVATED'."""
    if not raw_code:
        return None
    cleaned = raw_code.strip()
    if not cleaned:
        return None
    if cleaned.lower() in INVALID_CODE_PATTERNS:
        return None
    if len(cleaned) > 30:
        return None
    if " " in cleaned and len(cleaned) > 16:
        return None
    return cleaned


def extract_discount_badge(title: str, percent_off: Optional[float] = None) -> str:
    """Extracts a prominent discount label (e.g. ₹200 OFF, 15% OFF, 40-70% OFF) from title or percent_off."""
    if percent_off and percent_off > 0:
        return f"{int(percent_off)}% OFF"
    t = title or ""
    m_save_rs = re.search(r'save\s+(?:up\s+to\s+)?rs\.?\s*(\d+)', t, re.IGNORECASE)
    if m_save_rs:
        return f"₹{m_save_rs.group(1)} OFF"
    m_save_pct = re.search(r'save\s+(?:up\s+to\s+)?(\d+)%', t, re.IGNORECASE)
    if m_save_pct:
        return f"{m_save_pct.group(1)}% OFF"
    m_rs_off = re.search(r'(?:extra\s+|flat\s+)?rs\.?\s*(\d+)\s*(?:off|discount)', t, re.IGNORECASE)
    if m_rs_off:
        return f"₹{m_rs_off.group(1)} OFF"
    m_pct_off = re.search(r'(?:(?:up\s*to|extra|flat)\s*)?(\d+(?:-\d+)?%)\s*(?:off|discount)', t, re.IGNORECASE)
    if m_pct_off:
        return m_pct_off.group(0).strip().upper()
    return "Special Offer"


def get_merchant_logo(merchant_name: str) -> str:
    """Returns brand logo path for a merchant name."""
    name_lower = (merchant_name or "").lower()
    for key, logo in MERCHANT_LOGOS.items():
        if key in name_lower:
            return logo
    return "/assets/dealsense-icon.png"


def normalize_cuelinks_category(category_raw: Optional[str], title: Optional[str] = None) -> str:
    """Normalizes raw Cuelinks categories into standard DealSense categories."""
    raw = (category_raw or "").lower()
    t = (title or "").lower()

    if any(w in raw or w in t for w in ["headphone", "earphone", "audio", "speaker", "soundbar", "earbuds", "tws"]):
        return "audio"
    if any(w in raw or w in t for w in ["phone", "mobile", "smartphone", "5g", "iphone", "samsung"]):
        return "mobiles"
    if any(w in raw or w in t for w in ["laptop", "computer", "pc", "macbook", "tablet", "desktop", "keyboard"]):
        return "laptops"
    if any(w in raw or w in t for w in ["watch", "smartwatch", "wearable", "fitness"]):
        return "smartwatches"
    if any(w in raw or w in t for w in ["tv", "television"]):
        return "tvs"
    if any(w in raw or w in t for w in ["appliance", "kitchen", "refrigerator", "air fryer", "cooker", "vacuum"]):
        return "appliances"
    if any(w in raw or w in t for w in ["fashion", "clothing", "apparel", "shoes", "footwear", "denim", "lingerie", "jeans"]):
        return "fashion"
    if any(w in raw or w in t for w in ["beauty", "cosmetics", "makeup", "skincare", "fragrance", "perfume"]):
        return "beauty"
    if any(w in raw or w in t for w in ["home", "furniture", "living", "decor", "kitchenware"]):
        return "home"

    return "electronics" if "electronic" in raw else "all"


def _parse_iso_dt(dt_str: Optional[str]) -> Optional[datetime]:
    """Safely parses ISO date string to UTC datetime."""
    if not dt_str:
        return None
    try:
        # Handle '2026-09-30' or '2026-09-30T12:00:00Z'
        if len(dt_str) == 10:
            return datetime.strptime(dt_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        clean_str = dt_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_str)
    except Exception:
        return None


def fetch_cuelinks_offers(
    page: int = 1,
    per_page: int = 50,
    campaign_id: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Fetches active offers from Cuelinks V3 /offers endpoint.
    """
    if not settings.CUELINKS_API_KEY:
        logger.warning("[CuelinksFeed] CUELINKS_API_KEY is not configured.")
        return {"data": [], "meta": {"total": 0}}

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    url = f"{base_url}/offers"
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }
    params: Dict[str, Any] = {
        "page": page,
        "per_page": per_page,
    }
    if campaign_id:
        params["campaign_id"] = campaign_id

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=headers, params=params)
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"[CuelinksFeed] API returned HTTP {resp.status_code}: {resp.text[:200]}")
            return {"data": [], "meta": {"total": 0, "error": resp.status_code}}
    except Exception as err:
        logger.error(f"[CuelinksFeed] Request failed: {err}")
        return {"data": [], "meta": {"total": 0, "error": str(err)}}


def sync_cuelinks_offers_to_db(max_pages: int = 3, per_page: int = 50) -> Dict[str, Any]:
    """
    Synchronizes fresh offers and coupons from Cuelinks V3 into the SQLite database.
    Updates existing offers, inserts new ones, and marks expired offers.
    """
    total_fetched = 0
    total_upserted = 0
    coupons_found = 0
    now = datetime.now(timezone.utc)

    with get_session() as session:
        for page in range(1, max_pages + 1):
            feed = fetch_cuelinks_offers(page=page, per_page=per_page)
            offers_data = feed.get("data", [])
            if not offers_data:
                break

            for item in offers_data:
                total_fetched += 1
                cuelinks_id = item.get("id")
                if not cuelinks_id:
                    continue

                title = item.get("title") or "Merchant Special Offer"
                desc = item.get("description")
                terms = item.get("terms")
                code = sanitize_coupon_code(item.get("coupon_code"))
                if code:
                    coupons_found += 1

                camp_id = item.get("campaign_id") or 0
                camp_name = item.get("campaign_name") or "Retail Partner"
                raw_cats = item.get("categories", [])
                if isinstance(raw_cats, list):
                    cat_names = [c.get("name", "") if isinstance(c, dict) else str(c) for c in raw_cats]
                    cat_raw = ", ".join(cat_names)
                else:
                    cat_raw = str(raw_cats or "")
                category = normalize_cuelinks_category(cat_raw, title)

                tracking_url = item.get("tracking_url") or "#"
                pct_off = float(item.get("percent_off")) if item.get("percent_off") is not None else None
                orig_price = float(item.get("original_price")) if item.get("original_price") is not None else None
                disc_price = float(item.get("discount_price")) if item.get("discount_price") is not None else None

                start_at = _parse_iso_dt(item.get("start_date"))
                end_at = _parse_iso_dt(item.get("end_date"))

                is_expired = end_at is not None and end_at < now
                raw_st = (item.get("status") or "").lower()
                status = "expired" if is_expired else ("active" if raw_st in ["live", "active", ""] else raw_st)
                extracted_badge = extract_discount_badge(title, pct_off)
                is_trending = (code is not None) or (pct_off is not None and pct_off >= 15.0) or (extracted_badge != "Special Offer")

                # Upsert by cuelinks_id
                existing = session.exec(
                    select(CuelinksOffer).where(CuelinksOffer.cuelinks_id == cuelinks_id)
                ).first()

                if existing:
                    existing.title = title
                    existing.description = desc
                    existing.terms = terms
                    existing.coupon_code = code
                    existing.campaign_id = camp_id
                    existing.campaign_name = camp_name
                    existing.category = category
                    existing.tracking_url = tracking_url
                    existing.percent_off = pct_off
                    existing.original_price = orig_price
                    existing.discount_price = disc_price
                    existing.start_date = start_at
                    existing.end_date = end_at
                    existing.status = status
                    existing.is_trending = is_trending
                    existing.updated_at = now
                    session.add(existing)
                else:
                    new_offer = CuelinksOffer(
                        cuelinks_id=cuelinks_id,
                        title=title,
                        description=desc,
                        terms=terms,
                        coupon_code=code,
                        campaign_id=camp_id,
                        campaign_name=camp_name,
                        category=category,
                        tracking_url=tracking_url,
                        percent_off=pct_off,
                        original_price=orig_price,
                        discount_price=disc_price,
                        start_date=start_at,
                        end_date=end_at,
                        status=status,
                        is_trending=is_trending,
                        created_at=now,
                        updated_at=now,
                    )
                    session.add(new_offer)

                total_upserted += 1

            session.commit()

            # Check if there is a next page
            total_pages = feed.get("meta", {}).get("total_pages", 1)
            if page >= total_pages:
                break

    logger.info(f"[CuelinksFeed] Synced {total_upserted} offers ({coupons_found} coupons) from {total_fetched} items.")
    return {
        "status": "success",
        "total_fetched": total_fetched,
        "total_upserted": total_upserted,
        "coupons_found": coupons_found,
        "synced_at": now.isoformat(),
    }


def get_trending_coupons(category: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Returns active promo codes and coupons from SQLite, sorted by discount and freshness.
    """
    now = datetime.now(timezone.utc)
    with get_session() as session:
        query = select(CuelinksOffer).where(
            CuelinksOffer.status.in_(["active", "live"]),
            CuelinksOffer.coupon_code.is_not(None),
        )

        if category and category.lower() != "all":
            query = query.where(CuelinksOffer.category == category.lower())

        offers = session.exec(query.order_by(CuelinksOffer.updated_at.desc()).limit(limit * 2)).all()

        results = []
        for o in offers:
            # Check expiry
            if o.end_date:
                end_dt = o.end_date if o.end_date.tzinfo else o.end_date.replace(tzinfo=timezone.utc)
                if end_dt < now:
                    continue

            # Compute expiry display
            expiry_str = "Limited Time"
            if o.end_date:
                days_left = (end_dt - now).days
                if days_left == 0:
                    expiry_str = "Expires Today"
                elif days_left == 1:
                    expiry_str = "Expires Tomorrow"
                elif days_left > 1:
                    expiry_str = f"{days_left} days left"

            discount_badge = extract_discount_badge(o.title, o.percent_off)

            clean_code = sanitize_coupon_code(o.coupon_code)
            if not clean_code:
                continue

            results.append({
                "id": o.id,
                "cuelinks_id": o.cuelinks_id,
                "store_name": o.campaign_name,
                "store_logo": get_merchant_logo(o.campaign_name),
                "title": o.title,
                "description": o.description or o.terms or f"Verified discount at {o.campaign_name}",
                "coupon_code": clean_code,
                "discount_badge": discount_badge,
                "category": o.category,
                "expiry_display": expiry_str,
                "tracking_url": o.tracking_url,
                "verified": True,
            })
            if len(results) >= limit:
                break

        return results


def get_cuelinks_ranked_deals(category: Optional[str] = None, limit: int = 25) -> List[Dict[str, Any]]:
    """
    Transforms top active Cuelinks promotions and sales into DealSense deal card format.
    """
    now = datetime.now(timezone.utc)
    with get_session() as session:
        query = select(CuelinksOffer).where(
            CuelinksOffer.status.in_(["active", "live"]),
            CuelinksOffer.is_trending == True,
        )
        if category and category.lower() != "all":
            query = query.where(CuelinksOffer.category == category.lower())

        offers = session.exec(query.order_by(CuelinksOffer.updated_at.desc()).limit(limit * 2)).all()

        cards = []
        for o in offers:
            if o.end_date:
                end_dt = o.end_date if o.end_date.tzinfo else o.end_date.replace(tzinfo=timezone.utc)
                if end_dt < now:
                    continue

            # Estimate deal score
            pct = o.percent_off or 20.0
            score = min(96, int(70 + (pct * 0.35)))
            clean_code = sanitize_coupon_code(o.coupon_code)
            badge = f"CODE: {clean_code}" if clean_code else extract_discount_badge(o.title, o.percent_off)

            cards.append({
                "id": f"cuelinks_{o.cuelinks_id}",
                "category": o.category,
                "title": o.title,
                "price": o.discount_price or (o.original_price * (1 - pct/100) if o.original_price else 0),
                "mrp": o.original_price or 0,
                "discount_pct": round(pct, 1),
                "deal_score": score,
                "deal_badge": badge,
                "merchant": o.campaign_name,
                "merchant_logo": get_merchant_logo(o.campaign_name),
                "rating": 4.5,
                "image_url": o.image_url or get_merchant_logo(o.campaign_name),
                "url": o.tracking_url,
                "coupon_code": o.coupon_code,
                "deal_type": "coupon" if o.coupon_code else "steep_drop",
                "tagline": o.description or f"Verified promotional offer from {o.campaign_name}.",
                "source": "cuelinks_verified",
            })
            if len(cards) >= limit:
                break

        return cards
