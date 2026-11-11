"""Arc SH — a column's filter, as a spreadsheet's arrow offers it (the user, 2026-11-09).

Two halves. The text matches — contains, begins with, ends with — take the value as written: a % or _ a person types is
that character, never a wildcard (``contains "50%"`` matched "500 off" until this file). And a column's list of values,
each with its rows, read under the view's OTHER filters — never the column's own, so a value left out can be ticked
back — through the grid's own reading of a filter: every count below is checked against the grid's count of the same
rows, and the empty cells against the grid's "is empty".
"""
from __future__ import annotations

import json

import pytest


ORDERS = """order_id,order_status,coupon,price,paid
e481f51c,delivered,50% off,29.99,yes
53cdb2fc,delivered,500 off,118.70,yes
47770eb9,shipped,a_b,159.90,no
949d5b44,canceled,axb,45.00,no
ad21c59c,delivered,,19.90,yes
a4591c26,shipped,BACK\\slash,147.90,yes
136cce7f,shipped,,65.95,
"""


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("AUGHOR_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AUGHOR_SYSTEM_DB", str(tmp_path / "system.db"))
    monkeypatch.setenv("AUGHOR_LOCAL_USER", "ana")
    from aughor.actions import overlay
    from aughor.rbac import store as rbac_store
    monkeypatch.setattr(overlay, "_DB_PATH", tmp_path / "overlay.db")
    monkeypatch.setattr(rbac_store, "_DB_PATH", tmp_path / "rbac.db")
    from aughor.sheets import projection
    projection.reset()
    yield tmp_path
    projection.reset()


def _orders(env):
    from aughor.sheets import files, service
    path = env / "orders.csv"
    path.write_text(ORDERS)
    return service.create_from_file(files.stage(path, path.name), name="Olist orders", by="user:ana",
                                    chosen={"paid": "yesno", "order_status": "choice", "price": "money"})


def _ids(sheet, *conditions) -> list[str]:
    """The order ids the grid shows under these conditions, in the sheet's order."""
    from aughor.sheets import projection
    from aughor.sheets.model import Condition
    page = projection.read_rows(sheet, conditions=[Condition(**c) for c in conditions], limit=100)
    at = 1 + [c.id for c in sheet.columns].index(sheet.column("order_id").id)
    return [r[at] for r in page["rows"]]


def _grid(sheet, *conditions) -> int:
    return len(_ids(sheet, *conditions))


def _values(sheet, column, *conditions, **kw):
    from aughor.sheets import views
    from aughor.sheets.model import Condition
    return views.column_values(sheet, sheet.column(column).id, conditions=[Condition(**c) for c in conditions], **kw)


# ── the text matches ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_contains_begins_with_and_ends_with_match_the_value_as_written(env):
    sheet = _orders(env)
    coupon = sheet.column("coupon").id
    on = lambda op, value: _ids(sheet, {"column": coupon, "op": op, "value": value})  # noqa: E731
    # a % is a percent sign: "50%" is in "50% off" and not in "500 off"
    assert on("contains", "50%") == ["e481f51c"]
    # an _ is an underscore: "a_b", never "axb"
    assert on("contains", "_") == ["47770eb9"]
    assert on("starts_with", "a_") == ["47770eb9"]
    assert on("ends_with", "_b") == ["47770eb9"]
    # a backslash is a backslash
    assert on("contains", "k\\s") == ["a4591c26"]
    # case aside, as contains has always matched
    assert on("starts_with", "back") == ["a4591c26"] and on("ends_with", "OFF") == ["e481f51c", "53cdb2fc"]
    assert on("starts_with", "5") == ["e481f51c", "53cdb2fc"] and on("ends_with", "x") == []
    # at its start and at its end, never anywhere in it: "off" ends two coupons and begins none
    assert on("starts_with", "off") == [] and on("ends_with", "50") == [] and on("starts_with", "_b") == []
    # does not contain: every filled coupon but the one; an empty coupon holds nothing to lack, as before
    assert on("not_contains", "50%") == ["53cdb2fc", "47770eb9", "949d5b44", "a4591c26"]


