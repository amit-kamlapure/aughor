"""BR-8, the rest (ROADMAP §3.48; punch list 42) — the daily readings kept a year, one series per definition, read as
each range stood at a figure's own age, and gone with their definition.

* One series per DEFINITION: the first slice keyed a series by name, so two definitions of one name (one per dataset,
  or per grain) overwrote each other and each morning read the other's whole table again.
* A settled day is filed once: a morning that finds a day unchanged keeps the morning, not another reading, so a year
  of readings fits — and a reading still stands for every morning that read the day since.
* The usual range and a year earlier at equal age: an edition's figure still settling is read against every range
  before as it stood then; when they are all known it is at equal age throughout and its distance from usual is read,
  a year earlier left out (and said) until a year of readings exists.
* A deleted definition takes its readings; another definition of the same name keeps its own.
"""
from __future__ import annotations

import contextlib
from datetime import date, timedelta
from types import SimpleNamespace

import duckdb
import pytest

from pramanyx.briefing import edition as E
from pramanyx.briefing import guide as G
from pramanyx.briefing import ranges
from pramanyx.briefing.compose import sources as S
from pramanyx.semantic import metric_time as mt
from pramanyx.semantic.metric_time import Window
from pramanyx.settling import parts as P
from pramanyx.settling import store

TODAY = date(2026, 11, 10)          # a Tuesday: last week is 2–8 November, read on its second day


@pytest.fixture
def home(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "_path", lambda: tmp_path / "settling.json")
    return tmp_path


@pytest.fixture
def con():
    """One row a day from 1 September 2025: 100, plus 10 for every week of the year past a multiple of three."""
    c = duckdb.connect()
    c.execute("""CREATE TABLE items AS
        SELECT d::TIMESTAMP + INTERVAL 9 HOUR AS created_at,
               100.0 + (EXTRACT(week FROM d) % 3) * 10 AS amount,
               (day(d) % 2 = 0) AS flagged
        FROM range(DATE '2025-09-01', DATE '2026-11-10', INTERVAL 1 DAY) t(d)""")
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


def _metric(name="total", sql="SELECT SUM(amount) FROM items", *, schema="s1", status="approved"):
    return SimpleNamespace(name=name, label=name, sql=sql, tables=[], filters=[], time_column="items.created_at",
                           time_kind="flow", outcome_column=None, until_column=None, settles_after_days=None,
                           connection="c1", status=status, unit="", time_source="rule", time_confirmed_by="",
                           schema_name=schema)


TOTAL = _metric()
FP = P.fingerprint(TOTAL, "duckdb")


def _file(taken: date, days: dict[date, float], *, fp: str = FP, name: str = "total") -> None:
    store.record_parts("c1", name, fingerprint=fp, kinds=["sum"], types=[""], measured_on=taken,
                       days={d.isoformat(): [v] for d, v in days.items()}, whole=False, dialect="duckdb")


def _settling_mornings(con, first: date, last: date, *, skip: tuple = (), young: int = 2) -> None:
    """Every morning from ``first`` to ``last``, each reading its 14 recent days as a source still settling would
    answer: a day ``young`` days old or younger at half its final value, older days final (the table's value)."""
    final = {r[0]: float(r[1]) for r in con.execute(
        "SELECT CAST(created_at AS DATE), SUM(amount) FROM items GROUP BY 1").fetchall()}
    s = first
    while s <= last:
        if s not in skip:
            _file(s, {s - timedelta(days=a): final.get(s - timedelta(days=a), 0.0) * (0.5 if a <= young else 1.0)
                      for a in range(1, P.HORIZON_DAYS + 1)})
        s += timedelta(days=1)


# ── one series per definition ────────────────────────────────────────────────────────────────────────────────────────

