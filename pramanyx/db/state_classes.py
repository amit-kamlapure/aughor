"""Every piece of the platform's own state, by class (Track B3 of the 10× program, 2026-11-08).

The state folder (`db.paths.state_dir`) holds about fifty SQLite stores, forty JSON, JSONL and YAML files and a dozen
folders, written by more than seventy modules. Before this, nothing said which of them is the platform's record and
which a cache: a restore, a removal, a migration to a shared store or an operator deciding what to keep had to guess,
and five stores no code has named since an earlier version sat beside the rest, backed up every hour.

One class each, by what losing it costs:

- **record** — what people and the platform decided and configured: connections, roles, settings, definitions,
  schedules, approvals. Restoring it restores how the install works.
- **evidence** — the account of what happened: what ran, what left, what was claimed and judged. Append-only; never
  restored over (`backups.NEVER_RESTORED`, `CARRIED_FORWARD`).
- **artifact** — what people made or brought and open again: canvases, dashboards, saved queries, sheets, uploads,
  documents, datasets. The large, per-person part — the one an object store would hold (B3's second half, not built).
- **ephemeral** — rebuilt from the above or from the warehouse: caches, indexes, mirrors, learned priors, markers of
  the running server. Losing one costs time, not truth.
- **left behind** — written by an earlier version or by hand; nothing in the platform reads or writes it now, or
  reads it only once, to import it.
- **not state** — in the folder, not the platform's: the backups themselves, copies taken by hand, a person's own
  warehouse folder, the Mac's folder settings.

`docs/STATE_CLASSES.md` is rendered from this table (`python -m pramanyx.db.state_classes`), and
`tests/unit/test_state_classes.py` holds the two equal, finds every SQLite store the code names and fails on one
without a class, and refuses a "left behind" entry the code still names. `pramanyx doctor` classifies the live folder:
what a runtime path names is only seen there.
"""
from __future__ import annotations

import fnmatch
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

RECORD, EVIDENCE, ARTIFACT, EPHEMERAL, LEFT_BEHIND, NOT_STATE = (
    "record", "evidence", "artifact", "ephemeral", "left behind", "not state")

CLASSES: dict[str, str] = {
    RECORD: "what people and the platform decided and configured; restoring it restores how the install works",
    EVIDENCE: "the account of what happened — what ran, what left, what was claimed and judged; append-only",
    ARTIFACT: "what people made or brought and open again; the large, per-person part",
    EPHEMERAL: "rebuilt from the rest or from the warehouse; losing it costs time, not truth",
    LEFT_BEHIND: "written by an earlier version or by hand; nothing in the platform reads or writes it now, or reads "
                 "it only once, to import it",
    NOT_STATE: "in the folder, not the platform's",
}

#: A store's sidecars belong to their database.
_SIDECARS = ("-wal", "-shm", "-journal")


@dataclass(frozen=True)
class Entry:
    """One name or pattern in the state folder. ``pattern`` matches a top-level name (`fnmatch`), or, when it holds a
    ``/``, a path relative to the state folder. ``owner`` is the module that writes it — for a left-behind entry,
    where it came from."""
    pattern: str
    cls: str
    owner: str
    what: str