def test_the_new_matches_are_the_grids_operators_everywhere_a_filter_is_read(env):
    """The chat's show_rows tool and its words take them, and a view keeps them, as every other operator."""
    from aughor.sheets import answer, service, views
    from aughor.sheets.model import Condition, View
    sheet = _orders(env)
    conds = answer.conditions_of(sheet, [{"column": "coupon", "op": "starts_with", "value": "50"},
                                         {"column": "coupon", "op": "ends_with", "value": "off"}])
    assert answer.said(sheet, conds) == "coupon begins with 50 · coupon ends with off"
    kept = service.save_view(sheet, View(name="Fifties", filter=conds), by="user:ana")
    assert views.view_rows(kept, [kept.views[-1]])[kept.views[-1].id] == 2
    assert answer.said(sheet, [Condition(column=sheet.column("order_status").id, op="in", value=["shipped", None])]) \
        == "order_status is one of shipped, empty"


# ── empty, filled, and a list's empty member ─────────────────────────────────────────────────────────────────────────

def test_a_lists_empty_member_stands_for_the_empty_cells(env):
    sheet = _orders(env)
    coupon = sheet.column("coupon").id
    on = lambda op, value: _ids(sheet, {"column": coupon, "op": op, "value": value})  # noqa: E731
    assert on("in", ["axb", None]) == ["949d5b44", "ad21c59c", "136cce7f"]
    assert on("in", ["axb", ""]) == on("in", ["axb", None])
    assert on("in", [None]) == _ids(sheet, {"column": coupon, "op": "empty"})
    # without one, none-of admits the empty cells (as it always has); with one, it leaves them out
    assert on("not_in", ["axb"]) == ["e481f51c", "53cdb2fc", "47770eb9", "ad21c59c", "a4591c26", "136cce7f"]
    assert on("not_in", ["axb", None]) == ["e481f51c", "53cdb2fc", "47770eb9", "a4591c26"]
    assert on("not_in", [None]) == _ids(sheet, {"column": coupon, "op": "not_empty"})
    assert on("in", []) == [] and len(on("not_in", [])) == 7


def test_filled_is_the_exact_complement_of_empty_for_a_text_holding_nothing(env):
    """A text holding "" (a computed column can write one) is empty, so it is never also filled."""
    from aughor.sheets import projection
    from aughor.sheets.imports import ident
    sheet = _orders(env)
    coupon = sheet.column("coupon")
    cur = projection.cursor()
    try:
        cur.execute(f"UPDATE {ident(sheet.table)} SET {ident(coupon.name)} = '' WHERE _row = 4")
    finally:
        cur.close()
    empty = _ids(sheet, {"column": coupon.id, "op": "empty"})
    filled = _ids(sheet, {"column": coupon.id, "op": "not_empty"})
    assert empty == ["949d5b44", "ad21c59c", "136cce7f"]
    assert not set(empty) & set(filled) and len(empty) + len(filled) == 7
    # and the column's list counts it among the empty cells, never as a value of its own
    listed = _values(sheet, "coupon")
    assert listed["blanks"] == 3 and "" not in [v["value"] for v in listed["values"]]


# ── a column's values ────────────────────────────────────────────────────────────────────────────────────────────────

def test_a_columns_values_are_read_under_the_other_filters_never_its_own(env):
    sheet = _orders(env)
    status, price = sheet.column("order_status").id, sheet.column("price").id
    own = {"column": status, "op": "in", "value": ["delivered"]}
    dear = {"column": price, "op": "gt", "value": "50"}
    got = _values(sheet, "order_status", own, dear)
    # the status filter is not applied to its own list: shipped is listed, so it can be ticked back
    assert [(v["value"], v["count"]) for v in got["values"]] == [("delivered", 1), ("shipped", 3)]
    assert got["rows"] == _grid(sheet, dear) == 4 and got["blanks"] == 0 and got["distinct"] == 2 and got["more"] == 0
    for v in got["values"]:
        assert v["count"] == _grid(sheet, dear, {"column": status, "op": "is", "value": v["value"]})
    # named by its name, the column's own filter is still its own
    assert _values(sheet, "order_status", {**own, "column": "Order_Status"}, dear) == got
    # the view's search narrows the rows the list counts, as it narrows the grid's
    assert _values(sheet, "order_status", dear, search="shipped")["values"] == [{"value": "shipped", "count": 3}]


