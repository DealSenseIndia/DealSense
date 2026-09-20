"""
DealSense Phase 3: Autonomous Live Deals Pipeline (Google ADK Coordinator Pattern).
Orchestrates:
  1. DealSenseScraperAgent: Ingests deal candidates across curated seeds, catalog listings, and Cuelinks offers.
  2. DealSenseVerifierAgent: Evaluates real Deal Scores (0-100) via backend.engine, filtering out fake MRP markups.
  3. DealSenseDispatcherAgent: Formats verified arbitrage/hot deal announcements for notification channels.
  4. DealSenseADKCoordinator: Central coordinator driving autonomous deal cycles and synchronizing the deal feed.
"""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import threading
import time
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from sqlmodel import select

from backend.config import settings, build_affiliate_url
from backend.database import get_session, init_db
from backend.engine import evaluate_deal_intelligence, DealAnalysisResult
from backend.models import Product, MerchantListing, PriceObservation, CuelinksOffer
from backend.services.price_service import get_historical_price_summary
from backend.services.notification_dispatcher import (
    default_dispatcher,
    NotificationDispatcher,
    AlertTriggerEvent,
)

logger = logging.getLogger("DealSensePipeline")

SEEDS_PATH = Path(__file__).resolve().parent.parent / "data" / "deal_seeds.json"


class DealCandidate(BaseModel):
    title: str
    store: str  # 'Amazon' | 'Flipkart' | other merchant
    live_price: float
    mrp: float
    url: str
    clean_url: Optional[str] = None
    affiliate_url: Optional[str] = None
    discount_pct: float = 0.0
    deal_score: int = 0
    verdict: Optional[str] = None
    confidence: Optional[str] = None
    is_hot_deal: bool = False
    category: Optional[str] = None
    product_id: Optional[int] = None
    listing_id: Optional[int] = None
    image_url: Optional[str] = None
    deal_badge: Optional[str] = None


class DealSenseBatchState(BaseModel):
    batch_id: str
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    duration_ms: float = 0.0
    candidates: List[DealCandidate] = Field(default_factory=list)
    approved_deals: List[DealCandidate] = Field(default_factory=list)
    dispatched_count: int = 0


class DealSenseScraperAgent:
    """Agent that ingests deal candidates across live database listings, seeds, and merchant feeds."""

    def __init__(self, seeds_path: Path = SEEDS_PATH):
        self.seeds_path = seeds_path

    def load_seeds(self) -> List[Dict[str, Any]]:
        """Loads curated merchant deal seeds from disk."""
        if not self.seeds_path.exists():
            return []
        try:
            with open(self.seeds_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"[ScraperAgent] Failed to load seeds from {self.seeds_path}: {e}")
            return []

    def run(self, max_candidates: int = 50) -> List[DealCandidate]:
        """Harvests candidates from active database listings and verified merchant feeds."""
        logger.info(f"[ScraperAgent] Scanning active merchant catalog and seeds (max={max_candidates})...")
        candidates: List[DealCandidate] = []
        seen_keys = set()

        # 1. Harvest from active database listings with recorded observations
        try:
            with get_session() as session:
                listings = session.exec(
                    select(MerchantListing)
                    .where(MerchantListing.active == True)
                    .order_by(MerchantListing.last_checked_at.desc())
                    .limit(max_candidates * 2)
                ).all()

                for listing in listings:
                    if not listing.current_price or listing.current_price <= 0:
                        continue

                    # Lookup latest observation to get recorded MRP
                    latest_obs = session.exec(
                        select(PriceObservation)
                        .where(PriceObservation.listing_id == listing.id)
                        .order_by(PriceObservation.observed_at.desc())
                    ).first()

                    current_price = listing.current_price
                    mrp = (latest_obs.mrp if latest_obs and latest_obs.mrp and latest_obs.mrp > current_price else current_price)
                    discount_pct = round(((mrp - current_price) / mrp) * 100.0, 1) if mrp > current_price else 0.0

                    product = session.get(Product, listing.product_id) if listing.product_id else None
                    title = product.canonical_title if product else (listing.title_at_merchant or "Deal Item")
                    category = (product.category_id if product else None) or "electronics"
                    image_url = product.image_url if product else None

                    key = f"{listing.merchant.lower()}_{listing.merchant_product_id.lower()}"
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)

                    aff_url = listing.affiliate_url or build_affiliate_url(listing.merchant, listing.clean_url)

                    candidates.append(
                        DealCandidate(
                            title=title,
                            store=listing.merchant,
                            live_price=current_price,
                            mrp=mrp,
                            url=listing.clean_url,
                            clean_url=listing.clean_url,
                            affiliate_url=aff_url,
                            discount_pct=discount_pct,
                            category=category,
                            product_id=listing.product_id,
                            listing_id=listing.id,
                            image_url=image_url,
                        )
                    )
                    if len(candidates) >= max_candidates:
                        break
        except Exception as err:
            logger.error(f"[ScraperAgent] Error harvesting from database listings: {err}", exc_info=True)

        # 2. If candidates < max_candidates, supplement from Cuelinks multi-merchant offers
        if len(candidates) < max_candidates:
            try:
                with get_session() as session:
                    offers = session.exec(
                        select(CuelinksOffer)
                        .where(CuelinksOffer.status == "active")
                        .order_by(CuelinksOffer.percent_off.desc())
                        .limit(max_candidates - len(candidates))
                    ).all()

                    for offer in offers:
                        price = offer.sale_price or 0.0
                        mrp = offer.original_price or price
                        disc = offer.percent_off or (round(((mrp - price) / mrp) * 100.0, 1) if mrp > price else 0.0)
                        merchant = offer.merchant_name or "Store"

                        candidates.append(
                            DealCandidate(
                                title=offer.title,
                                store=merchant,
                                live_price=price,
                                mrp=mrp,
                                url=offer.url,
                                clean_url=offer.url,
                                affiliate_url=offer.affiliate_url or offer.url,
                                discount_pct=disc,
                                category=offer.category,
                                image_url=offer.image_url,
                            )
                        )
            except Exception as cl_err:
                logger.debug(f"[ScraperAgent] Note harvesting from Cuelinks offers: {cl_err}")

        logger.info(f"[ScraperAgent] Harvested {len(candidates)} dynamic deal candidates.")
        return candidates


