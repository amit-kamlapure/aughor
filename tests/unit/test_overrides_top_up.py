"""People's ontology declarations move from the checkout into the data home — copied, every file checked, recorded, and
only then read there (`db.migrate.top_up`, 2026-11-09).

Measured first, on the live install: it migrated on 2026-10-07 while `ontology_overrides/` was listed as authored, so
its 35 declaration files stayed in the checkout's `data/` — and the hourly backups of the state folder, 835 files in
the newest, held none of them. Simply un-listing the tree would have sent it to a home that never received a copy
(`migrate-state` answers "already" once the marker exists), and every declaration would have read as gone.

Three shapes of install, a class each: one that never migrated, one migrating now, one migrated before the move.
"""
from __future__ import annotations

import inspect
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pytest

from aughor.db import backups, home, migrate, state_classes
from aughor.db.sqlite_util import resolve_db_path
from aughor.doctor import FAIL, OK, WARN, _declarations

NAME = "ontology_overrides"
ENV = home.TOPPED_UP_ENTRIES[NAME]
DECLARATIONS = {
    "c1/main/entity/Order.yaml": "target_kind: entity\ntarget_id: Order\nfields: {description: an order}\n",
    "c1/main/rule/vip.yaml": "target_kind: rule\ntarget_id: vip\n",
    # A tombstone: this install withdrew a SHIPPED declaration. Left behind, the seed would come back.
    "c1/main/entity/Shipped.yaml.hidden": "withdrawn on this install; the shipped declaration stays hidden\n",
}


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


@pytest.fixture
def install(tmp_path, monkeypatch):
    """A checkout's `data/` holding declarations (and the Mac's folder settings), and an empty home. The tree's own env
    var is cleared, so it resolves as an install's does; nothing here reaches the suite's stores or a live one."""
    data = tmp_path / "checkout" / "data"
    for rel, text in DECLARATIONS.items():
        _write(data / NAME / rel, text)
    _write(data / NAME / ".DS_Store", "finder")
    _write(data / "watermark.json", '{"seen": 7}')              # generated state, for a migration to move
    monkeypatch.setenv(home.HOME_ENV, str(tmp_path / "home"))
    monkeypatch.delenv(ENV, raising=False)
    monkeypatch.setattr(home, "checkout_data", lambda: data)
    monkeypatch.setattr("aughor.db.serving.serving_pid", lambda: None)
    return data


def _migrated(data: Path) -> None:
    """An install that migrated BEFORE this change: the marker, and no copy of the tree in the home."""
    home.state_home().mkdir(parents=True, exist_ok=True)
    home.marker_path().write_text(f"state migrated from {data}\n")


def _resolved(data: Path) -> Path:
    """Where the overrides module's default resolves, the way it resolves it."""
    return resolve_db_path("AUGHOR_TEST_UNSET_OVERRIDES", data / NAME)


def _bytes(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()}


# ── shape 1: an install that never migrated ──────────────────────────────────────────────────────

class TestNeverMigrated:
    def test_it_reads_the_checkout_owes_nothing_and_serves(self, install):
        assert _resolved(install) == install / NAME
        assert migrate.owed() == []
        migrate.ensure_moved()                                   # does not raise
        said = _declarations()
        assert said.status == OK and "backups hold them" in said.found


# ── shape 2: an install migrating now ────────────────────────────────────────────────────────────

