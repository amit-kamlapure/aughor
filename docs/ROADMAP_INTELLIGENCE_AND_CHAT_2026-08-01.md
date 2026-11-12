# Roadmap: Un-restricting the model, Elements-grade chat, and the Pramanyx chatbot shell

Date: 2026-08-01 · Status: PROPOSED (no code changed yet)
Inputs: full-repo inventory of every mechanism that constrains what the LLM sees or says;
full map of the chat UI stack; AI SDK Elements + vercel/chatbot research.

---

## 0. The thesis (answering "we restrict intelligence instead of directing it")

The complaint is half right, and the codebase itself tells you which half. Every
constraint in the repo falls on one side of a single decision rule:

> **If a smarter model would make the mechanism unnecessary, it is a RESTRICTION —
> scale it with the model. If no model strength fixes the failure, it is
> VERIFICATION — keep it.**

`aughor/sql/grain_guard.py:5` states the verification case exactly: *"A stronger
model does not fix this — it writes the same plausible join."* The NL2SQL benchmark
arc measured the same thing (deterministic guards beat LLM machinery 4× on strong
models). Those guards are probes against the real data — they are **direction**.

But the inventory also found a second population that is pure weak-model-era
restriction — and the currency-VARCHAR loss in a head-to-head comparison was the proof
that this population costs us answers: *the other agent won because it saw sample values
and ours saw a type name.*

### What is genuinely restriction (fix in Track A)

| Mechanism | Where | Why it's a restriction |
|---|---|---|
| Schema linker: top-4 tables × top-8 cols by keyword score, hardcoded e-commerce hint dictionary | `aughor/tools/schema_linker.py:450-540`, hints `:55-121` | Bag-of-words decides what a frontier model is allowed to see; drops, doesn't rank |
| `_SCHEMA_CHAR_LIMIT = 20_000` — comment literally cites "Groq free tier" | `aughor/agent/investigate.py:252-256` | Sized for a dead constraint; `context_budget.py:49-67` only ever scales **down** |
| Sample values only on the upload connector | producer: `connectors/file/local_upload.py:963-990`; absent from `db/schema_render.py:39-156` and every warehouse connector | The exact currency-VARCHAR failure, structurally fixed for one path out of ~10 |
| Value annotations only for `dimension/flag/ordinal` non-FK columns | `aughor/tools/schema.py:525-593` | A `measure`, `text`, `key`, `timestamp` column never shows values |
| `_EVIDENCE_BUDGET = 6000` chars = the entire evidence for a board-level synthesis | `aughor/agent/investigate.py:1951, 6780` | 6KB of evidence into a 100K+ context model |
| `_results_to_text(max_rows=12)` default interpret window | `aughor/agent/investigate.py:688` | The analyst reads 12 rows |
| `_MAX_OUTPUT_TOKENS=4096`, reasoning effort `"low"`, `_STRUCTURED_ATTEMPTS=1`, temp 0.0–0.1 | `aughor/llm/provider.py:110,115,265,1255,1341` | Justified by a July cost incident, not by answer quality; throttles thinking uniformly regardless of task depth |
| Chart vocabulary: renderer supports 22 types, quick prompt offers 13–14, deep `Literal` offers 8 | `web/components/charts/chartTypeInference.ts:36-89` vs `aughor/agent/prompts.py:123-128` vs `prompts_investigate.py:750,778` | ~10 renderable exhibit forms unreachable from any model output; +100 lines of hand-written selection rules duplicated twice in one prompt |
| Semantic compiler cage: 4 intents, 6 aggs, unranked `measures[:10]/dims[:10]` | `aughor/semantic/compiler.py:255,269-285` | Top-10 in arbitrary dict order |
| `enforce_context_cap` — dead code on the path that uses it | `tools/data_catalog.py:242` matches `TABLE:`, but `routers/investigations.py:1401` feeds it `## table` headers | A cap that silently does nothing — delete or fix |
| Catalog swap drops enrichment | `routers/investigations.py:1398-1401` | Replacing schema with the catalog gains 5-row samples but silently loses glossary annotations, value enumerations, and profile blocks |

### What is genuinely verification (keep, and make visible in Track B)

