"""
DealSense Affiliate Gateway & Outbound URL Router.
Implements dual-rail monetization with automatic fallback:
- Tier 1: Direct Associate Tag injection (e.g. Amazon Associates tag=dealsense-21)
- Tier 2: Cuelinks V3 /links/convert fallback for sub-affiliate monetization on secondary
          or unapproved direct stores (Flipkart, Croma, Tata CLiQ, Myntra) with Sub-ID telemetry.
- Tier 3: Clean canonical URL fallback when monetization is unapproved or conversion fails,
          preserving user trust and eliminating redirect loops.
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


def convert_via_cuelinks(
    clean_url: str,
    merchant_slug: str,
    listing_id: Optional[int] = None,
    verdict: Optional[str] = None,
    subids: Optional[Dict[str, str]] = None,
    campaign_id: Optional[int] = None,
    client: Optional[httpx.Client] = None,
) -> Optional[OutboundMonetizationResult]:
    """
    Attempts conversion of a clean product URL via Cuelinks V3 Publisher API.
    Returns OutboundMonetizationResult if monetized, or None if conversion fails/unaffiliated.
    """
    if not settings.CUELINKS_API_KEY:
        return None

    base_url = (settings.CUELINKS_BASE_URL or "https://api.cuelinks.com/v3").rstrip("/")
    endpoint = f"{base_url}/links/convert"
    headers = {
        "Authorization": f"Token {settings.CUELINKS_API_KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "DealSense-Backend/1.0",
    }
    payload = {
        "url": clean_url,
        "channel_id": getattr(settings, "CUELINKS_CHANNEL_ID", 317867) or 317867,
        "subid": str(listing_id or "0"),
        "subid2": merchant_slug,
        "subid3": "deal_analyze",
        "subid4": str(verdict or "UNKNOWN"),
    }
    if subids:
        for s_key in ("subid", "subid2", "subid3", "subid4"):
            if s_key in subids and subids[s_key]:
                payload[s_key] = str(subids[s_key])

    try:
        http_client = client or httpx.Client(timeout=4.0)
        try:
            resp = http_client.post(endpoint, json=payload, headers=headers)
            if resp.status_code == 200:
                raw_json = resp.json()
                data = raw_json.get("data", raw_json) if isinstance(raw_json, dict) else {}
                tracking_url = data.get("tracking_url") or data.get("url") or data.get("affiliate_url")
                affiliated = bool(data.get("affiliated", False))
                if tracking_url and affiliated:
                    return OutboundMonetizationResult(
                        outbound_url=tracking_url,
                        is_monetized=True,
                        affiliate_type="cuelinks_v3",
                        campaign_id=campaign_id,
                    )
        finally:
            if not client:
                http_client.close()
    except Exception as e:
        logger.warning(f"[AffiliateGateway] Cuelinks conversion failed for {clean_url}: {e}")

    return None


def resolve_outbound_affiliate_url(
    adapter: BaseMerchantAdapter,
    clean_url: str,
    listing_id: Optional[int] = None,
    verdict: Optional[str] = None,
    subids: Optional[Dict[str, str]] = None,
    client: Optional[httpx.Client] = None,
) -> OutboundMonetizationResult:
    """
    Routes outbound purchase clicks cleanly and safely based on verified multi-tier monetization policy:
    1. Direct Tag (e.g. Amazon Associates) if active and available.
    2. Sub-Affiliate Cuelinks V3 fallback if direct tag is unapproved/unavailable or for secondary stores.
    3. Clean URL fallback if affiliate programs are unavailable or API conversion fails.
    """
    # -------------------------------------------------------------------------
    # Tier 1: Direct Associate Tag (e.g. Amazon India)
    # -------------------------------------------------------------------------
    if adapter.affiliate_type == "direct_tag" and adapter.is_affiliate_available():
        tagged_url = adapter.generate_affiliate_url(clean_url, subids=subids)
        return OutboundMonetizationResult(
            outbound_url=tagged_url,
            is_monetized=True,
            affiliate_type="direct_tag",
            campaign_id=adapter.cuelinks_campaign_id,
        )

    # -------------------------------------------------------------------------
    # Tier 2: Sub-Affiliate Fallback via Cuelinks V3
    # Applies to:
    # - Merchants with affiliate_type == "cuelinks_v3"
    # - Direct tag merchants that are currently unapproved or pending direct accounts
    # -------------------------------------------------------------------------
    cuelinks_res = convert_via_cuelinks(
        clean_url=clean_url,
        merchant_slug=adapter.merchant_slug,
        listing_id=listing_id,
        verdict=verdict,
        subids=subids,
        campaign_id=adapter.cuelinks_campaign_id,
        client=client,
    )
    if cuelinks_res:
        return cuelinks_res

    # -------------------------------------------------------------------------
    # Tier 3: Clean URL Fallback (Preserve trust, zero broken redirects)
    # -------------------------------------------------------------------------
    fallback_type = "unverified_store_id" if adapter.affiliate_type == "direct_tag" else "clean_fallback"
    return OutboundMonetizationResult(
        outbound_url=clean_url,
        is_monetized=False,
        affiliate_type=fallback_type,
        campaign_id=adapter.cuelinks_campaign_id,
    )
