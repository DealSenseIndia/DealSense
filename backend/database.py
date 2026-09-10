from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine

# Ensure data directory exists
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "deal_intelligence.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"

engine = create_engine(DATABASE_URL, echo=False)


def init_db() -> None:
    """Creates database tables defined by SQLModel and runs schema migrations for SQLite."""
    SQLModel.metadata.create_all(engine)

    try:
        with engine.connect() as conn:
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
            }
            for col, col_type in ml_cols.items():
                if col not in existing_ml_cols:
                    conn.exec_driver_sql(f"ALTER TABLE merchant_listings ADD COLUMN {col} {col_type}")

            conn.commit()
    except Exception as e:
        print(f"Warning: SQLite auto-migration note: {e}")


def get_session() -> Session:
    """Yields or returns a session for database transactions."""
    return Session(engine)
