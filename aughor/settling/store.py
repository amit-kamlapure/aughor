"""Idea 4 · the observations a day's number was read at, per table — and what they say.

One JSON store under the data home (`settling.json`), keyed ``connection:table``. Each entry
keeps the date column the counts were read on and the observations, capped to the last
`KEEP_DAYS` of readings so the file stays small (a table read once a day over a 14-day
horizon is ~14 rows per day). Written only by the sampler, inside the API process — one
writer per ``data/``.

The verdicts are computed on read from the observations, never stored: a stored lag would
be a number that stops being re-derived the day the source changes its habits.

The same store keeps BR-8's readings of each approved metric's PARTS per day (`parts.py`), keyed
``connection#metric#fingerprint`` — one series per definition: the same reading — a day's value,
taken on a day — of a metric's sums and counts rather than a table's rows, so the ledger generalises
these readings instead of sitting beside them (ROADMAP §3.48). A day is filed again only when it
moved, and the readings are kept `KEEP_PARTS_DAYS`, so a year earlier can be read as it stood.
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Optional

from aughor.settling.learn import Observation, SettlingVerdict, rewrites_history, settle_lag

#: Readings older than this are dropped on write; a lag is a property of the recent past.
KEEP_DAYS = 90


def _path() -> Path:
    from aughor.db.paths import state_dir
    return state_dir() / "settling.json"


def _store():
    from aughor.util.json_store import KeyedJsonStore
    return KeyedJsonStore(_path())


def _key(connection_id: str, table: str) -> str:
    return f"{connection_id}:{table}"


def record_observations(connection_id: str, table: str, date_column: str,
                        measured_on: date, day_values: dict[str, float]) -> int:
    """File one reading of each day's value, taken on ``measured_on``. Returns how many
    observations the entry now holds."""
    store = _store()
    key = _key(connection_id, table)
    entry = store.get(key) or {}
    kept = _merged(entry.get("observations") or [], measured_on, day_values)
    store.put(key, {**entry, "date_column": date_column, "observations": kept,
                    "last_measured_on": measured_on.isoformat()})
    return len(kept)


def record_old_readings(connection_id: str, table: str, measured_on: date, day_values: dict[str, float]) -> int:
    """File one reading of days far older than the horizon (`sampler.OLD_DAYS`). Kept apart from ``observations``: the
    verdict's horizon is the oldest age read, and a reading at age 180 would make theLook's lag floor 181."""
    store = _store()
    key = _key(connection_id, table)
    entry = store.get(key) or {}
    kept = _merged(entry.get("old_readings") or [], measured_on, day_values)
    store.put(key, {**entry, "old_readings": kept})
    return len(kept)


def _merged(readings: list, measured_on: date, day_values: dict, *, field: str = "value", keep=float) -> list:
    floor = (measured_on - timedelta(days=KEEP_DAYS)).isoformat()
    stamp = measured_on.isoformat()
    # A re-reading replaces exactly the (day, measured_on) pairs it re-reads — never every
    # reading taken that day, or an incremental writer would erase its own earlier work.
    kept = [o for o in readings
            if str(o.get("measured_on", "")) >= floor
            and not (str(o.get("measured_on")) == stamp and str(o.get("day"))[:10] in day_values)]
    for day, value in sorted(day_values.items()):
        kept.append({"day": str(day)[:10], "measured_on": stamp, field: keep(value)})
    return kept


# ── BR-8 · a metric's parts, read the same way (`parts.py`) ─────────────────────────────────────────────────────────

#: How long a metric's daily readings are kept, by the day they were taken: a year earlier, read as it stood at the
#: figure's own age, needs the reading taken a year and that age ago (a monthly edition's six months before it, half
#: that). The table counts above keep `KEEP_DAYS`; they describe the recent past, these answer for a past date.
KEEP_PARTS_DAYS = 400


def _parts_key(connection_id: str, metric: str, fingerprint: str = "") -> str:
    """``connection#metric#fingerprint`` — one series per DEFINITION: a name can carry two (one per dataset of the
    connection, or one per grain), and one key per name made them overwrite each other, each morning reading the
    other's whole table again. Never ``connection:…``, so `tables` lists only tables; a connection's removal sweeps it
    by the same rule as the rest of its keys (`db.purge._kv_where`: the id, then a separator). Without a fingerprint:
    the first slice's key, one per name (read until a morning re-files it)."""
    return f"{connection_id}#{metric}#{fingerprint}" if fingerprint else f"{connection_id}#{metric}"


