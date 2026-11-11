"""BR-8 · the daily reading, generalised: each approved metric's PARTS, per day, stamped (ROADMAP §3.48).

The sampler (`sampler.py`) reads one thing a morning — a table's rows per day over the last `HORIZON_DAYS` days — and
files each count with the day it was read. This reads the same shape for every approved metric of a connection whose
date is declared (`metric_time.declared`): its statement grouped by the day of its date, each AGGREGATE of the
statement read as a part — a sum, a count, an average as its sum and its count — so

* a range becomes a sum of days, and the statement's own arithmetic rebuilds the figure from the summed parts
  (a ratio from its numerator and denominator, ``100.0 * a / NULLIF(b, 0)`` as written);
* "what was known on 5 September" is a lookup, not a query: the newest reading of each day taken on or before it.

Kept apart from the counts but in the same store (`store.record_parts`): the readings ARE the settling readings, of a
metric's parts rather than a table's rows (§3.48's law: the ledger generalises the settling readings rather than
sitting beside them). Nothing here is a model's: every value is a warehouse's answer to a statement the platform built
from an approved definition, with the day it was read.

**Not kept, and said** (`decompose` returns why): a level at a date (a stock) is not a sum of days; a COUNT(DISTINCT …)
is not the sum of its days, since a key can sit in two of them; a median, a minimum, a window function the same; a
statement read through a CTE or a subquery cannot be cut by day. Each stays calculated when asked, as before.

**What one morning costs**, per connection: ONE grouped statement per kept metric — over the last `HORIZON_DAYS` days
of the table its date is on, the same scan of the same days the settling sampler already makes of that table, plus
the columns the statement reads. Once per metric, and again only when its definition changes, that statement reads
the WHOLE table instead (the backfill): it is that morning's reading. Nothing else runs — no per-day statement, no
breakdown, no re-read of older days. On a billed warehouse (BigQuery) a statement is billed for the columns it reads
across the whole table unless the table is partitioned on the date, so a backfill costs what one unwindowed read of
the definition costs, and every later morning what its horizon read costs.

**One series per definition, kept a year, gone with it.** A series is keyed by the definition's `fingerprint`, so two
definitions of one name never overwrite each other; a day unchanged since it was filed costs the morning, not another
reading; and a definition that no longer exists takes its readings (`sweep`, called by `semantic.metrics.delete_metric`
and each morning). A cohort's reading stands past its day only once its outcomes have matured (`range_value`).

**Row-level access** (`db/matcache.py`'s documented trap): the parts are read by the platform's morning clock, through
the door with no reader in the request, so with no reader's row filters. A reader under a row policy therefore never
reads them (`readable`): their figure is calculated when asked, under their own filters, and says what it says today.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Iterator, Optional

from aughor.settling.sampler import HORIZON_DAYS

logger = logging.getLogger(__name__)

#: The first day a backfill reads from — every dated row, and none whose date is missing.
FIRST_DAY = date(1900, 1, 1)
#: The most days one backfill reads back (about 55 years). A table spanning more is said, never cut.
BACKFILL_MAX_DAYS = 20_000
#: The door's label for these statements. Audited, as the Briefing's measurement of the same definitions is (GM-5): a
#: governed statement, rendered by sqlglot, is a person's definition, not the platform's own words.
LABEL = "__settling_parts__"
#: A placeholder for part ``i`` in a metric's rebuild expression.
_PART = re.compile(r"_p(\d+)")

RunSql = Callable[..., tuple]


def _field(m: Any, key: str):
    """A definition's field, from a stored definition or its dict."""
    return m.get(key) if isinstance(m, dict) else getattr(m, key, None)


class Refused(Exception):
    """A metric whose parts cannot be read day by day, or a figure that cannot be rebuilt from them — with why."""


@dataclass(frozen=True)
class Parts:
    """How one approved metric is read day by day. ``template`` is the statement's own value expression with each
    aggregate replaced by ``_p<i>``; ``kinds`` says what each part is (``sum`` or ``count``)."""
    metric: str
    dialect: str
    fingerprint: str
    statement: str
    grain_table: str
    grain_column: str
    alias: str
    outcome: str
    template: Any
    kinds: tuple[str, ...]
    #: Whether this engine may divide whole numbers as whole numbers (sqlglot's ``typed`` division): then each summed
    #: part's SQL type is read beside it (`_TYPEOF`), so a division rebuilds exactly as the engine did it.
    typed: bool


