"""
DealSense Telegram Delivery Engine Test Suite.
Tests message formatting, HTML escaping, CTA subID attribution,
rate limiting, retry logic, 403 auto-disable, webhook binding, and /stop /resume flows.
"""

from datetime import datetime, timezone, timedelta
import re
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select, SQLModel, create_engine
import httpx

from backend.config import settings
from backend.database import init_db
from backend.main import app
from backend.models import PriceAlert, AlertDeliveryLog, Product, MerchantListing
from backend.services.notification_dispatcher import AlertTriggerEvent
from backend.services.telegram_dispatcher import (
    TelegramDispatcher,
    format_telegram_message,
    build_telegram_inline_keyboard,
    build_telegram_affiliate_url,
    escape_telegram_html,
    TokenBucketRateLimiter,
)
from backend.services.telegram_bot import (
    generate_binding_token,
    handle_webhook_update,
)


@pytest.fixture(autouse=True)
def setup_db():
    init_db()


def make_sample_event(
    alert_id: int = 1,
    alert_type: str = "TARGET_PRICE",
    current_price: float = 24999.0,
    target_price: float = 25000.0,
    baseline_price: float = 29999.0,
    deal_score: int = 88,
    verdict: str = "BUY",
    merchant: str = "Amazon",
    product_title: str = "Sony WH-1000XM5 Wireless Headphones",
    affiliate_url: str = "https://www.amazon.in/dp/B0CX249P6Y?tag=dealsense-21",
    channel: str = "telegram",
    contact: str = "987654321",
    listing_id: int = 202,
) -> AlertTriggerEvent:
    now_utc = datetime.now(timezone.utc)
    savings_amount = round(baseline_price - current_price, 2)
    savings_pct = round((savings_amount / baseline_price) * 100.0, 1)

    return AlertTriggerEvent(
        alert_id=alert_id,
        alert_type=alert_type,
        product_id=101,
        product_title=product_title,
        listing_id=listing_id,
        merchant=merchant,
        channel=channel,
        contact=contact,
        current_price=current_price,
        effective_price=current_price,
        target_price=target_price,
        baseline_price=baseline_price,
        previous_price=baseline_price,
        savings_amount=savings_amount,
        savings_pct=savings_pct,
        deal_score=deal_score,
        verdict=verdict,
        summary_reason="Price dropped to lowest observed level in 30 days.",
        rival_merchant=None,
        rival_price=None,
        affiliate_url=affiliate_url,
        observed_at=now_utc,
        triggered_at=now_utc,
    )


# ---------------------------------------------------------------------------
# 1. Message Formatting & HTML Escaping Tests
# ---------------------------------------------------------------------------

def test_telegram_message_formatting_target_price():
    event = make_sample_event(alert_type="TARGET_PRICE", current_price=24499.0, target_price=25000.0)
    msg = format_telegram_message(event)

    assert "🎯 <b>DEALSENSE ALERT • TARGET REACHED!</b>" in msg
    assert "<b>Sony WH-1000XM5 Wireless Headphones</b>" in msg
    assert "<code>₹24,499</code>" in msg
    assert "<code>₹25,000</code>" in msg
    assert "Verified Live" in msg
    assert "IST" in msg


def test_telegram_message_formatting_percentage_drop():
    event = make_sample_event(alert_type="PERCENTAGE_DROP", current_price=24000.0, baseline_price=30000.0)
    msg = format_telegram_message(event)

    assert "PRICE DROP!" in msg
    assert "<b>Sony WH-1000XM5 Wireless Headphones</b>" in msg
    assert "<code>₹24,000</code>" in msg
    assert "<code>₹30,000</code>" in msg
    assert "-20.0%" in msg


def test_telegram_message_formatting_deal_score():
    event = make_sample_event(alert_type="DEAL_SCORE", deal_score=92, verdict="BUY")
    msg = format_telegram_message(event)

    assert "⚡ <b>DEALSENSE AI • STRONG BUY SIGNAL</b>" in msg
    assert "<b>92/100</b> (BUY Verdict)" in msg
    assert "Intelligence Analysis:" in msg


def test_html_escaping_prevents_xss():
    unsafe_title = "Sony <script>alert('xss')</script> & Bose > 500"
    unsafe_reason = "Price is < ₹1000 & drops > 20%"
    event = make_sample_event(product_title=unsafe_title)
    # inject unsafe summary reason
    object.__setattr__(event, "summary_reason", unsafe_reason)

    msg = format_telegram_message(event)

    assert "<script>" not in msg
    assert "&lt;script&gt;" in msg
    assert "&amp; Bose &gt; 500" in msg
    assert "&lt; ₹1000 &amp; drops &gt; 20%" in msg


# ---------------------------------------------------------------------------
# 2. Affiliate URL & SubID Attribution Tests
# ---------------------------------------------------------------------------

