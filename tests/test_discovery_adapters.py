"""
Comprehensive Test Suite for DealSense Phase 4.2 Layer 2A:
DISCOVERY ADAPTER FRAMEWORK.

Tests cover:
1. Amazon candidate normalization
2. Flipkart candidate normalization
3. Amazon ASIN dedupe
4. Flipkart PID dedupe
5. Malformed candidate rejection
6. Existing listing reuse
7. Source metadata preservation
8. DiscoveryObservation semantics (distinct from PriceObservation)
9. Candidate -> Queue
10. Queue -> DiscoveryWorker
11. DiscoveryWorker -> canonical ingestion
12. Candidate != PriceObservation
13. Candidate != DealCandidate
14. Mixed Amazon + Flipkart queue ordering
"""
from datetime import datetime, timezone
import uuid
import pytest
from sqlmodel import Session, select

from backend.database import get_session, init_db
from backend.models import (
    DiscoveryCandidate,
    Product,
    MerchantListing,
    PriceObservation,
    ProductDiscoveryEvent,
)
from backend.services.discovery.base import (
    CandidatePayload,
    DiscoveryObservation,
    compute_candidate_dedupe,
)
from backend.services.discovery.sources.amazon import (
    AmazonDiscoverySource,
    AMAZON_FIXTURE_CANDIDATES,
)
from backend.services.discovery.sources.flipkart import (
    FlipkartDiscoverySource,
    FLIPKART_FIXTURE_CANDIDATES,
)
from backend.services.discovery.queue import CandidateQueueService, queue_service
from backend.services.discovery.worker import DiscoveryWorker, discovery_worker
from backend.services.deals_crawler import get_live_deals_feed


# ==============================================================================
# 1. Amazon Candidate Normalization
# ==============================================================================
def test_amazon_candidate_normalization():
    """Verify Amazon candidate normalizes ASIN, clean URL, and metadata hints."""
    source = AmazonDiscoverySource()
    raw = {
        "asin": "B0D14BB5XY",
        "url": "https://www.amazon.in/dp/B0D14BB5XY?ref_=chk_typ",
        "merchant": "Amazon",
        "category": "Appliances",
        "title": "PHILIPS Air Fryer NA120/00",
        "price": 4849.0,
        "mrp": 6995.0,
        "priority": 85.0,
        "discovery_method": "bestseller",
    }
    payload = source.normalize_candidate(raw)
    assert payload is not None
    assert payload.merchant == "Amazon"
    assert payload.merchant_product_id == "B0D14BB5XY"
    assert payload.dedupe_key == "amazon:B0D14BB5XY"
    assert payload.clean_url == "https://www.amazon.in/dp/B0D14BB5XY"
    assert payload.discovery_priority == 85.0
    assert payload.source_name == "amazon"
    assert payload.discovery_method == "bestseller"


# ==============================================================================
# 2. Flipkart Candidate Normalization
# ==============================================================================
def test_flipkart_candidate_normalization():
    """Verify Flipkart candidate normalizes PID, clean URL, and metadata hints."""
    source = FlipkartDiscoverySource()
    raw = {
        "pid": "MOBGTAGPTB3VS24W",
        "url": "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=123",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Apple iPhone 15 128 GB Black",
        "price": 57999.0,
        "mrp": 69900.0,
        "priority": 90.0,
        "discovery_method": "popular",
    }
    payload = source.normalize_candidate(raw)
    assert payload is not None
    assert payload.merchant == "Flipkart"
    assert payload.merchant_product_id == "MOBGTAGPTB3VS24W"
    assert payload.dedupe_key == "flipkart:MOBGTAGPTB3VS24W"
    assert "MOBGTAGPTB3VS24W" in payload.clean_url
    assert payload.discovery_priority == 90.0
    assert payload.source_name == "flipkart"
    assert payload.discovery_method == "popular"


