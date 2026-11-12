"""A removed connection — or one removed dataset of it — takes its ontology and its documentation with it.

The user, 2026-10-11: "Removing a connection means also removing its ontology, its metrics and related documents..
make that default". Measured that day on the live install: the connection purge cleared the ontology CACHE and two
of the trees, and nothing else. The people's accepted overrides of five removed connections were still in the
checkout's `data/ontology_overrides/` — which the state-directory sweep never reads (the tree moved into the state
folder on 2026-11-09, `db.migrate.top_up`; its root here is the one the overrides module resolves, wherever it now
lives, and the checkout's stale copy is never touched) — and a removed dataset kept
every tree: its ~250 table and column documents, its recommendations (the datasets a person turned off, its layer),
its column config, its context graph, and its indexed "Schema documentation", searchable still.

Every tree here is laid out ``{root}/{connection}/{dataset}…``, and each root is the STORE'S OWN — read from the
module that writes it, so this follows a store wherever an install keeps it, and never reaches a tree it does not
own: the shipped seed layer (`data/shipped/`) is no store's instance root and is never touched. What the repository
ships for a removed DATASET — its declarations, its column settings — is hidden instead, by a tombstone each store
writes into its own tree BEFORE anything here goes (`overrides.hide_seeds`, `column_config.hide_seeds`); no target
below names one, so it outlives the files. Idempotent: a tree already gone is nothing to do.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Optional

from pramanyx.kernel.errors import tolerate


def _trees() -> list[Path]:
    """Every per-connection ontology tree's root, as its own module resolves it."""
    from pramanyx.ontology import column_config, doctree, drafts, overrides, recommendations

    return [overrides._ROOT, overrides._DRAFT_ROOT, drafts._ROOT, recommendations._ROOT,
            doctree._root(), column_config._root()]


def _context_graph_root() -> Path:
    from pramanyx.ontology import context_graph_store
    return context_graph_store._ROOT


def _names(conn_id: str) -> set[str]:
    return {conn_id, re.sub(r"[^A-Za-z0-9._-]", "_", conn_id)}