# Order matters: the first entry that matches wins, so a narrower pattern comes before a broader one.
ENTRIES: tuple[Entry, ...] = (
    # ── record ────────────────────────────────────────────────────────────────────────────────────────────────────
    Entry("connections.db", RECORD, "pramanyx/db/registry.py",
          "the warehouses and files connected, with their credentials encrypted under the install's key"),
    Entry("system.db", RECORD, "pramanyx/kernel/ledger.py",
          "the kernel's ledger — jobs and the authority each ran under, events, keyed state; its `session_events` "
          "table, the model-call log, is evidence and is carried forward on a restore"),
    Entry("orgs.db", RECORD, "pramanyx/org/store.py", "the organisations"),
    Entry("workspaces.db", RECORD, "pramanyx/workspace/store.py", "the workspaces and the connections in each"),
    Entry("rbac.db", RECORD, "pramanyx/rbac/store.py", "who holds which role in which organisation"),
    Entry("identity_links.db", RECORD, "pramanyx/identity/store.py",
          "which platform user an external identity (Slack, the sign-in provider) is"),
    Entry("org_llm.db", RECORD, "pramanyx/llm/org_config.py",
          "each organisation's own model-provider keys and model picks"),
    Entry("user_prefs.db", RECORD, "pramanyx/db/user_prefs.py", "each person's own preferences"),
    Entry("metastore.db", RECORD, "pramanyx/metastore/store.py", "catalogs and their grants"),
    Entry("volumes.db", RECORD, "pramanyx/files/store.py", "volumes and the catalogue of the files in them"),
    Entry("govern_caps.db", RECORD, "pramanyx/govern/cap_store.py", "usage caps an organisation set"),
    Entry("govern_tags.db", RECORD, "pramanyx/govern/tag_store.py", "governed tags and where they are applied"),
    Entry("monitors.db", RECORD, "pramanyx/monitors/store.py",
          "monitors and the alerts they raised (the alerts are evidence, kept beside their monitor)"),
    Entry("automations.db", RECORD, "pramanyx/automations/store.py", "automations, their steps and their runs"),
    Entry("agents.db", RECORD, "pramanyx/custom_agents/store.py", "the agents people created, and their revisions"),
    Entry("agent_alerts.db", RECORD, "pramanyx/obs/agent_alert_store.py", "alert rules on agents, and what they fired"),
    Entry("evals.db", RECORD, "pramanyx/evals/store.py", "eval suites, their cases, and their runs' results"),
    Entry("kinetic_grants.db", RECORD, "pramanyx/actions/grants.py", "standing approvals for a declared action"),
    Entry("kinetic_inbox.db", RECORD, "pramanyx/actions/inbox.py",
          "proposals waiting for a person, each resolved once"),
    Entry("action_outbox.db", RECORD, "pramanyx/actions/outbox.py",
          "a declared action's calls to other systems, owed and delivered under a lease"),
    Entry("overlay_ledger.db", RECORD, "pramanyx/actions/overlay.py",
          "people's annotations and corrections on the data, kept as an overlay"),
    Entry("pack_bindings.db", RECORD, "pramanyx/packs/bindings.py", "a pack's roles bound to tables, as confirmed"),
    Entry("pack_deltas.db", RECORD, "pramanyx/packs/deltastore.py", "changes proposed to a pack, for review"),
    Entry("ambiguity_ledger.db", RECORD, "pramanyx/semantic/ambiguity_ledger.py",
          "how an ambiguous question was resolved, kept so it is not asked again"),
    Entry("hub_links.db", RECORD, "pramanyx/hub/links.py",
          "a ticket, a thread or a call filed on the thing it is about, with its outcome"),
    Entry("metrics.instance.json", RECORD, "pramanyx/semantic/metrics.py", "this install's governed metric definitions"),
    Entry("*.converted.*", RECORD, "pramanyx/semantic/metrics.py",
          "the mark that an instance file's conversion was verified, so a missing instance is an error"),
    Entry("glossary.instance.yaml", RECORD, "pramanyx/semantic/glossary.py", "this install's glossary"),
    Entry("vocabulary", RECORD, "pramanyx/ontology/vocabulary.py",
          "synonyms, value dictionaries and formats, per connection"),
    Entry("trusted_queries.json", RECORD, "pramanyx/semantic/trusted_queries.py", "SQL a person marked trusted"),
    Entry("type_overrides.json", RECORD, "pramanyx/db/type_overrides.py", "column types a person corrected"),
    Entry("annotations_*.json", RECORD, "pramanyx/db/annotations.py", "notes people left on tables and columns"),
    Entry("finding_dismissals.jsonl", RECORD, "pramanyx/explorer/store.py",
          "findings a person dismissed, and why"),
    Entry("business_profile_*.json", RECORD, "pramanyx/business_profile/store.py",
          "the business profile of a connection or schema"),
    Entry("playbook.json", RECORD, "pramanyx/playbook/store.py", "the playbook"),
    Entry("playbook_versions.json", RECORD, "pramanyx/playbook/store.py", "the playbook's earlier versions"),
    Entry("learned_actions.json", RECORD, "pramanyx/memory/paths.py",
          "templates learned from finished runs, governed like any other"),
    Entry("freeze_state.json", RECORD, "pramanyx/kernel/freeze.py", "what a person froze, and as of when"),
    Entry("connection_settings.json", RECORD, "pramanyx/db/registry.py", "settings per connection"),
    Entry("org_settings.json", RECORD, "pramanyx/orgsettings/store.py", "what each organisation allows"),
    Entry("llm_config.json", RECORD, "pramanyx/llm/models.py", "the install's model configuration"),
    Entry("industries.json", RECORD, "pramanyx/installer.py", "the industries chosen at install"),
    Entry("packs", RECORD, "pramanyx/packs/roots.py", "packs a person imported"),
    Entry("ontology_drafts", RECORD, "pramanyx/ontology/drafts.py", "ontology drafts waiting for a person"),
    Entry("ontology_overrides", RECORD, "pramanyx/ontology/overrides.py",
          "people's ontology declarations, published — moved here from the checkout by `pramanyx migrate-state`"),
    Entry("ontology_column_config", RECORD, "pramanyx/ontology/column_config.py",
          "the per-column settings this install saved (shown, sampled, indexed; a person's notes) and the datasets it "
          "removed whose shipped settings stay hidden — moved here from the checkout by `pramanyx migrate-state`; those "
          "the repository ships stay in the checkout's `data/shipped/`"),
    Entry("*.moved.json", RECORD, "pramanyx/db/migrate.py",
          "the record that a tree moved here from the checkout, with the hash of every file as verified; until it is "
          "here, the checkout's copy is the one read"),
    Entry("ontology_overrides_draft", RECORD, "pramanyx/ontology/overrides.py",
          "ontology overrides drafted, not yet published"),
    Entry("ontology_recommendations", RECORD, "pramanyx/ontology/recommendations.py",
          "fixes to the ontology the platform proposed, for review"),
    Entry(".pramanyx_key", RECORD, "pramanyx/db/keyfile.py",
          "the key every stored secret decrypts with; never copied by a backup — keep your own copy"),
    # ── evidence ──────────────────────────────────────────────────────────────────────────────────────────────────
    Entry("audit.db", EVIDENCE, "pramanyx/security/audit.py",
          "every statement run against a warehouse, and by whom"),
    Entry("departures.db", EVIDENCE, "pramanyx/govern/departure_store.py",
          "every send's gate decision, departed or held, and whether it arrived"),
    Entry("evidence_ledger.db", EVIDENCE, "pramanyx/evidence/store.py", "claims and the evidence each rests on"),
    Entry("verdicts.db", EVIDENCE, "pramanyx/feedback/verdicts.py", "the verdicts people gave on findings"),
    Entry("decisions.db", EVIDENCE, "pramanyx/learning/decisions.py",
          "each closed-set choice the platform made, in a shape it can learn from"),
    Entry("quality.db", EVIDENCE, "pramanyx/quality/results.py", "the results of every data-quality check"),
    Entry("history.db", EVIDENCE, "pramanyx/db/history.py", "each deep analysis run: its steps, SQL and report"),
    Entry("action_logs.json", EVIDENCE, "pramanyx/notifications/store.py", "every action an alert fired"),
    Entry("agent_runs.json", EVIDENCE, "pramanyx/memory/paths.py", "what each agent run signalled about itself"),
    Entry("episodes_*.jsonl", EVIDENCE, "pramanyx/explorer/episodes.py", "the explorer's log of what it ran, per scope"),
    Entry("exploration_program.json", EVIDENCE, "pramanyx/explorer/program.py",
          "each dataset's exploration program — what ran, what it found, what reopened it"),
    Entry("monitor_drills.json", EVIDENCE, "pramanyx/monitors/drill.py", "fire drills that proved an alert path"),
    Entry("settling.json", EVIDENCE, "pramanyx/settling/store.py",
          "the observations each day's number was read at, per table, and each approved metric's parts per day, one series per definition, kept 400 days (BR-8)"),
    # ── artifact ──────────────────────────────────────────────────────────────────────────────────────────────────
    Entry("canvases.db", ARTIFACT, "pramanyx/canvas/store.py", "Data Canvases"),
    Entry("artifacts.db", ARTIFACT, "pramanyx/canvas/store.py", "what a canvas made and kept"),
    Entry("dashboard_cards.db", ARTIFACT, "pramanyx/cards/store.py", "dashboard cards"),
    Entry("saved_queries.db", ARTIFACT, "pramanyx/savedquery/store.py", "saved queries"),
    Entry("learning.db", ARTIFACT, "pramanyx/learning/store.py", "datasets' records; their bytes are in `datasets`"),
    Entry("datasets", ARTIFACT, "pramanyx/learning/store.py", "datasets' bytes"),
    Entry("sheets/*/projection.*", EPHEMERAL, "pramanyx/sheets/files.py",
          "a sheet's DuckDB projection and its stamps, rebuilt from the sheet's files and edits"),
    Entry("sheets", ARTIFACT, "pramanyx/sheets/files.py", "spreadsheets: their files and their edits"),
    Entry("uploads", ARTIFACT, "pramanyx/connectors/file/local_upload.py", "files people uploaded as connections"),
    Entry("documents", ARTIFACT, "pramanyx/knowledge/blobs.py", "documents people uploaded, as uploaded"),
    Entry("documents.json", ARTIFACT, "pramanyx/knowledge/indexer.py", "the registry of uploaded documents"),
    # ── ephemeral ─────────────────────────────────────────────────────────────────────────────────────────────────
    Entry("checkpoints.db", EPHEMERAL, "pramanyx/agent/graph.py",
          "resume points for runs in flight; never copied by a backup"),
    Entry("popularity.db", EPHEMERAL, "pramanyx/sql/popularity.py", "what is queried most, mined from history"),
    Entry("overview_drills.db", EPHEMERAL, "pramanyx/overview/drills.py",
          "priors learned from drills on the overview, learned again as people drill"),
    Entry("intake.db", EPHEMERAL, "pramanyx/intake/store.py",
          "the intake lane's staging; what it imports lands in the stores above"),
    Entry("idempotency.db", EPHEMERAL, "pramanyx/util/idempotency.py", "keys that stop a retried create being made twice"),
    Entry("qdrant", EPHEMERAL, "pramanyx/semantic/vector_store.py",
          "vector indexes over documents, the schema and past runs, rebuilt from them"),
    Entry("context_graph", EPHEMERAL, "pramanyx/ontology/context_graph_store.py",
          "the context graph, a projection of the ledger rebuilt on demand"),
    Entry("ontology_docs", EPHEMERAL, "pramanyx/ontology/doctree.py", "the ontology written out as documents, built from it"),
    Entry("glossary_generated.yaml", EPHEMERAL, "pramanyx/semantic/glossary.py", "the glossary derived from the authored one"),
    Entry("api_sync", EPHEMERAL, "pramanyx/connectors/api/base_sync.py",
          "an API connection's mirror; a full sync rebuilds it"),
    Entry("briefing_cache.json", EPHEMERAL, "pramanyx/knowledge/briefing.py", "a cache of the briefing"),
    Entry("patterns_cache.json", EPHEMERAL, "pramanyx/knowledge/patterns.py", "a cache of patterns found in the data"),
    Entry("schema_cache.json", EPHEMERAL, "pramanyx/db/schema_cache.py", "a cache of each connection's schema"),
    Entry("schema_profiles.json", EPHEMERAL, "pramanyx/tools/profile_cache.py", "a cache of column profiles"),
    Entry("ontology_cache.json", EPHEMERAL, "pramanyx/ontology/store.py", "a cache of built ontology graphs"),
    Entry("explore_watermark.json", EPHEMERAL, "pramanyx/explorer/watermark.py", "where exploration last read up to"),
    Entry("rebuild_state.json", EPHEMERAL, "pramanyx/kernel/rebuild.py", "the progress of rebuilds in flight"),
    Entry("mat_cache.duckdb*", EPHEMERAL, "pramanyx/db/matcache.py", "materialised results, kept for an hour"),
    Entry("pramanyx.duckdb", EPHEMERAL, "pramanyx/demo/setup.py", "the demo warehouse, seeded again on demand"),
    Entry("samples.duckdb", EPHEMERAL, "pramanyx/demo/setup.py", "the sample warehouse, seeded again on demand"),
    Entry("beautycommerce*.duckdb", EPHEMERAL, "pramanyx/demo/beautycommerce.py",
          "a demo warehouse, seeded again on demand"),
    Entry("supervisor.log", EPHEMERAL, "pramanyx/slackbots/managed.py", "the Slack bot supervisor's log"),
    Entry(".serving.pid", EPHEMERAL, "pramanyx/db/serving.py", "which process serves this folder"),
    Entry(".restart.lock", EPHEMERAL, "scripts/restart_api.py", "a restart in progress"),
    # ── left behind ───────────────────────────────────────────────────────────────────────────────────────────────
    Entry("kernel.db", LEFT_BEHIND, "an earlier version; no code names it", "empty"),
    Entry("investigations.db", LEFT_BEHIND, "an earlier version; no code names it",
          "empty; deep analyses are kept in `history.db`"),
    Entry("exploration_state.db", LEFT_BEHIND, "an earlier version; no code names it",
          "empty; exploration state is kept in the ledger"),
    Entry("trusted_programs.db", LEFT_BEHIND, "its module was removed on 2026-08-02", "nothing reads it"),
    Entry("eval_baseline.db", LEFT_BEHIND, "its module was removed on 2026-07-22",
          "nothing reads it; evals are kept in `evals.db`"),
    Entry("causal_proposals.json", LEFT_BEHIND, "its writer was removed on 2026-10-28 (#634)", "nothing reads it"),
    Entry("superstore.duckdb", LEFT_BEHIND, "an earlier version's demo; no code names it", "nothing reads it"),
    Entry("exploration_*.json", LEFT_BEHIND, "the explorer's legacy per-key layout",
          "read once, on first touch, into the ledger; kept until the connection is purged"),
    Entry("smoke_*.json", LEFT_BEHIND, "scripts/smoke.py, run by hand", "a smoke run's output, not the platform's"),
    Entry("*.lost_and_found*.sql", LEFT_BEHIND, "a recovery by hand on 2026-08-17", "rows recovered from a corrupt store"),
    # ── not state ─────────────────────────────────────────────────────────────────────────────────────────────────
    Entry("backups", NOT_STATE, "pramanyx/db/backups.py", "the backups themselves"),
    Entry("_backup_*", NOT_STATE, "pramanyx/db/backups.py", "a backup taken by hand before backups existed"),
    Entry("_wipe_backup_*", NOT_STATE, "pramanyx/db/backups.py", "a backup taken by hand before backups existed"),
    Entry("_rerun_backup_*", NOT_STATE, "pramanyx/db/backups.py", "a backup taken by hand before backups existed"),
    Entry("*.bak", NOT_STATE, "pramanyx/db/backups.py", "a copy taken before a migration or by hand"),
    Entry("luxexperience_warehouse", NOT_STATE, "pramanyx/db/backups.py",
          "a person's own warehouse folder, which the platform never touches"),
    Entry(".DS_Store", NOT_STATE, "pramanyx/db/backups.py", "the Mac's folder settings"),
)