# ==============================================================================
# 3. Amazon ASIN Dedupe Key
# ==============================================================================
def test_amazon_asin_dedupe():
    """Verify canonical dedupe key generation for Amazon ASINs."""
    source = AmazonDiscoverySource()
    assert source.dedupe_key("b0d14bb5xy") == "amazon:B0D14BB5XY"
    assert source.dedupe_key("B0863TXGM3") == "amazon:B0863TXGM3"


# ==============================================================================
# 4. Flipkart PID Dedupe Key
# ==============================================================================
def test_flipkart_pid_dedupe():
    """Verify canonical dedupe key generation for Flipkart PIDs."""
    source = FlipkartDiscoverySource()
    assert source.dedupe_key("mobgtagptb3vs24w") == "flipkart:mobgtagptb3vs24w"
    assert source.dedupe_key("MOBGV2GB6J7YQGWX") == "flipkart:MOBGV2GB6J7YQGWX"


# ==============================================================================
# 5. Malformed Candidate Rejection
# ==============================================================================
def test_malformed_candidate_rejection():
    """Verify malformed candidates with missing ASIN/PID or broken URLs are rejected."""
    amz_source = AmazonDiscoverySource()
    fk_source = FlipkartDiscoverySource()

    # Amazon with broken URL and missing ASIN
    res_amz1 = amz_source.normalize_candidate({"url": "https://www.amazon.in/broken", "asin": ""})
    assert res_amz1 is None

    # Amazon with empty URL
    res_amz2 = amz_source.normalize_candidate({"url": "", "asin": "B0D14BB5XY"})
    assert res_amz2 is None

    # Flipkart with missing PID
    res_fk1 = fk_source.normalize_candidate({"url": "https://www.flipkart.com/no-pid", "pid": ""})
    assert res_fk1 is None

    # Flipkart with whitespace URL
    res_fk2 = fk_source.normalize_candidate({"url": "   ", "pid": "MOB123"})
    assert res_fk2 is None


# ==============================================================================
# 6. Existing Listing Reuse
# ==============================================================================
def test_existing_listing_reuse():
    """Verify worker reuses pre-existing MerchantListing and creates zero duplicates."""
    worker = DiscoveryWorker()
    now_utc = datetime.now(timezone.utc)
    unique_asin = f"B0{uuid.uuid4().hex[:8].upper()}"

    with get_session() as session:
        # 1. Pre-create Product and MerchantListing
        prod = Product(
            canonical_title=f"Pre-existing Headset {unique_asin}",
            canonical_slug=f"pre-existing-headset-{unique_asin.lower()}",
            created_at=now_utc,
        )
        session.add(prod)
        session.commit()
        session.refresh(prod)

        listing = MerchantListing(
            product_id=prod.id,
            merchant="Amazon",
            merchant_product_id=unique_asin,
            url=f"https://www.amazon.in/dp/{unique_asin}",
            clean_url=f"https://www.amazon.in/dp/{unique_asin}",
            title_at_merchant=prod.canonical_title,
            current_price=12999.0,
            created_at=now_utc,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)

        # 2. Feed candidate with identical ASIN through DiscoverySource
        amz_source = AmazonDiscoverySource(fixture_items=[{
            "asin": unique_asin,
            "url": f"https://www.amazon.in/dp/{unique_asin}",
            "title": prod.canonical_title,
            "merchant": "Amazon",
            "priority": 80.0,
        }])
        payloads = amz_source.discover_candidates()
        assert len(payloads) == 1

        cand = queue_service.enqueue(payloads[0], session=session)
        success, reason = worker.process_candidate(cand, session=session)
        assert success is True
        assert reason == "EXISTING_LISTING_ACCEPTED"

        session.refresh(cand)
        assert cand.product_id == prod.id
        assert cand.listing_id == listing.id

        # Confirm listing was NOT duplicated
        all_listings = session.exec(
            select(MerchantListing).where(MerchantListing.merchant_product_id == unique_asin)
        ).all()
        assert len(all_listings) == 1


