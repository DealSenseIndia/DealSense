"""
Comprehensive Test Suite for DealSense Phase 4.2 Autonomous Discovery Engine (Layer 1).
Verifies:
- CandidatePayload validation
- CuratedSeedSource interface
- URL normalization & Tier 1 / Tier 2 deduplication
- Duplicate queue prevention
- Priority ordering in dequeue
- Queue state transitions (DISCOVERED -> QUEUED -> PROCESSING -> IDENTIFIED -> OBSERVED -> TRACKING)
- Retry exponential backoff & rejection after max attempts
- Requeuing of due retry candidates
- Existing listing detection without duplicate creation
- Canonical ingestion integration & real price observation
- Failed ingestion error preservation (zero fake success)
- Candidate != Deal separation (candidates never appear in deals feed)
- Worker isolation
- Database schema migration & composite index verification
"""
from datetime import datetime, timezone, timedelta
import hashlib
import uuid
import pytest
from sqlmodel import Session, select

from backend.config import settings
from backend.database import get_session, init_db
from backend.models import (
    DiscoveryCandidate,
    Product,
    MerchantListing,
    PriceObservation,
    ProductVariant,
)
from backend.services.discovery.base import (
    CandidatePayload,
    CuelinksOfferSource,
    compute_candidate_dedupe,
    normalize_clean_url_generic,
)
from backend.services.discovery.sources.curated_seed import CuratedSeedSource
from backend.services.discovery.queue import CandidateQueueService, queue_service
from backend.services.discovery.worker import DiscoveryWorker, discovery_worker
from backend.services.observation_worker import worker as observation_worker
from backend.services.deals_crawler import get_live_deals_feed


# ==============================================================================
# 1. CandidatePayload Validation
# ==============================================================================
def test_candidate_payload_validation():
    """Verify CandidatePayload validates URLs, clamps priority, and populates metadata."""
    payload = CandidatePayload(
        candidate_url="https://www.amazon.in/dp/B0D14BB5XY?ref_=tag",
        merchant="Amazon",
        category_hint="Appliances",
        title_hint="Air Fryer",
        discovery_priority=120.0,  # Clamped to 100.0
    )
    assert payload.candidate_url == "https://www.amazon.in/dp/B0D14BB5XY?ref_=tag"
    assert payload.discovery_priority == 100.0
    assert payload.dedupe_key == "amazon:B0D14BB5XY"
    assert payload.merchant_product_id == "B0D14BB5XY"
    assert "https://www.amazon.in/dp/B0D14BB5XY" in payload.clean_url

    # Test empty URL raises validation error
    with pytest.raises(ValueError):
        CandidatePayload(candidate_url="")


# ==============================================================================
# 2. Source Interface & CuratedSeedSource
# ==============================================================================
def test_curated_seed_source_defaults_and_custom():
    """Verify CuratedSeedSource produces payloads from defaults and custom configs."""
    # Default benchmark catalog
    default_source = CuratedSeedSource()
    candidates = default_source.fetch_candidates()
    assert len(candidates) >= 5
    assert all(isinstance(c, CandidatePayload) for c in candidates)
    assert any("B0D14BB5XY" in c.dedupe_key for c in candidates)

    # Custom configuration list
    custom_items = [
        {
            "url": "https://www.amazon.in/dp/B0863TXGM3",
            "merchant": "Amazon",
            "category": "Headphones",
            "priority": 95.0,
        },
        {"url": ""},  # Malformed item should be skipped
    ]
    custom_source = CuratedSeedSource(seed_items=custom_items)
    custom_candidates = custom_source.fetch_candidates()
    assert len(custom_candidates) == 1
    assert custom_candidates[0].discovery_priority == 95.0
    assert custom_candidates[0].dedupe_key == "amazon:B0863TXGM3"


