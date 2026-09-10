"""
DealSense Autonomous Discovery Engine.
Layer 1 intake pipeline: Candidate deduplication, queue state transitions,
and discovery worker isolation.
"""
from backend.services.discovery.base import (
    CandidatePayload,
    DiscoverySource,
    compute_candidate_dedupe,
)
from backend.services.discovery.queue import CandidateQueueService, queue_service
from backend.services.discovery.worker import DiscoveryWorker, discovery_worker

__all__ = [
    "CandidatePayload",
    "DiscoverySource",
    "compute_candidate_dedupe",
    "CandidateQueueService",
    "queue_service",
    "DiscoveryWorker",
    "discovery_worker",
]
