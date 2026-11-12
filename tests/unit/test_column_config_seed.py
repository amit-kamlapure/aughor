"""The per-column config as a shipped seed with this install's own settings over it, and the install's part moved into
the data home with the verified top-up (punch list 74, 2026-11-09).

Measured first, on the live install: `data/ontology_column_config/` held 118 files — the 62 the repository tracked for
the builtin Workspace, and 56 this install wrote beside them (theLook, LuxExperience, olist, …), none of them in any of
the 34 backups, because the tree was listed as authored and stayed in the checkout when the state moved. The app also
rewrote the tracked files it found there, the trap that refuses a fast-forward. Now the 62 are the SEED
(`data/shipped/ontology_column_config/`), nothing under the install's tree is tracked, and that tree moves like the
declarations did.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from pramanyx.db import backups, home, migrate
from pramanyx.doctor import FAIL, OK, WARN, _column_settings
from pramanyx.ontology import column_config as cc
from pramanyx.ontology.column_config import ColumnFlags

NAME = "ontology_column_config"
ENV = "PRAMANYX_COLUMN_CONFIG_ROOT"
SEED_ENV = "PRAMANYX_COLUMN_CONFIG_SEED_ROOT"


def _put(root: Path, conn: str, schema: str, table: str, **columns: ColumnFlags) -> Path:
    p = root / conn / schema / f"{table}.yaml"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(yaml.safe_dump({"table": table, "columns": {c: f.model_dump() for c, f in columns.items()}},
                                sort_keys=False))
    return p


def _seeded(seed: Path) -> None:
    """The shape the repository ships: the Workspace's tables, one with a person's note, one an agent's."""
    _put(seed, "workspace", "default", "airports",
         name=ColumnFlags(index=True),
         code=ColumnFlags(source="human", note="IATA code", edited_at="2026-01-01T00:00:00+00:00"))
    _put(seed, "workspace", "default", "flights", tail=ColumnFlags(source="agent", note="the aircraft's registration"),
         dep=ColumnFlags(sample=False))                                  # a measure's default
    _put(seed, "workspace", "amazon", "amazon.amazon", brand=ColumnFlags(index=False), title=ColumnFlags(index=True))


def _effective(conn: str, schema: str) -> dict:
    return {k: v.model_dump() for k, v in cc.load_column_configs(conn, schema).items()}


def _bytes(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()}


@pytest.fixture
def layers(tmp_path, monkeypatch):
    """Both layers at tmp, each through its own env var."""
    inst, seed = tmp_path / "instance", tmp_path / "seed"
    monkeypatch.setenv(ENV, str(inst))
    monkeypatch.setenv(SEED_ENV, str(seed))
    _seeded(seed)
    return inst, seed


# ── reads: the install's file over the seed's, whole ────────────────────────────────────────────

def test_an_install_file_shadows_the_seeds_whole_and_every_other_seed_file_reads(layers):
    """Kills: a reader of one layer only, the seed read over the install, and a merge by COLUMN (the seed's `code`
    leaking into a table the install rewrote)."""
    inst, _ = layers
    assert set(_effective("workspace", "default")) == {("airports", "name"), ("airports", "code"),
                                                       ("flights", "tail"), ("flights", "dep")}
    _put(inst, "workspace", "default", "airports", name=ColumnFlags(visible=False))
    _put(inst, "workspace", "default", "gates", gate=ColumnFlags())
    got = cc.load_column_configs("workspace", "default")
    assert set(got) == {("airports", "name"), ("flights", "tail"), ("flights", "dep"), ("gates", "gate")}
    assert got[("airports", "name")].visible is False
    assert cc.load_table_config("workspace", "default", "airports").keys() == {"name"}
    assert cc.load_table_config("workspace", "default", "flights")["tail"].note == "the aircraft's registration"


def test_a_broken_install_file_never_lets_the_seed_leak_through(layers):
    inst, _ = layers
    (inst / "workspace" / "default").mkdir(parents=True)
    (inst / "workspace" / "default" / "airports.yaml").write_text(": not yaml :\n  - [")
    assert cc.load_table_config("workspace", "default", "airports") == {}
    assert not any(t == "airports" for t, _ in cc.load_column_configs("workspace", "default"))


