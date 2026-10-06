"""
Unit & Integration Tests for Multi-Channel Alert Dispatchers (WhatsApp, Webhook, Composite)
and Recent Alerts API Endpoint.
"""

from datetime import datetime, timezone
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.main import app
from backend.database import get_session
from backend.models import PriceAlert, AlertDeliveryLog
from backend.services.notification_dispatcher import (
    AlertTriggerEvent,
    CompositeDispatcher,
    TestConsoleDispatcher,
)
from backend.services.whatsapp_dispatcher import (
    WhatsAppDispatcher,
    format_whatsapp_alert_message,
)
from backend.services.webhook_dispatcher import (
    WebhookDispatcher,
    build_webhook_payload,
)


@pytest.fixture
def sample_event():
    return AlertTriggerEvent(
        alert_id=999,
        alert_type="TARGET_PRICE",
        product_id=101,
        product_title="Apple iPhone 15 (128 GB) - Blue",
        listing_id=202,
        merchant="Amazon",
        channel="whatsapp",
        contact="+919876543210",
        current_price=59990.0,
        effective_price=59990.0,
        target_price=62000.0,
        baseline_price=69900.0,
        previous_price=64990.0,
        savings_amount=9910.0,
        savings_pct=14.2,
        deal_score=88,
        verdict="BUY",
        summary_reason="Price dropped ₹5,000 below target price.",
        rival_merchant="Flipkart",
        rival_price=64999.0,
        affiliate_url="https://www.amazon.in/dp/B0CHX1W1XY?tag=dealsense-21",
        observed_at=datetime.now(timezone.utc),
        triggered_at=datetime.now(timezone.utc),
    )


def test_format_whatsapp_alert_message(sample_event):
    """WhatsApp message contains emojis, rupee prices, discount %, and affiliate link."""
    msg = format_whatsapp_alert_message(sample_event)
    assert "DEALSENSE PRICE DROP ALERT!" in msg
    assert "Apple iPhone 15" in msg
    assert "₹59,990.00" in msg
    assert "₹62,000.00" in msg
    assert "*Deal Score:* 88/100 (BUY)" in msg
    assert "https://www.amazon.in/dp/B0CHX1W1XY" in msg


def test_whatsapp_dispatcher_mock_delivery_and_db_audit(sample_event):
    """WhatsAppDispatcher writes successful audit record into AlertDeliveryLog in mock mode."""
    # Create matching PriceAlert in DB so foreign key is valid
    with get_session() as session:
        alert = PriceAlert(
            id=999,
            product_title="Apple iPhone 15 (128 GB) - Blue",
            current_price=59990.0,
            target_price=62000.0,
            channel="whatsapp",
            contact="+919876543210",
        )
        session.merge(alert)
        session.commit()

    dispatcher = WhatsAppDispatcher()
    success = dispatcher.dispatch(sample_event)
    assert success is True

    # Verify audit log in DB
    with get_session() as session:
        logs = session.exec(
            select(AlertDeliveryLog).where(AlertDeliveryLog.alert_id == 999)
        ).all()
        assert len(logs) >= 1
        latest = logs[-1]
        assert latest.channel == "whatsapp"
        assert latest.status == "SUCCESS"
        assert latest.response_code == 200
        assert latest.recipient == "+919876543210"


def test_build_webhook_payload(sample_event):
    """Webhook payload formats Discord embeds and structured JSON."""
    payload = build_webhook_payload(sample_event)
    assert payload["event_type"] == "DEAL_PRICE_DROP"
    assert payload["product_title"] == "Apple iPhone 15 (128 GB) - Blue"
    assert payload["current_price"] == 59990.0
    assert len(payload["embeds"]) == 1
    embed = payload["embeds"][0]
    assert "Apple iPhone 15" in embed["title"]
    assert embed["color"] == 0x10B981


