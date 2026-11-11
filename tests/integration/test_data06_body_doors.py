"""DATA-06 on every door that takes its connection in the request BODY, and SEC-05 on every door that addresses an
investigation by ``inv_id`` (2026-11-08).

The nightly eval's org-denial set (PENDING F1, `evals/nightly_org_denial.jsonl`) asked LuxExperience questions as
another organisation with identity on. 7 of 9 doors refused; ``POST /ask`` and ``POST /chat`` answered. The router
guard (`connection_owner_guard`) read connection ids in the path and the query only, and a door whose connection rode
in its body was to check it itself: ``/query/*`` did, the doors that answer questions did not. The sweep that followed
found the same gap on investigations: cancel, resume, evidence and outcomes never asked whose run they acted on.

The populations are the app's own routes, never a hand list: every door whose body model names a connection, and
every door whose path names an ``inv_id``.
"""
from __future__ import annotations

import asyncio
import json
import re
import typing

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from pydantic import BaseModel
from starlette.requests import Request

from aughor.security.authz import Principal, connection_owner_guard, investigation_owner_guard

# The same user in both organisations, as `test_data06_connection_doors.py` has it: an organisation's first identified
# caller becomes its owner (`rbac.maybe_bootstrap_owner`), so a second name would meet the role gate, not the guard.
INTRUDER = {"X-Aughor-Org": "orgB", "X-Aughor-User": "amit"}
OWNER = {"X-Aughor-Org": "orgA", "X-Aughor-User": "amit"}


#: Doors outside sign-in, each with its own credential, argued here and held by their own test below — the router
#: guard has no caller to compare with on them.
KEYED_DOORS = {
    "/doors/agents/{agent_id}/ask": "the agent's key; the agent's organisation is the caller",
    "/doors/agents/{agent_id}/grounding": "the agent's key (FA-7 checks it, `test_fa7_grounding_read.py`)",
    "/doors/agents/{agent_id}/webhook": "the agent's key; the agent's organisation is the caller",
}


def _names_a_connection(name: str) -> bool:
    return name in ("connection_id", "conn_id", "connection") or name.endswith("_connection_id")


def _models(annotation) -> list[type[BaseModel]]:
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        return [annotation]
    return [m for a in typing.get_args(annotation) for m in _models(a)]


def _body_doors() -> list[tuple[APIRoute, list[str]]]:
    """Every door whose JSON body names a connection at its top level — the fields the guard reads."""
    from aughor.api import app
    found = []
    for route in app.routes:
        if not isinstance(route, APIRoute) or not route.dependant.body_params:
            continue
        params = route.dependant.body_params
        embedded = len(params) > 1 or bool(getattr(params[0].field_info, "embed", False))
        named = []
        for p in params:
            if embedded:
                named += [p.name] if _names_a_connection(p.name) else []
                continue
            for model in _models(p.field_info.annotation):
                named += [n for n in model.model_fields if _names_a_connection(n)]
        if named:
            found.append((route, sorted(set(named))))
    return found


def _inv_doors() -> list[APIRoute]:
    from aughor.api import app
    return [r for r in app.routes if isinstance(r, APIRoute) and "{inv_id" in r.path]


def _depends_on(route: APIRoute, guard) -> bool:
    return any(d.call is guard for d in route.dependant.dependencies)


def _door(route: APIRoute) -> str:
    return f"{sorted(route.methods)[0]} {route.path}"


def _url(route: APIRoute, conn_id: str, inv_id: str = "x") -> str:
    url = route.path
    for param in re.findall(r"{([^}:]+)(?::[^}]+)?}", route.path):
        value = conn_id if _names_a_connection(param) else inv_id if param == "inv_id" else "x"
        url = re.sub(r"{%s(?::[^}]+)?}" % re.escape(param), value, url)
    return url


def _refused(got: tuple[int, str]) -> bool:
    # 403 "belongs to another org" is a guard on the connection or the investigation; 404 "or not yours" is the door's
    # own resource ("x", which nothing holds) refused first by its router's by-id guard, as in the path/query sweep.
    return (got[0] == 403 and "belongs to another org" in got[1]) or (got[0] == 404 and "or not yours" in got[1])


@pytest.fixture
def orgA(tmp_path):
    """A connection of orgA's, a canvas on it, and an investigation over it."""
    from aughor.canvas.models import CanvasScope
    from aughor.canvas.store import create_canvas
    from aughor.db import registry
    from aughor.db.history import create_investigation
    from aughor.org.context import using_org

    with using_org("orgA"):
        conn = registry.add_connection("orgA-body", "duckdb", str(tmp_path / "orgA.duckdb"))
    canvas = create_canvas(name="orgA-canvas", scopes=[CanvasScope(connection_id=conn, schema_name=None, tables=[])])
    inv = create_investigation(question="why did orgA's figure move", connection_id=conn, canvas_id=canvas.id)
    try:
        yield {"conn": conn, "canvas": canvas.id, "inv": inv}
    finally:
        registry.delete_connection(conn)


# ── The guard alone ─────────────────────────────────────────────────────────────

