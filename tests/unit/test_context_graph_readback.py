"""Wave C2 — grep-the-graph-first read-back (hermetic).

The vector path is monkeypatched out so these are deterministic and infra-free; the
lexical floor and the read-back assembly are what's under test. A separate live test
exercises the real Qdrant+Ollama vector path.
"""
from __future__ import annotations

import pytest

from pramanyx.ontology import context_graph_search as search_mod
from pramanyx.ontology.context_graph import ContextGraph, GraphEdge, GraphNode, Provenance
from pramanyx.ontology.context_graph_search import (
    lexical_search,
    merge_graphs,
    one_hop,
    search_graph,
)


@pytest.fixture(autouse=True)
def _no_vector(monkeypatch):
    """Force the lexical floor — no Ollama/Qdrant call in the unit suite."""
    monkeypatch.setattr(search_mod, "_vector_search", lambda *a, **k: [])


def _graph() -> ContextGraph:
    cg = ContextGraph(org_id="o", connection_id="c", schema_name="main")
    cg.add_node(GraphNode(id="table:Order", kind="table", label="Order",
                          provenance=Provenance(source="ontology.entity"),
                          data={"source_tables": ["orders"], "columns": ["order_id", "revenue"]}))
    cg.add_node(GraphNode(id="table:Customer", kind="table", label="Customer",
                          provenance=Provenance(source="ontology.entity"),
                          data={"source_tables": ["customers"]}))
    cg.add_edge(GraphEdge(id="e1", kind="joins_on", from_id="table:Order", to_id="table:Customer",
                          provenance=Provenance(source="join_guard", measured=0.97,
                                                note="value_overlap=0.970 join_confidence=verified")))
    cg.add_node(GraphNode(id="finding:f1", kind="finding", label="orders never terminal",
                          summary="32% of orders never reach a terminal state",
                          # a finding a person approved: only those are shown to the planner
                          provenance=Provenance(source="record", note="tier=approved"), data={"tables": ["orders"]}))
    cg.add_edge(GraphEdge(id="e2", kind="grounded_in", from_id="finding:f1", to_id="table:Order",
                          provenance=Provenance(source="dossier")))
    return cg


# ── search ────────────────────────────────────────────────────────────────────

def test_lexical_search_ranks_relevant_nodes():
    cg = _graph()
    hits = lexical_search(cg, "which orders never reach a terminal state", top_k=5)
    ids = [n.id for n, _ in hits]
    assert "finding:f1" in ids  # the finding's text overlaps strongly
    assert "table:Order" in ids


def test_unrelated_question_matches_nothing():
    cg = _graph()
    assert lexical_search(cg, "employee salary headcount by department", top_k=5) == []


def test_one_hop_pulls_findings_onto_a_matched_table():
    cg = _graph()
    nodes, edges = one_hop(cg, ["table:Order"])
    nids = {n.id for n in nodes}
    assert "finding:f1" in nids  # reached via the grounded_in edge — the read-back's reach
    assert any(e.kind == "grounded_in" for e in edges)


def test_merge_graphs_unions_schemas():
    a = _graph()
    b = ContextGraph(org_id="o", connection_id="c", schema_name="raw")
    b.add_node(GraphNode(id="table:Event", kind="table", label="Event",
                         provenance=Provenance(source="ontology.entity")))
    merged = merge_graphs([a, b])
    assert "table:Order" in merged.nodes and "table:Event" in merged.nodes


def test_search_graph_returns_ranked_without_vector():
    cg = _graph()
    hits = search_graph(cg, "orders terminal state", top_k=4)
    assert hits and hits[0][0].kind in ("finding", "table")


# ── read-back assembly ──────────────────────────────────────────────────────

def test_readback_empty_when_flag_off():
    """Byte-identical: default off ⇒ empty string, no citations."""
    from pramanyx.ontology.context_graph_readback import build_graph_prior
    p = build_graph_prior("which orders never reach a terminal state", "c", org_id="o")
    assert p.section == "" and p.cited_node_ids == []


def _save(cg, monkeypatch, tmp_path):
    from pramanyx.ontology import context_graph_store as store
    monkeypatch.setattr(store, "_ROOT", tmp_path / "context_graph")
    store.save_graph(cg)


def test_readback_surfaces_the_unread_finding(monkeypatch, tmp_path):
    """The point of Wave C: a finding that was write-only now reaches the plan, cited."""
    _save(_graph(), monkeypatch, tmp_path)
    from pramanyx.ontology.context_graph_readback import build_graph_prior, last_cited_nodes

    p = build_graph_prior("which orders never reach a terminal state", "c", org_id="o")
    assert p.fired
    assert "32% of orders never reach a terminal state" in p.section  # the finding text
    assert "[finding:f1]" in p.section                                # cited by node id
    # P2: the join states its warrant class AND the number behind it — a measured join
    # and a name match must not read as the same claim.
    assert "97% of key values overlap" in p.section
    assert "[measured:" in p.section
    assert "finding:f1" in p.cited_node_ids
    assert "finding:f1" in last_cited_nodes()                         # contextvar for the receipt