class TestMigratingNow:
    def test_the_migration_moves_the_tree_verified_before_the_marker(self, install):
        out = migrate.migrate(install)
        assert out.status == "migrated", (out.reason, out.problems)
        record = migrate.read_record(NAME)
        assert record and set(record["files"]) == set(DECLARATIONS)
        assert _bytes(home.state_home() / NAME) == {r: t.encode() for r, t in DECLARATIONS.items()}
        assert _resolved(install) == home.state_home() / NAME
        assert migrate.owed() == []
        # The checkout's copy is untouched — the Mac's folder settings too, which were never state to move.
        assert (install / NAME / ".DS_Store").exists() and not (home.state_home() / NAME / ".DS_Store").exists()
        assert {r for r in _bytes(install / NAME)} == set(DECLARATIONS) | {".DS_Store"}

    def test_the_tree_is_moved_by_the_top_up_not_the_bulk_copy(self, install):
        moving, staying = migrate.sources(install)
        assert NAME not in {p.name for p in moving} and NAME not in staying

    def test_a_failed_top_up_leaves_no_marker(self, install, monkeypatch):
        monkeypatch.setattr(migrate, "_sha256", _corrupting_sha(install, "c1/main/rule/vip.yaml"))
        out = migrate.migrate(install)
        assert out.status == "failed" and not home.in_use()
        assert any("vip.yaml" in p for p in out.problems)

    def test_an_install_with_no_tree_records_an_empty_move_and_writes_into_the_home(self, install):
        shutil.rmtree(install / NAME)
        assert migrate.migrate(install).status == "migrated"
        assert migrate.read_record(NAME)["files"] == {}
        assert (home.state_home() / NAME).is_dir()
        assert _resolved(install) == home.state_home() / NAME


def _corrupting_sha(data: Path, rel: str):
    """A `_sha256` that reads one file's copy in the home as different — a copy that does not check."""
    real = migrate._sha256
    target = (home.state_home() / NAME / rel)

    def sha(path: Path) -> str:
        p = Path(path)
        if p == target or p.name == f".{target.name}{migrate._TMP_SUFFIX}":
            return "0" * 64
        return real(p)
    return sha


# ── shape 3: an install that migrated before the move ────────────────────────────────────────────

