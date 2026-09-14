"""
DealSense Cross-Store Competitor Matcher.
Unofficial Amazon & Flipkart HTML search scraping has been removed.
Matches competitor products against the local canonical database and verified catalog.
"""

import re
from dataclasses import dataclass
from typing import Optional

from sqlmodel import select

from backend.config import build_affiliate_url
from backend.database import get_session
from backend.models import Product, MerchantListing, PriceObservation


@dataclass
class CompetitorComparison:
    matched: bool
    rival_merchant: Optional[str] = None
    rival_product_id: Optional[str] = None
    rival_title: Optional[str] = None
    rival_price: Optional[float] = None
    rival_clean_url: Optional[str] = None
    rival_affiliate_url: Optional[str] = None
    price_difference: Optional[float] = None  # positive if rival is cheaper, negative if rival is more expensive
    recommendation: Optional[str] = None
    rival_rating: Optional[float] = None
    rival_ratings_count: Optional[str] = None
    rival_in_stock: bool = True
    rival_delivery: str = "FREE"


# Noise words to filter out during matching
STOP_WORDS = {
    "online", "best", "price", "offers", "india", "buy", "with", "for", "and",
    "the", "pack", "set", "new", "original", "latest", "genuine", "deal"
}

# Accessory keywords to prevent matching an item with its accessories
ACCESSORY_KEYWORDS = {
    "case", "cover", "protector", "tempered", "pouch", "strap", "sleeve",
    "cable", "adapter", "charger", "filter", "paper", "holder", "skin",
    "silicone protector", "dust cover", "keycaps", "wrist rest"
}

KNOWN_BRANDS = {
    "logitech", "apple", "samsung", "sony", "hp", "dell", "lenovo", "asus", "acer",
    "zebronics", "portronics", "boat", "noise", "boult", "fire-boltt", "realme",
    "xiaomi", "redmi", "oneplus", "oppo", "vivo", "motorola", "moto", "infinix",
    "philips", "panasonic", "lg", "havells", "bajaj", "prestige", "pigeon",
    "milton", "butterfly", "cosmic byte", "spinbot", "kreo", "ambrane"
}


def _tokenize(text: str) -> set:
    """Normalizes string into a set of lower-case alphanumeric tokens."""
    tokens = set(re.findall(r"[a-z0-9]+", text.lower()))
    return {t for t in tokens if len(t) > 1 and t not in STOP_WORDS}


def _detect_brand(title: str, explicit_brand: Optional[str] = None) -> Optional[str]:
    """Detects brand from explicit metadata or title tokens."""
    if explicit_brand and explicit_brand.strip():
        return explicit_brand.strip().lower()
    t_lower = title.lower()
    for b in KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(b)}\b", t_lower):
            return b
    return None


def _is_brand_conflict(source_brand: Optional[str], candidate_title: str) -> bool:
    """
    Rejects candidate if candidate belongs to a conflicting major brand
    (e.g., source is Logitech, candidate is HP K120 or Zebronics).
    """
    if not source_brand:
        return False
    sb = source_brand.lower()
    c_lower = candidate_title.lower()
    for b in KNOWN_BRANDS:
        if b != sb and re.search(rf"\b{re.escape(b)}\b", c_lower):
            if not re.search(rf"\b{re.escape(sb)}\b", c_lower):
                return True
    return False


def _is_combo_mismatch(source_title: str, candidate_title: str) -> bool:
    """
    Detects mismatch between standalone product vs combo/bundle packs
    (e.g., Logitech K120 keyboard vs Logitech MK120 Keyboard+Mouse Combo).
    """
    s_lower = source_title.lower()
    c_lower = candidate_title.lower()
    combo_keywords = {"combo", "keyboard and mouse", "keyboard & mouse", "bundle", "2 in 1", "2-in-1"}
    s_is_combo = any(k in s_lower for k in combo_keywords)
    c_is_combo = any(k in c_lower for k in combo_keywords)
    return s_is_combo != c_is_combo