def test_two_definitions_of_one_name_keep_two_series_and_neither_reads_the_whole_table_again(con, home, monkeypatch):
    """The first slice's key was ``connection#name``: the second definition replaced the first's series, and the next
    morning each found the other's fingerprint and read its whole table again — every morning, on a billed warehouse."""
    a = _metric(schema="s1")
    b = _metric(sql="SELECT SUM(amount) FROM items WHERE flagged", schema="s2")
    monkeypatch.setattr(P, "definitions", lambda cid: [a, b])
    statements: list[str] = []

    @contextlib.contextmanager
    def runner():
        yield (lambda sql, max_rows=None: statements.append(sql) or _run(con)(sql, max_rows)), "duckdb"

    first = P.read_connection("c1", today=TODAY, runner=runner)
    assert first["statements"] == 2 and all("1900-01-01" in s for s in statements)
    statements.clear()
    second = P.read_connection("c1", today=TODAY + timedelta(days=1), runner=runner)
    assert second["statements"] == 2 and not any("1900-01-01" in s for s in statements), "a backfill read again"
    for m in (a, b):
        got, why = P.range_value("c1", m, date(2026, 10, 1), date(2026, 11, 1), dialect="duckdb")
        rows, _ = mt.run_measure(m, [Window("current", date(2026, 10, 1), date(2026, 11, 1))], _run(con), dialect="duckdb")
        assert why == "" and got == pytest.approx(rows[0]["value"], rel=1e-12)
    assert len(store.parts_series("c1", "total")) == 2


# ── a settled day is filed once ──────────────────────────────────────────────────────────────────────────────────────

def test_a_day_found_unchanged_is_not_filed_again_and_its_reading_stands_for_each_morning_that_read_it(home):
    d = date(2026, 10, 30)
    for taken in (date(2026, 10, 31), date(2026, 11, 1), date(2026, 11, 2), date(2026, 11, 4)):   # no morning on the 3rd
        _file(taken, {d: 10.0})
    entry = store.parts_entry("c1", "total", FP)
    assert [r for r in store.readings_of(entry) if r[0] == d.isoformat()] == [("2026-10-30", "2026-10-31", [10.0])]
    one = (d, d + timedelta(days=1))
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, 2)) == (10.0, "")
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, 4)) == (10.0, "")
    # no morning on the 3rd: nothing stands for it, and with no learned lag that is said, never filled
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, 3)) == \
        (None, "no reading of 2026-10-30 stands for 2026-11-03")


def test_a_day_that_moves_is_filed_at_each_move_and_read_as_it_stood(home):
    d = date(2026, 10, 30)
    _file(date(2026, 10, 31), {d: 5.0})
    _file(date(2026, 11, 1), {d: 8.0})
    _file(date(2026, 11, 2), {d: 8.0})
    _file(date(2026, 11, 3), {d: 5.0})                                   # a source that restates back down
    kept = [r for r in store.readings_of(store.parts_entry("c1", "total", FP)) if r[0] == d.isoformat()]
    assert [(t, v) for _d, t, v in kept] == [("2026-10-31", [5.0]), ("2026-11-01", [8.0]), ("2026-11-03", [5.0])]
    one = (d, d + timedelta(days=1))
    assert [P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, k))[0] for k in (1, 2, 3)] == \
        [8.0, 8.0, 5.0]
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 10, 31))[0] == 5.0


def test_a_day_past_the_mornings_horizon_stands_only_once_it_had_settled(home):
    d = date(2026, 10, 1)
    _file(date(2026, 10, 3), {d: 7.0})                       # read at 2 days old
    _file(date(2026, 11, 1), {date(2026, 10, 31): 1.0})      # a morning a month on: the 1st is no longer among its days
    one = (d, d + timedelta(days=1))
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, 1))[0] is None
    assert P.range_value("c1", TOTAL, *one, dialect="duckdb", as_of=date(2026, 11, 1), settled_after=2)[0] == 7.0


def test_readings_are_kept_a_year_and_its_age_then_dropped(home):
    old, kept_day = date(2025, 10, 1), date(2025, 10, 20)
    _file(old + timedelta(days=1), {old: 1.0})
    _file(kept_day + timedelta(days=1), {kept_day: 2.0})
    _file(TODAY, {TODAY - timedelta(days=1): 3.0})
    days = {r[0] for r in store.readings_of(store.parts_entry("c1", "total", FP))}
    assert old.isoformat() not in days, f"taken more than {store.KEEP_PARTS_DAYS} days ago"
    assert kept_day.isoformat() in days
    assert P.range_value("c1", TOTAL, kept_day, kept_day + timedelta(days=1), dialect="duckdb",
                         as_of=kept_day + timedelta(days=1)) == (2.0, "")


