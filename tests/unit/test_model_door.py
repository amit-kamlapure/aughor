"""The model door — the coworker's model calls, made by Pramanyx with the organisation's models.

The provider is answered by a mock transport, so nothing leaves the test. What is under test is what the door
promises: closed unless an admin opened it, the caller names a role and never a model, a cap is said before anything
is sent, the reply passes through as it came, and every call is recorded with what it cost.
"""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from pramanyx.llm import provider
from pramanyx.orgsettings.store import load_org_settings, save_org_settings
from pramanyx.routers import model_door

KEY = "sk-test-not-a-real-key-000"
URL = "https://provider.test/v1/chat/completions"


@pytest.fixture
def door(monkeypatch):
    """The door open, bound to a fake provider. Returns what the provider was sent and what was recorded."""
    before = load_org_settings()
    save_org_settings(before.model_copy(update={"coworker_models": True}))
    seen = {"requests": [], "records": [], "reply": None}

    def answer(request: httpx.Request) -> httpx.Response:
        seen["requests"].append(request)
        return seen["reply"](request) if seen["reply"] else httpx.Response(200, json={
            "choices": [{"message": {"role": "assistant", "content": "hello"}}],
            "usage": {"prompt_tokens": 11, "completion_tokens": 7}})

    monkeypatch.setattr(model_door, "_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(answer)))
    monkeypatch.setattr(provider, "door_binding", lambda role: ("fakeprov", f"vendor/{role}-model", URL, KEY))
    monkeypatch.setattr(provider, "record_door_call", lambda **kw: seen["records"].append(kw))
    app = FastAPI()
    app.include_router(model_door.router)
    seen["client"] = TestClient(app)
    yield seen
    save_org_settings(before)


def _ask(door, **body):
    payload = {"model": "narrator", "messages": [{"role": "user", "content": "hi"}], **body}
    return door["client"].post("/llm/door/v1/chat/completions", json=payload,
                               headers={model_door.CALLER_HEADER: "coworker"})


def test_closed_until_an_admin_opens_it_and_it_says_where(door):
    save_org_settings(load_org_settings().model_copy(update={"coworker_models": None}))
    r = _ask(door)
    assert r.status_code == 403
    assert "Settings ▸ Organization" in r.json()["error"]["message"] and "Nothing was sent" in r.json()["error"]["message"]
    assert door["requests"] == [] and door["records"] == []
    assert door["client"].get("/llm/door/v1/models").status_code == 403


def test_a_role_is_bound_to_the_organisations_model_with_its_key(door):
    r = _ask(door, tools=[{"type": "function", "function": {"name": "ask"}}])
    assert r.status_code == 200 and r.json()["choices"][0]["message"]["content"] == "hello"
    sent = door["requests"][0]
    body = json.loads(sent.content)
    assert str(sent.url) == URL
    assert body["model"] == "vendor/narrator-model"                     # the organisation's, not the caller's word
    assert body["tools"][0]["function"]["name"] == "ask"                # the rest of the request, as it arrived
    assert sent.headers["authorization"] == f"Bearer {KEY}"
    assert KEY not in r.text


def test_the_call_is_recorded_with_what_it_cost_and_who_asked(door):
    _ask(door)
    (record,) = door["records"]
    assert (record["backend"], record["model"], record["role"]) == ("fakeprov", "vendor/narrator-model", "narrator")
    assert (record["prompt_tokens"], record["completion_tokens"]) == (11, 7)
    assert record["ok"] is True and record["streamed"] is False and record["caller"] == "coworker"
    assert KEY not in json.dumps(record, default=str)


@pytest.mark.parametrize("named", ["gpt-4o", "vendor/narrator-model", "", "pramanyx/unknown"])
def test_the_caller_names_a_role_never_a_model(door, named):
    r = _ask(door, model=named)
    assert r.status_code == 404 and "coder, narrator, fast" in r.json()["error"]["message"]
    assert door["requests"] == [] and door["records"] == []


def test_a_role_may_carry_the_doors_own_prefix(door):
    assert _ask(door, model="pramanyx/coder").status_code == 200
    assert json.loads(door["requests"][0].content)["model"] == "vendor/coder-model"


def test_a_blocking_cap_is_said_before_anything_is_sent(door, monkeypatch):
    from pramanyx.govern import outbound

    class Refused:
        allowed, reason = False, "the organisation's monthly cap of 100 calls is used"

    monkeypatch.setattr(outbound, "_cap_decision", lambda org, user: Refused())
    r = _ask(door)
    assert r.status_code == 429 and "monthly cap of 100 calls" in r.json()["error"]["message"]
    assert door["requests"] == [] and door["records"] == []


def test_a_streamed_reply_passes_as_it_came_and_is_counted(door):
    stream = (b'data: {"choices":[{"delta":{"content":"he"}}]}\n\n'
              b'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n'
              b'data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":5}}\n\n'
              b"data: [DONE]\n\n")
    async def pieces():                       # as a provider sends it: in parts, the usage block split across two
        cut = stream.index(b'"usage"') + 4
        yield stream[:cut]
        yield stream[cut:]

    door["reply"] = lambda request: httpx.Response(200, content=pieces(), headers={"content-type": "text/event-stream"})
    r = _ask(door, stream=True)
    assert r.status_code == 200 and r.content == stream
    assert json.loads(door["requests"][0].content)["stream_options"] == {"include_usage": True}
    (record,) = door["records"]
    assert (record["prompt_tokens"], record["completion_tokens"], record["streamed"]) == (20, 5, True)


def test_usage_split_across_chunks_is_still_read():
    reader = model_door._StreamedUsage()
    for piece in (b'data: {"choices":[],"usa', b'ge":{"prompt_tokens":3,', b'"completion_tokens":4}}\n', b"\ndata: [DONE]\n\n"):
        reader.feed(piece)
    assert reader.found == {"prompt_tokens": 3, "completion_tokens": 4}


def test_the_providers_refusal_passes_through_and_is_recorded_as_a_failure(door):
    door["reply"] = lambda request: httpx.Response(401, json={"error": {"message": "bad key"}})
    r = _ask(door)
    assert r.status_code == 401 and r.json()["error"]["message"] == "bad key"
    (record,) = door["records"]
    assert record["ok"] is False and record["prompt_tokens"] is None


def test_a_provider_that_does_not_answer_is_said_and_recorded(door):
    def gone(request):
        raise httpx.ConnectError("no route")

    door["reply"] = gone
    r = _ask(door)
    assert r.status_code == 502 and "did not answer" in r.json()["error"]["message"]
    (record,) = door["records"]
    assert record["ok"] is False and record["error_class"] == "ConnectError"


@pytest.mark.parametrize("raised, status", [
    (provider.NoModelConfigured("fakeprov", "narrator"), 409),
    (provider.NotOnTheDoorsWire("anthropic"), 501),
    (RuntimeError("the stored fakeprov key cannot be decrypted"), 503),
])
def test_a_role_that_cannot_be_bound_says_why_and_sends_nothing(door, monkeypatch, raised, status):
    def refuse(role):
        raise raised

    monkeypatch.setattr(provider, "door_binding", refuse)
    r = _ask(door)
    assert r.status_code == status and door["requests"] == [] and door["records"] == []
    assert door["client"].get("/llm/door/v1/models").json()["data"] == []


def test_the_roles_the_door_lists_are_the_ones_it_can_bind(door, monkeypatch):
    def only_coder(role):
        if role != "coder":
            raise provider.NoModelConfigured("fakeprov", role)
        return ("fakeprov", "vendor/coder-model", URL, KEY)

    monkeypatch.setattr(provider, "door_binding", only_coder)
    listed = door["client"].get("/llm/door/v1/models").json()
    assert [m["id"] for m in listed["data"]] == ["coder"] and KEY not in json.dumps(listed)


# ── the binding itself ───────────────────────────────────────────────────────────────────────────────────

def _bind(monkeypatch, backend, model, base_url, key=""):
    monkeypatch.setattr(provider, "resolve_binding", lambda role="coder", **kw: (backend, model, base_url))
    monkeypatch.setattr(provider, "endpoint_for", lambda b: (base_url, key))


def test_the_binding_is_the_roles_own_and_ends_in_chat_completions(monkeypatch):
    _bind(monkeypatch, "openrouter", "vendor/m", "https://openrouter.test/api/v1/", KEY)
    assert provider.door_binding("coder") == ("openrouter", "vendor/m", "https://openrouter.test/api/v1/chat/completions", KEY)


def test_ollama_is_reached_on_its_chat_completions_surface(monkeypatch):
    _bind(monkeypatch, "ollama", "llama", "http://localhost:11434")
    assert provider.door_binding("fast")[2] == "http://localhost:11434/v1/chat/completions"


def test_a_role_with_no_model_and_a_provider_off_the_wire_are_refused_by_name(monkeypatch):
    _bind(monkeypatch, "openrouter", "", "https://openrouter.test/api/v1")
    with pytest.raises(provider.NoModelConfigured):
        provider.door_binding("coder")
    _bind(monkeypatch, "anthropic", "claude", "")
    with pytest.raises(provider.NotOnTheDoorsWire, match="anthropic"):
        provider.door_binding("coder")


def test_a_door_call_lands_in_the_model_call_record_marked_as_the_doors(monkeypatch):
    kept = []
    monkeypatch.setattr(provider, "_record_llm_call", lambda **kw: kept.append(kw))
    provider.record_door_call(backend="b", model="m", role="coder", prompt_tokens=1, completion_tokens=2,
                              ms=3.0, streamed=True, caller="coworker")
    (row,) = kept
    assert row["extra"] == {"door": "coworker"} and row["streamed"] is True
    assert (row["prompt_tokens"], row["completion_tokens"]) == (1, 2)
    assert "system" not in row and "user" not in row and "output" not in row      # the words are not kept
