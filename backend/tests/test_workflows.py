from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from app.database import get_db
from app.main import app
from app.models import User, LoginSession, Completion, now
from app.security import digest

PASSWORD = "A-local-test-password-42!"


def test_phone_login_separate_admin_and_verified_reset_flow(clients):
    admin, owner, member, teammate = pair(clients)
    with next(app.dependency_overrides[get_db]()) as db:
        person = db.get(User, teammate["id"])
        person.phone = "+919999999991"
        operator = db.get(User, owner["id"])
        operator.is_admin_account = True
        operator.handle = "traceboard_admin"
        db.commit()
    public = clients()
    assert (
        public.post(
            "/api/auth/login", json={"identifier": "admin", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        public.post(
            "/api/auth/login",
            json={"identifier": "admin", "mode": "admin", "password": PASSWORD},
        ).status_code
        == 200
    )
    login = clients()
    assert (
        login.post(
            "/api/auth/login",
            json={"identifier": "+91 9999999991", "password": PASSWORD},
        ).status_code
        == 200
    )
    assert (
        login.post(
            "/api/auth/login", json={"email": "sam@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    anonymous = clients()
    request = anonymous.post(
        "/api/auth/password-reset-request", json={"phone": "9999999991"}
    )
    unknown = anonymous.post(
        "/api/auth/password-reset-request", json={"phone": "8888888888"}
    )
    assert request.status_code == 200 and request.json() == unknown.json()
    anonymous.post("/api/auth/password-reset-request", json={"phone": "9999999991"})
    assert len(admin.get("/api/auth/password-resets").json()) == 1
    assert member.get("/api/auth/password-resets").status_code == 403
    assert (
        member.post(f"/api/auth/password-resets/{teammate['id']}/approve").status_code
        == 403
    )
    outsider = clients()
    register(outsider, "outsider")
    assert (
        outsider.post(f"/api/auth/password-resets/{teammate['id']}/approve").status_code
        == 404
    )
    approval = admin.post(f"/api/auth/password-resets/{teammate['id']}/approve")
    assert (
        approval.status_code == 200 and len(approval.json()["temporary_password"]) >= 24
    )
    assert login.get("/api/auth/me").status_code == 401
    assert member.get("/api/auth/me").status_code == 401
    temporary = clients()
    response = temporary.post(
        "/api/auth/login",
        json={
            "identifier": "9999999991",
            "password": approval.json()["temporary_password"],
        },
    )
    assert response.status_code == 200 and response.json()["must_change_password"]
    assert temporary.get("/api/tasks").status_code == 403
    assert temporary.post("/api/tasks", json={"title": "Blocked"}).status_code == 403
    assert (
        temporary.post(
            "/api/auth/password",
            json={
                "current_password": approval.json()["temporary_password"],
                "new_password": "A-new-recovered-password!",
            },
        ).status_code
        == 200
    )
    assert not temporary.get("/api/auth/me").json()["must_change_password"]
    assert temporary.get("/api/tasks").status_code == 200
    assert admin.get("/api/auth/password-resets").json() == []
    assert (
        anonymous.post(
            "/api/auth/login",
            json={
                "identifier": "9999999991",
                "password": approval.json()["temporary_password"],
            },
        ).status_code
        == 401
    )


def test_temporary_password_expiry_requires_another_admin_reset(clients):
    admin, _, member, teammate = pair(clients)
    with next(app.dependency_overrides[get_db]()) as db:
        person = db.get(User, teammate["id"])
        person.phone = "+919999999992"
        person.must_change_password = True
        person.temporary_password_expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert member.get("/api/auth/me").status_code == 401
    client = clients()
    assert (
        client.post(
            "/api/auth/login", json={"identifier": "9999999992", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/password-reset-request", json={"phone": "9999999992"}
        ).status_code
        == 200
    )
    assert len(admin.get("/api/auth/password-resets").json()) == 1


def test_password_change_requires_current_password_and_rotates_sessions(clients):
    client = clients()
    register(client)
    second = clients()
    assert (
        second.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
        ).status_code
        == 200
    )
    old_cookie = client.cookies.get("traceboard_session")
    payload = {"current_password": PASSWORD, "new_password": "A-new-local-password-42!"}
    assert (
        client.post(
            "/api/auth/password", json={**payload, "current_password": "wrong"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/password", json={**payload, "new_password": "short"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/password", json={**payload, "new_password": PASSWORD}
        ).status_code
        == 400
    )
    assert client.post("/api/auth/password", json=payload).status_code == 200
    assert client.cookies.get("traceboard_session") != old_cookie
    assert client.get("/api/auth/me").status_code == 200
    assert second.get("/api/auth/me").status_code == 401
    signed_out = clients()
    assert signed_out.post("/api/auth/password", json=payload).status_code == 401
    assert (
        signed_out.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        signed_out.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": payload["new_password"]},
        ).status_code
        == 200
    )


def test_multiple_assignees_roundtrip_notifications_completion_and_reassignment(
    clients,
):
    admin, user, member, teammate = pair(clients)
    task = create(admin, assignee_ids=[user["id"], teammate["id"], teammate["id"]])
    assert set(task["assignee_ids"]) == {user["id"], teammate["id"]}
    assert len(task["assignee_ids"]) == 2
    for client in (admin, member):
        assert client.get("/api/insights?scope=personal").json()["todo"] == 1
    assert len(member.get("/api/notifications").json()) == 1
    fields = {
        "title": task["title"],
        "assignee_ids": [user["id"], teammate["id"]],
        "version": 1,
    }
    edited = admin.put(f"/api/tasks/{task['id']}", json=fields)
    assert edited.status_code == 200
    assert len(member.get("/api/notifications").json()) == 1
    moved = member.post(
        f"/api/tasks/{task['id']}/move", json={"status": "done", "version": 2}
    )
    assert moved.status_code == 200 and len(moved.json()["assignee_ids"]) == 2
    for client in (admin, member):
        assert client.get("/api/insights?scope=personal").json()["completed"] == 1
    assert admin.get("/api/insights?scope=team").json()["completed"] == 1
    fields.update(assignee_ids=[user["id"]], version=3, status="progress")
    assert admin.put(f"/api/tasks/{task['id']}", json=fields).status_code == 200
    assert member.get("/api/insights?scope=personal").json()["in_progress"] == 0
    assert member.get("/api/insights?scope=personal").json()["completed"] == 1
    fields.update(assignee_ids=[], version=4, assign_all=True)
    assert admin.put(f"/api/tasks/{task['id']}", json=fields).json()["assign_all"]
    assert member.get("/api/insights?scope=personal").json()["in_progress"] == 1
    assert len(member.get("/api/notifications").json()) == 2


def test_multiple_assignment_security_and_private_task_rules(clients):
    admin, user, member, teammate = pair(clients)
    outside = clients()
    outsider = register(outside, "outsider")
    for data in (
        {"assignee_ids": [user["id"], outsider["id"]]},
        {"assignee_ids": ["missing-user"]},
        {"assignee_ids": [user["id"], teammate["id"]], "private": True},
        {"assignee_ids": [user["id"]], "assign_all": True},
        {"assignee_ids": [user["id"]], "assignee_id": teammate["id"]},
    ):
        response = admin.post(
            "/api/tasks", json={"title": "Invalid assignment", **data}
        )
        assert response.status_code in (400, 422)
    private = create(admin, private=True, assignee_ids=[])
    assert private["assignee_ids"] == [user["id"]]
    assert member.get("/api/tasks").json() == []


def register(client, name="alex", invite=None):
    response = client.post(
        "/api/auth/register",
        json={
            "name": name.title(),
            "handle": name,
            "email": f"{name}@example.com",
            "password": PASSWORD,
            "workspace": "Test workspace",
            "invite": invite,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def create(client, **kwargs):
    response = client.post(
        "/api/tasks", json={"title": "Evaluate retrieval quality", **kwargs}
    )
    assert response.status_code == 201, response.text
    return response.json()


def pair(clients):
    admin = clients()
    user = register(admin)
    invite = admin.post("/api/auth/invites", json={"email": "sam@example.com"}).json()[
        "token"
    ]
    member = clients()
    teammate = register(member, "sam", invite)
    return admin, user, member, teammate


def test_assign_all_notifications_personal_insights_and_shared_completion(clients):
    admin, user, member, teammate = pair(clients)
    outsider = clients()
    register(outsider, "outsider")
    task = create(admin, assign_all=True, deliverable_date="2026-11-11")
    assert task["assign_all"] and task["assignee_id"] is None
    assert any(
        t["id"] == task["id"] and t["assign_all"]
        for t in member.get("/api/tasks").json()
    )
    assert outsider.get("/api/tasks").json() == []
    assert len(member.get("/api/workspace").json()["members"]) == 2
    for client in (admin, member):
        assert client.get("/api/insights?scope=personal").json()["todo"] == 1
    notifications = member.get("/api/notifications").json()
    assert len([n for n in notifications if n["task_id"] == task["id"]]) == 1
    # Ordinary edits do not spam everyone with the same assignment notification.
    fields = {
        k: task[k]
        for k in (
            "title",
            "status",
            "priority",
            "kind",
            "description",
            "assignee_id",
            "assign_all",
            "private",
            "project_id",
            "source_note_id",
            "deliverable_date",
            "version",
        )
    }
    fields["title"] = "Shared evaluation"
    edited = admin.put(f"/api/tasks/{task['id']}", json=fields)
    assert edited.status_code == 200
    assert len(member.get("/api/notifications").json()) == len(notifications)
    moved = member.post(
        f"/api/tasks/{task['id']}/move",
        json={"status": "done", "version": edited.json()["version"]},
    )
    assert moved.status_code == 200
    assert (
        moved.json()["assign_all"] and moved.json()["deliverable_date"] == "2026-11-11"
    )
    for client in (admin, member):
        assert client.get("/api/insights?scope=personal").json()["completed"] == 1
    assert admin.get("/api/insights?scope=team").json()["completed"] == 1
    # A later teammate sees the shared task, but receives no retroactive completion credit.
    token = admin.post("/api/auth/invites", json={"email": "later@example.com"}).json()[
        "token"
    ]
    later = clients()
    register(later, "later", token)
    assert later.get("/api/insights?scope=personal").json()["completed"] == 0


def test_assign_all_rejects_private_or_conflicting_assignments(clients):
    client = clients()
    user = register(client)
    for extra in ({"private": True}, {"assignee_id": user["id"]}):
        response = client.post(
            "/api/tasks",
            json={"title": "Invalid shared task", "assign_all": True, **extra},
        )
        assert response.status_code == 422
    task = create(client, assign_all=True)
    response = client.put(
        f"/api/tasks/{task['id']}",
        json={
            "title": task["title"],
            "assignee_id": user["id"],
            "assign_all": False,
            "version": 1,
        },
    )
    assert response.status_code == 200
    assert (
        response.json()["assignee_id"] == user["id"]
        and not response.json()["assign_all"]
    )


def test_login_hashed_password_opaque_cookie_and_logout(clients):
    client = clients()
    user = register(client)
    cookie = client.cookies.get("traceboard_session")
    assert cookie and len(cookie) > 30
    db = next(app.dependency_overrides[get_db]())
    with db:
        stored = db.get(User, user["id"])
        assert (
            stored.password_hash.startswith("$argon2id$")
            and PASSWORD not in stored.password_hash
        )
        assert db.get(LoginSession, digest(cookie))
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/tasks").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": "incorrect"},
        ).status_code
        == 401
    )
    response = client.post(
        "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
    )
    assert response.status_code == 200
    assert (
        "HttpOnly" in response.headers["set-cookie"]
        and "SameSite=strict" in response.headers["set-cookie"]
    )


def test_invitation_is_email_bound_single_use_and_member_not_admin(clients):
    admin = clients()
    register(admin)
    token = admin.post("/api/auth/invites", json={"email": "sam@example.com"}).json()[
        "token"
    ]
    outsider = clients()
    bad = outsider.post(
        "/api/auth/register",
        json={
            "name": "Wrong person",
            "handle": "wrong",
            "email": "wrong@example.com",
            "password": PASSWORD,
            "invite": token,
        },
    )
    assert bad.status_code == 400
    member = clients()
    register(member, "sam", token)
    assert (
        member.post(
            "/api/auth/invites", json={"email": "third@example.com"}
        ).status_code
        == 403
    )
    assert (
        outsider.post(
            "/api/auth/register",
            json={
                "name": "Sam again",
                "handle": "sama",
                "email": "sam@example.com",
                "password": PASSWORD,
                "invite": token,
            },
        ).status_code
        == 400
    )


def test_private_items_and_other_workspaces_cannot_be_read_or_modified(clients):
    admin, user, member, teammate = pair(clients)
    private = create(admin, private=True, assignee_id=user["id"])
    shared = create(admin, assignee_id=teammate["id"])
    assert [t["id"] for t in member.get("/api/tasks").json()] == [shared["id"]]
    assert (
        member.post(
            f"/api/tasks/{private['id']}/move", json={"status": "done", "version": 1}
        ).status_code
        == 404
    )
    other = clients()
    outsider = register(other, "outsider")
    assert other.get("/api/tasks").json() == []
    assert (
        other.post(
            f"/api/tasks/{shared['id']}/move", json={"status": "done", "version": 1}
        ).status_code
        == 404
    )
    assert (
        admin.post(
            "/api/tasks",
            json={"title": "Invalid assignment", "assignee_id": outsider["id"]},
        ).status_code
        == 400
    )
    note = admin.post(
        "/api/notes", json={"title": "Private research", "private": True}
    ).json()
    assert member.get(f"/api/notes/{note['id']}/drafts").status_code == 404
    assert member.get("/api/notes").json() == []


def test_move_keeps_priority_detects_conflict_and_persists(clients):
    client = clients()
    register(client)
    task = create(client, priority="urgent")
    response = client.post(
        f"/api/tasks/{task['id']}/move", json={"status": "progress", "version": 1}
    )
    assert response.status_code == 200 and response.json()["priority"] == "urgent"
    assert response.json()["status"] == "progress"
    assert (
        client.post(
            f"/api/tasks/{task['id']}/move", json={"status": "done", "version": 1}
        ).status_code
        == 409
    )
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
    )
    assert client.get("/api/tasks").json()[0]["status"] == "progress"


def test_mentions_notify_once_and_private_text_does_not_notify(clients):
    admin, user, member, teammate = pair(clients)
    task = create(admin, description="Review this @sam", assignee_id=teammate["id"])
    assert len(member.get("/api/notifications").json()) == 1
    fields = {
        k: task[k]
        for k in (
            "title",
            "description",
            "status",
            "priority",
            "kind",
            "private",
            "project_id",
            "assignee_id",
            "source_note_id",
            "version",
        )
    }
    assert admin.put(f"/api/tasks/{task['id']}", json=fields).status_code == 200
    assert len(member.get("/api/notifications").json()) == 1
    create(
        admin, description="Private mention @sam", private=True, assignee_id=user["id"]
    )
    assert len(member.get("/api/notifications").json()) == 1
    member.post("/api/notifications/read")
    assert member.get("/api/notifications").json()[0]["read"] is True


def test_notes_to_tasks_require_review_deduplicate_and_preserve_privacy(clients):
    client = clients()
    user = register(client)
    doc = {
        "type": "doc",
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}
            for text in [
                "Fix the embedding timeout",
                "Some meeting context",
                "Review the retrieval benchmark",
            ]
        ],
    }
    note = client.post(
        "/api/notes", json={"title": "Research notes", "content": doc, "private": True}
    ).json()
    drafts = client.get(f"/api/notes/{note['id']}/drafts").json()["drafts"]
    assert len(drafts) == 2 and client.get("/api/tasks").json() == []
    result = client.post(
        f"/api/notes/{note['id']}/tasks", json={"version": 1, "drafts": drafts}
    )
    assert result.status_code == 200, result.text
    assert len(result.json()["created"]) == 2
    assert all(
        t["private"]
        and t["assignee_id"] == user["id"]
        and t["source_note_id"] == note["id"]
        for t in result.json()["created"]
    )
    second = client.post(
        f"/api/notes/{note['id']}/tasks", json={"version": 1, "drafts": drafts}
    ).json()
    assert second["created"] == [] and second["skipped"] == 2


def test_insights_count_unique_tasks_and_keep_reopen_history(clients):
    client = clients()
    user = register(client)
    task = create(client, assignee_id=user["id"])
    for version, status in enumerate(["done", "progress", "done"], start=1):
        assert (
            client.post(
                f"/api/tasks/{task['id']}/move",
                json={"version": version, "status": status},
            ).status_code
            == 200
        )
    create(
        client,
        title="Private done",
        status="done",
        private=True,
        assignee_id=user["id"],
    )
    team = client.get("/api/insights?period=daily&tz=Asia/Kolkata").json()
    personal = client.get(
        "/api/insights?period=daily&scope=personal&tz=Asia/Kolkata"
    ).json()
    assert team["completed"] == 1 and personal["completed"] == 2
    for period in ["weekly", "monthly"]:
        assert (
            client.get(f"/api/insights?period={period}&tz=UTC").json()["completed"] == 1
        )
    assert client.get("/api/insights?tz=Invalid/Zone").status_code == 400


def test_csrf_unauthenticated_requests_and_input_validation(clients):
    client = clients()
    assert client.get("/api/tasks").status_code == 401
    register(client)
    assert (
        client.post(
            "/api/tasks",
            json={"title": "No origin"},
            headers={"origin": "https://untrusted.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/tasks", json={"title": "Bad status", "status": "arbitrary"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/tasks", json={"title": "Bad priority", "priority": "critical"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/notes",
            json={
                "title": "Unsafe",
                "content": {"type": "doc", "content": [{"type": "script"}]},
            },
        ).status_code
        == 400
    )


def test_password_whitespace_is_not_silently_changed(clients):
    client = clients()
    password = "  Exact-password-with-spaces!  "
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Space User",
            "handle": "spaces",
            "email": "spaces@example.com",
            "password": password,
        },
    )
    assert response.status_code == 200
    client.post("/api/auth/logout")
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "spaces@example.com", "password": password.strip()},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "spaces@example.com", "password": password},
        ).status_code
        == 200
    )


