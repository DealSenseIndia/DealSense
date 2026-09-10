"""
DealSense Explainable Deal Intelligence Engine.
Computes deterministic, auditable deal verdicts (BUY / WAIT / SKIP / NOT ENOUGH DATA)
grounded strictly in empirical price points and verified MRP signals.
No fabricated AI scores.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional

from backend.services.price_service import HistoricalPriceSummary


@dataclass
class DealVerdict:
    deal_score: int
    verdict: str
    confidence: str
    current_price: float
    mrp: Optional[float]
    discount_pct: float
    historical_low: Optional[float]
    historical_avg_90d: Optional[float]
    evidence: List[str] = field(default_factory=list)


@dataclass
class EvidenceItem:
    """An individual piece of auditable evidence supporting the deal verdict."""
    classification: str  # 'VERIFIED FACT' | 'CALCULATION' | 'RECOMMENDATION' | 'ESTIMATE' | 'UNKNOWN'
    text: str


@dataclass
class DealAnalysisResult:
    verdict: str  # 'BUY' | 'WAIT' | 'SKIP' | 'NOT ENOUGH DATA'
    deal_score: int  # 0 to 100 benchmark indicator
    confidence: str  # 'HIGH' | 'MEDIUM' | 'LOW'
    summary_reason: str
    current_price: float
    mrp: Optional[float] = None
    discount_pct: float = 0.0
    diff_vs_median_pct: Optional[float] = None
    diff_vs_low_pct: Optional[float] = None
    historical_low: Optional[float] = None
    historical_median: Optional[float] = None
    historical_average: Optional[float] = None
    evidence: List[EvidenceItem] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "verdict": self.verdict,
            "deal_score": self.deal_score,
            "confidence": self.confidence,
            "summary_reason": self.summary_reason,
            "current_price": self.current_price,
            "mrp": self.mrp,
            "discount_pct": self.discount_pct,
            "diff_vs_median_pct": self.diff_vs_median_pct,
            "diff_vs_low_pct": self.diff_vs_low_pct,
            "historical_low": self.historical_low,
            "historical_median": self.historical_median,
            "historical_average": self.historical_average,
            "evidence": [
                {"type": e.classification, "text": e.text}
                for e in self.evidence
            ],
        }


# Threshold Constants (Explicitly Documented & Auditable)
# BUY Thresholds:
# - Current price is within 3.0% of historical low
# - OR Current price is >= 12.0% below the historical median
# WAIT Thresholds:
# - Current price is >= 8.0% above the historical median
# - OR Current price is >= 15.0% above historical low
# SKIP Thresholds:
# - In stock == False
# - OR Selling at 0% discount on full MRP with historical evidence of frequent sales

BUY_WITHIN_LOW_PCT = 3.0
BUY_BELOW_MEDIAN_PCT = 12.0
WAIT_ABOVE_MEDIAN_PCT = 8.0
WAIT_ABOVE_LOW_PCT = 15.0


def evaluate_deal_intelligence(
    current_price: float,
    mrp: Optional[float],
    history_summary: HistoricalPriceSummary,
    in_stock: bool = True,
) -> DealAnalysisResult:
    """
    Evaluates price evidence and calculates an explainable shopping decision verdict.
    """
    evidence: List[EvidenceItem] = []

    # 1. Fact: Current Price
    evidence.append(
        EvidenceItem(
            classification="VERIFIED FACT",
            text=f"Current price observed at ₹{current_price:,.2f}.",
        )
    )

    # 2. Check Stock Availability -> SKIP if Out of Stock
    if not in_stock:
        evidence.append(
            EvidenceItem(
                classification="VERIFIED FACT",
                text="Product is currently marked as Out of Stock by retailer.",
            )
        )
        return DealAnalysisResult(
            verdict="SKIP",
            deal_score=10,
            confidence="HIGH",
            summary_reason="Product is currently out of stock. Do not attempt checkout.",
            current_price=current_price,
            mrp=mrp,
            evidence=evidence,
        )

    # 3. Fact & Calculation: MRP Discount
    discount_pct = 0.0
    if mrp and mrp > current_price:
        discount_pct = round(((mrp - current_price) / mrp) * 100, 1)
        evidence.append(
            EvidenceItem(
                classification="VERIFIED FACT",
                text=f"Maximum Retail Price (MRP) listed at ₹{mrp:,.2f}.",
            )
        )
        evidence.append(
            EvidenceItem(
                classification="CALCULATION",
                text=f"Retailer discount is {discount_pct}% off MRP.",
            )
        )
    elif mrp and mrp <= current_price:
        evidence.append(
            EvidenceItem(
                classification="VERIFIED FACT",
                text=f"Selling at or above full MRP (₹{mrp:,.2f}) with 0% discount.",
            )
        )

    # 4. Check for Insufficient Historical Data
    if not history_summary.has_sufficient_history:
        evidence.append(
            EvidenceItem(
                classification="RECOMMENDATION",
                text="DealSense has recorded fewer than 2 price observations for this listing. A confident historical verdict cannot be determined.",
            )
        )
        return DealAnalysisResult(
            verdict="NOT ENOUGH DATA",
            deal_score=50,
            confidence="LOW",
            summary_reason=f"Initial price observation recorded today (₹{current_price:,.2f}). DealSense requires multiple verified observations over time to establish an auditable deal verdict.",
            current_price=current_price,
            mrp=mrp,
            discount_pct=discount_pct,
            evidence=evidence,
        )

    # 5. Historical Math Calculations
    hist_low = history_summary.lowest_price or current_price
    hist_median = history_summary.median_price or current_price
    hist_avg = history_summary.average_price or current_price

    evidence.append(
        EvidenceItem(
            classification="VERIFIED FACT",
            text=f"Lowest observed price recorded in history is ₹{hist_low:,.2f}.",
        )
    )
    evidence.append(
        EvidenceItem(
            classification="VERIFIED FACT",
            text=f"Median typical price across {history_summary.observation_count} observations is ₹{hist_median:,.2f}.",
        )
    )

    diff_vs_low_pct = round(((current_price - hist_low) / hist_low) * 100, 1)
    diff_vs_median_pct = round(((current_price - hist_median) / hist_median) * 100, 1)

    evidence.append(
        EvidenceItem(
            classification="CALCULATION",
            text=f"Current price is {abs(diff_vs_low_pct)}% {'above' if diff_vs_low_pct >= 0 else 'below'} historical low.",
        )
    )
    evidence.append(
        EvidenceItem(
            classification="CALCULATION",
            text=f"Current price is {abs(diff_vs_median_pct)}% {'above' if diff_vs_median_pct >= 0 else 'below'} the typical median.",
        )
    )

    # 6. Deterministic Verdict Logic
    deal_score = 50  # Neutral midpoint

    # 0. Price Over MRP / Gouging Condition -> Immediate SKIP (Must evaluate before median WAIT)
    if mrp and current_price > mrp:
        verdict = "SKIP"
        deal_score = 15
        summary = f"Overpriced: Current price of ₹{current_price:,.2f} exceeds listed MRP of ₹{mrp:,.2f}."
        evidence.append(EvidenceItem("RECOMMENDATION", "SKIP — Selling above official MRP. Avoid purchase."))

    # BUY Conditions
    elif current_price <= hist_low:
        verdict = "BUY"
        deal_score = 92
        summary = f"All-time low price! ₹{current_price:,.2f} is the lowest recorded price across {history_summary.observation_count} checks."
        evidence.append(EvidenceItem("RECOMMENDATION", "BUY NOW — Matches or beats all-time recorded low."))
    elif diff_vs_low_pct <= BUY_WITHIN_LOW_PCT:
        verdict = "BUY"
        deal_score = 85
        summary = f"Strong deal: ₹{current_price:,.2f} is within {diff_vs_low_pct}% of the historical low (₹{hist_low:,.2f})."
        evidence.append(EvidenceItem("RECOMMENDATION", f"BUY — Within {diff_vs_low_pct}% of the historical low."))
    elif diff_vs_median_pct <= -BUY_BELOW_MEDIAN_PCT:
        verdict = "BUY"
        deal_score = 80
        summary = f"Significant discount: ₹{current_price:,.2f} is {abs(diff_vs_median_pct)}% below the typical median (₹{hist_median:,.2f})."
        evidence.append(EvidenceItem("RECOMMENDATION", f"BUY — Trading {abs(diff_vs_median_pct)}% below recent median levels."))

    # WAIT Conditions
    elif diff_vs_median_pct >= WAIT_ABOVE_MEDIAN_PCT:
        verdict = "WAIT"
        deal_score = 38
        summary = f"Price is elevated: ₹{current_price:,.2f} is {diff_vs_median_pct}% above the typical median (₹{hist_median:,.2f})."
        evidence.append(EvidenceItem("RECOMMENDATION", f"WAIT — Price is {diff_vs_median_pct}% above typical levels. Wait for next discount cycle."))
    elif diff_vs_low_pct >= WAIT_ABOVE_LOW_PCT:
        verdict = "WAIT"
        deal_score = 42
        summary = f"Wait for discount: Current price is {diff_vs_low_pct}% higher than the recorded low of ₹{hist_low:,.2f}."
        evidence.append(EvidenceItem("RECOMMENDATION", f"WAIT — Price has previously dropped to ₹{hist_low:,.2f}."))

    # SKIP Condition (Full MRP or no real discount)
    elif discount_pct == 0 and mrp:
        verdict = "SKIP"
        deal_score = 30
        summary = f"Selling at full MRP (₹{mrp:,.2f}) with 0% retailer discount."
        evidence.append(EvidenceItem("RECOMMENDATION", "SKIP — No retailer discount currently active."))

    # Neutral / FAIR default
    else:
        verdict = "WAIT"
        deal_score = 55
        summary = f"Average price: ₹{current_price:,.2f} is close to typical median levels (₹{hist_median:,.2f})."
        evidence.append(EvidenceItem("RECOMMENDATION", "FAIR / WAIT — Price is near average; likely to drop during upcoming sales."))

    return DealAnalysisResult(
        verdict=verdict,
        deal_score=deal_score,
        confidence=history_summary.confidence,
        summary_reason=summary,
        current_price=current_price,
        mrp=mrp,
        discount_pct=discount_pct,
        diff_vs_median_pct=diff_vs_median_pct,
        diff_vs_low_pct=diff_vs_low_pct,
        historical_low=hist_low,
        historical_median=hist_median,
        historical_average=hist_avg,
        evidence=evidence,
    )


# Backward-compatible wrapper for existing backend callers
def evaluate_deal(current_obs, history=None):
    from backend.services.price_service import HistoricalPriceSummary
    history_obs = history or []
    valid_prices = [o.price for o in history_obs if o.price > 0]
    has_sufficient = len(valid_prices) >= 3
    lowest = min(valid_prices) if valid_prices else current_obs.price
    highest = max(valid_prices) if valid_prices else current_obs.price
    import statistics
    median = statistics.median(valid_prices) if len(valid_prices) >= 2 else (valid_prices[0] if valid_prices else current_obs.price)
    avg = statistics.mean(valid_prices) if valid_prices else current_obs.price

    h_summary = HistoricalPriceSummary(
        observation_count=len(history_obs),
        current_price=current_obs.price,
        mrp=current_obs.mrp,
        lowest_price=lowest,
        highest_price=highest,
        median_price=median,
        average_price=avg,
        has_sufficient_history=has_sufficient,
        confidence="HIGH" if len(valid_prices) >= 10 else ("MEDIUM" if len(valid_prices) >= 3 else "LOW"),
    )

    res = evaluate_deal_intelligence(
        current_price=current_obs.price,
        mrp=current_obs.mrp,
        history_summary=h_summary,
        in_stock=current_obs.in_stock,
    )

    return DealVerdict(
        deal_score=res.deal_score,
        verdict=res.verdict,
        confidence=res.confidence,
        current_price=res.current_price,
        mrp=res.mrp,
        discount_pct=res.discount_pct,
        historical_low=res.historical_low,
        historical_avg_90d=res.historical_average,
        evidence=[f"[{e.classification}] {e.text}" for e in res.evidence],
    )
