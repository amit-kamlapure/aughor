"""SH-6 · a sheet placed on the ontology — on a person's request, never by default (ROADMAP §3.64; punch list 62).

The user's six calls, 2026-11-09 (punch list item 64):

1. **Nothing by default.** A sheet is placed on the ontology as an entity only when a person asks, from the sheet, and
   only if the ontology's requirements are met: a key column that is one per object (`requirements`). A new entity goes
   in the Sheets connection's own ontology; the organisation's ontology maps it to other entities later, by a person.
2. **A renamed column is followed**, without breaking later work or rewriting anything already produced.
3. **An edit that repeats the key is refused** (`key_check`, run inside the transaction every write of a sheet's values
   commits in, so typing, a paste, undo, redo, Put back and a merge are all held to it).
4. **A removed sheet leaves its entity declared**: removing an ontology object takes its own, more careful path (the
   entity's own withdrawal, drafted and published). The entity says its sheet is gone and who removed it.
5. **A sheet shared with chosen people** leaves its entity named, with no objects, for anyone else — told who to ask.
6. **`_row` is never a property**, and a sheet with no unique column cannot back an entity.

**Where it lives.** One built-in connection serves every organisation's sheets, so the Sheets ontology is scoped by
ORGANISATION (`scope`), never by a dataset a request names: another organisation's sheet entities are no scope a
reader can ask for. Its graph is built from the declarations alone (`served_graph`) — no profile and no build ever
runs over a sheet (`SheetsConnection.build_intelligence`) — and with nothing placed there is no graph, as before.

**How it reads.** Through a SELECT of the sheet's table generated at every read (`read_sql`): each property under the
identifier it was given when placed, read from whatever its column — kept by the column's stable id — is called NOW.
So a rename is followed at every read and nothing is rewritten: not the declaration, not a finding or a Briefing that
quoted the old statement. The statement names the sheet's table, so the Sheets door's own words still answer for it: a
sheet not shared with the reader is refused naming who to ask (`sharing.refusal_for_statement`), a removed one names
who removed it (`dependents.removed_words`). It is a query backing, so it links to nothing: a link to a query-backed
type stays refused (ROADMAP §6 item 31, the user's call of 2026-11-08).
"""
from __future__ import annotations

import re
from typing import Any, Callable, Optional

from aughor.db.registry import SHEETS_ID
from aughor.sheets.imports import ident
from aughor.sheets.model import Column, Sheet

#: The backing's part that names the sheet a declaration reads: ``{id, table, key, columns: {property: column id}}``.
SHEET = "sheet"
#: The roles a key may have: a value people keep. A column derived from others (computed, looked up, totalled) changes
#: when they do, so no edit of it could be refused for repeating a key.
KEY_ROLES = ("stored",)

_NOT_IDENT = re.compile(r"[^A-Za-z0-9_]+")


class NotPlaced(ValueError):
    """A sheet that cannot be placed on the ontology as asked, and why."""


def scope() -> str:
    """The Sheets ontology's scope: the organisation whose sheets they are."""
    from aughor.org.context import current_org_id
    return current_org_id() or "default"


def is_sheets(connection_id: Optional[str]) -> bool:
    return str(connection_id or "") == SHEETS_ID


# ── what a sheet's entity reads ─────────────────────────────────────────────────────────────────────────────────────

def identifier(name: str, taken: set[str]) -> str:
    """A property's identifier for a column: its name in lower snake case, unique among ``taken``."""
    base = _NOT_IDENT.sub("_", str(name or "").strip()).strip("_").lower()[:60] or "column"
    if not re.match(r"[a-z_]", base):
        base = f"c_{base}"
    out, n = base, 2
    while out in taken:
        out, n = f"{base}_{n}", n + 1
    return out


