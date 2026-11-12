"""Arc SH — a Number column's format, as a spreadsheet's number formats are (the user, 2026-11-09).

A format is how a column SHOWS its values — standard, compact, currency, a percentage, scientific, bytes — and never
what it holds. A sheet is shared and versioned, so the format is part of its definition: one change in the history,
in words that say what changed, undone and redone as any other column edit is, and no value, filter or count moves for
it. A column shown as it is keeps the definition it had before formats existed.
"""
from __future__ import annotations

import pytest


ORDERS = """order_id,order_status,items,price
e481f51c,delivered,1,29.99
53cdb2fc,delivered,2,118.70
47770eb9,shipped,1,159.90
"""


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("PRAMANYX_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("PRAMANYX_SYSTEM_DB", str(tmp_path / "system.db"))
    monkeypatch.setenv("PRAMANYX_LOCAL_USER", "ana")
    from pramanyx.actions import overlay
    from pramanyx.rbac import store as rbac_store
    monkeypatch.setattr(overlay, "_DB_PATH", tmp_path / "overlay.db")
    monkeypatch.setattr(rbac_store, "_DB_PATH", tmp_path / "rbac.db")
    from pramanyx.sheets import projection
    projection.reset()
    yield tmp_path
    projection.reset()


def _orders(env):
    from pramanyx.sheets import files, service
    path = env / "orders.csv"
    path.write_text(ORDERS)
    return service.create_from_file(files.stage(path, path.name), name="Olist orders", by="user:ana",
                                    chosen={"items": "number", "price": "money"})


def _stored_columns(sheet_id: str) -> list[dict]:
    """The columns as the ledger holds them — not as a read fills in their defaults."""
    from pramanyx.kernel import lifecycle
    from pramanyx.sheets import model
    rev = lifecycle.resolve(model.KIND, model.natural_key(sheet_id, model._org()), audience="editor")
    return rev.body["columns"]


def test_a_format_is_the_sheets_kept_in_words_and_undone_and_redone_whole(env):
    from pramanyx.sheets import model, projection, service
    sheet = _orders(env)
    items = sheet.column("items")
    assert items.kind == "number" and items.format == ""
    # a column shown as it is: stored as it was before formats existed
    assert all("format" not in c for c in _stored_columns(sheet.id))
    rows_before = projection.read_rows(sheet, limit=10)["rows"]

    service.update_column(sheet, items.id, by="user:ana", format="currency")
    now = model.get(sheet.id)
    assert now.column("items").format == "currency"
    assert now.change.what == "items shown as currency"
    assert [c.get("format") for c in _stored_columns(sheet.id) if c["id"] == items.id] == ["currency"]
    # a format is what a cell shows, never what it holds: the rows read the same, and the table needs no rebuild
    assert projection.read_rows(now, limit=10)["rows"] == rows_before
    assert projection.check(now)["same"]

    service.update_column(now, items.id, by="user:ana", format="percent")
    assert model.get(sheet.id).change.what == "items shown as a percentage"
    service.update_column(model.get(sheet.id), items.id, by="user:ana", format="percent")      # the same: nothing
    assert model.get(sheet.id).change.what == "items shown as a percentage"
    assert len(model.history(sheet.id)) == 3

    service.undo(model.get(sheet.id), by="user:ana")
    assert model.get(sheet.id).column("items").format == "currency"
    service.undo(model.get(sheet.id), by="user:ana")
    assert model.get(sheet.id).column("items").format == ""
    assert all("format" not in c for c in _stored_columns(sheet.id))
    service.redo(model.get(sheet.id), by="user:ana")
    assert model.get(sheet.id).column("items").format == "currency"

    service.update_column(model.get(sheet.id), items.id, by="user:ana", format="")
    assert model.get(sheet.id).change.what == "items shown with no format"
    assert model.get(sheet.id).column("items").format == ""


def test_a_format_is_one_of_the_seven_and_only_a_number_column_takes_one(env):
    from pramanyx.sheets import model, service
    sheet = _orders(env)
    items, price, status = sheet.column("items"), sheet.column("price"), sheet.column("order_status")
    # refused in a sentence — not any error that happens to stop it further on
    with pytest.raises(Exception) as got:
        service.update_column(sheet, items.id, by="user:ana", format="fancy")
    assert isinstance(got.value, service.Refused)
    assert str(got.value) == ("'fancy' is not a number format — one of 'standard', 'compact', 'currency', 'percent', "
                              "'scientific', 'bytes', or '' for none")
    with pytest.raises(service.Refused, match="price is Money, and only a Number column takes a number format"):
        service.update_column(model.get(sheet.id), price.id, by="user:ana", format="currency")
    with pytest.raises(service.Refused, match="order_status is Text, and only a Number column takes a number format"):
        service.update_column(model.get(sheet.id), status.id, by="user:ana", format="compact")
    # refused before anything else in the same change is made
    with pytest.raises(service.Refused):
        service.update_column(model.get(sheet.id), items.id, by="user:ana", name="units", format="fancy")
    after = model.get(sheet.id)
    assert after.column("items").name == "items" and len(model.history(sheet.id)) == 1
    # every one of the seven is taken
    from pramanyx.sheets import kinds
    for fmt in kinds.NUMBER_FORMATS:
        service.update_column(model.get(sheet.id), items.id, by="user:ana", format=fmt)
        assert model.get(sheet.id).column("items").format == fmt


def test_a_column_that_stops_being_a_number_loses_its_format_and_says_so(env):
    from pramanyx.sheets import model, service
    sheet = _orders(env)
    items = sheet.column("items")
    service.update_column(sheet, items.id, by="user:ana", format="bytes")
    service.update_column(model.get(sheet.id), items.id, by="user:ana", kind="text")
    now = model.get(sheet.id)
    assert now.column("items").kind == "text" and now.column("items").format == ""
    assert now.change.what == "items is now Text; its number format went with it"
    # a kind given with a format it cannot take is refused whole
    with pytest.raises(service.Refused, match="items is Text, and only a Number column takes a number format"):
        service.update_column(now, items.id, by="user:ana", format="compact")
    service.undo(model.get(sheet.id), by="user:ana")
    back = model.get(sheet.id).column("items")
    assert back.kind == "number" and back.format == "bytes"


def test_the_route_sets_a_format_for_an_editor_and_refuses_it_in_a_sentence(env, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from pramanyx.routers import sheets as sheets_router
    from pramanyx.sheets import model, sharing
    sheet = _orders(env)
    app = FastAPI()
    app.include_router(sheets_router.router)
    client = TestClient(app, raise_server_exceptions=False)      # a 500 is a status to assert, not an exception
    items = sheet.column("items").id
    done = client.patch(f"/sheets/{sheet.id}/columns/{items}", json={"format": "compact"})
    assert done.status_code == 200, done.text
    assert [c["format"] for c in done.json()["columns"] if c["id"] == items] == ["compact"]
    bad = client.patch(f"/sheets/{sheet.id}/columns/{items}", json={"format": "fancy"})
    assert bad.status_code == 422 and "is not a number format" in bad.json()["detail"]
    # someone who may only read the sheet does not change how it shows
    sharing.set_sharing(model.get(sheet.id), "chosen", [{"kind": "person", "id": "bo", "level": "view"}], by="user:ana")
    monkeypatch.setenv("PRAMANYX_LOCAL_USER", "bo")
    refused = client.patch(f"/sheets/{sheet.id}/columns/{items}", json={"format": "bytes"})
    assert refused.status_code == 403
    assert model.get(sheet.id).column("items").format == "compact"