def test_each_value_ticked_alone_shows_its_count_and_the_empty_cells_are_the_grids_empty(env):
    """The checklist's falsifier: a value's count is what the grid shows for "one of" it, its empty member is the grid's
    "is empty", and the values and the empty cells add up to the rows — for every kind of column."""
    sheet = _orders(env)
    dear = {"column": sheet.column("price").id, "op": "gt", "value": "40"}
    late = {"column": sheet.column("order_status").id, "op": "is_not", "value": "canceled"}
    for name in ("order_id", "order_status", "coupon", "price", "paid"):
        c = sheet.column(name)
        got = _values(sheet, name, dear, late)
        # the column's own condition is not among what its list is read under
        others = [x for x in (dear, late) if x["column"] != c.id]
        for v in got["values"]:
            assert v["count"] == _grid(sheet, *others, {"column": c.id, "op": "in", "value": [v["value"]]}), (name, v)
        assert got["blanks"] == _grid(sheet, *others, {"column": c.id, "op": "empty"}) \
            == _grid(sheet, *others, {"column": c.id, "op": "in", "value": [None]}), name
        assert sum(v["count"] for v in got["values"]) + got["blanks"] == got["rows"] == _grid(sheet, *others), name
    coupon = _values(sheet, "coupon")
    assert coupon["blanks"] == 2 and None not in [v["value"] for v in coupon["values"]]
    assert [v["value"] for v in _values(sheet, "paid")["values"]] == [False, True]
    assert _values(sheet, "price")["values"][0] == {"value": "19.90", "count": 1}


def test_a_long_list_says_how_many_it_did_not_list(env, monkeypatch):
    from aughor.sheets import views
    sheet = _orders(env)
    got = _values(sheet, "order_id", limit=3)
    assert [v["value"] for v in got["values"]] == ["136cce7f", "47770eb9", "53cdb2fc"]
    assert got["distinct"] == 7 and got["more"] == 4
    monkeypatch.setattr(views, "MAX_VALUES", 2)
    capped = _values(sheet, "order_id", limit=500)
    assert len(capped["values"]) == 2 and capped["more"] == 5 and capped["distinct"] == 7


def test_a_search_narrows_the_list_to_the_values_holding_it_as_written(env):
    sheet = _orders(env)
    assert [v["value"] for v in _values(sheet, "coupon", q="_")["values"]] == ["a_b"]
    assert [v["value"] for v in _values(sheet, "coupon", q="50%")["values"]] == ["50% off"]
    narrowed = _values(sheet, "coupon", q="off")
    assert narrowed["distinct"] == 2 and narrowed["more"] == 0 and narrowed["rows"] == 7


def test_a_column_a_model_writes_lists_no_count_of_its_values(env):
    from aughor.sheets import model_columns, views
    sheet = _orders(env)
    sheet = model_columns.add(sheet, name="Topic", instruction="the topic", reads=[sheet.column("coupon").id],
                              by="user:ana")
    topic = sheet.column("Topic")
    with pytest.raises(views.ViewRefused, match="written by a model, and nothing is counted"):
        views.column_values(sheet, topic.id, conditions=[])


def test_the_route_reads_a_columns_values_as_the_rows_read_takes_a_filter(env, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from aughor.routers import sheets as sheets_router
    sheet = _orders(env)
    app = FastAPI()
    app.include_router(sheets_router.router)
    client = TestClient(app)
    status, price = sheet.column("order_status").id, sheet.column("price").id
    flt = json.dumps([{"column": status, "op": "is", "value": "shipped"}, {"column": price, "op": "lt", "value": "100"}])
    got = client.get(f"/sheets/{sheet.id}/columns/{status}/values", params={"filter": flt})
    assert got.status_code == 200, got.text
    assert got.json()["values"] == [{"value": "canceled", "count": 1}, {"value": "delivered", "count": 2},
                                    {"value": "shipped", "count": 1}]
    rows = client.get(f"/sheets/{sheet.id}/rows", params={"filter": json.dumps([{"column": price, "op": "lt",
                                                                                  "value": "100"}])}).json()
    assert got.json()["rows"] == rows["total"] == 4
    assert client.get(f"/sheets/{sheet.id}/columns/{status}/values", params={"filter": "[{"}).status_code == 422
    assert client.get(f"/sheets/{sheet.id}/columns/nope/values").status_code == 422
    # gated as the rows are: a sheet not shared with the person is refused, saying so
    from aughor.sheets import model, sharing
    sharing.set_sharing(model.get(sheet.id), "chosen", [{"kind": "person", "id": "bo", "level": "view"}], by="user:ana")
    monkeypatch.setenv("AUGHOR_LOCAL_USER", "dee")
    refused = client.get(f"/sheets/{sheet.id}/columns/{status}/values")
    assert refused.status_code == 403 and "was not shared with you" in refused.json()["detail"]
    monkeypatch.setenv("AUGHOR_LOCAL_USER", "bo")
    assert client.get(f"/sheets/{sheet.id}/columns/{status}/values").status_code == 200
