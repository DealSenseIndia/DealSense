"""
Audit Utility: Discover Potential Future Indian E-commerce Campaigns
Filters for open, high-EPC, India-relevant merchants across DealSense categories:
Electronics, Mobiles, Computers, Home, Furniture, Fashion, Beauty, Grocery, Appliances.
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import settings

search_queries = [
    # Electronics / Appliances / Tech
    "croma", "reliance digital", "vijay sales", "boat", "noise", "samsung", "lenovo", "acer", "oneplus",
    # Furniture / Home
    "pepperfry", "wakefit", "wooden street", "urban ladder", "sleepwell", "duroflex",
    # Fashion / Beauty / Lifestyle
    "shoppers stop", "purplle", "mamaearth", "marks and spencer", "lifestyle", "bewakoof",
    # Health / Grocery / Pharmacy
    "1mg", "netmeds", "pharmeasy", "bigbasket", "apollo pharmacy"
]

def discover():
    if not settings.CUELINKS_API_KEY:
        print("[FAIL] Missing CUELINKS_API_KEY.")
        sys.exit(1)

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }

    candidates = {}
    seen_ids = set()

    with httpx.Client(timeout=25.0) as client:
        print("Searching Cuelinks V3 for potential major Indian e-commerce merchants...")
        for q in search_queries:
            try:
                r = client.get(f"{base_url}/campaigns", params={"q": q}, headers=headers)
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    for c in data:
                        cid = c.get("id")
                        if cid not in seen_ids:
                            seen_ids.add(cid)
                            # Check if India relevant
                            countries = c.get("countries", [])
                            is_in = any(co.get("iso") == "IN" for co in countries) if countries else False
                            domain = (c.get("domain") or "").lower()
                            name = (c.get("name") or "").lower()
                            if is_in or ".in" in domain or "india" in name or any(t in domain for t in ["croma", "pepperfry", "1mg", "wakefit", "purplle", "boat", "noise", "netmeds"]):
                                # Filter for open or pending
                                access = c.get("access_status")
                                candidates[cid] = {
                                    "id": cid,
                                    "name": c.get("name"),
                                    "domain": c.get("domain"),
                                    "access_status": access,
                                    "payout": c.get("payout"),
                                    "payout_type": c.get("payout_type"),
                                    "payout_currency": c.get("payout_currency"),
                                    "campaign_type": c.get("campaign_type"),
                                    "categories": [cat.get("name") for cat in c.get("categories", [])],
                                    "epc_7d": c.get("epc_7d"),
                                    "epc_90d": c.get("epc_90d"),
                                    "is_featured": c.get("is_featured"),
                                }
            except Exception as e:
                print(f"Error searching '{q}': {e}")

        print(f"\nDiscovered {len(candidates)} candidate campaigns. Filtering for 'open' access status...")
        open_candidates = {cid: c for cid, c in candidates.items() if c["access_status"] == "open"}
        print(f"Total 'open' Indian candidates found: {len(open_candidates)}")

        # For the most relevant open candidates, safely test link conversion
        verified_open = []
        for cid, c in open_candidates.items():
            domain = c["domain"]
            if not domain:
                continue
            test_url = f"https://www.{domain}/" if not domain.startswith("http") else domain
            try:
                conv_r = client.post(f"{base_url}/links/convert", json={"url": test_url, "channel_id": 317867}, headers=headers)
                if conv_r.status_code == 200:
                    conv_data = conv_r.json().get("data", conv_r.json())
                    if isinstance(conv_data, list) and conv_data:
                        conv_data = conv_data[0]
                    c["affiliated_test"] = conv_data.get("affiliated")
                    c["returned_cid"] = conv_data.get("campaign_id")
                else:
                    c["affiliated_test"] = False
            except Exception:
                c["affiliated_test"] = None

            verified_open.append(c)
            print(f"  * ID {c['id']:5} | {c['name']:25} | Domain: {c['domain']:20} | Access: {c['access_status']} | Affiliated: {c.get('affiliated_test')} | EPC 7d: {c.get('epc_7d')} | EPC 90d: {c.get('epc_90d')}")

    out_path = Path(__file__).resolve().parent / "future_merchants_dump.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(verified_open, f, indent=2)
    print(f"\nSaved discovery results to {out_path}")


if __name__ == "__main__":
    discover()
