"""
DealSense Telegram Bot Service.
Handles inbound Telegram updates via webhook, user identity binding (/start b_<token>),
and conversational commands (/stop, /resume, /alerts, /help).
"""

from datetime import datetime, timezone, timedelta
import html
import logging
import secrets
from typing import Optional, Dict, Any, List
from sqlmodel import select

import httpx

from backend.config import settings
from backend.database import get_session
from backend.models import PriceAlert

logger = logging.getLogger(__name__)


def generate_binding_token() -> str:
    """
    Generates a cryptographically secure, URL-safe binding token for Telegram deep-linking.
    Formatted as 'b_' + 16 random URL-safe bytes (~22 chars), total ~24 chars.
    Well within Telegram's 64-character deep-link parameter limit.
    """
    return f"b_{secrets.token_urlsafe(16)}"


def send_telegram_reply(
    chat_id: str,
    text: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    reply_markup: Optional[Dict[str, Any]] = None,
    http_client: Optional[httpx.Client] = None,
) -> bool:
    """
    Sends a message to a Telegram chat using the Bot API sendMessage endpoint.
    Safe against exceptions and never raises unhandled errors.
    """
    token = bot_token if bot_token is not None else settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.warning("[TELEGRAM_BOT] TELEGRAM_BOT_TOKEN not configured; skipping send_telegram_reply.")
        return False

    base = (api_base_url or settings.TELEGRAM_API_BASE_URL).rstrip("/")
    url = f"{base}/bot{token}/sendMessage"

    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        client = http_client or httpx.Client(timeout=5.0)
        try:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            logger.error(f"[TELEGRAM_BOT] sendMessage failed with status {resp.status_code}: {resp.text}")
            return False
        finally:
            if http_client is None:
                client.close()
    except Exception as e:
        logger.error(f"[TELEGRAM_BOT] Exception in send_telegram_reply to {chat_id}: {e}")
        return False


