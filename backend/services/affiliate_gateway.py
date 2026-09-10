"""
DealSense Affiliate Gateway & Outbound URL Router.
Implements dual-rail monetization:
- Direct Amazon Associates tag injection (tag=dealintel-21)
- Cuelinks V3 /links/convert for pre-approved merchants with sub-ID telemetry
- Clean URL fallback for pending/unsupported merchants (Flipkart) to preserve user trust.
"""

from dataclasses import dataclass
import logging
from typing import Dict, Any, Optional
import httpx

from backend.config import settings
from backend.services.merchant_adapters import BaseMerchantAdapter

logger = logging.getLogger(__name__)


@dataclass
class OutboundMonetizationResult:
    outbound_url: str
    is_monetized: bool
    affiliate_type: str  # 'direct_tag' | 'cuelinks_v3' | 'clean_fallback'
    campaign_id: Optional[int] = None


def resolve_outbound_affiliate_url(
    adapter: BaseMerchantAdapter,
    clean_url: str,
    listing_id: Optional[int] = None,
    verdict: Optional[str] = None,
) -> OutboundMonetizationResult:
    """
    Routes outbound purchase clicks cleanly and safely based on verified merchant policy.
    Never crashes on third-party network failures.
    """
    # 1. If merchant is Direct Tag (e.g. Amazon India)
    if adapter.affiliate_type == "direct_tag":
        is_available = adapter.is_affiliate_available()
        tagged_url = adapter.generate_affiliate_url(clean_url)
        return OutboundMonetizationResult(
            outbound_url=tagged_url,
            is_monetized=is_available,
            affiliate_type="direct_tag" if is_available else "unverified_store_id",
            campaign_id=adapter.cuelinks_campaign_id,
        )

    # 2. If merchant is not affiliated / pending (e.g. Flipkart today)
    if not adapter.is_affiliate_available():
        return OutboundMonetizationResult(
            outbound_url=clean_url,
            is_monetized=False,
            affiliate_type="clean_fallback",
            campaign_id=adapter.cuelinks_campaign_id,
        )

    # 3. If merchant is approved on Cuelinks (Tata CLiQ, Vijay Sales, Nykaa)
    # If API key is not configured, fall back cleanly
    if not settings.CUELINKS_API_KEY:
        return OutboundMonetizationResult(
            outbound_url=clean_url,
            is_monetized=False,
            affiliate_type="clean_fallback",
            campaign_id=adapter.cuelinks_campaign_id,
        )

    # Convert via Cuelinks V3 API with telemetry Sub-IDs
    base_url = settings.CUELINKS_BASE_URL.rstrip("/")
    endpoint = f"{base_url}/links/convert"
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }
    payload = {
        "url": clean_url,
        "channel_id": 317867,  # Verified DealSense Channel
        "subid": str(listing_id or "0"),
        "subid2": adapter.merchant_slug,
        "subid3": "deal_analyze",
        "subid4": str(verdict or "UNKNOWN"),
    }

    try:
        with httpx.Client(timeout=4.0) as client:
            resp = client.post(endpoint, json=payload, headers=headers)
            if resp.status_code == 200:
                raw_json = resp.json()
                # Cuelinks V3 wraps link details inside {"data": {"tracking_url": "...", "affiliated": True/False, ...}}
                data = raw_json.get("data", raw_json) if isinstance(raw_json, dict) else {}
                tracking_url = data.get("tracking_url") or data.get("url") or data.get("affiliate_url")
                affiliated = bool(data.get("affiliated", False))
                if tracking_url and affiliated:
                    return OutboundMonetizationResult(
                        outbound_url=tracking_url,
                        is_monetized=True,
                        affiliate_type="cuelinks_v3",
                        campaign_id=adapter.cuelinks_campaign_id,
                    )
    except Exception as e:
        logger.warning(f"Cuelinks conversion failed for {clean_url}: {e}")

    # Fallback if conversion fails or affiliated is False
    return OutboundMonetizationResult(
        outbound_url=clean_url,
        is_monetized=False,
        affiliate_type="clean_fallback",
        campaign_id=adapter.cuelinks_campaign_id,
    )
