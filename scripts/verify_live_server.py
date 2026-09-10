import urllib.request
import json

# 1. Verify Homepage
req_home = urllib.request.urlopen("http://127.0.0.1:8000/")
html_home = req_home.read().decode("utf-8")
assert "analyze.html" in html_home
assert "Apple Watch S9" in html_home
assert "iPhone 15" in html_home
assert "OnePlus Nord 4" in html_home
print("[PASS] Homepage has Analyze Deal nav link and flagship chips!")

# 2. Verify analyze.html
req_analyze = urllib.request.urlopen("http://127.0.0.1:8000/analyze.html")
html_analyze = req_analyze.read().decode("utf-8")
assert "Verify Product Price & Deal Quality" in html_analyze
print("[PASS] analyze.html serves successfully!")

# 3. Verify API Analyze on Flagships
headers = {"Content-Type": "application/json"}
for name, url in [
    ("Apple Watch S9", "https://www.amazon.in/dp/B0CHX6PXX6"),
    ("iPhone 15", "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4?pid=MOBGTAGPTB3VS24W"),
    ("OnePlus Nord 4", "https://www.amazon.in/dp/B0D7D7R8QK"),
]:
    data = json.dumps({"url": url, "force_refresh": False}).encode("utf-8")
    req = urllib.request.Request("http://127.0.0.1:8000/api/analyze", data=data, headers=headers)
    res = urllib.request.urlopen(req)
    out = json.loads(res.read().decode("utf-8"))
    assert out["status"] == "SUCCESS"
    st = out["status"]
    pr = out["pricing"]["current_price"]
    cs = len(out["cross_store"])
    bo = len(out["bank_offers"])
    cat = out["product"]["category"]
    print(f"[PASS] {name}: Status={st}, Cat={cat}, Price=Rs.{pr:,.0f}, CrossStore={cs} stores, BankOffers={bo} cards")

print("\n>>> ALL LIVE HTTP SERVER CONTRACTS VERIFIED 100%! <<<")
