"""
DealSense Autonomous Product Ingestion & Identity Engine.
Accepts any raw URL from supported merchants, extracts structured metadata,
normalizes variant identity, auto-classifies taxonomy, and persists permanent
canonical product records in SQLite.
"""

from datetime import datetime, timezone
import json
import logging
import re
from typing import Optional, Tuple, Dict, Any
from urllib.parse import urlparse, unquote
import urllib.request
from sqlmodel import Session, select

from backend.models import Product, ProductVariant, MerchantListing, PriceObservation
from backend.services.merchant_adapters import adapter_registry, BaseMerchantAdapter, NormalizedURL, ExtractedProductData
from backend.services.product_identity import normalize_product_identity, clean_canonical_title, extract_variant_from_title
from backend.services.taxonomy_service import classify_and_assign_category

logger = logging.getLogger(__name__)


def _extract_title_from_url_slug(url: str) -> Optional[str]:
    """
    Recovers human-readable product title and brand from URL slugs.
    Handles Amazon, Flipkart, Tata CLiQ, Vijay Sales, and Nykaa URL structures.
    e.g. /Apple-iPhone-15-Black-128/dp/B0CHX1W1XY -> 'Apple iPhone 15 Black 128'
         /oneplus-nord-4-5g-oasis-green-256-gb/p/itm... -> 'Oneplus Nord 4 5G Oasis Green 256 GB'
    """
    try:
        parsed = urlparse(url)
        path = unquote(parsed.path)
        parts = [p.strip() for p in path.split("/") if p.strip()]

        for p in parts:
            # Avoid generic directory segments
            if p.lower() in ("dp", "gp", "product", "p", "itm", "d", "asin", "buy", "electronics", "p-mp"):
                continue
            if len(p) >= 10 and not re.match(r"^[A-Z0-9]{10}$", p) and not p.startswith("itm"):
                # Clean delimiters
                cleaned = re.sub(r"[-_+]+", " ", p).strip()
                # Remove file extensions or trailing IDs like .html or vspc-1234
                cleaned = re.sub(r"\.(?:html|htm|php).*$", "", cleaned, flags=re.IGNORECASE)
                cleaned = re.sub(r"\bvspc\s*\d+\b", "", cleaned, flags=re.IGNORECASE).strip()
                if len(cleaned.split()) >= 2:
                    return cleaned.title()
    except Exception as e:
        logger.debug(f"Error extracting slug from {url}: {e}")
    return None


def fetch_live_product_data(
    adapter: BaseMerchantAdapter,
    normalized: NormalizedURL,
    timeout_seconds: int = 10,
) -> Optional[ExtractedProductData]:
    """
    Attempts a lightweight HTTP request with browser headers to extract
    structured Schema.org JSON-LD or OpenGraph microdata.
    """
    import httpx

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.google.com/",
    }
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout_seconds, headers=headers) as client:
            resp = client.get(normalized.clean_url)
            if resp.status_code == 200:
                return adapter.extract_from_html(resp.text, normalized.clean_url, normalized.product_id)
    except Exception as e:
        logger.debug(f"Live fetch bypassed/blocked for {normalized.clean_url}: {e}")
    return None


