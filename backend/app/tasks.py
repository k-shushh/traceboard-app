from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import Task, User, Workspace, now
from .schemas import TaskInput, TaskEdit, Move
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
    for key, value in values.items():
        setattr(task, key, value)
    if task.private:
        task.assignee_id = user.id
    set_assignees(task, ids)
    task.updated_at = now()
    task.version += 1
    mark_completion(db, task, old_status)
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
    db.commit()
    return serialize(task)
