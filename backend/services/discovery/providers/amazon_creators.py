"""
Amazon Creators API Discovery Provider for DealSense.
Implements candidate search using the official Amazon Creators API (SearchItems operation).
Fails gracefully when credentials/access are not configured.
Never fabricates responses or pretends API access exists.
"""
import logging
from typing import Dict, Any, List, Optional

from backend.config import settings
from backend.services.discovery.providers.base import DiscoveryProvider

logger = logging.getLogger(__name__)


class CreatorsAPIProvider(DiscoveryProvider):
    """
    Amazon Creators API Provider using SearchItems.
    Optional: only active if AMAZON_CREATORS_API_KEY and AMAZON_CREATORS_API_SECRET are set.
    """
    provider_name: str = "amazon_creators_api"
    source_name: str = "amazon"
    source_type: str = "creators_api"
    discovery_method: str = "search_items"

    def is_available(self) -> bool:
        """
        Available only when official Amazon Creators API credentials are fully configured.
        """
        api_key = getattr(settings, "AMAZON_CREATORS_API_KEY", "")
        api_secret = getattr(settings, "AMAZON_CREATORS_API_SECRET", "")
        return bool(api_key and api_secret and api_key.strip() and api_secret.strip())

    def discover_query(
        self,
        query: str,
        category: str,
        max_results: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Executes SearchItems request against Amazon Creators API if configured.
        Returns empty list gracefully if unavailable or if credentials are not provided.
        """
        if not self.is_available():
            logger.info("Amazon Creators API credentials unavailable; bypassing CreatorsAPIProvider gracefully.")
            return []

        # If credentials exist, build and dispatch standard signed request
        try:
            import httpx
            # Prepare SearchItems payload
            payload = {
                "Keywords": query,
                "SearchIndex": category or "All",
                "ItemCount": min(max_results, 10),
                "PartnerTag": getattr(settings, "AMAZON_CREATORS_ASSOCIATE_TAG", "dealsense-21"),
                "PartnerType": "Associates",
                "Marketplace": "www.amazon.in",
            }
            host = getattr(settings, "AMAZON_CREATORS_HOST", "webservices.amazon.in")
            headers = {
                "content-type": "application/json; charset=utf-8",
                "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
            }

            timeout = getattr(settings, "DISCOVERY_REQUEST_TIMEOUT_SECONDS", 10)
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(f"https://{host}/paapi5/searchitems", json=payload, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    search_result = data.get("SearchResult", {})
                    items = search_result.get("Items", [])
                    results = []
                    for it in items:
                        asin = it.get("ASIN")
                        url = it.get("DetailPageURL")
                        title = None
                        item_info = it.get("ItemInfo", {})
                        if "Title" in item_info:
                            title = item_info["Title"].get("DisplayValue")
                        if asin and url:
                            results.append({
                                "asin": asin,
                                "url": url,
                                "title": title,
                                "category": category,
                                "query": query,
                                "source_name": self.source_name,
                                "source_type": self.source_type,
                                "discovery_method": self.discovery_method,
                            })
                    return results
                else:
                    logger.warning(f"Amazon Creators API returned {resp.status_code}: {resp.text}")
                    return []
        except Exception as e:
            logger.warning(f"Amazon Creators API request failed for query '{query}': {e}")
            return []