Readonly/disallowed-function BLOCKs (`trust/__init__.py:61-77`), the 9-detector
fan-out/grain family, join & filter value-domain probes, null-side GROUP BY guard,
post-synthesis numeric verification (`agent/verify.py`), explorer insight-soundness
drops, deep-path suppression of provably corrupt ratios. These fire on **measured
properties of the actual data**. Note most of them already INFORM (feed a repair
hint) rather than block — the architecture already agrees with "direct, don't
restrict" here.

### The ambiguous middle: silent corrections (convert to informed corrections)

`defan()` rewrites SQL silently (`routers/investigations.py:1815-1843`,
`explorer/agent.py:3227`); `preflight_repair` rewrites before execution
(`sql/safety.py:31`); `_ground_headline` overwrites the model's prose (`:1008`);
`_maybe_pareto` overrides its chart choice (`:809-847`); `join_guard.py:475-489`
collapses a measured overlap fraction to a `✓` glyph. Correct as safety —
wrong as pedagogy and invisible to the user. Each becomes: (a) a **receipt frame**
in the SSE stream (UI shows "guard rewrote the join — 3% value overlap"), and
(b) **feedback to the model** in the same conversation, so the correction directs
instead of silently overriding.

### The literal "flags guarded inside a list of values"

Three hand-rolled enums for a system whose flag values are all `bool`:

1. `aughor/kernel/flags.py:1019-1021` — truthy/falsy string tuples, **asymmetric**:
   `AUGHOR_X=enabled` resolves True for a default-ON flag and False for a
   default-OFF flag. Same string, opposite meaning.
2. `aughor/routers/system.py:77-99` — `state` is a bare `str` (not
   `Literal["on","off","auto"]`); the vocabulary is enforced by an in-tuple check.
3. `web/components/SystemPanel.tsx:257-278` — hardcoded `GROUPS` array; unknown
   dispositions silently bucketed as `default_on`.

The flag *registry* itself (dispositions, graduation receipts, the override-drift
ratchet) is discipline worth keeping — it is how flags get **deleted**. The fix is
typing and symmetry, not abolition. The deeper fix is that several "flags" are
really **model-capability knobs** (reasoning effort, output tokens, context caps)
that should live in a per-model profile, not in booleans or constants.

---

## Track A — Direct, don't restrict (backend)

Ground rule from the program's own history: **measure the premise before building
the scoped thing** (Wave H went 6/6 on pre-checks moving scope). Every item below
names its pre-check. Free checks first ("does it change the prompt?" costs nothing).

### A1. ModelProfile: capability knobs keyed to the bound model — *the keystone*
New `aughor/llm/profile.py`: `ModelProfile { context_window, max_output, reasoning_effort_by_depth, schema_char_budget, evidence_budget, interpret_rows }`
resolved from `data/llm_config.json`'s bound model. All the constants in the
restriction table above become reads from the profile. `context_budget.py` learns
to scale **up**, not only down. Reasoning effort becomes depth-scaled: quick=low,
deep phase-planning=medium, deep synthesis=high — spend thinking where it pays.
- Pre-check (free): print assembled prompts for 3 questions under current vs
  profile-scaled budgets; confirm the deltas are real before any live run.
- Live check (cheap, ~20 req): 5 deep questions, current vs scaled, compare
  synthesis quality by eye. Pin temperature (13% run-to-run nondeterminism).
- Guard: profile switch behind one flag (`llm.model_profile`) so cost regression
  is a one-line rollback. The July cost incident stays respected: `max_output`
  and effort still have ceilings — in the profile, per tier, not global constants.

### A2. Samples everywhere (generalize the currency-VARCHAR fix)
Lift `_column_samples()` from `local_upload.py:963-990` into
`db/schema_render.py` so `render_raw_schema` and every warehouse connector emit
`~ e.g.` samples; relax `inject_value_annotations` (`tools/schema.py:525-593`) to
also sample `measure`/`text` columns (short values only). Keep
`strip_value_samples` on the loss-scan path (that exclusion is deliberate).
Also fix the catalog swap (`investigations.py:1398-1401`) to **merge** catalog
samples into the enriched schema instead of replacing it.
- Pre-check: count prompts that change (free); watch prompt-injection surface —
  `fence_untrusted` already exists for result rows; samples need the same fencing.

