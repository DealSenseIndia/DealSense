import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import httpx
from backend.config import settings

headers = {
    "Authorization": f"Token {settings.CUELINKS_API_KEY}",
    "Accept": "application/json",
}

target_cids = [817, 1, 101, 2588, 2589, 891, 3907]
merchants = {
    817: "Amazon India",
    1: "Flipkart",
    101: "Myntra",
    2588: "Tata CLiQ",
    2589: "AJIO",
    891: "Nykaa",
    3907: "Nykaa Fashion",
}

print("Fetching raw campaign details to check EPC, category, country, campaign_type, is_featured...")
results = {}

with httpx.Client(timeout=20.0) as client:
    for cid in target_cids:
        r = client.get(f"https://developers.cuelinks.com/pub_api/v3/campaigns/{cid}", headers=headers)
        if r.status_code == 200:
            data = r.json().get("data", r.json())
            results[cid] = {
                "name": data.get("name"),
                "status": data.get("status"),
                "access_status": data.get("access_status"),
                "campaign_type": data.get("campaign_type") or data.get("type"),
                "country": data.get("country") or data.get("countries"),
                "category": data.get("category") or data.get("categories"),
                "is_featured": data.get("is_featured") or data.get("featured"),
                "epc_7d": data.get("epc_7d") or data.get("epc_7_days") or data.get("epc7d") or data.get("epc_7"),
                "epc_90d": data.get("epc_90d") or data.get("epc_90_days") or data.get("epc90d") or data.get("epc_90"),
                "all_keys": list(data.keys()),
            }
            # Also check if any key has epc
            epc_keys = [k for k in data.keys() if "epc" in k.lower()]
            results[cid]["epc_keys_found"] = {k: data[k] for k in epc_keys}
            print(f"[{cid}] {merchants[cid]}: EPC keys found = {epc_keys}")
            for k in epc_keys:
                print(f"     {k}: {data[k]}")

# Also check search list response item keys for EPC
print("\nChecking search list response for any EPC fields:")
with httpx.Client(timeout=20.0) as client:
    r_list = client.get("https://developers.cuelinks.com/pub_api/v3/campaigns", params={"q": "flipkart"}, headers=headers)
    if r_list.status_code == 200:
        c_list = r_list.json().get("data", [])
        if c_list:
            first_c = c_list[0]
            print("List response item keys:", list(first_c.keys()))
            epc_in_list = [k for k in first_c.keys() if "epc" in k.lower()]
            print("EPC in list item:", epc_in_list)

with open("scripts/epc_dump.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
print("\nSaved to scripts/epc_dump.json")