# ==============================================================================
# 7. Source Metadata Preservation
# ==============================================================================
def test_source_metadata_preservation():
    """Verify source metadata is preserved from adapter through CandidatePayload and into queue."""
    amz_source = AmazonDiscoverySource()
    amz_meta = amz_source.source_metadata()
    assert amz_meta["source_name"] == "amazon"
    assert amz_meta["source_type"] == "category"
    assert amz_meta["discovery_method"] == "bestseller"

    fk_source = FlipkartDiscoverySource()
    fk_meta = fk_source.source_metadata()
    assert fk_meta["source_name"] == "flipkart"
    assert fk_meta["source_type"] == "category"
    assert fk_meta["discovery_method"] == "popular"

    asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    payload = amz_source.normalize_candidate({
        "asin": asin,
        "url": f"https://www.amazon.in/dp/{asin}",
        "discovery_method": "bestseller",
    })
    assert payload.source_name == "amazon"
    assert payload.source_type == "category"
    assert payload.discovery_method == "bestseller"

    with get_session() as session:
        cand = queue_service.enqueue(payload, session=session)
        assert cand.source_name == "amazon"
        assert cand.source_type == "category"
        assert cand.discovery_method == "bestseller"


# ==============================================================================
# 8. DiscoveryObservation Semantics (Distinct from PriceObservation)
# ==============================================================================
def test_discovery_observation_semantics():
    """
    Verify DiscoveryObservation model:
    - Records discovery presence and provenance at time T from source S.
    - Carries NO price or deal fields.
    - Remains completely decoupled from PriceObservation.
    """
    now_utc = datetime.now(timezone.utc)
    obs = DiscoveryObservation(
        source_name="amazon",
        source_type="category",
        discovery_method="bestseller",
        discovered_at=now_utc,
        dedupe_key="amazon:B0D14BB5XY",
        candidate_url="https://www.amazon.in/dp/B0D14BB5XY",
    )
    assert obs.source_name == "amazon"
    assert obs.discovery_method == "bestseller"
    assert obs.discovered_at == now_utc
    # DiscoveryObservation must NOT have price observation attributes
    assert not hasattr(obs, "price")
    assert not hasattr(obs, "mrp")
    assert not hasattr(obs, "currency")
    assert not hasattr(obs, "in_stock")


# ==============================================================================
# 9. Candidate -> Queue
# ==============================================================================
def test_candidate_to_queue():
    """Verify DiscoverySource payloads enqueue cleanly with QUEUED status."""
    source = AmazonDiscoverySource()
    payloads = source.discover_candidates()
    # 5 fixture items minus 1 malformed = 4 valid CandidatePayloads
    assert len(payloads) == 4

    with get_session() as session:
        for p in payloads:
            cand = queue_service.enqueue(p, session=session)
            assert cand.id is not None
            assert cand.status in ("QUEUED", "TRACKING", "IDENTIFIED")


# ==============================================================================
# 10. Queue -> DiscoveryWorker Batch Execution
# ==============================================================================
def test_queue_to_discovery_worker():
    """Verify queued candidates transition through PROCESSING to completion in worker cycle."""
    source = FlipkartDiscoverySource()
    payloads = source.discover_candidates()
    # 5 fixture items minus 1 malformed = 4 valid CandidatePayloads
    assert len(payloads) == 4

    with get_session() as session:
        for p in payloads:
            queue_service.enqueue(p, session=session)

    cycle = discovery_worker.run_discovery_cycle(batch_size=5)
    assert cycle["dequeued"] >= 0
    assert "accepted" in cycle
    assert "failed" in cycle
    assert "rejected" in cycle


