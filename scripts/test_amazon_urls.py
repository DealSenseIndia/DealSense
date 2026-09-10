import sys, os
sys.path.insert(0, os.path.abspath("."))
from backend.services.merchant_adapters import adapter_registry
from backend.resolver import resolve_product_url
from backend.extractor import extract_product_data
from backend.service import ingest_and_evaluate

test_urls = [
    # 1. Standard dp link
    "https://www.amazon.in/dp/B0D14BB5XY",
    # 2. Slug + dp link with ref parameters
    "https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY?ref_=Oct_DLandingS_D_12345",
    # 3. amzn.in mobile share link
    "https://amzn.in/d/8G3xYZ9",
    # 4. Another popular electronics ASIN
    "https://www.amazon.in/OnePlus-Nord-Buds-2r-Wireless/dp/B0C3Q1796X",
    # 5. Laptop ASIN
    "https://www.amazon.in/dp/B0C8K95Y2N",
]

for url in test_urls:
    print(f"\n==================== Testing: {url} ====================")
    try:
        adapter, norm = adapter_registry.resolve_url(url)
        print("Adapter resolved:", adapter.merchant_slug if adapter else None, norm.product_id if norm else None)
    except Exception as e:
        print("Adapter error:", e)

    try:
        res = ingest_and_evaluate(url, force_refresh=True)
        print("Ingest status:", res.get("status"))
        p = res.get("product", {})
        print("Product title:", p.get("title"))
        print("Price:", res.get("pricing", {}).get("current_price"))
        print("Images count:", len(p.get("images", [])))
        print("Specs count:", len(p.get("specifications", [])) if p.get("specifications") else 0)
    except Exception as e:
        print("Ingest ERROR:", type(e), e)
