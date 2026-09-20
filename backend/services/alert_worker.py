"""
DealSense Autonomous Price-Drop Alert Dispatcher Worker.
Periodically scans ARMED and COOLDOWN price alerts, evaluates them against
verified merchant pricing and historical benchmarks, and dispatches rich
notifications via Telegram, WhatsApp, and connected alert channels.

Concurrency & Resilience:
- Pure Python background daemon thread
- SQLite WAL mode compatible
- Thread-safe statistics tracking and graceful shutdown
"""

from datetime import datetime, timezone, timedelta
import logging
import threading
import time
from typing import Dict, Any, List, Optional, Set
from sqlmodel import select, or_

from backend.database import get_session
from backend.models import PriceAlert, MerchantListing, Product, PriceObservation
from backend.services.alert_service import (
    evaluate_alerts_for_observation,
    AlertStatus,
)
from backend.engine import (
    evaluate_deal_intelligence,
    DealAnalysisResult,
)
from backend.services.price_service import (
    get_historical_price_summary,
)

from backend.services.notification_dispatcher import (
    default_dispatcher,
    NotificationDispatcher,
    AlertTriggerEvent,
)

logger = logging.getLogger(__name__)


class AlertDispatchWorker:
    """
    Autonomous worker that continuously sweeps active price alerts and
    dispatches notifications when merchant prices drop to or below target levels.
    """

    def __init__(self, poll_interval_seconds: float = 10.0, dispatcher: Optional[NotificationDispatcher] = None):
        self.poll_interval = poll_interval_seconds
        self.dispatcher = dispatcher or default_dispatcher
        self._stop_event = threading.Event()
        self._worker_thread: Optional[threading.Thread] = None
        self._cycle_lock = threading.Lock()

        # Telemetry statistics
        self._stats_lock = threading.Lock()
        self._stats: Dict[str, Any] = {
            "total_cycles": 0,
            "alerts_evaluated_total": 0,
            "alerts_triggered_total": 0,
            "failed_dispatches_total": 0,
            "last_cycle_at": None,
            "last_cycle_duration_ms": 0.0,
            "last_error": None,
        }

    @property
    def is_running(self) -> bool:
        return self._worker_thread is not None and self._worker_thread.is_alive()

    def get_status(self) -> Dict[str, Any]:
        """Returns runtime diagnostics for the alert worker status endpoint."""
        with self._stats_lock:
            stats_copy = dict(self._stats)

        # Count active armed & cooldown alerts in database
        active_counts = {"ARMED": 0, "COOLDOWN": 0, "TOTAL_ACTIVE": 0}
        try:
            with get_session() as session:
                armed = session.exec(
                    select(PriceAlert).where(
                        PriceAlert.status == AlertStatus.ARMED.value,
                        PriceAlert.is_active == True,
                    )
                ).all()
                cooldown = session.exec(
                    select(PriceAlert).where(
                        PriceAlert.status == AlertStatus.COOLDOWN.value,
                        PriceAlert.is_active == True,
                    )
                ).all()
                active_counts["ARMED"] = len(armed)
                active_counts["COOLDOWN"] = len(cooldown)
                active_counts["TOTAL_ACTIVE"] = len(armed) + len(cooldown)
        except Exception as e:
            logger.debug(f"[AlertWorker] Could not query alert counts for status: {e}")

        return {
            "is_running": self.is_running,
            "poll_interval_seconds": self.poll_interval,
            "active_alerts": active_counts,
            "stats": stats_copy,
        }

    def start(self) -> None:
        """Starts the autonomous alert dispatcher loop in a dedicated background thread."""
        if self.is_running:
            logger.info("[AlertWorker] Worker is already running.")
            return

        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._run_loop,
            name="DealSenseAlertWorkerThread",
            daemon=True,
        )
        self._worker_thread.start()
        logger.info("[AlertWorker] Background Alert Dispatcher thread started.")

    def stop(self, timeout: float = 5.0) -> None:
        """Gracefully signals the worker to stop and waits for completion."""
        if not self.is_running:
            return

        logger.info("[AlertWorker] Stopping Alert Dispatcher thread...")
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=timeout)
        self._worker_thread = None
        logger.info("[AlertWorker] Alert Dispatcher thread stopped.")

    def run_cycle(self) -> List[AlertTriggerEvent]:
        """
        Executes a single sweep across all active ARMED/COOLDOWN alerts.
        Can be called manually or scheduled via the background thread loop.
        """
        if not self._cycle_lock.acquire(blocking=False):
            logger.debug("[AlertWorker] Cycle already in progress, skipping overlapping sweep.")
            return []

        start_time = time.time()
        emitted_events: List[AlertTriggerEvent] = []
        alerts_evaluated = 0

        try:
            with get_session() as session:
                # 1. Fetch all active alerts eligible for evaluation
                active_alerts = session.exec(
                    select(PriceAlert).where(
                        PriceAlert.status.in_([AlertStatus.ARMED.value, AlertStatus.COOLDOWN.value]),
                        PriceAlert.is_active == True,
                    )
                ).all()

                if not active_alerts:
                    return []

                # Group target items by listing_id and product_id
                evaluated_listings: Set[int] = set()

                for alert in active_alerts:
                    alerts_evaluated += 1
                    listing_id = alert.listing_id
                    product_id = alert.product_id

                    # If no direct listing_id, find the best listing for the product
                    if not listing_id and product_id:
                        listings = session.exec(
                            select(MerchantListing).where(
                                MerchantListing.product_id == product_id,
                                MerchantListing.active == True,
                            )
                        ).all()
                        if listings:
                            # Pick the lowest current_price listing in stock
                            valid = [l for l in listings if l.current_price and l.current_price > 0]
                            if valid:
                                valid.sort(key=lambda l: l.current_price)
                                listing_id = valid[0].id

                    if not listing_id or listing_id in evaluated_listings:
                        continue

                    # Load listing and product details
                    listing = session.get(MerchantListing, listing_id)
                    if not listing or not listing.current_price or listing.current_price <= 0:
                        continue

                    in_stock = listing.availability != "out_of_stock"
                    product = session.get(Product, listing.product_id) if listing.product_id else None
                    product_title = product.canonical_title if product else (alert.product_title or "Product")
                    merchant_name = listing.merchant or "Store"
                    current_price = listing.current_price
                    current_mrp = current_price
                    latest_obs = session.exec(
                        select(PriceObservation)
                        .where(PriceObservation.listing_id == listing_id)
                        .order_by(PriceObservation.observed_at.desc())
                    ).first()
                    if latest_obs and latest_obs.mrp and latest_obs.mrp > 0:
                        current_mrp = latest_obs.mrp


                    # Compute deal intelligence context
                    deal_dict = {}
                    try:
                        history_summary = get_historical_price_summary(
                            session=session,
                            listing_id=listing_id,
                            current_price=current_price,
                            current_mrp=current_mrp,
                        )
                        analysis_result: DealAnalysisResult = evaluate_deal_intelligence(
                            current_price=current_price,
                            mrp=current_mrp,
                            history_summary=history_summary,
                            in_stock=in_stock,
                        )
                        deal_dict = analysis_result.to_dict()
                    except Exception as eval_err:
                        logger.debug(f"[AlertWorker] Intelligence note for listing #{listing_id}: {eval_err}")

                    # Evaluate alerts for this listing
                    events = evaluate_alerts_for_observation(
                        listing_id=listing_id,
                        product_id=listing.product_id,
                        current_price=current_price,
                        effective_price=current_price,
                        in_stock=in_stock,
                        deal_score=deal_dict.get("deal_score"),
                        verdict=deal_dict.get("verdict"),
                        confidence=deal_dict.get("confidence"),
                        summary_reason=deal_dict.get("summary_reason"),
                        merchant=merchant_name,
                        product_title=product_title,
                        affiliate_url=listing.clean_url or listing.url,
                        observed_at=datetime.now(timezone.utc),
                        dispatcher=self.dispatcher,
                    )

                    if events:
                        emitted_events.extend(events)

                    evaluated_listings.add(listing_id)

            duration_ms = (time.time() - start_time) * 1000.0

            # Update telemetry stats
            with self._stats_lock:
                self._stats["total_cycles"] += 1
                self._stats["alerts_evaluated_total"] += alerts_evaluated
                self._stats["alerts_triggered_total"] += len(emitted_events)
                self._stats["last_cycle_at"] = datetime.now(timezone.utc).isoformat()
                self._stats["last_cycle_duration_ms"] = round(duration_ms, 2)
                self._stats["last_error"] = None

            if emitted_events:
                logger.info(
                    f"[AlertWorker] Cycle complete in {duration_ms:.1f}ms: "
                    f"evaluated {alerts_evaluated} alerts, triggered {len(emitted_events)} notifications."
                )

        except Exception as exc:
            logger.error(f"[AlertWorker] Error in alert cycle: {exc}", exc_info=True)
            with self._stats_lock:
                self._stats["last_error"] = str(exc)
        finally:
            self._cycle_lock.release()

        return emitted_events

    def _run_loop(self) -> None:
        """Continuous execution loop checking for active alerts on interval."""
        logger.info(f"[AlertWorker] Main loop started (interval={self.poll_interval}s).")
        while not self._stop_event.is_set():
            try:
                self.run_cycle()
            except Exception as e:
                logger.error(f"[AlertWorker] Unexpected exception in loop: {e}", exc_info=True)

            # Responsive wait loop
            if self._stop_event.wait(timeout=self.poll_interval):
                break

        logger.info("[AlertWorker] Main loop exited.")


# Default singleton worker instance
alert_worker = AlertDispatchWorker(poll_interval_seconds=10.0)
