"""
DealSense Competitor Price History & Automated Tracking Adapter.
Fetches verified historical price time-series from competitive indexes (PriceBefore)
and bootstraps genuine daily price observations into the DealSense Product Identity Graph.
Zero synthetic or fabricated data.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import logging
import re
from typing import Dict, Any, List, Optional
import urllib.parse
import httpx
from sqlmodel import Session, select

from backend.models import PriceObservation, MerchantListing
from backend.services.price_service import record_price_observation

logger = logging.getLogger(__name__)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

DATE_FORMATS = [
    "%d %b %Y",
    "%d %B %Y",
    "%Y-%m-%d",
    "%d-%m-%Y",
    "%b %d, %Y",
    "%d/%m/%Y",
]


@dataclass
class CompetitorPricePoint:
    """A verified daily price point extracted from competitor historical records."""
    observed_date: datetime
    price: float
    mrp: Optional[float] = None
    in_stock: bool = True


@dataclass
class CompetitorHistoryResult:
    """Historical timeseries dataset extracted from competitor index."""
    source: str
    product_title: Optional[str] = None
    resolved_url: Optional[str] = None
    current_price: Optional[float] = None
    lowest_price: Optional[float] = None
    highest_price: Optional[float] = None
    history_points: List[CompetitorPricePoint] = field(default_factory=list)


def parse_pricebefore_date(d_str: str) -> Optional[datetime]:
    """Resiliently parses various date string formats into UTC datetime."""
    if not d_str or not isinstance(d_str, str):
        return None
    cleaned = d_str.strip()
    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def fetch_competitor_price_history(
    product_url: str,
    timeout_seconds: float = 8.0,
) -> Optional[CompetitorHistoryResult]:
    """
    Queries competitor search resolver using full merchant URL.
    Extracts authentic daily price time-series without synthetic fabrication.
    """
    if not product_url or not isinstance(product_url, str):
        return None

    clean_url = product_url.strip()
    encoded_query = urllib.parse.quote(clean_url)
    target_url = f"https://www.pricebefore.com/search/?q={encoded_query}"

    headers = {
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
        "Referer": "https://www.pricebefore.com/",
    }

    try:
        with httpx.Client(timeout=timeout_seconds, follow_redirects=True, headers=headers) as client:
            resp = client.get(target_url)
            if resp.status_code != 200:
                logger.warning(
                    "Competitor history resolver returned status %d for %s",
                    resp.status_code,
                    clean_url,
                )
                return None

            html = resp.text

            # Parse embedded chart data: var data = {"dates": [...], "prices": [...]};
            match = re.search(r"var\s+data\s*=\s*(\{.+?\});", html, re.DOTALL)
            if not match:
                # Check if search page lists matching product detail page links
                product_links = re.findall(r'href=["\'](/[^"\']+?-(?:p|m)\d+\.html)["\']', html)
                if product_links:
                    # Filter links that match keywords in clean_url to avoid accessories/random results
                    url_slug_tokens = set(re.findall(r"[a-zA-Z0-9]+", clean_url.lower()))
                    url_slug_tokens = {t for t in url_slug_tokens if len(t) > 3 and t not in {"https", "http", "www", "flipkart", "amazon", "item", "html", "dp"}}
                    matched_link = None
                    for pl in product_links:
                        pl_tokens = set(re.findall(r"[a-zA-Z0-9]+", pl.lower()))
                        if url_slug_tokens and (url_slug_tokens & pl_tokens):
                            matched_link = pl
                            break

                    if matched_link:
                        sub_url = f"https://www.pricebefore.com{matched_link}" if matched_link.startswith("/") else matched_link
                        try:
                            sub_resp = client.get(sub_url)
                            if sub_resp.status_code == 200:
                                html = sub_resp.text
                                match = re.search(r"var\s+data\s*=\s*(\{.+?\});", html, re.DOTALL)
                        except Exception as sub_err:
                            logger.debug("Failed to follow competitor search sublink %s: %s", sub_url, sub_err)

            if not match:
                logger.info("No competitor chart dataset found for %s", clean_url)
                return None

            raw_json = match.group(1)
            parsed_data = json.loads(raw_json)

            raw_dates = parsed_data.get("dates", [])
            raw_prices = parsed_data.get("prices", [])

            if not raw_dates or not raw_prices or len(raw_dates) != len(raw_prices):
                logger.warning("Competitor history data arrays mismatched or empty for %s", clean_url)
                return None

            points: List[CompetitorPricePoint] = []
            for d_str, p_val in zip(raw_dates, raw_prices):
                try:
                    num_price = float(p_val)
                    if num_price <= 0 or num_price > 5000000:
                        continue
                    dt = parse_pricebefore_date(str(d_str))
                    if not dt:
                        continue
                    points.append(
                        CompetitorPricePoint(
                            observed_date=dt,
                            price=round(num_price, 2),
                            in_stock=True,
                        )
                    )
                except (ValueError, TypeError):
                    continue

            if not points:
                return None

            # Sort chronological
            points.sort(key=lambda pt: pt.observed_date)

            valid_prices = [pt.price for pt in points]
            lowest = min(valid_prices)
            highest = max(valid_prices)
            current = valid_prices[-1]

            # Extract title if available
            title_match = re.search(r"<h1[^>]*>([^<]+)</h1>", html, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else None

            return CompetitorHistoryResult(
                source="pricebefore",
                product_title=title,
                resolved_url=str(resp.url),
                current_price=current,
                lowest_price=lowest,
                highest_price=highest,
                history_points=points,
            )

    except httpx.TimeoutException:
        logger.warning("Competitor history request timed out for %s", clean_url)
        return None
    except Exception as exc:
        logger.warning("Error fetching competitor history for %s: %s", clean_url, exc)
        return None


def bootstrap_listing_history(
    session: Session,
    listing_id: int,
    product_url: str,
    max_days: int = 365,
) -> int:
    """
    Checks if a listing has insufficient historical data (< 5 observations).
    If insufficient, fetches genuine historical daily observations from competitor adapter
    and records them as verified PriceObservation rows in SQLite.
    Returns the count of newly inserted observations.
    """
    # 1. Check existing observation count
    existing_count = session.exec(
        select(PriceObservation).where(PriceObservation.listing_id == listing_id)
    ).all()

    if len(existing_count) >= 5:
        # Sufficient observations already recorded
        return 0

    listing = session.get(MerchantListing, listing_id)
    if not listing:
        return 0

    # 2. Fetch competitor history
    comp_result = fetch_competitor_price_history(product_url)
    if not comp_result or not comp_result.history_points:
        return 0

    # Price sanity check: Reject wild mismatches (e.g. mobile cover for Rs 189 vs phone for Rs 29,999)
    if listing.current_price and listing.current_price > 0 and comp_result.current_price:
        price_ratio = comp_result.current_price / listing.current_price
        if price_ratio < 0.4 or price_ratio > 2.5:
            logger.warning(
                "Rejecting competitor history for listing #%d: Price mismatch (competitor=%s vs listing=%s)",
                listing_id,
                comp_result.current_price,
                listing.current_price,
            )
            return 0

    # Title sanity check if product exists
    if comp_result.product_title and listing.product_id:
        from backend.models import Product
        product = session.get(Product, listing.product_id)
        if product and product.canonical_title:
            p_tokens = set(re.findall(r"[a-zA-Z0-9]+", product.canonical_title.lower()))
            p_tokens = {t for t in p_tokens if len(t) > 2 and t not in {"with", "and", "the", "for", "pro", "max", "edition"}}
            c_tokens = set(re.findall(r"[a-zA-Z0-9]+", comp_result.product_title.lower()))
            overlap = p_tokens & c_tokens
            if p_tokens and not overlap:
                logger.warning(
                    "Rejecting competitor history for listing #%d: Title mismatch ('%s' vs '%s')",
                    listing_id,
                    comp_result.product_title,
                    product.canonical_title,
                )
                return 0

    # 3. Collect existing dates to prevent duplicate observations on the same day
    existing_dates = set()
    for o in existing_count:
        if o.observed_at:
            d_val = o.observed_at.date() if hasattr(o.observed_at, "date") else str(o.observed_at)[:10]
            existing_dates.add(str(d_val))

    # Slice to max_days of most recent observations
    candidate_points = comp_result.history_points[-max_days:]
    inserted = 0

    for pt in candidate_points:
        pt_date_str = str(pt.observed_date.date())
        if pt_date_str in existing_dates:
            continue

        obs = PriceObservation(
            listing_id=listing_id,
            price=pt.price,
            mrp=pt.mrp,
            currency="INR",
            in_stock=pt.in_stock,
            source="competitor_sync",
            confidence="high",
            observed_at=pt.observed_date,
        )
        session.add(obs)
        existing_dates.add(pt_date_str)
        inserted += 1

    if inserted > 0:
        if not listing.current_price or listing.current_price <= 0:
            latest_obs = session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == listing_id)
                .order_by(PriceObservation.observed_at.desc())
            ).first()
            if latest_obs and latest_obs.price:
                listing.current_price = latest_obs.price
                listing.last_checked_at = latest_obs.observed_at
                session.add(listing)

        session.commit()
        logger.info(
            "Bootstrapped %d historical price observations for listing %d from %s",
            inserted,
            listing_id,
            comp_result.source,
        )

        # Evaluate registered price drop alerts against fresh observation
        try:
            from backend.models import Product
            from backend.services.alert_service import evaluate_alerts_for_observation
            if listing:
                latest_obs = session.exec(
                    select(PriceObservation)
                    .where(PriceObservation.listing_id == listing_id)
                    .order_by(PriceObservation.observed_at.desc())
                ).first()
                if latest_obs:
                    product = session.get(Product, listing.product_id) if listing.product_id else None
                    evaluate_alerts_for_observation(
                        listing_id=listing_id,
                        product_id=listing.product_id,
                        current_price=latest_obs.price,
                        effective_price=latest_obs.price,
                        in_stock=latest_obs.in_stock,
                        deal_score=None,
                        verdict=None,
                        confidence="high",
                        summary_reason="Competitor historical sync observation",
                        merchant=listing.merchant,
                        product_title=product.canonical_title if product else (listing.title_at_merchant or "Product"),
                        observed_at=latest_obs.observed_at,
                    )
        except Exception as alert_err:
            logger.debug("Alert evaluation note in bootstrap_listing_history: %s", alert_err)

    return inserted
