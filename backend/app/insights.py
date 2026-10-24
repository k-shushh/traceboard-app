"""Real completion events, grouped in the viewer's timezone; no synthetic metrics."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session
from .database import get_db
from .models import Task, TaskAssignee, Completion, User, now
from .security import current_user
from .services import visible

router = APIRouter(prefix="/api/insights", tags=["Insights"])


def shift_month(value, count):
    month = value.year * 12 + value.month - 1 + count
    return value.replace(year=month // 12, month=month % 12 + 1, day=1)


@router.get("")
def insights(
    period: Literal["daily", "weekly", "monthly"] = "weekly",
    scope: Literal["team", "personal"] = "team",
    tz: str = "UTC",
    project_id: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    try:
        zone = ZoneInfo(tz)
    except ZoneInfoNotFoundError:
        raise HTTPException(400, "Unknown timezone.")
    today = now().astimezone(zone).replace(hour=0, minute=0, second=0, microsecond=0)
    start = (
        today
        if period == "daily"
        else (
            today - timedelta(days=today.weekday())
            if period == "weekly"
            else today.replace(day=1)
        )
    )
    offsets = range(-6, 1) if period == "daily" else range(-5, 1)
    starts = [
        (
            start + timedelta(days=i)
            if period == "daily"
            else (
                start + timedelta(weeks=i)
                if period == "weekly"
                else shift_month(start, i)
            )
        )
        for i in offsets
    ]
    end = (
        start + timedelta(days=1)
        if period == "daily"
        else start + timedelta(weeks=1) if period == "weekly" else shift_month(start, 1)
    )
    filters = list(visible(Task, user))
    if scope == "team":
        filters.append(Task.private.is_(False))
    if project_id:
        filters.append(Task.project_id == project_id)
    events = (
        select(Completion, Task.title, Task.number)
        .join(Task, Completion.task_id == Task.id)
        .where(*filters, Completion.at >= starts[0], Completion.at < end)
    )
    if scope == "personal":
        events = events.where(Completion.assignee_id == user.id)
    rows = db.execute(events.order_by(Completion.at.desc())).all()
    buckets = []
    for i, boundary in enumerate(starts):
        upper = starts[i + 1] if i + 1 < len(starts) else end
        ids = {e.task_id for e, _, _ in rows if boundary <= e.at < upper}
        buckets.append(
            {
                "label": (
                    boundary.strftime("%d %b")
                    if period != "monthly"
                    else boundary.strftime("%b %Y")
                ),
                "count": len(ids),
            }
        )
    recent = []
    seen = set()
    for event, title, number in rows:
        if event.at >= start and event.task_id not in seen:
            seen.add(event.task_id)
            recent.append(
                {"id": event.task_id, "number": number, "title": title, "at": event.at}
            )
    current_filters = filters + (
        [
            or_(
                Task.assignees.any(TaskAssignee.user_id == user.id),
                Task.assign_all.is_(True),
            )
        ]
        if scope == "personal"
        else []
    )
    counts = dict(
        db.execute(
            select(Task.status, func.count())
            .where(*current_filters)
            .group_by(Task.status)
        ).all()
    )
    return {
        "period": period,
        "scope": scope,
        "timezone": tz,
        "buckets": buckets,
        "completed": len(seen),
        "previous": buckets[-2]["count"],
        "in_progress": counts.get("progress", 0),
        "todo": counts.get("todo", 0),
        "recent": recent[:20],
        "start": start,
        "end": end,
        "method": "Each task counts once per time bucket. Reopened tasks keep their completion history.",
    }
