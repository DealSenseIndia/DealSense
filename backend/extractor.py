"""
DealWise Product Data Extraction Interface.
Unofficial Amazon & Flipkart HTML scraping has been completely removed.
Preserves the canonical ExtractedProduct data structure for typing and official API/feed integrations.
"""

import logging
from dataclasses import dataclass
from typing import Optional, Union

from backend.resolver import resolve_product_url, ResolvedURL

logger = logging.getLogger(__name__)


@dataclass
class ExtractedProduct:
    """Canonical extracted/inbound product data structure."""
    merchant: str
    merchant_product_id: str
    clean_url: str
    title: str
    price: float
    mrp: Optional[float]
    currency: str = "INR"
    brand: Optional[str] = None
    model_number: Optional[str] = None
    category: Optional[str] = None
    in_stock: bool = True
    image_url: Optional[str] = None
    rating: Optional[float] = None
    ratings_count: Optional[str] = None
    bought_past_month: Optional[str] = None
    badge: Optional[str] = None
    highlight_tag: Optional[str] = None
    top_review: Optional[dict] = None


def extract_product_data(target: Union[str, ResolvedURL]) -> Optional[ExtractedProduct]:
    """
    Stub for product data extraction.
    Unofficial Amazon/Flipkart HTML scraping and captcha handling have been removed.
    """
    logger.info("Live HTML scraping is disabled. Use verified database records or official APIs.")
    return None


def safe_extract_product_data(
    target: Union[str, ResolvedURL],
    max_retries: int = 0,
    retry_delay: float = 0.0,
) -> Optional[ExtractedProduct]:
    """
    Safe extraction wrapper.
    Unofficial scraping and retry loop have been removed.
    """
    return None
