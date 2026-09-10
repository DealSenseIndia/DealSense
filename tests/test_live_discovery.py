"""
Unit & Integration Tests for DealSense Phase 4.2 Layer 2B Live Candidate Discovery.
Tests provider selection, fallback logic, category registry, safety/circuit breaker,
budget enforcement, candidate provenance, and zero-synthetic-observation invariants.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import uuid
import pytest
from sqlmodel import select

from backend.database import get_session
from backend.models import DiscoveryCandidate, MerchantListing, Product, PriceObservation
from backend.services.discovery.base import CandidatePayload
from backend.services.discovery.categories import CategoryRegistry, CategoryDefinition, category_registry
from backend.services.discovery.safety import CircuitBreaker, DiscoverySafetyManager
from backend.services.discovery.providers.base import DiscoveryProvider
from backend.services.discovery.providers.amazon_creators import CreatorsAPIProvider
from backend.services.discovery.providers.amazon_web import AmazonWebDiscoveryProvider
from backend.services.discovery.providers.flipkart_web import FlipkartWebDiscoveryProvider
from backend.services.discovery.sources.amazon import AmazonDiscoverySource
from backend.services.discovery.sources.flipkart import FlipkartDiscoverySource
from backend.services.discovery.orchestrator import DiscoveryOrchestrator
from backend.services.discovery.queue import queue_service
from backend.services.discovery.worker import discovery_worker


# Mock provider helper for deterministic testing
class MockTestDiscoveryProvider(DiscoveryProvider):
    def __init__(self, name: str, source: str, results: List[Dict[str, Any]], available: bool = True):
        self.provider_name = name
        self.source_name = source
        self.source_type = "mock"
        self.discovery_method = "mock_search"
        self.mock_results = results
        self._available = available
        self.call_count = 0

    def is_available(self) -> bool:
        return self._available

    def discover_query(self, query: str, category: str, max_results: int = 20) -> List[Dict[str, Any]]:
        self.call_count += 1
        return self.mock_results[:max_results]


# ==============================================================================
# 1. Provider Selection
# ==============================================================================
def test_provider_selection():
    """Verify AmazonDiscoverySource selects available providers and falls back gracefully."""
    mock_creators = MockTestDiscoveryProvider("mock_creators", "amazon", [], available=False)
    mock_web = MockTestDiscoveryProvider(
        "mock_web",
        "amazon",
        [{"asin": "B000TEST01", "url": "https://www.amazon.in/dp/B000TEST01", "title": "Test Web Item"}],
        available=True,
    )

    source = AmazonDiscoverySource(providers=[mock_creators, mock_web], use_fixture=False)
    payloads = source.discover_candidates(max_queries=1)

    assert mock_creators.call_count == 0  # Unavailable, bypassed
    assert mock_web.call_count == 1       # Used fallback
    assert len(payloads) == 1
    assert payloads[0].merchant_product_id == "B000TEST01"


# ==============================================================================
# 2. Creators API Unavailable Fallback
# ==============================================================================
def test_creators_api_unavailable_fallback():
    """Verify CreatorsAPIProvider returns empty list without error when unconfigured."""
    provider = CreatorsAPIProvider()
    assert provider.is_available() is False
    results = provider.discover_query("smartphones", "smartphones")
    assert results == []


# ==============================================================================
# 3. Malformed API Response Handling
# ==============================================================================
def test_malformed_api_response():
    """Verify provider and normalizer discard malformed items without crashing."""
    source = AmazonDiscoverySource(use_fixture=False)

    malformed_items = [
        {"asin": "", "url": "https://www.amazon.in/dp/INVALID"},
        {"asin": "SHORT", "url": "https://www.amazon.in/dp/SHORT"},
        {"asin": None, "url": None},
        {"asin": 12345, "url": "invalid"},
    ]

    for item in malformed_items:
        payload = source.normalize_candidate(item)
        assert payload is None


# ==============================================================================
# 4. Amazon Normalization with Provenance
# ==============================================================================
def test_amazon_normalization_with_provenance():
    """Verify Amazon normalization captures query, category, and source metadata."""
    source = AmazonDiscoverySource(use_fixture=False)
    asin = f"B0{uuid.uuid4().hex[:8].upper()}"

    raw = {
        "asin": asin,
        "url": f"https://www.amazon.in/dp/{asin}",
        "title": "Amazon Gaming Monitor 144Hz",
        "category": "monitors",
        "query": "gaming monitor",
        "source_name": "amazon",
        "source_type": "web_search",
        "discovery_method": "category_query",
    }

    payload = source.normalize_candidate(raw)
    assert payload is not None
    assert payload.merchant == "Amazon"
    assert payload.merchant_product_id == asin
    assert payload.dedupe_key == f"amazon:{asin}"
    assert payload.category_hint == "monitors"
    assert payload.query == "gaming monitor"
    assert payload.source_name == "amazon"
    assert payload.source_type == "web_search"
    assert payload.discovery_method == "category_query"


# ==============================================================================
# 5. Flipkart Normalization with Provenance
# ==============================================================================
def test_flipkart_normalization_with_provenance():
    """Verify Flipkart normalization captures query, category, and source metadata."""
    source = FlipkartDiscoverySource(use_fixture=False)
    pid = f"MOB{uuid.uuid4().hex[:12].upper()}"

    raw = {
        "pid": pid,
        "url": f"https://www.flipkart.com/item/p/itm?pid={pid}",
        "title": "Flipkart Smartphone 5G",
        "category": "smartphones",
        "query": "5g mobile phones",
        "source_name": "flipkart",
        "source_type": "web_search",
        "discovery_method": "category_query",
    }

    payload = source.normalize_candidate(raw)
    assert payload is not None
    assert payload.merchant == "Flipkart"
    assert payload.merchant_product_id == pid
    assert payload.dedupe_key == f"flipkart:{pid}"
    assert payload.category_hint == "smartphones"
    assert payload.query == "5g mobile phones"
    assert payload.source_name == "flipkart"


# ==============================================================================
# 6. Category Registry Structure & Initial Categories
# ==============================================================================
def test_category_registry():
    """Verify all 10 initial categories exist with queries and proper ordering."""
    reg = category_registry
    active_cats = reg.get_active_categories()
    assert len(active_cats) == 10

    names = {c.name.lower() for c in active_cats}
    expected = {
        "smartphones", "monitors", "laptops", "gpus", "ssd",
        "ram", "headphones", "smartwatches", "tvs", "gaming peripherals"
    }
    assert names == expected

    # Verify query generation up to limit
    queries = reg.get_active_queries(max_queries=5)
    assert len(queries) == 5
    for cat_name, query_str, priority, budget in queries:
        assert cat_name.lower() in expected
        assert len(query_str) > 0
        assert priority > 0
        assert budget > 0


# ==============================================================================
# 7. Query Budget Enforcement
# ==============================================================================
def test_query_budget():
    """Verify query budget limits total queries executed per run."""
    mock_provider = MockTestDiscoveryProvider(
        "mock_web",
        "amazon",
        [{"asin": "B000TEST02", "url": "https://www.amazon.in/dp/B000TEST02", "title": "Item"}],
        available=True,
    )
    source = AmazonDiscoverySource(providers=[mock_provider], use_fixture=False)

    source.discover_candidates(max_queries=3)
    assert mock_provider.call_count == 3


# ==============================================================================
# 8. Candidate Budget Enforcement
# ==============================================================================
def test_candidate_budget():
    """Verify candidate output per query respects limits."""
    # Generate 30 mock items
    items = [
        {"asin": f"B000TEST{i:02d}", "url": f"https://www.amazon.in/dp/B000TEST{i:02d}", "title": f"Item {i}"}
        for i in range(30)
    ]
    mock_provider = MockTestDiscoveryProvider("mock_web", "amazon", items, available=True)
    source = AmazonDiscoverySource(providers=[mock_provider], use_fixture=False)

    payloads = source.discover_candidates(max_queries=1, candidates_per_query=5)
    assert len(payloads) == 5


# ==============================================================================
# 9. Source Provenance Preservation End-to-End
# ==============================================================================
def test_source_provenance_preservation():
    """Verify provenance (source_type, discovery_method, query) is stored in database."""
    asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/{asin}",
        merchant="Amazon",
        category_hint="monitors",
        query="gaming monitor",
        source_name="amazon",
        source_type="web_search",
        discovery_method="category_query",
    )

    with get_session() as session:
        cand = queue_service.enqueue(payload, session=session)
        assert cand.id is not None
        assert cand.source_name == "amazon"
        assert cand.source_type == "web_search"
        assert cand.discovery_method == "category_query"
        assert cand.category_hint == "monitors"
        assert cand.query == "gaming monitor"


# ==============================================================================
# 10. Deduplication of Live Candidates
# ==============================================================================
def test_deduplication_live_candidates():
    """Verify duplicate candidates in live runs are filtered by dedupe key."""
    asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    items = [
        {"asin": asin, "url": f"https://www.amazon.in/dp/{asin}", "title": "Item 1"},
        {"asin": asin, "url": f"https://www.amazon.in/dp/{asin}?ref=dup", "title": "Item 1 Dup"},
    ]
    mock_provider = MockTestDiscoveryProvider("mock_web", "amazon", items, available=True)
    source = AmazonDiscoverySource(providers=[mock_provider], use_fixture=False)

    payloads = source.discover_candidates(max_queries=1)
    # Deduplication inside discover_candidates yields exactly 1 unique candidate
    assert len(payloads) == 1
    assert payloads[0].dedupe_key == f"amazon:{asin}"


# ==============================================================================
# 11. Retry & Exponential Backoff Delay
# ==============================================================================
def test_retry_and_exponential_backoff():
    """Verify exponential backoff calculation increases properly."""
    safety = DiscoverySafetyManager()
    delay_1 = safety.compute_backoff(attempt=1, base_seconds=2.0)
    delay_2 = safety.compute_backoff(attempt=2, base_seconds=2.0)
    delay_3 = safety.compute_backoff(attempt=3, base_seconds=2.0)
    delay_max = safety.compute_backoff(attempt=10, base_seconds=2.0, max_seconds=20.0)

    assert delay_1 == 2.0
    assert delay_2 == 4.0
    assert delay_3 == 8.0
    assert delay_max == 20.0


# ==============================================================================
# 12. Circuit Breaker States & Cooldown
# ==============================================================================
def test_circuit_breaker():
    """Verify circuit breaker trips on failures, enforces cooldown, and resets on success."""
    breaker = CircuitBreaker("test_source", failure_threshold=2, cooldown_seconds=0.1)
    assert breaker.state == "CLOSED"
    assert breaker.can_execute() is True

    # First transient failure
    breaker.record_failure(status_code=500, reason="Internal error")
    assert breaker.state == "CLOSED"

    # Second failure reaches threshold -> TRIPS to OPEN
    breaker.record_failure(status_code=500, reason="Second error")
    assert breaker.state == "OPEN"
    assert breaker.can_execute() is False

    # Immediate severe trip on 403 or 429
    severe_breaker = CircuitBreaker("severe_source", failure_threshold=5, cooldown_seconds=10.0)
    severe_breaker.record_failure(status_code=403, reason="Forbidden")
    assert severe_breaker.state == "OPEN"

    # Test recovery reset
    severe_breaker.record_success()
    assert severe_breaker.state == "CLOSED"
    assert severe_breaker.failure_count == 0


# ==============================================================================
# 13. Candidate Queue Integration
# ==============================================================================
def test_candidate_queue_integration():
    """Verify live candidate payloads correctly enter queue and update counts."""
    with get_session() as session:
        init_stats = queue_service.get_queue_stats(session=session)
        init_queued = init_stats.get("by_status", {}).get("QUEUED", 0)

        asin = f"B0{uuid.uuid4().hex[:8].upper()}"
        payload = CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{asin}",
            merchant="Amazon",
            discovery_priority=88.0,
            query="test queue",
        )
        cand = queue_service.enqueue(payload, session=session)
        assert cand.status == "QUEUED"

        post_stats = queue_service.get_queue_stats(session=session)
        assert post_stats.get("by_status", {}).get("QUEUED", 0) == init_queued + 1


# ==============================================================================
# 14. No Synthetic PriceObservation Invariant
# ==============================================================================
def test_no_synthetic_price_observation():
    """Candidate discovery MUST NEVER create synthetic or fabricated PriceObservations."""
    with get_session() as session:
        init_obs_count = len(session.exec(select(PriceObservation)).all())

        asin = f"B0{uuid.uuid4().hex[:8].upper()}"
        payload = CandidatePayload(
            candidate_url=f"https://www.amazon.in/dp/{asin}",
            merchant="Amazon",
            price_hint=14999.0,
            mrp_hint=19999.0,
            query="test price hint",
        )
        cand = queue_service.enqueue(payload, session=session)
        assert cand.id is not None

        post_obs_count = len(session.exec(select(PriceObservation)).all())
        assert post_obs_count == init_obs_count  # NO observation created!


# ==============================================================================
# 15. No DealCandidate Creation During Discovery
# ==============================================================================
def test_no_deal_candidate_creation():
    """Discovery intake MUST NEVER promote candidates to DEAL_CANDIDATE."""
    asin = f"B0{uuid.uuid4().hex[:8].upper()}"
    payload = CandidatePayload(
        candidate_url=f"https://www.amazon.in/dp/{asin}",
        merchant="Amazon",
        discovery_priority=99.0,
    )
    with get_session() as session:
        cand = queue_service.enqueue(payload, session=session)
        assert cand.status == "QUEUED"
        assert cand.status != "DEAL_CANDIDATE"

        # Worker intake
        discovery_worker.process_candidate(cand, session=session)
        session.refresh(cand)
        assert cand.status != "DEAL_CANDIDATE"


# ==============================================================================
# 16. Provider Failure Isolation
# ==============================================================================
def test_provider_failure_isolation():
    """Verify that failure in one source/provider does not crash the orchestrator."""
    class CrashingProvider(DiscoveryProvider):
        provider_name = "crashing"
        source_name = "amazon"
        source_type = "crash"
        discovery_method = "crash"
        def is_available(self) -> bool: return True
        def discover_query(self, q, c, m=20): raise RuntimeError("Simulated crash!")

    crashing_source = AmazonDiscoverySource(providers=[CrashingProvider()], use_fixture=False)
    healthy_mock = MockTestDiscoveryProvider(
        "healthy",
        "flipkart",
        [{"pid": "MOBTEST12345678", "url": "https://www.flipkart.com/p/itm?pid=MOBTEST12345678", "priority": 1.0}],
        available=True,
    )
    healthy_source = FlipkartDiscoverySource(providers=[healthy_mock], use_fixture=False)

    orchestrator = DiscoveryOrchestrator(sources=[crashing_source, healthy_source])

    # Should not raise exception
    with get_session() as session:
        results = orchestrator.discover_and_enqueue(max_queries_per_source=1, session=session)

    assert results["sources"]["amazon"]["status"] == "SUCCESS" or results["sources"]["amazon"]["raw_candidates"] == 0
    assert results["sources"]["flipkart"]["status"] == "SUCCESS"
    assert results["sources"]["flipkart"]["raw_candidates"] == 1
