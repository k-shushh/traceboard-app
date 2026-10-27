from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from .database import get_db
from .models import Task, TaskActivity, Notification, User, Workspace, now
from .schemas import TaskInput, TaskEdit, Move, TaskDelete, CommentInput, CommentConvert
from .security import current_user
from .services import (
    visible,
    assignee_ids,
    normalize_assignees,
    set_assignees,
    accessible,
    check_references,
    check_version,
    new_task,
    serialize,
    notify_changes,
    mark_completion,
    log_activity,
)

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


@router.get("")
def tasks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        serialize(t)
        for t in db.scalars(
            select(Task)
            .where(*visible(Task, user))
            .order_by(Task.position, Task.number)
        )
    ]


@router.post("", status_code=201)
def create(
    data: TaskInput, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task = new_task(db, user, data.model_dump())
    db.commit()
    return serialize(task)


@router.put("/{item_id}")
def update(
    item_id: str,
    data: TaskEdit,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    db.scalar(
        select(Workspace).where(Workspace.id == user.workspace_id).with_for_update()
    )
    task = accessible(db, Task, item_id, user, lock=True)
    check_version(task, data.version)
    if data.private != task.private or data.source_note_id != task.source_note_id:
        raise HTTPException(400, "Visibility and source note cannot be changed.")
    values = data.model_dump(exclude={"version"})
    ids = normalize_assignees(db, user, values)
    check_references(db, user, data.project_id, values["assignee_id"], task.private)
    old_ids = assignee_ids(task)
    old_status, old_text, old_assignee = task.status, task.description, task.assignee_id
    old_assign_all = task.assign_all
    changed = [key.replace('_', ' ') for key, value in values.items() if getattr(task, key) != value]
    if set(ids) != set(old_ids):
        changed.append("assignees")
    for key, value in values.items():
        setattr(task, key, value)
    if task.private:
        task.assignee_id = user.id
    set_assignees(task, ids)
    task.updated_at = now()
    task.version += 1
    mark_completion(db, task, old_status)
    if changed:
        detail = f" Status: {old_status} → {task.status}." if old_status != task.status else ""
        log_activity(db, task, user, "Updated " + ", ".join(changed) + "." + detail)
    notify_changes(
        db,
        task,
        user,
        task.description,
        old_text,
        old_assignee,
        old_assign_all,
        old_ids,
    )
    db.commit()
    return serialize(task)


@router.post("/{item_id}/move")
def move(
    item_id: str,
    data: Move,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    db.scalar(
        select(Workspace).where(Workspace.id == user.workspace_id).with_for_update()
    )
    task = accessible(db, Task, item_id, user, lock=True)
    check_version(task, data.version)
    before = accessible(db, Task, data.before_id, user) if data.before_id else None
    if before and (before.status != data.status or before.id == task.id):
        raise HTTPException(400, "Invalid drop position.")
    others = list(
        db.scalars(
            select(Task)
            .where(
                Task.workspace_id == user.workspace_id,
                Task.status == data.status,
                Task.id != task.id,
                Task.deleted_at.is_(None),
            )
            .order_by(Task.position, Task.number)
        )
    )
    index = next(
        (i for i, t in enumerate(others) if before and t.id == before.id), len(others)
    )
    others.insert(index, task)
    for i, other in enumerate(others):
        other.position = (i + 1) * 1024
    old_status = task.status
    task.status = data.status
    task.version += 1
    task.updated_at = now()
    mark_completion(db, task, old_status)
    if old_status != task.status:
        log_activity(db, task, user, f"Changed status: {old_status} → {task.status}.")
    db.commit()
    return serialize(task)


@router.get("/{item_id}/activity")
def activity(item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task = accessible(db, Task, item_id, user)
    entries = []
    for entry, author in db.execute(
        select(TaskActivity, User.name).join(User, TaskActivity.author_id == User.id)
        .where(TaskActivity.task_id == task.id)
        .order_by(TaskActivity.created_at, TaskActivity.id)
    ):
        item = serialize(entry)
        item["author_name"] = author
        child = db.get(Task, entry.converted_task_id) if entry.converted_task_id else None
        item["converted_task"] = serialize(child) if child and not child.deleted_at else None
        entries.append(item)
    parent = db.get(Task, task.parent_task_id) if task.parent_task_id else None
    return {
        "entries": entries,
        "parent": serialize(parent) if parent and not parent.deleted_at else None,
        "subtasks": [serialize(child) for child in db.scalars(select(Task).where(
            Task.parent_task_id == task.id, *visible(Task, user)).order_by(Task.number))],
    }


@router.post("/{item_id}/comments", status_code=201)
def comment(item_id: str, data: CommentInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task = accessible(db, Task, item_id, user, lock=True)
    entry = TaskActivity(task_id=task.id, author_id=user.id, body=data.body)
    db.add(entry)
    # Comments are independent of task edits and do not invalidate an open editor.
    notify_changes(db, task, user, data.body, old_assign_all=task.assign_all,
                   old_assignee_ids=assignee_ids(task))
    db.commit()
    return serialize(entry)


@router.post("/{item_id}/comments/{comment_id}/subtask")
def convert_comment(item_id: str, comment_id: str, data: CommentConvert,
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.scalar(select(Workspace).where(Workspace.id == user.workspace_id).with_for_update())
    parent = accessible(db, Task, item_id, user, lock=True)
    entry = db.scalar(select(TaskActivity).where(TaskActivity.id == comment_id,
        TaskActivity.task_id == parent.id, TaskActivity.kind == "comment").with_for_update())
    if not entry:
        raise HTTPException(404, "Comment not found.")
    if entry.converted_task_id:
        existing = db.get(Task, entry.converted_task_id)
        if existing.deleted_at:
            raise HTTPException(409, "The subtask created from this comment was deleted. Add a new comment to create another.")
        return serialize(existing)
    child = new_task(db, user, dict(title=data.title, description=entry.body,
        parent_task_id=parent.id, project_id=parent.project_id, private=parent.private,
        priority=parent.priority, kind="task", status="todo", assign_all=parent.assign_all,
        assignee_ids=[] if parent.assign_all else assignee_ids(parent)))
    entry.converted_task_id = child.id
    log_activity(db, parent, user, f"Created subtask TB-{child.number:03d} from a comment.")
    db.commit()
    return serialize(child)


@router.delete("/{item_id}")
def remove(item_id: str, data: TaskDelete, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.scalar(select(Workspace).where(Workspace.id == user.workspace_id).with_for_update())
    task = accessible(db, Task, item_id, user, lock=True)
    check_version(task, data.version)
    for child in db.scalars(select(Task).where(Task.parent_task_id == task.id, Task.deleted_at.is_(None))):
        child.parent_task_id = None
        child.version += 1
        child.updated_at = now()
        log_activity(db, child, user, f"Parent TB-{task.number:03d} was deleted; this is now a standalone task.")
    task.deleted_at = now()
    task.version += 1
    log_activity(db, task, user, "Deleted this item.")
    db.execute(delete(Notification).where(Notification.task_id == task.id))
    db.commit()
    return {"ok": True}
