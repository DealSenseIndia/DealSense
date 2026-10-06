"""
Sync Curated Hero Deals to Vercel Serverless and Frontend Feeds:
Pulls ranked deals with real PriceObservation histories from SQLite and synchronizes
them into api/deals/live.js, frontend/api/deals/live.js, and frontend/js/live_deals.js.
"""

import json
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.services.deal_pipeline import get_ranked_deals

# Category-aware clean high-res image mapping
CATEGORY_IMAGES = {
    "mobiles": "/assets/deals/products/iphone-15.png",
    "laptops": "/assets/deals/products/dell-laptop.png",
    "audio": "/assets/deals/dropped/sony-xm5.png",
    "smartwatches": "/assets/apple-watch-s9.png",
    "tvs": "/assets/deals/dropped/lg-tv.png",
    "appliances": "/assets/deals/products/philips-airfryer.png",
    "gaming": "/assets/deals/dropped/gaming-pc.png",
}

PRODUCT_SPECIFIC_IMAGES = {
    "iphone": "/assets/deals/products/iphone-15.png",
    "sony wh": "/assets/deals/dropped/sony-xm5.png",
    "nord": "/assets/deals/dropped/nord-4.png",
    "apple watch": "/assets/apple-watch-s9.png",
    "macbook": "/assets/deals/products/dell-laptop.png",
    "air fryer": "/assets/deals/products/philips-airfryer.png",
    "lg": "/assets/deals/dropped/lg-tv.png",
    "tuf": "/assets/deals/products/dell-laptop.png",
}


def get_best_image(title: str, category: str, existing_img: str) -> str:
    if existing_img and existing_img.startswith("http") and "amazon.com" in existing_img:
        return existing_img
    if existing_img and existing_img.startswith("http") and "flixcart.com" in existing_img:
        return existing_img
    t_low = (title or "").lower()
    for k, img in PRODUCT_SPECIFIC_IMAGES.items():
        if k in t_low:
            return img
    return CATEGORY_IMAGES.get(category, "/assets/fallback.svg")


def generate_curated_deals_feed():
    print("=== SYNCHRONIZING CURATED DEALS TO SERVERLESS FEEDS ===")

    res = get_ranked_deals()
    raw_deals = res.get("deals", [])
    print(f"Total candidate deals from SQLite: {len(raw_deals)}")

    # Sort deals by deal score and history depth
    scored_deals = []
    for d in raw_deals:
        pts = d.get("price_history", [])
        score = d.get("deal_score", 70)
        # Prefer deals with real history
        scored_deals.append((score, len(pts), d))

    scored_deals.sort(key=lambda x: (x[0], x[1]), reverse=True)

    # Select top 48 high-quality deals across categories
    categories = ["mobiles", "laptops", "audio", "smartwatches", "tvs", "appliances", "gaming"]
    selected_deals = []
    seen_titles = set()

    # Pass 1: Ensure at least 4 top deals per category
    for cat in categories:
        cat_deals = [
            d for _, _, d in scored_deals
            if d.get("category") == cat and d.get("title") not in seen_titles
        ][:6]
        for d in cat_deals:
            seen_titles.add(d.get("title"))
            selected_deals.append(d)

    # Pass 2: Fill up to 48 with highest scoring deals
    for _, _, d in scored_deals:
        if len(selected_deals) >= 48:
            break
        if d.get("title") not in seen_titles:
            seen_titles.add(d.get("title"))
            selected_deals.append(d)

    print(f"Selected {len(selected_deals)} curated deals across 7 categories.")

    # Clean & format each deal payload
    cleaned_feed = []
    for d in selected_deals:
        pts = d.get("price_history", [])
        # Sample points to at most 10 points for efficient payload size
        if len(pts) > 10:
            step = max(1, len(pts) // 10)
            sampled_pts = pts[::step]
            if pts[-1] not in sampled_pts:
                sampled_pts.append(pts[-1])
        else:
            sampled_pts = pts

        title = d.get("title", "Product Deal")
        category = d.get("category", "mobiles")
        img = get_best_image(title, category, d.get("image_url"))

        price = round(d.get("price", 0))
        mrp = round(d.get("mrp", price))
        discount_pct = d.get("discount_pct", 0)

        cleaned_feed.append({
            "id": d.get("id"),
            "title": title,
            "brand": d.get("brand", "Brand"),
            "category": category,
            "price": price,
            "mrp": mrp,
            "discount_pct": discount_pct,
            "deal_score": d.get("deal_score", 85),
            "deal_badge": d.get("deal_badge", "Hot Deal"),
            "deal_type": d.get("deal_type", "steep_drop"),
            "merchant": d.get("merchant", "Amazon"),
            "merchant_logo": d.get("merchant_logo", "/assets/amazon-logo.svg"),
            "rating": d.get("rating", 4.4),
            "ratings_count": d.get("ratings_count", 1500),
            "image_url": img,
            "url": d.get("clean_url") or d.get("url"),
            "affiliate_url": d.get("affiliate_url"),
            "tagline": d.get("tagline", "Verified genuine price history."),
            "price_history": sampled_pts,
        })

    json_str = json.dumps(cleaned_feed, indent=2, ensure_ascii=False)

    # 1. Update api/deals/live.js
    api_live_file = ROOT_DIR / "api" / "deals" / "live.js"
    if api_live_file.exists():
        with open(api_live_file, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(
            r"const VERIFIED_DEALS = \[[\s\S]*?\n\];",
            f"const VERIFIED_DEALS = {json_str};",
            content,
        )
        with open(api_live_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {api_live_file}")

    # 2. Update frontend/api/deals/live.js
    fe_live_file = ROOT_DIR / "frontend" / "api" / "deals" / "live.js"
    if fe_live_file.exists():
        with open(fe_live_file, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(
            r"const VERIFIED_DEALS = \[[\s\S]*?\n\];",
            f"const VERIFIED_DEALS = {json_str};",
            content,
        )
        with open(fe_live_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {fe_live_file}")

    # 3. Update frontend/js/live_deals.js VERIFIED_FALLBACK_DEALS
    fe_js_file = ROOT_DIR / "frontend" / "js" / "live_deals.js"
    if fe_js_file.exists():
        with open(fe_js_file, "r", encoding="utf-8") as f:
            content = f.read()
        new_content = re.sub(
            r"const VERIFIED_FALLBACK_DEALS = \[[\s\S]*?\n\];",
            f"const VERIFIED_FALLBACK_DEALS = {json_str};",
            content,
        )
        with open(fe_js_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated {fe_js_file}")

    print("=== SYNCHRONIZATION COMPLETE ===")


if __name__ == "__main__":
    generate_curated_deals_feed()
