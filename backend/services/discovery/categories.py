"""
DealSense Category Configuration & Query Registry.
Provides configuration-driven category and search query definitions for autonomous discovery.
Separates category logic completely from workers and ingestion pipelines.
"""
from dataclasses import dataclass, field
import logging
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


@dataclass
class CategoryDefinition:
    """
    Configuration definition for a discoverable category.
    """
    name: str
    priority: int = 50
    enabled: bool = True
    candidate_budget: int = 50
    queries: List[str] = field(default_factory=list)


# 10 Initial Benchmark Categories
INITIAL_CATEGORIES: List[CategoryDefinition] = [
    CategoryDefinition(
        name="smartphones",
        priority=100,
        enabled=True,
        candidate_budget=50,
        queries=[
            "smartphones",
            "5g mobile phones",
            "best camera phone",
            "flagship smartphone",
        ],
    ),
    CategoryDefinition(
        name="monitors",
        priority=95,
        enabled=True,
        candidate_budget=50,
        queries=[
            "gaming monitor",
            "27 inch monitor",
            "4k monitor",
            "144hz monitor",
        ],
    ),
    CategoryDefinition(
        name="laptops",
        priority=95,
        enabled=True,
        candidate_budget=50,
        queries=[
            "gaming laptop",
            "thin and light laptop",
            "macbook",
            "oled laptop",
        ],
    ),
    CategoryDefinition(
        name="GPUs",
        priority=90,
        enabled=True,
        candidate_budget=40,
        queries=[
            "graphics card",
            "rtx 4060",
            "rtx 4070",
            "rx 7600",
        ],
    ),
    CategoryDefinition(
        name="SSD",
        priority=85,
        enabled=True,
        candidate_budget=40,
        queries=[
            "nvme ssd 1tb",
            "gen4 ssd",
            "portable ssd",
            "internal ssd",
        ],
    ),
    CategoryDefinition(
        name="RAM",
        priority=80,
        enabled=True,
        candidate_budget=30,
        queries=[
            "ddr5 ram 16gb",
            "ddr4 ram 16gb",
            "laptop ram ddr5",
        ],
    ),
    CategoryDefinition(
        name="headphones",
        priority=85,
        enabled=True,
        candidate_budget=40,
        queries=[
            "noise cancelling headphones",
            "wireless earbuds",
            "anc headphones",
        ],
    ),
    CategoryDefinition(
        name="smartwatches",
        priority=80,
        enabled=True,
        candidate_budget=40,
        queries=[
            "smartwatch",
            "fitness tracker",
            "amoled smartwatch",
        ],
    ),
    CategoryDefinition(
        name="TVs",
        priority=80,
        enabled=True,
        candidate_budget=40,
        queries=[
            "4k smart tv",
            "55 inch 4k tv",
            "oled tv",
            "qled tv",
        ],
    ),
    CategoryDefinition(
        name="gaming peripherals",
        priority=85,
        enabled=True,
        candidate_budget=40,
        queries=[
            "mechanical keyboard",
            "gaming mouse",
            "wireless gaming headset",
        ],
    ),
]


class CategoryRegistry:
    """
    Registry managing category definitions and query selection for discovery cycles.
    """

    def __init__(self, initial_categories: Optional[List[CategoryDefinition]] = None):
        self._categories: Dict[str, CategoryDefinition] = {}
        cats = initial_categories if initial_categories is not None else INITIAL_CATEGORIES
        for c in cats:
            self.register(c)

    def register(self, cat: CategoryDefinition) -> None:
        self._categories[cat.name.lower()] = cat

    def get(self, name: str) -> Optional[CategoryDefinition]:
        return self._categories.get(name.lower())

    def list_categories(self) -> List[CategoryDefinition]:
        return sorted(self._categories.values(), key=lambda c: c.priority, reverse=True)

    def get_active_categories(self) -> List[CategoryDefinition]:
        return [c for c in self.list_categories() if c.enabled]

    def get_active_queries(self, max_queries: int = 10) -> List[Tuple[str, str, int, int]]:
        """
        Returns a balanced list of (category_name, query, priority, budget) tuples
        ordered by category priority, picking top queries up to max_queries.
        """
        active_cats = self.get_active_categories()
        selected: List[Tuple[str, str, int, int]] = []

        # Round-robin selection from highest priority categories
        query_idx = 0
        while len(selected) < max_queries:
            added_in_round = False
            for cat in active_cats:
                if query_idx < len(cat.queries):
                    q = cat.queries[query_idx]
                    selected.append((cat.name, q, cat.priority, cat.candidate_budget))
                    added_in_round = True
                    if len(selected) >= max_queries:
                        break
            if not added_in_round:
                break
            query_idx += 1

        return selected


# Singleton instance
category_registry = CategoryRegistry()
