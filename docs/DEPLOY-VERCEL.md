# Deploy Traceboard: Vercel + Neon + Groq

This guide starts with this source folder and an empty cloud database. Local accounts, tasks, and passwords are not copied. You will create fresh accounts during setup.

The architecture is:

```text
Browser -> your Vercel domain
           /       -> React + Vite static frontend
           /api/*  -> FastAPI Python function -> Neon PostgreSQL
                                            -> Groq (when requested)
```

`vercel.json` uses [Vercel Services](https://vercel.com/docs/services), currently Beta, to deploy both services in one project. No Next.js or Docker is required for this deployment. The API uses a pooled database URL; migrations use a direct URL.

## 1. Create the PostgreSQL database

1. Sign in at [Neon](https://console.neon.tech/) and create a project named `traceboard`.
2. Choose a region near your team. Use a nearby Vercel function region where available.
3. Open **Connect** and select your production branch, database, and role. Keep these selections the same for both URLs below.
4. Turn **Connection pooling ON** and copy the PostgreSQL connection URL. Its hostname includes `-pooler`. This becomes Vercel's `DATABASE_URL` in step 5.
5. Turn **Connection pooling OFF** and copy the direct connection URL for step 2. Do not put this URL in GitHub or documentation.

Copy only the URL beginning `postgresql://`, without a `psql` command or surrounding quotes. Keep its query parameters, including `sslmode=require` and any `channel_binding` setting. The application accepts the standard Neon URL without changing its prefix. [Neon pooling documentation](https://neon.com/docs/connect/connection-pooling).

## 2. Create tables and accounts

Install Python 3.12 if it is not already available. Open PowerShell and run:

```powershell
cd "$env:USERPROFILE\Desktop\traceboard-app"
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-lock.txt
.\.venv\Scripts\python.exe scripts\cloud_setup.py
```

The last command asks for the **direct** Neon URL. Paste it into the hidden prompt; nothing will appear while you paste. It is used in memory, not written to a file or included in shell command history.

The script then:

1. Applies all database migrations to create the tables.
2. Asks for a workspace name and a new admin password (12–128 characters).
3. Offers to add teammates. Enter each name, lowercase mention handle, phone with country code, and initial password. Teammates must change their initial password on first sign-in.

The separate Admin login uses username `admin` and the password you just chose. There is no supplied admin password. Team members use their phone number and their new initial password.

If setup stops after creating the admin, do not rerun `setup` to add members. Use:

```powershell
.\.venv\Scripts\python.exe scripts\cloud_setup.py add-member
```

The generated `.venv` is ignored by Git; it is only local tooling. You do not need a local PostgreSQL server for this step.

## 3. Push the source to GitHub

Create an empty GitHub repository. From the Desktop folder, initialize Git if necessary, review the staged files, commit, and push to that repository:

```powershell
git init
git add .
git status --short
git diff --cached --stat
git diff --cached
git commit -m "Prepare Traceboard for Vercel"
git branch -M main
# Replace the placeholder with the URL of your empty repository:
git remote add origin https://github.com/YOUR-ACCOUNT/traceboard-app.git
git push -u origin main
```

If this is already a Git repository, use its existing branch and remote instead of recreating them. `vercel.json`, `backend`, and `web` must be at the repository root. `.env.example` contains variable names and blank placeholders, not keys. Never force-add `.env` files, database exports, keys, or local dependencies.

## 4. Create the Groq key

1. Sign in to [Groq Console API Keys](https://console.groq.com/keys).
2. Create a key for Traceboard and keep it in your password manager until step 5.
3. Review project/model permissions and available spending controls in your Groq account.

The backend reads `GROQ_API_KEY`. No key belongs in a React file, a `VITE_*` variable, or GitHub. See the [Groq quickstart](https://console.groq.com/docs/quickstart).

## 5. Import into Vercel and add configuration

1. In Vercel choose **Add New -> Project**, connect GitHub, and import this repository.
2. Keep **Root Directory** at the repository root (`.`). Do not select `web` or `backend`. The checked-in service configuration defines both builds. Do not override it with a single frontend build command.
3. Use Node.js **22.x**. Python **3.12** is selected by `backend/.python-version`.
4. In the import screen's environment variables, or **Project -> Settings -> Environment Variables**, add the following for **Production**:

| Name | Value | Secret? |
| --- | --- | --- |
| `DATABASE_URL` | The pooled Neon URL from step 1, including its TLS parameters | Yes |
| `GROQ_API_KEY` | Your actual Groq key | Yes |
| `APP_ENV` | `production` | No |
| `COOKIE_SECURE` | `true` | No |
| `ALLOW_PUBLIC_SIGNUP` | `false` | No |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` (optional; this is the code default) | No |

Mark the first two as Secret/sensitive when the interface offers that setting. Select Production only for production credentials. Do not include quotation marks around values. `POSTGRES_PASSWORD`, `TEST_DATABASE_URL`, and `DIRECT_DATABASE_URL` are not needed in Vercel.

Keep **Automatically expose System Environment Variables** enabled. The server uses Vercel's exact deployment and production URLs for its host/origin allowlists; you do not need to know the generated domain before the first deployment. Do not manually set `VERCEL` or `VERCEL_URL`.

If you add a custom domain later, also configure:

```text
ALLOWED_HOSTS=tasks.your-company.com
ALLOWED_ORIGINS=https://tasks.your-company.com
```

Replace the example domain with yours. No trailing slash in origins, no protocol in hosts, and no wildcards. Multiple domains use comma-separated values. Vercel-provided deployment URLs remain allowed automatically.

**How the secret reaches the code:** Vercel injects it into the server environment when the function runs. FastAPI reads it and calls Groq. The browser only calls `/api`; it never needs the key. GitHub stores the code that reads the variable, not its value. [Environment variables](https://vercel.com/docs/environment-variables), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables), [sensitive variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

## 6. Deploy and verify

Click **Deploy**. If you added or changed variables after a deployment, **Redeploy** so the new deployment receives them.

1. Confirm the build includes both `frontend` and `backend` services.
2. Open your production domain and verify the login screen appears.
3. Open `/api/health` on that same domain. It should return `{"status":"ok","database":"PostgreSQL"}`. This checks database connectivity; sign-in also checks that the required tables/accounts exist.
4. Use Admin login with the new admin password, then test a teammate's phone login and required password change.
5. Create a task, refresh the page, and confirm it persists.
6. Save a project note and click **Generate with Groq**. Review its drafts before creating tasks. Also try the Groq recap in Insights.

Groq is optional: leaving its key unset preserves local task extraction and numeric recaps. A live call can still fail if the key, model permissions, provider limits, or billing configuration are invalid.

## Subsequent changes and previews

For releases with schema changes, back up the database and apply reviewed migrations before deploying code that needs them:

```powershell
.\.venv\Scripts\python.exe scripts\cloud_setup.py migrate
```

The script prompts for the direct URL again. Migrations are intentionally not run inside Vercel builds or on every request. Account maintenance uses `add-member` or `reset-admin` with the same script. Admin-assisted team password resets remain in the app.

For Preview deployments, create a separate Neon branch/database, apply migrations there, and add its pooled URL to Vercel's **Preview** environment. Use a separate Groq key if enabling AI there. A branch copied from production can contain production data: use empty/test data for previews. Configure `APP_ENV=production`, `COOKIE_SECURE=true`, and `ALLOW_PUBLIC_SIGNUP=false` in Preview too. If you configure only Production variables, previews will not have a functioning backend; use the Production URL until preview setup is complete.

The API uses PostgreSQL-backed authentication and AI request limits across instances. Pooling is managed by Neon; Vercel functions do not retain a local SQLAlchemy connection pool. Rate limits are not a Groq spending cap. Configure provider budget controls and database backups in those services.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Frontend works, `/api` returns HTML or 404 | Import root is `.`, both services are detected, and checked-in rewrites have not been overridden. |
| Backend fails to start | Production environment variables are set, secure cookies are enabled, and system variables are exposed. Check Vercel runtime logs without sharing credentials. |
| Database timeout or authentication failure | Correct pooled URL, branch/role/database, TLS query parameters, and provider access settings. |
| Missing table / relation error | Run `cloud_setup.py migrate` against the matching direct URL. |
| Login says invalid credentials | The cloud database starts empty; create the admin and members in step 2. Local app passwords are not imported. |
| 400 Invalid host or 403 origin rejection | Use the production URL; configure exact host/origin pairs for extra aliases or custom domains, then redeploy. |
| 429 Too many requests | Wait for the rate-limit window; avoid repeated login attempts or AI clicks. |
| Groq unavailable | Check the Production key, model access and provider limits, then redeploy after changing configuration. |

Local validation is recorded in [VERIFICATION.md](VERIFICATION.md). The Vercel deployment and live Neon/Groq connectivity must be verified with your accounts; no hosted deployment or provider credentials are included in this source export.
