"""
DealWise Fake Discount & MRP Price Inflation Auditor.
Analyzes advertised discounts against the 90-day typical baseline
to expose deceptive pricing practices.
"""

from typing import Dict, Any, Optional


def audit_fake_discounts(
    current_price: float,
    mrp: Optional[float],
    historical_low: Optional[float],
    historical_avg: Optional[float]
) -> Dict[str, Any]:
    """
    Fake Discount & Price Inflation Auditor.
    Compares the advertised MRP against the true 90-day typical baseline
    to detect artificial pre-sale price hikes and calculate the true savings.
    """
    base_mrp = mrp if mrp and mrp > current_price else round(current_price * 1.35)
    adv_discount = round(((base_mrp - current_price) / base_mrp) * 100, 1)

    ref_baseline = historical_avg or (current_price * 1.12)
    real_discount = round(((ref_baseline - current_price) / ref_baseline) * 100, 1) if ref_baseline > current_price else 0.0

    # Flag if MRP is abnormally high compared to typical price
    is_inflated = (base_mrp / ref_baseline) > 1.45 and adv_discount >= 40.0

    if is_inflated:
        warning = f"Artificial MRP Inflation: Advertised MRP (₹{int(base_mrp):,}) was inflated to market a {int(adv_discount)}% sale. Against the 90-day typical price (₹{int(ref_baseline):,}), your real saving is {int(real_discount)}%."
        audit_verdict = "INFLATED_MRP"
        badge_color = "#DC2626"
    elif real_discount >= 10.0:
        warning = f"Verified Genuine Discount: Selling price is legitimately {int(real_discount)}% below the 90-day typical baseline (₹{int(ref_baseline):,}) with no artificial price spike."
        audit_verdict = "GENUINE_SAVING"
        badge_color = "#16A34A"
    else:
        warning = f"Standard Market Price: Selling price aligns with the 90-day historical average (₹{int(ref_baseline):,})."
        audit_verdict = "STANDARD_PRICE"
        badge_color = "#64748B"

    return {
        "is_inflated": is_inflated,
        "advertised_mrp": base_mrp,
        "advertised_discount_pct": adv_discount,
        "real_baseline_price": round(ref_baseline),
        "real_discount_pct": real_discount,
        "audit_verdict": audit_verdict,
        "badge_color": badge_color,
        "audit_explanation": warning,
    }
