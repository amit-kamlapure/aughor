"""Specialist Agents / Domain Expertise Packs (Phase A · P0).

A pack is a declarative FOLDER that declares a domain expert's *intent* — persona, metric
recipes, entity ROLE bindings, the questions it owns, playbooks, a surface, and evals. The
existing engine (ADA / Insight / Explorer) is unchanged; a pack only injects steering
metadata at intake, and pramanyx's grounding compiles that intent against the real warehouse.

P0 ships the spec + loader + validator + feature flag (no LLM, no connection). The
entity-binding resolver (the deploy-time grounding crux) is P1. See
docs/DOMAIN_EXPERTISE_PACKS.md and docs/DOMAIN_EXPERTISE_PACKS_10X.md.
"""
from pramanyx.packs.models import (
    Pack,
    PackManifest,
    PackMetric,
    PackQuestions,
    PackPlaybook,
    PackSurface,
    PackEval,
    RoleSpec,
)
from pramanyx.packs.loader import load_pack, list_packs, PacksError
from pramanyx.packs.validate import validate_pack, ValidationReport
from pramanyx.packs.resolver import (
    SchemaFacts, TableFact, ColumnFact, BindingCandidate,
    propose_bindings, binding_report, verify_binding_columns,
)
from pramanyx.packs.evalrunner import run_pack_evals, check_expectation
from pramanyx.packs.engine_eval import extract_plan_meta, make_ask_fn
from pramanyx.packs.dryrun import dry_run_binding
from pramanyx.packs.deltastore import record_deltas, list_deltas, set_delta_status
from pramanyx.packs.adapter import schema_facts_from_table_cols
from pramanyx.packs.bindings import save_binding, load_binding, is_bound
from pramanyx.packs.routing import select_pack, rank_packs, score_pack
from pramanyx.packs.inject import build_injection, PackInjection
from pramanyx.packs.trust import autonomy_tier, routing_weight, tier_allows
from pramanyx.packs.evalgate import evaluate_activation, EvalResult, ActivationDecision
from pramanyx.packs.flywheel import distill_deltas, llm_distill_deltas, PackDelta, DistillResult
from pramanyx.packs.org import resolve_metric_definition, MetricClaim, route_escalation
from pramanyx.packs.mandate import Mandate, evaluate_mandate, MandateOutcome
from pramanyx.packs.marketplace import import_readiness, ImportReadiness
from pramanyx.packs.instruments import Instrument, can_invoke

__all__ = [
    "Pack", "PackManifest", "PackMetric", "PackQuestions", "PackPlaybook",
    "PackSurface", "PackEval", "RoleSpec",
    "load_pack", "list_packs", "PacksError",
    "validate_pack", "ValidationReport",
    "SchemaFacts", "TableFact", "ColumnFact", "BindingCandidate",
    "propose_bindings", "binding_report",
]
