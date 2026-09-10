import html
import json
import re
from dataclasses import dataclass
from typing import Optional
from bs4 import BeautifulSoup
import httpx

from backend.resolver import resolve_product_url, ResolvedURL


@dataclass
class ExtractedProduct:
    merchant: str
    merchant_product_id: str
    clean_url: str
    title: str
    price: float
    mrp: Optional[float]
    currency: str = "INR"
    brand: Optional[str] = None
    model_number: Optional[str] = None
    category: Optional[str] = None
    in_stock: bool = True
    image_url: Optional[str] = None
    images: Optional[list] = None  # Array of all product image URLs
    rating: Optional[float] = None
    ratings_count: Optional[str] = None
    bought_past_month: Optional[str] = None
    badge: Optional[str] = None
    highlight_tag: Optional[str] = None
    specifications: Optional[list] = None  # Array of {key, value} dicts
    seller_name: Optional[str] = None
    delivery_info: Optional[str] = None
    top_review: Optional[dict] = None
    feature_bullets: Optional[list] = None  # Key feature bullet points
    return_policy: Optional[str] = None  # e.g. "7 Days Replacement", "10 Days Returnable"
    is_prime: bool = False  # Amazon Prime eligibility
    is_f_assured: bool = False  # Flipkart Assured badge
    delivery_fee: float = 0.0  # 0.0 for FREE Delivery
    coupons: Optional[list] = None  # Array of {code, title, discount, terms}
    top_reviews: Optional[list] = None  # Array of real customer reviews
    rating_breakdown: Optional[dict] = None  # e.g. {"5": 65, "4": 20, "3": 8, "2": 4, "1": 3}
    pros: Optional[list] = None
    cons: Optional[list] = None


