"""
Autonomous Discovery Worker for DealSense.
Separated from the ObservationWorker:
- DiscoveryWorker discovers, normalizes, and ingests new catalog candidate URLs.
- ObservationWorker handles recurring price polling on established listings.
"""
from datetime import datetime, timezone, timedelta
import logging
from typing import Dict, Any, List, Optional, Tuple
from sqlmodel import Session, select

from backend.database import get_session
from backend.models import DiscoveryCandidate, MerchantListing, Product, PriceObservation
from backend.services.merchant_adapters import adapter_registry
from backend.services.ingestion_service import ingest_product_from_url
from backend.services.observation_service import determine_listing_priority, TIER_INTERVALS
from backend.services.discovery.queue import queue_service

logger = logging.getLogger(__name__)


class DiscoveryWorker:
    """
    Autonomous candidate processing worker.
    Processes queued candidates into canonical Products, ProductVariants, and MerchantListings.
    Never fabricates synthetic price observations or DealCandidate records.
    """

    def process_candidate(
        self,
        candidate: DiscoveryCandidate,
        session: Session,
    ) -> Tuple[bool, str]:
        """
        Processes a single DiscoveryCandidate through the intake pipeline:
        1. Resolves and normalizes merchant URL.
        2. Detects existing MerchantListing to prevent duplicate listing creation.
        3. Invokes canonical ingestion pipeline if new.
        4. Schedules normal observation priority on the resulting listing.
        5. Progresses candidate through state machine.
        """
        now_utc = datetime.now(timezone.utc)

        # 1. Resolve and normalize candidate URL
        adapter, normalized = adapter_registry.resolve_url(candidate.candidate_url.strip())
        if not adapter or not normalized:
            queue_service.mark_rejected(
                candidate_id=candidate.id,
                reason="Unsupported merchant or unresolvable product URL",
                session=session,
            )
            return False, "UNSUPPORTED_MERCHANT"

        # 2. Check for existing MerchantListing (Tier 1 & Tier 2 Duplicate Prevention)
        existing_listing = session.exec(
            select(MerchantListing).where(
                MerchantListing.merchant_product_id == normalized.product_id,
            )
        ).first()

        if existing_listing:
            product_id = existing_listing.product_id
            # Verify if any real PriceObservation exists for this listing
            obs_exists = session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == existing_listing.id)
            ).first() is not None

            # Schedule standard observation priority if unassigned
            priority = determine_listing_priority(existing_listing.id, product_id)
            interval = TIER_INTERVALS.get(priority, 8 * 3600)
            existing_listing.refresh_priority = priority
            if not existing_listing.next_check_at:
                existing_listing.next_check_at = now_utc + timedelta(seconds=interval)
            session.add(existing_listing)
            session.commit()

            # Mark accepted without creating duplicate listing
            queue_service.mark_accepted(
                candidate_id=candidate.id,
                product_id=product_id,
                listing_id=existing_listing.id,
                has_observation=obs_exists,
                session=session,
            )
            logger.info(
                f"Candidate #{candidate.id} matched existing Listing #{existing_listing.id} "
                f"({existing_listing.merchant}: {normalized.product_id}). Marked ACCEPTED."
            )
            return True, "EXISTING_LISTING_ACCEPTED"

        # 3. Ingest Brand New Product via Canonical Pipeline
        try:
            product, listing, obs, status = ingest_product_from_url(
                raw_url=candidate.candidate_url,
                session=session,
                discovery_source="AUTONOMOUS_DISCOVERY",
            )
        except Exception as e:
            logger.error(f"Ingestion crashed for candidate #{candidate.id} ({candidate.candidate_url}): {e}")
            queue_service.mark_failed(
                candidate_id=candidate.id,
                error=f"Exception in ingestion: {str(e)}",
                session=session,
            )
            return False, f"EXCEPTION: {str(e)}"

        if not product or not listing:
            queue_service.mark_failed(
                candidate_id=candidate.id,
                error=f"Ingestion failed: {status}",
                session=session,
            )
            return False, f"INGESTION_FAILED_{status}"

        # 4. Verify Real Price Observation & Schedule Initial Check
        has_real_obs = (
            obs is not None
            and getattr(obs, "price", None) is not None
            and obs.price > 0
        )

        priority = determine_listing_priority(listing.id, product.id)
        interval = TIER_INTERVALS.get(priority, 8 * 3600)
        listing.refresh_priority = priority
        listing.next_check_at = now_utc + timedelta(seconds=interval)
        session.add(listing)
        session.commit()

        # 5. Progress Candidate State: IDENTIFIED -> OBSERVED -> TRACKING
        queue_service.mark_accepted(
            candidate_id=candidate.id,
            product_id=product.id,
            listing_id=listing.id,
            has_observation=has_real_obs,
            session=session,
        )

        logger.info(
            f"Candidate #{candidate.id} successfully ingested -> "
            f"Product #{product.id}, Listing #{listing.id}, Observed={has_real_obs}"
        )
        return True, f"INGESTED_{status}"

    def run_discovery_cycle(
        self,
        batch_size: int = 10,
        session: Optional[Session] = None,
    ) -> Dict[str, Any]:
        """
        Executes a single discovery intake cycle:
        1. Dequeues highest priority due candidates.
        2. Ingests each through the canonical pipeline.
        3. Emits cycle statistics.
        """
        own_session = False
        if session is None:
            session = get_session()
            own_session = True

        try:
            candidates = queue_service.dequeue_batch(batch_size=batch_size, session=session)
            accepted = 0
            failed = 0
            rejected = 0
            results: List[Dict[str, Any]] = []

            for c in candidates:
                success, reason = self.process_candidate(c, session)
                if success:
                    accepted += 1
                else:
                    # Check if candidate ended up rejected or in retry
                    session.refresh(c)
                    if c.status == "REJECTED":
                        rejected += 1
                    else:
                        failed += 1

                results.append({
                    "candidate_id": c.id,
                    "url": c.candidate_url,
                    "merchant": c.merchant,
                    "status": c.status,
                    "result": reason,
                })

            summary = {
                "dequeued": len(candidates),
                "accepted": accepted,
                "failed": failed,
                "rejected": rejected,
                "results": results,
            }
            logger.info(f"Discovery cycle complete: {summary['accepted']} accepted, {summary['failed']} retry, {summary['rejected']} rejected.")
            return summary
        finally:
            if own_session:
                session.close()


discovery_worker = DiscoveryWorker()
