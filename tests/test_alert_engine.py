"""
DealSense Alert Engine Test Suite (Phase 3.3.1).
Covers all 26 required test cases for criteria evaluation, atomic claim,
state machine transitions, anti-spam cooldown, hysteresis, and API endpoints.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.database import get_session, init_db
from backend.main import app
from backend.models import PriceAlert, MerchantListing, Product, PriceObservation
from backend.services.alert_service import (
    create_alert,
    pause_alert,
    resume_alert,
    disable_alert,
    delete_alert,
    get_alert,
    list_alerts,
    evaluate_alerts_for_observation,
    compute_recovery_threshold,
    AlertType,
    AlertStatus,
)
from backend.services.notification_dispatcher import (
    AlertTriggerEvent,
    TestConsoleDispatcher,
    NotificationDispatcher,
)


@pytest.fixture(autouse=True)
def setup_db():
    """Ensures DB is initialized before tests."""
    init_db()


def _create_test_product_and_listing(
    price: float = 5000.0,
    mrp: float = 6500.0,
    merchant: str = "Amazon",
) -> Tuple[int, int]:
    """Helper to create test Product and MerchantListing records."""
    from typing import Tuple
    with get_session() as s:
        p = Product(
            canonical_title=f"Test Headphones {datetime.now().timestamp()}",
            brand="TestBrand",
            category_id="electronics",
        )
        s.add(p)
        s.commit()
        s.refresh(p)

        ml = MerchantListing(
            product_id=p.id,
            merchant=merchant,
            merchant_product_id=f"TEST_{p.id}",
            url="https://www.amazon.in/dp/TESTPROD",
            clean_url="https://www.amazon.in/dp/TESTPROD",
            current_price=price,
            active=True,
            availability="in_stock",
            failure_count=0,
        )
        s.add(ml)
        s.commit()
        s.refresh(ml)
        return p.id, ml.id


# -----------------------------------------------------------------------------
# 1. Target above threshold does not trigger
# -----------------------------------------------------------------------------
def test_target_above_threshold_does_not_trigger():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    # Observation at 4800 is still above 4500
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4800.0,
        effective_price=4800.0,
        in_stock=True,
        dispatcher=dispatcher,
    )

    assert len(events) == 0
    refreshed = get_alert(alert.id)
    assert refreshed.status == AlertStatus.ARMED.value
    assert len(dispatcher.get_dispatched_events()) == 0


# -----------------------------------------------------------------------------
# 2. Target exact equality triggers
# -----------------------------------------------------------------------------
def test_target_exact_equality_triggers():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    # Exact equality (4500.0 <= 4500.0)
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4500.0,
        effective_price=4500.0,
        in_stock=True,
        dispatcher=dispatcher,
    )

    assert len(events) == 1
    assert events[0].alert_id == alert.id
    assert events[0].current_price == 4500.0
    assert len(dispatcher.get_dispatched_events()) == 1


# -----------------------------------------------------------------------------
# 3. Target below threshold triggers
# -----------------------------------------------------------------------------
def test_target_below_threshold_triggers():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    # 4200.0 < 4500.0
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4200.0,
        effective_price=4200.0,
        in_stock=True,
        dispatcher=dispatcher,
    )

    assert len(events) == 1
    assert events[0].current_price == 4200.0


# -----------------------------------------------------------------------------
# 4. Missing price suppresses
# -----------------------------------------------------------------------------
def test_missing_price_suppresses():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    # None or non-positive price suppresses
    for invalid_p in (None, 0.0, -100.0):
        events = evaluate_alerts_for_observation(
            listing_id=l_id,
            product_id=p_id,
            current_price=invalid_p,
            effective_price=invalid_p,
            in_stock=True,
            dispatcher=dispatcher,
        )
        assert len(events) == 0

    assert get_alert(alert.id).status == AlertStatus.ARMED.value


# -----------------------------------------------------------------------------
# 5. Out-of-stock suppresses
# -----------------------------------------------------------------------------
def test_out_of_stock_suppresses():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    # Price dropped to 3999, but in_stock is False
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=3999.0,
        effective_price=3999.0,
        in_stock=False,
        dispatcher=dispatcher,
    )

    assert len(events) == 0
    assert get_alert(alert.id).status == AlertStatus.ARMED.value


# -----------------------------------------------------------------------------
# 6. Percentage drop uses immutable baseline
# -----------------------------------------------------------------------------
def test_percentage_drop_uses_immutable_baseline():
    p_id, l_id = _create_test_product_and_listing(price=10000.0)
    dispatcher = TestConsoleDispatcher()

    # 15% drop from baseline 10,000 -> target is 8,500
    alert = create_alert(
        product_title="Test Product",
        current_price=10000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.PERCENTAGE_DROP.value,
        target_percentage=15.0,
    )

    assert alert.baseline_price == 10000.0
    assert alert.target_price == 8500.0

    # Price drops to 8,800 (12% drop, less than 15%) -> does not trigger
    events_8800 = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=8800.0,
        effective_price=8800.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events_8800) == 0

    # Price drops to 8,400 (16% drop, exceeds 15%) -> triggers
    events_8400 = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=8400.0,
        effective_price=8400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events_8400) == 1
    assert events_8400[0].baseline_price == 10000.0


# -----------------------------------------------------------------------------
# 7. Percentage threshold boundary works
# -----------------------------------------------------------------------------
def test_percentage_threshold_boundary():
    p_id, l_id = _create_test_product_and_listing(price=2000.0)
    dispatcher = TestConsoleDispatcher()

    # 10% drop on 2000 -> target is 1800
    alert = create_alert(
        product_title="Test Product",
        current_price=2000.0,
        contact="user@example.com",
        channel="email",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.PERCENTAGE_DROP.value,
        target_percentage=10.0,
    )

    # Exact boundary 1800 (exactly 10.0% drop)
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=1800.0,
        effective_price=1800.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events) == 1
    assert events[0].savings_pct == 10.0


# -----------------------------------------------------------------------------
# 8. Deal score + BUY triggers
# -----------------------------------------------------------------------------
def test_deal_score_and_buy_triggers():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.DEAL_SCORE.value,
        target_deal_score=80,
    )

    # Score 85, Verdict BUY, Confidence HIGH
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4500.0,
        effective_price=4500.0,
        in_stock=True,
        deal_score=85,
        verdict="BUY",
        confidence="HIGH",
        dispatcher=dispatcher,
    )

    assert len(events) == 1
    assert events[0].deal_score == 85
    assert events[0].verdict == "BUY"


# -----------------------------------------------------------------------------
# 9. Deal score + WAIT does not trigger
# -----------------------------------------------------------------------------
def test_deal_score_and_wait_does_not_trigger():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.DEAL_SCORE.value,
        target_deal_score=80,
    )

    # Score 85, but verdict is WAIT
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4500.0,
        effective_price=4500.0,
        in_stock=True,
        deal_score=85,
        verdict="WAIT",
        confidence="HIGH",
        dispatcher=dispatcher,
    )

    assert len(events) == 0


# -----------------------------------------------------------------------------
# 10. Deal score + AVOID does not trigger
# -----------------------------------------------------------------------------
def test_deal_score_and_avoid_does_not_trigger():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.DEAL_SCORE.value,
        target_deal_score=80,
    )

    # Score 90, but verdict is AVOID (e.g. inflated MRP fake discount)
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4500.0,
        effective_price=4500.0,
        in_stock=True,
        deal_score=90,
        verdict="AVOID",
        confidence="HIGH",
        dispatcher=dispatcher,
    )

    assert len(events) == 0


# -----------------------------------------------------------------------------
# 11. Low confidence suppresses
# -----------------------------------------------------------------------------
def test_low_confidence_suppresses():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.DEAL_SCORE.value,
        target_deal_score=80,
    )

    for bad_conf in ("LOW", "INSUFFICIENT"):
        events = evaluate_alerts_for_observation(
            listing_id=l_id,
            product_id=p_id,
            current_price=4500.0,
            effective_price=4500.0,
            in_stock=True,
            deal_score=85,
            verdict="BUY",
            confidence=bad_conf,
            dispatcher=dispatcher,
        )
        assert len(events) == 0


# -----------------------------------------------------------------------------
# 12. Cooldown suppresses duplicate
# -----------------------------------------------------------------------------
def test_cooldown_suppresses_duplicate():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
        is_persistent=True,
        cooldown_hours=24,
    )

    # First trigger at 4400 -> transitions to COOLDOWN
    events_1 = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4400.0,
        effective_price=4400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events_1) == 1
    refreshed = get_alert(alert.id)
    assert refreshed.status == AlertStatus.COOLDOWN.value

    # Second observation 1 hour later at 4400 -> suppressed by COOLDOWN
    events_2 = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4400.0,
        effective_price=4400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events_2) == 0
    assert len(dispatcher.get_dispatched_events()) == 1


# -----------------------------------------------------------------------------
# 13. Recovery threshold rearms
# -----------------------------------------------------------------------------
def test_recovery_threshold_rearms():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
        is_persistent=True,
        cooldown_hours=24,
    )

    # Trigger at 4400 -> COOLDOWN
    evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4400.0,
        effective_price=4400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert get_alert(alert.id).status == AlertStatus.COOLDOWN.value

    # Recovery threshold for 4500 is max(4500*1.02 = 4590, 4500+100 = 4600) -> 4600.0
    # Price recovers to 4700 (> 4600) -> transitions COOLDOWN directly to ARMED
    evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4700.0,
        effective_price=4700.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert get_alert(alert.id).status == AlertStatus.ARMED.value


# -----------------------------------------------------------------------------
# 14. Persistent alert re-arms
# -----------------------------------------------------------------------------
def test_persistent_alert_rearms():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
        is_persistent=True,
    )

    # 1. Trigger
    evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4400.0,
        effective_price=4400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert get_alert(alert.id).status == AlertStatus.COOLDOWN.value

    # 2. Price recovers above 4600 -> ARMED
    evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4800.0,
        effective_price=4800.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert get_alert(alert.id).status == AlertStatus.ARMED.value

    # 3. Price drops again to 4300 -> Triggers a second time!
    events_2 = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4300.0,
        effective_price=4300.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events_2) == 1
    assert get_alert(alert.id).trigger_count == 2


# -----------------------------------------------------------------------------
# 15. Single-shot alert disables
# -----------------------------------------------------------------------------
def test_single_shot_alert_disables():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    # is_persistent is False by default (single-shot)
    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
        is_persistent=False,
    )

    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4400.0,
        effective_price=4400.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events) == 1
    refreshed = get_alert(alert.id)
    assert refreshed.status == AlertStatus.DISABLED.value
    assert refreshed.is_active is False


# -----------------------------------------------------------------------------
# 16. Pause suppresses
# -----------------------------------------------------------------------------
def test_pause_suppresses():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    paused = pause_alert(alert.id)
    assert paused.status == AlertStatus.PAUSED.value

    # Target price satisfied, but alert is PAUSED
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4000.0,
        effective_price=4000.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events) == 0
    assert len(dispatcher.get_dispatched_events()) == 0


# -----------------------------------------------------------------------------
# 17. Resume re-arms
# -----------------------------------------------------------------------------
def test_resume_rearms():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )
    pause_alert(alert.id)
    resumed = resume_alert(alert.id)
    assert resumed.status == AlertStatus.ARMED.value

    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4200.0,
        effective_price=4200.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events) == 1


# -----------------------------------------------------------------------------
# 18. Disabled alert never evaluates
# -----------------------------------------------------------------------------
def test_disabled_alert_never_evaluates():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )
    disabled = disable_alert(alert.id)
    assert disabled.status == AlertStatus.DISABLED.value

    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=3000.0,
        effective_price=3000.0,
        in_stock=True,
        dispatcher=dispatcher,
    )
    assert len(events) == 0


# -----------------------------------------------------------------------------
# 19. Simultaneous evaluation produces maximum one trigger
# -----------------------------------------------------------------------------
def test_simultaneous_evaluation_produces_maximum_one_trigger():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Concurrent Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    import concurrent.futures

    def evaluate_task():
        return evaluate_alerts_for_observation(
            listing_id=l_id,
            product_id=p_id,
            current_price=4200.0,
            effective_price=4200.0,
            in_stock=True,
            dispatcher=dispatcher,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(evaluate_task) for _ in range(5)]
        all_results = [f.result() for f in concurrent.futures.as_completed(futures)]

    total_events = sum(len(res) for res in all_results)
    assert total_events == 1, f"Expected exactly 1 trigger, got {total_events}"
    assert len(dispatcher.get_dispatched_events()) == 1


# -----------------------------------------------------------------------------
# 20. Dispatcher receives correct immutable event
# -----------------------------------------------------------------------------
def test_dispatcher_receives_correct_immutable_event():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    alert = create_alert(
        product_title="Philips Audio",
        current_price=5000.0,
        contact="user@domain.com",
        channel="email",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
    )

    obs_time = datetime.now(timezone.utc)
    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4200.0,
        effective_price=4200.0,
        in_stock=True,
        deal_score=92,
        verdict="BUY",
        summary_reason="All-time low price verified.",
        merchant="Amazon",
        product_title="Philips Audio",
        observed_at=obs_time,
        dispatcher=dispatcher,
    )

    assert len(events) == 1
    e = events[0]
    assert e.alert_id == alert.id
    assert e.alert_type == "TARGET_PRICE"
    assert e.product_id == p_id
    assert e.product_title == "Philips Audio"
    assert e.current_price == 4200.0
    assert e.deal_score == 92
    assert e.verdict == "BUY"
    assert e.channel == "email"
    assert e.contact == "user@domain.com"
    assert e.savings_amount == 800.0  # 5000 baseline - 4200 current


# -----------------------------------------------------------------------------
# 21. Dispatcher failure does not roll back alert state
# -----------------------------------------------------------------------------
def test_dispatcher_failure_does_not_roll_back_alert_state():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)

    class FailingDispatcher:
        def dispatch(self, event: AlertTriggerEvent) -> bool:
            raise RuntimeError("Delivery network catastrophic failure")

    failing_dispatcher = FailingDispatcher()

    alert = create_alert(
        product_title="Test Product",
        current_price=5000.0,
        contact="9876543210",
        product_id=p_id,
        listing_id=l_id,
        alert_type=AlertType.TARGET_PRICE.value,
        target_price=4500.0,
        is_persistent=False,
    )

    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=4200.0,
        effective_price=4200.0,
        in_stock=True,
        dispatcher=failing_dispatcher,
    )

    # Event was constructed and state was committed prior to dispatcher failure
    assert len(events) == 1
    refreshed = get_alert(alert.id)
    assert refreshed.status == AlertStatus.DISABLED.value
    assert refreshed.trigger_count == 1


# -----------------------------------------------------------------------------
# 22. Existing legacy PriceAlert still works
# -----------------------------------------------------------------------------
def test_existing_legacy_price_alert_still_works():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)
    dispatcher = TestConsoleDispatcher()

    # Legacy record inserted directly with only legacy fields populated
    with get_session() as s:
        legacy = PriceAlert(
            product_id=p_id,
            listing_id=l_id,
            product_title="Legacy Alert Product",
            target_price=4000.0,
            current_price=5000.0,
            channel="whatsapp",
            contact="919876543210",
            is_active=True,
            status="ARMED",
            alert_type="TARGET_PRICE",
        )
        s.add(legacy)
        s.commit()
        s.refresh(legacy)
        legacy_id = legacy.id

    events = evaluate_alerts_for_observation(
        listing_id=l_id,
        product_id=p_id,
        current_price=3900.0,
        effective_price=3900.0,
        in_stock=True,
        dispatcher=dispatcher,
    )

    assert len(events) == 1
    assert events[0].alert_id == legacy_id
    assert events[0].current_price == 3900.0


# -----------------------------------------------------------------------------
# 23. API create works
# -----------------------------------------------------------------------------
def test_api_create_works():
    p_id, l_id = _create_test_product_and_listing(price=6000.0)

    with TestClient(app) as client:
        # 1. Target Price Create
        r1 = client.post("/api/alerts", json={
            "product_id": p_id,
            "listing_id": l_id,
            "product_title": "Sony Headphones",
            "current_price": 6000.0,
            "target_price": 5000.0,
            "alert_type": "TARGET_PRICE",
            "channel": "whatsapp",
            "contact": "+919876543210",
        })
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["success"] is True
        assert d1["status"] == "ARMED"
        assert d1["target_price"] == 5000.0

        # 2. Percentage Drop Create
        r2 = client.post("/api/alerts", json={
            "product_id": p_id,
            "listing_id": l_id,
            "product_title": "Sony Headphones",
            "current_price": 6000.0,
            "alert_type": "PERCENTAGE_DROP",
            "target_percentage": 10.0,
            "channel": "email",
            "contact": "audio@example.com",
        })
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["baseline_price"] == 6000.0
        assert d2["target_price"] == 5400.0


# -----------------------------------------------------------------------------
# 24. API pause/resume works
# -----------------------------------------------------------------------------
def test_api_pause_resume_works():
    p_id, l_id = _create_test_product_and_listing(price=6000.0)

    with TestClient(app) as client:
        create_resp = client.post("/api/alerts", json={
            "product_id": p_id,
            "listing_id": l_id,
            "product_title": "Camera",
            "current_price": 6000.0,
            "target_price": 5000.0,
            "channel": "whatsapp",
            "contact": "9876543210",
        })
        aid = create_resp.json()["alert_id"]

        # Pause
        p_resp = client.post(f"/api/alerts/{aid}/pause")
        assert p_resp.status_code == 200
        assert p_resp.json()["status"] == "PAUSED"

        # Resume
        r_resp = client.post(f"/api/alerts/{aid}/resume")
        assert r_resp.status_code == 200
        assert r_resp.json()["status"] == "ARMED"


# -----------------------------------------------------------------------------
# 25. API delete/disable works
# -----------------------------------------------------------------------------
def test_api_delete_disable_works():
    p_id, l_id = _create_test_product_and_listing(price=6000.0)

    with TestClient(app) as client:
        create_resp = client.post("/api/alerts", json={
            "product_id": p_id,
            "listing_id": l_id,
            "product_title": "Smart Watch",
            "current_price": 6000.0,
            "target_price": 4000.0,
            "channel": "whatsapp",
            "contact": "9876543210",
        })
        aid = create_resp.json()["alert_id"]

        del_resp = client.delete(f"/api/alerts/{aid}")
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

        # Verify not found
        get_resp = client.get(f"/api/alerts/{aid}")
        assert get_resp.status_code == 404


# -----------------------------------------------------------------------------
# 26. API evaluation works
# -----------------------------------------------------------------------------
def test_api_evaluation_works():
    p_id, l_id = _create_test_product_and_listing(price=5000.0)

    # Insert a verified price observation for this listing at 4200
    with get_session() as s:
        obs = PriceObservation(
            listing_id=l_id,
            price=4200.0,
            mrp=6000.0,
            currency="INR",
            effective_price=4200.0,
            in_stock=True,
            source="live_extraction",
            observed_at=datetime.now(timezone.utc),
        )
        s.add(obs)
        s.commit()

    with TestClient(app) as client:
        # Create alert with target 4500
        client.post("/api/alerts", json={
            "product_id": p_id,
            "listing_id": l_id,
            "product_title": "Evaluate Test Product",
            "current_price": 5000.0,
            "target_price": 4500.0,
            "channel": "whatsapp",
            "contact": "9876543210",
        })

        # Call diagnostic evaluate endpoint
        eval_resp = client.post(f"/api/alerts/evaluate/{l_id}")
        assert eval_resp.status_code == 200
        d = eval_resp.json()
        assert d["success"] is True
        assert d["events_emitted"] >= 1
        assert d["events"][0]["current_price"] == 4200.0