#: The install's state that sits in the CHECKOUT's `data/`, not the state folder — classified too, so a person deciding
#: what to keep, a backup and a restore need not guess. Each class is as it stands on a migrated install
#: (`db.home.in_use`); before a migration the checkout's `data/` IS the state folder.
CHECKOUT_ENTRIES: tuple[Entry, ...] = (
    Entry("ontology_overrides", LEFT_BEHIND, "pramanyx/ontology/overrides.py",
          "once moved into the state folder (its `.moved.json` record there), a stale copy nothing reads, which "
          "`pramanyx doctor` says may be removed; until then people's declarations, outside every backup — and the API "
          "refuses to start"),
    Entry("ontology_column_config", LEFT_BEHIND, "pramanyx/ontology/column_config.py",
          "once moved into the state folder (its `.moved.json` record there), a stale copy nothing reads, which "
          "`pramanyx doctor` says may be removed; until then the per-column settings this install saved, outside every "
          "backup — and the API refuses to start. Nothing in it is tracked: what the repository ships is "
          "`data/shipped/ontology_column_config/`"),
)


def _base(name: str) -> str:
    for s in _SIDECARS:
        if name.endswith(s):
            return name[: -len(s)]
    return name


def classify(rel: str) -> Optional[Entry]:
    """The entry for a path relative to the state folder, or None. A store's sidecars are their database's."""
    rel = rel.strip("/")
    top = _base(rel.split("/", 1)[0])
    for e in ENTRIES:
        if "/" in e.pattern:
            if fnmatch.fnmatchcase(rel, e.pattern):
                return e
        elif fnmatch.fnmatchcase(top, e.pattern):
            return e
    return None


