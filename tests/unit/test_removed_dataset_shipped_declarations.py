"""A removed dataset's SHIPPED declarations stay removed (punch list 78, 2026-11-09).

Measured first, on main: removing a dataset (`ontology.removal.purge`) deleted this install's declarations for it, but
the repository ships declarations too — `data/shipped/ontology_overrides/`, filed under a connection's scope key
(`key=<scope key>/<dataset>/…`) or, for a builtin, its id (`<conn>/<dataset>/…`) — and nothing hid those, so the
moment the install's files went the shipped ones answered again: the removal was undone by the seed. The same split,
and the same fix, as the per-column settings got that morning (`column_config.hide_seeds`): a tombstone
`<conn>/<dataset>.hidden` in this install's tree, written BEFORE any file goes (AGENTS.md: the tombstone, not the
files' absence, is the authority), honoured by every reader of the shipped layer, and never named by a removal's
targets, so it outlives the files.

The seed here is a COPY of the real shipped tree, in tmp — `data/shipped/` is the repository's and is never written.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
import yaml

from pramanyx.ontology import overrides as OV
from pramanyx.ontology.models import OntologyGraph
from pramanyx.ontology.overrides import OntologyOverride

REPO = Path(__file__).resolve().parents[2]
SHIPPED = REPO / "data" / "shipped" / "ontology_overrides"
LUX = "c0ffee42"          # a connection this install minted, carrying the `luxexperience` scope key
TWIN = "bee5bee5"         # a second connection carrying the SAME key — its copy of the declarations is its own
LOOK = "7e1007e1"         # a third, carrying `thelook`
KEYS = {LUX: "luxexperience", TWIN: "luxexperience", LOOK: "thelook"}


def _ship(seed: Path, segment: str, schema: str, kind: str, target_id: str, **fields) -> Path:
    p = seed / segment / schema / kind / f"{target_id}.yaml"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(yaml.safe_dump(OntologyOverride(target_kind=kind, target_id=target_id, fields=fields).model_dump()))
    return p


def _bytes(root: Path) -> dict[str, bytes]:
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in sorted(root.rglob("*")) if p.is_file()}


@pytest.fixture
def store(tmp_path, monkeypatch):
    """The three layers at tmp — the seed a copy of the real shipped tree, plus a sibling dataset under the same key
    and the shape a builtin's seed takes (filed by its id) — and a registry holding the three keyed connections."""
    inst, seed, draft = tmp_path / "instance", tmp_path / "seed", tmp_path / "draft"
    shutil.copytree(SHIPPED, seed)
    _ship(seed, "key=luxexperience", "archive", "rule", "old_orders", display_name="Old orders")
    _ship(seed, "workspace", "amazon", "rule", "prime_orders", display_name="Prime orders")
    _ship(seed, "workspace", "default", "rule", "long_haul", display_name="Long haul")
    monkeypatch.setattr(OV, "_ROOT", inst)
    monkeypatch.setattr(OV, "_SEED_ROOT", seed)
    monkeypatch.setattr(OV, "_DRAFT_ROOT", draft)
    # the registry's own reads over a stand-in settings file and row table, so its scope-key logic runs as it does live
    from pramanyx.db import registry
    settings = {conn: {"scope_key": key} for conn, key in KEYS.items()}
    registered = set(KEYS)
    monkeypatch.setattr(registry, "_load_settings", lambda: settings)
    monkeypatch.setattr(registry, "is_registered", lambda conn: conn in registered or conn in registry._BUILTIN_IDS)
    return inst, seed, draft, settings, registered


@pytest.fixture
def removal(store, tmp_path, monkeypatch):
    """Only the declarations' two trees, so a purge here touches nothing else."""
    from pramanyx.ontology import removal as R
    monkeypatch.setattr(R, "_trees", lambda: [OV._ROOT, OV._DRAFT_ROOT])
    monkeypatch.setattr(R, "_context_graph_root", lambda: tmp_path / "no-graphs")
    monkeypatch.setattr("pramanyx.knowledge.indexer.delete_document", lambda doc_id: False)
    return R


def _ids(conn: str, schema: str) -> list[tuple[str, str]]:
    return [(o.target_kind, o.target_id) for o in OV.load_overrides(conn, schema)]


def _served(conn: str, schema: str = "luxexperience") -> OntologyGraph:
    """The LuxExperience graph as a fresh build serves it — its types, their links and lookups, nothing declared — with
    every declaration this connection reads laid over it."""
    snapshot = json.loads((REPO / "evals" / "ablation_luxexperience_business_ontology.json").read_text())
    built = ("connection_id", "schema_name", "schema_fingerprint", "entities", "relationships",
             "entity_to_tables", "table_to_entity", "relationship_index")
    bare = OntologyGraph.model_validate({k: snapshot[k] for k in built if k in snapshot})
    assert bare.entities and not bare.declared_actions(), "probe failed: the bare graph is not what a build serves"
    graph, _ = OV.apply_overrides(bare, conn, schema)
    return graph


