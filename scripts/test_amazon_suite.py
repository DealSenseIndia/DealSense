import sys, os
sys.path.insert(0, os.path.abspath("."))
import httpx
from bs4 import BeautifulSoup
from backend.resolver import resolve_product_url
from backend.extractor import extract_amazon_data

urls = [
    "https://www.amazon.in/dp/B0D14BB5XY", # Air Fryer
    "https://www.amazon.in/dp/B0CHX1W1XY", # iPhone 15
    "https://www.amazon.in/dp/B0C3Q1796X", # OnePlus Buds
    "https://www.amazon.in/dp/B0CX225K3L", # Samsung Galaxy M15
    "https://www.amazon.in/dp/B09V7ZZMHY", # Echo Dot
    "https://www.amazon.in/dp/B08N5XSG8Z", # MacBook Air M1
    "https://www.amazon.in/dp/B0BDK62PDX", # boAt Airdopes 141
]

for u in urls:
    res = resolve_product_url(u)
    print(f"\nTesting {res.clean_url}...")
    try:
        data = extract_amazon_data(res)
        print(f"  SUCCESS! Title: {data.title[:35]} | Price: {data.price} | MRP: {data.mrp} | Imgs: {len(data.images) if data.images else 0} | Specs: {len(data.specifications) if data.specifications else 0}")
    except Exception as e:
        print(f"  FAILED: {type(e).__name__}: {e}")
