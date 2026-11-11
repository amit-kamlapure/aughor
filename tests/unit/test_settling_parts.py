"""BR-8 (ROADMAP §3.48) — each approved metric's parts, read day by day, and a range rebuilt from them.

The receipt the spec names, held here on a DuckDB table the compiled path also reads: a range summed from the daily
readings equals the figure `metric_time.run_measure` compiles for it, and one morning costs one grouped statement per
metric. Then what the readings are FOR: the range before, as it stood on a past day, read at the same age as a figure
still settling — and never for a reader whose rows are filtered.
"""
from __future__ import annotations

import contextlib
from datetime import date, timedelta
from types import SimpleNamespace

import duckdb
import pytest
import sqlglot

from aughor.briefing import ranges
from aughor.semantic import metric_time as mt
from aughor.semantic.metric_time import Window
from aughor.settling import parts as P
from aughor.settling import store

TODAY = date(2026, 11, 9)


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "_path", lambda: tmp_path / "settling.json")
    return tmp_path


@pytest.fixture
def con():
    """Rows dated over 2026: an amount by day of the month, a flag on every third row, a closing date on half, and a
    side table joined on a key."""
    c = duckdb.connect()
    c.execute("""CREATE TABLE items AS
        SELECT d::TIMESTAMP + INTERVAL 9 HOUR AS created_at,
               CAST(day(d) AS DOUBLE) * 10 + k AS amount,
               (k % 3 = 0) AS flagged,
               CASE WHEN k % 2 = 0 THEN d + INTERVAL 5 DAY END AS closed_at,
               k AS ref,
               'open' AS state
        FROM range(DATE '2026-01-01', DATE '2026-11-09', INTERVAL 1 DAY) t(d), range(0, 6) r(k)""")
    c.execute("CREATE TABLE side AS SELECT k AS ref, k * 1.5 AS weight FROM range(0, 6) r(k)")
    yield c
    c.close()


def _run(con):
    def run_sql(sql, max_rows=None):
        try:
            cur = con.execute(sql)
            return [d[0] for d in cur.description], [list(r) for r in cur.fetchall()], None
        except Exception as exc:  # noqa: BLE001
            return [], [], str(exc)
    return run_sql


def _metric(name, sql, *, kind="flow", outcome=None, tables=None, filters=None, time_column="items.created_at"):
    return SimpleNamespace(name=name, label=name, sql=sql, tables=tables or [], filters=filters or [],
                           time_column=time_column, time_kind=kind, outcome_column=outcome, until_column=None,
                           settles_after_days=None, connection="c1", status="approved", unit="", time_source="rule",
                           time_confirmed_by="")


METRICS = [
    _metric("total", "SELECT SUM(amount) FROM items"),
    _metric("share", "SELECT SUM(CASE WHEN flagged THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(*), 0) FROM items"),
    _metric("mean", "SELECT AVG(amount) FROM items WHERE state = 'open'"),
    _metric("pct", "SELECT 100.0 * COUNT(*) FILTER (WHERE flagged) / NULLIF(COUNT(*), 0) FROM items"),
    _metric("joined", "SELECT SUM(i.amount * s.weight) / NULLIF(SUM(i.amount), 0) FROM items i JOIN side s ON s.ref = i.ref"),
    _metric("rows", "COUNT(ref)", tables=["items"], filters=["state = 'open'"], time_column="created_at"),
    _metric("closed", "SELECT SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(*), 0) FROM items",
            kind="cohort", outcome="items.closed_at"),
]


def _compiled(m, start, end, con, as_of=None):
    rows, why = mt.run_measure(m, [Window("current", start, end, as_of=as_of)], lambda s: _run(con)(s), dialect="duckdb")
    assert why == "", why
    return rows[0]["value"]


# ── the receipt: a range summed from the days equals the compiled figure ─────────────────────────────────────────────

