"""
Unit & Integration Tests for Production Health Check, Status Monitoring,
and Cron Sweep Automation Endpoints.
"""

import os
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.observation_worker import worker
from backend.services.alert_worker import alert_worker


def test_health_check_endpoint():
    """GET /api/health returns database connectivity, catalog stats, and worker states."""
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "catalog" in data
    assert "products_count" in data["catalog"]
    assert "observations_count" in data["catalog"]
    assert "merchants" in data
    assert "workers" in data
    assert "observation_worker" in data["workers"]
    assert "alert_worker" in data["workers"]


def test_system_status_endpoint():
    """GET /api/status returns service info and multi-merchant adapter diagnostics."""
    client = TestClient(app)
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "online"
    assert data["service"] == "DealSense India"
    assert "adapters" in data
    assert "amazon" in data["adapters"]
    assert "flipkart" in data["adapters"]
    assert "observation_worker" in data
    assert "alert_worker" in data


def test_cron_sweep_endpoint_execution():
    """GET /api/cron/sweep executes observation and alert sweeps and returns summary."""
    client = TestClient(app)
    with patch.object(
        worker,
        "run_cycle",
        return_value={"due_count": 0, "processed_count": 0, "skipped_due_to_cooldown_or_spacing": 0, "results": []},
    ):
        with patch.object(alert_worker, "run_cycle", return_value=[]):
            resp = client.get("/api/cron/sweep")
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert "observation_summary" in data
            assert data["alerts_triggered_count"] == 0


def test_cron_sweep_endpoint_auth_when_secret_set():
    """POST /api/cron/sweep validates CRON_SECRET when configured in environment."""
    client = TestClient(app)
    with patch.dict(os.environ, {"CRON_SECRET": "super_secret_cron_token"}):
        # 1. Reject unauthorized request
        unauth_resp = client.post("/api/cron/sweep")
        assert unauth_resp.status_code == 401

        # 2. Accept authorized request with Bearer token
        with patch.object(
            worker,
            "run_cycle",
            return_value={"due_count": 0, "processed_count": 0, "skipped_due_to_cooldown_or_spacing": 0, "results": []},
        ):
            with patch.object(alert_worker, "run_cycle", return_value=[]):
                auth_resp = client.post(
                    "/api/cron/sweep",
                    headers={"Authorization": "Bearer super_secret_cron_token"},
                )
                assert auth_resp.status_code == 200
                assert auth_resp.json()["success"] is True
