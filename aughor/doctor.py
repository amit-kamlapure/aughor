"""IN-1 — `aughor doctor`: what is wrong with this install, and what to do about it.

Every check answers with a **typed verdict**, never a bare boolean and never `X or {}`: "I
could not tell" and "it is fine" are different answers, and collapsing them is how a check
starts reading as a pass. Each `Check` carries what was WANTED, what was FOUND, a reason when
it is not ok, and the FIX — the shape `cli._print_boot_summary` already uses for the model
verdict, lifted rather than reinvented.

**Two rules this module will not break.**

*No model call, no warehouse query.* "Is a model configured" is answered from
`llm_config.json` and the environment only. The obvious route —
`routers/system.py::_llm_readiness` → `provider.resolve_binding` → `org_config._conn()` —
issues `CREATE TABLE …; commit` against `data/org_llm.db`, so a doctor built that way becomes
a SECOND WRITER on `data/` while the API serves. That is the exact shape behind four
`system.db` corruptions, and a diagnostic that can corrupt the thing it is diagnosing is worse
than no diagnostic.

*It only reads.* Nothing here creates a directory, a file or a table. Writability is tested by
asking the filesystem, not by writing a probe file into a store directory.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

#: A check that cannot answer says so. `unknown` is not `fail` — a missing `lsof` is not a
#: broken port, and reporting it as one sends a person to fix something that is fine.
OK, FAIL, WARN, UNKNOWN = "ok", "fail", "warn", "unknown"


@dataclass
class Check:
    name: str
    status: str
    found: str = ""
    wanted: str = ""
    reason: str = ""
    fix: str = ""

    @property
    def ok(self) -> bool:
        return self.status == OK


def _uv() -> Check:
    from aughor.installer import find_uv
    exe = find_uv()
    if not exe:
        return Check("uv", FAIL, found="not found", wanted="uv on PATH",
                     reason="the launcher, the virtualenv and the Python install all go through uv",
                     fix="curl -LsSf https://astral.sh/uv/install.sh | sh")
    return Check("uv", OK, found=str(exe), wanted="uv on PATH")


def _python() -> Check:
    from aughor.installer import PYTHON_VERSION
    running = ".".join(str(p) for p in sys.version_info[:3])
    wanted = f"{PYTHON_VERSION}.x"
    if sys.version_info[:2] != tuple(int(p) for p in PYTHON_VERSION.split(".")[:2]):
        return Check("python", WARN, found=running, wanted=wanted,
                     reason="this interpreter is not the version the install pins",
                     fix=f"uv python install {PYTHON_VERSION}")
    return Check("python", OK, found=running, wanted=wanted)


def _node(repo: Path) -> Check:
    from aughor.installer import NODE_MIN, find_node
    node, too_old = find_node(repo)
    wanted = ">= " + ".".join(str(p) for p in NODE_MIN)
    if node is None:
        found = ("none new enough (newest " + ".".join(str(p) for p in too_old) + ")"
                 if too_old else "not found")
        return Check("node", FAIL, found=found, wanted=wanted,
                     reason="the web app is built with Node",
                     fix="./install.sh  (it downloads a private Node into .aughor/node/)")
    version = ".".join(str(p) for p in (node.version or ()))
    return Check("node", OK, found=f"{node.exe} ({version})" if version else str(node.exe),
                 wanted=wanted)


def _port(label: str, port: int, flag: str) -> Check:
    from aughor.netprobe import port_in_use, port_owner
    if not port_in_use(port):
        return Check(label, OK, found="free", wanted="free, or held by Pramanyx")
    owner = port_owner(port)
    if not owner:
        # `port_owner` shells out to `lsof`, which is POSIX-only. No answer is not "nobody".
        return Check(label, UNKNOWN, found="in use, owner unknown", wanted="free, or held by Pramanyx",
                     reason="something is listening; lsof did not say what",
                     fix=f"find it yourself: lsof -nP -iTCP:{port} -sTCP:LISTEN")
    return Check(label, WARN, found=f"in use by {owner}", wanted="free, or held by Pramanyx",
                 reason="a restart will refuse rather than take a port from its owner",
                 fix=f"stop it, or run on another port (aughor up {flag} <n>)")


def _state_writable() -> Check:
    from aughor.db import home
    from aughor.db.paths import state_dir
    where = state_dir()
    label = "state dir" + (" (home)" if home.in_use() else "")
    if not where.exists():
        return Check(label, WARN, found=f"{where} does not exist yet", wanted="a writable directory",
                     reason="it is created on first write; nothing is wrong yet",
                     fix="start the app once")
    if not os.access(where, os.W_OK):
        return Check(label, FAIL, found=f"{where} is not writable", wanted="a writable directory",
                     reason="every store writes here",
                     fix="fix its permissions, or set AUGHOR_STATE_DIR to somewhere writable")
    return Check(label, OK, found=str(where), wanted="a writable directory")


def _identity() -> Check:
    """Track A2: identity required with nothing to verify it. Read from the environment only —
    the same predicate the API refuses with, so the doctor and the door cannot disagree."""
    from aughor.security.authz import IDENTITY_FROM_PROXY_ENV, identity_unverifiable, require_identity_enabled
    from aughor.security import oidc
    if not require_identity_enabled():
        return Check("identity", OK, found="not required (AUGHOR_REQUIRE_IDENTITY unset)",
                     wanted="off on a laptop; required on a shared install")
    why = identity_unverifiable()
    if why:
        return Check("identity", FAIL, found="required, verified by nothing",
                     wanted="an OIDC issuer, or a declared authenticating proxy",
                     reason="the API refuses every request but /health and /auth/config",
                     fix=f"set AUGHOR_OIDC_ISSUER + AUGHOR_OIDC_AUDIENCE, or {IDENTITY_FROM_PROXY_ENV}=1 "
                         "only behind a proxy that sets and strips the X-Aughor-* headers")
    how = f"OIDC issuer {oidc.issuer()}" if oidc.configured() else f"a declared proxy ({IDENTITY_FROM_PROXY_ENV}=1)"
    return Check("identity", OK if oidc.configured() else WARN, found=f"required, verified by {how}",
                 wanted="an OIDC issuer, or a declared authenticating proxy",
                 reason="" if oidc.configured() else
                        "the headers are trusted as presented — only safe if the proxy strips them from clients",
                 fix="" if oidc.configured() else "set AUGHOR_OIDC_ISSUER when an identity provider exists")


def _launcher() -> Check:
    from aughor.installer import LAUNCHER_MARK, find_uv, launcher_dir
    on_path = shutil.which("aughor")
    if on_path:
        return Check("aughor on PATH", OK, found=on_path, wanted="the aughor command on PATH")
    uv = find_uv()
    target = launcher_dir(uv) if uv else None
    return Check("aughor on PATH", WARN, found="not on PATH",
                 wanted="the aughor command on PATH",
                 reason=f"the installer writes it into {target} ({LAUNCHER_MARK})"
                        if target else "uv's command directory could not be located",
                 fix="./install.sh  (it writes the launcher; no shell rc file is edited)")


def _model() -> Check:
    """Answered from the config FILE and the environment. Never through `provider`, which
    would open `org_llm.db` and make this a second writer on a live deployment."""
    from aughor.llm.provider import config_path

    cfg = config_path()
    backend = ""
    source = ""
    try:
        if cfg.is_file():
            raw = json.loads(cfg.read_text(encoding="utf-8") or "{}")
            backend = str(raw.get("backend") or "").strip()
            source = str(cfg)
    except (OSError, ValueError) as exc:
        return Check("model", UNKNOWN, found=f"{cfg} could not be read ({exc})",
                     wanted="a backend chosen in Settings, or AUGHOR_BACKEND",
                     fix="open Settings → Models, or set AUGHOR_BACKEND")
    if not backend:
        backend = os.getenv("AUGHOR_BACKEND", "").strip()
        source = "AUGHOR_BACKEND" if backend else ""
    if not backend:
        return Check("model", FAIL, found="no backend chosen",
                     wanted="a backend chosen in Settings, or AUGHOR_BACKEND",
                     reason="every answer needs one",
                     fix="open Settings → Models, or set AUGHOR_BACKEND")
    return Check("model", OK, found=f"{backend} (from {source})",
                 wanted="a backend chosen in Settings, or AUGHOR_BACKEND")


def _backups(root: Path | None = None, now: datetime | None = None) -> Check:
    """Arc SV, SV-2 — whether this install's own state has a recent backup. Answered from the backups folder and its
    last-run note, the two plain files `/health`'s backups block reads — never through a store, which would open
    `system.db`; and not through that block itself, which answers for the API's process, not this one."""
    from aughor.db import backups
    wanted = "a backup of this install's own state, checked within the last two hours"
    try:
        kept = backups.list_backups(root)
        last = backups.read_last_run(root)
    except Exception as exc:  # noqa: BLE001 — unreadable is not "none": said as unknown, with what failed
        return Check("backups", UNKNOWN, found=f"could not be read ({exc})", wanted=wanted,
                     fix="`aughor backups` lists what it can read")
    if not kept:
        return Check("backups", WARN, found="none taken", wanted=wanted,
                     reason="a damaged store has nothing to come back from",
                     fix="start the API (`aughor up`); it takes the first a few minutes after it starts")
    now = now or datetime.now(timezone.utc)
    newest = kept[0]
    try:
        checked = datetime.fromisoformat(str((last or {}).get("at")))
    except ValueError:
        checked = newest.taken_at
    hours = (now - checked).total_seconds() / 3600
    outcome = (last or {}).get("outcome")
    found = f"{len(kept)} kept, the newest {newest.name}; checked {hours:.1f} hours ago"
    if outcome == "failed":
        return Check("backups", FAIL, found=f"the last backup failed: {(last or {}).get('reason')}", wanted=wanted,
                     reason=f"the newest whole copy is {newest.name}",
                     fix="read the API log for the backup's error; `aughor backups` lists what is kept")
    if outcome == "skipped_space":
        return Check("backups", WARN, found=f"the last backup was skipped for space: {(last or {}).get('reason')}",
                     wanted=wanted, reason=f"the newest whole copy is {newest.name}",
                     fix="free some disk; old copies are thinned out on their own")
    if now - checked > backups.STALE_AFTER:
        return Check("backups", WARN, found=found, wanted=wanted,
                     reason="backups are taken only while the API runs",
                     fix="start the API (`aughor up`)")
    return Check("backups", OK, found=found, wanted=wanted)