def _clean_number(text: Optional[str]) -> Optional[float]:
    if not text:
        return None
    cleaned = re.sub(r"[^0-9.]", "", text.replace(",", ""))
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def extract_amazon_data(resolved: ResolvedURL, timeout: float = 15.0) -> ExtractedProduct:
    """
    Extracts live metadata and pricing for an Amazon product.
    Includes automated challenge bypass and robust selector fallbacks.
    """
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

    client = httpx.Client(follow_redirects=True, timeout=timeout)
    resp = client.get(resolved.clean_url, headers=headers)
    soup = BeautifulSoup(resp.text, "html.parser")

    # If Amazon issues Robot Check or 503, retry with mobile Safari browser profile
    is_robot = "Robot Check" in resp.text or (soup.title and "Robot Check" in soup.title.string)
    if is_robot or resp.status_code != 200 or not soup.find("span", {"id": "productTitle"}):
        mobile_headers = {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.5 Mobile/15E148 Safari/604.1"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-IN,en;q=0.9",
            "Referer": "https://www.google.com/",
        }
        try:
            m_resp = client.get(resolved.clean_url, headers=mobile_headers)
            if m_resp.status_code == 200 and "Robot Check" not in m_resp.text:
                resp = m_resp
                soup = BeautifulSoup(resp.text, "html.parser")
        except Exception:
            pass

    # If Amazon issues a validateCaptcha challenge form, attempt solve
    captcha_form = soup.find("form", {"action": lambda a: a and "validateCaptcha" in a})
    if captcha_form:
        action = captcha_form.get("action")
        params = {
            inp.get("name"): html.unescape(inp.get("value", ""))
            for inp in captcha_form.find_all("input")
            if inp.get("name")
        }
        captcha_url = f"https://www.amazon.in{action}"
        try:
            client.get(captcha_url, params=params, headers=headers)
            resp = client.get(resolved.clean_url, headers=headers)
            soup = BeautifulSoup(resp.text, "html.parser")
        except Exception:
            pass

    # 1. Title
    title_el = (
        soup.find("span", {"id": "productTitle"})
        or soup.find("h1", {"id": "title"})
        or soup.find("h1")
    )
    title = title_el.get_text(strip=True) if title_el else None
    if not title:
        og_title = soup.select_one('meta[property="og:title"]')
        if og_title and og_title.get("content"):
            title = og_title.get("content").strip()
    if not title and soup.title and soup.title.string:
        t_clean = re.sub(r":\s*Buy.*Amazon\.in.*", "", soup.title.string, flags=re.IGNORECASE).strip()
        if t_clean and "Robot Check" not in t_clean:
            title = t_clean

    # 2. Availability (check out of stock first to avoid matching accessories)
    in_stock = True
    avail_el = soup.find("div", {"id": "availability"}) or soup.find("div", {"id": "outOfStock"})
    if avail_el and any(w in avail_el.get_text(strip=True).lower() for w in ("currently unavailable", "out of stock")):
        in_stock = False

    # 3. Price — Prioritize core product buybox containers over generic whole-page spans
    price = None
    core_price_selectors = [
        "#corePriceDisplay_desktop_feature_div .priceToPay span.a-price-whole",
        "#corePriceDisplay_desktop_feature_div span.a-price-whole",
        "#corePrice_desktop .priceToPay span.a-price-whole",
        "#corePrice_desktop span.a-price-whole",
        ".priceToPay span.a-price-whole",
        ".apexPriceToPay span.a-price-whole",
        "#apexPriceToPay span.a-price-whole",
        "span.apex-price-to-pay-value",
        "#desktop_buybox .priceToPay span.a-price-whole",
        "#desktop_buybox span.a-price-whole",
        "#tabular-buybox .priceToPay span.a-price-whole",
        "#tabular-buybox span.a-price-whole",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "#priceblock_saleprice",
        "#corePriceDisplay_desktop_feature_div span.a-offscreen",
        "#corePrice_desktop span.a-offscreen",
        ".priceToPay span.a-offscreen",
    ]

    for sel in core_price_selectors:
        el = soup.select_one(sel)
        if el:
            val = _clean_number(el.get_text(strip=True))
            if val and val > 0:
                price = val
                break

    # 4. MRP (Maximum Retail Price / Strikethrough)
    mrp = None
    mrp_selectors = [
        "#corePriceDisplay_desktop_feature_div span.a-price.a-text-price span.a-offscreen",
        "#corePrice_desktop span.a-price.a-text-price span.a-offscreen",
        "span.basisPrice span.a-offscreen",
        "span.a-price.a-text-price span.a-offscreen",
    ]
    for sel in mrp_selectors:
        el = soup.select_one(sel)
        if el:
            val = _clean_number(el.get_text(strip=True))
            if val and val > 0:
                mrp = val
                break

    # 5. Fallback to script / embedded JSON
    if not price:
        for m in re.finditer(r'["\'](?:priceAmount|buyingPrice)["\']\s*:\s*([0-9.]+)', resp.text):
            val = _clean_number(m.group(1))
            if val and val > 0:
                price = val
                break

    # 6. Fallback to JSON-LD
    if not title or not price:
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    if not title and "name" in item:
                        title = item.get("name")
                    if not price and "offers" in item:
                        offers = item["offers"]
                        if isinstance(offers, dict) and "price" in offers:
                            price = _clean_number(str(offers.get("price")))
                        elif isinstance(offers, list) and offers:
                            price = _clean_number(str(offers[0].get("price")))
            except Exception:
                continue

    # 7. Scoped regex fallback in product center column or buybox ONLY
    if not price:
        scoped_container = soup.find(id="ppd") or soup.find(id="centerCol") or soup.find(id="desktop_buybox")
        if scoped_container:
            m = re.search(r"₹\s*([0-9,]+(?:\.[0-9]+)?)", scoped_container.get_text())
            if m:
                price = _clean_number(m.group(1))

    if not title:
        title = f"Amazon Product {resolved.product_id}"

    # Price resolution fallback without fatal crash
    if price is None:
        if not in_stock:
            price = 0.0
        else:
            price = mrp or 0.0

    # If MRP was lower than price or absent, fallback to price
    if mrp and price > 0 and mrp < price:
        mrp = price

    # 6. Brand
    brand = None
    byline = soup.find("a", {"id": "bylineInfo"})
    if byline:
        brand_raw = byline.get_text(strip=True)
        brand = re.sub(r"^(Visit the|Brand:)\s*", "", brand_raw, flags=re.IGNORECASE).replace(" Store", "").strip()

    # 7. Images — extract multiple from colorImages JSON blob and DOM fallback
    image_url = None
    images = []
    img_el = soup.find("img", {"id": "landingImage"}) or soup.find("img", class_="a-dynamic-image")
    if img_el and img_el.get("src"):
        image_url = img_el.get("src")

    # Extract all gallery images from Amazon's colorImages JS variable
    color_images_match = re.search(r"'colorImages'\s*:\s*\{.*?'initial'\s*:\s*(\[.*?\])", resp.text, re.DOTALL)
    if color_images_match:
        try:
            img_data = json.loads(color_images_match.group(1))
            for img_item in img_data:
                hi_res = img_item.get("hiRes") or img_item.get("large") or img_item.get("main", {}).get("url")
                if hi_res and hi_res not in images:
                    images.append(hi_res)
        except Exception:
            pass

    # Fallback: extract from altImages thumbs
    if len(images) < 2:
        for thumb in soup.select("#altImages li img, #imageBlock img"):
            src = thumb.get("src", "")
            # Convert thumbnail to full-size by replacing size token
            full = re.sub(r"\._[A-Z0-9_]+_\.", "._SL1500_.", src)
            if full and full not in images:
                images.append(full)

    # Clean out placeholder/sprite/pixel images
    cleaned_images = []
    for u in images:
        if not u:
            continue
        u_lower = u.lower()
        if any(bad in u_lower for bad in ("grey-pixel", "play-button", "transparent-pixel", "sprite")) or u_lower.endswith(".gif"):
            continue
        if u not in cleaned_images:
            cleaned_images.append(u)
    images = cleaned_images[:6]

    if not image_url and images:
        image_url = images[0]
    elif image_url and image_url not in images and not any(bad in image_url.lower() for bad in ("grey-pixel", ".gif")):
        images.insert(0, image_url)

    # 8. Category & Breadcrumbs
    breadcrumbs = [a.get_text(strip=True) for a in soup.select("#wayfinding-breadcrumbs_feature_div ul li a")]
    category = breadcrumbs[-1] if breadcrumbs else None

    # 9. Real Rating
    rating = None
    popover = soup.find(id="acrPopover")
    if popover:
        p_title = popover.get("title", "")
        m = re.search(r"([0-9.]+)\s*out of 5", p_title)
        if m:
            try:
                rating = float(m.group(1))
            except ValueError:
                pass
    if rating is None:
        rating_el = soup.select_one("#acrPopover span.a-icon-alt, span.a-icon-alt, i.a-icon-star span, i.a-icon-star-small span")
        if rating_el:
            rating_text = rating_el.get_text(strip=True)
            r_match = re.search(r"([0-9.]+)\s*out of 5", rating_text) or re.search(r"^([0-9.]+)$", rating_text)
            if r_match:
                try:
                    rating = float(r_match.group(1))
                except ValueError:
                    pass
    if rating is None:
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                items = data if isinstance(data, list) else [data]
                for it in items:
                    if isinstance(it, dict) and "aggregateRating" in it:
                        agg = it["aggregateRating"]
                        if isinstance(agg, dict) and "ratingValue" in agg:
                            rating = float(agg["ratingValue"])
                            break
            except Exception:
                pass

    # 10. Real Ratings Count
    ratings_count = None
    rc_el = soup.find("span", {"id": "acrCustomerReviewText"})
    if rc_el:
        rc_text = rc_el.get_text(strip=True)
        rc_match = re.search(r"([0-9,]+)", rc_text)
        if rc_match:
            ratings_count = rc_match.group(1)


    # 11. Bought Past Month (Social Proof)
    bought_past_month = None
    bought_el = soup.select_one("#social-proofing-faceout-title-tk_bought, .social-proofing-faceout-title")
    if bought_el:
        bought_past_month = bought_el.get_text(strip=True)
        bought_past_month = re.sub(r"\s+", " ", bought_past_month).strip()

    # 12. Badges & Highlights
    badge = None
    badge_el = soup.select_one("span.ac-badge-rectangle, #zeitgeistBadge_feature_div")
    if badge_el:
        b_txt = badge_el.get_text(strip=True)
        if "Best Seller" in b_txt:
            badge = "Best Seller"
        elif "Choice" in b_txt:
            badge = "Amazon's Choice"


    # 13. Feature Bullets -> highlight tag + stored bullets
    highlight_tag = None
    feature_bullets = []
    bullets = [li.get_text(strip=True) for li in soup.select("#feature-bullets ul li span") if li.get_text(strip=True)]
    if bullets:
        feature_bullets = bullets[:8]
        first_bullet = bullets[0]
        for candidate in ["Rapid Air", "Bass", "Noise Cancelling", "Fast Charge", "Wireless", "Water Resistant", "4K", "100% Poly", "Non Woven", "AMOLED", "Retina", "120Hz"]:
            if candidate.lower() in first_bullet.lower() or candidate.lower() in title.lower():
                highlight_tag = candidate
                break

    # 14. Specifications — extract from tech spec tables
    specifications = []
    spec_tables = soup.select("#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #detailBullets_feature_div li")
    for row in spec_tables:
        cells = row.find_all(["th", "td"])
        if len(cells) >= 2:
            key = cells[0].get_text(strip=True).rstrip(":")
            val = cells[1].get_text(strip=True)
            if key and val and len(key) < 60:
                specifications.append({"key": key, "value": val})

    # Also try the "prodDetTable" format
    if not specifications:
        for row in soup.select(".prodDetTable tr"):
            tds = row.find_all("td")
            ths = row.find_all("th")
            if ths and tds:
                key = ths[0].get_text(strip=True)
                val = tds[0].get_text(strip=True)
                if key and val:
                    specifications.append({"key": key, "value": val})

    # 15. Seller name from buy box
    seller_name = None
    seller_el = soup.select_one("#sellerProfileTriggerId, #merchant-info a, #tabular-buybox-truncate-0 a")
    if seller_el:
        seller_name = seller_el.get_text(strip=True)
    if not seller_name:
        merchant_info = soup.find("div", {"id": "merchant-info"})
        if merchant_info:
            s_match = re.search(r"(?:Sold by|Ships from)\s+(.+?)(?:\.|$)", merchant_info.get_text(strip=True))
            if s_match:
                seller_name = s_match.group(1).strip()

    # 16. Delivery estimate
    delivery_info = None
    delivery_el = soup.select_one("#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE span, #deliveryMessageMirId span, #ddmDeliveryMessage")
    if delivery_el:
        delivery_info = delivery_el.get_text(strip=True)
        delivery_info = re.sub(r"\s+", " ", delivery_info).strip()
    if not delivery_info:
        delivery_block = soup.find("div", {"id": "mir-layout-DELIVERY_BLOCK"})
        if delivery_block:
            dt = delivery_block.get_text(strip=True)
            d_match = re.search(r"(Delivery\s+\w+,\s+\w+\s+\d+|FREE delivery|Get it by\s+\w+,\s+\w+\s+\d+)", dt, re.IGNORECASE)
            if d_match:
                delivery_info = d_match.group(1)

    # 17. Return & Replacement Policy
    return_policy = None
    returns_el = soup.select_one(
        "#RETURNS_POLICY span.a-size-small, "
        "div[data-name='RETURNS_POLICY'] span.a-size-small, "
        "#RETURNS_POLICY, div[data-name='RETURNS_POLICY'], "
        "#service-options-accordion-content-id span"
    )
    if returns_el:
        ret_txt = returns_el.get_text(strip=True)
        ret_m = re.search(r"(\d+\s*(?:days?|hrs?)\s*(?:Replacement|Returnable|Return|Exchange)|Non-Returnable)", ret_txt, re.IGNORECASE)
        if ret_m:
            return_policy = ret_m.group(1).title()
        elif len(ret_txt) < 40 and any(w in ret_txt.lower() for w in ("return", "replacement")):
            return_policy = ret_txt
    if not return_policy:
        icon_farm = soup.find(id="icon-farm-container")
        if icon_farm:
            ret_m = re.search(r"(\d+\s*Days?\s*(?:Replacement|Returnable|Return))", icon_farm.get_text(), re.IGNORECASE)
            if ret_m:
                return_policy = ret_m.group(1).title()
    if not return_policy:
        return_policy = "7 Days Replacement"

    # 18. Prime & Delivery Fee
    is_prime = bool(
        soup.select_one(".a-icon-prime, #prime-icon, #bbop-prime-badge, i.a-icon-prime")
        or (delivery_info and "prime" in delivery_info.lower())
    )
    delivery_fee = 0.0
    if delivery_info:
        if "free" in delivery_info.lower() or is_prime or (price and price >= 499):
            delivery_fee = 0.0
        else:
            fee_m = re.search(r"(?:delivery\s*(?:fee|charge|at)?\s*₹?\s*([0-9]+))", delivery_info, re.IGNORECASE)
            if fee_m:
                delivery_fee = float(fee_m.group(1))

    # 19. Coupons & Live Promos
    coupons = []
    coupon_el = soup.select_one("#couponBadge, label[for*='coupon'], span.promoPriceBlockMessage, span.couponLabelText")
    if coupon_el:
        c_txt = coupon_el.get_text(strip=True)
        c_amt_m = re.search(r"(?:Apply|Save)\s*₹\s*([0-9,]+)", c_txt, re.IGNORECASE)
        c_pct_m = re.search(r"([0-9]+)%\s*coupon", c_txt, re.IGNORECASE)
        discount_amt = 0.0
        if c_amt_m:
            discount_amt = float(c_amt_m.group(1).replace(",", ""))
        elif c_pct_m and price:
            discount_amt = round(price * (float(c_pct_m.group(1)) / 100.0), 2)
        if discount_amt > 0:
            coupons.append({
                "code": "AMZCOUPON",
                "title": f"Apply ₹{int(discount_amt):,} Coupon on Amazon",
                "discount": discount_amt,
                "terms": "Apply coupon checkbox on checkout",
                "store": "Amazon",
            })



    # 20. Real Verified Buyer Reviews
    top_reviews = []
    review_els = soup.select("#cm-cr-dp-review-list div[data-hook='review'], div[data-hook='review']")[:5]
    for rel in review_els:
        author_el = rel.select_one(".a-profile-name")
        star_el = rel.select_one("i[data-hook='review-star-rating'] span.a-icon-alt, .a-icon-alt")
        title_r_el = rel.select_one("[data-hook='review-title'] span, [data-hook='review-title']")
        body_el = rel.select_one("[data-hook='review-body'] span, [data-hook='review-body']")
        date_el = rel.select_one("[data-hook='review-date']")
        
        r_author = author_el.get_text(strip=True) if author_el else "Amazon Shopper"
        r_rating = 5.0
        if star_el:
            s_m = re.search(r"([0-9.]+)\s*out of 5", star_el.get_text())
            if s_m:
                r_rating = float(s_m.group(1))
        r_title = title_r_el.get_text(strip=True) if title_r_el else "Verified Product Review"
        r_body = body_el.get_text(strip=True) if body_el else ""
        r_date = date_el.get_text(strip=True) if date_el else "Recent"
        r_verified = "Verified Purchase" in rel.get_text()

        if r_body and len(r_body) > 15:
            top_reviews.append({
                "author": r_author,
                "rating": r_rating,
                "title": r_title,
                "content": r_body[:280] + ("..." if len(r_body) > 280 else ""),
                "date": r_date,
                "verified": r_verified,
            })

    # 21. Rating Breakdown (Histogram)
    rating_breakdown = {}
    hist_table = soup.find("table", {"id": "histogramTable"})
    if hist_table:
        for row in hist_table.find_all("tr"):
            row_txt = row.get_text()
            star_m = re.search(r"([1-5])\s*star", row_txt, re.IGNORECASE)
            pct_m = re.search(r"([0-9]+)%", row_txt)
            if star_m and pct_m:
                rating_breakdown[star_m.group(1)] = int(pct_m.group(1))
    # 22. Pros & Cons (Derived strictly from extracted features)
    pros = [b[:100] for b in feature_bullets[:3]] if feature_bullets else []
    cons = []

    # Contextual fallbacks
    t_lower = title.lower()
    if not category:
        if "fryer" in t_lower:
            category = "Small Kitchen Appliances"
        elif "carpet" in t_lower or "rug" in t_lower:
            category = "Home & Decor"
        elif "headphone" in t_lower or "earphone" in t_lower:
            category = "Audio"
        elif "watch" in t_lower:
            category = "Wearables"
        elif "phone" in t_lower or "mobile" in t_lower:
            category = "Smartphones"
        elif "laptop" in t_lower:
            category = "Computers"
        else:
            category = "Electronics"

    return ExtractedProduct(
        merchant="Amazon",
        merchant_product_id=resolved.product_id,
        clean_url=resolved.clean_url,
        title=title,
        price=price,
        mrp=mrp,
        currency="INR",
        brand=brand,
        category=category,
        in_stock=in_stock,
        image_url=image_url,
        images=images if images else None,
        rating=rating,
        ratings_count=ratings_count,
        bought_past_month=bought_past_month,
        badge=badge,
        highlight_tag=highlight_tag,
        specifications=specifications if specifications else None,
        seller_name=seller_name,
        delivery_info=delivery_info,
        feature_bullets=feature_bullets if feature_bullets else None,
        return_policy=return_policy,
        is_prime=is_prime,
        is_f_assured=False,
        delivery_fee=delivery_fee,
        coupons=coupons if coupons else None,
        top_reviews=top_reviews if top_reviews else None,
        rating_breakdown=rating_breakdown,
        pros=pros,
        cons=cons,
    )


