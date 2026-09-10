"""
DealSense Alert Intelligence Service.
Coordinates price alert registration, validation, criteria evaluation,
atomic state machine transitions, and notification dispatch.
"""

from datetime import datetime, timezone, timedelta
from enum import Enum
import logging
from typing import Optional, List, Dict, Any, Tuple
from sqlmodel import select, update, Session

from backend.database import get_session
from backend.models import PriceAlert, MerchantListing, Product, PriceObservation
from backend.services.notification_dispatcher import (
    AlertTriggerEvent,
    NotificationDispatcher,
    default_dispatcher,
)

logger = logging.getLogger(__name__)


class AlertType(str, Enum):
    TARGET_PRICE = "TARGET_PRICE"
    PERCENTAGE_DROP = "PERCENTAGE_DROP"
    DEAL_SCORE = "DEAL_SCORE"
    CROSS_STORE_OPPORTUNITY = "CROSS_STORE_OPPORTUNITY"


class AlertStatus(str, Enum):
    ARMED = "ARMED"
    TRIGGERED = "TRIGGERED"
    COOLDOWN = "COOLDOWN"
    PAUSED = "PAUSED"
    DISABLED = "DISABLED"


def compute_recovery_threshold(target_price: Optional[float]) -> Optional[float]:
    """
    Computes price recovery hysteresis threshold: max(target_price * 1.02, target_price + 100).
    Alert in COOLDOWN will only return to ARMED once the price bounces back above this ceiling.
    """
    if target_price is None or target_price <= 0:
        return None
    return round(max(target_price * 1.02, target_price + 100.0), 2)


def create_alert(
    product_title: str,
    current_price: float,
    contact: str,
    channel: str = "whatsapp",
    product_id: Optional[int] = None,
    listing_id: Optional[int] = None,
    alert_type: str = AlertType.TARGET_PRICE.value,
    target_price: Optional[float] = None,
    target_percentage: Optional[float] = None,
    target_deal_score: Optional[int] = None,
    is_persistent: bool = False,
    cooldown_hours: int = 24,
    session: Optional[Session] = None,
) -> PriceAlert:
    """
    Registers a new PriceAlert, verifies baseline numbers, and arms the state machine.
    """
    contact_clean = (contact or "").strip()
    if not contact_clean:
        raise ValueError("Recipient contact (phone number or email) is required.")

    valid_channels = ("whatsapp", "email", "console", "telegram")
    if channel.lower() not in valid_channels:
        raise ValueError(f"Invalid channel '{channel}'. Supported channels: {valid_channels}")

    # Fallback / lookup baseline price from listing if available
    baseline = float(current_price)
    if listing_id and (baseline is None or baseline <= 0):
        with get_session() as s:
            ml = s.get(MerchantListing, listing_id)
            if ml and ml.current_price:
                baseline = float(ml.current_price)

    # Validate criteria according to alert type
    norm_type = alert_type.upper() if alert_type else AlertType.TARGET_PRICE.value
    calc_target = target_price

    if norm_type == AlertType.TARGET_PRICE.value:
        if target_price is None or target_price <= 0:
            raise ValueError("target_price must be a positive number for TARGET_PRICE alerts.")
        calc_target = float(target_price)

    elif norm_type == AlertType.PERCENTAGE_DROP.value:
        if target_percentage is None or target_percentage <= 0 or target_percentage >= 100:
            raise ValueError("target_percentage must be between 0 and 100 for PERCENTAGE_DROP alerts.")
        if baseline <= 0:
            raise ValueError("A positive baseline price is required for PERCENTAGE_DROP alerts.")
        calc_target = round(baseline * (1.0 - (float(target_percentage) / 100.0)), 2)

    elif norm_type == AlertType.DEAL_SCORE.value:
        if target_deal_score is None or not (0 <= target_deal_score <= 100):
            raise ValueError("target_deal_score must be an integer between 0 and 100 for DEAL_SCORE alerts.")
        calc_target = float(target_price) if target_price is not None else baseline

    if calc_target is None:
        calc_target = baseline if baseline > 0 else 0.0

    rearm_thresh = compute_recovery_threshold(calc_target)
    now_utc = datetime.now(timezone.utc)

    alert = PriceAlert(
        product_id=product_id,
        listing_id=listing_id,
        product_title=product_title.strip(),
        alert_type=norm_type,
        target_price=calc_target,
        baseline_price=baseline,
        target_percentage=float(target_percentage) if target_percentage is not None else None,
        target_deal_score=int(target_deal_score) if target_deal_score is not None else None,
        current_price=baseline,
        status=AlertStatus.ARMED.value,
        is_active=True,
        is_persistent=is_persistent,
        cooldown_hours=max(1, int(cooldown_hours)),
        cooldown_until=None,
        last_triggered_at=None,
        last_trigger_price=None,
        rearm_threshold_price=rearm_thresh,
        trigger_count=0,
        channel=channel.lower(),
        contact=contact_clean,
        created_at=now_utc,
        updated_at=now_utc,
    )

    if session:
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert

    with get_session() as write_session:
        write_session.add(alert)
        write_session.commit()
        write_session.refresh(alert)
        return alert