# ── the definition, as parts ────────────────────────────────────────────────────────────────

def fingerprint(metric: Any, dialect: str) -> str:
    """What a reading was taken OF: the definition and its dates. Another definition is another series."""
    keys = ("sql", "tables", "filters", "time_column", "time_kind", "outcome_column")
    text = "\x1f".join([dialect] + [str(_field(metric, k) or "") for k in keys])
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _split(projection) -> tuple[list, list[str], Any]:
    """``(leaves, kinds, template)`` of a value expression: each aggregate a part, the expression with each replaced by
    ``_p<i>``. Walked in one fixed sequence, so the same expression always yields the same parts. Raises `Refused`."""
    from sqlglot import exp

    template = projection.copy()
    while isinstance(template, exp.Alias):
        template = template.this
    found: list = []

    def walk(node) -> None:
        if isinstance(node, exp.Window):
            raise Refused("a window function is not a sum of its days")
        if isinstance(node, (exp.Subquery, exp.Select)):
            raise Refused("a subquery in its value is not a sum of its days")
        if isinstance(node, exp.Filter) and isinstance(node.this, exp.AggFunc):
            if not isinstance(node.this, (exp.Sum, exp.Count)) or _distinct(node.this):
                raise Refused(f"its filtered {node.this.key.upper()}(…) is not a sum of its days")
            found.append(node)
            return
        if isinstance(node, exp.AggFunc):
            found.append(node)
            return
        for child in node.iter_expressions():
            walk(child)

    walk(template)
    if not found:
        raise Refused("its value has no aggregate to read day by day")
    leaves: list = []
    kinds: list[str] = []
    replace: list[tuple[Any, Any]] = []
    for node in found:
        agg = node.this if isinstance(node, exp.Filter) else node
        if isinstance(agg, exp.Avg) and not isinstance(node, exp.Filter) and not _distinct(agg):
            # an average is its sum over its count — both add up over days, the average does not
            s, c = len(leaves), len(leaves) + 1
            leaves += [exp.Sum(this=agg.this.copy()), exp.Count(this=agg.this.copy())]
            kinds += ["sum", "count"]
            replace.append((node, exp.Div(this=exp.column(f"_p{s}"),
                                          expression=exp.Nullif(this=exp.column(f"_p{c}"),
                                                                expression=exp.Literal.number(0)),
                                          typed=False, safe=False)))
            continue
        if _distinct(agg):
            raise Refused(f"a {agg.key.upper()}(DISTINCT …) is not the sum of its days: one key can sit in two")
        if isinstance(agg, (exp.Count, exp.CountIf)):
            kinds.append("count")
        elif isinstance(agg, exp.Sum):
            kinds.append("sum")
        else:
            raise Refused(f"its {agg.key.upper()}(…) is not a sum of its days")
        replace.append((node, exp.column(f"_p{len(leaves)}")))
        leaves.append(node.copy())
    for node, new in replace:
        if node is template:
            template = new
        else:
            node.replace(new)
    stray = [c.sql() for c in template.find_all(exp.Column) if not _PART.fullmatch(c.name)]
    if stray:
        raise Refused(f"its value reads {stray[0]} outside an aggregate")
    return leaves, kinds, template


def _distinct(agg) -> bool:
    from sqlglot import exp
    return bool(agg.args.get("distinct")) or isinstance(agg.this, exp.Distinct)


