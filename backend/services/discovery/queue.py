"""
Discovery Candidate Queue Service for DealSense Autonomous Discovery Engine.
Manages intake lifecycle, deduplication, retry backoff, and state transitions.
"""
from datetime import datetime, timezone, timedelta
import logging
from typing import List, Optional, Dict, Any
from sqlmodel import Session, select, func

from backend.config import settings
from backend.models import DiscoveryCandidate
from backend.services.discovery.base import CandidatePayload, compute_candidate_dedupe

logger = logging.getLogger(__name__)


class CandidateQueueService:
    """
    State machine and queue manager for Discovery Candidates.
    Progression: DISCOVERED -> QUEUED -> PROCESSING -> IDENTIFIED -> OBSERVED -> TRACKING -> DEAL_CANDIDATE
    Failure: PROCESSING -> FAILED -> RETRY -> REJECTED
    """

    def enqueue(
        self,
        payload: CandidatePayload,
        session: Session,
    ) -> DiscoveryCandidate:
        """
        Enqueues a candidate into the discovery queue.
        Enforces Tier 1/Tier 2 deduplication. If already present, returns existing record.
        """
        now_utc = datetime.now(timezone.utc)
        dedupe_key = payload.dedupe_key
        if not dedupe_key:
            dedupe_key, _, _, _ = compute_candidate_dedupe(payload.candidate_url, payload.merchant)

        existing = session.exec(
            select(DiscoveryCandidate).where(DiscoveryCandidate.dedupe_key == dedupe_key)
        ).first()

        if existing:
            logger.debug(f"Candidate already exists in discovery queue: {dedupe_key} (#{existing.id})")
            return existing

        candidate = DiscoveryCandidate(
            dedupe_key=dedupe_key,
            merchant=payload.merchant or "Unknown",
            merchant_product_id=payload.merchant_product_id,
            candidate_url=payload.candidate_url,
            clean_url=payload.clean_url or payload.candidate_url,
            source_name=payload.source_name,
            source_type=getattr(payload, "source_type", "category"),
            discovery_method=getattr(payload, "discovery_method", "bestseller"),
            category_hint=payload.category_hint,
            title_hint=payload.title_hint,
            price_hint=payload.price_hint,
            mrp_hint=payload.mrp_hint,
            discovery_priority=payload.discovery_priority,
            status="QUEUED",
            attempts=0,
            max_attempts=settings.DISCOVERY_MAX_ATTEMPTS,
            last_error=None,
            next_attempt_at=now_utc,
            discovered_at=now_utc,
            created_at=now_utc,
        )
        session.add(candidate)
        session.commit()
        session.refresh(candidate)
        logger.info(f"Enqueued candidate #{candidate.id} ({candidate.merchant}): {candidate.clean_url}")
        return candidate

    def retry_due_candidates(self, session: Session) -> int:
        """
        Transitions due RETRY candidates whose backoff elapsed back to QUEUED.
        """
        now_utc = datetime.now(timezone.utc)
        due_candidates = session.exec(
            select(DiscoveryCandidate).where(
                DiscoveryCandidate.status == "RETRY",
                DiscoveryCandidate.next_attempt_at <= now_utc,
            )
        ).all()

        requeued_count = 0
        for c in due_candidates:
            c.status = "QUEUED"
            session.add(c)
            requeued_count += 1

        if requeued_count > 0:
            session.commit()
            logger.info(f"Re-queued {requeued_count} due candidates for retry.")
        return requeued_count

    def dequeue_batch(
        self,
        batch_size: int = 10,
        session: Optional[Session] = None,
    ) -> List[DiscoveryCandidate]:
        """
        Pulls highest priority candidates due for processing and marks them PROCESSING.
        """
        now_utc = datetime.now(timezone.utc)
        self.retry_due_candidates(session)

        candidates = session.exec(
            select(DiscoveryCandidate)
            .where(
                DiscoveryCandidate.status == "QUEUED",
                (DiscoveryCandidate.next_attempt_at <= now_utc) | (DiscoveryCandidate.next_attempt_at == None),
            )
            .order_by(
                DiscoveryCandidate.discovery_priority.desc(),
                DiscoveryCandidate.created_at.asc(),
            )
            .limit(batch_size)
        ).all()

        for c in candidates:
            c.status = "PROCESSING"
            session.add(c)

        if candidates:
            session.commit()
            for c in candidates:
                session.refresh(c)

        return candidates

    def mark_processing(
        self,
        candidate_id: int,
        session: Session,
    ) -> Optional[DiscoveryCandidate]:
        """Explicitly transitions a candidate to PROCESSING."""
        c = session.get(DiscoveryCandidate, candidate_id)
        if c:
            c.status = "PROCESSING"
            session.add(c)
            session.commit()
            session.refresh(c)
        return c

    def mark_accepted(
        self,
        candidate_id: int,
        product_id: int,
        listing_id: int,
        has_observation: bool,
        session: Session,
    ) -> Optional[DiscoveryCandidate]:
        """
        Transitions candidate to accepted state:
        If real observation is verified: passes IDENTIFIED -> OBSERVED -> TRACKING
        Else: IDENTIFIED
        """
        now_utc = datetime.now(timezone.utc)
        c = session.get(DiscoveryCandidate, candidate_id)
        if not c:
            return None

        c.product_id = product_id
        c.listing_id = listing_id
        c.status = "TRACKING" if has_observation else "IDENTIFIED"
        c.processed_at = now_utc
        c.last_error = None
        session.add(c)
        session.commit()
        session.refresh(c)
        logger.info(f"Candidate #{c.id} marked {c.status} -> Product #{product_id}, Listing #{listing_id}")
        return c

    def mark_failed(
        self,
        candidate_id: int,
        error: str,
        session: Session,
    ) -> Optional[DiscoveryCandidate]:
        """
        Handles ingestion failures with exponential retry backoff.
        PROCESSING -> FAILED -> RETRY (or REJECTED after max attempts).
        """
        now_utc = datetime.now(timezone.utc)
        c = session.get(DiscoveryCandidate, candidate_id)
        if not c:
            return None

        c.attempts += 1
        c.last_error = error

        if c.attempts < c.max_attempts:
            c.status = "RETRY"
            backoff_secs = settings.DISCOVERY_BASE_BACKOFF_SECONDS * (2 ** (c.attempts - 1))
            c.next_attempt_at = now_utc + timedelta(seconds=backoff_secs)
            logger.warning(
                f"Candidate #{c.id} failed attempt {c.attempts}/{c.max_attempts}. "
                f"Retrying in {backoff_secs}s. Error: {error}"
            )
        else:
            c.status = "REJECTED"
            c.next_attempt_at = None
            c.processed_at = now_utc
            logger.error(f"Candidate #{c.id} exceeded max attempts ({c.max_attempts}). REJECTED: {error}")

        session.add(c)
        session.commit()
        session.refresh(c)
        return c

    def mark_rejected(
        self,
        candidate_id: int,
        reason: str,
        session: Session,
    ) -> Optional[DiscoveryCandidate]:
        """Explicitly rejects a candidate (e.g. invalid URL, malformed data)."""
        now_utc = datetime.now(timezone.utc)
        c = session.get(DiscoveryCandidate, candidate_id)
        if not c:
            return None

        c.status = "REJECTED"
        c.last_error = reason
        c.processed_at = now_utc
        c.next_attempt_at = None
        session.add(c)
        session.commit()
        session.refresh(c)
        logger.info(f"Candidate #{c.id} REJECTED: {reason}")
        return c

    def get_queue_stats(self, session: Session) -> Dict[str, Any]:
        """Operational telemetry for discovery candidates."""
        candidates = session.exec(select(DiscoveryCandidate)).all()
        by_status: Dict[str, int] = {}
        for c in candidates:
            by_status[c.status] = by_status.get(c.status, 0) + 1

        total_accepted = (
            by_status.get("TRACKING", 0)
            + by_status.get("OBSERVED", 0)
            + by_status.get("IDENTIFIED", 0)
        )
        total_rejected = by_status.get("REJECTED", 0)
        total_pending = by_status.get("QUEUED", 0) + by_status.get("RETRY", 0) + by_status.get("PROCESSING", 0)

        return {
            "total_candidates": len(candidates),
            "by_status": by_status,
            "total_accepted": total_accepted,
            "total_rejected": total_rejected,
            "total_pending": total_pending,
            "category_seed_budget": settings.CATEGORY_SEED_BUDGET,
            "offer_candidate_budget": settings.OFFER_CANDIDATE_BUDGET,
            "bestseller_candidate_budget": settings.BESTSELLER_CANDIDATE_BUDGET,
            "discovery_target_products": settings.DISCOVERY_TARGET_PRODUCTS,
        }


queue_service = CandidateQueueService()