def _state_classes(root: Path | None = None) -> Check:
    """Track B3 — whether every entry in the state folder has a class (`db/state_classes.py`). Read from the folder's
    listing only: nothing is opened. What a runtime path names is seen only here, never in the code."""
    from aughor.db import state_classes as sc
    from aughor.db.paths import state_dir
    wanted = "every entry in the state folder classified as record, evidence, artifact, ephemeral, left behind or not state"
    root = root or state_dir()
    try:
        names = sorted(n for n in os.listdir(root) if not n.endswith(sc._SIDECARS))
    except OSError as exc:
        return Check("state classes", UNKNOWN, found=f"could not be read ({exc})", wanted=wanted,
                     fix="`aughor doctor` reads the folder the API serves; check AUGHOR_HOME")
    unclassified = [n for n in names if sc.classify(n) is None]
    if unclassified:
        return Check("state classes", WARN, found=f"{len(unclassified)} of {len(names)} without a class: "
                     + ", ".join(unclassified[:8]) + (" …" if len(unclassified) > 8 else ""), wanted=wanted,
                     reason="a restore, a removal or a move to a shared store would have to guess what it is",
                     fix="add each to `aughor/db/state_classes.py` with its class and the module that writes it")
    behind = [n for n in names if sc.classify(n).cls == sc.LEFT_BEHIND]
    size = sum((root / n).stat().st_size for n in behind if (root / n).is_file())
    found = f"{len(names)} entries, every one classified"
    if behind:
        found += (f"; {len(behind)} left behind by an earlier version or by hand ({size / 1e6:.1f} MB): "
                  + ", ".join(behind[:6]) + (" …" if len(behind) > 6 else "") + " — named in docs/STATE_CLASSES.md")
    return Check("state classes", OK, found=found, wanted=wanted)


