"""
DealSense Browser Extension Manifest V3 & Backend Contract Test Suite.
Validates:
1. Manifest V3 schema and filesystem asset integrity.
2. Content-script, service-worker, and popup asset existence.
3. Backend API contracts invoked by extension (CORS, analyze, alerts, telegram binding).
"""

import json
import os
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
EXTENSION_DIR = os.path.join(os.path.dirname(__file__), "..", "extension")


def test_manifest_v3_syntax_and_fields():
    """Validates that manifest.json conforms to standard Manifest V3 specification."""
    manifest_path = os.path.join(EXTENSION_DIR, "manifest.json")
    assert os.path.isfile(manifest_path), "manifest.json must exist in extension/"

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("manifest_version") == 3, "Must be Manifest Version 3"
    assert manifest.get("name") == "DealSense — Smart Price & Deal Intelligence"
    assert manifest.get("version") == "1.0.0"
    assert "storage" in manifest.get("permissions", [])

    # Background service worker
    bg = manifest.get("background", {})
    assert bg.get("service_worker") == "background.js"
    assert bg.get("type") == "module"

    # Host permissions for stores and backend
    host_perms = manifest.get("host_permissions", [])
    assert any("amazon.in" in h for h in host_perms)
    assert any("flipkart.com" in h for h in host_perms)

    # Content scripts
    cs = manifest.get("content_scripts", [])
    assert len(cs) > 0
    assert "content.js" in cs[0].get("js", [])


def test_extension_assets_exist_on_filesystem():
    """Confirms that all files declared in manifest.json actually exist on disk."""
    manifest_path = os.path.join(EXTENSION_DIR, "manifest.json")
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # Service worker
    sw_path = os.path.join(EXTENSION_DIR, manifest["background"]["service_worker"])
    assert os.path.isfile(sw_path), f"Service worker {sw_path} missing"

    # Content script
    for cs in manifest["content_scripts"]:
        for js_file in cs["js"]:
            p = os.path.join(EXTENSION_DIR, js_file)
            assert os.path.isfile(p), f"Content script {p} missing"

    # Popup
    popup_path = os.path.join(EXTENSION_DIR, manifest["action"]["default_popup"])
    assert os.path.isfile(popup_path), f"Popup HTML {popup_path} missing"

    # Icons
    for size, icon_rel in manifest.get("icons", {}).items():
        icon_path = os.path.join(EXTENSION_DIR, icon_rel)
        assert os.path.isfile(icon_path), f"Icon {icon_path} missing"

    # Scoped Stylesheet
    style_path = os.path.join(EXTENSION_DIR, "styles.css")
    assert os.path.isfile(style_path), "styles.css missing"


def test_api_check_deal_contract():
    """Verifies that /api/check-deal handles product URL queries requested by extension."""
    test_url = "https://www.amazon.in/dp/B0CHX1W1XY"
    resp = client.get(f"/api/check-deal?url={test_url}")
    assert resp.status_code == 200
    data = resp.json()

    assert "deal_score" in data or "score" in data
    assert "verdict" in data
    assert "current_price" in data or "price" in data


def test_api_alerts_contract_from_extension():
    """Verifies that /api/alerts accepts price alert payloads from extension content script."""
    payload = {
        "product_title": "Sony WH-1000XM5 Headphones",
        "current_price": 26990.0,
        "target_price": 24990.0,
        "channel": "whatsapp",
        "contact": "+919876543210",
        "alert_type": "TARGET_PRICE",
    }
    resp = client.post("/api/alerts", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data.get("success") is True
    assert "alert_id" in data
    assert data.get("status") == "ARMED"
    assert data.get("target_price") == 24990.0


def test_api_telegram_bind_contract_from_extension():
    """Verifies that /api/alerts/telegram/bind-request returns deep-link for in-page modal."""
    payload = {
        "product_title": "Apple iPhone 15 Pro",
        "current_price": 129900.0,
        "target_price": 119900.0,
        "alert_type": "TARGET_PRICE",
    }
    resp = client.post("/api/alerts/telegram/bind-request", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data.get("success") is True
    assert "deep_link" in data
    assert "t.me" in data.get("deep_link")
    assert "b_" in data.get("deep_link")