def decompose(metric: Any, dialect: str) -> tuple[Optional[Parts], str]:
    """How ``metric`` is read day by day, or ``(None, why)`` in words a reader is shown. Never raises."""
    import sqlglot
    from sqlglot import exp

    from aughor.semantic.metric_statement import as_statement, bare, is_statement, split_grain
    from aughor.semantic.metric_time import declared

    if not declared(metric):
        return None, "its dates are not set"
    kind = _field(metric, "time_kind")
    if kind == "stock":
        return None, "a level at a date is not a sum of days"
    sql = str(_field(metric, "sql") or "").strip()
    tables = [str(t) for t in (_field(metric, "tables") or []) if str(t).strip()]
    statement = sql if is_statement(sql) else as_statement(sql, tables, list(_field(metric, "filters") or []))
    if not statement:
        return None, "it has no statement"
    grain_table, column = split_grain(_field(metric, "time_column"))
    grain_table = grain_table or (tables[0] if tables else "")
    if not grain_table or not column:
        return None, "its date names no table"
    try:
        tree = sqlglot.parse_one(statement, read=dialect)
    except Exception:  # noqa: BLE001 — a statement the parser refuses is not read by day
        return None, "its statement does not parse"
    if not isinstance(tree, exp.Select) or tree.args.get("with") or tree.args.get("with_"):
        return None, "a statement read through a CTE or a set operation cannot be cut by day"
    for key in ("group", "having", "distinct", "qualify", "limit"):
        if tree.args.get(key):
            return None, f"its statement's {key.upper()} cannot be cut by day"
    if tree.find(exp.Ordered):
        return None, "its statement's ORDER BY cannot be cut by day"
    if len(tree.expressions) != 1:
        return None, "its statement returns more than one value"
    nested = [s for s in tree.find_all(exp.Select) if s is not tree]
    if nested:
        return None, "a statement with a subquery cannot be cut by day"
    named = [t for t in tree.find_all(exp.Table) if bare(t.name) == bare(grain_table)]
    if len(named) != 1:
        return None, (f"its statement does not read {grain_table}, the table its date is on" if not named
                      else f"its statement reads {grain_table} more than once, so a day is not one of its rows")
    try:
        _leaves, kinds, template = _split(tree.expressions[0])
        _eval(template, [(1, kd == "count") for kd in kinds])     # every node it keeps can be rebuilt
    except Refused as why:
        return None, str(why)
    typed = any(isinstance(d, exp.Div) and d.args.get("typed") for d in template.find_all(exp.Div))
    if typed and _TYPEOF.get(dialect) is None and "sum" in kinds:
        return None, "this engine may divide whole numbers as whole numbers, and the type of its sums cannot be read"
    outcome = split_grain(_field(metric, "outcome_column"))[1] if kind == "cohort" else ""
    return Parts(metric=str(_field(metric, "name") or ""), dialect=dialect, fingerprint=fingerprint(metric, dialect),
                 statement=statement, grain_table=grain_table, grain_column=column,
                 alias=named[0].alias or named[0].name, outcome=outcome, template=template, kinds=tuple(kinds),
                 typed=typed), ""


#: How each engine whose ``/`` may divide whole numbers names a value's SQL type. One where it cannot is refused.
_TYPEOF: dict[str, Callable[[Any], Any]] = {}


def _typeof_postgres(e):
    from sqlglot import exp
    return exp.Cast(this=exp.Anonymous(this="pg_typeof", expressions=[e]), to=exp.DataType.build("text"))


def _typeof_plain(e):
    from sqlglot import exp
    return exp.Anonymous(this="typeof", expressions=[e])


_TYPEOF.update({"postgres": _typeof_postgres, "sqlite": _typeof_plain, "trino": _typeof_plain,
                "presto": _typeof_plain})
_WHOLE_TYPES = ("bigint", "integer", "int", "smallint", "tinyint", "int2", "int4", "int8")


