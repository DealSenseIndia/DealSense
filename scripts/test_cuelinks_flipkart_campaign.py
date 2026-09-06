import sys
import re
import httpx
from backend.config import settings


def clean_html(text: str) -> str:
    if not text:
        return ""
    # Replace breaks and list items with newlines/bullets
    clean = text.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    clean = clean.replace("<li>", "\n  * ").replace("</li>", "")
    clean = re.sub(r"<[^>]+>", "", clean)
    lines = [line.strip() for line in clean.split("\n") if line.strip()]
    return "\n".join(lines)


def run_flipkart_campaign_check():
    print("=" * 75)
    print("CUELINKS V3 — FLIPKART CAMPAIGN INSPECTION")
    print("=" * 75)

    if not settings.CUELINKS_API_KEY:
        print("[FAIL] CUELINKS_API_KEY is missing or empty.")
        sys.exit(1)

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    search_url = f"{base_url}/campaigns"
    params = {"q": "flipkart"}
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "User-Agent": "DealWise-Backend/1.0",
    }

    try:
        with httpx.Client(timeout=20.0) as client:
            print(f"Endpoint: GET {search_url}?q=flipkart")
            resp = client.get(search_url, params=params, headers=headers)
            print(f"HTTP Status: {resp.status_code}")

            if resp.status_code != 200:
                print(f"[ERROR] Request failed with HTTP {resp.status_code}")
                try:
                    print("Error JSON:", resp.json())
                except Exception:
                    print("Error Text:", resp.text[:300])
                sys.exit(1)

            res_json = resp.json()
            campaigns = res_json.get("data", [])
            meta = res_json.get("meta", {})
            total_count = meta.get("total", len(campaigns))

            print(f"Total Matching Campaigns: {total_count}")
            print("-" * 75)

            flipkart_main_id = None

            for idx, c in enumerate(campaigns, 1):
                cid = c.get("id")
                name = c.get("name")
                status = c.get("access_status")
                domain = c.get("domain")
                payout = c.get("payout")
                p_currency = c.get("payout_currency")
                p_type = c.get("payout_type")
                deeplink = c.get("deeplink_allowed")
                cookie = c.get("cookie_duration")

                print(f"[{idx}] Campaign ID:   {cid}")
                print(f"    Name:          {name}")
                print(f"    Domain:        {domain}")
                print(f"    Access Status: {status}")
                print(f"    Payout:        {payout} {p_currency} ({p_type})")
                print(f"    Deeplink:      {deeplink} | Cookie: {cookie}")
                print()

                if "flipkart" in (name or "").lower() and domain == "flipkart.com" and not flipkart_main_id:
                    flipkart_main_id = cid

            # Deep inspection of primary Flipkart campaign
            target_id = flipkart_main_id or (campaigns[0].get("id") if campaigns else None)
            if target_id:
                detail_url = f"{base_url}/campaigns/{target_id}"
                print("=" * 75)
                print(f"DETAILED CAMPAIGN INSPECTION: GET /campaigns/{target_id}")
                print("=" * 75)

                d_resp = client.get(detail_url, headers=headers)
                print(f"Detail HTTP Status: {d_resp.status_code}")

                if d_resp.status_code == 200:
                    d_json = d_resp.json()
                    cdetail = d_json.get("data", d_json)

                    print(f"Campaign ID:        {cdetail.get('id')}")
                    print(f"Campaign Name:      {cdetail.get('name')}")
                    print(f"Access Status:      {cdetail.get('access_status')}")
                    print(f"Default Payout:     {cdetail.get('payout')} {cdetail.get('payout_currency')} ({cdetail.get('payout_type')})")
                    print(f"Cookie Duration:    {cdetail.get('cookie_duration')}")
                    print(f"Deeplink Allowed:   {cdetail.get('deeplink_allowed')}")
                    print(f"Tracking Time:      {cdetail.get('tracking_time')}")
                    print(f"Validation Time:    {cdetail.get('validation_time')}")

                    # Platforms
                    platforms = cdetail.get("platforms", {})
                    print(f"\nAllowed Platforms:  {', '.join(platforms.get('allowed', []))}")
                    if platforms.get("disallowed"):
                        print(f"Disallowed Plat.:   {', '.join(platforms.get('disallowed', []))}")

                    # Media Restrictions
                    media = cdetail.get("media", {})
                    print(f"Allowed Media:      {', '.join(media.get('allowed', []))}")
                    print(f"Disallowed Media:   {', '.join(media.get('disallowed', []))}")

                    # Sample Payout Categories
                    p_cats = cdetail.get("payout_categories", [])
                    print(f"\nPayout Rate Tiers ({len(p_cats)} categories defined):")
                    for cat in p_cats[:8]:
                        print(f"  * {cat.get('name')}: {cat.get('payout')} ({cat.get('payout_type')})")
                    if len(p_cats) > 8:
                        print(f"  ... and {len(p_cats) - 8} more tiers.")

                    # Important Rules & Restrictions
                    info_html = cdetail.get("important_info_html", "")
                    if info_html:
                        print("\nImportant Rules & Operational Notes:")
                        cleaned_notes = clean_html(info_html)
                        for line in cleaned_notes.split("\n")[:10]:
                            print(f"  {line}")

    except Exception as e:
        print(f"[ERROR] Exception during execution: {e}")
        sys.exit(1)

    print("=" * 75)
    print("INSPECTION FINISHED")
    print("=" * 75)


if __name__ == "__main__":
    run_flipkart_campaign_check()
