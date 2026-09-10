"""
DealSense Autonomous Discovery Orchestrator.
Coordinates live discovery sources (Amazon, Flipkart, CuratedSeed), manages candidate queue intake,
and executes discovery worker cycles while maintaining strict boundaries against price fabrication
and premature deal promotion.
"""
from datetime import datetime, timezone
import logging
from typing import Dict, Any, List, Optional
from sqlmodel import Session, select

from backend.config import settings
from backend.database import get_session
from backend.models import DiscoveryCandidate, MerchantListing, Product, PriceObservation
from backend.services.discovery.base import DiscoverySource, CandidatePayload
from backend.services.discovery.sources.amazon import AmazonDiscoverySource
from backend.services.discovery.sources.flipkart import FlipkartDiscoverySource
from backend.services.discovery.sources.curated_seed import CuratedSeedSource
from backend.services.discovery.queue import queue_service
from backend.services.discovery.worker import discovery_worker

logger = logging.getLogger(__name__)


class DiscoveryOrchestrator:
    """
    Central coordinator for DealSense Product Universe candidate discovery.
    """

    def __init__(
        self,
        sources: Optional[List[DiscoverySource]] = None,
    ):
        if sources is not None:
            self.sources = sources
        else:
            self.sources = [
                AmazonDiscoverySource(use_fixture=False),
                FlipkartDiscoverySource(use_fixture=False),
            ]

    def discover_and_enqueue(
        self,
        max_queries_per_source: Optional[int] = None,
        candidates_per_query: Optional[int] = None,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Executes candidate discovery across all configured sources and enqueues normalized candidates.
        """
        queries_limit = max_queries_per_source or getattr(settings, "DISCOVERY_MAX_QUERIES_PER_RUN", 10)
        query_candidates_limit = candidates_per_query or getattr(settings, "DISCOVERY_MAX_CANDIDATES_PER_QUERY", 20)

        should_close = False
        if session is None:
            session_ctx = get_session()
            session = session_ctx.__enter__()
            should_close = True

        results: Dict[str, Any] = {
            "sources": {},
            "total_raw_candidates": 0,
            "total_enqueued": 0,
            "total_duplicates": 0,
        }

        try:
            for source in self.sources:
                source_name = getattr(source, "source_name", "unknown")
                logger.info(f"Orchestrating candidate discovery for source: {source_name} (max_queries={queries_limit})")

                try:
                    if hasattr(source, "discover_candidates"):
                        payloads = source.discover_candidates(
                            max_queries=queries_limit,
                            candidates_per_query=query_candidates_limit,
                        )
                    else:
                        payloads = source.fetch_candidates()
                except Exception as e:
                    logger.error(f"Error executing discovery on source {source_name}: {e}")
                    results["sources"][source_name] = {
                        "status": "ERROR",
                        "error": str(e),
                        "raw_candidates": 0,
                        "enqueued": 0,
                        "duplicates": 0,
                    }
                    continue

                raw_count = len(payloads)
                enqueued_count = 0
                duplicate_count = 0

                for payload in payloads:
                    # Check if candidate already exists in queue/DB
                    dedupe_key = payload.dedupe_key
                    existing = session.exec(
                        select(DiscoveryCandidate).where(DiscoveryCandidate.dedupe_key == dedupe_key)
                    ).first()

                    if existing:
                        duplicate_count += 1
                    else:
                        enqueued_count += 1

                    queue_service.enqueue(payload, session=session)

                results["sources"][source_name] = {
                    "status": "SUCCESS",
                    "raw_candidates": raw_count,
                    "enqueued": enqueued_count,
                    "duplicates": duplicate_count,
                }
                results["total_raw_candidates"] += raw_count
                results["total_enqueued"] += enqueued_count
                results["total_duplicates"] += duplicate_count

            return results
        finally:
            if should_close:
                session_ctx.__exit__(None, None, None)

    def run_full_orchestration_cycle(
        self,
        max_queries: Optional[int] = None,
        intake_batch_size: int = 20,
    ) -> Dict[str, Any]:
        """
        End-to-end autonomous discovery cycle:
        1. Discover and enqueue candidates.
        2. Execute DiscoveryWorker intake cycle to canonicalize candidates into Product Graph.
        """
        discovery_summary = self.discover_and_enqueue(max_queries_per_source=max_queries)
        worker_summary = discovery_worker.run_discovery_cycle(batch_size=intake_batch_size)

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "discovery": discovery_summary,
            "worker": worker_summary,
        }


# Global default orchestrator
discovery_orchestrator = DiscoveryOrchestrator()