def parts_sql(parts: Parts, start: date, stop: date, *, as_of: date) -> tuple[Optional[str], str]:
    """One statement reading each day in [start, stop): ``_day``, then ``_p<i>`` per part (and ``_t<i>``, its type,
    where `Parts.typed`). The metric's grain table is filtered inside the statement exactly as `metric_time.measure_sql`
    filters it for a window, so the days add up to what a window compiles. A cohort's outcome is counted before
    ``as_of`` — the day the reading is taken."""
    import sqlglot
    from sqlglot import exp

    from aughor.semantic.metric_statement import scoped_statement
    from aughor.semantic.metric_time import bound_outcome, window_predicate

    rewrite = (lambda tree: bound_outcome(tree, parts.outcome, as_of)) if parts.outcome else None
    scoped, why, n = scoped_statement(parts.statement, parts.grain_table,
                                      window_predicate(parts.grain_column, start, stop),
                                      dialect=parts.dialect, rewrite=rewrite)
    if scoped is None:
        return None, why
    if n != 1:
        return None, f"its statement reads {parts.grain_table} more than once, so a day is not one of its rows"
    try:
        tree = sqlglot.parse_one(scoped, read=parts.dialect)
        leaves, kinds, _template = _split(tree.expressions[0])
    except Refused as why:
        return None, str(why)
    except Exception:  # noqa: BLE001
        return None, "its scoped statement does not parse"
    if tuple(kinds) != parts.kinds:
        return None, "its parts read differently once its window is applied"
    day = exp.Cast(this=exp.column(parts.grain_column, table=parts.alias), to=exp.DataType.build("date"))
    cols = [exp.alias_(day.copy(), "_day")]
    cols += [exp.alias_(leaf, f"_p{i}") for i, leaf in enumerate(leaves)]
    typeof = _TYPEOF.get(parts.dialect) if parts.typed else None
    if typeof is not None:
        cols += [exp.alias_(typeof(leaf.copy()), f"_t{i}") for i, (leaf, k) in enumerate(zip(leaves, kinds)) if k == "sum"]
    tree.set("expressions", cols)
    tree.set("group", exp.Group(expressions=[day]))
    try:
        return tree.sql(dialect=parts.dialect), ""
    except Exception as exc:  # noqa: BLE001
        return None, f"its daily statement could not be built ({type(exc).__name__})"


# ── a figure, rebuilt from its parts ────────────────────────────────────────────────────────

def _eval(node, parts: list[tuple[Any, Optional[bool]]]) -> tuple[Any, Optional[bool]]:
    """``(value, whole)`` of a rebuild expression over ``parts`` — ``whole`` says the engine holds the value as a whole
    number (None: not known). SQL's NULL is None and propagates as SQL's does. Raises `Refused` for a node it does not
    rebuild, so nothing is approximated."""
    from sqlglot import exp

    if isinstance(node, exp.Column):
        m = _PART.fullmatch(node.name)
        if not m or int(m.group(1)) >= len(parts):
            raise Refused(f"its value reads {node.sql()} outside an aggregate")
        return parts[int(m.group(1))]
    if isinstance(node, (exp.Paren, exp.Alias)):
        return _eval(node.this, parts)
    if isinstance(node, exp.Null):
        return None, None
    if isinstance(node, exp.Literal):
        if node.is_string:
            raise Refused("its value carries a text literal")
        text = str(node.this)
        return (int(text), True) if re.fullmatch(r"-?\d+", text) else (float(text), False)
    if isinstance(node, exp.Neg):
        v, w = _eval(node.this, parts)
        return (None if v is None else -v), w
    if isinstance(node, (exp.Add, exp.Sub, exp.Mul)):
        (a, wa), (b, wb) = _eval(node.this, parts), _eval(node.expression, parts)
        whole = (wa and wb) if None not in (wa, wb) else (False if False in (wa, wb) else None)
        if a is None or b is None:
            return None, whole
        return (a + b if isinstance(node, exp.Add) else a - b if isinstance(node, exp.Sub) else a * b), whole
    if isinstance(node, (exp.Div, exp.SafeDivide)):
        (a, wa), (b, wb) = _eval(node.this, parts), _eval(node.expression, parts)
        integer = isinstance(node, exp.Div) and bool(node.args.get("typed"))
        if integer and (wa is None or wb is None) and not (wa is False or wb is False):
            raise Refused("this engine may divide whole numbers as whole numbers here, and the type is not known")
        if a is None or b is None or b == 0:
            return None, (wa and wb) if integer else False
        if integer and wa and wb:
            q = abs(int(a)) // abs(int(b))
            return (q if (a >= 0) == (b > 0) else -q), True
        return float(a) / float(b), False
    if isinstance(node, exp.Nullif):
        (a, wa), (b, _wb) = _eval(node.this, parts), _eval(node.expression, parts)
        return (None if (a is not None and b is not None and a == b) else a), wa
    if isinstance(node, exp.Coalesce):
        got = [_eval(x, parts) for x in [node.this, *node.expressions]]
        whole = all(w for _, w in got) if all(w is not None for _, w in got) else None
        return next((v for v, _ in got if v is not None), None), whole
    if isinstance(node, (exp.Cast, exp.TryCast)):
        v, _w = _eval(node.this, parts)
        to = node.to.this if node.to is not None else None
        if to in exp.DataType.REAL_TYPES:
            return (None if v is None else float(v)), False
        raise Refused(f"its value casts to {node.to.sql() if node.to is not None else 'a type'} it does not rebuild")
    raise Refused(f"its value uses {node.key.upper()}, which it does not rebuild")