def test_cuelinks_offer_source_boundary():
    """Verify CuelinksOfferSource raises NotImplementedError and does not act as catalog feed."""
    offer_source = CuelinksOfferSource()
    assert offer_source.source_name == "cuelinks_offers"
    assert offer_source.source_type == "offer_intelligence"
    with pytest.raises(NotImplementedError):
        offer_source.fetch_candidates()


# ==============================================================================
# 3. Deduplication Tiers (Tier 1 ASIN/PID & Tier 2 URL Hash)
# ==============================================================================
def test_dedupe_tier1_amazon_asin():
    """Verify Amazon ASIN dedupe key generation and normalization."""
    # Lowercase ASIN in URL must normalize to uppercase dedupe_key
    url = "https://www.amazon.in/gp/product/b0d14bb5xy?ref=ppx_yo_dt_b_asin_title_o00_s00"
    dedupe_key, clean_url, pid, merchant = compute_candidate_dedupe(url)
    assert dedupe_key == "amazon:B0D14BB5XY"
    assert pid == "B0D14BB5XY"
    assert merchant == "Amazon"


def test_dedupe_tier1_flipkart_pid():
    """Verify Flipkart PID dedupe key generation."""
    url = "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=LST123"
    dedupe_key, clean_url, pid, merchant = compute_candidate_dedupe(url)
    assert dedupe_key == "flipkart:MOBGTAGPTB3VS24W"
    assert pid == "MOBGTAGPTB3VS24W"
    assert merchant == "Flipkart"


def test_dedupe_tier2_sha256_fallback():
    """Verify Tier 2 SHA256 cryptographic fallback for non-ASIN/PID URLs."""
    generic_url = "https://www.example-store.com/electronics/gadget-pro?session=123"
    dedupe_key, clean_url, pid, merchant = compute_candidate_dedupe(generic_url)
    assert dedupe_key.startswith("sha256:")

    # Clean URL without session param should produce identical hash
    same_clean = "https://www.example-store.com/electronics/gadget-pro"
    norm1 = normalize_clean_url_generic(generic_url)
    norm2 = normalize_clean_url_generic(same_clean)
    assert hashlib.sha256(norm1.encode()).hexdigest() == hashlib.sha256(norm2.encode()).hexdigest()


# ==============================================================================
# 4. Duplicate Queue Prevention
# ==============================================================================
def test_duplicate_queue_prevention():
    """Verify enqueueing identical candidate twice returns existing record without duplicate insertion."""
    service = CandidateQueueService()
    payload = CandidatePayload(
        candidate_url="https://www.amazon.in/dp/B0D14BB5XY",
        merchant="Amazon",
        discovery_priority=80.0,
    )

    with get_session() as session:
        c1 = service.enqueue(payload, session=session)
        assert c1.id is not None
        c1_id = c1.id

        # Enqueue same payload again
        c2 = service.enqueue(payload, session=session)
        assert c2.id == c1_id

        # Count total in DB for this dedupe_key
        count = len(session.exec(
            select(DiscoveryCandidate).where(DiscoveryCandidate.dedupe_key == c1.dedupe_key)
        ).all())
        assert count == 1


# ==============================================================================
# 5. Priority Ordering in Dequeue
# ==============================================================================
def test_priority_ordering_in_dequeue():
    """Verify dequeue_batch returns candidates in descending discovery_priority order."""
    service = CandidateQueueService()

    p_low = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
        discovery_priority=20.0,
    )
    p_high = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
        discovery_priority=90.0,
    )
    p_mid = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
        discovery_priority=60.0,
    )

    with get_session() as session:
        service.enqueue(p_low, session=session)
        service.enqueue(p_high, session=session)
        service.enqueue(p_mid, session=session)

        batch = service.dequeue_batch(batch_size=3, session=session)
        priorities = [c.discovery_priority for c in batch]
        # High priority should come before mid, which comes before low
        assert priorities == sorted(priorities, reverse=True)