def _moved_tree(name: str, label: str, what: str, gone: str) -> Check:
    """Where one tree that moves by a verified top-up lives (`db.home.TOPPED_UP_ENTRIES`), and whether a migrated
    install still owes its move into the state folder (`db.migrate.top_up`, 2026-11-09). Read from the record and the
    two trees' files only — nothing opened. ``what`` names the tree's contents; ``gone`` says what a record without its
    tree costs."""
    from aughor.db import home, migrate
    wanted = f"{what} inside the state folder, so a backup holds them"
    env = home.TOPPED_UP_ENTRIES[name]
    if os.environ.get(env):
        return Check(label, OK, found=f"{os.environ[env]} ({env})", wanted=wanted)
    if not home.in_use():
        return Check(label, OK, found=f"{home.checkout_data() / name} — this install keeps its state in the "
                                      "checkout's data/, and its backups hold them", wanted=wanted)
    try:
        record = migrate.read_record(name)
    except (OSError, ValueError) as exc:
        return Check(label, UNKNOWN, found=f"the record of their move could not be read ({exc})", wanted=wanted,
                     fix=f"read {home.moved_record(name)}")
    if record is None:
        return Check(label, FAIL, found=f"still in the checkout at {home.checkout_data() / name}", wanted=wanted,
                     reason="outside every backup; the API refuses to start until they are moved",
                     fix="stop the API, then `aughor migrate-state --yes` — it copies, checks every file and records "
                         "the move; the checkout's copy is left as it was")
    moved_to = home.state_home() / name
    found = f"{moved_to}, moved {record.get('moved_at')} ({len(record.get('files') or {})} files)"
    if not moved_to.is_dir():
        return Check(label, FAIL, found=f"the record says they moved {record.get('moved_at')}, but {moved_to} is not "
                                        "there", wanted=wanted, reason=gone,
                     fix="put it back from a backup: `aughor backups`, then `aughor restore <stamp>`")
    left = migrate.left_in_checkout(name, record)
    if not left["untracked"]:
        return Check(label, OK, found=found, wanted=wanted)
    copy = f"{left['path']} still holds {left['untracked']} of them"
    if left["changed"]:
        return Check(label, WARN, found=f"{found}; {copy}", wanted=wanted,
                     reason=f"{len(left['changed'])} of those changed or appeared there after the move "
                            f"({', '.join(left['changed'][:3])}{' …' if len(left['changed']) > 3 else ''}) — something "
                            "still writes to the checkout, and nothing reads it",
                     fix="find what writes there (a server started from another checkout?) and compare those files "
                         "with the state folder's before removing anything")
    # `-x`: the column config's copy is ignored by git, so a plain `clean` would list none of it. `clean` never touches
    # a file the repository tracks, and what the repository ships of either tree is in `data/shipped/`, outside it.
    return Check(label, WARN, found=f"{found}; {copy}", wanted=wanted,
                 reason="a stale copy: nothing reads it since the move, and it is the same as what moved",
                 fix=f"you may remove it — `git -C {left['path']} clean -ndx .` lists the files there the repository "
                     "does not track, ignored ones too; `-fdx` instead of `-ndx` removes them, and never a file it "
                     "tracks")