def test_a_first_slice_series_is_read_and_re_filed_without_a_second_whole_table_read(con, home, monkeypatch):
    """The live install's 29 series were filed under ``connection#name`` with every day each morning; a whole-table
    read again would bill theLook six more times."""
    legacy = {"metric": "total", "fingerprint": FP, "kinds": ["sum"], "types": [""], "last_measured_on": "2026-11-09",
              "backfill": {"measured_on": "2026-11-09", "days": {"2026-11-01": [42.0]}},
              "readings": [{"day": "2026-11-08", "measured_on": "2026-11-09", "values": [9.0]}]}
    store._store().put("c1#total", legacy)
    assert P.range_value("c1", TOTAL, date(2026, 11, 1), date(2026, 11, 2), dialect="duckdb") == (42.0, "")
    assert P.range_value("c1", TOTAL, date(2026, 11, 8), date(2026, 11, 9), dialect="duckdb",
                         as_of=date(2026, 11, 9)) == (9.0, "")
    statements: list[str] = []
    got = P.read_metric("c1", TOTAL, lambda sql, max_rows=None: statements.append(sql) or _run(con)(sql, max_rows),
                        "duckdb", today=TODAY)
    assert got["kept"] and not got["whole"] and not any("1900-01-01" in s for s in statements)
    assert store._store().get("c1#total") is None
    assert P.range_value("c1", TOTAL, date(2026, 11, 1), date(2026, 11, 2), dialect="duckdb",
                         as_of=date(2026, 11, 9)) == (42.0, ""), "the backfill came across"


# ── the usual range and a year earlier, at equal age ─────────────────────────────────────────────────────────────────

def _week():
    """2–8 November read on the 10th with a learned lag of 3 days: its last two days are still settling. Its usual
    range is the six seven-day ranges before it (a custom range's default), each read a day after it ended."""
    spec, why = ranges.resolve_range(start=date(2026, 11, 2), end=date(2026, 11, 8), today=TODAY, lag_days=3,
                                     lag_source="learned")
    assert spec is not None and (spec.start, spec.end) == (date(2026, 11, 2), date(2026, 11, 9)), why
    return spec


USUAL_N = G.NewsRule().usual_custom


CHECK = G.Check(id="total", label="Total", metric="total")


def _figure(con, spec):
    fig, why = E.measure_check(CHECK, TOTAL, spec, guide=G.BriefingGuide(), published=False, run_sql=_run(con),
                               dialect="duckdb", currency="")
    assert fig, why
    return fig


def test_an_edition_figure_still_settling_is_read_against_every_range_before_as_it_stood(con, home):
    spec = _week()
    bare = _figure(con, spec)
    assert bare["status"] == "provisional" and bare["equal_age"]["equal"] is False and bare["z"] is None
    _settling_mornings(con, date(2026, 8, 20), TODAY)
    fig = _figure(con, spec)
    age = fig["equal_age"]
    assert age["equal"] is True and set(age.get("usual") or {}) == {f"u{i}" for i in range(1, USUAL_N + 1)}
    # each range before is the value the mornings read when it was as old as this week is now: its last two days half
    for p in fig["series"][:-1]:
        known = age["usual"][p["label"]]
        assert p["value"] == known["value"] and p["as_of"] == known["as_of"]
        start = date.fromisoformat(p["start"])
        assert known["as_of"] == (start + timedelta(days=8)).isoformat()
        assert p["value"] == pytest.approx(P.range_value("c1", TOTAL, start, start + timedelta(days=7), dialect="duckdb",
                                                         as_of=start + timedelta(days=8), settled_after=3)[0])
        assert p["value"] < bare["series"][fig["series"].index(p)]["value"], "today's reading of it has settled"
    assert fig["previous"] == (age.get("previous") or {}).get("value") == fig["series"][-2]["value"]
    assert fig["usual"]["n"] == USUAL_N and fig["z"] is not None, "at equal age, its distance from usual is read"
    # a year earlier: no reading was taken then, so it is left out of a figure at equal age, and said
    assert fig["last_year"] is None and fig["rel_last_year"] is None and "a year earlier is left out" in age["last_year_withheld"]
    src = S.from_check(fig, period_word="week")
    assert src.facts.get("at_equal_age") is None and src.facts["at_age_by_readings"]
    assert "read as they stood at the same age" in src.note and "a year earlier is left out" in src.note
    # its segments were not read that way: a breakdown of it inherits that, and is gated
    assert "its segments are not kept that way" in S.age_caveat(src)


