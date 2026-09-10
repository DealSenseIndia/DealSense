"""
DealSense Product Universe Service.
Orchestrates discovery telemetry events, lifecycle state machine transitions,
deterministic priority scoring, and priority propagation to merchant listings.
"""

from datetime import datetime, timezone, timedelta
import logging
from typing import Dict, Any, Optional, List, Tuple, Union
from sqlmodel import Session, select, func

from backend.database import get_session
from backend.models import (
    Product,
    MerchantListing,
    PriceObservation,
    PriceAlert,
    ProductDiscoveryEvent,
)
from backend.services.observation_service import TIER_INTERVALS

logger = logging.getLogger(__name__)

# Deduplication window for identical (product_id, session_id, source) interaction events
EVENT_DEDUPLICATION_MINUTES = 15

# Deterministic Priority Thresholds
HOT_THRESHOLD = 70.0
ACTIVE_THRESHOLD = 40.0
NORMAL_THRESHOLD = 15.0


class PriorityResult(dict):
    """
    Dual-interface priority result:
    - Dictionary: res["priority"], res["score"], res["breakdown"]
    - Tuple unpacking: score, priority = calculate_product_priority(...)
    - Attribute access: res.score, res.priority, res.breakdown
    """

    def __init__(self, score: float, priority: str, breakdown: Dict[str, Any]):
        super().__init__(score=score, priority=priority, breakdown=breakdown)
        self.score = score
        self.priority = priority
        self.breakdown = breakdown

    def __iter__(self):
        return iter((self.score, self.priority))


def record_discovery_event(
    product_id: int,
    source: str,
    listing_id: Optional[int] = None,
    query_text: Optional[str] = None,
    session: Optional[Session] = None,
    session_id: Optional[str] = None,
) -> Optional[ProductDiscoveryEvent]:
    """
    Records a canonical ProductDiscoveryEvent with sliding-window deduplication.
    Uses product_id, listing_id, source, query_text, and created_at only (zero user fingerprinting).
    Updates product interaction recency and triggers priority propagation.
    Returns None if the interaction is deduplicated within the 15-minute sliding window.
    """
    def _execute(s: Session) -> Optional[ProductDiscoveryEvent]:
        now_utc = datetime.now(timezone.utc)
        product = s.get(Product, product_id)
        if not product:
            logger.warning(f"[UNIVERSE] Cannot record discovery event for non-existent product #{product_id}")
            return None

        # 1. Sliding Window Deduplication (15 minutes per product_id and source)
        window_start = now_utc - timedelta(minutes=EVENT_DEDUPLICATION_MINUTES)
        recent_duplicate = s.exec(
            select(ProductDiscoveryEvent).where(
                ProductDiscoveryEvent.product_id == product_id,
                ProductDiscoveryEvent.source == source,
                ProductDiscoveryEvent.created_at >= window_start,
            )
        ).first()
        if recent_duplicate:
            # Refresh product interaction recency without inserting duplicate event
            product.last_interacted_at = now_utc
            s.add(product)
            s.commit()
            return None

        # 2. Persist new Discovery Event without fingerprinting
        event = ProductDiscoveryEvent(
            product_id=product_id,
            listing_id=listing_id,
            source=source,
            query_text=query_text.strip() if query_text else None,
            created_at=now_utc,
        )
        s.add(event)

        # 3. Update Product Interaction Telemetry & Lifecycle State
        product.last_interacted_at = now_utc
        product.discovery_score = (product.discovery_score or 0.0) + 1.0
        if product.lifecycle_status in ("DISCOVERED", "COLD"):
            product.lifecycle_status = "ACTIVE"
        s.add(product)
        s.commit()

        # 4. Propagate Priority to Merchant Listings
        propagate_product_priority(product_id=product_id, session=s)
        return event

    if session:
        return _execute(session)
    with get_session() as new_session:
        return _execute(new_session)


