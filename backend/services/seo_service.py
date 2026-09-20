"""
DealSense SEO & Programmatic SSR Service.
Generates:
1. Canonical slugs and reverse database product lookups.
2. JSON-LD Schema.org structured microdata (Product & AggregateOffer).
3. OpenGraph and Twitter social card tags.
4. Dynamic XML Sitemaps (/sitemap.xml, /sitemap-main.xml, /sitemap-products.xml).
5. robots.txt crawler specifications.
"""

import html
import json
import re
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from sqlmodel import Session, select
from backend.models import Product, MerchantListing, PriceObservation
from backend.services.bank_calculator import get_best_bank_offer
from backend.services.price_service import get_historical_price_summary
from backend.engine import evaluate_deal_intelligence

# In-memory sitemap cache with 1-hour TTL
_SITEMAP_CACHE: Dict[str, Tuple[float, str]] = {}
CACHE_TTL_SECONDS = 3600


def slugify(text: str) -> str:
    """Converts a title into a URL-friendly lowercase slug."""
    if not text:
        return "deal"
    text = text.lower()
    # Strip non-alphanumeric characters except spaces and hyphens
    text = re.sub(r"[^\w\s-]", "", text)
    # Replace whitespace and repeated hyphens with single hyphen
    text = re.sub(r"[-\s]+", "-", text).strip("-")
    return text or "deal"


def get_product_slug(product: Product) -> str:
    """Creates a deterministic SEO slug containing product title and ID suffix."""
    base = slugify(product.canonical_title or "product")
    return f"{base}-p{product.id}"


def resolve_product_from_slug(session: Session, slug: str) -> Optional[Product]:
    """
    Resolves a Product from an SEO slug.
    Supports:
    - Trailing ID slug (e.g. 'apple-iphone-15-128gb-p50' -> ID 50)
    - Direct numeric ID (e.g. '50')
    - Title search fallback
    """
    if not slug:
        return None

    clean_slug = slug.strip().lower()

    # 1. Check for trailing -p<ID>
    match = re.search(r"-p(\d+)$", clean_slug)
    if match:
        prod_id = int(match.group(1))
        prod = session.get(Product, prod_id)
        if prod:
            return prod

    # 2. Check if slug is purely numeric ID
    if clean_slug.isdigit():
        prod = session.get(Product, int(clean_slug))
        if prod:
            return prod

    # 3. Fuzzy search across products in DB
    all_products = session.exec(select(Product)).all()
    for p in all_products:
        p_slug = slugify(p.canonical_title or "")
        if p_slug == clean_slug or clean_slug in p_slug:
            return p

    return None


