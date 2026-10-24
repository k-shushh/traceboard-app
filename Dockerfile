FROM node:22-bookworm-slim AS web-build
WORKDIR /build
RUN npm install --global pnpm@11.0.0
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements-lock.txt /app/backend/requirements-lock.txt
RUN pip install --no-cache-dir -r backend/requirements-lock.txt \
    && useradd --create-home --uid 10001 traceboard
COPY backend/ /app/backend/
COPY --from=web-build /build/dist /app/web/dist
USER traceboard
WORKDIR /app/backend
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --no-proxy-headers"]

