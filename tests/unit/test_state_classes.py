"""Track B3 — every piece of the platform's state has a class (`pramanyx/db/state_classes.py`).

The population is FOUND, never listed by the same hand as the table: every string constant in `pramanyx/` that ends in
a store's file name (`"system.db"`, `"data/evals.db"`, `Path(...) / "data" / "rbac.db"`). A hand-kept list would pass
the day a store is added without a class; this one fails on it.
"""
from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

from pramanyx.db import backups
from pramanyx.db import state_classes as sc
from pramanyx.doctor import OK, WARN, _state_classes

REPO = Path(__file__).resolve().parents[2]
_STORE_RX = re.compile(r"^[\w./-]*?([a-z0-9_]+\.db)$")


def _constants() -> list[tuple[str, str]]:
    """(value, file) for every string constant in the platform's code."""
    out = []
    for p in (REPO / "pramanyx").rglob("*.py"):
        if p.name == "state_classes.py":
            continue
        try:
            tree = ast.parse(p.read_text())
        except SyntaxError:
            continue
        out += [(n.value, str(p.relative_to(REPO))) for n in ast.walk(tree)
                if isinstance(n, ast.Constant) and isinstance(n.value, str)]
    return out


@pytest.fixture(scope="module")
def stores_in_code() -> dict[str, str]:
    found: dict[str, str] = {}
    for value, where in _constants():
        m = _STORE_RX.match(value)
        if m:
            found.setdefault(m.group(1), where)
    return found


def test_the_scan_reaches_the_stores(stores_in_code):
    """Vacuous-pass guard: a broken walk would find nothing and every store would be 'classified'. Each spelling the
    code uses is in the population — a bare name, a `data/` path, a path joined from parts."""
    assert len(stores_in_code) >= 35, sorted(stores_in_code)
    for spelt in ("system.db", "evals.db", "rbac.db", "checkpoints.db", "audit.db"):
        assert spelt in stores_in_code, spelt


def test_every_store_the_code_names_has_a_class(stores_in_code):
    missing = {name: where for name, where in stores_in_code.items() if sc.classify(name) is None}
    assert not missing, ("a store with no class — add it to pramanyx/db/state_classes.py with its class and owner, "
                         f"then `python -m pramanyx.db.state_classes > docs/STATE_CLASSES.md`: {missing}")
    behind = {name: where for name, where in stores_in_code.items() if sc.classify(name).cls == sc.LEFT_BEHIND}
    assert not behind, f"classified as left behind, yet the code names it: {behind}"


def test_a_left_behind_name_is_named_by_no_code():
    """A file is left behind only while nothing in the platform names it."""
    exact = [e.pattern for e in sc.ENTRIES if e.cls == sc.LEFT_BEHIND and "*" not in e.pattern]
    assert exact, "no exact left-behind name to check"
    named = {name: where for value, where in _constants() for name in exact
             if value == name or value.endswith("/" + name)}
    assert not named, f"the code still names these: {named}"


def _stem(pattern: str) -> str:
    return max(pattern.rsplit("/", 1)[-1].split("*"), key=len)


def test_every_entry_names_the_module_that_writes_it():
    """An owner is a file, and that file names what it owns — so a moved or renamed store makes this fail."""
    wrong = []
    for e in sc.ENTRIES:
        if e.cls == sc.LEFT_BEHIND or not e.owner.startswith(("pramanyx/", "scripts/")):
            continue
        owner = REPO / e.owner
        if not owner.is_file():
            wrong.append(f"{e.pattern}: {e.owner} does not exist")
        elif _stem(e.pattern) not in owner.read_text():
            wrong.append(f"{e.pattern}: {e.owner} does not name {_stem(e.pattern)!r}")
    assert not wrong, wrong
    assert {e.cls for e in sc.ENTRIES} == set(sc.CLASSES)


def test_the_doc_is_rendered_from_the_table():
    doc = (REPO / "docs/STATE_CLASSES.md").read_text()
    assert doc == sc.render_markdown(), "regenerate: python -m pramanyx.db.state_classes > docs/STATE_CLASSES.md"


def test_it_agrees_with_what_backups_never_copy_or_restore():
    """The backups module's own lists name state too; every name in them has a class, and the records a restore never
    puts back over are evidence."""
    for name in backups._NOT_COPIED_TOP:
        assert sc.classify(name) is not None, name
    for name in backups.NEVER_RESTORED:
        assert sc.classify(name).cls == sc.EVIDENCE, name
    for name in backups.CARRIED_FORWARD:
        assert sc.classify(name) is not None, name


@pytest.mark.parametrize("rel, cls", [
    ("system.db", sc.RECORD),
    ("system.db-wal", sc.RECORD),                           # a sidecar is its database's
    ("audit.db-shm", sc.EVIDENCE),
    ("sheets/default/projection.duckdb", sc.EPHEMERAL),     # rebuilt, inside a folder of artifacts
    ("sheets/default/files/book.xlsx", sc.ARTIFACT),
    ("exploration_program.json", sc.EVIDENCE),              # the first match wins over `exploration_*.json`
    ("exploration_34ad77cc.json", sc.LEFT_BEHIND),
    ("episodes_canvas_27502973.jsonl", sc.EVIDENCE),
    ("system.db.corrupt.2026-08-15.bak", sc.NOT_STATE),
    ("_wipe_backup_20260625-213126", sc.NOT_STATE),
    ("ontology_overrides/c1/main/entity/Order.yaml", sc.RECORD),   # moved here by `migrate.top_up` (2026-11-09)
    ("ontology_overrides.moved.json", sc.RECORD),                   # the record that switched it
    ("ontology_overrides_draft/c1/main/entity/Order.yaml", sc.RECORD),
    ("ontology_column_config/8233e4fd/thelook/order_items.yaml", sc.RECORD),   # moved here too (punch list 74)
    ("ontology_column_config/workspace/traffic.hidden", sc.RECORD),            # a removed dataset's tombstone
    ("ontology_column_config.moved.json", sc.RECORD),
])
def test_classify(rel, cls):
    assert sc.classify(rel).cls == cls


def test_an_unknown_name_has_no_class():
    assert sc.classify("mystery.db") is None


def test_the_doctor_names_what_has_no_class_and_what_was_left_behind(tmp_path):
    for name in ("system.db", "system.db-wal", "kernel.db", "uploads", "mystery.db"):
        (tmp_path / name).mkdir() if name == "uploads" else (tmp_path / name).write_bytes(b"x" * 10)
    said = _state_classes(tmp_path)
    assert said.status == WARN and "mystery.db" in said.found and "1 of 4" in said.found, said
    (tmp_path / "mystery.db").unlink()
    said = _state_classes(tmp_path)
    assert said.status == OK, said
    assert said.found.startswith("3 entries, every one classified") and "kernel.db" in said.found, said
