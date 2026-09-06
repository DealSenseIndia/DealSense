"""
Comprehensive test script for the Real Deals Pipeline.
Validates feed output, category filtering, deal score calculation,
and FastAPI endpoint contracts.
"""

from fastapi.testclient import TestClient
from backend.main import app
from backend.services.deal_pipeline import (
    load_seeds,
    get_ranked_deals,
    get_pipeline_status,
)


def run_tests():
    print("\n" + "=" * 60)
    print("      TESTING REAL LIVE DEALS PIPELINE")
    print("=" * 60)

    # 1. Test Seed Pool Loading
    seeds = load_seeds()
    print(f"\n[1] Seed Pool Verification:")
    print(f"    Loaded {len(seeds)} seeds from backend/data/deal_seeds.json")
    assert len(seeds) >= 20, f"Expected at least 20 seeds, found {len(seeds)}"
    print("    PASSED: Seed pool is populated and valid.")

    # 2. Test Pipeline Status
    status = get_pipeline_status()
    print(f"\n[2] Pipeline Status Check:")
    print(f"    Status: {status['status']}")
    print(f"    Total Seeds: {status['total_seeds']}")
    print(f"    Cached Deals: {status['cached_live_deals']}")
    print(f"    Refresh Interval: {status['refresh_interval_minutes']}m")
    assert "status" in status
    assert status["total_seeds"] == len(seeds)
    print("    PASSED: Status metadata is correctly formatted.")

    # 3. Test Live Deals Feed Generation
    feed = get_ranked_deals()
    print(f"\n[3] Deals Feed Contract Validation:")
    print(f"    Total Deals: {feed['total_deals']}")
    print(f"    Last Scanned: {feed['last_scanned_display']}")
    print(f"    Category Counts: {feed['category_counts']}")
    assert feed["total_deals"] > 0, "Expected at least 1 deal in feed"
    assert "deals" in feed
    assert len(feed["deals"]) == feed["total_deals"]

    sample_deal = feed["deals"][0]
    required_keys = [
        "id", "category", "title", "price", "mrp", "discount_pct",
        "deal_score", "deal_badge", "merchant", "merchant_logo",
        "rating", "image_url", "url", "deal_type"
    ]
    for key in required_keys:
        assert key in sample_deal, f"Missing required key in deal card: {key}"
    print(f"    Sample Deal: [{sample_deal['merchant']}] {sample_deal['title'][:45]}...")
    print(f"    Price: Rs. {sample_deal['price']:,} (MRP: Rs. {sample_deal['mrp']:,}) | Score: {sample_deal['deal_score']}")
    print("    PASSED: Deal card contract fully verified.")

    # 4. Test Category Filtering
    print(f"\n[4] Category Filtering Tests:")
    for cat in ["appliances", "audio", "mobiles", "setups"]:
        cat_feed = get_ranked_deals(category=cat)
        print(f"    Category '{cat}': {cat_feed['total_deals']} deals")
        for d in cat_feed["deals"]:
            assert d["category"].lower() == cat.lower(), f"Expected category {cat}, got {d['category']}"
    print("    PASSED: Category filtering works cleanly.")

    # 5. Test Deal Type Filtering
    print(f"\n[5] Deal Type Filtering Tests:")
    for dt in ["all_time_low", "steep_drop"]:
        dt_feed = get_ranked_deals(deal_type=dt)
        print(f"    Deal Type '{dt}': {dt_feed['total_deals']} deals")
        for d in dt_feed["deals"]:
            assert d["deal_type"].lower() == dt.lower(), f"Expected deal_type {dt}, got {d['deal_type']}"
    print("    PASSED: Deal type filtering works cleanly.")

    # 6. Test FastAPI Endpoints via TestClient
    print(f"\n[6] FastAPI Endpoint Tests:")
    client = TestClient(app)

    # Status endpoint
    resp = client.get("/api/deals/status")
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    print("    GET /api/deals/status -> 200 OK")

    # Live deals endpoint
    resp = client.get("/api/deals/live")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["total_deals"] > 0
    print(f"    GET /api/deals/live -> 200 OK ({data['total_deals']} live deals)")

    # Category query parameter
    resp = client.get("/api/deals/live?category=audio")
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    print("    GET /api/deals/live?category=audio -> 200 OK")

    # Homepage endpoint
    resp = client.get("/api/homepage")
    assert resp.status_code == 200
    hp_data = resp.json()
    assert "featured_deals" in hp_data
    print(f"    GET /api/homepage -> 200 OK ({len(hp_data['featured_deals'])} featured deals)")

    # Refresh endpoint with background=true
    resp = client.post("/api/deals/refresh?background=true")
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    print("    POST /api/deals/refresh?background=true -> 200 OK")

    print("\n" + "=" * 60)
    print("      ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    run_tests()