def _extract_model_codes(title: str) -> set:
    """
    Extracts high-signal alphanumeric model codes (e.g., 'K120', 'MK270', 'G213', 'WH-1000XM5').
    Filters out common storage, refresh rate, and resolution units.
    """
    ignore_units = {
        "128gb", "256gb", "512gb", "64gb", "1tb", "2tb", "4k", "1080p",
        "60hz", "120hz", "144hz", "usb2", "usb3", "gen1", "gen2", "ddr4", "ddr5"
    }
    matches = re.findall(r"\b[A-Za-z]{1,4}[0-9]{2,5}[A-Za-z0-9]*\b|\b[A-Za-z0-9]+-[A-Za-z0-9]+\b", title.lower())
    return {m for m in matches if m not in ignore_units and len(m) >= 3}


def _verify_rival_listing(clean_url: str, timeout: float = 6.0) -> Optional[dict]:
    """
    Directly navigates to the rival product page link to scrape the live buy-box price,
    seller availability, rating, and review count.
    """
    if not clean_url:
        return None
    try:
        from backend.extractor import extract_product_data
        prod = extract_product_data(clean_url)
        if prod and prod.price and prod.price > 0:
            return {
                "price": prod.price,
                "mrp": prod.mrp,
                "title": prod.title,
                "rating": prod.rating,
                "ratings_count": prod.ratings_count,
                "in_stock": prod.in_stock,
                "delivery_fee": prod.delivery_fee,
            }
    except Exception:
        pass
    return None


def _is_accessory_mismatch(source_title: str, candidate_title: str) -> bool:
    """Rejects candidate if candidate is an accessory while source product is not."""
    source_tokens = set(re.findall(r"[a-z]+", source_title.lower()))
    candidate_tokens = set(re.findall(r"[a-z]+", candidate_title.lower()))

    source_is_accessory = bool(source_tokens & ACCESSORY_KEYWORDS)
    candidate_is_accessory = bool(candidate_tokens & ACCESSORY_KEYWORDS)

    if not source_is_accessory and candidate_is_accessory:
        return True
    return False


def build_search_query(title: str, brand: Optional[str] = None) -> str:
    """Extracts concise search keywords (brand + model/key nouns) from product title."""
    model_matches = re.findall(r"\b[A-Za-z0-9]+-[A-Za-z0-9]+\b|\b[A-Za-z]{1,4}[0-9]{2,5}[A-Za-z0-9/]*\b", title)
    clean = re.sub(r"[^a-zA-Z0-9\s-]", " ", title)
    words = [w for w in clean.split() if w.lower() not in STOP_WORDS][:6]

    query_parts = []
    if brand and brand.lower() not in " ".join(words).lower():
        query_parts.append(brand)

    query_parts.extend(words[:4])
    if model_matches and model_matches[0] not in query_parts:
        query_parts.append(model_matches[0])

    return " ".join(query_parts).strip()


