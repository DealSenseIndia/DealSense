import sys
import httpx
from backend.config import settings


def run_ping_test():
    print("=" * 60)
    print("CUELINKS V3 /ping CONNECTION TEST")
    print("=" * 60)

    # 1. Verify API Key presence
    if not settings.CUELINKS_API_KEY:
        print("[FAIL] CUELINKS_API_KEY is missing or empty in configuration/.env.")
        sys.exit(1)

    print("[OK] CUELINKS_API_KEY loaded from configuration.")

    # 2. Prepare request
    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    # Test /ping endpoint
    url = f"{base_url}/ping"

    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "User-Agent": "DealWise-Backend/1.0",
    }

    print(f"Connecting to: {url} ...")

    # 3. Execute request safely
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(url, headers=headers)

            # If /ping returned 404, check /ping.json as fallback
            if resp.status_code == 404:
                json_url = f"{base_url}/ping.json"
                print(f"[NOTE] /ping returned 404, trying {json_url} ...")
                resp = client.get(json_url, headers=headers)

        print(f"HTTP Status: {resp.status_code}")

        if resp.status_code == 200:
            print("[SUCCESS] Authentication succeeded!")
            try:
                data = resp.json()
                print("Response Data (Sanitized):")
                # Filter out any sensitive tokens if present
                safe_data = {k: v for k, v in data.items() if "token" not in k.lower() and "key" not in k.lower()}
                print(safe_data)
            except Exception:
                print("Response Body (Text):", resp.text[:200])
        else:
            print(f"[FAILURE] HTTP request returned status code {resp.status_code}")
            try:
                err_data = resp.json()
                print("Error Details:", err_data)
            except Exception:
                print("Raw Response:", resp.text[:300])

    except Exception as e:
        print(f"[ERROR] Connection failed: {e}")
        sys.exit(1)

    print("=" * 60)


if __name__ == "__main__":
    run_ping_test()
