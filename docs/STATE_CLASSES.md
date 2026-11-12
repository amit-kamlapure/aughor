# State classes

Every piece of the platform's own state, by class (Track B3 of the 10× program, 2026-11-08). Rendered from
`pramanyx/db/state_classes.py` by `python -m pramanyx.db.state_classes > docs/STATE_CLASSES.md`; the test
`tests/unit/test_state_classes.py` holds the two equal and fails on a store the code names without a class.
`pramanyx doctor` classifies the live state folder.

| Class | What it means |
|---|---|
| **record** | what people and the platform decided and configured; restoring it restores how the install works |
| **evidence** | the account of what happened — what ran, what left, what was claimed and judged; append-only |
| **artifact** | what people made or brought and open again; the large, per-person part |
| **ephemeral** | rebuilt from the rest or from the warehouse; losing it costs time, not truth |
| **left behind** | written by an earlier version or by hand; nothing in the platform reads or writes it now, or reads it only once, to import it |
| **not state** | in the folder, not the platform's |

## Record

| Name | Written by | What it holds |
|---|---|---|
| `connections.db` | `pramanyx/db/registry.py` | the warehouses and files connected, with their credentials encrypted under the install's key |
| `system.db` | `pramanyx/kernel/ledger.py` | the kernel's ledger — jobs and the authority each ran under, events, keyed state; its `session_events` table, the model-call log, is evidence and is carried forward on a restore |
| `orgs.db` | `pramanyx/org/store.py` | the organisations |
| `workspaces.db` | `pramanyx/workspace/store.py` | the workspaces and the connections in each |
| `rbac.db` | `pramanyx/rbac/store.py` | who holds which role in which organisation |
| `identity_links.db` | `pramanyx/identity/store.py` | which platform user an external identity (Slack, the sign-in provider) is |
| `org_llm.db` | `pramanyx/llm/org_config.py` | each organisation's own model-provider keys and model picks |
| `user_prefs.db` | `pramanyx/db/user_prefs.py` | each person's own preferences |
| `metastore.db` | `pramanyx/metastore/store.py` | catalogs and their grants |
| `volumes.db` | `pramanyx/files/store.py` | volumes and the catalogue of the files in them |
| `govern_caps.db` | `pramanyx/govern/cap_store.py` | usage caps an organisation set |
| `govern_tags.db` | `pramanyx/govern/tag_store.py` | governed tags and where they are applied |
| `monitors.db` | `pramanyx/monitors/store.py` | monitors and the alerts they raised (the alerts are evidence, kept beside their monitor) |
| `automations.db` | `pramanyx/automations/store.py` | automations, their steps and their runs |
| `agents.db` | `pramanyx/custom_agents/store.py` | the agents people created, and their revisions |
| `agent_alerts.db` | `pramanyx/obs/agent_alert_store.py` | alert rules on agents, and what they fired |
| `evals.db` | `pramanyx/evals/store.py` | eval suites, their cases, and their runs' results |
| `kinetic_grants.db` | `pramanyx/actions/grants.py` | standing approvals for a declared action |
| `kinetic_inbox.db` | `pramanyx/actions/inbox.py` | proposals waiting for a person, each resolved once |
| `action_outbox.db` | `pramanyx/actions/outbox.py` | a declared action's calls to other systems, owed and delivered under a lease |
| `overlay_ledger.db` | `pramanyx/actions/overlay.py` | people's annotations and corrections on the data, kept as an overlay |
| `pack_bindings.db` | `pramanyx/packs/bindings.py` | a pack's roles bound to tables, as confirmed |
| `pack_deltas.db` | `pramanyx/packs/deltastore.py` | changes proposed to a pack, for review |
| `ambiguity_ledger.db` | `pramanyx/semantic/ambiguity_ledger.py` | how an ambiguous question was resolved, kept so it is not asked again |
| `hub_links.db` | `pramanyx/hub/links.py` | a ticket, a thread or a call filed on the thing it is about, with its outcome |
| `metrics.instance.json` | `pramanyx/semantic/metrics.py` | this install's governed metric definitions |
| `*.converted.*` | `pramanyx/semantic/metrics.py` | the mark that an instance file's conversion was verified, so a missing instance is an error |
| `glossary.instance.yaml` | `pramanyx/semantic/glossary.py` | this install's glossary |
| `vocabulary` | `pramanyx/ontology/vocabulary.py` | synonyms, value dictionaries and formats, per connection |
| `trusted_queries.json` | `pramanyx/semantic/trusted_queries.py` | SQL a person marked trusted |
| `type_overrides.json` | `pramanyx/db/type_overrides.py` | column types a person corrected |
| `annotations_*.json` | `pramanyx/db/annotations.py` | notes people left on tables and columns |
| `finding_dismissals.jsonl` | `pramanyx/explorer/store.py` | findings a person dismissed, and why |
| `business_profile_*.json` | `pramanyx/business_profile/store.py` | the business profile of a connection or schema |
| `playbook.json` | `pramanyx/playbook/store.py` | the playbook |
| `playbook_versions.json` | `pramanyx/playbook/store.py` | the playbook's earlier versions |
| `learned_actions.json` | `pramanyx/memory/paths.py` | templates learned from finished runs, governed like any other |
| `freeze_state.json` | `pramanyx/kernel/freeze.py` | what a person froze, and as of when |
| `connection_settings.json` | `pramanyx/db/registry.py` | settings per connection |
| `org_settings.json` | `pramanyx/orgsettings/store.py` | what each organisation allows |
| `llm_config.json` | `pramanyx/llm/models.py` | the install's model configuration |
| `industries.json` | `pramanyx/installer.py` | the industries chosen at install |
| `packs` | `pramanyx/packs/roots.py` | packs a person imported |
| `ontology_drafts` | `pramanyx/ontology/drafts.py` | ontology drafts waiting for a person |
| `ontology_overrides` | `pramanyx/ontology/overrides.py` | people's ontology declarations, published — moved here from the checkout by `pramanyx migrate-state` |
| `ontology_column_config` | `pramanyx/ontology/column_config.py` | the per-column settings this install saved (shown, sampled, indexed; a person's notes) and the datasets it removed whose shipped settings stay hidden — moved here from the checkout by `pramanyx migrate-state`; those the repository ships stay in the checkout's `data/shipped/` |
| `*.moved.json` | `pramanyx/db/migrate.py` | the record that a tree moved here from the checkout, with the hash of every file as verified; until it is here, the checkout's copy is the one read |
| `ontology_overrides_draft` | `pramanyx/ontology/overrides.py` | ontology overrides drafted, not yet published |
| `ontology_recommendations` | `pramanyx/ontology/recommendations.py` | fixes to the ontology the platform proposed, for review |
| `.pramanyx_key` | `pramanyx/db/keyfile.py` | the key every stored secret decrypts with; never copied by a backup — keep your own copy |

## Evidence

| Name | Written by | What it holds |
|---|---|---|
| `audit.db` | `pramanyx/security/audit.py` | every statement run against a warehouse, and by whom |
| `departures.db` | `pramanyx/govern/departure_store.py` | every send's gate decision, departed or held, and whether it arrived |
| `evidence_ledger.db` | `pramanyx/evidence/store.py` | claims and the evidence each rests on |
| `verdicts.db` | `pramanyx/feedback/verdicts.py` | the verdicts people gave on findings |
| `decisions.db` | `pramanyx/learning/decisions.py` | each closed-set choice the platform made, in a shape it can learn from |
| `quality.db` | `pramanyx/quality/results.py` | the results of every data-quality check |
| `history.db` | `pramanyx/db/history.py` | each deep analysis run: its steps, SQL and report |
| `action_logs.json` | `pramanyx/notifications/store.py` | every action an alert fired |
| `agent_runs.json` | `pramanyx/memory/paths.py` | what each agent run signalled about itself |
| `episodes_*.jsonl` | `pramanyx/explorer/episodes.py` | the explorer's log of what it ran, per scope |
| `exploration_program.json` | `pramanyx/explorer/program.py` | each dataset's exploration program — what ran, what it found, what reopened it |
| `monitor_drills.json` | `pramanyx/monitors/drill.py` | fire drills that proved an alert path |
| `settling.json` | `pramanyx/settling/store.py` | the observations each day's number was read at, per table, and each approved metric's parts per day, one series per definition, kept 400 days (BR-8) |

## Artifact

| Name | Written by | What it holds |
|---|---|---|
| `canvases.db` | `pramanyx/canvas/store.py` | Data Canvases |
| `artifacts.db` | `pramanyx/canvas/store.py` | what a canvas made and kept |
| `dashboard_cards.db` | `pramanyx/cards/store.py` | dashboard cards |
| `saved_queries.db` | `pramanyx/savedquery/store.py` | saved queries |
| `learning.db` | `pramanyx/learning/store.py` | datasets' records; their bytes are in `datasets` |
| `datasets` | `pramanyx/learning/store.py` | datasets' bytes |
| `sheets` | `pramanyx/sheets/files.py` | spreadsheets: their files and their edits |
| `uploads` | `pramanyx/connectors/file/local_upload.py` | files people uploaded as connections |
| `documents` | `pramanyx/knowledge/blobs.py` | documents people uploaded, as uploaded |
| `documents.json` | `pramanyx/knowledge/indexer.py` | the registry of uploaded documents |

## Ephemeral

| Name | Written by | What it holds |
|---|---|---|
| `sheets/*/projection.*` | `pramanyx/sheets/files.py` | a sheet's DuckDB projection and its stamps, rebuilt from the sheet's files and edits |
| `checkpoints.db` | `pramanyx/agent/graph.py` | resume points for runs in flight; never copied by a backup |
| `popularity.db` | `pramanyx/sql/popularity.py` | what is queried most, mined from history |
| `overview_drills.db` | `pramanyx/overview/drills.py` | priors learned from drills on the overview, learned again as people drill |
| `intake.db` | `pramanyx/intake/store.py` | the intake lane's staging; what it imports lands in the stores above |
| `idempotency.db` | `pramanyx/util/idempotency.py` | keys that stop a retried create being made twice |
| `qdrant` | `pramanyx/semantic/vector_store.py` | vector indexes over documents, the schema and past runs, rebuilt from them |
| `context_graph` | `pramanyx/ontology/context_graph_store.py` | the context graph, a projection of the ledger rebuilt on demand |
| `ontology_docs` | `pramanyx/ontology/doctree.py` | the ontology written out as documents, built from it |
| `glossary_generated.yaml` | `pramanyx/semantic/glossary.py` | the glossary derived from the authored one |
| `api_sync` | `pramanyx/connectors/api/base_sync.py` | an API connection's mirror; a full sync rebuilds it |
| `briefing_cache.json` | `pramanyx/knowledge/briefing.py` | a cache of the briefing |
| `patterns_cache.json` | `pramanyx/knowledge/patterns.py` | a cache of patterns found in the data |
| `schema_cache.json` | `pramanyx/db/schema_cache.py` | a cache of each connection's schema |
| `schema_profiles.json` | `pramanyx/tools/profile_cache.py` | a cache of column profiles |
| `ontology_cache.json` | `pramanyx/ontology/store.py` | a cache of built ontology graphs |
| `explore_watermark.json` | `pramanyx/explorer/watermark.py` | where exploration last read up to |
| `rebuild_state.json` | `pramanyx/kernel/rebuild.py` | the progress of rebuilds in flight |
| `mat_cache.duckdb*` | `pramanyx/db/matcache.py` | materialised results, kept for an hour |
| `pramanyx.duckdb` | `pramanyx/demo/setup.py` | the demo warehouse, seeded again on demand |
| `samples.duckdb` | `pramanyx/demo/setup.py` | the sample warehouse, seeded again on demand |
| `beautycommerce*.duckdb` | `pramanyx/demo/beautycommerce.py` | a demo warehouse, seeded again on demand |
| `supervisor.log` | `pramanyx/slackbots/managed.py` | the Slack bot supervisor's log |
| `.serving.pid` | `pramanyx/db/serving.py` | which process serves this folder |
| `.restart.lock` | scripts/restart_api.py | a restart in progress |

## Left behind

| Name | Written by | What it holds |
|---|---|---|
| `kernel.db` | an earlier version; no code names it | empty |
| `investigations.db` | an earlier version; no code names it | empty; deep analyses are kept in `history.db` |
| `exploration_state.db` | an earlier version; no code names it | empty; exploration state is kept in the ledger |
| `trusted_programs.db` | its module was removed on 2026-08-02 | nothing reads it |
| `eval_baseline.db` | its module was removed on 2026-07-22 | nothing reads it; evals are kept in `evals.db` |
| `causal_proposals.json` | its writer was removed on 2026-10-28 (#634) | nothing reads it |
| `superstore.duckdb` | an earlier version's demo; no code names it | nothing reads it |
| `exploration_*.json` | the explorer's legacy per-key layout | read once, on first touch, into the ledger; kept until the connection is purged |
| `smoke_*.json` | scripts/smoke.py, run by hand | a smoke run's output, not the platform's |
| `*.lost_and_found*.sql` | a recovery by hand on 2026-08-17 | rows recovered from a corrupt store |

## Not state

| Name | Written by | What it holds |
|---|---|---|
| `backups` | `pramanyx/db/backups.py` | the backups themselves |
| `_backup_*` | `pramanyx/db/backups.py` | a backup taken by hand before backups existed |
| `_wipe_backup_*` | `pramanyx/db/backups.py` | a backup taken by hand before backups existed |
| `_rerun_backup_*` | `pramanyx/db/backups.py` | a backup taken by hand before backups existed |
| `*.bak` | `pramanyx/db/backups.py` | a copy taken before a migration or by hand |
| `luxexperience_warehouse` | `pramanyx/db/backups.py` | a person's own warehouse folder, which the platform never touches |
| `.DS_Store` | `pramanyx/db/backups.py` | the Mac's folder settings |

## In the checkout's `data/`

The install's own state that sits in the checkout rather than the state folder, by its class on a migrated install.

| Name | Class | Written by | What it holds |
|---|---|---|---|
| `ontology_overrides` | left behind | `pramanyx/ontology/overrides.py` | once moved into the state folder (its `.moved.json` record there), a stale copy nothing reads, which `pramanyx doctor` says may be removed; until then people's declarations, outside every backup — and the API refuses to start |
| `ontology_column_config` | left behind | `pramanyx/ontology/column_config.py` | once moved into the state folder (its `.moved.json` record there), a stale copy nothing reads, which `pramanyx doctor` says may be removed; until then the per-column settings this install saved, outside every backup — and the API refuses to start. Nothing in it is tracked: what the repository ships is `data/shipped/ontology_column_config/` |
