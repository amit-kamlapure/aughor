# Parity after the redesign — 2026-11-10

This checks the redesign against the inventories in this folder (`define-decide.md`, `analyze.md`, `home-ask-data.md`,
`operations-settings-shell.md`), under the user's rule: **"Do not remove features as a cost of redesign of UI/UX."**

Every control listed in an inventory's **Top rows today** line is mapped below to where it is now. Every one is the
same live component as before: the shell's rows *portal* the page's own controls (`components/shell/PageChrome.tsx`).
They are not copies.

Outside the shell (a Data Canvas embedding a page, or a test), each page still draws its rows where it did before.

Commits on `claude/seven-destinations`, in order:
- `7c651275` Define/Decide + Settings
- `9b8661de` Monitors, Security & Audit, Spreadsheets
- `8b535ef6` SQL Editor
- `f254ea37` Dashboards
- `bf69cf10` + `4738ec22` Briefing
- `f7fed183` Ask pages

Where things go, unless a page says otherwise:
- **Title row:** "‹ Parent" (the way back, when inside a section) · title · state chip · facts · actions. Not drawn
  when it would only repeat the section's name.
- **No breadcrumb row** (dropped 2026-11-10; see the last section of "Pages folded"). The scope it held moved into
  each page's own rows.
- **Toolbar row:** one row; it wraps rather than clips.
- **Status strip:** the foot of the app.

## Pages folded, control by control

### Workspace (every Intelligence and Operations layer, Data, Evals, the Record)
| Was | Now |
|---|---|
| Context bar: Connection · Schema · Maturity | Toolbar row, left (`.aug-toolbar-scope`) |
| Layer tabs (+ badges, "?" help) | Toolbar row, after the scope |
| Toolbar: range · search · "+ Create agent" | Toolbar row, right end (`.aug-toolbar-tools`) |

### Semantic Layer
| Was | Now |
|---|---|
| Tab strip: Metrics · Annotations · Knowledge · Benchmarks · Import | Toolbar row |
| Scope pickers: Connection › Dataset › Table (Annotations only) | Toolbar row, left |

Each tab's own card headers are unchanged.

### Graph
| Was | Now |
|---|---|
| Holds line: counts · join chip · freshness chip · "Not rebuilt — …" | Facts, beside the title |
| Rebuild (when owed) | Title row, actions |
| Map / Explore / Tour / Review (+ review count) · Refresh | Toolbar row, right end |

Verified live: Explore switches the view from its new place.

### Ontology
| Was | Now |
|---|---|
| Org / Domain / Connection segmented | Toolbar row |
| Release chip (its changes still open as a full line under it) | Toolbar row |
| `{schema}` tag · entity/link/process/rule counts · "not yet described…" · visibility line | Facts |
| "N to approve" · Tools ▾ (all six items) | Actions |

Verified live: all six Tools items open.