def test_webhook_dispatcher_mock_delivery(sample_event):
    """WebhookDispatcher writes audit record into AlertDeliveryLog."""
    webhook_event = AlertTriggerEvent(
        alert_id=999,
        alert_type="TARGET_PRICE",
        product_id=101,
        product_title="Apple iPhone 15 (128 GB) - Blue",
        listing_id=202,
        merchant="Amazon",
        channel="webhook",
        contact="mock_webhook",
        current_price=59990.0,
        effective_price=59990.0,
        target_price=62000.0,
        baseline_price=69900.0,
        previous_price=64990.0,
        savings_amount=9910.0,
        savings_pct=14.2,
        deal_score=88,
        verdict="BUY",
        summary_reason="Test webhook reason",
        rival_merchant=None,
        rival_price=None,
        affiliate_url="https://www.amazon.in/dp/B0CHX1W1XY",
        observed_at=datetime.now(timezone.utc),
        triggered_at=datetime.now(timezone.utc),
    )

    dispatcher = WebhookDispatcher()
    success = dispatcher.dispatch(webhook_event)
    assert success is True

    with get_session() as session:
        logs = session.exec(
            select(AlertDeliveryLog).where(AlertDeliveryLog.channel == "webhook")
        ).all()
        assert len(logs) >= 1
        latest = logs[-1]
        assert latest.channel == "webhook"
        assert latest.status == "SUCCESS"


def test_composite_dispatcher_routing(sample_event):
    """CompositeDispatcher correctly routes whatsapp and webhook channels."""
    composite = CompositeDispatcher(fallback=TestConsoleDispatcher())

    # Dispatch to WhatsApp
    ok_wa = composite.dispatch(sample_event)
    assert ok_wa is True

    # Dispatch to Webhook
    webhook_event = AlertTriggerEvent(
        alert_id=999,
        alert_type="TARGET_PRICE",
        product_id=101,
        product_title="Apple iPhone 15",
        listing_id=202,
        merchant="Amazon",
        channel="webhook",
        contact="mock_webhook",
        current_price=59990.0,
        effective_price=59990.0,
        target_price=62000.0,
        baseline_price=69900.0,
        previous_price=64990.0,
        savings_amount=9910.0,
        savings_pct=14.2,
        deal_score=88,
        verdict="BUY",
        summary_reason="Test webhook routing",
        rival_merchant=None,
        rival_price=None,
        affiliate_url="https://www.amazon.in/dp/B0CHX1W1XY",
        observed_at=datetime.now(timezone.utc),
        triggered_at=datetime.now(timezone.utc),
    )
    ok_wh = composite.dispatch(webhook_event)
    assert ok_wh is True


def test_get_recent_alerts_api():
    """GET /api/alerts/recent returns list of recently dispatched alert logs."""
    client = TestClient(app)
    resp = client.get("/api/alerts/recent?limit=10")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "recent_alerts" in data
    assert isinstance(data["recent_alerts"], list)
    if len(data["recent_alerts"]) > 0:
        first = data["recent_alerts"][0]
        assert "channel" in first
        assert "status" in first
        assert "product_title" in first


def test_list_and_delete_alerts_api():
    """GET /api/alerts lists active alerts and DELETE /api/alerts/{id} deactivates them."""
    client = TestClient(app)
    # 1. Create alert via POST /api/alerts
    post_resp = client.post(
        "/api/alerts",
        json={
            "product_title": "Test List & Delete Alert Product",
            "current_price": 4999.0,
            "target_price": 4500.0,
            "channel": "whatsapp",
            "contact": "+919999888877",
            "alert_type": "TARGET_PRICE",
        },
    )
    assert post_resp.status_code == 200
    alert_id = post_resp.json()["alert_id"]

    # 2. List alerts via GET /api/alerts
    list_resp = client.get("/api/alerts?contact=%2B919999888877")
    assert list_resp.status_code == 200
    alerts = list_resp.json()
    assert any(a["id"] == alert_id for a in alerts)

    # 3. Delete alert via DELETE /api/alerts/{alert_id}
    del_resp = client.delete(f"/api/alerts/{alert_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True

    # 4. Verify no longer in active list
    list_after = client.get("/api/alerts?contact=%2B919999888877").json()
    assert not any(a["id"] == alert_id for a in list_after)

