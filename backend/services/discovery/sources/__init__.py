"""
Discovery source adapters for DealSense.
"""
from backend.services.discovery.sources.curated_seed import CuratedSeedSource
from backend.services.discovery.sources.amazon import AmazonDiscoverySource
from backend.services.discovery.sources.flipkart import FlipkartDiscoverySource

__all__ = [
    "CuratedSeedSource",
    "AmazonDiscoverySource",
    "FlipkartDiscoverySource",
]

