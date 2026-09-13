"""
DealSense Smart Setup Composition Service.

Composes a complete, budget-constrained setup from REAL merchant listings that
already exist in the database and have at least one genuine recorded price
observation.

Hard guarantees
---------------
1. No price is ever invented. A slot with no priced listing is reported as
   UNFILLED with a machine-readable reason, never padded with an estimate.
2. Every item carries provenance describing how fresh its price is and whether
   enough history exists to support a verdict.
3. Deal verdicts come from `backend.engine.evaluate_deal_intelligence`, the same
   deterministic evaluator used by the product analyzer. No separate scoring
   path, so a product cannot be BUY here and WAIT on its own page.
4. The setup score is None when there is nothing real to score. It is never
   defaulted to a flattering number.

Selection model (documented and auditable)
------------------------------------------
For each slot the engine computes a target spend of
`effective_budget * slot.impact_weight`, collects real candidate listings whose
price falls within `[target * min_factor, target * max_factor]`, and ranks them:

    selection_score = 0.45 * budget_fit
                    + 0.35 * (deal_score / 100)
                    + 0.10 * style_affinity
                    + 0.10 * evidence_strength

    budget_fit       1.0 when priced exactly at target, falling linearly to 0.0
    deal_score       from the deterministic verdict engine; 50 when history is
                     insufficient, which is neutral rather than rewarding
    style_affinity   share of the style profile's tokens present in the title
    evidence_strength 1.0 with sufficient history, 0.5 with any history, 0.0 with
                     a single observation

Ties break on lower price, then lower listing id, so the same inputs always
produce the same setup.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlmodel import Session, select

from backend.config import build_affiliate_url
from backend.data.setup_blueprints import (
    SETUP_BLUEPRINTS,
    STYLE_PROFILES,
    TIER_PROFILES,
)
from backend.engine import evaluate_deal_intelligence
from backend.models import MerchantListing, PriceObservation, Product
from backend.services.price_service import get_historical_price_summary

# Only these merchants are in scope.
SUPPORTED_MERCHANT_TOKENS = ("amazon", "flipkart")

# Selection weights. Changing these changes recommendations, so they live here
# as named constants and are asserted by tests.
W_BUDGET_FIT = 0.45
W_DEAL_SCORE = 0.35
W_STYLE = 0.10
W_EVIDENCE = 0.10

# Provenance thresholds in seconds.
LIVE_MAX_AGE = 15 * 60
OBSERVED_MAX_AGE = 24 * 3600

# Setup score component weights.
SCORE_W_COVERAGE = 40
SCORE_W_BUDGET = 20
SCORE_W_EVIDENCE = 20
SCORE_W_DEAL = 20


@dataclass
class SetupItem:
    """A single chosen product occupying one slot of a setup."""

    slot_key: str
    slot_label: str
    phase: int
    rationale: str

    product_id: Optional[int]
    listing_id: int
    title: str
    brand: Optional[str]
    image_url: Optional[str]
    merchant: str
    merchant_product_id: str
    product_url: str
    affiliate_url: str

    price: float
    mrp: Optional[float]
    discount_pct: float

    verdict: str
    deal_score: int
    confidence: str
    verdict_summary: str

    provenance: str
    observation_count: int
    has_sufficient_history: bool
    price_observed_at: Optional[str]
    historical_low: Optional[float]
    historical_median: Optional[float]

    target_spend: float
    selection_score: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class UnfilledSlot:
    """A slot the engine could not fill, with an honest machine-readable reason."""

    slot_key: str
    slot_label: str
    phase: int
    target_spend: float
    reason: str          # NO_MATCHING_PRODUCT | NO_PRICED_LISTING | OUT_OF_BUDGET_RANGE | OWNED
    detail: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SetupTier:
    """One budget interpretation of the same blueprint."""

    tier_key: str
    label: str
    description: str
    accent: str
    effective_budget: float
    items: List[SetupItem] = field(default_factory=list)
    unfilled: List[UnfilledSlot] = field(default_factory=list)

    total_price: float = 0.0
    total_mrp: Optional[float] = None
    total_savings_vs_mrp: Optional[float] = None
    budget_remaining: float = 0.0
    phase1_total: float = 0.0
    phase2_total: float = 0.0

    setup_score: Optional[int] = None
    score_breakdown: Dict[str, Any] = field(default_factory=dict)
    data_completeness: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tier_key": self.tier_key,
            "label": self.label,
            "description": self.description,
            "accent": self.accent,
            "effective_budget": round(self.effective_budget, 2),
            "items": [i.to_dict() for i in self.items],
            "unfilled": [u.to_dict() for u in self.unfilled],
            "total_price": round(self.total_price, 2),
            "total_mrp": round(self.total_mrp, 2) if self.total_mrp is not None else None,
            "total_savings_vs_mrp": (
                round(self.total_savings_vs_mrp, 2)
                if self.total_savings_vs_mrp is not None
                else None
            ),
            "budget_remaining": round(self.budget_remaining, 2),
            "phase1_total": round(self.phase1_total, 2),
            "phase2_total": round(self.phase2_total, 2),
            "item_count": len(self.items),
            "store_count": len({i.merchant for i in self.items}),
            "setup_score": self.setup_score,
            "score_breakdown": self.score_breakdown,
            "data_completeness": self.data_completeness,
        }


# ─────────────────────────── matching helpers ───────────────────────────


def _merchant_token(merchant: str) -> Optional[str]:
    """Maps a stored merchant label onto a supported merchant token."""
    low = (merchant or "").lower()
    for token in SUPPORTED_MERCHANT_TOKENS:
        if token in low:
            return token
    return None


def _haystack(product: Optional[Product], listing: MerchantListing) -> str:
    """Lowercased text used for slot token matching."""
    parts = [
        listing.title_at_merchant or "",
        product.canonical_title if product else "",
        product.category if product and product.category else "",
        product.brand if product and product.brand else "",
    ]
    return " ".join(p for p in parts if p).lower()


def _matches_slot(text: str, slot: Dict[str, Any]) -> bool:
    """True when the text hits a slot token and avoids every exclusion token."""
    if any(bad in text for bad in slot.get("exclude", [])):
        return False
    return any(good in text for good in slot["match_any"])


def _style_affinity(text: str, style_key: str) -> float:
    """Share of the style profile's tokens present in the text, 0.0 to 1.0."""
    profile = STYLE_PROFILES.get(style_key) or STYLE_PROFILES["no_preference"]
    tokens = profile["prefer_tokens"]
    if not tokens:
        return 0.0
    hits = sum(1 for t in tokens if t in text)
    return min(1.0, hits / 3.0)


