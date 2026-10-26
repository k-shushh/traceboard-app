# Traceboard

**A focused workspace for tasks, project notes, and team progress.**

Traceboard brings a shared task board and a personal, date-based agenda into one application. Built for small software and AI development teams, it keeps everyday planning close to the notes, people, and deliverables behind the work.

React · TypeScript · Vite · FastAPI · PostgreSQL

## What you can do

| Feature | How it works |
| --- | --- |
| **Task Board** | Move tasks, bugs, and experiments between To do, In progress, and Done using drag handles, keyboard controls, or a card's status selector. |
| **Team and personal views** | Switch between shared work and your personal view. Private tasks and notes are protected by server-side access checks. |
| **My Board** | Choose a due date and see your assigned work in To do, In progress, and Done. Optionally include unfinished overdue work and tasks without a due date. |
| **Compact cards** | Expand a task to read its details, edit it, or change status. Collapse all cards when you need a quick overview. |
| **Completed-task visibility** | Hide all done tasks or hide individual completed cards, then show and restore them later. These preferences belong to your account in the current browser. |
| **Deliverable dates** | Add an optional due date. Undated work stays visible, and unfinished overdue tasks remain available. |
| **Shared assignments** | Assign one teammate, several teammates, or everyone. Cards show the assigned people. |
| **Projects and filters** | Organize work by project, search tasks, and narrow the board by priority. Rename a project with its sidebar pencil or the selected project's Rename project button; existing task and note links are preserved. |
| **Project notes** | Capture decisions and action items in a rich-text editor, with shared and personal visibility. |
| **Mentions and notifications** | Mention teammates in supported task and note content and receive in-app notifications for mentions and assignments. |
| **Completion insights** | Review daily, weekly, and monthly completions, recent completed tasks, and current workload. |
| **Account controls** | Sign in with a phone number and password, edit your profile, change your password, and request an admin-assisted reset. |

Moving a card changes its status and position, not its priority or deliverable date. Completion insights use the completion event: a task due on the 21st and completed on the 23rd counts on the 23rd.

## AI that stays optional

Two explicit actions use Groq:

- **Notes to tasks:** save a note and choose **Find tasks with Groq**, review and edit the drafts, then choose **Create selected tasks**. **Use local suggestions instead** is a separate fallback.
- **Progress recap:** generate a short written recap from the selected completion insights.

Generated drafts do not create or assign tasks automatically. Local task extraction and numeric insights remain available without Groq. Provider requests run through the authenticated backend; the browser never receives the API key.

See [notes-to-tasks setup and diagnostics](docs/NOTES-TO-TASKS.md) for configuration, error codes, and verification details.

## Designed for everyday use

The interface pairs **Honey & Charcoal** with restrained **rose-gold** accents. Light mode uses warm ivory surfaces; dark mode uses a near-black base. Honey highlights primary actions and navigation, while rose gold appears in avatars and note icons.

Task priorities use distinct coloured borders and subtle matching backgrounds, with the same colour families across both themes. Priority is also included in accessible card labels.

On phones, both boards use status tabs to keep cards readable, with bottom navigation for Tasks, My Board, Notes, and Insights. My Board's date controls remain available above the status tabs. Hidden cards are a view preference, not deleted tasks; a reopened or updated task becomes visible again unless the Hide done filter applies.

## How the application fits together

```text
React interface
    |
    | JSON requests + session cookie
    v
FastAPI
    |-- Validates input and checks workspace permissions
    |-- Saves tasks, notes, sessions, and completion events in PostgreSQL
    |-- Creates assignment and mention notifications
    `-- Calls Groq for user-requested suggestions and recaps
```

| Layer | Technology |
| --- | --- |
| Interface | React, TypeScript, Vite |
| Board interactions | dnd-kit |
| Rich-text editing | Tiptap |
| Icons and styling | Lucide, CSS theme tokens and responsive layouts |
| API and validation | FastAPI, Pydantic |
| Database access | SQLAlchemy, psycopg, PostgreSQL |
| Schema changes | Alembic migrations |
| Authentication | Argon2 password hashes, opaque HttpOnly session cookies |
| Optional AI | Groq API through HTTPX |
| Verification | pytest integration tests, Node date-rule tests, TypeScript checks |

## Codebase

```text
traceboard-app/
├── backend/
│   ├── app/                 API routes, models, permissions, AI, and account tools
│   ├── migrations/          Versioned database schema changes
│   ├── tests/               Workflow, privacy, recovery, and AI integration tests
│   ├── alembic.ini          Migration configuration
│   └── requirements*.txt    Python dependencies and pinned versions
├── web/
│   ├── src/
│   │   ├── components/      Boards, notes, insights, dialogs, and account UI
│   │   ├── App.tsx          Workspace state and navigation
│   │   ├── api.ts           Browser-to-server request handling
│   │   ├── agenda.ts        Personal board date-grouping rules
│   │   ├── styles.css       Theme tokens and responsive styles
│   │   └── types.ts         Shared frontend data shapes
│   ├── tests/               Date and assignment grouping tests
│   └── package.json         Frontend commands and dependencies
├── scripts/                 Database setup and account provisioning
├── docs/                    Development, learning, and verification references
├── .env.example             Blank configuration template
└── README.md
```

## Explore and contribute

Start with the [development guide](docs/DEVELOPMENT.md) to run the application locally. Follow the [learning guide](docs/LEARNING-GUIDE.md) to trace a task from its React card through the API to a database transaction.

For a code change, keep input validation and access checks on the server, add a migration when the schema changes, and run the checks relevant to the change. The [verification notes](docs/VERIFICATION.md) record tested behaviour and checks that still depend on the target environment.

## Current scope

Traceboard is a working MVP for a small team. It supports one workspace per account and periodically refreshes visible data; live collaborative editing, file attachments, SSO, and SMS verification are not implemented. A phone number identifies a login account; it is not proof of phone ownership.

The source contains no pre-created accounts or default passwords. Accounts and workspace data live in your database. Detailed environment and hosting references are kept under `docs/`.
