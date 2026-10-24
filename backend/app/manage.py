"""Server-console account provisioning; no default accounts or stored plaintext passwords."""

import argparse
import getpass
import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .auth import normalize_phone
from .database import SessionLocal
from .models import User, Workspace
from .security import hasher


def password():
    first = getpass.getpass("Password (12+ characters): ")
    second = getpass.getpass("Confirm password: ")
    if first != second or not 12 <= len(first) <= 128:
        raise SystemExit("Passwords must match and contain 12–128 characters.")
    return hasher.hash(first)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["init", "add-member", "reset-admin"])
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        admin = db.scalar(select(User).where(User.handle == "traceboard_admin"))
        if args.command == "init":
            if admin:
                raise SystemExit("Admin already exists. Use add-member or reset-admin.")
            name = input("Workspace name: ").strip()
            if not 2 <= len(name) <= 80:
                raise SystemExit("Workspace name must contain 2–80 characters.")
            workspace = Workspace(name=name)
            db.add(workspace)
            db.flush()
            db.add(
                User(
                    name="Workspace Admin",
                    handle="traceboard_admin",
                    email=f"{uuid.uuid4()}@accounts.invalid",
                    password_hash=password(),
                    workspace_id=workspace.id,
                    role="admin",
                    is_admin_account=True,
                )
            )
        elif args.command == "reset-admin":
            if not admin:
                raise SystemExit("Run init first.")
            from sqlalchemy import delete
            from .models import LoginSession

            admin.password_hash = password()
            admin.must_change_password = False
            admin.temporary_password_expires_at = None
            db.execute(delete(LoginSession).where(LoginSession.user_id == admin.id))
        else:
            if not admin:
                raise SystemExit("Run init first.")
            name = input("Member name: ").strip()
            handle = input("Mention handle (lowercase): ").strip()
            phone = normalize_phone(input("Phone with country code: ").strip())
            if (
                not 2 <= len(name) <= 80
                or not re.fullmatch(r"[a-z][a-z0-9_]{2,29}", handle)
                or not phone
            ):
                raise SystemExit("Invalid name, handle, or phone.")
            db.add(
                User(
                    name=name,
                    handle=handle,
                    phone=phone,
                    email=f"{uuid.uuid4()}@accounts.invalid",
                    password_hash=password(),
                    workspace_id=admin.workspace_id,
                    role="member",
                    must_change_password=True,
                )
            )
    print("Account saved. Admin signs in as admin; members use their phone number.")


if __name__ == "__main__":
    try:
        main()
    except IntegrityError:
        raise SystemExit(
            "That account identifier already exists. No account was changed."
        ) from None
