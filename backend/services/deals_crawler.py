"""
DealSense Live Deals Crawler & Feed Interface.
Coordinates live feed generation, background scanning, deal ranking,
and autonomous Google ADK deal cycle execution.
"""

from typing import Dict, Any, Optional

from backend.services.deal_pipeline import (
    get_ranked_deals,
    refresh_deal_pool,
    get_pipeline_status,
    start_background_refresh,
)
from backend.workers.adk_deal_pipeline import adk_coordinator


def get_live_deals_feed(category: Optional[str] = None, deal_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns filtered deals with real-time freshness metadata,
    evaluated from verified database observations.
    """
    return get_ranked_deals(category=category, deal_type=deal_type)


def refresh_deals_feed(broadcast_hot_deals: bool = False) -> Dict[str, Any]:
    """
    Refreshes verified deals feed from database records and runs the ADK deal cycle.
    """
    # 1. Run ADK deal harvesting & scoring cycle
    adk_state = adk_coordinator.execute_cycle(broadcast_hot_deals=broadcast_hot_deals)

    # 2. Refresh ranked pool from verified database observations
    result = refresh_deal_pool()

    return {
        "success": True,
        "message": result.get("message", "Refreshed deals feed from database"),
        "status": result.get("status"),
        "adk_batch_id": adk_state.batch_id,
        "adk_candidates_evaluated": len(adk_state.candidates),
        "adk_hot_deals_approved": len(adk_state.approved_deals),
        "feed": get_live_deals_feed(),
    }


def get_crawler_status() -> Dict[str, Any]:
    """Returns combined crawler and ADK pipeline telemetry."""
    return {
        "pipeline_status": get_pipeline_status(),
        "adk_telemetry": adk_coordinator.get_telemetry(),
    }