def _provenance(age_seconds: Optional[int], has_history: bool, obs_count: int) -> str:
    """Classifies price freshness and evidence strength for UI badging."""
    if obs_count == 0:
        return "UNVERIFIED"
    if age_seconds is None:
        return "OBSERVED"
    if age_seconds <= LIVE_MAX_AGE:
        return "LIVE"
    if age_seconds > OBSERVED_MAX_AGE:
        return "STALE"
    return "VERIFIED" if has_history else "OBSERVED"


# ─────────────────────────── candidate loading ───────────────────────────


def _load_candidates(session: Session) -> List[Tuple[MerchantListing, Optional[Product]]]:
    """
    Loads every active, in-stock, priced listing on a supported merchant.

    Only listings with a real `current_price` survive. A listing whose price was
    never successfully extracted is not a candidate, because including it would
    require inventing a number to rank it by.
    """
    stmt = select(MerchantListing).where(
        MerchantListing.active == True,  # noqa: E712  (SQLModel needs ==)
        MerchantListing.current_price != None,  # noqa: E711
        MerchantListing.current_price > 0,
    )
    listings = list(session.exec(stmt).all())

    out: List[Tuple[MerchantListing, Optional[Product]]] = []
    product_cache: Dict[int, Optional[Product]] = {}

    for listing in listings:
        if _merchant_token(listing.merchant) is None:
            continue
        if (listing.availability or "in_stock") != "in_stock":
            continue
        product = None
        if listing.product_id is not None:
            if listing.product_id not in product_cache:
                product_cache[listing.product_id] = session.get(Product, listing.product_id)
            product = product_cache[listing.product_id]
        out.append((listing, product))
    return out