def read_sql(sheet: Sheet, columns: dict[str, str]) -> tuple[str, list[str]]:
    """``(the SELECT an entity reads, [properties whose column is gone])``: each property from the column it reads,
    found by the column's id and named as it is called now."""
    by_id = {c.id: c for c in sheet.columns}
    parts, gone = [], []
    for prop, cid in columns.items():
        c = by_id.get(cid)
        if c is None:
            gone.append(prop)
            continue
        parts.append(f"{ident(c.name)} AS {prop}")
    return (f"SELECT {', '.join(parts) or 'NULL AS nothing'} FROM {ident(sheet.table)}", gone)


def column_counts(sheet: Sheet, columns: list[Column]) -> dict[str, dict]:
    """``{column id: {"rows", "filled", "distinct"}}`` over the sheet as it stands — one statement."""
    from aughor.sheets import projection
    if not columns:
        return {}
    parts = ["COUNT(*)"] + [f"COUNT({ident(c.name)}), COUNT(DISTINCT {ident(c.name)})" for c in columns]
    row = projection.cursor().execute(f"SELECT {', '.join(parts)} FROM {ident(sheet.table)}").fetchone()
    rows = int(row[0] or 0)
    return {c.id: {"rows": rows, "filled": int(row[1 + 2 * i] or 0), "distinct": int(row[2 + 2 * i] or 0)}
            for i, c in enumerate(columns)}


def key_candidates(sheet: Sheet) -> list[dict]:
    """Each column the sheet could be placed by, and whether it may be its key — one per object, never blank twice —
    for the person choosing (and the door that checks the choice again)."""
    stored = [c for c in sheet.columns if c.role in KEY_ROLES]
    counts = column_counts(sheet, stored)
    out = []
    for c in sheet.columns:
        n = counts.get(c.id) or {}
        unique = bool(n) and n["filled"] > 0 and n["distinct"] == n["filled"]
        if c.role not in KEY_ROLES:
            why = f"{c.name} is {c.role}, read from other values, so an edit of it could not be held to one per object"
        elif not n.get("filled"):
            why = f"{c.name} holds no value"
        elif not unique:
            why = (f"{c.name} repeats a value: {n['distinct']:,} distinct over {n['filled']:,} filled rows, so it is not "
                   "one per object")
        else:
            why = ""
        out.append({"id": c.id, "name": c.name, "kind": c.kind, "role": c.role, "hidden": bool(c.hidden),
                    "rows": n.get("rows"), "filled": n.get("filled"), "distinct": n.get("distinct"),
                    "key": not why, "why": why})
    return out


# ── placing a sheet ─────────────────────────────────────────────────────────────────────────────────────────────────

