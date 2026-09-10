"""
DealSense Autonomous Candidate Discovery Providers.
"""
from backend.services.discovery.providers.base import DiscoveryProvider
from backend.services.discovery.providers.amazon_creators import CreatorsAPIProvider
from backend.services.discovery.providers.amazon_web import AmazonWebDiscoveryProvider
from backend.services.discovery.providers.flipkart_web import FlipkartWebDiscoveryProvider

__all__ = [
    "DiscoveryProvider",
    "CreatorsAPIProvider",
    "AmazonWebDiscoveryProvider",
    "FlipkartWebDiscoveryProvider",
]
