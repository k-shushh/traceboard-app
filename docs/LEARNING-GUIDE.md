# Learn by following one task

The useful thing to learn first is the complete path of a small change. Open the app, move a task, then follow that change through these files.

## 1. React turns data into a screen

Start with `web/src/types.ts`. A `Task` has a title, status, priority, assignee, project, and version. TypeScript checks those shapes while you develop; it does not secure the server or validate incoming network data.

Next read `web/src/components/Board.tsx`. `Board` receives tasks and callbacks as **props**. It filters tasks into columns, and each card renders data. `useState` keeps temporary UI choices such as the active dragged card and the selected mobile column.

The component does not talk directly to PostgreSQL. It calls `onMove(task, status, beforeId)`, allowing the parent to coordinate saving and refreshing the workspace.

**Try:** change the empty-column message. Then add a new harmless card detail, such as the task type. You are changing presentation, not the stored task model.

## 2. State belongs to the component that coordinates it

Read `web/src/App.tsx`. This component owns the signed-in user, workspace data, navigation, filters, dialogs, and the move callback. A successful API write is followed by a refresh, so the screen reflects the server's saved state.

`useEffect` synchronizes with things outside rendering: checking the session, applying the theme, and periodically refreshing visible data. Network requests run here or in event handlers, not during rendering.

The editor and insights views use `lazy` and `Suspense`. Their JavaScript loads when needed. This keeps the rich-text editor out of the initial login/board download.

**Try:** add a task-type filter alongside the priority filter. Use the existing task list; no database change is needed.

## 3. An API is a contract between two programs

Read `web/src/api.ts`. The browser sends JSON to a relative `/api` URL. Vite forwards `/api` to FastAPI on port 8000 during local development. This keeps frontend requests on the same browser origin as the app.

For a board move, the request looks like:

```http
POST /api/tasks/<task-id>/move
Content-Type: application/json
X-Traceboard-Request: 1

{"status":"progress","before_id":null,"version":1}
```

There is deliberately **no priority field**. A movement request cannot accidentally change priority.

The session cookie is attached by the browser. Frontend JavaScript cannot read the HttpOnly cookie. API errors become `ApiError`, which the UI displays rather than pretending a save succeeded.

**Try:** use the browser Network panel to inspect a move request and response. Avoid sharing screenshots containing session or invitation tokens.

## 4. FastAPI validates the request and checks access

Read `backend/app/schemas.py`, then `backend/app/tasks.py`.

Pydantic validates inputs: permitted statuses, priority values, title length, and required fields. FastAPI dependencies inject a database session and the signed-in user into each endpoint.

`current_user` in `security.py` hashes the incoming session token, finds the session record, checks its expiry, and loads the user. `accessible` in `services.py` then checks the requested item's workspace and private-owner rule. Knowing another task's ID is not enough to read or edit it.

**Try:** run the privacy tests and read the assertions. Notice that hiding a card in React is never treated as a permission check.

## 5. PostgreSQL commits the change

Read `models.py` and `database.py`. SQLAlchemy maps Python records to database tables. Each HTTP request gets a short-lived SQLAlchemy `Session`; `commit()` saves the transaction.

The move endpoint locks the workspace while updating ordering, checks the task's version, updates its status/position, and commits. If it enters Done, it also writes a completion event in the same transaction. Both changes succeed together.

The version starts at 1 and increments on edits. If two users both load version 1, the first save advances it to 2. The second user's request still says 1, so the server returns **409 Conflict**. Their editor keeps their unsaved text and explains that they need to reload.

**Try:** open the same task in two browsers signed in to the same workspace. Edit and save in one; then attempt to save the older editor in the other.

## 6. A migration is a versioned database change

Read `backend/migrations/versions/7f0039251617_initial_workspace_schema.py`. It explicitly creates tables, foreign keys, and indexes. Alembic records which migration has run.

Changing a TypeScript type does not change PostgreSQL. Changing a SQLAlchemy model alone does not change an existing database either. Model changes require a reviewed migration:

```powershell
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini revision --autogenerate -m "Describe your change"
.\.venv\Scripts\python.exe -m alembic -c backend\alembic.ini upgrade head
```

Always inspect generated migrations before applying them, especially any drop/rename operation. The initial app uses immutable task/note visibility to avoid accidentally exposing previously private history or notifications.

## 7. Notes and insights build on the same foundation

`Notes.tsx` uses Tiptap to edit a structured JSON document. FastAPI validates the supported document nodes and derives plain text for mentions and task suggestions. The plain text is derived by the server, not trusted from a browser-supplied duplicate field.

`notes.py` finds action lines but creates nothing until the user reviews and submits the selected drafts. Conversion is transactional and rejects an outdated note version. Exact duplicate titles from the same source note are skipped.

`insights.py` uses completion events and the viewer's timezone. A task counts once per bucket even if completed twice. Reopening does not erase history. Personal historical completion counts use the assignee at completion time; current workload uses the current assignee.

## 8. Follow the deliverable-date feature through the stack

`TaskDialog.tsx` collects an optional date as an ISO calendar string (`YYYY-MM-DD`) or `null`. Native date inputs listen for both input and change events so picker and typed edits stay synchronized with React state. `schemas.py` validates it as a Python `date`; `models.py` stores it in a nullable PostgreSQL `DATE` column. Migration `b62d11d9a240_task_deliverable_date.py` adds that column without changing existing task data. Moving a card updates status/order only, preserving its date and priority.