@pytest.mark.parametrize("m", METRICS, ids=lambda m: m.name)
def test_a_range_summed_from_the_daily_readings_equals_the_compiled_figure(m, con, home):
    got = P.read_metric("c1", m, _run(con), "duckdb", today=TODAY)
    assert got["kept"] and got["whole"] and got["statements"] == 1, got
    for start, end in ((date(2026, 10, 1), date(2026, 11, 1)), (date(2026, 11, 2), date(2026, 11, 9)),
                       (date(2026, 3, 17), date(2026, 3, 18)), (date(2026, 1, 1), date(2026, 11, 9))):
        value, why = P.range_value("c1", m, start, end, dialect="duckdb")
        compiled = _compiled(m, start, end, con, as_of=TODAY)
        assert why == "" and value is not None
        assert round(value) == round(compiled) and value == pytest.approx(compiled, rel=1e-12), (m.name, start)


def test_a_day_before_the_data_starts_reads_as_no_rows_not_as_missing(con, home):
    total = METRICS[0]
    P.read_metric("c1", total, _run(con), "duckdb", today=TODAY)
    assert P.range_value("c1", total, date(2025, 12, 1), date(2026, 1, 1), dialect="duckdb") == (None, "")
    assert P.range_value("c1", METRICS[5], date(2025, 12, 1), date(2026, 1, 1), dialect="duckdb")[1] == \
        "it has no daily readings yet"


# ── what is not kept, and why ────────────────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("sql, kind, why", [
    ("SELECT COUNT(DISTINCT ref) FROM items", "flow", "is not the sum of its days: one key can sit in two"),
    ("SELECT MEDIAN(amount) FROM items", "flow", "MEDIAN(…) is not a sum of its days"),
    ("WITH x AS (SELECT * FROM items) SELECT SUM(amount) FROM x", "flow", "through a CTE"),
    ("SELECT SUM(amount) FROM (SELECT * FROM items) t", "flow", "with a subquery"),
    ("SELECT SUM(amount) FROM items WHERE ref IN (SELECT ref FROM side)", "flow", "with a subquery"),
    ("SELECT SUM(amount) OVER () FROM items", "flow", "window function"),
    ("SELECT SUM(amount), COUNT(*) FROM items", "flow", "more than one value"),
    ("SELECT amount + SUM(amount) FROM items", "flow", "reads amount outside an aggregate"),
    ("SELECT SUM(amount) FROM items", "stock", "a level at a date is not a sum of days"),
])
def test_a_metric_whose_days_do_not_add_up_is_not_kept_and_says_why(sql, kind, why):
    m = _metric("m", sql, kind=kind)
    if kind == "stock":
        m.until_column = "items.closed_at"
    parts, said = P.decompose(m, "duckdb")
    assert parts is None and why in said, said


def test_an_average_is_kept_as_its_sum_and_its_count():
    parts, _ = P.decompose(_metric("mean", "SELECT AVG(amount)::DOUBLE FROM items"), "duckdb")
    assert parts.kinds == ("sum", "count")
    sql, _ = P.parts_sql(parts, date(2026, 11, 1), TODAY, as_of=TODAY)
    assert "SUM(amount) AS _p0" in sql and "COUNT(amount) AS _p1" in sql and "GROUP BY CAST(items.created_at AS DATE)" in sql


# ── an engine that divides whole numbers as whole numbers ────────────────────────────────────────────────────────────

def test_on_postgres_a_division_of_two_whole_numbers_is_rebuilt_as_postgres_divides_them():
    """`SUM(int) / COUNT(*)` is whole-number division on Postgres; the same parts with a numeric sum are not. The type
    of each sum is read beside it (pg_typeof), never guessed from how its value prints."""
    m = _metric("ratio", "SELECT SUM(qty) / NULLIF(COUNT(*), 0) FROM items")
    parts, why = P.decompose(m, "postgres")
    assert why == "" and parts.typed
    sql, _ = P.parts_sql(parts, date(2026, 11, 1), TODAY, as_of=TODAY)
    assert "CAST(PG_TYPEOF(SUM(qty)) AS TEXT) AS _t0" in sql
    assert P.rebuild(parts, [7, 2], [True, True]) == (3.0, "")          # bigint / bigint
    assert P.rebuild(parts, [-7, 2], [True, True]) == (-3.0, "")        # toward zero, as Postgres does
    assert P.rebuild(parts, [7.0, 2], [False, True]) == (3.5, "")       # numeric / bigint
    assert P.rebuild(parts, [7, 2], [None, True])[0] is None            # a type not read is not guessed


