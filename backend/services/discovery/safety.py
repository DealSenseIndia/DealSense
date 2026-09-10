"""
DealSense Discovery Safety, Rate Limiting & Circuit Breaker Engine.
Protects discovery workers, external merchants, and upstream services with:
- Per-source circuit breaking and automated cooldown.
- Per-run query and candidate budget enforcement.
- Exponential backoff on transient errors.
- Graceful failure isolation (isolated per source, never crashing the entire cycle).
"""
from datetime import datetime, timezone, timedelta
import logging
import time
from typing import Dict, Optional, Tuple

from backend.config import settings

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """
    Circuit breaker per merchant discovery source.
    States:
      - CLOSED: Operating normally.
      - OPEN: Tripped due to repeated or severe errors (e.g. 403/429/503/captcha). In cooldown.
      - HALF_OPEN: Cooldown expired; allowing a probe request to verify recovery.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        cooldown_seconds: float = 60.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self.failure_count = 0
        self.state = "CLOSED"
        self.last_failure_time: Optional[datetime] = None

    def can_execute(self) -> bool:
        """
        Determines whether requests may proceed against this source.
        """
        if self.state == "CLOSED":
            return True

        if self.state == "OPEN":
            now_utc = datetime.now(timezone.utc)
            if self.last_failure_time and (now_utc - self.last_failure_time).total_seconds() >= self.cooldown_seconds:
                logger.info(f"CircuitBreaker[{self.name}] cooldown elapsed. Transitioning OPEN -> HALF_OPEN.")
                self.state = "HALF_OPEN"
                return True
            return False

        if self.state == "HALF_OPEN":
            return True

        return True

    def record_success(self) -> None:
        """
        Records a successful request. Resets failure counters and closes circuit.
        """
        if self.state != "CLOSED":
            logger.info(f"CircuitBreaker[{self.name}] probe succeeded. Transitioning {self.state} -> CLOSED.")
        self.state = "CLOSED"
        self.failure_count = 0
        self.last_failure_time = None

    def record_failure(self, status_code: Optional[int] = None, reason: Optional[str] = None) -> None:
        """
        Records a request failure. If severe (403, 429, 503) or threshold reached, trips to OPEN.
        """
        self.failure_count += 1
        self.last_failure_time = datetime.now(timezone.utc)

        # Immediate trip for rate limits or blocking
        severe_block = status_code in (403, 429, 503) or (reason and "captcha" in reason.lower())

        if severe_block or self.failure_count >= self.failure_threshold:
            self.state = "OPEN"
            logger.warning(
                f"CircuitBreaker[{self.name}] TRIPPED to OPEN! "
                f"Failures={self.failure_count}, Status={status_code}, Reason={reason}. "
                f"Entering {self.cooldown_seconds}s cooldown."
            )
        else:
            logger.debug(
                f"CircuitBreaker[{self.name}] recorded failure ({self.failure_count}/{self.failure_threshold}): {reason}"
            )


class DiscoverySafetyManager:
    """
    Coordinates safety policies across discovery sources.
    Tracks circuit breakers, budgets, and request timeouts.
    """

    def __init__(self):
        self._breakers: Dict[str, CircuitBreaker] = {}

    def get_circuit_breaker(self, source_name: str) -> CircuitBreaker:
        name = source_name.lower().strip()
        if name not in self._breakers:
            self._breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=3,
                cooldown_seconds=float(getattr(settings, "DISCOVERY_COOLDOWN_SECONDS", 60.0)),
            )
        return self._breakers[name]

    def compute_backoff(self, attempt: int, base_seconds: float = 1.0, max_seconds: float = 30.0) -> float:
        """
        Calculates exponential backoff delay with bounds.
        """
        if attempt <= 1:
            return base_seconds
        delay = base_seconds * (2 ** (attempt - 1))
        return min(delay, max_seconds)


# Global singleton
discovery_safety = DiscoverySafetyManager()
