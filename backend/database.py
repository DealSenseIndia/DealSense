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
    """Creates database tables defined by SQLModel."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    """Yields or returns a session for database transactions."""
    return Session(engine)
