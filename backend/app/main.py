import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import text
from .database import engine
from .config import deployment_config

production, hosts, origins = deployment_config()
from . import auth, tasks, notes, workspace, insights, ai

app = FastAPI(
    title="Traceboard API",
    version="0.1.0",
    description="Team workspace with authenticated PostgreSQL storage.",
    docs_url=None if production else "/docs",
    openapi_url=None if production else "/openapi.json",
    redoc_url=None,
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)


@app.middleware("http")
async def boundary(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        # A browser form on another site cannot perform authenticated writes.
        if (
            request.headers.get("origin") not in origins
            or request.headers.get("x-traceboard-request") != "1"
        ):
            return JSONResponse(
                {"detail": "Request origin or CSRF header rejected."}, status_code=403
            )
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 262144:
            return JSONResponse({"detail": "Request too large."}, status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "database": "PostgreSQL"}


for router in (
    auth.router,
    tasks.router,
    notes.router,
    workspace.router,
    insights.router,
    ai.router,
):
    app.include_router(router)


# One origin for the compiled React UI and /api; no public API key or CORS workaround.
static_dir = Path(__file__).resolve().parents[2] / "web" / "dist"
if os.getenv("VERCEL") != "1" and static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="web")
