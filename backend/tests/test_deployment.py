import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.config import deployment_config
from app.database import engine, postgres_url
from app.limits import client_address, consume
from app.models import RateLimit, now


def test_shared_rate_limit_is_atomic_across_connections():
    subject = str(uuid.uuid4())
    key = hashlib.sha256(f"test:{subject}".encode()).hexdigest()

    def attempt(_):
        with Session(engine) as db:
            try:
                consume(db, "test", subject, limit=5, seconds=60)
                return 200
            except HTTPException as error:
                return error.status_code

    try:
        with ThreadPoolExecutor(max_workers=4) as workers:
            results = list(workers.map(attempt, range(10)))
        assert results.count(200) == 5
        assert results.count(429) == 5
        with Session(engine) as db:
            db.get(RateLimit, key).expires_at = now() - timedelta(seconds=1)
            db.commit()
        assert attempt(None) == 200
    finally:
        with Session(engine) as db:
            db.execute(delete(RateLimit).where(RateLimit.key == key))
            db.commit()


def test_provider_database_urls_and_sanitized_error():
    for prefix in ["postgres://", "postgresql://", "postgresql+psycopg://"]:
        value = postgres_url(
            prefix
            + "user:test-only@db.example/app?sslmode=require&channel_binding=require"
        )
        assert value.drivername == "postgresql+psycopg"
        assert value.query["sslmode"] == "require"
    with pytest.raises(RuntimeError) as error:
        postgres_url("secret-malformed-value")
    assert "secret-malformed-value" not in str(error.value)


def test_platform_origins_are_exact_and_cookies_required(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("VERCEL_URL", "traceboard-deployment.vercel.app")
    monkeypatch.setenv("VERCEL_PROJECT_PRODUCTION_URL", "traceboard-team.vercel.app")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    production, hosts, origins = deployment_config()
    assert production and "traceboard-team.vercel.app" in hosts
    assert "https://traceboard-deployment.vercel.app" in origins
    assert "https://unrelated.vercel.app" not in origins
    monkeypatch.setenv("COOKIE_SECURE", "false")
    with pytest.raises(RuntimeError):
        deployment_config()


def test_reject_wildcard_and_malformed_origins(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    for host, origin in [
        ("*", "https://app.example"),
        ("app.example", "http://app.example"),
        ("app.example", "https://app.example/"),
        ("app.example", "https://evil.example"),
    ]:
        monkeypatch.setenv("ALLOWED_HOSTS", host)
        monkeypatch.setenv("ALLOWED_ORIGINS", origin)
        with pytest.raises(RuntimeError):
            deployment_config()


def test_only_trust_platform_ip_header_inside_vercel(monkeypatch):
    request = Request(
        {
            "type": "http",
            "headers": [(b"x-vercel-forwarded-for", b"203.0.113.7")],
            "client": ("127.0.0.1", 1234),
        }
    )
    monkeypatch.delenv("VERCEL", raising=False)
    assert client_address(request) == "127.0.0.1"
    monkeypatch.setenv("VERCEL", "1")
    assert client_address(request) == "203.0.113.7"


def test_vercel_routes_preserve_same_origin_api():
    config = json.loads(
        (Path(__file__).resolve().parents[2] / "vercel.json").read_text()
    )
    assert config["services"]["frontend"]["root"] == "web"
    assert config["services"]["backend"]["entrypoint"] == "app.main:app"
    assert config["rewrites"][1] == {
        "source": "/api/(.*)",
        "destination": {"service": "backend"},
    }
