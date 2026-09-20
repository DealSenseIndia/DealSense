"""
DealSense Alert Dispatch Worker Test Suite.
Verifies thread lifecycle, autonomous evaluation sweeps, criteria evaluation,
anti-spam cooldown, and API diagnostic endpoints.
"""

from datetime import datetime, timezone, timedelta
from typing import Tuple
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.database import get_session, init_db
from backend.main import app
from backend.models import PriceAlert, MerchantListing, Product
from backend.services.alert_service import create_alert, AlertStatus
from backend.services.alert_worker import AlertDispatchWorker
from backend.services.notification_dispatcher import TestConsoleDispatcher


@pytest.fixture(autouse=True)
def setup_database():
    """Initializes SQLite schema before each test."""
    init_db()


def _create_fixture_product_and_listing(
    price: float = 45000.0,
    mrp: float = 55000.0,
    merchant: str = "Amazon",
) -> Tuple[int, int]:
    """Helper to create a test Product and MerchantListing."""
    unique_ts = datetime.now().timestamp()
    with get_session() as s:
        p = Product(
            canonical_title=f"Sony Bravia 55-inch 4K TV {unique_ts}",
            brand="Sony",
            category_id="electronics",
        )
        s.add(p)
        s.commit()
        s.refresh(p)

        ml = MerchantListing(
            product_id=p.id,
            merchant=merchant,
            merchant_product_id=f"TEST_ALERT_{p.id}",
            url=f"https://www.amazon.in/dp/TEST_{p.id}",
            clean_url=f"https://www.amazon.in/dp/TEST_{p.id}",
            current_price=price,
            active=True,
            availability="in_stock",

            failure_count=0,
        )
        s.add(ml)
        s.commit()
        s.refresh(ml)
        return p.id, ml.id


def test_alert_worker_lifecycle():
    """Verifies that AlertDispatchWorker starts and stops cleanly without thread leakage."""
    worker = AlertDispatchWorker(poll_interval_seconds=0.1)
    assert not worker.is_running

    worker.start()
    assert worker.is_running

    # Starting already running worker should be idempotent
    worker.start()
    assert worker.is_running

    worker.stop(timeout=1.0)
    assert not worker.is_running


def test_alert_worker_triggers_armed_alert():
    """Verifies that an ARMED alert with current_price <= target_price triggers and dispatches."""
    pid, lid = _create_fixture_product_and_listing(price=42999.0, mrp=55000.0)

    # Register an alert in ARMED state with target_price = 45000 (higher than current 42999)
    alert = create_alert(
        product_title="Sony Bravia 55-inch",
        current_price=50000.0,
        target_price=45000.0,
        contact="123456789",
        channel="telegram",
        product_id=pid,
        listing_id=lid,
        is_persistent=False,
    )
    assert alert.status == AlertStatus.ARMED.value

    # Use an in-memory console dispatcher to capture emitted events
    test_dispatcher = TestConsoleDispatcher()
    worker = AlertDispatchWorker(poll_interval_seconds=1.0, dispatcher=test_dispatcher)

    events = worker.run_cycle()

    # 1. Event should be captured
    assert len(events) == 1
    event = events[0]
    assert event.alert_id == alert.id
    assert event.effective_price == 42999.0
    assert event.channel == "telegram"
    assert event.contact == "123456789"

    # 2. Alert status should transition out of ARMED (to COOLDOWN or DISABLED)
    with get_session() as s:
        refreshed = s.get(PriceAlert, alert.id)
        assert refreshed.status in (AlertStatus.COOLDOWN.value, AlertStatus.DISABLED.value, AlertStatus.TRIGGERED.value)
        assert refreshed.last_trigger_price == 42999.0

    # 3. Telemetry stats should be recorded
    status = worker.get_status()
    assert status["stats"]["total_cycles"] == 1
    assert status["stats"]["alerts_triggered_total"] == 1


def test_alert_worker_skips_unmet_conditions():
    """Verifies that an alert whose target price is below current price is NOT triggered."""
    pid, lid = _create_fixture_product_and_listing(price=48000.0, mrp=55000.0)

    # Target price is 40000 (lower than current 48000)
    alert = create_alert(
        product_title="Sony Bravia 55-inch",
        current_price=50000.0,
        target_price=40000.0,
        contact="987654321",
        channel="telegram",
        product_id=pid,
        listing_id=lid,
    )
    assert alert.status == AlertStatus.ARMED.value

    test_dispatcher = TestConsoleDispatcher()
    worker = AlertDispatchWorker(poll_interval_seconds=1.0, dispatcher=test_dispatcher)

    events = worker.run_cycle()
    assert len(events) == 0

    # Alert must remain ARMED
    with get_session() as s:
        refreshed = s.get(PriceAlert, alert.id)
        assert refreshed.status == AlertStatus.ARMED.value


def test_alert_worker_diagnostics_endpoint():
    """Verifies that GET /api/v1/alerts/worker/status returns active worker diagnostics."""
    client = TestClient(app)

    # Test v1 route
    resp = client.get("/api/v1/alerts/worker/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_running" in data
    assert "active_alerts" in data
    assert "stats" in data
    assert "poll_interval_seconds" in data

    # Test alias route
    resp_alias = client.get("/api/alerts/worker/status")
    assert resp_alias.status_code == 200


def test_alert_worker_manual_trigger_endpoint():
    """Verifies that POST /api/v1/alerts/worker/trigger forces a cycle sweep."""
    client = TestClient(app)

    resp = client.post("/api/v1/alerts/worker/trigger")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "events_triggered" in data
    assert "dispatched_events" in data