def _tracked(path: Path) -> set[Path]:
    """Files under ``path`` the repository TRACKS — content the code shipped into an instance tree (the frozen legacy
    override; the Workspace's column config was too, until it moved to `data/shipped/` on 2026-11-09), which a removal
    never deletes: deleting it changes the repository for every install and leaves this checkout modified
    (2026-10-11: a dataset purge deleted 63 such files). Empty where there is no
    repository, or git cannot be asked — a deployment without a checkout has nothing shipped there."""
    import subprocess
    base = path if path.is_dir() else path.parent
    try:
        got = subprocess.run(["git", "ls-files", "-z", "--", str(path)], cwd=base, capture_output=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return set()
    if got.returncode != 0:
        return set()
    return {(base / p).resolve() for p in got.stdout.decode("utf-8", "replace").split("\0") if p}


def _remove(path: Path, kept: dict) -> int:
    """Remove ``path`` — every file in it but those the repository tracks, which are counted in ``kept``."""
    if not path.exists():
        return 0
    tracked = _tracked(path)
    if not tracked:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
        return 1
    files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
    gone = 0
    for f in files:
        if f.resolve() in tracked:
            kept["kept_shipped"] = kept.get("kept_shipped", 0) + 1
        else:
            f.unlink()
            gone += 1
    if path.is_dir():
        for d in sorted((p for p in path.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
            if not any(d.iterdir()):
                d.rmdir()
    return 1 if gone else 0


def _hide_shipped_column_config(conn_id: str, dataset: Optional[str]) -> Optional[Path]:
    """A removed dataset's column settings the repository SHIPS (`data/shipped/ontology_column_config/`, the
    Workspace's) must not come back once this install's go: the store's tombstone is written FIRST
    (`column_config.hide_seeds`). If it cannot be, the column-config tree is left as it is — returned, to be skipped —
    rather than removing this install's files and leaving the seed answering for a dataset that is gone. A whole
    connection never meets a seed: only the Workspace has one, and it cannot be removed."""
    if dataset is None:
        return None
    from pramanyx.ontology import column_config
    try:
        column_config.hide_seeds(conn_id, dataset)
    except OSError as exc:
        tolerate(exc, f"ontology removal: the shipped column settings of {conn_id}/{dataset} could not be hidden, so "
                      "this install's are left too", counter="ontology.removal.column_config")
        return Path(column_config._root())
    return None


def _hide_shipped_declarations(conn_id: str, dataset: Optional[str]) -> tuple[Path, ...]:
    """A removed dataset's declarations the repository SHIPS (`data/shipped/ontology_overrides/`, filed under the
    connection's scope key or a builtin's id) must not come back once this install's go: the store's tombstone is
    written FIRST (`overrides.hide_seeds`). If it cannot be, the declarations' trees — the published one and the draft —
    are left as they are, returned to be skipped, rather than removing this install's declarations and leaving the seed
    answering for a dataset that is gone. A whole connection writes none: a scope key reaches a connection only through
    its settings, which go with it, and the seed files nothing under a removable connection's id
    (`test_removed_dataset_shipped_declarations`)."""
    if dataset is None:
        return ()
    from pramanyx.ontology import overrides
    try:
        overrides.hide_seeds(conn_id, dataset)
    except (OSError, RuntimeError) as exc:
        tolerate(exc, f"ontology removal: the shipped declarations of {conn_id}/{dataset} could not be hidden, so "
                      "this install's are left too", counter="ontology.removal.declarations")
        return (Path(overrides._ROOT), Path(overrides._DRAFT_ROOT))
    return ()


def _targets(base: Path, dataset: Optional[str]) -> list[Path]:
    """The connection's folder, or one dataset's folder and its single-file forms."""
    if dataset is None:
        return [base]
    return [base / dataset, *(base / f"{dataset}{ext}" for ext in (".yaml", ".yml", ".json"))]


def _ties(node, found: set) -> set:
    """Every ``connection_id`` a declaration names, at any depth — its backing and its measured bindings."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "connection_id" and v:
                found.add(str(v))
            else:
                _ties(v, found)
    elif isinstance(node, list):
        for v in node:
            _ties(v, found)
    return found


def _org_ties(conn_id: str, kept: dict) -> int:
    """The ORGANISATION's ontology entries that stood on a removed connection go with it: a declaration whose ties
    name this connection and no connection that still exists, and then a link left with an end that is gone. A
    declaration still tied to a live connection stays. (2026-10-11: the organisation's Order and Customer, and the
    link between them, were bound only to two removed LuxExperience connections.)"""
    import yaml

    from pramanyx.db.registry import is_registered
    from pramanyx.ontology import overrides

    root = Path(overrides._ROOT)
    gone = 0
    for scope in (p for p in root.glob("org=*/*") if p.is_dir()):
        for f in sorted(scope.glob("*/*.yaml")):
            if f.parent.name == "link":
                continue
            try:
                ties = _ties(yaml.safe_load(f.read_text()) or {}, set())
            except Exception as exc:  # noqa: BLE001 — an unreadable declaration is never guessed at
                tolerate(exc, f"ontology removal: could not read {f}", counter="ontology.removal.org")
                continue
            if conn_id in ties and not any(is_registered(t) for t in ties if t != conn_id):
                gone += _remove(f, kept)
        entities = {f.stem for f in scope.glob("entity/*.yaml")}
        for f in sorted(scope.glob("link/*.yaml")):
            try:
                fields = (yaml.safe_load(f.read_text()) or {}).get("fields") or {}
            except Exception as exc:  # noqa: BLE001
                tolerate(exc, f"ontology removal: could not read {f}", counter="ontology.removal.org")
                continue
            ends = [str(fields.get("from_entity") or ""), str(fields.get("to_entity") or "")]
            if all(ends) and any(e not in entities for e in ends):
                gone += _remove(f, kept)
    return gone


def purge(conn_id: str, dataset: Optional[str] = None) -> dict[str, int]:
    """Remove ``conn_id``'s ontology and documentation — all of it, or one ``dataset``'s. Returns
    ``{"ontology_trees", "context_graph", "schema_docs"}`` (folders removed, context graphs removed, indexed
    documentation unregistered), ``"org_ontology"`` on a connection removal (the organisation's declarations that
    stood on it), and ``"kept_shipped"`` when the repository tracks files in a tree — those stay. Best-effort per
    place; a place that will not go is tolerated and counted out."""
    out = {"ontology_trees": 0, "context_graph": 0, "schema_docs": 0}
    if not conn_id:
        return out
    skip = set(_hide_shipped_declarations(conn_id, dataset))
    column_config_skip = _hide_shipped_column_config(conn_id, dataset)
    if column_config_skip is not None:
        skip.add(column_config_skip)
    for root in _trees():
        if Path(root) in skip:
            continue
        for name in _names(conn_id):
            for target in _targets(Path(root) / name, dataset):
                try:
                    out["ontology_trees"] += _remove(target, out)
                except OSError as exc:
                    tolerate(exc, f"ontology removal: could not remove {target}", counter="ontology.removal")
    if dataset is None:
        out["org_ontology"] = _org_ties(conn_id, out)
    graphs = _context_graph_root()
    if graphs.exists():
        for org in (p for p in graphs.iterdir() if p.is_dir()):
            for name in _names(conn_id):
                for target in _targets(org / name, dataset):
                    try:
                        out["context_graph"] += _remove(target, out)
                    except OSError as exc:
                        tolerate(exc, f"ontology removal: could not remove {target}", counter="ontology.removal")
    try:
        from pramanyx.knowledge import indexer
        if dataset is None:
            out["schema_docs"] += int(indexer.purge_connection_doctrees(conn_id) or 0)
        elif indexer.delete_document(indexer.doctree_doc_id(conn_id, dataset)):
            out["schema_docs"] += 1
    except Exception as exc:  # noqa: BLE001 — the trees are gone either way; the index is said
        tolerate(exc, "ontology removal: the schema documentation could not be unregistered",
                 counter="ontology.removal.index")
    return out
