"""
DealSense WhatsApp Notification Dispatcher.
Implements the NotificationDispatcher protocol for pushing real-time price alerts
via WhatsApp Cloud API or structured webhook logs with persistent AlertDeliveryLog auditing.
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


def format_whatsapp_alert_message(event: AlertTriggerEvent) -> str:
    """Formats high-converting viral WhatsApp deal card message."""
    savings_str = f"₹{event.savings_amount:,.2f}" if event.savings_amount else "Great Savings"
    pct_str = f"{event.savings_pct:.1f}%" if event.savings_pct else ""
    discount_display = f"{savings_str} ({pct_str} OFF)" if pct_str else savings_str
    target_str = f"₹{event.target_price:,.2f}" if event.target_price else "Any Drop"

    lines = [
        "🔥 *DEALSENSE PRICE DROP ALERT!* 🔥",
        "",
        f"📦 *{event.product_title}*",
        f"🏪 *Store:* {event.merchant}",
        f"💰 *New Price:* ₹{event.current_price:,.2f}",
        f"🎯 *Your Target:* {target_str}",
        f"📉 *You Save:* {discount_display}",
    ]

    if event.deal_score is not None:
        verdict_str = f" ({event.verdict})" if event.verdict else ""
        lines.append(f"⭐ *Deal Score:* {event.deal_score}/100{verdict_str}")

    lines.extend([
        "",
        "🛒 *Grab This Deal Before It Expires:*",
        f"{event.affiliate_url}",
        "",
        "_DealSense India · Real-Time Price Verification_",
    ])

    return "\n".join(lines)


class WhatsAppDispatcher:
    """
    WhatsApp Cloud API & Webhook notification dispatcher.
    Writes persistent delivery logs into SQLite AlertDeliveryLog.
    """

    def __init__(self, timeout_seconds: float = 6.0):
        self.timeout = timeout_seconds

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        """Dispatches WhatsApp alert message and records audit log."""
        recipient = (event.contact or "").strip()
        formatted_message = format_whatsapp_alert_message(event)

        api_token = getattr(settings, "WHATSAPP_API_TOKEN", None)
        phone_id = getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)

        status = "SUCCESS"
        response_code = 200
        response_body = "Mock WhatsApp Delivery (API credentials not configured)"

        if api_token and phone_id and recipient:
            try:
                url = f"https://graph.facebook.com/v18.0/{phone_id}/messages"
                headers = {
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": recipient.replace("+", "").replace("-", "").replace(" ", ""),
                    "type": "text",
                    "text": {"body": formatted_message},
                }
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.post(url, headers=headers, json=payload)
                    response_code = resp.status_code
                    response_body = resp.text
                    if resp.status_code not in (200, 201):
                        status = "FAILED"
            except Exception as net_err:
                logger.warning(f"[WHATSAPP DISPATCH] Network error sending to {recipient}: {net_err}")
                status = "FAILED"
                response_code = 500
                response_body = str(net_err)
        else:
            logger.info(
                f"[WHATSAPP DISPATCH MOCK] To {recipient}: Product '{event.product_title[:30]}' at ₹{event.current_price:,.2f}"
            )
            response_body = json.dumps({"status": "mock_delivered", "recipient": recipient})

        # Persist audit log
        try:
            with get_session() as session:
                log_entry = AlertDeliveryLog(
                    alert_id=event.alert_id,
                    channel="whatsapp",
                    recipient=recipient or "unknown",
                    status=status,
                    response_code=response_code,
                    response_body=response_body[:1000],
                    retry_count=0,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(log_entry)
                session.commit()
        except Exception as db_err:
            logger.debug(f"[WHATSAPP DISPATCH] Failed to write AlertDeliveryLog: {db_err}")

        return status == "SUCCESS"