def test_index_disabled_reads_every_dataset_either_layer_holds(layers):
    inst, _ = layers
    _put(inst, "workspace", "olist", "orders", status=ColumnFlags(index=False), city=ColumnFlags(index=True))
    got = cc.load_index_disabled("workspace")
    assert ("amazon.amazon", "brand") in got                       # a dataset only the seed holds
    assert ("orders", "status") in got and ("orders", "city") not in got      # one only the install holds
    assert ("airports", "code") in got and ("airports", "name") not in got
    assert cc.load_index_disabled("nobody") == set()


# ── writes: the install's tree only, the seed's entries carried whole ───────────────────────────

def test_the_first_edit_of_a_seeded_table_writes_its_whole_file_into_the_install(layers):
    """Kills: a write into the seed, and a write of only the edited column (the seed's person's note on `code` lost
    the moment the install's file shadows the seed's)."""
    inst, seed = layers
    before = _bytes(seed)
    cc.set_column_flags("workspace", "default", "airports", "name", visible=False)
    assert _bytes(seed) == before, "the seed was written"
    written = yaml.safe_load((inst / "workspace" / "default" / "airports.yaml").read_text())["columns"]
    assert set(written) == {"name", "code"}
    assert written["code"]["note"] == "IATA code" and written["code"]["source"] == "human"
    assert written["name"]["visible"] is False and written["name"]["source"] == "human"


def test_a_defaults_refresh_never_writes_the_seed_and_keeps_its_authored_entries(layers):
    inst, seed = layers
    before = _bytes(seed)

    def prof(table, column, **kw):
        return SimpleNamespace(table=table, column=column, dtype=kw.get("dtype", "VARCHAR"),
                               semantic_type=kw.get("semantic_type", "dimension"), is_fk=False,
                               null_rate=kw.get("null_rate", 0.0))
    # The policy agrees with the seed: nothing is written anywhere.
    same = {"flights.dep": prof("flights", "dep", dtype="DOUBLE", semantic_type="measure")}
    cc.ensure_column_configs("workspace", "default", same)
    assert not inst.exists() and _bytes(seed) == before
    # A column now dead: its default is refreshed, into the install, with the agent's note carried over whole.
    dead = {"flights.dep": prof("flights", "dep", dtype="DOUBLE", semantic_type="text", null_rate=1.0)}
    eff = cc.ensure_column_configs("workspace", "default", dead)
    assert _bytes(seed) == before, "a defaults refresh wrote the seed"
    written = yaml.safe_load((inst / "workspace" / "default" / "flights.yaml").read_text())["columns"]
    assert written["tail"]["note"] == "the aircraft's registration" and written["tail"]["source"] == "agent"
    assert written["dep"]["visible"] is False
    assert eff[("airports", "code")].note == "IATA code"           # an untouched seeded table still counts


# ── a removed dataset's shipped settings stay removed ───────────────────────────────────────────

@pytest.fixture
def removal(layers, tmp_path, monkeypatch):
    """Only the column config's tree, so a purge here touches nothing else."""
    from pramanyx.ontology import removal as R
    monkeypatch.setattr(R, "_trees", lambda: [cc._root()])
    monkeypatch.setattr(R, "_context_graph_root", lambda: tmp_path / "no-graphs")
    monkeypatch.setattr("pramanyx.knowledge.indexer.delete_document", lambda doc_id: False)
    return R


def test_a_removed_seeded_dataset_stays_removed_and_the_seed_is_never_touched(layers, removal):
    """Kills: a removal that only removes (the shipped file answers again), one that deletes the SEED, and a marker
    that hides more than its dataset."""
    inst, seed = layers
    before = _bytes(seed)
    _put(inst, "workspace", "amazon", "amazon.amazon", brand=ColumnFlags(visible=False))     # edited here once
    got = removal.purge("workspace", "amazon")
    assert got["ontology_trees"] == 1
    assert _bytes(seed) == before
    assert (inst / "workspace" / "amazon.hidden").is_file() and not (inst / "workspace" / "amazon").exists()
    assert cc.load_column_configs("workspace", "amazon") == {}
    assert cc.load_table_config("workspace", "amazon", "amazon.amazon") == {}
    assert not any(t == "amazon.amazon" for t, _ in cc.load_index_disabled("workspace"))
    assert ("airports", "code") in cc.load_column_configs("workspace", "default")           # its sibling still reads
    # What this install writes for the dataset later reads; the seed's stays hidden.
    cc.set_column_flags("workspace", "amazon", "reviews", "stars", index=False)
    assert set(cc.load_column_configs("workspace", "amazon")) == {("reviews", "stars")}


