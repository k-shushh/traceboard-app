from test_workflows import register, pair, create


def test_rename_preserves_project_task_and_note_links(clients):
    owner, _, member, _ = pair(clients)
    project = owner.post("/api/projects", json={"name": "Original project"}).json()
    task = create(owner, project_id=project["id"])
    note = owner.post("/api/notes", json={"title": "Linked note", "project_id": project["id"]}).json()
    result = member.put(f"/api/projects/{project['id']}", json={"name": "  Renamed project  ", "expected_name": project["name"]})
    assert result.status_code == 200, result.text
    assert result.json()["id"] == project["id"]
    assert result.json()["name"] == "Renamed project"
    assert owner.get("/api/workspace").json()["projects"][0]["name"] == "Renamed project"
    assert next(item for item in owner.get("/api/tasks").json() if item["id"] == task["id"])["project_id"] == project["id"]
    assert next(item for item in owner.get("/api/notes").json() if item["id"] == note["id"])["project_id"] == project["id"]


def test_rename_rejects_outsiders_missing_projects_and_anonymous(clients):
    owner = clients()
    register(owner)
    project = owner.post("/api/projects", json={"name": "Private workspace"}).json()
    outsider = clients()
    register(outsider, "outsider")
    payload = {"name": "Changed", "expected_name": project["name"]}
    route = f"/api/projects/{project['id']}"
    assert clients().put(route, json=payload).status_code == 401
    assert outsider.put(route, json=payload).status_code == 404
    assert owner.put("/api/projects/missing", json=payload).status_code == 404
    assert owner.get("/api/workspace").json()["projects"][0]["name"] == project["name"]


def test_rename_validates_names_and_prevents_stale_overwrite(clients):
    owner = clients()
    register(owner)
    project = owner.post("/api/projects", json={"name": "Original"}).json()
    route = f"/api/projects/{project['id']}"
    for name in ["", "   ", "x", "x" * 101]:
        assert owner.put(route, json={"name": name, "expected_name": "Original"}).status_code == 422
    assert owner.put(route, json={"name": "New name"}).status_code == 422
    assert owner.put(route, json={"name": "First rename", "expected_name": "Original"}).status_code == 200
    assert owner.put(route, json={"name": "Stale rename", "expected_name": "Original"}).status_code == 409
    assert owner.get("/api/workspace").json()["projects"][0]["name"] == "First rename"
