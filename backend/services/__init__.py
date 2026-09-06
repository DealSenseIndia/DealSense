"""
DealWise Domain Services Package.
Exposes specialized micro-services for deal intelligence, price auditing, and store comparisons.
"""

from backend.services.discount_auditor import audit_fake_discounts
from backend.services.bank_calculator import calculate_bank_effective_prices
from backend.services.store_comparison import (
    build_compare_stores_table,
    build_coupons_and_offers,
    build_reviews_intelligence,
    build_similar_products,
)

__all__ = [
    "audit_fake_discounts",
    "calculate_bank_effective_prices",
    "build_compare_stores_table",
    "build_coupons_and_offers",
    "build_reviews_intelligence",
    "build_similar_products",
]
