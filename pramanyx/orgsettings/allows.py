"""What an organisation allows Pramanyx to do — the four choices that were flags (ROADMAP §3.65, 2026-10-28), and the
ones added since (`read_query_history`, Arc NV-3, 2026-11-04 — born a setting, never a flag).

Each is an admin's setting in the organisation settings, off by default. While a setting has never been set, the
environment variable of the flag it replaced still answers, so an install that ran one through its env keeps it until
an admin decides; once set, the setting is the answer and the variable is not read. A setting that replaced no flag
lists no variable: unset reads as off.
"""
from __future__ import annotations

import os

#: Each setting → the variables of the flags it replaced.
FORMER_ENV: dict[str, tuple[str, ...]] = {
    "share_aggregates": ("PRAMANYX_AGGREGATES_SHARE",),
    "outside_row_model": ("PRAMANYX_SEMOPS_JEV_CHEAP_TIER",),
    "reason_to_read_runs": ("PRAMANYX_GOVERN_JUSTIFICATIONS",),
    "scheduled_model_work": ("PRAMANYX_AGENTS_TESTING_CENTRE", "PRAMANYX_AGENTS_LEARNING_LOOP"),
    "read_query_history": (),
    # Track D1 (docs/TENX_PROGRAM_2026-11-05.md, 2026-11-06) — rows copied out of one source into the federation
    # engine for a cross-source join. Data stays in the warehouse by default; a copy is an admin's choice.
    "copy_rows_across_sources": (),
    # 2026-11-13 — the coworker (coworker/) asks its model through Pramanyx, with the organisation's models and
    # keys. What it sends is a conversation, and it leaves for that provider; lending the keys is an admin's choice.
    "coworker_models": (),
}

#: Where a person changes them, for the sentences that say a thing is off.
WHERE = "Settings ▸ Organization ▸ What Pramanyx may do"


def allows(setting: str) -> bool:
    """Whether the organisation allows ``setting`` — its admin's answer, or while unset the former flag's variable."""
    from pramanyx.orgsettings.store import load_org_settings
    if setting not in FORMER_ENV:
        raise KeyError(f"unknown organisation setting {setting!r}")
    value = getattr(load_org_settings(), setting)
    if value is not None:
        return bool(value)
    return any(os.getenv(var, "").strip().lower() in ("1", "true", "yes", "on") for var in FORMER_ENV[setting])