def _post(body, principal: Principal | None, content_type: str = "application/json", path_params: dict | None = None):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()

    async def receive():
        return {"type": "http.request", "body": raw, "more_body": False}

    request = Request({"type": "http", "method": "POST", "path": "/", "query_string": b"",
                       "headers": [(b"content-type", content_type.encode())], "path_params": path_params or {}},
                      receive)
    if principal is not None:
        request.state.principal = principal
    return request


def test_the_guard_reads_every_name_a_body_carries_a_connection_or_a_canvas_under(orgA):
    intruder = Principal(user_id="mallory", org_id="orgB")
    for body in ({"conn_id": orgA["conn"]}, {"connection_id": orgA["conn"]}, {"connection": orgA["conn"]},
                 {"reference_connection_id": orgA["conn"]}, {"canvas_id": orgA["canvas"]},
                 {"question": "q", "connection_id": "fixture", "canvas_id": orgA["canvas"]}):
        with pytest.raises(HTTPException) as refused:
            asyncio.run(connection_owner_guard(_post(body, intruder)))
        assert refused.value.status_code == 403, body
    # What passes: the owner; identity off; a shared builtin; an id nothing holds (the door says "not here" its own
    # way: a body may name what its door is about to create); a body that is not JSON, or not an object, or broken.
    for request in (_post({"conn_id": orgA["conn"]}, Principal("ann", "orgA")),
                    _post({"conn_id": orgA["conn"]}, None),
                    _post({"conn_id": "fixture"}, intruder),
                    _post({"conn_id": "nothing-holds-this"}, intruder),
                    _post({"connection_ids": [orgA["conn"]]}, intruder),           # a list, under a name not read
                    _post({"nested": {"conn_id": orgA["conn"]}}, intruder),        # below the top level
                    _post(b"conn_id=" + orgA["conn"].encode(), intruder, "application/x-www-form-urlencoded"),
                    _post([orgA["conn"]], intruder),
                    _post(b"{not json", intruder)):
        asyncio.run(connection_owner_guard(request))


def test_the_door_still_reads_the_body_the_guard_read(client, monkeypatch, orgA):
    """Starlette caches the body the guard read; the door must parse the same bytes after it."""
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    r = client.post("/query/validate", json={"conn_id": orgA["conn"], "sql": "SELECT 1"}, headers=OWNER)
    assert r.status_code != 422, r.text            # the body reached the door whole


def test_the_investigation_guard_refuses_another_orgs_run_and_lets_an_unsaved_one_through(orgA):
    def req(inv_id, principal):
        return _post({}, principal, path_params={"inv_id": inv_id})
    with pytest.raises(HTTPException) as refused:
        investigation_owner_guard(req(orgA["inv"], Principal("mallory", "orgB")))
    assert refused.value.status_code == 403
    investigation_owner_guard(req(orgA["inv"], Principal("ann", "orgA")))
    investigation_owner_guard(req(orgA["inv"], None))
    investigation_owner_guard(req("a-run-still-streaming", Principal("mallory", "orgB")))   # cancel must still work


# ── Every door ──────────────────────────────────────────────────────────────────

def test_every_door_whose_body_names_a_connection_depends_on_the_owner_guard():
    doors = _body_doors()
    assert len(doors) >= 90, len(doors)                    # the population is found in the app
    unguarded = sorted(_door(r) for r, _ in doors if not _depends_on(r, connection_owner_guard))
    assert not unguarded, f"a door takes a connection in its body and never asks whose it is (DATA-06): {unguarded}"


def test_every_door_that_addresses_an_investigation_depends_on_the_investigation_guard():
    doors = _inv_doors()
    assert len(doors) >= 15, len(doors)
    unguarded = sorted(_door(r) for r in doors if not _depends_on(r, investigation_owner_guard))
    assert not unguarded, f"a door addresses an investigation and never asks whose it is (SEC-05): {unguarded}"


def test_another_org_naming_its_connection_in_a_body_is_refused_on_every_door(client, monkeypatch, orgA):
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    answered = {}
    for route, named in _body_doors():
        if route.path.endswith("/stream") or route.path in KEYED_DOORS:
            continue        # a stream that is NOT refused never ends; a keyed door is held by its own test below
        body = {n: orgA["conn"] for n in named}
        r = client.request(sorted(route.methods)[0], _url(route, orgA["conn"]), json=body, headers=INTRUDER)
        answered[_door(route)] = (r.status_code, r.text[:120])
    assert len(answered) >= 90, len(answered)
    wrong = {door: got for door, got in answered.items() if not _refused(got)}
    assert not wrong, wrong
    stale = sorted(set(KEYED_DOORS) - {r.path for r, _ in _body_doors()})
    assert not stale, f"no longer a door that takes a connection in its body — drop it from KEYED_DOORS: {stale}"


