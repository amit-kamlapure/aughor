"""Arc SH, SH-6 — the Briefing over a sheet (ROADMAP §3.64).

A sheet's numbers are a Briefing figure the way any connection's are: a metric a person approved on the Sheets
connection, measured for the range by the Briefing's own measurement. What a sheet adds is that it is LIVE
(`db.registry.is_live`): people edit its rows at any age, so none of its days ever settles. So here:

- a figure is the sheet's own total over the range's rows — the grid's, for the same rows;
- it is never called final, however old its days, and the Briefing says why in the settling answer's words;
- it is still read as a move: the figure and what it is compared with are read in one statement, at one moment;
- it is read fresh — an edit moves it on the next read, even with a Briefing of the same range kept, and where the
  data ends moves with a row added, not ten minutes later.

Run against the real stores, each pointed at a temporary path, over a sheet made from a file.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

#: Olist-like: the data ENDED in 2018, as the live install's sheets do — the path every preset takes there.
ENDED = """order_id,order_status,order_purchase_timestamp,price
o1,delivered,2018-08-20 10:00:00,10.00
o2,delivered,2018-08-21 11:00:00,20.00
o3,shipped,2018-08-22 12:00:00,30.00
o8,delivered,2018-08-26 18:00:00,5.00
o4,canceled,2018-08-27 09:00:00,40.00
o5,delivered,2018-08-28 10:00:00,
o6,shipped,2018-08-29 10:00:00,60.00
o7,delivered,2018-09-02 10:00:00,70.00
"""


def _recent(today: date) -> str:
    """Sixty days of rows ending yesterday, one a day — relative to today, so a calendar day never turns it red."""
    rows = ["order_id,order_status,order_purchase_timestamp,price"]
    for i in range(1, 61):
        d = today - timedelta(days=i)
        rows.append(f"r{i},{('delivered', 'shipped', 'canceled')[i % 3]},{d.isoformat()} 10:00:00,{10 + i}.00")
    return "\n".join(rows) + "\n"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("AUGHOR_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("AUGHOR_SYSTEM_DB", str(tmp_path / "system.db"))
    from aughor.actions import overlay
    monkeypatch.setattr(overlay, "_DB_PATH", tmp_path / "overlay.db")
    from aughor.briefing import ranges
    from aughor.sheets import projection
    projection.reset()
    ranges._EDGE_CACHE.clear()
    yield tmp_path
    from aughor.semantic.metrics import delete_metric
    delete_metric("paid", connection_id="sheets")
    ranges._EDGE_CACHE.clear()
    projection.reset()


def _sheet(env, text: str):
    from aughor.sheets import files, service
    path = env / "orders.csv"
    path.write_text(text)
    return service.create_from_file(files.stage(path, path.name), name="Olist orders", by="user:ana",
                                    chosen={"order_status": "choice"})


def _client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from aughor.routers import exploration, metrics
    app = FastAPI()
    app.include_router(metrics.router)
    app.include_router(exploration.router)
    return TestClient(app)


def _approve_paid(client, sheet) -> None:
    """A person's metric on the Sheets connection, through the Semantic Layer's own doors."""
    body = {"name": "paid", "label": "Paid", "connection": "sheets", "unit": "R$", "time_kind": "flow",
            "sql": f"SELECT SUM(price) AS paid FROM {sheet.table}", "tables": [sheet.table],
            "time_column": f"{sheet.table}.order_purchase_timestamp"}
    assert client.post("/metrics", json=body).status_code == 201
    for action in ("propose", "approve"):
        r = client.post("/metrics/paid/transition", json={"action": action, "connection": "sheets"})
        assert r.status_code == 200, r.text


def _grid_sum(sheet, first: date, end: date) -> float:
    """The grid's own total of price over the rows the range holds — the falsifier's other side."""
    from aughor.sheets import model, projection
    from aughor.sheets.model import Condition
    sheet = model.get(sheet.id)
    ts, price = sheet.column("order_purchase_timestamp").id, sheet.column("price").id
    read = projection.read_rows(sheet, limit=1, conditions=[
        Condition(column=ts, op="gte", value=f"{first.isoformat()} 00:00:00"),
        Condition(column=ts, op="lt", value=f"{end.isoformat()} 00:00:00")])
    return float(read["totals"][price]["sum"] or 0)


def _paid(period: dict) -> dict:
    return next(m for m in period["measured"] if m["metric"] == "paid")


def test_a_sheets_figure_is_its_own_total_never_final_and_still_read_as_a_move(env):
    sheet = _sheet(env, ENDED)
    client = _client()
    _approve_paid(client, sheet)
    r = client.post("/exploration/sheets/briefing/measures?preset=last_week")
    assert r.status_code == 200, r.text
    period = r.json()["period"]
    # the data ended on 2 September 2018: last week is the week holding it, against the week before
    assert period["data_ended"] and period["covers"] == "the week 2018-08-27 to 2018-09-02"
    paid = _paid(period)
    assert paid["current"] == _grid_sum(sheet, date(2018, 8, 27), date(2018, 9, 3)) == 170.0
    assert paid["previous"] == _grid_sum(sheet, date(2018, 8, 20), date(2018, 8, 27)) == 65.0
    # eight years old and never final: anyone who edits the sheet changes it
    assert paid["status"] == "provisional"
    # but read at one moment with what it is compared with, so a difference is the sheet's own — read as a move
    assert paid["equal_age"] == {"equal": True, "why": ""} and paid["rel"] is not None
    assert period["live"] is True
    assert period["settling"]["kind"] == "live"
    assert "none of its days settles" in period["settling"]["says"]


def test_the_send_and_the_narrator_say_a_sheet_is_live_and_never_that_its_figures_are_final(env):
    from dataclasses import replace

    from aughor.briefing import ranges
    from aughor.briefing.delivery import render_period_markdown
    from aughor.knowledge.brief_context import _period_lines
    from aughor.knowledge.period_brief import period_note
    sheet = _sheet(env, ENDED)
    _approve_paid(_client(), sheet)
    spec, why = ranges.resolve_for("sheets", "last_week")
    assert spec is not None and spec.live and spec.data_ended, why
    block = ranges.range_block(spec)
    md = render_period_markdown(block, [], 0)
    assert "none of its days settles" in md and "final" not in md
    note = period_note(block, datetime.now(timezone.utc).date())
    assert "none of its days settles" in note and "every figure in it is final" not in note
    said = " ".join(_period_lines(block))
    assert "none of its days settles" in said and "every figure is final" not in said
    # the same range of a source that is not live, over data that ended, is still said to be final
    other = ranges.range_block(replace(spec, live=False))
    assert "every figure here is final" in render_period_markdown(other, [], 0)
    assert other["settling"] is None and "every figure is final" in " ".join(_period_lines(other))


def test_an_edit_moves_the_figure_on_its_next_read_with_a_briefing_of_the_range_kept(env):
    """The falsifier: a sheet's figure never shows what it held before an edit."""
    from aughor.briefing import ranges
    from aughor.knowledge import briefing as built
    from aughor.sheets import model, service
    today = datetime.now(timezone.utc).date()
    sheet = _sheet(env, _recent(today))
    client = _client()
    _approve_paid(client, sheet)
    first = client.post("/exploration/sheets/briefing/measures?preset=last_week").json()
    period = first["period"]
    start, end = date.fromisoformat(period["start"]), date.fromisoformat(period["end"])
    before = _paid(period)["current"]
    assert before == _grid_sum(sheet, start, end) and not first["from_briefing"]
    # a Briefing of the same range, kept a moment ago — what the measures door hands back for any other connection
    spec, _ = ranges.resolve_for("sheets", "last_week")
    key = f"sheets#{spec.key}"
    built.keep_entry(key, {"period": period, "generated_at": datetime.now(timezone.utc).isoformat(),
                           "narrative": "kept"})
    try:
        # someone edits a row inside the week
        row = next(r for r in range(1, 61) if start <= today - timedelta(days=r) < end)
        service.set_cells(model.get(sheet.id), [{"row": row, "column": "price", "value": "1000.00"}], by="user:bo")
        again = client.post("/exploration/sheets/briefing/measures?preset=last_week").json()
        assert not again["from_briefing"]
        after = _paid(again["period"])["current"]
        assert after == _grid_sum(sheet, start, end) == before - (10 + row) + 1000.0
    finally:
        built._store().delete(key)