def _evaluate_listing(
    session: Session,
    listing: MerchantListing,
) -> Dict[str, Any]:
    """
    Runs the real verdict engine against a listing's real observation history.
    Returns price facts plus provenance. Never fabricates a price.
    """
    latest = session.exec(
        select(PriceObservation)
        .where(PriceObservation.listing_id == listing.id)
        .order_by(PriceObservation.observed_at.desc())
    ).first()

    price = float(listing.current_price or 0.0)
    mrp = latest.mrp if latest else None
    observed_at = latest.observed_at if latest else None

    summary = get_historical_price_summary(
        session=session,
        listing_id=listing.id,
        current_price=price,
        current_mrp=mrp,
    )

    verdict = evaluate_deal_intelligence(
        current_price=price,
        mrp=mrp,
        history_summary=summary,
        in_stock=(listing.availability or "in_stock") == "in_stock",
    )

    age_seconds: Optional[int] = None
    if observed_at is not None:
        ts = observed_at if observed_at.tzinfo else observed_at.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int((datetime.now(timezone.utc) - ts).total_seconds()))

    return {
        "price": price,
        "mrp": mrp,
        "observed_at": observed_at,
        "age_seconds": age_seconds,
        "summary": summary,
        "verdict": verdict,
        "provenance": _provenance(
            age_seconds, summary.has_sufficient_history, summary.observation_count
        ),
    }


# ─────────────────────────── allocation ───────────────────────────


