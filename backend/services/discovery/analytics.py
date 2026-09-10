"""
DealSense Lightweight Discovery Analytics.
Analyzes discovery candidate provenance, conversion rates, and effectiveness
using existing SQLite database structures.
"""
from typing import Dict, Any, List, Optional
from sqlmodel import Session, select, func

from backend.models import DiscoveryCandidate, MerchantListing, Product, PriceObservation


def get_discovery_analytics(session: Session) -> Dict[str, Any]:
    """
    Computes key performance indicators and provenance metrics for candidate discovery:
    - Which source discovers the most valid products?
    - Which categories generate the most candidates?
    - Which queries generate useful products?
    - What percentage of candidates become valid listings?
    - What percentage obtain real observations?
    - What percentage eventually become Deal Candidates?
    """
    candidates = session.exec(select(DiscoveryCandidate)).all()
    total_candidates = len(candidates)

    if total_candidates == 0:
        return {
            "total_candidates": 0,
            "sources": {},
            "categories": {},
            "queries": {},
            "listing_conversion_rate": 0.0,
            "observation_conversion_rate": 0.0,
            "deal_candidate_conversion_rate": 0.0,
        }

    by_source: Dict[str, Dict[str, int]] = {}
    by_category: Dict[str, Dict[str, int]] = {}
    by_query: Dict[str, Dict[str, int]] = {}

    valid_listings_count = 0
    observed_count = 0
    deal_candidate_count = 0

    for c in candidates:
        src = c.source_name or "unknown"
        cat = c.category_hint or "unclassified"
        qry = c.query or "none"

        is_accepted = c.status in ("IDENTIFIED", "OBSERVED", "TRACKING") or c.listing_id is not None
        has_obs = c.status in ("OBSERVED", "TRACKING")
        is_deal = c.status == "DEAL_CANDIDATE"

        if c.listing_id is not None:
            valid_listings_count += 1
        if has_obs:
            observed_count += 1
        if is_deal:
            deal_candidate_count += 1

        # Source aggregation
        if src not in by_source:
            by_source[src] = {"total": 0, "accepted": 0}
        by_source[src]["total"] += 1
        if is_accepted:
            by_source[src]["accepted"] += 1

        # Category aggregation
        if cat not in by_category:
            by_category[cat] = {"total": 0, "accepted": 0}
        by_category[cat]["total"] += 1
        if is_accepted:
            by_category[cat]["accepted"] += 1

        # Query aggregation
        if qry not in by_query:
            by_query[qry] = {"total": 0, "accepted": 0}
        by_query[qry]["total"] += 1
        if is_accepted:
            by_query[qry]["accepted"] += 1

    listing_conversion_rate = round((valid_listings_count / total_candidates) * 100, 2)
    observation_conversion_rate = round((observed_count / total_candidates) * 100, 2)
    deal_candidate_conversion_rate = round((deal_candidate_count / total_candidates) * 100, 2)

    return {
        "total_candidates": total_candidates,
        "valid_listings_count": valid_listings_count,
        "observed_count": observed_count,
        "deal_candidate_count": deal_candidate_count,
        "listing_conversion_rate_pct": listing_conversion_rate,
        "observation_conversion_rate_pct": observation_conversion_rate,
        "deal_candidate_conversion_rate_pct": deal_candidate_conversion_rate,
        "sources": by_source,
        "categories": by_category,
        "queries": by_query,
    }