def calculate_product_priority(
    product_id: Union[int, Session],
    session: Optional[Session] = None,
) -> PriorityResult:
    """
    Calculates deterministic priority score (0-100+) and tier (HOT, ACTIVE, NORMAL, COLD).
    Accepts either (product_id, session=...) or (session, product_id).

    Inputs:
    - Active user price alerts (+50 pts)
    - Traffic recency (<24h: +30 pts, <7d: +15 pts, <30d: +5 pts)
    - Price volatility in last 14 days (>=20% swing or >=3 distinct prices: +25 pts, >=5% swing: +10 pts)
    - Repeat discovery events (+10 pts per event, capped at +30)
    - Deal quality (significant discount vs MRP >=25%: +20 pts, >=10%: +10 pts)
    NOTE: Star ratings are explicitly excluded from observation-priority scoring.
    """
    # Normalize argument order
    if isinstance(product_id, Session):
        s = product_id
        pid = session  # type: ignore
    else:
        pid = product_id
        s = session

    def _execute(sess: Session) -> PriorityResult:
        product = sess.get(Product, pid)
        if not product:
            return PriorityResult(score=0.0, priority="COLD", breakdown={})

        now_utc = datetime.now(timezone.utc)
        breakdown: Dict[str, Any] = {
            "active_alert": 0.0,
            "recent_interaction": 0.0,
            "price_volatility": 0.0,
            "repeat_discovery": 0.0,
            "deal_quality": 0.0,
        }

        # Check listings & stock
        listings = sess.exec(
            select(MerchantListing).where(MerchantListing.product_id == pid)
        ).all()

        # 1. Active Price Alerts (+50 pts)
        has_active_alert = sess.exec(
            select(PriceAlert).where(
                PriceAlert.product_id == pid,
                PriceAlert.is_active == True,
            )
        ).first() is not None

        if has_active_alert:
            breakdown["active_alert"] = 50.0

        # Stock check: if listings exist and all are out of stock (and no active alert), degrade to COLD
        if listings:
            any_in_stock = any(l.availability != "out_of_stock" for l in listings)
            if not any_in_stock and not has_active_alert:
                return PriorityResult(score=0.0, priority="COLD", breakdown={"out_of_stock": 0.0})

        # 2. Interaction Recency & Freshness
        last_seen = product.last_interacted_at or product.created_at
        if last_seen:
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            delta = now_utc - last_seen
            if delta <= timedelta(hours=24):
                breakdown["recent_interaction"] = 30.0
            elif delta <= timedelta(days=7):
                breakdown["recent_interaction"] = 15.0
            elif delta <= timedelta(days=30):
                breakdown["recent_interaction"] = 5.0

        # 3. Price Volatility in Last 14 Days
        fourteen_days_ago = now_utc - timedelta(days=14)
        listing_ids = [l.id for l in listings if l.id is not None]
        if listing_ids:
            recent_obs = sess.exec(
                select(PriceObservation).where(
                    PriceObservation.listing_id.in_(listing_ids),
                    PriceObservation.observed_at >= fourteen_days_ago,
                )
            ).all()
            prices = [round(o.price, 2) for o in recent_obs if o.price and o.price > 0]
            distinct_prices = set(prices)
            if len(prices) >= 2:
                min_p = min(prices)
                max_p = max(prices)
                pct_swing = ((max_p - min_p) / min_p) * 100 if min_p > 0 else 0
                if pct_swing >= 20.0 or len(distinct_prices) >= 3:
                    breakdown["price_volatility"] = 25.0
                elif pct_swing >= 5.0 or len(distinct_prices) == 2:
                    breakdown["price_volatility"] = 10.0

        # 4. Repeat Discovery / Interactions (Discovery Activity)
        event_count = sess.exec(
            select(func.count(ProductDiscoveryEvent.id)).where(ProductDiscoveryEvent.product_id == pid)
        ).one()
        if event_count:
            breakdown["repeat_discovery"] = min(30.0, float(event_count * 10.0))

        # 5. Deal Quality (from latest observation discount vs MRP)
        if listing_ids:
            latest_obs = sess.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id.in_(listing_ids))
                .order_by(PriceObservation.observed_at.desc())
            ).first()
            if latest_obs and latest_obs.price and latest_obs.mrp and latest_obs.mrp > latest_obs.price:
                discount_pct = ((latest_obs.mrp - latest_obs.price) / latest_obs.mrp) * 100
                if discount_pct >= 25.0:
                    breakdown["deal_quality"] = 20.0
                elif discount_pct >= 10.0:
                    breakdown["deal_quality"] = 10.0

        total_score = sum(breakdown.values())

        # Determine Tier
        if has_active_alert or total_score >= HOT_THRESHOLD:
            tier = "HOT"
        elif total_score >= ACTIVE_THRESHOLD:
            tier = "ACTIVE"
        elif total_score >= NORMAL_THRESHOLD:
            tier = "NORMAL"
        else:
            tier = "COLD"

        return PriorityResult(score=total_score, priority=tier, breakdown=breakdown)

    if s:
        return _execute(s)
    with get_session() as new_session:
        return _execute(new_session)