### A3. Linker becomes a ranker, not a bouncer
`link_schema` orders tables/columns by score and packs to the profile's char
budget; nothing relevant is dropped while budget remains. Kill the hardcoded
e-commerce hint dictionary or demote it to tie-breaker. Reconcile the 4-vs-8
`top_k_tables` disagreement between the answer path (`investigations.py:2676`)
and the grounding receipt (`grounding.py:184`) — the receipt must describe the
prompt that actually ran. Fix or delete the dead `enforce_context_cap`.

### A4. Silent → informed corrections (+ receipt frames)
One new SSE frame type `guard_receipt {guard, action, detail, before?, after?}`
emitted at every silent-rewrite site (defan, preflight, grounded literals,
pareto override, headline grounding) and at explorer drops / deep suppression
(reason only). Feed the same receipt back into the model's next repair round
(most guards already have `to_prompt_text()` — this closes the loop for the
rewriters too). Upgrade `render_verified_joins` to show the measured overlap
number instead of `✓`. This frame is **the data source for Track B's Chain of
Thought UI** — the guards become visible direction.

### A5. Chart-vocabulary parity
One canonical chart-type registry in the backend, asserted in a test against the
frontend's `ALL_CHART_TYPES` (drift test, same spirit as the api.gen.ts CI gate).
Quick and deep paths offer the full renderable set; collapse the ~100 duplicated
lines of prescriptive selection prose (`prompts.py:130-235` ≈ `:282-324`) to the
hard anti-unreadability rules only; `inferChartType` stays as fallback, not cage.
- Pre-check (cheap grid, ~30 req): does the model pick the newly-offered types
  sanely on chart-lab fixtures? If not, offer-but-annotate ("rarely correct").

### A6. Flag hygiene (small PR, do first)
Symmetric strict value parsing (unknown string → loud error, both directions);
`Literal["on","off","auto"]` on `_FlagPatch`; SystemPanel `GROUPS` derived from
the backend's disposition vocabulary (it's already in the API). No registry
redesign — the disposition/receipt system stays.

**Non-goals for Track A:** do NOT remove the execution-grounded guard battery, do
NOT rebuild probe/repair LLM machinery (measured 4× worse), do NOT lift explorer
drop/suppression (those protect published findings; they gain receipts, not mercy).

---

## Track B — Elements-grade chat (Chain of Thought, Shimmer, Task)

Facts that set the approach: web/ is Next 16 / React 19 / Tailwind 4 with shadcn
configured — but style `base-nova` on **@base-ui/react** primitives, zero Radix.
AI SDK Elements ship as Radix-based shadcn files. A stock `npx ai-elements add`
would fork the primitive stack and fail all four lint gates
(`rounded-lg`-class violations vs `lint:tokens` baseline-zero; raw `<button>` vs
`lint:elements` at exactly 69/69; foreign CSS vars vs `lint:vars`).

**Approach: adopt Elements' component *API and anatomy*, vendored by hand onto our
primitives and tokens** in `web/components/ai-elements/`. We keep their composable
names (`<ChainOfThought>`, `<ChainOfThoughtStep status=…>`, `<Task>`, `<TaskTrigger>`,
`<Shimmer>`) so later components port mechanically — but every file is Base-UI +
`--r*`/`--dur-*`/`aug-fs-*` tokens, `ui/button.tsx`, and honors the
`prefers-reduced-motion` kill-switch. No new runtime deps (Elements' Shimmer uses
framer-motion; ours is a CSS `@keyframes` on `background-clip: text` — we already
have `aug-shimmer` for blocks, this adds the text-sweep variant).

We are not starting from zero — this is an upgrade of existing organs:

