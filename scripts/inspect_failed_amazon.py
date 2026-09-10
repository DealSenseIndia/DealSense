import sys, os
sys.path.insert(0, os.path.abspath("."))
import httpx
from bs4 import BeautifulSoup
import re

url = "https://www.amazon.in/dp/B0C3Q1796X"
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

print("Status:", resp.status_code)
print("Title in H1:", soup.find("h1").get_text(strip=True) if soup.find("h1") else "None")
print("productTitle:", soup.find(id="productTitle").get_text(strip=True) if soup.find(id="productTitle") else "None")

# Search for any span or div with price
for el in soup.find_all(class_=re.compile(r"price|a-price", re.I))[:15]:
    txt = el.get_text(strip=True)
    if "₹" in txt and len(txt) < 40:
        print(f"Price el: class={el.get('class')} -> '{txt}'")

# Search for JSON-LD offers
for s in soup.find_all("script", type="application/ld+json"):
    print("Found JSON-LD script:", s.string[:200] if s.string else "None")

# Check if captcha
if "captcha" in resp.text.lower():
    print("CAPTCHA DETECTED!")
    print("Action in form:", [f.get("action") for f in soup.find_all("form")])
