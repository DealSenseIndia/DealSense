"""
DealSense Generic Webhook & Bot Notification Dispatcher.
Dispatches AlertTriggerEvents to Discord, Slack, or generic HTTP Webhook endpoints
with structured JSON payloads and persistent AlertDeliveryLog auditing.
"""

from datetime import datetime, timezone
import json
import logging
from typing import Optional, Dict, Any
import httpx

from backend.config import settings
from backend.database import get_session
from backend.models import AlertDeliveryLog
from backend.services.notification_dispatcher import AlertTriggerEvent, NotificationDispatcher

logger = logging.getLogger(__name__)


def build_webhook_payload(event: AlertTriggerEvent) -> Dict[str, Any]:
    """Generates a rich multi-purpose webhook payload compatible with Discord/Slack/custom endpoints."""
    savings_str = f"₹{event.savings_amount:,.2f}" if event.savings_amount else "Great Savings"
    pct_str = f"{event.savings_pct:.1f}%" if event.savings_pct else ""
    discount_display = f"{savings_str} ({pct_str} OFF)" if pct_str else savings_str

    # Universal payload
    return {
        "event_type": "DEAL_PRICE_DROP",
        "alert_id": event.alert_id,
        "product_id": event.product_id,
        "product_title": event.product_title,
        "merchant": event.merchant,
        "current_price": event.current_price,
        "target_price": event.target_price,
        "savings_display": discount_display,
        "deal_score": event.deal_score,
        "verdict": event.verdict,
        "affiliate_url": event.affiliate_url,
        "timestamp": event.triggered_at.isoformat() if event.triggered_at else datetime.now(timezone.utc).isoformat(),
        # Discord Embed structure
        "embeds": [
            {
                "title": f"🔥 {event.product_title[:60]}",
                "description": f"Price dropped to **₹{event.current_price:,.2f}** on **{event.merchant}**!\nSave {discount_display}",
                "url": event.affiliate_url,
                "color": 0x10B981,  # Emerald Green
                "fields": [
                    {"name": "Current Price", "value": f"₹{event.current_price:,.2f}", "inline": True},
                    {"name": "Target Price", "value": f"₹{event.target_price:,.2f}" if event.target_price else "Any Drop", "inline": True},
                    {"name": "Deal Score", "value": f"{event.deal_score or 'N/A'}/100 ({event.verdict or 'CHECK'})", "inline": True},
                ],
                "footer": {"text": "DealSense India · Real-Time Price Verification"},
            }
        ],
    }


class WebhookDispatcher:
    """Dispatches alerts to HTTP webhooks (Discord, Slack, custom endpoints)."""

    def __init__(self, timeout_seconds: float = 6.0):
        self.timeout = timeout_seconds

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        webhook_url = (event.contact or "").strip()
        if not (webhook_url.startswith("http://") or webhook_url.startswith("https://")):
            # Fallback to configured global webhook if available
            webhook_url = getattr(settings, "DISCORD_WEBHOOK_URL", None) or getattr(settings, "ALERT_WEBHOOK_URL", None)

        status = "SUCCESS"
        response_code = 200
        response_body = "Mock Webhook Delivery"

        payload = build_webhook_payload(event)

        if webhook_url:
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(webhook_url, json=payload)
                    response_code = resp.status_code
                    response_body = resp.text
                    if resp.status_code not in (200, 204):
                        status = "FAILED"
            except Exception as err:
                logger.warning(f"[WEBHOOK DISPATCH] Failed sending to {webhook_url}: {err}")
                status = "FAILED"
                response_code = 500
                response_body = str(err)
        else:
            logger.info(f"[WEBHOOK DISPATCH MOCK] Alert #{event.alert_id} for '{event.product_title[:30]}'")
            response_body = json.dumps({"status": "mock_delivered", "payload": payload})

        # Persist audit log
        try:
            with get_session() as session:
                log_entry = AlertDeliveryLog(
                    alert_id=event.alert_id,
                    channel="webhook",
                    recipient=webhook_url or "mock_webhook",
                    status=status,
                    response_code=response_code,
                    response_body=response_body[:1000],
                    retry_count=0,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(log_entry)
                session.commit()
        except Exception as db_err:
            logger.debug(f"[WEBHOOK DISPATCH] Failed to write AlertDeliveryLog: {db_err}")

        return status == "SUCCESS"
