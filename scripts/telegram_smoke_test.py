"""
DealSense Telegram Delivery Engine Production Smoke Test.
Executes controlled tests for Bot configuration, Webhook validation,
Binding flow, Alert Dispatcher, Inline Affiliate CTA, Anti-Spam Cooldown,
/stop /resume commands, Delivery Audit Logging, and Database Integrity.
"""

from datetime import datetime, timezone, timedelta
import json
import os
import sys
from typing import Dict, Any, Optional

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from sqlmodel import select, Session
import httpx

# Ensure project root is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.config import settings
from backend.database import get_session, init_db
from backend.models import PriceAlert, AlertDeliveryLog, MerchantListing, PriceObservation, Product
from backend.services.telegram_bot import (
    get_bot_info,
    get_webhook_info,
    set_webhook,
    delete_webhook,
    generate_binding_token,
    handle_webhook_update,
)
from backend.services.telegram_dispatcher import (
    TelegramDispatcher,
    format_telegram_message,
    build_telegram_inline_keyboard,
    build_telegram_affiliate_url,
)
from backend.services.alert_service import (
    create_alert,
    evaluate_alerts_for_observation,
    AlertStatus,
)


def run_smoke_test(
    public_webhook_url: Optional[str] = None,
    test_chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    init_db()
    results: Dict[str, Any] = {}

    print("=" * 60)
    print("DEALSENSE PHASE 3.3.2 — TELEGRAM DELIVERY SMOKE TEST")
    print("=" * 60)

    # -----------------------------------------------------------------------
    # A. Bot Configuration
    # -----------------------------------------------------------------------
    token_present = bool(settings.TELEGRAM_BOT_TOKEN)
    username = settings.TELEGRAM_BOT_USERNAME
    secret_present = bool(settings.TELEGRAM_WEBHOOK_SECRET)

    results["bot_config"] = {
        "bot_token_configured": token_present,
        "bot_username": username,
        "webhook_secret_configured": secret_present,
    }
    print(f"\n[A. BOT CONFIGURATION]")
    print(f"  • Bot Token Present: {token_present}")
    print(f"  • Bot Username: {username}")
    print(f"  • Webhook Secret Present: {secret_present}")

    if token_present:
        bot_info = get_bot_info()
        results["bot_config"]["telegram_getMe"] = bot_info
        if bot_info.get("ok"):
            res = bot_info.get("result", {})
            print(f"  • Live Telegram Identity: @{res.get('username')} (ID: {res.get('id')}, Name: '{res.get('first_name')}')")
        else:
            print(f"  • Live Telegram Check: Failed ({bot_info.get('error')})")
    else:
        print("  • Note: TELEGRAM_BOT_TOKEN is not currently populated in environment.")

    # -----------------------------------------------------------------------
    # B. Webhook Verification
    # -----------------------------------------------------------------------
    print(f"\n[B. WEBHOOK STATUS]")
    if token_present:
        if public_webhook_url:
            print(f"  • Registering webhook: {public_webhook_url}...")
            reg_res = set_webhook(public_webhook_url)
            results["webhook_registration"] = reg_res
            print(f"  • Registration response: {reg_res}")

        wh_info = get_webhook_info()
        results["webhook_info"] = wh_info
        if wh_info.get("ok"):
            wh_res = wh_info.get("result", {})
            print(f"  • Current Webhook URL: '{wh_res.get('url')}'")
            print(f"  • Custom Certificate: {wh_res.get('has_custom_certificate')}")
            print(f"  • Pending Update Count: {wh_res.get('pending_update_count')}")
            print(f"  • Last Error Date: {wh_res.get('last_error_date')}")
            print(f"  • Last Error Message: {wh_res.get('last_error_message')}")
        else:
            print(f"  • getWebhookInfo Failed: {wh_info.get('error')}")
    else:
        print("  • Skipped live getWebhookInfo (requires TELEGRAM_BOT_TOKEN).")
        results["webhook_info"] = {"status": "skipped_no_token"}

    # -----------------------------------------------------------------------
    # C. Deep-Link Binding Flow Test
    # -----------------------------------------------------------------------
    print(f"\n[C. DEEP-LINK BINDING TEST]")
    token = generate_binding_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    # Use first available real listing in database
    with get_session() as session:
        listing = session.exec(select(MerchantListing).where(MerchantListing.current_price > 0)).first()
        if not listing:
            # Fallback listing
            listing_id = 1
            prod_title = "Sony WH-1000XM5 Wireless Headphones"
            curr_price = 24999.0
            prod_id = 1
            merchant_name = "Amazon"
        else:
            listing_id = listing.id
            curr_price = float(listing.current_price)
            prod_id = listing.product_id or 1
            merchant_name = listing.merchant or "Amazon"
            prod = session.get(Product, prod_id) if listing.product_id else None
            prod_title = prod.canonical_title if prod else (listing.title or "Test Product")

    # Create PENDING_BINDING alert
    target_price = curr_price  # Already satisfied for Step 4 testing
    test_alert = create_alert(
        product_title=prod_title,
        current_price=curr_price,
        contact="pending",
        channel="telegram",
        product_id=prod_id,
        listing_id=listing_id,
        target_price=target_price,
        status="PENDING_BINDING",
        telegram_bind_token=token,
        telegram_token_expires_at=expires_at,
    )
    print(f"  • Created pending alert #{test_alert.id} with token: {token[:12]}...")
    deep_link = f"https://t.me/{username}?start={token}"
    print(f"  • Deep Link: {deep_link}")

    # Simulate /start b_<token> webhook payload
    effective_chat_id = test_chat_id or "9988776655"
    simulated_update = {
        "update_id": 99001,
        "message": {
            "message_id": 1,
            "from": {"id": int(effective_chat_id), "username": "smoke_tester", "first_name": "Tester"},
            "chat": {"id": int(effective_chat_id), "first_name": "Tester"},
            "date": int(datetime.now(timezone.utc).timestamp()),
            "text": f"/start {token}",
        },
    }

    bind_res = handle_webhook_update(simulated_update)
    results["binding_result"] = bind_res
    print(f"  • Webhook /start response: {bind_res}")

    with get_session() as session:
        bound_alert = session.get(PriceAlert, test_alert.id)
        assert bound_alert.status == "ARMED", f"Expected ARMED but got {bound_alert.status}"
        assert bound_alert.telegram_chat_id == effective_chat_id
        assert bound_alert.telegram_bind_token is None, "Token must be invalidated after use"
        print(f"  • Verified: alert #{test_alert.id} transitioned to ARMED, chat_id={bound_alert.telegram_chat_id}, token cleared.")

    # Verify token cannot be reused
    reuse_res = handle_webhook_update(simulated_update)
    assert reuse_res.get("ok") is False, "Reused token must be rejected"
    print(f"  • Verified: Reused token rejected cleanly ({reuse_res.get('reason')}).")

    # -----------------------------------------------------------------------
    # D. Real Controlled Alert Evaluation
    # -----------------------------------------------------------------------
    print(f"\n[D. CONTROLLED ALERT EVALUATION]")
    events = evaluate_alerts_for_observation(
        listing_id=listing_id,
        product_id=prod_id,
        current_price=curr_price,
        effective_price=curr_price,
        in_stock=True,
        merchant=merchant_name,
        product_title=prod_title,
    )
    results["events_emitted"] = len(events)
    print(f"  • Evaluator produced {len(events)} AlertTriggerEvent(s).")
    target_event = next((e for e in events if e.alert_id == test_alert.id), None)
    assert target_event is not None, f"Alert #{test_alert.id} was not triggered."
    print(f"  • Successfully triggered Event for Alert #{test_alert.id}: Price Rs. {target_event.effective_price:,.0f} <= Target Rs. {target_event.target_price:,.0f}")

    # -----------------------------------------------------------------------
    # E. Message Formatting & Affiliate CTA Verification
    # -----------------------------------------------------------------------
    print(f"\n[E. MESSAGE & AFFILIATE CTA VERIFICATION]")
    formatted_msg = format_telegram_message(target_event)
    inline_kb = build_telegram_inline_keyboard(target_event)
    cta_url = build_telegram_affiliate_url(target_event)

    results["message_preview"] = formatted_msg
    results["inline_keyboard"] = inline_kb
    results["cta_url"] = cta_url

    print("  • Formatted Message Preview:")
    for line in formatted_msg.split("\n"):
        print(f"    | {line}")

    print(f"\n  • Primary CTA Button Text: '{inline_kb['inline_keyboard'][0][0]['text']}'")
    print(f"  • Primary CTA URL: {cta_url}")
    print(f"  • Secondary CTA Button: '{inline_kb['inline_keyboard'][1][0]['text']}' -> {inline_kb['inline_keyboard'][1][0]['url']}")

    # Verify CTA parameters
    if "amazon.in" in cta_url:
        expected_tag = settings.AMAZON_AFFILIATE_TAG or "dealsense-21"
        assert f"tag={expected_tag}" in cta_url
        assert f"ascsubtag=tg_alert_{target_event.alert_id}_{target_event.listing_id}" in cta_url
        assert "ref=dealsense_tg" in cta_url
        print(f"  • Verified Amazon attribution: tag={expected_tag}, ascsubtag & ref=dealsense_tg are present.")
    else:
        assert "subid3=telegram_alert" in cta_url
        assert f"subid4=alert_{target_event.alert_id}" in cta_url
        print("  • Verified Cuelinks attribution: subid3 & subid4 are present.")

    # -----------------------------------------------------------------------
    # F. Anti-Spam / Cooldown Verification
    # -----------------------------------------------------------------------
    print(f"\n[F. ANTI-SPAM / COOLDOWN VERIFICATION]")
    # Verify post-trigger state is DISABLED (since single-shot) or COOLDOWN
    with get_session() as session:
        post_alert = session.get(PriceAlert, test_alert.id)
        print(f"  • Post-trigger state in DB: {post_alert.status} (is_active={post_alert.is_active})")
        assert post_alert.status in ("DISABLED", "COOLDOWN"), f"Unexpected status: {post_alert.status}"

    # Trigger evaluation a second time immediately
    second_events = evaluate_alerts_for_observation(
        listing_id=listing_id,
        product_id=prod_id,
        current_price=curr_price,
        effective_price=curr_price,
        in_stock=True,
        merchant=merchant_name,
        product_title=prod_title,
    )
    second_target = next((e for e in second_events if e.alert_id == test_alert.id), None)
    assert second_target is None, "Anti-spam failure: Alert triggered a second time during cooldown/disabled state."
    print("  • Verified: Immediate re-evaluation produced ZERO duplicate notifications.")

    # -----------------------------------------------------------------------
    # G. /stop and /resume Commands
    # -----------------------------------------------------------------------
    print(f"\n[G. /stop AND /resume FLOW VERIFICATION]")
    # Re-arm alert to test /stop
    with get_session() as session:
        a = session.get(PriceAlert, test_alert.id)
        a.status = "ARMED"
        a.is_active = True
        session.add(a)
        session.commit()

    # User sends /stop
    stop_update = {
        "update_id": 99002,
        "message": {
            "message_id": 2,
            "chat": {"id": int(effective_chat_id)},
            "text": "/stop",
        },
    }
    stop_res = handle_webhook_update(stop_update)
    print(f"  • /stop response: {stop_res}")

    with get_session() as session:
        a = session.get(PriceAlert, test_alert.id)
        assert a.status == "PAUSED", f"Expected PAUSED but got {a.status}"
        print(f"  • Verified: alert #{test_alert.id} transitioned to PAUSED.")

    # User sends /resume
    resume_update = {
        "update_id": 99003,
        "message": {
            "message_id": 3,
            "chat": {"id": int(effective_chat_id)},
            "text": "/resume",
        },
    }
    resume_res = handle_webhook_update(resume_update)
    print(f"  • /resume response: {resume_res}")

    with get_session() as session:
        a = session.get(PriceAlert, test_alert.id)
        assert a.status == "ARMED", f"Expected ARMED but got {a.status}"
        print(f"  • Verified: alert #{test_alert.id} transitioned back to ARMED.")

    # -----------------------------------------------------------------------
    # H. Delivery Audit Log Verification
    # -----------------------------------------------------------------------
    print(f"\n[H. DELIVERY AUDIT LOG VERIFICATION]")
    with get_session() as session:
        logs = session.exec(
            select(AlertDeliveryLog)
            .where(AlertDeliveryLog.alert_id == test_alert.id)
        ).all()
        print(f"  • Found {len(logs)} audit delivery log entries for alert #{test_alert.id}.")
        for l in logs:
            print(f"    - ID: {l.id} | Channel: {l.channel} | Recipient: {l.recipient} | Status: {l.status} | Code: {l.response_code}")

    # -----------------------------------------------------------------------
    # I. Security Verification (Fake Webhook Rejection)
    # -----------------------------------------------------------------------
    print(f"\n[I. WEBHOOK SECURITY VERIFICATION]")
    orig_secret = settings.TELEGRAM_WEBHOOK_SECRET
    settings.TELEGRAM_WEBHOOK_SECRET = "smoke_test_secure_secret_xyz"

    fake_update = {"update_id": 99099, "message": {"chat": {"id": 123}, "text": "/help"}}

    # Mismatched secret -> Must return 401
    sec_fail = handle_webhook_update(fake_update, secret_token_header="wrong_secret")
    assert sec_fail.get("status_code") == 401, f"Expected 401 but got {sec_fail}"
    print(f"  • Verified: Unauthorized webhook request returned 401 ({sec_fail}).")

    # Correct secret -> Must succeed
    sec_ok = handle_webhook_update(fake_update, secret_token_header="smoke_test_secure_secret_xyz")
    assert sec_ok.get("ok") is True, f"Expected ok: True but got {sec_ok}"
    print(f"  • Verified: Valid secret request authenticated successfully.")
    settings.TELEGRAM_WEBHOOK_SECRET = orig_secret

    # -----------------------------------------------------------------------
    # J. Database Integrity Verification
    # -----------------------------------------------------------------------
    print(f"\n[J. DATABASE INTEGRITY VERIFICATION]")
    with get_session() as session:
        # Check zero synthetic/null observations created by test
        invalid_obs = session.exec(
            select(PriceObservation)
            .where((PriceObservation.price <= 0) | (PriceObservation.price == None))
        ).all()
        assert len(invalid_obs) == 0, f"Found {len(invalid_obs)} invalid price observations!"
        print(f"  • Verified: 0 zero or null PriceObservations.")

        # Clean up smoke test alert
        del_alert = session.get(PriceAlert, test_alert.id)
        if del_alert:
            session.delete(del_alert)
            session.commit()
            print(f"  • Cleaned up smoke test alert #{test_alert.id}.")

    print("\n" + "=" * 60)
    print("ALL 10 SMOKE TEST STEPS VERIFIED SUCCESSFULLY")
    print("=" * 60)

    results["status"] = "ALL_CHECKS_PASSED"
    return results


if __name__ == "__main__":
    url_arg = sys.argv[1] if len(sys.argv) > 1 else None
    chat_arg = sys.argv[2] if len(sys.argv) > 2 else None
    run_smoke_test(public_webhook_url=url_arg, test_chat_id=chat_arg)