def test_with_one_range_before_unread_at_its_age_the_caveat_stands_and_the_range_before_is_still_fair(con, home):
    spec = _week()
    u3 = E.usual_windows(spec, USUAL_N)[2]
    _settling_mornings(con, date(2026, 8, 20), TODAY, skip=(u3.as_of,))
    fig = _figure(con, spec)
    age = fig["equal_age"]
    assert age["equal"] is False and "usual" not in age and fig["z"] is None
    assert (age.get("previous") or {}).get("as_of") == "2026-11-03"          # 26 October–1 November, a day after
    assert fig["previous"] == age["previous"]["value"]
    assert "compared as it stood on 2026-11-03, at the same age" in age["why"]
    assert S.from_check(fig).facts["at_equal_age"] is False


def test_a_year_earlier_is_read_at_equal_age_once_a_year_of_readings_is_kept(con, home):
    spec = _week()
    ly = spec.windows()[2]
    _settling_mornings(con, ly.start - timedelta(days=1), ly.as_of)          # the mornings a year ago
    _settling_mornings(con, date(2026, 8, 20), TODAY)
    fig = _figure(con, spec)
    age = fig["equal_age"]
    assert age["equal"] is True and (age.get("last_year") or {}).get("as_of") == ly.as_of.isoformat()
    assert fig["last_year"] == age["last_year"]["value"] < age["last_year"]["value_now"]
    assert fig["rel_last_year"] == pytest.approx(fig["current"] / fig["last_year"] - 1)
    assert "last_year_withheld" not in age


def test_a_range_briefing_figure_compares_a_year_earlier_at_its_age_too(con, home):
    spec = _week()
    ly = spec.windows()[2]
    _settling_mornings(con, ly.start - timedelta(days=1), ly.as_of)
    _settling_mornings(con, spec.previous_start - timedelta(days=1), TODAY)
    got = {r["window"]: r for r in mt.run_measure(TOTAL, spec.windows(), _run(con), dialect="duckdb")[0]}
    row = ranges._figure_row(TOTAL, "Total", spec, got, dialect="duckdb", line_of=lambda _m: None)
    age = row["equal_age"]
    assert age["equal"] is False and age.get("previous")
    assert (age.get("last_year") or {}).get("as_of") == ly.as_of.isoformat()
    assert "The range before and a year earlier are compared as they stood on" in age["why"]
    line = ranges.metric_line(row, {**ranges.range_block(spec), "measured": [row]}, None)
    assert f"as it stood on {ly.as_of.isoformat()}" in line and "a year earlier" in line


def test_the_send_re_reads_every_range_read_at_its_age(con, home, monkeypatch):
    """Law 1: the edition's usual range read at equal age departs on those ranges read again, and the band they make."""
    spec = _week()
    _settling_mornings(con, date(2026, 8, 20), TODAY)
    fig = _figure(con, spec)
    monkeypatch.setattr("pramanyx.semantic.metrics.list_metrics", lambda connection_id=None, **kw: [TOTAL])
    got = ranges._at_age_again("c1", [fig], dialect="duckdb", current_of={fig["sql"]: fig["current"]})
    assert fig["equal_age"].get("usual"), "read at equal age"
    for known in fig["equal_age"]["usual"].values():
        assert pytest.approx(known["value"]) in got
    assert pytest.approx(fig["usual"]["mean"]) in got and pytest.approx(fig["usual"]["high"]) in got
    assert pytest.approx(fig["current"] - fig["previous"]) in got


# ── a definition that is gone takes its readings ─────────────────────────────────────────────────────────────────────

def test_a_morning_sweeps_the_readings_of_a_definition_that_no_longer_exists_and_keeps_a_retired_ones(home, monkeypatch):
    gone, retired = _metric(name="gone"), _metric(name="retired", status="deprecated")
    for m in (gone, retired, TOTAL):
        _file(TODAY, {TODAY - timedelta(days=1): 1.0}, fp=P.fingerprint(m, "duckdb"), name=m.name)
    monkeypatch.setattr(P, "definitions", lambda cid: [retired, TOTAL])
    assert P.sweep("c1") == 1
    assert sorted(e["metric"] for _k, e in store.parts_series("c1")) == ["retired", "total"]
    # a catalogue that cannot be read removes nothing
    monkeypatch.setattr(P, "definitions", lambda cid: (_ for _ in ()).throw(RuntimeError("unreadable")))
    assert P.sweep("c1") == 0 and len(store.parts_series("c1")) == 2


