"""
Curated Seed Discovery Source for DealSense.
Consumes controlled JSON / configuration items and emits structured CandidatePayload objects
without performing any network scraping.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

from backend.services.discovery.base import DiscoverySource, CandidatePayload

logger = logging.getLogger(__name__)

# Default benchmark seed catalog (5 verified benchmark products)
DEFAULT_CURATED_BENCHMARKS: List[Dict[str, Any]] = [
    {
        "url": "https://www.amazon.in/dp/B0D14BB5XY",
        "merchant": "Amazon",
        "category": "Appliances",
        "title": "PHILIPS Air Fryer NA120/00",
        "priority": 85.0,
    },
    {
        "url": "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Apple iPhone 15 128 GB Black",
        "priority": 90.0,
    },
    {
        "url": "https://www.amazon.in/dp/B0863TXGM3",
        "merchant": "Amazon",
        "category": "Headphones",
        "title": "Sony WH-1000XM4 Wireless Noise Cancelling Headphones",
        "priority": 80.0,
    },
    {
        "url": "https://www.amazon.in/dp/B0CX2533TN",
        "merchant": "Amazon",
        "category": "Smartphones",
        "title": "OnePlus Nord CE4 Lite 5G",
        "priority": 75.0,
    },
    {
        "url": "https://www.flipkart.com/samsung-galaxy-s23-fe-mint-128-gb/p/itm22dfa64be2983?pid=MOBGV2GB6J7YQGWX",
        "merchant": "Flipkart",
        "category": "Smartphones",
        "title": "Samsung Galaxy S23 FE Mint 128 GB",
        "priority": 75.0,
    },
]


class CuratedSeedSource(DiscoverySource):
    """
    Controlled Discovery Source driven strictly by configuration / JSON feeds.
    Produces CandidatePayload objects for initial catalog bootstrapping.
    No scraping is performed by this source.
    """
    source_name: str = "curated_seed"
    source_type: str = "curated_seed"

    def __init__(
        self,
        seed_items: Optional[List[Dict[str, Any]]] = None,
        json_path: Optional[str] = None,
    ):
        self.raw_items: List[Dict[str, Any]] = []

        if seed_items is not None:
            self.raw_items = seed_items
        elif json_path:
            p = Path(json_path)
            if p.exists():
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            self.raw_items = data
                except Exception as e:
                    logger.error(f"Failed to load curated seeds from {json_path}: {e}")
        else:
            self.raw_items = list(DEFAULT_CURATED_BENCHMARKS)

    def fetch_candidates(self) -> List[CandidatePayload]:
        """
        Validates raw configuration items and yields CandidatePayload records.
        """
        payloads: List[CandidatePayload] = []
        for item in self.raw_items:
            url = item.get("url") or item.get("candidate_url")
            if not url or not isinstance(url, str):
                logger.debug(f"Skipping malformed curated seed item: {item}")
                continue

            try:
                payload = CandidatePayload(
                    candidate_url=url.strip(),
                    merchant=item.get("merchant"),
                    category_hint=item.get("category"),
                    title_hint=item.get("title"),
                    price_hint=item.get("price"),
                    mrp_hint=item.get("mrp"),
                    discovery_priority=float(item.get("priority", 50.0)),
                    source_name=self.source_name,
                )
                payloads.append(payload)
            except Exception as e:
                logger.warning(f"Error parsing curated seed item {url}: {e}")

        logger.info(f"CuratedSeedSource produced {len(payloads)} valid CandidatePayloads.")
        return payloads
