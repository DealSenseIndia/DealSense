"""
Base provider abstraction for DealSense Autonomous Candidate Discovery.
Allows discovery sources to switch or fall back between official APIs and controlled web search providers.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional


class DiscoveryProvider(ABC):
    """
    Abstract contract for candidate discovery providers.
    """
    provider_name: str
    source_name: str
    source_type: str
    discovery_method: str

    @abstractmethod
    def is_available(self) -> bool:
        """
        Returns True if the provider is configured and available for execution.
        """
        pass

    @abstractmethod
    def discover_query(
        self,
        query: str,
        category: str,
        max_results: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Discovers candidate items for a specific query and category.
        Returns a list of raw candidate dictionaries.
        """
        pass
