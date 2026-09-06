"""
Merchant Adapter Abstraction Layer for DealWise.
Supports strictly Amazon India and Flipkart with explicit capability flags.
Safely disabled if credentials/API keys are unconfigured.
"""
import os
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse


class MerchantAdapter(ABC):
    """Base abstract interface for merchant integrations."""

    def __init__(self, merchant_name: str, domain: str):
        self.merchant_name = merchant_name
        self.domain = domain

    @property
    @abstractmethod
    def is_enabled(self) -> bool:
        """Returns True only if valid API credentials/authorization exist."""
        pass

    @abstractmethod
    def extract_product_id(self, url: str) -> Optional[str]:
        """Extracts canonical merchant SKU/ASIN/PID from merchant URL."""
        pass

    @abstractmethod
    def generate_affiliate_link(self, clean_url: str) -> str:
        """Appends official affiliate tracking parameters if configured."""
        pass

    @abstractmethod
    def get_product_details(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Fetches product details from official merchant API if enabled."""
        pass


class AmazonAdapter(MerchantAdapter):
    """
    Amazon India Adapter.
    Adheres strictly to Amazon Creators API / Associates standards.
    Stays gracefully disabled unless valid credentials exist in environment.
    """

    SUPPORTED_DOMAINS = {"amazon.in", "www.amazon.in", "amzn.to", "amzn.in"}

    def __init__(self):
        super().__init__(merchant_name="Amazon India", domain="amazon.in")
        self.access_key = os.environ.get("AMAZON_ACCESS_KEY")
        self.secret_key = os.environ.get("AMAZON_SECRET_KEY")
        self.associate_tag = os.environ.get("AMAZON_ASSOCIATE_TAG", "dealwise0d-21")

    @property
    def is_enabled(self) -> bool:
        # Disabled unless explicit credentials are provided
        return bool(self.access_key and self.secret_key and self.associate_tag)

    def extract_product_id(self, url: str) -> Optional[str]:
        """Extracts 10-character Amazon ASIN."""
        import re
        parsed = urlparse(url)
        if not any(d in parsed.netloc for d in self.SUPPORTED_DOMAINS):
            return None
        match = re.search(r"(?:/dp/|/gp/product/|/d/)([A-Z0-9]{10})", url)
        return match.group(1) if match else None

    def generate_affiliate_link(self, clean_url: str) -> str:
        tag = self.associate_tag or "dealwise0d-21"
        separator = "&" if "?" in clean_url else "?"
        return f"{clean_url}{separator}tag={tag}&linkCode=as2"

    def get_product_details(self, product_id: str) -> Optional[Dict[str, Any]]:
        if not self.is_enabled:
            return None
        # Placeholder for approved Amazon Creators API request
        return None


class FlipkartAdapter(MerchantAdapter):
    """
    Flipkart Adapter.
    Adheres strictly to Flipkart Affiliate Program standards.
    Stays gracefully disabled unless valid credentials exist in environment.
    """

    SUPPORTED_DOMAINS = {"flipkart.com", "www.flipkart.com", "dl.flipkart.com", "fkrt.it"}

    def __init__(self):
        super().__init__(merchant_name="Flipkart", domain="flipkart.com")
        self.affiliate_id = os.environ.get("FLIPKART_AFFILIATE_ID")
        self.affiliate_token = os.environ.get("FLIPKART_AFFILIATE_TOKEN")
        self.tracking_id = os.environ.get("FLIPKART_TRACKING_ID", "dealwise_in")

    @property
    def is_enabled(self) -> bool:
        return bool(self.affiliate_id and self.affiliate_token)

    def extract_product_id(self, url: str) -> Optional[str]:
        """Extracts Flipkart PID / itm id."""
        import re
        parsed = urlparse(url)
        if not any(d in parsed.netloc for d in self.SUPPORTED_DOMAINS):
            return None
        match = re.search(r"[?&]pid=([A-Z0-9]{16})", url)
        if match:
            return match.group(1)
        match_itm = re.search(r"/p/(itm[a-zA-Z0-9]+)", url)
        return match_itm.group(1) if match_itm else None

    def generate_affiliate_link(self, clean_url: str) -> str:
        tag = self.tracking_id or "dealwise_in"
        separator = "&" if "?" in clean_url else "?"
        return f"{clean_url}{separator}affid={tag}"

    def get_product_details(self, product_id: str) -> Optional[Dict[str, Any]]:
        if not self.is_enabled:
            return None
        return None


# Registry of supported merchants
SUPPORTED_ADAPTERS: Dict[str, MerchantAdapter] = {
    "amazon": AmazonAdapter(),
    "flipkart": FlipkartAdapter(),
}


def get_adapter_for_url(url: str) -> Optional[MerchantAdapter]:
    """Detects merchant from URL and returns appropriate adapter if supported."""
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    if any(d in domain for d in AmazonAdapter.SUPPORTED_DOMAINS):
        return SUPPORTED_ADAPTERS["amazon"]
    if any(d in domain for d in FlipkartAdapter.SUPPORTED_DOMAINS):
        return SUPPORTED_ADAPTERS["flipkart"]
    return None
