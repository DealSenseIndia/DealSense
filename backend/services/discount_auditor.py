"""
DealSense Fake Discount & MRP Price Inflation Auditor.
Analyzes advertised discounts against the 90-day typical baseline
to expose deceptive pricing practices.

HONESTY GUARANTEE: When MRP or historical average is unavailable, the
audit returns INSUFFICIENT_DATA instead of inventing numbers. The previous
version fabricated MRP as `price * 1.35` and baseline as `price * 1.12`,
which mathematically guaranteed a "Verified Genuine Discount" message
even with zero real data.
"""

from typing import Dict, Any, Optional


def audit_fake_discounts(
    current_price: float,
    mrp: Optional[float],
    historical_low: Optional[float],
    historical_avg: Optional[float],
) -> Dict[str, Any]:
    """
    Fake Discount & Price Inflation Auditor.
    Compares the advertised MRP against the true 90-day typical baseline
    to detect artificial pre-sale price hikes and calculate the true savings.

    Returns INSUFFICIENT_DATA when MRP or history is missing, rather than
    inventing values.
    """
    has_real_mrp = mrp is not None and mrp > current_price
    has_real_history = historical_avg is not None and historical_avg > 0

    # If we don't have both MRP and historical data, we can't audit anything
    if not has_real_mrp and not has_real_history:
        return {
            "is_inflated": False,
            "advertised_mrp": None,
            "advertised_discount_pct": 0.0,
            "real_baseline_price": None,
            "real_discount_pct": 0.0,
            "audit_verdict": "INSUFFICIENT_DATA",
            "badge_color": "#64748B",
            "audit_explanation": (
                "Discount audit requires MRP and price history. "
                "DealSense will accumulate observations automatically."
            ),
        }

    # Use real MRP only — never invent one
    advertised_mrp = mrp if has_real_mrp else None
    adv_discount = (
        round(((advertised_mrp - current_price) / advertised_mrp) * 100, 1)
        if advertised_mrp
        else 0.0
    )

    # Use real historical average only — never invent a baseline
    ref_baseline = historical_avg if has_real_history else None
    real_discount = 0.0
    if ref_baseline and ref_baseline > current_price:
        real_discount = round(
            ((ref_baseline - current_price) / ref_baseline) * 100, 1
        )

    # Flag if MRP is abnormally high compared to typical price
    is_inflated = False
    if advertised_mrp and ref_baseline and ref_baseline > 0:
        is_inflated = (advertised_mrp / ref_baseline) > 1.45 and adv_discount >= 40.0

    if is_inflated:
        warning = (
            f"Artificial MRP Inflation: Advertised MRP (₹{int(advertised_mrp):,}) "
            f"was inflated to market a {int(adv_discount)}% sale. Against the "
            f"90-day typical price (₹{int(ref_baseline):,}), your real saving "
            f"is {int(real_discount)}%."
        )
        audit_verdict = "INFLATED_MRP"
        badge_color = "#DC2626"
    elif real_discount >= 10.0 and has_real_history:
        warning = (
            f"Verified Genuine Discount: Selling price is legitimately "
            f"{int(real_discount)}% below the 90-day typical baseline "
            f"(₹{int(ref_baseline):,}) with no artificial price spike."
        )
        audit_verdict = "GENUINE_SAVING"
        badge_color = "#16A34A"
    elif has_real_mrp and not has_real_history:
        # We have MRP but no history — can report advertised discount but not verify it
        warning = (
            f"Advertised discount is {int(adv_discount)}% off MRP (₹{int(advertised_mrp):,}). "
            f"Collecting price history to verify this is a real deal."
        )
        audit_verdict = "UNVERIFIED_DISCOUNT"
        badge_color = "#D97706"
    elif has_real_history and real_discount < 10.0:
        baseline_display = f"₹{int(ref_baseline):,}" if ref_baseline else "--"
        warning = (
            f"Standard Market Price: Selling price aligns with the "
            f"90-day historical average ({baseline_display})."
        )
        audit_verdict = "STANDARD_PRICE"
        badge_color = "#64748B"
    else:
        warning = (
            "Price appears typical for this product. "
            "More observations will improve accuracy."
        )
        audit_verdict = "STANDARD_PRICE"
        badge_color = "#64748B"

    return {
        "is_inflated": is_inflated,
        "advertised_mrp": advertised_mrp,
        "advertised_discount_pct": adv_discount,
        "real_baseline_price": round(ref_baseline) if ref_baseline else None,
        "real_discount_pct": real_discount,
        "audit_verdict": audit_verdict,
        "badge_color": badge_color,
        "audit_explanation": warning,
    }
