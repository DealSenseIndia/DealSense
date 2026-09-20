"""
Unit and contract tests for DealSense Phase 6: Multi-Store Retail Arbitrage.
Validates URL resolution, stealth extraction, affiliate routing, and multi-store comparison
for Croma and Reliance Digital.
"""

import pytest
from backend.resolver import resolve_product_url, ALLOWED_DOMAINS, ResolvedURL
from backend.extractor import (
    extract_croma_data,
    extract_reliance_digital_data,
    extract_product_data,
    ExtractedProduct,
)
from backend.services.merchant_adapters import adapter_registry, CromaAdapter, RelianceDigitalAdapter
from backend.services.affiliate_gateway import resolve_outbound_affiliate_url
from backend.services.store_comparison import (
    build_multi_store_comparison_table,
    build_compare_stores_table,
    _get_merchant_logo,
)


def test_allowed_domains_security():
    """Confirms Croma and Reliance Digital are in the allowlist to permit safe requests."""
    assert "croma.com" in ALLOWED_DOMAINS
    assert "www.croma.com" in ALLOWED_DOMAINS
    assert "reliancedigital.in" in ALLOWED_DOMAINS
    assert "www.reliancedigital.in" in ALLOWED_DOMAINS


def test_resolve_croma_url():
    """Verifies that Croma URLs normalize canonical product IDs and clean URLs."""
    url1 = "https://www.croma.com/apple-iphone-15-128gb-black-/p/300755?utm_source=deal"
    res1 = resolve_product_url(url1)
    assert res1.merchant == "Croma"
    assert res1.product_id == "300755"
    assert "300755" in res1.clean_url

    url2 = "https://croma.com/p/264301"
    res2 = resolve_product_url(url2)
    assert res2.merchant == "Croma"
    assert res2.product_id == "264301"


def test_resolve_reliance_digital_url():
    """Verifies that Reliance Digital URLs normalize canonical product IDs and clean URLs."""
    url1 = "https://www.reliancedigital.in/apple-iphone-15-128-gb-black/p/493839352?discount=true"
    res1 = resolve_product_url(url1)
    assert res1.merchant == "Reliance Digital"
    assert res1.product_id == "493839352"
    assert "493839352" in res1.clean_url

    url2 = "https://reliancedigital.in/p/501234567"
    res2 = resolve_product_url(url2)
    assert res2.merchant == "Reliance Digital"
    assert res2.product_id == "501234567"


def test_adapter_registry_lookup():
    """Verifies that adapter_registry correctly identifies Croma and Reliance Digital adapters."""
    croma_url = "https://www.croma.com/p/300755"
    adapter_croma, norm_croma = adapter_registry.resolve_url(croma_url)
    assert adapter_croma is not None
    assert isinstance(adapter_croma, CromaAdapter)
    assert norm_croma.merchant == "Croma"
    assert norm_croma.product_id == "300755"

    rd_url = "https://www.reliancedigital.in/p/493839352"
    adapter_rd, norm_rd = adapter_registry.resolve_url(rd_url)
    assert adapter_rd is not None
    assert isinstance(adapter_rd, RelianceDigitalAdapter)
    assert norm_rd.merchant == "Reliance Digital"
    assert norm_rd.product_id == "493839352"


