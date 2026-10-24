# Verification

Verified on 23 October 2026 against the separate PostgreSQL test database:

- 37 backend tests passed, including workspace/private-data isolation, account recovery, revoked sessions, permission checks before Groq calls, provider timeouts/errors, malformed/oversized model responses, reviewed task creation, per-user AI request limits, concurrent PostgreSQL rate-limit updates, production origin validation, Neon URL normalization, and the Vercel route configuration.
- 6 personal-board date-rule tests passed.
- TypeScript check passed.
- Production frontend build passed.
- Alembic schema check found no unapplied model changes. A local Vercel-mode smoke check passed for HTTPS health, rejected cross-origin writes, disabled API docs, and serverless connection pooling settings.

Groq responses were mocked. A live request was not run because no API key was supplied. Docker is not installed on the verification machine, so the Docker image and Compose startup have not been executed. Run those checks on the deployment host before launch.

The export excludes environment files except `.env.example`, databases, local accounts, installed dependencies, build output, caches, screenshots, and logs. A targeted scan checks for known local credentials/contact details, provider-key patterns, private keys, and machine-specific paths. This is a source-export check, not a penetration test or a guarantee that all dependency vulnerabilities are absent.

Test tooling currently emits a Starlette/httpx deprecation notice; it does not fail the suite. Authentication and AI throttles now share atomic PostgreSQL counters across instances. Vercel configuration follows the current Services documentation; an actual Vercel build and cloud connectivity have not been run because no cloud project or secrets were supplied. HTTPS, secret management, PostgreSQL backups, restores, and Groq account-level budget controls must be configured in the deployment environment.
