"""Provider calls are mocked: no credentials, network, or Groq charges in tests."""

import json
import httpx
import pytest
from fastapi import HTTPException
from app import ai
from test_workflows import register, pair, create


def mock_provider(monkeypatch, response):
    original = httpx.Client
    monkeypatch.setenv("GROQ_API_KEY", "unit-test-placeholder")
    monkeypatch.setattr(
        ai.httpx,
        "Client",
        lambda **kwargs: original(transport=httpx.MockTransport(response), **kwargs),
    )


def test_provider_contract_and_validation(monkeypatch):
    def response(request):
        assert str(request.url) == "https://api.groq.com/openai/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer unit-test-placeholder"
        body = json.loads(request.content)
        assert body["response_format"] == {"type": "json_object"}
        assert body["max_completion_tokens"] == 1600
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"drafts":[{"title":"Review evaluation","priority":"normal"}]}'
                        }
                    }
                ]
            },
        )

    mock_provider(monkeypatch, response)
    assert (
        ai.generate("Return JSON", {}, ai.Suggestions).drafts[0].title
        == "Review evaluation"
    )


@pytest.mark.parametrize(
    "mode", ["bad-json", "bad-schema", "provider-error", "timeout", "oversized"]
)
def test_provider_failures_are_safe(monkeypatch, mode):
    def response(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("secret-provider-detail", request=request)
        if mode == "provider-error":
            return httpx.Response(401, text="secret-provider-detail")
        if mode == "oversized":
            return httpx.Response(200, content=b"x" * 66000)
        content = (
            "not-json"
            if mode == "bad-json"
            else '{"drafts":[{"title":"","priority":"invented"}]}'
        )
        return httpx.Response(
            200, json={"choices": [{"message": {"content": content}}]}
        )

    mock_provider(monkeypatch, response)
    with pytest.raises(HTTPException) as error:
        ai.generate("Return JSON", {}, ai.Suggestions)
    assert error.value.status_code == (504 if mode == "timeout" else 502)
    assert "secret" not in error.value.detail and "unit-test" not in error.value.detail


@pytest.mark.parametrize("status", [400, 401, 403, 404, 413, 422, 429, 500, 503])
def test_provider_errors_are_actionable_without_leaking_data(monkeypatch, caplog, status):
    mock_provider(monkeypatch, lambda request: httpx.Response(status, text="secret-provider-detail"))
    with pytest.raises(HTTPException) as error:
        ai.generate("private-note-text", {}, ai.Suggestions)
    assert f"groq_http_{status}" in error.value.detail
    assert f"groq_http_{status}" in caplog.text
    for secret in ["secret-provider-detail", "unit-test-placeholder", "private-note-text"]:
        assert secret not in error.value.detail + caplog.text


@pytest.mark.parametrize("model, expected", [
    (None, "openai/gpt-oss-120b"),
    ("", "openai/gpt-oss-120b"),
    ("   ", "openai/gpt-oss-120b"),
    (" openai/gpt-oss-120b \n", "openai/gpt-oss-120b"),
    (" openai/gpt-oss-20b \n", "openai/gpt-oss-20b"),
    (" llama-3.3-70b-versatile \n", "llama-3.3-70b-versatile"),
])
def test_model_configuration_is_normalized(monkeypatch, model, expected):
    if model is None:
        monkeypatch.delenv("GROQ_MODEL", raising=False)
    else:
        monkeypatch.setenv("GROQ_MODEL", model)
    def response(request):
        body = json.loads(request.content)
        assert body["model"] == expected
        assert '"additionalProperties": false' in body["messages"][0]["content"]
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"drafts":[]}'}}]})
    mock_provider(monkeypatch, response)
    assert ai.generate("Return JSON", {}, ai.Suggestions).drafts == []


def test_connection_and_truncation_have_distinct_errors(monkeypatch):
    def response(request):
        raise httpx.ConnectError("secret", request=request)
    mock_provider(monkeypatch, response)
    with pytest.raises(HTTPException, match="groq_connection"):
        ai.generate("Return JSON", {}, ai.Suggestions)


def test_truncated_response_is_not_accepted(monkeypatch):
    mock_provider(monkeypatch, lambda request: httpx.Response(200, json={"choices": [{"finish_reason": "length", "message": {"content": '{"drafts":[]}'}}]}))
    with pytest.raises(HTTPException, match="groq_truncated"):
        ai.generate("Return JSON", {}, ai.Suggestions)


def test_ai_requires_login_and_configuration(clients, monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    client = clients()
    assert client.post("/api/ai/recap", json={}).status_code == 401
    register(client)
    assert client.post("/api/ai/recap", json={}).status_code == 503


def test_note_permissions_review_and_budget(clients, monkeypatch):
    owner, user, teammate, member = pair(clients)
    outsider = clients()
    register(outsider, "outside")
    note = owner.post(
        "/api/notes", json={"title": "Private source", "private": True}
    ).json()
    called = []

    def generate(instruction, data, schema):
        called.append(data)
        return ai.Suggestions(drafts=[ai.SuggestedTask(title="Review source")])

    monkeypatch.setattr(ai, "generate", generate)
    route = f"/api/ai/notes/{note['id']}/drafts"
    assert outsider.post(route, json={}).status_code == 404
    assert teammate.post(route, json={}).status_code == 404
    assert not called
    result = owner.post(route, json={})
    assert result.status_code == 200
    assert result.json()["drafts"][0]["assignee_id"] == user["id"]
    assert owner.get("/api/tasks").json() == []
    for _ in range(4):
        assert owner.post(route, json={}).status_code == 200
    assert owner.post(route, json={}).status_code == 429


def test_recap_recomputes_authorized_metrics(clients, monkeypatch):
    owner, _, teammate, _ = pair(clients)
    create(owner, title="Secret private task", private=True, status="done")
    create(owner, title="Shared work", status="done")

    def generate(instruction, data, schema):
        assert data["completed"] == 1
        assert [item["title"] for item in data["recent"]] == ["Shared work"]
        return ai.Recap(summary="One task completed.")

    monkeypatch.setattr(ai, "generate", generate)
    assert teammate.post("/api/ai/recap", json={"scope": "team"}).json() == {
        "summary": "One task completed."
    }
    assert teammate.post("/api/ai/recap", json={"completed": 999}).status_code == 422


def test_public_signup_disabled_by_default(clients, monkeypatch):
    monkeypatch.delenv("ALLOW_PUBLIC_SIGNUP", raising=False)
    response = clients().post(
        "/api/auth/register",
        json={
            "name": "Blocked User",
            "handle": "blocked",
            "email": "blocked@example.com",
            "password": "test-password-123456",
        },
    )
    assert response.status_code == 403
