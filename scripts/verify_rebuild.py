"""
End-to-End Verification Suite for DealSense Rebuild
Tests all core APIs, HTML routes, deep linking, setups, deals, and analysis engine.
"""

import json
import urllib.request
import urllib.error

BASE_URL = "http://127.0.0.1:8000"


def test_endpoint(name, url, method="GET", payload=None, expected_keys=None, expected_status=200):
    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            body = resp.read()
            assert status == expected_status, f"Expected {expected_status}, got {status}"
            if "application/json" in content_type:
                parsed = json.loads(body.decode("utf-8"))
                if expected_keys:
                    for k in expected_keys:
                        assert k in parsed, f"Missing key {k} in {name} response"
                print(f"  [PASS] {name}: Status {status}, JSON valid")
                return parsed
            else:
                text = body.decode("utf-8")
                print(f"  [PASS] {name}: Status {status}, HTML bytes: {len(text):,}")
                return text
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
        raise


def run_all_tests():
    print("\n--- 1. Testing Page Routes ---")
    home_html = test_endpoint("Homepage HTML", f"{BASE_URL}/")
    assert "homeView" in home_html, "homeView missing from homepage"
    assert "setupView" in home_html, "setupView missing from homepage"
    assert "mobileMenuBtn" in home_html, "mobileMenuBtn missing from homepage"

    deals_html = test_endpoint("Deals Page HTML", f"{BASE_URL}/deals")
    assert "All Deals" in deals_html, "All Deals header missing"

    cat_html = test_endpoint("Categories Page HTML", f"{BASE_URL}/categories")
    assert "All Product Categories" in cat_html, "Categories header missing"

    prod_html = test_endpoint("Product Deep Link HTML", f"{BASE_URL}/product/11")
    assert "DealSense" in prod_html, "Product deep link failed to serve SPA"

    print("\n--- 2. Testing Core APIs ---")
    home_api = test_endpoint("Homepage API", f"{BASE_URL}/api/homepage", expected_keys=["stats"])
    print(f"    Products tracked: {home_api['stats'].get('products_tracked')}")
    print(f"    Price checks: {home_api['stats'].get('price_checks')}")

    deals_api = test_endpoint("Live Deals API", f"{BASE_URL}/api/deals/live", expected_keys=["deals"])
    print(f"    Live deals count: {len(deals_api.get('deals', []))}")

    cat_api = test_endpoint("Categories API", f"{BASE_URL}/api/categories")
    print(f"    Categories count: {len(cat_api)}")

    print("\n--- 3. Testing Smart Setups MVP Engine ---")
    templates_api = test_endpoint("Setup Templates API", f"{BASE_URL}/api/setups/templates", expected_keys=["templates", "styles"])
    print(f"    Available spaces: {[t['key'] for t in templates_api['templates']]}")

    setup_payload = {
        "space": "wfh_desk",
        "budget": 30000,
        "owned": ["task_lighting"],
        "style": "modern_minimal"
    }
    setup_result = test_endpoint(
        "Setup Build API",
        f"{BASE_URL}/api/setups/build",
        method="POST",
        payload=setup_payload,
        expected_keys=["status", "tiers", "space", "requested_budget"]
    )
    assert setup_result["status"] == "success"
    print(f"    Built {len(setup_result['tiers'])} tiers for space '{setup_result['space']}'")
    for t in setup_result["tiers"]:
        print(f"      Tier '{t['tier_key']}' ({t['label']}): {len(t['items'])} items, Total: Rs {t['total_price']:,}")

    print("\n--- 4. Testing Product Analyzer MVP Engine ---")
    deal_check = test_endpoint(
        "Check Deal API (Amazon URL)",
        f"{BASE_URL}/api/check-deal",
        method="POST",
        payload={"url": "https://www.amazon.in/dp/B0CHX6PXX6"},
        expected_keys=["product", "pricing", "decision"]
    )
    print(f"    Product Title: {deal_check['product']['title'][:55]}...")
    print(f"    Current Price: Rs {deal_check['pricing']['current_price']:,}")
    print(f"    Verdict: {deal_check['decision']['verdict']} (Score: {deal_check['decision']['score']})")
    print(f"    Evidence Count: {len(deal_check['decision']['evidence'])}")

    print("\n--- 5. Testing Tracked Alerts API ---")
    test_endpoint("Alerts API", f"{BASE_URL}/api/alerts")

    print("\n=======================================================")
    print("  ALL CORE END-TO-END VERIFICATION CHECKS PASSED!  ")
    print("=======================================================\n")


if __name__ == "__main__":
    run_all_tests()
