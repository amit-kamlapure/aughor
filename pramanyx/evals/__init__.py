"""The Evals plane — one protocol over the deterministic guard battery (Wave E2).

NOTE ON NAMING: this is ``pramanyx.evals`` — product code, importable from an
installed wheel. The repo-root ``evals/`` directory is the offline benchmark
harness (Spider, golden-SQL, ratchet), is not packaged, and is unrelated. Import
paths are the reliable tell: ``from pramanyx.evals import …`` here,
``from evals import …`` there.

Usage::

    from pramanyx.evals import EvalCase, EvalObservation, run_all
    from pramanyx.trust import Scope

    case = EvalCase(artifact=sql, scope=Scope(conn=db, dialect="duckdb"))
    obs  = EvalObservation(sql=sql, rows=rows, row_count=len(rows))
    scores = run_all(case, obs)
    failed = [s for s in scores if not s.passed and not s.skipped]

Built-ins register at import so the library works out of the box, matching
``pramanyx/pipeline/__init__.py``.
"""
from __future__ import annotations

from pramanyx.evals.builtins import register_builtins
from pramanyx.evals.evaluator import (
    REQUIREMENTS,
    EvalCase,
    EvalObservation,
    EvalScore,
    Evaluator,
    available,
    sql_of,
)
from pramanyx.evals.probe import ProbeFn, probe_fn_for
from pramanyx.evals.runner import CaseOutcome, RunSummary, Target, run_suite
from pramanyx.evals.targets import (
    ask_target,
    reference_checker,
    reference_target,
    sql_generator_target,
)
from pramanyx.evals.registry import (
    clear,
    deterministic_evaluators,
    get_evaluator,
    register_evaluator,
    registered_evaluators,
    run_all,
    run_evaluator,
)

register_builtins()

__all__ = [
    "REQUIREMENTS", "CaseOutcome", "EvalCase", "EvalObservation", "EvalScore",
    "Evaluator", "ProbeFn", "RunSummary", "Target", "ask_target", "available",
    "clear", "deterministic_evaluators", "get_evaluator", "probe_fn_for",
    "reference_checker", "reference_target", "register_builtins",
    "register_evaluator", "registered_evaluators", "run_all", "run_evaluator",
    "run_suite", "sql_generator_target", "sql_of",
]