class TestMigratedBefore:
    def test_it_reads_the_checkout_and_will_not_serve_until_moved(self, install):
        _migrated(install)
        assert _resolved(install) == install / NAME, "an un-moved tree must never resolve into an empty home"
        owing = migrate.owed()
        assert len(owing) == 1 and str(install / NAME) in owing[0] and "outside every backup" in owing[0]
        with pytest.raises(migrate.MoveOwed, match="aughor migrate-state --yes"):
            migrate.ensure_moved()
        said = _declarations()
        assert said.status == FAIL and "migrate-state" in said.fix

    def test_an_env_override_owes_nothing(self, install, monkeypatch, tmp_path):
        _migrated(install)
        monkeypatch.setenv(ENV, str(tmp_path / "elsewhere"))
        assert migrate.owed() == []

    def test_the_top_up_copies_checks_records_and_switches(self, install):
        _migrated(install)
        before = _bytes(install / NAME)
        out = migrate.top_up(NAME)
        assert out.status == "moved", (out.reason, out.problems, out.conflicts)
        assert out.files == 3 and out.copied == 3
        assert _bytes(home.state_home() / NAME) == {r: t.encode() for r, t in DECLARATIONS.items()}
        record = json.loads(home.moved_record(NAME).read_text())
        assert record["format"] == migrate.MOVED_RECORD_FORMAT and record["from"] == str(install / NAME)
        assert all(len(e["sha256"]) == 64 for e in record["files"].values())
        assert _resolved(install) == home.state_home() / NAME
        assert migrate.owed() == [] and _bytes(install / NAME) == before        # nothing in the checkout moved
        migrate.ensure_moved()

    def test_a_second_run_says_already_and_never_copies_the_checkout_again(self, install):
        _migrated(install)
        migrate.top_up(NAME)
        second = migrate.top_up(NAME)
        assert second.status == "already" and second.ok
        assert "3 of 3 files verified" in second.reason and second.copied == 0
        # A person edits a declaration and withdraws another; the checkout's stale copy never comes back over them.
        _write(home.state_home() / NAME / "c1/main/entity/Order.yaml", "target_kind: entity\ntarget_id: Order\n")
        (home.state_home() / NAME / "c1/main/rule/vip.yaml").unlink()
        third = migrate.top_up(NAME)
        assert third.status == "already" and "1 of 3" in third.reason and "1 edited and 1 withdrawn" in third.reason
        assert not (home.state_home() / NAME / "c1/main/rule/vip.yaml").exists()

    def test_a_conflict_is_refused_naming_both_copies_and_nothing_switches(self, install):
        _migrated(install)
        theirs = _write(home.state_home() / NAME / "c1/main/entity/Order.yaml", "something else\n")
        out = migrate.top_up(NAME)
        assert out.status == "conflict" and not out.ok
        assert len(out.conflicts) == 1
        assert str(install / NAME / "c1/main/entity/Order.yaml") in out.conflicts[0] and str(theirs) in out.conflicts[0]
        assert "nothing switched" in out.reason
        # Found before anything was copied: the other files are not in the home, and there is no record.
        assert not (home.state_home() / NAME / "c1/main/rule/vip.yaml").exists()
        assert not home.moved(NAME) and _resolved(install) == install / NAME
        assert theirs.read_text() == "something else\n"

    def test_a_file_already_in_the_home_and_the_same_is_not_a_conflict(self, install):
        _migrated(install)
        _write(home.state_home() / NAME / "c1/main/rule/vip.yaml", DECLARATIONS["c1/main/rule/vip.yaml"])
        out = migrate.top_up(NAME)
        assert out.status == "moved" and out.copied == 2 and "1 already there" in out.reason

    def test_a_copy_that_does_not_check_is_never_recorded(self, install, monkeypatch):
        _migrated(install)
        real_copy = shutil.copy2

        def corrupt(src, dst, *a, **kw):
            real_copy(src, dst, *a, **kw)
            if Path(src).name == "Order.yaml":
                Path(dst).write_text("bit rot\n")
        monkeypatch.setattr(migrate.shutil, "copy2", corrupt)
        out = migrate.top_up(NAME)
        assert out.status == "failed" and not home.moved(NAME)
        # Caught before it was put in place, and then missing from the home when everything is checked again there.
        assert out.problems == ["c1/main/entity/Order.yaml: the copy's contents differ from the checkout's",
                                "c1/main/entity/Order.yaml: in the home, its contents differ from the checkout's"]
        assert _resolved(install) == install / NAME
        assert not list((home.state_home() / NAME).rglob(f"*{migrate._TMP_SUFFIX}"))
        assert not (home.state_home() / NAME / "c1/main/entity/Order.yaml").exists()
        # Run again with a sound copy: it picks up from what was copied.
        monkeypatch.setattr(migrate.shutil, "copy2", real_copy)
        again = migrate.top_up(NAME)
        assert again.status == "moved" and again.copied == 1 and "2 already there" in again.reason

    def test_a_checkout_written_during_the_move_is_never_recorded(self, install, monkeypatch):
        _migrated(install)
        real_copy = shutil.copy2

        def copy_then_write(src, dst, *a, **kw):
            real_copy(src, dst, *a, **kw)
            if Path(src).name == "vip.yaml":
                Path(src).write_text("target_kind: rule\ntarget_id: vip\nnote: written mid-move\n")
        monkeypatch.setattr(migrate.shutil, "copy2", copy_then_write)
        out = migrate.top_up(NAME)
        assert out.status == "failed" and not home.moved(NAME)
        assert out.problems == ["c1/main/rule/vip.yaml: the checkout's copy changed while it was moved — is "
                                "something still writing there?"]

    def test_it_refuses_while_the_api_serves(self, install, monkeypatch):
        _migrated(install)
        monkeypatch.setattr("aughor.db.serving.serving_pid", lambda: 4242)
        out = migrate.top_up(NAME)
        assert out.status == "refused" and "4242" in out.reason
        assert not (home.state_home() / NAME).exists()

    def test_a_link_in_the_tree_is_refused_not_followed(self, install, tmp_path):
        _migrated(install)
        (install / NAME / "c1" / "elsewhere").symlink_to(tmp_path)
        out = migrate.top_up(NAME)
        assert out.status == "refused" and any("c1/elsewhere" in p for p in out.problems)
        assert not home.moved(NAME)

    def test_the_tombstone_moves_so_a_withdrawn_shipped_declaration_stays_withdrawn(self, install, monkeypatch,
                                                                                     tmp_path):
        from aughor.ontology import overrides
        _migrated(install)
        seed = tmp_path / "shipped"
        _write(seed / "c1/main/entity/Shipped.yaml", "target_kind: entity\ntarget_id: Shipped\n")
        monkeypatch.setattr(overrides, "_SEED_ROOT", seed)
        migrate.top_up(NAME)
        monkeypatch.setattr(overrides, "_ROOT", _resolved(install))      # as a process started after the move does
        assert overrides._ROOT == home.state_home() / NAME
        seen = {p.name for p in overrides._visible(Path("c1/main"), "*.yaml", recursive=True)}
        assert seen == {"Order.yaml", "vip.yaml"}, seen


