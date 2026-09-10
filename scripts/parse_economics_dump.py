"""
Compute Merchant Opportunity Scores and print Category Coverage.
"""

import json
from pathlib import Path

dump_path = Path(__file__).resolve().parent / "merchant_economics_dump.json"
with open(dump_path, "r", encoding="utf-8") as f:
    campaigns = json.load(f)

print(f"Total campaigns in dump: {len(campaigns)}")

# Filter campaigns
scored_merchants = []

for cid_str, c in campaigns.items():
    cid = int(cid_str)
    name = c.get("name")
    domain = c.get("domain")
    access = c.get("access_status")
    affiliated = c.get("affiliated", False)
    epc_7d = float(c.get("epc_7d") or 0.0)
    epc_90d = float(c.get("epc_90d") or 0.0)
    best_epc = max(epc_7d, epc_90d)
    payout = str(c.get("payout"))
    p_type = c.get("payout_type")
    cookie = c.get("cookie_duration") or "Unknown"
    cats = c.get("categories", [])

    # Scoring algorithm (0 - 100)
    # 1. Product/category relevance (25 pts)
    # High relevance: Electronics, PC, Mobiles, Gaming, Audio, Furniture, Home, Major Fashion/Beauty
    rel_score = 0
    name_lower = (name or "").lower()
    dom_lower = (domain or "").lower()
    
    tech_keywords = ["lenovo", "acer", "dell", "hp", "asus", "boat", "noise", "vijay", "electronics", "croma", "apple", "samsung"]
    furniture_keywords = ["pepperfry", "sleepwell", "wakefit", "wooden", "furniture", "mattress"]
    major_retail = ["tatacliq", "nykaa", "flipkart", "amazon", "myntra", "ajio", "marksandspencer", "bewakoof"]
    
    if any(k in dom_lower or k in name_lower for k in tech_keywords):
        rel_score = 25
    elif any(k in dom_lower or k in name_lower for k in furniture_keywords):
        rel_score = 23
    elif any(k in dom_lower or k in name_lower for k in major_retail):
        rel_score = 24
    else:
        rel_score = 12

    # 2. Monetization availability (20 pts)
    # open & affiliated: true = 20 pts; pending = 6 pts; not_applied/paused = 0 pts
    avail_score = 0
    if access == "open" and affiliated:
        avail_score = 20
    elif access == "open":
        avail_score = 14
    elif access == "pending":
        avail_score = 6
    else:
        avail_score = 0

    # 3. EPC (20 pts)
    # EPC > 4.0 = 20 pts; > 2.0 = 16 pts; > 1.0 = 13 pts; > 0.5 = 10 pts; > 0.2 = 7 pts; > 0 = 4 pts
    epc_score = 0
    if best_epc >= 4.0:
        epc_score = 20
    elif best_epc >= 2.0:
        epc_score = 16
    elif best_epc >= 1.0:
        epc_score = 13
    elif best_epc >= 0.5:
        epc_score = 10
    elif best_epc >= 0.2:
        epc_score = 7
    elif best_epc > 0:
        epc_score = 4
    else:
        epc_score = 1

    # 4. Product / AOV Potential (15 pts)
    # Laptops, major appliances, furniture, multi-brand tech = 15 pts
    # Fashion, audio, beauty = 10 pts
    # Cheap accessories, coffee, grocery = 6 pts
    aov_score = 10
    if any(k in dom_lower or k in name_lower for k in ["lenovo", "acer", "dell", "hp", "vijay", "pepperfry", "sleepwell"]):
        aov_score = 15
    elif any(k in dom_lower or k in name_lower for k in ["tatacliq", "marksandspencer", "amazon", "flipkart"]):
        aov_score = 13
    elif any(k in dom_lower or k in name_lower for k in ["boat", "noise", "nykaa"]):
        aov_score = 10
    else:
        aov_score = 7

    # 5. Catalog breadth (10 pts)
    breadth_score = 5
    if any(k in dom_lower for k in ["tatacliq", "amazon", "flipkart", "vijaysales", "pepperfry", "myntra", "ajio"]):
        breadth_score = 10
    elif any(k in dom_lower for k in ["nykaa", "lenovo", "marksandspencer"]):
        breadth_score = 7
    else:
        breadth_score = 5

    # 6. Platform compatibility (5 pts)
    plat_score = 5
    platforms = c.get("platforms", {})
    if isinstance(platforms, dict):
        disallowed = platforms.get("disallowed", [])
        if "Android App" in disallowed and "iOS App" in disallowed:
            plat_score = 3
        elif "iOS App" in disallowed:
            plat_score = 4

    # 7. Tracking / cookie quality (5 pts)
    cookie_score = 3
    if "7" in str(cookie) or "30" in str(cookie).lower() and "day" in str(cookie).lower():
        cookie_score = 5
    elif "24" in str(cookie) or "1" in str(cookie) and "day" in str(cookie).lower():
        cookie_score = 4
    elif "minute" in str(cookie).lower():
        cookie_score = 2

    total_score = rel_score + avail_score + epc_score + aov_score + breadth_score + plat_score + cookie_score

    scored_merchants.append({
        "id": cid,
        "name": name,
        "domain": domain,
        "access": access,
        "affiliated": affiliated,
        "epc_7d": epc_7d,
        "epc_90d": epc_90d,
        "best_epc": best_epc,
        "payout": payout,
        "payout_type": p_type,
        "cookie": cookie,
        "categories": cats,
        "score": total_score,
        "sub_scores": {
            "relevance": rel_score,
            "availability": avail_score,
            "epc": epc_score,
            "aov": aov_score,
            "breadth": breadth_score,
            "platform": plat_score,
            "cookie": cookie_score
        }
    })

# Sort by score descending
scored_merchants.sort(key=lambda x: x["score"], reverse=True)

print("\n" + "=" * 90)
print(f"{'RANK':4} | {'MERCHANT':22} | {'ID':6} | {'ACCESS':8} | {'AFF':5} | {'EPC 7d':6} | {'EPC 90d':7} | {'SCORE':5} | {'DOMAIN'}")
print("=" * 90)
for idx, m in enumerate(scored_merchants[:25], 1):
    print(f"{idx:4} | {m['name'][:22]:22} | {m['id']:6} | {m['access']:8} | {str(m['affiliated']):5} | {m['epc_7d']:6.2f} | {m['epc_90d']:7.2f} | {m['score']:5} | {m['domain']}")

with open("scripts/scored_merchants.json", "w", encoding="utf-8") as f:
    json.dump(scored_merchants, f, indent=2)
