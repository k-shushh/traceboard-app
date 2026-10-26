import json
import httpx
import pytest
from app.note_extraction import local_titles
from test_ai import mock_provider
from test_workflows import register


ITEMS = [
    "Remove Catalogue Style Header",
    "Remove images from unnecessary headers (keep only for surfaces and finishes and detailings).",
    "Remove Quantity/Extent Header",
    "Put prices for spec options",
    "Reduce the size of icons",
    "In storage arrangement, check right pedestal, left pedestal",
    "In storage, make it a checkbox",
    "Construction options are optional.",
    "Remove construction inputs.",
]


def paragraph(value):
    return {"type": "paragraph", "content": [{"type": "text", "text": value}]}


def document(rich_list):
    content = ([{"type": "orderedList", "content": [{"type": "listItem", "content": [paragraph(value)]} for value in ITEMS]}]
               if rich_list else [paragraph(f"{i}. {value}") for i, value in enumerate(ITEMS, 1)])
    return {"type": "doc", "content": content + [paragraph("@rajdeep&#x20;")]}


@pytest.mark.parametrize("rich_list", [True, False])
def test_all_nine_requirements_are_local_suggestions(rich_list):
    assert local_titles(document(rich_list), "") == ITEMS


def test_local_ignores_completed_and_context_and_deduplicates():
    doc = {"type": "doc", "content": [paragraph(v) for v in [
        "Some meeting context", "1. [x] Remove old header", "- [X] Fix old issue",
        "- Done: Reduce icons", "- @rajdeep", "Remove header", "remove header",
        "In storage, make it a checkbox",
    ]]}
    assert local_titles(doc, "") == ["Remove header", "In storage, make it a checkbox"]


@pytest.mark.parametrize("use_groq", [True, False])
def test_nine_item_note_review_create_and_duplicate_prevention(clients, monkeypatch, use_groq):
    client = clients()
    user = register(client)
    note = client.post("/api/notes", json={"title": "Design changes", "content": document(True), "private": True}).json()
    requests = []
    def response(request):
        body = json.loads(request.content)
        payload = json.loads(body["messages"][1]["content"])
        assert all(item in payload["note"] for item in ITEMS)
        assert payload["title"] == "Design changes"
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"drafts": [{"title": title, "priority": "normal"} for title in ITEMS]})}}]})
    mock_provider(monkeypatch, response)
    result = (client.post(f"/api/ai/notes/{note['id']}/drafts", json={}) if use_groq
              else client.get(f"/api/notes/{note['id']}/drafts"))
    assert result.status_code == 200, result.text
    drafts = result.json()["drafts"]
    assert len(requests) == int(use_groq)
    assert len(drafts) == 9
    assert client.get("/api/tasks").json() == []
    payload = {"version": result.json()["version"], "drafts": drafts}
    result = client.post(f"/api/notes/{note['id']}/tasks", json=payload)
    assert result.status_code == 200, result.text
    created = result.json()["created"]
    assert len(created) == 9
    assert all(task["source_note_id"] == note["id"] and task["private"] and task["assignee_id"] == user["id"] for task in created)
    assert len(client.get("/api/tasks").json()) == 9
    assert client.post(f"/api/notes/{note['id']}/tasks", json=payload).json() == {"created": [], "skipped": 9}