def test_the_tombstone_is_written_before_the_files_go(layers, removal, monkeypatch):
    """AGENTS.md: reversing durable intent clears the durable record before acting. Kills: hiding after the delete,
    and going on with the delete when the marker could not be written (the install's file gone, the seed's back)."""
    inst, _ = layers
    _put(inst, "workspace", "amazon", "amazon.amazon", brand=ColumnFlags(visible=False))
    seen = []
    real = removal._remove
    monkeypatch.setattr(removal, "_remove",
                        lambda path, kept: seen.append((path, (inst / "workspace" / "amazon.hidden").exists()))
                        or real(path, kept))
    removal.purge("workspace", "amazon")
    assert seen and all(hidden for _, hidden in seen)

    _put(inst, "workspace", "amazon", "amazon.amazon", brand=ColumnFlags(visible=False))
    (inst / "workspace" / "amazon.hidden").unlink()

    def cannot(conn, schema):
        raise PermissionError("read-only")
    monkeypatch.setattr(cc, "hide_seeds", cannot)
    removal.purge("workspace", "amazon")
    assert (inst / "workspace" / "amazon" / "amazon.amazon.yaml").is_file(), "removed without its tombstone"
    assert cc.load_table_config("workspace", "amazon", "amazon.amazon")["brand"].visible is False


def test_a_dataset_the_seed_does_not_hold_leaves_no_tombstone(layers, removal):
    inst, _ = layers
    _put(inst, "c1", "main", "orders", status=ColumnFlags())
    removal.purge("c1", "main")
    assert not (inst / "c1").exists() or not list((inst / "c1").iterdir())
    assert removal.purge("workspace", "olist")["ontology_trees"] == 0 and not (inst / "workspace").exists()


def test_every_seeded_connection_is_one_the_registry_refuses_to_remove():
    """A whole-connection purge hides no seed (`purge_connection`): it can rely on that only while every connection the
    repository ships settings for is one nobody can remove. Measured from the real seed, not listed beside it."""
    from pramanyx.db import registry
    shipped = home.checkout_data() / "shipped" / NAME
    seeded = sorted(p.name for p in shipped.iterdir() if p.is_dir())
    assert seeded, "probe failed: no shipped column config"
    for conn in seeded:
        with pytest.raises(ValueError, match="cannot be deleted"):
            registry.delete_connection(conn)


def test_the_conftest_keeps_the_shipped_seed_out_of_every_other_test():
    assert "pramanyx-test-stores" in str(cc._seed_root()) and not cc._seed_root().exists()
    assert "pramanyx-test-stores" in str(home.moved_record(NAME))


# ── the move: the install's tree into the data home, verified ───────────────────────────────────

@pytest.fixture
def checkout(tmp_path, monkeypatch):
    """A checkout laid out as after the update — the seed under `shipped/`, this install's files (and a tombstone)
    under `ontology_column_config/` — with both env vars cleared so the store resolves as an install's does."""
    data = tmp_path / "checkout" / "data"
    seed, inst = data / "shipped" / NAME, data / NAME
    _seeded(seed)
    _put(seed, "workspace", "traffic", "traffic", speed=ColumnFlags(index=False))    # shipped, and removed here
    _put(inst, "workspace", "olist", "orders", status=ColumnFlags(index=False))
    _put(inst, "8233e4fd", "thelook", "order_items", status=ColumnFlags(source="agent", note="a status, not a stage"))
    _put(inst, "workspace", "default", "airports", name=ColumnFlags(visible=False), code=ColumnFlags(source="human"))
    _put(inst, "workspace", "housing", "housing", price=ColumnFlags())
    (inst / "workspace" / "traffic.hidden").write_text("removed\n")
    monkeypatch.setenv(home.HOME_ENV, str(tmp_path / "home"))
    monkeypatch.delenv(ENV, raising=False)
    monkeypatch.delenv(SEED_ENV, raising=False)
    monkeypatch.setattr(home, "checkout_data", lambda: data)
    monkeypatch.setattr(cc, "_DEFAULT_ROOT", inst)
    monkeypatch.setattr(cc, "_SEED_DEFAULT", seed)
    monkeypatch.setattr("pramanyx.db.serving.serving_pid", lambda: None)
    home.state_home().mkdir(parents=True)
    home.marker_path().write_text(f"state migrated from {data}\n")      # migrated before this change
    return data


