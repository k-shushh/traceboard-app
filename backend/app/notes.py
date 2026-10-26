from .note_extraction import local_titles
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import Note, Task, User, Workspace, now
from .schemas import NoteInput, NoteEdit, Convert
from .security import current_user
from .services import (
    visible,
    accessible,
    check_version,
    check_references,
    serialize,
    notify_changes,
    validate_document,
    new_task,
)

router = APIRouter(prefix="/api/notes", tags=["Notes"])


@router.get("")
def notes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        serialize(n)
        for n in db.scalars(
            select(Note).where(*visible(Note, user)).order_by(Note.updated_at.desc())
        )
    ]


@router.post("", status_code=201)
def create(
    data: NoteInput, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    check_references(db, user, data.project_id)
    note = Note(
        **data.model_dump(),
        owner_id=user.id,
        workspace_id=user.workspace_id,
        plain_text=validate_document(data.content),
    )
    db.add(note)
    db.flush()
    notify_changes(db, note, user, note.plain_text)
    db.commit()
    return serialize(note)


@router.put("/{item_id}")
def update(
    item_id: str,
    data: NoteEdit,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    from fastapi import HTTPException

    note = accessible(db, Note, item_id, user, lock=True)
    check_version(note, data.version)
    if note.private != data.private:
        raise HTTPException(400, "Note visibility cannot be changed.")
    check_references(db, user, data.project_id)
    old_text = note.plain_text
    note.plain_text = validate_document(data.content)
    for key, value in data.model_dump(exclude={"version"}).items():
        setattr(note, key, value)
    note.version += 1
    note.updated_at = now()
    notify_changes(db, note, user, note.plain_text, old_text)
    db.commit()
    return serialize(note)


@router.get("/{item_id}/drafts")
def drafts(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    note = accessible(db, Note, item_id, user)
    candidates = [
        {"title": title, "priority": "normal", "assignee_id": user.id if note.private else None}
        for title in local_titles(note.content, note.plain_text)
    ]
    return {
        "drafts": candidates[:10],
        "version": note.version,
        "method": "Local action-line extraction; no external AI service.",
    }


@router.post("/{item_id}/tasks")
def convert(
    item_id: str,
    data: Convert,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    db.scalar(
        select(Workspace).where(Workspace.id == user.workspace_id).with_for_update()
    )
    note = accessible(db, Note, item_id, user, lock=True)
    check_version(note, data.version)
    titles = set(db.scalars(select(Task.title).where(Task.source_note_id == note.id)))
    created = []
    for draft in data.drafts:
        if draft.title in titles:
            continue
        task = new_task(
            db,
            user,
            dict(
                title=draft.title,
                priority=draft.priority,
                assignee_id=user.id if note.private else draft.assignee_id,
                assign_all=draft.assign_all,
                assignee_ids=(
                    [user.id]
                    if note.private and not draft.assignee_ids
                    else draft.assignee_ids
                ),
                description=f"From project note: {note.title}",
                project_id=note.project_id,
                private=note.private,
                source_note_id=note.id,
            ),
        )
        created.append(serialize(task))
        titles.add(draft.title)
    db.commit()
    return {"created": created, "skipped": len(data.drafts) - len(created)}
