"""
Unit & Integration Tests for Observation Worker Cycle Execution and Telemetry Endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from backend.main import app
from backend.services.observation_worker import worker, ObservationWorker
from backend.services.observation_service import ObservationResult, ObservationStatus


def test_observation_worker_status_api():
    """GET /api/observation/worker/status returns status diagnostics."""
    client = TestClient(app)
    resp = client.get("/api/observation/worker/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "is_running" in data
    assert "active_merchant_queues" in data
    assert "stats" in data


def test_observation_worker_trigger_api_with_mock():
    """POST /api/observation/worker/trigger sweeps due listings."""
    client = TestClient(app)
    with patch.object(
        worker,
        "run_cycle",
        return_value={
            "due_count": 2,
            "processed_count": 2,
            "skipped_due_to_cooldown_or_spacing": 0,
            "results": [
                {"listing_id": 1, "merchant": "amazon", "status": "processed"},
                {"listing_id": 2, "merchant": "flipkart", "status": "processed"},
            ],
            "timestamp": "2026-10-06T15:00:00Z",
        },
    ):
        resp = client.post("/api/observation/worker/trigger?max_items=5")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["summary"]["processed_count"] == 2
        assert len(data["summary"]["results"]) == 2


def test_observation_worker_run_cycle_direct():
    """ObservationWorker.run_cycle executes without unhandled exceptions."""
    test_worker = ObservationWorker(poll_interval_seconds=1.0)
    # Mock _get_due_listings and _process_listing to test scheduling cycle logic
    with patch.object(test_worker, "_get_due_listings", return_value=[(10, "amazon", 100)]):
        with patch.object(test_worker, "_can_scrape_merchant", return_value=True):
            with patch.object(test_worker, "_process_listing") as mock_proc:
                res = test_worker.run_cycle(max_items=1)
                assert res["due_count"] == 1
                assert res["processed_count"] == 1
                assert len(res["results"]) == 1
                assert res["results"][0]["listing_id"] == 10
                mock_proc.assert_called_once_with(10, "amazon", 100)