| Elements component | Existing organ it upgrades | Data source |
|---|---|---|
| Shimmer (text sweep) | `animate-bounce` dots + static `statusText` (`ChatMessage.tsx:1360-1371`), `"Reading the results…"` pulse (`InvestigationReport.tsx:332`) | `turn.statusText`, `phase_progress` |
| Chain of Thought | `InlineAgentTrace` + `ThinkingTrace` (`ThinkingTrace.tsx:362-453`, typewriter + step rail) | `deriveSteps(state)` (`:137-311`) — already produces steps with pending/running/done/error; plus **A4's `guard_receipt` frames as steps** |
| Task | `PlanGateCard` (plan gate), deep phase list, explorer sub-questions | `planPending`, `phases`, `subq_answer`; `TaskItemFile` chips ← `tables_used` |

### B1. Foundation PR
`ai-elements/shimmer.tsx` + `chain-of-thought.tsx` + `task.tsx` (presentational
only), a `turnToParts` adapter beside `turnToTraceState`, unit-rendered, all five
gates green. Shimmer wired into the three status-text sites same PR (visible win,
tiny risk).

### B2. Chain of Thought PR
Replace `InlineAgentTrace`'s body with CoT composables fed by `deriveSteps`; keep
auto-collapse-on-completion and the typewriter (`useTypewriter` feeds
`ChainOfThoughtStep` descriptions). Guard receipts (A4) render as steps with the
guard's measured number — this is where "restriction" becomes *visible
direction* in the product. `ThinkingTrace` stays for `HistoryDetailPanel` replay
until parity, then folds in.

### B3. Task PR
`PlanGateCard` re-skinned as a `Task` list (checkboxes stay — it's a gate);
deep-phase progress and explorer sub-question fan-out rendered as auto-collapsing
Tasks with table-chip items. `lint:elements` note: built on `ui/button`, ratchet
untouched; opportunistically convert the 3 raw buttons in
`InlineInvestigationThread` to LOWER the baseline.

### B4 (optional, later)
The rest of the Elements chatbot catalog maps cleanly when wanted: Tool ←
`sql/columns/rows` frames, Sources ← `tables_used`, Suggestion ← `followups`,
Context ← `ContextRibbon`, Confirmation ← plan/clarify gates, Queue ← canvas runs.
Explicitly out of scope now: Elements' `Response`/markdown stack (would import
streamdown/shiki and change prose rendering everywhere `BriefProse` is used —
separate decision).

---

## Track C — The Pramanyx chatbot (vercel/chatbot shell)

`vercel/ai-chatbot` → renamed **`vercel/chatbot`**: Apache-2.0, Next 16, React 19,
AI SDK v7 (`ai@7`, `@ai-sdk/react@4`), next-auth v5 beta, Drizzle/Neon Postgres,
AI Gateway model layer.

**The architecture decision (C0): the template is a shell; the brain stays in
Python.** "Deploy with our logics/guards" must NOT mean porting guards to TS —
it means the template's route handler stops calling `streamText` and instead
proxies Pramanyx's `/ask`. Every guard, flag, receipt, and retrieval behavior is
inherited automatically because there is exactly one answer path. (This also
respects the platform's one-brain history: dual paths always rotted — cf. the
`ada_report` frozen-alias scar tissue.)

### C1. Protocol adapter — the only load-bearing artifact
A TS module inside the fork's `app/(chat)/api/chat/route.ts`:
Pramanyx SSE frames → AI SDK UIMessage stream parts.
- `headline_delta`/`narrative_delta`/`report_delta` → text parts. **Semantics
  mismatch is the trap:** Pramanyx deltas are *replace* (full text so far,
  `investigationStream.ts:348,394,397`); AI SDK is *append* — the adapter diffs
  consecutive frames and emits only the suffix.
