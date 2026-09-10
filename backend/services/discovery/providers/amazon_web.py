"""
Amazon Web Discovery Provider for DealSense.
Executes controlled search and category discovery on Amazon India.
Strictly rate-limited, query-budgeted, and circuit-breaker protected.
Does NOT perform broad crawling, proxy rotation, or aggressive scraping.
"""
from datetime import datetime, timezone
import logging
import re
from typing import Dict, Any, List, Optional
import urllib.parse

from backend.config import settings
from backend.services.discovery.providers.base import DiscoveryProvider
from backend.services.discovery.safety import discovery_safety

logger = logging.getLogger(__name__)


class AmazonWebDiscoveryProvider(DiscoveryProvider):
    """
    Controlled Web Discovery Provider for Amazon India.
    Extracts product search candidates for targeted category queries.
    """
    provider_name: str = "amazon_web_discovery"
    source_name: str = "amazon"
    source_type: str = "web_search"
    discovery_method: str = "category_query"

    def is_available(self) -> bool:
        return True

    def discover_query(
        self,
        query: str,
        category: str,
        max_results: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Discovers product candidates from Amazon India search results for a specific query.
        """
        breaker = discovery_safety.get_circuit_breaker(self.source_name)
        if not breaker.can_execute():
            logger.warning(
                f"AmazonWebDiscoveryProvider in cooldown (CircuitBreaker OPEN). Skipping query '{query}'."
            )
            return []

        search_url = f"https://www.amazon.in/s?k={urllib.parse.quote_plus(query.strip())}"
        timeout = getattr(settings, "DISCOVERY_REQUEST_TIMEOUT_SECONDS", 10)
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            "Referer": "https://www.google.com/",
        }

        candidates: List[Dict[str, Any]] = []
        try:
            import httpx
            with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as client:
                resp = client.get(search_url)

                if resp.status_code != 200:
                    breaker.record_failure(status_code=resp.status_code, reason=f"HTTP {resp.status_code}")
                    return []

                html = resp.text

                # Detect automated block / CAPTCHA
                if "api-services-support@amazon.com" in html or "Type the characters you see in this image" in html:
                    breaker.record_failure(status_code=403, reason="Amazon CAPTCHA detected")
                    logger.warning(f"Amazon discovery encountered CAPTCHA for query '{query}'. Circuit breaker tripped.")
                    return []

                # Parse search result cards for ASINs
                # Pattern 1: data-asin="B0..."
                asin_pattern = re.compile(r'data-asin="([A-Z0-9]{10})"', re.IGNORECASE)
                found_asins = []
                for match in asin_pattern.finditer(html):
                    asin = match.group(1).upper()
                    if asin and asin != "0000000000" and asin not in found_asins:
                        found_asins.append(asin)

                # Extract titles associated with ASINs or generic search results
                # Build candidate dictionary for each unique ASIN
                for asin in found_asins[:max_results]:
                    # Search for title near ASIN in HTML if possible
                    title_hint = None
                    card_match = re.search(
                        rf'data-asin="{asin}".*?(?:<h2[^>]*>(?:<a[^>]*>)?(?:<span[^>]*>)?([^<]+))',
                        html,
                        re.DOTALL | re.IGNORECASE,
                    )
                    if card_match:
                        raw_title = card_match.group(1).strip()
                        if len(raw_title) > 3:
                            title_hint = raw_title

                    candidates.append({
                        "asin": asin,
                        "url": f"https://www.amazon.in/dp/{asin}",
                        "title": title_hint or f"Amazon Item {asin}",
                        "category": category,
                        "query": query,
                        "source_name": self.source_name,
                        "source_type": self.source_type,
                        "discovery_method": self.discovery_method,
                    })

                breaker.record_success()
                logger.info(
                    f"AmazonWebDiscoveryProvider discovered {len(candidates)} candidates for query '{query}' ({category})."
                )
                return candidates

        except Exception as e:
            breaker.record_failure(reason=str(e))
            logger.warning(f"AmazonWebDiscoveryProvider request error for query '{query}': {e}")
            return []
