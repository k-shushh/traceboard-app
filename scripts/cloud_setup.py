"""Apply migrations and provision accounts from your computer, using a hidden URL prompt."""

import argparse
import getpass
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        nargs="?",
        default="setup",
        choices=["setup", "migrate", "init", "add-member", "reset-admin"],
    )
    args = parser.parse_args()
    value = getpass.getpass("Neon DIRECT connection string (hidden): ").strip()
    # Set before importing application modules; never save or print the secret.
    os.environ["DATABASE_URL"] = value
    os.environ["DIRECT_DATABASE_URL"] = value
    from app.database import postgres_url

    url = postgres_url(value)
    if url.query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        raise SystemExit("Use the Neon connection string including sslmode=require.")
    if "-pooler" in (url.host or ""):
        raise SystemExit(
            "Turn Connection pooling OFF in Neon and copy the direct URL for setup."
        )
    from alembic import command
    from alembic.config import Config
    from app.manage import main as manage
    from sqlalchemy.exc import SQLAlchemyError

    try:
        if args.command in {"setup", "migrate"}:
            command.upgrade(Config(str(ROOT / "backend" / "alembic.ini")), "head")
            print("Database migrations applied.")
        if args.command == "setup":
            sys.argv = ["manage", "init"]
            manage()
            while input("Add a teammate? [y/N]: ").strip().lower() == "y":
                sys.argv = ["manage", "add-member"]
                manage()
        elif args.command != "migrate":
            sys.argv = ["manage", args.command]
            manage()
    except SQLAlchemyError:
        raise SystemExit(
            "Database setup failed. Check the direct URL, access, and duplicate account identifiers. No credentials were printed."
        ) from None


if __name__ == "__main__":
    main()
