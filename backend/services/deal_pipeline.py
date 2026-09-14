"""
Deal Pipeline Service:
Self-refreshing data pipeline that fetches live pricing for curated Amazon & Flipkart products,
persists price history observations to SQLite, calculates deal scores via the DealVerdict engine,
and serves fresh, real ranked deals to the frontend.
"""

import json
import logging
import threading
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional

from sqlmodel import select

from backend.config import settings, build_affiliate_url
from backend.database import get_session, init_db
from backend.engine import evaluate_deal, DealVerdict
from backend.models import Product, MerchantListing, PriceObservation
from backend.services.cuelinks_feed import (
    sync_cuelinks_offers_to_db,
    get_cuelinks_ranked_deals,
    get_trending_coupons,
)

logger = logging.getLogger(__name__)

SEEDS_PATH = Path(__file__).resolve().parent.parent / "data" / "deal_seeds.json"

# In-memory cached deals & sync state
_cached_deals: List[Dict[str, Any]] = []
_last_refresh_time: Optional[datetime] = None
_is_refreshing: bool = False
_refresh_lock = threading.Lock()
_refresh_stats: Dict[str, Any] = {
    "total_seeds": 0,
    "last_scraped_count": 0,
    "last_success_count": 0,
    "last_failed_count": 0,
    "last_started_at": None,
    "last_completed_at": None,
    "duration_seconds": 0.0,
}

# Curated smart setups bundle deals (deprecated for verified live merchant feed)
CURATED_SETUP_DEALS: List[Dict[str, Any]] = []


