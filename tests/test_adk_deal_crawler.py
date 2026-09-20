"""
DealSense ADK Autonomous Deal Pipeline & Crawler Test Suite.
Tests multi-source candidate harvesting, verifier scoring, hot deal filtering,
coordinator cycle execution, and telemetry reporting.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import init_db
from backend.workers.adk_deal_pipeline import (
    DealCandidate,
    DealSenseScraperAgent,
    DealSenseVerifierAgent,
    DealSenseADKCoordinator,
    adk_coordinator,
)
from backend.services.deals_crawler import (
    get_live_deals_feed,
    refresh_deals_feed,
    get_crawler_status,
)


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def test_scraper_agent_loads_seeds():
    """Verifies that DealSenseScraperAgent loads curated deal seeds."""
    scraper = DealSenseScraperAgent()
    seeds = scraper.load_seeds()
    assert isinstance(seeds, list)
    assert len(seeds) > 0
    first_seed = seeds[0]
    assert "merchant" in first_seed
    assert "product_id" in first_seed


def test_scraper_agent_harvests_candidates():
    """Verifies that DealSenseScraperAgent harvests deal candidates."""
    scraper = DealSenseScraperAgent()
    candidates = scraper.run(max_candidates=10)
    assert isinstance(candidates, list)
    for c in candidates:
        assert isinstance(c, DealCandidate)
        assert c.title
        assert c.store
        assert c.live_price >= 0.0


def test_verifier_agent_scores_deal():
    """Verifies that DealSenseVerifierAgent evaluates real Deal Scores and hot deal flags."""
    verifier = DealSenseVerifierAgent()
    candidate = DealCandidate(
        title="Apple MacBook Air M2",
        store="Amazon",
        live_price=84990.0,
        mrp=114900.0,
        url="https://www.amazon.in/dp/B0B3CGF7PB",
        discount_pct=26.0,
    )

    verified = verifier.verify(candidate)
    assert verified.deal_score > 0
    assert verified.verdict in ("BUY", "WAIT", "AVOID")
    assert verified.confidence in ("HIGH", "MEDIUM", "LOW")
    assert verified.is_hot_deal is True  # 26% discount triggers hot deal


def test_adk_coordinator_execution_cycle():
    """Verifies that DealSenseADKCoordinator executes a complete cycle without error."""
    coordinator = DealSenseADKCoordinator()
    state = coordinator.execute_cycle(max_candidates=5)

    assert state.batch_id.startswith("adk-cycle-")
    assert isinstance(state.candidates, list)
    assert isinstance(state.approved_deals, list)
    assert state.duration_ms >= 0.0

    telemetry = coordinator.get_telemetry()
    assert telemetry["cycles_run"] >= 1


def test_deals_crawler_refresh_and_status():
    """Verifies deals_crawler runs cleanly and returns combined telemetry."""
    res = refresh_deals_feed()
    assert res["success"] is True
    assert "adk_batch_id" in res

    status = get_crawler_status()
    assert "pipeline_status" in status
    assert "adk_telemetry" in status


def test_pipeline_telemetry_endpoint():
    """Verifies that GET /api/v1/telemetry/pipeline returns aggregate health metrics."""
    client = TestClient(app)

    resp = client.get("/api/v1/telemetry/pipeline")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert "deals_crawler" in data
    assert "adk_coordinator" in data
    assert "observation_worker" in data
    assert "alert_worker" in data

    # Test alias
    resp_alias = client.get("/api/telemetry/pipeline")
    assert resp_alias.status_code == 200