def test_readback_empty_when_no_graph_built(monkeypatch, tmp_path):
    from pramanyx.ontology import context_graph_store as store
    monkeypatch.setattr(store, "_ROOT", tmp_path / "context_graph")
    from pramanyx.ontology.context_graph_readback import build_graph_prior
    assert build_graph_prior("anything", "no-such-conn", org_id="o").section == ""


# ── the wiring: independent of closed_loop, at the one inject site ────────────

def test_build_corrections_section_appends_graph_block(monkeypatch, tmp_path):
    """The graph block reaches both live paths via build_corrections_section, and is
    independent of the corrections loop (fires with nothing else stored)."""
    _save(_graph(), monkeypatch, tmp_path)
    from pramanyx.feedback.priors import build_corrections_section
    section = build_corrections_section("which orders never reach a terminal state", "c", org_id="o")
    assert "CONNECTION GRAPH" in section
    assert "32% of orders never reach a terminal state" in section


def test_build_corrections_section_empty_when_nothing_is_stored(monkeypatch, tmp_path):
    """Both loops are always on (flag endgame Wave 5); zero-cost now means DATA-gated:
    no graph, no ledger rows, no corrections ⇒ empty string, not a flag check."""
    monkeypatch.setattr("pramanyx.ontology.context_graph_store.load_graph",
                        lambda *a, **k: None)
    from pramanyx.feedback.priors import build_corrections_section
    assert build_corrections_section("which orders never reach a terminal state",
                                     "conn-with-nothing-stored", org_id="o") == ""


def test_a_finding_over_a_withheld_table_never_reaches_the_prompt(monkeypatch, tmp_path):
    """The read-back swept the finding's edge and kept the finding: its text reached the prompt beside a notice that
    said the table was withheld. A node over a withheld table is withheld with it, and counted."""
    from pramanyx.govern import tags as T
    from pramanyx.govern.tags import ClearanceDecision, Requirement

    req = Requirement(key="tier", value="restricted", clearance="clearance.restricted")
    monkeypatch.setattr(T, "check", lambda s, held, bypass=False: (
        ClearanceDecision(securable=s, allowed=False, requirements=[req], missing=[req]) if s.endswith(".orders")
        else ClearanceDecision(securable=s, allowed=True)))
    _save(_graph(), monkeypatch, tmp_path)
    from pramanyx.ontology.context_graph_readback import build_graph_prior

    p = build_graph_prior("which orders never reach a terminal state", "c", org_id="o")
    assert "32% of orders never reach a terminal state" not in p.section
    assert "finding:f1" not in p.cited_node_ids
    assert "[2 items withheld by data governance" in p.section


# ── which few of many (2026-11-12) ────────────────────────────────────────────
# The slice keeps the first five findings. On the live graphs one table carries 107, and the five were taken in the
# order a set yielded — a different five after each restart. The order is now the question's and the evidence's.

def _busy_graph() -> ContextGraph:
    """One table with ten findings: seven about other things and three about refunds — a stale one, an old one and a
    new one. Their ids sort stale, old, new, which is the order the store hands them back in and the reverse of the
    order they should be shown in: with friendlier ids the unsorted slice passed these tests by accident."""
    cg = ContextGraph(org_id="o", connection_id="c", schema_name="main")
    cg.add_node(GraphNode(id="table:Order", kind="table", label="Order",
                          provenance=Provenance(source="ontology.entity"),
                          data={"source_tables": ["orders"], "columns": ["order_id"]}))

    def finding(fid: str, text: str, observed: str = "2026-10-01T00:00:00+00:00", tier: str = "approved", **data):
        cg.add_node(GraphNode(id=f"finding:{fid}", kind="finding", label=text, summary=text,
                              provenance=Provenance(source="record", observed_at=observed, note=f"tier={tier}"),
                              data={"tables": ["orders"], "tier": tier, **data}))
        cg.add_edge(GraphEdge(id=f"g:{fid}", kind="grounded_in", from_id=f"finding:{fid}", to_id="table:Order",
                              provenance=Provenance(source="record")))

    for i in range(7):
        finding(f"other{i}", f"shipping carrier number {i} is slow in winter")
    finding("a_refund_stale", "refund share by country was nine percent", stale=True)
    finding("b_refund_old", "refund share by country is four percent", observed="2026-08-01T00:00:00+00:00")
    finding("c_refund_new", "refund share by country is six percent", observed="2026-11-01T00:00:00+00:00")
    return cg


def _prior(monkeypatch, tmp_path, cg, question):
    from pramanyx.ontology import context_graph_store as store
    monkeypatch.setattr(store, "_ROOT", tmp_path / "context_graph")
    store.save_graph(cg)
    from pramanyx.ontology.context_graph_readback import build_graph_prior
    return build_graph_prior(question, "c", org_id="o")