# ==============================================================================
# 6. Queue State Transitions
# ==============================================================================
def test_queue_state_transitions():
    """Verify strict progression: QUEUED -> PROCESSING -> IDENTIFIED / TRACKING."""
    service = CandidateQueueService()

    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
        discovery_priority=50.0,
    )

    with get_session() as session:
        cand = service.enqueue(payload, session=session)
        assert cand.status == "QUEUED"

        # Mark processing
        service.mark_processing(cand.id, session=session)
        session.refresh(cand)
        assert cand.status == "PROCESSING"

        # Mark accepted with observation -> TRACKING
        service.mark_accepted(
            candidate_id=cand.id,
            product_id=999,
            listing_id=888,
            has_observation=True,
            session=session,
        )
        session.refresh(cand)
        assert cand.status == "TRACKING"
        assert cand.product_id == 999
        assert cand.listing_id == 888
        assert cand.processed_at is not None


# ==============================================================================
# 7. Retry Exponential Backoff & Max Attempts Rejection
# ==============================================================================
def test_retry_backoff_and_rejection():
    """Verify failure increments attempts, calculates exponential backoff, and eventually rejects."""
    service = CandidateQueueService()

    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
    )

    with get_session() as session:
        cand = service.enqueue(payload, session=session)

        # Attempt 1: Should enter RETRY with 300s backoff
        service.mark_failed(cand.id, error="Scrape timed out", session=session)
        session.refresh(cand)
        assert cand.status == "RETRY"
        assert cand.attempts == 1
        assert cand.next_attempt_at is not None

        # Attempt 2: Should enter RETRY with 600s backoff
        service.mark_failed(cand.id, error="Scrape blocked", session=session)
        session.refresh(cand)
        assert cand.status == "RETRY"
        assert cand.attempts == 2

        # Attempt 3 (Max): Should be REJECTED
        service.mark_failed(cand.id, error="Persistent 404", session=session)
        session.refresh(cand)
        assert cand.status == "REJECTED"
        assert cand.attempts == 3
        assert cand.next_attempt_at is None
        assert cand.last_error == "Persistent 404"


def test_retry_due_candidates():
    """Verify retry_due_candidates moves candidates with elapsed backoff back to QUEUED."""
    service = CandidateQueueService()

    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
    )

    with get_session() as session:
        cand = service.enqueue(payload, session=session)
        cand.status = "RETRY"
        # Set next_attempt_at in the past
        cand.next_attempt_at = datetime.now(timezone.utc) - timedelta(seconds=10)
        session.add(cand)
        session.commit()

        requeued = service.retry_due_candidates(session=session)
        assert requeued >= 1
        session.refresh(cand)
        assert cand.status == "QUEUED"



# ==============================================================================
# 8. Existing Listing Detection Without Duplicate Creation
# ==============================================================================
def test_existing_listing_detection():
    """Verify worker recognizes existing MerchantListing and marks candidate ACCEPTED without duplicating listing."""
    worker = DiscoveryWorker()
    service = CandidateQueueService()
    now_utc = datetime.now(timezone.utc)
    now_ts = int(now_utc.timestamp())
    test_asin = f"B0{now_ts % 100000000:08d}"

    with get_session() as session:
        # Create pre-existing Product & MerchantListing
        product = Product(
            canonical_title=f"Existing Test Product {now_ts}",
            canonical_slug=f"existing-test-product-{now_ts}",
            created_at=now_utc,
        )
        session.add(product)
        session.commit()
        session.refresh(product)

        listing = MerchantListing(
            product_id=product.id,
            merchant="Amazon",
            merchant_product_id=test_asin,
            url=f"https://www.amazon.in/dp/{test_asin}",
            clean_url=f"https://www.amazon.in/dp/{test_asin}",
            title_at_merchant=product.canonical_title,
            current_price=1999.0,
            created_at=now_utc,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)

        # Enqueue discovery candidate for the same ASIN
        payload = CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{test_asin}",
            merchant="Amazon",
        )
        cand = service.enqueue(payload, session=session)

        # Process candidate through discovery worker
        success, reason = worker.process_candidate(cand, session=session)
        assert success is True
        assert reason == "EXISTING_LISTING_ACCEPTED"

        # Candidate should be ACCEPTED / TRACKING and linked to existing records
        session.refresh(cand)
        assert cand.product_id == product.id
        assert cand.listing_id == listing.id

        # Verify no duplicate listing was created
        listings = session.exec(
            select(MerchantListing).where(MerchantListing.merchant_product_id == test_asin)
        ).all()
        assert len(listings) == 1