def test_an_engine_that_cannot_name_a_sums_type_does_not_keep_a_division_it_might_do_in_whole_numbers():
    parts, why = P.decompose(_metric("ratio", "SELECT SUM(qty) / NULLIF(COUNT(*), 0) FROM items"), "tsql")
    assert parts is None and "the type of its sums cannot be read" in why
    parts, why = P.decompose(_metric("ratio", "SELECT SUM(qty) * 1.0 / NULLIF(COUNT(*), 0) FROM items"), "bigquery")
    assert why == "" and not parts.typed


# ── the morning: one statement per metric ────────────────────────────────────────────────────────────────────────────

def test_a_morning_costs_one_grouped_statement_per_metric_and_the_whole_table_only_once(con, home, monkeypatch):
    statements: list[tuple[str, object]] = []

    def counting(sql, max_rows=None):
        statements.append((sql, max_rows))
        return _run(con)(sql, max_rows)

    @contextlib.contextmanager
    def runner():
        yield counting, "duckdb"

    kept = [m for m in METRICS if P.decompose(m, "duckdb")[0] is not None]
    monkeypatch.setattr(P, "definitions", lambda cid: METRICS + [_metric("keys", "SELECT COUNT(DISTINCT ref) FROM items")])
    first = P.read_connection("c1", today=TODAY, runner=runner)
    assert first["statements"] == len(kept) == len(statements) == 7
    assert all(" >= CAST('1900-01-01' AS DATE)" in s for s, _ in statements)          # the backfill: every day
    [refused] = [x for x in first["metrics"] if not x["kept"]]
    assert refused["metric"] == "keys" and refused["statements"] == 0
    statements.clear()
    second = P.read_connection("c1", today=TODAY + timedelta(days=1), runner=runner)
    assert second["statements"] == len(statements) == 7
    assert all(" >= CAST('2026-10-27' AS DATE)" in s and max_rows is None for s, max_rows in statements)
    # a changed definition is another series: read whole again, once — and the readings of the one it replaced, which
    # say nothing of it, go that morning (the other metrics went from the catalogue too, and so did theirs)
    changed = _metric("total", "SELECT SUM(amount) FROM items WHERE ref > 0")
    monkeypatch.setattr(P, "definitions", lambda cid: [changed])
    statements.clear()
    third = P.read_connection("c1", today=TODAY + timedelta(days=2), runner=runner)
    assert third["statements"] == 1 and "1900-01-01" in statements[0][0]
    assert third["swept"] == len(kept)
    assert [e["fingerprint"] for _k, e in store.parts_series("c1")] == [P.fingerprint(changed, "duckdb")]


def test_a_live_source_is_never_read_into_stored_readings(monkeypatch):
    monkeypatch.setattr(P, "candidates", lambda cid: (_ for _ in ()).throw(AssertionError("read a live source")))
    assert P.read_connection("sheets", today=TODAY)["statements"] == 0


def test_the_daily_reading_reads_the_parts_of_a_connection_with_no_time_table(monkeypatch):
    from datetime import datetime, timezone

    from aughor.settling import sampler
    seen: list[str] = []
    monkeypatch.setattr(sampler, "_last_sample_day", "")
    monkeypatch.setattr("aughor.db.registry.list_connections", lambda: [{"id": "c1"}])
    monkeypatch.setattr(sampler, "time_tables", lambda cid: [])
    monkeypatch.setattr(P, "read_connection", lambda cid, today=None: seen.append(cid) or {"metrics": [], "statements": 0})
    sampler.run_settling_samples_daily(now=datetime(2026, 11, 9, 9, 0, tzinfo=timezone.utc))
    assert seen == ["c1"]


# ── as it was known ──────────────────────────────────────────────────────────────────────────────────────────────────

def _readings(home, values_on: dict[date, dict[date, float]]):
    """File a metric's readings as given: {taken on: {day: total}} — one sum part."""
    for taken, days in sorted(values_on.items()):
        store.record_parts("c1", "total", fingerprint=P.fingerprint(METRICS[0], "duckdb"), kinds=["sum"], types=[""],
                           measured_on=taken, days={d.isoformat(): [v] for d, v in days.items()}, whole=False)


