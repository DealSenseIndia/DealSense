"""
Amazon Discovery Adapter for DealSense.
Supports both official Amazon Creators API (via CreatorsAPIProvider) and controlled WebDiscoveryProvider.
Operates with strict query budgets, circuit breaker protection, and optional fixture mode for tests.
"""
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional

from backend.config import settings
from backend.services.discovery.base import DiscoverySource, CandidatePayload
from backend.services.discovery.categories import category_registry
from backend.services.discovery.providers.base import DiscoveryProvider
from backend.services.discovery.providers.amazon_creators import CreatorsAPIProvider
from backend.services.discovery.providers.amazon_web import AmazonWebDiscoveryProvider

logger = logging.getLogger(__name__)

# Default deterministic 5-candidate fixture (including duplicate and malformed)
AMAZON_FIXTURE_CANDIDATES: List[Dict[str, Any]] = [
    {
        "asin": "B0D14BB5XY",
        "url": "https://www.amazon.in/dp/B0D14BB5XY",
        "merchant": "Amazon",
        "category": "Appliances",
        "title": "PHILIPS Air Fryer NA120/00",
        "price": 4849.0,
        "mrp": 6995.0,
        "priority": 85.0,
        "discovery_method": "bestseller",
    },
    {
        "asin": "B0863TXGM3",
        "url": "https://www.amazon.in/dp/B0863TXGM3",
        "merchant": "Amazon",
        "category": "Headphones",
        "title": "Sony WH-1000XM4 Noise Cancelling Headphones",
        "price": 19990.0,
        "mrp": 29990.0,
        "priority": 80.0,
        "discovery_method": "bestseller",
    },
    # Intentional duplicate of candidate #1 to test deduplication
    {
        "asin": "B0D14BB5XY",
        "url": "https://www.amazon.in/dp/B0D14BB5XY?ref_=chk_dup",
        "merchant": "Amazon",
        "category": "Appliances",
        "title": "PHILIPS Air Fryer NA120/00 (Duplicate)",
        "priority": 85.0,
        "discovery_method": "bestseller",
    },
    # Intentional malformed candidate to test rejection
    {
        "asin": "",
        "url": "https://www.amazon.in/broken-path-no-asin",
        "merchant": "Amazon",
        "title": "Malformed Amazon Item",
        "priority": 10.0,
    },
    {
        "asin": "B0CX2533TN",
        "url": "https://www.amazon.in/dp/B0CX2533TN",
        "merchant": "Amazon",
        "category": "Smartphones",
        "title": "OnePlus Nord CE4 Lite 5G",
        "price": 17999.0,
        "mrp": 20999.0,
        "priority": 75.0,
        "discovery_method": "curated",
    },
]


class AmazonDiscoverySource(DiscoverySource):
    """
    Amazon India Discovery Adapter with Provider Abstraction.
    Prioritizes official CreatorsAPIProvider if available, falling back to AmazonWebDiscoveryProvider.
    Maintains full backward compatibility with controlled fixture mode.
    """
    source_name: str = "amazon"
    source_type: str = "category"
    discovery_method: str = "bestseller"

    def __init__(
        self,
        providers: Optional[List[DiscoveryProvider]] = None,
        fixture_items: Optional[List[Dict[str, Any]]] = None,
        use_fixture: bool = True,
    ):
        self.use_fixture = use_fixture or (fixture_items is not None)
        self.raw_items: List[Dict[str, Any]] = (
            fixture_items if fixture_items is not None else list(AMAZON_FIXTURE_CANDIDATES)
        )
        if providers is not None:
            self.providers = providers
        else:
            self.providers = [
                CreatorsAPIProvider(),
                AmazonWebDiscoveryProvider(),
            ]

    def dedupe_key(self, product_id: str) -> str:
        """Canonical dedupe key: amazon:{ASIN}"""
        return f"amazon:{product_id.strip().upper()}"

    def source_metadata(self) -> Dict[str, Any]:
        """Preserves source name, type, and discovery method metadata."""
        return {
            "source_name": self.source_name,
            "source_type": self.source_type,
            "discovery_method": self.discovery_method,
            "merchant": "Amazon",
        }

    def normalize_candidate(self, raw: Dict[str, Any]) -> Optional[CandidatePayload]:
        """
        Normalizes a raw Amazon candidate item into a verified CandidatePayload.
        Enforces 10-character ASIN validation and canonical dedupe key.
        Preserves complete provenance including category and query.
        """
        url = raw.get("url") or raw.get("candidate_url")
        if not url or not isinstance(url, str) or not url.strip():
            return None

        asin_val = raw.get("asin") if raw.get("asin") is not None else raw.get("merchant_product_id")
        asin = str(asin_val).strip().upper() if asin_val is not None else ""
        # Fallback to URL ASIN extraction if not provided directly
        if not asin or len(asin) != 10:
            import re
            m = re.search(r"/(?:dp|gp/product|d)/([A-Z0-9]{10})", url, re.IGNORECASE)
            if m:
                asin = m.group(1).upper()

        # If ASIN cannot be extracted, candidate is malformed
        if not asin or len(asin) != 10:
            logger.debug(f"Rejecting malformed Amazon candidate (invalid ASIN): {url}")
            return None

        clean_url = f"https://www.amazon.in/dp/{asin}"
        now_utc = datetime.now(timezone.utc)

        try:
            return CandidatePayload(
                candidate_url=url.strip(),
                clean_url=clean_url,
                merchant="Amazon",
                merchant_product_id=asin,
                dedupe_key=self.dedupe_key(asin),
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
            logger.warning(f"Error normalizing Amazon candidate {url}: {e}")
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

        logger.info(f"AmazonDiscoverySource produced {len(payloads)} CandidatePayloads from fixture inputs.")
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

            # Try providers in order
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

            # Normalize and deduplicate results
            for raw in query_raw_items:
                raw.setdefault("priority", priority)
                payload = self.normalize_candidate(raw)
                if payload and payload.dedupe_key not in seen_keys:
                    seen_keys.add(payload.dedupe_key)
                    payloads.append(payload)

        logger.info(
            f"AmazonDiscoverySource completed live discovery run: {len(payloads)} unique candidates from {len(active_queries)} queries."
        )
        return payloads
