"""
Test verifying that unofficial HTML price scrapers have been safely decommissioned.
"""
from backend.extractor import extract_product_data, safe_extract_product_data

test_urls = [
    ("Amazon", "https://www.amazon.in/dp/B0D14BB5XY?th=1"),
    ("Flipkart", "https://www.flipkart.com/motorola-g37-power-pantone-nautical-blue-128-gb/p/itm48ade38c32669?pid=MOBHMX5YNNYGMVWH"),
]

print("=" * 60)
print("DECOMMISSIONED SCRAPER VERIFICATION TEST")
print("=" * 60)

for merchant, url in test_urls:
    res = extract_product_data(url)
    assert res is None, f"Expected extract_product_data to return None for {merchant}, got {res}"
    print(f"[OK] {merchant}: Live scraper is cleanly decommissioned (returns None).")

    safe_res = safe_extract_product_data(url)
    assert safe_res is None, f"Expected safe_extract_product_data to return None for {merchant}, got {safe_res}"
    print(f"[OK] {merchant}: safe_extract_product_data is cleanly decommissioned.")

print("\nAll scraper decommission tests PASSED.")
print("=" * 60)