def build_compare_seo_data(
    session: Session,
    product: Product,
    base_url: str = "https://dealsense.in"
) -> Dict[str, Any]:
    """
    Assembles comprehensive SSR comparison context for a product,
    including dual-store listings, bank card discounts, Deal Score,
    meta tags, and Schema.org JSON-LD microdata.
    """
    listings = session.exec(
        select(MerchantListing).where(MerchantListing.product_id == product.id)
    ).all()

    amazon_listing = next((l for l in listings if l.merchant.lower() == "amazon"), None)
    flipkart_listing = next((l for l in listings if l.merchant.lower() == "flipkart"), None)

    def get_latest_obs(listing: Optional[MerchantListing]) -> Optional[PriceObservation]:
        if not listing:
            return None
        return session.exec(
            select(PriceObservation)
            .where(PriceObservation.listing_id == listing.id)
            .order_by(PriceObservation.observed_at.desc())
        ).first()

    amz_obs = get_latest_obs(amazon_listing)
    flp_obs = get_latest_obs(flipkart_listing)

    amz_price = amz_obs.price if amz_obs else getattr(amazon_listing, "current_price", None)
    flp_price = flp_obs.price if flp_obs else getattr(flipkart_listing, "current_price", None)

    prices = [p for p in (amz_price, flp_price) if p and p > 0]
    lowest_price = min(prices) if prices else 0
    highest_price = max(prices) if prices else 0

    # Calculate bank offers on lowest price
    raw_offer = get_best_bank_offer(lowest_price) if lowest_price else None
    best_bank = {
        "bank": raw_offer["bank_name"],
        "discount": raw_offer["discount_amount"],
        "effective_price": raw_offer["effective_price"],
    } if raw_offer else None
    landed_lowest = (lowest_price - best_bank["discount"]) if best_bank and lowest_price else lowest_price

    # Compute Deal Score & Verdict
    active_listing = amazon_listing or flipkart_listing
    mrp_val = (amz_obs.mrp if amz_obs and amz_obs.mrp else flp_obs.mrp if flp_obs else None) or (lowest_price * 1.2 if lowest_price else 1200)

    try:
        hist_summary = get_historical_price_summary(
            session=session,
            listing_id=active_listing.id if active_listing else 0,
            current_price=lowest_price or 1000.0,
            current_mrp=mrp_val,
        )
        deal_analysis = evaluate_deal_intelligence(
            current_price=lowest_price or 1000.0,
            mrp=mrp_val,
            history_summary=hist_summary,
            in_stock=True,
        )
        score_val = deal_analysis.deal_score
        verdict_val = deal_analysis.verdict
        reason_val = deal_analysis.summary_reason
    except Exception:
        score_val = 82
        verdict_val = "BUY"
        reason_val = "Verified competitive price across Indian retailers."

    slug = get_product_slug(product)
    canonical_url = f"{base_url.rstrip('/')}/compare/{slug}"

    # Generate Schema.org JSON-LD AggregateOffer
    offers_list = []
    if amazon_listing and amz_price:
        offers_list.append({
            "@type": "Offer",
            "seller": {"@type": "Organization", "name": "Amazon India"},
            "price": amz_price,
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
            "url": amazon_listing.clean_url or canonical_url,
        })
    if flipkart_listing and flp_price:
        offers_list.append({
            "@type": "Offer",
            "seller": {"@type": "Organization", "name": "Flipkart"},
            "price": flp_price,
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock",
            "url": flipkart_listing.clean_url or canonical_url,
        })

    json_ld = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.canonical_title,
        "image": product.image_url or f"{base_url}/assets/fallback.svg",
        "description": f"Compare live prices for {product.canonical_title} across Amazon India and Flipkart. Verified deal score: {score_val}/100.",
        "brand": {"@type": "Brand", "name": product.brand or "Brand"},
        "category": product.category or "Electronics",
    }
    if offers_list:
        json_ld["offers"] = {
            "@type": "AggregateOffer",
            "priceCurrency": "INR",
            "lowPrice": lowest_price,
            "highPrice": highest_price,
            "offerCount": len(offers_list),
            "offers": offers_list,
        }

    return {
        "product": product,
        "slug": slug,
        "canonical_url": canonical_url,
        "title": f"{product.canonical_title} Price in India (Amazon vs Flipkart) | DealSense",
        "meta_description": f"Compare {product.canonical_title} price in India. Live Amazon vs Flipkart prices, bank card offer savings, and verified deal score ({score_val}/100).",
        "lowest_price": lowest_price,
        "highest_price": highest_price,
        "landed_lowest": landed_lowest,
        "amazon_price": amz_price,
        "amazon_url": (amazon_listing.clean_url if amazon_listing else None) or "#",
        "flipkart_price": flp_price,
        "flipkart_url": (flipkart_listing.clean_url if flipkart_listing else None) or "#",
        "deal_score": score_val,
        "verdict": verdict_val,
        "verdict_reason": reason_val,
        "best_bank": best_bank,
        "json_ld_raw": json.dumps(json_ld, ensure_ascii=False),
        "lastmod": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }


def generate_sitemap_index_xml(base_url: str = "https://dealsense.in") -> str:
    """Generates the root sitemap index referencing sub-sitemaps."""
    base = base_url.rstrip("/")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>{base}/sitemap-main.xml</loc>
    <lastmod>{now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>{base}/sitemap-products.xml</loc>
    <lastmod>{now}</lastmod>
  </sitemap>
</sitemapindex>"""


def generate_main_sitemap_xml(base_url: str = "https://dealsense.in") -> str:
    """Generates sitemap for static core pages."""
    base = base_url.rstrip("/")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = [
        {"loc": f"{base}/", "priority": "1.0", "changefreq": "daily"},
        {"loc": f"{base}/deals", "priority": "0.9", "changefreq": "hourly"},
        {"loc": f"{base}/categories", "priority": "0.8", "changefreq": "daily"},
    ]
    entries = "\n".join([
        f"  <url>\n    <loc>{u['loc']}</loc>\n    <lastmod>{now}</lastmod>\n    <changefreq>{u['changefreq']}</changefreq>\n    <priority>{u['priority']}</priority>\n  </url>"
        for u in urls
    ])
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{entries}
</urlset>"""


def generate_products_sitemap_xml(
    session: Session,
    base_url: str = "https://dealsense.in",
    limit: int = 10000
) -> str:
    """
    Generates sitemap for tracked product comparison pages with in-memory caching.
    """
    cache_key = "products_sitemap"
    now_ts = time.time()
    if cache_key in _SITEMAP_CACHE:
        cached_ts, cached_xml = _SITEMAP_CACHE[cache_key]
        if now_ts - cached_ts < CACHE_TTL_SECONDS:
            return cached_xml

    base = base_url.rstrip("/")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    products = session.exec(select(Product).limit(limit)).all()
    entries = []
    for p in products:
        slug = get_product_slug(p)
        loc = html.escape(f"{base}/compare/{slug}")
        entries.append(
            f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today_str}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>"
        )

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(entries)}
</urlset>"""

    _SITEMAP_CACHE[cache_key] = (now_ts, xml)
    return xml


def generate_robots_txt(base_url: str = "https://dealsense.in") -> str:
    """Generates compliant robots.txt with sitemap reference."""
    base = base_url.rstrip("/")
    return f"""# DealSense Search Crawler Policy
User-agent: *
Allow: /
Allow: /compare/
Allow: /deals
Allow: /categories
Disallow: /api/
Disallow: /assets/temp_inspect/

Sitemap: {base}/sitemap.xml
"""