def _active_slots(
    blueprint: Dict[str, Any],
    owned: List[str],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Splits slots into active and owned.

    Weights are NOT mutated here. The blueprint dicts are module-level and shared
    across requests, so writing to them would leak one user's owned-items choice
    into the next request. Redistribution happens at read time in
    `_normalised_weight`, which divides by the active set's total weight.
    """
    owned_set = {o.strip().lower() for o in owned if o and o.strip()}
    active = [s for s in blueprint["slots"] if s["owned_key"] not in owned_set]
    skipped = [s for s in blueprint["slots"] if s["owned_key"] in owned_set]
    return active, skipped


def _normalised_weight(slot: Dict[str, Any], active: List[Dict[str, Any]]) -> float:
    """Slot weight as a share of the active slots' total weight."""
    total = sum(s["impact_weight"] for s in active)
    if total <= 0:
        return 0.0
    return slot["impact_weight"] / total


# ─────────────────────────── scoring ───────────────────────────


def _compute_setup_score(
    items: List[SetupItem],
    essential_total: int,
    essential_filled: int,
    budget: float,
    total_price: float,
) -> Tuple[Optional[int], Dict[str, Any]]:
    """
    Scores a setup from real signals only.

    Returns (None, breakdown) when there are no items, because a setup with
    nothing in it has no meaningful quality to report.
    """
    if not items:
        return None, {
            "reason": "NO_ITEMS",
            "detail": "No real priced listings matched this blueprint.",
        }

    coverage = (essential_filled / essential_total) if essential_total else 1.0

    if budget > 0:
        budget_fit = max(0.0, 1.0 - abs(total_price - budget) / budget)
    else:
        budget_fit = 0.0

    with_history = [i for i in items if i.has_sufficient_history]
    evidence = len(with_history) / len(items)

    if with_history:
        deal_quality = sum(i.deal_score for i in with_history) / len(with_history) / 100.0
    else:
        deal_quality = 0.0

    score = (
        SCORE_W_COVERAGE * coverage
        + SCORE_W_BUDGET * budget_fit
        + SCORE_W_EVIDENCE * evidence
        + SCORE_W_DEAL * deal_quality
    )

    breakdown = {
        "coverage": {
            "weight": SCORE_W_COVERAGE,
            "value": round(coverage, 3),
            "detail": f"{essential_filled} of {essential_total} essential slots filled.",
        },
        "budget_fit": {
            "weight": SCORE_W_BUDGET,
            "value": round(budget_fit, 3),
            "detail": f"Total ₹{total_price:,.0f} against a ₹{budget:,.0f} target.",
        },
        "price_evidence": {
            "weight": SCORE_W_EVIDENCE,
            "value": round(evidence, 3),
            "detail": (
                f"{len(with_history)} of {len(items)} items have enough recorded "
                f"history for a confident verdict."
            ),
        },
        "deal_quality": {
            "weight": SCORE_W_DEAL,
            "value": round(deal_quality, 3),
            "detail": (
                f"Mean deal score across {len(with_history)} items with history."
                if with_history
                else "Not scored — no item yet has sufficient price history."
            ),
        },
    }
    return int(round(score)), breakdown


# ─────────────────────────── main entry point ───────────────────────────


def build_setup(
    session: Session,
    space: str,
    budget: float,
    owned: Optional[List[str]] = None,
    style: str = "no_preference",
    tiers: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Builds one setup per requested tier from real listings.

    Raises KeyError for an unknown space so the caller can return a clean 404.
    """
    blueprint = SETUP_BLUEPRINTS[space]
    owned = owned or []
    tier_keys = tiers or ["saver", "value", "premium"]
    style_key = style if style in STYLE_PROFILES else "no_preference"

    budget = max(float(budget or 0.0), 0.0)
    active, skipped = _active_slots(blueprint, owned)

    candidates = _load_candidates(session)

    # Evaluate each candidate once, then reuse across tiers. Verdict evaluation
    # touches observation history, so doing it per tier would triple the work.
    evaluated: Dict[int, Dict[str, Any]] = {}
    haystacks: Dict[int, str] = {}
    for listing, product in candidates:
        evaluated[listing.id] = _evaluate_listing(session, listing)
        haystacks[listing.id] = _haystack(product, listing)

    built_tiers: List[SetupTier] = []

    for tier_key in tier_keys:
        profile = TIER_PROFILES.get(tier_key)
        if not profile:
            continue

        effective_budget = budget * profile["budget_factor"]
        tier = SetupTier(
            tier_key=tier_key,
            label=profile["label"],
            description=profile["description"],
            accent=profile["accent"],
            effective_budget=effective_budget,
        )

        used_listing_ids: set[int] = set()

        for slot in active:
            weight = _normalised_weight(slot, active)
            target = effective_budget * weight
            lo = target * slot["min_factor"]
            hi = target * slot["max_factor"]

            matched_any = False
            in_range: List[Tuple[float, float, MerchantListing, Optional[Product]]] = []

            for listing, product in candidates:
                if listing.id in used_listing_ids:
                    continue
                text = haystacks[listing.id]
                if not _matches_slot(text, slot):
                    continue
                matched_any = True

                ev = evaluated[listing.id]
                price = ev["price"]
                if price < lo or price > hi:
                    continue

                budget_fit = max(0.0, 1.0 - abs(price - target) / target) if target > 0 else 0.0
                deal_component = ev["verdict"].deal_score / 100.0
                style_component = _style_affinity(text, style_key)

                summary = ev["summary"]
                if summary.has_sufficient_history:
                    evidence_component = 1.0
                elif summary.observation_count > 1:
                    evidence_component = 0.5
                else:
                    evidence_component = 0.0

                selection_score = (
                    W_BUDGET_FIT * budget_fit
                    + W_DEAL_SCORE * deal_component
                    + W_STYLE * style_component
                    + W_EVIDENCE * evidence_component
                )
                in_range.append((selection_score, price, listing, product))

            if not in_range:
                if not matched_any:
                    reason, detail = (
                        "NO_MATCHING_PRODUCT",
                        f"No tracked {slot['label'].lower()} on Amazon or Flipkart yet.",
                    )
                else:
                    reason, detail = (
                        "OUT_OF_BUDGET_RANGE",
                        (
                            f"Tracked products exist but none priced between "
                            f"₹{lo:,.0f} and ₹{hi:,.0f}."
                        ),
                    )
                tier.unfilled.append(
                    UnfilledSlot(
                        slot_key=slot["key"],
                        slot_label=slot["label"],
                        phase=slot["phase"],
                        target_spend=round(target, 2),
                        reason=reason,
                        detail=detail,
                    )
                )
                continue

            # Deterministic ordering: best score, then cheaper, then lower id.
            in_range.sort(key=lambda r: (-r[0], r[1], r[2].id))
            selection_score, price, listing, product = in_range[0]
            used_listing_ids.add(listing.id)

            ev = evaluated[listing.id]
            summary = ev["summary"]
            verdict = ev["verdict"]
            merchant_token = _merchant_token(listing.merchant) or "amazon"

            discount_pct = 0.0
            if ev["mrp"] and ev["mrp"] > price:
                discount_pct = round(((ev["mrp"] - price) / ev["mrp"]) * 100, 1)

            tier.items.append(
                SetupItem(
                    slot_key=slot["key"],
                    slot_label=slot["label"],
                    phase=slot["phase"],
                    rationale=slot["rationale"],
                    product_id=listing.product_id,
                    listing_id=listing.id,
                    title=listing.title_at_merchant
                    or (product.canonical_title if product else f"Listing {listing.id}"),
                    brand=product.brand if product else None,
                    image_url=product.image_url if product else None,
                    merchant=merchant_token.capitalize(),
                    merchant_product_id=listing.merchant_product_id,
                    product_url=listing.clean_url,
                    affiliate_url=listing.affiliate_url
                    or build_affiliate_url(merchant_token, listing.clean_url),
                    price=price,
                    mrp=ev["mrp"],
                    discount_pct=discount_pct,
                    verdict=verdict.verdict,
                    deal_score=verdict.deal_score,
                    confidence=verdict.confidence,
                    verdict_summary=verdict.summary_reason,
                    provenance=ev["provenance"],
                    observation_count=summary.observation_count,
                    has_sufficient_history=summary.has_sufficient_history,
                    price_observed_at=(
                        ev["observed_at"].isoformat() if ev["observed_at"] else None
                    ),
                    historical_low=summary.lowest_price,
                    historical_median=summary.median_price,
                    target_spend=round(target, 2),
                    selection_score=round(selection_score, 4),
                )
            )

        # Totals, computed strictly from chosen real prices.
        tier.total_price = sum(i.price for i in tier.items)
        tier.phase1_total = sum(i.price for i in tier.items if i.phase == 1)
        tier.phase2_total = sum(i.price for i in tier.items if i.phase == 2)
        tier.budget_remaining = budget - tier.total_price

        priced_mrp = [i for i in tier.items if i.mrp and i.mrp > i.price]
        if priced_mrp:
            tier.total_mrp = sum((i.mrp or 0.0) for i in priced_mrp)
            tier.total_savings_vs_mrp = tier.total_mrp - sum(i.price for i in priced_mrp)

        essential_total = sum(1 for s in active if s["phase"] == 1)
        essential_filled = sum(1 for i in tier.items if i.phase == 1)
        tier.setup_score, tier.score_breakdown = _compute_setup_score(
            items=tier.items,
            essential_total=essential_total,
            essential_filled=essential_filled,
            budget=budget,
            total_price=tier.total_price,
        )

        items_with_history = sum(1 for i in tier.items if i.has_sufficient_history)
        tier.data_completeness = {
            "slots_total": len(active),
            "slots_filled": len(tier.items),
            "slots_unfilled": len(tier.unfilled),
            "essential_total": essential_total,
            "essential_filled": essential_filled,
            "items_with_sufficient_history": items_with_history,
            "items_awaiting_history": len(tier.items) - items_with_history,
            "is_complete": len(tier.unfilled) == 0,
            "notice": (
                None
                if len(tier.unfilled) == 0
                else f"{len(tier.unfilled)} slot(s) could not be filled from tracked products."
            ),
        }

        built_tiers.append(tier)

    owned_summary = {
        "count": len(skipped),
        "slots": [
            {"key": s["key"], "label": s["label"], "phase": s["phase"]} for s in skipped
        ],
        "note": (
            "Budget from owned slots was redistributed across the remaining items."
            if skipped
            else None
        ),
    }

    return {
        "status": "success",
        "space": blueprint["key"],
        "title": blueprint["title"],
        "tagline": blueprint["tagline"],
        "requested_budget": round(budget, 2),
        "style": style_key,
        "style_label": STYLE_PROFILES[style_key]["label"],
        "owned": owned_summary,
        "catalog_size": len(candidates),
        "tiers": [t.to_dict() for t in built_tiers],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