def rebuild(parts: Parts, totals: list[Any], whole: list[Optional[bool]]) -> tuple[Optional[float], str]:
    """The figure from each part's total over a range, by the statement's own arithmetic. ``(value, "")``, or
    ``(None, why)``; a figure with no rows is None, as the statement's would be."""
    try:
        v, _w = _eval(parts.template, list(zip(totals, whole)))
    except Refused as why:
        return None, str(why)
    if v is None:
        return None, ""
    v = float(v)
    return (v if math.isfinite(v) else None), ""


# ── the morning's reading ───────────────────────────────────────────────────────────────────

def _number(v) -> Any:
    """A cell as an int when written whole, a float otherwise, None for NULL — the door hands cells back as text."""
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    text = str(v).strip()
    if text.upper() in ("", "NULL", "NONE", "NAN"):
        return None
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    try:
        f = float(text.replace(",", ""))
    except ValueError:
        return None
    return f if math.isfinite(f) else None


def _as_date(v) -> Optional[date]:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def read_rows(parts: Parts, rows: list) -> tuple[dict[str, list], list[str]]:
    """``({day: [part values]}, [sql type of each summed part, "" where unread])`` from a `parts_sql` result."""
    n = len(parts.kinds)
    sums = [i for i, k in enumerate(parts.kinds) if k == "sum"]
    days: dict[str, list] = {}
    types = [""] * n
    for r in rows or []:
        cells = list(r.values()) if isinstance(r, dict) else list(r)
        if len(cells) < 1 + n:
            continue
        day = _as_date(cells[0])
        if day is None:
            continue
        days[day.isoformat()] = [_number(c) for c in cells[1:1 + n]]
        for j, i in enumerate(sums):
            t = cells[1 + n + j] if len(cells) > 1 + n + j else None
            if t and str(t).lower() != "null" and not types[i]:
                types[i] = str(t).lower()
    return days, types


def _empty(parts: Parts) -> list:
    """A day with no rows: a count of zero, a sum of nothing (SQL's NULL)."""
    return [0 if k == "count" else None for k in parts.kinds]


