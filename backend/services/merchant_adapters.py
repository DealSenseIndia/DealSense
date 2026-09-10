"""
DealSense Merchant Adapters & URL Resolution Engine.
Defines modular, store-specific adapters for Amazon, Flipkart, Tata CLiQ, Vijay Sales, and Nykaa.
Decouples URL normalization, product extraction, and monetization routing.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import json
import re
from typing import Dict, Any, List, Optional, Set, Tuple
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from backend.config import settings


@dataclass
class NormalizedURL:
    merchant: str
    merchant_slug: str
    product_id: str
    clean_url: str
    raw_url: str


@dataclass
class ExtractedProductData:
    merchant: str
    merchant_product_id: str
    clean_url: str
    title: str
    price: Optional[float] = None
    mrp: Optional[float] = None
    currency: str = "INR"
    in_stock: bool = True
    brand: Optional[str] = None
    model_number: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    variant_raw: Optional[str] = None
    seller: Optional[str] = None
    extraction_source: str = "html_json_ld"
    confidence: str = "high"


class BaseMerchantAdapter(ABC):
    """Abstract interface defining required capabilities for every supported merchant."""

    merchant_name: str
    merchant_slug: str
    supported_domains: Set[str]
    is_core: bool = True
    affiliate_type: str = "none"  # 'direct_tag' | 'cuelinks_v3' | 'none'
    cuelinks_campaign_id: Optional[int] = None

    def matches_url(self, url: str) -> bool:
        """Determines if this adapter owns the submitted domain."""
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        return any(d in hostname for d in self.supported_domains)

    @abstractmethod
    def extract_product_id(self, url: str) -> Optional[str]:
        """Extracts canonical merchant product identifier (e.g. ASIN, PID, SKU)."""
        pass

    @abstractmethod
    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        """Strips session tokens and returns canonical merchant product URL."""
        pass

    @abstractmethod
    def is_affiliate_available(self) -> bool:
        """Indicates whether this merchant is currently approved and earning commissions."""
        pass

    def generate_affiliate_url(
        self,
        clean_url: str,
        subids: Optional[Dict[str, str]] = None,
    ) -> str:
        """Generates the appropriate outbound affiliate URL or returns clean URL if unmonetized."""
        return clean_url

    def extract_from_html(self, html_content: str, clean_url: str, product_id: str) -> Optional[ExtractedProductData]:
        """Default robust extraction using Schema.org JSON-LD and meta tags."""
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html_content, "html.parser")

        title = None
        price = None
        mrp = None
        brand = None
        image_url = None
        in_stock = True
        currency = "INR"

        # 1. Try JSON-LD structured data first (Highest reliability)
        for script in soup.find_all("script", type="application/ld+json"):
            if not script.string:
                continue
            try:
                raw_json = json.loads(script.string.strip())
                items = raw_json if isinstance(raw_json, list) else [raw_json]
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    item_type = item.get("@type", "")
                    if item_type in ("Product", "IndividualProduct", "ItemPage") or "Product" in str(item_type):
                        if not title and item.get("name"):
                            title = str(item.get("name")).strip()
                        if not brand:
                            b_val = item.get("brand")
                            brand = b_val.get("name") if isinstance(b_val, dict) else str(b_val) if b_val else None
                        if not image_url and item.get("image"):
                            img = item.get("image")
                            image_url = img[0] if isinstance(img, list) else str(img)

                        offers = item.get("offers")
                        if offers:
                            o_list = offers if isinstance(offers, list) else [offers]
                            for off in o_list:
                                if isinstance(off, dict) and not price and off.get("price"):
                                    try:
                                        p_clean = re.sub(r"[^0-9.]", "", str(off.get("price")))
                                        price = float(p_clean)
                                    except ValueError:
                                        pass
                                if isinstance(off, dict) and off.get("priceCurrency"):
                                    currency = str(off.get("priceCurrency"))
                                if isinstance(off, dict) and off.get("availability"):
                                    avail_str = str(off.get("availability")).lower()
                                    in_stock = "instock" in avail_str or "in_stock" in avail_str
            except Exception:
                continue

        # 2. OpenGraph / Twitter meta tags fallback
        if not title:
            og_title = soup.find("meta", property="og:title") or soup.find("meta", {"name": "twitter:title"})
            if og_title and og_title.get("content"):
                title = og_title.get("content").strip()

        if not image_url:
            og_img = soup.find("meta", property="og:image") or soup.find("meta", {"name": "twitter:image"})
            if og_img and og_img.get("content"):
                image_url = og_img.get("content").strip()

        # 3. Meta price fallbacks
        if not price:
            for prop in ["og:price:amount", "product:price:amount", "price"]:
                meta_p = soup.find("meta", property=prop) or soup.find("meta", {"name": prop})
                if meta_p and meta_p.get("content"):
                    try:
                        p_val = re.sub(r"[^0-9.]", "", meta_p.get("content"))
                        price = float(p_val)
                        break
                    except ValueError:
                        pass

        if not title:
            return None

        return ExtractedProductData(
            merchant=self.merchant_name,
            merchant_product_id=product_id,
            clean_url=clean_url,
            title=title,
            price=price,
            mrp=mrp,
            currency=currency,
            in_stock=in_stock,
            brand=brand,
            image_url=image_url,
            extraction_source="html_json_ld",
            confidence="high" if price is not None else "low",
        )


class AmazonAdapter(BaseMerchantAdapter):
    """
    Amazon India Adapter.
    Uses direct Associate tag for 0ms outbound latency and PA-API compliance.
    """

    merchant_name = "Amazon India"
    merchant_slug = "amazon"
    supported_domains = {"amazon.in", "amzn.in", "amzn.to", "amazon.com", "amazon"}
    is_core = True
    affiliate_type = "direct_tag"
    cuelinks_campaign_id = 817

    def extract_product_id(self, url: str) -> Optional[str]:
        # Regex patterns covering standard desktop, mobile, and short Amazon paths
        patterns = [
            r"/dp/([A-Z0-9]{10})",
            r"/gp/product/([A-Z0-9]{10})",
            r"/gp/aw/d/([A-Z0-9]{10})",
            r"/product/([A-Z0-9]{10})",
            r"/d/([A-Z0-9]{10})",
            r"/asin/([A-Z0-9]{10})",
        ]
        parsed = urlparse(url)
        for p in patterns:
            m = re.search(p, parsed.path, re.IGNORECASE)
            if m:
                return m.group(1).upper()

        # Query param checks
        q_params = parse_qs(parsed.query)
        for k in ("asin", "pd_rd_i", "asins", "productId"):
            val = q_params.get(k)
            if val and val[0] and len(val[0].strip()) == 10:
                return val[0].strip().upper()

        # Generic 10-character B0 identifier in URL string
        match = re.search(r"\b(B0[A-Z0-9]{8})\b", url, re.IGNORECASE)
        return match.group(1).upper() if match else None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        asin = self.extract_product_id(url)
        if not asin:
            return None
        clean_url = f"https://www.amazon.in/dp/{asin}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=asin,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        # Requires verified Amazon Associates Store ID in environment
        return bool(settings.AMAZON_AFFILIATE_TAG and settings.AMAZON_AFFILIATE_TAG.strip())

    def generate_affiliate_url(
        self,
        clean_url: str,
        subids: Optional[Dict[str, str]] = None,
    ) -> str:
        tag = (settings.AMAZON_AFFILIATE_TAG or "").strip()
        if not tag:
            # Unverified / unconfigured Store ID: return clean unmonetized URL
            return clean_url
        parsed = urlparse(clean_url)
        query = parse_qs(parsed.query)
        query["tag"] = [tag]
        # Remove stray ref tags
        query.pop("ref", None)
        query.pop("ref_", None)
        new_query = urlencode(query, doseq=True)
        return urlunparse(parsed._replace(query=new_query))

    def extract_from_html(self, html_content: str, clean_url: str, product_id: str) -> Optional[ExtractedProductData]:
        from bs4 import BeautifulSoup

        # First run base JSON-LD extraction
        base_data = super().extract_from_html(html_content, clean_url, product_id)

        soup = BeautifulSoup(html_content, "html.parser")
        title = base_data.title if base_data else None
        price = base_data.price if base_data else None
        mrp = None
        brand = base_data.brand if base_data else None
        image_url = base_data.image_url if base_data else None
        in_stock = base_data.in_stock if base_data else True

        # Amazon specific DOM selectors
        if not title:
            t_el = soup.find("span", {"id": "productTitle"}) or soup.find("h1", {"id": "title"}) or soup.find("h1")
            if t_el:
                title = t_el.get_text(strip=True)

        if not price:
            # Core product buybox selectors first to avoid matching accessory carousels
            selectors = [
                "#corePriceDisplay_desktop_feature_div .priceToPay span.a-price-whole",
                "#corePriceDisplay_desktop_feature_div span.a-price-whole",
                "#corePrice_desktop .priceToPay span.a-price-whole",
                "#corePrice_desktop span.a-price-whole",
                ".priceToPay span.a-price-whole",
                ".apexPriceToPay span.a-price-whole",
                "#apexPriceToPay span.a-price-whole",
                "span.apex-price-to-pay-value",
                "#desktop_buybox .priceToPay span.a-price-whole",
                "#desktop_buybox span.a-price-whole",
                "#tabular-buybox .priceToPay span.a-price-whole",
                "#priceblock_ourprice",
                "#priceblock_dealprice",
                "#priceblock_saleprice",
                "#corePriceDisplay_desktop_feature_div span.a-offscreen",
                "#corePrice_desktop span.a-offscreen",
                ".priceToPay span.a-offscreen",
            ]
            for sel in selectors:
                el = soup.select_one(sel)
                if el:
                    try:
                        val = float(re.sub(r"[^0-9.]", "", el.get_text(strip=True)))
                        if val > 0:
                            price = val
                            break
                    except ValueError:
                        pass

        # MRP
        mrp_el = soup.select_one("span.a-price.a-text-price span.a-offscreen, span.basisPrice span.a-offscreen")
        if mrp_el:
            try:
                mrp = float(re.sub(r"[^0-9.]", "", mrp_el.get_text(strip=True)))
            except ValueError:
                pass

        # Brand
        if not brand:
            brand_el = soup.select_one("#bylineInfo, a#bylineInfo")
            if brand_el:
                b_text = brand_el.get_text(strip=True)
                brand = re.sub(r"^(Brand:\s*|Visit the\s*|Store\s*)", "", b_text, flags=re.IGNORECASE).strip()

        # Image
        if not image_url:
            img_el = soup.select_one("#landingImage, #imgBlkFront")
            if img_el and img_el.get("src"):
                image_url = img_el.get("src")

        # Availability
        avail_el = soup.select_one("#availability")
        if avail_el and "currently unavailable" in avail_el.get_text(strip=True).lower():
            in_stock = False

        if not title:
            return None

        return ExtractedProductData(
            merchant=self.merchant_name,
            merchant_product_id=product_id,
            clean_url=clean_url,
            title=title,
            price=price,
            mrp=mrp,
            currency="INR",
            in_stock=in_stock,
            brand=brand,
            image_url=image_url,
            extraction_source="amazon_html_parser",
            confidence="high" if price is not None else "low",
        )


class FlipkartAdapter(BaseMerchantAdapter):
    """
    Flipkart Adapter.
    Tracks product identity via PID/itm.
    Monetization flagged as inactive while Cuelinks campaign 1 is in pending status.
    """

    merchant_name = "Flipkart"
    merchant_slug = "flipkart"
    supported_domains = {"flipkart.com", "dl.flipkart.com", "fkrt.it"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 1

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        pids = query.get("pid") or query.get("id")
        if pids and pids[0]:
            return pids[0].strip()

        match = re.search(r"/itm([a-zA-Z0-9]+)", parsed.path)
        if match:
            return f"itm{match.group(1)}"
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        path = parsed.path if "/p/" in parsed.path else "/product/p/item"
        clean_url = f"https://www.flipkart.com{path}?pid={pid}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        # Currently pending on Cuelinks -> Do not route through broken affiliate links
        return False

    def generate_affiliate_url(
        self,
        clean_url: str,
        subids: Optional[Dict[str, str]] = None,
    ) -> str:
        # Clean URL fallback to preserve user trust
        return clean_url


class TataCliqAdapter(BaseMerchantAdapter):
    """
    Tata CLiQ Adapter.
    Approved Cuelinks Campaign 2588. Core multi-category electronics & fashion.
    """

    merchant_name = "Tata CLiQ"
    merchant_slug = "tatacliq"
    supported_domains = {"tatacliq.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 2588

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        # Typical format: /p-mp000000012345678 or /brand-title/p-mp...
        match = re.search(r"/p-(mp[0-9]+|[a-zA-Z0-9]+)", parsed.path)
        if match:
            return match.group(1)
        # Fallback: query param
        q_params = parse_qs(parsed.query)
        if "product_id" in q_params and q_params["product_id"]:
            return q_params["product_id"][0]
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.tatacliq.com{parsed.path}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        # Verified open and affiliated: true on Channel 317867
        return True


class VijaySalesAdapter(BaseMerchantAdapter):
    """
    Vijay Sales Adapter.
    Approved Cuelinks Campaign 4164. Multi-brand electronics, TVs, and large appliances.
    """

    merchant_name = "Vijay Sales"
    merchant_slug = "vijaysales"
    supported_domains = {"vijaysales.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 4164

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        # Typical format: /category/product-slug/p/vsp00012345 or /product-slug/12345
        parts = [p for p in parsed.path.split("/") if p]
        if parts:
            last_segment = parts[-1]
            if re.search(r"\d+", last_segment):
                return last_segment
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.vijaysales.com{parsed.path}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        # Verified open and affiliated: true on Channel 317867
        return True


class NykaaAdapter(BaseMerchantAdapter):
    """
    Nykaa Beauty Adapter.
    Approved Cuelinks Campaign 891. High-frequency cosmetics and grooming.
    """

    merchant_name = "Nykaa"
    merchant_slug = "nykaa"
    supported_domains = {"nykaa.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 891

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        # Typical format: /product-title/p/123456?skuId=123456
        query = parse_qs(parsed.query)
        if "skuId" in query and query["skuId"]:
            return query["skuId"][0]
        match = re.search(r"/p/([0-9]+)", parsed.path)
        if match:
            return match.group(1)
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.nykaa.com{parsed.path}"
        if "skuId" in parsed.query:
            clean_url += f"?skuId={pid}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        # Verified open and affiliated: true on Channel 317867
        return True


class CromaAdapter(BaseMerchantAdapter):
    """
    Croma Electronics Adapter.
    Multi-brand consumer electronics, laptops, phones, TVs.
    """
    merchant_name = "Croma"
    merchant_slug = "croma"
    supported_domains = {"croma.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 1007

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        match = re.search(r"/p/([0-9]+)", parsed.path)
        if match:
            return match.group(1)
        q_params = parse_qs(parsed.query)
        if "pid" in q_params and q_params["pid"]:
            return q_params["pid"][0]
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.croma.com{parsed.path}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        return True


class MyntraAdapter(BaseMerchantAdapter):
    """
    Myntra Fashion Adapter.
    High-intent apparel, shoes, accessories.
    """
    merchant_name = "Myntra"
    merchant_slug = "myntra"
    supported_domains = {"myntra.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 371

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        match = re.search(r"/(\d{5,12})(?:/buy)?", parsed.path)
        if match:
            return match.group(1)
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.myntra.com{parsed.path}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        return True


class AjioAdapter(BaseMerchantAdapter):
    """
    Ajio Fashion & Lifestyle Adapter.
    """
    merchant_name = "Ajio"
    merchant_slug = "ajio"
    supported_domains = {"ajio.com"}
    is_core = True
    affiliate_type = "cuelinks_v3"
    cuelinks_campaign_id = 2650

    def extract_product_id(self, url: str) -> Optional[str]:
        parsed = urlparse(url)
        match = re.search(r"/p/([0-9a-zA-Z_-]+)", parsed.path)
        if match:
            return match.group(1)
        return None

    def normalize_url(self, url: str) -> Optional[NormalizedURL]:
        pid = self.extract_product_id(url)
        if not pid:
            return None
        parsed = urlparse(url)
        clean_url = f"https://www.ajio.com{parsed.path}"
        return NormalizedURL(
            merchant=self.merchant_name,
            merchant_slug=self.merchant_slug,
            product_id=pid,
            clean_url=clean_url,
            raw_url=url,
        )

    def is_affiliate_available(self) -> bool:
        return True


class AdapterRegistry:
    """Registry maintaining active merchant adapters and resolving URLs to adapters."""

    def __init__(self):
        self.adapters: List[BaseMerchantAdapter] = [
            AmazonAdapter(),
            FlipkartAdapter(),
            TataCliqAdapter(),
            VijaySalesAdapter(),
            NykaaAdapter(),
            CromaAdapter(),
            MyntraAdapter(),
            AjioAdapter(),
        ]

    def get_adapter_for_url(self, url: str) -> Optional[BaseMerchantAdapter]:
        """Finds the registered adapter that matches the given URL."""
        for adapter in self.adapters:
            if adapter.matches_url(url):
                return adapter
        return None

    def get_adapter_for_merchant(self, merchant_name_or_slug: str) -> Optional[BaseMerchantAdapter]:
        """Finds the registered adapter matching merchant name or slug."""
        if not merchant_name_or_slug:
            return None
        target = merchant_name_or_slug.strip().lower()
        for adapter in self.adapters:
            if adapter.merchant_slug.lower() == target or target in adapter.merchant_name.lower() or adapter.merchant_name.lower() in target:
                return adapter
        return None

    def resolve_url(self, url: str) -> Tuple[Optional[BaseMerchantAdapter], Optional[NormalizedURL]]:
        """Resolves a raw URL into its handling adapter and NormalizedURL."""
        cleaned_url = url.strip()
        if not cleaned_url.startswith("http://") and not cleaned_url.startswith("https://"):
            cleaned_url = "https://" + cleaned_url

        # Automatically follow shorteners before matching adapter or extracting ID
        if any(s in cleaned_url.lower() for s in ("amzn.to", "amzn.in", "fkrt.it", "bit.ly", "tinyurl.com", "dl.flipkart.com")):
            from backend.resolver import unwind_redirects
            try:
                unwound = unwind_redirects(cleaned_url)
                if unwound and unwound != cleaned_url:
                    cleaned_url = unwound
            except Exception:
                pass

        adapter = self.get_adapter_for_url(cleaned_url)
        if not adapter:
            return None, None
        normalized = adapter.normalize_url(cleaned_url)
        return adapter, normalized



adapter_registry = AdapterRegistry()
