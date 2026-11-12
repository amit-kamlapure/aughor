"""ROADMAP §6 item 46 — every part of the Briefing can be asked about.

The user, 2026-10-07: *"each and every component or the module on the briefing should become question ready… the graphs
the charts the numbers everything should be questionable by the user."* A question about one part of an edition names
it as the turn's ``focus`` — its block's id, the edition's period and reader, and the source it draws now — and the
answer starts from that part's own definition: each source's SQL, the governed metric a check measures, the period.

What is held here, with the model never called (the conversation loop is stubbed; what it is HANDED is the proof):

* the part is read from the kept edition, never from the page — a figure carries its check's SQL and metric, a lead
  every source it cites, a drilled card the drill it draws now;
* a part the edition does not hold — a block written over, a drill's own block, a source the part does not read, an
  edition never written — is refused in a sentence, before anything runs;
* through the real ``/ask`` door: the route receipt names the part, its metric and its period, and the conversation is
  handed the part's SQL beside the edition it is on.
"""
from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from pramanyx.knowledge.brief_context import MAX_PART_ROWS, edition_part
from pramanyx.routers.investigations import AskRequest

CONN = "c0ffee00"
RANGE = "range:last_week:2026-10-19..2026-10-25"
KEY = f"{RANGE}@leadership"
SQL = "SELECT SUM(amount) AS value FROM sales WHERE sold_at >= '2026-10-19' AND sold_at < '2026-10-26'"
BY_TOP_SQL = "SELECT is_top, SUM(amount) FROM sales GROUP BY is_top"
DRILL_SQL = "SELECT platform, SUM(amount) FROM sales GROUP BY platform"


def _src(sid: str, kind: str, **over) -> dict:
    return {"id": sid, "label": sid.replace("_", " ").title(), "kind": kind, "columns": [], "rows": [], "sql": "",
            "status": "final", "facts": {}, "receipts": [], "caveats": [], "note": "", "error": "", "unit": "",
            "better": "up", **over}


EDITION = {
    "edition": True, "composed": True,
    "period": {"key": RANGE, "covers": "the week 2026-10-19 to 2026-10-25", "label": "Weekly",
               "start": "2026-10-19", "end": "2026-10-26", "compared_with": "the week before", "as_of": "2026-10-29",
               "lag_days": 3, "measured": [{"id": "sales", "label": "Sales", "metric": "net_sales", "sql": SQL}]},
    "reader": {"group_id": "leadership", "name": "Leadership"},
    "blocks": [
        {"id": "lead", "type": "lead",
         "text": "Sales were an ordinary {€167.0k|sales}, but top accounts spent {€9.4k more|by_top}."},
        {"id": "sales_fig", "type": "figure", "source": "sales", "text": "Within its usual range."},
        {"id": "where", "type": "compare", "source": "by_top", "title": "Where the week's sales came from",
         "label": "segment", "value": "this_range"},
        {"id": "stores", "type": "table", "source": "stores", "title": "By storefront"},
        # a drill a reader took on an edition kept before 2026-11-04: one reader's view, not a part of the edition
        {"id": "drill_sales_by_platform", "type": "compare", "source": "sales_by_platform", "kicker": "Drill",
         "by_code": True},
    ],
    "sources": {
        "sales": _src("sales", "check", label="Sales", columns=["start", "value", "this_range"], sql=SQL,
                      rows=[["2026-10-12", 158815, False], ["2026-10-19", 166988, True]], unit="EUR",
                      facts={"current": 166988, "previous": 158815, "usual_low": 150000, "usual_high": 170000}),
        "by_top": _src("by_top", "breakdown", label="Sales by top account", sql=BY_TOP_SQL,
                       columns=["segment", "this_range", "usual"], rows=[[True, 85349, 75932], [False, 81640, 85028]],
                       facts={"check": "sales", "by": "is_top", "within": {}}),
        "stores": _src("stores", "query", label="By storefront", sql="SELECT platform, SUM(amount) FROM sales",
                       columns=["platform", "amount"], rows=[[f"store {i}", i] for i in range(50)]),
        "sales_by_platform": _src("sales_by_platform", "drill", label="Sales by platform", sql=DRILL_SQL,
                                  columns=["segment", "this_range"], rows=[["App", 90000]],
                                  facts={"check": "sales", "by": "platform", "within": {}}),
        "visits_by_platform": _src("visits_by_platform", "drill", label="Visits by platform",
                                   facts={"check": "visits", "by": "platform", "within": {}}),
    },
}


