import secrets
import os
import re
from datetime import timedelta
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .database import get_db
from .models import User, Workspace, Invite, LoginSession, PasswordResetRequest, now
from .schemas import (
    Register,
    Login,
    InviteInput,
    ProfileEdit,
    PasswordChange,
    ResetRequestInput,
)
from .security import (
    hasher,
    DUMMY_HASH,
    digest,
    issue_session,
    current_user,
    COOKIE,
    rate_limit,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def public_user(user):
    return {
        k: getattr(user, k)
        for k in (
            "id",
            "name",
            "handle",
            "email",
            "phone",
            "role",
            "workspace_id",
            "is_admin_account",
            "must_change_password",
        )
    }


@router.post("/register", dependencies=[Depends(rate_limit)])
def register(data: Register, response: Response, db: Session = Depends(get_db)):
    if not data.invite and os.getenv("ALLOW_PUBLIC_SIGNUP", "false") != "true":
        raise HTTPException(
            403, "Public registration is disabled. Contact your administrator."
        )
    email = str(data.email).lower()
    invite = None
    if data.invite:
        invite = db.scalar(
            select(Invite)
            .where(Invite.token_hash == digest(data.invite))
            .with_for_update()
        )
        if (
            not invite
            or invite.used
            or invite.expires_at <= now()
            or invite.email != email
        ):
            raise HTTPException(
                400, "Invitation is invalid, expired, or for a different email."
            )
        workspace_id = invite.workspace_id
        invite.used = True
    else:
        workspace = Workspace(name=data.workspace)
        db.add(workspace)
        db.flush()
        workspace_id = workspace.id
    user = User(
        name=data.name,
        handle=data.handle,
        email=email,
        password_hash=hasher.hash(data.password),
        workspace_id=workspace_id,
        role="member" if invite else "admin",
    )
    db.add(user)
    try:
        db.flush()
        issue_session(db, user, response)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This email or handle is already registered.")
    return public_user(user)


@router.post("/login", dependencies=[Depends(rate_limit)])
def login(
    data: Login, response: Response, request: Request, db: Session = Depends(get_db)
):
    identifier = data.identifier or str(data.email)
    if data.mode == "admin":
        user = (
            db.scalar(
                select(User).where(
                    User.is_admin_account.is_(True), User.handle == "traceboard_admin"
                )
            )
            if identifier == "admin"
            else None
        )
    elif "@" in identifier:
        # Keep existing email-only workspaces compatible; migrated team accounts use phone login.
        user = db.scalar(
            select(User).where(
                User.email == identifier.lower(),
                User.phone.is_(None),
                User.is_admin_account.is_(False),
            )
        )
    else:
        phone = normalize_phone(identifier)
        user = (
            db.scalar(
                select(User).where(
                    User.phone == phone, User.is_admin_account.is_(False)
                )
            )
            if phone
            else None
        )
    try:
        valid = hasher.verify(user.password_hash if user else DUMMY_HASH, data.password)
    except (VerificationError, InvalidHashError):
        valid = False
    if (
        not valid
        or not user
        or (
            user.temporary_password_expires_at
            and user.temporary_password_expires_at <= now()
        )
    ):
        raise HTTPException(
            401, "Login details are incorrect or the temporary password has expired."
        )
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(data.password)
    old_token = request.cookies.get(COOKIE)
    old = db.get(LoginSession, digest(old_token)) if old_token else None
    if old:
        db.delete(old)
    issue_session(db, user, response)
    db.commit()
    return public_user(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    session = db.get(LoginSession, digest(token)) if token else None
    if session:
        db.delete(session)
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return public_user(user)


@router.patch("/me")
def edit_profile(
    data: ProfileEdit, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    user.name = data.name
    db.commit()
    return public_user(user)


@router.post("/password", dependencies=[Depends(rate_limit)])
def change_password(
    data: PasswordChange,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    try:
        valid = hasher.verify(user.password_hash, data.current_password)
    except (VerificationError, InvalidHashError):
        valid = False
    if not valid:
        raise HTTPException(400, "Current password is incorrect.")
    if data.current_password == data.new_password:
        raise HTTPException(400, "Choose a different new password.")
    user.password_hash = hasher.hash(data.new_password)
    user.must_change_password = False
    user.temporary_password_expires_at = None
    # Revoke old sessions, then rotate the session on this device atomically.
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    issue_session(db, user, response)
    db.commit()
    return {"ok": True}


@router.post("/invites")
def invite(
    data: InviteInput, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    if user.role != "admin":
        raise HTTPException(403, "Only workspace admins can invite members.")
    token = secrets.token_urlsafe(32)
    db.add(
        Invite(
            token_hash=digest(token),
            email=str(data.email).lower(),
            workspace_id=user.workspace_id,
            expires_at=now() + timedelta(days=7),
        )
    )
    db.commit()
    return {"token": token, "email": data.email, "expires_in_days": 7}


def normalize_phone(value):
    compact = re.sub(r"[\s()-]", "", value)
    if compact.isdigit() and len(compact) == 10:
        compact = "+91" + compact
    if compact.isdigit() and len(compact) == 12 and compact.startswith("91"):
        compact = "+" + compact
    return compact if re.fullmatch(r"\+[1-9][0-9]{7,14}", compact) else None


@router.post("/password-reset-request", dependencies=[Depends(rate_limit)])
def request_reset(data: ResetRequestInput, db: Session = Depends(get_db)):
    phone = normalize_phone(data.phone)
    user = (
        db.scalar(
            select(User)
            .where(User.phone == phone, User.is_admin_account.is_(False))
            .with_for_update()
        )
        if phone
        else None
    )
    if user and (
        not user.must_change_password
        or not user.temporary_password_expires_at
        or user.temporary_password_expires_at <= now()
    ):
        entry = db.get(PasswordResetRequest, user.id)
        if not entry:
            db.add(PasswordResetRequest(user_id=user.id))
        elif entry.approved_at:
            entry.requested_at = now()
            entry.approved_at = None
        db.commit()
    return {
        "message": "If this phone number is registered, your admin will receive a reset request. Contact your admin for the temporary password."
    }


def require_admin(user):
    if user.role != "admin":
        raise HTTPException(403, "Only admins can manage password resets.")


@router.get("/password-resets")
def reset_requests(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_admin(user)
    rows = db.execute(
        select(PasswordResetRequest, User)
        .join(User, PasswordResetRequest.user_id == User.id)
        .where(
            User.workspace_id == user.workspace_id,
            User.is_admin_account.is_(False),
            PasswordResetRequest.approved_at.is_(None),
        )
        .order_by(PasswordResetRequest.requested_at)
    ).all()
    return [
        {
            "user_id": person.id,
            "name": person.name,
            "phone": person.phone,
            "requested_at": entry.requested_at,
        }
        for entry, person in rows
    ]


@router.post("/password-resets/{user_id}/approve", dependencies=[Depends(rate_limit)])
def approve_reset(
    user_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    require_admin(user)
    person = db.scalar(
        select(User)
        .where(
            User.id == user_id,
            User.workspace_id == user.workspace_id,
            User.is_admin_account.is_(False),
        )
        .with_for_update()
    )
    entry = db.get(PasswordResetRequest, user_id) if person else None
    if not entry or entry.approved_at:
        raise HTTPException(404, "Pending reset request not found.")
    temporary = secrets.token_urlsafe(18)
    person.password_hash = hasher.hash(temporary)
    person.must_change_password = True
    person.temporary_password_expires_at = now() + timedelta(days=1)
    entry.approved_at = now()
    db.execute(delete(LoginSession).where(LoginSession.user_id == person.id))
    db.commit()
    return {
        "name": person.name,
        "temporary_password": temporary,
        "expires_at": person.temporary_password_expires_at,
    }