def test_deleting_a_definition_takes_its_readings_and_leaves_another_datasets_definition_of_the_name(home):
    from pramanyx.semantic.metrics import MetricDefinition, delete_metric, list_metrics, save_metric

    one = MetricDefinition(name="rev_br8", label="Revenue", connection="c1", schema_name="s1", sql="SELECT SUM(amount) FROM items",
                           time_column="items.created_at", time_kind="flow")
    two = MetricDefinition(name="rev_br8", label="Revenue", connection="c1", schema_name="s2",
                           sql="SELECT SUM(amount) FROM items WHERE flagged", time_column="items.created_at",
                           time_kind="flow")
    save_metric(one)
    save_metric(two)
    assert len([m for m in list_metrics(connection_id="c1") if m.name == "rev_br8"]) == 2
    for m in (one, two):
        _file(TODAY, {TODAY - timedelta(days=1): 1.0}, fp=P.fingerprint(m, "duckdb"), name="rev_br8")
    store._store().put("c9#rev_br8#" + P.fingerprint(one, "duckdb"), {"metric": "rev_br8", "dialect": "duckdb",
                                                                      "fingerprint": P.fingerprint(one, "duckdb")})
    assert delete_metric("rev_br8", connection_id="c1", schema_name="s1")
    left = store.parts_series("c1", "rev_br8")
    assert [e["fingerprint"] for _k, e in left] == [P.fingerprint(two, "duckdb")]
    assert store.parts_series("c9", "rev_br8"), "another connection's series of the name is not this delete's"
    assert delete_metric("rev_br8", connection_id="c1", schema_name="s2")
    assert store.parts_series("c1", "rev_br8") == []


def test_a_first_slice_series_whose_definition_was_deleted_is_swept_without_knowing_its_engine(home, monkeypatch):
    store._store().put("c1#total", {"metric": "total", "fingerprint": P.fingerprint(TOTAL, "postgres"), "kinds": ["sum"]})
    monkeypatch.setattr(P, "definitions", lambda cid: [TOTAL])
    assert P.sweep("c1") == 0, "its definition is alive under the engine it was read in"
    monkeypatch.setattr(P, "definitions", lambda cid: [])
    assert P.sweep("c1") == 1 and store.parts_series("c1") == []


def test_the_door_counts_each_definitions_series(home):
    _file(TODAY - timedelta(days=1), {TODAY - timedelta(days=2): 1.0})
    _file(TODAY, {TODAY - timedelta(days=2): 1.0})                         # unchanged: a morning, not a reading
    [row] = store.parts_summary("c1")
    assert row["metric"] == "total" and row["fingerprint"] == FP and row["readings"] == 2 and row["kept"] == 1
    assert "total" not in store.tables("c1") and store.parts_metrics("c1") == ["total"]


def test_a_cohorts_reading_stands_past_its_day_only_once_its_outcomes_have_arrived(home):
    """LuxExperience's net revenue is a cohort whose refunds arrive for 28 days, past the 14 a morning re-reads: a
    reading at the connection's row lag stood for October days still gaining refunds — 1.3% high a day on (2026-11-09)."""
    cohort = SimpleNamespace(**{**vars(TOTAL), "time_kind": "cohort", "outcome_column": "items.closed_at",
                                "sql": "SELECT SUM(CASE WHEN closed_at IS NOT NULL THEN 1 ELSE 0 END) * 1.0 / "
                                       "NULLIF(COUNT(*), 0) FROM items", "settles_after_days": None})
    parts, why = P.decompose(cohort, "duckdb")
    assert parts is not None, why
    d = date(2026, 10, 1)
    store.record_parts("c1", "total", fingerprint=parts.fingerprint, kinds=list(parts.kinds), types=["", ""],
                       measured_on=date(2026, 10, 6), days={d.isoformat(): [3, 10]}, whole=False, dialect="duckdb")
    one = dict(start=d, end=d + timedelta(days=1), dialect="duckdb", as_of=date(2026, 11, 1))
    plain = SimpleNamespace(**{**vars(cohort), "time_kind": "flow"})
    assert P.range_value("c1", cohort, **one, settled_after=3) == (None, "no reading of 2026-10-01 stands for 2026-11-01")
    mature = SimpleNamespace(**{**vars(cohort), "settles_after_days": 5})
    assert P.range_value("c1", mature, **one, settled_after=3)[0] == pytest.approx(0.3)      # read at 5 days: mature
    late = SimpleNamespace(**{**vars(cohort), "settles_after_days": 28})
    assert P.range_value("c1", late, **one, settled_after=3)[0] is None
    assert P.decompose(plain, "duckdb")[0].fingerprint != parts.fingerprint