def load_seeds() -> List[Dict[str, Any]]:
    """Loads curated deal seeds from deal_seeds.json."""
    if not SEEDS_PATH.exists():
        logger.warning(f"Seeds file not found at {SEEDS_PATH}")
        return []
    try:
        with open(SEEDS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read seeds file {SEEDS_PATH}: {e}")
        return []


def get_product_url(merchant: str, product_id: str) -> str:
    """Generates standard clean merchant URL from merchant and product ID."""
    m = merchant.lower()
    if m == "amazon":
        return f"https://www.amazon.in/dp/{product_id}"
    elif m == "flipkart":
        return f"https://www.flipkart.com/item/p/{product_id}"
    return f"https://www.amazon.in/dp/{product_id}"


def normalize_category(cat: Optional[str], title: Optional[str] = None) -> str:
    """Normalizes category into standard frontend categories."""
    if cat:
        c = cat.lower().strip()
        if any(w in c for w in ["mobile", "phone", "smartphone"]):
            return "mobiles"
        if any(w in c for w in ["audio", "headphone", "earphone", "speaker", "earbuds"]):
            return "audio"
        if any(w in c for w in ["laptop", "computer", "pc"]):
            return "laptops"
        if any(w in c for w in ["smartwatch", "wearable", "watch"]):
            return "smartwatches"
        if any(w in c for w in ["tv", "television"]):
            return "tvs"
        if any(w in c for w in ["appliance", "kitchen", "home", "fryer", "cooker", "heater", "purifier"]):
            return "appliances"
        if "setup" in c:
            return "setups"

    if title:
        t = title.lower()
        if any(w in t for w in ["phone", "5g", "mobile", "galaxy", "iphone", "redmi", "oneplus", "motorola", "poco"]):
            return "mobiles"
        if any(w in t for w in ["headphone", "earphone", "earbuds", "audio", "boat", "sony wh", "anc", "jbl tune"]):
            return "audio"
        if any(w in t for w in ["laptop", "notebook", "vivobook", "ideapad", "thinkpad", "aspire"]):
            return "laptops"
        if any(w in t for w in ["watch", "smartwatch", "pulse", "band"]):
            return "smartwatches"
        if any(w in t for w in ["tv", "television", "4k", "uhd"]):
            return "tvs"
        if any(w in t for w in ["fryer", "cooker", "heater", "purifier", "oven", "stove", "iron"]):
            return "appliances"

    return "appliances"


def determine_deal_type_and_badge(
    deal_score: int,
    discount_pct: float,
    current_price: float,
    historical_low: Optional[float],
) -> tuple[str, str]:
    """Classifies deal type and assigns compelling badge."""
    if historical_low and current_price <= (historical_low * 1.01):
        return "all_time_low", "🔥 All-Time Low"
    if deal_score >= 88:
        return "all_time_low", "🔥 Top Deal Score"
    if discount_pct >= 35:
        return "steep_drop", f"⚡ {int(discount_pct)}% Off"
    if discount_pct >= 15:
        return "steep_drop", "⚡ Price Drop Today"
    return "card_stack", "💳 Verified Deal"


def build_deal_card(
    listing: MerchantListing,
    product: Optional[Product],
    observations: List[PriceObservation],
    seed_info: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Builds a deal card dictionary conforming to the frontend contract."""
    if not observations:
        return None

    # Filter out observations with 0 or negative prices
    valid_obs = [o for o in observations if o.price and o.price > 0]
    if not valid_obs:
        return None

    current_obs = valid_obs[-1]
    prior_history = valid_obs[:-1]

    verdict: DealVerdict = evaluate_deal(current_obs, prior_history)
    current_price = round(verdict.current_price)
    mrp = round(verdict.mrp) if verdict.mrp and verdict.mrp > current_price else current_price
    discount_pct = int(verdict.discount_pct) if verdict.discount_pct else 0
    deal_score = int(verdict.deal_score)

    deal_type, deal_badge = determine_deal_type_and_badge(
        deal_score=deal_score,
        discount_pct=discount_pct,
        current_price=current_price,
        historical_low=verdict.historical_low,
    )

    seed_cat = seed_info.get("category") if seed_info else None
    prod_cat = product.category if product else None
    title = (listing.title_at_merchant or (product.canonical_title if product else "Product")).strip()
    category = normalize_category(seed_cat or prod_cat, title)

    # Build tagline based on empirical evidence
    if verdict.evidence:
        tagline = verdict.evidence[0]
    elif mrp > current_price:
        tagline = f"Save ₹{mrp - current_price:,} off MRP. Verified genuine price history."
    else:
        tagline = "Verified live price observation. Lowest among tracked records."

    merchant_name = listing.merchant or "Amazon"
    merchant_logo = (
        "/assets/flipkart-icon.svg"
        if merchant_name.lower() == "flipkart"
        else "/assets/amazon-logo.svg"
    )

    # No stock-photo fallback. A generic Unsplash image presented in a product
    # slot is a claim we cannot support; the frontend renders a neutral
    # placeholder when this is null.
    image_url = product.image_url if product else None

    brand = (product.brand if product else None) or (title.split()[0] if title else "Brand")

    # Real observed prices, oldest → newest, for the sparkline. The frontend
    # draws nothing unless there are at least SPARKLINE_MIN_POINTS of these;
    # it never synthesises a curve.
    price_history = [
        {
            "price": round(o.price),
            "observed_at": o.observed_at.isoformat() if o.observed_at else None,
        }
        for o in valid_obs
    ]

    # Distinct calendar dates backing the history, matching the sufficiency
    # rule used everywhere else in the product (>= 3 prices on >= 2 dates).
    distinct_dates = {
        o.observed_at.date() for o in valid_obs if o.observed_at
    }
    has_sufficient_history = len(valid_obs) >= 3 and len(distinct_dates) >= 2

    return {
        "id": f"deal_{merchant_name.lower()}_{listing.merchant_product_id}",
        "category": category,
        "title": title,
        "brand": brand,
        "price": current_price,
        "mrp": mrp,
        "discount_pct": discount_pct,
        "deal_score": deal_score,
        "deal_badge": deal_badge,
        "merchant": merchant_name,
        "merchant_logo": merchant_logo,
        "rating": product.rating if product else None,
        "ratings_count": product.ratings_count if product else None,
        "image_url": image_url,
        "url": listing.clean_url,
        "affiliate_url": build_affiliate_url(merchant_name, listing.clean_url),
        "price_drop_amount": max(0, mrp - current_price),
        "tagline": tagline,
        "deal_type": deal_type,
        "observed_at": current_obs.observed_at.isoformat() if current_obs.observed_at else None,
        # Evidence the card can show instead of inventing its own.
        "verdict": verdict.verdict,
        "confidence": verdict.confidence,
        "historical_low": round(verdict.historical_low) if verdict.historical_low else None,
        "historical_avg_90d": round(verdict.historical_avg_90d) if verdict.historical_avg_90d else None,
        "evidence": verdict.evidence,
        "price_history": price_history,
        "observation_count": len(valid_obs),
        "has_sufficient_history": has_sufficient_history,
    }


def load_deals_from_db() -> List[Dict[str, Any]]:
    """Loads active listings with observations from SQLite and evaluates deal scores."""
    init_db()
    deals = []
    seeds = load_seeds()
    seed_map = {f"{s['merchant'].lower()}_{s['product_id'].lower()}": s for s in seeds}

    with get_session() as session:
        listings = session.exec(
            select(MerchantListing).where(MerchantListing.active == True)
        ).all()

        for listing in listings:
            obs = session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == listing.id)
                .order_by(PriceObservation.observed_at.asc())
            ).all()

            if not obs:
                continue

            product = session.get(Product, listing.product_id) if listing.product_id else None
            key = f"{listing.merchant.lower()}_{listing.merchant_product_id.lower()}"
            seed_info = seed_map.get(key)

            card = build_deal_card(listing, product, list(obs), seed_info)
            if card:
                deals.append(card)

    return deals


def refresh_deal_pool(max_items: Optional[int] = None) -> Dict[str, Any]:
    """
    Refreshes the in-memory deals cache from verified database records.
    (Unofficial web scraping loop has been removed).
    """
    global _cached_deals, _last_refresh_time, _is_refreshing, _refresh_stats

    if not _refresh_lock.acquire(blocking=False):
        logger.info("Deal refresh already running.")
        return {
            "status": "already_running",
            "message": "Pipeline refresh is currently running.",
            "stats": _refresh_stats,
        }

    start_time = time.time()
    _is_refreshing = True
    seeds = load_seeds()
    if max_items:
        seeds = seeds[:max_items]

    _refresh_stats["total_seeds"] = len(seeds)
    _refresh_stats["last_started_at"] = datetime.now(timezone.utc).isoformat()

    try:
        init_db()
        # Sync verified multi-merchant offers & active coupons from Cuelinks V3
        cuelinks_synced = 0
        try:
            cl_res = sync_cuelinks_offers_to_db(max_pages=2, per_page=50)
            cuelinks_synced = cl_res.get("total_upserted", 0)
        except Exception as cl_err:
            logger.warning(f"Cuelinks feed sync during deal refresh failed: {cl_err}")

        # Load verified deals directly from SQLite database observations
        _cached_deals = load_deals_from_db()
        _last_refresh_time = datetime.now()

        duration = time.time() - start_time
        _refresh_stats.update({
            "last_scraped_count": 0,
            "last_success_count": len(_cached_deals),
            "last_cuelinks_synced": cuelinks_synced,
            "last_failed_count": 0,
            "last_completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_seconds": round(duration, 2),
        })

        logger.info(f"Deal pipeline refreshed from database in {duration:.2f}s ({len(_cached_deals)} deals active, {cuelinks_synced} cuelinks synced).")

        return {
            "status": "success",
            "message": f"Loaded {len(_cached_deals)} deals from verified database records ({cuelinks_synced} merchant offers synced).",
            "stats": _refresh_stats,
            "total_live_deals": len(_cached_deals),
        }
    finally:
        _is_refreshing = False
        _refresh_lock.release()


def start_background_refresh(max_items: Optional[int] = None):
    """Spawns non-blocking background thread to run refresh_deal_pool."""
    thread = threading.Thread(
        target=refresh_deal_pool,
        args=(max_items,),
        daemon=True,
        name="DealPipelineRefresher",
    )
    thread.start()
    return thread


def get_ranked_deals(category: Optional[str] = None, deal_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns filtered, ranked deals with real-time freshness metadata.
    Reads from SQLite observations and blends with verified Cuelinks merchant promotions.
    """
    global _cached_deals, _last_refresh_time

    # Load from DB if in-memory cache is uninitialized
    if not _cached_deals:
        _cached_deals = load_deals_from_db()
        if not _last_refresh_time:
            _last_refresh_time = datetime.now()

    all_deals = list(_cached_deals)

    # Blend in verified Cuelinks multi-merchant deals (Croma, Myntra, Ajio, Nykaa, etc.)
    try:
        cuelinks_deals = get_cuelinks_ranked_deals(category=category, limit=20)
        all_deals.extend(cuelinks_deals)
    except Exception as cl_err:
        logger.warning(f"Failed to blend Cuelinks deals into ranked feed: {cl_err}")

    filtered = all_deals
    if category and category.lower() != "all":
        filtered = [d for d in filtered if d.get("category", "").lower() == category.lower()]
    if deal_type and deal_type.lower() != "all":
        filtered = [d for d in filtered if d.get("deal_type", "").lower() == deal_type.lower()]

    # Sort primarily by deal_score descending
    filtered_sorted = sorted(filtered, key=lambda x: x.get("deal_score", 0), reverse=True)

    # Calculate freshness based on actual newest PriceObservation.observed_at
    newest_obs_dt = None
    with get_session() as session:
        newest_obs = session.exec(
            select(PriceObservation).order_by(PriceObservation.observed_at.desc())
        ).first()
        if newest_obs and newest_obs.observed_at:
            newest_obs_dt = newest_obs.observed_at

    if newest_obs_dt:
        if newest_obs_dt.tzinfo is None:
            newest_obs_dt = newest_obs_dt.replace(tzinfo=timezone.utc)
        elapsed_seconds = max(0, int((datetime.now(timezone.utc) - newest_obs_dt).total_seconds()))
        elapsed_minutes = elapsed_seconds // 60
        if elapsed_minutes < 1:
            elapsed_str = "just now"
        elif elapsed_minutes < 60:
            elapsed_str = f"{elapsed_minutes}m ago"
        elif elapsed_minutes < 1440:
            elapsed_str = f"{elapsed_minutes // 60}h ago"
        else:
            elapsed_str = f"{elapsed_minutes // 1440}d ago"
    else:
        elapsed_str = "No scans yet"
        elapsed_minutes = 0

    refresh_interval = settings.DEAL_REFRESH_INTERVAL_MINUTES
    next_scan = max(1, refresh_interval - (elapsed_minutes % refresh_interval))

    # Category counts
    category_keys = ["all", "mobiles", "laptops", "audio", "smartwatches", "tvs", "appliances", "fashion", "beauty", "home"]
    category_counts = {k: 0 for k in category_keys}
    category_counts["all"] = len(all_deals)
    for d in all_deals:
        cat = d.get("category", "").lower()
        if cat in category_counts and cat != "all":
            category_counts[cat] += 1

    return {
        "status": "success",
        "total_deals": len(filtered_sorted),
        "last_scanned_display": elapsed_str,
        "next_scan_in_minutes": next_scan,
        "category_counts": category_counts,
        "deals": filtered_sorted,
    }


def get_pipeline_status() -> Dict[str, Any]:
    """Returns runtime status and statistics of the deal pipeline."""
    seeds = load_seeds()
    now = datetime.now()
    refreshed_at = _last_refresh_time or now
    elapsed_minutes = int((now - refreshed_at).total_seconds() // 60)
    refresh_interval = settings.DEAL_REFRESH_INTERVAL_MINUTES
    next_scan = max(1, refresh_interval - (elapsed_minutes % refresh_interval))

    return {
        "status": "refreshing" if _is_refreshing else "idle",
        "is_refreshing": _is_refreshing,
        "last_refresh_time": _last_refresh_time.isoformat() if _last_refresh_time else None,
        "next_refresh_in_minutes": next_scan,
        "refresh_interval_minutes": refresh_interval,
        "total_seeds": len(seeds),
        "cached_live_deals": len(_cached_deals),
        "stats": _refresh_stats,
    }
