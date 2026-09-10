"""
DealSense Indian Bank Instant Discount & Landed Checkout Calculator.
Computes instant card promotions, cashback, and true effective out-of-pocket prices
specifically tailored for Amazon India and Flipkart.
"""

from typing import List, Dict, Any, Optional


def calculate_bank_effective_prices(
    current_price: float,
    merchant: str = "Amazon",
    is_prime: bool = True,
) -> List[Dict[str, Any]]:
    """
    Calculates instant bank discounts and effective out-of-pocket prices
    for major Indian cards (SBI, HDFC, ICICI, Axis) tailored to the merchant.
    """
    m_lower = (merchant or "").lower()

    if m_lower == "flipkart":
        axis_disc = round(current_price * 0.05)
        hdfc_disc = min(round(current_price * 0.10), 1500) if current_price >= 2500 else 0
        sbi_disc = min(round(current_price * 0.10), 1250) if current_price >= 2000 else 0

        return [
            {
                "bank_id": "axis",
                "bank_name": "Flipkart Axis Bank Card",
                "offer_text": "5% Unlimited Cashback",
                "discount_amount": axis_disc,
                "effective_price": round(current_price - axis_disc),
                "logo_badge": "AXIS",
                "eligibility_note": "5% unlimited cashback credited to next statement on Flipkart Axis Bank Credit Card.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
            {
                "bank_id": "hdfc",
                "bank_name": "HDFC Bank Card",
                "offer_text": "10% Instant Discount (up to ₹1,500)",
                "discount_amount": hdfc_disc,
                "effective_price": round(current_price - hdfc_disc),
                "logo_badge": "HDFC",
                "eligibility_note": "10% instant discount on HDFC Bank Credit/Debit Cards on orders over ₹2,500.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
            {
                "bank_id": "sbi",
                "bank_name": "SBI Credit Card",
                "offer_text": "10% Instant Discount (up to ₹1,250)",
                "discount_amount": sbi_disc,
                "effective_price": round(current_price - sbi_disc),
                "logo_badge": "SBI",
                "eligibility_note": "Eligible on SBI Credit Card transactions over ₹2,000. Subject to bank terms.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
        ]
    else:
        # Default Amazon India
        icici_pct = 0.05 if is_prime else 0.03
        icici_disc = round(current_price * icici_pct)
        sbi_disc = min(round(current_price * 0.10), 1500) if current_price >= 2000 else 0
        hdfc_disc = min(round(current_price * 0.10), 1250) if current_price >= 2500 else 0

        return [
            {
                "bank_id": "icici",
                "bank_name": "Amazon Pay ICICI",
                "offer_text": f"{int(icici_pct * 100)}% Unlimited Cashback",
                "discount_amount": icici_disc,
                "effective_price": round(current_price - icici_disc),
                "logo_badge": "ICICI",
                "eligibility_note": f"{int(icici_pct * 100)}% unlimited cashback for {'Prime' if is_prime else 'non-Prime'} members with Amazon Pay ICICI card.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
            {
                "bank_id": "sbi",
                "bank_name": "SBI Credit Card",
                "offer_text": "10% Instant Discount (up to ₹1,500)",
                "discount_amount": sbi_disc,
                "effective_price": round(current_price - sbi_disc),
                "logo_badge": "SBI",
                "eligibility_note": "Eligible on SBI Credit Card transactions over ₹2,000. Subject to bank terms.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
            {
                "bank_id": "hdfc",
                "bank_name": "HDFC Bank Card",
                "offer_text": "10% Instant Discount (up to ₹1,250)",
                "discount_amount": hdfc_disc,
                "effective_price": round(current_price - hdfc_disc),
                "logo_badge": "HDFC",
                "eligibility_note": "Eligible on select HDFC Credit/Debit Card transactions over ₹2,500.",
                "is_conditional": True,
                "classification": "ESTIMATE",
            },
        ]


def calculate_checkout_total(
    price: float,
    delivery_fee: float = 0.0,
    coupon_discount: float = 0.0,
    bank_discount: float = 0.0,
) -> Dict[str, Any]:
    """
    Computes true transparent landed checkout price:
    Base Price + Delivery Fee - Coupon - Bank Discount = Landed Total
    """
    base_price = round(max(0.0, price), 2)
    deliv = round(max(0.0, delivery_fee), 2)
    coupon = round(max(0.0, coupon_discount), 2)
    bank = round(max(0.0, bank_discount), 2)
    total_savings = round(coupon + bank, 2)
    landed_price = round(max(0.0, base_price + deliv - total_savings), 2)

    return {
        "base_price": base_price,
        "delivery_fee": deliv,
        "coupon_discount": coupon,
        "bank_discount": bank,
        "total_savings": total_savings,
        "landed_price": landed_price,
        "is_free_delivery": deliv == 0.0,
    }


def get_best_bank_offer(current_price: float, merchant: str = "Amazon", is_prime: bool = True) -> Optional[Dict[str, Any]]:
    """Returns the single highest discount bank offer for prominent display."""
    offers = calculate_bank_effective_prices(current_price, merchant, is_prime)
    if not offers:
        return None
    valid_offers = [o for o in offers if o["discount_amount"] > 0]
    if not valid_offers:
        return None
    return max(valid_offers, key=lambda x: x["discount_amount"])
