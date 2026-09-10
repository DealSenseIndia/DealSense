"""
Audit Utility: Cuelinks V3 Affiliate Compatibility Matrix
Performs safe, read-only inspection and link conversion testing.
No API keys or tokens are logged or printed.
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


def run_audit():
    print("=" * 80)
    print("DEALSENSE AFFILIATE INFRASTRUCTURE AUDIT — CUELINKS V3")
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

    audit_data: Dict[str, Any] = {
        "phase2_auth": {},
        "channel_317867": {},
        "merchants_audit": {},
        "link_conversions": {},
        "subid_investigation": {},
    }

    with httpx.Client(timeout=30.0) as client:
        # ====================================================
        # PHASE 2: AUTHENTICATION
        # ====================================================
        print("\n[PHASE 2] Calling GET /ping...")
        ping_resp = client.get(f"{base_url}/ping", headers=headers)
        if ping_resp.status_code == 200:
            ping_json = ping_resp.json()
            safe_ping = {
                "status": ping_json.get("status"),
                "version": ping_json.get("version"),
                "publisher_id": ping_json.get("publisher", {}).get("id") or ping_json.get("publisher", {}).get("publisher_id"),
                "publisher_name": ping_json.get("publisher", {}).get("name"),
                "currency": ping_json.get("publisher", {}).get("currency"),
            }
            audit_data["phase2_auth"] = safe_ping
            print(f"  [OK] Auth Verified: Publisher ID {safe_ping['publisher_id']} | API Version: {safe_ping['version']}")
        else:
            print(f"  [FAIL] /ping returned HTTP {ping_resp.status_code}")
            audit_data["phase2_auth"] = {"error": ping_resp.status_code, "text": ping_resp.text}

        # Check Channel 317867
        print("\n[PHASE 2.1] Inspecting Channels (GET /channels)...")
        ch_resp = client.get(f"{base_url}/channels", headers=headers)
        if ch_resp.status_code == 200:
            ch_json = ch_resp.json()
            ch_list = ch_json.get("data", ch_json if isinstance(ch_json, list) else [])
            target_ch = None
            for ch in ch_list:
                if str(ch.get("id")) == "317867":
                    target_ch = ch
                    break
            if target_ch:
                audit_data["channel_317867"] = target_ch
                print(f"  [OK] Channel 317867 confirmed: Name='{target_ch.get('name')}', Status='{target_ch.get('status')}', URL='{target_ch.get('url') or target_ch.get('source_url')}'")
            else:
                print(f"  [WARN] Channel 317867 not found in channels list of {len(ch_list)} channels.")
                audit_data["channel_317867"] = {"found": False, "channels_available": len(ch_list)}
        else:
            print(f"  [FAIL] /channels returned HTTP {ch_resp.status_code}")
            audit_data["channel_317867"] = {"error": ch_resp.status_code}

        # ====================================================
        # PHASE 3: AUDIT MERCHANTS
        # Target merchants:
        # 1. Flipkart
        # 2. Amazon India
        # 3. Tata CLiQ
        # 4. Nykaa Beauty
        # 5. Nykaa Fashion
        # ====================================================
        print("\n[PHASE 3] Auditing Campaigns...")
        search_targets = [
            ("Flipkart", ["flipkart"]),
            ("Amazon India", ["amazon"]),
            ("Tata CLiQ", ["tata cliq", "tatacliq"]),
            ("Nykaa", ["nykaa"]),
        ]

        raw_campaign_matches: Dict[str, List[Dict[str, Any]]] = {}
        for label, queries in search_targets:
            all_found = []
            seen_ids = set()
            for q in queries:
                try:
                    c_resp = client.get(f"{base_url}/campaigns", params={"q": q}, headers=headers)
                    if c_resp.status_code == 200:
                        c_data = c_resp.json().get("data", [])
                        for c in c_data:
                            cid = c.get("id")
                            if cid not in seen_ids:
                                seen_ids.add(cid)
                                all_found.append(c)
                except Exception as e:
                    print(f"  [ERROR] querying campaigns for '{q}': {e}")
            raw_campaign_matches[label] = all_found
            print(f"  Found {len(all_found)} campaigns matching query for {label}")

        detailed_campaigns: Dict[str, Any] = {}

        for label, c_list in raw_campaign_matches.items():
            for c in c_list:
                cid = c.get("id")
                cname = c.get("name")
                cdomain = c.get("domain")
                print(f"    Candidate: ID {cid} | Name: {cname} | Domain: {cdomain} | Access: {c.get('access_status')}")
                try:
                    detail_resp = client.get(f"{base_url}/campaigns/{cid}", headers=headers)
                    if detail_resp.status_code == 200:
                        detail_json = detail_resp.json().get("data", detail_resp.json())
                        detailed_campaigns[str(cid)] = detail_json
                except Exception as e:
                    print(f"      [ERROR] fetching details for campaign {cid}: {e}")

        audit_data["all_campaign_details"] = detailed_campaigns
        audit_data["raw_campaign_matches"] = raw_campaign_matches

        scratch_path = Path(__file__).resolve().parent / "audit_campaigns_dump.json"
        with open(scratch_path, "w", encoding="utf-8") as f:
            json.dump(audit_data, f, indent=2, default=str)
        print(f"\nSaved raw campaign details dump to {scratch_path}")


if __name__ == "__main__":
    run_audit()
