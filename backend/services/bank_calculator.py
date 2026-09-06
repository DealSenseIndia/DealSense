"""
DealWise Indian Bank Instant Discount Calculator.
Computes instant card promotions, cashback, and true effective out-of-pocket prices
for major Indian banks (SBI, HDFC, ICICI, Axis).
"""

from typing import List, Dict, Any


def calculate_bank_effective_prices(current_price: float) -> List[Dict[str, Any]]:
    """
    Calculates instant bank discounts and effective out-of-pocket prices
    for major Indian cards (SBI, HDFC, ICICI/Axis).
    """
    sbi_disc = min(round(current_price * 0.10), 1500) if current_price >= 2000 else 0
    hdfc_disc = min(round(current_price * 0.10), 1250) if current_price >= 2500 else 0
    icici_disc = round(current_price * 0.05)

    return [
        {
            "bank_id": "sbi",
            "bank_name": "SBI Credit Card",
            "offer_text": "10% Instant Discount (up to ₹1,500)",
            "discount_amount": sbi_disc,
            "effective_price": round(current_price - sbi_disc),
            "logo_badge": "SBI",
        },
        {
            "bank_id": "hdfc",
            "bank_name": "HDFC Bank Card",
            "offer_text": "10% Instant Discount (up to ₹1,250)",
            "discount_amount": hdfc_disc,
            "effective_price": round(current_price - hdfc_disc),
            "logo_badge": "HDFC",
        },
        {
            "bank_id": "icici",
            "bank_name": "Amazon Pay ICICI",
            "offer_text": "5% Unlimited Cashback",
            "discount_amount": icici_disc,
            "effective_price": round(current_price - icici_disc),
            "logo_badge": "ICICI",
        },
    ]
