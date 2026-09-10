from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine
import backend.models  # noqa: F401

# Ensure data directory exists
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "deal_intelligence.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30.0},
)


def init_db() -> None:
    """Creates database tables defined by SQLModel and runs schema migrations for SQLite."""
    SQLModel.metadata.create_all(engine)

    try:
        with engine.connect() as conn:
            # Enable SQLite Write-Ahead Logging (WAL) and busy timeout
            conn.exec_driver_sql("PRAGMA journal_mode=WAL;")
            conn.exec_driver_sql("PRAGMA busy_timeout=10000;")

            # Safe auto-migration for products
            cursor = conn.exec_driver_sql("PRAGMA table_info(products)")
            existing_prod_cols = {row[1] for row in cursor.fetchall()}
            prod_cols = {
                "images_json": "TEXT",
                "rating": "FLOAT",
                "ratings_count": "TEXT",
                "bought_count": "TEXT",
                "badge": "TEXT",
                "highlight_tag": "TEXT",
                "specifications_json": "TEXT",
                "return_policy": "TEXT",
                "reviews_json": "TEXT",
                "rating_breakdown_json": "TEXT",
                "pros_json": "TEXT",
                "cons_json": "TEXT",
                "lifecycle_status": "TEXT DEFAULT 'IDENTIFIED'",
                "discovery_score": "FLOAT DEFAULT 0.0",
                "last_interacted_at": "DATETIME",
            }
            for col, col_type in prod_cols.items():
                if col not in existing_prod_cols:
                    conn.exec_driver_sql(f"ALTER TABLE products ADD COLUMN {col} {col_type}")

            # Safe auto-migration for merchant_listings
            cursor = conn.exec_driver_sql("PRAGMA table_info(merchant_listings)")
            existing_ml_cols = {row[1] for row in cursor.fetchall()}
            ml_cols = {
                "delivery_info": "TEXT",
                "seller": "TEXT",
                "return_policy": "TEXT",
                "is_prime": "BOOLEAN DEFAULT 0",
                "is_f_assured": "BOOLEAN DEFAULT 0",
                "coupons_json": "TEXT",
                "delivery_fee": "FLOAT DEFAULT 0.0",
                "next_check_at": "DATETIME",
                "failure_count": "INTEGER DEFAULT 0",
                "refresh_priority": "TEXT DEFAULT 'NORMAL'",
                "last_error": "TEXT",
            }
            for col, col_type in ml_cols.items():
                if col not in existing_ml_cols:
                    conn.exec_driver_sql(f"ALTER TABLE merchant_listings ADD COLUMN {col} {col_type}")

            # Safe auto-migration for price_alerts
            cursor = conn.exec_driver_sql("PRAGMA table_info(price_alerts)")
            existing_pa_cols = {row[1] for row in cursor.fetchall()}
            pa_cols = {
                "listing_id": "INTEGER",
                "alert_type": "TEXT DEFAULT 'TARGET_PRICE'",
                "baseline_price": "FLOAT",
                "target_percentage": "FLOAT",
                "target_deal_score": "INTEGER",
                "status": "TEXT DEFAULT 'ARMED'",
                "is_persistent": "BOOLEAN DEFAULT 0",
                "cooldown_hours": "INTEGER DEFAULT 24",
                "cooldown_until": "DATETIME",
                "last_triggered_at": "DATETIME",
                "last_trigger_price": "FLOAT",
                "rearm_threshold_price": "FLOAT",
                "trigger_count": "INTEGER DEFAULT 0",
                "updated_at": "DATETIME",
                "telegram_chat_id": "TEXT",
                "telegram_username": "TEXT",
                "telegram_bind_token": "TEXT",
                "telegram_token_expires_at": "DATETIME",
            }
            for col, col_type in pa_cols.items():
                if col not in existing_pa_cols:
                    conn.exec_driver_sql(f"ALTER TABLE price_alerts ADD COLUMN {col} {col_type}")

            # Safe auto-index and column migration for discovery_candidates
            try:
                cursor = conn.exec_driver_sql("PRAGMA table_info(discovery_candidates)")
                existing_dc_cols = {row[1] for row in cursor.fetchall()}
                dc_cols = {
                    "source_type": "TEXT DEFAULT 'category'",
                    "discovery_method": "TEXT DEFAULT 'bestseller'",
                }
                for col, col_type in dc_cols.items():
                    if col not in existing_dc_cols:
                        conn.exec_driver_sql(f"ALTER TABLE discovery_candidates ADD COLUMN {col} {col_type}")

                conn.exec_driver_sql(
                    "CREATE INDEX IF NOT EXISTS ix_discovery_candidates_status_priority_next "
                    "ON discovery_candidates (status, discovery_priority, next_attempt_at);"
                )
                conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_discovery_candidates_dedupe_key "
                    "ON discovery_candidates (dedupe_key);"
                )
            except Exception:
                pass

            conn.commit()
    except Exception as e:
        print(f"Warning: SQLite auto-migration note: {e}")


def get_session() -> Session:
    """Yields or returns a session for database transactions."""
    return Session(engine)