def test_a_day_is_read_as_it_stood_on_a_past_day_and_a_missing_reading_is_said(home):
    d1, d2 = date(2026, 11, 1), date(2026, 11, 2)
    _readings(home, {date(2026, 11, 3): {d1: 10.0, d2: 4.0},          # young: d2 still arriving
                     date(2026, 11, 8): {d1: 12.0, d2: 9.0}})         # settled later
    total = METRICS[0]
    assert P.range_value("c1", total, d1, d2 + timedelta(days=1), dialect="duckdb", as_of=date(2026, 11, 3)) == (14.0, "")
    assert P.range_value("c1", total, d1, d2 + timedelta(days=1), dialect="duckdb") == (21.0, "")
    # no reading was taken on 5 November, and with no learned lag a reading from the 3rd does not stand for it
    value, why = P.range_value("c1", total, d1, d2 + timedelta(days=1), dialect="duckdb", as_of=date(2026, 11, 5))
    assert value is None and why == "no reading of 2026-11-01 stands for 2026-11-05"
    # with a learned lag of 2 days, the 3rd's reading of the 1st (2 days old, settled) stands; of the 2nd it does not
    value, why = P.range_value("c1", total, d1, d1 + timedelta(days=1), dialect="duckdb", as_of=date(2026, 11, 5),
                               settled_after=2)
    assert value == 10.0
    assert P.range_value("c1", total, d2, d2 + timedelta(days=1), dialect="duckdb", as_of=date(2026, 11, 5),
                         settled_after=2)[0] is None


def test_a_reader_whose_rows_are_filtered_never_reads_stored_parts(home, monkeypatch):
    _readings(home, {date(2026, 11, 3): {date(2026, 11, 1): 10.0}})
    monkeypatch.setattr("aughor.db.connection.result_cache_tenancy", lambda: "rp:someone")
    value, why = P.range_value("c1", METRICS[0], date(2026, 11, 1), date(2026, 11, 2), dialect="duckdb")
    assert value is None and "read when asked" in why
    monkeypatch.setattr("aughor.db.connection.result_cache_tenancy", lambda: (_ for _ in ()).throw(RuntimeError()))
    assert P.range_value("c1", METRICS[0], date(2026, 11, 1), date(2026, 11, 2), dialect="duckdb")[0] is None


# ── the reader: a figure still settling, compared at the same age ────────────────────────────────────────────────────

def _young_spec():
    """1–8 November read on 9 November with a learned lag of 3 days: its last days are provisional; 24–31 October,
    the eight days before, is read as it stood on 1 November — its last day then as old as 8 November is now."""
    spec, _ = ranges.resolve_range(start=date(2026, 11, 1), end=date(2026, 11, 8), today=TODAY, lag_days=3,
                                   lag_source="learned")
    return spec


def _row(con, spec):
    m = METRICS[0]
    got = {r["window"]: r for r in mt.run_measure(m, spec.windows(), _run(con), dialect="duckdb")[0]}
    m = SimpleNamespace(**{**vars(m), "time_source": "rule"})
    return ranges._figure_row(m, "Total", spec, got, dialect="duckdb", line_of=lambda _m: None)


def test_a_figure_still_settling_is_compared_with_the_range_before_as_it_stood_at_its_age(con, home):
    spec = _young_spec()
    prev = spec.windows()[1]
    assert (prev.start, prev.end, prev.as_of) == (date(2026, 10, 24), date(2026, 11, 1), date(2026, 11, 1))
    bare = _row(con, spec)
    assert bare["status"] == "provisional" and bare["equal_age"]["equal"] is False
    assert "does not keep yet" in bare["equal_age"]["why"] and "previous" not in bare["equal_age"]

    # the morning of 1 November read those days; they were lower then than they read now
    _readings(home, {date(2026, 11, 1): {date(2026, 10, 24) + timedelta(days=i): 1000.0 for i in range(8)}})
    row = _row(con, spec)
    age = row["equal_age"]
    assert age["equal"] is False and age["previous"]["as_of"] == "2026-11-01"
    assert row["previous"] == 8000.0 and age["previous"]["value_now"] == bare["previous"]
    assert row["rel"] == pytest.approx(row["current"] / 8000.0 - 1)
    assert "compared as it stood on 2026-11-01, at the same age" in age["why"]
    block = {**ranges.range_block(spec), "measured": [row]}
    line = ranges.metric_line(row, block, None)
    assert "as it stood on 2026-11-01" in line and "not read as a move" not in line and "a year earlier" not in line
    assert ranges.range_findings([row], block, None), "a move at the same age is a candidate"
    # its usual range and a year earlier are still not read against it; a send that reads only the range before did read it
    assert ranges.not_read_rows([row], "name")
    assert ranges.not_read_rows([row], "name", against_usual=False) == []
    assert not any(s == "not_read" for s, _ in ranges.sheet_lines({"period": block}))


