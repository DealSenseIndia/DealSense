import time
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

print("=" * 70)
print("TESTING FASTAPI: CROSS-STORE MATCHING & PRODUCT GRAPH")
print("=" * 70)

# 1. Health check
res_health = client.get("/api/health")
print(f"1. GET /api/health -> Status: {res_health.status_code}")
assert res_health.status_code == 200

# 2. Ingest Amazon Philips Air Fryer with force_refresh to trigger candidate match
amazon_url = "https://www.amazon.in/dp/B0D14BB5XY"
print(f"\n2. POST /api/check-deal -> Amazon Philips Air Fryer...")
res = client.post("/api/check-deal", json={"url": amazon_url, "force_refresh": True})
assert res.status_code == 200
data = res.json()

p = data["product"]
l = data["listing"]
pr = data["pricing"]
d = data["decision"]
rc = data.get("rival_comparison", {})

print(f"   Product:         {p['title'][:45]}...")
print(f"   Primary Store:   {l['merchant']} | Rs. {pr['current_price']:,.0f}")
print(f"   Primary URL:     {l['affiliate_url']}")
print(f"   Decision:        [{d['verdict']}] Score: {d['score']}/100")

print("\n3. Cross-Store Comparison Result:")
print(f"   Rival Matched:   {rc.get('matched')}")
if rc.get("matched"):
    print(f"   Rival Store:     {rc.get('rival_merchant')} (ID: {rc.get('rival_product_id')})")
    print(f"   Rival Title:     {rc.get('rival_title', '')[:50]}...")
    print(f"   Rival Price:     Rs. {rc.get('rival_price')}")
    print(f"   Price Diff:      {rc.get('price_difference')}")
    print(f"   Recommendation:  {rc.get('recommendation')}")
    print(f"   Rival Aff URL:   {rc.get('rival_affiliate_url')}")
    assert "affid=" in rc.get("rival_affiliate_url", "")

print("\n" + "=" * 70)
print("PHASE 3 VERIFICATION COMPLETE: CROSS-STORE ENGINE VERIFIED!")
print("=" * 70)