def _declarations() -> Check:
    """Where people's ontology declarations live (`ontology/overrides.py`)."""
    return _moved_tree("ontology_overrides", "declarations", "people's ontology declarations",
                       "every declaration reads as gone")


def _column_settings() -> Check:
    """Where the per-column settings this install saved live (`ontology/column_config.py`, punch list 74) — the ones
    the repository ships are in the checkout's `data/shipped/` and never move."""
    return _moved_tree("ontology_column_config", "column settings", "the per-column settings this install saved",
                       "every column setting this install saved reads as gone; only the shipped ones still read")


def run(repo: Path, *, api_port: int, web_port: int) -> list[Check]:
    """Every check, in the order a person reads them. Pure: nothing here writes."""
    return [
        _uv(),
        _python(),
        _node(repo),
        _port(f"port {api_port} (api)", api_port, "--api-port"),
        _port(f"port {web_port} (web)", web_port, "--web-port"),
        _state_writable(),
        _identity(),
        _launcher(),
        _model(),
        _backups(),
        _state_classes(),
        _declarations(),
        _column_settings(),
    ]


def worst(checks: list[Check]) -> str:
    """The verdict for the whole run — the exit code comes from this."""
    for status in (FAIL, WARN, UNKNOWN):
        if any(c.status == status for c in checks):
            return status
    return OK