def test_without_the_days_reading_the_caveat_stands(con, home):
    spec = _young_spec()
    _readings(home, {date(2026, 11, 1): {date(2026, 10, 25) + timedelta(days=i): 1000.0 for i in range(7)}})  # the 24th unread
    row = _row(con, spec)
    assert "previous" not in row["equal_age"] and "does not keep yet" in row["equal_age"]["why"]
    assert "not read as a move" in ranges.metric_line(row, {**ranges.range_block(spec), "measured": [row]}, None)


def test_a_restricted_reader_reads_the_caveat_not_the_stored_parts(con, home, monkeypatch):
    spec = _young_spec()
    _readings(home, {date(2026, 11, 1): {date(2026, 10, 24) + timedelta(days=i): 1000.0 for i in range(8)}})
    monkeypatch.setattr("aughor.db.connection.result_cache_tenancy", lambda: "rp:restricted")
    row = _row(con, spec)
    assert "previous" not in row["equal_age"] and row["previous"] != 8000.0


def test_a_figure_on_a_table_still_moving_is_not_answered_by_the_readings(con, home):
    spec, _ = ranges.resolve_range(start=date(2026, 11, 1), end=date(2026, 11, 8), today=TODAY, lag_days=15,
                                   lag_source="beyond_horizon", still_moving=("items",))
    _readings(home, {date(2026, 11, 1): {date(2026, 10, 24) + timedelta(days=i): 1000.0 for i in range(8)}})
    row = _row(con, spec)
    assert "previous" not in row["equal_age"] and "has not seen stop changing" in row["equal_age"]["why"]
    assert row["previous"] != 8000.0, "a table still moving is compared as it reads today, and says so"


def test_readings_of_an_earlier_definition_are_not_read_as_this_ones(con, home):
    P.read_metric("c1", METRICS[0], _run(con), "duckdb", today=TODAY)
    edited = _metric("total", "SELECT SUM(amount) FROM items WHERE ref > 0")
    value, why = P.range_value("c1", edited, date(2026, 11, 1), date(2026, 11, 8), dialect="duckdb")
    assert value is None and why == "its daily readings are of an earlier definition"


def test_the_send_re_reads_the_range_before_from_the_readings(con, home, monkeypatch):
    """Law 1: a line stating the comparison at the same age departs on that value read again, not the one written."""
    spec = _young_spec()
    _readings(home, {date(2026, 11, 1): {date(2026, 10, 24) + timedelta(days=i): 1000.0 for i in range(8)}})
    row = _row(con, spec)
    monkeypatch.setattr("aughor.semantic.metrics.list_metrics", lambda connection_id=None, **kw: [METRICS[0]])

    @contextlib.contextmanager
    def runner():
        yield (lambda sql: _run(con)(sql)), "duckdb"
    got = ranges.fresh_measurement("c1", {"period": {"measured": [row], "label": "Custom range"}}, runner=runner)
    assert 8000.0 in got.values and pytest.approx(row["current"] - 8000.0) in got.values


def test_the_store_lists_a_metrics_readings_at_its_door(con, home):
    P.read_metric("c1", METRICS[1], _run(con), "duckdb", today=TODAY)
    [row] = store.parts_summary("c1")
    assert row["metric"] == "share" and row["parts"] == ["sum", "count"] and row["backfilled_on"] == "2026-11-09"
    assert "share" not in store.tables("c1")


def test_every_part_template_is_the_statements_own_arithmetic():
    parts, _ = P.decompose(METRICS[4], "duckdb")
    assert parts.template.sql(dialect="duckdb") == "_p0 / NULLIF(_p1, 0)"
    assert sqlglot.parse_one(parts.statement).sql() == sqlglot.parse_one(METRICS[4].sql).sql()