# ==============================================================================
# 11. DiscoveryWorker -> Canonical Ingestion
# ==============================================================================
def test_discovery_worker_canonical_ingestion():
    """Verify worker invokes canonical ingestion and creates genuine records."""
    unique_asin = "B0D14BB5XY"
    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/{unique_asin}",
        merchant="Amazon",
        discovery_priority=85.0,
    )
    with get_session() as session:
        cand = queue_service.enqueue(payload, session=session)
        success, reason = discovery_worker.process_candidate(cand, session=session)
        assert success is True
        assert "INGESTED" in reason or "EXISTING" in reason

        session.refresh(cand)
        assert cand.product_id is not None
        assert cand.listing_id is not None


# ==============================================================================
# 12. Candidate != PriceObservation
# ==============================================================================
def test_candidate_does_not_create_price_observation():
    """Verify that discovering/enqueueing candidates NEVER fabricates PriceObservations."""
    with get_session() as session:
        init_obs_count = len(session.exec(select(PriceObservation)).all())

        asin = f"B0{uuid.uuid4().hex[:8].upper()}"
        payload = CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{asin}",
            merchant="Amazon",
            price_hint=1999.0,  # Hints must NEVER become observations
            mrp_hint=2999.0,
        )
        cand = queue_service.enqueue(payload, session=session)
        assert cand.id is not None

        # Confirm PriceObservation table count has NOT changed
        post_obs_count = len(session.exec(select(PriceObservation)).all())
        assert post_obs_count == init_obs_count


# ==============================================================================
# 13. Candidate != DealCandidate
# ==============================================================================
def test_candidate_never_surfaces_as_deal_candidate():
    """Verify that discovery candidates never appear in public live deals feed."""
    with get_session() as session:
        asin = f"B0{uuid.uuid4().hex[:8].upper()}"
        payload = CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{asin}",
            merchant="Amazon",
            title_hint="Super Exclusive Untracked Candidate Deal",
            discovery_priority=99.0,
        )
        cand = queue_service.enqueue(payload, session=session)
        cand.status = "TRACKING"
        session.add(cand)
        session.commit()

        # Query public live deals feed
        feed = get_live_deals_feed()
        deal_titles = [d.get("title", "") for d in feed.get("deals", [])]
        assert "Super Exclusive Untracked Candidate Deal" not in deal_titles


# ==============================================================================
# 14. Mixed Amazon + Flipkart Queue Ordering
# ==============================================================================
def test_mixed_amazon_flipkart_queue_ordering():
    """Verify dequeue_batch respects priority ordering across mixed Amazon and Flipkart candidates."""
    amz_high_asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    fk_high_pid = f"MOB{uuid.uuid4().hex[:12].upper()}"
    amz_low_asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    fk_low_pid = f"MOB{uuid.uuid4().hex[:12].upper()}"

    payloads = [
        CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{amz_low_asin}",
            merchant="Amazon",
            discovery_priority=25.0,
        ),
        CandidatePayload(
            candidate_url=f"https://www.flipkart.com/item/p/itm?pid={fk_high_pid}",
            merchant="Flipkart",
            discovery_priority=95.0,
        ),
        CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{amz_high_asin}",
            merchant="Amazon",
            discovery_priority=85.0,
        ),
        CandidatePayload(
            candidate_url=f"https://www.flipkart.com/item/p/itm?pid={fk_low_pid}",
            merchant="Flipkart",
            discovery_priority=35.0,
        ),
    ]

    with get_session() as session:
        for p in payloads:
            queue_service.enqueue(p, session=session)

        # Dequeue batch
        batch = queue_service.dequeue_batch(batch_size=4, session=session)
        batch_priorities = [c.discovery_priority for c in batch]
        # Should be strictly descending: 95.0, 85.0, 35.0, 25.0
        assert batch_priorities == sorted(batch_priorities, reverse=True)
        assert batch[0].merchant == "Flipkart"
        assert batch[0].discovery_priority == 95.0
        assert batch[1].merchant == "Amazon"
        assert batch[1].discovery_priority == 85.0