def test_extract_croma_html_mock():
    """Verifies parsing of Croma HTML containing Schema.org JSON-LD and price elements."""
    mock_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Apple iPhone 15 (128GB, Black)",
        "image": "https://media.croma.com/image/upload/v1/iphone15.jpg",
        "brand": {"@type": "Brand", "name": "Apple"},
        "offers": {
          "@type": "Offer",
          "price": "71990",
          "priceCurrency": "INR",
          "availability": "https://schema.org/InStock"
        }
      }
      </script>
    </head>
    <body>
      <h1 class="pd-title">Apple iPhone 15 (128GB, Black)</h1>
      <span class="amount">₹71,990</span>
      <span class="old-price">₹79,900</span>
    </body>
    </html>
    """
    res = ResolvedURL(merchant="Croma", product_id="300755", clean_url="https://www.croma.com/p/300755", raw_url="https://www.croma.com/p/300755")
    extracted = extract_croma_data(res, raw_html_override=mock_html)

    assert extracted.merchant == "Croma"
    assert extracted.merchant_product_id == "300755"
    assert extracted.title == "Apple iPhone 15 (128GB, Black)"
    assert extracted.price == 71990.0
    assert extracted.mrp == 79900.0
    assert extracted.brand == "Apple"
    assert extracted.in_stock is True


def test_extract_reliance_digital_html_mock():
    """Verifies parsing of Reliance Digital HTML containing Schema.org JSON-LD and price elements."""
    mock_html = """
    <!DOCTYPE html>
    <html>
    <head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": "Apple iPhone 15 128 GB, Black",
        "image": "https://www.reliancedigital.in/medias/iPhone15.jpg",
        "brand": "Apple",
        "offers": {
          "@type": "Offer",
          "price": "71999",
          "priceCurrency": "INR",
          "availability": "https://schema.org/InStock"
        }
      }
      </script>
    </head>
    <body>
      <h1 class="pdp__title">Apple iPhone 15 128 GB, Black</h1>
      <span class="TextWeb__Text-sc-1cyx778-0">₹71,999</span>
      <span class="pdp__mrpPrice">₹79,900</span>
    </body>
    </html>
    """
    res = ResolvedURL(merchant="Reliance Digital", product_id="493839352", clean_url="https://www.reliancedigital.in/p/493839352", raw_url="https://www.reliancedigital.in/p/493839352")
    extracted = extract_reliance_digital_data(res, raw_html_override=mock_html)

    assert extracted.merchant == "Reliance Digital"
    assert extracted.merchant_product_id == "493839352"
    assert extracted.title == "Apple iPhone 15 128 GB, Black"
    assert extracted.price == 71999.0
    assert extracted.mrp == 79900.0
    assert extracted.brand == "Apple"
    assert extracted.in_stock is True


def test_croma_and_reliance_affiliate_campaigns():
    """Verifies Cuelinks campaign metadata for Croma (1007) and Reliance Digital (1052)."""
    croma = CromaAdapter()
    assert croma.cuelinks_campaign_id == 1007
    assert croma.affiliate_type == "cuelinks_v3"
    assert croma.is_affiliate_available() is True

    rd = RelianceDigitalAdapter()
    assert rd.cuelinks_campaign_id == 1052
    assert rd.affiliate_type == "cuelinks_v3"
    assert rd.is_affiliate_available() is True

    # Outbound routing without Cuelinks token cleanly falls back to canonical URL
    outbound_croma = resolve_outbound_affiliate_url(croma, "https://www.croma.com/p/300755")
    assert outbound_croma.outbound_url == "https://www.croma.com/p/300755"

    outbound_rd = resolve_outbound_affiliate_url(rd, "https://www.reliancedigital.in/p/493839352")
    assert outbound_rd.outbound_url == "https://www.reliancedigital.in/p/493839352"


def test_multi_store_comparison_table_ranking():
    """Verifies that multi-store comparison ranks Amazon, Flipkart, Croma, and Reliance Digital correctly."""
    listings = [
        {"name": "Amazon", "price": 72999.0, "mrp": 79900.0, "clean_url": "https://amazon.in/dp/B0CHX1W1XY"},
        {"name": "Flipkart", "price": 72490.0, "mrp": 79900.0, "clean_url": "https://flipkart.com/p/itm123"},
        {"name": "Croma", "price": 71990.0, "mrp": 79900.0, "clean_url": "https://croma.com/p/300755"},
        {"name": "Reliance Digital", "price": 71999.0, "mrp": 79900.0, "clean_url": "https://reliancedigital.in/p/493839352"},
    ]

    result = build_multi_store_comparison_table(listings, mrp=79900.0)

    stores = result["stores"]
    assert len(stores) == 4
    # Stores must be sorted by price ascending: Croma (71990) -> Reliance Digital (71999) -> Flipkart (72490) -> Amazon (72999)
    assert stores[0]["name"] == "Croma"
    assert stores[0]["is_lowest"] is True
    assert stores[0]["price"] == 71990.0

    assert stores[1]["name"] == "Reliance Digital"
    assert stores[1]["price"] == 71999.0

    assert stores[2]["name"] == "Flipkart"
    assert stores[3]["name"] == "Amazon"

    assert result["lowest_store"] == "Croma"
    assert result["price_difference"] == 1009  # 72999 - 71990
    assert "Croma is ₹1,009 cheaper than Amazon" in result["savings_callout"]

    # Verify merchant logos
    assert _get_merchant_logo("Croma") == "/assets/croma-logo.svg"
    assert _get_merchant_logo("Reliance Digital") == "/assets/reliance-digital-logo.svg"
