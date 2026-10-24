# Local development

This guide runs the React frontend and FastAPI backend as separate local processes. See [LEARNING-GUIDE.md](LEARNING-GUIDE.md) for a guided tour of the code.

## Requirements

- Python 3.12
- Node.js 22.12 or later in the 22.x line
- pnpm 11
- PostgreSQL 14 or later, with a database and role available to the application

## Configure the backend

Open PowerShell in the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
Copy-Item .env.example .env
```

Edit the ignored `.env` file. Set `DATABASE_URL` to your PostgreSQL connection URL, including the database name, username, and password. Keep `APP_ENV=development`, `COOKIE_SECURE=false`, and the supplied local host/origin settings for local HTTP development. If using a hosted database, retain the provider's required TLS parameters.

`DIRECT_DATABASE_URL` is optional for local PostgreSQL; set it when migrations should use a different direct connection. `GROQ_API_KEY` is optional and belongs only in the backend environment. Never give it a `VITE_` prefix.

Create the tables and initial accounts:

```powershell
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
cd backend
..\.venv\Scripts\python.exe -m app.manage init
..\.venv\Scripts\python.exe -m app.manage add-member
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

`init` runs once for a new database and asks for a workspace name and admin password. Run `add-member` for each teammate. Member accounts use phone-number login and must change their initial passwords on first sign-in. No account credentials are supplied by the repository.

## Start the frontend

Open another PowerShell window in the repository root:

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. Vite forwards `/api` requests to the backend on port 8000. Changes to React and CSS are reflected by the development server.

## Run checks

Create a separate PostgreSQL database whose name ends in `_test` and set `TEST_DATABASE_URL` in your environment or ignored root `.env`. Tests reject other database names, apply migrations to the test database, and isolate workflow changes. Provider requests are mocked; these tests do not use a live Groq key.

From the repository root:

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest tests -q
cd ..\web
pnpm test
pnpm typecheck
pnpm build
```

The frontend build produces `web/dist`, which is ignored by Git. Backend tests need the separate test database to be reachable.

## Working on the schema

After changing SQLAlchemy models, generate and review an Alembic migration. From the repository root:

```powershell
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini revision --autogenerate -m "Describe the schema change"
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
```

Inspect generated operations before applying them. Changing a frontend type or Python model does not update an existing database automatically.

## Repository boundaries

Commit source files, dependency lockfiles, migrations, and documentation. Keep `.env`, installed dependencies, build output, database dumps, logs, and private credentials out of commits. `.env.example` is a blank template and is intended to be versioned.

For a hosted instance, use [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md). This is separate from the product overview in the README.
