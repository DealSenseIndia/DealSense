from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import (
    Product,
    MerchantListing,
    PriceObservation,
    PriceAlert,
    Merchant,
    Category,
    SetupCategory,
    Setup,
    SetupItem,
)
from contextlib import asynccontextmanager
from backend.service import ingest_and_evaluate
from backend.search import search_catalog
from backend.setup_engine import build_smart_setup, SetupRequest
from backend.services.deals_crawler import get_live_deals_feed, refresh_deals_feed
from backend.services.observation_worker import worker
from backend.services.observation_service import observe_listing


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        from scripts.build_html import build_html
        build_html()
    except Exception as e:
        print(f"Warning: HTML auto-build skipped: {e}")
    # Start autonomous price observation background worker
    worker.start()
    yield
    # Graceful shutdown on application exit
    worker.stop()


app = FastAPI(
    title="Deal Intelligence Engine",
    description="Automated shopping intelligence and deal verification API for Indian e-commerce.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local web and extension development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CheckDealRequest(BaseModel):
    url: str
    force_refresh: bool = False


class AnalyzeProductRequest(BaseModel):
    url: str
    force_refresh: bool = False


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Deal Intelligence Backend"}


@app.get("/api/worker/status")
def get_worker_status():
    """Returns real-time runtime diagnostics and queue states for the observation worker."""
    return worker.get_status()


@app.post("/api/worker/trigger-check/{listing_id}")
def trigger_listing_check(listing_id: int):
    """Executes an immediate manual observation check on a specific listing."""
    result = observe_listing(listing_id=listing_id, force=True)
    return result.to_dict()


@app.get("/api/homepage")
def get_homepage_data():
    """
    Unified Homepage Contract:
    Provides structured data for all frozen homepage components:
    - featured_setups
    - product_categories
    - featured_deals (Amazon & Flipkart only)
    - price_drops
    - popular_products
    - supported_merchants (Strictly Amazon & Flipkart)
    - stats
    FALLBACK GUARANTEE: If the database is empty, automatically provides
    verified development seed data so the UI is never blank.
    """
    stats_data = {
        "shoppers_count": "450,000+",
        "total_savings": "₹9.2 Crore+",
        "fake_discounts_flagged": "210,000+",
        "daily_checks": "1.5 Million+",
        "average_rating": "4.9",
    }

    supported_merchants = [
        {
            "name": "Amazon",
            "slug": "amazon",
            "domain": "amazon.in",
            "logo": "/assets/amazon-logo.svg",
            "active": True,
        },
        {
            "name": "Flipkart",
            "slug": "flipkart",
            "domain": "flipkart.com",
            "logo": "/assets/flipkart-icon.svg",
            "active": True,
        },
    ]

    with get_session() as session:
        # 1. Setup Categories
        db_setups = session.exec(select(SetupCategory)).all()
        featured_setups = []
        if db_setups:
            for sc in db_setups:
                featured_setups.append({
                    "id": sc.id,
                    "name": sc.name,
                    "slug": sc.slug,
                    "domain_group": sc.domain_group,
                    "icon": sc.icon or "✨",
                    "budget_start": f"from ₹{sc.budget_start:,}",
                    "image_url": sc.image_url,
                })
        else:
            featured_setups = [
                {"name": "Bedroom", "slug": "bedroom", "budget_start": "from ₹20,000", "image_url": "https://images.unsplash.com/photo-1540518614846-7ede433c4550?w=600&q=80"},
                {"name": "Gaming Setup", "slug": "gaming_setup", "budget_start": "from ₹40,000", "image_url": "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=600&q=80"},
                {"name": "Home Office", "slug": "home_office", "budget_start": "from ₹25,000", "image_url": "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=600&q=80"},
                {"name": "Living Room", "slug": "living_room", "budget_start": "from ₹30,000", "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&q=80"},
                {"name": "Kitchen", "slug": "kitchen", "budget_start": "from ₹25,000", "image_url": "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80"},
                {"name": "PC Build", "slug": "pc_build", "budget_start": "from ₹50,000", "image_url": "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&q=80"},
            ]

        # 2. Product Categories
        db_categories = session.exec(select(Category).where(Category.parent_id == None)).all()
        product_categories = []
        if db_categories:
            for cat in db_categories:
                product_categories.append({
                    "id": cat.id,
                    "name": cat.name,
                    "slug": cat.slug,
                    "icon": cat.icon,
                })
        else:
            product_categories = [
                {"name": "Electronics", "slug": "electronics", "icon": "📱"},
                {"name": "Home & Living", "slug": "home-living", "icon": "🛋️"},
                {"name": "Fashion", "slug": "fashion", "icon": "👕"},
                {"name": "Beauty & Personal Care", "slug": "beauty-personal-care", "icon": "✨"},
                {"name": "Sports & Fitness", "slug": "sports-fitness", "icon": "🏋️"},
                {"name": "Automotive", "slug": "automotive", "icon": "🚗"},
            ]

        # 3. Featured Deals (Amazon & Flipkart Only)
        live_feed = get_live_deals_feed()
        # Filter strictly for Amazon & Flipkart
        featured_deals = [
            d for d in live_feed.get("deals", [])
            if d.get("merchant", "").lower() in ["amazon", "flipkart"]
        ][:12]

        price_drops = [d for d in featured_deals if d.get("deal_type") in ["steep_drop", "all_time_low"]][:6]
        popular_products = featured_deals[:6]

    return {
        "featured_setups": featured_setups,
        "product_categories": product_categories,
        "featured_deals": featured_deals,
        "price_drops": price_drops,
        "popular_products": popular_products,
        "supported_merchants": supported_merchants,
        "stats": stats_data,
    }


DEAL_COUNTS_MAP = {
    "electronics": 24156,
    "home-living": 18974,
    "fashion": 32541,
    "beauty-personal-care": 12675,
    "sports-fitness": 8562,
    "automotive": 6843,
    "baby-kids": 7952,
    "books-stationery": 5378,
    "grocery-essentials": 9214,
    "health-nutrition": 6207,
    "toys-games": 8119,
    "pet-supplies": 5089,
    "office-supplies": 4392,
    "musical-instruments": 3246,
    "travel-luggage": 6721,
}


@app.get("/api/categories")
def get_categories_tree():
    """Returns the full hierarchical category taxonomy with subcategories, images, and deal counts."""
    with get_session() as session:
        all_cats = session.exec(select(Category).where(Category.is_active == True)).all()
        root_cats = [c for c in all_cats if c.parent_id is None]
        if not root_cats:
            # Fallback if DB not seeded
            from backend.data.seed_taxonomy import seed_taxonomy
            seed_taxonomy()
            all_cats = session.exec(select(Category).where(Category.is_active == True)).all()
            root_cats = [c for c in all_cats if c.parent_id is None]

        root_cats.sort(key=lambda c: c.display_order or 0)
        result = []
        for rc in root_cats:
            children = [
                {
                    "id": cc.id,
                    "name": cc.name,
                    "slug": cc.slug,
                    "parent_slug": rc.slug,
                    "url": f"/categories/{rc.slug}/{cc.slug}",
                }
                for cc in all_cats
                if cc.parent_id == rc.id
            ]
            children.sort(key=lambda c: next((cc.display_order for cc in all_cats if cc.id == c["id"]), 0))

            # Live DB count if products linked, otherwise fallback to development seed counts
            product_count = len(rc.products) if rc.products else 0
            deal_count = product_count if product_count > 0 else DEAL_COUNTS_MAP.get(rc.slug, 5000)

            result.append({
                "id": rc.id,
                "name": rc.name,
                "slug": rc.slug,
                "icon": rc.icon or "🏷️",
                "image": rc.image or f"/assets/categories/{rc.slug}.png",
                "description": rc.description,
                "display_order": rc.display_order,
                "deal_count": deal_count,
                "url": f"/categories/{rc.slug}",
                "subcategories": children,
                "children": children,
            })
        return result


@app.get("/api/categories/popular")
def get_popular_categories():
    """Returns popular search terms for the categories page hero chips."""
    return {
        "popular": [
            "Air Fryer",
            "Smart Watch",
            "iPhone 15",
            "Gaming Laptop",
            "TV 55 inch",
            "Shoes",
            "Refrigerator",
        ]
    }


@app.get("/api/categories/search")
def search_categories(q: str = ""):
    """Client-facing category search endpoint. Returns matching categories and subcategories."""
    if not q or len(q.strip()) < 2:
        return {"results": []}
    all_cats = get_categories_tree()
    results = []
    ql = q.strip().lower()
    for cat in all_cats:
        cat_match = ql in cat["name"].lower() or ql in cat["slug"].lower()
        if cat_match:
            results.append({
                "name": cat["name"],
                "slug": cat["slug"],
                "icon": cat.get("icon", "🏷️"),
                "image": cat.get("image", ""),
                "type": "category",
                "url": f"/categories/{cat['slug']}",
            })
        for sub in cat.get("subcategories", []):
            if ql in sub["name"].lower() or ql in sub["slug"].lower():
                results.append({
                    "name": sub["name"],
                    "slug": sub["slug"],
                    "icon": cat.get("icon", "🏷️"),
                    "type": "subcategory",
                    "parent_name": cat["name"],
                    "parent_slug": cat["slug"],
                    "url": f"/categories/{cat['slug']}/{sub['slug']}",
                })
    return {"results": results[:20]}


@app.get("/api/categories/{slug}")
def get_category_by_slug(slug: str):
    """Returns details for a single category or subcategory by slug."""
    with get_session() as session:
        cat = session.exec(select(Category).where(Category.slug == slug)).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        children = session.exec(select(Category).where(Category.parent_id == cat.id).order_by(Category.display_order)).all()
        parent = session.get(Category, cat.parent_id) if cat.parent_id else None
        deal_count = DEAL_COUNTS_MAP.get(cat.slug, 1200)

        return {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "icon": cat.icon,
            "image": cat.image or f"/assets/categories/{cat.slug}.png",
            "description": cat.description,
            "display_order": cat.display_order,
            "deal_count": deal_count,
            "parent": {"id": parent.id, "name": parent.name, "slug": parent.slug} if parent else None,
            "subcategories": [
                {
                    "id": c.id,
                    "name": c.name,
                    "slug": c.slug,
                    "url": f"/categories/{cat.slug}/{c.slug}" if not parent else f"/categories/{parent.slug}/{c.slug}",
                }
                for c in children
            ],
        }


@app.get("/api/setups")
def list_setups():
    """Lists setup spaces and pre-configured templates."""
    with get_session() as session:
        sc_list = session.exec(select(SetupCategory)).all()
        return [
            {
                "id": sc.id,
                "name": sc.name,
                "slug": sc.slug,
                "domain_group": sc.domain_group,
                "budget_start": sc.budget_start,
                "image_url": sc.image_url,
                "setups_count": len(sc.setups),
            }
            for sc in sc_list
        ]



@app.post("/api/check-deal")
def check_deal(req: CheckDealRequest):
    """
    Submits an Amazon or Flipkart URL to:
    1. Resolve & normalize URL
    2. Extract live price and MRP
    3. Persist product and price observation
    4. Compute deal verdict and evidence
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        result = ingest_and_evaluate(req.url, force_refresh=req.force_refresh)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to analyze deal: {str(err)}")


@app.post("/api/analyze")
def analyze_product_endpoint(req: AnalyzeProductRequest):
    """
    DealSense Phase 1 Product Intelligence Endpoint.
    Executes explainable vertical slice:
    URL -> Merchant -> Product -> Variant -> Real Price -> History -> Explainable Verdict -> Outbound Route.
    """
    from backend.services.analysis_service import analyze_product_url

    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        result = analyze_product_url(req.url, force_refresh=req.force_refresh)
        if result.get("status") == "INVALID_URL":
            raise HTTPException(status_code=400, detail=result.get("message"))
        return result
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Failed to analyze product: {str(err)}")


@app.get("/api/products")
def list_products(limit: int = 20):
    """Lists tracked canonical products and their latest verified prices."""
    with get_session() as session:
        products = session.exec(select(Product).limit(limit)).all()
        results = []
        for p in products:
            listing = session.exec(
                select(MerchantListing).where(MerchantListing.product_id == p.id)
            ).first()
            last_obs = None
            if listing:
                last_obs = session.exec(
                    select(PriceObservation)
                    .where(PriceObservation.listing_id == listing.id)
                    .order_by(PriceObservation.observed_at.desc())
                ).first()

            results.append(
                {
                    "id": p.id,
                    "title": p.canonical_title,
                    "brand": p.brand,
                    "image_url": p.image_url,
                    "merchant": listing.merchant if listing else None,
                    "price": last_obs.price if last_obs else None,
                    "mrp": last_obs.mrp if last_obs else None,
                    "last_checked": last_obs.observed_at.isoformat() if last_obs else None,
                }
            )
        return results


@app.get("/api/search")
def omni_search(q: str = "", limit: int = 8):
    """
    Unified Omni-Search endpoint for keyword searches (e.g. 'air fryer', 'boat').
    Searches local SQLite database and live Indian merchant catalog deals.
    """
    if not q or len(q.strip()) < 2:
        return {"query": q, "count": 0, "results": []}
    results = search_catalog(q, limit=limit)
    return {"query": q, "count": len(results), "results": results}


@app.post("/api/setup-builder")
def create_setup(req: SetupRequest):
    """
    Composes a complete, aesthetically coordinated room or desk setup
    tailored to budget, style, and filtering out already-owned items.
    """
    return build_smart_setup(
        space=req.space,
        budget=req.budget,
        owned_items=req.owned_items,
        style=req.style,
    )


@app.get("/api/history/{listing_id}")
def get_price_history(listing_id: int):
    """Returns the full price history timeseries for a given merchant listing."""
    from backend.services.price_service import get_historical_price_summary

    with get_session() as session:
        listing = session.get(MerchantListing, listing_id)
        if not listing:
            raise HTTPException(status_code=404, detail="Listing not found")

        observations = session.exec(
            select(PriceObservation)
            .where(PriceObservation.listing_id == listing_id)
            .order_by(PriceObservation.observed_at.asc())
        ).all()

        cur_price = float(getattr(listing, "current_price", None) or getattr(listing, "price", None) or 0)
        if not cur_price and observations:
            cur_price = float(observations[-1].price or 0)

        current_mrp = float(observations[-1].mrp) if observations and observations[-1].mrp else None

        summary = get_historical_price_summary(
            session=session,
            listing_id=listing_id,
            current_price=cur_price,
            current_mrp=current_mrp,
        )

        if summary.has_sufficient_history:
            history_pts = summary.history_points
            lowest_price = summary.lowest_price
            highest_price = summary.highest_price
            avg_price = summary.average_price
            lowest_obs = next((o for o in observations if o.price == lowest_price), None)
            lowest_date = lowest_obs.observed_at.strftime("%d %b %Y") if lowest_obs and lowest_obs.observed_at else None
            drops_count = sum(1 for i in range(1, len(observations)) if observations[i].price < observations[i-1].price)
            has_sufficient = True
            confidence = summary.confidence
        else:
            history_pts = []
            lowest_price = None
            lowest_date = None
            avg_price = None
            highest_price = None
            drops_count = 0
            has_sufficient = False
            confidence = "LOW"

        return {
            "listing_id": listing.id,
            "merchant": listing.merchant,
            "merchant_product_id": listing.merchant_product_id,
            "clean_url": listing.clean_url,
            "lowest_price": lowest_price,
            "lowest_date": lowest_date,
            "average_price": avg_price,
            "highest_price": highest_price,
            "price_drops_count": drops_count,
            "has_sufficient_history": has_sufficient,
            "confidence": confidence,
            "history": history_pts,
        }


@app.get("/api/history/compare/{primary_id}/{rival_id}")
def get_compare_history(primary_id: int, rival_id: int = 0, rival_price: Optional[float] = None):
    """
    Unified dual-store price history payload for the merged Price History & Compare card.
    Fetches both Amazon and Flipkart histories in a single call, computes combined
    statistics, and returns store-colored series ready for the dual-line chart.
    """
    from backend.services.price_service import get_historical_price_summary

    now = datetime.now(timezone.utc)

    # Auto-resolve sibling listing if rival_id wasn't explicitly supplied
    if not rival_id:
        with get_session() as session:
            primary_rec = session.get(MerchantListing, primary_id)
            if primary_rec and primary_rec.product_id:
                sibling = session.exec(
                    select(MerchantListing).where(
                        MerchantListing.product_id == primary_rec.product_id,
                        MerchantListing.id != primary_id,
                        MerchantListing.active == True,
                    )
                ).first()
                if sibling:
                    rival_id = sibling.id

    def _series(listing_id: int, fallback_merchant: str):
        with get_session() as session:
            listing = session.get(MerchantListing, listing_id)
            if not listing:
                return {
                    "matched": False,
                    "merchant": fallback_merchant,
                    "price": None,
                    "in_stock": None,
                    "history": [],
                    "observation_count": 0,
                    "lowest_price": None,
                    "highest_price": None,
                    "average_price": None,
                    "median_price": None,
                    "first_observed_at": None,
                    "last_observed_at": None,
                    "has_sufficient_history": False,
                    "confidence": "LOW",
                }
            observations = session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == listing_id)
                .order_by(PriceObservation.observed_at.asc())
            ).all()

            cur_price = float(getattr(listing, "current_price", None) or getattr(listing, "price", None) or 0)
            if not cur_price and observations:
                cur_price = float(observations[-1].price or 0)

            mrp_val = float(observations[-1].mrp) if observations and observations[-1].mrp else None

            summary = get_historical_price_summary(
                session=session,
                listing_id=listing_id,
                current_price=cur_price,
                current_mrp=mrp_val,
            )

            if summary.has_sufficient_history:
                history_pts = summary.history_points
                low_p = summary.lowest_price
                high_p = summary.highest_price
                avg_p = summary.average_price
                med_p = summary.median_price
                low_obs = next((o for o in observations if o.price == low_p), None)
                low_date = low_obs.observed_at.strftime("%d %b %Y") if low_obs and low_obs.observed_at else None
                first_obs = summary.first_observed_at.isoformat() if summary.first_observed_at else None
                last_obs = summary.last_observed_at.isoformat() if summary.last_observed_at else None
                has_suff = True
                conf = summary.confidence
            else:
                history_pts = []
                low_p = None
                high_p = None
                avg_p = None
                med_p = None
                low_date = None
                first_obs = None
                last_obs = None
                has_suff = False
                conf = "LOW"

            return {
                "matched": True,
                "listing_id": listing.id,
                "merchant": listing.merchant,
                "price": cur_price if cur_price > 0 else None,
                "in_stock": getattr(listing, "availability", "in_stock") == "in_stock",
                "delivery_fee": float(getattr(listing, "delivery_fee", 0) or 0),
                "rating": getattr(listing, "rating", None),
                "ratings_count": getattr(listing, "ratings_count", None),
                "url": listing.clean_url or listing.url,
                "history": history_pts,
                "observation_count": len(history_pts),
                "lowest_price": low_p,
                "lowest_date": low_date,
                "highest_price": high_p,
                "average_price": avg_p,
                "median_price": med_p,
                "first_observed_at": first_obs,
                "last_observed_at": last_obs,
                "has_sufficient_history": has_suff,
                "confidence": conf,
            }

    primary = _series(primary_id, "Amazon")
    rival_merchant = "Flipkart" if primary["merchant"].lower().startswith("amazon") else "Amazon"

    if rival_id:
        rival = _series(rival_id, rival_merchant)
    elif rival_price and rival_price > 0:
        rival = {
            "matched": True,
            "listing_id": None,
            "merchant": rival_merchant,
            "price": rival_price,
            "in_stock": True,
            "delivery_fee": 0.0,
            "rating": None,
            "ratings_count": None,
            "url": None,
            "history": [],
            "observation_count": 0,
            "lowest_price": None,
            "lowest_date": None,
            "highest_price": None,
            "average_price": None,
            "median_price": None,
            "first_observed_at": None,
            "last_observed_at": None,
            "has_sufficient_history": False,
            "confidence": "LOW",
        }
    else:
        rival = {
            "matched": False,
            "merchant": rival_merchant,
            "price": None,
            "in_stock": None,
            "history": [],
            "observation_count": 0,
            "lowest_price": None,
            "highest_price": None,
            "average_price": None,
            "median_price": None,
            "first_observed_at": None,
            "last_observed_at": None,
            "has_sufficient_history": False,
            "confidence": "LOW",
        }

    # Combined stats across both stores for the shared stat tiles
    all_prices = [s["price"] for s in (primary, rival) if s.get("matched") and s.get("price")]
    all_lows = [s["lowest_price"] for s in (primary, rival) if s.get("matched") and s.get("lowest_price")]
    all_highs = [s["highest_price"] for s in (primary, rival) if s.get("matched") and s.get("highest_price")]

    combined_low = min(all_lows) if all_lows else None
    combined_high = max(all_highs) if all_highs else None
    combined_avg = round(sum(all_prices) / len(all_prices), 2) if all_prices else None

    lowest_store = None
    if rival.get("matched") and rival.get("lowest_price") and primary.get("lowest_price"):
        lowest_store = rival["merchant"] if rival["lowest_price"] < primary["lowest_price"] else primary["merchant"]
    elif primary.get("lowest_price"):
        lowest_store = primary["merchant"]
    elif rival.get("lowest_price"):
        lowest_store = rival["merchant"]

    # Drops count: count genuine drops in primary + rival history
    drops_count = 0
    for s in (primary, rival):
        h = s.get("history", [])
        if len(h) >= 2:
            drops_count += sum(1 for i in range(1, len(h)) if h[i]["price"] < h[i-1]["price"])

    return {
        "primary": primary,
        "rival": rival,
        "combined": {
            "lowest_price": combined_low,
            "lowest_date": primary.get("lowest_date"),
            "lowest_store": lowest_store,
            "highest_price": combined_high,
            "average_price": combined_avg,
            "price_drops_count": drops_count,
            "price_difference": round(abs((primary.get("price") or 0) - (rival.get("price") or 0)), 2)
                if primary.get("price") and rival.get("price") else None,
        },
    }


class PriceAlertRequest(BaseModel):
    product_id: Optional[int] = None
    product_title: str
    target_price: float
    current_price: float
    channel: str = "whatsapp"  # "whatsapp" or "email"
    contact: str


@app.post("/api/alerts")
def create_price_alert(req: PriceAlertRequest):
    """
    Registers a price drop alert for WhatsApp or Email.
    Saves the target price trigger to SQLite and schedules monitoring.
    """
    contact_clean = req.contact.strip()
    if not contact_clean:
        raise HTTPException(status_code=400, detail="Phone number or email is required")

    with get_session() as session:
        alert = PriceAlert(
            product_id=req.product_id,
            product_title=req.product_title,
            target_price=req.target_price,
            current_price=req.current_price,
            channel=req.channel.lower(),
            contact=contact_clean,
            is_active=True,
        )
        session.add(alert)
        session.commit()
        session.refresh(alert)

        channel_display = "WhatsApp" if req.channel.lower() == "whatsapp" else "Email"
        msg = (
            f"Price drop alert set for ₹{round(req.target_price):,}! "
            f"We'll ping you on {channel_display} ({contact_clean}) the moment the price drops."
        )
        return {
            "success": True,
            "alert_id": alert.id,
            "message": msg,
            "channel": alert.channel,
            "target_price": alert.target_price,
            "contact": alert.contact,
        }


@app.get("/api/alerts")
def list_active_alerts():
    """Returns active price drop alerts for debugging and monitoring."""
    with get_session() as session:
        alerts = session.exec(select(PriceAlert).where(PriceAlert.is_active == True)).all()
        return [
            {
                "id": a.id,
                "product_id": a.product_id,
                "product_title": a.product_title,
                "target_price": a.target_price,
                "current_price": a.current_price,
                "channel": a.channel,
                "contact": a.contact,
                "created_at": a.created_at.isoformat(),
            }
            for a in alerts
        ]


@app.delete("/api/alerts/{alert_id}")
def delete_price_alert(alert_id: int):
    """Deletes or deactivates a price drop alert by ID."""
    with get_session() as session:
        alert = session.get(PriceAlert, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        session.delete(alert)
        session.commit()
        return {"success": True, "message": "Alert deleted successfully", "deleted_id": alert_id}


@app.get("/api/deals/live")
def get_live_deals(category: Optional[str] = None, deal_type: Optional[str] = None):
    """
    Returns verified live deals crawled from Amazon India & Flipkart.
    Supports filtering by category and deal type (all_time_low, steep_drop, card_stack, setups).
    """
    return get_live_deals_feed(category=category, deal_type=deal_type)


@app.get("/api/deals/status")
def get_deals_pipeline_status():
    """
    Returns runtime operational status of the live deals scraping pipeline.
    """
    from backend.services.deal_pipeline import get_pipeline_status
    return get_pipeline_status()


@app.post("/api/deals/refresh")
def trigger_deals_refresh(background: bool = False):
    """
    Refreshes in-memory deals cache from verified database records.
    (Unofficial web scraping crawl has been removed).
    """
    return refresh_deals_feed()


# Mount static frontend application
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

# ── Explicit page routes (must be registered BEFORE the static catch-all) ──
@app.get("/deals", response_class=FileResponse, include_in_schema=False)
async def deals_page():
    """Serves the standalone All Deals page."""
    return FileResponse(str(FRONTEND_DIR / "deals.html"), media_type="text/html")


@app.get("/categories", response_class=FileResponse, include_in_schema=False)
async def categories_page():
    """Serves the standalone All Product Categories page."""
    return FileResponse(str(FRONTEND_DIR / "categories.html"), media_type="text/html")


@app.get("/categories/{rest_of_path:path}", response_class=FileResponse, include_in_schema=False)
async def categories_sub_page(rest_of_path: str):
    """
    Catch-all for future category sub-pages (e.g. /categories/electronics).
    For now, serves categories.html. Replace with dynamic templates later.
    """
    return FileResponse(str(FRONTEND_DIR / "categories.html"), media_type="text/html")


# ── Static files (catch-all — must be last) ──────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

