"""Atomic shared rate limits, persisted across serverless instances in PostgreSQL."""

import hashlib
import ipaddress
import os
from datetime import timedelta

from fastapi import HTTPException, Request
from sqlalchemy import case, delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import RateLimit


def client_address(request: Request) -> str:
    # Trust this platform-owned header only inside Vercel's runtime.
    if os.getenv("VERCEL") == "1":
        value = request.headers.get("x-vercel-forwarded-for", "").split(",")[0].strip()
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"


def consume(db: Session, namespace: str, subject: str, limit: int, seconds: int):
    key = hashlib.sha256(f"{namespace}:{subject}".encode()).hexdigest()
    expiry = func.now() + timedelta(seconds=seconds)
    expired = RateLimit.expires_at <= func.now()
    statement = insert(RateLimit).values(key=key, hits=1, expires_at=expiry)
    statement = statement.on_conflict_do_update(
        index_elements=[RateLimit.key],
        set_={
            "hits": case((expired, 1), else_=func.least(RateLimit.hits + 1, limit + 1)),
            "expires_at": case((expired, expiry), else_=RateLimit.expires_at),
        },
    ).returning(RateLimit.hits)
    hits = db.scalar(statement)
    # Expired keys cannot accumulate indefinitely. No raw IPs or credentials stored.
    db.execute(
        delete(RateLimit).where(RateLimit.expires_at < func.now() - timedelta(days=1))
    )
    db.commit()  # Count failed requests too, independently of the later endpoint result.
    if hits > limit:
        raise HTTPException(
            429,
            "Too many requests. Try again later.",
            headers={"Retry-After": str(seconds)},
        )