def handle_webhook_update(
    update_data: Dict[str, Any],
    secret_token_header: Optional[str] = None,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """
    Processes an incoming Telegram Update payload from the webhook.
    Validates the X-Telegram-Bot-Api-Secret-Token header if configured.
    Handles /start b_<token>, /stop, /resume, /alerts, and /help.
    """
    # 1. Security Check: Verify secret token
    if settings.TELEGRAM_WEBHOOK_SECRET:
        if secret_token_header != settings.TELEGRAM_WEBHOOK_SECRET:
            logger.warning("[TELEGRAM_BOT] Webhook rejected: Invalid secret token.")
            return {"ok": False, "error": "Unauthorized", "status_code": 401}

    # 2. Extract Message
    message = update_data.get("message")
    if not message:
        return {"ok": True, "action": "ignored_non_message"}

    chat = message.get("chat", {})
    chat_id = str(chat.get("id", "")).strip()
    if not chat_id:
        return {"ok": True, "action": "ignored_missing_chat_id"}

    from_user = message.get("from", {})
    username = from_user.get("username")
    text = (message.get("text") or "").strip()

    # 3. Command Routing
    if text.startswith("/start"):
        parts = text.split(maxsplit=1)
        if len(parts) > 1 and parts[1].strip():
            bind_token = parts[1].strip()
            return _handle_start_binding(
                chat_id=chat_id,
                username=username,
                token=bind_token,
                bot_token=bot_token,
                api_base_url=api_base_url,
                http_client=http_client,
            )
        else:
            return _handle_start_welcome(
                chat_id=chat_id,
                bot_token=bot_token,
                api_base_url=api_base_url,
                http_client=http_client,
            )

    elif text in ("/stop", "/unsubscribe"):
        return _handle_stop_alerts(
            chat_id=chat_id,
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )

    elif text == "/resume":
        return _handle_resume_alerts(
            chat_id=chat_id,
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )

    elif text == "/alerts":
        return _handle_list_alerts(
            chat_id=chat_id,
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )

    elif text in ("/help", "/info"):
        return _handle_help(
            chat_id=chat_id,
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )

    else:
        # Default response for unrecognized text
        send_telegram_reply(
            chat_id=chat_id,
            text=(
                "🤖 <b>DealSense Price Alert Bot</b>\n\n"
                "I track product prices and notify you the moment deals hit.\n\n"
                "<b>Commands:</b>\n"
                "/alerts - View your active alerts\n"
                "/stop - Pause all alerts\n"
                "/resume - Re-arm alerts\n"
                "/help - Learn more"
            ),
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )
        return {"ok": True, "action": "unknown_command_replied"}


def _handle_start_binding(
    chat_id: str,
    username: Optional[str],
    token: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Binds Telegram chat_id to a pending PriceAlert via one-time token."""
    now_utc = datetime.now(timezone.utc)

    with get_session() as session:
        alert = session.exec(
            select(PriceAlert)
            .where(PriceAlert.telegram_bind_token == token)
        ).first()

        if not alert:
            send_telegram_reply(
                chat_id=chat_id,
                text=(
                    "⚠️ <b>Invalid or Expired Alert Link</b>\n\n"
                    "We couldn't find a pending alert matching this link.\n"
                    "Please set up your alert on <a href='https://dealsense.in'>DealSense</a> to get a new link."
                ),
                bot_token=bot_token,
                api_base_url=api_base_url,
                http_client=http_client,
            )
            return {"ok": False, "reason": "token_not_found"}

        # Verify expiration
        if alert.telegram_token_expires_at:
            exp = alert.telegram_token_expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if now_utc > exp:
                send_telegram_reply(
                    chat_id=chat_id,
                    text=(
                        "⚠️ <b>Alert Link Expired</b>\n\n"
                        "This link has expired (links are valid for 30 minutes).\n"
                        "Please configure your alert again on <a href='https://dealsense.in'>DealSense</a>."
                    ),
                    bot_token=bot_token,
                    api_base_url=api_base_url,
                    http_client=http_client,
                )
                return {"ok": False, "reason": "token_expired"}

        # Atomic binding: Transition to ARMED
        alert.telegram_chat_id = chat_id
        alert.telegram_username = username
        alert.contact = chat_id
        alert.status = "ARMED"
        alert.is_active = True
        alert.telegram_bind_token = None  # Invalidate single-use token
        alert.updated_at = now_utc
        session.add(alert)
        session.commit()
        session.refresh(alert)

        escaped_title = html.escape(alert.product_title, quote=False)
        target_display = f"₹{alert.target_price:,.0f}" if alert.target_price else "target threshold"

        reply_text = (
            "✅ <b>Price Alert Armed!</b>\n\n"
            f"Product: <b>{escaped_title}</b>\n"
            f"Target: <code>{target_display}</code>\n\n"
            "We are monitoring live prices on Amazon and Flipkart. "
            "You will be notified instantly when this deal drops!"
        )

        send_telegram_reply(
            chat_id=chat_id,
            text=reply_text,
            bot_token=bot_token,
            api_base_url=api_base_url,
            http_client=http_client,
        )

        logger.info(f"[TELEGRAM_BOT] Successfully bound chat_id {chat_id} to alert #{alert.id}.")
        return {"ok": True, "action": "alert_bound", "alert_id": alert.id}


def _handle_start_welcome(
    chat_id: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Sends welcome message when user types /start without deep-link token."""
    text = (
        "👋 <b>Welcome to DealSense Alerts!</b>\n\n"
        "DealSense is India's verified price intelligence engine. "
        "We track authentic price drops across Amazon and Flipkart.\n\n"
        "To track a product, open any item on <a href='https://dealsense.in'>dealsense.in</a> "
        "and tap <b>'Arm Alert via Telegram'</b>.\n\n"
        "<b>Commands:</b>\n"
        "/alerts - View your active price alerts\n"
        "/stop - Pause all alerts\n"
        "/resume - Re-arm paused alerts\n"
        "/help - How DealSense works"
    )
    send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
    return {"ok": True, "action": "welcome_sent"}


def _handle_stop_alerts(
    chat_id: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Pauses all active alerts for this chat_id."""
    now_utc = datetime.now(timezone.utc)
    count = 0

    with get_session() as session:
        alerts = session.exec(
            select(PriceAlert)
            .where(PriceAlert.telegram_chat_id == chat_id)
            .where(PriceAlert.status.in_(["ARMED", "COOLDOWN"]))
        ).all()

        for a in alerts:
            a.status = "PAUSED"
            a.updated_at = now_utc
            session.add(a)
            count += 1

        if count > 0:
            session.commit()

    text = (
        f"⏸ <b>All DealSense Price Alerts Paused ({count} item{'s' if count != 1 else ''})</b>\n\n"
        "You will not receive any price drop notifications.\n\n"
        "Send /resume to re-arm your alerts or /alerts to view your saved items."
    )
    send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
    return {"ok": True, "action": "alerts_paused", "count": count}


def _handle_resume_alerts(
    chat_id: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Resumes all PAUSED alerts for this chat_id back to ARMED."""
    now_utc = datetime.now(timezone.utc)
    count = 0

    with get_session() as session:
        alerts = session.exec(
            select(PriceAlert)
            .where(PriceAlert.telegram_chat_id == chat_id)
            .where(PriceAlert.status == "PAUSED")
        ).all()

        for a in alerts:
            a.status = "ARMED"
            a.updated_at = now_utc
            session.add(a)
            count += 1

        if count > 0:
            session.commit()

    text = (
        f"▶ <b>Price Alerts Re-Armed ({count} item{'s' if count != 1 else ''})!</b>\n\n"
        "DealSense is actively watching live prices for you again."
    )
    send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
    return {"ok": True, "action": "alerts_resumed", "count": count}


def _handle_list_alerts(
    chat_id: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Lists all active and paused alerts for this chat_id."""
    with get_session() as session:
        alerts = session.exec(
            select(PriceAlert)
            .where(PriceAlert.telegram_chat_id == chat_id)
            .where(PriceAlert.status.in_(["ARMED", "COOLDOWN", "PAUSED"]))
        ).all()

        if not alerts:
            text = (
                "📭 <b>No Active Alerts</b>\n\n"
                "You do not have any price alerts set right now.\n"
                "Browse deals on <a href='https://dealsense.in'>dealsense.in</a> to start tracking!"
            )
            send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
            return {"ok": True, "action": "empty_alerts_listed"}

        lines = ["📋 <b>Your DealSense Price Alerts:</b>\n"]
        for i, a in enumerate(alerts, 1):
            title = html.escape(a.product_title[:45], quote=False)
            status_icon = "🟢" if a.status == "ARMED" else ("🟡" if a.status == "COOLDOWN" else "⏸")
            target_str = f"₹{a.target_price:,.0f}" if a.target_price else "Target"
            lines.append(f"{i}. {status_icon} <b>{title}</b>\n   Target: <code>{target_str}</code> | Status: {a.status}")

        lines.append("\n<i>Send /stop to pause or visit dealsense.in to manage.</i>")
        text = "\n".join(lines)

    send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
    return {"ok": True, "action": "alerts_listed", "count": len(alerts)}


def _handle_help(
    chat_id: str,
    bot_token: Optional[str] = None,
    api_base_url: Optional[str] = None,
    http_client: Optional[httpx.Client] = None,
) -> Dict[str, Any]:
    """Sends help and documentation."""
    text = (
        "💡 <b>DealSense Telegram Bot Guide</b>\n\n"
        "• <b>Live Price Monitoring:</b> We check product prices round-the-clock.\n"
        "• <b>Real Drops Only:</b> We eliminate fake MRP markups and artificial discounts.\n"
        "• <b>Instant Links:</b> Every alert comes with a direct Buy Now link.\n\n"
        "<b>Available Commands:</b>\n"
        "/alerts - View your currently tracked items\n"
        "/stop - Pause notifications\n"
        "/resume - Re-activate monitoring\n"
        "/help - Show this guide\n\n"
        "For support, visit <a href='https://dealsense.in'>dealsense.in</a>."
    )
    send_telegram_reply(chat_id, text, bot_token, api_base_url, http_client=http_client)
    return {"ok": True, "action": "help_sent"}


def get_bot_info(bot_token: Optional[str] = None) -> Dict[str, Any]:
    """Retrieves basic bot identity via getMe."""
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured"}
    url = f"{settings.TELEGRAM_API_BASE_URL.rstrip('/')}/bot{token}/getMe"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url)
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def set_webhook(
    webhook_url: str,
    secret_token: Optional[str] = None,
    bot_token: Optional[str] = None,
) -> Dict[str, Any]:
    """Registers an HTTPS endpoint with Telegram setWebhook."""
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    secret = secret_token or settings.TELEGRAM_WEBHOOK_SECRET
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured"}
    url = f"{settings.TELEGRAM_API_BASE_URL.rstrip('/')}/bot{token}/setWebhook"
    payload: Dict[str, Any] = {
        "url": webhook_url,
        "allowed_updates": ["message"],
    }
    if secret:
        payload["secret_token"] = secret
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json=payload)
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_webhook_info(bot_token: Optional[str] = None) -> Dict[str, Any]:
    """Retrieves current Telegram webhook registration status via getWebhookInfo."""
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured"}
    url = f"{settings.TELEGRAM_API_BASE_URL.rstrip('/')}/bot{token}/getWebhookInfo"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.get(url)
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}


def delete_webhook(bot_token: Optional[str] = None) -> Dict[str, Any]:
    """Removes webhook registration via deleteWebhook."""
    token = bot_token or settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN is not configured"}
    url = f"{settings.TELEGRAM_API_BASE_URL.rstrip('/')}/bot{token}/deleteWebhook"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, json={"drop_pending_updates": True})
            return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}