def propagate_product_priority(
    product_id: Union[int, Session],
    session: Optional[Session] = None,
) -> PriorityResult:
    """
    Evaluates product priority score and propagates tier to all linked MerchantListings.
    Reschedules next_check_at to now() if priority escalates, awakening the worker.
    Accepts either (product_id, session=...) or (session, product_id).
    """
    if isinstance(product_id, Session):
        s = product_id
        pid = session  # type: ignore
    else:
        pid = product_id
        s = session

    def _execute(sess: Session) -> PriorityResult:
        priority_info = calculate_product_priority(pid, session=sess)
        tier = priority_info.priority
        score = priority_info.score
        now_utc = datetime.now(timezone.utc)

        product = sess.get(Product, pid)
        if product and product.lifecycle_status != "ARCHIVED":
            product.discovery_score = score
            if tier in ("HOT", "ACTIVE"):
                product.lifecycle_status = "ACTIVE"
            elif tier == "NORMAL":
                if product.lifecycle_status not in ("ACTIVE", "OBSERVING"):
                    product.lifecycle_status = "NORMAL"
            elif tier == "COLD":
                if product.lifecycle_status not in ("ACTIVE", "OBSERVING"):
                    product.lifecycle_status = "COLD"
            sess.add(product)

        # Propagate to listings
        listings = sess.exec(
            select(MerchantListing).where(MerchantListing.product_id == pid)
        ).all()

        for l in listings:
            target_priority = tier
            if l.availability == "out_of_stock":
                target_priority = "COLD"

            old_priority = l.refresh_priority
            l.refresh_priority = target_priority

            # If escalated to HOT or ACTIVE, reschedule immediately so worker inspects
            if target_priority in ("HOT", "ACTIVE") and old_priority not in ("HOT", "ACTIVE"):
                l.next_check_at = now_utc
            else:
                next_chk = l.next_check_at
                if next_chk and next_chk.tzinfo is None:
                    next_chk = next_chk.replace(tzinfo=timezone.utc)
                if not next_chk or next_chk > now_utc + timedelta(seconds=TIER_INTERVALS.get(target_priority, 28800)):
                    l.next_check_at = now_utc + timedelta(seconds=TIER_INTERVALS.get(target_priority, 28800))

            sess.add(l)

        sess.commit()
        return priority_info

    if s:
        return _execute(s)
    with get_session() as new_session:
        return _execute(new_session)


