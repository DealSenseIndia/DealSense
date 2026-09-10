"""
DealSense Canonical Observation Service.
Coordinates URL verification, resilient merchant extraction, variant validation,
deduplication, heartbeat provenance, and immutable observation persistence.

Phase 3.2 Canonical Pipeline:
MerchantListing -> observe_listing() -> adapter/resolver -> extractor -> validation
-> variant validation -> deduplication -> price_service.record_price_observation()
-> MerchantListing update -> engine.evaluate_deal_intelligence() -> ObservationResult
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
import logging
from typing import Optional, Dict, Any, Tuple
import httpx
from sqlmodel import Session, select

from backend.database import get_session
from backend.models import Product, ProductVariant, MerchantListing, PriceObservation, PriceAlert
from backend.services.merchant_adapters import adapter_registry
from backend.services.price_service import record_price_observation, get_historical_price_summary
from backend.services.product_identity import (
    clean_canonical_title,
    extract_variant_from_title,
    are_variants_identical,
)
from backend.engine import evaluate_deal_intelligence, DealAnalysisResult

logger = logging.getLogger(__name__)

# Minimum interval (hours) between unchanged price observations before recording a live_heartbeat
HEARTBEAT_THRESHOLD_HOURS = 12.0

# Priority Interval Ranges (seconds)
TIER_INTERVALS = {
    "HOT": 45 * 60,       # 45 minutes (midpoint of 30-60m)
    "ACTIVE": 3 * 3600,   # 3 hours (midpoint of 2-4h)
    "NORMAL": 8 * 3600,   # 8 hours (midpoint of 8-12h)
    "COLD": 24 * 3600,    # 24 hours (midpoint of 24-48h)
}


def compute_failure_backoff_seconds(failure_count: int) -> int:
    """Calculates deterministic backoff interval based on consecutive failure count."""
    if failure_count <= 1:
        return 5 * 60       # 5 minutes
    elif failure_count == 2:
        return 30 * 60      # 30 minutes
    elif failure_count == 3:
        return 2 * 3600     # 2 hours
    elif failure_count == 4:
        return 8 * 3600     # 8 hours
    else:
        return 24 * 3600    # 24 hours


def determine_listing_priority(listing_id: int, product_id: Optional[int]) -> str:
    """
    Evaluates priority tier for a listing:
    - HOT: Active PriceAlert or high deal score
    - ACTIVE: High price volatility or homepage visibility
    - COLD: Out of stock or inactive
    - NORMAL: Standard catalog default
    """
    with get_session() as session:
        # 1. Check for Active User Price Alerts
        if product_id:
            alert = session.exec(
                select(PriceAlert).where(
                    PriceAlert.product_id == product_id,
                    PriceAlert.is_active == True,
                )
            ).first()
            if alert:
                return "HOT"

        # 2. Check Listing Availability
        listing = session.get(MerchantListing, listing_id)
        if listing and listing.availability == "out_of_stock":
            return "COLD"

        # 3. Check Price Volatility in Last 14 Days
        fourteen_days_ago = datetime.now(timezone.utc) - timedelta(days=14)
        recent_obs = session.exec(
            select(PriceObservation).where(
                PriceObservation.listing_id == listing_id,
                PriceObservation.observed_at >= fourteen_days_ago,
            )
        ).all()

        distinct_prices = {round(o.price, 2) for o in recent_obs if o.price and o.price > 0}
        if len(distinct_prices) >= 2:
            return "ACTIVE"

        return "NORMAL"


class ObservationStatus(str, Enum):
    SUCCESS = "SUCCESS"
    UNCHANGED_HEARTBEAT = "UNCHANGED_HEARTBEAT"
    UNCHANGED_SKIPPED = "UNCHANGED_SKIPPED"
    OUT_OF_STOCK = "OUT_OF_STOCK"
    EXTRACTION_FAILED_UNPRICED = "EXTRACTION_FAILED_UNPRICED"
    BLOCKED = "BLOCKED"
    RATE_LIMITED = "RATE_LIMITED"
    NETWORK_ERROR = "NETWORK_ERROR"
    MERCHANT_ERROR = "MERCHANT_ERROR"
    LISTING_NOT_FOUND = "LISTING_NOT_FOUND"
    VARIANT_MISMATCH = "VARIANT_MISMATCH"
    INACTIVE_LISTING = "INACTIVE_LISTING"
    UNSUPPORTED_MERCHANT = "UNSUPPORTED_MERCHANT"


@dataclass
class ObservationResult:
    listing_id: int
    merchant: str
    merchant_product_id: str
    status: ObservationStatus
    price: Optional[float] = None
    mrp: Optional[float] = None
    effective_price: Optional[float] = None
    in_stock: bool = True
    previous_price: Optional[float] = None
    price_changed: bool = False
    observation_id: Optional[int] = None
    observed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    error_message: Optional[str] = None
    deal_analysis: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "listing_id": self.listing_id,
            "merchant": self.merchant,
            "merchant_product_id": self.merchant_product_id,
            "status": self.status.value,
            "price": self.price,
            "mrp": self.mrp,
            "effective_price": self.effective_price,
            "in_stock": self.in_stock,
            "previous_price": self.previous_price,
            "price_changed": self.price_changed,
            "observation_id": self.observation_id,
            "observed_at": self.observed_at.isoformat() if self.observed_at else None,
            "error_message": self.error_message,
            "deal_analysis": self.deal_analysis,
        }


def _fetch_merchant_data(url: str, merchant: str):
    """
    Executes live merchant extraction outside of any open database transaction.
    Returns: (extracted_data, error_status, error_message)
    """
    try:
        from backend.extractor import extract_product_data
        extracted = extract_product_data(url)
        return extracted, None, None
    except httpx.TimeoutException as exc:
        return None, ObservationStatus.NETWORK_ERROR, f"Connection timeout: {exc}"
    except httpx.HTTPStatusError as exc:
        code = exc.response.status_code
        if code == 429:
            return None, ObservationStatus.RATE_LIMITED, "HTTP 429 Too Many Requests"
        elif code == 404:
            return None, ObservationStatus.LISTING_NOT_FOUND, "HTTP 404 Product Not Found"
        elif code in (500, 502, 503, 504):
            return None, ObservationStatus.MERCHANT_ERROR, f"HTTP {code} Merchant Service Error"
        else:
            return None, ObservationStatus.NETWORK_ERROR, f"HTTP {code} Network Error: {exc}"
    except httpx.RequestError as exc:
        return None, ObservationStatus.NETWORK_ERROR, f"Network request failed: {exc}"
    except ValueError as exc:
        if "Unsupported merchant" in str(exc):
            return None, ObservationStatus.UNSUPPORTED_MERCHANT, str(exc)
        return None, ObservationStatus.EXTRACTION_FAILED_UNPRICED, str(exc)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(w in err_str for w in ("robot check", "captcha", "challenge", "blocked", "bot")):
            return None, ObservationStatus.BLOCKED, f"Bot challenge detected: {exc}"
        return None, ObservationStatus.EXTRACTION_FAILED_UNPRICED, f"Extraction failed: {exc}"


def observe_listing(
    listing_id: int,
    session: Optional[Session] = None,
    force: bool = False,
) -> ObservationResult:
    """
    Authoritative canonical observation pipeline.
    Zero fabricated data: failed scrapes NEVER create PriceObservation records.
    Transaction rule: All network I/O executes with NO database locks held.
    """
    now_utc = datetime.now(timezone.utc)

    # -------------------------------------------------------------------------
    # Step 1: READ LISTING (Short Transaction)
    # -------------------------------------------------------------------------
    def _read_listing_snapshot():
        with get_session() as read_session:
            listing = read_session.get(MerchantListing, listing_id)
            if not listing:
                return None, None, None, None

            # Get latest observation to compare
            latest_obs = read_session.exec(
                select(PriceObservation)
                .where(PriceObservation.listing_id == listing.id)
                .order_by(PriceObservation.observed_at.desc())
            ).first()

            # Get product and variant info for integrity validation
            product = read_session.get(Product, listing.product_id) if listing.product_id else None
            variant = read_session.get(ProductVariant, listing.variant_id) if listing.variant_id else None

            # Snapshot plain data attributes to avoid detached instance issues
            listing_data = {
                "id": listing.id,
                "merchant": listing.merchant,
                "merchant_product_id": listing.merchant_product_id,
                "clean_url": listing.clean_url or listing.url,
                "current_price": listing.current_price,
                "availability": listing.availability,
                "active": listing.active,
                "last_checked_at": listing.last_checked_at,
                "failure_count": getattr(listing, "failure_count", 0) or 0,
            }

            obs_data = None
            if latest_obs:
                obs_data = {
                    "id": latest_obs.id,
                    "price": latest_obs.price,
                    "mrp": latest_obs.mrp,
                    "in_stock": latest_obs.in_stock,
                    "observed_at": latest_obs.observed_at,
                }

            prod_data = {
                "id": product.id if product else None,
                "canonical_title": product.canonical_title if product else None,
                "brand": product.brand if product else None,
            }

            var_data = {
                "id": variant.id if variant else None,
                "variant_name": variant.variant_name if variant else None,
                "storage": getattr(variant, "storage", None) if variant else None,
                "ram": getattr(variant, "ram", None) if variant else None,
                "color": getattr(variant, "color", None) if variant else None,
                "size": getattr(variant, "size", None) if variant else None,
            }

            return listing_data, obs_data, prod_data, var_data

    listing_info, latest_obs_info, prod_info, var_info = _read_listing_snapshot()

    if not listing_info:
        return ObservationResult(
            listing_id=listing_id,
            merchant="Unknown",
            merchant_product_id="Unknown",
            status=ObservationStatus.LISTING_NOT_FOUND,
            error_message=f"MerchantListing #{listing_id} not found in database.",
        )

    if not listing_info["active"]:
        return ObservationResult(
            listing_id=listing_id,
            merchant=listing_info["merchant"],
            merchant_product_id=listing_info["merchant_product_id"],
            status=ObservationStatus.INACTIVE_LISTING,
            error_message=f"MerchantListing #{listing_id} is marked inactive.",
        )

    target_url = listing_info["clean_url"]
    merchant_name = listing_info["merchant"]
    prev_price = listing_info["current_price"]
    if prev_price is None and latest_obs_info:
        prev_price = latest_obs_info["price"]

    # -------------------------------------------------------------------------
    # Step 2: LIVE EXTRACTION (Zero DB Transaction Held)
    # -------------------------------------------------------------------------
    extracted, err_status, err_msg = _fetch_merchant_data(target_url, merchant_name)

    # -------------------------------------------------------------------------
    # Step 3: HANDLE NETWORK / EXTRACTION FAILURES
    # -------------------------------------------------------------------------
    if err_status is not None or not extracted:
        # Write failure telemetry without altering price observations
        with get_session() as write_session:
            db_listing = write_session.get(MerchantListing, listing_id)
            if db_listing:
                f_count = (getattr(db_listing, "failure_count", 0) or 0) + 1
                db_listing.last_checked_at = now_utc
                db_listing.failure_count = f_count
                db_listing.last_error = err_msg or str(err_status)
                backoff_secs = compute_failure_backoff_seconds(f_count)
                db_listing.next_check_at = now_utc + timedelta(seconds=backoff_secs)
                write_session.add(db_listing)
                write_session.commit()

        return ObservationResult(
            listing_id=listing_id,
            merchant=merchant_name,
            merchant_product_id=listing_info["merchant_product_id"],
            status=err_status or ObservationStatus.EXTRACTION_FAILED_UNPRICED,
            previous_price=prev_price,
            error_message=err_msg,
            observed_at=now_utc,
        )

    # -------------------------------------------------------------------------
    # Step 4: VALIDATE EXTRACTION CONTENT & STOCK STATUS
    # -------------------------------------------------------------------------
    extracted_price = getattr(extracted, "price", None)
    extracted_mrp = getattr(extracted, "mrp", None)
    is_in_stock = bool(getattr(extracted, "in_stock", True))
    seller_name = getattr(extracted, "seller_name", None)
    delivery_fee = float(getattr(extracted, "delivery_fee", 0.0) or 0.0)
    title = getattr(extracted, "title", "") or ""

    # Check for Bot Check string leakage in title or price
    if any(w in title.lower() for w in ("robot check", "captcha", "security challenge")):
        with get_session() as write_session:
            db_listing = write_session.get(MerchantListing, listing_id)
            if db_listing:
                f_count = (getattr(db_listing, "failure_count", 0) or 0) + 1
                db_listing.last_checked_at = now_utc
                db_listing.failure_count = f_count
                db_listing.last_error = "Bot check leakage in title"
                backoff_secs = compute_failure_backoff_seconds(f_count)
                db_listing.next_check_at = now_utc + timedelta(seconds=backoff_secs)
                write_session.add(db_listing)
                write_session.commit()

        return ObservationResult(
            listing_id=listing_id,
            merchant=merchant_name,
            merchant_product_id=listing_info["merchant_product_id"],
            status=ObservationStatus.BLOCKED,
            previous_price=prev_price,
            error_message="Bot challenge text detected in page title.",
            observed_at=now_utc,
        )

    # Check Out of Stock condition
    if not is_in_stock or (extracted_price is None and "out of stock" in title.lower()):
        with get_session() as write_session:
            db_listing = write_session.get(MerchantListing, listing_id)
            if db_listing:
                db_listing.availability = "out_of_stock"
                db_listing.refresh_priority = "COLD"
                db_listing.last_checked_at = now_utc
                db_listing.failure_count = 0  # Valid extraction confirms stock state
                db_listing.last_error = None
                db_listing.next_check_at = now_utc + timedelta(seconds=TIER_INTERVALS["COLD"])
                write_session.add(db_listing)
                write_session.commit()

        return ObservationResult(
            listing_id=listing_id,
            merchant=merchant_name,
            merchant_product_id=listing_info["merchant_product_id"],
            status=ObservationStatus.OUT_OF_STOCK,
            in_stock=False,
            previous_price=prev_price,
            observed_at=now_utc,
        )

    # Missing or Non-Positive Price Validation
    if extracted_price is None or extracted_price <= 0:
        with get_session() as write_session:
            db_listing = write_session.get(MerchantListing, listing_id)
            if db_listing:
                f_count = (getattr(db_listing, "failure_count", 0) or 0) + 1
                db_listing.last_checked_at = now_utc
                db_listing.failure_count = f_count
                db_listing.last_error = "Price missing or non-positive in extraction"
                backoff_secs = compute_failure_backoff_seconds(f_count)
                db_listing.next_check_at = now_utc + timedelta(seconds=backoff_secs)
                write_session.add(db_listing)
                write_session.commit()

        return ObservationResult(
            listing_id=listing_id,
            merchant=merchant_name,
            merchant_product_id=listing_info["merchant_product_id"],
            status=ObservationStatus.EXTRACTION_FAILED_UNPRICED,
            previous_price=prev_price,
            error_message="Valid numeric price could not be extracted from merchant.",
            observed_at=now_utc,
        )

    # -------------------------------------------------------------------------
    # Step 5: VARIANT & IDENTITY VALIDATION
    # -------------------------------------------------------------------------
    if var_info and var_info["variant_name"] and var_info["variant_name"] != "Standard":
        extracted_var = extract_variant_from_title(title)
        expected_var = extract_variant_from_title(var_info["variant_name"])
        if not are_variants_identical(expected_var, extracted_var):
            with get_session() as write_session:
                db_listing = write_session.get(MerchantListing, listing_id)
                if db_listing:
                    f_count = (getattr(db_listing, "failure_count", 0) or 0) + 1
                    db_listing.last_checked_at = now_utc
                    db_listing.failure_count = f_count
                    db_listing.last_error = f"Variant mismatch: expected {var_info['variant_name']}, extracted {extracted_var.variant_name}"
                    backoff_secs = compute_failure_backoff_seconds(f_count)
                    db_listing.next_check_at = now_utc + timedelta(seconds=backoff_secs)
                    write_session.add(db_listing)
                    write_session.commit()

            return ObservationResult(
                listing_id=listing_id,
                merchant=merchant_name,
                merchant_product_id=listing_info["merchant_product_id"],
                status=ObservationStatus.VARIANT_MISMATCH,
                price=extracted_price,
                mrp=extracted_mrp,
                previous_price=prev_price,
                error_message=f"Extracted variant '{extracted_var.variant_name}' conflicts with tracked SKU '{var_info['variant_name']}'.",
                observed_at=now_utc,
            )

    # -------------------------------------------------------------------------
    # Step 6: DEDUPLICATION & OBSERVATION POLICY EVALUATION
    # -------------------------------------------------------------------------
    price_changed = True
    is_heartbeat = False
    skip_observation = False

    if latest_obs_info:
        last_price = latest_obs_info["price"]
        last_obs_time = latest_obs_info["observed_at"]
        if last_obs_time.tzinfo is None:
            last_obs_time = last_obs_time.replace(tzinfo=timezone.utc)

        elapsed_hours = (now_utc - last_obs_time).total_seconds() / 3600.0

        if abs(last_price - extracted_price) < 0.01:
            price_changed = False
            if elapsed_hours < HEARTBEAT_THRESHOLD_HOURS and not force:
                skip_observation = True
            else:
                is_heartbeat = True

    # -------------------------------------------------------------------------
    # Step 7: PERSIST OBSERVATION & UPDATE LISTING (Short Write Transaction)
    # -------------------------------------------------------------------------
    obs_id = None
    observation_source = "live_extraction"

    with get_session() as write_session:
        db_listing = write_session.get(MerchantListing, listing_id)
        if not db_listing:
            return ObservationResult(
                listing_id=listing_id,
                merchant=merchant_name,
                merchant_product_id=listing_info["merchant_product_id"],
                status=ObservationStatus.LISTING_NOT_FOUND,
                error_message="Listing disappeared before write commit.",
            )

        if skip_observation:
            # Policy: Unchanged price within 12h updates last_checked_at without creating a duplicate row
            priority = determine_listing_priority(listing_id, db_listing.product_id)
            db_listing.refresh_priority = priority
            db_listing.last_checked_at = now_utc
            db_listing.failure_count = 0
            db_listing.last_error = None
            interval = TIER_INTERVALS.get(priority, 8 * 3600)
            db_listing.next_check_at = now_utc + timedelta(seconds=interval)
            if seller_name:
                db_listing.seller_name = seller_name
            db_listing.delivery_fee = delivery_fee
            write_session.add(db_listing)
            write_session.commit()
            status = ObservationStatus.UNCHANGED_SKIPPED
            obs_id = latest_obs_info["id"] if latest_obs_info else None
        else:
            # Policy: Append immutable observation
            observation_source = "live_heartbeat" if is_heartbeat else "live_extraction"
            obs = record_price_observation(
                session=write_session,
                listing_id=listing_id,
                price=extracted_price,
                mrp=extracted_mrp,
                currency="INR",
                in_stock=is_in_stock,
                source=observation_source,
                observed_at=now_utc,
            )
            obs_id = obs.id

            # Update listing current state
            priority = determine_listing_priority(listing_id, db_listing.product_id)
            db_listing.refresh_priority = priority
            db_listing.current_price = extracted_price
            db_listing.availability = "in_stock"
            db_listing.last_checked_at = now_utc
            db_listing.failure_count = 0
            db_listing.last_error = None
            interval = TIER_INTERVALS.get(priority, 8 * 3600)
            db_listing.next_check_at = now_utc + timedelta(seconds=interval)
            if seller_name:
                db_listing.seller_name = seller_name
            db_listing.delivery_fee = delivery_fee
            write_session.add(db_listing)
            write_session.commit()

            status = ObservationStatus.UNCHANGED_HEARTBEAT if is_heartbeat else ObservationStatus.SUCCESS

    # -------------------------------------------------------------------------
    # Step 8: EVALUATE DEAL INTELLIGENCE & TRIGGER PRICE ALERTS
    # -------------------------------------------------------------------------
    deal_dict = None
    try:
        with get_session() as eval_session:
            history_summary = get_historical_price_summary(
                session=eval_session,
                listing_id=listing_id,
                current_price=extracted_price,
                current_mrp=extracted_mrp,
            )
            analysis_result: DealAnalysisResult = evaluate_deal_intelligence(
                current_price=extracted_price,
                mrp=extracted_mrp,
                history_summary=history_summary,
                in_stock=is_in_stock,
            )
            deal_dict = analysis_result.to_dict()
    except Exception as eval_err:
        logger.debug(f"Deal intelligence evaluation note for #{listing_id}: {eval_err}")

    # Evaluate registered price drop alerts against fresh observation
    try:
        from backend.services.alert_service import evaluate_alerts_for_observation
        evaluate_alerts_for_observation(
            listing_id=listing_id,
            product_id=prod_info.get("id") if prod_info else None,
            current_price=extracted_price,
            effective_price=extracted_price,
            in_stock=is_in_stock,
            deal_score=deal_dict.get("deal_score") if deal_dict else None,
            verdict=deal_dict.get("verdict") if deal_dict else None,
            confidence=deal_dict.get("confidence") if deal_dict else None,
            summary_reason=deal_dict.get("summary_reason") if deal_dict else None,
            merchant=merchant_name,
            product_title=prod_info.get("canonical_title") if prod_info else title,
            observed_at=now_utc,
        )
    except Exception as alert_err:
        logger.warning(f"Alert evaluation note for listing #{listing_id}: {alert_err}")

    return ObservationResult(
        listing_id=listing_id,
        merchant=merchant_name,
        merchant_product_id=listing_info["merchant_product_id"],
        status=status,
        price=extracted_price,
        mrp=extracted_mrp,
        effective_price=extracted_price,
        in_stock=is_in_stock,
        previous_price=prev_price,
        price_changed=price_changed,
        observation_id=obs_id,
        observed_at=now_utc,
        deal_analysis=deal_dict,
    )