def _declare(conn: str, schema: str, kind: str, target_id: str, **fields) -> None:
    OV.publish_override(conn, schema, OntologyOverride(target_kind=kind, target_id=target_id, fields=fields))


# ── the removal stays a removal, through every reader ───────────────────────────────────────────

def test_a_removed_datasets_shipped_declarations_stay_hidden_through_every_reader(store, removal):
    """Kills: a removal that only removes (the shipped rules answer again), one that deletes the SEED, a reader that
    skips the tombstone (the overlay, the scope listing, the census, a withdrawal's 'was it visible'), and a marker
    that hides more than its own connection's dataset."""
    inst, seed, _, settings, _ = store
    before = _bytes(seed)
    assert ("rule", "vip_customers") in _ids(LUX, "luxexperience"), "probe failed: the shipped rules never read"
    _declare(LUX, "luxexperience", "rule", "our_rule", display_name="Ours")                # this install's own
    got = removal.purge(LUX, "luxexperience")
    assert got["ontology_trees"] == 1

    # every reader: the store, one declaration, the served graph, the scope listing, the census, a withdrawal
    assert _ids(LUX, "luxexperience") == []
    assert _bytes(seed) == before                                                          # the seed is never written
    assert (inst / LUX / "luxexperience.hidden").is_file() and not (inst / LUX / "luxexperience").exists()
    assert OV.find_override(LUX, "luxexperience", "rule", "vip_customers") is None
    graph = _served(LUX)
    assert graph.rules == {} and graph.processes == {} and graph.declared_actions() == []
    assert "luxexperience" not in OV.override_scopes(LUX)
    from pramanyx.ontology.prompt_reach import action_census
    census = action_census()
    assert not any(scope.endswith("/luxexperience") and scope.startswith((LUX, "key=")) for scope in census), census
    assert OV.publish_withdrawal(LUX, "luxexperience", "rule", "vip_customers") is False     # nothing was visible
    assert not (inst / LUX / "luxexperience" / "rule").exists()                               # …and no marker for it

    # what is not this connection's dataset still reads: its sibling under the same key, the twin connection
    # carrying the same key, and another key's
    assert _ids(LUX, "archive") == [("rule", "old_orders")] and OV.override_scopes(LUX) == ["archive"]
    assert "vip_customers" in _served(TWIN).rules
    assert census.get(f"{TWIN}/luxexperience") == ["flag_order_for_review"]
    assert ("rule", "completed_orders") in _ids(LOOK, "thelook")

    # what this install declares for the dataset later reads; the shipped declarations stay hidden
    _declare(LUX, "luxexperience", "rule", "after", display_name="After")
    assert _ids(LUX, "luxexperience") == [("rule", "after")]
    assert OV.override_scopes(LUX) == ["archive", "luxexperience"]
    # the tombstone is the connection's, so a scope key changed later reaches no shipped declaration for it either
    settings[LUX]["scope_key"] = "thelook"
    _ship(seed, "key=thelook", "luxexperience", "rule", "elsewhere")
    assert _ids(LUX, "luxexperience") == [("rule", "after")]


def test_a_builtins_seed_filed_by_its_id_is_hidden_the_same_way(store, removal):
    """The other shape the seed takes: `<conn>/<dataset>/…`. Kills: a tombstone honoured for the scope key only."""
    inst = store[0]
    assert _ids("workspace", "amazon") == [("rule", "prime_orders")]
    removal.purge("workspace", "amazon")
    assert _ids("workspace", "amazon") == [] and OV.override_scopes("workspace") == ["default"]
    assert (inst / "workspace" / "amazon.hidden").is_file()
    assert _ids("workspace", "default") == [("rule", "long_haul")]


