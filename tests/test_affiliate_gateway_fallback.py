"""
DealSense Sub-Affiliate Fallback Routing Test Suite.
Verifies multi-tier outbound monetization routing:
- Tier 1: Direct Associate Tag injection
- Tier 2: Sub-Affiliate Cuelinks V3 fallback
- Tier 3: Clean URL fallback (zero broken redirects)
"""

from unittest.mock import MagicMock, patch
import pytest
import httpx

from backend.config import settings
from backend.services.merchant_adapters import AmazonAdapter, FlipkartAdapter
from backend.services.affiliate_gateway import (
    resolve_outbound_affiliate_url,
    convert_via_cuelinks,
    OutboundMonetizationResult,
)


def test_tier1_direct_tag_for_amazon():
    """Verifies that active direct tag merchants generate direct affiliate URLs."""
    adapter = AmazonAdapter()
    url = "https://www.amazon.in/dp/B0CHX1W1XY"

    result = resolve_outbound_affiliate_url(adapter, url)
    assert result.is_monetized is True
    assert result.affiliate_type == "direct_tag"
    assert "tag=" in result.outbound_url


def test_tier2_cuelinks_fallback_success():
    """Verifies that when Cuelinks V3 successfully converts, the tracking URL is returned."""
    adapter = FlipkartAdapter()
    url = "https://www.flipkart.com/apple-iphone-15/p/itm12345"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {
            "tracking_url": "https://cuelinks.com/link?url=https://www.flipkart.com/apple-iphone-15/p/itm12345",
            "affiliated": True,
        }
    }

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.post.return_value = mock_resp

    with patch.object(settings, "CUELINKS_API_KEY", "test_key_123"):
        result = resolve_outbound_affiliate_url(adapter, url, client=mock_client)
        assert result.is_monetized is True
        assert result.affiliate_type == "cuelinks_v3"
        assert "cuelinks.com" in result.outbound_url


def test_tier3_clean_fallback_when_cuelinks_fails():
    """Verifies clean URL fallback when Cuelinks API key is absent or conversion fails."""
    adapter = FlipkartAdapter()
    url = "https://www.flipkart.com/apple-iphone-15/p/itm12345"

    # Case A: No API key
    with patch.object(settings, "CUELINKS_API_KEY", None):
        result = resolve_outbound_affiliate_url(adapter, url)
        assert result.is_monetized is False
        assert result.affiliate_type == "clean_fallback"
        assert result.outbound_url == url

    # Case B: Unaffiliated merchant response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "data": {
            "tracking_url": None,
            "affiliated": False,
        }
    }
    mock_client = MagicMock(spec=httpx.Client)
    mock_client.post.return_value = mock_resp

    with patch.object(settings, "CUELINKS_API_KEY", "test_key_123"):
        result = resolve_outbound_affiliate_url(adapter, url, client=mock_client)
        assert result.is_monetized is False
        assert result.affiliate_type == "clean_fallback"
        assert result.outbound_url == url


def test_tier3_clean_fallback_on_network_exception():
    """Verifies that network exceptions never crash outbound resolution and fall back cleanly."""
    adapter = FlipkartAdapter()
    url = "https://www.flipkart.com/apple-iphone-15/p/itm12345"

    mock_client = MagicMock(spec=httpx.Client)
    mock_client.post.side_effect = httpx.ConnectTimeout("Connection timed out")

    with patch.object(settings, "CUELINKS_API_KEY", "test_key_123"):
        result = resolve_outbound_affiliate_url(adapter, url, client=mock_client)
        assert result.is_monetized is False
        assert result.affiliate_type == "clean_fallback"
        assert result.outbound_url == url
