"""
Phase 4 & Phase 5 Audit Utility: Link Conversion & Sub-ID Inspection
Performs controlled POST /pub_api/v3/links/convert calls using channel 317867.
Does NOT expose full tracking URLs.
Does NOT perform any clicks or transactions.
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import settings


def mask_url(url: Optional[str] = None) -> str:
    if not url:
        return "None"
    # Show only the domain and masked query
    if "linksredirect.com" in url:
        parts = url.split("?", 1)
        base = parts[0]
        query = parts[1] if len(parts) > 1 else ""
        # extract param keys without values
        import urllib.parse
        parsed_q = urllib.parse.parse_qs(query)
        keys = list(parsed_q.keys())
        return f"{base}?[PARAMS: {', '.join(keys)}] (url masked)"
    return url[:30] + "...[MASKED]"


def run_conversions_and_subids():
    print("=" * 80)
    print("PHASE 4 & 5 AUDIT: LINK CONVERSION & SUB-ID TEST")
    print("Channel ID: 317867")
    print("=" * 80)

    if not settings.CUELINKS_API_KEY:
        print("[FAIL] Missing API key.")
        sys.exit(1)

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    convert_url = f"{base_url}/links/convert"
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }

    test_merchants = [
        {"name": "Flipkart", "url": "https://www.flipkart.com/", "campaign_id": 1},
        {"name": "Amazon India", "url": "https://www.amazon.in/", "campaign_id": 817},
        {"name": "Tata CLiQ", "url": "https://www.tatacliq.com/", "campaign_id": 2588},
        {"name": "Nykaa Beauty", "url": "https://www.nykaa.com/", "campaign_id": 891},
        {"name": "Nykaa Fashion", "url": "https://www.nykaafashion.com/", "campaign_id": 3907},
    ]

    results: Dict[str, Any] = {
        "conversions": {},
        "subid_tests": {}
    }

    with httpx.Client(timeout=20.0) as client:
        # ----------------------------------------------------
        # PHASE 4: Basic conversion test for each merchant
        # ----------------------------------------------------
        print("\n--- PHASE 4: CONVERSION TESTING ---")
        for m in test_merchants:
            payload = {
                "url": m["url"],
                "channel_id": 317867
            }
            try:
                resp = client.post(convert_url, json=payload, headers=headers)
                status_code = resp.status_code
                print(f"\nMerchant: {m['name']} ({m['url']})")
                print(f"  HTTP Status: {status_code}")
                
                resp_json = resp.json() if status_code in [200, 400, 422] else {}
                data = resp_json.get("data", resp_json)
                
                # Check structure
                affiliated = None
                camp_returned = None
                status_msg = None
                tracked_url_present = False
                params_detected = []

                if isinstance(data, dict):
                    affiliated = data.get("affiliated")
                    camp_returned = data.get("campaign_id")
                    status_msg = data.get("status") or data.get("message")
                    raw_aff_url = data.get("url") or data.get("affiliate_url")
                    if raw_aff_url:
                        tracked_url_present = True
                        if "?" in raw_aff_url:
                            import urllib.parse
                            q = urllib.parse.parse_qs(raw_aff_url.split("?", 1)[1])
                            params_detected = list(q.keys())

                elif isinstance(data, list) and data:
                    item = data[0]
                    affiliated = item.get("affiliated")
                    camp_returned = item.get("campaign_id")
                    status_msg = item.get("status") or item.get("message")
                    raw_aff_url = item.get("url") or item.get("affiliate_url")
                    if raw_aff_url:
                        tracked_url_present = True
                        if "?" in raw_aff_url:
                            import urllib.parse
                            q = urllib.parse.parse_qs(raw_aff_url.split("?", 1)[1])
                            params_detected = list(q.keys())

                print(f"  affiliated: {affiliated}")
                print(f"  campaign_id returned: {camp_returned}")
                print(f"  status/message: {status_msg}")
                print(f"  tracking url generated: {tracked_url_present}")
                print(f"  tracking url parameters: {params_detected}")

                results["conversions"][m["name"]] = {
                    "http_status": status_code,
                    "affiliated": affiliated,
                    "campaign_id_expected": m["campaign_id"],
                    "campaign_id_returned": camp_returned,
                    "status_message": status_msg,
                    "tracking_url_generated": tracked_url_present,
                    "params_detected": params_detected,
                }
            except Exception as e:
                print(f"  [ERROR] {e}")
                results["conversions"][m["name"]] = {"error": str(e)}

        # ----------------------------------------------------
        # PHASE 5: Sub-ID Investigation
        # ----------------------------------------------------
        print("\n" + "=" * 80)
        print("--- PHASE 5: SUB-ID INVESTIGATION ---")
        print("Testing Sub-IDs 1 through 5 on a working open campaign (e.g. Tata CLiQ / Nykaa)...")

        # Test with Tata CLiQ (open campaign)
        subid_payload = {
            "url": "https://www.tatacliq.com/",
            "channel_id": 317867,
            "subid": "prod_1001",
            "subid2": "list_2002",
            "subid3": "deal_hero",
            "subid4": "mobile_web",
            "subid5": "ab_test_v1",
        }

        try:
            resp_sub = client.post(convert_url, json=subid_payload, headers=headers)
            print(f"\nPayload Sent: {json.dumps({k: v for k, v in subid_payload.items() if k != 'url'})}")
            print(f"HTTP Status: {resp_sub.status_code}")
            
            sub_json = resp_sub.json()
            data_sub = sub_json.get("data", sub_json)
            if isinstance(data_sub, list) and data_sub:
                data_sub = data_sub[0]

            print(f"Response affiliated: {data_sub.get('affiliated')}")
            print(f"Response campaign_id: {data_sub.get('campaign_id')}")
            
            raw_url = data_sub.get("url") or data_sub.get("affiliate_url") or ""
            if raw_url:
                import urllib.parse
                parsed = urllib.parse.urlparse(raw_url)
                qs = urllib.parse.parse_qs(parsed.query)
                print("\nParameters preserved in generated redirect URL:")
                for p_name in ["subid", "subid2", "subid3", "subid4", "subid5"]:
                    val = qs.get(p_name)
                    print(f"  * {p_name}: received in redirect URL -> {val}")
                results["subid_tests"]["parameters_in_redirect"] = {k: qs.get(k) for k in ["subid", "subid2", "subid3", "subid4", "subid5"]}
            
            results["subid_tests"]["http_status"] = resp_sub.status_code
            results["subid_tests"]["data_keys"] = list(data_sub.keys()) if isinstance(data_sub, dict) else []

        except Exception as e:
            print(f"[ERROR] SubID test failed: {e}")
            results["subid_tests"]["error"] = str(e)

        # Let's also test whether batch conversion or alternative naming is supported
        # e.g., what happens if subid exceeds standard length or has special characters
        print("\nTesting length and special characters on subid:")
        long_sub_payload = {
            "url": "https://www.tatacliq.com/",
            "channel_id": 317867,
            "subid": "a" * 60,
            "subid2": "b" * 120,
        }
        try:
            resp_long = client.post(convert_url, json=long_sub_payload, headers=headers)
            print(f"Long SubID HTTP Status: {resp_long.status_code}")
            data_long = resp_long.json().get("data", resp_long.json())
            if isinstance(data_long, list) and data_long:
                data_long = data_long[0]
            raw_long_url = data_long.get("url") or data_long.get("affiliate_url") or ""
            if raw_long_url and "?" in raw_long_url:
                import urllib.parse
                qs = urllib.parse.parse_qs(raw_long_url.split("?", 1)[1])
                print(f"  Length of subid in redirect: {len(qs.get('subid', [''])[0])}")
                print(f"  Length of subid2 in redirect: {len(qs.get('subid2', [''])[0])}")
                results["subid_tests"]["long_subid_handled"] = {
                    "subid_len": len(qs.get('subid', [''])[0]),
                    "subid2_len": len(qs.get('subid2', [''])[0]),
                }
        except Exception as e:
            print(f"  [ERROR] Long subid test: {e}")

    # Save results to json
    out_file = Path(__file__).resolve().parent / "conversion_subid_results.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved results to {out_file}")


if __name__ == "__main__":
    run_conversions_and_subids()
