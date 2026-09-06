"""
DealWise Live Deals Crawler & Feed Interface.
Delegates live feed generation, background scanning, and deal ranking to the real deal pipeline.
"""

from typing import Dict, Any, Optional

from backend.services.deal_pipeline import (
    get_ranked_deals,
    refresh_deal_pool,
    get_pipeline_status,
    start_background_refresh,
)


def get_live_deals_feed(category: Optional[str] = None, deal_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns filtered deals with real-time freshness metadata,
    evaluated from verified database observations.
    """
    return get_ranked_deals(category=category, deal_type=deal_type)


def refresh_deals_feed() -> Dict[str, Any]:
    """
    Refreshes verified deals feed from database records.
    """
    result = refresh_deal_pool()
    return {
        "success": True,
        "message": result.get("message", "Refreshed deals feed from database"),
        "status": result.get("status"),
        "feed": get_live_deals_feed(),
    }