def get_product_metrics(
    product_id: Union[int, Session],
    session: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    Aggregates derived telemetry metrics for a product from indexed discovery events and observations.
    Accepts either (product_id, session=...) or (session, product_id).
    """
    if isinstance(product_id, Session):
        s = product_id
        pid = session  # type: ignore
    else:
        pid = product_id
        s = session

    def _execute(sess: Session) -> Dict[str, Any]:
        product = sess.get(Product, pid)
        if not product:
            return {}

        priority_info = calculate_product_priority(pid, session=sess)

        # Query event counts
        events = sess.exec(
            select(ProductDiscoveryEvent).where(ProductDiscoveryEvent.product_id == pid)
        ).all()

        total_discovery = len(events)
        view_count = sum(1 for e in events if e.source == "PRODUCT_VIEW")
        search_count = sum(1 for e in events if e.source == "USER_SEARCH")
        compare_count = sum(1 for e in events if e.source == "COMPARE")

        # Query listings and observations
        listings = sess.exec(
            select(MerchantListing).where(MerchantListing.product_id == pid)
        ).all()
        listing_ids = [l.id for l in listings if l.id is not None]

        obs_count = 0
        min_price = None
        max_price = None
        if listing_ids:
            observations = sess.exec(
                select(PriceObservation).where(PriceObservation.listing_id.in_(listing_ids))
            ).all()
            obs_count = len(observations)
            valid_prices = [o.price for o in observations if o.price and o.price > 0]
            if valid_prices:
                min_price = min(valid_prices)
                max_price = max(valid_prices)

        active_alerts_count = sess.exec(
            select(func.count(PriceAlert.id)).where(
                PriceAlert.product_id == pid,
                PriceAlert.is_active == True,
            )
        ).one()

        first_discovered = min((e.created_at for e in events), default=product.created_at)
        last_discovered = max((e.created_at for e in events if e.source in ("USER_URL", "AUTONOMOUS_DISCOVERY")), default=product.created_at)

        return {
            "product_id": product.id,
            "canonical_title": product.canonical_title,
            "lifecycle_status": product.lifecycle_status,
            "priority_tier": priority_info.priority,
            "discovery_score": priority_info.score,
            "discovery_count": total_discovery,
            "view_count": view_count,
            "search_count": search_count,
            "compare_count": compare_count,
            "active_alerts_count": active_alerts_count,
            "price_observations_count": obs_count,
            "min_price": min_price,
            "max_price": max_price,
            "first_discovered_at": first_discovered.isoformat() if first_discovered else None,
            "last_discovered_at": last_discovered.isoformat() if last_discovered else None,
            "last_interacted_at": product.last_interacted_at.isoformat() if product.last_interacted_at else None,
        }

    if s:
        return _execute(s)
    with get_session() as new_session:
        return _execute(new_session)


def get_universe_statistics(session: Optional[Session] = None) -> Dict[str, Any]:
    """
    Returns global Product Universe metrics.
    """
    def _execute(s: Session) -> Dict[str, Any]:
        total_products = s.exec(select(func.count(Product.id))).one()
        total_listings = s.exec(select(func.count(MerchantListing.id))).one()
        active_listings = s.exec(select(func.count(MerchantListing.id)).where(MerchantListing.active == True)).one()
        total_observations = s.exec(select(func.count(PriceObservation.id))).one()
        total_events = s.exec(select(func.count(ProductDiscoveryEvent.id))).one()

        # Count by lifecycle status
        all_prods = s.exec(select(Product.lifecycle_status)).all()
        lifecycle_breakdown: Dict[str, int] = {}
        for st in all_prods:
            k = st or "IDENTIFIED"
            lifecycle_breakdown[k] = lifecycle_breakdown.get(k, 0) + 1

        # Count by listing priority
        all_listings = s.exec(select(MerchantListing.refresh_priority)).all()
        priority_breakdown: Dict[str, int] = {}
        for pr in all_listings:
            k = pr or "NORMAL"
            priority_breakdown[k] = priority_breakdown.get(k, 0) + 1

        # Count events by source
        all_events = s.exec(select(ProductDiscoveryEvent.source)).all()
        events_by_source: Dict[str, int] = {}
        for src in all_events:
            k = src or "UNKNOWN"
            events_by_source[k] = events_by_source.get(k, 0) + 1

        return {
            "total_products": total_products,
            "total_merchant_listings": total_listings,
            "active_merchant_listings": active_listings,
            "total_observations": total_observations,
            "total_discovery_events": total_events,
            "lifecycle_breakdown": lifecycle_breakdown,
            "priority_breakdown": priority_breakdown,
            "events_by_source": events_by_source,
        }

    if session:
        return _execute(session)
    with get_session() as new_session:
        return _execute(new_session)