def classify_folder(root: Path) -> dict[str, list[str]]:
    """Every top-level name in a state folder by class, and those without one under ``"unclassified"``."""
    out: dict[str, list[str]] = {}
    try:
        names = sorted(os.listdir(root))
    except OSError:
        return out
    for name in names:
        e = classify(name)
        out.setdefault(e.cls if e else "unclassified", []).append(name)
    return out


def render_markdown() -> str:
    """`docs/STATE_CLASSES.md`, rendered from the table above."""
    lines = [
        "# State classes",
        "",
        "Every piece of the platform's own state, by class (Track B3 of the 10× program, 2026-11-08). Rendered from",
        "`pramanyx/db/state_classes.py` by `python -m pramanyx.db.state_classes > docs/STATE_CLASSES.md`; the test",
        "`tests/unit/test_state_classes.py` holds the two equal and fails on a store the code names without a class.",
        "`pramanyx doctor` classifies the live state folder.",
        "",
        "| Class | What it means |",
        "|---|---|",
        *[f"| **{c}** | {w} |" for c, w in CLASSES.items()],
    ]
    for cls in CLASSES:
        rows = [e for e in ENTRIES if e.cls == cls]
        lines += ["", f"## {cls[0].upper()}{cls[1:]}", "", "| Name | Written by | What it holds |", "|---|---|---|"]
        lines += [f"| `{e.pattern}` | {('`' + e.owner + '`') if e.owner.startswith('pramanyx/') else e.owner} | {e.what} |"
                  for e in rows]
    lines += ["", "## In the checkout's `data/`", "",
              "The install's own state that sits in the checkout rather than the state folder, by its class on a "
              "migrated install.", "", "| Name | Class | Written by | What it holds |", "|---|---|---|---|"]
    lines += [f"| `{e.pattern}` | {e.cls} | `{e.owner}` | {e.what} |" for e in CHECKOUT_ENTRIES]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    print(render_markdown(), end="")
