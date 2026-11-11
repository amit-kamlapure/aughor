"""The weekly dependency audit (Track A7) audits every dependency, and both audits always run.

Found 2026-11-08: from its first run on 2026-11-05, `pip-audit --strict` stopped on the project's own `-e .` line
(`aughor 0.1.0`, not on PyPI) before auditing anything, and the npm audit after it was skipped — red on every push
to main, read by nobody as "the scan never ran". Run whole, it found 186 advisories in 23 Python packages and 29 in
npm. These pin the two causes; the advisories themselves are the scan's to report, not this test's.
"""
from __future__ import annotations

from pathlib import Path

import yaml

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "security.yml"


def _steps() -> dict[str, dict]:
    jobs = yaml.safe_load(WORKFLOW.read_text())["jobs"]
    return {s.get("name", ""): s for s in jobs["dependency-audit"]["steps"]}


def test_the_python_audit_leaves_out_the_project_itself():
    run = _steps()["pip-audit over uv.lock"]["run"]
    export = next(line for line in run.splitlines() if "uv export" in line)
    assert "--no-emit-project" in export, (
        "uv export writes the project's own `-e .`; pip-audit --strict fails on it and audits nothing")
    assert "--strict" in run                      # an unauditable dependency is still a failure, said


def test_the_npm_audit_runs_whatever_the_python_audit_found():
    step = _steps()["npm audit (production)"]
    assert "!cancelled()" in str(step.get("if", "")) or "always()" in str(step.get("if", "")), (
        "a failed pip-audit skips the npm audit unless the step runs regardless")