def test_subid_attribution_amazon():
    event = make_sample_event(
        alert_id=42,
        listing_id=202,
        merchant="Amazon",
        affiliate_url="https://www.amazon.in/dp/B0CX249P6Y?tag=dealsense-21",
    )
    enriched_url = build_telegram_affiliate_url(event)

    assert "tag=dealsense-21" in enriched_url
    assert "ascsubtag=tg_alert_42_202" in enriched_url
    assert "ref=dealsense_tg" in enriched_url
    assert "https://www.amazon.in/dp/B0CX249P6Y" in enriched_url


def test_subid_attribution_amazon_clean_url_injects_canonical_tag():
    """
    CRITICAL FIX TEST: Even if raw observation URL has NO tag (e.g. from smoke test),
    build_telegram_affiliate_url MUST inject the canonical Amazon Associate tag (tag=dealsense-21).
    """
    event = make_sample_event(
        alert_id=239,
        listing_id=1,
        merchant="Amazon",
        affiliate_url="https://www.amazon.in/dp/B0D14BB5XY",
    )
    enriched_url = build_telegram_affiliate_url(event)

    # 1. Assert required attribution tags
    assert "tag=dealsense-21" in enriched_url
    assert "ascsubtag=tg_alert_239_1" in enriched_url
    assert "ref=dealsense_tg" in enriched_url

    # 2. Assert correct ASIN and destination
    assert enriched_url.startswith("https://www.amazon.in/dp/B0D14BB5XY?")
    assert "B0D14BB5XY" in enriched_url


def test_amazon_outbound_preserves_extra_parameters():
    """Verifies that pre-existing merchant query parameters are not lost during tag injection."""
    event = make_sample_event(
        alert_id=101,
        listing_id=5,
        merchant="Amazon",
        affiliate_url="https://www.amazon.in/dp/B0D14BB5XY?th=1&psc=1",
    )
    enriched_url = build_telegram_affiliate_url(event)

    assert "tag=dealsense-21" in enriched_url
    assert "ascsubtag=tg_alert_101_5" in enriched_url
    assert "ref=dealsense_tg" in enriched_url
    assert "th=1" in enriched_url
    assert "psc=1" in enriched_url
    assert "B0D14BB5XY" in enriched_url


def test_custom_amazon_associate_tag_configured(monkeypatch):
    """Verifies that when AMAZON_AFFILIATE_TAG is overridden in env, that tag is respected."""
    from backend.config import settings
    monkeypatch.setattr(settings, "AMAZON_AFFILIATE_TAG", "mycustompartner-21")
    event = make_sample_event(
        alert_id=88,
        listing_id=12,
        merchant="Amazon",
        affiliate_url="https://www.amazon.in/dp/B0CX249P6Y",
    )
    enriched_url = build_telegram_affiliate_url(event)

    assert "tag=mycustompartner-21" in enriched_url
    assert "ascsubtag=tg_alert_88_12" in enriched_url
    assert "ref=dealsense_tg" in enriched_url


def test_subid_attribution_cuelinks():
    event = make_sample_event(
        alert_id=55,
        merchant="Vijay Sales",
        affiliate_url="https://linksredirect.com/?cid=123&url=https%3A%2F%2Fvijaysales.com%2Fitem",
    )
    enriched_url = build_telegram_affiliate_url(event)

    assert "subid3=telegram_alert" in enriched_url
    assert "subid4=alert_55" in enriched_url
    assert "cid=123" in enriched_url
    assert "url=https%3A%2F%2Fvijaysales.com%2Fitem" in enriched_url


def test_cuelinks_preserves_existing_subids():
    """Verifies existing subID and subID2 from Cuelinks are preserved."""
    event = make_sample_event(
        alert_id=77,
        merchant="Tata CLiQ",
        affiliate_url="https://linksredirect.com/?cid=317867&subid=999&subid2=tatacliq&url=https%3A%2F%2Fwww.tatacliq.com%2Fp-mp1",
    )
    enriched_url = build_telegram_affiliate_url(event)

    assert "cid=317867" in enriched_url
    assert "subid=999" in enriched_url
    assert "subid2=tatacliq" in enriched_url
    assert "subid3=telegram_alert" in enriched_url
    assert "subid4=alert_77" in enriched_url


def test_inline_keyboard_structure():
    event = make_sample_event(alert_id=7, merchant="Amazon", current_price=24999.0)
    markup = build_telegram_inline_keyboard(event)

    assert "inline_keyboard" in markup
    buttons = markup["inline_keyboard"]
    assert len(buttons) == 2
    # First button: Buy on Amazon
    assert "Buy on Amazon at ₹24,499" in buttons[0][0]["text"] or "Buy on Amazon" in buttons[0][0]["text"]
    assert "http" in buttons[0][0]["url"]
    # Second button: View Price History
    assert "View DealSense Price History" in buttons[1][0]["text"]
    assert f"/product/{event.product_id}" in buttons[1][0]["url"]