# ── where it runs: never beside a server ─────────────────────────────────────────────────────────

def test_the_api_refuses_before_it_claims_the_state_dir():
    """The refusal comes before the state directory is claimed, so a refused start leaves no claim behind."""
    from aughor import api
    source = inspect.getsource(api._lifespan)
    assert 0 <= source.index("ensure_moved()") < source.index("claim()")


def test_migrate_state_moves_on_a_migrated_install_and_says_already_after(install, monkeypatch):
    from click.testing import CliRunner

    from aughor.cli import cli
    monkeypatch.setenv("AUGHOR_SKIP_DOTENV", "1")
    _migrated(install)
    runner = CliRunner()
    dry = runner.invoke(cli, ["migrate-state", "--from", str(install)])
    assert dry.exit_code == 0 and "3 files would move" in dry.output and "Nothing done" in dry.output
    assert not home.moved(NAME)
    done = runner.invoke(cli, ["migrate-state", "--from", str(install), "--yes"])
    assert done.exit_code == 0 and "Moved." in done.output, done.output
    again = runner.invoke(cli, ["migrate-state", "--from", str(install), "--yes"])
    assert again.exit_code == 0 and "Already moved." in again.output and "3 of 3 files verified" in again.output


def test_migrate_state_exits_non_zero_on_a_conflict(install, monkeypatch):
    from click.testing import CliRunner

    from aughor.cli import cli
    monkeypatch.setenv("AUGHOR_SKIP_DOTENV", "1")
    _migrated(install)
    _write(home.state_home() / NAME / "c1/main/entity/Order.yaml", "something else\n")
    out = CliRunner().invoke(cli, ["migrate-state", "--from", str(install), "--yes"])
    assert out.exit_code == 1 and "Conflict." in out.output and "Order.yaml" in out.output


def test_aughor_up_says_why_it_will_not_start_the_api(install, monkeypatch):
    from click.testing import CliRunner

    from aughor.cli import cli
    monkeypatch.setenv("AUGHOR_SKIP_DOTENV", "1")
    _migrated(install)
    out = CliRunner().invoke(cli, ["up", "--api-only", "--no-browser"])
    assert out.exit_code == 1 and "will not start" in out.output and "migrate-state --yes" in out.output


# ── backups: the moved tree is in them, and said until it moves ──────────────────────────────────

NOW = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
def moved_state(install, monkeypatch):
    _migrated(install)
    assert migrate.top_up(NAME).status == "moved"
    monkeypatch.setenv("AUGHOR_STATE_DIR", str(home.state_home()))
    monkeypatch.setenv(backups.FREE_FLOOR_ENV, "0")
    return install