def test_the_findings_shown_are_the_ones_the_question_is_about(monkeypatch, tmp_path):
    # the search matches the table and the three refund findings; the other seven arrive as the table's neighbours
    p = _prior(monkeypatch, tmp_path, _busy_graph(), "order refund share by country")
    shown = [i for i in p.cited_node_ids if i.startswith("finding:")]
    assert len(shown) == 5
    # the sound refund findings lead, newest first; the stale one comes after every sound finding it competes with
    assert shown[:2] == ["finding:c_refund_new", "finding:b_refund_old"]
    assert "finding:a_refund_stale" not in shown[:2]


def test_a_stale_finding_sinks_and_says_so_when_it_is_shown(monkeypatch, tmp_path):
    cg = _busy_graph()
    for i in range(7):                       # leave only the three refund findings, so the stale one is shown
        cg.nodes.pop(f"finding:other{i}")
        cg.edges.pop(f"g:other{i}")
    p = _prior(monkeypatch, tmp_path, cg, "order refund share by country")
    shown = [i for i in p.cited_node_ids if i.startswith("finding:")]
    assert shown[-1] == "finding:a_refund_stale"
    stale_line = next(ln for ln in p.section.splitlines() if "finding:a_refund_stale" in ln)
    assert "STALE" in stale_line
    assert all("STALE" not in ln for ln in p.section.splitlines() if "finding:c_refund_new" in ln)


def test_what_the_cap_left_out_is_said(monkeypatch, tmp_path):
    p = _prior(monkeypatch, tmp_path, _busy_graph(), "order refund share by country")
    assert "… and 5 more findings on these entities, not shown" in p.section


def test_one_hop_gives_one_order_whatever_the_process():
    """`one_hop` gathered ids in a set; the order of a set of strings changes with the process's hash seed."""
    import subprocess
    import sys
    code = (
        "import sys; sys.path.insert(0, %r)\n"
        "from tests.unit.test_context_graph_readback import _busy_graph\n"
        "from pramanyx.ontology.context_graph_search import one_hop\n"
        "print([n.id for n in one_hop(_busy_graph(), ['table:Order'])[0]])\n"
    ) % str(__import__("pathlib").Path(__file__).resolve().parents[2])
    import os
    outs = {subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True,
                           env={**os.environ, "PYTHONHASHSEED": seed}).stdout for seed in ("1", "2", "3")}
    assert len(outs) == 1


# ── only a finding a person confirmed is put before the planner ─────────────────────────────
# Receipt 2026-11-13 (LuxExperience): five earlier findings were shown under "already established
# … build on them"; none was confirmed, and one stated total GMV at four times the approved figure.

def _two_findings(confirmed_tier: str = "approved") -> ContextGraph:
    cg = ContextGraph(org_id="o", connection_id="c", schema_name="main")
    cg.add_node(GraphNode(id="table:Order", kind="table", label="Order",
                          provenance=Provenance(source="ontology.entity"),
                          data={"source_tables": ["orders"], "columns": ["order_id"]}))
    for fid, text, tier in (("ok", "refund share of orders is nine percent", confirmed_tier),
                            ("raw", "refund total of orders is 224 million", "measured")):
        cg.add_node(GraphNode(id=f"finding:{fid}", kind="finding", label=text, summary=text,
                              provenance=Provenance(source="record", note=f"tier={tier}"), data={"tables": ["orders"]}))
        cg.add_edge(GraphEdge(id=f"g:{fid}", kind="grounded_in", from_id=f"finding:{fid}", to_id="table:Order",
                              provenance=Provenance(source="record")))
    return cg


def test_an_unconfirmed_finding_is_not_shown_and_is_counted(monkeypatch, tmp_path):
    _save(_two_findings(), monkeypatch, tmp_path)
    from pramanyx.ontology.context_graph_readback import build_graph_prior
    prior = build_graph_prior("what is the refund share of orders", "c", org_id="o")
    assert "nine percent" in prior.section
    assert "224 million" not in prior.section                      # computed once, confirmed by nobody
    assert "1 earlier finding on these entities has not been confirmed by a person and is not shown" in prior.section
    assert "finding:ok" in prior.cited_node_ids and "finding:raw" not in prior.cited_node_ids


def test_with_no_confirmed_finding_none_is_shown_as_established(monkeypatch, tmp_path):
    _save(_two_findings(confirmed_tier="mined"), monkeypatch, tmp_path)
    from pramanyx.ontology.context_graph_readback import build_graph_prior
    prior = build_graph_prior("what is the refund share of orders", "c", org_id="o")
    assert "Findings a person has confirmed" not in prior.section
    assert "nine percent" not in prior.section and "224 million" not in prior.section
    assert "2 earlier findings on these entities have not been confirmed by a person and are not shown" in prior.section
