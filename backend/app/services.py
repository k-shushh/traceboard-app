"""Reusable permission, validation, and notification rules."""

import json
import re
from fastapi import HTTPException
from sqlalchemy import select, or_, func
from .models import (
    Task,
    Note,
    Project,
    User,
    Workspace,
    Notification,
    Completion,
    TaskAssignee,
    TaskActivity,
    now,
)


def visible(model, user):
    return (
        model.workspace_id == user.workspace_id,
        or_(model.private.is_(False), model.owner_id == user.id),
        *((model.deleted_at.is_(None),) if model is Task else ()),
    )


def accessible(db, model, item_id, user, lock=False):
    query = select(model).where(model.id == item_id, *visible(model, user))
    item = db.scalar(query.with_for_update() if lock else query)
    if not item:
        raise HTTPException(404, "Item not found.")
    return item


def check_version(item, version):
    if item.version != version:
        raise HTTPException(
            409, "Someone updated this item. Close and reopen it to load their changes."
        )


def check_references(db, user, project_id=None, assignee_id=None, private=False):
    if project_id:
        project = db.get(Project, project_id)
        if not project or project.workspace_id != user.workspace_id:
            raise HTTPException(400, "Choose a project in this workspace.")
    if assignee_id:
        person = db.get(User, assignee_id)
        if (
            not person
            or person.workspace_id != user.workspace_id
            or person.is_admin_account
        ):
            raise HTTPException(400, "Choose a teammate in this workspace.")
    if private and assignee_id not in (None, user.id):
        raise HTTPException(400, "A private task can only be assigned to you.")


def assignee_ids(task):
    return [entry.user_id for entry in task.assignees]


def normalize_assignees(db, user, values):
    # Accept the original single-assignee API while using the relation for all new reads.
    explicit = values.pop("assignee_ids", None)
    legacy = values.get("assignee_id")
    ids = list(
        dict.fromkeys(
            explicit if explicit is not None else ([legacy] if legacy else [])
        )
    )
    if explicit is not None and legacy and legacy not in ids:
        raise HTTPException(400, "Conflicting assignee fields.")
    if values.get("assign_all") and (ids or values.get("private")):
        raise HTTPException(
            400, "Assign all requires a shared task without individual assignees."
        )
    if values.get("private"):
        if any(person != user.id for person in ids):
            raise HTTPException(400, "A private task can only be assigned to you.")
        ids = [user.id]
    if ids:
        valid = set(
            db.scalars(
                select(User.id).where(
                    User.workspace_id == user.workspace_id,
                    User.id.in_(ids),
                    User.is_admin_account.is_(False),
                )
            )
        )
        if valid != set(ids):
            raise HTTPException(400, "Choose teammates in this workspace.")
    values["assignee_id"] = ids[0] if ids else None
    return ids


def set_assignees(task, ids):
    existing = {entry.user_id: entry for entry in task.assignees}
    task.assignees = [
        existing[person] if person in existing else TaskAssignee(user_id=person)
        for person in ids
    ]


def serialize(item):
    result = {
        column.name: getattr(item, column.name) for column in item.__table__.columns
    }
    if isinstance(item, Task):
        result["assignee_ids"] = assignee_ids(item)
    return result


def mention_ids(db, user, text):
    handles = set(re.findall(r"(?<![\w@])@([a-z][a-z0-9_]{2,29})(?![\w])", text))
    if not handles:
        return set()
    return set(
        db.scalars(
            select(User.id).where(
                User.workspace_id == user.workspace_id, User.handle.in_(handles)
            )
        )
    )


