import sys
import json
import httpx
from pathlib import Path

# Load settings from backend.config securely
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.config import settings

def run_inspection():
    print("=" * 70)
    print("CUELINKS V3 INTEGRATION SECURE AUDIT & INSPECTION")
    print("=" * 70)

    # Validate API Key presence without printing it
    if not settings.CUELINKS_API_KEY:
        print("[FAIL] CUELINKS_API_KEY is missing or empty in .env.")
        sys.exit(1)
    
    masked_key = settings.CUELINKS_API_KEY[:4] + "..." + settings.CUELINKS_API_KEY[-4:] if len(settings.CUELINKS_API_KEY) >= 8 else "***"
    print(f"[OK] CUELINKS_API_KEY is present in environment (masked: {masked_key})")

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }

    results = {}

    with httpx.Client(timeout=20.0) as client:
        # ----------------------------------------------------
        # STEP 1: GET /ping
        # ----------------------------------------------------
        print("\n--- STEP 1: GET /ping ---")
        ping_url = f"{base_url}/ping"
        try:
            resp_ping = client.get(ping_url, headers=headers)
            print(f"Endpoint: {ping_url}")
            print(f"HTTP Status: {resp_ping.status_code}")
            if resp_ping.status_code == 200:
                ping_data = resp_ping.json()
                safe_ping = {k: v for k, v in ping_data.items() if "token" not in k.lower() and "key" not in k.lower()}
                print("Ping Response (Sanitized):", safe_ping)
                results["ping_status"] = "OK (200)"
                results["ping_data"] = safe_ping
            else:
                print(f"[FAIL] /ping returned HTTP {resp_ping.status_code}: {resp_ping.text[:200]}")
                results["ping_status"] = f"FAIL ({resp_ping.status_code})"
        except Exception as e:
            print(f"[ERROR] /ping connection failed: {e}")
            results["ping_status"] = f"ERROR ({e})"

        # ----------------------------------------------------
        # STEP 2 & 3: GET /channels & Confirm channel 317867
        # ----------------------------------------------------
        print("\n--- STEP 2 & 3: GET /channels & Confirm channel 317867 ---")
        channels_url = f"{base_url}/channels"
        channel_317867_found = False
        target_channel_details = None
        try:
            resp_channels = client.get(channels_url, headers=headers)
            print(f"Endpoint: {channels_url}")
            print(f"HTTP Status: {resp_channels.status_code}")
            if resp_channels.status_code == 200:
                ch_data = resp_channels.json()
                channels_list = ch_data.get("data", ch_data if isinstance(ch_data, list) else [])
                print(f"Total Channels Returned: {len(channels_list)}")
                for ch in channels_list:
                    cid = str(ch.get("id"))
                    name = ch.get("name")
                    url = ch.get("url") or ch.get("source_url")
                    cat = ch.get("category")
                    st = ch.get("status")
                    print(f"  * Channel ID: {cid} | Name: {name} | Status: {st} | Category: {cat} | URL: {url}")
                    if cid == "317867":
                        channel_317867_found = True
                        target_channel_details = ch
                
                results["channel_317867_found"] = channel_317867_found
                results["channel_317867_details"] = target_channel_details
                if channel_317867_found:
                    print(f"\n[CONFIRMED] Channel 317867 exists on this account with status: {target_channel_details.get('status')}")
                else:
                    print(f"\n[NOTE] Channel 317867 was NOT found in this account's channel list.")
            else:
                print(f"[FAIL] /channels returned HTTP {resp_channels.status_code}: {resp_channels.text[:200]}")
                results["channels_error"] = resp_channels.status_code
        except Exception as e:
            print(f"[ERROR] /channels failed: {e}")
            results["channels_error"] = str(e)

        # ----------------------------------------------------
        # STEP 4, 5, 6, 7: GET /campaigns?q=flipkart & Inspect access_status
        # ----------------------------------------------------
        print("\n--- STEP 4, 5, 6, 7: GET /campaigns?q=flipkart & Inspect access_status ---")
        campaigns_url = f"{base_url}/campaigns"
        flipkart_campaigns = []
        try:
            resp_camp = client.get(campaigns_url, params={"q": "flipkart"}, headers=headers)
            print(f"Endpoint: {campaigns_url}?q=flipkart")
            print(f"HTTP Status: {resp_camp.status_code}")
            if resp_camp.status_code == 200:
                c_data = resp_camp.json()
                c_list = c_data.get("data", [])
                print(f"Matching Campaigns Found: {len(c_list)}")
                for c in c_list:
                    cid = c.get("id")
                    cname = c.get("name")
                    cdomain = c.get("domain")
                    access_st = c.get("access_status")
                    payout = c.get("payout")
                    payout_type = c.get("payout_type")
                    print(f"  * ID: {cid} | Name: {cname} | Domain: {cdomain} | access_status: {access_st} | Payout: {payout} ({payout_type})")
                    flipkart_campaigns.append({
                        "id": cid,
                        "name": cname,
                        "domain": cdomain,
                        "access_status": access_st,
                        "payout": payout,
                        "payout_type": payout_type,
                    })
                results["flipkart_campaigns"] = flipkart_campaigns
            else:
                print(f"[FAIL] /campaigns returned HTTP {resp_camp.status_code}: {resp_camp.text[:200]}")
                results["campaigns_error"] = resp_camp.status_code
        except Exception as e:
            print(f"[ERROR] /campaigns failed: {e}")
            results["campaigns_error"] = str(e)

        # Check primary Flipkart campaign access
        primary_flipkart = None
        for fc in flipkart_campaigns:
            if fc.get("domain") == "flipkart.com" or "flipkart" in fc.get("name", "").lower():
                primary_flipkart = fc
                break
        
        has_access = False
        if primary_flipkart:
            results["primary_flipkart"] = primary_flipkart
            access_status = primary_flipkart.get("access_status")
            print(f"\nPrimary Flipkart Campaign: ID {primary_flipkart.get('id')} ({primary_flipkart.get('name')})")
            print(f"Access Status: {access_status}")
            if access_status in ["approved", "active", "granted"]:
                has_access = True
            else:
                print(f"[STOP CRITERIA CHECK] Access status is '{access_status}' (NOT active/approved).")
        else:
            print("\n[WARNING] No primary Flipkart campaign found.")

        # ----------------------------------------------------
        # TEST: POST /pub_api/v3/links/convert
        # ----------------------------------------------------
        print("\n--- TEST: POST /pub_api/v3/links/convert with channel_id 317867 ---")
        convert_url = f"{base_url}/links/convert"
        sample_flipkart_url = "https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4"
        
        # Test variations of payload: with channel_id, with channelId
        payload = {
            "url": sample_flipkart_url,
            "channel_id": 317867,
            "subid": "test_verification"
        }
        
        try:
            resp_conv = client.post(convert_url, json=payload, headers=headers)
            print(f"Endpoint: POST {convert_url}")
            print(f"Payload sent: url={sample_flipkart_url}, channel_id=317867, subid=test_verification")
            print(f"HTTP Status: {resp_conv.status_code}")
            
            try:
                conv_json = resp_conv.json()
                # Print structure without exposing complete tracking URL
                print("\nRaw Keys Returned in Response:")
                for k, v in conv_json.items():
                    if isinstance(v, dict):
                        print(f"  {k}: dict with keys {list(v.keys())}")
                    elif isinstance(v, list):
                        print(f"  {k}: list of length {len(v)}")
                    else:
                        if "url" in k.lower() or "link" in k.lower():
                            masked_v = v[:25] + "..." if isinstance(v, str) and len(v) > 25 else "***"
                            print(f"  {k}: {masked_v}")
                        else:
                            print(f"  {k}: {v}")
                
                # Check affiliated flag or data
                conv_data = conv_json.get("data", conv_json)
                if isinstance(conv_data, dict):
                    results["conversion_affiliated"] = conv_data.get("affiliated")
                    results["conversion_campaign_id"] = conv_data.get("campaign_id")
                    results["conversion_status"] = conv_data.get("status")
                    results["conversion_error"] = conv_data.get("error") or conv_data.get("message")
                    print(f"\nAffiliated Flag: {conv_data.get('affiliated')}")
                    print(f"Campaign ID: {conv_data.get('campaign_id')}")
                    print(f"Status / Message: {conv_data.get('status')} | {conv_data.get('message')}")
                elif isinstance(conv_data, list) and conv_data:
                    first_item = conv_data[0]
                    results["conversion_affiliated"] = first_item.get("affiliated")
                    results["conversion_campaign_id"] = first_item.get("campaign_id")
                    print(f"\nAffiliated Flag: {first_item.get('affiliated')}")
                    print(f"Campaign ID: {first_item.get('campaign_id')}")
            except Exception:
                print("Response Body (Text):", resp_conv.text[:300])
                results["conversion_raw_text"] = resp_conv.text[:200]
            
            results["conversion_http_status"] = resp_conv.status_code
        except Exception as e:
            print(f"[ERROR] /links/convert request failed: {e}")
            results["conversion_error"] = str(e)

    print("\n" + "=" * 70)
    print("AUDIT SUMMARY COMPLETE")
    print("=" * 70)
    return results

if __name__ == "__main__":
    run_inspection()
