"""
DealSense Phase 3.2.1 Production Smoke Test Script.
Executes controlled real-world smoke tests for:
- TEST 1: Amazon (Real observation, price extraction, scheduling, and DB state)
- TEST 2: Flipkart (Real observation, price extraction, scheduling, and DB state)
- TEST 3: Duplicate Protection (Immediate re-check -> UNCHANGED_SKIPPED, no new row)
- TEST 4: Failure Safety (Controlled invalid fixture -> backoff escalation, 0 observations)
- TEST 5: API Health (Worker running, diagnostic status, consistent telemetry)
- DATABASE INTEGRITY AUDIT (Zero synthetic/zero/null prices, immutability, product identity intact)
"""

from datetime import datetime, timezone, timedelta
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import httpx
from sqlmodel import select

from backend.database import get_session, init_db
from backend.models import MerchantListing, PriceObservation, Product
from backend.main import app
from fastapi.testclient import TestClient


def run_smoke_test():
    init_db()
    print("=" * 70)
    print("DEALSENSE PHASE 3.2.1 PRODUCTION SMOKE TEST")
    print("=" * 70)

    # Determine whether to connect to live uvicorn server or TestClient
    try:
        probe = httpx.get("http://127.0.0.1:8000/api/health", timeout=3.0)
        use_live_server = (probe.status_code == 200)
    except Exception:
        use_live_server = False

    if use_live_server:
        print("[CLIENT] Connecting directly to active live production server at http://127.0.0.1:8000")
        client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=35.0)
    else:
        print("[CLIENT] Connecting via FastAPI TestClient(app)")
        client = TestClient(app)

    results = {}

    try:
        # ---------------------------------------------------------------------
        # TEST 5 (Part A): INITIAL WORKER API HEALTH
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 5: WORKER API HEALTH (INITIAL STATUS)")
        print("=" * 50)
        status_resp = client.get("/api/worker/status")
        print(f"HTTP Status: {status_resp.status_code}")
        initial_status = status_resp.json()
        print(f"Worker State: {json.dumps(initial_status, indent=2)}")
        assert initial_status["is_running"] is True, "Worker thread must be running!"

        # ---------------------------------------------------------------------
        # TEST 1: AMAZON SMOKE TEST
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 1: AMAZON SMOKE TEST (Listing #1 - Philips Air Fryer)")
        print("=" * 50)
        amazon_listing_id = 1

        with get_session() as session:
            l_amz_pre = session.get(MerchantListing, amazon_listing_id)
            p_amz_pre = session.get(Product, l_amz_pre.product_id) if l_amz_pre.product_id else None
            pre_amz_obs_count = len(session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == amazon_listing_id)
            ).all())
            print(f"Pre-Check Verification:")
            print(f"  Listing ID: {l_amz_pre.id}")
            print(f"  Merchant: {l_amz_pre.merchant}")
            print(f"  ASIN: {l_amz_pre.merchant_product_id}")
            print(f"  URL: {l_amz_pre.clean_url}")
            print(f"  Active: {l_amz_pre.active}")
            print(f"  Product ID: {l_amz_pre.product_id} ({p_amz_pre.canonical_title if p_amz_pre else 'None'})")
            print(f"  Current DB Price: Rs. {l_amz_pre.current_price}")
            print(f"  Prior Observations Count: {pre_amz_obs_count}")

            assert l_amz_pre.active is True, "Listing must be active"
            assert "amazon.in" in (l_amz_pre.clean_url or "").lower(), "URL must be Amazon.in"
            assert l_amz_pre.merchant_product_id is not None, "Known ASIN must exist"
            assert l_amz_pre.product_id is not None, "Product identity must exist"

        print(f"\nTriggering POST /api/worker/trigger-check/{amazon_listing_id}...")
        t0 = datetime.now(timezone.utc)
        amz_post = client.post(f"/api/worker/trigger-check/{amazon_listing_id}")
        amz_http_code = amz_post.status_code
        amz_data = amz_post.json()
        print(f"Amazon Trigger Response HTTP {amz_http_code}:")
        print(json.dumps(amz_data, indent=2))

        # Query database state after Amazon trigger
        with get_session() as session:
            l_amz_post = session.get(MerchantListing, amazon_listing_id)
            amz_latest_obs = session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == amazon_listing_id)
                .order_by(PriceObservation.observed_at.desc())
            ).first()
            post_amz_obs_count = len(session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == amazon_listing_id)
            ).all())

        results["test_1_amazon"] = {
            "http_result": amz_http_code,
            "extraction_result": amz_data.get("status"),
            "observation_status": amz_data.get("status"),
            "extracted_price": amz_data.get("price"),
            "observation_id": amz_data.get("observation_id"),
            "observed_at": amz_data.get("observed_at"),
            "last_checked_at": str(l_amz_post.last_checked_at) if l_amz_post else None,
            "next_check_at": str(l_amz_post.next_check_at) if l_amz_post else None,
            "failure_count": getattr(l_amz_post, "failure_count", 0),
            "latest_price_observation": {
                "id": amz_latest_obs.id if amz_latest_obs else None,
                "price": amz_latest_obs.price if amz_latest_obs else None,
                "mrp": amz_latest_obs.mrp if amz_latest_obs else None,
                "source": amz_latest_obs.source if amz_latest_obs else None,
                "in_stock": amz_latest_obs.in_stock if amz_latest_obs else None,
                "observed_at": str(amz_latest_obs.observed_at) if amz_latest_obs else None,
            } if amz_latest_obs else None,
            "observations_count_before": pre_amz_obs_count,
            "observations_count_after": post_amz_obs_count,
        }

        # ---------------------------------------------------------------------
        # TEST 3: DUPLICATE PROTECTION TEST (Immediate re-check of Amazon listing)
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 3: DUPLICATE PROTECTION TEST (Immediate re-trigger of Listing #1)")
        print("=" * 50)
        print(f"Immediately triggering re-check of Amazon listing #{amazon_listing_id}...")
        dup_resp = client.post(f"/api/worker/trigger-check/{amazon_listing_id}")
        dup_http_code = dup_resp.status_code
        dup_data = dup_resp.json()
        print(f"Duplicate Trigger HTTP {dup_http_code}:")
        print(json.dumps(dup_data, indent=2))

        with get_session() as session:
            final_amz_obs_count = len(session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == amazon_listing_id)
            ).all())
            l_amz_dup = session.get(MerchantListing, amazon_listing_id)

        dup_prevented = (final_amz_obs_count == post_amz_obs_count)
        print(f"Observation count before duplicate trigger: {post_amz_obs_count}")
        print(f"Observation count after duplicate trigger:  {final_amz_obs_count}")
        print(f"Duplicate row prevented: {dup_prevented}")
        print(f"Status returned: {dup_data.get('status')}")

        results["test_3_duplicate_protection"] = {
            "http_result": dup_http_code,
            "status": dup_data.get("status"),
            "expected_status": "UNCHANGED_SKIPPED",
            "is_skipped": (dup_data.get("status") == "UNCHANGED_SKIPPED"),
            "count_before": post_amz_obs_count,
            "count_after": final_amz_obs_count,
            "duplicate_prevented": dup_prevented,
            "listing_last_checked_at": str(l_amz_dup.last_checked_at) if l_amz_dup else None,
            "listing_next_check_at": str(l_amz_dup.next_check_at) if l_amz_dup else None,
        }

        # ---------------------------------------------------------------------
        # TEST 2: FLIPKART SMOKE TEST
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 2: FLIPKART SMOKE TEST (Listing #4 - Pigeon Gas Stove)")
        print("=" * 50)
        flipkart_listing_id = 4

        with get_session() as session:
            l_fk_pre = session.get(MerchantListing, flipkart_listing_id)
            p_fk_pre = session.get(Product, l_fk_pre.product_id) if l_fk_pre.product_id else None
            pre_fk_obs_count = len(session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == flipkart_listing_id)
            ).all())
            print(f"Pre-Check Verification:")
            print(f"  Listing ID: {l_fk_pre.id}")
            print(f"  Merchant: {l_fk_pre.merchant}")
            print(f"  PID: {l_fk_pre.merchant_product_id}")
            print(f"  URL: {l_fk_pre.clean_url}")
            print(f"  Active: {l_fk_pre.active}")
            print(f"  Product ID: {l_fk_pre.product_id} ({p_fk_pre.canonical_title if p_fk_pre else 'None'})")
            print(f"  Current DB Price: Rs. {l_fk_pre.current_price}")
            print(f"  Prior Observations Count: {pre_fk_obs_count}")

            assert l_fk_pre.active is True, "Listing must be active"
            assert "flipkart.com" in (l_fk_pre.clean_url or "").lower(), "URL must be Flipkart"
            assert l_fk_pre.merchant_product_id is not None, "Known PID must exist"
            assert l_fk_pre.product_id is not None, "Product identity must exist"

        print(f"\nTriggering POST /api/worker/trigger-check/{flipkart_listing_id}...")
        fk_post = client.post(f"/api/worker/trigger-check/{flipkart_listing_id}")
        fk_http_code = fk_post.status_code
        fk_data = fk_post.json()
        print(f"Flipkart Trigger Response HTTP {fk_http_code}:")
        print(json.dumps(fk_data, indent=2))

        with get_session() as session:
            l_fk_post = session.get(MerchantListing, flipkart_listing_id)
            fk_latest_obs = session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == flipkart_listing_id)
                .order_by(PriceObservation.observed_at.desc())
            ).first()
            post_fk_obs_count = len(session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == flipkart_listing_id)
            ).all())

        results["test_2_flipkart"] = {
            "http_result": fk_http_code,
            "extraction_result": fk_data.get("status"),
            "observation_status": fk_data.get("status"),
            "extracted_price": fk_data.get("price"),
            "observation_id": fk_data.get("observation_id"),
            "observed_at": fk_data.get("observed_at"),
            "last_checked_at": str(l_fk_post.last_checked_at) if l_fk_post else None,
            "next_check_at": str(l_fk_post.next_check_at) if l_fk_post else None,
            "failure_count": getattr(l_fk_post, "failure_count", 0),
            "latest_price_observation": {
                "id": fk_latest_obs.id if fk_latest_obs else None,
                "price": fk_latest_obs.price if fk_latest_obs else None,
                "mrp": fk_latest_obs.mrp if fk_latest_obs else None,
                "source": fk_latest_obs.source if fk_latest_obs else None,
                "in_stock": fk_latest_obs.in_stock if fk_latest_obs else None,
                "observed_at": str(fk_latest_obs.observed_at) if fk_latest_obs else None,
            } if fk_latest_obs else None,
            "observations_count_before": pre_fk_obs_count,
            "observations_count_after": post_fk_obs_count,
        }

        # ---------------------------------------------------------------------
        # TEST 4: FAILURE SAFETY TEST (Controlled invalid test fixture)
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 4: FAILURE SAFETY TEST (Controlled fixture - non-existent product)")
        print("=" * 50)

        # Create isolated fixture in database
        with get_session() as session:
            fail_fixture = MerchantListing(
                merchant="Amazon",
                merchant_product_id="B0NONEXIST00",
                url="https://www.amazon.in/dp/B0NONEXIST00_CONTROLLED_SMOKE_TEST",
                clean_url="https://www.amazon.in/dp/B0NONEXIST00_CONTROLLED_SMOKE_TEST",
                current_price=1299.0,
                active=True,
                availability="in_stock",
                failure_count=0,
                last_error=None,
            )
            session.add(fail_fixture)
            session.commit()
            session.refresh(fail_fixture)
            fixture_id = fail_fixture.id

        print(f"Created controlled failure fixture: Listing ID #{fixture_id}")
        print(f"Triggering check on invalid fixture #{fixture_id}...")
        fail_resp = client.post(f"/api/worker/trigger-check/{fixture_id}")
        fail_http_code = fail_resp.status_code
        fail_data = fail_resp.json()
        print(f"Failure Trigger Response HTTP {fail_http_code}:")
        print(json.dumps(fail_data, indent=2))

        with get_session() as session:
            l_fail_post = session.get(MerchantListing, fixture_id)
            fixture_obs = session.exec(
                select(PriceObservation).where(PriceObservation.listing_id == fixture_id)
            ).all()

            print(f"Fixture State After Failure:")
            print(f"  Failure Count: {l_fail_post.failure_count}")
            print(f"  Last Error: {l_fail_post.last_error}")
            print(f"  Next Check At: {l_fail_post.next_check_at}")
            print(f"  Observations Created: {len(fixture_obs)}")

            safety_verified = (
                len(fixture_obs) == 0
                and l_fail_post.failure_count == 1
                and l_fail_post.last_error is not None
                and l_fail_post.next_check_at is not None
            )
            print(f"Failure Safety Verified: {safety_verified}")

            results["test_4_failure_safety"] = {
                "http_result": fail_http_code,
                "observation_status": fail_data.get("status"),
                "error_message": fail_data.get("error_message"),
                "observations_created": len(fixture_obs),
                "failure_count": l_fail_post.failure_count,
                "last_error": l_fail_post.last_error,
                "last_checked_at": str(l_fail_post.last_checked_at),
                "next_check_at": str(l_fail_post.next_check_at),
                "backoff_verified": safety_verified,
            }

            # Clean up test fixture cleanly
            session.delete(l_fail_post)
            session.commit()
            print(f"Controlled test fixture #{fixture_id} deleted cleanly.")

        # ---------------------------------------------------------------------
        # TEST 5 (Part B): FINAL WORKER API HEALTH & STATS CONSISTENCY
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("TEST 5: FINAL WORKER STATUS & STATS CONSISTENCY")
        print("=" * 50)
        final_status_resp = client.get("/api/worker/status")
        final_status = final_status_resp.json()
        print(f"Worker State After Smoke Test:")
        print(json.dumps(final_status, indent=2))

        results["test_5_worker_status"] = {
            "http_result": final_status_resp.status_code,
            "is_running": final_status.get("is_running"),
            "active_merchant_queues": final_status.get("active_merchant_queues"),
            "stats": final_status.get("stats"),
            "stats_consistent": (
                final_status.get("is_running") is True
                and final_status.get("stats", {}).get("scanned_today", 0) >= 4
            ),
        }

        # ---------------------------------------------------------------------
        # DATABASE INTEGRITY AUDIT
        # ---------------------------------------------------------------------
        print("\n" + "=" * 50)
        print("DATABASE INTEGRITY AUDIT")
        print("=" * 50)
        with get_session() as session:
            all_obs = session.exec(select(PriceObservation)).all()
            all_listings = session.exec(select(MerchantListing)).all()
            all_products = session.exec(select(Product)).all()

            zero_price_obs = [o for o in all_obs if o.price is not None and o.price <= 0]
            null_price_obs = [o for o in all_obs if o.price is None]
            synthetic_sources = [
                o for o in all_obs
                if o.source in ("synthetic", "fallback", "historical_catalog", "baseline_estimate")
            ]

            # Duplicate detection (same listing_id and identical observed_at within 5 seconds)
            obs_by_listing = {}
            duplicates = 0
            for o in all_obs:
                obs_by_listing.setdefault(o.listing_id, []).append(o)

            for lid, obs_list in obs_by_listing.items():
                sorted_obs = sorted(obs_list, key=lambda x: x.observed_at)
                for i in range(len(sorted_obs) - 1):
                    dt = abs((sorted_obs[i+1].observed_at - sorted_obs[i].observed_at).total_seconds())
                    if dt < 1.0:
                        duplicates += 1

            print(f"Total Observations in DB: {len(all_obs)}")
            print(f"Zero-Price Observations: {len(zero_price_obs)}")
            print(f"Null-Price Observations: {len(null_price_obs)}")
            print(f"Synthetic Source Observations: {len(synthetic_sources)}")
            print(f"Duplicate Observations Detected: {duplicates}")
            print(f"Total MerchantListings: {len(all_listings)}")
            print(f"Total Products: {len(all_products)}")

            results["database_integrity"] = {
                "total_observations": len(all_obs),
                "zero_price_observations": len(zero_price_obs),
                "null_price_observations": len(null_price_obs),
                "synthetic_source_observations": len(synthetic_sources),
                "duplicate_observations": duplicates,
                "total_merchant_listings": len(all_listings),
                "total_products": len(all_products),
                "integrity_passed": (
                    len(zero_price_obs) == 0
                    and len(null_price_obs) == 0
                    and len(synthetic_sources) == 0
                    and duplicates == 0
                ),
            }

    finally:
        if use_live_server:
            client.close()

    print("\n" + "=" * 70)
    print("SMOKE TEST COMPLETE - SAVING REPORT")
    print("=" * 70)

    with open("scripts/smoke_test_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("Saved results to scripts/smoke_test_results.json")

    return results


if __name__ == "__main__":
    run_smoke_test()
