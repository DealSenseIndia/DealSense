"""
Automated Test Suite for DealWise Backend Foundation & Homepage Freeze.
"""
import sys
import unittest
import urllib.request
import json
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding="utf-8")

from backend.database import get_session
from backend.models import (
    Product,
    MerchantListing,
    PriceObservation,
    Category,
    SetupCategory,
    Setup,
    SetupItem,
)
from backend.services.deal_intelligence import calculate_deal_intelligence
from backend.services.merchant_adapters import AmazonAdapter, FlipkartAdapter, get_adapter_for_url


class TestDealWiseFoundation(unittest.TestCase):

    def test_01_homepage_api_contract(self):
        """Verify GET /api/homepage returns expected contracts and 200 OK."""
        req = urllib.request.urlopen("http://127.0.0.1:8000/api/homepage")
        self.assertEqual(req.status, 200)
        data = json.loads(req.read().decode())

        self.assertIn("featured_setups", data)
        self.assertIn("product_categories", data)
        self.assertIn("featured_deals", data)
        self.assertIn("supported_merchants", data)
        self.assertIn("stats", data)

        self.assertGreaterEqual(len(data["featured_setups"]), 4)
        self.assertGreaterEqual(len(data["product_categories"]), 4)
        self.assertGreaterEqual(len(data["featured_deals"]), 6)

    def test_02_strictly_amazon_and_flipkart_only(self):
        """Verify only Amazon and Flipkart are active merchants."""
        req = urllib.request.urlopen("http://127.0.0.1:8000/api/homepage")
        data = json.loads(req.read().decode())

        merchant_names = [m["name"] for m in data["supported_merchants"]]
        self.assertEqual(sorted(merchant_names), ["Amazon", "Flipkart"])

        # All featured deals must be Amazon or Flipkart
        deal_merchants = set(d["merchant"] for d in data["featured_deals"])
        for m in deal_merchants:
            self.assertIn(m.lower(), ["amazon", "flipkart"])

    def test_03_category_hierarchy_tree(self):
        """Verify GET /api/categories returns nested category tree."""
        req = urllib.request.urlopen("http://127.0.0.1:8000/api/categories")
        self.assertEqual(req.status, 200)
        data = json.loads(req.read().decode())

        root_names = [c["name"] for c in data]
        self.assertIn("Electronics", root_names)
        self.assertIn("Home & Living", root_names)

        electronics = next(c for c in data if c["name"] == "Electronics")
        self.assertGreater(len(electronics["children"]), 0)
        child_names = [c["name"] for c in electronics["children"]]
        self.assertIn("Mobiles", child_names)
        self.assertIn("Computers", child_names)

    def test_04_setups_endpoint(self):
        """Verify GET /api/setups returns setup categories."""
        req = urllib.request.urlopen("http://127.0.0.1:8000/api/setups")
        self.assertEqual(req.status, 200)
        data = json.loads(req.read().decode())

        names = [s["name"] for s in data]
        self.assertIn("Bedroom", names)
        self.assertIn("Gaming Setup", names)
        self.assertIn("Home Office", names)

    def test_05_deal_intelligence_buy_wait_avoid(self):
        """Verify BUY, WAIT, and AVOID verdicts with structured evidence."""
        now = datetime.now(timezone.utc)

        # 1. Near All-Time Low -> BUY
        history_buy = [
            PriceObservation(listing_id=1, price=5000, observed_at=now - timedelta(days=60)),
            PriceObservation(listing_id=1, price=4500, observed_at=now - timedelta(days=30)),
            PriceObservation(listing_id=1, price=4000, observed_at=now - timedelta(days=5)),
        ]
        intel_buy = calculate_deal_intelligence(
            current_price=4050, mrp=6999, merchant="Amazon", history=history_buy
        )
        self.assertEqual(intel_buy.verdict, "BUY")
        self.assertIn("facts", dir(intel_buy))
        self.assertIn("calculations", dir(intel_buy))

        # 2. Significant markup above low -> WAIT
        intel_wait = calculate_deal_intelligence(
            current_price=5400, mrp=6999, merchant="Amazon", history=history_buy
        )
        self.assertEqual(intel_wait.verdict, "WAIT")

        # 3. Out of stock -> AVOID
        intel_avoid = calculate_deal_intelligence(
            current_price=4000, mrp=6999, merchant="Amazon", history=history_buy, in_stock=False
        )
        self.assertEqual(intel_avoid.verdict, "AVOID")

    def test_06_merchant_adapters_security(self):
        """Verify Amazon & Flipkart adapters are safely disabled without secrets and enforce allowlists."""
        amz = AmazonAdapter()
        fk = FlipkartAdapter()

        self.assertFalse(amz.is_enabled)
        self.assertFalse(fk.is_enabled)

        amz_url = "https://www.amazon.in/dp/B0DGJ68D4N"
        self.assertEqual(amz.extract_product_id(amz_url), "B0DGJ68D4N")
        self.assertIn("tag=", amz.generate_affiliate_link(amz_url))

        fk_url = "https://www.flipkart.com/boat-wave-call-2/p/itm123456"
        self.assertEqual(fk.extract_product_id(fk_url), "itm123456")
        self.assertIn("affid=", fk.generate_affiliate_link(fk_url))

        # Disallowed merchant must return None
        self.assertIsNone(get_adapter_for_url("https://untrusted-store.com/item/123"))

    def test_07_invalid_url_handling(self):
        """Verify API rejects invalid or unsupported URLs gracefully."""
        payload = json.dumps({"url": "https://random-scam-site.com/phone"}).encode("utf-8")
        req = urllib.request.Request(
            "http://127.0.0.1:8000/api/check-deal",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(req)
            self.fail("Expected 400 Bad Request for unsupported merchant")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 400)


if __name__ == "__main__":
    unittest.main()