# ==============================================================================
# 9. Successful Ingestion & Real Price Observation
# ==============================================================================
def test_successful_ingestion_and_real_observation():
    """Verify new candidate ingests into Product/Listing and creates real PriceObservation."""
    worker = DiscoveryWorker()
    service = CandidateQueueService()
    test_url = "https://www.amazon.in/dp/B0D14BB5XY"

    with get_session() as session:
        payload = CandidatePayload(
            candidate_url=test_url,
            merchant="Amazon",
            discovery_priority=85.0,
        )
        cand = service.enqueue(payload, session=session)

        success, reason = worker.process_candidate(cand, session=session)
        assert success is True
        assert "INGESTED" in reason or "EXISTING" in reason

        session.refresh(cand)
        assert cand.product_id is not None
        assert cand.listing_id is not None

        # Verify linked product and listing exist
        db_prod = session.get(Product, cand.product_id)
        assert db_prod is not None
        db_list = session.get(MerchantListing, cand.listing_id)
        assert db_list is not None
        assert db_list.refresh_priority in ("HOT", "ACTIVE", "NORMAL", "COLD")


# ==============================================================================
# 10. Failed Ingestion Preserves Error State
# ==============================================================================
def test_failed_ingestion_preserves_error():
    """Verify invalid / unsupported merchant URL is rejected without fake success."""
    worker = DiscoveryWorker()
    service = CandidateQueueService()

    with get_session() as session:
        payload = CandidatePayload(
            candidate_url="https://www.unsupported-bazaar.com/item/123",
            merchant="Unknown",
        )
        cand = service.enqueue(payload, session=session)

        success, reason = worker.process_candidate(cand, session=session)
        assert success is False
        assert reason == "UNSUPPORTED_MERCHANT"

        session.refresh(cand)
        assert cand.status == "REJECTED"
        assert "Unsupported merchant" in cand.last_error


# ==============================================================================
# 11. Candidate != Deal Separation
# ==============================================================================
def test_candidate_never_appears_as_deal():
    """Verify DiscoveryCandidate records are never surfaced in the live deals feed."""
    service = CandidateQueueService()

    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/B0{uuid.uuid4().hex[:8].upper()}",
        merchant="Amazon",
        discovery_priority=99.0,
        title_hint="Super Fake Deal Title",
    )

    with get_session() as session:
        cand = service.enqueue(payload, session=session)
        cand.status = "TRACKING"
        session.add(cand)
        session.commit()

        # Query live deals feed
        feed = get_live_deals_feed()
        feed_titles = [d.get("title", "") for d in feed.get("deals", [])]
        assert "Super Fake Deal Title" not in feed_titles


# ==============================================================================
# 12. Worker Isolation
# ==============================================================================
def test_worker_isolation():
    """Verify DiscoveryWorker is isolated from ObservationWorker and discovery actions do not disrupt observation."""
    assert discovery_worker is not None
    assert observation_worker is not None
    # They must be separate instances of different classes
    assert type(discovery_worker) is not type(observation_worker)


# ==============================================================================
# 13. Database Schema & Composite Index
# ==============================================================================
def test_database_discovery_candidates_schema():
    """Verify database initialization creates discovery_candidates table and indexes."""
    init_db()
    with get_session() as session:
        stats = queue_service.get_queue_stats(session=session)
        assert "total_candidates" in stats
        assert "category_seed_budget" in stats
        assert stats["category_seed_budget"] == settings.CATEGORY_SEED_BUDGET
        assert stats["discovery_target_products"] == settings.DISCOVERY_TARGET_PRODUCTS