### Actions
| Was | Now |
|---|---|
| Propose from a finding · New action (in the ledger's label row) | Actions |

The "Declared actions N" label is unchanged. Verified live: the propose form opens.

### Evidence / Org
| Was | Now |
|---|---|
| Evidence: "the latest N claims · N deep analyses" · Refresh | Facts · Actions |
| Org: "N of M" match count · Filter findings · Refresh | Toolbar row · Actions |

The lead sentence stays as the first line of each page.

### Settings
| Was | Now |
|---|---|
| Section tab strip (Organization … Integrations) | Toolbar row; the selected section is said in the breadcrumb and the title |

### Monitors · Security & Audit
| Was | Now |
|---|---|
| Monitors: Overview / Alerts (badge) | Toolbar row |
| Monitors: + New monitor | Actions |
| Security: lens segmented (Queries · Activity · Approvals · Gate map · Policies) · connection chip | Toolbar row |
| Security: Refresh (Queries only) | Actions |

The Activity lens's status and filter bars stay in the page. Verified live: the New monitor dialog opens, and the Alerts tab switches.

### Spreadsheets
| Was | Now |
|---|---|
| Home: "Spreadsheets" heading | The shell's title |
| Home: Workspace chip · counts | Facts |
| Home: Find a sheet | Toolbar row, right end |
| Sheet: "Spreadsheets /" back | The breadcrumb's **Spreadsheets** (`useChromeBack`) |
| Sheet: name (rename in place) | The title itself (`ChromeTitle`) |
| Sheet: source chip · row/column count · "Can read" | Facts |
| Sheet: Make a dashboard · Share (popover) · Ontology · Combine · Chat | Actions |
| Sheet: views strip (+ View, kept/shared state, Keep in / Back to the view, Share it / Make it yours alone) | Under the grid, as a spreadsheet's sheet tabs (the user, 2026-11-10: "The tabs should be visible in the bottom not in the top"). "+ View" opens upward |

The sheet's tool row (+ Row … CSV) stays above the grid, since it acts on the grid.

Verified live, all from their new places:
- rename, with Escape cancelling;
- Share opening over the grid;
- the breadcrumb going back to the sheets.

### SQL Editor
| Was | Now |
|---|---|
| Connection select | Breadcrumb row, right end (scope) |
| Visual \| SQL · Saved ▾ · Save | Actions |
| linked / sql-ahead chip | The title's state chip |
| Visual mode's own row (spacer + the above + Tools ▾) | Folded: its Tools ▾ joins the actions in Visual mode |
| The open tab's name | The title |

The query tabs, the Run row (Run, its settings, schema, the "N statements ran" chip, the guards' verdict, Tools ▾), the
editor and the results all stay where they were.

**The body, like the mockup (added 2026-11-10, after the user saw too little of it change):**

| Was | Now |
|---|---|
| "Run (500)" with a caret for the run settings | Run ▶ with ⌘↵ on it, and a "Limit 500 ▾" control beside it that opens the same settings (row limit, Run all) |
| Format (Tools ▾ only) | A Format button on the Run row; Tools ▾ still has it, with its preferences |
| Show/Hide catalog (Tools ▾) · Recent runs (Tools ▾) | Panel toggles at the Run row's right end; both stay in Tools ▾ |
| — | The editor's foot: Ln/Col · the dialect · one statement / N statements · what ⌘↵ runs · "No problems" or N problems |
| Save (secondary) | **Save query**, the page's primary |
| Copy share link (Tools ▾) | Share in the title row; Tools ▾ still has it |
| Recent runs (Tools ▾) | History in the title row |
| — | The title's chip says "Draft · not saved" or "Saved · linked/sql-ahead". Beside it: "last run <UTC time>" |
| The pager / chart strip (shown only with charts or several results) | Always there: Results N · Chart · Profile · Execution · Logs, with "Succeeded/Failed · time" and the receipt at the right. A chart is still a tab of its own, with its rename/duplicate/remove menu, and the pager still leads the row |
| — | **Profile**: every column of the loaded rows (type, empty, distinct, lowest, highest, most common). It says when the result was cut. A row opens the inspector |
| — | **Execution**: outcome, time, rows (and what cut them), live or from the cache, the guards' verdict, the receipt, bound values, and the SQL as it ran |
| — | **Logs**: every statement of the run, with its rows, time and outcome. A row pages to it |
| The catalog rail opened nothing in a workspace-wide tree | The connection being queried opens, with its only dataset |

**Second pass, on `claude/sql-editor-mockup`, after the user's "BUT IT IS NOT AS PER THE MOCKUP IS IT?"**

The user's four answers: keep the type icon in column heads; separators on numbers but not on ids; the catalog shows
the active dataset, with the others behind a switch; Run and Cancel both always.

| Was | Now |
|---|---|
| The figures line (rows · time · cached · the cut · Count all · Load more · receipt · filter · Copy · CSV · Tools ▾ · ⤢) above the grid, and the grid's own bar (Transpose · Columns · Value · Find · the selection's aggregate and Copy) above that | One strip at the grid's foot, holding all of it in that order, with "Live · read <UTC>". The count and the outcome lead the views row above the grid. When the grid is not the view on screen (a chart, Profile, Execution, Logs, no rows, filtered out), the figures and the ways out are a strip at the panel's foot, so they never leave |
| Result tabs drawn as boxed buttons | Underlined tabs |
| Run turned into Cancel while running | Run · Limit · **Cancel** side by side. Cancel is greyed until a statement runs, then stops it and shows the time it has run |
| The schema picker shown only when the completion read named schemas | **Dataset ▾** shown whenever the connection has one. A connection with exactly one starts on it; picking "(all datasets)" is kept |
| The connection picker alone at the breadcrumb row's right end | "Scope: [theLook ▾] · BigQuery · dataset thelook · Not saved" (or "Saved as …") |
| Numbers raw unless a column's Format said otherwise | A measure's thousands are grouped by default, every decimal kept ("100,522.59", "0.0034567"). Columns that name a thing (id, *_id, key, year, code, number, no) stay as they are. The ▾ menu's Format adds "Grouped" after None, and None shows the raw value. Sheets keep their own list |
| The rail: a tree of every connection in the workspace | The dataset being queried, flat, under a picker: "theLook · dataset thelook ▾". Its options are every connection's datasets, "every dataset" of a connection with several, and "The whole workspace" (the old tree). Column types show at the right, not only on hover |

Added:
- **Status strip:** Succeeded or Failed · time · rows (cut) · statement N of M, then Live (read time) or Cached ("read time not kept"), then the receipt's short id, which opens it.
- **Inspector:** "Inspect <column>" in every column menu. Overview profiles the loaded rows; Provenance shows the receipt's column lineage, or says why there is none. Once open it follows the selection, and a new run closes it.

Verified live on theLook: `orders.status` traced to `thelook.orders.status`, and `COUNT(*)` reported as computed.

### Dashboards
| Was | Now |
|---|---|
| Picker strip: Metrics · Your dashboards · Apps shared with you | Toolbar row |
| + New dashboard | Actions |
| Dashboard bar: period picker | Toolbar row, right end |
| Dashboard bar: History · Edit | Actions |
| Builder edit bar: dashboard select | Toolbar row |
| Builder edit bar: "Editing" | The title's chip |
| Builder edit bar: saved readout | Facts |
| Builder edit bar: Undo · Redo · Preview as · History · Publish · Retire · Done | Actions, Done last |
| Metrics bar: period picker | Toolbar row |
| Metrics bar: period, vs, lag chips · measured time | Facts; the measured time is now a Freshness label |
| Title | The open dashboard's name, with Published / Draft · readers see vN / Shared by … / Editing |

The process board is now the mockup's two tables:
- Stages: reached, share with its bar, median and p90 from the previous stage.
- Promises, ranked by open and overdue: broken, broken rate, open, and the "open and overdue" door, which scrolls to its table or offers to place one, as before.

Its leaves and counted-over lines are kept. Its foot is a Freshness label.

Verified live on Late dispatch: view, then Edit, then Done.

### Briefing
| Was | Now |
|---|---|
| "The Briefing" heading | The shell's title, with Not written yet / Edition written / Turned off |
| Covers | Facts |
| Range (Week · Month · Year · Custom + dates + Show) | Toolbar row |
| Reading as | Toolbar row |
| Schedule · Sources & guide | Actions |

The schedule card, the side panel and everything in the edition stay where they were:
- every block, drill, ask and give-to-a-team;
- Draft the guide and Write / Write it again;
- withheld lines and the footer.

Added, per the decision "lead figure, then ranked evidence":
- In short (computed)
- the lead figure, with its Freshness
- Changes, ranked
- Recorded lately
- What waits on a person, each with its next step

Then "The edition". In a Data Canvas the masthead stays as it was and there is no front.

### Ask
| Was | Now |
|---|---|
| Conversation: canvas chip · N tables · × / connection tag | Facts |
| Conversation: Canvas · New · Conversations · History | Actions |
| Data Canvas list: search (+ ✕) | Toolbar row |
| Data Canvas list: All / Created by me | Toolbar row |
| Data Canvas list: card/list switch · Sort | Toolbar row, right end |
| Data Canvas list: + New | Actions |
| Data Canvas list: "All Data Canvases (N)" | Facts |
| Open canvas: "← Data Canvas" | The breadcrumb's **Data Canvas** closes the canvas, as before (tested) |
| Open canvas: name | The title |
| Open canvas: description · chips | Facts |
| Open canvas: Chat · Briefing · History · Artifacts · + | Toolbar row |
| Open canvas: Tools ▾ (+ Settings popover) | Actions |

### Agent Ops (folded after the user's go-ahead to open it live, 2026-11-10)
| Was | Now |
|---|---|
| Workspace toolbar: "+ Create agent" (right end) | Actions, from every layer |
| Hub: totals line · Refresh | Facts · Actions (the "Every automation and monitor, one screen" line stays the layer's first line) |
| Departures: counts · All / Needs a person / Held / Departed · Refresh | Facts · Toolbar row · Actions (its first line stays) |
| Roster agent page: "Agents /" back · name | The breadcrumb's **Agents** (back to every agent) · the title |
| Roster agent page: chips (custom/built-in, eval, active/paused) · Chat · Pause/Resume | Facts · Actions |
| Automation canvas: "← Automations" · name (typed in place when new) | The breadcrumb's **Automations** · the title (`ChromeTitle` while new) |
| Automation canvas: ● enabled · preview / never run / last run | Facts |
| Automation canvas: Design / Execution | Toolbar row |
| Automation canvas: dirty/incomplete truth · Discard · Dry run · Save / Create · Deploy · Run now | Actions |
| Every record reader (`BackHeader`: Inquiries, Claims, Missions, Decisions, Action centre's Authority): "{list} /" back · title · chips · actions | The breadcrumb's **{list}** · the title · facts · actions |

The agent's own tabs (Overview … Setup), the Automations sub-tabs with the describe-it box, Import flow… and + New
automation, and each section's own action stay in the page.

Verified live:
- Hub, Departures and the facts swap when the layer changes.
- Margin Analyst's page, and back via Agents.
- The Look - Daily Briefing canvas, and back via Automations.
- Authority › flag for review, and back.

### Catalog (folded after the same go-ahead)
| Was | Now |
|---|---|
| PanelHead: "catalog › schema ›" crumbs · name | Breadcrumb trail · the title; the crumb before the title goes up one level (table → schema → catalog → home) |
| PanelHead: what it is · state / test chips | Facts |
| PanelHead: Ask about it · Tools ▾ | Actions |
| The views tab strip (Overview · Tables/Columns · Sample · Findings · Diagram · Docs · History · Settings…) | Toolbar row |

The tree's own head ("Catalog" home · + Add data · ↻) and its search stay at the top of the left column, which they
head. The home's All / Favorites / Recent switch and the Add data page's own title row stay as they were.

Verified live on theLook, all the way down to `orders` and back up.

### The rail (2026-11-10, the user's reference rail: "an open one but under labelled sections")
| Was | Now |
|---|---|
| Seven destination rows; the one holding the open page unfolded its sections, the others folded (with their sections' counts rolled up) | Every destination open: its name a small muted label, every section under it with its own icon and its own count. Home's sections head the rail with no label |
| A destination's row reopened the section last used there | Gone with the row: every section is one click from anywhere, which that row approximated |
| The rail's collapse toggle in a row of its own at the rail's head | Left of the AUGHOR wordmark in the top bar, still with ⌘\ and its hover line; the rail is one row shorter |
| Collapsed: the seven destination icons and the open destination's sections | Every section's icon, the destinations ruled off from one another, each named on hover |
| Sections sharing an icon (Health/Monitors, Evidence/Evals, Profile/Semantic Layer, Actions/Notifications) | Each its own: Health, Monitors, Agent Ops, Notifications, Evals, Catalog, Profile, SQL Editor, Actions and Agent runs took distinct icons |

### Work surfaces carry no breadcrumb or title row (2026-11-10, the user's choice: "Work surfaces")
| Page | Where its title-row pieces went |
|---|---|
| SQL Editor | The tab row's right end: Draft · not saved / Saved · linked, Visual \| SQL, Saved ▾, **Save query**, Share. The Run row: Run · Limit · Cancel · **connection · dataset** (one picker) · Format … guards · panel toggles · Tools. History is the Run row's history toggle (and Tools ▾); the last run's time is in the status strip. The breadcrumb's scope words are the picker and the editor foot's dialect |
| An open sheet | Its own bar again: "‹ Spreadsheets" (the way back), its name renamed in place, its source, count and "Can read", and its doors |
| Dashboard builder | Its own edit bar again: the dashboard picked, Editing, the saved readout, Undo, Redo, Preview as, History, Publish, Retire, Done |
| Automation canvas | Its own strip again: ← Automations, its name, enabled, Design \| Execution, the run's truths, the design's verbs, Deploy, Run now |

A workspace's own toolbar row (the Agent Ops layer tabs, an Intelligence connection) stays, with any page action that
still arrives at its right end, so nothing can land nowhere.

### The SQL Editor's catalog: the connection at its head, its schemas, the Catalog's rows (2026-11-10, the user)
"We dont need schema and table selectors here" (the Run row's connection · dataset pickers), then "I [want] schemas
here depending on the connection selected and in the format/font/size exact as the catalog.. no change at all".

| Was | Now |
|---|---|
| Run row: connection picker | The catalog's head: one picker, the connection the editor queries (it still swaps the tab set, as before). The editor's foot says where ⌘↵ runs ("theLook · thelook") while the catalog is closed |
| Run row: dataset picker, "(all datasets)" | The schema's row in the catalog: "default" on the default schema, "Make default" / "Unset default" on a schema row's hover. A connection with one schema still starts on it |
| The catalog head's picker: "connection · dataset X", "· every dataset", "The whole workspace" | The connection (its schemas listed under it), "Every connection" (the workspace's tree), and any catalog the editor cannot query under "Browse only" |
| A lone dataset's tier hidden (the tables were the list) | Every schema drawn, as the Catalog draws it; a lone schema starts open |
| Rail rows: 14px monospace names, 14px counts, its own paddings | The Catalog screen's own row (`components/catalog/TreeRow.tsx`, moved out of `CatalogScreen.tsx`): 13px names, 11px counts, 15px a tier, its icons and selected look |
| Its own search box with a ✕ | The Catalog's search field, its ✕ at the right end, Escape clears |
| `»` insert + its card, ⋈n, isolated, the builder's add buttons, column type and FK, column drag, D/M | Unchanged, at each row's right end (their clicks stay theirs) |
| Rows were buttons (keyboard) | Rows take focus: Enter acts, → / ← open and close |

### The Catalog's table page, to the study's asset tabs (2026-11-10, the user: "overhaul other screens too based on the UI/UX study" → Evidence → Action, Catalog first)
Study §11.1: Overview · Columns · Preview · Lineage · Quality · Permissions · Usage · Activity · Business mapping, and
the quick actions Preview · Open in SQL · Ask about this · View lineage · Copy identifier · Open business mapping.

| Was | Now |
|---|---|
| Title row: "‹ schema" · name · business object chip · Ask about it · Tools ▾ | The same, plus **Open in SQL** (a new SQL Editor tab holding `SELECT * FROM schema.table LIMIT 100`, not run) and "Not mapped" when no object is read from it |
| Tools ▾: Edit column types · Profile its columns · favourite · Remove table… | The same, plus **Copy identifier** first |
| Tabs: Overview · Columns · Sample · Findings · Docs · History | Overview · Columns · **Preview** · **Lineage** · **Usage** · Findings · **Business mapping** · Docs · **Activity** |
| Overview: four figures | Unchanged; "Metrics read it" opens Business mapping |
| Overview: Lifecycle card | Business mapping, unchanged (states, which end it, "How many sit in each state is not read here.") |
| Overview: Columns card (column · type · means · ✓ key / → link / N states / time) | Columns: each row of the list now carries its meaning and those marks, beside the type editor and the distribution |
| — | Overview: **About** — identifier (copy), source, description and grain (the glossary Docs writes), business object, owner, tags (governed tags), layer, size, how many columns are described; what is not recorded says "Not configured" / "Not mapped" / "Not counted" |
| Sample: first 200 rows | Preview: the same grid, with its row and column count, "Live · read <UTC time>", and Read again |
| — | Lineage: upstream said as not recorded; downstream from `/graph/lineage` — kind, name, hops, the line that reads it |
| — | Usage: the statements in the SQL audit log (latest 500 on the connection) that read it after FROM or JOIN — last read, by surface, failed, the latest 20 |
| — | Business mapping: the object (Mapped / Not mapped), its identity key, its source tables, its links said from this table's side; the approved metrics that read the table, by name |
| History: Layer and analysis · Runs over the schema | Activity, unchanged |
| Docs | Unchanged |

**Not drawn:** the study's Quality (tests, failed checks, freshness trend) and Permissions (roles, grants, effective
access) tabs. Nothing per table records either; an empty tab would promise what the page cannot show. Owner is said as
"Not configured": no owner is recorded for a table.

### The Semantic Layer's metrics, to the study's metric register (2026-11-10, Evidence → Action, the second screen)
Study §11.2: "Metric register — a precise table, not cards: Metric · Definition · Grain · Unit · Owner · Sources ·
Quality · Last verified · Usage"; §16 Model: "Definition · formula · grain · unit · tests".

| Was | Now |
|---|---|
| List columns: Metric (name · unit) · State · Dated by | Metric (name · its definition) · State · Grain · dated by · **Unit** · **Owner** · **Reads** · **Tests** · **Verified** — what a row does not have says "—" |
| Groups by standing (Approved, Waiting for review, Drafts, …), folds | Unchanged |
| A row opens in place (the user, 2026-09-18) with Overview · Approval · Dates · Measures · Edit, Tools ▾ | Unchanged |
| Overview: a row of chips (state + version, approved by, id, unit, additivity, owner, measures, dataset), caveats, a long unit, the SQL, chips for reads / by / where | Overview: the Catalog's facts list (`Facts`, now in the clarity kit) — State (+ approved by), Id, Definition, Caveats (when they say more), Grain · dated by, Unit, Additivity, Owner, Measures, Dataset, Reads, Sliced by, Always filtered, Tests, Freshness — "Not configured" / "Not linked" / "No date column" where nothing is set; the SQL under it |
| Validation and freshness results, Remove's confirm, errors | Unchanged, under the facts |
| Figures, Needs you, coverage, adopt proposals, Add metric, removed list, bind roles | Unchanged |

**Not built:** the register's Usage column (no read counts how often a metric is asked for per metric) and its
Quality column beyond the count of quality tests (a validation's result is not kept).

### The Inbox, to the study's decision queue (2026-11-10, Evidence → Action, the third screen)
Study §13.1: "Default is a DecisionQueueGrid … Columns: Issue · Affected object · Impact · Priority · Owner · Status ·
Due · Freshness · Evidence. Toolbar: search, filters … Selecting a case opens the inspector".

| Was | Now |
|---|---|
| Four figures (open · in progress · verified · closed), "newest 20 read", the unread chip and Retry | Unchanged |
| Needs you: reviews that came due, answered on the row | Unchanged |
| A list of rows: the recommendation, then a line of status mark · owner · due (amber when late) · "from <analysis>" link, the baseline line, Execute and Mark | A grid: **Recommendation** (with its baseline line) · **Expected impact** · **Owner** · **Status** · **Due** (amber when late) · **Evidence** (the analysis, a link) · **Read** (when the analysis finished) · Execute and Mark |
| Open / All in the list's label | The page's toolbar row, with a **search** and an **owner** filter beside it; "N shown" and "No recommendation matches." when narrowed |
| The impact in the row's hover | Its own column, and the row's hover |
| — | Selecting a row (click or Enter) opens the shell's inspector: Overview (the recommendation, expected impact, owner, due, status) · Provenance (the analysis, its question, when, its place in the report, its id, Open the analysis) · Activity (marked, accepted by, baseline, review, reviewed) · Actions (Execute, Mark); it follows the row when it is marked |
| Where they stand (funnel) · Who they are for (owners) | Unchanged |

**Not drawn:** the study's Priority and Affected object columns — a recommendation carries neither — and bulk actions
and saved views.

### Actions, to the study's register and action lifecycle (2026-11-10, Evidence → Action, the fourth screen)
Study §6.6 (the action lifecycle), §11.2 ("a precise table, not cards"), §13.2 (show responsibility).

| Was | Now |
|---|---|
| — | A tally first, counted from stored data: **Declared** (how many ask a person first) · **Awaiting approval** · **Calls delivered** (and being sent) · **Calls waiting on you** · **Edits in force** — "—" when a read failed |
| Declared actions as rows of prose (name · description, a muted line of facts, gate and irreversible chips) beside Needs you | Needs you first, full width; then the declared actions as a register: **Action** (name · description) · **Gate** · **On** · **Changes** · **Takes** · **Rules** · **Undo** (irreversible as its chip) — each fact's long form in its cell's hover |
| — | Selecting an action (click or Enter) opens the shell's inspector: Overview (does, id, kind, gate and its rule) · Definition (every fact, its long form — URL, read's SQL, parameter types — under it) · Relations (object type, what it creates, its undo) |
| Propose from a finding · New action (title row) · the designer · the propose form | Unchanged |
| Needs you: approvals (ProposalCard), calls no retry will deliver with Retry / Dismiss and its reason | Unchanged |
| Edit layer, grouped by object, Withdraw, Annotate a value | Unchanged |
| Calls to other systems: rows of name · status words · attempts · effect, what settled it, who left it and why, when | A table: **Action** · **Status** · **Effect** · **Attempts** · **What settled it** (or who left it undelivered, and why) · **When**; newest 20 |

**Not drawn:** the lifecycle's Draft · Validated · Running · Audited counts — no store keeps a run's stage per action.

### Ask: a quick answer's anatomy (2026-11-10, Evidence → Action, the fifth screen)
Study §12.2–12.4: Question · Scope · Summary [Computed] / [Narrative] · Sources · Limits, then Results │ Explanation │
SQL │ Evidence, then Open in editor and the next actions; "never call narrative a computation".

| Was | Now |
|---|---|
| The question (coloured text), the thinking row, the headline | Unchanged |
| — | Under a headline that rides a query's result: **Narrative** — "written by the model from the rows the query returned" (its figures are re-checked against them server-side). Not said of an abstention, a knowledge-base or text-only answer, or a withheld one |
| The result figure (tiles, chart or table), always | The **Results** view — the one an answer opens on — with **Computed** · "from the executed query · N rows · reads <tables>" under it |
| "Explain the data" button revealing the narrative + anomalies (auto-revealed while it streams) | The **Explanation** view, labelled Narrative (the model's) or Computed (the platform's `computeSummary` where the model wrote none); it opens itself while streaming only when there is no figure to lead with |
| The SQL only through "View source data & SQL" (side panel) | Also the **SQL** view: the statement exactly as it ran, Copy |
| "Methodology & details" fold: Agent context · Validate · Grounding · How this was computed · Tables used · View source data & SQL · playbook items · Completed in | The **Evidence** view, the same blocks unfolded |
| Run a deep analysis · Pin to dashboard | **Open in SQL Editor** (the statement, as it ran, in a new tab, not run) · Run a deep analysis · Pin to dashboard |
| Follow-ups, copy, feedback, Why this number →, Regenerate, Export, the lean sheet answer | Unchanged |

**Not built:** the study's Scope line with [Edit scope] and Correct assumption / Compare / Create case — a quick answer
carries no editable scope, and none of those three doors exists; a deep analysis's report is unchanged.

### Monitors, to the study's observability (2026-11-10, Evidence → Action)
Study §14.3: "Compact run logs with real timestamps and states … Alert severity is paired with the affected data or
decisions. Every health summary links to underlying checks."

| Was | Now |
|---|---|
| Figures · Needs you · alerts over 12 weeks · Alerts view | Unchanged |
| The monitors, one line each: switch · name · proof chip · open chip · a muted line (rule · schedule · channel · watches · last fired) · Run now · Details | A register: **On** · **Monitor** (what it watches) · **Rule** · **Schedule** · **Proof** · **Last alert** (+ open) · **Sends to** · Run now |
| Details fold: the proofs (Backtest · Check rule · Send test alert), quiet hours, made, the SQL or metric, Edit, Delete | Selecting a monitor opens the shell's inspector: Overview (watches, rule, schedule and checks a day, sends to, quiet after an alert, proof, made) · Definition (its SQL or metric) · **Activity** (its alerts as a log — severity, time, open/acknowledged/closed, the message, and what it affects) · Actions (Run now, Edit, Delete, the three proofs) |
| — | **Run log**: the connection's latest 40 checks from the SQL audit log (`__monitor__`) — when, ran/failed, the statement, rows, time taken — said as statements, since the log does not name the monitor (a statement match would hold for 2 of theLook's 4: the other two rewrite their date window every check) |

**Health is unchanged.** It scores metrics against their targets, and no metric on any connection has a target
(measured: 47 metrics, 0 targeted) — a redesign would be drawn blind; its empty state already opens where a target is set.

### Graph, to the study's graphs (2026-11-10, Evidence → Action)
Study §11.4: "legend, direction, edge type, search, zoom, fit, focus-neighbours, synced inspector and an accessible
list alternative. Start at one hop; never render the whole company by default."

| Was | Now |
|---|---|
| Map opens on every node at once (theLook: 42 tables, metrics and declarations, findings and terms behind switches) | Map opens **centred on the most-linked table** and what is one hop from it (theLook: Order Line, 14 of 42) — "Centred on" picks any node, grouped by kind; a chosen node's side panel has **Centre here**; **Whole graph** draws everything, as before; the line says how many are drawn and how many findings and terms sit behind their switches |
| Legend and its Findings / Terms switches, zoom, fit, drag to pin, shift-click several, the side panel (Needs you, How it is known, a node's essentials, Ask) | Unchanged |
| — | **List** view: the same nodes as a table (kind · name · links · how it is known · Centre here), tables and metrics first, then the links between them (from · link · to · how it is known) |
| Explore · Tour · Review · Refresh · Rebuild | Unchanged |

### Ontology: the register, a type's page, one review queue — the map a view (2026-11-10, the user: "too clustered and unusable effectively.. think deep", then "Yes, build it" to `ontology.html`)

| Was | Now |
|---|---|
| One screen, always: the rail (types, parts, processes, actions, explorer draft, New entity) · the map · a type's panel in a third of the width | Three views in the toolbar — **Register** (where it opens) · **Map** · **Review N** |
| — | **Register**: a count line (types · parts · links · processes · rules); **Needs you** — the explorer's waiting proposals by kind (Review), a type with no key or an uncounted one ("What identifies one …?", Check), links said twice (Review); **Entities** as a table grouped Business objects · Events · Reference data · Parts — Domain · Objects · Key · Read from · Links · Process · Used by · Stands (origin, proposed); New entity under it; **Processes & rules** — stages, objects, promises with their breach rates, what a rule admits, New process, New action |
| A type in the side panel (Overview · Properties · Links · Actions · Sources · History, Edit, Make a dashboard, every door) | A type opens as **a page of its own** — the same panel at the page's width, every tab and door; "‹ Ontology" goes back; a process opens the same way |
| The explorer draft in the rail (Draft again · Confirm N · Review, each proposal with Confirm and Open) · "6 to approve" in the title row · a type's Needs you | **Review**: the counts, Draft again · 1 model call, Confirm all N; the proposals as a table — tier and kind, the sentence, On, what the data says, the model's why, Confirm, Open — filtered Waiting · Confirmed · Refused · All; **Also waiting**: keys not counted, links said twice (Open). "N to approve" opens it. The rail's draft stays, on the Map |
| The map's counts beside the title | On the Map view (the register says its own, a part apart from the types) |
| Map: rail, canvas, panel, designers, Tools ▾ drawers, release, Org / Domain / Connection | Unchanged, as the Map view |

**Not built from the mockup:** the type page's renamed tabs (Relationships · Mapping · Objects · Rules & sets · Impact) —
the panel keeps its own six tabs, every door in them; and a definition on each register row — the read that has it also
counts each type's lifecycle, so it is read when a type's page opens, never for the whole register.

### Agent runs, to the study's register and run inspector (2026-11-10, Evidence → Action; the user: "Yes, those three")

| Was | Now |
|---|---|
| Four figures (Runs · Questions · Didn't finish · Running), Running now, Needs you (Open · Ask again) | Unchanged |
| "By question": All / Deep analyses / Conversations and Traces & spans in the list's label row | The toolbar row, with a search over the questions and their answers (new); "N of M" when a search narrows |
| One row per question as a two-line button: icon, question, status mark, headline, scheduled, connection (when several), "N earlier didn't finish"; a click opened the run | A register — Question · Kind (deep analysis / conversation, scheduled) · Latest answer (status mark, headline, earlier-unfinished) · Connection (when several) · Runs · When · **Open** — a click selects the run into the inspector; Open on the row opens it as before |
| ×N opened the earlier runs; a click on one opened it | ×N on the row; each earlier run selects into the inspector and has its own Open |
| — | **The inspector** (new): Overview — the headline labelled Narrative, the report's summary, Question, Asked by, Connection · schema, Status, Started and took, Metric, Period measured, Confidence (the report's own grade, with its reason), the report's figures; Activity — its stages with status, summary and finding count; Provenance — run id, trace id, Computed: each finding's executed SQL with its rows and Open in SQL Editor, what it could not establish, what it withheld and why; Actions — Open the run / the conversation, Ask again, Traces & spans. A conversation says what its row holds (its SQL stays on its turns) |

Verified live on the Default workspace (50 runs, 4 connections): the daily theLook run's record read on selection — 5
statements, its stages, its gaps and its withheld sentence; no model call.

### Evidence, to the study's register and claim inspector (2026-11-10, Evidence → Action)

| Was | Now |
|---|---|
| The lead sentence · count beside the title · Refresh | Unchanged |
| Needs you — unreviewed (Review), disputed (Show) | Unchanged; Review also opens the first unreviewed claim in the inspector |
| The review filter (all · unreviewed · validated · disputed · needs context, each counted) and Copy/CSV in the list's label | The toolbar row, with a search over the claims, the question behind them, their keyword and their query (new) |
| Claims under the run that made them, each a two-line button with its review dot and "no query" | A register under the same run headings (question, scheduled, day, N claims) — Claim (headline and rest) · Review (dot and word) · Mentions · **Reads** (the tables its query reads, new) · Recorded; "no query" stays in Reads |
| The chosen claim beside the list: the sentence, confidence and mentions chips, "from …", the query, Validated / Disputed / Needs context, Re-examine, the note, "Not saved —" | The inspector: Overview — the claim labelled Narrative, the same chips, the review buttons, Re-examine, the note, "Not saved —"; Definition — the query with Open in SQL Editor (new); Provenance — from, stage, recorded (said as the run's finish), the tables read, the claim and run ids. Outside the app's shell the reader stays beside the list |
| "N of M shown · Guard results and refusals are not recorded with a claim." | "N of M shown" in the card's head; the guard sentence at its foot |

Verified live on theLook's latest 80 claims: 80 rows under 19 runs, every Reads cell a real table (order_items ·
products · orders), the inspector's query in its width; no warehouse statement, no model call.

### Security & Audit, to the study's register, run log and inspector (2026-11-10, Evidence → Action)

| Was | Now |
|---|---|
| Lens (Queries · Activity · Approvals · Gate map · Policies) and the connection chip in the toolbar row · Refresh | Unchanged; on Queries the chip gives way to the connection picker beside it |
| Four figures · Needs you (flagged from people or agents → Review; blocked this week → Review) · Who ran them · Limits (Edit) | Unchanged; Review also clears a search so the groups it opens are there |
| Verdict (All · Passed · Flagged · Blocked) and connection inside the card | The toolbar row, after the lens, with a search over statements, callers and errors (new); the card's count says "N matching · latest M" |
| The fold: a row per outcome and caller — dot, "Outcome · caller", what happened with when, count, Show | A register — Outcome · Who · What happened · Checks · When (its own column) · Show |
| Behind Show and "All N rows": a sortable table — Time · Connection · Who · Verdict · SQL (click to show the whole statement) · Rows · Duration · Masked · Error (click to show it whole) | The same nine columns as a sortable register (Took for Duration); a row opens in the inspector: Overview — outcome, the guard's verdict apart from it, who (the platform's own read said), connection, when, rows, took, masked, the whole error; Definition — the whole statement with Open in SQL Editor (new); Provenance — the log's ids and its verdict word. Outside the shell a row opens in place with the statement and the error |
| Approvals: Pre-approved (Show → Revoke) · Decisions (by action) · Full trail as lines | Unchanged, but the full trail is a log table — When · Decision · Action · Scope · Who |

Verified live on theLook's latest 500 checks: 18 groups, a failed ontology check opened in the inspector with its
BigQuery error whole and its statement in the inspector's width; no warehouse statement, no model call.

### No breadcrumb anywhere, and no title row that says nothing (2026-11-10, the user)
"I think we should not have breadcrumbs at all", and of the Semantic Layer's row: "let remove such where there is no
purpose or interactity or info statements".

| Was | Now |
|---|---|
| The breadcrumb row: Destination › Section › … › here | Gone. The rail says where the reader is; the title says what is open |
| The breadcrumb's second-to-last crumb as the way back (every "The breadcrumb's **X**" in the tables above) | "‹ X" before the title, the same `useChromeBack` call: "‹ Catalog", "‹ Data Canvas", "‹ Agents", "‹ Automations", "‹ Claims" … (tested; "‹ Catalog" checked live) |
| A catalog table's "catalog › schema ›" crumbs | "‹ schema" before the table's name; the Catalog tree at the left still shows catalog › schema › table |
| An open sheet's "Spreadsheets /" | "‹ Spreadsheets" (checked live) |
| A title row that only repeated the section's name (Semantic Layer, Catalog, Graph, Health, Spend, Evals, Memory, Inbox, Record, Notifications, Profile, Documents, Agent runs, Brain map) | Not drawn. The row comes back by itself when a fact, an action, a state chip, a title control or a way back arrives in it |
| Rows that hold something (Data Canvas, Dashboards, Ontology, Actions, Org, Evidence, Monitors, Security & Audit) | Unchanged |

## Not folded, on purpose

- **Pages with no top rows of their own**: Home, Now, Agent runs, Health, Spend, Notifications, Documents, Memory, the
  Record's ledgers (each ledger's controls are in its card's label row), Inbox, Profile.
- **The Catalog tree's own head and search**: they head the left column, as the SQL Editor's catalog rail's do.
- **Settings ▸ System's "System Stats" head.** It heads a stats card; it is not a page row.
- **Evals detail views' "All suites / All runs / All experiments" back rows.** These could become the "‹ Parent" way
  back next.

## What the mockups drew that is not built

- **SQL Editor:**
  - The Run row's Params and Schedule buttons. Params still appears as its bar when the SQL has parameters, and
    Schedule stays in the results' Tools ▾.
  - The mockup's "orders INT64" heads. The user kept the 11-09 type icon before the name.
- **Briefing "recorded against read now".** Re-reading each recorded answer is a warehouse query per answer. Not built.
- **Briefing compact chart.** Not built.
- **Dashboard objects table row → inspector.** The Late dispatch dashboard has its own Object detail piece, which the
  rule keeps. A dashboard without one would use the inspector; not built.
- **Mockup chrome not adopted:** the topbar Connection select and Jobs pill (no shell-wide connection exists, and the
  LIVE strip already counts runs), and the "Density" pill (the Rows look knob in Appearance does this).