def test_where_a_sheets_data_ends_moves_with_the_row_added_not_ten_minutes_later(env):
    from aughor.briefing import ranges
    from aughor.sheets import model, service
    today = datetime.now(timezone.utc).date()
    sheet = _sheet(env, _recent(today))
    _approve_paid(_client(), sheet)
    assert ranges.data_edge("sheets", today=today)["through"] == today - timedelta(days=1)
    service.add_row(model.get(sheet.id), {"order_id": "new", "order_status": "delivered",
                                          "order_purchase_timestamp": f"{today.isoformat()} 08:00:00",
                                          "price": "5.00"}, by="user:bo")
    assert ranges.data_edge("sheets", today=today)["through"] == today


def test_a_live_answer_says_what_it_is_wherever_it_is_asked():
    """The settling answer is the only place a source's days are worded: a live one keeps its words in every form, and
    is never narrowed into a source that says nothing."""
    from aughor.settling.answer import LIVE, answer_from, answer_of_block
    said = answer_from({"live": True, "days": 1, "still_moving": ["x"]})
    assert said.kind == LIVE and said.live and said.never_settled
    assert said.about({"sql": "SELECT SUM(price) FROM olist_orders"}).kind == LIVE
    assert "none of its days settles" in said.says() and "none of its days settles" in said.clause()
    assert "never a difference in age" in said.for_agents() and "do not read a difference" not in said.for_agents()
    assert "never settles" in said.wait_words() and "days this source is read behind" not in said.wait_words()
    assert answer_of_block({"live": True, "lag_days": 1}).kind == LIVE
    assert answer_of_block({"lag_days": 1}).kind != LIVE


def test_one_answer_says_a_connection_is_live_and_the_result_cache_reads_it():
    from aughor.db import matcache
    from aughor.db.registry import SHEETS_ID, is_live
    assert is_live(SHEETS_ID) and not is_live("samples") and not is_live("")
    assert matcache._never_cached(SHEETS_ID) and not matcache._never_cached("samples")