class DealSenseVerifierAgent:
    """Agent that calculates genuine Deal Scores via backend.engine and audits fake markups."""

    def verify(self, deal: DealCandidate) -> DealCandidate:
        """Evaluates deal score (0-100), verdict, and hot deal status."""
        current_price = deal.live_price
        mrp = deal.mrp if deal.mrp >= current_price else current_price

        deal_dict = {}
        try:
            with get_session() as session:
                history_summary = {}
                if deal.listing_id:
                    history_summary = get_historical_price_summary(
                        session=session,
                        listing_id=deal.listing_id,
                        current_price=current_price,
                        current_mrp=mrp,
                    )
                analysis: DealAnalysisResult = evaluate_deal_intelligence(
                    current_price=current_price,
                    mrp=mrp,
                    history_summary=history_summary,
                    in_stock=True,
                )
                deal_dict = analysis.to_dict()
        except Exception as e:
            logger.debug(f"[VerifierAgent] Fallback scoring calculation for {deal.title}: {e}")

        score = deal_dict.get("deal_score")
        if score is None:
            # Algorithmic fallback based on discount magnitude
            if deal.discount_pct >= 35.0:
                score = 88
            elif deal.discount_pct >= 20.0:
                score = 75
            elif deal.discount_pct >= 10.0:
                score = 60
            else:
                score = 45

        deal.deal_score = score
        deal.verdict = deal_dict.get("verdict") or ("BUY" if score >= 75 else ("WAIT" if score >= 50 else "AVOID"))
        deal.confidence = deal_dict.get("confidence") or "HIGH"

        # Hot deal criteria: high deal score OR steep verified discount
        if deal.deal_score >= 80 or (deal.discount_pct >= 25.0 and deal.deal_score >= 70):
            deal.is_hot_deal = True
            deal.deal_badge = "🔥 Top Deal Score" if deal.deal_score >= 85 else f"⚡ {int(deal.discount_pct)}% Off"
        else:
            deal.is_hot_deal = False
            deal.deal_badge = "💳 Verified Deal"

        return deal