def pause_alert(alert_id: int) -> Optional[PriceAlert]:
    """Pauses an alert. Suppresses all notifications while in PAUSED state."""
    with get_session() as session:
        alert = session.get(PriceAlert, alert_id)
        if not alert or alert.status == AlertStatus.DISABLED.value:
            return None
        alert.status = AlertStatus.PAUSED.value
        alert.updated_at = datetime.now(timezone.utc)
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert


def resume_alert(alert_id: int) -> Optional[PriceAlert]:
    """Resumes a paused alert back to ARMED state."""
    with get_session() as session:
        alert = session.get(PriceAlert, alert_id)
        if not alert or alert.status != AlertStatus.PAUSED.value:
            return None
        alert.status = AlertStatus.ARMED.value
        alert.updated_at = datetime.now(timezone.utc)
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert


def disable_alert(alert_id: int) -> Optional[PriceAlert]:
    """Permanently disables an alert."""
    with get_session() as session:
        alert = session.get(PriceAlert, alert_id)
        if not alert:
            return None
        alert.status = AlertStatus.DISABLED.value
        alert.is_active = False
        alert.updated_at = datetime.now(timezone.utc)
        session.add(alert)
        session.commit()
        session.refresh(alert)
        return alert


def delete_alert(alert_id: int) -> bool:
    """Deletes an alert permanently from SQLite."""
    with get_session() as session:
        alert = session.get(PriceAlert, alert_id)
        if not alert:
            return False
        session.delete(alert)
        session.commit()
        return True


def get_alert(alert_id: int) -> Optional[PriceAlert]:
    """Retrieves an alert by ID."""
    with get_session() as session:
        return session.get(PriceAlert, alert_id)


def list_alerts(
    status: Optional[str] = None,
    product_id: Optional[int] = None,
    listing_id: Optional[int] = None,
    contact: Optional[str] = None,
) -> List[PriceAlert]:
    """Queries alerts matching optional filters."""
    with get_session() as session:
        query = select(PriceAlert)
        if status:
            query = query.where(PriceAlert.status == status.upper())
        if product_id:
            query = query.where(PriceAlert.product_id == product_id)
        if listing_id:
            query = query.where(PriceAlert.listing_id == listing_id)
        if contact:
            query = query.where(PriceAlert.contact == contact.strip())
        return session.exec(query.order_by(PriceAlert.created_at.desc())).all()


def _is_condition_met(
    alert: PriceAlert,
    effective_price: float,
    deal_score: Optional[int],
    verdict: Optional[str],
    confidence: Optional[str],
) -> bool:
    """Evaluates whether the observation satisfies the alert criteria."""
    alert_type = (alert.alert_type or AlertType.TARGET_PRICE.value).upper()

    if alert_type == AlertType.TARGET_PRICE.value:
        if alert.target_price is None:
            return False
        return effective_price <= alert.target_price

    elif alert_type == AlertType.PERCENTAGE_DROP.value:
        baseline = alert.baseline_price or alert.current_price
        target_pct = alert.target_percentage
        if baseline is None or baseline <= 0 or target_pct is None:
            return False
        pct_drop = ((baseline - effective_price) / baseline) * 100.0
        return pct_drop >= target_pct

    elif alert_type == AlertType.DEAL_SCORE.value:
        target_score = alert.target_deal_score
        if target_score is None or deal_score is None:
            return False

        # Must meet score, verdict must be BUY, confidence must be HIGH or MEDIUM
        verdict_clean = (verdict or "").strip().upper()
        confidence_clean = (confidence or "").strip().upper()

        if verdict_clean != "BUY":
            return False
        if confidence_clean not in ("HIGH", "MEDIUM"):
            return False

        return deal_score >= target_score

    return False


