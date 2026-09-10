"""
Tests for DealSense Phase 4.1: Product Universe Engine.

Covers:
- Canonical Product Discovery Events (USER_URL, USER_SEARCH, PRODUCT_VIEW, COMPARE, AUTONOMOUS_DISCOVERY)
- 15-minute sliding-window event deduplication
- Deterministic Priority Scoring (HOT, ACTIVE, NORMAL, COLD)
- Product -> MerchantListing priority propagation and worker scheduling
- Derived product metrics (zero unmaintainable denormalized counters)
- Global Product Universe telemetry
- API endpoints (/api/discover, /api/products/{id}, /api/products/{id}/view, /api/products/{id}/compare, /api/universe/stats)
- Universe-driven search integration without synthetic fallbacks
"""

from datetime import datetime, timezone, timedelta
import pytest
from sqlmodel import Session, select
from fastapi.testclient import TestClient

from backend.database import init_db, get_session
from backend.models import (
    Product,
    MerchantListing,
    PriceObservation,
    PriceAlert,
    ProductDiscoveryEvent,
)
from backend.services.universe_service import (
    record_discovery_event,
    calculate_product_priority,
    propagate_product_priority,
    get_product_metrics,
    get_universe_statistics,
    HOT_THRESHOLD,
    ACTIVE_THRESHOLD,
    NORMAL_THRESHOLD,
)
from backend.search import search_catalog
from backend.main import app


@pytest.fixture(autouse=True)
def setup_db():
    """Ensures DB is initialized before tests."""
    init_db()


@pytest.fixture(name="db_session")
def fixture_db_session():
    with get_session() as session:
        yield session


@pytest.fixture(name="client")
def fixture_client():
    with TestClient(app) as test_client:
        yield test_client


# ==============================================================================
# 1. DISCOVERY EVENT & DEDUPLICATION TESTS
# ==============================================================================

