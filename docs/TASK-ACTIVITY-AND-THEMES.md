# Task discussions, deletion, and themes

Expand any card in Task Board or My Board and choose **Comments & activity**. You can also open **Edit task** to reach the same details.

- **Post comment** saves an update with its author and timestamp. Comments support plain text, line breaks, and existing teammate @mentions. They are retained unchanged as a record of the discussion.
- **Create subtask** opens an editable title. The complete original comment becomes the description. The new task starts in To do and inherits the parent's project, priority, visibility, and assignees. Its due date starts empty. The comment stays in the discussion and links to the new task. Repeating the conversion returns the same subtask.
- Parent and subtask links open their respective details. Subtasks also appear as ordinary board cards, with a Subtask label, and can be assigned, scheduled, edited, completed, and deleted independently.
- Task creation, edits, status changes, conversion, and parent deletion add activity entries. Existing tasks begin accumulating these entries after this update; historical edits are not reconstructed. Use **Refresh updates** to fetch other teammates' latest comments without discarding edits to the task form.
- **Delete task / bug / experiment** asks for confirmation. It removes the item and its discussion from normal access. Existing subtasks become standalone tasks. Deletion is not reversible through the app. Database records are soft-deleted to retain their identifiers and audit data; task numbers are not reused. Deleted tasks are excluded from board and insight queries, and their notifications are removed. A stale version is rejected instead of deleting a newer edit.
- Existing workspace permissions apply: teammates can collaborate on shared items, and only the owner can access a private item. Other workspaces cannot read or change the discussion or linked subtasks.

Under **Profile → Settings**, select Champagne & Onyx, Antique Gold & Ivory, Honey & Charcoal (with rose-gold accents), Rose Gold & Porcelain, or Navy & Gold. Choose Light or Dark separately. Both choices persist in this browser; existing users keep Honey & Charcoal by default.

## Deploy this update

This update requires migration `a317c8d90e21` in addition to the frontend and backend files. Apply the migration before deploying the new application code. The migration only adds nullable task columns and an activity table; it does not delete existing tasks.

From the repository root, using your existing Python environment:

```powershell
python scripts/cloud_setup.py migrate
```

Enter the Neon **direct** connection string at the hidden prompt, then upload/commit the updated source and redeploy Vercel. Existing accounts and credentials remain unchanged. Never upload `.env`, `node_modules`, `.venv`, or local database files.

## Validation

67 PostgreSQL integration tests and 7 frontend tests pass. TypeScript and production build pass. Browser checks cover posting and retrying comments, conversion, parent/subtask navigation, deletion confirmation and cancellation, mobile overflow, persisted appearance choices, and normal-text contrast for all five palettes in both modes.