`agenda.ts` is a pure function: given tasks, a user, a cutoff, today's date, and the completed toggle, it returns the agenda groups and counts. `MyBoard.tsx` renders that result. Keeping the counting rules outside the component makes them easy to study and test. Run `pnpm test` from `web` with Node 22.6+ to exercise the November 9/11 example. Dates are compared as calendar strings to avoid UTC shifts.

`ProfileMenu.tsx` handles keyboard and click navigation. `AccountDialogs.tsx` saves display-name edits through `PATCH /api/auth/me`; the server restricts that endpoint to the signed-in account's name. Appearance settings use the existing local theme preference.

## 9. UI refinement and shared assignments

`Select.tsx` provides a themed single-select rather than relying on browser-native popup colors. Its trigger keeps keyboard focus, exposes the active listbox option to assistive technology, and supports arrows, Home/End, selection, Escape, and Tab. The popup renders inside the active dialog when needed, keeping it above the modal backdrop. Its position is clamped to the viewport.

`assign_all` is a separate boolean field, not a fake user ID and not a renamed null assignment. Existing unassigned tasks stay unchanged. Validation rejects combining Assign all with a private task or individual assignee. The personal board and current-workload metrics include shared assignments. Completion events snapshot current team members so personal history stays accurate if the team changes; team metrics still deduplicate by task ID. Notifications are generated only when entering the shared assignment or introducing a new mention.

## 10. Multiple assignees are a many-to-many relationship

`TaskAssignee` links task IDs to user IDs with a composite primary key and foreign keys. The migration backfills existing individual assignments. SQLAlchemy's `selectin` loading retrieves assignees in a batch instead of querying separately for every card. The API returns `assignee_ids`; the original `assignee_id` remains a compatibility field mirroring the first explicit assignee.

`normalize_assignees` deduplicates IDs, validates workspace membership, and enforces private-task rules. Assignment notifications compare old and new sets. Completion events snapshot all selected assignees; team metrics still count the task once. `AssigneeSelect.tsx` reuses the themed listbox with multiple selection and keyboard toggles. `Select.tsx` sizes menus from their content and clamps them to the viewport.

## 11. Reuse presentation; enforce recovery on the server

`MyBoard.tsx` uses the pure `buildAgenda` date rules to render Scheduled, Unscheduled, and Overdue columns. CSS Grid lays out the three categories side by side on desktop and stacks them on phones. Each card opens the existing task editor. Category membership comes from the deliverable date and completion status; the view does not change stored tasks to rearrange the layout.

`Auth.tsx` handles phone/team login, admin login, and recovery requests. `AdminPanel.tsx` displays pending requests; `AccountDialogs.tsx` contains the change-password form. These screens only collect input. `auth.py` verifies passwords, scopes reset approvals to the admin's workspace, hashes credentials, and rotates sessions transactionally. `security.py` enforces mandatory password changes even if someone bypasses React and calls the API directly. See migration `e0348bf6a012_phone_and_password_recovery.py` for the new fields and request table, and the integration tests for expired temporary passwords and revoked sessions.

## 12. Keep external AI behind the API

`backend/app/ai.py` owns the Groq key and HTTPS request. It checks the signed-in user before reading notes or recomputing insight metrics. The browser sends a note ID or filter selection, never an API key or trusted completion counts. Pydantic validates the returned JSON; invalid output becomes a generic error. Generated task drafts still require the existing review-and-create step.

The UI labels Groq actions and the data they send. Local extraction and numeric recaps remain available. `backend/tests/test_ai.py` uses a mocked HTTP transport to check provider errors, output validation, and authorization without spending API credits. Follow `README.md` for environment configuration and container deployment. `app.manage` provisions accounts interactively without embedding real passwords in source or shell arguments.

## 13. Deploy separate services without changing browser requests

`vercel.json` routes `/api` to FastAPI and other requests to the Vite frontend on the same domain. React keeps using relative URLs and HttpOnly session cookies. `config.py` allows exact Vercel-provided hosts and origins, requires secure cookies in production, and supports explicit custom domains.

`database.py` accepts standard PostgreSQL URLs. On Vercel, it disables the local connection pool because Neon manages pooling across short-lived functions. `limits.py` uses an atomic PostgreSQL upsert: concurrent instances share the same request counter rather than each starting a new in-memory allowance. A hash of the counter subject is stored instead of a raw IP address. Vercel's platform-owned client-IP header is trusted only inside Vercel.

`scripts/cloud_setup.py` prompts for a direct database URL, applies Alembic migrations, and invokes the existing account CLI. This separates database changes from frontend builds and avoids preview builds changing the production schema. See [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md) for the walkthrough.

## A sensible learning order

1. JavaScript basics: arrays, objects, functions, `map`, `filter`, promises, `async/await`.
2. React: JSX, components, props, state, forms, effects.
3. TypeScript: object types, unions, generics, narrowing.
4. HTTP: methods, JSON, status codes, cookies, errors.
5. FastAPI: schemas, dependencies, routes, tests.
6. SQL/PostgreSQL: tables, primary/foreign keys, joins, indexes, transactions.
7. Authentication, authorization, concurrency, migrations, and deployment.

You do not need to learn everything before changing something. Make one small visible change, explain how its data flows, and then add the next piece.

Useful primary documentation: [Thinking in React](https://react.dev/learn/thinking-in-react), [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html), [Vite guide](https://vite.dev/guide/), [FastAPI tutorial](https://fastapi.tiangolo.com/tutorial/), and [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html).