def read_metric(connection_id: str, metric: Any, run_sql: RunSql, dialect: str, *, today: date) -> dict:
    """Take this morning's reading of one metric's parts and file it: the whole table the first time (and after its
    definition changes), the last `HORIZON_DAYS` days otherwise — ONE statement either way. Returns what happened."""
    from aughor.settling.store import parts_entry, record_parts

    name = str(_field(metric, "name") or "")
    parts, why = decompose(metric, dialect)
    if parts is None:
        return {"metric": name, "kept": False, "why": why, "statements": 0}
    if "#" in name:
        return {"metric": name, "kept": False, "why": "its name carries a # and cannot key a reading", "statements": 0}
    entry = parts_entry(connection_id, name, parts.fingerprint)
    whole = not entry.get("backfill")
    start = FIRST_DAY if whole else today - timedelta(days=HORIZON_DAYS)
    sql, why = parts_sql(parts, start, today, as_of=today)
    if sql is None:
        return {"metric": name, "kept": False, "why": why, "statements": 0}
    try:
        _cols, rows, error = run_sql(sql, BACKFILL_MAX_DAYS if whole else None)
    except Exception as exc:  # noqa: BLE001 — said with the metric, never read as zero
        rows, error = [], f"{type(exc).__name__}: {exc}"
    if error:
        said = str(error)
        said = said[len("[EXCLUDED] "):] if said.startswith("[EXCLUDED]") else f"its daily statement failed: {said[:160]}"
        return {"metric": name, "kept": False, "why": said, "statements": 1}
    if whole and len(rows or []) >= BACKFILL_MAX_DAYS:
        return {"metric": name, "kept": False, "statements": 1,
                "why": f"its table spans more than {BACKFILL_MAX_DAYS} days, so one statement cannot read every day"}
    days, types = read_rows(parts, rows)
    if not whole:
        # A day with no rows is a reading too — zero rows is a value, and a day that later gains them was settling.
        for i in range((today - start).days):
            days.setdefault((start + timedelta(days=i)).isoformat(), _empty(parts))
    record_parts(connection_id, name, fingerprint=parts.fingerprint, kinds=list(parts.kinds), types=types,
                 measured_on=today, days=days, whole=whole, dialect=dialect)
    return {"metric": name, "kept": True, "whole": whole, "days": len(days), "statements": 1, "why": ""}


def definitions(connection_id: str) -> list:
    """Every definition the connection owns, of any status — what a kept series may be of (`sweep`)."""
    from aughor.semantic.metrics import list_metrics
    return [m for m in list_metrics(connection_id=connection_id) if str(_field(m, "connection") or "") == connection_id]


def candidates(connection_id: str) -> list:
    """The connection's approved metrics with a declared date — what a morning reads. Never writes (the dates are set
    where a Briefing or the editor sets them, not here)."""
    from aughor.semantic.metric_time import declared
    return [m for m in definitions(connection_id) if _field(m, "status") == "approved" and declared(m)]


@contextmanager
def _runner(connection_id: str) -> Iterator[tuple[RunSql, str]]:
    """``(run_sql(sql, max_rows), dialect)`` on the connection: the statement in the metric's own dialect, through
    every check the door makes and onto the audit page, the connection closed after."""
    from aughor.db.connection import open_connection_for
    db = open_connection_for(connection_id)

    def run_sql(sql: str, max_rows: Optional[int] = None):
        res = db.execute_bounded(LABEL, sql, max_rows) if max_rows else db.execute(LABEL, sql)
        return list(getattr(res, "columns", []) or []), list(getattr(res, "rows", []) or []), getattr(res, "error", None)

    try:
        yield run_sql, str(getattr(db, "dialect", "") or "duckdb")
    finally:
        try:
            db.close()
        except Exception as exc:  # noqa: BLE001
            from aughor.kernel.errors import tolerate
            tolerate(exc, "the daily reading's connection did not close", counter="settling.parts.close")


def read_connection(connection_id: str, *, today: Optional[date] = None,
                    runner: Optional[Callable[[], Any]] = None) -> dict:
    """This morning's reading of every candidate metric of one connection. A live source (a sheet) is read as it
    stands each time it is asked for, never from a kept reading, so it is not read here. Returns, per metric, what
    happened, and how many statements ran."""
    from aughor.db.registry import is_live

    today = today or datetime.now(timezone.utc).date()
    out: dict = {"connection_id": connection_id, "metrics": [], "statements": 0, "measured_on": today.isoformat()}
    if is_live(connection_id):
        return out
    metrics = candidates(connection_id)
    if metrics:
        with (runner or (lambda: _runner(connection_id)))() as (run_sql, dialect):
            for m in metrics:
                got = read_metric(connection_id, m, run_sql, dialect, today=today)
                out["metrics"].append(got)
                out["statements"] += got["statements"]
    out["swept"] = sweep(connection_id)
    return out


# ── a definition that is gone takes its readings ────────────────────────────────────────────────

def _dialects() -> tuple[str, ...]:
    """Every engine sqlglot reads — what a first-slice series, which did not keep the dialect it was fingerprinted
    under, may have been read in. Its definition is alive when its fingerprint under any of them matches."""
    from sqlglot.dialects.dialect import Dialect
    return tuple(sorted({str(k) for k in Dialect.classes if k}))


