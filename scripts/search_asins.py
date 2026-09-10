import httpx, re
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}
r = httpx.get('https://www.amazon.in/s?k=Logitech+MX+Master+3S', headers=headers)
print('Search status:', r.status_code)
asins = set(re.findall(r'data-asin="(B0[A-Z0-9]{8})"', r.text))
print('Found real active ASINs:', asins)
for a in list(asins)[:3]:
    r2 = httpx.get(f'https://www.amazon.in/dp/{a}', headers=headers)
    print(f"ASIN {a} status:", r2.status_code)
