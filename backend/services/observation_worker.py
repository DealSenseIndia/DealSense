"""
DealSense Autonomous Price Observation Worker.
Operates a background scheduling and observation loop respecting strict merchant rate limits,
randomized request spacing, priority tiers, and exponential failure backoff.

Concurrency & Rate-Limiting Model:
- Amazon: 1 concurrent request, 6-10s randomized spacing
- Flipkart: 1 concurrent request, 5-8s randomized spacing
- Total network concurrency: max 2
- Pure Python threading + SQLite WAL mode (Zero Redis / Celery)
"""

from datetime import datetime, timezone, timedelta
import logging
import random
import threading
import time
from typing import Dict, Any, List, Optional, Tuple
from sqlmodel import select, Session

from backend.database import get_session
from backend.models import MerchantListing, PriceAlert, PriceObservation
from backend.services.observation_service import (
    observe_listing,
    ObservationStatus,
    ObservationResult,
    TIER_INTERVALS,
    compute_failure_backoff_seconds,
    determine_listing_priority,
)

logger = logging.getLogger(__name__)

# Merchant Spacing Configuration (seconds)
MERCHANT_SPACING = {
    "amazon": (6.0, 10.0),
    "flipkart": (5.0, 8.0),
}


class ObservationWorker:
    """
    Autonomous scheduler managing rate-limited price checks across merchants.
    Runs inside the FastAPI lifespan without blocking the main event loop.
    """

    def __init__(self, poll_interval_seconds: float = 3.0):
        self.poll_interval = poll_interval_seconds
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None

        # Merchant rate-limiting trackers
        self._last_request_time: Dict[str, float] = {"amazon": 0.0, "flipkart": 0.0}
        self._consecutive_blocks: Dict[str, int] = {"amazon": 0, "flipkart": 0}
        self._cooldown_until: Dict[str, float] = {"amazon": 0.0, "flipkart": 0.0}
        self._merchant_locks: Dict[str, threading.Lock] = {
            "amazon": threading.Lock(),
            "flipkart": threading.Lock(),
        }

        # Runtime observability statistics
        self._stats_lock = threading.Lock()
        self._stats = {
            "scanned_today": 0,
            "observations_recorded": 0,
            "failed_today": 0,
            "last_scan_at": None,
            "last_error": None,
        }

    @property
    def is_running(self) -> bool:
        return self._worker_thread is not None and self._worker_thread.is_alive()

    def get_status(self) -> Dict[str, Any]:
        """Returns runtime diagnostics for the /api/worker/status endpoint."""
        now_ts = time.time()
        active_queues = {}
        for m in ("amazon", "flipkart"):
            if now_ts < self._cooldown_until[m]:
                remaining = int(self._cooldown_until[m] - now_ts)
                active_queues[m] = f"cooldown ({remaining}s remaining)"
            else:
                active_queues[m] = "ready"

        with self._stats_lock:
            stats_copy = dict(self._stats)

        return {
            "is_running": self.is_running,
            "active_merchant_queues": active_queues,
            "stats": stats_copy,
        }

    def start(self):
        """Starts the autonomous observation loop in a dedicated background thread."""
        if self.is_running:
            logger.info("ObservationWorker is already running.")
            return

        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._run_loop,
            daemon=True,
            name="ObservationWorkerThread",
        )
        self._worker_thread.start()
        logger.info("ObservationWorker started.")

    def stop(self, timeout: float = 5.0):
        """Gracefully signals the observation worker to stop and waits for active scrape drain."""
        if not self.is_running:
            return

        logger.info("Signaling ObservationWorker to stop...")
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=timeout)
            logger.info("ObservationWorker stopped cleanly.")

    def _get_due_listings(self) -> List[Tuple[int, str, Optional[int]]]:
        """
        Queries active listings due for observation.
        Returns tuples: (listing_id, merchant_slug, product_id)
        """
        now_utc = datetime.now(timezone.utc)
        due = []

        with get_session() as session:
            # Query active listings where next_check_at <= now OR next_check_at is null
            listings = session.exec(
                select(MerchantListing)
                .where(MerchantListing.active == True)
                .order_by(MerchantListing.last_checked_at.asc().nullsfirst())
            ).all()

            for l in listings:
                m_slug = (l.merchant or "").lower()
                if "amazon" in m_slug:
                    slug = "amazon"
                elif "flipkart" in m_slug:
                    slug = "flipkart"
                else:
                    continue

                next_check = getattr(l, "next_check_at", None)
                if next_check:
                    if next_check.tzinfo is None:
                        next_check = next_check.replace(tzinfo=timezone.utc)
                    if next_check > now_utc:
                        continue

                due.append((l.id, slug, l.product_id))

        return due

    def _can_scrape_merchant(self, merchant_slug: str) -> bool:
        """Enforces merchant-specific cooldown and inter-request delay spacing."""
        now_ts = time.time()

        # Check circuit breaker cooldown
        if now_ts < self._cooldown_until[merchant_slug]:
            return False

        # Check inter-request spacing
        spacing_range = MERCHANT_SPACING.get(merchant_slug, (5.0, 8.0))
        last_req = self._last_request_time.get(merchant_slug, 0.0)
        min_spacing = spacing_range[0]

        if now_ts - last_req < min_spacing:
            return False

        return True

    def _record_merchant_request_time(self, merchant_slug: str):
        """Records timestamp with randomized spacing jitter for the merchant."""
        now_ts = time.time()
        spacing_range = MERCHANT_SPACING.get(merchant_slug, (5.0, 8.0))
        jittered_spacing = random.uniform(spacing_range[0], spacing_range[1])
        self._last_request_time[merchant_slug] = now_ts + (jittered_spacing - spacing_range[0])

    def record_manual_check(self, res: ObservationResult):
        """Updates worker telemetry statistics after an observation check."""
        now_utc = res.observed_at or datetime.now(timezone.utc)
        with self._stats_lock:
            self._stats["scanned_today"] += 1
            self._stats["last_scan_at"] = now_utc.isoformat()
            if res.status in (ObservationStatus.SUCCESS, ObservationStatus.UNCHANGED_HEARTBEAT):
                self._stats["observations_recorded"] += 1
            elif res.status not in (ObservationStatus.UNCHANGED_SKIPPED, ObservationStatus.OUT_OF_STOCK):
                self._stats["failed_today"] += 1
                self._stats["last_error"] = res.error_message or str(res.status)

    def _process_listing(self, listing_id: int, merchant_slug: str, product_id: Optional[int]):
        """Executes observation, records statistics, and updates next schedule."""
        lock = self._merchant_locks[merchant_slug]
        if not lock.acquire(blocking=False):
            return  # Concurrency limit: 1 request per merchant at any time

        try:
            self._record_merchant_request_time(merchant_slug)
            res: ObservationResult = observe_listing(listing_id=listing_id)

            # Update Circuit Breaker & Cooldown Tracking
            if res.status in (ObservationStatus.BLOCKED, ObservationStatus.RATE_LIMITED):
                self._consecutive_blocks[merchant_slug] += 1
                if self._consecutive_blocks[merchant_slug] >= 3:
                    logger.warning(f"Merchant '{merchant_slug}' hit 3 consecutive blocks. Pausing requests for 15 minutes.")
                    self._cooldown_until[merchant_slug] = time.time() + (15 * 60)
            elif res.status in (ObservationStatus.SUCCESS, ObservationStatus.UNCHANGED_HEARTBEAT, ObservationStatus.UNCHANGED_SKIPPED):
                self._consecutive_blocks[merchant_slug] = 0

            # Calculate Next Schedule & Failure Backoff
            now_utc = res.observed_at or datetime.now(timezone.utc)
            with get_session() as write_session:
                db_listing = write_session.get(MerchantListing, listing_id)
                if db_listing:
                    if res.status in (ObservationStatus.SUCCESS, ObservationStatus.UNCHANGED_HEARTBEAT, ObservationStatus.UNCHANGED_SKIPPED):
                        priority = determine_listing_priority(listing_id, product_id)
                        db_listing.refresh_priority = priority
                        db_listing.failure_count = 0
                        db_listing.last_error = None
                        interval = TIER_INTERVALS.get(priority, 8 * 3600)
                        db_listing.next_check_at = now_utc + timedelta(seconds=interval)
                    elif res.status == ObservationStatus.OUT_OF_STOCK:
                        db_listing.refresh_priority = "COLD"
                        db_listing.failure_count = 0
                        db_listing.next_check_at = now_utc + timedelta(seconds=TIER_INTERVALS["COLD"])
                    else:
                        f_count = (getattr(db_listing, "failure_count", 0) or 0) + 1
                        db_listing.failure_count = f_count
                        db_listing.last_error = res.error_message or str(res.status)
                        backoff_secs = compute_failure_backoff_seconds(f_count)
                        db_listing.next_check_at = now_utc + timedelta(seconds=backoff_secs)

                    write_session.add(db_listing)
                    write_session.commit()

            # Update Observability Statistics
            self.record_manual_check(res)

        finally:
            lock.release()

    def _run_loop(self):
        """Continuous background execution loop."""
        logger.info("ObservationWorker main loop started.")
        while not self._stop_event.is_set():
            try:
                due_listings = self._get_due_listings()

                for listing_id, merchant_slug, prod_id in due_listings:
                    if self._stop_event.is_set():
                        break

                    if self._can_scrape_merchant(merchant_slug):
                        self._process_listing(listing_id, merchant_slug, prod_id)

                # Idle sleep between poll cycles
                self._stop_event.wait(self.poll_interval)
            except Exception as e:
                logger.error(f"Error in ObservationWorker loop: {e}", exc_info=True)
                self._stop_event.wait(5.0)

        logger.info("ObservationWorker main loop exited.")


# Global singleton worker instance
worker = ObservationWorker()
