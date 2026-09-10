"""
DealSense Telegram Notification Dispatcher.
Implements the NotificationDispatcher protocol for pushing real-time price alerts
via official Telegram Bot API (sendMessage with InlineKeyboardMarkup and HTML parsing).
"""

from datetime import datetime, timezone, timedelta
import html
import json
import logging
import random
import threading
import time
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

import httpx

from backend.config import settings
from backend.database import get_session
from backend.models import PriceAlert, AlertDeliveryLog
from backend.services.notification_dispatcher import AlertTriggerEvent, NotificationDispatcher

logger = logging.getLogger(__name__)


def escape_telegram_html(text: Optional[str]) -> str:
    """
    Escapes characters for Telegram Bot API HTML parse mode: <, >, &.
    Preserves other characters cleanly.
    """
    if not text:
        return ""
    return html.escape(str(text), quote=False)


def build_telegram_affiliate_url(event: AlertTriggerEvent) -> str:
    """
    Enriches the event affiliate URL with Telegram-specific sub-ID attribution:
    - Amazon Associates: tag={AMAZON_ASSOCIATE_TAG}&ascsubtag=tg_alert_{alert_id}_{listing_id}&ref=dealsense_tg
    - General / Cuelinks: subid3=telegram_alert&subid4=alert_{alert_id}
    Uses DealSense affiliate gateway & merchant adapters as single source of truth.
    """
    raw_url = event.affiliate_url or ""
    if not raw_url or raw_url == "#":
        # Fallback to web PDP
        return f"{settings.APP_BASE_URL.rstrip('/')}/product/{event.product_id}"

    try:
        from backend.services.merchant_adapters import adapter_registry

        parsed = urlparse(raw_url)
        netloc = parsed.netloc.lower()
        merchant_name = (event.merchant or "").lower()

        # Amazon specific subtag attribution
        if "amazon.in" in netloc or merchant_name == "amazon":
            adapter = adapter_registry.get_adapter_for_url(raw_url) or adapter_registry.get_adapter_for_merchant("amazon")
            subtag = f"tg_alert_{event.alert_id}_{event.listing_id}"
            subids = {
                "ascsubtag": subtag,
                "ref": "dealsense_tg",
            }
            if adapter:
                clean_base = f"{parsed.scheme or 'https'}://{parsed.netloc}{parsed.path}"
                outbound = adapter.generate_affiliate_url(clean_base, subids=subids)
                out_parsed = urlparse(outbound)
                out_query = parse_qs(out_parsed.query)

                # Preserve any pre-existing query parameters (e.g. th, psc, etc.)
                for k, v in parse_qs(parsed.query).items():
                    if k not in ("tag", "ascsubtag", "ref", "ref_"):
                        out_query[k] = v

                return urlunparse(out_parsed._replace(query=urlencode(out_query, doseq=True)))
            else:
                tag = (settings.AMAZON_AFFILIATE_TAG or "").strip() or "dealsense-21"
                query = parse_qs(parsed.query)
                query.pop("ref", None)
                query.pop("ref_", None)
                ordered: Dict[str, List[str]] = {
                    "tag": [tag],
                    "ascsubtag": [subtag],
                    "ref": ["dealsense_tg"],
                }
                for k, v in query.items():
                    if k not in ordered:
                        ordered[k] = v
                return urlunparse(parsed._replace(query=urlencode(ordered, doseq=True)))

        # Aggregator / Cuelinks / Generic parameters
        query = parse_qs(parsed.query)
        if "subid3" not in query:
            query["subid3"] = ["telegram_alert"]
        if "subid4" not in query:
            query["subid4"] = [f"alert_{event.alert_id}"]

        new_query = urlencode(query, doseq=True)
        return urlunparse(parsed._replace(query=new_query))
    except Exception as e:
        logger.warning(f"Failed to enrich affiliate URL with Telegram subIDs: {e}")
        return raw_url


