"""
DealSense Price Observation & Historical Analytics Service.
Manages immutable, append-only price point observations and calculates genuine historical baselines.
Zero data manufacturing.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
import statistics
from sqlmodel import Session, select

from backend.models import MerchantListing, PriceObservation, ProductVariant


@dataclass
class HistoricalPriceSummary:
    """Statistical summary of verified historical price points for a specific listing."""
    observation_count: int
    current_price: float
    mrp: Optional[float] = None
    lowest_price: Optional[float] = None
    highest_price: Optional[float] = None
    median_price: Optional[float] = None
    average_price: Optional[float] = None
    history_points: List[Dict[str, Any]] = field(default_factory=list)
    first_observed_at: Optional[datetime] = None
    last_observed_at: Optional[datetime] = None
    data_freshness_seconds: int = 0
    is_stale: bool = False
    has_sufficient_history: bool = False
    confidence: str = "LOW"  # 'HIGH' | 'MEDIUM' | 'LOW'


def record_price_observation(
    session: Session,
    listing_id: int,
    price: float,
    mrp: Optional[float] = None,
    currency: str = "INR",
    in_stock: bool = True,
    source: str = "adapter_extraction",
    observed_at: Optional[datetime] = None,
) -> PriceObservation:
    """
    Appends a new immutable price observation to SQLite.
    Never overwrites or deletes historical observations.
    """
    ts = observed_at or datetime.now(timezone.utc)

    # SQLite compatibility: ensure naive UTC or timezone-aware matching
    obs = PriceObservation(
        listing_id=listing_id,
        price=round(price, 2),
        mrp=round(mrp, 2) if mrp else None,
        currency=currency,
        in_stock=in_stock,
        source=source,
        confidence="high",
        observed_at=ts,
    )
    session.add(obs)
    session.commit()
    session.refresh(obs)
    return obs


def get_historical_price_summary(
    session: Session,
    listing_id: int,
    current_price: float,
    current_mrp: Optional[float] = None,
) -> HistoricalPriceSummary:
    """
    Calculates statistical benchmarks from genuine recorded price points.
    If 0 or 1 observation exists, honestly reports insufficient history.
    """
    stmt = (
        select(PriceObservation)
        .where(PriceObservation.listing_id == listing_id)
        .order_by(PriceObservation.observed_at.asc())
    )
    observations: List[PriceObservation] = list(session.exec(stmt).all())

    if not observations:
        now_utc = datetime.now(timezone.utc)
        return HistoricalPriceSummary(
            observation_count=0,
            current_price=current_price,
            mrp=current_mrp,
            has_sufficient_history=False,
            confidence="LOW",
            is_stale=False,
        )

    # Filter strictly positive valid prices
    valid_prices = [o.price for o in observations if o.price > 0]
    now_utc = datetime.now(timezone.utc)

    # Calculate timestamps and freshness
    latest_obs = observations[-1]
    obs_time = latest_obs.observed_at
    if obs_time.tzinfo is None:
        obs_time = obs_time.replace(tzinfo=timezone.utc)

    freshness_seconds = max(0, int((now_utc - obs_time).total_seconds()))
    is_stale = freshness_seconds > 86400  # Stale if older than 24 hours

    # Compute statistics
    lowest = min(valid_prices) if valid_prices else current_price
    highest = max(valid_prices) if valid_prices else current_price
    median = statistics.median(valid_prices) if len(valid_prices) >= 2 else valid_prices[0]
    avg = statistics.mean(valid_prices) if valid_prices else current_price

    history_points = [
        {
            "price": o.price,
            "mrp": o.mrp,
            "observed_at": o.observed_at.isoformat() if o.observed_at else None,
            "source": o.source,
            "in_stock": o.in_stock,
        }
        for o in observations
    ]

    # Calculate distinct observation dates (YYYY-MM-DD)
    distinct_dates = set()
    for o in observations:
        if o.observed_at:
            if hasattr(o.observed_at, "date"):
                distinct_dates.add(o.observed_at.date())
            else:
                distinct_dates.add(str(o.observed_at)[:10])

    # History Requirement: Must have >= 3 valid observations spanning across distinct days
    has_sufficient = len(valid_prices) >= 3 and len(distinct_dates) >= 2

    # Determine confidence level based on data density & freshness
    if len(valid_prices) >= 10 and len(distinct_dates) >= 7 and not is_stale:
        confidence = "HIGH"
    elif len(valid_prices) >= 3 and len(distinct_dates) >= 2:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return HistoricalPriceSummary(
        observation_count=len(observations),
        current_price=current_price,
        mrp=current_mrp or latest_obs.mrp,
        lowest_price=round(lowest, 2),
        highest_price=round(highest, 2),
        median_price=round(median, 2),
        average_price=round(avg, 2),
        history_points=history_points,
        first_observed_at=observations[0].observed_at,
        last_observed_at=latest_obs.observed_at,
        data_freshness_seconds=freshness_seconds,
        is_stale=is_stale,
        has_sufficient_history=has_sufficient,
        confidence=confidence,
    )