def notify_changes(
    db,
    item,
    actor,
    text,
    previous="",
    old_assignee=None,
    old_assign_all=False,
    old_assignee_ids=None,
):
    if item.private:
        return
    targets = mention_ids(db, actor, text) - mention_ids(db, actor, previous)
    if isinstance(item, Task):
        if item.assign_all and not old_assign_all:
            targets.update(
                db.scalars(
                    select(User.id).where(
                        User.workspace_id == actor.workspace_id,
                        User.is_admin_account.is_(False),
                    )
                )
            )
        elif not item.assign_all and not old_assign_all:
            previous_ids = set(
                old_assignee_ids
                if old_assignee_ids is not None
                else ([old_assignee] if old_assignee else [])
            )
            targets.update(set(assignee_ids(item)) - previous_ids)
    targets.discard(actor.id)
    for target in targets:
        db.add(
            Notification(
                user_id=target,
                message=f"{actor.name} mentioned or assigned you: {item.title}"[:350],
                task_id=item.id if isinstance(item, Task) else None,
                note_id=item.id if isinstance(item, Note) else None,
            )
        )


def mark_completion(db, task, old_status):
    if task.status == "done" and old_status != "done":
        # Snapshot the current team for personal history. Team metrics deduplicate task IDs.
        recipients = (
            list(
                db.scalars(
                    select(User.id).where(
                        User.workspace_id == task.workspace_id,
                        User.is_admin_account.is_(False),
                    )
                )
            )
            if task.assign_all
            else (assignee_ids(task) or [None])
        )
        completed_at = now()
        for recipient in recipients:
            db.add(Completion(task_id=task.id, assignee_id=recipient, at=completed_at))


def new_task(db, user, values):
    ids = normalize_assignees(db, user, values)
    # Serialize number allocation and board writes per workspace; avoids duplicate numbers.
    db.scalar(
        select(Workspace).where(Workspace.id == user.workspace_id).with_for_update()
    )
    check_references(
        db,
        user,
        values.get("project_id"),
        values.get("assignee_id"),
        values.get("private", False),
    )
    if values.get("private"):
        values["assignee_id"] = user.id
    source_id = values.get("source_note_id")
    if source_id:
        source = accessible(db, Note, source_id, user)
        if source.private != values.get("private", False):
            raise HTTPException(400, "Tasks must keep the source note visibility.")
    number = (
        db.scalar(
            select(func.max(Task.number)).where(Task.workspace_id == user.workspace_id)
        )
        or 0
    ) + 1
    position = (
        db.scalar(
            select(func.max(Task.position)).where(
                Task.workspace_id == user.workspace_id
            )
        )
        or 0
    ) + 1024
    task = Task(
        **values,
        owner_id=user.id,
        workspace_id=user.workspace_id,
        number=number,
        position=position,
    )
    set_assignees(task, ids)
    db.add(task)
    db.flush()
    log_activity(db, task, user, "Created this item.")
    mark_completion(db, task, None)
    notify_changes(db, task, user, task.description)
    return task


def log_activity(db, task, user, body):
    db.add(TaskActivity(task_id=task.id, author_id=user.id, kind="event", body=body))


def validate_document(doc):
    if len(json.dumps(doc)) > 100000:
        raise HTTPException(400, "Keep a note under 100 KB.")
    allowed = {
        "doc",
        "paragraph",
        "text",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "codeBlock",
        "hardBreak",
        "horizontalRule",
    }
    marks = {"bold", "italic", "strike", "code", "underline"}
    lines = []

    def visit(node, depth=0):
        if depth > 20 or not isinstance(node, dict) or node.get("type") not in allowed:
            raise HTTPException(400, "Unsupported note content.")
        if not isinstance(node.get("marks", []), list) or any(
            not isinstance(m, dict) or m.get("type") not in marks
            for m in node.get("marks", [])
        ):
            raise HTTPException(400, "Unsupported note formatting.")
        if not isinstance(node.get("content", []), list):
            raise HTTPException(400, "Invalid note children.")
        if "attrs" in node and not isinstance(node["attrs"], dict):
            raise HTTPException(400, "Invalid note attributes.")
        if node.get("type") == "text":
            if not isinstance(node.get("text"), str):
                raise HTTPException(400, "Invalid note text.")
            lines.append(node["text"])
        for child in node.get("content", []):
            visit(child, depth + 1)
        if node["type"] in {"paragraph", "heading", "listItem", "hardBreak"}:
            lines.append("\n")

    if doc.get("type") != "doc":
        raise HTTPException(400, "Invalid note document.")
    visit(doc)
    return "".join(lines).strip()