def test_record_discovery_event_success(db_session: Session):
    product = Product(
        canonical_title=f"Sony WH-1000XM5 {datetime.now().timestamp()}",
        brand="Sony",
        lifecycle_status="DISCOVERED",
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    event = record_discovery_event(
        session=db_session,
        product_id=product.id,
        source="USER_URL",
    )
    db_session.commit()

    assert event is not None
    assert event.product_id == product.id
    assert event.source == "USER_URL"

    # Verify discovery score increased and last_interacted_at updated
    db_session.refresh(product)
    assert product.discovery_score >= 1.0
    assert product.last_interacted_at is not None


def test_discovery_event_deduplication_within_window(db_session: Session):
    product = Product(
        canonical_title=f"Apple iPad Air {datetime.now().timestamp()}",
        brand="Apple",
        lifecycle_status="DISCOVERED",
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    # First event recorded
    ev1 = record_discovery_event(
        session=db_session,
        product_id=product.id,
        source="PRODUCT_VIEW",
    )
    db_session.commit()
    assert ev1 is not None

    # Immediate second event with same product & source should be deduplicated (zero fingerprinting)
    ev2 = record_discovery_event(
        session=db_session,
        product_id=product.id,
        source="PRODUCT_VIEW",
    )
    assert ev2 is None

    # Different source (COMPARE) is NOT deduplicated
    ev3 = record_discovery_event(
        session=db_session,
        product_id=product.id,
        source="COMPARE",
    )
    assert ev3 is not None


# ==============================================================================
# 2. DETERMINISTIC PRIORITY SCORING TESTS
# ==============================================================================

def test_priority_cold_for_uninteracted_product(db_session: Session):
    old_time = datetime.now(timezone.utc) - timedelta(days=40)
    product = Product(
        canonical_title=f"Vintage Walkman {datetime.now().timestamp()}",
        brand="Sony",
        lifecycle_status="COLD",
        created_at=old_time,
        last_interacted_at=old_time,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    result = calculate_product_priority(db_session, product.id)
    assert result["priority"] == "COLD"
    assert result["score"] < NORMAL_THRESHOLD


def test_priority_hot_with_active_alert_and_recent_view(db_session: Session):
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"PlayStation 5 Slim {datetime.now().timestamp()}",
        brand="Sony",
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"B0CL5_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/B0CL5KNB9M",
        clean_url="https://www.amazon.in/dp/B0CL5KNB9M",
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Add active alert (+50)
    alert = PriceAlert(
        product_id=product.id,
        listing_id=listing.id,
        product_title=product.canonical_title,
        alert_type="TARGET_PRICE",
        target_price=45000.0,
        current_price=49999.0,
        contact="test_user@example.com",
        status="ACTIVE",
    )
    db_session.add(alert)

    # Add recent discovery event
    ev = ProductDiscoveryEvent(
        product_id=product.id,
        source="PRODUCT_VIEW",
        session_id="sess_ps5",
        created_at=now,
    )
    db_session.add(ev)
    db_session.commit()

    result = calculate_product_priority(db_session, product.id)
    assert result["priority"] == "HOT"
    assert result["score"] >= HOT_THRESHOLD
    assert result["breakdown"]["active_alert"] == 50.0
    assert result["breakdown"]["recent_interaction"] == 30.0


def test_priority_with_price_volatility(db_session: Session):
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"boAt Rockerz {datetime.now().timestamp()}",
        brand="boAt",
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"B07PR1_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/B07PR1CL3S",
        clean_url="https://www.amazon.in/dp/B07PR1CL3S",
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Add volatile observations (min 1000, max 2000 -> 100% swing)
    db_session.add(PriceObservation(listing_id=listing.id, price=1000.0, observed_at=now - timedelta(days=2)))
    db_session.add(PriceObservation(listing_id=listing.id, price=2000.0, observed_at=now - timedelta(days=1)))
    db_session.commit()

    result = calculate_product_priority(db_session, product.id)
    assert result["breakdown"]["price_volatility"] == 25.0


def test_rating_does_not_influence_observation_priority(db_session: Session):
    """Hardening Rule 1: Rating must NOT influence crawl frequency or observation priority."""
    now = datetime.now(timezone.utc)
    p_no_rating = Product(
        canonical_title=f"Headphones No Rating {datetime.now().timestamp()}",
        brand="BrandA",
        rating=None,
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    p_high_rating = Product(
        canonical_title=f"Headphones 5 Star {datetime.now().timestamp()}",
        brand="BrandA",
        rating=5.0,
        ratings_count="50,000",
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    db_session.add_all([p_no_rating, p_high_rating])
    db_session.commit()

    score_unrated = calculate_product_priority(db_session, p_no_rating.id)
    score_rated = calculate_product_priority(db_session, p_high_rating.id)

    # Both must have the identical priority score and breakdown (rating is ignored)
    assert score_unrated["score"] == score_rated["score"]
    assert "social_proof" not in score_rated["breakdown"]



# ==============================================================================
# 3. PRIORITY PROPAGATION & WORKER SCHEDULING
# ==============================================================================

def test_propagate_product_priority_updates_listings(db_session: Session):
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"Kindle Paperwhite {datetime.now().timestamp()}",
        brand="Amazon",
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"B08N3_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/B08N3TCP2F",
        clean_url="https://www.amazon.in/dp/B08N3TCP2F",
        priority="COLD",
        next_check_at=now + timedelta(hours=24),
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Add active alert to elevate product priority to HOT
    alert = PriceAlert(
        product_id=product.id,
        listing_id=listing.id,
        product_title=product.canonical_title,
        alert_type="PERCENT_DROP",
        drop_percentage=10.0,
        target_price=9000.0,
        current_price=10000.0,
        contact="test_user@example.com",
        status="ACTIVE",
    )
    db_session.add(alert)
    db_session.commit()

    res = propagate_product_priority(db_session, product.id)
    assert res["priority"] == "HOT"

    db_session.refresh(listing)
    assert listing.priority == "HOT"
    # Worker woke up: next_check_at was reset to immediate / <= now
    next_chk = listing.next_check_at
    if next_chk and next_chk.tzinfo is None:
        next_chk = next_chk.replace(tzinfo=timezone.utc)
    assert next_chk <= datetime.now(timezone.utc) + timedelta(seconds=2)


def test_multi_merchant_listing_oos_does_not_make_product_cold(db_session: Session):
    """Hardening Rule 2: If Amazon OOS and Flipkart IN STOCK, do NOT make Product COLD. Only Amazon is capped at COLD."""
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"Multi Store Product {datetime.now().timestamp()}",
        brand="BrandM",
        lifecycle_status="ACTIVE",
        last_interacted_at=now,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    # Amazon listing is Out of Stock
    amazon_listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"AMZ_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/AMZOOS",
        clean_url="https://www.amazon.in/dp/AMZOOS",
        availability="out_of_stock",
    )
    # Flipkart listing is In Stock
    flipkart_listing = MerchantListing(
        product_id=product.id,
        merchant="flipkart",
        merchant_product_id=f"FLP_{int(datetime.now().timestamp()*1000)}",
        url="https://www.flipkart.com/p/FLPIN",
        clean_url="https://www.flipkart.com/p/FLPIN",
        availability="in_stock",
    )
    db_session.add_all([amazon_listing, flipkart_listing])
    db_session.commit()

    # Priority calculation
    result = calculate_product_priority(db_session, product.id)
    assert result["priority"] != "COLD"

    # Priority propagation
    propagate_product_priority(db_session, product.id)
    db_session.refresh(product)
    db_session.refresh(amazon_listing)
    db_session.refresh(flipkart_listing)

    # Product remains ACTIVE/NORMAL (not COLD)
    assert product.lifecycle_status in ("ACTIVE", "NORMAL")
    # Amazon listing is capped at COLD
    assert amazon_listing.priority == "COLD"
    # Flipkart listing receives the real product tier
    assert flipkart_listing.priority in ("HOT", "ACTIVE", "NORMAL")
    assert flipkart_listing.priority != "COLD"


def test_archived_lifecycle_status_is_protected(db_session: Session):
    """Hardening Rule 3: ARCHIVED lifecycle status is never automatically overwritten."""
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"Discontinued Gizmo {datetime.now().timestamp()}",
        brand="BrandX",
        lifecycle_status="ARCHIVED",
        last_interacted_at=now,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"ARC_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/ARCHIVED",
        clean_url="https://www.amazon.in/dp/ARCHIVED",
        availability="in_stock",
    )
    db_session.add(listing)
    db_session.commit()

    # Even if priority evaluates high (e.g. HOT with alert), lifecycle remains ARCHIVED
    alert = PriceAlert(
        product_id=product.id,
        listing_id=listing.id,
        product_title=product.canonical_title,
        alert_type="TARGET_PRICE",
        target_price=100.0,
        current_price=200.0,
        contact="user@test.com",
        status="ACTIVE",
    )
    db_session.add(alert)
    db_session.commit()

    propagate_product_priority(db_session, product.id)
    db_session.refresh(product)
    assert product.lifecycle_status == "ARCHIVED"


# ==============================================================================
# 4. DERIVED PRODUCT METRICS
# ==============================================================================

def test_get_product_metrics(db_session: Session):
    now = datetime.now(timezone.utc)
    product = Product(
        canonical_title=f"Logitech MX Master {datetime.now().timestamp()}",
        brand="Logitech",
        lifecycle_status="ACTIVE",
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    listing = MerchantListing(
        product_id=product.id,
        merchant="amazon",
        merchant_product_id=f"B0B11_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/B0B11DRWBZ",
        clean_url="https://www.amazon.in/dp/B0B11DRWBZ",
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    # Add 2 views, 1 search, 1 URL discovery
    db_session.add(ProductDiscoveryEvent(product_id=product.id, source="USER_URL", created_at=now))
    db_session.add(ProductDiscoveryEvent(product_id=product.id, source="PRODUCT_VIEW", session_id="s1", created_at=now))
    db_session.add(ProductDiscoveryEvent(product_id=product.id, source="PRODUCT_VIEW", session_id="s2", created_at=now))
    db_session.add(ProductDiscoveryEvent(product_id=product.id, source="USER_SEARCH", created_at=now))

    # Add 2 observations
    db_session.add(PriceObservation(listing_id=listing.id, price=8995.0, observed_at=now - timedelta(days=1)))
    db_session.add(PriceObservation(listing_id=listing.id, price=7995.0, observed_at=now))

    db_session.commit()

    metrics = get_product_metrics(db_session, product.id)
    assert metrics["discovery_count"] == 4
    assert metrics["view_count"] == 2
    assert metrics["search_count"] == 1
    assert metrics["min_price"] == 7995.0
    assert metrics["max_price"] == 8995.0
    assert metrics["price_observations_count"] == 2


# ==============================================================================
# 5. GLOBAL UNIVERSE TELEMETRY
# ==============================================================================

def test_get_universe_statistics(db_session: Session):
    p1 = Product(canonical_title=f"Univ P1 {datetime.now().timestamp()}", brand="B1", lifecycle_status="OBSERVING")
    p2 = Product(canonical_title=f"Univ P2 {datetime.now().timestamp()}", brand="B2", lifecycle_status="COLD")
    db_session.add_all([p1, p2])
    db_session.commit()
    db_session.refresh(p1)
    db_session.refresh(p2)

    db_session.add(ProductDiscoveryEvent(product_id=p1.id, source="USER_URL"))
    db_session.add(ProductDiscoveryEvent(product_id=p1.id, source="USER_SEARCH"))
    db_session.commit()

    stats = get_universe_statistics(db_session)
    assert stats["total_products"] >= 2
    assert "OBSERVING" in stats["lifecycle_breakdown"]
    assert "COLD" in stats["lifecycle_breakdown"]
    assert stats["total_discovery_events"] >= 2
    assert "USER_URL" in stats["events_by_source"]
    assert "USER_SEARCH" in stats["events_by_source"]


# ==============================================================================
# 6. UNIVERSE API ENDPOINTS
# ==============================================================================

def test_api_products_list_and_detail(client: TestClient, db_session: Session):
    product = Product(
        canonical_title=f"Samsung Galaxy S24 Ultra {datetime.now().timestamp()}",
        brand="Samsung",
        category="Smartphones",
        lifecycle_status="ACTIVE",
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)

    # GET /api/products
    res = client.get("/api/products?limit=100")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    found = [i for i in items if i["id"] == product.id][0]
    assert found["title"] == product.canonical_title
    assert found["lifecycle_status"] == "ACTIVE"

    # GET /api/products/{id}
    res_detail = client.get(f"/api/products/{product.id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == product.id
    assert "priority" in detail
    assert "metrics" in detail
    assert "listings" in detail


def test_api_product_view_and_compare(client: TestClient, db_session: Session):
    p1 = Product(canonical_title=f"iPhone 15 Pro {datetime.now().timestamp()}", brand="Apple", lifecycle_status="ACTIVE")
    p2 = Product(canonical_title=f"Pixel 8 Pro {datetime.now().timestamp()}", brand="Google", lifecycle_status="ACTIVE")
    db_session.add_all([p1, p2])
    db_session.commit()
    db_session.refresh(p1)
    db_session.refresh(p2)

    sess_id = f"test_sess_{int(datetime.now().timestamp()*1000)}"

    # POST /api/products/{id}/view
    res_view = client.post(
        f"/api/products/{p1.id}/view",
        json={"session_id": sess_id, "source": "PRODUCT_VIEW"},
    )
    assert res_view.status_code == 200
    assert res_view.json()["recorded"] is True

    # Immediate duplicate view deduplicated
    res_view_dup = client.post(
        f"/api/products/{p1.id}/view",
        json={"session_id": sess_id, "source": "PRODUCT_VIEW"},
    )
    assert res_view_dup.status_code == 200
    assert res_view_dup.json()["recorded"] is False

    # POST /api/products/{id}/compare
    res_comp = client.post(
        f"/api/products/{p1.id}/compare",
        json={"rival_id": p2.id, "session_id": sess_id},
    )
    assert res_comp.status_code == 200
    assert res_comp.json()["success"] is True


def test_api_universe_stats(client: TestClient, db_session: Session):
    res = client.get("/api/universe/stats")
    assert res.status_code == 200
    data = res.json()
    assert "total_products" in data
    assert "lifecycle_breakdown" in data
    assert "priority_breakdown" in data
    assert "events_by_source" in data


# ==============================================================================
# 7. UNIVERSE SEARCH INTEGRATION (ZERO FAKE FALLBACKS)
# ==============================================================================

def test_search_catalog_emits_universe_events(db_session: Session):
    token = f"SearchUnique{int(datetime.now().timestamp()*1000)}"
    p = Product(
        canonical_title=f"OnePlus Nord Special {token}",
        brand="OnePlus",
        category="Smartphones",
        lifecycle_status="ACTIVE",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    listing = MerchantListing(
        product_id=p.id,
        merchant="amazon",
        merchant_product_id=f"B0CX2_{int(datetime.now().timestamp()*1000)}",
        url="https://www.amazon.in/dp/B0CX21C8S9",
        clean_url="https://www.amazon.in/dp/B0CX21C8S9",
    )
    db_session.add(listing)
    db_session.commit()
    db_session.refresh(listing)

    db_session.add(PriceObservation(listing_id=listing.id, price=24999.0, observed_at=datetime.now(timezone.utc)))
    db_session.commit()

    # Search with unique token
    results = search_catalog(token, limit=5, session=db_session)
    assert len(results) >= 1
    match = [r for r in results if r["id"] == p.id][0]
    assert match["title"] == f"OnePlus Nord Special {token}"
    assert match["price"] == 24999.0

    # Verify USER_SEARCH event was recorded in universe
    events = db_session.exec(
        select(ProductDiscoveryEvent).where(
            ProductDiscoveryEvent.product_id == p.id,
            ProductDiscoveryEvent.source == "USER_SEARCH",
        )
    ).all()
    assert len(events) >= 1
    assert events[0].query_text == token