@pytest.fixture
def kept(tmp_path, monkeypatch):
    """The Briefing cache on a temp file, holding the edition under the key the edition routes keep it under
    (`briefing.edition.cache_key`): ``<scope>#<range>@<reader>``."""
    path = tmp_path / "briefing_cache.json"
    monkeypatch.setattr("pramanyx.knowledge.briefing._CACHE_PATH", path)
    path.write_text(json.dumps({f"{CONN}#{KEY}": EDITION,
                                f"{CONN}#{RANGE}@finance": {"narrative": "a range Briefing kept before editions"}}))
    return path


# ── the focus: what the ask body takes ───────────────────────────────────────────────────────────────────────────────

def test_a_part_is_named_by_its_block_and_the_edition_it_is_on():
    asked = AskRequest(question="q", focus={"kind": "briefing", "id": "where", "period": KEY,
                                            "source": "sales_by_platform"})
    assert (asked.focus.id, asked.focus.period, asked.focus.source) == ("where", KEY, "sales_by_platform")
    with pytest.raises(ValueError, match="named by its block's id and the period"):
        AskRequest(question="q", focus={"kind": "briefing", "id": "where"})
    with pytest.raises(ValueError, match="named by its block's id and the period"):
        AskRequest(question="q", focus={"kind": "briefing", "period": KEY})


# ── the part, read from the kept edition ─────────────────────────────────────────────────────────────────────────────

def test_a_figure_carries_its_checks_own_sql_metric_and_period(kept):
    part = edition_part(CONN, KEY, "sales_fig")
    assert not part.refused
    assert part.what == "Sales"                                  # untitled: its source's own label, as the page draws it
    [src] = part.sources
    assert (src["id"], src["kind"], src["metric"], src["sql"]) == ("sales", "check", "net_sales", SQL)
    assert src["facts"]["current"] == 166988 and src["rows"][-1] == ["2026-10-19", 166988, True]
    prose = part.prose()
    assert prose.startswith("## On screen") and SQL in prose and "net_sales" in prose
    assert "2026-10-19 up to but not including 2026-10-26" in prose
    assert part.receipt(carried=True) == {
        "kind": "briefing", "said": "About “Sales” · the week 2026-10-19 to 2026-10-25", "block": "sales_fig",
        "type": "figure", "period": KEY, "start": "2026-10-19", "end": "2026-10-26",
        "sources": [{"id": "sales", "kind": "check", "metric": "net_sales"}], "carried": True}


def test_the_lead_carries_every_source_it_cites_and_a_breakdown_its_checks_metric(kept):
    part = edition_part(CONN, KEY, "lead")
    assert part.what == "Sales were an ordinary €167.0k, but top accounts spent €9.4k more."
    assert [s["id"] for s in part.sources] == ["sales", "by_top"]
    by_top = part.sources[1]
    assert (by_top["check"], by_top["metric"], by_top["sql"]) == ("sales", "net_sales", BY_TOP_SQL)
    assert part.block["text"] == part.what                       # the words as the reader reads them, no citation marks


def test_a_drilled_card_is_asked_about_as_it_is_drawn_now(kept):
    part = edition_part(CONN, KEY, "where", source="sales_by_platform")
    assert not part.refused
    assert part.what == "Sales by platform"
    assert [s["id"] for s in part.sources] == ["sales_by_platform", "by_top"]   # what it draws now leads
    assert part.sources[0]["sql"] == DRILL_SQL and part.sources[0]["metric"] == "net_sales"