def test_deliverable_date_is_optional_editable_and_preserved_by_moves(clients):
    client = clients()
    register(client)
    undated = create(client)
    assert undated["deliverable_date"] is None
    task = create(client, deliverable_date="2026-11-11")
    assert task["deliverable_date"] == "2026-11-11"
    moved = client.post(
        f"/api/tasks/{task['id']}/move", json={"status": "progress", "version": 1}
    ).json()
    assert moved["deliverable_date"] == "2026-11-11"
    fields = {
        key: moved[key]
        for key in (
            "title",
            "description",
            "status",
            "priority",
            "kind",
            "private",
            "project_id",
            "assignee_id",
            "source_note_id",
            "version",
            "deliverable_date",
        )
    }
    fields["deliverable_date"] = "2026-11-09"
    response = client.put(f"/api/tasks/{task['id']}", json=fields)
    assert response.status_code == 200
    assert response.json()["deliverable_date"] == "2026-11-09"
    fields["version"] = response.json()["version"]
    fields["deliverable_date"] = None
    assert (
        client.put(f"/api/tasks/{task['id']}", json=fields).json()["deliverable_date"]
        is None
    )
    assert (
        client.post(
            "/api/tasks",
            json={"title": "Invalid date", "deliverable_date": "2026-02-30"},
        ).status_code
        == 422
    )


