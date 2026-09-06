import sys
import httpx
from backend.config import settings


def check_channels():
    print("=" * 70)
    print("CUELINKS V3 — PUBLISHER CHANNELS INSPECTION")
    print("=" * 70)

    if not settings.CUELINKS_API_KEY:
        print("[FAIL] CUELINKS_API_KEY is missing or empty in .env.")
        sys.exit(1)

    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    url = f"{base_url}/channels"
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "User-Agent": "DealWise-Backend/1.0",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            print(f"Request: GET {url}")
            resp = client.get(url, headers=headers)
            print(f"HTTP Status: {resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                channels = data.get("data", data if isinstance(data, list) else [])
                print(f"Total Channels Found: {len(channels)}")
                print("-" * 70)
                for idx, ch in enumerate(channels, 1):
                    cid = ch.get("id")
                    name = ch.get("name")
                    source_url = ch.get("source_url") or ch.get("url") or ch.get("domain")
                    category = ch.get("category") or ch.get("category_name") or ch.get("categories")
                    status = ch.get("status") or ch.get("state")
                    is_default = ch.get("is_default") if ch.get("is_default") is not None else ch.get("default")

                    print(f"[{idx}] Channel ID:  {cid}")
                    print(f"    Name:        {name}")
                    print(f"    source_url:  {source_url}")
                    print(f"    category:    {category}")
                    print(f"    status:      {status}")
                    print(f"    is_default:  {is_default}")
                    print()
            elif resp.status_code == 403:
                print(f"[AUTH ERROR] Status 403: Forbidden")
                try:
                    err = resp.json()
                    print(f"Details: {err}")
                except Exception:
                    print(f"Response: {resp.text}")
                print("\n[NOTE] If you created or updated the 'DealWise Admin' key in Cuelinks, please ensure")
                print("that the new key is pasted into .env and saved (Ctrl+S) so the backend can load it.")
            else:
                print(f"[ERROR] HTTP Status: {resp.status_code}")
                try:
                    print("Details:", resp.json())
                except Exception:
                    print("Response:", resp.text)

    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)

    print("=" * 70)


if __name__ == "__main__":
    check_channels()