def extract_flipkart_data(resolved: ResolvedURL, timeout: float = 15.0) -> ExtractedProduct:
    """
    Extracts live metadata and pricing for a Flipkart product.
    Uses mobile browser profile to bypass Flipkart bot checks cleanly.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
            "Version/17.5 Mobile/15E148 Safari/604.1"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.google.com/",
    }

    resp = httpx.get(resolved.clean_url, headers=headers, follow_redirects=True, timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"Flipkart responded with HTTP status {resp.status_code}")

    soup = BeautifulSoup(resp.text, "html.parser")

    title = None
    price = None
    in_stock = True
    image_url = None
    brand = None

    # 1. First parse structured JSON-LD (most reliable on Flipkart)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and "offers" in item:
                    title = item.get("name")
                    offers = item["offers"]
                    if isinstance(offers, dict):
                        price = _clean_number(str(offers.get("price")))
                        avail = str(offers.get("availability", ""))
                        if "OutOfStock" in avail:
                            in_stock = False
                    if "image" in item:
                        img = item.get("image")
                        image_url = img[0] if isinstance(img, list) and img else (img if isinstance(img, str) else None)
                    if "brand" in item:
                        b = item.get("brand")
                        brand = b.get("name") if isinstance(b, dict) else str(b)
                    break
        except Exception:
            continue

    # 2. DOM fallbacks
    if not title:
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text(strip=True)

    if not price:
        price_div = soup.find("div", class_=re.compile(r"Nx9bqj|_30jeq3"))
        if price_div:
            price = _clean_number(price_div.get_text(strip=True))

    if not title:
        title = f"Flipkart Product {resolved.product_id}"

    if price is None:
        raise ValueError(f"Could not extract current price for Flipkart product {resolved.product_id}")

    # 3. MRP extraction
    mrp = None
    mrp_div = soup.find("div", class_=re.compile(r"yRaY8j|_3I9_wc"))
    if mrp_div:
        mrp = _clean_number(mrp_div.get_text(strip=True))

    # If MRP not found in DOM, check regex in embedded page state
    if not mrp:
        mrp_matches = re.findall(r'"(?:strikeOffPrice|mrp|maximumRetailPrice)":\s*([0-9]+)', resp.text)
        if mrp_matches:
            candidates = [float(m) for m in mrp_matches if float(m) >= price]
            if candidates:
                mrp = max(candidates)

    # Multiple images from JSON-LD and DOM
    images = []
    if image_url:
        images.append(image_url)
    # Extract additional images from JSON-LD image arrays
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and "image" in item:
                    img_list = item["image"] if isinstance(item["image"], list) else [item["image"]]
                    for img in img_list:
                        if isinstance(img, str) and img not in images:
                            images.append(img)
        except Exception:
            continue
    # DOM image fallback
    for img_tag in soup.select("img[src*='rukminim']"):
        src = img_tag.get("src", "")
        # Convert to high-res
        full = re.sub(r"/\d+/\d+/", "/832/832/", src)
        if full and full not in images:
            images.append(full)
    images = images[:6]

    # Rating & Reviews extraction for Flipkart
    rating = None
    ratings_count = None

    # 1. From JSON-LD aggregateRating (most reliable and verified on Flipkart)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and "aggregateRating" in item:
                    agg = item["aggregateRating"]
                    if isinstance(agg, dict):
                        if "ratingValue" in agg:
                            try:
                                rating = float(agg["ratingValue"])
                            except Exception:
                                pass
                        rc = agg.get("ratingCount") or agg.get("reviewCount")
                        if rc:
                            ratings_count = f"{int(rc):,}"
                        break
        except Exception:
            continue

    # DOM fallback for rating
    if rating is None:
        rating_div = soup.find("div", class_=re.compile(r"_3LWZlK|XQDdHH"))
        if rating_div:
            try:
                rating = float(rating_div.get_text(strip=True)[:3])
            except ValueError:
                pass

    if ratings_count is None:
        rc_span = soup.find("span", class_=re.compile(r"_2_R_DZ|Wphh3N"))
        if rc_span:
            rc_m = re.search(r"([0-9,]+)\s*Ratings?", rc_span.get_text())
            if rc_m:
                ratings_count = rc_m.group(1)

    # Specifications from Flipkart is_script embedded state
    specifications = []
    is_script = soup.find("script", id="is_script")
    content = is_script.string if is_script else ""
    if content:
        pairs = re.findall(
            r'"label_1"\s*:\s*\{"value"\s*:\s*\{"text"\s*:\s*\["([^"]+)"\]\}\}\s*,\s*"label_0"\s*:\s*\{"value"\s*:\s*\{"text"\s*:\s*"([^"]+)"\}\}',
            content,
        )
        seen_keys = set()
        for val, key in pairs:
            clean_k = key.strip()
            clean_v = val.strip()
            if clean_k and clean_v and clean_k not in seen_keys and len(clean_k) < 60:
                specifications.append({"key": clean_k, "value": clean_v})
                seen_keys.add(clean_k)

    if not specifications:
        spec_matches = re.findall(r'"key"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]+)"', resp.text)
        seen_keys = set()
        for key, val in spec_matches:
            clean_key = key.strip()
            clean_val = val.strip()
            if clean_key and clean_val and clean_key not in seen_keys and len(clean_key) < 60:
                specifications.append({"key": clean_key, "value": clean_val})
                seen_keys.add(clean_key)
    specifications = specifications[:30]


    # Seller extraction
    seller_name = None
    seller_div = soup.find("div", class_=re.compile(r"_1RLviB|_3v1-wB"))
    if seller_div:
        seller_a = seller_div.find("a") or seller_div.find("span")
        if seller_a:
            seller_name = seller_a.get_text(strip=True)
    if not seller_name:
        s_match = re.search(r'"sellerName"\s*:\s*"([^"]+)"', resp.text)
        if s_match:
            seller_name = s_match.group(1)

    # Delivery info
    delivery_info = None
    delivery_div = soup.find("div", class_=re.compile(r"_3XINqE|_1dVbu9"))
    if delivery_div:
        delivery_info = delivery_div.get_text(strip=True)
        delivery_info = re.sub(r"\s+", " ", delivery_info).strip()[:80]
    if not delivery_info:
        d_match = re.search(r'"deliveryText"\s*:\s*"([^"]+)"', resp.text)
        if d_match:
            delivery_info = d_match.group(1)

    # Feature bullets from highlights
    feature_bullets = []
    highlights_div = soup.find("div", class_=re.compile(r"_2418kt|xFVion"))
    if highlights_div:
        for li in highlights_div.find_all("li"):
            txt = li.get_text(strip=True)
            if txt:
                feature_bullets.append(txt)
    feature_bullets = feature_bullets[:8]

    t_lower = title.lower() if title else ""
    category = "Electronics"
    highlight_tag = None
    if feature_bullets:
        for candidate in ["Turbo", "Bass", "AMOLED", "Retina", "120Hz", "Fast Charge", "Wireless", "Water Resistant"]:
            if candidate.lower() in feature_bullets[0].lower():
                highlight_tag = candidate
                break

    bought_past_month = None
    badge = None
    if soup.select_one("img[src*='fa_'], img[alt*='Assured'], span._310pe4"):
        badge = "Flipkart Assured"


    # 17. Return Policy
    return_policy = None
    ret_match = re.search(r"(\d+\s*Days?\s*(?:Replacement|Return|Exchange)|Non-Returnable)", resp.text, re.IGNORECASE)
    if ret_match:
        return_policy = ret_match.group(1).title()
    else:
        return_policy = "7 Days Replacement"

    # 18. Flipkart Assured & Delivery Fee
    is_f_assured = bool(
        badge == "Flipkart Assured"
        or soup.select_one("img[src*='fa_'], img[alt*='Assured'], span._310pe4")
    )
    delivery_fee = 0.0
    if delivery_info:
        if "free" in delivery_info.lower() or is_f_assured or (price and price >= 500):
            delivery_fee = 0.0
        else:
            fee_m = re.search(r"(?:delivery\s*(?:fee|charge|at)?\s*₹?\s*([0-9]+))", delivery_info, re.IGNORECASE)
            if fee_m:
                delivery_fee = float(fee_m.group(1))

    # 19. Flipkart Live Coupons & Bank Promos
    coupons = []


    # Available offers from DOM
    offer_items = soup.select("li._16eBzU, span._3j4Gjq, div.WT_or7")[:4]
    for oi in offer_items:
        o_txt = oi.get_text(strip=True)
        if any(w in o_txt.lower() for w in ("bank", "off", "discount", "special price")):
            c_m = re.search(r"(?:₹\s*([0-9,]+)|([0-9]+)%\s*off)", o_txt, re.IGNORECASE)
            d_amt = 0.0
            if c_m:
                if c_m.group(1):
                    d_amt = float(c_m.group(1).replace(",", ""))
                elif c_m.group(2) and price:
                    d_amt = round(price * (float(c_m.group(2)) / 100.0), 2)
            coupons.append({
                "code": "FLIPKARTDEAL",
                "title": o_txt[:70] + ("..." if len(o_txt) > 70 else ""),
                "discount": d_amt,
                "terms": "Applied automatically at checkout",
                "store": "Flipkart",
            })

    # 20. Real Verified Buyer Reviews
    top_reviews = []
    review_cards = soup.select("div._16PBlm, div._2wzgFH, div.EPCmJX")[:5]
    for rc in review_cards:
        author_el = rc.select_one("p._2sc7ZR, span._2V5rqZ")
        star_el = rc.select_one("div._3LWZlK, div.XQDdHH")
        title_r_el = rc.select_one("p._2-N8zT, div._2-N8zT")
        body_el = rc.select_one("div.t-ZTKy div, div._6K-7Co")
        date_el = rc.select_one("p._2mcBHG")
        
        r_author = author_el.get_text(strip=True) if author_el else "Flipkart Customer"
        r_rating = 5.0
        if star_el:
            try:
                r_rating = float(star_el.get_text(strip=True)[:3])
            except ValueError:
                pass
        r_title = title_r_el.get_text(strip=True) if title_r_el else "Certified Purchase"
        r_body = body_el.get_text(strip=True) if body_el else ""
        r_date = date_el.get_text(strip=True) if date_el else "Recent"
        r_verified = "Certified Buyer" in rc.get_text()

        if r_body and len(r_body) > 15:
            top_reviews.append({
                "author": r_author,
                "rating": r_rating,
                "title": r_title,
                "content": r_body[:280] + ("..." if len(r_body) > 280 else ""),
                "date": r_date,
                "verified": r_verified,
            })

    # 21. Rating Breakdown (keep only if real histogram is extracted)
    rating_breakdown = {}

    # 22. Pros & Cons (Derived strictly from extracted features)
    pros = [b[:100] for b in feature_bullets[:3]] if feature_bullets else []
    cons = []

    return ExtractedProduct(
        merchant="Flipkart",
        merchant_product_id=resolved.product_id,
        clean_url=resolved.clean_url,
        title=title,
        price=price,
        mrp=mrp,
        currency="INR",
        brand=brand,
        category=category,
        in_stock=in_stock,
        image_url=image_url,
        images=images if images else None,
        rating=rating,
        ratings_count=ratings_count,
        bought_past_month=bought_past_month,
        badge=badge,
        highlight_tag=highlight_tag,
        specifications=specifications if specifications else None,
        seller_name=seller_name,
        delivery_info=delivery_info,
        feature_bullets=feature_bullets if feature_bullets else None,
        return_policy=return_policy,
        is_prime=False,
        is_f_assured=is_f_assured,
        delivery_fee=delivery_fee,
        coupons=coupons if coupons else None,
        top_reviews=top_reviews if top_reviews else None,
        rating_breakdown=rating_breakdown,
        pros=pros,
        cons=cons,
    )


from typing import Optional, Union


def extract_product_data(target: Union[str, ResolvedURL]) -> ExtractedProduct:
    """
    Unified entry point: takes any Amazon or Flipkart URL (including shortlinks)
    or a pre-resolved ResolvedURL, and extracts structured metadata.
    """
    resolved = target if isinstance(target, ResolvedURL) else resolve_product_url(target)
    if resolved.merchant == "Amazon":
        return extract_amazon_data(resolved)
    elif resolved.merchant == "Flipkart":
        return extract_flipkart_data(resolved)
    else:
        raise ValueError(f"Unsupported merchant: {resolved.merchant}")
