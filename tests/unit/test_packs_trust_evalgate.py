"""Trust economy (Bet 4) + evals-as-spec gate (Bet 2) — 2026-06-27.

Trust tiers are earned from human verdicts (external signal). Activation requires evals to
pass + full binding. See aughor/packs/trust.py, evalgate.py.
"""
from aughor.packs.trust import autonomy_tier, routing_weight, tier_allows, SHADOW, ASSISTED, TRUSTED
from aughor.packs.evalgate import evaluate_activation, EvalResult
from aughor.packs.models import Pack, PackManifest, PackEval


# ── trust economy ─────────────────────────────────────────────────────────────

def test_insufficient_sample_is_shadow():
    assert autonomy_tier({"total": 2, "acceptance_rate": 1.0}) == SHADOW
    assert autonomy_tier({"total": 0, "acceptance_rate": None}) == SHADOW


def test_strong_record_earns_trusted():
    assert autonomy_tier({"total": 40, "acceptance_rate": 0.9}) == TRUSTED


def test_moderate_record_is_assisted():
    assert autonomy_tier({"total": 10, "acceptance_rate": 0.65}) == ASSISTED


def test_poor_record_stays_shadow():
    assert autonomy_tier({"total": 30, "acceptance_rate": 0.4}) == SHADOW


def test_routing_weight_rewards_and_penalises():
    assert routing_weight({"total": 50, "acceptance_rate": 0.9}) > 1.0
    assert routing_weight({"total": 50, "acceptance_rate": 0.4}) < 1.0
    assert routing_weight({"total": 1, "acceptance_rate": 1.0}) == 1.0   # no evidence → neutral


def test_tier_permissions():
    assert tier_allows(TRUSTED, "act")
    assert not tier_allows(ASSISTED, "act")
    assert tier_allows(ASSISTED, "route")
    assert not tier_allows(SHADOW, "route")
    assert tier_allows(SHADOW, "propose")


# ── evals-as-spec gate ────────────────────────────────────────────────────────

def _pack_with_evals(n=2):
    return Pack(manifest=PackManifest(id="p", name="P"),
                evals=[PackEval(question=f"q{i}") for i in range(n)])


def test_activation_blocked_until_evals_pass_and_deployed():
    pack = _pack_with_evals()
    results = [EvalResult("q0", True), EvalResult("q1", False)]
    d = evaluate_activation(pack, results, binding_pinned=True, binding_verified=True)
    assert not d.can_activate
    assert d.pass_rate == 0.5
    assert any("failing" in r for r in d.reasons)


def test_activation_allowed_when_all_pass_and_deployed():
    pack = _pack_with_evals()
    results = [EvalResult("q0", True), EvalResult("q1", True)]
    d = evaluate_activation(pack, results, binding_pinned=True, binding_verified=True)
    assert d.can_activate and d.pass_rate == 1.0 and d.reasons == []


def test_activation_blocked_when_not_deployed_even_if_evals_pass():
    # The exact confusing case: 100% pass but blocked because nothing is pinned.
    pack = _pack_with_evals()
    d = evaluate_activation(pack, [EvalResult("q0", True), EvalResult("q1", True)],
                            binding_pinned=False)
    assert not d.can_activate
    assert d.pass_rate == 1.0                                   # evals DID pass
    assert any("not deployed" in r for r in d.reasons)         # but it's not deployed


def test_activation_blocked_when_pinned_but_unverified():
    pack = _pack_with_evals()
    d = evaluate_activation(pack, [EvalResult("q0", True), EvalResult("q1", True)],
                            binding_pinned=True, binding_verified=False)
    assert not d.can_activate and any("not verified" in r for r in d.reasons)


def test_activation_blocked_when_pinned_missing_roles():
    pack = _pack_with_evals()
    d = evaluate_activation(pack, [EvalResult("q0", True), EvalResult("q1", True)],
                            binding_pinned=True, missing_roles=["cohort_anchor"])
    assert not d.can_activate and any("missing role" in r for r in d.reasons)


def test_activation_blocked_without_evals():
    pack = Pack(manifest=PackManifest(id="p", name="P"))
    d = evaluate_activation(pack, [], binding_pinned=True, binding_verified=True)
    assert not d.can_activate and any("no evals" in r for r in d.reasons)


# ── the measured-claims gate, for a package that is a map and nothing else (2026-11-11) ──────────────────────────────
# The evals gate has nothing to run on such a package (no recipes, no roles, no evals), so until this gate the
# e-commerce maps had no route to active — and the Business Atlas, which draws by DEPLOYED packages only, drew every
# connection plain. Held on the two real graphs the drafter's tests use.