def search_flipkart_live(query: str, timeout_seconds: int = 4) -> list:
    """
    Queries Flipkart search endpoint using stealth TLS impersonation (curl_cffi).
    Extracts top product cards with clean PIDs, titles, prices, and ratings.
    """
    if not query or not query.strip():
        return []

    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    html_text = ""
    try:
        from curl_cffi import requests as cffi_requests
        from urllib.parse import quote_plus
        url = f"https://www.flipkart.com/search?q={quote_plus(query.strip())}"
        session = cffi_requests.Session(impersonate="chrome124")
        resp = session.get(url, headers=headers, timeout=timeout_seconds)
        if resp.status_code == 200 and "Robot Check" not in resp.text:
            html_text = resp.text
    except Exception:
        pass

    if not html_text:
        try:
            import httpx
            from urllib.parse import quote_plus
            url = f"https://www.flipkart.com/search?q={quote_plus(query.strip())}"
            with httpx.Client(timeout=timeout_seconds, headers=headers, follow_redirects=True) as client:
                r = client.get(url)
                if r.status_code == 200:
                    html_text = r.text
        except Exception:
            pass

    if not html_text:
        return []

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")
    items = []
    seen_pids = set()

    for a in soup.find_all("a", href=re.compile(r"/p/itm[a-zA-Z0-9]+")):
        href = a.get("href", "")
        pid_match = re.search(r"/p/(itm[a-zA-Z0-9]+)", href)
        if not pid_match:
            continue
        pid = pid_match.group(1)
        if pid in seen_pids:
            continue
        seen_pids.add(pid)

        # Title resolution
        title = None
        for sel in ["div.KzDlHZ", "div._4rR01T", "a.wjcEIp", "div.wjcEIp", "div.s1Q9rs"]:
            t_el = a.select_one(sel)
            if t_el and len(t_el.get_text(strip=True)) > 5:
                title = t_el.get_text(strip=True)
                break

        if not title:
            img = a.find("img", alt=True)
            if img and len(img["alt"]) > 5:
                title = img["alt"].strip()

        card = a.find_parent("div", attrs={"data-id": True}) or a.find_parent("div", class_=re.compile(r"row|col"))
        if not title and card:
            t_el = card.find(class_=re.compile(r"(KzDlHZ|_4rR01T|wjcEIp|s1Q9rs)"))
            if t_el:
                title = t_el.get_text(strip=True)

        # Price resolution
        price = None
        scope = card if card else a
        price_el = scope.find(string=re.compile(r"₹\s*[\d,]+"))
        if price_el:
            m = re.search(r"₹\s*([\d,]+)", str(price_el))
            if m:
                try:
                    price = float(m.group(1).replace(",", ""))
                except ValueError:
                    pass

        # Rating resolution
        rating = None
        rating_el = scope.find(class_=re.compile(r"(XQDdHH|_3LWZlK)"))
        if rating_el:
            try:
                m = re.search(r"(\d+\.?\d*)", rating_el.get_text())
                if m:
                    rating = float(m.group(1))
            except ValueError:
                pass

        actual_pid_m = re.search(r"[?&]pid=([A-Z0-9]+)", href)
        clean_url = f"https://www.flipkart.com/product/p/{pid}"
        if actual_pid_m:
            clean_url += f"?pid={actual_pid_m.group(1)}"
        if title and price:
            items.append({
                "product_id": pid,
                "title": title,
                "price": price,
                "rating": rating,
                "ratings_count": None,
                "clean_url": clean_url,
                "in_stock": True,
            })

    return items


def search_amazon_live(query: str, timeout_seconds: int = 4) -> list:
    """
    Queries Amazon India search endpoint using stealth TLS impersonation (curl_cffi).
    Extracts top product cards with clean ASINs, titles, prices, and ratings.
    """
    if not query or not query.strip():
        return []

    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    html_text = ""
    try:
        from curl_cffi import requests as cffi_requests
        from urllib.parse import quote_plus
        url = f"https://www.amazon.in/s?k={quote_plus(query.strip())}"
        session = cffi_requests.Session(impersonate="chrome124")
        resp = session.get(url, headers=headers, timeout=timeout_seconds)
        if resp.status_code == 200 and "Robot Check" not in resp.text:
            html_text = resp.text
    except Exception:
        pass

    if not html_text:
        try:
            import httpx
            from urllib.parse import quote_plus
            url = f"https://www.amazon.in/s?k={quote_plus(query.strip())}"
            with httpx.Client(timeout=timeout_seconds, headers=headers, follow_redirects=True) as client:
                r = client.get(url)
                if r.status_code == 200 and "Robot Check" not in r.text:
                    html_text = r.text
        except Exception:
            pass

    if not html_text:
        return []

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "html.parser")
    items = []
    seen_asins = set()

    cards = soup.find_all("div", attrs={"data-component-type": "s-search-result"})
    for card in cards:
        asin = card.get("data-asin", "").strip()
        if not asin or asin in seen_asins:
            continue
        seen_asins.add(asin)

        # Title: h2 text
        title_el = card.find("h2")
        title = title_el.get_text(strip=True) if title_el else None

        # Price: span.a-price span.a-offscreen
        price = None
        price_el = card.find("span", class_="a-offscreen")
        if price_el:
            price_txt = re.sub(r"[^\d.]", "", price_el.get_text())
            if price_txt:
                try:
                    price = float(price_txt)
                except ValueError:
                    pass

        # Rating
        rating = None
        rating_el = card.find("span", class_="a-icon-alt")
        if rating_el:
            m = re.search(r"(\d+\.?\d*)", rating_el.get_text())
            if m:
                try:
                    rating = float(m.group(1))
                except ValueError:
                    pass

        clean_url = f"https://www.amazon.in/dp/{asin}"
        if title and price:
            items.append({
                "product_id": asin,
                "title": title,
                "price": price,
                "rating": rating,
                "ratings_count": None,
                "clean_url": clean_url,
                "in_stock": True,
            })

    return items


