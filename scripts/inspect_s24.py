import sys, os
sys.path.insert(0, os.path.abspath("."))
import httpx
from bs4 import BeautifulSoup
import re

url = "https://www.amazon.in/dp/B0CS5X6F9M"
headers = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
    "Referer": "https://www.google.com/",
}
client = httpx.Client(follow_redirects=True, timeout=15)
resp = client.get(url, headers=headers)
soup = BeautifulSoup(resp.text, "html.parser")

print("Status code:", resp.status_code)
title_el = soup.find("span", {"id": "productTitle"})
print("Title:", title_el.get_text(strip=True) if title_el else "None")

# Find all occurrences of rupee symbol or price
for el in soup.find_all(lambda t: t.name in ["span", "div", "td", "p"] and "₹" in t.get_text()):
    txt = el.get_text(strip=True)
    cls = el.get("class", [])
    el_id = el.get("id", "")
    if len(txt) < 30 and any(c.isdigit() for c in txt):
        print(f"Candidate price tag: <{el.name} class='{' '.join(cls)}' id='{el_id}'> -> {txt}")

# Check JSON-LD
for s in soup.find_all("script", type="application/ld+json"):
    print("JSON-LD:", s.string[:300] if s.string else "Empty")

# Check apexPriceToPay or corePrice
for div in soup.select("#corePriceDisplay_desktop_feature_div, #apex_desktop, #corePrice_desktop, .priceToPay, .a-price"):
    print("Price div:", div.get("id"), div.get("class"), "->", div.get_text(strip=True))