def _atomic_claim_alert(
    alert_id: int,
    trigger_price: float,
    now_utc: datetime,
) -> bool:
    """
    Executes an atomic claim transition: ARMED -> TRIGGERED.
    Guarantees maximum ONE thread/worker claims an alert even under concurrent evaluations.
    """
    with get_session() as write_session:
        stmt = (
            update(PriceAlert)
            .where(PriceAlert.id == alert_id, PriceAlert.status == AlertStatus.ARMED.value)
            .values(
                status=AlertStatus.TRIGGERED.value,
                last_triggered_at=now_utc,
                last_trigger_price=trigger_price,
                trigger_count=PriceAlert.trigger_count + 1,
                updated_at=now_utc,
            )
        )
        res = write_session.exec(stmt)
        write_session.commit()
        return bool(res.rowcount and res.rowcount > 0)


def evaluate_alerts_for_observation(
    listing_id: int,
    product_id: Optional[int],
    current_price: Optional[float],
    effective_price: Optional[float],
    in_stock: bool,
    deal_score: Optional[int] = None,
    verdict: Optional[str] = None,
    confidence: Optional[str] = None,
    summary_reason: Optional[str] = None,
    merchant: Optional[str] = None,
    product_title: Optional[str] = None,
    affiliate_url: Optional[str] = None,
    observed_at: Optional[datetime] = None,
    dispatcher: Optional[NotificationDispatcher] = None,
) -> List[AlertTriggerEvent]:
    """
    Main evaluation pipeline triggered upon verified PriceObservation.
    Atomically transitions matching alerts and delivers immutable AlertTriggerEvents.
    """
    sink = dispatcher or default_dispatcher
    now_utc = datetime.now(timezone.utc)
    obs_time = observed_at or now_utc

    # 1. Price and Stock Suppression Rules
    if effective_price is None or effective_price <= 0 or not in_stock:
        # Missing, non-positive price, or Out of Stock strictly suppresses alert triggers
        return []

    # 2. Find Candidates Matching Listing or Product
    with get_session() as read_session:
        conditions = []
        if listing_id:
            conditions.append(PriceAlert.listing_id == listing_id)
        if product_id:
            conditions.append(PriceAlert.product_id == product_id)

        from sqlmodel import or_
        candidates = read_session.exec(
            select(PriceAlert)
            .where(or_(*conditions))
            .where(PriceAlert.status.in_([AlertStatus.ARMED.value, AlertStatus.COOLDOWN.value]))
        ).all()

        candidate_data = [
            {
                "id": a.id,
                "status": a.status,
                "alert_type": a.alert_type,
                "target_price": a.target_price,
                "baseline_price": a.baseline_price,
                "target_percentage": a.target_percentage,
                "target_deal_score": a.target_deal_score,
                "is_persistent": a.is_persistent,
                "cooldown_hours": a.cooldown_hours or 24,
                "cooldown_until": a.cooldown_until,
                "rearm_threshold_price": a.rearm_threshold_price,
                "channel": a.channel,
                "contact": a.contact,
                "product_title": a.product_title,
                "product_id": a.product_id,
                "listing_id": a.listing_id,
            }
            for a in candidates
        ]

    emitted_events: List[AlertTriggerEvent] = []

    for c in candidate_data:
        aid = c["id"]
        status = c["status"]
        rearm_threshold = c["rearm_threshold_price"] or compute_recovery_threshold(c["target_price"])

        # 3. Handle COOLDOWN State & Recovery Hysteresis
        if status == AlertStatus.COOLDOWN.value:
            # Check price recovery condition
            recovered = False
            if rearm_threshold and effective_price >= rearm_threshold:
                recovered = True
            elif c["cooldown_until"]:
                c_until = c["cooldown_until"]
                if c_until.tzinfo is None:
                    c_until = c_until.replace(tzinfo=timezone.utc)
                if now_utc >= c_until and (rearm_threshold is None or effective_price >= rearm_threshold):
                    recovered = True

            if recovered:
                # Transition directly: COOLDOWN -> ARMED
                with get_session() as write_session:
                    db_alert = write_session.get(PriceAlert, aid)
                    if db_alert and db_alert.status == AlertStatus.COOLDOWN.value:
                        db_alert.status = AlertStatus.ARMED.value
                        db_alert.cooldown_until = None
                        db_alert.updated_at = now_utc
                        write_session.add(db_alert)
                        write_session.commit()
                        logger.info(f"Alert #{aid} recovered from COOLDOWN -> ARMED (price Rs. {effective_price} >= threshold {rearm_threshold}).")
            else:
                # Still in cooldown and not recovered -> suppress duplicate notifications
                continue

        # 4. Evaluate ARMED Alert Condition
        # Re-construct lightweight alert instance to evaluate criteria
        eval_alert = PriceAlert(**{k: v for k, v in c.items() if k in PriceAlert.model_fields})
        condition_met = _is_condition_met(
            alert=eval_alert,
            effective_price=effective_price,
            deal_score=deal_score,
            verdict=verdict,
            confidence=confidence,
        )

        if not condition_met:
            continue

        # 5. Atomic Alert Claim (Prevents race conditions)
        claimed = _atomic_claim_alert(
            alert_id=aid,
            trigger_price=effective_price,
            now_utc=now_utc,
        )
        if not claimed:
            # Another concurrent evaluator claimed this alert
            continue

        # 6. Post-Trigger State Transition (Committed before dispatch)
        is_persistent = c["is_persistent"]
        cooldown_hours = c["cooldown_hours"]
        cooldown_until = now_utc + timedelta(hours=cooldown_hours)
        rearm_price = compute_recovery_threshold(c["target_price"])

        with get_session() as write_session:
            db_alert = write_session.get(PriceAlert, aid)
            if db_alert:
                if is_persistent:
                    db_alert.status = AlertStatus.COOLDOWN.value
                    db_alert.cooldown_until = cooldown_until
                    db_alert.rearm_threshold_price = rearm_price
                else:
                    # Single-shot alert disables upon trigger
                    db_alert.status = AlertStatus.DISABLED.value
                    db_alert.is_active = False
                    db_alert.cooldown_until = None
                    db_alert.rearm_threshold_price = rearm_price
                db_alert.updated_at = now_utc
                write_session.add(db_alert)
                write_session.commit()

        # 7. Construct and Dispatch Immutable AlertTriggerEvent
        baseline = c["baseline_price"] or c["target_price"] or effective_price
        savings_amount = round(max(0.0, baseline - effective_price), 2)
        savings_pct = round((savings_amount / baseline * 100.0), 1) if baseline > 0 else 0.0

        target_url = affiliate_url
        if not target_url and listing_id:
            with get_session() as s:
                ml = s.get(MerchantListing, listing_id)
                if ml:
                    merchant_name = ml.merchant or merchant or "Amazon"
                    clean_u = ml.clean_url or ml.url or ""
                    from backend.config import build_affiliate_url
                    target_url = build_affiliate_url(merchant_name, clean_u)

        event = AlertTriggerEvent(
            alert_id=aid,
            alert_type=c["alert_type"],
            product_id=product_id or c["product_id"] or 0,
            product_title=product_title or c["product_title"],
            listing_id=listing_id or c["listing_id"] or 0,
            merchant=merchant or "Amazon",
            channel=c["channel"],
            contact=c["contact"],
            current_price=effective_price,
            effective_price=effective_price,
            target_price=c["target_price"],
            baseline_price=c["baseline_price"],
            previous_price=c.get("last_trigger_price"),
            savings_amount=savings_amount,
            savings_pct=savings_pct,
            deal_score=deal_score,
            verdict=verdict,
            summary_reason=summary_reason or "Price alert condition satisfied.",
            rival_merchant=None,
            rival_price=None,
            affiliate_url=target_url or "#",
            observed_at=obs_time,
            triggered_at=now_utc,
        )

        try:
            sink.dispatch(event)
        except Exception as dispatch_err:
            logger.error(f"Dispatcher failed on event for alert #{aid}: {dispatch_err}", exc_info=True)

        emitted_events.append(event)

    return emitted_events