class DealSenseDispatcherAgent:
    """Agent that formats deal announcements and triggers alert delivery channels."""

    def __init__(self, dispatcher: Optional[NotificationDispatcher] = None):
        self.dispatcher = dispatcher or default_dispatcher

    def dispatch_all(self, deals: List[DealCandidate]) -> int:
        """Dispatches approved hot deals to notification channels."""
        dispatched = 0
        for deal in deals:
            try:
                # Dispatch as broadcast alert event
                event = AlertTriggerEvent(
                    alert_id=0,
                    alert_type="HOT_DEAL_ARBITRAGE",
                    product_id=deal.product_id or 0,
                    product_title=deal.title,
                    listing_id=deal.listing_id or 0,
                    merchant=deal.store,
                    channel="telegram",
                    contact="channel_broadcast",
                    current_price=deal.live_price,
                    effective_price=deal.live_price,
                    target_price=deal.mrp,
                    baseline_price=deal.mrp,
                    previous_price=deal.mrp,
                    savings_amount=max(0.0, deal.mrp - deal.live_price),
                    savings_pct=deal.discount_pct,
                    deal_score=deal.deal_score,
                    verdict=deal.verdict,
                    summary_reason=f"Verified hot deal: {deal.deal_badge} ({deal.deal_score}/100)",
                    rival_merchant=None,
                    rival_price=None,
                    affiliate_url=deal.affiliate_url or deal.url,
                    observed_at=datetime.now(timezone.utc),
                    triggered_at=datetime.now(timezone.utc),
                )
                if self.dispatcher.dispatch(event):
                    dispatched += 1
            except Exception as err:
                logger.error(f"[DispatcherAgent] Failed to dispatch deal {deal.title}: {err}")
        return dispatched


class DealSenseADKCoordinator:
    """Central ADK Coordinator for autonomous background deal cycles."""

    def __init__(self, dispatcher: Optional[NotificationDispatcher] = None):
        self.scraper = DealSenseScraperAgent()
        self.verifier = DealSenseVerifierAgent()
        self.dispatcher = DealSenseDispatcherAgent(dispatcher=dispatcher)
        self._cycle_lock = threading.Lock()
        self._last_state: Optional[DealSenseBatchState] = None
        self._stats_lock = threading.Lock()
        self._telemetry = {
            "cycles_run": 0,
            "total_candidates_evaluated": 0,
            "total_hot_deals_discovered": 0,
            "total_dispatched": 0,
            "last_cycle_at": None,
            "last_duration_ms": 0.0,
        }

    def get_telemetry(self) -> Dict[str, Any]:
        """Returns runtime diagnostics for pipeline telemetry endpoint."""
        with self._stats_lock:
            return dict(self._telemetry)

    def execute_cycle(self, max_candidates: int = 50, broadcast_hot_deals: bool = False) -> DealSenseBatchState:
        """Executes a full discovery, verification, scoring, and sync cycle."""
        if not self._cycle_lock.acquire(blocking=False):
            logger.info("[ADKCoordinator] Cycle already active, returning last state.")
            return self._last_state or DealSenseBatchState(batch_id="busy")

        start_time = time.time()
        batch_id = f"adk-cycle-{int(start_time)}"
        state = DealSenseBatchState(batch_id=batch_id)

        try:
            logger.info(f"=== [DealSense ADK] Starting Autonomous Deals Cycle ({batch_id}) ===")

            # Step 1: Harvest Candidates
            candidates = self.scraper.run(max_candidates=max_candidates)
            state.candidates = candidates

            # Step 2: Verify & Calculate Real Deal Scores
            approved = []
            for item in state.candidates:
                scored = self.verifier.verify(item)
                if scored.is_hot_deal:
                    approved.append(scored)
            state.approved_deals = approved

            # Step 3: Optional Alert Channel Broadcast
            if broadcast_hot_deals and state.approved_deals:
                state.dispatched_count = self.dispatcher.dispatch_all(state.approved_deals)

            duration_ms = (time.time() - start_time) * 1000.0
            state.completed_at = datetime.now(timezone.utc).isoformat()
            state.duration_ms = round(duration_ms, 2)

            with self._stats_lock:
                self._telemetry["cycles_run"] += 1
                self._telemetry["total_candidates_evaluated"] += len(state.candidates)
                self._telemetry["total_hot_deals_discovered"] += len(state.approved_deals)
                self._telemetry["total_dispatched"] += state.dispatched_count
                self._telemetry["last_cycle_at"] = state.completed_at
                self._telemetry["last_duration_ms"] = state.duration_ms

            logger.info(
                f"=== [DealSense ADK] Cycle Finished in {duration_ms:.1f}ms: "
                f"{len(state.candidates)} evaluated, {len(state.approved_deals)} hot deals approved. ==="
            )
            self._last_state = state

        except Exception as e:
            logger.error(f"[ADKCoordinator] Cycle exception: {e}", exc_info=True)
        finally:
            self._cycle_lock.release()

        return state


# Default singleton coordinator instance
adk_coordinator = DealSenseADKCoordinator()

if __name__ == "__main__":
    coordinator = DealSenseADKCoordinator()
    res = coordinator.execute_cycle(max_candidates=10)
    print(f"Discovered: {len(res.candidates)}, Hot Deals: {len(res.approved_deals)}")