def _key_parts(key: str) -> Optional[tuple[str, str, str]]:
    """``(connection, metric, fingerprint)`` of a parts key, the fingerprint "" for the first slice's; None for a
    table's key (``connection:table``)."""
    head, sep, rest = key.partition("#")
    if not sep or not rest:
        return None
    metric, _, fp = rest.partition("#")
    return head, metric, fp


def _reading(r) -> Optional[tuple[str, str, list]]:
    """``(day, taken on, values)`` of a kept reading: ``[day, taken, values]``, or the first slice's dict."""
    try:
        if isinstance(r, dict):
            return str(r["day"])[:10], str(r["measured_on"])[:10], list(r.get("values") or [])
        day, taken, values = r
        return str(day)[:10], str(taken)[:10], list(values or [])
    except (KeyError, TypeError, ValueError):
        return None


def readings_of(entry: dict) -> list[tuple[str, str, list]]:
    """Every kept reading of an entry as ``(day, taken on, values)``, oldest taken first."""
    out = [x for x in (_reading(r) for r in entry.get("readings") or []) if x is not None]
    return sorted(out, key=lambda x: (x[1], x[0]))


def mornings_of(entry: dict) -> set[str]:
    """The days a morning read this series' recent days whole — a day it found unchanged is not filed again, so a
    reading stands for every such morning until the next reading of that day (`parts._known`). The first slice filed
    every day each morning, so its mornings are the days its readings were taken."""
    kept = entry.get("mornings")
    if kept is not None:
        return {str(d)[:10] for d in kept}
    return {taken for _d, taken, _v in readings_of(entry)}


def _empty_values(kinds: list[str]) -> list:
    return [0 if k == "count" else None for k in kinds]


def record_parts(connection_id: str, metric: str, *, fingerprint: str, kinds: list[str], types: list[str],
                 measured_on: date, days: dict[str, list], whole: bool, dialect: str = "") -> int:
    """File one reading of a metric's parts per day, taken on ``measured_on``. ``whole``: it read every day before
    ``measured_on`` (the backfill) — kept as one reading of each day, sparse (a day it does not name had no rows), and
    never aged out: it is what an older day is known to be. Otherwise the morning read its recent days whole: a day
    whose values are what its newest earlier reading (or the backfill) says is not filed again — the morning is kept
    instead (`mornings_of`) — so a settled day costs one reading, not one a morning, and a year of them fits.
    Readings taken more than `KEEP_PARTS_DAYS` ago are dropped. Each definition is its own series (``fingerprint``);
    another definition of the same name is never touched. Returns how many readings the entry now holds."""
    store = _store()
    key = _parts_key(connection_id, metric, fingerprint)
    entry = store.get(key)
    if entry is None:
        # the first slice kept one series per name: carried over once, when it is of this definition
        legacy = store.get(_parts_key(connection_id, metric)) or {}
        entry = legacy if legacy.get("fingerprint") == fingerprint else {}
        if entry:
            store.delete(_parts_key(connection_id, metric))
    entry = dict(entry or {})
    known = list(entry.get("types") or [""] * len(kinds))
    types = [t or (known[i] if i < len(known) else "") for i, t in enumerate(types)]
    stamp = measured_on.isoformat()
    floor = (measured_on - timedelta(days=KEEP_PARTS_DAYS)).isoformat()
    mornings = {m for m in mornings_of(entry) if m >= floor}
    out = {**entry, "metric": metric, "fingerprint": fingerprint, "kinds": list(kinds), "types": types,
           "dialect": dialect or entry.get("dialect") or "",
           "last_measured_on": max(str(entry.get("last_measured_on") or ""), stamp)}
    readings = [r for r in readings_of(entry) if r[1] >= floor]
    if whole:
        out["backfill"] = {"measured_on": stamp, "days": {d[:10]: list(v) for d, v in days.items()}}
    else:
        back = entry.get("backfill") or {}
        back_on, back_days = str(back.get("measured_on") or ""), back.get("days") or {}
        # a re-reading the same morning replaces exactly the days it re-reads
        readings = [r for r in readings if not (r[1] == stamp and r[0] in {d[:10] for d in days})]
        newest: dict[str, list] = {}
        for day, taken, values in readings:            # oldest first: the last one standing is the newest
            if taken < stamp:
                newest[day] = values
        for day, values in sorted(days.items()):
            day = day[:10]
            before = newest.get(day)
            if before is None and back_on and day < back_on <= stamp:
                before = list(back_days.get(day) or _empty_values(list(kinds)))
            if before is not None and list(before) == list(values):
                continue                                # unchanged since it was last filed: the morning says so
            readings.append((day, stamp, list(values)))
    mornings.add(stamp)
    out["mornings"] = sorted(mornings)
    out["readings"] = [[d, t, v] for d, t, v in sorted(readings, key=lambda x: (x[1], x[0]))]
    store.put(key, out)
    return len(out["readings"]) + len((out.get("backfill") or {}).get("days") or {})


