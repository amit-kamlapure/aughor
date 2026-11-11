"""Evals-as-spec promotion gate (Bet 2) — a pack can't go active until it proves itself.

Evals are the DEFINITION, not an afterthought: a pack may only be promoted to `active` on a
connection when it is fully bound AND its golden/adversarial evals pass there. This is the
gate the activation flow calls; the eval RUNNER that executes each golden question against the
engine is the connection-dependent half (deferred) — it produces the EvalResult list this gate
scores. Pure; never raises.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from aughor.packs.models import Pack


@dataclass
class EvalResult:
    question: str
    passed: bool
    detail: str = ""


@dataclass
class ActivationDecision:
    can_activate: bool = False
    pass_rate: Optional[float] = None
    reasons: list[str] = field(default_factory=list)   # blockers (empty iff can_activate)


def evaluate_activation(
    pack: Pack,
    eval_results: list[EvalResult],
    *,
    binding_pinned: bool,
    binding_verified: bool = True,
    missing_roles: Optional[list[str]] = None,
) -> ActivationDecision:
    """Decide whether `pack` may be promoted to active on a connection. Activation needs THREE
    distinct things, reported as separate, actionable blockers so 'evals pass' is never confused
    with 'not deployed':
      1. a DEPLOYED binding — pinned + verified (run Bind + verify), covering every role;
      2. the pack declares evals;
      3. every eval passes.
    `binding_pinned` = a binding is saved for this connection; `binding_verified` = it dry-ran;
    `missing_roles` = declared roles absent from the pinned binding."""
    reasons: list[str] = []

    # ── deployment (separate from evals) ────────────────────────────────────────
    if not binding_pinned:
        reasons.append("not deployed on this connection — run Bind + verify first")
    elif missing_roles:
        reasons.append(f"pinned binding is missing role(s): {missing_roles}")
    elif not binding_verified:
        reasons.append("binding is pinned but not verified — re-run Bind + verify")

    # ── evals ───────────────────────────────────────────────────────────────────
    if not pack.evals:
        reasons.append("pack declares no evals — cannot be promotion-gated")

    pass_rate: Optional[float] = None
    if eval_results:
        passed = sum(1 for r in eval_results if r.passed)
        pass_rate = round(passed / len(eval_results), 3)
        if passed < len(eval_results):
            failing = [r.question for r in eval_results if not r.passed][:5]
            reasons.append(f"{len(eval_results) - passed} eval(s) failing: {failing}")
    elif pack.evals:
        reasons.append("evals were not run on this connection")

    return ActivationDecision(can_activate=not reasons, pass_rate=pass_rate, reasons=reasons)


def is_map_only(pack: Pack) -> bool:
    """A package that is an ontology map and nothing else — no metric recipes, no roles to bind, no evals. It steers no
    plan (`intake.resolve_injection` needs a binding with roles), so the evals gate has nothing of its to run: what it
    says is a set of CLAIMS about a business's shape, and those are measured, not asked."""
    return pack.ontology is not None and not (pack.metrics or pack.entities or pack.evals)


def evaluate_map_activation(pack: Pack, report, *, binding_pinned: bool, graph_built: bool) -> ActivationDecision:
    """Decide whether a map-only package may be promoted to active, from its claims MEASURED on a connection
    (`ontology_map.apply_core_claims` — names, joins, cardinality and lifecycles; never a model call). Three things, each
    its own blocker:
      1. it is deployed on the connection;
      2. the connection has a built ontology, and the map names at least one entity in it — a map that matches nothing
         here was measured on nothing;
      3. no claim CONTRADICTS the data. A link the map reads N:1 that measures 1:N or N:N is read the wrong way round,
         and the match under it is suspect — that blocks. Two things the data may say that block nothing: a link that
         measures 1:1 where the map allows many (one is a case of many — a warehouse that tracks units holds one stock
         row per line), and a terminal state rows have left (the map's own words: "the data can refute one"). A claim
         the data could not measure (`expected`) blocks nothing either: a business with no warehouse refutes no map.
    `pass_rate` is the share of measured claims that held."""
    reasons: list[str] = []
    if not binding_pinned:
        reasons.append("not deployed on this connection — deploy it here first")
    if not graph_built or report is None:
        reasons.append("this connection has no built ontology to measure the package against")
        return ActivationDecision(can_activate=False, reasons=reasons)
    if not report.matched:
        reasons.append("the package names no entity this connection holds — nothing was measured")
    true = [c for c in report.claims if c.tier == "measured-true"]
    false = [c for c in report.claims if c.tier == "measured-false"]
    contrary = [c for c in false if not narrower_or_refuted(c)]
    if contrary:
        said = [f"{c.subject}: expected {c.expected}, measured {c.measured}" for c in contrary[:5]]
        reasons.append(f"{len(contrary)} claim(s) contradict the data: {said}")
    measured = len(true) + len(false)
    return ActivationDecision(can_activate=not reasons, pass_rate=round(len(true) / measured, 3) if measured else None,
                              reasons=reasons)


def narrower_or_refuted(claim) -> bool:
    """A measured-false claim that says the business differs from the usual, not that the map was read onto the wrong
    tables: a link narrower than expected (1:1 where many were allowed), or a terminal state the data refuted."""
    if claim.kind == "lifecycle":
        return True
    return claim.kind == "link" and claim.measured == "1:1" and claim.expected in ("N:1", "1:N")
