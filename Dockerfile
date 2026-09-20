# ==============================================================================
# DealSense India — Production Multi-Stage Dockerfile
# ==============================================================================

# Stage 1: Dependency Builder
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip wheel --no-cache-dir --no-deps --wheel-dir /build/wheels -r requirements.txt

# ==============================================================================
# Stage 2: Lightweight Production Runtime
# ==============================================================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Install runtime utilities (curl for container healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy pre-built wheels from builder
COPY --from=builder /build/wheels /wheels
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir /wheels/* \
    && rm -rf /wheels

# Create unprivileged application user
RUN useradd -m -u 1001 appuser

# Create persistent database and log directories with correct permissions
RUN mkdir -p /app/data /app/logs && chown -R appuser:appuser /app

# Copy application source code
COPY --chown=appuser:appuser backend/ ./backend/
COPY --chown=appuser:appuser frontend/ ./frontend/
COPY --chown=appuser:appuser extension/ ./extension/
COPY --chown=appuser:appuser scripts/ ./scripts/
COPY --chown=appuser:appuser data/ ./data/

# Switch to unprivileged user
USER appuser

# Runtime Environment Configurations
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    DATABASE_URL="sqlite:///data/deal_intelligence.db"

# Container Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

EXPOSE 8000

# Start production server with Uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--log-level", "info"]