def sweep(connection_id: str, metric: Optional[str] = None) -> int:
    """Drop the readings of every definition of ``connection_id`` (of the name ``metric``, when given) that no longer
    exists — deleted, removed with its dataset, or edited into another definition, whose readings say nothing of the
    new one. A definition that still exists keeps its readings whatever its status: a retired metric approved again
    is read from where it stopped, never re-read whole. A series whose definition cannot be told (an unreadable
    catalogue) is kept. Returns how many series went."""
    from aughor.settling.store import drop_series, parts_series

    series = parts_series(connection_id, metric)
    if not series:
        return 0
    try:
        defs = definitions(connection_id)
    except Exception as exc:  # noqa: BLE001 — a catalogue that cannot be read removes nothing
        from aughor.kernel.errors import tolerate
        tolerate(exc, "the catalogue could not be read; no reading is swept", counter="settling.parts.sweep")
        return 0
    by_name: dict[str, list] = {}
    for m in defs:
        by_name.setdefault(str(_field(m, "name") or ""), []).append(m)
    gone = 0
    every: tuple[str, ...] = ()
    for key, entry in series:
        name = str(entry.get("metric") or key.split("#", 2)[1])
        dialect = str(entry.get("dialect") or "")
        every = every or (() if dialect else _dialects())
        alive = {fingerprint(m, d) for m in by_name.get(name, []) for d in ((dialect,) if dialect else every)}
        if str(entry.get("fingerprint") or "") not in alive:
            drop_series(key)
            gone += 1
    return gone


def sweep_metric(name: str, connection_id: Optional[str] = None) -> int:
    """`sweep` for one name, on one connection or — a name removed everywhere — on every connection holding readings
    of it. Called by `semantic.metrics.delete_metric`, so a removed definition's readings go with it, not at the next
    morning. Never raises: a removal is never undone by its readings."""
    try:
        from aughor.settling.store import parts_series
        conns = [connection_id] if connection_id else sorted({k.split("#", 1)[0] for k, _e in parts_series(None, name)})
        return sum(sweep(c, name) for c in conns if c)
    except Exception as exc:  # noqa: BLE001
        from aughor.kernel.errors import tolerate
        tolerate(exc, "a removed metric's daily readings could not be swept; the next morning sweeps them",
                 counter="settling.parts.sweep_metric")
        return 0


# ── what was known, and when ───────────────────────────────────────────────────────────────

def readable() -> tuple[bool, str]:
    """Whether the reader in this request may read stored parts. The parts are the platform's, read with no row
    filters; a reader whose rows are filtered never reads them, and their figure is calculated when asked
    (`db/matcache.py`'s trap: a result read before a reader's filters would hand one reader's rows to another).
    Fails closed: a fingerprint that cannot be read is a restricted reader."""
    try:
        from aughor.db.connection import result_cache_tenancy
        if result_cache_tenancy() is not None:
            return False, "a reader whose rows are filtered is read when asked, never from stored readings"
    except Exception as exc:  # noqa: BLE001
        from aughor.kernel.errors import tolerate
        tolerate(exc, "the reader's row access could not be read; stored readings are not read",
                 counter="settling.parts.tenancy")
        return False, "the reader's row access could not be read"
    return True, ""


def _index(entry: dict) -> tuple[dict[str, list[tuple[str, list]]], set[str]]:
    """``({day: [(taken on, values)], oldest first}, mornings)`` of a series — what `_known` reads, built once."""
    from aughor.settling.store import mornings_of, readings_of

    by_day: dict[str, list[tuple[str, list]]] = {}
    for day, taken, values in readings_of(entry):
        by_day.setdefault(day, []).append((taken, values))
    return by_day, mornings_of(entry)