- `route`/`phase_progress`/`start`/status → reasoning parts (renders in the
  template's Reasoning UI for free).
- `sql`/`columns`/`rows`/`chart_config` → tool parts (`render_answer`).
- `guard_receipt` (A4) → reasoning or data parts.
- `error` → terminal error part (preserve `recovery`/`hint` typed fields);
  `done`-after-`error` never overwrites (port the invariant).
- Port the three robustness invariants from `consumeStream`: content-type guard,
  abort→DONE, and the 5-minute drop-recovery poll against
  `GET /investigations/{id}`.
- The existing `POST /agui/run` AG-UI endpoint is prior art for exactly this
  mapping (`aughor/routers/agui.py:62-74`) — crib its table, don't require its
  flag; the adapter talks to `/ask` directly.

### C2. Rich parts
Custom data-part renderer for exhibits (the template can't render ECharts):
start with `chart_config` → a lightweight chart component; tables from
`columns/rows` parts. Clarify/plan gates arrive as data parts with a resume call
to `POST /investigations/{id}/feedback` — wire the plan gate minimally (approve /
reject), defer full ClarifyCard parity.

### C3. Auth & persistence reconciliation (decide here, not before)
Template brings next-auth + Postgres chat history; Pramanyx brings RBAC +
`/chat-sessions` ledger. Default recommendation: keep next-auth for login,
**drop the template's chat-history tables** and read/write Pramanyx's
`/chat-sessions` so history is one store with the main app. Fallback if the
template's DB coupling is too deep: template DB as display cache, Pramanyx ledger
as authority.

### C4. Deploy
Vercel (shell) + hosted Pramanyx API; CORS allowlist for the shell's origin; a
server-side API key from the shell's route handler to Pramanyx (never in the
browser). Pin the fork — the template tracks AI SDK majors aggressively; treat
upstream merges as scheduled maintenance, not continuous.

**Non-goals:** no second answer path, no TS re-implementation of any guard, no
AI Gateway/model selection in the shell (Pramanyx's `data/llm_config.json` remains
the single model authority; the template's model picker is removed or repurposed
to Pramanyx's picker API).

---

## Track E — Scope org identity to the data being explored (found 2026-08-03)

**The defect, observed not theorised.** A briefing generated for a freshly-loaded PUBLIC
sample dataset (Superstore, US retail, unrelated to this operator) contained:

    "finding": "LuxExperience has 1 regional manager in each region—Central, East, South…"

The operator's company name, asserted over someone else's data. Same run rendered every
figure in EUR on a USD dataset.

**Root cause, located.** `aughor/explorer/agent.py:2259` calls `org_context()` with **no
arguments**, so exploration resolves identity from the app-level global only.
`workspace_for_connection` is called in exactly four places — `routers/_shared.py` (×2),
`routers/connections.py`, `routers/investigations.py` — and **never anywhere under
`aughor/explorer/`**. The explorer never asks which workspace it is exploring for, so a
per-workspace override cannot reach it. `POST /exploration/{conn_id}/start` also accepts no
`workspace_id` (unlike `/briefing`, which does), so a caller cannot supply one either.

**Why the existing guard does not save it.** `knowledge/briefing.py::_dataset_subject`
exists for precisely this — its docstring says the brief's subject is "the data being
briefed, not the organization reading it… emphatically NOT the same when one workspace
holds several unrelated datasets". But by briefing time the org name is already inside the
stored FINDINGS, so the briefing faithfully quotes contamination it did not create.

**Two smaller findings worth carrying:**

* `orgsettings/store.py::effective_settings` skips override values that are `None` or `""`,
  so a workspace override can never BLANK an inherited field — only substitute a different
  non-empty one. Deliberate blanking is impossible, which is exactly what demo/multi-tenant
  isolation needs.
* A connection may belong to several workspaces at once; `workspace_for_connection` then
  returns the first non-default match. Dual membership is silently permitted rather than
  refused.

**The fix:** resolve `workspace_for_connection(conn_id)` inside the explorer and pass it to
`org_context()`; accept `workspace_id` on `/exploration/{conn_id}/start` for parity with
`/briefing`; add a regression test asserting the org's company name never appears in
artifacts for a connection with no business profile of its own.

**Interim workaround in use (2026-08-03):** the app-level org settings were temporarily
neutralised to bake the Superstore demo, with the real values saved for restore. That is a
workaround for one bake, not a fix — anything else touching the platform during a bake sees
the demo identity.

## Measurement of the whole premise (the honest yardstick)

The claim behind Track A is "a strong model, shown more, answers better." The
amazon.csv head-to-head comparison is the existing benchmark with a known loss.
After A1+A2 land: rerun that comparison live (model config from
`data/llm_config.json`, copied into the worktree). That rematch — not vibes — is
the graduation receipt for the un-restriction thesis.