def test_a_titled_chart_is_said_by_its_title_and_a_long_source_by_its_first_rows(kept):
    part = edition_part(CONN, KEY, "stores")
    assert part.what == "By storefront"
    [src] = part.sources
    assert len(src["rows"]) == MAX_PART_ROWS and src["rows_held"] == 50


@pytest.mark.parametrize("block, source, why", [
    ("gone", "", "does not hold the part you asked about (gone)"),
    # a drill's own block is one reader's view, never a part of the edition
    ("drill_sales_by_platform", "", "does not hold the part you asked about"),
    # a source the edition holds, which this part does not read
    ("where", "stores", "does not read the source stores"),
    # a drill of another check
    ("where", "visits_by_platform", "does not read the source visits_by_platform"),
    ("where", "nowhere", "does not read the source nowhere"),
])
def test_a_part_the_edition_does_not_hold_is_refused_in_a_sentence(kept, block, source, why):
    part = edition_part(CONN, KEY, block, source=source)
    assert why in part.refused and part.refused.endswith(".")
    assert not part.sources


@pytest.mark.parametrize("key, why", [
    (f"{RANGE}@product", "No Briefing is written for that range and reader"),
    (f"{RANGE}@finance", "No Briefing is written for that range and reader"),     # kept, but not an edition
    (RANGE, "named with the period and reader"),                                   # no reader: not an edition's key
    ("../briefing", "named with the period and reader"),                           # never joined into a cache key
])
def test_an_edition_that_is_not_there_holds_no_part(kept, key, why):
    assert why in edition_part(CONN, key, "sales_fig").refused


# ── through the /ask door ────────────────────────────────────────────────────────────────────────────────────────────

def _ask(monkeypatch, focus: dict, *, converse: bool = True) -> tuple[list[dict], dict]:
    """One `/ask` turn through the real `_stream_ask` and the real `_stream_converse`, with only the model's loop
    stood in for: the frames, and what the loop was HANDED as its context."""
    from pramanyx.routers import investigations as inv
    held: dict = {"routed": 0, "context": None, "quick": 0}
    route = SimpleNamespace(depth="quick", forced=None, mode="", shape="describe",
                            to_event=lambda: {"depth": "quick", "why": "asked quickly"})

    def _route(*a, **k):
        held["routed"] += 1
        return route
    monkeypatch.setattr("pramanyx.agent.ask_router.decide_ask_route", _route)
    monkeypatch.setattr(inv, "_converse_eligible", lambda req, r: converse)
    monkeypatch.setattr(inv, "_analyst_eligible", lambda req, r: False)
    monkeypatch.setattr(inv, "_overview_eligible", lambda req: False)
    monkeypatch.setattr(inv, "_insight_budget", lambda conn: None)
    monkeypatch.setattr(inv, "build_history_section", lambda h: "")
    monkeypatch.setattr(inv, "resolve_prior_answers", lambda *a, **k: [])
    monkeypatch.setattr(inv, "build_prior_answers_section", lambda a: "")
    monkeypatch.setattr("pramanyx.briefing.compose.sources.known_context", lambda *a, **k: "")
    monkeypatch.setattr("pramanyx.agent.converse_tools.ground_answer_numbers", lambda answer, rows, question="": (answer, None))

    async def metered(gen, budget=None):
        async for ev in gen:
            yield ev
    monkeypatch.setattr(inv, "_metered_stream", metered)

    def _loop(conn, q, *, extra_context=None, **k):
        held["context"] = extra_context or ""
        return SimpleNamespace(answer="An answer.", steps=[], stop_reason="answered", injected_chars=0,
                               reinjection_ratio=0.0)
    monkeypatch.setattr("pramanyx.agent.converse_tools.converse", _loop)

    async def quick(*a, **k):
        held["quick"] += 1
        yield inv._sse("headline", {"headline": "ok"})
    monkeypatch.setattr(inv, "_stream_chat", quick)

    req = AskRequest(question="why did this move?", connection_id=CONN, depth="quick", surface="briefing",
                     brief_period=KEY, focus=focus)

    async def run() -> list[str]:
        return [ev async for ev in inv._stream_ask(req, None, CONN)]
    frames = [json.loads(ev[6:]) for ev in asyncio.run(run()) if ev.startswith("data: ")]
    return frames, held