SCOPES = [("workspace", "default"), ("workspace", "amazon"), ("workspace", "olist"), ("workspace", "housing"),
          ("workspace", "traffic"), ("8233e4fd", "thelook")]


def _everything() -> dict:
    return {"configs": {f"{c}/{s}": _effective(c, s) for c, s in SCOPES},
            "index_disabled": {c: sorted(cc.load_index_disabled(c)) for c in ("workspace", "8233e4fd")}}


def test_before_its_record_it_reads_the_checkout_and_the_api_will_not_start(checkout):
    assert cc._root() == checkout / NAME and cc._seed_root() == checkout / "shipped" / NAME
    owing = migrate.owed()
    assert len(owing) == 1 and NAME in owing[0] and "outside every backup" in owing[0]
    with pytest.raises(migrate.MoveOwed, match="pramanyx migrate-state --yes"):
        migrate.ensure_moved()
    said = _column_settings()
    assert said.status == FAIL and "migrate-state" in said.fix


def test_the_top_up_moves_this_installs_tree_and_every_scope_reads_the_same(checkout):
    """Kills: a root that never follows the record (reads stay in the checkout), and a move that carries the seed or
    leaves the tombstone behind (a removed dataset's shipped settings back)."""
    before = _everything()
    assert before["configs"]["workspace/traffic"] == {} and before["configs"]["workspace/amazon"]
    out = migrate.top_up(NAME)
    assert out.status == "moved", (out.reason, out.problems, out.conflicts)
    assert set(json.loads(home.moved_record(NAME).read_text())["files"]) == set(_bytes(checkout / NAME))
    assert out.files == 5                                            # four tables and the tombstone; no seed file
    assert cc._root() == home.state_home() / NAME
    assert cc._seed_root() == checkout / "shipped" / NAME, "the seed moved with the instance"
    assert _everything() == before
    assert migrate.owed() == [] and _column_settings().status == WARN     # the stale copy, said
    again = migrate.top_up(NAME)
    assert again.status == "already" and again.copied == 0 and "5 of 5 files verified" in again.reason
    assert _everything() == before


def test_after_the_move_a_write_lands_in_the_home_never_the_checkout_or_the_seed(checkout):
    migrate.top_up(NAME)
    stale, seed = _bytes(checkout / NAME), _bytes(checkout / "shipped" / NAME)
    cc.set_column_flags("workspace", "default", "flights", "dep", visible=False)
    assert _bytes(checkout / NAME) == stale and _bytes(checkout / "shipped" / NAME) == seed
    written = yaml.safe_load((home.state_home() / NAME / "workspace/default/flights.yaml").read_text())["columns"]
    assert written["tail"]["note"] == "the aircraft's registration" and written["dep"]["visible"] is False


def test_a_backup_holds_the_moved_settings_and_their_record_and_says_where_they_were(checkout, monkeypatch):
    root = home.state_home()

    def named() -> list[str]:
        return [i["path"] for i in backups._elsewhere(root) if "per-column settings" in i["why"]]
    assert named() == [str((checkout / NAME).resolve())]
    migrate.top_up(NAME)
    assert named() == []
    monkeypatch.setenv("PRAMANYX_STATE_DIR", str(root))
    monkeypatch.setenv(backups.FREE_FLOOR_ENV, "0")
    out = backups.take(now=datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc))
    assert out.status == "taken", out.reason
    sources = json.loads((out.folder / backups.MANIFEST).read_text())["sources"]
    assert {f"{NAME}/{rel}" for rel in _bytes(checkout / NAME)} <= set(sources)
    assert f"{NAME}{home.MOVED_SUFFIX}" in sources


def test_the_doctor_says_the_stale_copy_may_go_and_never_names_the_seed(checkout):
    migrate.top_up(NAME)
    said = _column_settings()
    assert said.status == WARN and "still holds 5" in said.found and "stale copy" in said.reason
    assert f"git -C {checkout / NAME} clean -ndx ." in said.fix and "shipped" not in said.fix
    import shutil
    shutil.rmtree(checkout / NAME)
    assert _column_settings().status == OK
    assert (checkout / "shipped" / NAME / "workspace" / "default" / "airports.yaml").is_file()
