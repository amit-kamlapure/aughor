"""The key door of a connection's entity (2026-11-12).

`PUT /ontology/entities/{id}/key` hands its work to the entity door by CALLING it. Called as a function, a parameter
left to its default is FastAPI's ``Query(...)`` object — which is not ``None`` — so the entity door took a connection's
key for an organisation's type and refused it, on every connection, with words about organisations' ontologies. Nothing
held the door: this does, and holds every other door that calls a routed function the same way.
"""
from __future__ import annotations

import ast
from pathlib import Path

from aughor.ontology.models import OntologyEntity, OntologyGraph

REPO = Path(__file__).resolve().parents[2]


def _graph() -> OntologyGraph:
    e = OntologyEntity(id="Customer", display_name="Customer", source_tables=["users"], identity_key="id",
                       grain_verified=True)
    e.properties = {"id": object(), "email": object()}          # the door reads only their names
    return OntologyGraph.model_construct(connection_id="c1", schema_name="s", entities={"Customer": e}, relationships={})


def test_a_connections_key_reaches_the_entity_door_as_a_connections_not_an_organisations(monkeypatch):
    from aughor.routers import ontology as R
    seen = {}

    def entity_door(entity_id, body, connection_id=None, schema_name=None, domain="left to its default"):
        seen.update(entity=entity_id, backing=body.backing.model_dump(exclude_none=True), connection_id=connection_id,
                    schema_name=schema_name, domain=domain)
        return {"ok": True}

    monkeypatch.setattr(R, "_get_ontology_graph", lambda *a, **k: _graph())
    monkeypatch.setattr(R, "_served_scope", lambda c, s: s)
    monkeypatch.setattr(R, "override_ontology_entity", entity_door)
    assert R.set_ontology_entity_key("Customer", R._EntityKey(columns=["id"]), "c1", "s") == {"ok": True}
    assert seen["domain"] is None, "the key of a connection's entity is not an organisation's declaration"
    assert (seen["connection_id"], seen["schema_name"]) == ("c1", "s")
    assert seen["backing"] == {"kind": "table", "table": "users", "primary_key": "id"}


def test_no_door_calls_a_routed_function_leaving_a_query_parameter_to_its_default():
    """Every routed function in the ontology router whose parameters default to ``Query(...)``: wherever another
    function CALLS it, each such parameter is passed by name. A default of ``Query(...)`` is a truthy object, never the
    value it documents."""
    source = (REPO / "aughor" / "routers" / "ontology.py").read_text()
    tree = ast.parse(source)
    queried: dict[str, set[str]] = {}
    for fn in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
        args = fn.args.args
        for arg, default in zip(args[len(args) - len(fn.args.defaults):], fn.args.defaults):
            if isinstance(default, ast.Call) and getattr(default.func, "id", "") == "Query":
                queried.setdefault(fn.name, set()).add(arg.arg)
    order = {fn.name: [a.arg for a in fn.args.args] for fn in ast.walk(tree) if isinstance(fn, ast.FunctionDef)}
    left = []
    for call in [n for n in ast.walk(tree) if isinstance(n, ast.Call) and getattr(n.func, "id", "") in queried]:
        name = call.func.id
        given = set(order[name][:len(call.args)]) | {k.arg for k in call.keywords if k.arg}
        missing = sorted(queried[name] - given)
        if missing:
            left.append(f"line {call.lineno}: {name}(...) leaves {', '.join(missing)} to its Query default")
    assert left == []
