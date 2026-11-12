"""What a deployed pack says an entity does, served on the object-type map (2026-11-10).

The Business Atlas draws a business by each entity's ROLE — party, place, asset, catalog, stock, transaction,
event, calendar — so one composer serves every industry and none is written into it. The role is the pack's word, read
only from packs DEPLOYED on the connection (the user's call, 2026-11-10: no draft pack's word is shown about a
connection's data), matched by names and aliases as every core claim is. These hold that on theLook's graph.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

from pramanyx.ontology.models import OntologyGraph
from pramanyx.packs import ontology_map as OM
from pramanyx.semantic.object_types import object_type_map

REPO = Path(__file__).resolve().parents[2]
THELOOK = REPO / "evals" / "ablation_thelook_business_ontology.json"


def _graph() -> OntologyGraph:
    return OntologyGraph.model_validate(json.loads(THELOOK.read_text()))


def _deployed(monkeypatch, *pack_ids: str) -> None:
    monkeypatch.setattr(OM, "bound_pack_ids", lambda connection_id, schema_name: list(pack_ids))


def test_a_deployed_pack_says_what_each_matched_type_does(monkeypatch):
    _deployed(monkeypatch, "core-ecommerce")
    said = OM.bound_object_roles(_graph(), "c1", "thelook")
    assert {eid: (s["roles"], s["object"]) for eid, s in said.items()} == {
        "User": (["party"], "Customer"), "Order": (["transaction"], "Order"), "OrderItem": (["event"], "OrderItem"),
        "Product": (["catalog"], "Product"), "DistributionCenter": (["place"], "Warehouse"),
        "InventoryItem": (["stock"], "InventoryLot")}
    assert {s["pack"] for s in said.values()} == {"core-ecommerce"}
    assert {eid: s["drawn_as"] for eid, s in said.items() if s["drawn_as"]} == {"DistributionCenter": "depot"}
    assert "Event" not in said, "a type no pack object matches is absent, never guessed"


def test_no_deployed_pack_says_nothing(monkeypatch):
    _deployed(monkeypatch)
    assert OM.bound_object_roles(_graph(), "c1", "thelook") == {}


def test_a_pack_that_declares_no_objects_says_nothing(monkeypatch):
    _deployed(monkeypatch, "retail")                # the retail package ships areas and metrics, no object map
    assert OM.bound_object_roles(_graph(), "c1", "thelook") == {}


def test_the_first_deployed_pack_to_match_a_type_keeps_it(monkeypatch):
    _deployed(monkeypatch, "core-ecommerce", "b2b-saas")
    said = OM.bound_object_roles(_graph(), "c1", "thelook")
    assert said["User"]["pack"] == "core-ecommerce" and said["User"]["object"] == "Customer"


def test_the_map_carries_the_role_on_each_type_and_an_empty_list_where_none_is_said(monkeypatch):
    graph = _graph()
    plain = {t["id"]: t for t in object_type_map(graph)["object_types"]}
    assert all(t["pack_roles"] == [] and t["pack"] == "" and t["pack_object"] == "" for t in plain.values())
    _deployed(monkeypatch, "core-ecommerce")
    told = {t["id"]: t for t in object_type_map(graph, pack_roles=OM.bound_object_roles(graph, "c1", "thelook"))["object_types"]}
    assert (told["DistributionCenter"]["pack_roles"], told["DistributionCenter"]["pack_object"],
            told["DistributionCenter"]["pack"]) == (["place"], "Warehouse", "core-ecommerce")
    assert told["DistributionCenter"]["pack_drawn_as"] == "depot" and told["User"]["pack_drawn_as"] == ""
    assert all(t["pack_drawn_as"] == "" for t in plain.values())
    assert told["Event"]["pack_roles"] == []
    assert told["Event"]["role"] == plain["Event"]["role"], "the builder's own reading of the type is untouched"


def test_every_shipped_pack_spells_its_roles_from_the_one_list():
    used: dict[str, set[str]] = {}
    for path in sorted((REPO / "packs").glob("*/ontology.yaml")):
        for obj in (yaml.safe_load(path.read_text()) or {}).get("objects", []):
            for role in obj.get("roles", []):
                used.setdefault(role, set()).add(f"{path.parent.name}:{obj['name']}")
    assert used, "the shipped packs declare object roles"
    assert {role: sorted(where) for role, where in used.items() if role not in OM.OBJECT_ROLES} == {}


def test_the_web_composer_draws_by_the_same_list():
    """The Atlas composer keeps its own copy of the vocabulary (it runs in the browser); the two must not drift."""
    import re
    source = (REPO / "web" / "lib" / "atlas" / "compose.ts").read_text()
    listed = re.search(r"export const ROLES = \[(.*?)\] as const", source, flags=re.S)
    assert listed, "web/lib/atlas/compose.ts declares ROLES"
    assert tuple(re.findall(r'"([a-z]+)"', listed.group(1))) == OM.OBJECT_ROLES


def test_a_shape_asked_for_refines_a_role_the_object_has_or_is_not_used(monkeypatch):
    from pramanyx.packs.models import ExpectedObject, PackOntology
    asked = PackOntology(objects=[ExpectedObject(name="Customer", roles=["party"], aliases=["users"], drawn_as="depot"),
                                  ExpectedObject(name="Product", roles=["catalog"], drawn_as="no-such-shape")])
    _deployed(monkeypatch, "any")
    monkeypatch.setattr(OM, "resolve_ontology", lambda pack_id: asked)
    said = OM.bound_object_roles(_graph(), "c1", "thelook")
    assert (said["User"]["roles"], said["User"]["drawn_as"]) == (["party"], ""), "a place's shape is not a party's"
    assert said["Product"]["drawn_as"] == ""


def test_every_shipped_pack_asks_only_for_a_known_shape_of_a_role_the_object_has():
    wrong = []
    for path in sorted((REPO / "packs").glob("*/ontology.yaml")):
        for obj in (yaml.safe_load(path.read_text()) or {}).get("objects", []):
            asked = obj.get("drawn_as", "")
            if asked and OM.OBJECT_SHAPES.get(asked) not in obj.get("roles", []):
                wrong.append(f"{path.parent.name}:{obj['name']} drawn_as {asked}")
    assert wrong == []


def test_the_web_composer_knows_the_same_shapes():
    import re
    source = (REPO / "web" / "lib" / "atlas" / "compose.ts").read_text()
    listed = re.search(r"const REFINES[^=]*= \{(.*?)\};", source, flags=re.S)
    assert listed, "web/lib/atlas/compose.ts declares REFINES"
    assert dict(re.findall(r'(\w+): "(\w+)"', listed.group(1))) == OM.OBJECT_SHAPES


# ── a person's own choice of shape (2026-11-12) ────────────────────────────────────────────────────────────────────

def test_a_shape_says_the_role_it_draws_and_the_web_knows_the_same_ones():
    import re
    assert OM.shape_role("depot") == "place" and OM.shape_role("cluster") == "party" and OM.shape_role("tiles") == "catalog"
    assert OM.shape_role("no-such-shape") == "" and OM.shape_role("") == ""
    assert set(OM.ROLE_SHAPES) == set(OM.OBJECT_ROLES)                      # one plain shape for each role
    source = (REPO / "web" / "lib" / "atlas" / "compose.ts").read_text()
    listed = re.search(r"const ROLE_SHAPE[^=]*= \{(.*?)\};", source, flags=re.S)
    assert listed and dict(re.findall(r'(\w+): "(\w+)"', listed.group(1))) == OM.ROLE_SHAPES


def test_a_persons_shape_is_an_entity_field_a_release_reads_as_words_and_the_map_serves():
    from pramanyx.ontology import compatibility
    from pramanyx.ontology.models import OntologyEntity, OntologyGraph
    from pramanyx.ontology.overrides import _EDITABLE
    from pramanyx.semantic.object_types import describe_object_type, object_type_map
    assert "drawn_as" in _EDITABLE["entity"] and "drawn_as" in compatibility._WORDS
    e = OntologyEntity(id="Depot", display_name="Depot", source_tables=["depots"], identity_key="id", grain_verified=True,
                       drawn_as="depot")
    g = OntologyGraph.model_construct(connection_id="c", schema_name="s", entities={"Depot": e}, relationships={})
    [row] = object_type_map(g)["object_types"]
    assert row["drawn_as"] == "depot" and row["pack_drawn_as"] == ""       # the person's choice, apart from a package's
    detail = describe_object_type(g, "Depot")
    assert (detail["drawn_as"], detail["drawn_role"]) == ("depot", "place")
