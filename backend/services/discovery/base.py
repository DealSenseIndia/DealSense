"""
Base abstractions, payload validation, and deduplication logic for DealSense Autonomous Discovery Engine.
"""
from abc import ABC, abstractmethod
import hashlib
import re
from typing import Optional, Tuple, List, Dict, Any
from urllib.parse import urlparse, parse_qs, urlunparse
from pydantic import BaseModel, Field, field_validator, model_validator

from backend.services.merchant_adapters import adapter_registry


def normalize_clean_url_generic(raw_url: str) -> str:
    """
    Generic fallback URL normalizer that strips tracking query params and fragments.
    """
    url = raw_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    path = parsed.path.rstrip("/")

    # Strip affiliate / tracking parameters
    if parsed.query:
        q_params = parse_qs(parsed.query)
        allowed_keys = {"pid", "skuId", "sku_id", "id"}
        filtered_query = {k: v for k, v in q_params.items() if k in allowed_keys}
        new_query = "&".join(f"{k}={v[0]}" for k, v in sorted(filtered_query.items()))
    else:
        new_query = ""

    return urlunparse((scheme, netloc, path, "", new_query, ""))


def compute_candidate_dedupe(
    candidate_url: str,
    merchant: Optional[str] = None,
) -> Tuple[str, str, Optional[str], str]:
    """
    Computes canonical deduplication key, clean URL, merchant product ID, and merchant name.

    Deduplication Tiers:
    Tier 1:
      - Amazon: amazon:{ASIN}
      - Flipkart: flipkart:{PID}
    Tier 2:
      - SHA256(normalized_clean_url)

    Returns:
      (dedupe_key, clean_url, merchant_product_id, merchant_name)
    """
    url = candidate_url.strip()
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    adapter, normalized = adapter_registry.resolve_url(url)
    resolved_merchant = merchant or "Unknown"
    product_id: Optional[str] = None
    clean_url: str = url

    if adapter and normalized:
        resolved_merchant = normalized.merchant
        clean_url = normalized.clean_url
        product_id = normalized.product_id

    # Tier 1: Store-specific unique hardware / catalog identifiers
    if "amazon" in resolved_merchant.lower() and product_id:
        norm_asin = product_id.strip().upper()
        dedupe_key = f"amazon:{norm_asin}"
        return dedupe_key, clean_url, norm_asin, "Amazon"

    if "flipkart" in resolved_merchant.lower() and product_id:
        norm_pid = product_id.strip()
        dedupe_key = f"flipkart:{norm_pid}"
        return dedupe_key, clean_url, norm_pid, "Flipkart"

    # Additional supported adapter PID extraction if available
    if product_id and resolved_merchant.lower() in ("tatacliq", "vijaysales", "nykaa", "croma", "myntra", "ajio"):
        norm_pid = product_id.strip()
        dedupe_key = f"{resolved_merchant.lower()}:{norm_pid}"
        return dedupe_key, clean_url, norm_pid, resolved_merchant

    # Tier 2: Cryptographic fallback over normalized clean URL
    norm_url = normalize_clean_url_generic(clean_url)
    sha = hashlib.sha256(norm_url.strip().lower().encode("utf-8")).hexdigest()
    dedupe_key = f"sha256:{sha}"
    return dedupe_key, clean_url, product_id, resolved_merchant


from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class DiscoveryObservation:
    """
    Conceptual and operational model of a Discovery Observation.

    SEMANTICS:
    "DealSense discovered this product/listing at time T from source S."

    CRITICAL DISTINCTION:
    - DiscoveryObservation records product/listing presence and discovery provenance (source, method, timestamp).
    - PriceObservation records verified, immutable merchant pricing at time T.
    A DiscoveryObservation carries ZERO pricing guarantees and is NEVER treated as a PriceObservation or DealCandidate.
    """
    source_name: str
    source_type: str = "category"
    discovery_method: str = "bestseller"
    discovered_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    product_id: Optional[int] = None
    listing_id: Optional[int] = None
    candidate_id: Optional[int] = None
    dedupe_key: Optional[str] = None
    candidate_url: Optional[str] = None


