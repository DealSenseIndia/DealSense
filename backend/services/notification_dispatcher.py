"""
DealSense Notification Dispatcher Abstraction.
Coordinates emission of verified AlertTriggerEvents to test or external notification sinks.
Phase 3.3.1 implements TestConsoleDispatcher only (Zero external API dependencies).
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
import logging
from typing import Optional, List, Protocol, Dict, Any

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AlertTriggerEvent:
    """
    Immutable event contract representing a successfully claimed and verified price alert trigger.
    Contains all financial, operational, and monetization metadata required by downstream delivery channels.
    """
    alert_id: int
    alert_type: str                  # TARGET_PRICE, PERCENTAGE_DROP, DEAL_SCORE, CROSS_STORE_OPPORTUNITY
    product_id: int
    product_title: str
    listing_id: int
    merchant: str                    # e.g., "Amazon", "Flipkart"
    channel: str                     # "whatsapp", "email", "console"
    contact: str                     # Recipient destination (phone, email)

    # Financial & Price Metrics
    current_price: float             # Actual observed selling price
    effective_price: float           # Price including delivery/mandatory fees
    target_price: Optional[float]    # Target price ceiling (if applicable)
    baseline_price: Optional[float]  # Reference starting price (for percentage drop)
    previous_price: Optional[float]  # Prior observed price
    savings_amount: float            # Absolute rupee savings vs baseline/target/rival
    savings_pct: float               # Percentage savings vs baseline/target

    # Deal Intelligence Context
    deal_score: Optional[int]        # 0-100 algorithmic score
    verdict: Optional[str]           # "BUY", "WAIT", "AVOID"
    summary_reason: str              # Algorithmic explanation text

    # Cross-Store Intelligence
    rival_merchant: Optional[str]    # Competitor store name (if applicable)
    rival_price: Optional[float]     # Competitor price (if applicable)

    # Monetization & Traceability
    affiliate_url: str               # Clean affiliate monetization link
    observed_at: datetime            # Timestamp of merchant price observation
    triggered_at: datetime           # Timestamp of alert trigger execution

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["observed_at"] = self.observed_at.isoformat() if self.observed_at else None
        d["triggered_at"] = self.triggered_at.isoformat() if self.triggered_at else None
        return d


class NotificationDispatcher(Protocol):
    """Protocol defining notification delivery sink interface."""

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        """Dispatches an immutable AlertTriggerEvent. Returns True if handled successfully."""
        ...


class TestConsoleDispatcher:
    """
    In-memory and console notification dispatcher for testing and local auditing.
    Maintains a thread-safe record of dispatched events without external network calls.
    """
    __test__ = False

    def __init__(self):
        self.dispatched_events: List[AlertTriggerEvent] = []

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        try:
            self.dispatched_events.append(event)
            logger.info(
                f"[ALERT DISPATCHED] Alert #{event.alert_id} ({event.alert_type}) | "
                f"Product: {event.product_title[:40]}... | "
                f"Price: Rs. {event.effective_price:,.2f} (Target: {event.target_price}) | "
                f"Recipient: {event.channel.upper()} -> {event.contact} | "
                f"Score: {event.deal_score} ({event.verdict}) | "
                f"URL: {event.affiliate_url}"
            )
            return True
        except Exception as exc:
            logger.error(f"TestConsoleDispatcher failed to dispatch alert #{event.alert_id}: {exc}", exc_info=True)
            return False

    def get_dispatched_events(self) -> List[AlertTriggerEvent]:
        """Returns a shallow copy of all dispatched events."""
        return list(self.dispatched_events)

    def clear(self):
        """Clears in-memory dispatched events."""
        self.dispatched_events.clear()


class CompositeDispatcher:
    """
    Channel-aware composite dispatcher.
    Routes AlertTriggerEvents to dedicated dispatchers based on event.channel.
    Falls back to TestConsoleDispatcher for unmapped channels or local logging.
    """
    def __init__(self, fallback: Optional[NotificationDispatcher] = None):
        self._dispatchers: Dict[str, NotificationDispatcher] = {}
        self.fallback = fallback or TestConsoleDispatcher()

    def register(self, channel: str, dispatcher: NotificationDispatcher) -> None:
        self._dispatchers[channel.strip().lower()] = dispatcher

    def get_dispatcher(self, channel: str) -> Optional[NotificationDispatcher]:
        return self._dispatchers.get(channel.strip().lower())

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        channel = (event.channel or "").strip().lower()
        target = self._dispatchers.get(channel, self.fallback)
        try:
            return target.dispatch(event)
        except Exception as exc:
            logger.error(
                f"[COMPOSITE DISPATCHER] Failed to dispatch alert #{event.alert_id} on channel {channel}: {exc}",
                exc_info=True,
            )
            return False

    def get_dispatched_events(self) -> List[AlertTriggerEvent]:
        """Returns events from fallback console dispatcher if available."""
        if hasattr(self.fallback, "get_dispatched_events"):
            return self.fallback.get_dispatched_events()
        return []

    def clear(self) -> None:
        """Clears in-memory dispatched events on fallback."""
        if hasattr(self.fallback, "clear"):
            self.fallback.clear()


def create_default_dispatcher() -> CompositeDispatcher:
    composite = CompositeDispatcher(fallback=TestConsoleDispatcher())
    try:
        from backend.services.telegram_dispatcher import TelegramDispatcher
        composite.register("telegram", TelegramDispatcher())
    except Exception as e:
        logger.warning(f"Could not register TelegramDispatcher in default_dispatcher: {e}")
    return composite


# Default singleton dispatcher instance
default_dispatcher = create_default_dispatcher()