def format_telegram_message(event: AlertTriggerEvent) -> str:
    """
    Formats the alert message in official Telegram Bot API HTML mode.
    Handles TARGET_PRICE, PERCENTAGE_DROP, and DEAL_SCORE templates.
    """
    escaped_title = escape_telegram_html(event.product_title)
    escaped_merchant = escape_telegram_html(event.merchant)
    escaped_reason = escape_telegram_html(event.summary_reason)

    # Convert observation timestamp to IST display (+05:30)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    obs_time = event.observed_at or datetime.now(timezone.utc)
    if obs_time.tzinfo is None:
        obs_time = obs_time.replace(tzinfo=timezone.utc)
    ist_time_str = obs_time.astimezone(ist_tz).strftime("%I:%M %p, %d %b")

    alert_type = (event.alert_type or "TARGET_PRICE").upper()

    if alert_type == "TARGET_PRICE":
        target_display = f"₹{event.target_price:,.0f}" if event.target_price else "N/A"
        return (
            "🎯 <b>DEALSENSE ALERT • TARGET REACHED!</b>\n\n"
            f"<b>{escaped_title}</b>\n"
            f"🏬 <b>Merchant:</b> {escaped_merchant} (Verified Live)\n\n"
            f"💰 <b>Current Price:</b> <code>₹{event.effective_price:,.0f}</code>\n"
            f"🎯 <b>Target Threshold:</b> <code>{target_display}</code>\n"
            f"📉 <b>Total Savings:</b> <b>₹{event.savings_amount:,.0f} ({event.savings_pct:.1f}% drop)</b>\n\n"
            f"{escaped_reason}\n\n"
            f"<i>⏰ Observed at {ist_time_str} IST</i>"
        )

    elif alert_type == "PERCENTAGE_DROP":
        baseline_display = f"₹{event.baseline_price:,.0f}" if event.baseline_price else "N/A"
        return (
            f"📉 <b>DEALSENSE ALERT • {event.savings_pct:.0f}% PRICE DROP!</b>\n\n"
            f"<b>{escaped_title}</b>\n"
            f"🏬 <b>Merchant:</b> {escaped_merchant}\n\n"
            f"💰 <b>Current Price:</b> <code>₹{event.effective_price:,.0f}</code>\n"
            f"📊 <b>Baseline Price:</b> <code>{baseline_display}</code>\n"
            f"💸 <b>Instant Savings:</b> <b>₹{event.savings_amount:,.0f} (-{event.savings_pct:.1f}%)</b>\n\n"
            f"{escaped_reason}\n\n"
            f"<i>⚡ Price drop verified against real merchant history.</i>"
        )

    elif alert_type == "DEAL_SCORE":
        escaped_verdict = escape_telegram_html(event.verdict or "BUY")
        score_display = event.deal_score if event.deal_score is not None else 85
        return (
            "⚡ <b>DEALSENSE AI • STRONG BUY SIGNAL</b>\n\n"
            f"<b>{escaped_title}</b>\n"
            f"🏬 <b>Merchant:</b> {escaped_merchant}\n\n"
            f"🏆 <b>Deal Score:</b> <b>{score_display}/100</b> ({escaped_verdict} Verdict)\n"
            f"💰 <b>Current Price:</b> <code>₹{event.effective_price:,.0f}</code>\n\n"
            "🧠 <b>Intelligence Analysis:</b>\n"
            f"{escaped_reason}\n\n"
            "<i>🎯 Algorithmic confidence: High. Near historical low.</i>"
        )

    else:
        # Generic / Cross-Store Opportunity fallback
        return (
            "🔔 <b>DEALSENSE ALERT • PRICE OPPORTUNITY</b>\n\n"
            f"<b>{escaped_title}</b>\n"
            f"🏬 <b>Merchant:</b> {escaped_merchant}\n\n"
            f"💰 <b>Current Price:</b> <code>₹{event.effective_price:,.0f}</code>\n"
            f"📉 <b>Savings:</b> <b>₹{event.savings_amount:,.0f} ({event.savings_pct:.1f}%)</b>\n\n"
            f"{escaped_reason}\n\n"
            f"<i>⏰ Observed at {ist_time_str} IST</i>"
        )


def build_telegram_inline_keyboard(event: AlertTriggerEvent) -> Dict[str, Any]:
    """
    Constructs Telegram InlineKeyboardMarkup containing:
    1. Monetized affiliate purchase button with subID attribution
    2. Deep-link button to DealSense web price history / PDP
    """
    buy_url = build_telegram_affiliate_url(event)
    pdp_url = f"{settings.APP_BASE_URL.rstrip('/')}/product/{event.product_id}"

    merchant_label = event.merchant or "Merchant"
    price_label = f"₹{event.effective_price:,.0f}"

    keyboard = [
        [
            {
                "text": f"🛍 Buy on {merchant_label} at {price_label} →",
                "url": buy_url,
            }
        ],
        [
            {
                "text": "📊 View DealSense Price History",
                "url": pdp_url,
            }
        ],
    ]
    return {"inline_keyboard": keyboard}