def _real_graph(name):
    import json
    from pathlib import Path
    from aughor.ontology.models import OntologyGraph
    return OntologyGraph.model_validate(json.loads((Path(__file__).resolve().parents[2] / "evals" / name).read_text()))


def _measured(pack_id, graph):
    from aughor.packs.ontology_map import apply_core_claims, load_pack_by_id, resolve_ontology
    held = graph.model_copy(deep=True)
    return load_pack_by_id(pack_id), apply_core_claims(held, resolve_ontology(pack_id), pack_id)


def test_which_packages_are_a_map_and_nothing_else():
    from aughor.packs.evalgate import is_map_only
    from aughor.packs.ontology_map import load_pack_by_id
    assert is_map_only(load_pack_by_id("core-ecommerce")) and is_map_only(load_pack_by_id("ecommerce-extended"))
    assert not is_map_only(load_pack_by_id("airline"))     # a map AND recipes and evals: the evals gate stays its gate
    assert not is_map_only(load_pack_by_id("retail"))      # recipes and no map


def test_a_map_is_activated_by_its_claims_measured_on_the_connection():
    from aughor.packs.evalgate import evaluate_map_activation
    pack, report = _measured("ecommerce-extended", _real_graph("ablation_samples_ecommerce_ontology_measured.json"))
    d = evaluate_map_activation(pack, report, binding_pinned=True, graph_built=True)
    assert d.can_activate and d.reasons == [] and d.pass_rate == 1.0
    # deployment is its own blocker, as it is for the evals gate
    d = evaluate_map_activation(pack, report, binding_pinned=False, graph_built=True)
    assert not d.can_activate and any("not deployed" in r for r in d.reasons)
    # no built ontology: nothing to measure against, and it says that rather than passing on nothing
    d = evaluate_map_activation(pack, None, binding_pinned=True, graph_built=False)
    assert not d.can_activate and any("no built ontology" in r for r in d.reasons)


def test_a_narrower_link_is_the_business_differing_and_a_reversed_one_is_a_wrong_reading():
    """theLook tracks stock by unit: one inventory row per order line, 1:1 where the map allows N:1. That is a business
    differing from the usual and blocks nothing; the same link measured the other way round blocks."""
    from aughor.packs.evalgate import evaluate_map_activation
    pack, report = _measured("ecommerce-extended", _real_graph("ablation_thelook_business_ontology.json"))
    false = [c for c in report.claims if c.tier == "measured-false"]
    assert [(c.subject, c.expected, c.measured) for c in false] == [("OrderItem → InventoryLot", "N:1", "1:1")]
    d = evaluate_map_activation(pack, report, binding_pinned=True, graph_built=True)
    assert d.can_activate and d.pass_rate == 0.9            # said in the rate, not hidden
    false[0].measured = "1:N"
    d = evaluate_map_activation(pack, report, binding_pinned=True, graph_built=True)
    assert not d.can_activate and "OrderItem → InventoryLot" in d.reasons[0]


def test_a_map_that_names_nothing_here_was_measured_on_nothing():
    from aughor.ontology.models import OntologyGraph
    from aughor.packs.evalgate import evaluate_map_activation
    empty = OntologyGraph.model_construct(connection_id="x", schema_name="s", entities={}, relationships={},
                                          core_claims=[])
    pack, report = _measured("ecommerce-extended", empty)
    d = evaluate_map_activation(pack, report, binding_pinned=True, graph_built=True)
    assert not d.can_activate and any("names no entity" in r for r in d.reasons)


def test_measuring_a_map_writes_nothing_to_the_ontology_it_is_measured_against(monkeypatch):
    """The door measures on a copy: asking whether a package may be activated must not record its claims."""
    from aughor.routers import packs as R
    graph = _real_graph("ablation_thelook_business_ontology.json")
    before = len(graph.core_claims)
    monkeypatch.setattr(R, "_graph_for", lambda c, s: graph)
    monkeypatch.setattr(R, "load_binding", lambda *a, **k: {"bindings": {}, "verified": True})
    import aughor.routers.connections as C
    monkeypatch.setattr(C, "open_connection_for", lambda cid: (_ for _ in ()).throw(RuntimeError("unreachable")))
    from aughor.packs.ontology_map import load_pack_by_id
    decision, report = R._map_decision(load_pack_by_id("ecommerce-extended"), "ecommerce-extended", "c1", "s")
    assert decision.can_activate and len(report.matched) == 6
    assert len(graph.core_claims) == before
