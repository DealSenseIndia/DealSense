import os
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

# Load .env from project root if present
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    try:
        with open(_env_path, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    os.environ.setdefault(_k.strip(), _v.strip())
    except Exception:
        pass


class Settings:
    # Cache duration: Re-use observations if checked within this time window
    CACHE_TTL_MINUTES: int = int(os.getenv("CACHE_TTL_MINUTES", "60"))

    # Direct Affiliate Credentials
    # Must be set explicitly in .env once an official Associates Store ID is verified.
    AMAZON_AFFILIATE_TAG: str = os.getenv("AMAZON_AFFILIATE_TAG", "")

    # Replace with your direct Flipkart Affiliate ID if approved
    FLIPKART_AFFILIATE_ID: str = os.getenv("FLIPKART_AFFILIATE_ID", "dealintel")

    # Affiliate Aggregator Setting (e.g. Cuelinks / EarnKaro)
    # When enabled, wraps raw merchant URLs into a universal tracking redirect
    # Example for Cuelinks: "https://linksredirect.com/?cid=YOUR_CID&subid=deal_intel&url="
    AFFILIATE_AGGREGATOR_PREFIX: str = os.getenv("AFFILIATE_AGGREGATOR_PREFIX", "")

    # Cuelinks V3 API Configuration
    CUELINKS_API_KEY: str = os.getenv("CUELINKS_API_KEY", "")
    CUELINKS_BASE_URL: str = os.getenv("CUELINKS_BASE_URL", "https://developers.cuelinks.com/pub_api/v3")

    # ── Deal Pipeline Configuration ──
    # Cache duration for in-memory deals feed
    DEAL_REFRESH_INTERVAL_MINUTES: int = int(os.getenv("DEAL_REFRESH_INTERVAL", "120"))

    # ── Telegram Delivery Configuration ──
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_USERNAME: str = os.getenv("TELEGRAM_BOT_USERNAME", "DealSenseAlertBot")
    TELEGRAM_WEBHOOK_SECRET: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    TELEGRAM_API_BASE_URL: str = os.getenv("TELEGRAM_API_BASE_URL", "https://api.telegram.org")

    # Application Base URL for link backs
    APP_BASE_URL: str = os.getenv("APP_BASE_URL", "https://dealsense.in")


settings = Settings()


def build_affiliate_url(merchant: str, clean_url: str) -> str:
    """
    Transforms a clean merchant URL into a monetized affiliate outbound URL.
    Supports direct affiliate tags and affiliate aggregator wrappers.
    """
    # 1. If an aggregator prefix is configured, wrap through the aggregator
    if settings.AFFILIATE_AGGREGATOR_PREFIX:
        import urllib.parse
        encoded_dest = urllib.parse.quote_plus(clean_url)
        return f"{settings.AFFILIATE_AGGREGATOR_PREFIX}{encoded_dest}"

    parsed = urlparse(clean_url)
    query = parse_qs(parsed.query)

    # 2. Amazon Direct Affiliate Tag
    if merchant.lower() == "amazon" and settings.AMAZON_AFFILIATE_TAG:
        query["tag"] = [settings.AMAZON_AFFILIATE_TAG]
        # Remove any stray ref tags
        query.pop("ref", None)
        query.pop("ref_", None)
        new_query = urlencode(query, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    # 3. Flipkart Direct Affiliate ID
    if merchant.lower() == "flipkart" and settings.FLIPKART_AFFILIATE_ID:
        query["affid"] = [settings.FLIPKART_AFFILIATE_ID]
        new_query = urlencode(query, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    return clean_url
