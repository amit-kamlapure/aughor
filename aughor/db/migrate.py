"""IN-4 — the one-time move of generated state out of the checkout, verified before it counts.

`aughor migrate-state` copies, verifies, then writes the marker that makes
`aughor.db.home.in_use()` true. Nothing before the marker changes where a single store reads,
and the source is NEVER deleted — the install this was written against holds 1.4 GB under
`data/`, and reclaiming that is a person's decision made after they are satisfied, not a step
buried inside a migration.

Three properties, each here because getting it wrong is expensive:

**It refuses while the API is serving.** `data/system.db` has been corrupted four separate
times by concurrent writers, and a migration is the most write-heavy thing the platform can
do. `db.serving.serving_pid()` already answers "is something serving, and is it alive"; if it
says yes, this stops and says which pid to stop.

**A SQLite store is copied through SQLite, not through the filesystem.** These stores run in
WAL mode, where committed transactions can live in `-wal` until a checkpoint. `shutil.copy2`
of the `.db` alone silently drops them, and the copy still opens cleanly — a verified-looking
migration that quietly lost the most recent writes. `sqlite3.Connection.backup()` reads
through the engine and produces a consistent copy including anything in the WAL.

**Verification is per-file and specific.** Every copied byte is compared by SHA-256 for
ordinary files; every SQLite copy answers `PRAGMA integrity_check` and is compared by table
row counts against its source. A count that disagrees fails the whole migration and the marker
is not written, so the deployment goes on reading the state it already had.

**A top-up moves what became state after an install migrated** (`home.TOPPED_UP_ENTRIES`,
2026-11-09). People's ontology declarations, and the per-column settings each install saved, stayed
in the checkout's `data/` when the rest moved, outside every backup. `top_up` copies such an entry's tree into the state home, checks every file
byte for byte (SHA-256 against the source, read again after the copy), and only then writes its
record, `<state>/<entry>.moved.json` — the hash of every file it verified. The record is the
switch (`home.rehome`). A file already in the home with other content is a CONFLICT: refused,
naming both copies, before anything is copied, so nothing switches. The checkout's copy is never
deleted; `aughor doctor` names it as a stale copy a person may remove.

It runs in `migrate-state`, with the API stopped, never at boot: the overrides module resolves its
root when it is imported (the column config resolves on every call, but a top-up beside a serving
process could still race its writes), and the API imports it before its startup runs, so a boot-time move
would leave the serving process writing to the checkout while the next one read the home. Between
processes the switch is clean, and a copy taken with no writer running cannot race a write. The
API refuses to start while a move is owed (`ensure_moved`), so the trap cannot be served again.
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from aughor.db import home

#: Suffixes SQLite writes beside a database. They are copied through `backup()` rather than by
#: hand, so they are SKIPPED as sources in their own right — copying a stale `-wal` over a
#: freshly-backed-up database would be worse than not copying it at all.
_SQLITE_SIDECARS = ("-wal", "-shm", "-journal")

#: What a SQLite file is called here. `.duckdb` is deliberately absent: DuckDB is not SQLite and
#: must be copied as bytes, which is safe because it has no separate WAL sidecar convention.
_SQLITE_SUFFIXES = (".db",)


@dataclass
class Outcome:
    """A typed verdict, never `X or {}` — "nothing to do" and "it failed" must not read alike."""
    status: str                                    # "migrated" | "already" | "refused" | "failed"
    reason: str = ""
    source: Path | None = None
    destination: Path | None = None
    copied: int = 0
    bytes_copied: int = 0
    skipped_authored: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status in ("migrated", "already")


#: Every connection this module opens sets it. Neither side should ever contend — the source is
#: read-only and the API is refused while serving — but a migration that fails instantly on a
#: stray reader is worse than one that waits, and `tests/unit/test_sqlite_contention.py` is right
#: to insist a connect site says what it does about contention rather than staying silent.
_BUSY_TIMEOUT_MS = 30_000


def _connect(path: Path, *, read_only: bool = False) -> sqlite3.Connection:
    uri = f"file:{path}?mode=ro" if read_only else f"file:{path}"
    conn = sqlite3.connect(uri, uri=True)
    conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")
    return conn


def _is_sqlite(path: Path) -> bool:
    return path.suffix in _SQLITE_SUFFIXES


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _table_counts(path: Path) -> dict[str, int]:
    """`{table: rows}` read read-only. Used on BOTH sides of a SQLite copy, because a file that
    opens and passes integrity_check can still be missing everything the WAL held."""
    with _connect(path, read_only=True) as conn:
        tables = [r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        return {t: conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tables}


def _copy_sqlite(src: Path, dst: Path) -> None:
    """Through the engine, so anything sitting in the WAL comes with it."""
    with _connect(src, read_only=True) as source, _connect(dst) as target:
        source.backup(target)


def _verify(src: Path, dst: Path) -> list[str]:
    """What is wrong with this copy, in sentences. Empty means verified."""
    problems: list[str] = []
    if not dst.exists():
        return [f"{src.name}: the copy is not there"]
    if _is_sqlite(src):
        try:
            with _connect(dst, read_only=True) as conn:
                verdict = conn.execute("PRAGMA integrity_check").fetchone()[0]
            if verdict != "ok":
                problems.append(f"{src.name}: integrity_check said {verdict!r}")
            before, after = _table_counts(src), _table_counts(dst)
            for table, rows in before.items():
                if after.get(table) != rows:
                    problems.append(
                        f"{src.name}: table {table} has {after.get(table)} rows, source has {rows}")
        except sqlite3.Error as exc:
            problems.append(f"{src.name}: the copy could not be read back ({exc})")
    elif _sha256(src) != _sha256(dst):
        problems.append(f"{src.name}: the copy's contents differ from the source")
    return problems


def sources(state: Path) -> tuple[list[Path], list[str]]:
    """``(what moves, what stays)`` for a state directory — top-level entries only.

    Authored entries stay: `data/` is mixed, and its versioned content belongs to the checkout.
    SQLite sidecars are skipped because `backup()` carries their contents. A topped-up entry is in
    neither list: it moves by `top_up`, which `migrate` runs before it writes the marker."""
    moving: list[Path] = []
    staying: list[str] = []
    for entry in sorted(state.iterdir()):
        if entry.name in home.AUTHORED_ENTRIES:
            staying.append(entry.name)
            continue
        if entry.name in home.TOPPED_UP_ENTRIES:
            continue
        if any(entry.name.endswith(s) for s in _SQLITE_SIDECARS):
            continue
        moving.append(entry)
    return moving, staying


def migrate(source: Path, *, force_serving: bool = False) -> Outcome:
    """Copy `source` into the data home, verify it, and only then write the marker."""
    destination = home.state_home()

    if home.in_use():
        return Outcome("already", f"the home is already in use at {destination}",
                       source=source, destination=destination)
    if not source.is_dir():
        return Outcome("refused", f"there is nothing at {source} to migrate", source=source)

    # A home pointed inside the checkout's own `data/` would make `copytree` walk into the copy
    # it is writing. Cheap to refuse, unbounded to discover.
    src_res, dst_res = source.resolve(), destination.resolve()
    if dst_res == src_res or src_res in dst_res.parents:
        return Outcome("refused",
                       f"the data home ({dst_res}) is inside the directory being migrated "
                       f"({src_res}). Point AUGHOR_HOME somewhere outside the checkout.",
                       source=source, destination=destination)

    if not force_serving:
        from aughor.db.serving import serving_pid
        pid = serving_pid()
        if pid:
            return Outcome(
                "refused",
                f"the API is serving as pid {pid}. A migration is the most write-heavy thing "
                f"the platform does, and data/system.db has been corrupted four times by a "
                f"second writer — stop it first, then run this again.",
                source=source, destination=destination)

    moving, staying = sources(source)
    if not moving:
        return Outcome("refused", f"{source} holds no generated state to move",
                       source=source, destination=destination, skipped_authored=staying)

    destination.mkdir(parents=True, exist_ok=True)
    out = Outcome("migrated", source=source, destination=destination, skipped_authored=staying)

    for entry in moving:
        target = destination / entry.name
        try:
            if entry.is_dir():
                shutil.copytree(entry, target, dirs_exist_ok=True)
                out.bytes_copied += sum(f.stat().st_size for f in entry.rglob("*") if f.is_file())
            elif _is_sqlite(entry):
                _copy_sqlite(entry, target)
                out.bytes_copied += entry.stat().st_size
            else:
                shutil.copy2(entry, target)
                out.bytes_copied += entry.stat().st_size
            out.copied += 1
        except Exception as exc:                      # noqa: BLE001 — reported, never swallowed
            out.problems.append(f"{entry.name}: could not be copied ({exc})")

    for entry in moving:
        if entry.is_dir():
            for f in entry.rglob("*"):
                if f.is_file():
                    out.problems.extend(_verify(f, destination / entry.name / f.relative_to(entry)))
        else:
            out.problems.extend(_verify(entry, destination / entry.name))

    # The trees that move by a top-up move here too, verified the same way, before the marker: a
    # fresh migration leaves nothing owed.
    if not out.problems:
        for name in home.TOPPED_UP_ENTRIES:
            moved = top_up(name, source=source, force_serving=True)
            if not moved.ok:
                out.problems += moved.conflicts + moved.problems or [moved.reason]

    if out.problems:
        out.status = "failed"
        out.reason = (f"{len(out.problems)} problem(s) verifying the copy. The marker was NOT "
                      f"written, so the platform goes on reading {source} exactly as before.")
        return out

    home.marker_path().parent.mkdir(parents=True, exist_ok=True)
    home.marker_path().write_text(
        f"state migrated from {source}\n", encoding="utf-8")
    out.reason = (f"{out.copied} entries verified into {destination}. The originals are "
                  f"UNTOUCHED at {source} — delete them yourself once you are satisfied.")
    return out


# ── the top-up: a tree that became an install's state after it migrated ────────────────────────

#: The record's envelope. A reader refuses a record newer than it understands rather than
#: half-reading it (registered with the other envelopes in `kernel/freshness.py`).
MOVED_RECORD_FORMAT = 1

#: Never copied: the Mac's folder settings, not state.
_NOT_COPIED = frozenset({".DS_Store"})

#: A copy lands beside its target under this suffix and is renamed over it only once it checks, so
#: a run stopped half-way leaves no half-written file where the tree reads.
_TMP_SUFFIX = ".topup.tmp"


@dataclass
class TopUp:
    """A typed verdict for one entry's move. "moved" and "already" are fine; "refused",
    "conflict" and "failed" leave the checkout's copy the one read, and say why."""
    name: str
    status: str                       # "moved" | "already" | "refused" | "conflict" | "failed"
    reason: str = ""
    source: Optional[Path] = None
    destination: Optional[Path] = None
    files: int = 0
    copied: int = 0
    bytes_copied: int = 0
    conflicts: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.status in ("moved", "already")


