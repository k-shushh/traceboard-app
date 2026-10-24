"""Opaque session tokens: only hashes are stored in PostgreSQL."""

import hashlib
import os
import secrets
from datetime import timedelta
from argon2 import PasswordHasher
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from .database import get_db
from .models import LoginSession, User, now

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(24))
COOKIE = "traceboard_session"


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def issue_session(db: Session, user: User, response: Response):
    token = secrets.token_urlsafe(32)
    db.add(
        LoginSession(
            token_hash=digest(token),
            user_id=user.id,
            expires_at=now() + timedelta(days=7),
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        samesite="strict",
        secure=os.getenv("COOKIE_SECURE") == "true",
        max_age=604800,
        path="/",
    )


def current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    session = db.get(LoginSession, digest(token)) if token else None
    if not session or session.expires_at <= now():
        raise HTTPException(401, "Please sign in.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(401, "Please sign in.")
    if (
        user.temporary_password_expires_at
        and user.temporary_password_expires_at <= now()
    ):
        raise HTTPException(401, "Temporary password expired. Request another reset.")
    if user.must_change_password and request.url.path not in {
        "/api/auth/me",
        "/api/auth/password",
        "/api/auth/logout",
    }:
        raise HTTPException(
            403, "Change your temporary password before accessing your workspace."
        )
    return user


def rate_limit(request: Request, db: Session = Depends(get_db)):
    from .limits import client_address, consume

    consume(db, "auth", client_address(request), limit=30, seconds=900)