# ---------------------------------------------------------------------------
# 3. Rate Limiter Tests
# ---------------------------------------------------------------------------

def test_token_bucket_rate_limiter():
    limiter = TokenBucketRateLimiter(capacity=2.0, refill_rate=10.0)

    assert limiter.acquire(1.0) is True
    assert limiter.acquire(1.0) is True
    # Bucket now empty
    assert limiter.acquire(1.0) is False


# ---------------------------------------------------------------------------
# 4. Dispatcher Delivery & Error Handling Tests
# ---------------------------------------------------------------------------

def test_telegram_dispatcher_success(monkeypatch):
    event = make_sample_event(alert_id=10, channel="telegram", contact="12345678")

    class MockResponse:
        status_code = 200
        text = '{"ok": true, "result": {"message_id": 999}}'

        def json(self):
            return {"ok": True, "result": {"message_id": 999}}

    class MockClient:
        def post(self, url, json=None):
            return MockResponse()

    dispatcher = TelegramDispatcher(bot_token="test_token_123", http_client=MockClient())
    success = dispatcher.dispatch(event)

    assert success is True


def test_telegram_dispatcher_403_auto_disables_alert(monkeypatch):
    """When Telegram returns HTTP 403 (blocked), alert is automatically transitioned to DISABLED in DB."""
    from backend.services.alert_service import create_alert

    # Create real alert in DB
    alert = create_alert(
        product_title="Test Headphone",
        current_price=10000.0,
        contact="blocked_user_chat_id",
        channel="telegram",
        target_price=9000.0,
    )

    event = make_sample_event(alert_id=alert.id, channel="telegram", contact="blocked_user_chat_id")

    class Mock403Response:
        status_code = 403
        text = '{"ok": false, "error_code": 403, "description": "Forbidden: bot was blocked by the user"}'

        def json(self):
            return {"ok": False, "description": "Forbidden: bot was blocked by the user"}

    class MockClient:
        def post(self, url, json=None):
            return Mock403Response()

    dispatcher = TelegramDispatcher(bot_token="test_token_123", http_client=MockClient())
    success = dispatcher.dispatch(event)

    assert success is False

    # Verify alert state machine in DB became DISABLED
    from backend.database import get_session
    with get_session() as s:
        db_alert = s.get(PriceAlert, alert.id)
        assert db_alert.status == "DISABLED"
        assert db_alert.is_active is False

        # Verify audit delivery log
        log_entry = s.exec(
            select(AlertDeliveryLog)
            .where(AlertDeliveryLog.alert_id == alert.id)
        ).first()
        assert log_entry is not None
        assert log_entry.status == "BLOCKED"
        assert log_entry.response_code == 403


def test_telegram_dispatcher_429_rate_limit_retry(monkeypatch):
    event = make_sample_event(alert_id=20, channel="telegram", contact="user_429")

    calls = 0

    class Mock429Then200:
        def post(self, url, json=None):
            nonlocal calls
            calls += 1
            if calls == 1:
                class R1:
                    status_code = 429
                    text = '{"ok": false, "parameters": {"retry_after": 0}}'
                    def json(self):
                        return {"ok": False, "parameters": {"retry_after": 0}}
                return R1()
            else:
                class R2:
                    status_code = 200
                    text = '{"ok": true}'
                    def json(self):
                        return {"ok": True}
                return R2()

    dispatcher = TelegramDispatcher(bot_token="test_token_123", http_client=Mock429Then200())
    success = dispatcher.dispatch(event)

    assert success is True
    assert calls == 2


def test_telegram_dispatcher_network_error_resilience(monkeypatch):
    """Network timeouts should return False cleanly and not crash or roll back DB state."""
    event = make_sample_event(alert_id=30, channel="telegram", contact="timeout_user")

    class MockTimeoutClient:
        def post(self, url, json=None):
            raise httpx.ConnectTimeout("Connection timed out to api.telegram.org")

    dispatcher = TelegramDispatcher(bot_token="test_token_123", http_client=MockTimeoutClient())
    success = dispatcher.dispatch(event)

    assert success is False


# ---------------------------------------------------------------------------
# 5. Deep-Link Token & Webhook Binding Tests
# ---------------------------------------------------------------------------

def test_deep_link_token_generation():
    token = generate_binding_token()
    assert token.startswith("b_")
    assert len(token) >= 20
    assert len(token) <= 64  # Telegram limit is 64 characters
    # Allowed characters: a-zA-Z0-9_-
    assert re.match(r"^[a-zA-Z0-9_-]+$", token) is not None


