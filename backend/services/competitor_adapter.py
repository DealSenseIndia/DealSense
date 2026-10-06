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
    Checks if a listing has insufficient historical data (< 3 observations).
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

    # 2. Fetch competitor history
    comp_result = fetch_competitor_price_history(product_url)
    if not comp_result or not comp_result.history_points:
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
        session.commit()
        logger.info(
            "Bootstrapped %d historical price observations for listing %d from %s",
            inserted,
            listing_id,
            comp_result.source,
        )

    return inserted
