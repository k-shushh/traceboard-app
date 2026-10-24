"""Integration tests use a separate PostgreSQL database and rollback every test."""

import os
from pathlib import Path
from dotenv import dotenv_values
import pytest
from sqlalchemy.engine import make_url

root = Path(__file__).resolve().parents[2]
values = dotenv_values(root / ".env")
test_url = os.environ.get("TEST_DATABASE_URL") or values.get("TEST_DATABASE_URL", "")
if not test_url or not make_url(test_url).database.endswith("_test"):
    raise RuntimeError(
        "Tests require a PostgreSQL TEST_DATABASE_URL whose database ends in _test."
    )
os.environ["DATABASE_URL"] = test_url
os.environ["DIRECT_DATABASE_URL"] = test_url
for key in (
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "ALLOWED_HOSTS",
    "ALLOWED_ORIGINS",
):
    os.environ.pop(key, None)
os.environ["ALLOW_PUBLIC_SIGNUP"] = "true"
os.environ["APP_ENV"] = "test"
os.environ["COOKIE_SECURE"] = "false"
os.environ.pop("GROQ_API_KEY", None)

from app.database import engine, get_db
from app.main import app
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from alembic import command
from alembic.config import Config


@pytest.fixture(scope="session", autouse=True)
def migrate():
    command.upgrade(Config(str(root / "backend" / "alembic.ini")), "head")


@pytest.fixture
def clients():
    connection = engine.connect()
    outer = connection.begin()

    def override():
        with Session(
            bind=connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        ) as db:
            yield db

    app.dependency_overrides[get_db] = override
    made = []

    def make():
        client = TestClient(
            app,
            headers={"origin": "http://127.0.0.1:3000", "x-traceboard-request": "1"},
        )
        made.append(client)
        return client

    yield make
    for client in made:
        client.close()
    app.dependency_overrides.clear()
    outer.rollback()
    connection.close()