def parts_entry(connection_id: str, metric: str, fingerprint: str = "") -> dict:
    """One definition's series — ``fingerprint`` names it — or, without one, the first slice's per-name entry. A
    first-slice entry of the same definition is read until a morning re-files it under its fingerprint."""
    store = _store()
    if fingerprint:
        got = store.get(_parts_key(connection_id, metric, fingerprint))
        if got is not None:
            return dict(got)
        legacy = store.get(_parts_key(connection_id, metric)) or {}
        return dict(legacy) if legacy.get("fingerprint") == fingerprint else {}
    return dict(store.get(_parts_key(connection_id, metric)) or {})


def parts_series(connection_id: Optional[str] = None, metric: Optional[str] = None) -> list[tuple[str, dict]]:
    """``(key, entry)`` of every kept series — of one connection, and of one name, when given."""
    out = []
    for key, entry in (_store().load() or {}).items():
        got = _key_parts(key)
        if got is None or (connection_id is not None and got[0] != connection_id):
            continue
        if metric is not None and got[1] != metric:
            continue
        out.append((key, dict(entry or {})))
    return sorted(out)


def drop_series(key: str) -> None:
    _store().delete(key)


def parts_metrics(connection_id: str) -> list[str]:
    return sorted({str(e.get("metric") or _key_parts(k)[1]) for k, e in parts_series(connection_id)})


def observations(connection_id: str, table: str) -> list[Observation]:
    return _parsed((_store().get(_key(connection_id, table)) or {}).get("observations"))


def old_readings(connection_id: str, table: str) -> list[Observation]:
    return _parsed((_store().get(_key(connection_id, table)) or {}).get("old_readings"))


def _parsed(readings: Optional[list]) -> list[Observation]:
    out: list[Observation] = []
    for o in readings or []:
        try:
            out.append(Observation(day=date.fromisoformat(str(o["day"])[:10]),
                                   measured_on=date.fromisoformat(str(o["measured_on"])[:10]),
                                   value=float(o["value"])))
        except (KeyError, TypeError, ValueError) as exc:
            from aughor.kernel.errors import tolerate
            tolerate(exc, "a malformed observation is skipped, never read as a value",
                     counter="settling.malformed_observation")
            continue
    return out


def tables(connection_id: str) -> list[str]:
    prefix = f"{connection_id}:"
    data = _store().load() or {}
    return sorted(k[len(prefix):] for k in data if k.startswith(prefix))


def verdicts(connection_id: str) -> dict[str, SettlingVerdict]:
    return {t: settle_lag(observations(connection_id, t)) for t in _still_read(connection_id)}


def _still_read(connection_id: str) -> list[str]:
    """The tables whose readings still speak for this connection. Readings age out only when a table is written, so one the
    sampler has stopped reading (a metric's table took its place) would hold the connection's answer for good."""
    stamps = {t: str((_store().get(_key(connection_id, t)) or {}).get("last_measured_on") or "") for t in tables(connection_id)}
    newest = max(stamps.values(), default="")
    if not newest:
        return list(stamps)
    floor = (date.fromisoformat(newest) - timedelta(days=KEEP_DAYS)).isoformat()
    return [t for t, stamp in stamps.items() if not stamp or stamp >= floor]


