"""
Flipkart Web Discovery Provider for DealSense.
Executes controlled search and category discovery on Flipkart India.
Strictly rate-limited, query-budgeted, and circuit-breaker protected.
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


class FlipkartWebDiscoveryProvider(DiscoveryProvider):
    """
    Controlled Web Discovery Provider for Flipkart.
    Extracts product search candidates for targeted category queries.
    """
    provider_name: str = "flipkart_web_discovery"
    source_name: str = "flipkart"
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
        Discovers product candidates from Flipkart search results for a specific query.
        """
        breaker = discovery_safety.get_circuit_breaker(self.source_name)
        if not breaker.can_execute():
            logger.warning(
                f"FlipkartWebDiscoveryProvider in cooldown (CircuitBreaker OPEN). Skipping query '{query}'."
            )
            return []

        search_url = f"https://www.flipkart.com/search?q={urllib.parse.quote_plus(query.strip())}"
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

                # Find product URLs with pid parameter: href="...pid=([A-Za-z0-9]+)..."
                pid_pattern = re.compile(r'href="([^"]*[?&]pid=([A-Za-z0-9]+)[^"]*)"', re.IGNORECASE)
                seen_pids = set()

                for match in pid_pattern.finditer(html):
                    raw_href = match.group(1)
                    pid = match.group(2).strip().upper()

                    if pid and pid not in seen_pids and len(pid) >= 8:
                        seen_pids.add(pid)
                        full_url = raw_href if raw_href.startswith("http") else f"https://www.flipkart.com{raw_href}"
                        # Parse title hint from href path if available
                        path_parts = urllib.parse.urlparse(full_url).path.split("/")
                        title_hint = None
                        for p in path_parts:
                            if p and p not in ("p", "itm") and not p.startswith("itm") and len(p) > 3:
                                title_hint = p.replace("-", " ").title()
                                break

                        candidates.append({
                            "pid": pid,
                            "url": full_url,
                            "title": title_hint or f"Flipkart Item {pid}",
                            "category": category,
                            "query": query,
                            "source_name": self.source_name,
                            "source_type": self.source_type,
                            "discovery_method": self.discovery_method,
                        })

                        if len(candidates) >= max_results:
                            break

                breaker.record_success()
                logger.info(
                    f"FlipkartWebDiscoveryProvider discovered {len(candidates)} candidates for query '{query}' ({category})."
                )
                return candidates

        except Exception as e:
            breaker.record_failure(reason=str(e))
            logger.warning(f"FlipkartWebDiscoveryProvider request error for query '{query}': {e}")
            return []
