"""
Audit Utility: Build DealSense Merchant Economics Map
Deep scan across Cuelinks V3 for merchants in:
Electronics, PC, Mobile, Gaming, Audio, Appliances, Furniture, Home, WFH Setups, Fashion, Beauty, Coffee/Kitchen.
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import settings

search_queries = [
    # Electronics, PC, Mobiles, Components, Gaming
    "lenovo", "acer", "dell", "hp", "asus", "msi", "samsung", "apple", "vijay sales", "croma", "reliance digital",
    "boat", "noise", "boult", "fire-boltt", "zebronics", "portronics", "oneplus", "realme", "xiaomi", "mi",
    "logitech", "corsair", "razer", "tp-link", "gadgets", "electronics",
    # Appliances, TVs, Kitchen, Coffee
    "philips", "havells", "bajaj", "panasonic", "whirlpool", "godrej", "voltas", "prestige", "wonderchef", "agaro",
    "borosil", "blue tokai", "sleepy owl", "rage coffee", "coffee", "appliances",
    # Furniture, Home, Bedding, WFH / Desk Setup
    "pepperfry", "wakefit", "woodenstreet", "sleepwell", "duroflex", "urban ladder", "sleepycat", "ikea", "home centre",
    "nilkamal", "green soul", "featherlite", "furniture", "mattress",
    # Fashion, Beauty, Lifestyle
    "tata cliq", "nykaa", "myntra", "ajio", "marks and spencer", "bewakoof", "snitch", "souled store", "zivame",
    "clovia", "purplle", "mamaearth", "mcaffeine", "plum", "derma", "minimalist", "dot and key",
    # Grocery, Pharmacy
    "bigbasket", "1mg", "apollo pharmacy", "netmeds", "pharmeasy"
]


def run_economics_scan():
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

    discovered = {}
    seen_ids = set()

    with httpx.Client(timeout=25.0) as client:
        print("1. Scanning Cuelinks V3 for target categories and brands...")
        for q in search_queries:
            try:
                r = client.get(f"{base_url}/campaigns", params={"q": q}, headers=headers)
                if r.status_code == 200:
                    data = r.json().get("data", [])
                    for c in data:
                        cid = c.get("id")
                        if cid not in seen_ids:
                            seen_ids.add(cid)
                            countries = c.get("countries", [])
                            is_in = any(co.get("iso") == "IN" for co in countries) if countries else False
                            domain = (c.get("domain") or "").lower()
                            name = (c.get("name") or "").lower()

                            # Focus on India-relevant e-commerce
                            if is_in or ".in" in domain or any(k in domain or k in name for k in [
                                "tatacliq", "nykaa", "lenovo", "acer", "vijaysales", "boat", "noise", "pepperfry",
                                "sleepwell", "bewakoof", "marksandspencer", "agaro", "wonderchef", "greensoul",
                                "snitch", "mcaffeine", "plum", "bluetokai", "wakefit"
                            ]):
                                discovered[cid] = {
                                    "id": cid,
                                    "name": c.get("name"),
                                    "domain": c.get("domain"),
                                    "status": c.get("status"),
                                    "access_status": c.get("access_status"),
                                    "campaign_type": c.get("campaign_type"),
                                    "payout": c.get("payout"),
                                    "payout_type": c.get("payout_type"),
                                    "payout_currency": c.get("payout_currency"),
                                    "categories": [cat.get("name") for cat in c.get("categories", [])],
                                    "epc_7d": float(c.get("epc_7d") or 0.0),
                                    "epc_90d": float(c.get("epc_90d") or 0.0),
                                    "is_featured": c.get("is_featured"),
                                    "deeplink_allowed": c.get("deeplink_allowed"),
                                    "cookie_duration": c.get("cookie_duration"),
                                }
            except Exception as e:
                print(f"Error querying '{q}': {e}")

        print(f"Discovered {len(discovered)} relevant Indian campaigns.")

        # 2. Select top candidates across all categories and test link conversion
        print("\n2. Testing monetization for top open candidates...")
        # Prioritize open campaigns with real e-commerce domains
        for cid, c in discovered.items():
            if c["access_status"] == "open" and c["domain"]:
                domain = c["domain"]
                test_url = f"https://www.{domain}/" if not domain.startswith("http") else domain
                try:
                    conv_r = client.post(f"{base_url}/links/convert", json={"url": test_url, "channel_id": 317867}, headers=headers)
                    if conv_r.status_code == 200:
                        c_data = conv_r.json().get("data", conv_r.json())
                        if isinstance(c_data, list) and c_data:
                            c_data = c_data[0]
                        c["affiliated"] = c_data.get("affiliated")
                    else:
                        c["affiliated"] = False
                except Exception:
                    c["affiliated"] = False
            elif c["access_status"] == "pending":
                c["affiliated"] = False
            else:
                c["affiliated"] = False

        # 3. Fetch detailed metadata for key shortlisted campaigns
        print("\n3. Fetching detailed campaign terms for shortlisted merchants...")
        shortlist_cids = [
            2588,  # Tata Cliq
            891,   # Nykaa Beauty
            3907,  # Nykaa Fashion
            823,   # Lenovo India
            4360,  # Acer India
            4232,  # boAt Lifestyle
            4164,  # Vijay Sales
            107,   # Pepperfry
            5586,  # Sleepwell
            4094,  # Marks and Spencer India
            1918,  # Bewakoof
            1,     # Flipkart (pending)
            817,   # Amazon India (pending)
            101,   # Myntra (pending)
            2589,  # AJIO (pending)
        ]

        # Add any other open Indian campaigns found with EPC > 0.1
        for cid, c in discovered.items():
            if c["access_status"] == "open" and c["epc_90d"] >= 0.1 and cid not in shortlist_cids:
                shortlist_cids.append(cid)

        detailed_data = {}
        for cid in shortlist_cids:
            try:
                d_resp = client.get(f"{base_url}/campaigns/{cid}", headers=headers)
                if d_resp.status_code == 200:
                    detail = d_resp.json().get("data", d_resp.json())
                    # Merge
                    if cid in discovered:
                        discovered[cid].update({
                            "tracking_time": detail.get("tracking_time"),
                            "validation_time": detail.get("validation_time"),
                            "payment_time": detail.get("payment_time"),
                            "platforms": detail.get("platforms"),
                            "media": detail.get("media"),
                            "payout_categories": detail.get("payout_categories"),
                            "important_info_html": detail.get("important_info_html"),
                        })
                    else:
                        discovered[cid] = detail
            except Exception as e:
                print(f"Error fetching details for {cid}: {e}")

    out_file = Path(__file__).resolve().parent / "merchant_economics_dump.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(discovered, f, indent=2)
    print(f"\nSaved Merchant Economics dump to {out_file}")


if __name__ == "__main__":
    run_economics_scan()