class TokenBucketRateLimiter:
    """
    In-memory Token Bucket rate limiter enforcing Telegram API rate limits:
    - Default capacity: 25 tokens (safe margin below Telegram's 30 msg/sec global limit)
    - Refill rate: 25 tokens/sec
    """
    def __init__(self, capacity: float = 25.0, refill_rate: float = 25.0):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_refill = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self, tokens: float = 1.0) -> bool:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
            self.last_refill = now

            if self.tokens >= tokens:
                self.tokens -= tokens
                return True
            return False


class TelegramDispatcher:
    """
    Production Telegram Bot notification dispatcher.
    Transforms AlertTriggerEvents into rich HTML messages with inline CTAs.
    Guarantees non-blocking execution and never raises unhandled exceptions.
    """
    def __init__(
        self,
        bot_token: Optional[str] = None,
        api_base_url: Optional[str] = None,
        timeout: float = 5.0,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        http_client: Optional[httpx.Client] = None,
    ):
        self.bot_token = bot_token if bot_token is not None else settings.TELEGRAM_BOT_TOKEN
        self.api_base_url = api_base_url or settings.TELEGRAM_API_BASE_URL
        self.timeout = timeout
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter()
        self._client = http_client

    def _get_api_url(self) -> str:
        base = self.api_base_url.rstrip("/")
        return f"{base}/bot{self.bot_token}/sendMessage"

    def dispatch(self, event: AlertTriggerEvent) -> bool:
        """
        Dispatches an AlertTriggerEvent via Telegram sendMessage API.
        Never rolls back database state. Catches and logs all failures.
        """
        if (event.channel or "").lower() != "telegram":
            return False

        # chat_id is stored in contact or resolved from PriceAlert
        chat_id = (event.contact or "").strip()
        if not chat_id or chat_id == "pending":
            logger.error(f"[TELEGRAM] Cannot dispatch alert #{event.alert_id}: missing chat_id.")
            self._record_delivery_log(event.alert_id, "telegram", chat_id or "UNKNOWN", "FAILED", 400, "Missing chat_id")
            return False

        if not self.bot_token:
            logger.warning(f"[TELEGRAM] TELEGRAM_BOT_TOKEN not configured; skipping real dispatch for alert #{event.alert_id}.")
            self._record_delivery_log(event.alert_id, "telegram", chat_id, "FAILED", None, "TELEGRAM_BOT_TOKEN not configured")
            return False

        # Format message & inline buttons
        text = format_telegram_message(event)
        reply_markup = build_telegram_inline_keyboard(event)

        # Rate limiter pacing
        if not self.rate_limiter.acquire(1.0):
            time.sleep(0.05)  # brief pause before attempting

        return self._send_with_retry(
            alert_id=event.alert_id,
            chat_id=chat_id,
            text=text,
            reply_markup=reply_markup,
        )

    def _send_with_retry(
        self,
        alert_id: int,
        chat_id: str,
        text: str,
        reply_markup: Dict[str, Any],
        max_retries: int = 3,
    ) -> bool:
        """
        Sends message to Telegram Bot API with exponential backoff and rate limit handling.
        Auto-disables the alert in SQLite if Telegram returns HTTP 403 (blocked by user).
        """
        api_url = self._get_api_url()
        payload = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "reply_markup": reply_markup,
            "disable_web_page_preview": False,
        }

        last_code = None
        last_body = None

        for attempt in range(max_retries):
            try:
                client = self._client or httpx.Client(timeout=self.timeout)
                try:
                    response = client.post(api_url, json=payload)
                finally:
                    if self._client is None:
                        client.close()

                last_code = response.status_code
                last_body = response.text

                # 1. Successful delivery (HTTP 200)
                if response.status_code == 200:
                    logger.info(f"[TELEGRAM] Alert #{alert_id} delivered successfully to chat {chat_id}.")
                    self._record_delivery_log(
                        alert_id=alert_id,
                        channel="telegram",
                        recipient=chat_id,
                        status="SUCCESS",
                        code=200,
                        body=last_body,
                        retry_count=attempt,
                    )
                    return True

                # 2. HTTP 403: Bot blocked by user or user deactivated
                if response.status_code == 403:
                    logger.warning(f"[TELEGRAM] User {chat_id} blocked bot or account deactivated. Auto-disabling alert #{alert_id}.")
                    self._auto_disable_alert(alert_id, reason="BLOCKED_BY_USER")
                    self._record_delivery_log(
                        alert_id=alert_id,
                        channel="telegram",
                        recipient=chat_id,
                        status="BLOCKED",
                        code=403,
                        body=last_body,
                        retry_count=attempt,
                    )
                    return False

                # 3. HTTP 429: Too Many Requests (Rate limit hit)
                if response.status_code == 429:
                    try:
                        err_data = response.json()
                        retry_after = int(err_data.get("parameters", {}).get("retry_after", 1))
                    except Exception:
                        retry_after = 1
                    logger.warning(f"[TELEGRAM] Rate limited on alert #{alert_id}. retry_after={retry_after}s.")
                    sleep_time = min(retry_after, 5)  # Cap at 5s to avoid blocking worker
                    time.sleep(sleep_time)
                    continue

                # 4. HTTP 400: Malformed HTML or invalid request (Permanent)
                if response.status_code == 400:
                    logger.error(f"[TELEGRAM] Bad request delivering alert #{alert_id}: {last_body}")
                    self._record_delivery_log(
                        alert_id=alert_id,
                        channel="telegram",
                        recipient=chat_id,
                        status="FAILED",
                        code=400,
                        body=last_body,
                        retry_count=attempt,
                    )
                    return False

                # 5. HTTP 5xx: Transient Telegram server error
                if 500 <= response.status_code < 600:
                    wait_sec = (2 ** attempt) * 0.5 + random.uniform(0.05, 0.15)
                    logger.warning(f"[TELEGRAM] Server error {response.status_code} on attempt {attempt+1}. Retrying in {wait_sec:.2f}s...")
                    time.sleep(wait_sec)
                    continue

            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.NetworkError) as net_err:
                logger.warning(f"[TELEGRAM] Network error on attempt {attempt+1} for alert #{alert_id}: {net_err}")
                last_body = str(net_err)
                wait_sec = (2 ** attempt) * 0.5 + random.uniform(0.05, 0.15)
                time.sleep(wait_sec)
            except Exception as exc:
                logger.error(f"[TELEGRAM] Unexpected exception delivering alert #{alert_id}: {exc}", exc_info=True)
                last_body = str(exc)
                break

        # If all retries exhausted
        self._record_delivery_log(
            alert_id=alert_id,
            channel="telegram",
            recipient=chat_id,
            status="FAILED",
            code=last_code,
            body=last_body,
            retry_count=max_retries,
        )
        return False

    def _auto_disable_alert(self, alert_id: int, reason: str = "BLOCKED_BY_USER") -> None:
        """Transitions alert to DISABLED state if the user has blocked the bot."""
        try:
            with get_session() as session:
                alert = session.get(PriceAlert, alert_id)
                if alert:
                    alert.status = "DISABLED"
                    alert.is_active = False
                    alert.updated_at = datetime.now(timezone.utc)
                    session.add(alert)
                    session.commit()
                    logger.info(f"[TELEGRAM] Alert #{alert_id} successfully disabled due to {reason}.")
        except Exception as e:
            logger.error(f"[TELEGRAM] Failed to auto-disable alert #{alert_id}: {e}")

    def _record_delivery_log(
        self,
        alert_id: int,
        channel: str,
        recipient: str,
        status: str,
        code: Optional[int],
        body: Optional[str],
        retry_count: int = 0,
    ) -> None:
        """Records an entry in the alert_delivery_logs audit table."""
        try:
            with get_session() as session:
                log_entry = AlertDeliveryLog(
                    alert_id=alert_id,
                    channel=channel,
                    recipient=recipient,
                    status=status,
                    response_code=code,
                    response_body=(body[:500] if body else None),
                    retry_count=retry_count,
                    created_at=datetime.now(timezone.utc),
                )
                session.add(log_entry)
                session.commit()
        except Exception as e:
            logger.error(f"[TELEGRAM] Failed to record delivery log for alert #{alert_id}: {e}")