def ingest_product_from_url(
    raw_url: str,
    session: Session,
    force_refresh: bool = False,
    session_id: Optional[str] = None,
    discovery_source: str = "USER_URL",
) -> Tuple[Optional[Product], Optional[MerchantListing], Optional[PriceObservation], str]:
    """
    Autonomous Ingestion Pipeline:
    1. Resolves and normalizes merchant URL.
    2. Checks if listing already exists in SQLite.
    3. If new, extracts title, specs, and price via JSON-LD or slug tokens.
    4. Auto-classifies or dynamically creates Category.
    5. Creates canonical Product and Variant.
    6. Creates MerchantListing and Day 1 PriceObservation.
    Returns: (product, listing, observation, status)
    """
    adapter, normalized = adapter_registry.resolve_url(raw_url.strip())
    if not adapter or not normalized:
        return None, None, None, "UNSUPPORTED_MERCHANT"

    now_utc = datetime.now(timezone.utc)

    # 1. Check if MerchantListing already exists
    existing_listing = session.exec(
        select(MerchantListing).where(
            MerchantListing.merchant_product_id == normalized.product_id,
        )
    ).first()

    existing_product = None
    if existing_listing and existing_listing.product_id:
        existing_product = session.get(Product, existing_listing.product_id)

    # If already exists and not forcing refresh, return existing listing
    if existing_listing and not force_refresh:
        latest_obs = session.exec(
            select(PriceObservation)
            .where(PriceObservation.listing_id == existing_listing.id)
            .order_by(PriceObservation.observed_at.desc())
        ).first()
        if existing_product:
            try:
                from backend.services.universe_service import record_discovery_event
                record_discovery_event(
                    product_id=existing_product.id,
                    source=discovery_source,
                    listing_id=existing_listing.id,
                    session_id=session_id,
                    session=session,
                )
            except Exception as e:
                logger.warning(f"Failed to record discovery event for existing product #{existing_product.id}: {e}")
        return existing_product, existing_listing, latest_obs, "EXISTING"

    # 2. Resilient Metadata Extraction
    # Tier 1: Deep Extractor for Amazon & Flipkart with full specs, multi-images, badges
    extracted_deep = None
    if adapter.merchant_slug in ("amazon", "flipkart"):
        try:
            from backend.extractor import extract_product_data
            extracted_deep = extract_product_data(raw_url)
        except Exception as e:
            logger.debug(f"Deep extractor failed for {raw_url}: {e}")

    live_data = None
    if not extracted_deep:
        live_data = fetch_live_product_data(adapter, normalized)

    if extracted_deep:
        title = extracted_deep.title
        price = extracted_deep.price
        mrp = extracted_deep.mrp
        brand = extracted_deep.brand
        image_url = extracted_deep.image_url
        images = extracted_deep.images
        rating = extracted_deep.rating
        ratings_count = extracted_deep.ratings_count
        bought_count = extracted_deep.bought_past_month
        badge = extracted_deep.badge
        highlight_tag = extracted_deep.highlight_tag
        specifications = extracted_deep.specifications
        seller = extracted_deep.seller_name
        delivery_info = extracted_deep.delivery_info
        in_stock = extracted_deep.in_stock
        raw_category = extracted_deep.category
        return_policy = extracted_deep.return_policy
        is_prime = extracted_deep.is_prime
        is_f_assured = extracted_deep.is_f_assured
        delivery_fee = extracted_deep.delivery_fee
        coupons = extracted_deep.coupons
        top_reviews = extracted_deep.top_reviews
        rating_breakdown = extracted_deep.rating_breakdown
        pros = extracted_deep.pros
        cons = extracted_deep.cons
        data_source = "deep_scraper"
    else:
        title = live_data.title if live_data and live_data.title else None
        price = live_data.price if live_data and live_data.price else None
        mrp = live_data.mrp if live_data and live_data.mrp else None
        brand = live_data.brand if live_data and live_data.brand else None
        image_url = live_data.image_url if live_data and live_data.image_url else None
        images = [image_url] if image_url else None
        rating = None
        ratings_count = None
        bought_count = None
        badge = None
        highlight_tag = None
        specifications = None
        seller = live_data.seller if live_data else None
        delivery_info = None
        in_stock = live_data.in_stock if live_data else True
        raw_category = live_data.category if live_data else None
        return_policy = "7 Days Replacement"
        is_prime = False
        is_f_assured = False
        delivery_fee = 0.0
        coupons = None
        top_reviews = None
        rating_breakdown = None
        pros = None
        cons = None
        data_source = live_data.extraction_source if live_data else "url_slug_registration"

    # Fallback to URL Slug Token Extraction if live HTML blocked
    if not title:
        slug_title = _extract_title_from_url_slug(raw_url)
        if slug_title:
            title = slug_title
        else:
            title = f"{adapter.merchant_name} Product ({normalized.product_id})"

    # Clean title and isolate variant attributes
    canonical_title = clean_canonical_title(title)
    variant_info = extract_variant_from_title(title)
    norm_identity = normalize_product_identity(raw_title=canonical_title, brand=brand)

    # 3. Dynamic Category Assignment / Auto-Creation
    cat_id, cat_name = classify_and_assign_category(
        session=session,
        title=canonical_title,
        brand=norm_identity.brand,
        raw_category=raw_category,
    )

    # 4. Check if Canonical Product already exists by id or title
    product = existing_product
    if not product:
        product = session.exec(
            select(Product).where(Product.canonical_title.ilike(canonical_title))
        ).first()

    images_json_str = json.dumps(images) if images else None
    specs_json_str = json.dumps(specifications) if specifications else None
    reviews_json_str = json.dumps(top_reviews) if top_reviews else None
    breakdown_json_str = json.dumps(rating_breakdown) if rating_breakdown else None
    pros_json_str = json.dumps(pros) if pros else None
    cons_json_str = json.dumps(cons) if cons else None

    if not product:
        product = Product(
            canonical_title=canonical_title,
            canonical_slug=norm_identity.canonical_title.lower().replace(" ", "-"),
            brand=norm_identity.brand,
            category_id=cat_id,
            category=cat_name,
            image_url=image_url or "/assets/placeholder-product.png",
            images_json=images_json_str,
            rating=rating,
            ratings_count=ratings_count,
            bought_count=bought_count,
            badge=badge,
            highlight_tag=highlight_tag,
            specifications_json=specs_json_str,
            return_policy=return_policy,
            reviews_json=reviews_json_str,
            rating_breakdown_json=breakdown_json_str,
            pros_json=pros_json_str,
            cons_json=cons_json_str,
            created_at=now_utc,
        )
        session.add(product)
        session.commit()
        session.refresh(product)
        logger.info(f"Created new canonical Product #{product.id}: {product.canonical_title}")
    else:
        # Update fields if previously unlinked or empty or fresh data available
        updated = False
        if not product.category_id and cat_id:
            product.category_id = cat_id
            product.category = cat_name
            updated = True
        if images_json_str:
            product.images_json = images_json_str
            if image_url:
                product.image_url = image_url
            updated = True
        if rating is not None:
            product.rating = rating
            updated = True
        if ratings_count:
            product.ratings_count = ratings_count
            updated = True
        if bought_count:
            product.bought_count = bought_count
            updated = True
        if badge:
            product.badge = badge
            updated = True
        if highlight_tag:
            product.highlight_tag = highlight_tag
            updated = True
        if specs_json_str:
            product.specifications_json = specs_json_str
            updated = True
        if return_policy:
            product.return_policy = return_policy
            updated = True
        if reviews_json_str:
            product.reviews_json = reviews_json_str
            updated = True
        if breakdown_json_str:
            product.rating_breakdown_json = breakdown_json_str
            updated = True
        if pros_json_str:
            product.pros_json = pros_json_str
            updated = True
        if cons_json_str:
            product.cons_json = cons_json_str
            updated = True
        if updated:
            session.add(product)
            session.commit()
            session.refresh(product)

    # 5. Ensure ProductVariant exists
    variant_rec = session.exec(
        select(ProductVariant).where(
            ProductVariant.product_id == product.id,
            ProductVariant.variant_name == variant_info.variant_name,
        )
    ).first()

    if not variant_rec:
        variant_rec = ProductVariant(
            product_id=product.id,
            variant_name=variant_info.variant_name,
            storage=variant_info.storage,
            ram=variant_info.ram,
            color=variant_info.color,
            size=variant_info.size,
            created_at=now_utc,
        )
        session.add(variant_rec)
        session.commit()
        session.refresh(variant_rec)

    # 6. Create or Update MerchantListing
    coupons_json_str = json.dumps(coupons) if coupons else None
    if existing_listing:
        listing = existing_listing
        if seller:
            listing.seller = seller
            listing.seller_name = seller
        if delivery_info:
            listing.delivery_info = delivery_info
        if return_policy:
            listing.return_policy = return_policy
        if is_prime:
            listing.is_prime = is_prime
        if is_f_assured:
            listing.is_f_assured = is_f_assured
        if coupons_json_str:
            listing.coupons_json = coupons_json_str
        if delivery_fee is not None:
            listing.delivery_fee = delivery_fee
        if price is not None and price > 0:
            listing.current_price = price
        listing.last_checked_at = now_utc
        session.add(listing)
        session.commit()
        session.refresh(listing)
        logger.info(f"Updated existing MerchantListing #{listing.id} ({adapter.merchant_name}: {normalized.product_id})")
    else:
        listing = MerchantListing(
            product_id=product.id,
            variant_id=variant_rec.id,
            merchant=adapter.merchant_name,
            merchant_product_id=normalized.product_id,
            url=normalized.clean_url,
            clean_url=normalized.clean_url,
            title_at_merchant=canonical_title,
            current_price=price,
            seller=seller,
            seller_name=seller,
            delivery_info=delivery_info,
            return_policy=return_policy,
            is_prime=is_prime,
            is_f_assured=is_f_assured,
            coupons_json=coupons_json_str,
            delivery_fee=delivery_fee,
            availability="in_stock" if in_stock else "out_of_stock",
            data_source=data_source,
            source_confidence="high" if price is not None else "medium",
            last_checked_at=now_utc,
            created_at=now_utc,
        )
        session.add(listing)
        session.commit()
        session.refresh(listing)
        logger.info(f"Created new MerchantListing #{listing.id} ({adapter.merchant_name}: {normalized.product_id})")

    # 7. Record Day 1 Initial PriceObservation
    obs = None
    if price is not None and price > 0:
        obs = PriceObservation(
            listing_id=listing.id,
            price=price,
            mrp=mrp,
            currency="INR",
            in_stock=in_stock,
            source=data_source,
            confidence="high",
            observed_at=now_utc,
        )
        session.add(obs)
        session.commit()
        session.refresh(obs)
        logger.info(f"Recorded PriceObservation #{obs.id}: ₹{price}")
    elif existing_listing:
        obs = session.exec(
            select(PriceObservation)
            .where(PriceObservation.listing_id == existing_listing.id)
            .order_by(PriceObservation.observed_at.desc())
        ).first()

    if product and listing:
        try:
            from backend.services.universe_service import record_discovery_event
            product.lifecycle_status = "OBSERVING" if obs else "IDENTIFIED"
            product.last_interacted_at = now_utc
            session.add(product)
            session.commit()
            record_discovery_event(
                product_id=product.id,
                source=discovery_source,
                listing_id=listing.id,
                session_id=session_id,
                session=session,
            )
        except Exception as e:
            logger.warning(f"Failed to record discovery event for product #{product.id}: {e}")

    status_str = "UPDATED" if existing_listing else "CREATED"
    return product, listing, obs, status_str