def test_the_tombstone_is_written_before_the_files_go(store, removal, monkeypatch):
    """AGENTS.md: reversing durable intent clears the durable record before acting. Kills: hiding after the delete, a
    removal that dies half-way leaving the seed answering, and going on with the delete when the marker could not be
    written (this install's declarations gone, the shipped ones back)."""
    inst, _, draft = store[:3]
    mark = inst / LUX / "luxexperience.hidden"
    _declare(LUX, "luxexperience", "rule", "ours", display_name="Ours")
    seen = []
    real = removal._remove
    monkeypatch.setattr(removal, "_remove", lambda path, kept: seen.append(mark.exists()) or real(path, kept))
    removal.purge(LUX, "luxexperience")
    assert seen and all(seen)

    # a removal that fails after the marker: the install's files stay, and the seed still does not answer
    mark.unlink()
    _declare(LUX, "luxexperience", "rule", "ours", display_name="Ours")

    def dies(path, kept):
        raise OSError("disk went away")
    monkeypatch.setattr(removal, "_remove", dies)
    removal.purge(LUX, "luxexperience")
    assert mark.is_file()
    assert _ids(LUX, "luxexperience") == [("rule", "ours")]

    # a marker that cannot be written: nothing of the declarations goes, so the shipped ones stay shadowed as before
    mark.unlink()
    monkeypatch.setattr(removal, "_remove", real)
    OV.save_override(LUX, "luxexperience", OntologyOverride(target_kind="rule", target_id="drafted",
                                                            fields={"display_name": "Drafted"}))   # a change: drafted
    assert (draft / LUX / "luxexperience" / "rule" / "drafted.yaml").is_file()

    def cannot(conn, schema):
        raise PermissionError("read-only")
    monkeypatch.setattr(OV, "hide_seeds", cannot, raising=False)
    removal.purge(LUX, "luxexperience")
    assert (inst / LUX / "luxexperience" / "rule" / "ours.yaml").is_file(), "removed without its tombstone"
    assert (draft / LUX / "luxexperience" / "rule" / "drafted.yaml").is_file(), "the draft removed without it"


def test_a_second_removal_is_idempotent(store, removal):
    inst = store[0]
    removal.purge(LUX, "luxexperience")
    mark = inst / LUX / "luxexperience.hidden"
    assert mark.is_file(), "the first removal left no tombstone"
    first = mark.read_bytes()
    assert removal.purge(LUX, "luxexperience")["ontology_trees"] == 0
    assert mark.read_bytes() == first and _ids(LUX, "luxexperience") == []
    assert sorted(p.relative_to(inst).as_posix() for p in inst.rglob("*") if p.is_file()) == [
        f"{LUX}/luxexperience.hidden"]


def test_a_dataset_no_seed_holds_and_a_whole_connection_leave_no_tombstone(store, removal):
    """A marker only where a shipped declaration would otherwise answer. A whole connection's removal writes none: its
    tree goes whole, and a tombstone named after it would be the residue its delete is checked for (`residue_of`)."""
    inst = store[0]
    _declare("c1", "main", "rule", "r", display_name="R")
    removal.purge("c1", "main")
    assert not list(inst.rglob("*.hidden"))
    removal.purge(LUX)
    assert not (inst / LUX).exists() and not list(inst.rglob("*.hidden"))


def test_the_census_counts_a_keyed_declaration_once_per_connection_that_reads_it(store):
    """The census counts what a reader sees: a shipped declaration filed under a scope key is the connections' that
    carry the key — counted under each, minus what each hid — never under the key's own folder, which no reader is
    ever asked about. Kills: the census reading the seed's folders as they lie (a withdrawn shipped action counted
    still, and a connection's own copy of a shipped one counted twice)."""
    from pramanyx.ontology.prompt_reach import action_census
    assert action_census() == {f"{LUX}/luxexperience": ["flag_order_for_review"],
                               f"{TWIN}/luxexperience": ["flag_order_for_review"]}
    _declare(TWIN, "luxexperience", "action", "flag_order_for_review", display_name="Ours")   # shadows the seed's
    assert OV.publish_withdrawal(LUX, "luxexperience", "action", "flag_order_for_review") is True
    assert action_census() == {f"{TWIN}/luxexperience": ["flag_order_for_review"]}


def test_the_census_reads_no_connection_that_is_gone(store):
    """A removed connection's scope key can outlive it in the settings until the residue sweep: the census reads only
    the connections the registry holds."""
    from pramanyx.ontology.prompt_reach import action_census
    store[4].discard(LUX)
    assert sorted(action_census()) == [f"{TWIN}/luxexperience"]


def test_every_connection_the_seed_files_by_id_is_one_no_removal_meets():
    """A whole-connection removal hides no shipped declaration: the ones filed by a scope key reach a connection only
    through its settings, which go with it, and one filed by a connection's own id would need that connection to be
    one the registry cannot remove (`column_config.purge_connection`'s rule). Measured from the real seed."""
    from pramanyx.db import registry
    tops = sorted(p.name for p in SHIPPED.iterdir() if p.is_dir())
    assert tops, "probe failed: no shipped declarations"
    for name in tops:
        if name.startswith("key="):
            continue
        with pytest.raises(ValueError, match="cannot be deleted"):
            registry.delete_connection(name)
