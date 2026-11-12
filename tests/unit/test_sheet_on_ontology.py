"""SH-6 — a sheet placed on the ontology as an entity, on a person's request (ROADMAP §3.64; punch list 62).

The user's six calls, 2026-11-09: nothing by default — placed only when a person asks, and only once the ontology's
requirements hold; a renamed column is followed, rewriting nothing; an edit that repeats the key is refused; a removed
sheet leaves its entity; a sheet shared with chosen people leaves its entity named with no objects for anyone else;
`_row` is never a property. And the Sheets ontology is each organisation's own.
"""
from __future__ import annotations

import pytest

ORDERS = """order_id,customer_id,order_status,price
e481f51c,9ef432eb,delivered,29.99
53cdb2fc,b0830fb4,shipped,118.70
47770eb9,41ce2a54,shipped,159.90
"""


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("PRAMANYX_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("PRAMANYX_SYSTEM_DB", str(tmp_path / "system.db"))
    monkeypatch.setenv("PRAMANYX_LOCAL_USER", "ana")
    from pramanyx.actions import overlay
    from pramanyx.ontology import overrides
    from pramanyx.rbac import store as rbac_store
    monkeypatch.setattr(overlay, "_DB_PATH", tmp_path / "overlay.db")
    monkeypatch.setattr(rbac_store, "_DB_PATH", tmp_path / "rbac.db")
    monkeypatch.setattr(overrides, "_ROOT", tmp_path / "ontology_overrides")
    monkeypatch.setattr(overrides, "_DRAFT_ROOT", tmp_path / "ontology_overrides_draft")
    monkeypatch.setattr(overrides, "_SEED_ROOT", tmp_path / "ontology_overrides_seed")
    from pramanyx.sheets import projection
    projection.reset()
    yield tmp_path
    projection.reset()


def _make(env, name="Olist orders", text=ORDERS, file="olist_orders_dataset.csv"):
    from pramanyx.sheets import files, service
    path = env / file
    path.write_text(text)
    return service.create_from_file(files.stage(path, path.name), name=name, by="user:ana")


def _client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from pramanyx.routers import ontology as ontology_router
    from pramanyx.routers import sheets as sheets_router
    app = FastAPI()
    app.include_router(sheets_router.router)
    app.include_router(ontology_router.router)
    return TestClient(app)


def _place(sheet, **body):
    return _client().post(f"/sheets/{sheet.id}/ontology", json={"display_name": "Order", "key": "order_id", **body})


def _publish():
    from pramanyx.ontology import release
    from pramanyx.sheets.ontology import SHEETS_ID, scope
    return release.publish(SHEETS_ID, scope(), by="user:ana")


def _graph(view="published"):
    from pramanyx.ontology.overrides import viewing
    from pramanyx.ontology.store import load_latest_ontology
    with viewing(view):
        return load_latest_ontology("sheets", "whatever-a-request-names")


def _objects(entity="Order", columns=None):
    from pramanyx.semantic.object_query import compile_object_listing
    from pramanyx.sheets.connection import SheetsConnection
    compiled = compile_object_listing({"entity": entity, "columns": columns or []}, _graph())
    res = SheetsConnection().execute("objects", compiled.sql)
    return res, compiled


def _cell(sheet, row, column):
    from pramanyx.sheets import model, projection
    return projection.read_row(model.get(sheet.id), row).get(column)


# ── 1 · nothing by default ───────────────────────────────────────────────────────────────────────────────────────────

def test_a_sheet_is_on_no_ontology_until_a_person_places_it(env):
    sheet = _make(env)
    assert _graph() is None and _graph("draft") is None, "a sheet made reaches no ontology by itself"
    got = _client().get(f"/sheets/{sheet.id}/ontology").json()
    assert got["placed"] == []
    keys = {c["name"]: c for c in got["columns"]}
    assert keys["order_id"]["key"] and keys["price"]["key"]
    assert not keys["order_status"]["key"] and "repeats a value" in keys["order_status"]["why"]
    assert "_row" not in keys


def test_the_ontologys_own_door_does_not_take_a_sheet(env):
    sheet = _make(env)
    r = _client().post("/ontology/entities?connection_id=sheets", json={
        "id": "Order", "display_name": "Order", "backing": {"table": sheet.table, "primary_key": "order_id"}})
    assert r.status_code == 400 and "from the sheet itself" in r.json()["detail"]


def test_placed_on_request_it_is_a_draft_until_published_then_its_objects_read(env):
    sheet = _make(env)
    r = _place(sheet)
    assert r.status_code == 201, r.text
    assert r.json()["placed"] == [{"entity": "Order", "display_name": "Order", "key": sheet.column("order_id").id,
                                   "key_property": "order_id", "published": False}]
    assert _graph() is None, "a draft reaches no reader"
    draft = _graph("draft")
    order = draft.entities["Order"]
    assert set(order.properties) == {"order_id", "customer_id", "order_status", "price"}
    assert "_row" not in order.properties and order.backing.kind == "query" and order.backing.verified is True
    _publish()
    assert _client().get(f"/sheets/{sheet.id}/ontology").json()["placed"][0]["published"] is True
    res, compiled = _objects(columns=["order_status", "price"])
    assert res.error in (None, ""), res.error
    assert sorted(str(r[0]) for r in res.rows) == ["47770eb9", "53cdb2fc", "e481f51c"]
    assert compiled.key == "order_id"


@pytest.mark.parametrize("key, why", [
    ("order_status", "repeats a value"),
    ("_row", "never one of an entity's properties"),
    ("nope", "has no column"),
])
def test_a_sheet_is_placed_only_by_a_column_that_is_one_per_object(env, key, why):
    sheet = _make(env)
    r = _place(sheet, key=key)
    assert r.status_code == 422 and why in r.json()["detail"], r.text
    assert _graph("draft") is None


def test_one_sheet_is_one_entity(env):
    sheet = _make(env)
    assert _place(sheet).status_code == 201
    again = _place(sheet, display_name="Order again", entity_id="OrderAgain")
    assert again.status_code == 409 and "already the entity Order" in again.json()["detail"]


# ── 2 · a renamed column is followed, nothing rewritten ──────────────────────────────────────────────────────────────

def test_a_renamed_column_is_followed_and_the_declaration_is_not_rewritten(env):
    from pramanyx.ontology import overrides
    from pramanyx.sheets import model, service
    sheet = _make(env)
    _place(sheet)
    _publish()
    files = sorted(p for p in overrides._ROOT.rglob("*.yaml"))
    before = {p: p.read_bytes() for p in files}
    service.update_column(model.get(sheet.id), "order_status", by="user:ana", name="Order state")
    order = _graph().entities["Order"]
    assert "order_status" in order.properties, "the property keeps the name it was placed with"
    assert "reads the column now called 'Order state'" in order.backing.verification_note
    res, _ = _objects(columns=["order_status"])
    assert res.error in (None, ""), res.error
    assert sorted(r[1] for r in res.rows) == ["delivered", "shipped", "shipped"]
    assert {p: p.read_bytes() for p in files} == before, "following a rename rewrites no declaration"
    # undone, it is followed back
    service.undo(model.get(sheet.id), by="user:ana")
    assert "now called" not in _graph().entities["Order"].backing.verification_note


def test_a_removed_column_leaves_the_entity_without_it_and_says_so(env):
    from pramanyx.sheets import model, service
    sheet = _make(env)
    _place(sheet)
    _publish()
    service.remove_column(model.get(sheet.id), "price", by="user:ana")
    order = _graph().entities["Order"]
    assert "price" not in order.properties and "price was removed from the sheet" in order.backing.verification_note
    res, _ = _objects()
    assert res.error in (None, ""), res.error
    service.remove_column(model.get(sheet.id), "order_id", by="user:ana")
    order = _graph().entities["Order"]
    assert order.backing.verified is False and "its key column was removed" in order.backing.verification_note


# ── 3 · an edit that repeats the key is refused, through every door ──────────────────────────────────────────────────

def _rows(sheet):
    """Each row as the grid reads it: ``{_row: {column name: value}}``."""
    from pramanyx.sheets import model, projection
    s = model.get(sheet.id)
    names = [c.name for c in s.columns]
    page = projection.read_rows(s, limit=100)
    return {int(r[0]): dict(zip(names, r[1:])) for r in page["rows"]}


def test_typing_a_key_another_row_holds_is_refused_and_nothing_is_set(env):
    from pramanyx.sheets import model, service
    sheet = _make(env)
    _place(sheet)
    rows = _rows(sheet)
    first, second = sorted(rows)[:2]
    with pytest.raises(service.Refused, match=r"order_id would hold e481f51c in row \d+ and row \d+ .* the entity Order"):
        service.set_cells(model.get(sheet.id), [{"row": second, "column": "order_id", "value": rows[first]["order_id"]},
                                                {"row": second, "column": "price", "value": "1"}], by="user:ana")
    assert _rows(sheet)[second]["order_id"] == rows[second]["order_id"] and float(_rows(sheet)[second]["price"]) != 1.0
    # an edit of another column of the row, and a key no row holds, go through
    service.set_cells(model.get(sheet.id), [{"row": second, "column": "price", "value": "2"}], by="user:ana")
    service.set_cells(model.get(sheet.id), [{"row": second, "column": "order_id", "value": "new-key"}], by="user:ana")
    assert _rows(sheet)[second]["order_id"] == "new-key"


def test_a_row_added_with_a_key_already_held_is_refused_and_a_blank_one_is_not(env):
    from pramanyx.sheets import model, service
    sheet = _make(env)
    _place(sheet)
    held = next(iter(_rows(sheet).values()))["order_id"]
    with pytest.raises(service.Refused, match="the entity Order"):
        service.add_row(model.get(sheet.id), {"order_id": held}, by="user:ana")
    assert len(_rows(sheet)) == 3
    service.add_row(model.get(sheet.id), {}, by="user:ana")              # no key yet: no object, no repeat
    assert len(_rows(sheet)) == 4


def test_undo_into_a_repeated_key_is_refused(env):
    from pramanyx.sheets import model, service
    sheet = _make(env)
    _place(sheet)
    rows = _rows(sheet)
    a, b = sorted(rows)[:2]
    old_a = rows[a]["order_id"]
    service.set_cells(model.get(sheet.id), [{"row": a, "column": "order_id", "value": "moved"}], by="user:ana")
    service.set_cells(model.get(sheet.id), [{"row": b, "column": "order_id", "value": old_a}], by="user:bo")
    with pytest.raises(service.Refused, match="the entity Order"):
        service.undo(model.get(sheet.id), by="user:ana")                 # a's old key is b's now
    assert _rows(sheet)[a]["order_id"] == "moved"


def test_a_kind_change_that_makes_two_keys_one_is_refused(env):
    from pramanyx.sheets import model, service
    sheet = _make(env, name="Codes", text="code,label\n1,one\n01,also one\n2,two\n", file="codes.csv")
    r = _client().post(f"/sheets/{sheet.id}/ontology", json={"display_name": "Code", "key": "code"})
    assert r.status_code == 201, r.text
    with pytest.raises(service.Refused, match="key of the entity Code"):
        service.update_column(model.get(sheet.id), "code", by="user:ana", kind="number")
    assert model.get(sheet.id).column("code").kind != "number"


def test_every_write_of_a_sheets_values_goes_through_the_one_door_that_checks_the_key():
    """The guard is only as good as the doors it sits behind: nothing in the sheets package writes values but
    `service.save_change`."""
    import pathlib
    import re
    root = pathlib.Path(__file__).parents[2] / "pramanyx"
    direct = [f"{p.relative_to(root)}:{i}" for p in root.rglob("*.py") for i, line in enumerate(p.read_text().splitlines(), 1)
              if re.search(r"save_sheet_change\(", line) and "def save_sheet_change" not in line
              and "check=key_check(sheet)" not in line and not line.lstrip().startswith(("#", '"', "`"))
              and "(`overlay.save_sheet_change" not in line]
    assert direct == [], direct


# ── 4 · a removed sheet leaves its entity ────────────────────────────────────────────────────────────────────────────

def test_a_removed_sheet_leaves_its_entity_declared_and_said(env):
    from pramanyx.sheets import model, service
    from pramanyx.sheets.dependents import dependents_of
    sheet = _make(env)
    _place(sheet)
    _publish()
    deps = dependents_of(model.get(sheet.id), "user:ana", "ana")
    assert [e["entity"] for e in deps["entities"]] == ["Order"] and "stays on the ontology" in deps["entities"][0]["says"]
    service.remove(model.get(sheet.id), by="user:ana")
    order = _graph().entities.get("Order")
    assert order is not None, "removing the sheet never removes the entity"
    assert order.backing.verified is False and "was removed by" in order.backing.verification_note
    assert "removing the entity is its own step" in order.backing.verification_note
    res, _ = _objects()
    assert res.error and "was removed by" in res.error


# ── 5 · a shared sheet's entity: named, no objects, told who to ask ──────────────────────────────────────────────────

def test_a_sheet_not_shared_with_someone_leaves_its_entity_named_and_its_objects_refused_saying_who_to_ask(env, monkeypatch):
    from pramanyx.sheets import model, sharing
    sheet = _make(env)
    _place(sheet)
    _publish()
    sharing.set_sharing(model.get(sheet.id), "chosen", [{"kind": "person", "id": "bo", "level": "view"}], by="user:ana")
    monkeypatch.setenv("PRAMANYX_LOCAL_USER", "cy")
    assert "Order" in _graph().entities, "the entity is named"
    res, _ = _objects()
    assert res.error and "not shared with you" in res.error and not res.rows


# ── 6 · each organisation's own ──────────────────────────────────────────────────────────────────────────────────────

def test_the_sheets_ontology_is_each_organisations_and_a_named_schema_does_not_reach_another(env):
    from pramanyx.org.context import using_org
    from pramanyx.routers.ontology import _resolve_schema
    sheet = _make(env)
    _place(sheet)
    _publish()
    assert _resolve_schema("sheets", "acme") == "default" and "Order" in _graph().entities
    with using_org("acme"):
        assert _resolve_schema("sheets", "default") == "acme"
        assert _graph() is None, "another organisation's sheet entities are not its"


# ── and a dashboard breakdown over it ────────────────────────────────────────────────────────────────────────────────

def test_a_dashboard_breakdown_compiles_over_a_sheets_entity(env):
    from pramanyx.dashboards import pieces
    sheet = _make(env)
    _place(sheet)
    _publish()
    props = {"entity": "Order", "label": "Orders by status", "by": "order_status",
             "measures": [{"agg": "count"}, {"agg": "sum", "path": "price"}]}
    [(_what, body)] = pieces._from_object_probes("ObjectBreakdown", props)
    pieces.check_query(body, pieces.served_graph("sheets"), "sheets")


def test_a_repeat_made_before_is_no_reason_to_refuse_an_edit_of_another_column(env):
    """Only an edit that sets a key, or adds or brings back a row, is held to it: a repeat already standing (written
    past the door here) never blocks the rest of the row, while setting that key again is refused."""
    from pramanyx.actions import overlay
    from pramanyx.actions.overlay import SHEET_CELL, SheetEdit
    from pramanyx.sheets import model, projection, service
    sheet = _make(env)
    _place(sheet)
    rows = _rows(sheet)
    a, b = sorted(rows)[:2]
    key = model.get(sheet.id).column("order_id")
    overlay.save_sheet_change(sheet.id, [SheetEdit(kind=SHEET_CELL, row=b, column=key.id,
                                                   body='"' + rows[a]["order_id"] + '"')],
                              change_id="past-the-door", actor="user:ana")
    projection.apply(model.get(sheet.id), {b})
    service.set_cells(model.get(sheet.id), [{"row": b, "column": "price", "value": "3"}], by="user:ana")
    assert float(_rows(sheet)[b]["price"]) == 3.0
    with pytest.raises(service.Refused, match="the entity Order"):
        service.set_cells(model.get(sheet.id), [{"row": b, "column": "order_id", "value": rows[a]["order_id"]}],
                          by="user:ana")


def test_the_sheets_connection_lists_only_the_readers_organisations_scope(env):
    from pramanyx.ontology.overrides import override_scopes
    from pramanyx.org.context import using_org
    sheet = _make(env)
    _place(sheet)
    _publish()
    assert override_scopes("sheets") == ["default"]
    with using_org("acme"):
        assert override_scopes("sheets") == []