def _tree(root: Path) -> tuple[dict[str, Path], list[str]]:
    """``({rel: path}, problems)`` — every regular file under ``root``. A link is never followed:
    what it points at is not part of the tree, and copying it would copy something else."""
    found: dict[str, Path] = {}
    problems: list[str] = []
    if not root.is_dir():
        return found, problems
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        here = Path(dirpath)
        for n in dirnames:
            if (here / n).is_symlink():
                problems.append(f"{(here / n).relative_to(root).as_posix()}: a link — move what it points at by hand")
        for n in filenames:
            p = here / n
            rel = p.relative_to(root).as_posix()
            if n in _NOT_COPIED:
                continue
            if p.is_symlink() or not p.is_file():
                problems.append(f"{rel}: not a regular file — move it by hand")
                continue
            found[rel] = p
    return found, problems


def read_record(name: str) -> Optional[dict]:
    """The record of ``name``'s move, or None before it. A record that cannot be read RAISES rather
    than reading as "not moved", which would send the next run copying the checkout's stale copy
    over the home's."""
    path = home.moved_record(name)
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or int(data.get("format") or 0) > MOVED_RECORD_FORMAT:
        raise ValueError(f"{path} is a format newer than this version of Aughor reads")
    return data


def _already(out: TopUp, record: dict) -> TopUp:
    """A second run: the home checked against the record. A file people edited or withdrew since
    the move is their change, said and counted — never copied over from the checkout again."""
    files = record.get("files") or {}
    out.files = len(files)
    if out.destination is None or not out.destination.is_dir():
        out.status = "failed"
        out.reason = (f"the record says {out.name} moved on {record.get('moved_at')}, but {out.destination} is not "
                      "there — everything in it reads as gone. Put it back from a backup (`aughor backups`).")
        return out
    same = edited = gone = 0
    for rel, entry in files.items():
        p = out.destination / rel
        if not p.is_file():
            gone += 1
        elif _sha256(p) == entry.get("sha256"):
            same += 1
        else:
            edited += 1
    out.status = "already"
    out.reason = (f"already — moved on {record.get('moved_at')}; {same} of {len(files)} files verified as moved"
                  + (f", {edited} edited and {gone} withdrawn here since" if edited or gone else "")
                  + f". {out.destination} is the tree read.")
    return out


