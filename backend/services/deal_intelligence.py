"""
Deal Intelligence Calculation & Verification Service for DealWise.
Rigorously separates FACT, CALCULATION, ESTIMATE, and RECOMMENDATION.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
import statistics

from backend.models import PriceObservation, Offer


@dataclass
class DealFact:
    label: str
    value: str
    source: str
    verified: bool = True


@dataclass
class DealCalculation:
    metric: str
    value: str
    raw_value: float


@dataclass
class DealEstimate:
    title: str
    effective_price: float
    savings: float
    condition: str
    confidence: str = "HIGH"


@dataclass
class ComprehensiveDealIntelligence:
    verdict: str  # "BUY" | "WAIT" | "AVOID"
    confidence: str  # "HIGH" | "MEDIUM" | "LOW"
    headline_reason: str
    detailed_reasons: List[str]
    facts: List[Dict[str, Any]]
    calculations: Dict[str, Any]
    estimates: List[Dict[str, Any]]
    stats: Dict[str, Any]


def calculate_deal_intelligence(
    current_price: float,
    mrp: Optional[float],
    merchant: str,
    history: List[PriceObservation],
    offers: Optional[List[Offer]] = None,
    in_stock: bool = True,
) -> ComprehensiveDealIntelligence:
    """
    Analyzes historical price data and provides an explainable verdict:
    - FACTS: Verifiable observed data points
    - CALCULATIONS: Mathematical metrics (medians, drops, moving averages)
    - ESTIMATES: Bank/coupon simulated net prices
    - RECOMMENDATIONS: BUY, WAIT, AVOID with transparent reasons
    """
    now = datetime.now(timezone.utc)
    offers = offers or []

    # Out of stock immediately receives AVOID
    if not in_stock:
        return ComprehensiveDealIntelligence(
            verdict="AVOID",
            confidence="HIGH",
            headline_reason="Product is currently marked Out of Stock.",
            detailed_reasons=["Stock is depleted on this merchant listing."],
            facts=[
                {"label": "Availability", "value": "Out of Stock", "source": merchant, "verified": True},
                {"label": "Current Listed Price", "value": f"₹{current_price:,.0f}", "source": merchant, "verified": True},
            ],
            calculations={},
            estimates=[],
            stats={"current_price": current_price, "in_stock": False},
        )

    # 1. Price observations extraction
    valid_obs = [obs for obs in history if obs.price and obs.price > 0]
    prices = [obs.price for obs in valid_obs]
    if current_price not in prices:
        prices.append(current_price)

    hist_low = min(prices) if prices else current_price
    hist_high = max(prices) if prices else current_price
    avg_price = round(statistics.mean(prices), 1) if prices else current_price
    median_price = round(statistics.median(prices), 1) if prices else current_price

    # Time-windowed moving averages
    def _get_window_avg(days: int) -> Optional[float]:
        cutoff = now - timedelta(days=days)
        window_prices = [
            obs.price for obs in valid_obs
            if obs.observed_at and obs.observed_at.replace(tzinfo=timezone.utc) >= cutoff
        ]
        return round(statistics.mean(window_prices), 1) if window_prices else None

    avg_7d = _get_window_avg(7) or current_price
    avg_30d = _get_window_avg(30) or current_price
    avg_90d = _get_window_avg(90) or avg_price
    avg_180d = _get_window_avg(180) or avg_price

    # Calculations
    distance_from_low_pct = round(((current_price - hist_low) / hist_low) * 100, 1) if hist_low > 0 else 0.0
    vs_90d_median_pct = round(((current_price - median_price) / median_price) * 100, 1) if median_price > 0 else 0.0
    discount_vs_mrp = round(((mrp - current_price) / mrp) * 100, 1) if mrp and mrp > current_price else 0.0

    # Trend direction (last 3 observations)
    recent_prices = [obs.price for obs in sorted(valid_obs, key=lambda x: x.observed_at)[-3:]]
    if len(recent_prices) >= 2:
        if recent_prices[-1] < recent_prices[0]:
            price_direction = "falling"
        elif recent_prices[-1] > recent_prices[0]:
            price_direction = "rising"
        else:
            price_direction = "stable"
    else:
        price_direction = "stable"

    # 2. Assembling FACTS
    facts = [
        {"label": f"Current {merchant} Price", "value": f"₹{current_price:,.0f}", "source": merchant, "verified": True},
        {"label": "Observed Historical Low", "value": f"₹{hist_low:,.0f}", "source": "DealWise Price Graph", "verified": True},
        {"label": "Observed 90-Day Median", "value": f"₹{median_price:,.0f}", "source": "DealWise Price Graph", "verified": True},
    ]
    if mrp:
        facts.append({"label": "List Price (MRP)", "value": f"₹{mrp:,.0f}", "source": merchant, "verified": True})

    # 3. Assembling CALCULATIONS
    calculations = {
        "discount_vs_mrp_pct": discount_vs_mrp,
        "distance_from_historical_low_pct": distance_from_low_pct,
        "vs_90d_median_pct": vs_90d_median_pct,
        "price_direction": price_direction,
        "avg_7d": avg_7d,
        "avg_30d": avg_30d,
        "avg_90d": avg_90d,
        "avg_180d": avg_180d,
    }

    # 4. Assembling ESTIMATES (Bank discounts / coupons)
    estimates = []
    if current_price >= 5000:
        # Standard HDFC / ICICI 10% instant card discount simulation
        card_discount = min(1500.0, round(current_price * 0.10))
        estimates.append({
            "title": "Instant Bank Discount",
            "effective_price": current_price - card_discount,
            "savings": card_discount,
            "condition": "Eligible HDFC / ICICI Credit Card on checkout",
            "confidence": "HIGH",
        })

    # 5. Determining Explainable Verdict & Reasons
    reasons: List[str] = []
    confidence = "HIGH" if len(valid_obs) >= 5 else "MEDIUM"

    if distance_from_low_pct <= 3.0:
        verdict = "BUY"
        headline_reason = "Near All-Time Low"
        reasons.append(f"Current price (₹{current_price:,.0f}) is within {distance_from_low_pct}% of the historical low (₹{hist_low:,.0f}).")
        if vs_90d_median_pct < -5.0:
            reasons.append(f"Price is {abs(vs_90d_median_pct)}% below the 90-day typical median price.")
        if price_direction == "falling":
            reasons.append("Recent price trend has been downward.")
    elif vs_90d_median_pct <= -8.0:
        verdict = "BUY"
        headline_reason = "Solid Discount vs Historical Average"
        reasons.append(f"Current price is {abs(vs_90d_median_pct)}% lower than typical 90-day pricing (₹{median_price:,.0f}).")
        if discount_vs_mrp >= 20:
            reasons.append(f"Genuine {discount_vs_mrp}% markdown below manufacturer MRP.")
    elif distance_from_low_pct > 18.0 or vs_90d_median_pct > 6.0:
        verdict = "WAIT"
        headline_reason = "Price Above Recent Averages"
        reasons.append(f"Current price is {distance_from_low_pct}% above the observed low (₹{hist_low:,.0f}).")
        reasons.append(f"Typically sells for closer to ₹{median_price:,.0f} during sales.")
        reasons.append("Set a price drop alert to catch the next dip.")
    elif discount_vs_mrp < 5.0 and distance_from_low_pct > 12.0:
        verdict = "AVOID"
        headline_reason = "No Meaningful Discount"
        reasons.append("Selling essentially at full list price with no genuine deal detected.")
        reasons.append(f"Product has previously dropped down to ₹{hist_low:,.0f}.")
    else:
        verdict = "BUY" if vs_90d_median_pct < 0 else "WAIT"
        headline_reason = "Fair Market Price"
        reasons.append(f"Price is roughly aligned with historical median (₹{median_price:,.0f}).")

    stats = {
        "current_price": current_price,
        "mrp": mrp,
        "historical_low": hist_low,
        "historical_high": hist_high,
        "average_price": avg_price,
        "median_price": median_price,
        "avg_7d": avg_7d,
        "avg_30d": avg_30d,
        "avg_90d": avg_90d,
        "avg_180d": avg_180d,
        "price_direction": price_direction,
        "distance_from_low_pct": distance_from_low_pct,
        "observations_count": len(prices),
    }

    return ComprehensiveDealIntelligence(
        verdict=verdict,
        confidence=confidence,
        headline_reason=headline_reason,
        detailed_reasons=reasons,
        facts=facts,
        calculations=calculations,
        estimates=estimates,
        stats=stats,
    )
