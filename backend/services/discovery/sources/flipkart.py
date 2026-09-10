"""
Flipkart Discovery Adapter for DealSense.
Operates in CONTROLLED FIXTURE / ADAPTER MODE.
No live web crawling, search crawling, or proxy rotation.
"""
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, parse_qs

from backend.services.discovery.base import DiscoverySource, CandidatePayload

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
    Flipkart Discovery Adapter.
    Initially runs in controlled fixture mode with consistent interface:
    - discover_candidates()
    - normalize_candidate()
    - dedupe_key()
    - source_metadata()
    """
    source_name: str = "flipkart"
    source_type: str = "category"
    discovery_method: str = "popular"

    def __init__(self, fixture_items: Optional[List[Dict[str, Any]]] = None):
        self.raw_items: List[Dict[str, Any]] = (
            fixture_items if fixture_items is not None else list(FLIPKART_FIXTURE_CANDIDATES)
        )

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
        """
        url = raw.get("url") or raw.get("candidate_url")
        if not url or not isinstance(url, str) or not url.strip():
            return None

        pid = (raw.get("pid") or raw.get("merchant_product_id") or "").strip()
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
                title_hint=raw.get("title") or raw.get("title_hint"),
                price_hint=raw.get("price") or raw.get("price_hint"),
                mrp_hint=raw.get("mrp") or raw.get("mrp_hint"),
                discovery_priority=float(raw.get("priority") or raw.get("discovery_priority", 50.0)),
                source_name=self.source_name,
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

        logger.info(f"FlipkartDiscoverySource produced {len(payloads)} CandidatePayloads from {len(self.raw_items)} inputs.")
        return payloads
