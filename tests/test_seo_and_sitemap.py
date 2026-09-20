"""
DealSense SEO, SSR Comparison & XML Sitemap Test Suite.
Validates:
1. Slug generation and product lookup.
2. Programmatic SSR /compare/{slug} rendering, Schema.org JSON-LD, and meta tags.
3. XML Sitemap hierarchy (/sitemap.xml, /sitemap-main.xml, /sitemap-products.xml).
4. robots.txt crawler policy.
"""

import xml.etree.ElementTree as ET
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.main import app
from backend.database import get_session
from backend.models import Product
from backend.services.seo_service import slugify, get_product_slug, resolve_product_from_slug

client = TestClient(app)


def test_slugify_helper():
    """Verifies that titles are sanitized into clean, lowercase URL slugs."""
    assert slugify("Apple iPhone 15 (128GB) - Blue") == "apple-iphone-15-128gb-blue"
    assert slugify("Sony WH-1000XM5 Noise-Canceling Headphones!") == "sony-wh-1000xm5-noise-canceling-headphones"
    assert slugify("   Special & Deal   ") == "special-deal"
    assert slugify("") == "deal"


def test_resolve_product_from_slug():
    """Verifies resolution of canonical product by slug with -p<ID> suffix."""
    with get_session() as session:
        product = session.exec(select(Product)).first()
        assert product is not None, "Database must have at least one product"

        slug = get_product_slug(product)
        resolved = resolve_product_from_slug(session, slug)
        assert resolved is not None
        assert resolved.id == product.id


def test_ssr_compare_page_success():
    """Verifies that /compare/{slug} returns rich pre-rendered HTML with microdata."""
    with get_session() as session:
        product = session.exec(select(Product)).first()
        assert product is not None

        slug = get_product_slug(product)

    resp = client.get(f"/compare/{slug}")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]

    html = resp.text
    # Meta verification
    assert "<title>" in html
    assert product.canonical_title in html
    assert 'meta name="description"' in html
    assert 'meta property="og:title"' in html
    assert 'meta property="og:image"' in html

    # Schema.org structured data
    assert 'application/ld+json' in html
    assert '"@type": "Product"' in html

    # Content verification
    assert "True Landed Cost Breakdown" in html
    assert "Amazon India" in html
    assert "Flipkart" in html


def test_ssr_compare_page_404_for_unknown_slug():
    """Verifies 404 response when requesting non-existent product slug."""
    resp = client.get("/compare/non-existent-product-fake-123456789-p999999")
    assert resp.status_code == 404
    assert "not found" in resp.json().get("detail", "").lower()


def test_sitemap_index_xml():
    """Verifies that /sitemap.xml is valid XML pointing to child sitemaps."""
    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    assert "xml" in resp.headers["content-type"]

    root = ET.fromstring(resp.content)
    # Check sitemapindex tag
    assert "sitemapindex" in root.tag
    locs = [elem.text for elem in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert any("sitemap-main.xml" in loc for loc in locs)
    assert any("sitemap-products.xml" in loc for loc in locs)


def test_sitemap_main_xml():
    """Verifies that /sitemap-main.xml contains core public routes."""
    resp = client.get("/sitemap-main.xml")
    assert resp.status_code == 200
    assert "xml" in resp.headers["content-type"]

    root = ET.fromstring(resp.content)
    assert "urlset" in root.tag
    locs = [elem.text for elem in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert any("/deals" in loc for loc in locs)
    assert any("/categories" in loc for loc in locs)


def test_sitemap_products_xml():
    """Verifies that /sitemap-products.xml contains /compare/ product URLs."""
    resp = client.get("/sitemap-products.xml")
    assert resp.status_code == 200
    assert "xml" in resp.headers["content-type"]

    root = ET.fromstring(resp.content)
    assert "urlset" in root.tag
    locs = [elem.text for elem in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
    assert len(locs) > 0
    assert any("/compare/" in loc for loc in locs)


def test_robots_txt():
    """Verifies robots.txt crawler permissions and sitemap link."""
    resp = client.get("/robots.txt")
    assert resp.status_code == 200
    assert "text/plain" in resp.headers["content-type"]

    text = resp.text
    assert "User-agent: *" in text
    assert "Allow: /compare/" in text
    assert "Disallow: /api/" in text
    assert "Sitemap:" in text
    assert "sitemap.xml" in text