def find_rival_store_match(
    current_merchant: str,
    source_title: str,
    current_price: float,
    brand: Optional[str] = None,
    live_search: bool = True,
    verify_live_price: bool = True,
    timeout_seconds: int = 4,
) -> CompetitorComparison:
    """
    Finds matching competitor listing on the rival merchant:
    1. Checks local SQLite database for already mapped competitor records.
    2. If not found or low confidence, triggers live stealth search via curl_cffi on the rival store.
    3. Ranks candidates using token overlap, variant alignment, and anti-accessory filters.
    """
    is_amazon_primary = "amazon" in current_merchant.lower()
    rival_merchant = "Flipkart" if is_amazon_primary else "Amazon"
    source_tokens = _tokenize(source_title)
    detected_brand = _detect_brand(source_title, brand)
    if detected_brand:
        source_tokens.add(detected_brand)

    source_model_codes = _extract_model_codes(source_title)

    best_match = None
    best_score = 0.0

    # 1. Local Database Search
    try:
        with get_session() as session:
            rival_listings = session.exec(
                select(MerchantListing).where(
                    MerchantListing.merchant.ilike(f"%{rival_merchant}%"),
                    MerchantListing.active == True,
                )
            ).all()

            for listing in rival_listings:
                prod = session.get(Product, listing.product_id) if listing.product_id else None
                cand_title = listing.title_at_merchant or (prod.canonical_title if prod else "")
                if not cand_title or _is_accessory_mismatch(source_title, cand_title):
                    continue

                if _is_brand_conflict(detected_brand, cand_title):
                    continue

                if _is_combo_mismatch(source_title, cand_title):
                    continue

                cand_tokens = _tokenize(cand_title)
                if not cand_tokens:
                    continue

                intersection = source_tokens & cand_tokens
                score = len(intersection) / max(len(source_tokens), 1)

                cand_model_codes = _extract_model_codes(cand_title)
                if source_model_codes and cand_model_codes:
                    if source_model_codes & cand_model_codes:
                        score += 0.35  # Exact model match bonus
                    else:
                        score -= 0.40  # Conflicting model penalty

                if score > best_score and score >= 0.35:
                    obs = session.exec(
                        select(PriceObservation)
                        .where(PriceObservation.listing_id == listing.id)
                        .order_by(PriceObservation.observed_at.desc())
                    ).first()
                    cand_price = obs.price if obs else listing.current_price
                    cand_rating = prod.rating if prod else None
                    cand_ratings_count = prod.ratings_count if prod else None
                    cand_in_stock = obs.in_stock if obs else True
                    best_score = score
                    best_match = (
                        listing.merchant_product_id,
                        cand_title,
                        cand_price,
                        listing.clean_url,
                        cand_rating,
                        cand_ratings_count,
                        cand_in_stock,
                    )
    except Exception:
        pass

    # 2. Live Rival Store Stealth Search (if local match score is low or absent)
    if (not best_match or best_score < 0.55) and live_search:
        search_query = build_search_query(source_title, brand=detected_brand or brand)
        live_candidates = []
        if is_amazon_primary:
            # Search Flipkart
            live_candidates = search_flipkart_live(search_query, timeout_seconds=timeout_seconds)
        else:
            # Search Amazon
            live_candidates = search_amazon_live(search_query, timeout_seconds=timeout_seconds)

        for cand in live_candidates:
            cand_title = cand.get("title", "")
            if not cand_title or _is_accessory_mismatch(source_title, cand_title):
                continue

            if _is_brand_conflict(detected_brand, cand_title):
                continue

            if _is_combo_mismatch(source_title, cand_title):
                continue

            cand_tokens = _tokenize(cand_title)
            if not cand_tokens:
                continue

            intersection = source_tokens & cand_tokens
            score = len(intersection) / max(len(source_tokens), 1)

            # Model code alignment
            cand_model_codes = _extract_model_codes(cand_title)
            if source_model_codes and cand_model_codes:
                if source_model_codes & cand_model_codes:
                    score += 0.35  # Exact model match bonus (e.g. K120)
                else:
                    score -= 0.40  # Different model (e.g. K270 vs K120)

            # Bonus for storage variant match (e.g. 128gb in both)
            for sz in ["64gb", "128gb", "256gb", "512gb", "1tb"]:
                if sz in source_tokens and sz in cand_tokens:
                    score += 0.15
                elif sz in source_tokens and any(other in cand_tokens for other in ["64gb", "128gb", "256gb", "512gb", "1tb"] if other != sz):
                    score -= 0.20  # Variant mismatch penalty

            if score > best_score and score >= 0.35:
                best_score = score
                best_match = (
                    cand["product_id"],
                    cand["title"],
                    cand["price"],
                    cand["clean_url"],
                    cand.get("rating"),
                    cand.get("ratings_count"),
                    cand.get("in_stock", True),
                )

    if not best_match:
        return CompetitorComparison(
            matched=False,
            rival_merchant=rival_merchant,
            recommendation=f"Not listed on {rival_merchant} / Exclusive to {current_merchant}",
        )

    cand_id, cand_title, cand_price, clean_url, cand_rating, cand_ratings_count, cand_in_stock = best_match

    # 3. Deep Page Verification: Go to the actual rival link to fetch the live buy-box price
    if clean_url and verify_live_price:
        verified = _verify_rival_listing(clean_url)
        if verified and verified.get("price"):
            cand_price = verified["price"]
            if verified.get("rating"):
                cand_rating = verified["rating"]
            if verified.get("ratings_count"):
                cand_ratings_count = verified["ratings_count"]
            if "in_stock" in verified:
                cand_in_stock = verified["in_stock"]
            if verified.get("title") and len(verified["title"]) > 10:
                cand_title = verified["title"]

    affiliate_url = build_affiliate_url(rival_merchant, clean_url)

    price_diff = None
    recommendation = None

    if cand_price is not None and cand_price > 0:
        price_diff = round(current_price - cand_price, 2)
        if price_diff > 50:
            recommendation = f"{rival_merchant} is cheaper by Rs. {price_diff:,.0f}!"
        elif price_diff < -50:
            diff_abs = abs(price_diff)
            recommendation = f"Current store ({current_merchant}) is cheaper by Rs. {diff_abs:,.0f}."
        else:
            recommendation = f"Prices are virtually identical across {current_merchant} and {rival_merchant}."
    else:
        recommendation = f"Matching item found on {rival_merchant}."

    return CompetitorComparison(
        matched=True,
        rival_merchant=rival_merchant,
        rival_product_id=cand_id,
        rival_title=cand_title,
        rival_price=cand_price,
        rival_clean_url=clean_url,
        rival_affiliate_url=affiliate_url,
        price_difference=price_diff,
        recommendation=recommendation,
        rival_rating=cand_rating,
        rival_ratings_count=cand_ratings_count,
        rival_in_stock=cand_in_stock,
        rival_delivery="FREE",
    )
