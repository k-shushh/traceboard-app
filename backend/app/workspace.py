from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import Workspace, User, Project, Notification
from .security import current_user
from .schemas import ProjectInput, ProjectEdit
from .services import serialize

router = APIRouter(prefix="/api", tags=["Workspace"])


@router.get("/workspace")
def workspace(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {
        "workspace": serialize(db.get(Workspace, user.workspace_id)),
        "members": [
            {"id": u.id, "name": u.name, "handle": u.handle, "role": u.role}
            for u in db.scalars(
                select(User)
                .where(
                    User.workspace_id == user.workspace_id,
                    User.is_admin_account.is_(False),
                )
                .order_by(User.name)
            )
        ],
        "projects": [
            serialize(p)
            for p in db.scalars(
                select(Project)
                .where(Project.workspace_id == user.workspace_id)
                .order_by(Project.name)
            )
        ],
    }


@router.post("/projects", status_code=201)
def project(
    data: ProjectInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    item = Project(name=data.name, workspace_id=user.workspace_id)
    db.add(item)
    db.commit()
    return serialize(item)


@router.put("/projects/{project_id}")
def rename_project(
    project_id: str,
    data: ProjectEdit,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    item = db.scalar(
        select(Project)
        .where(Project.id == project_id, Project.workspace_id == user.workspace_id)
        .with_for_update()
    )
    if not item:
        raise HTTPException(404, "Project not found.")
    if item.name != data.expected_name:
        raise HTTPException(409, "This project was renamed. Close and reopen the dialog to load its current name.")
    item.name = data.name
    db.commit()
    return serialize(item)


@router.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        serialize(n)
        for n in db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(100)
        )
    ]


@router.post("/notifications/read")
def read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import update

    db.execute(
        update(Notification).where(Notification.user_id == user.id).values(read=True)
    )
    db.commit()
    return {"ok": True}