def test_edit_profile_only_changes_own_display_name(clients):
    admin, user, member, teammate = pair(clients)
    response = member.patch("/api/auth/me", json={"name": "Sam Updated"})
    assert response.status_code == 200
    assert response.json()["name"] == "Sam Updated"
    assert response.json()["handle"] == "sam"
    assert response.json()["email"] == "sam@example.com"
    assert admin.get("/api/auth/me").json()["name"] == user["name"]
    assert (
        member.patch("/api/auth/me", json={"name": "Sam", "role": "admin"}).status_code
        == 422
    )
    assert (
        member.patch("/api/auth/me", json={"name": "Sam", "id": user["id"]}).status_code
        == 422
    )
    assert member.patch("/api/auth/me", json={"name": " "}).status_code == 422
    member.post("/api/auth/logout")
    assert member.patch("/api/auth/me", json={"name": "Nobody"}).status_code == 401


def test_reorder_and_note_versions(clients):
    client = clients()
    register(client)
    first = create(client, title="First task")
    second = create(client, title="Second task")
    third = create(client, title="Third task")
    assert (
        client.post(
            f"/api/tasks/{third['id']}/move",
            json={"status": "todo", "before_id": first["id"], "version": 1},
        ).status_code
        == 200
    )
    assert [t["id"] for t in client.get("/api/tasks").json()] == [
        third["id"],
        first["id"],
        second["id"],
    ]
    note = client.post("/api/notes", json={"title": "A saved note"}).json()
    changes = {"title": "Updated note", "content": note["content"], "version": 1}
    assert client.put(f"/api/notes/{note['id']}", json=changes).status_code == 200
    assert client.put(f"/api/notes/{note['id']}", json=changes).status_code == 409