def entity_id_for(name: str) -> str:
    """An entity's id from what a person calls it: PascalCase, letters and digits, starting with a capital."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", str(name or "")) if w]
    out = "".join(w[:1].upper() + w[1:] for w in words)[:64]
    return out if out[:1].isalpha() else f"Sheet{out}"[:64]


def spec_for(sheet: Sheet, *, display_name: str, key: str, columns: Optional[list[str]] = None, entity_id: str = "",
             description: str = "", by: str = "") -> dict:
    """The declaration a person's request places — the spec the ontology's own declare door reads — once the
    ontology's requirements hold; `NotPlaced` with why when one does not. ``key`` and ``columns`` name columns by id or
    name; ``columns`` omitted keeps every column the sheet shows. `_row` is never one."""
    name = " ".join(str(display_name or "").split())
    if not name:
        raise NotPlaced("an entity needs a name a reader calls it by")
    if str(key or "").strip().lower() == "_row" or "_row" in [str(c).strip().lower() for c in columns or []]:
        raise NotPlaced("_row is the sheet's own number for each row, never one of an entity's properties: choose a "
                        "column of the sheet as its key")
    k = sheet.column(str(key or ""))
    if k is None:
        raise NotPlaced(f"{sheet.name} has no column {key!r} to be the key")
    candidate = next(c for c in key_candidates(sheet) if c["id"] == k.id)
    if not candidate["key"]:
        raise NotPlaced(f"{candidate['why']}. A sheet is placed on the ontology by a column that is one per object")
    if columns is None:
        chosen = [c for c in sheet.columns if not c.hidden]
    else:
        chosen = []
        for ref in columns:
            c = sheet.column(str(ref))
            if c is None:
                raise NotPlaced(f"{sheet.name} has no column {ref!r}")
            chosen.append(c)
    if k.id not in {c.id for c in chosen}:
        chosen.insert(0, k)
    taken: set[str] = set()
    props: dict[str, str] = {}
    for c in chosen:
        if c.id in props.values():
            continue
        props[identifier(c.name, taken)] = c.id
        taken.add(next(p for p, cid in props.items() if cid == c.id))
    key_prop = next(p for p, cid in props.items() if cid == k.id)
    sql, _gone = read_sql(sheet, props)
    from datetime import datetime, timezone
    return {
        "id": entity_id or entity_id_for(name), "display_name": name, "description": str(description or "").strip(),
        "origin": "human", "provenance": f'placed from the sheet "{sheet.name}"' + (f" by {by}" if by else ""),
        "backing": {"kind": "query", "sql": sql, "primary_key": key_prop,
                    SHEET: {"id": sheet.id, "table": sheet.table, "key": k.id, "columns": props,
                            "names": {p: sheet.column(cid).name for p, cid in props.items()}, "placed_by": by, "placed_at": datetime.now(timezone.utc).isoformat()[:19] + "Z"}},
    }


# ── the declarations, and the graph made of them ────────────────────────────────────────────────────────────────────

def declarations(*, drafts: bool = False) -> list:
    """The entity declarations placed from a sheet, of this organisation — as the current view reads them, or with
    ``drafts`` as the draft does (what is placed but not yet published counts there too)."""
    from aughor.ontology import overrides
    try:
        if drafts:
            with overrides.viewing("draft"):
                found = overrides.load_overrides(SHEETS_ID, scope())
        else:
            found = overrides.load_overrides(SHEETS_ID, scope())
    except Exception as exc:  # noqa: BLE001 — an unreadable tree places nothing, and says so in the log
        from aughor.kernel.errors import tolerate
        tolerate(exc, "the Sheets ontology's declarations could not be read", counter="sheets.ontology.read")
        return []
    return [ov for ov in found if ov.target_kind == "entity"
            and isinstance((ov.fields.get("backing") or {}).get(SHEET), dict)]


def placed(sheet_id: str, *, drafts: bool = True) -> list[dict]:
    """The entities a sheet is placed as: ``[{"entity", "display_name", "key", "key_property"}]`` — drafts included by
    default, since a key placed but not yet published is a key already promised."""
    out = []
    for ov in declarations(drafts=drafts):
        s = ov.fields["backing"][SHEET]
        if str(s.get("id")) == sheet_id:
            out.append({"entity": ov.target_id, "display_name": str(ov.fields.get("display_name") or ov.target_id),
                        "key": str(s.get("key") or ""), "key_property": str(ov.fields["backing"].get("primary_key") or "")})
    return out


def placed_and_published(sheet_id: str) -> list[dict]:
    """`placed`, each saying whether a person has published it yet (``published``): a draft reaches no reader."""
    from aughor.ontology import overrides
    with overrides.viewing("published"):
        published = {ov.target_id for ov in declarations()}
    return [{**p, "published": p["entity"] in published} for p in placed(sheet_id)]


def served_graph() -> Optional[Any]:
    """The Sheets ontology of this organisation, made of its declarations alone and following each sheet as it stands;
    None when nothing is placed, so every reader of the Sheets connection finds no ontology, as before."""
    decls = declarations()
    if not decls:
        return None
    from aughor.ontology.models import OntologyGraph
    from aughor.ontology.store import overlay_human_overrides
    graph = OntologyGraph(connection_id=SHEETS_ID, schema_name=scope(), schema_fingerprint="declared-from-sheets")
    graph = overlay_human_overrides(graph, SHEETS_ID, scope())
    follow(graph, decls)
    return graph


def follow(graph: Any, decls: list) -> None:
    """Each placed entity as its sheet stands now: its statement read from the columns as they are called, a property
    whose column is gone dropped and named, and a sheet removed or a key column gone said — the entity stays."""
    from aughor.sheets import model
    from aughor.sheets.dependents import removed_sentence
    for ov in decls:
        entity = graph.entities.get(ov.target_id)
        if entity is None or entity.backing is None:
            continue
        s = ov.fields["backing"][SHEET]
        sheet = model.get(str(s.get("id")))
        notes: list[str] = []
        verified = entity.backing.verified
        if sheet is None:
            gone = removed_sentence(str(s.get("id"))) or "Its sheet was removed."
            notes.append(f"{gone} The entity stays on the ontology, as placed, and none of its objects can be read; "
                         "removing the entity is its own step")
            verified = False
            sql = entity.backing.sql
        else:
            columns = {str(p): str(cid) for p, cid in (s.get("columns") or {}).items()}
            names = {str(p): str(n) for p, n in (s.get("names") or {}).items()}
            sql, gone = read_sql(sheet, columns)
            key_prop = entity.backing.primary_key
            renamed = [(p, sheet.column(cid).name) for p, cid in columns.items()
                       if sheet.column(cid) is not None and names.get(p, sheet.column(cid).name) != sheet.column(cid).name]
            if renamed:
                notes.append("follows its sheet: " + "; ".join(f"{p} reads the column now called {n!r}" for p, n in renamed))
            if key_prop in gone:
                notes.append(f"its key column was removed from the sheet \"{sheet.name}\", so none of its objects can "
                             "be read until a column is placed as its key again")
                verified = False
            elif gone:
                notes.append("its column" + ("s " if len(gone) > 1 else " ") + ", ".join(gone)
                             + f" {'were' if len(gone) > 1 else 'was'} removed from the sheet, so "
                             + ("they are" if len(gone) > 1 else "it is") + " no longer among its properties")
            entity.properties = {n: p for n, p in entity.properties.items() if n not in gone or n == key_prop}
        note = "; ".join(x for x in [entity.backing.verification_note, *notes] if x)
        entity.backing = entity.backing.model_copy(update={"sql": sql, "verified": verified,
                                                           "verification_note": note})
        entity.grain_verified = bool(verified)


# ── a key is one per object ─────────────────────────────────────────────────────────────────────────────────────────

def key_check(sheet: Sheet) -> Optional[Callable[[list, list], None]]:
    """The check a write of this sheet's values passes inside its transaction (`overlay.save_sheet_change(check=…)`),
    or None when the sheet is placed as no entity — the common case costs one read of the declarations."""
    keys = [p for p in placed(sheet.id) if sheet.column(p["key"]) is not None]
    if not keys:
        return None

    def check(would_be: list, written: list) -> None:
        from aughor.actions.overlay import SHEET_ROW
        for p in keys:
            key = sheet.column(p["key"])
            # a row this change adds, removes or brings back, or whose key it sets: an edit of another column of a row
            # is never refused for a repeat it did not make
            touched = {int(w["row"]) for w in written if w.get("kind") == SHEET_ROW or w.get("column") == key.id}
            if not touched:
                continue
            words = repeated_key(sheet, key, would_be, touched, entity=p["display_name"])
            if words:
                from aughor.sheets.service import Refused
                raise Refused(words)

    return check


def repeated_key(sheet: Sheet, key: Column, would_be: list, touched: set[int], *, entity: str) -> str:
    """Why the sheet's values as they would stand repeat ``key`` in a row this change touches, or "". Read as the
    projection reads them — the source's value cast to the column's kind, a cell set over it read with TRY_CAST — so
    two values the sheet would show as one are one here too."""
    import duckdb

    from aughor.actions.overlay import SHEET_CELL, SHEET_ROW
    from aughor.sheets import files, kinds
    from aughor.sheets.projection import cell_text

    typ = kinds.duck_type(key.kind, integer=key.integer)
    removed = {int(e.row_key) for e in would_be if e.kind == SHEET_ROW and e.body == "removed"}
    added = {int(e.row_key) for e in would_be if e.kind == SHEET_ROW and e.body == "added"}
    cells = [(int(e.row_key), cell_text(e.body)) for e in would_be if e.kind == SHEET_CELL and e.column == key.id]
    con = duckdb.connect()
    try:
        src = files.source_parquet(sheet.id)
        base = "SELECT CAST(NULL AS BIGINT) AS r, CAST(NULL AS {t}) AS v WHERE FALSE".format(t=typ)
        if src.exists():
            have = {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{src.as_posix()}')").fetchall()}
            if key.id in have:
                base = (f"SELECT CAST(s._row AS BIGINT) AS r, CAST(s.{ident(key.id)} AS {typ}) AS v "
                        f"FROM read_parquet('{src.as_posix()}') s")
            else:
                base = f"SELECT CAST(s._row AS BIGINT) AS r, CAST(NULL AS {typ}) AS v FROM read_parquet('{src.as_posix()}') s"
        con.execute("CREATE TEMP TABLE _cells (r BIGINT, t VARCHAR)")
        if cells:
            con.executemany("INSERT INTO _cells VALUES (?, ?)", cells)
        con.execute("CREATE TEMP TABLE _gone (r BIGINT)")
        if removed:
            con.executemany("INSERT INTO _gone VALUES (?)", [(r,) for r in sorted(removed)])
        con.execute("CREATE TEMP TABLE _new (r BIGINT)")
        if added:
            con.executemany("INSERT INTO _new VALUES (?)", [(r,) for r in sorted(added)])
        rows = con.execute(f"""
            WITH src AS ({base}),
                 present AS (SELECT r, v FROM src WHERE r NOT IN (SELECT r FROM _gone)
                             UNION ALL
                             SELECT r, CAST(NULL AS {typ}) FROM _new
                             WHERE r NOT IN (SELECT r FROM _gone) AND r NOT IN (SELECT r FROM src)),
                 now AS (SELECT p.r, CASE WHEN c.r IS NOT NULL THEN TRY_CAST(c.t AS {typ}) ELSE p.v END AS v
                         FROM present p LEFT JOIN _cells c ON c.r = p.r)
            SELECT CAST(v AS VARCHAR), list(r ORDER BY r) FROM now WHERE v IS NOT NULL
            GROUP BY v HAVING COUNT(*) > 1""").fetchall()
    finally:
        con.close()
    for value, holders in rows:
        held = [int(r) for r in holders]
        if touched & set(held):
            mine = sorted(touched & set(held))
            others = [r for r in held if r not in mine] or held[1:]
            return (f'{key.name} would hold {value} in row {mine[0]} and row {others[0]} — and the sheet "{sheet.name}" '
                    f"is the entity {entity} on the ontology, whose key {key.name} is one per object. Nothing was "
                    "changed; give it a value no other row holds.")
    return ""


def kind_repeats_key(sheet: Sheet, c: Column, kind: str) -> str:
    """Why changing ``c``'s kind to ``kind`` would make two of its values one while it is an entity's key, or ""."""
    keys = [p for p in placed(sheet.id) if p["key"] == c.id]
    if not keys:
        return ""
    from aughor.sheets import kinds, projection
    typ = kinds.duck_type(kind, integer=False)
    row = projection.cursor().execute(
        f"SELECT CAST(TRY_CAST({ident(c.name)} AS {typ}) AS VARCHAR) AS v, COUNT(*) FROM {ident(sheet.table)} "
        f"WHERE TRY_CAST({ident(c.name)} AS {typ}) IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1 LIMIT 1").fetchone()
    if row is None:
        return ""
    return (f"as {kind}, {c.name} would hold {row[0]} in {int(row[1])} rows — and it is the key of the entity "
            f"{keys[0]['display_name']} on the ontology, one per object. Its kind was not changed.")