def test_an_agents_key_names_only_its_own_organisations_connection(client, monkeypatch, orgA):
    """An unbound agent's door took any connection its caller named; with identity on, the key holder stands in as the
    agent's organisation, and another organisation's connection is refused before anything is asked."""
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    from aughor.custom_agents import create_agent, delete_agent
    from aughor.custom_agents.keys import issue_agent_key, revoke_agent_key
    asked: list = []

    async def _fold(**kw):
        asked.append(kw["connection_id"])
        return {"agent_id": kw["agent_id"], "question": kw["question"], "headline": "", "sql": "", "columns": [],
                "rows": [], "row_count": 0, "receipt_id": "", "investigation_id": "", "error": "", "truncated": False,
                "frames": 1}
    monkeypatch.setattr("aughor.custom_agents.reach.fold_ask", _fold)
    orgB_agent = create_agent("Org B's desk", instructions="x", owner="orgB")
    orgA_agent = create_agent("Org A's desk", instructions="x", owner="orgA")
    keys = {a.id: {"Authorization": f"Bearer {issue_agent_key(a.id)}"} for a in (orgB_agent, orgA_agent)}
    try:
        for door in ("ask", "webhook"):
            body = {"question": "what moved?", "connection_id": orgA["conn"]}
            r = client.post(f"/doors/agents/{orgB_agent.id}/{door}", json=body, headers=keys[orgB_agent.id])
            assert r.status_code == 403 and "belongs to another org" in r.text, (door, r.status_code, r.text[:200])
            r = client.post(f"/doors/agents/{orgA_agent.id}/{door}", json=body, headers=keys[orgA_agent.id])
            assert r.status_code == 200, (door, r.status_code, r.text[:200])
        assert asked == [orgA["conn"], orgA["conn"]], asked     # only the organisation's own agent reached the ask
    finally:
        for a in (orgB_agent, orgA_agent):
            revoke_agent_key(a.id)
            delete_agent(a.id)


def test_another_orgs_investigation_is_refused_on_every_door_that_addresses_one(client, monkeypatch, orgA):
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    answered = {}
    for route in _inv_doors():
        r = client.request(sorted(route.methods)[0], _url(route, orgA["conn"], orgA["inv"]), json={},
                           headers=INTRUDER)
        answered[_door(route)] = (r.status_code, r.text[:120])
    wrong = {door: got for door, got in answered.items() if not _refused(got)}
    assert not wrong, wrong


# ── The doors that answer questions: refused before anything streams, the owner still answered ─────────────────────

@pytest.fixture
def answered(monkeypatch):
    """The stream bodies stubbed: a door that is not refused answers one frame, and no model is reached."""
    import aughor.routers.investigations as inv
    reached: list[str] = []

    async def one_frame(kind, conn_id):
        reached.append(f"{kind}:{conn_id}")
        yield 'data: {"type": "done"}\n\n'

    monkeypatch.setattr(inv, "_stream_ask", lambda req, request, conn_id: one_frame("ask", conn_id))
    monkeypatch.setattr(inv, "_stream_chat", lambda q, conn_id, *a, **k: one_frame("chat", conn_id))
    monkeypatch.setattr(inv, "_stream_resume", lambda inv_id, *a, **k: one_frame("resume", inv_id))
    return reached


def _agui(**forwarded) -> dict:
    return {"threadId": "t1", "runId": "r1", "state": {}, "tools": [], "context": [],
            "messages": [{"id": "m1", "role": "user", "content": "what moved?"}], "forwardedProps": forwarded}


def test_ask_chat_and_agui_refuse_another_orgs_connection_and_answer_its_own(client, monkeypatch, orgA, answered):
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    conn, canvas = orgA["conn"], orgA["canvas"]
    doors = [
        ("/ask", {"question": "what moved?", "connection_id": conn}),
        ("/ask", {"question": "what moved?", "canvas_id": canvas}),        # a canvas resolves to its connection
        ("/chat", {"question": "what moved?", "connection_id": conn}),
        ("/chat", {"question": "what moved?", "connection_id": "fixture", "canvas_id": canvas}),
        ("/agui/run", _agui(connection_id=conn)),                          # the connection rides in forwardedProps
    ]
    for path, body in doors:
        r = client.post(path, json=body, headers=INTRUDER)
        assert r.status_code == 403 and "belongs to another org" in r.text, (path, body, r.status_code, r.text[:200])
    assert answered == [], f"a refused door reached its stream: {answered}"
    for path, body in doors:
        r = client.post(path, json=body, headers=OWNER)
        assert r.status_code == 200, (path, body, r.status_code, r.text[:200])
    assert len(answered) == len(doors) and all(a.endswith(conn) for a in answered), answered


def test_resume_refuses_another_orgs_investigation_on_both_doors(client, monkeypatch, orgA, answered):
    monkeypatch.setenv("AUGHOR_REQUIRE_IDENTITY", "1")
    inv = orgA["inv"]
    agui_resume = {**_agui(), "messages": [], "resume": [{"interruptId": inv, "status": "resolved", "payload": {}}]}
    for path, body in ((f"/investigations/{inv}/feedback", {"feedback": "go on"}), ("/agui/run", agui_resume)):
        r = client.post(path, json=body, headers=INTRUDER)
        assert r.status_code == 403 and "belongs to another org" in r.text, (path, r.status_code, r.text[:200])
        assert client.post(path, json=body, headers=OWNER).status_code == 200
    assert answered == [f"resume:{inv}", f"resume:{inv}"], answered
