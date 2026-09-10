"""
Flipkart Discovery Adapter for DealSense.
Supports both provider abstraction (FlipkartWebDiscoveryProvider) and controlled fixture mode.
Operates with strict query budgets, circuit breaker protection, and normalized PID deduplication.
"""
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, parse_qs

from backend.config import settings
from backend.services.discovery.base import DiscoverySource, CandidatePayload
from backend.services.discovery.categories import category_registry
from backend.services.discovery.providers.base import DiscoveryProvider
from backend.services.discovery.providers.flipkart_web import FlipkartWebDiscoveryProvider

logger = logging.getLogger(__name__)

# Default deterministic 5-candidate fixture (including duplicate and malformed)
FLIPKART_FIXTURE_CANDIDATES: List[Dict[str, Any]] = [
    {
        "pid": "MOBGTAGPTB3VS24W",
        "url": "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Apple iPhone 15 128 GB Black",
        "price": 57999.0,
        "mrp": 69900.0,
        "priority": 90.0,
        "discovery_method": "popular",
    },
    {
        "pid": "MOBGV2GB6J7YQGWX",
        "url": "https://www.flipkart.com/samsung-galaxy-s23-fe-mint-128-gb/p/itm22dfa64be2983?pid=MOBGV2GB6J7YQGWX",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Samsung Galaxy S23 FE Mint 128 GB",
        "price": 34999.0,
        "mrp": 79999.0,
        "priority": 75.0,
        "discovery_method": "popular",
    },
    # Intentional duplicate of candidate #1 to test deduplication
    {
        "pid": "MOBGTAGPTB3VS24W",
        "url": "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W&lid=DUP123",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Apple iPhone 15 128 GB Black (Duplicate)",
        "priority": 90.0,
        "discovery_method": "popular",
    },
    # Intentional malformed candidate to test rejection
    {
        "pid": "",
        "url": "https://www.flipkart.com/broken-url-without-pid",
        "merchant": "Flipkart",
        "title": "Malformed Flipkart Item",
        "priority": 10.0,
    },
    {
        "pid": "MOBGZ8FYXHDVCHGY",
        "url": "https://www.flipkart.com/motorola-g85-5g-olive-green-128-gb/p/itm123456?pid=MOBGZ8FYXHDVCHGY",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Motorola G85 5G",
        "price": 16999.0,
        "mrp": 20999.0,
        "priority": 70.0,
        "discovery_method": "trending",
    },
]


