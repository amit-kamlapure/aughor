"""Grain-of-intent check — does the RESULT's row count match the question's implied grain?

The Spider2 Phase-0 triage found 11/63 misses were grain errors that execute cleanly and
return plausible rows, so the error/empty/fan-out triggers all miss them: a "top three X"
question answered with 5 rows, a "which single Y…" answered with 7, a "for each match"
answered per-ball. The QUESTION declares its expected grain; the result's row count is
observable; comparing them is deterministic and execution-grounded — the guard class that
has held up (never an LLM judgement, only a detector feeding the existing repair loop).

Deliberately PRECISION-FIRST: every pattern here must be unambiguous enough that firing
wrongly is rare — a missed detection costs nothing (the query ships as-is), a false fire
costs a wasted repair round. Detection is pure (unit-testable offline); the entity→column
probe takes a callable so any backend/harness can wire it.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

# "top three customers", "top 5 players", "first 10 …", "5 highest-earning …"
_TOP_N = re.compile(
    r"\b(?:top|first|best|highest|largest|lowest|smallest|bottom)\s+"
    r"(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b", re.I)
_N_SUPERLATIVE = re.compile(
    r"\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\s+"
    r"(?:most|least|highest|lowest|largest|smallest|best|worst)\b", re.I)
# "5 delivery drivers with the highest …" — N + short noun phrase + superlative clause
_N_NOUN_SUPERLATIVE = re.compile(
    r"\b(\d{1,3}|two|three|four|five|six|seven|eight|nine|ten)\s+"
    r"[a-z_]+(?:\s+[a-z_]+)?\s+with\s+the\s+"
    r"(?:most|least|highest|lowest|largest|smallest|best|worst)\b", re.I)

# Singular-intent openers: "which year …", "what is the …", "who has the highest …",
# "for the X that … how many/what …". Must clearly ask for ONE thing.
_SINGULAR = re.compile(
    r"^(?:in\s+)?(?:which|what|who)\s+(?:is|was|are|year|month|day|player|customer|store|"
    r"country|city|driver|team|category|product|university|company)\b.*?"
    r"\b(?:most|least|highest|lowest|largest|smallest|best|worst|closest|first|shortest|longest)\b",
    re.I | re.S)

# "for each X", "per X" — a per-entity grain declaration.
_PER_ENTITY = re.compile(r"\b(?:for\s+(?:each|every)|per)\s+([a-z_][a-z_ ]{2,30}?)(?:[,.:;]|\s+(?:and|in|of|the|please|calculate|show|list|provide|identify|from|with)\b)", re.I)


# "how many orders …", "number of customers …", "count of products …" — the question
# names a COUNTABLE ENTITY. If the SQL then does COUNT(*) over a table whose grain is
# finer than that entity (line items, not orders), it counts rows of the wrong thing.
_HOW_MANY_ENTITY = re.compile(
    r"\b(?:how\s+many|number\s+of|count\s+of|total\s+number\s+of)\s+"
    r"(?:distinct\s+|unique\s+|different\s+)?([a-z][a-z_]{2,30}?)s?\b(?:\s+(?:were|are|was|is|did|do|have|has|had|in|by|per|for|from|with|that|which|placed|shipped|sold|returned|made)\b|[?,.]|$)",
    re.I,
)
#: "how many rows / records / entries / items / results" — words that name the row
#: itself, where COUNT(*) is exactly right.
_NOT_ENTITIES = frozenset({"row", "record", "entry", "result", "line", "item", "line_item",
                           "transaction", "event", "time", "day", "month", "year", "week"})


_COUNT_STAR = re.compile(r"\bcount\s*\(\s*\*\s*\)", re.I)
_COUNT_DISTINCT = re.compile(r"\bcount\s*\(\s*distinct\b", re.I)


def count_star_over_finer_grain(question: str, sql: str,
                                columns_in_scope: Sequence[str]) -> Optional[str]:
    """``COUNT(*)`` answering "how many <entity>" on a table whose rows are NOT that
    entity — the Superstore miss (2026-08-14): "how many orders in Q4 2016?" answered
    806 line items instead of 406 orders, on a table whose declared grain is one row
    per line item and which carries ``order_id``.

    Deterministic and precision-first, so it can caveat a live headline: fires only
    when (a) the question names a countable entity, (b) the SQL is a bare COUNT(*)
    with no COUNT(DISTINCT …) anywhere, no JOIN and no GROUP BY (single-table scalar
    or filtered count — the shape where the fix is exactly one edit), and (c) a
    column ``<entity>_id`` is in scope — the entity's OWN key, which is what a table
    keyed at that entity's grain would not need to carry alongside a separate row id.
    Returns the repair diagnosis, else None. The caller decides caveat vs rewrite.
    """
    m = _HOW_MANY_ENTITY.search(question or "")
    if not m or not sql:
        return None
    entity = m.group(1).lower().rstrip("s")
    if not entity or entity in _NOT_ENTITIES:
        return None
    s = sql.lower()
    if not _COUNT_STAR.search(s) or _COUNT_DISTINCT.search(s):
        return None
    if " join " in s or " group by " in s:
        return None          # the join/grouped shapes belong to fanout.py's detectors
    key = _entity_column(entity, columns_in_scope)
    if not key or not key.lower().endswith("_id"):
        return None
    return (f"GRAIN MISMATCH: the question asks how many {entity}s, but COUNT(*) counts "
            f"table rows, which are finer than one row per {entity} (the table carries "
            f"{key}). Use COUNT(DISTINCT {key}) so each {entity} is counted once.")


_AGG_ASK = re.compile(r"\b(total|sum|average|avg|mean|count|number of|how many|share|rate)\b", re.I)
_BY_PHRASE = re.compile(r"\bby\s+([a-z][a-z _]*?)(?=[?.,;]|\s+(?:for|in|on|over|during|since|where|with|ranked|sorted|ordered|from)\b|$)", re.I)
_PER_ROW_ASK = re.compile(r"\b(per|each|every|individual)\b", re.I)
_GROUP_BY = re.compile(r"\bgroup\s+by\s+(.+?)(?=\border\s+by\b|\bhaving\b|\blimit\b|\bqualify\b|\)|;|$)", re.I | re.S)
_AGG_FN = re.compile(r"\b(sum|avg|count|min|max)\s*\(", re.I)
_KEY_COL = re.compile(r"^(?:[a-z_][a-z0-9_]*\.)?([a-z][a-z0-9_]*)_id$|^(?:[a-z_][a-z0-9_]*\.)?id$", re.I)


def grouped_by_a_row_key(question: str, sql: str) -> Optional[str]:
    """A total asked "by <dimension>" whose SQL ALSO groups by a row's own key.

    Receipt 2026-11-13 (LuxExperience): "What is total GMV by order status?" came back as
    ``GROUP BY order_id, status`` — 500 rows, one per order, each its own "total" — because
    "order status" was read as two things. It executes, it returns plausible rows, and it is
    not an aggregate at all.

    Precision-first, like its neighbours. Fires only when (a) the question asks for an
    aggregate and names what to break it down by, and asks for nothing per row ("per", "each");
    (b) the SQL has one GROUP BY of two or more plain items and an aggregate; (c) one item is a
    key (``<entity>_id`` or ``id``) and the question's breakdown does not END in that entity
    ("by customer" grouped by ``customer_id, name`` is right; "by order status" grouped by
    ``order_id, status`` is not) nor name the key itself. Returns the repair diagnosis, else
    None."""
    q = (question or "").strip()
    if not q or not sql or not _AGG_ASK.search(q) or _PER_ROW_ASK.search(q):
        return None
    by = _BY_PHRASE.search(q)
    if not by:
        return None
    parts = [p.strip() for p in re.split(r"\s*(?:,|\band\b)\s*", by.group(1).lower()) if p.strip()]
    heads = {p.split()[-1].rstrip("s") for p in parts}
    if not heads or not _AGG_FN.search(sql):
        return None
    groups = _GROUP_BY.findall(sql)
    if len(groups) != 1:
        return None                      # nested or several groupings: not this detector's shape
    items = [i.strip().strip('"`') for i in groups[0].split(",") if i.strip()]
    if len(items) < 2 or any(not re.fullmatch(r"[A-Za-z_][\w.]*", i) for i in items):
        return None                      # positions and expressions are left alone
    ql = q.lower()
    for item in items:
        m = _KEY_COL.match(item)
        if not m:
            continue
        entity = (m.group(1) or "").lower()
        key = item.split(".")[-1].lower()
        if (entity and entity.rstrip("s") in heads) or key in ql or key.replace("_", " ") in ql:
            continue
        rest = ", ".join(i for i in items if i != item)
        return (f"GRAIN MISMATCH: the question asks for a total by {by.group(1).strip()}, but the SQL "
                f"also groups by {item}, a row's own key — that makes one group per row, so nothing "
                f"is totalled. Group by {rest} only, and do not select {item}.")
    return None


@dataclass
class GrainExpectation:
    kind: str            # "exact" | "per_entity"
    n: Optional[int]     # expected row count for "exact"
    entity: Optional[str]  # entity phrase for "per_entity"
    reason: str          # human-readable, feeds the repair diagnosis


def expected_grain(question: str) -> Optional[GrainExpectation]:
    """The question's implied result grain, or None when it doesn't clearly declare one."""
    q = (question or "").strip()
    m = _TOP_N.search(q) or _N_SUPERLATIVE.search(q) or _N_NOUN_SUPERLATIVE.search(q)
    if m:
        raw = m.group(1).lower()
        n = int(raw) if raw.isdigit() else _NUMBER_WORDS.get(raw)
        if n:
            return GrainExpectation("exact", n, None,
                                    f'the question asks for {n} rows ("{m.group(0)}")')
    # per-entity BEFORE singular: "for each customer, which month …" is per-customer.
    m = _PER_ENTITY.search(q)
    if m:
        entity = m.group(1).strip().rstrip("s")
        return GrainExpectation("per_entity", None, entity,
                                f'the question asks for one row per {entity} ("{m.group(0).strip()}")')
    if _SINGULAR.match(q):
        return GrainExpectation("exact", 1, None,
                                "the question asks for a single answer row")
    return None


def _entity_column(entity: str, columns: Sequence[str]) -> Optional[str]:
    """Fuzzy-map an entity phrase ("match", "customer") to an id-ish column."""
    e = entity.lower().replace(" ", "_")
    cands = [c for c in columns if c.lower() in (f"{e}_id", f"{e}id", e, f"{e}_key", f"{e}_no")]
    if cands:
        return cands[0]
    # last resort: a column that starts with the entity word and ends id/key
    for c in columns:
        cl = c.lower()
        if cl.startswith(e) and cl.endswith(("id", "key", "_no")):
            return c
    return None


def check_result_grain(
    question: str,
    row_count: int,
    *,
    columns_in_scope: Sequence[str] = (),
    count_distinct: Optional[Callable[[str], Optional[int]]] = None,
    tie_tolerance: float = 1.0,
) -> Optional[str]:
    """Return a repair DIAGNOSIS when the result's row count contradicts the question's
    declared grain, else None. Precision-first: unclear ⇒ None.

    count_distinct(column) -> int|None probes the live data for per-entity expectations
    (the caller supplies it; absent ⇒ per-entity checks are skipped).
    tie_tolerance: an "exact N" question may legitimately return a few extra rows on
    ties — allow up to N*(1+tie_tolerance) before firing.
    """
    if row_count < 0:
        return None
    exp = expected_grain(question)
    if exp is None:
        return None
    if exp.kind == "exact" and exp.n:
        hi = int(exp.n * (1 + tie_tolerance))
        if row_count > hi or (row_count < exp.n and row_count == 0):
            return (f"GRAIN MISMATCH: {exp.reason}, but the result has {row_count} rows. "
                    f"Re-aggregate or re-rank so the output matches the asked-for grain "
                    f"(LIMIT/window over the correct entity, not a finer or coarser one).")
        return None
    if exp.kind == "per_entity" and exp.entity and count_distinct is not None:
        col = _entity_column(exp.entity, columns_in_scope)
        if not col:
            return None
        expected = count_distinct(col)
        if not expected or expected <= 1:
            return None
        # fire only on a strong mismatch — result far off one-row-per-entity
        if row_count > expected * 2 or row_count < max(1, int(expected * 0.5)):
            return (f"GRAIN MISMATCH: {exp.reason} (~{expected} distinct {exp.entity}s in the "
                    f"data), but the result has {row_count} rows. GROUP BY the {exp.entity} "
                    f"grain exactly — one output row per {exp.entity}.")
    return None