def test_webhook_start_binds_chat_id():
    """Simulate user opening deep-link and tapping Start in Telegram."""
    from backend.services.alert_service import create_alert

    token = generate_binding_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    # Create pending alert
    alert = create_alert(
        product_title="MacBook Air M3",
        current_price=114900.0,
        channel="telegram",
        contact="pending",
        target_price=105000.0,
        telegram_bind_token=token,
        telegram_token_expires_at=expires_at,
    )
    assert alert.status == "PENDING_BINDING"
    assert alert.is_active is False

    # Simulate Telegram webhook update payload
    update_payload = {
        "update_id": 10001,
        "message": {
            "message_id": 1,
            "from": {"id": 88776655, "is_bot": False, "first_name": "Rohan", "username": "rohan_deals"},
            "chat": {"id": 88776655, "first_name": "Rohan", "type": "private"},
            "date": 1720000000,
            "text": f"/start {token}",
        },
    }

    # Mock client for the confirmation message reply
    class MockReplyClient:
        def post(self, url, json=None):
            class R:
                status_code = 200
                text = '{"ok": true}'
            return R()

    res = handle_webhook_update(
        update_data=update_payload,
        bot_token="test_token",
        http_client=MockReplyClient(),
    )

    assert res.get("ok") is True
    assert res.get("action") == "alert_bound"
    assert res.get("alert_id") == alert.id

    # Verify DB state
    from backend.database import get_session
    with get_session() as s:
        updated = s.get(PriceAlert, alert.id)
        assert updated.status == "ARMED"
        assert updated.is_active is True
        assert updated.telegram_chat_id == "88776655"
        assert updated.telegram_username == "rohan_deals"
        assert updated.contact == "88776655"
        assert updated.telegram_bind_token is None  # single-use token cleared


def test_webhook_stop_and_resume_flow():
    """Simulate /stop to pause alerts and /resume to reactivate."""
    from backend.services.alert_service import create_alert

    # Create armed alert for chat 554433
    alert = create_alert(
        product_title="iPad Pro 11-inch",
        current_price=89900.0,
        channel="telegram",
        contact="554433",
        telegram_chat_id="554433",
        target_price=80000.0,
    )

    class MockReplyClient:
        def post(self, url, json=None):
            class R:
                status_code = 200
                text = '{"ok": true}'
            return R()

    # 1. User sends /stop
    stop_payload = {
        "update_id": 10002,
        "message": {
            "chat": {"id": 554433},
            "text": "/stop",
        },
    }
    res_stop = handle_webhook_update(stop_payload, bot_token="token", http_client=MockReplyClient())
    assert res_stop.get("action") == "alerts_paused"

    from backend.database import get_session
    with get_session() as s:
        a = s.get(PriceAlert, alert.id)
        assert a.status == "PAUSED"

    # 2. User sends /resume
    resume_payload = {
        "update_id": 10003,
        "message": {
            "chat": {"id": 554433},
            "text": "/resume",
        },
    }
    res_resume = handle_webhook_update(resume_payload, bot_token="token", http_client=MockReplyClient())
    assert res_resume.get("action") == "alerts_resumed"

    with get_session() as s:
        a = s.get(PriceAlert, alert.id)
        assert a.status == "ARMED"


# ---------------------------------------------------------------------------
# 6. FastAPI API Endpoint Tests
# ---------------------------------------------------------------------------

def test_telegram_bind_request_endpoint():
    client = TestClient(app)
    payload = {
        "product_title": "Dell XPS 15",
        "current_price": 180000.0,
        "target_price": 160000.0,
        "alert_type": "TARGET_PRICE",
    }
    resp = client.post("/api/alerts/telegram/bind-request", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["success"] is True
    assert "bind_token" in data
    assert data["bind_token"].startswith("b_")
    assert "deep_link" in data
    assert "https://t.me/" in data["deep_link"]
    assert data["status"] == "PENDING_BINDING"


def test_telegram_webhook_secret_security():
    client = TestClient(app)
    # Temporarily set secret
    orig_secret = settings.TELEGRAM_WEBHOOK_SECRET
    settings.TELEGRAM_WEBHOOK_SECRET = "super_secret_webhook_key_123"

    try:
        payload = {"update_id": 1, "message": {"chat": {"id": 123}, "text": "/help"}}

        # Mismatched secret -> 401
        res = client.post(
            "/api/telegram/webhook",
            json=payload,
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong_key"},
        )
        assert res.status_code == 401

        # Correct secret -> 200
        res = client.post(
            "/api/telegram/webhook",
            json=payload,
            headers={"X-Telegram-Bot-Api-Secret-Token": "super_secret_webhook_key_123"},
        )
        assert res.status_code == 200
    finally:
        settings.TELEGRAM_WEBHOOK_SECRET = orig_secret
