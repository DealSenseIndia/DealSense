from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from backend.models import PriceObservation


@dataclass
class DealVerdict:
    deal_score: int  # 0 - 100
    verdict: str  # 'BUY' | 'FAIR' | 'WAIT' | 'AVOID'
    confidence: str  # 'HIGH' | 'MEDIUM' | 'LOW'
    current_price: float
    mrp: Optional[float]
    discount_pct: float
    historical_low: Optional[float]
    historical_avg_90d: Optional[float]
    evidence: List[str] = field(default_factory=list)


def evaluate_deal(
    current_obs: PriceObservation,
    history: Optional[List[PriceObservation]] = None,
) -> DealVerdict:
    """
    Computes an auditable deal score and verdict based on empirical price signals.
    """
    history = history or []
    current_price = current_obs.price
    mrp = current_obs.mrp

    # 1. Discount vs MRP
    discount_pct = 0.0
    if mrp and mrp > current_price:
        discount_pct = round(((mrp - current_price) / mrp) * 100, 1)

    evidence: List[str] = []
    score = 50  # Start from baseline neutral

    # Check stock
    if not current_obs.in_stock:
        return DealVerdict(
            deal_score=10,
            verdict="AVOID",
            confidence="HIGH",
            current_price=current_price,
            mrp=mrp,
            discount_pct=discount_pct,
            historical_low=None,
            historical_avg_90d=None,
            evidence=["Product is currently marked Out of Stock."],
        )

    # 2. Historical Analysis
    def _as_naive(dt: datetime) -> datetime:
        return dt.replace(tzinfo=None) if dt.tzinfo else dt

    prices = [obs.price for obs in history if obs.price > 0]
    hist_low = min(prices) if prices else current_price
    cutoff_90d = datetime.utcnow() - timedelta(days=90)
    prices_90d = [obs.price for obs in history if _as_naive(obs.observed_at) >= cutoff_90d and obs.price > 0]
    hist_avg = sum(prices_90d) / len(prices_90d) if prices_90d else None

    # Score calculation
    # Factor A: Discount vs MRP (up to +20 points)
    if discount_pct >= 40:
        score += 20
        evidence.append(f"Significant discount: {discount_pct}% off MRP (Rs. {mrp:,.0f}).")
    elif discount_pct >= 20:
        score += 15
        evidence.append(f"Solid discount: {discount_pct}% off MRP (Rs. {mrp:,.0f}).")
    elif discount_pct >= 10:
        score += 8
        evidence.append(f"Modest discount: {discount_pct}% off MRP.")
    elif discount_pct == 0 and mrp:
        score -= 5
        evidence.append("Selling at full MRP with no retailer discount.")

    # Factor B: Price vs Historical Low / Average (up to +30 points)
    if len(prices) > 1:
        if current_price <= hist_low:
            score += 30
            evidence.append(f"All-time lowest price recorded: Rs. {current_price:,.0f}!")
        elif current_price <= hist_low * 1.03:
            score += 22
            evidence.append(f"Within 3% of the lowest recorded price (Rs. {hist_low:,.0f}).")
        elif hist_avg and current_price < hist_avg * 0.95:
            pct_below_avg = round(((hist_avg - current_price) / hist_avg) * 100, 1)
            score += 18
            evidence.append(f"{pct_below_avg}% below the 90-day typical average (Rs. {hist_avg:,.0f}).")
        elif hist_avg and current_price > hist_avg * 1.08:
            pct_above_avg = round(((current_price - hist_avg) / hist_avg) * 100, 1)
            score -= 20
            evidence.append(f"Elevated price: {pct_above_avg}% higher than the 90-day typical price (Rs. {hist_avg:,.0f}).")
    else:
        # First observation for this listing
        evidence.append("Initial baseline observation recorded for price tracking.")

    # Cap score between 0 and 100
    deal_score = max(0, min(100, score))

    # Determine Verdict
    if deal_score >= 70:
        verdict = "BUY"
    elif deal_score >= 50:
        verdict = "FAIR"
    else:
        verdict = "WAIT"

    # Confidence level
    if len(history) >= 10:
        confidence = "HIGH"
    elif len(history) >= 3 or mrp is not None:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return DealVerdict(
        deal_score=deal_score,
        verdict=verdict,
        confidence=confidence,
        current_price=current_price,
        mrp=mrp,
        discount_pct=discount_pct,
        historical_low=hist_low,
        historical_avg_90d=hist_avg,
        evidence=evidence,
    )
