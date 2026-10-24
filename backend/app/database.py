"""One database engine per process; one unit of work (Session) per request."""

import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def postgres_url(value: str):
    try:
        url = make_url(value)
        if (
            url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}
            or not url.host
            or not url.database
        ):
            raise ValueError()
        return url.set(drivername="postgresql+psycopg")
    except Exception:
        # Connection strings contain passwords; don't echo malformed input.
        raise RuntimeError(
            "Set a valid PostgreSQL DATABASE_URL in the server environment."
        ) from None


DATABASE_URL = postgres_url(os.environ.get("DATABASE_URL", ""))
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    **({"poolclass": NullPool} if os.getenv("VERCEL") == "1" else {}),
    connect_args={"connect_timeout": 10, "prepare_threshold": None},
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as db:
        yield db