class CandidatePayload(BaseModel):
    """
    Structured payload produced by discovery sources before intake queue insertion.
    """
    candidate_url: str
    merchant: Optional[str] = None
    category_hint: Optional[str] = None
    title_hint: Optional[str] = None
    price_hint: Optional[float] = None
    mrp_hint: Optional[float] = None
    discovery_priority: float = 50.0
    source_name: str = "curated_seed"
    source_type: str = "category"
    discovery_method: str = "bestseller"
    discovered_at: Optional[datetime] = None

    # Computed fields
    clean_url: Optional[str] = None
    merchant_product_id: Optional[str] = None
    dedupe_key: Optional[str] = None

    @field_validator("candidate_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("candidate_url cannot be empty")
        if not (s.startswith("http://") or s.startswith("https://")):
            s = "https://" + s
        return s

    @field_validator("discovery_priority")
    @classmethod
    def validate_priority(cls, v: float) -> float:
        if v < 0:
            return 0.0
        if v > 100.0:
            return 100.0
        return float(v)

    @model_validator(mode="after")
    def populate_dedupe_and_metadata(self) -> "CandidatePayload":
        if not self.dedupe_key or not self.clean_url:
            dedupe_key, clean_url, pid, resolved_merchant = compute_candidate_dedupe(
                self.candidate_url, self.merchant
            )
            self.dedupe_key = dedupe_key
            self.clean_url = clean_url
            if not self.merchant_product_id:
                self.merchant_product_id = pid
            if not self.merchant or self.merchant == "Unknown":
                self.merchant = resolved_merchant
        if not self.discovered_at:
            self.discovered_at = datetime.now(timezone.utc)
        return self


class DiscoverySource(ABC):
    """Abstract interface for all Autonomous Discovery sources."""

    source_name: str
    source_type: str = "category"  # 'category', 'search', 'curated_seed', 'offer_intelligence'
    discovery_method: str = "bestseller"  # 'bestseller', 'popular', 'trending', 'curated'

    @abstractmethod
    def fetch_candidates(self) -> List[CandidatePayload]:
        """Discovers and yields candidates as structured payloads."""
        pass

    def discover_candidates(self) -> List[CandidatePayload]:
        """Alias for fetch_candidates providing consistent discovery interface."""
        return self.fetch_candidates()

    def normalize_candidate(self, raw: Dict[str, Any]) -> Optional[CandidatePayload]:
        """Normalizes a raw dictionary input into a valid CandidatePayload."""
        url = raw.get("url") or raw.get("candidate_url")
        if not url or not isinstance(url, str) or not url.strip():
            return None
        try:
            return CandidatePayload(
                candidate_url=url.strip(),
                merchant=raw.get("merchant"),
                category_hint=raw.get("category") or raw.get("category_hint"),
                title_hint=raw.get("title") or raw.get("title_hint"),
                price_hint=raw.get("price") or raw.get("price_hint"),
                mrp_hint=raw.get("mrp") or raw.get("mrp_hint"),
                discovery_priority=float(raw.get("priority") or raw.get("discovery_priority", 50.0)),
                source_name=self.source_name,
                source_type=raw.get("source_type", self.source_type),
                discovery_method=raw.get("discovery_method", self.discovery_method),
                discovered_at=raw.get("discovered_at"),
            )
        except Exception:
            return None

    def dedupe_key(self, product_id: str) -> str:
        """Computes canonical deduplication key for this source."""
        return f"{self.source_name.lower()}:{product_id.strip()}"

    def source_metadata(self) -> Dict[str, Any]:
        """Returns metadata description for this discovery source."""
        return {
            "source_name": self.source_name,
            "source_type": self.source_type,
            "discovery_method": self.discovery_method,
        }


class CuelinksOfferSource(DiscoverySource):
    """
    Offer & Campaign Intelligence Source (Deferred to Later Phase).

    CRITICAL ARCHITECTURAL BOUNDARY:
    Cuelinks is NOT a product catalog feed.
    Its responsibility is campaign discovery, commission intelligence,
    and merchant attribution hints. It must never attempt full product catalog enumeration.
    """
    source_name: str = "cuelinks_offers"
    source_type: str = "offer_intelligence"
    discovery_method: str = "campaign"

    def fetch_candidates(self) -> List[CandidatePayload]:
        raise NotImplementedError(
            "CuelinksOfferSource is deferred to later adapter phase. "
            "Affiliate monetization is decoupled from catalog product discovery."
        )
