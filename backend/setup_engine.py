"""
DealSense Smart Setup Builder — compatibility facade.

This module used to compose setups from `backend/data/setup_catalog.py`, a
hardcoded file containing invented prices, invented ASINs, homepage URLs, and
static verdict strings like "Lowest in 90D" that were never computed from
anything. Every number it returned was fiction presented as a verified deal.

It now delegates entirely to `backend.services.setup_service`, which composes
setups from real `MerchantListing` rows priced by real `PriceObservation`
records and judged by the same deterministic verdict engine used on product
pages.

The public names `SetupRequest` and `build_smart_setup` are preserved because
`backend/main.py` imports them. `build_smart_setup` additionally projects the
new payload into the legacy response shape so the existing frontend keeps
rendering while it is rebuilt.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel
from sqlmodel import Session

from backend.data.setup_blueprints import SETUP_BLUEPRINTS
from backend.database import get_session
from backend.services.setup_service import build_setup

# Legacy tier keys -> current tier keys. The old UI addresses tiers by these
# names, so requests and responses are translated at this boundary only.
LEGACY_TIER_MAP = {
    "value": "saver",
    "upgrade": "value",
    "luxe": "premium",
}
CURRENT_TO_LEGACY = {v: k for k, v in LEGACY_TIER_MAP.items()}

LEGACY_TIER_META = {
    "value": {"badge": "Recommended for Renters", "color": "#16A34A"},
    "upgrade": {"badge": "High Visual Impact", "color": "#2563EB"},
    "luxe": {"badge": "Architectural Aesthetic", "color": "#9333EA"},
}

MERCHANT_LOGOS = {
    "Amazon": "/assets/amazon-logo.svg",
    "Flipkart": "/assets/flipkart-logo.svg",
}


class SetupRequest(BaseModel):
    space: str = "bedroom"
    budget: float = 25000.0
    owned_items: List[str] = []
    style: str = "modern_minimal"


def _legacy_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Projects a real setup item into the shape the existing frontend reads."""
    return {
        "category": item["slot_label"],
        "name": item["title"],
        "price": item["price"],
        "mrp": item["mrp"],
        "discount_pct": item["discount_pct"],
        "store": item["merchant"],
        "logo": MERCHANT_LOGOS.get(item["merchant"], ""),
        "url": item["affiliate_url"],
        "image": item["image_url"],
        # Real verdict from the deterministic engine, not a decorative string.
        "deal_verdict": item["verdict"],
        "verdict_summary": item["verdict_summary"],
        "deal_score": item["deal_score"],
        "confidence": item["confidence"],
        "provenance": item["provenance"],
        "has_sufficient_history": item["has_sufficient_history"],
        "phase": item["phase"],
        "reason": item["rationale"],
    }


def _allocation_advice(tier: Dict[str, Any], budget: float) -> str:
    """
    Describes budget position using only real totals.

    Savings are stated only for items that actually have a recorded MRP above
    the current price. When no item has one, the sentence omits savings rather
    than printing a zero that reads like a failure.
    """
    remaining = tier["budget_remaining"]
    savings = tier.get("total_savings_vs_mrp")

    if savings:
        savings_part = f"₹{savings:,.0f} below listed MRP across priced items. "
    else:
        savings_part = ""

    if remaining >= 0:
        return (
            f"{savings_part}₹{remaining:,.0f} remaining of your ₹{budget:,.0f} budget."
        )
    return (
        f"{savings_part}₹{abs(remaining):,.0f} over your ₹{budget:,.0f} budget at this tier."
    )


def build_smart_setup(
    space: str,
    budget: float,
    owned_items: List[str],
    style: str,
    session: Optional[Session] = None,
) -> Dict[str, Any]:
    """
    Builds a setup from real tracked listings.

    Accepts an optional session so callers inside a request can reuse theirs;
    opens and closes its own when called standalone.
    """
    space_key = space if space in SETUP_BLUEPRINTS else "bedroom"

    owns_session = session is None
    session = session or get_session()
    try:
        result = build_setup(
            session=session,
            space=space_key,
            budget=budget,
            owned=owned_items or [],
            style=style,
        )
    finally:
        if owns_session:
            session.close()

    legacy_tiers = []
    for tier in result["tiers"]:
        legacy_key = CURRENT_TO_LEGACY.get(tier["tier_key"], tier["tier_key"])
        meta = LEGACY_TIER_META.get(legacy_key, {"badge": "", "color": "#2563EB"})

        items = [_legacy_item(i) for i in tier["items"]]
        phase1 = [i for i in items if i["phase"] == 1]
        phase2 = [i for i in items if i["phase"] == 2]

        legacy_tiers.append(
            {
                "tier_key": legacy_key,
                "current_tier_key": tier["tier_key"],
                "title": tier["label"],
                "badge": meta["badge"],
                "tagline": tier["description"],
                "color": tier["accent"],
                "total_price": tier["total_price"],
                "total_mrp": tier["total_mrp"],
                "savings": tier["total_savings_vs_mrp"],
                "budget_diff": tier["budget_remaining"],
                "allocation_advice": _allocation_advice(tier, result["requested_budget"]),
                "phase1_total": tier["phase1_total"],
                "phase1_items": phase1,
                "phase2_total": tier["phase2_total"],
                "phase2_items": phase2,
                "all_items": items,
                # Honest reporting of what could not be built.
                "unfilled": tier["unfilled"],
                "setup_score": tier["setup_score"],
                "score_breakdown": tier["score_breakdown"],
                "data_completeness": tier["data_completeness"],
            }
        )

    return {
        "status": "success",
        "space": result["space"],
        "title": result["title"],
        "tagline": result["tagline"],
        "requested_budget": result["requested_budget"],
        "owned_items": [o.lower().strip() for o in (owned_items or [])],
        "style": result["style"],
        "owned_summary": {
            "count": result["owned"]["count"],
            "item_names": [s["label"] for s in result["owned"]["slots"]],
            # Deliberately absent: the old `saved_amount`, which averaged
            # invented catalog prices to manufacture a savings figure.
            "note": result["owned"]["note"],
        },
        "catalog_size": result["catalog_size"],
        "tiers": legacy_tiers,
        "generated_at": result["generated_at"],
    }