def test_private_tasks_default_to_owner_and_malformed_notes_are_rejected(clients):
    client = clients()
    user = register(client)
    task = create(client, private=True, status="done")
    assert task["assignee_id"] == user["id"]
    assert (
        client.get("/api/insights?scope=personal&period=daily").json()["completed"] == 1
    )
    for document in [
        {"type": "doc", "content": "not a list"},
        {
            "type": "doc",
            "content": [{"type": "text", "text": "Bad marks", "marks": ["bold"]}],
        },
    ]:
        assert (
            client.post(
                "/api/notes", json={"title": "Malformed note", "content": document}
            ).status_code
            == 400
        )


def test_insight_day_boundary_uses_viewer_timezone(clients, monkeypatch):
    from app import insights

    client = clients()
    register(client)
    task = create(client, status="done")
    provider = app.dependency_overrides[get_db]()
    db = next(provider)
    try:
        event = db.scalar(select(Completion).where(Completion.task_id == task["id"]))
        # 18:45 UTC is 00:15 the next day in India.
        event.at = datetime(2026, 10, 22, 18, 45, tzinfo=timezone.utc)
        db.commit()
    finally:
        provider.close()
    monkeypatch.setattr(
        insights, "now", lambda: datetime(2026, 10, 23, 1, 0, tzinfo=timezone.utc)
    )
    assert (
        client.get("/api/insights?period=daily&tz=Asia/Kolkata").json()["completed"]
        == 1
    )
    utc = client.get("/api/insights?period=daily&tz=UTC").json()
    assert utc["completed"] == 0 and utc["previous"] == 1