def top_up(name: str, *, source: Optional[Path] = None, force_serving: bool = False) -> TopUp:
    """Move ``name`` — a `home.TOPPED_UP_ENTRIES` tree — from ``source`` (the checkout's
    ``data/``) into the state home: copy, check every file, and only then write its record.

    Idempotent: once the record is there, a run checks the home against it and answers "already".
    The checkout's copy is never touched."""
    if name not in home.TOPPED_UP_ENTRIES:
        raise ValueError(f"{name} is not an entry that moves by a top-up")
    src = Path(source or home.checkout_data()) / name
    dst = home.state_home() / name
    out = TopUp(name, "failed", source=src, destination=dst)
    try:
        record = read_record(name)
    except (OSError, ValueError) as exc:
        out.status = "refused"
        out.reason = f"the record of the move could not be read ({exc}) — nothing was done"
        return out
    if record is not None:
        return _already(out, record)

    if not force_serving:
        from aughor.db.serving import serving_pid
        pid = serving_pid()
        if pid:
            out.status = "refused"
            out.reason = (f"the API is serving as pid {pid}, and it writes into this tree — stop it first, then "
                          "run this again.")
            return out
    src_res, dst_res = src.resolve(), dst.resolve()
    if src_res == dst_res or src_res in dst_res.parents or dst_res in src_res.parents:
        out.status = "refused"
        out.reason = f"the home's tree ({dst_res}) and the checkout's ({src_res}) overlap — nothing was done"
        return out

    files, problems = _tree(src)
    if problems:
        out.status, out.problems = "refused", problems
        out.reason = f"{src} holds what a copy cannot carry. Nothing was copied and nothing switched."
        return out
    shas = {rel: _sha256(p) for rel, p in files.items()}

    # Every conflict is found BEFORE anything is copied, so a refusal changes nothing.
    there_already: list[str] = []
    for rel, sha in sorted(shas.items()):
        there = dst / rel
        if there.is_symlink() or (there.exists() and not there.is_file()):
            out.conflicts.append(f"{rel}: the home holds something other than a file at {there}")
        elif there.is_file():
            if _sha256(there) == sha:
                there_already.append(rel)
            else:
                out.conflicts.append(f"{rel}: the checkout's copy ({files[rel]}) and the home's ({there}) differ")
    if out.conflicts:
        out.status = "conflict"
        out.reason = (f"{len(out.conflicts)} file(s) differ between the checkout and the home. Nothing was copied "
                      f"and nothing switched — {src} is still the tree read. Decide which copy of each is right, "
                      "make the other the same (or remove the home's), then run this again.")
        return out

    dst.mkdir(parents=True, exist_ok=True)
    for stale in dst.rglob(f"*{_TMP_SUFFIX}"):          # a stopped run's half-copy, never a file the tree reads
        stale.unlink(missing_ok=True)
    for rel in sorted(set(shas) - set(there_already)):
        target = dst / rel
        tmp = target.with_name(f".{target.name}{_TMP_SUFFIX}")
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(files[rel], tmp)
            if _sha256(tmp) != shas[rel]:
                out.problems.append(f"{rel}: the copy's contents differ from the checkout's")
                tmp.unlink(missing_ok=True)
                continue
            os.replace(tmp, target)
            out.copied += 1
            out.bytes_copied += target.stat().st_size
        except OSError as exc:
            out.problems.append(f"{rel}: could not be copied ({exc})")
            tmp.unlink(missing_ok=True)

    # Checked again in place, both sides: the home's copy is the checkout's, and the checkout's did not move under it.
    for rel, sha in sorted(shas.items()):
        if not (dst / rel).is_file() or _sha256(dst / rel) != sha:
            out.problems.append(f"{rel}: in the home, its contents differ from the checkout's")
        elif _sha256(files[rel]) != sha:
            out.problems.append(f"{rel}: the checkout's copy changed while it was moved — is something still writing there?")
    if out.problems:
        out.status = "failed"
        out.reason = (f"{len(out.problems)} problem(s) verifying the copy. The record was NOT written, so {src} is "
                      "still the tree read; a run again picks up from what was copied.")
        return out

    out.files = len(shas)
    record = {"format": MOVED_RECORD_FORMAT, "entry": name, "from": str(src), "to": str(dst),
              "moved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "files": {rel: {"sha256": d, "bytes": files[rel].stat().st_size} for rel, d in sorted(shas.items())}}
    path = home.moved_record(name)
    tmp = path.with_name(path.name + ".writing")
    tmp.write_text(json.dumps(record, indent=1), encoding="utf-8")
    os.replace(tmp, path)                               # a reader sees no record or the whole one
    out.status = "moved"
    out.reason = (f"{out.files} files verified into {dst} ({out.copied} copied, {len(there_already)} already there). "
                  f"The checkout's copy at {src} is left as it was and nothing reads it now — `aughor doctor` says "
                  "when you may remove it.")
    return out


def owed() -> list[str]:
    """The moves this install still owes, in sentences: none before the home is in use, none for an
    entry whose env var points its store somewhere, none once an entry's record is in the home."""
    if not home.in_use():
        return []
    return [f"{name} is still read from the checkout ({home.checkout_data() / name}), outside every backup of the "
            f"state folder ({home.state_home()})"
            for name, env in home.TOPPED_UP_ENTRIES.items() if not os.environ.get(env) and not home.moved(name)]


class MoveOwed(RuntimeError):
    """The API was started while a top-up is owed."""


def ensure_moved() -> None:
    """Refuse to serve while a move is owed. The API calls this first at startup: served, the owed tree
    would go on taking writes outside every backup."""
    owing = owed()
    if owing:
        raise MoveOwed("this install owes a move into its data home: " + "; ".join(owing) + ". The API does not "
                       "start until it is done — run `aughor migrate-state --yes` (it copies, checks every file and "
                       "records the move), then start the API again.")


def _tracked(root: Path) -> set[str]:
    """Files under ``root`` the repository tracks, relative to it; empty without git or a repository."""
    try:
        got = subprocess.run(["git", "ls-files", "-z", "--", "."], cwd=root, capture_output=True, timeout=15)
    except (OSError, subprocess.SubprocessError):
        return set()
    if got.returncode != 0:
        return set()
    return {p for p in got.stdout.decode("utf-8", "replace").split("\0") if p}


def left_in_checkout(name: str, record: dict) -> dict:
    """What the tree the move came FROM still holds (the record names it): ``{"path", "files", "untracked",
    "changed"}``. The repository's own files are not counted as left: they stay with the checkout. ``changed`` lists
    files that differ from what was moved, or appeared since — something wrote there after the move. Only reads."""
    src = Path(record.get("from") or home.checkout_data() / name)
    files, _ = _tree(src)
    tracked = _tracked(src) if files else set()
    moved_files = record.get("files") or {}
    untracked = [rel for rel in files if rel not in tracked]
    changed = sorted(rel for rel in untracked
                     if rel not in moved_files or _sha256(files[rel]) != moved_files[rel].get("sha256"))
    return {"path": src, "files": len(files), "untracked": len(untracked), "changed": changed}