def test_a_backup_holds_the_moved_tree_and_a_restore_puts_a_withdrawn_declaration_back(moved_state):
    out = backups.take(now=NOW)
    assert out.status == "taken", out.reason
    sources = json.loads((out.folder / backups.MANIFEST).read_text())["sources"]
    assert {f"{NAME}/{rel}" for rel in DECLARATIONS} <= set(sources)
    assert f"{NAME}{home.MOVED_SUFFIX}" in sources                 # the switch travels with the tree
    order = home.state_home() / NAME / "c1/main/entity/Order.yaml"
    order.unlink()                                                 # withdrawn after the backup
    plans = []
    done = backups.restore(out.stamp, confirm=lambda plan: plans.append(plan) or True)
    assert done.status == "restored", (done.reason, done.problems)
    assert any(line.startswith(f"{NAME}/c1/") and "gone since the backup" in line for line in plans[0]["removals"])
    assert order.read_text() == DECLARATIONS["c1/main/entity/Order.yaml"]
    assert home.moved(NAME)


def test_elsewhere_names_the_tree_until_it_moves_and_not_after(install):
    _migrated(install)
    root = home.state_home()

    def named() -> list[str]:
        return [i["path"] for i in backups._elsewhere(root) if "declarations" in i["why"]]

    assert named() == [str((install / NAME).resolve())]
    migrate.top_up(NAME)
    assert named() == []


def test_the_names_the_platform_keys_on_are_the_stores_own():
    """The platform names the trees rather than importing the ontology; each name and env var is the store's own."""
    from aughor.ontology import column_config, overrides
    src = inspect.getsource(overrides)
    assert f'resolve_db_path("{ENV}",' in src and f'/ "data" / "{NAME}")' in src
    assert column_config._DEFAULT_ROOT.resolve() == home.checkout_data() / "ontology_column_config"
    assert '"AUGHOR_COLUMN_CONFIG_ROOT"' in inspect.getsource(column_config._root)
    assert {(n, v) for n, v, _ in backups._CHECKOUT_TREES} == {
        (NAME, ENV), ("ontology_column_config", "AUGHOR_COLUMN_CONFIG_ROOT")}
    assert [e.pattern for e in state_classes.CHECKOUT_ENTRIES] == [n for n, _, _ in backups._CHECKOUT_TREES]


def test_an_override_withdrawal_approved_after_a_backup_is_a_removal_a_restore_names():
    assert "ontology.delete_override" in backups._REMOVAL_ACTIONS


# ── the doctor ───────────────────────────────────────────────────────────────────────────────────

class TestTheDoctor:
    def test_a_stale_copy_in_the_checkout_is_named_as_one_a_person_may_remove(self, moved_state):
        said = _declarations()
        assert said.status == WARN and "still holds 3" in said.found
        assert "stale copy" in said.reason and f"git -C {moved_state / NAME} clean -ndx ." in said.fix

    def test_a_checkout_written_after_the_move_is_said_before_anything_is_removed(self, moved_state):
        _write(moved_state / NAME / "c1/main/rule/vip.yaml", "written by a server from another checkout\n")
        said = _declarations()
        assert said.status == WARN and "changed or appeared there after the move" in said.reason
        assert "c1/main/rule/vip.yaml" in said.reason and "compare" in said.fix

    def test_once_the_copy_is_removed_it_is_ok(self, moved_state):
        shutil.rmtree(moved_state / NAME)
        said = _declarations()
        assert said.status == OK and "(3 files)" in said.found

    def test_a_record_without_its_tree_fails_and_points_at_the_backups(self, moved_state):
        shutil.rmtree(home.state_home() / NAME)
        said = _declarations()
        assert said.status == FAIL and "not there" in said.found and "aughor restore" in said.fix
        assert migrate.top_up(NAME).status == "failed"


def test_the_record_is_never_read_past_a_format_it_does_not_know(install):
    _migrated(install)
    migrate.top_up(NAME)
    record = json.loads(home.moved_record(NAME).read_text())
    home.moved_record(NAME).write_text(json.dumps({**record, "format": migrate.MOVED_RECORD_FORMAT + 1}))
    out = migrate.top_up(NAME)
    assert out.status == "refused" and "newer" in out.reason
    assert _declarations().status == "unknown"
