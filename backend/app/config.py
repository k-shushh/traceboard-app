"""Explicit origins plus platform-provided URLs; no wildcard preview trust."""

import os
from urllib.parse import urlsplit


def deployment_config():
    on_vercel = os.getenv("VERCEL") == "1"
    production = os.getenv("APP_ENV") == "production" or (
        on_vercel and os.getenv("VERCEL_ENV") != "development"
    )
    hosts = {h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()}
    origins = {
        o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()
    }
    if on_vercel:
        for key in ("VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
            host = os.getenv(key, "").strip()
            if host and not any(c in host for c in "/:@*?#"):
                hosts.add(host)
                origins.add(f"https://{host}")
    if production:
        if os.getenv("COOKIE_SECURE") != "true":
            raise RuntimeError("Hosted deployments require COOKIE_SECURE=true.")
        if (
            not hosts
            or not origins
            or any("*" in host or "://" in host or "/" in host for host in hosts)
        ):
            raise RuntimeError("Configure explicit deployment hosts and HTTPS origins.")
        for origin in origins:
            value = urlsplit(origin)
            if (
                value.scheme != "https"
                or not value.hostname
                or value.hostname not in hosts
                or value.path
                or value.query
                or value.fragment
                or value.username
                or value.password
                or "*" in origin
            ):
                raise RuntimeError(
                    "ALLOWED_ORIGINS must contain exact HTTPS origins with matching ALLOWED_HOSTS and no trailing slash."
                )
    else:
        hosts = hosts or {"127.0.0.1", "localhost", "testserver"}
        origins = origins or {
            "http://127.0.0.1:3000",
            "http://localhost:3000",
            "http://127.0.0.1:8000",
        }
    return production, sorted(hosts), origins