def connection_lag(connection_id: str) -> dict:
    """The connection's lag and where it came from: ``{"days", "source", "still_moving",
    "horizon", "rewrites"}``. ``source`` is ``"learned"`` (every sampled table with enough evidence
    has settled), ``"beyond_horizon"`` (a table was still moving at the oldest age read, so
    ``days`` is a FLOOR — its horizon plus one — and the table is named), or ``None`` (no
    table has earned a verdict yet, ``days`` is None). ``rewrites`` names the tables still moving
    because the source keeps rewriting their old days (`learn.rewrites_history`).

    Before 2026-09-25 a table still moving at the horizon was simply left out of the max:
    theLook read "13 days, learned" while ``order_items`` — the table the headline amounts
    and returns come from — had not settled at 14 (Arc BR's survey, ROADMAP §3.48)."""
    out: dict = {"days": None, "source": None, "still_moving": [], "horizon": 0, "rewrites": []}
    if not connection_id:
        return out
    try:
        vs = verdicts(connection_id)
    except Exception:
        return out
    lags = [v.lag_days for v in vs.values() if v.lag_days is not None]
    # Old days moving says it directly, where recent days cannot: between a redraw and the next they hold still and read as
    # settled (measured in simulation, for a refresh every 3 days or more). A table is still moving whatever they show.
    rewriting = sorted(t for t in vs if rewrites_history(old_readings(connection_id, t)))
    moving = sorted({t for t, v in vs.items() if v.still_moving} | set(rewriting))
    floors = [vs[t].horizon_days + 1 for t in moving]
    if not lags and not floors:
        return out
    out["days"] = max(lags + floors)
    out["source"] = "beyond_horizon" if floors else "learned"
    out["still_moving"] = moving
    out["horizon"] = max((vs[t].horizon_days for t in moving or vs), default=0)
    out["rewrites"] = rewriting
    return out


def learned_lag_days(connection_id: str) -> Optional[int]:
    """The connection's lag: the LARGEST learned lag among its sampled tables — and, for a
    table still moving at the oldest age read, that age plus one (a floor, not a guess) — or
    None when no table has earned a verdict yet. Conservative by construction: a briefing
    that reads three tables waits for the slowest one, including one that has not stopped."""
    return connection_lag(connection_id)["days"]


def summary(connection_id: str) -> dict:
    """The door's read: every sampled table, its evidence and its verdict."""
    rows = []
    lag = connection_lag(connection_id)
    for t in tables(connection_id):
        entry = _store().get(_key(connection_id, t)) or {}
        obs = observations(connection_id, t)
        v = settle_lag(obs)
        reason = ("its old days keep being rewritten, so no age settles and no horizon will name a lag"
                  if t in lag["rewrites"] else v.reason)
        last = str(entry.get("last_measured_on", ""))
        rows.append({
            "table": t,
            "date_column": entry.get("date_column", ""),
            "observations": len(obs),
            "days_observed": len({o.day for o in obs}),
            "readings": len({o.measured_on for o in obs}),
            "last_measured_on": last,
            # The newest reading, day by day: on a source that restates, the ramp is
            # visible in a single reading (young days high, older days settled).
            "latest": [{"day": o.day.isoformat(), "age": o.age, "value": o.value}
                       for o in sorted(obs, key=lambda o: o.day)
                       if o.measured_on.isoformat() == last],
            "verdict": {"lag_days": v.lag_days, "reason": reason,
                        "evidence_days": v.evidence_days, "horizon_days": v.horizon_days,
                        "still_moving": v.still_moving},
        })
    return {"connection_id": connection_id, "tables": rows,
            "learned_lag_days": lag["days"], "lag_source": lag["source"],
            "still_moving": lag["still_moving"], "rewrites": lag["rewrites"],
            "metrics": parts_summary(connection_id)}


def parts_summary(connection_id: str) -> list[dict]:
    """Each metric whose parts are read day by day (BR-8): its parts, the readings kept, the backfill's day and the
    newest morning's — the count every store shows at its door."""
    out = []
    for key, e in parts_series(connection_id):
        back = e.get("backfill") or {}
        kept = readings_of(e)
        out.append({"metric": str(e.get("metric") or _key_parts(key)[1]), "fingerprint": e.get("fingerprint"),
                    "parts": list(e.get("kinds") or []), "types": list(e.get("types") or []),
                    "readings": len(mornings_of(e)), "kept": len(kept),
                    "days_read": len({d for d, _t, _v in kept}),
                    "backfilled_on": back.get("measured_on"), "backfill_days": len(back.get("days") or {}),
                    "last_measured_on": e.get("last_measured_on")})
    return sorted(out, key=lambda r: (r["metric"], str(r["fingerprint"] or "")))