class FlipkartDiscoverySource(DiscoverySource):
    """
    Flipkart Discovery Adapter with Provider Abstraction.
    Uses FlipkartWebDiscoveryProvider with circuit-breaker protection and query budgets.
    Maintains full backward compatibility with controlled fixture mode.
    """
    source_name: str = "flipkart"
    source_type: str = "category"
    discovery_method: str = "popular"

    def __init__(
        self,
        providers: Optional[List[DiscoveryProvider]] = None,
        fixture_items: Optional[List[Dict[str, Any]]] = None,
        use_fixture: bool = True,
    ):
        self.use_fixture = use_fixture or (fixture_items is not None)
        self.raw_items: List[Dict[str, Any]] = (
            fixture_items if fixture_items is not None else list(FLIPKART_FIXTURE_CANDIDATES)
        )
        if providers is not None:
            self.providers = providers
        else:
            self.providers = [
                FlipkartWebDiscoveryProvider(),
            ]

    def dedupe_key(self, product_id: str) -> str:
        """Canonical dedupe key: flipkart:{PID}"""
        return f"flipkart:{product_id.strip()}"

    def source_metadata(self) -> Dict[str, Any]:
        """Preserves source name, type, and discovery method metadata."""
        return {
            "source_name": self.source_name,
            "source_type": self.source_type,
            "discovery_method": self.discovery_method,
            "merchant": "Flipkart",
        }

    def normalize_candidate(self, raw: Dict[str, Any]) -> Optional[CandidatePayload]:
        """
        Normalizes a raw Flipkart candidate item into a verified CandidatePayload.
        Enforces PID validation and canonical clean URL.
        Preserves complete provenance including category and query.
        """
        url = raw.get("url") or raw.get("candidate_url")
        if not url or not isinstance(url, str) or not url.strip():
            return None

        pid_val = raw.get("pid") if raw.get("pid") is not None else raw.get("merchant_product_id")
        pid = str(pid_val).strip() if pid_val is not None else ""
        # Fallback to URL PID extraction if not passed directly
        if not pid:
            parsed = urlparse(url)
            q = parse_qs(parsed.query)
            if "pid" in q and q["pid"]:
                pid = q["pid"][0].strip()

        if not pid:
            logger.debug(f"Rejecting malformed Flipkart candidate (missing PID): {url}")
            return None

        clean_url = f"https://www.flipkart.com/item/p/itm?pid={pid}"
        parsed = urlparse(url)
        if parsed.path.startswith("/") and len(parsed.path) > 3:
            clean_url = f"https://www.flipkart.com{parsed.path}?pid={pid}"

        now_utc = datetime.now(timezone.utc)

        try:
            return CandidatePayload(
                candidate_url=url.strip(),
                clean_url=clean_url,
                merchant="Flipkart",
                merchant_product_id=pid,
                dedupe_key=self.dedupe_key(pid),
                category_hint=raw.get("category") or raw.get("category_hint"),
                query=raw.get("query"),
                title_hint=raw.get("title") or raw.get("title_hint"),
                price_hint=raw.get("price") or raw.get("price_hint"),
                mrp_hint=raw.get("mrp") or raw.get("mrp_hint"),
                discovery_priority=float(raw.get("priority") or raw.get("discovery_priority", 50.0)),
                source_name=raw.get("source_name", self.source_name),
                source_type=raw.get("source_type", self.source_type),
                discovery_method=raw.get("discovery_method", self.discovery_method),
                discovered_at=raw.get("discovered_at") or now_utc,
            )
        except Exception as e:
            logger.warning(f"Error normalizing Flipkart candidate {url}: {e}")
            return None

    def fetch_candidates(self) -> List[CandidatePayload]:
        """
        Fetches candidates from controlled fixture.
        Filters out malformed items and yields normalized CandidatePayloads.
        """
        payloads: List[CandidatePayload] = []
        for item in self.raw_items:
            payload = self.normalize_candidate(item)
            if payload:
                payloads.append(payload)

        logger.info(f"FlipkartDiscoverySource produced {len(payloads)} CandidatePayloads from fixture inputs.")
        return payloads

    def discover_candidates(
        self,
        max_queries: Optional[int] = None,
        candidates_per_query: Optional[int] = None,
    ) -> List[CandidatePayload]:
        """
        Executes candidate discovery.
        In fixture mode, returns normalized fixture items.
        In live mode, queries available providers for active category queries.
        """
        if self.use_fixture:
            return self.fetch_candidates()

        queries_limit = max_queries or getattr(settings, "DISCOVERY_MAX_QUERIES_PER_RUN", 10)
        per_query_limit = candidates_per_query or getattr(settings, "DISCOVERY_MAX_CANDIDATES_PER_QUERY", 20)

        active_queries = category_registry.get_active_queries(max_queries=queries_limit)
        payloads: List[CandidatePayload] = []
        seen_keys = set()

        for cat_name, query_str, priority, budget in active_queries:
            query_raw_items: List[Dict[str, Any]] = []

            for provider in self.providers:
                if not provider.is_available():
                    continue
                try:
                    results = provider.discover_query(
                        query=query_str,
                        category=cat_name,
                        max_results=min(per_query_limit, budget),
                    )
                    if results:
                        query_raw_items = results
                        break
                except Exception as e:
                    logger.warning(f"Provider {provider.provider_name} failed for query '{query_str}': {e}")
                    continue

            for raw in query_raw_items:
                raw.setdefault("priority", priority)
                payload = self.normalize_candidate(raw)
                if payload and payload.dedupe_key not in seen_keys:
                    seen_keys.add(payload.dedupe_key)
                    payloads.append(payload)

        logger.info(
            f"FlipkartDiscoverySource completed live discovery run: {len(payloads)} unique candidates from {len(active_queries)} queries."
        )
        return payloads
