"""
DealSense Autonomous Discovery Engine.
Layer 2B: Live Candidate Discovery, Provider Abstractions, Category Registry,
Circuit Breaker Safety, and Discovery Orchestrator.
"""
from backend.services.discovery.base import (
    CandidatePayload,
    DiscoverySource,
    DiscoveryObservation,
    compute_candidate_dedupe,
)
from backend.services.discovery.queue import CandidateQueueService, queue_service
from backend.services.discovery.worker import DiscoveryWorker, discovery_worker
from backend.services.discovery.sources import (
    CuratedSeedSource,
    AmazonDiscoverySource,
    FlipkartDiscoverySource,
)
from backend.services.discovery.categories import (
    CategoryDefinition,
    CategoryRegistry,
    category_registry,
)
from backend.services.discovery.safety import (
    CircuitBreaker,
    DiscoverySafetyManager,
    discovery_safety,
)
from backend.services.discovery.providers import (
    DiscoveryProvider,
    CreatorsAPIProvider,
    AmazonWebDiscoveryProvider,
    FlipkartWebDiscoveryProvider,
)
from backend.services.discovery.orchestrator import (
    DiscoveryOrchestrator,
    discovery_orchestrator,
)
from backend.services.discovery.analytics import get_discovery_analytics

__all__ = [
    "CandidatePayload",
    "DiscoverySource",
    "DiscoveryObservation",
    "compute_candidate_dedupe",
    "CandidateQueueService",
    "queue_service",
    "DiscoveryWorker",
    "discovery_worker",
    "CuratedSeedSource",
    "AmazonDiscoverySource",
    "FlipkartDiscoverySource",
    "CategoryDefinition",
    "CategoryRegistry",
    "category_registry",
    "CircuitBreaker",
    "DiscoverySafetyManager",
    "discovery_safety",
    "DiscoveryProvider",
    "CreatorsAPIProvider",
    "AmazonWebDiscoveryProvider",
    "FlipkartWebDiscoveryProvider",
    "DiscoveryOrchestrator",
    "discovery_orchestrator",
    "get_discovery_analytics",
]