def test_the_turn_starts_from_the_parts_own_sql_metric_and_period(kept, monkeypatch):
    frames, held = _ask(monkeypatch, {"kind": "briefing", "id": "sales_fig", "period": KEY})
    route = next(f for f in frames if f["type"] == "route")
    assert route["subject"]["block"] == "sales_fig" and route["subject"]["period"] == KEY
    assert route["subject"]["sources"] == [{"id": "sales", "kind": "check", "metric": "net_sales"}]
    assert route["subject"]["carried"] is True
    context = held["context"]
    # the part, as the edition holds it: its check's own SQL, the metric it measures, the period it was read on
    assert "## On screen" in context and "About “Sales” · the week 2026-10-19 to 2026-10-25" in context
    assert SQL in context and "net_sales" in context and "2026-10-19 up to but not including 2026-10-26" in context
    # beside the edition it is on, read from the same kept entry
    assert "THE BRIEFING THE USER IS LOOKING AT" in context


def test_a_turn_the_quick_body_answers_says_it_did_not_read_the_part(kept, monkeypatch):
    frames, held = _ask(monkeypatch, {"kind": "briefing", "id": "sales_fig", "period": KEY}, converse=False)
    route = next(f for f in frames if f["type"] == "route")
    assert route["subject"]["carried"] is False and held["quick"] == 1 and held["context"] is None


def test_a_part_the_edition_does_not_hold_is_refused_before_anything_runs(kept, monkeypatch):
    frames, held = _ask(monkeypatch, {"kind": "briefing", "id": "gone", "period": KEY})
    assert [f["type"] for f in frames] == ["error"]
    assert frames[0]["reason"] == "not_held" and frames[0]["retryable"] is False
    assert "This Briefing does not hold the part you asked about (gone)" in frames[0]["message"]
    assert held == {"routed": 0, "context": None, "quick": 0}       # no route decided, no body run, nothing spent


# ── the context beside the question reads the edition the page drew (2026-11-09) ─────────────────────────────────────

def test_a_canvas_on_every_table_reads_the_datasets_own_edition_as_its_context(tmp_path, monkeypatch):
    """A Data Canvas on every table reads the dataset's own edition (the user's call, 2026-10-30), and its parts are
    read there. The context beside the question guessed ``canvas:<id>`` and told the model the Briefing "has not been
    built" beside the very edition on screen."""
    import duckdb

    from pramanyx.canvas.models import CanvasScope
    from pramanyx.canvas.store import create_canvas
    from pramanyx.db import registry
    from pramanyx.knowledge.brief_context import brief_block_for_scope
    from pramanyx.routers.investigations import _briefing_scope_key

    duckdb.connect(str(tmp_path / "w.duckdb")).close()
    conn = registry.add_connection("every-table", "duckdb", str(tmp_path / "w.duckdb"))
    try:
        canvas = create_canvas(name="all of it", scopes=[CanvasScope(connection_id=conn, schema_name=None, tables=[])])
        scope = _briefing_scope_key(conn, None, canvas.id)
        assert scope and not scope.startswith("canvas:"), scope          # the dataset's own scope
        period = "range:last_week:2026-10-26..2026-11-01"
        cache = tmp_path / "briefing_cache.json"
        monkeypatch.setattr("pramanyx.knowledge.briefing._CACHE_PATH", cache)
        cache.write_text(json.dumps({f"{scope}#{period}": {"narrative": "Sales held inside their usual range."}}))
        said = brief_block_for_scope(conn, None, canvas.id, period_key=period, scope_key=scope)
        assert "has not been built" not in said and "usual range" in said
        guessed = brief_block_for_scope(conn, None, canvas.id, period_key=period)     # the old reading
        assert "has not been built" in guessed
    finally:
        registry.delete_connection(conn)
