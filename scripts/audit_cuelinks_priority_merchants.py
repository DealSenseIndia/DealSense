"""
Audit Utility: Cuelinks V3 Priority Merchant Compatibility Audit
Target Merchants: Amazon India, Flipkart, Myntra, Tata CLiQ, AJIO, Nykaa, Nykaa Fashion.
Channel ID: 317867
Strict Security: No API keys, tokens, or raw tracking URLs logged or printed.
"""

import sys
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx

# Load settings from backend.config securely
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import settings


def clean_html(text: Optional[str]) -> str:
    if not text:
        return ""
    clean = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    clean = clean.replace("<li>", "\n  * ").replace("</li>", "")
    clean = re.sub(r"<[^>]+>", "", clean)
    lines = [line.strip() for line in clean.split("\n") if line.strip()]
    return "\n".join(lines)


def run_priority_audit():
    print("=" * 80)
    print("CUELINKS V3 DEALSENSE PRIORITY MERCHANT AUDIT")
    print("=" * 80)

    if not settings.CUELINKS_API_KEY:
        print("[FAIL] CUELINKS_API_KEY is missing or empty in .env.")
        sys.exit(1)

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }

    audit_results: Dict[str, Any] = {
        "phase2_auth": {},
        "channel_317867": {},
        "candidates_by_merchant": {},
        "selected_campaigns": {},
        "detailed_campaigns": {},
        "link_conversions": {},
        "subid_findings": {},
    }

    with httpx.Client(timeout=30.0) as client:
        # ----------------------------------------------------
        # PHASE 2: VERIFY AUTHENTICATION
        # ----------------------------------------------------
        print("\n[PHASE 2] Verifying Authentication via GET /ping...")
        ping_resp = client.get(f"{base_url}/ping", headers=headers)
        if ping_resp.status_code == 200:
            pj = ping_resp.json()
            safe_auth = {
                "http_status": ping_resp.status_code,
                "status": pj.get("status"),
                "version": pj.get("version"),
                "publisher_id": pj.get("publisher", {}).get("id") or pj.get("publisher", {}).get("publisher_id"),
                "currency": pj.get("publisher", {}).get("currency"),
            }
            audit_results["phase2_auth"] = safe_auth
            print(f"  Auth: PASS | HTTP {safe_auth['http_status']} | Version: {safe_auth['version']} | Publisher ID: {safe_auth['publisher_id']}")
        else:
            print(f"  Auth: FAIL | HTTP {ping_resp.status_code}")
            audit_results["phase2_auth"] = {"http_status": ping_resp.status_code, "error": ping_resp.text}
            sys.exit(1)

        # Inspect Channel 317867
        print("\n[PHASE 2.1] Inspecting Channel 317867 via GET /channels...")
        ch_resp = client.get(f"{base_url}/channels", headers=headers)
        if ch_resp.status_code == 200:
            ch_list = ch_resp.json().get("data", [])
            target_ch = next((c for c in ch_list if str(c.get("id")) == "317867"), None)
            if target_ch:
                audit_results["channel_317867"] = {
                    "id": target_ch.get("id"),
                    "name": target_ch.get("name"),
                    "status": target_ch.get("status"),
                    "url": target_ch.get("url") or target_ch.get("source_url"),
                    "category": target_ch.get("category"),
                }
                print(f"  Channel 317867: Status = {target_ch.get('status')} | Name = {target_ch.get('name')} | URL = {target_ch.get('url') or target_ch.get('source_url')}")
            else:
                print("  [WARN] Channel 317867 not found in channels list.")
        else:
            print(f"  [FAIL] /channels returned HTTP {ch_resp.status_code}")

        # ----------------------------------------------------
        # PHASE 3: SEARCH ALL 7 PRIORITY MERCHANTS
        # 1. Amazon India
        # 2. Flipkart
        # 3. Myntra
        # 4. Tata CLiQ
        # 5. AJIO
        # 6. Nykaa
        # 7. Nykaa Fashion
        # ----------------------------------------------------
        print("\n[PHASE 3] Searching Campaigns for the 7 Priority Merchants...")
        search_specs = [
            ("Amazon India", ["amazon"]),
            ("Flipkart", ["flipkart"]),
            ("Myntra", ["myntra"]),
            ("Tata CLiQ", ["tata cliq", "tatacliq"]),
            ("AJIO", ["ajio"]),
            ("Nykaa", ["nykaa"]),
        ]

        for m_name, queries in search_specs:
            print(f"\n--- Searching: {m_name} ---")
            found_campaigns = []
            seen_cids = set()
            for q in queries:
                try:
                    s_resp = client.get(f"{base_url}/campaigns", params={"q": q}, headers=headers)
                    if s_resp.status_code == 200:
                        c_data = s_resp.json().get("data", [])
                        for c in c_data:
                            cid = c.get("id")
                            if cid not in seen_cids:
                                seen_cids.add(cid)
                                found_campaigns.append(c)
                except Exception as e:
                    print(f"  Error searching '{q}': {e}")

            audit_results["candidates_by_merchant"][m_name] = [
                {
                    "id": c.get("id"),
                    "name": c.get("name"),
                    "domain": c.get("domain"),
                    "status": c.get("status"),
                    "access_status": c.get("access_status"),
                    "payout": c.get("payout"),
                    "payout_currency": c.get("payout_currency"),
                    "payout_type": c.get("payout_type"),
                    "deeplink_allowed": c.get("deeplink_allowed"),
                }
                for c in found_campaigns
            ]

            print(f"Total matching campaigns found: {len(found_campaigns)}")
            for c in found_campaigns:
                print(f"  * ID {c.get('id')}: '{c.get('name')}' | Domain: {c.get('domain')} | Access: {c.get('access_status')} | Status: {c.get('status')} | Payout: {c.get('payout')} {c.get('payout_currency')} ({c.get('payout_type')})")

        # ----------------------------------------------------
        # PHASE 4: GET FULL CAMPAIGN DETAILS
        # Identify primary campaign IDs for each of the 7:
        # Amazon India: 817 (amazon.in)
        # Flipkart: 1 (flipkart.com)
        # Myntra: search to determine primary
        # Tata CLiQ: 2588 (tatacliq.com)
        # AJIO: search to determine primary
        # Nykaa Beauty: 891 (nykaa.com)
        # Nykaa Fashion: 3907 (nykaafashion.com)
        # ----------------------------------------------------
        # Let's inspect Myntra and AJIO candidates specifically
        print("\n[PHASE 4] Selecting Primary Campaigns and Fetching Detailed Metadata...")

        # We will dynamically map the best primary campaign for each of the 7
        primary_targets = {}

        # 1. Amazon India -> ID 817
        primary_targets["Amazon India"] = 817
        # 2. Flipkart -> ID 1
        primary_targets["Flipkart"] = 1
        # 3. Tata CLiQ -> ID 2588
        primary_targets["Tata CLiQ"] = 2588
        # 4. Nykaa (Beauty) -> ID 891
        primary_targets["Nykaa"] = 891
        # 5. Nykaa Fashion -> ID 3907
        primary_targets["Nykaa Fashion"] = 3907

        # For Myntra:
        myntra_cands = audit_results["candidates_by_merchant"].get("Myntra", [])
        for mc in myntra_cands:
            d = (mc.get("domain") or "").lower()
            n = (mc.get("name") or "").lower()
            if "myntra.com" in d or "myntra" in n:
                # prefer main CPS campaign
                if "cpi" not in n and "seller" not in n:
                    primary_targets["Myntra"] = mc.get("id")
                    break
        if "Myntra" not in primary_targets and myntra_cands:
            primary_targets["Myntra"] = myntra_cands[0].get("id")

        # For AJIO:
        ajio_cands = audit_results["candidates_by_merchant"].get("AJIO", [])
        for ac in ajio_cands:
            d = (ac.get("domain") or "").lower()
            n = (ac.get("name") or "").lower()
            if "ajio.com" in d or "ajio" in n:
                if "cpi" not in n and "seller" not in n:
                    primary_targets["AJIO"] = ac.get("id")
                    break
        if "AJIO" not in primary_targets and ajio_cands:
            primary_targets["AJIO"] = ajio_cands[0].get("id")

        print(f"\nTarget Primary Campaign IDs: {primary_targets}")
        audit_results["selected_campaigns"] = primary_targets

        for m_name, cid in primary_targets.items():
            print(f"\nFetching detailed metadata for {m_name} (Campaign ID: {cid})...")
            try:
                d_resp = client.get(f"{base_url}/campaigns/{cid}", headers=headers)
                if d_resp.status_code == 200:
                    cd = d_resp.json().get("data", d_resp.json())
                    audit_results["detailed_campaigns"][m_name] = {
                        "id": cd.get("id"),
                        "name": cd.get("name"),
                        "domain": cd.get("domain"),
                        "status": cd.get("status"),
                        "access_status": cd.get("access_status"),
                        "payout_type": cd.get("payout_type"),
                        "payout": cd.get("payout"),
                        "payout_currency": cd.get("payout_currency"),
                        "cookie_duration": cd.get("cookie_duration"),
                        "tracking_time": cd.get("tracking_time"),
                        "validation_time": cd.get("validation_time"),
                        "payment_time": cd.get("payment_time"),
                        "deeplink_allowed": cd.get("deeplink_allowed"),
                        "conversion_flow": cd.get("conversion_flow"),
                        "platforms": cd.get("platforms"),
                        "media": cd.get("media"),
                        "payout_categories": cd.get("payout_categories"),
                        "important_info_html": cd.get("important_info_html"),
                        "important_info_plain": clean_html(cd.get("important_info_html")),
                        "missing_trans_allowed": cd.get("missing_trans_allowed"),
                        "missing_trans_claim_window": cd.get("missing_trans_claim_window"),
                    }
                    print(f"  [OK] Fetched {cd.get('name')} | Access: {cd.get('access_status')} | Payout: {cd.get('payout')} {cd.get('payout_currency')} | Deeplink: {cd.get('deeplink_allowed')}")
                else:
                    print(f"  [FAIL] GET /campaigns/{cid} returned HTTP {d_resp.status_code}")
                    audit_results["detailed_campaigns"][m_name] = {"error": d_resp.status_code}
            except Exception as e:
                print(f"  [ERROR] {e}")
                audit_results["detailed_campaigns"][m_name] = {"error": str(e)}

        # ----------------------------------------------------
        # PHASE 5: TEST LINK CONVERSION & AFFILIATION
        # Test all 7 merchants using POST /pub_api/v3/links/convert
        # Channel: 317867
        # Strict security: DO NOT expose tracking URLs!
        # ----------------------------------------------------
        print("\n[PHASE 5] Testing Link Conversion (POST /pub_api/v3/links/convert) for all 7 Merchants...")
        test_urls = {
            "Amazon India": "https://www.amazon.in/",
            "Flipkart": "https://www.flipkart.com/",
            "Myntra": "https://www.myntra.com/",
            "Tata CLiQ": "https://www.tatacliq.com/",
            "AJIO": "https://www.ajio.com/",
            "Nykaa": "https://www.nykaa.com/",
            "Nykaa Fashion": "https://www.nykaafashion.com/",
        }

        for m_name, url in test_urls.items():
            payload = {
                "url": url,
                "channel_id": 317867,
            }
            try:
                c_resp = client.post(f"{base_url}/links/convert", json=payload, headers=headers)
                c_code = c_resp.status_code
                resp_json = c_resp.json() if c_code in [200, 400, 422] else {}
                c_data = resp_json.get("data", resp_json)
                if isinstance(c_data, list) and c_data:
                    c_data = c_data[0]

                affiliated = c_data.get("affiliated") if isinstance(c_data, dict) else None
                camp_returned = c_data.get("campaign_id") if isinstance(c_data, dict) else None
                status_msg = c_data.get("status") or c_data.get("message") if isinstance(c_data, dict) else None
                has_url = bool(c_data.get("url") or c_data.get("affiliate_url")) if isinstance(c_data, dict) else False

                audit_results["link_conversions"][m_name] = {
                    "http_status": c_code,
                    "affiliated": affiliated,
                    "campaign_id_returned": camp_returned,
                    "status_message": status_msg,
                    "tracking_url_generated": has_url,
                }
                print(f"  * {m_name:15}: HTTP {c_code} | affiliated={affiliated} | campaign_returned={camp_returned} | url_generated={has_url} | msg={status_msg}")
            except Exception as e:
                print(f"  * {m_name:15}: [ERROR] {e}")
                audit_results["link_conversions"][m_name] = {"error": str(e)}

        # ----------------------------------------------------
        # PHASE 10: SUB-ID COMPATIBILITY CONFIRMATION
        # ----------------------------------------------------
        print("\n[PHASE 10] Testing Sub-ID Telemetry Parameters...")
        # Use an open campaign (Tata CLiQ)
        subid_payload = {
            "url": "https://www.tatacliq.com/",
            "channel_id": 317867,
            "subid": "prod_101",
            "subid2": "list_202",
            "subid3": "hero_btn",
            "subid4": "mobile_web",
            "subid5": "v1_test",
        }
        try:
            s_resp = client.post(f"{base_url}/links/convert", json=subid_payload, headers=headers)
            s_json = s_resp.json()
            s_data = s_json.get("data", s_json)
            if isinstance(s_data, list) and s_data:
                s_data = s_data[0]
            raw_tracking_url = s_data.get("url") or s_data.get("affiliate_url") or ""
            
            import urllib.parse
            parsed_query = urllib.parse.parse_qs(urllib.parse.urlparse(raw_tracking_url).query) if raw_tracking_url else {}
            
            audit_results["subid_findings"] = {
                "http_status": s_resp.status_code,
                "supported_params": ["subid", "subid2", "subid3", "subid4", "subid5"],
                "received_in_query": {k: parsed_query.get(k) for k in ["subid", "subid2", "subid3", "subid4", "subid5"] if k in parsed_query},
            }
            print(f"  Sub-ID Test: HTTP {s_resp.status_code} | Preserved in Redirect URL: {list(audit_results['subid_findings']['received_in_query'].keys())}")
        except Exception as e:
            print(f"  Sub-ID Test [ERROR]: {e}")

    # Save complete sanitized dump
    dump_file = Path(__file__).resolve().parent / "audit_priority_dump.json"
    with open(dump_file, "w", encoding="utf-8") as f:
        json.dump(audit_results, f, indent=2)
    print(f"\n[DONE] Sanitized audit results written to {dump_file}")


if __name__ == "__main__":
    run_priority_audit()