def _known(entry: dict, day: date, as_of: Optional[date], settled_after: Optional[int],
           index: Optional[tuple] = None) -> Optional[list]:
    """The values of ``day`` as known on ``as_of`` — its newest reading taken on or before it — when that reading
    stands for ``as_of``: taken ON it; or a morning on ``as_of`` read the day (it was among that morning's recent
    days) and found it unchanged, so filed nothing new (`store.record_parts`); or taken when the day had already
    settled (``settled_after`` days old or more), so it could not have moved since. ``as_of`` None: the newest
    reading of the day, whenever taken."""
    by_day, mornings = index or _index(entry)
    best: Optional[tuple[str, list]] = None
    stamp = as_of.isoformat() if as_of else "9999-12-31"
    iso = day.isoformat()
    for taken, values in by_day.get(iso) or []:
        if taken <= stamp and (best is None or taken > best[0]):
            best = (taken, list(values))
    back = entry.get("backfill") or {}
    taken = str(back.get("measured_on") or "")
    if taken and iso < taken <= stamp and (best is None or taken > best[0]):
        values = (back.get("days") or {}).get(iso)
        best = (taken, list(values) if values is not None else [0 if k == "count" else None
                                                                 for k in entry.get("kinds") or []])
    if best is None:
        return None
    if as_of is None or best[0] == stamp:
        return best[1]
    if stamp in mornings and as_of - timedelta(days=HORIZON_DAYS) <= day < as_of:
        return best[1]                                   # read that morning, unchanged since `best` was filed
    age = (date.fromisoformat(best[0]) - day).days
    return best[1] if settled_after is not None and age >= settled_after else None


def range_value(connection_id: str, metric: Any, start: date, end: date, *, dialect: str,
                as_of: Optional[date] = None, settled_after: Optional[int] = None) -> tuple[Optional[float], str]:
    """``metric`` over [start, end) from its daily readings — as known on ``as_of``, or (None) as the newest readings
    stand — rebuilt from its parts. ``(value, "")`` or ``(None, why)``: a day with no reading that stands for
    ``as_of`` is said, never filled. A restricted reader is refused (`readable`)."""
    from aughor.settling.store import parts_entry, parts_series

    ok, why = readable()
    if not ok:
        return None, why
    parts, why = decompose(metric, dialect)
    if parts is None:
        return None, why
    name = str(_field(metric, "name") or "")
    entry = parts_entry(connection_id, name, parts.fingerprint)
    if not entry:
        return None, ("its daily readings are of an earlier definition" if parts_series(connection_id, name)
                      else "it has no daily readings yet")
    kinds = list(entry.get("kinds") or [])
    if tuple(kinds) != parts.kinds or end <= start:
        return None, "its daily readings do not match its parts"
    if settled_after is not None and _field(metric, "time_kind") == "cohort":
        # a cohort's day is final once its OUTCOMES have arrived, not its rows: LuxExperience's arrive for 28 days, past
        # the 14 a morning re-reads, so a reading at the connection's row lag would stand for a day still gaining
        # outcomes (measured 2026-11-09: an October cohort read 1.3% off a day on). No maturity, no standing.
        mature = _field(metric, "settles_after_days")
        settled_after = max(int(settled_after), int(mature)) if mature else None
    index = _index(entry)
    per_part: list[list] = [[] for _ in kinds]
    for i in range((end - start).days):
        day = start + timedelta(days=i)
        values = _known(entry, day, as_of, settled_after, index)
        if values is None:
            return None, (f"no reading of {day.isoformat()} stands for {as_of.isoformat()}" if as_of
                          else f"no reading of {day.isoformat()}")
        for j, v in enumerate(values[:len(kinds)]):
            if v is not None:
                per_part[j].append(v)
    types = list(entry.get("types") or [""] * len(kinds))
    totals: list[Any] = []
    whole: list[Optional[bool]] = []
    for j, kind in enumerate(kinds):
        vals = per_part[j]
        if kind == "count":
            totals.append(int(sum(int(v) for v in vals)))
            whole.append(True)
            continue
        sql_type = types[j] if j < len(types) else ""
        is_whole = (sql_type.split("(")[0].strip() in _WHOLE_TYPES) if sql_type else (False if not parts.typed else None)
        if not vals:
            totals.append(None)
        elif is_whole:
            totals.append(sum(int(v) for v in vals))
        else:
            totals.append(math.fsum(float(v) for v in vals))
        whole.append(is_whole)
    return rebuild(parts, totals, whole)
