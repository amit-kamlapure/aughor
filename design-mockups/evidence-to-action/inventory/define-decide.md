# Define and Decide pages: feature inventory

**Date:** 2026-11-10.
**Pages:** Semantic Layer · Ontology · Actions · Graph · Memory · Org · Inbox · Record · Evidence.
**Purpose:** the parity baseline for the platform-wide redesign. The rule is "Do not remove features as a cost of redesign", so after the redesign every `- [ ]` line below must still be reachable. Tick a line when the redesigned page has it.

**How to read it**
- Each page lists its items in seven parts: 1 controls · 2 dialogs, drawers and panels · 3 figures, counts and chips · 4 keyboard · 5 URL params · 6 empty, error, loading and withheld states · 7 what it loads on open. The page ends with **Top rows today**, which names the controls that the new title row and toolbar row must take in.
- Paths are relative to `web/` unless they start with `pramanyx/` (the API). All line numbers are at commit `629ec70a`. The page components did not change in that commit; only `app/page.tsx` moved, and its references were remapped.
- Everything here comes from reading code only. Nothing was run and no API was called.
- ⚠ marks a call that **WRITES** or **SPENDS** (model or warehouse).

**Chrome shared by several pages** (each page section repeats the parts it uses)
- **Shell header and status strip.** Commit `629ec70a` landed while this inventory was being written. Since then the shell draws a `PageHeader` above every page: a breadcrumb (Destination › Section) and a title (`app/page.tsx:1926`, `components/shell/PageChrome.tsx`). It also draws a `StatusStrip` with the connection and the running-run count at the foot (`app/page.tsx:2345`). The "Top rows today" lines describe each page's own rows below that header.
- **Intelligence context bar.** It sits above Ontology, Graph, Actions, Evidence, Memory and Org. It holds a Connection select (only when there is more than one briefings-enabled connection), a Schema select (only when there is more than one schema; remembered per connection) and the scope maturity marker (`components/IntelligenceWorkspace.tsx:201-240`). Memory and Org are org-wide, so these pickers change nothing on them.
- **Layer tabs.** The Intelligence layer tab strip is hidden on the main screen (`hideTabs`, `app/page.tsx:2158`) and appears only when a Data Canvas embeds the workspace. The Semantic Layer's Data switcher is hidden too (`app/page.tsx:2289`). The Record keeps its own five-view tab strip (`components/Workspace.tsx:81`).
- **Shell URL params.** `?tab=` and `?layer=` choose the page; `?conn=` carries the connection. `?id=` opens a Record Reader. `?table=` opens Graph on one table. `?semtab=` names the Semantic Layer tab. `?canvas=` is used only on a canvas. See `app/page.tsx:887-1012` and `:1229-1270`.

**Counts** (one `- [ ]` line each; some lines bundle a small inline form)

| Page | Items |
|---|---|
| Semantic Layer | 232 |
| Ontology (A: page, map and drawers · B: detail panels and designers) | 462 |
| Actions | 81 |
| Graph | 85 |
| Memory | 67 |
| Org | 23 |
| Inbox | 59 |
| Record (Inquiries · Decisions · Missions · Claims · Corrections · Reader · Inspector) | 323 |
| Evidence | 35 |
| **Total** | **1,367** |

**Calls that write or spend just because a page or panel opened**
- ⚠ **Graph** WRITES on open when no graph is committed. `GET /graph`, `/graph/audit`, `/graph/review` and `/graph/trust` build the graph and persist it. They make no model call and no warehouse query (`pramanyx/routers/ontology.py:929`, `:1058`; `pramanyx/ontology/context_graph_store.py:96`).
- ⚠ **Record › Missions Reader** SPENDS on the warehouse. `GET /record/missions/{id}/report?compose=true` runs SQL on every open and again on each version or report change (`pramanyx/routers/record.py:1071-1083`). An active mission also calls `GET …/proposals`, which measures the objective with SQL (`record.py:369-384`).
- ⚠ **Semantic Layer** SPENDS on the warehouse in four places:
  - The coverage card re-reads with `figures=true` whenever any area is "not checked".
  - A metric's approval view loads `definition-report`, which executes the metric.
  - The scope pickers' `schema/rich` read rebuilds the schema on a cache miss.
  - Opening the Bind roles dialog POSTs `propose-bindings`.
- ⚠ **Ontology** SPENDS in several places:
  - The context bar's `GET /catalog/tree` opens every connector. It fires only when the connection declares no schema.
  - Org mode reads the catalog tree, then one `GET /ontology` per connection·schema pair.
  - Opening the Find duplicates drawer embeds every entity.
  - The Sources tab opens the warehouse to read columns.
  - Make a dashboard measures every piece it offers.
  - The process and action designers POST a warehouse preview 900 ms after each valid draft change.
  - The process read can re-count on the warehouse under a row policy.
  - On the Ontology page, the only write that needs no click is `PUT /me/preferences` on every card drop.
- **Inbox** writes nothing on open, but it makes up to 41 GETs. Actions, Memory, Org and Evidence neither write nor spend on open.

**Found while reading** (risks for the redesign; nothing here was changed)
- **Unreachable today:**
  - The `OntologyCanvas` main view is mounted by no screen, so its tidy, zoom, legend and "Investigate →" controls do not count as live features.
  - `OntologyPanel`'s `onInvestigate` is never used.
  - ProposalCard's "Open in editor" and "Open in inbox" are not wired on Actions.
  - An empty Ontology map shows no rail, so "New entity" and "Draft the business" cannot be reached from it.
- **Deletes with no confirmation:**
  - Annotations, Knowledge and Benchmarks rows.
  - Ontology Discard all, Merge, Delete skill and Revert override.
- **Browser `confirm()` dialogs:**
  - Approving a duplicate metric.
  - Memory › Remove.
- **Withheld but not said:**
  - The coverage card is silent while it loads.
  - "All schemas" hides the coverage and adopt cards without a word.
  - The entity panel's history, uses and processes sections vanish when their read fails.
  - The Ontology map's refused-link edge has no hover reason, although the code comment says it does.
- **Behaviour that does not match its label:**
  - The React Flow default Backspace removes the selected card or node, locally, on both the Ontology map and the Graph canvas.
  - Graph's hint says "shift-click", but multi-select is Meta or Ctrl-click.
  - An Org-board cluster label opens its connection on the workspace's schema, not the cluster's.
  - "Named by › Declare" saves as soon as the value changes.
- **No deep link:** a single metric, an entity type, a process, either designer, and the Record Inspector drawer can't be addressed by URL. Only a Record Reader (`?id=`) can.

---

## Semantic Layer
Entry: rail **Define › Semantic Layer** (`lib/navDestinations.ts:65`, id `semantic`) → Data workspace layer `semantic` (`app/page.tsx:2295`, `hideTabs` so no layer-tab row) → `<SemanticLayerPanel connectionId connName connections/>` (`components/SemanticLayerPanel.tsx:697`). Also reached from the Record's "definitions" door (`app/page.tsx:1989`) and the Health scorecard's "open metrics" door, which clears `?semtab=` first (`app/page.tsx:2267-2273`). Tabs (confirmed): **Metrics · Annotations · Knowledge · Benchmarks · Import** (`components/SemanticLayerPanel.tsx:648`). Metrics is `components/MetricsPanel.tsx`; Import is `components/intake/IntakePanel.tsx`.

### 1. Controls

**Panel top row (all tabs)**
- [ ] Tab strip "Semantic layer views": Metrics / Annotations / Knowledge / Benchmarks / Import — switches the tab, written to `?semtab=` (components/SemanticLayerPanel.tsx:776)
- [ ] Connection select (scope, trailing right of the tabs) — browses any workspace connection's semantic layer, independent of the app's chosen one; follows the shell when the shell's connection changes; remounts every tab (components/SemanticLayerPanel.tsx:674, :725, :793)
- [ ] Dataset select "All schemas" + each schema (shown only when the connection has >1 schema) — scopes Metrics/Import; remembered per connection (components/SemanticLayerPanel.tsx:678-683, :763)
- [ ] Table select "All tables" / "Loading…" / "No tables loaded" + each table (Annotations tab only) — filters annotations and pre-fills the new-annotation Table field (components/SemanticLayerPanel.tsx:685-691, :788, :163)

**Metrics tab — page**
- [ ] "Add metric" (+ icon) in the Metrics card header — opens the New metric dialog (components/MetricsPanel.tsx:1306)
- [ ] Metric row (whole row is a button: label, unit/dataset meta, state chip, dated-by column, chevron) — opens/closes the row's detail in place (components/MetricsPanel.tsx:1391-1408, :831)
- [ ] Folded group line "Retired · N ›" — unfolds the Retired group (components/MetricsPanel.tsx:1324-1326; groups lib/semanticMetrics.ts:50-57)
- [ ] "Fold" (on an unfolded foldable group head) — folds it again (components/MetricsPanel.tsx:1333)
- [ ] "Removed here · N ›" fold line — opens the list of removed proposals (components/MetricsPanel.tsx:1515)
- [ ] "Restore" (per removed proposal) — restores a removed proposal (POST restore) (components/MetricsPanel.tsx:1523, :878)

**Metrics tab — Needs you (one group per kind; ≤8 per-metric buttons then "+N more in the list")**
- [ ] "Review" (one metric) / per-metric name buttons (several) — opens that row on its Approval view and scrolls to it (components/MetricsPanel.tsx:1444-1445)
- [ ] "Write its SQL" / per-metric names — opens the row on Edit (components/MetricsPanel.tsx:1452-1453)
- [ ] "Set its date" / per-metric names — opens the row on Dates with the form already open (components/MetricsPanel.tsx:1467-1468)
- [ ] "Bind roles" / "Bind <pack> roles" (one per pack) — opens the Bind roles dialog for that pack's unbound metrics (components/MetricsPanel.tsx:1476-1482)
- [ ] "Open" / per-metric names (not bound) — opens the row on Overview (components/MetricsPanel.tsx:1484-1485)
- [ ] "Open" / per-metric names (defined twice) — opens the row on Edit (components/MetricsPanel.tsx:1493-1494)

**Metrics tab — an opened DEFINED metric: view tabs + Tools**
- [ ] Detail tab strip: Overview · Approval (badge 1 when proposed) · Dates (badge when no/unread date) · Measures (only for a connection-keyed metric) · Edit (badge when no SQL) (components/MetricsPanel.tsx:1141-1150)
- [ ] Tools ▾ menu (trailing the detail tabs) (components/MetricsPanel.tsx:1151; ToolsMenu components/semantic/parts.tsx:32-55)
  - [ ] "Validate now" / "Validating…" — runs its quality tests on the warehouse (POST validate) (components/MetricsPanel.tsx:1152, :942)
  - [ ] "Check freshness" / "Checking…" — runs its freshness check on the warehouse (GET freshness) (components/MetricsPanel.tsx:1154, :956)
  - [ ] "Promote to the whole connection" / "Promoting…" — moves the definition to every dataset (hidden unless >1 dataset and scoped to one) (components/MetricsPanel.tsx:1156-1158, :929)
  - [ ] "Remove — deprecate it first" — shown disabled for an approved metric, saying why (components/MetricsPanel.tsx:1160-1161)
  - [ ] "Remove…" (red, set apart) — opens the inline remove confirmation on Overview (components/MetricsPanel.tsx:1162-1164)
- [ ] Remove confirmation "Remove" / "Removing…" — deletes this dataset's definition (DELETE) (components/MetricsPanel.tsx:1208-1210, :913)
- [ ] Remove confirmation "Cancel" (components/MetricsPanel.tsx:1211)

**Metrics tab — Approval view (GovernanceSection)**
- [ ] Lifecycle buttons per state: draft→"Propose"; proposed→"Approve" / "Reject"; approved→"Deprecate"; deprecated→"Propose" ("…" while busy) — POST transition, server stamps the signed-in person (components/MetricsPanel.tsx:77-83, :526-536, :498)
- [ ] Twin-approval confirm (browser `confirm`) "…Approve it anyway? The choice is recorded under your name." on a 409 same_as_approved (lib/api.ts:1594-1612)
- [ ] "History · N ›" fold — shows the governance audit trail (components/MetricsPanel.tsx:540)

**Metrics tab — Dates view (DatesSection)**
- [ ] "Confirm" — confirms the automatically-set dates as the signed-in person (PUT metric) (components/MetricsPanel.tsx:360-362)
- [ ] "Correct…" / "Set the date…" — opens the dates form (components/MetricsPanel.tsx:363-365)
- [ ] Kind select: Flow — adds up over a range / Stock — a level at a date / Cohort — completed by a later date (components/MetricsPanel.tsx:370-376)
- [ ] Date column picker: select of proposed date columns ("Choose the date…", "<grain> · main date · <type>", "Another column — type it…") or typed field "Date column — schema.table.column" (components/MetricsPanel.tsx:377-378, :260-287)
- [ ] "Use <column>" — swaps a stale value for the one listed date (components/MetricsPanel.tsx:394-400)
- [ ] "Edit the SQL" — jumps to the Edit view when the date is one join away (components/MetricsPanel.tsx:413)
- [ ] Cohort only: "Completing date column" picker + "Settles after (days)" input (components/MetricsPanel.tsx:416-423)
- [ ] Stock only: "Counts until column" picker (components/MetricsPanel.tsx:424-427)
- [ ] "Reported by" grain select: month (the default) / day / week / month / quarter / year (components/MetricsPanel.tsx:428-433)
- [ ] "Save dates" — saves the dates (with the Edit tab's SQL when edited) (components/MetricsPanel.tsx:440-447)
- [ ] "Cancel" (components/MetricsPanel.tsx:448)

**Metrics tab — Measures view (EntitySection)**
- [ ] "Confirm" — keys the metric to the proposed entity (PUT entity) (components/MetricsPanel.tsx:223-225)
- [ ] "Correct…" — opens the entity picker (components/MetricsPanel.tsx:226-230)
- [ ] "Clear" — removes the confirmed entity (components/MetricsPanel.tsx:231)
- [ ] Entity select "— choose the entity —" + each entity, "Save", "Cancel" (components/MetricsPanel.tsx:236-243)

**Metrics tab — Edit view / New metric form (same form)**
- [ ] Name (snake_case)* — "renaming keeps its history" (components/MetricsPanel.tsx:977-979)
- [ ] Label* (components/MetricsPanel.tsx:980-982)
- [ ] Dataset select (only >1 dataset): "The one its SQL reads" (new only) / "Every dataset of this connection" / each dataset (components/MetricsPanel.tsx:983-992)
- [ ] SQL statement* textarea (components/MetricsPanel.tsx:995-998)
- [ ] "Generate from the definition" / "Writing…" + "1 model call" chip — the model writes the statement (components/MetricsPanel.tsx:1000-1004, :702)
- [ ] "Switch to: over <table>" buttons — swap among the platform's proposed statements (components/MetricsPanel.tsx:1024-1034)
- [ ] Tables, Unit, Dimensions, Always-on filters, Caveats inputs (components/MetricsPanel.tsx:1043-1058)
- [ ] Additivity select: Not said / Additive — periods sum / Non-additive — they do not (components/MetricsPanel.tsx:1059-1066)
- [ ] Health scorecard group: Target value, Warning ≥, Critical ≥, Target period, Benchmark source (components/MetricsPanel.tsx:1069-1086)
- [ ] Ownership and checks group: Owner, Freshness SLA, Freshness check SQL, Lineage, Anti-patterns (NEVER rules), Quality tests (components/MetricsPanel.tsx:1089-1118)
- [ ] "Create" / "Save" / "Saving…" — POST new or PUT existing, then reopens it on Overview (components/MetricsPanel.tsx:1122-1124, :884)
- [ ] "Cancel" — closes the new dialog or reverts the edit to Overview (components/MetricsPanel.tsx:1125-1130)

**Metrics tab — an opened SUGGESTION / industry / explorer row (MetricProvenance)**
- [ ] "Customise for this connection" / "Write its SQL for this connection" / "Working…" — copies it as a connection draft (POST materialise) and opens it on Edit (components/MetricsPanel.tsx:1642-1645, :845)
- [ ] "Bind its roles" (unbound industry metric only) — opens Bind roles for this one (components/MetricsPanel.tsx:1646-1651)
- [ ] "Remove" → "Remove — sure?" (two-step) — removes the proposal, never proposed again (POST remove) (components/MetricsPanel.tsx:1652-1657, :866)

**Metrics tab — Coverage card**
- [ ] "Propose by code" / "Proposing…" — starts the coverage proposer, no model call (POST run) (components/semantic/CoverageCard.tsx:123-125)
- [ ] "Write from the knowledge base · N calls" / "Starting…" — one model call per writable area (POST write); only when areas are writable (components/semantic/CoverageCard.tsx:126-129)
- [ ] Area row (whole row button) — opens the area's detail (components/semantic/CoverageCard.tsx:147-165)
- [ ] Per-area "Adopt <Area>'s proposals" card (inside an opened area) — same controls as Adopt below (components/semantic/CoverageCard.tsx:257-259)

**Metrics tab — Adopt the proposals card**
- [ ] "Choose and date them" — opens the adopt list and reads each proposal's dates (components/semantic/AdoptProposals.tsx:81)
- [ ] Per-proposal checkbox "Adopt <label>" (all ticked by default) (components/semantic/AdoptProposals.tsx:94-95)
- [ ] Per-proposal "dated by" select of date columns (components/semantic/AdoptProposals.tsx:101-104)
- [ ] "Approve N metrics" / "Adopting…" — dates, proposes and approves the ticked set once (POST adopt); disabled while a ticked one has no date (components/semantic/AdoptProposals.tsx:110-112)
- [ ] "Close" (components/semantic/AdoptProposals.tsx:116)

**Annotations tab**
- [ ] "Add annotation" (+) — opens the inline new-annotation form (components/SemanticLayerPanel.tsx:229)
- [ ] New form: Table* (pre-filled from scope table), Column (blank = whole table), Business description* (components/SemanticLayerPanel.tsx:236-241)
- [ ] New form "Add" — PUT table or column annotation (components/SemanticLayerPanel.tsx:244, :206)
- [ ] New form "Cancel" (components/SemanticLayerPanel.tsx:245)
- [ ] Table row "Edit" — opens the edit dialog for the table description (components/SemanticLayerPanel.tsx:264-265, :123)
- [ ] Table row "Delete" (red) — deletes the table annotation immediately, no confirmation (components/SemanticLayerPanel.tsx:266, :124, :195)
- [ ] Column row "Edit" / "Delete" — same for `table.column`, delete immediate (components/SemanticLayerPanel.tsx:272-274)

**Knowledge tab**
- [ ] "Add entry" (+) — opens the New knowledge entry dialog (components/SemanticLayerPanel.tsx:393)
- [ ] Tools ▾ › "Rebuild the search index" / "Rebuilding…" — re-reads every entry into the retrieval index (POST rebuild-index) (components/SemanticLayerPanel.tsx:394-397)
- [ ] Entry row "Edit" — opens the edit dialog (components/SemanticLayerPanel.tsx:417)
- [ ] Entry row "Delete" (red) — deletes immediately, no confirmation (components/SemanticLayerPanel.tsx:417, :375)
- [ ] Missed question row "Add a synonym" — opens the Add a synonym dialog for that question (components/semantic/MissedQuestions.tsx:163-167)

**Benchmarks tab**
- [ ] "Add question" (+) — opens New benchmark question dialog (components/SemanticLayerPanel.tsx:557-559)
- [ ] "Run all" / "Running…" — runs every question: one model call each, then the warehouse (POST run); disabled with no questions (components/SemanticLayerPanel.tsx:560-562, :529)
- [ ] Case row "Edit" / "Delete" (delete immediate, no confirmation) (components/SemanticLayerPanel.tsx:612, :524)
- [ ] Failed case "The SQL it got ›" fold — shows the generated SQL (components/SemanticLayerPanel.tsx:605-608)

**Import tab — staging doors**
- [ ] Door buttons: File · Paste a bundle · Google Sheet · Mine usage · Mine a wiki (only when a Confluence/Notion connection exists) · Prose (model) (components/intake/IntakePanel.tsx:254-261, :351-358)
- [ ] File: "Choose a file" — opens the file picker (.csv .tsv .xlsx .json .md .markdown .yaml .yml) and stages it (POST /intake/files) (components/intake/IntakePanel.tsx:362-372)
- [ ] File: "Download the metric template" — downloads metrics.csv (components/intake/IntakePanel.tsx:373-376)
- [ ] File: "▸ The metric file's columns" disclosure — shows the column reference table (components/intake/IntakePanel.tsx:275-277)
- [ ] Paste: YAML textarea + "Stage the bundle" (POST /intake/bundles) (components/intake/IntakePanel.tsx:389-396)
- [ ] Google Sheet: "Spreadsheet link or id (link-shared)" + "Worksheet (first tab if empty)" + "Fetch & stage" (POST /intake/sheets) (components/intake/IntakePanel.tsx:403-412)
- [ ] Mine usage: "Mine what this connection has witnessed" — no model call (POST /intake/suggest) (components/intake/IntakePanel.tsx:418-428)
- [ ] Mine a wiki: "Choose a wiki connection…" select + "Walk its pages for definition tables" (POST /intake/mine) (components/intake/IntakePanel.tsx:437-452)
- [ ] Prose: textarea + "Extract with the model — one call" (POST /intake/prose, the lane's only model spend) (components/intake/IntakePanel.tsx:459-473)

**Import tab — imports rail and plan**
- [ ] "Export" (Imports header) — exports this connection's declared knowledge as YAML (GET export) (components/intake/IntakePanel.tsx:608-610)
- [ ] Import (bundle) button per import: source, time · uploader — opens its plan (components/intake/IntakePanel.tsx:617-632)
- [ ] "Accept every new & changed (N)" — marks all non-conflict pending as accept (components/intake/IntakePanel.tsx:654-661)
- [ ] "Dismiss the rest" — marks every unmarked pending as dismiss (components/intake/IntakePanel.tsx:662-669)
- [ ] "Clear marks" (components/intake/IntakePanel.tsx:670)
- [ ] Candidate row toggle (kind · label · verdict chip) — expands its payload (components/intake/IntakePanel.tsx:148-159)
- [ ] Candidate "Accept" (toggle) / "Dismiss" (toggle) — local marks only (components/intake/IntakePanel.tsx:162-169)
- [ ] "Edit before accepting" — opens a JSON editor of the payload (marks accept) (components/intake/IntakePanel.tsx:191-196, :685)
- [ ] JSON edit textarea + "Discard edit" (components/intake/IntakePanel.tsx:199-208)
- [ ] "N already declared — nothing to decide" disclosure (components/intake/IntakePanel.tsx:714-717)
- [ ] Sticky bar "Apply verdicts" — sends all marks in one resolve call (POST resolve) (components/intake/IntakePanel.tsx:733-735, :546)
- [ ] Export panel "Copy YAML" — copies to clipboard (components/intake/IntakePanel.tsx:749-751)
- [ ] Export panel "Hide" (components/intake/IntakePanel.tsx:752)

**Not present (worth knowing):** no search, filter, sort or bulk select on the Metrics list, Annotations, Knowledge or Benchmarks; no CSV/copy export except Import's Export/Copy YAML.

### 2. Dialogs, drawers, popovers, panels
- [ ] New metric dialog (FormDialog, 820px, blurred scrim) — the full metric form; Escape/corner Close/Cancel dismiss (components/MetricsPanel.tsx:1293-1296; components/ui/dialog.tsx:64)
- [ ] Inline metric detail (hangs under its row, accent left edge) — Overview / Approval / Dates / Measures / Edit views for a defined metric (components/MetricsPanel.tsx:1136-1228, :1410)
- [ ] Inline suggestion detail (MetricProvenance) — id, unit, tables, definition, why it matters, unbound note, SQL, rejected reason, grain, published range, "Never" anti-patterns, three ways forward (components/MetricsPanel.tsx:1583-1664)
- [ ] "Before you decide" definition report (inside Approval) — advisory chip, N defects, four claims (What it changes / Whether it runs / What it declares / What could be compared) each with outcome chip, summary, findings with evidence, then the Population line (components/MetricsPanel.tsx:133-155, :97-125)
- [ ] Inline remove confirmation (amber band on Overview) — "Remove it from <dataset>? A suggestion it came from is not proposed again." (components/MetricsPanel.tsx:1203-1213)
- [ ] Bind the <pack> package here · <schema> dialog (760px) — intro, per role: table select with proposal/“nothing proposed — why”, per attribute a typed column select or "No <type> column on <table>", "ready" chip; stuck metrics with "Write the SQL of <label>"; result line; Bind / Close (components/semantic/BindRoles.tsx:116-207)
- [ ] Coverage area detail (inline under area row) — Data (tables, rows, why) · Metrics (status, "never moves") · The knowledge base · N patterns · Proposals (origin chip, passed/failed a check, gate line) · per-area Adopt card (components/semantic/CoverageCard.tsx:194-262)
- [ ] Adopt list (inline in its card) — ticked proposals with a date select each, Approve N / Close, result (components/semantic/AdoptProposals.tsx:88-128)
- [ ] Tools ▾ dropdown menus (Radix DropdownMenu) — metric Tools, Knowledge Tools (components/semantic/parts.tsx:32-55)
- [ ] Edit <table[.column]> dialog (440px) — Business description textarea, Save / Cancel (components/SemanticLayerPanel.tsx:281-284, :100-117)
- [ ] Inline new-annotation form (not a dialog) (components/SemanticLayerPanel.tsx:233-247)
- [ ] New knowledge entry / Edit entry dialog — Title / name*, Definition or rule* (per-kind placeholder + hint), Kind select (Metric Definition / Synonym / Business Rule / Join Guidance / Note), Tags (components/SemanticLayerPanel.tsx:426-441, :302-328)
- [ ] Add a synonym dialog (560px; holds Escape while saving) — "For “<question>”", word input, "The declared term it means" grouped select (Business rules / Process stages / Metrics / Entities), metric/entity caveat, near-match line, Save / Cancel (components/semantic/MissedQuestions.tsx:192-199, :238-282)
- [ ] New benchmark question / Edit question dialog (520px) — Question*, Expected columns, SQL must contain, SQL must NOT contain, Notes (components/SemanticLayerPanel.tsx:619-636)
- [ ] Metric file's columns reference table (Column / What it holds / Example, * = required) (components/intake/IntakePanel.tsx:279-297)
- [ ] Candidate payload view (field grid; long fields as code) + JSON editor (components/intake/IntakePanel.tsx:96-120, :188-213)
- [ ] Provenance trail on an accepted candidate — "from <source>, uploaded by X (time), accepted by Y · bundle <hash>" (components/intake/IntakePanel.tsx:220-247)
- [ ] Export panel — "This connection's declared knowledge, as a bundle", YAML block, "an identical re-import plans zero changes" (components/intake/IntakePanel.tsx:745-761)
- [ ] Sticky apply bar — "N to accept · N to dismiss" + Apply verdicts (components/intake/IntakePanel.tsx:726-737)

### 3. Figures, counts, badges, chips, freshness/as-of lines
**Metrics**
- [ ] Figure "Approved and measured" — N; sub "of N approved · N not checked" / "none approved yet" (components/MetricsPanel.tsx:1256-1260)
- [ ] Figure "Waiting for review" — N (amber when >0); sub "proposed <day>" / "N drafts not yet proposed" / "nothing proposed" (components/MetricsPanel.tsx:1261-1265)
- [ ] Figure "Can't be measured" — N (amber); sub "N no date column · N date on a table the SQL doesn't read · N no SQL" / "the definitions could not be read" / "every approved one has SQL and a date" / "nothing approved yet" (components/MetricsPanel.tsx:1266-1272)
- [ ] Figure "Last decision" — day words or "—"; sub "<label> <action> · by" / "N <action>" / "none recorded"; tooltip full timestamp (components/MetricsPanel.tsx:1273-1277)
- [ ] Needs you group titles/details per kind (waiting for review / has no SQL / can't be measured for a period / not bound + missing roles / defined twice) (components/MetricsPanel.tsx:1436-1496)
- [ ] Metrics card count "N apply" (+ " · every dataset") (components/MetricsPanel.tsx:1305)
- [ ] Column headers Metric / State / Dated by (components/MetricsPanel.tsx:1316-1318)
- [ ] Group heads with counts: Approved, Waiting for review, Drafts, Suggested, Industry, not bound, Retired (folded) (components/MetricsPanel.tsx:1332; lib/semanticMetrics.ts:50-57)
- [ ] Row state chip: "✓ measured" / "no date column" / "date on a table it doesn't read" / "no SQL" / "not checked" / "waiting for review" / "draft" / "retired" / "suggested · <source>" / "suggested · no SQL" / "SQL rejected" / "failed a check" / "not bound · <roles>" (components/MetricsPanel.tsx:1401; lib/semanticMetrics.ts:298-334)
- [ ] Row chip "defined twice" (amber) (components/MetricsPanel.tsx:1402)
- [ ] Row "Dated by" cell `<column> · <grain>` or "—" (components/MetricsPanel.tsx:1404-1406)
- [ ] Row meta line: unit · dataset (every-dataset view) (components/MetricsPanel.tsx:1387, :1394-1398)
- [ ] Detail tab badges (Approval / Dates / Edit = 1) (components/MetricsPanel.tsx:1143-1146)
- [ ] Overview chips: "<status> vN", "approved by X · <day>", id (mono), unit, additive/non-additive, "owner · X", "measures <Entity>", "every dataset of this connection" / "belongs to <ds>", "reads …", "by …", "where …" (components/MetricsPanel.tsx:1170-1197)
- [ ] Validation result: "✓ all tests passed" / "✕ tests failed" + message + per test ✓/✕ SQL and error (components/MetricsPanel.tsx:1534-1551)
- [ ] Freshness result: "fresh" / "freshness issue" + message + "SLA: …" (components/MetricsPanel.tsx:1553-1561)
- [ ] Approval: status chip "<status> vN", "<status> by X · <day>", "as <actor>" (components/MetricsPanel.tsx:517-518, :534)
- [ ] Definition report chips: "advisory", "N defects", per-claim outcome (clean / findings / unavailable / …), Population line "Population: <mode> — reason token" (amber when not reproducible) (components/MetricsPanel.tsx:105, :137-152)
- [ ] History rows "<datetime> · actor action from→to vN" (components/MetricsPanel.tsx:543-548)
- [ ] Dates chips "confirmed by X" / "set automatically", "by <grain>"; dates sentence; problem line (amber); kind words · source (components/MetricsPanel.tsx:341-357)
- [ ] Dates proposals note ("N dates on <tables> — choose one" / "The only date on <t> is <c> — set for you…" / stale-value warning / "no proposals yet") (components/MetricsPanel.tsx:379-393)
- [ ] Measures chip "confirmed by X" / "proposed" / "not keyed" (components/MetricsPanel.tsx:206-208)
- [ ] Edit: "Written by the model (<model>) from the definition — check it, then save." / refused note / "Proposed by the platform from the stored expression — save to keep it." (components/MetricsPanel.tsx:1006-1023)
- [ ] Suggestion: id/unit/"reads …" chips, "published range <min> – <max>" chip + basis (components/MetricsPanel.tsx:1591-1627)
- [ ] Removed list rows "<label> · <dataset> · removed by X on YYYY-MM-DD" (components/MetricsPanel.tsx:1521-1522)
- [ ] Coverage header "N of N areas with data covered" (components/semantic/CoverageCard.tsx:120-122)
- [ ] Coverage intro "…; N patterns of the knowledge base no metric computes yet" (components/semantic/CoverageCard.tsx:131-135)
- [ ] Area row: "N rows · N tables", state chip covered / not checked / no working metric / no data, "working/total" metrics, "N ready · N failed" / "N open patterns" (components/semantic/CoverageCard.tsx:152-163, :26-31)
- [ ] Coverage spend line "Written from the knowledge base by <model>: N model calls, one per area, <day> — why. N calls failed." (components/semantic/CoverageCard.tsx:179-185)
- [ ] Coverage "Placed in no area: …" (components/semantic/CoverageCard.tsx:173-178)
- [ ] Area detail: "N rows"/"rows not read", metric status chip, "never moves" chip, origin chip, "passed every check"/"failed a check", gate line (components/semantic/CoverageCard.tsx:209-253)
- [ ] Adopt closed line "N proposals with a formula are ready to adopt…" (components/semantic/AdoptProposals.tsx:83-86)
- [ ] Bind roles: "read by …", "ready" chip, "proposed: <table>" (components/semantic/BindRoles.tsx:139-151)

**Annotations / Knowledge / Benchmarks**
- [ ] Annotations count "N tables · N columns" (components/SemanticLayerPanel.tsx:228)
- [ ] Knowledge count "N entries" (components/SemanticLayerPanel.tsx:392)
- [ ] Knowledge kind chip (metric definition / synonym / business rule / join guidance / note) and #tags (components/SemanticLayerPanel.tsx:412-413)
- [ ] Missed questions count "N questions missed · the newest N listed" (components/semantic/MissedQuestions.tsx:130-132)
- [ ] Missed question when-line "<day> · asked once" / "asked N times · the last on <day>" / aged-out "N questions · <from> to <to>" (components/semantic/MissedQuestions.tsx:77-85, :158)
- [ ] Missed question "scheduled" chip (components/semantic/MissedQuestions.tsx:160-162)
- [ ] Benchmarks count "N questions" + chip "1 model call per question" (components/SemanticLayerPanel.tsx:555-556)
- [ ] Benchmark score "NN%" (green/amber), "N of N passed", "N failed" chip (components/SemanticLayerPanel.tsx:566-574)
- [ ] Case chips "✓ passed"/"✕ failed", "returns <col>", "✓ <snippet>", "✕ <snippet>"; failure bullets; "Error: …" (components/SemanticLayerPanel.tsx:588-604)

**Import**
- [ ] Prose door running edit-rate "N% (parks at N%)" (components/intake/IntakePanel.tsx:476-478)
- [ ] Plan summary "<source> · N new · N changed · N in conflict · N already declared" (components/intake/IntakePanel.tsx:644-650)
- [ ] Candidate kind word + verdict chip new / changed / conflict / already declared; status "applied → <ref>" / accepted / dismissed (components/intake/IntakePanel.tsx:75-80, :172-176, :703-706)
- [ ] Bundle rail rows "<time> · <uploader>" (components/intake/IntakePanel.tsx:628-630)
- [ ] Resolve note "N applied · N dismissed · N failed and stay pending" (components/intake/IntakePanel.tsx:564-565)

### 4. Keyboard shortcuts
- [ ] None registered by the page. Only library defaults: Escape closes dialogs (held while a synonym saves) (components/ui/dialog.tsx:78), arrow keys move within the Radix tab strips (components/ui/tab-strip.tsx:68) and Tools dropdown menus (components/semantic/parts.tsx:36)

### 5. URL params / deep links
- [ ] `?tab=semantic` — opens the Data workspace on the Semantic Layer (app/page.tsx:909, :923)
- [ ] `?semtab=<metrics|annotations|knowledge|benchmarks|import>` — read once at mount (case-insensitive), written via replaceState on every tab change; omitted for Metrics (components/SemanticLayerPanel.tsx:702-714)
- [ ] `?semtab=` cleared by the Health scorecard's open-metrics door before navigating (app/page.tsx:2267-2273)
- [ ] `?conn=` — the shell's connection, which this panel's own Connection select follows on change (it does not write it back) (components/SemanticLayerPanel.tsx:720-725)
- [ ] Not URL: the chosen dataset is remembered per connection in local storage (`rememberSchema`) and used as the default for single-schema connections (components/SemanticLayerPanel.tsx:762-763)
- [ ] No deep link to a single metric, annotation, entry or import bundle (row opens are local state only)

### 6. Empty / error / loading / withheld states
- [ ] No connection: "No connections yet — add one to manage its semantic layer." (components/SemanticLayerPanel.tsx:768)
- [ ] Metrics, no connection: "Select a connection to see the metrics that apply to it." (components/MetricsPanel.tsx:1231)
- [ ] Metrics loading: "Loading the metrics…" (components/MetricsPanel.tsx:1233)
- [ ] Metrics catalogue failed: "Could not read the metrics that apply to this connection — <error>." + Retry (components/MetricsPanel.tsx:1234-1239)
- [ ] Metrics empty: "Nothing applies to this connection yet. The explorer proposes metrics as it profiles the data, and an industry package adds its own once its roles are bound here." (components/MetricsPanel.tsx:1309-1312)
- [ ] Needs you empty: "Nothing needs you" (+ " · the definitions could not be read, so their dates are not checked") (components/MetricsPanel.tsx:1281)
- [ ] Registry unread (withheld): "Can't be measured" sub says "the definitions could not be read" (components/MetricsPanel.tsx:1268)
- [ ] Opened defined row whose stored definition is missing: "Could not read its stored definition — the definitions could not be read." + Retry (components/MetricsPanel.tsx:1340)
- [ ] No SQL: "No SQL yet — it can't be measured until it has one. Write it under Edit." (components/MetricsPanel.tsx:1191)
- [ ] Validating: "Running its quality tests…"; no tests: "No quality tests defined for this metric." (components/MetricsPanel.tsx:1199, :1548)
- [ ] Checking freshness: "Checking its freshness…" (components/MetricsPanel.tsx:1201)
- [ ] Definition report failed: "The definition report is unavailable: <error>" (amber) (components/MetricsPanel.tsx:523-525)
- [ ] Measures: "Reading the ontology…" / "No entity proposed — this metric is not read on the scope's ontology." (components/MetricsPanel.tsx:215-216)
- [ ] Dates: text-date caveat "… is kept as text — it is read as a date when a period is measured…" ; "One join away: … add the join to <table> in its SQL, then choose the date here." (components/MetricsPanel.tsx:401-414)
- [ ] Generate SQL guards: "Pick a connection first — the statement is written over its schema." / "Name the metric first — the name becomes the statement's column." (components/MetricsPanel.tsx:703-704)
- [ ] Form validation: "Name is required" / "Label is required" / "SQL statement is required" (components/MetricsPanel.tsx:887-891)
- [ ] Suggestion: "Its SQL names <roles> — data this connection has not bound to the <pack> package." / "No SQL was proposed for this one — make it this connection's and write it." / "Its SQL was rejected: …" / "Published for the population above — not a measurement of your data." (components/MetricsPanel.tsx:1599-1626)
- [ ] Customise/remove errors: "Could not make this metric editable" / "Could not remove it" / "Could not restore it" / "Could not promote it" (components/MetricsPanel.tsx:859, :874, :881, :938)
- [ ] Coverage loading: renders NOTHING until read (silent) ; failed: card "The coverage could not be read: <error>" (components/semantic/CoverageCard.tsx:91-94)
- [ ] Coverage reading figures: " Reading the approved metrics' figures…" (components/semantic/CoverageCard.tsx:134)
- [ ] Coverage area empties: "No table is placed here." / "No metric reads on this area." / "No pattern covers this area yet." / "Nothing is proposed for this area." / "Not written for this data: …" (components/semantic/CoverageCard.tsx:208, :218, :231, :244, :234-238)
- [ ] Coverage run notes: "Proposing — each proposal's figures are read before it is listed. Read this again in a few minutes." / "The run did not start." / "Writing — N model calls, one per area… Read this again in a few minutes." / "The writer did not start." (components/semantic/CoverageCard.tsx:105-114)
- [ ] Adopt card hidden entirely when nothing is adoptable; "reading its dates…" / "no date on the tables it reads" / "N ticked metric without a date — untick or wait for its dates." / "<label> was not adopted: <reason>" / "Nothing was adopted." (components/semantic/AdoptProposals.tsx:60, :98-99, :113-125)
- [ ] Coverage + Adopt cards withheld in the every-dataset view (multi-schema connection with "All schemas") — not said on screen (components/MetricsPanel.tsx:1299, :1302)
- [ ] Bind roles: "Not read just now: the package, the current binding, …" / "Reading the package and this connection's tables…" / "nothing proposed — <why>" / "No <type> column on <table>…" / "<metrics> can't be bound to this data as it stands — write its SQL over your own columns instead." / "Bound and checked — every chosen column answered." / "Saved, but not every column answered when checked — …" / "The binding could not be saved." ; Bind disabled tooltip "Choose a table and every column for at least one role first" (components/semantic/BindRoles.tsx:123-201)
- [ ] Annotations: "Loading tables…" / "Could not read the annotations — …" + Retry / "No annotations for <table> yet." / "No annotations yet." / "no description of the table" / "Table name is required" / "Description is required" (components/SemanticLayerPanel.tsx:250-262, :207-208)
- [ ] Knowledge: "Loading glossary entries…" / "Could not read the knowledge entries — …" + Retry / "No knowledge entries yet." / "Title and body are required" / "Re-indexed N entries." (components/SemanticLayerPanel.tsx:401-404, :361, :384)
- [ ] Missed questions: "Loading missed questions…" / "Could not read the missed questions — …" + Retry / "No question missed every declared term — this connection declares no business rule or process stage, so none is counted." / aged-out row "What was asked is no longer kept: the session log keeps a run's question for a while, and these runs have aged out of it." / success "“word” now means <term>: the next question worded so is framed on it." (components/semantic/MissedQuestions.tsx:137-156, :174)
- [ ] Add a synonym: "Could not read the terms this connection declares — …" + Retry / "Loading declared terms…" / "This connection declares nothing a word can name yet — no rule, process stage, metric or entity." / metric-entity caveat / "The near-match finder would offer … It frames nothing by itself; the choice is yours." (components/semantic/MissedQuestions.tsx:243-274)
- [ ] Benchmarks: "Loading test questions…" / "Could not read the benchmark questions — …" + Retry / "No questions yet." / "Question is required" (components/SemanticLayerPanel.tsx:576-579, :503)
- [ ] Import intro: "Bring knowledge in from files, sheets, wikis or usage. Nothing lands until you accept it, and each accept goes through its store's own governance." (components/intake/IntakePanel.tsx:584-587)
- [ ] Import doors: "Working…", "This exact content was imported before — showing the existing plan.", "Staged. Review the plan below.", "“<file>” staged…", "Mined. Review the plan below." / "Nothing minable yet.", "N page(s) staged, N unchanged, N without a dictionary table.", "Extracted. Review the plan below." / "The model extracted nothing it could state as a fact.", "This is the lane's only model-spending door, and only this button presses it." (components/intake/IntakePanel.tsx:333-335, :367, :422-423, :448, :466-467, :474-475, :484-486)
- [ ] Import refused rows: "N rows could not be taken and were refused at the door:" + up to 5 + "…and N more" (components/intake/IntakePanel.tsx:591-600)
- [ ] Imports empty: "Nothing imported yet — pick a door above to stage your first plan." ; "Select an import to review its plan." (components/intake/IntakePanel.tsx:612-616, :637-641)
- [ ] Candidate apply error: "Could not apply — <reason>. It stays pending; edit it and try again." ; JSON "Not valid JSON yet." / "An edited object is accepted with your version." ; "One of your edits is not valid JSON — fix or discard it first." (components/intake/IntakePanel.tsx:183-187, :205-207, :555)
- [ ] "Every decision on this import is made." (components/intake/IntakePanel.tsx:690-694)
- [ ] Provenance trail: "…" / "trail unavailable" / "no trail recorded" (components/intake/IntakePanel.tsx:235-239)

### 7. Loads on open (API calls; flag WRITES / SPENDS)
**Panel (any tab)**
- [ ] GET `/connections/{id}/schema/rich` via `useRichSchema` (shared cache) — feeds the Dataset/Table pickers. ⚠ SPENDS (warehouse): opens the connection, builds the schema on a server-cache miss and reads declared FK metadata (components/SemanticLayerPanel.tsx:730; lib/schema-context.tsx:54; pramanyx/routers/connections.py:557-588)

**Metrics tab (landing)**
- [ ] GET `/metrics?connection…` (registry) (components/MetricsPanel.tsx:777; lib/api.ts:1218)
- [ ] GET `/metrics/catalogue/{conn}?schema=` (computed catalogue; read) (components/MetricsPanel.tsx:783; pramanyx/routers/metrics.py:158)
- [ ] GET `/metrics/coverage/{conn}?schema=` — then, if any area is "not checked", AGAIN with `figures=true`. ⚠ SPENDS (warehouse): reads each uncached approved metric's last six months of figures (in-process cache, ≤hourly). Only when a single dataset is in view (components/semantic/CoverageCard.tsx:76-89; pramanyx/semantic/metric_coverage.py:214-242)
- [ ] (Read on interaction, not open) opening a defined row: POST `/metrics/proposals` debounced 250ms on every SQL/tables/filters/name edit — POST but read-only (profile cache, no warehouse, no write) (components/MetricsPanel.tsx:732-752; pramanyx/routers/metrics.py:516)
- [ ] Approval view open: GET `/metrics/{name}/audit` (components/MetricsPanel.tsx:474) and GET `/metrics/{name}/definition-report` — ⚠ SPENDS (warehouse): opens the connection and executes the definition ("Whether it runs"); fetched for every state since every state has a next action (components/MetricsPanel.tsx:485-494; pramanyx/routers/metrics.py:1068-1112; pramanyx/semantic/definition_report.py:243-261)
- [ ] Measures view open: GET `/ontology/keys` (read-only, no model/warehouse) (components/MetricsPanel.tsx:182-185; pramanyx/routers/ontology.py:764)
- [ ] Adopt "Choose and date them": POST `/metrics/proposals` per proposal (read-only) (components/semantic/AdoptProposals.tsx:43-58)
- [ ] Bind roles dialog open: GET `/packs/{id}`, GET `/packs/{id}/binding`, GET `/connections/{id}/schema/rich`, POST `/packs/{id}/propose-bindings` — ⚠ SPENDS (warehouse): propose-bindings opens the connection and builds a schema context (components/semantic/BindRoles.tsx:51-68; pramanyx/routers/packs.py:222-274)
- [ ] On click only — ⚠ SPENDS model: "Generate from the definition" (POST `/metrics/generate-sql`), "Write from the knowledge base" (POST coverage/write, N calls); ⚠ SPENDS warehouse: "Validate now" (POST validate), "Check freshness" (GET freshness), Bind (POST `/packs/{id}/bind`, dry run); ⚠ WRITES: create/update/delete/transition/promote/materialise/remove/restore/adopt/entity/dates, "Propose by code" (POST coverage/run) (lib/api.ts:1327-1700; components/MetricsPanel.tsx:702-968)

**Annotations tab**
- [ ] GET `/semantic/{conn}/annotations` (components/SemanticLayerPanel.tsx:169)

**Knowledge tab**
- [ ] GET `/semantic/{conn}/knowledge` (components/SemanticLayerPanel.tsx:347)
- [ ] GET `/framing/misses?connection_id=` (read) (components/semantic/MissedQuestions.tsx:111; pramanyx/routers/ontology.py:4855)
- [ ] GET `/ontology?connection_id=` (declared terms, the served graph) (components/semantic/MissedQuestions.tsx:115; lib/api.ts:1109)
- [ ] On click: POST rebuild-index (⚠ WRITES index), PUT `/ontology/vocabulary/key` (⚠ WRITES synonym), knowledge POST/PUT/DELETE

**Benchmarks tab**
- [ ] GET `/semantic/{conn}/benchmarks` (components/SemanticLayerPanel.tsx:495)
- [ ] On click "Run all": POST `/semantic/{conn}/benchmarks/run` — ⚠ SPENDS model (1 call per question) + warehouse (components/SemanticLayerPanel.tsx:532)

**Import tab**
- [ ] GET `/intake/bundles?connection_id=` (components/intake/IntakePanel.tsx:509)
- [ ] GET `/connections` (to find Confluence/Notion wiki connections) (components/intake/IntakePanel.tsx:520)
- [ ] Prose door selected: GET `/intake/mapper-stats` (components/intake/IntakePanel.tsx:322-325)
- [ ] Opening a bundle: GET `/intake/bundles/{id}` ; accepted rows: GET `/intake/provenance?ref=` each (components/intake/IntakePanel.tsx:528, :227)
- [ ] On click: ⚠ SPENDS model "Extract with the model — one call" (POST `/intake/prose`); ⚠ WRITES every stage/mine/resolve door (components/intake/IntakePanel.tsx:366-473, :558)

Top rows today: one row — the panel's tab strip (Metrics · Annotations · Knowledge · Benchmarks · Import) with the scope pickers trailing right (Connection › Dataset when >1 schema › Table on Annotations only); below it each tab's first Card header carries its count and actions — Metrics: Figures row then Needs you, and "N apply" + "Add metric" on the Metrics card (Coverage "Propose by code"/"Write from the knowledge base" and Adopt "Choose and date them" sit on their own cards above it); Annotations: "N tables · N columns" + "Add annotation"; Knowledge: "N entries" + "Add entry" + Tools ▾ (Rebuild the search index); Benchmarks: "N questions" + "1 model call per question" chip + "Add question" + "Run all"; Import: no header actions — the door button row (File · Paste · Google Sheet · Mine usage · Mine a wiki · Prose) and the Imports rail's "Export".

---

## Ontology

One page in two parts: A is the page itself (bar, sub-views, map, rail, drawers); B is the detail panels and full-area designers the map opens.

### Part A — shell, views, map, drawers
Entry: rail row "Ontology" → `?tab=ontology` resolves to tab `intelligence`, layer `ontology` (app/page.tsx:947); rendered by `IntelligenceWorkspace` (components/IntelligenceWorkspace.tsx:290) as `<OntologyPanel connectionId onInvestigate schema/>` (components/OntologyPanel.tsx:546). Body is `EntityTypeMap` (components/ontology/EntityTypeMap.tsx:155) in Connection/Domain mode, `OntologyOrgCanvas` (components/OntologyOrgCanvas.tsx:168) in Org mode. The right-hand entity panel (`EntityTypePanel`), `ProcessPanel`, `ProcessDesigner` and `ActionDesigner` are inventoried separately; only their doors are listed here.

#### 1. Controls

**Shared Intelligence header (context bar above every Intelligence layer)**
- [ ] Connection select ("Connection") — switches the active connection for every Intelligence layer; lists only briefings-enabled connections; shown only when >1 (components/IntelligenceWorkspace.tsx:204)
- [ ] Schema scope select ("Schema") — picks the schema every layer reads; remembered per connection in localStorage; shown only when the connection has >1 schema (components/IntelligenceWorkspace.tsx:221)
- [ ] Layer tab strip (Briefing · Dashboards · Profile · Ontology · Graph · Evidence · Memory · Actions · Org · Brain map) — HIDDEN on the main screen (`hideTabs`, app/page.tsx:2158); shown only when a Data Canvas embeds the workspace (components/Workspace.tsx:81)

**Ontology bar (OntologyPanel header)**
- [ ] "Which ontology" segmented: Org — switches body to the organisation board of every connection·schema (components/OntologyPanel.tsx:614)
- [ ] "Which ontology" segmented: Domain — switches body to the organisation's ontology map (types declared on any connection) (components/OntologyPanel.tsx:619)
- [ ] "Which ontology" segmented: Connection — the selected connection·schema's map (default) (components/OntologyPanel.tsx:621)
- [ ] "{N} to approve" (amber) — opens the rail's Explorer draft with its proposals listed and scrolls it into view; shown when an explorer's proposals wait (components/OntologyPanel.tsx:665)
- [ ] Release chip / "Release N · {date} · K to publish" button — toggles the release strip open (amber button only when changes wait; otherwise a static gray tag) (components/ontology/ReleaseStrip.tsx:148)
- [ ] "Tools ▾" menu trigger — opens the tools menu; hidden in Org/Domain modes and when no graph loaded (components/OntologyPanel.tsx:673)
- [ ] Tools › "Find duplicates" — toggles the Possible-duplicates drawer (components/OntologyPanel.tsx:680)
- [ ] Tools › "Human edits" — toggles the Human-edits (overrides) panel (components/OntologyPanel.tsx:683)
- [ ] Tools › "Proposals" — toggles the Proposals review drawer (components/OntologyPanel.tsx:687)
- [ ] Tools › "Learned skills" — toggles the Learned-skills drawer (components/OntologyPanel.tsx:691)
- [ ] Tools › "Reads by entity" — toggles the Reads · 30 days drawer (components/OntologyPanel.tsx:695)
- [ ] Tools › "Settings" (after a separator) — toggles the Ontology Settings drawer (components/OntologyPanel.tsx:700)
- [ ] Picking an already-open tool again closes it; only one drawer open at a time (components/OntologyPanel.tsx:605)

**Release strip (opens under the bar from the release chip)**
- [ ] "Review the changes" / "Hide the changes" — expands/collapses the list of waiting changes (components/ontology/ReleaseStrip.tsx:166)
- [ ] "Discard all" — discards every waiting change (POST, no confirmation) (components/ontology/ReleaseStrip.tsx:169)
- [ ] "Publish" — publishes the draft as the next release; disabled while any change "breaks something", tooltip says how many (components/ontology/ReleaseStrip.tsx:170)
- [ ] "Close" — closes the strip (shown only once no changes wait, e.g. right after a publish) (components/ontology/ReleaseStrip.tsx:176)
- [ ] Per-change "Discard" — discards that one change (components/ontology/ReleaseStrip.tsx:65)

**Empty/error state door**
- [ ] "Build the ontology for {schema}" / "Build the ontology" — opens the Settings drawer (where the rebuild button is) (components/OntologyPanel.tsx:797)

**Ontology Settings drawer**
- [ ] Close (×) (components/OntologyPanel.tsx:118)
- [ ] Auto-refresh interval: "Off" / "Daily" / "Every 2d" / "Weekly" — saves `ontology_refresh_hours` on the connection (PUT) (components/OntologyPanel.tsx:134)
- [ ] "Rebuild ontology now" / "Rebuilding…" — rebuilds the ontology (POST; profiles the warehouse + a model call to enrich), then re-reads the graph (components/OntologyPanel.tsx:174)

**Possible duplicate entities drawer**
- [ ] Close (×) (components/OntologyPanel.tsx:260)
- [ ] "Merge all into" buttons, one per entity name ("Merging…") — merges the cluster into the chosen survivor; others become its parts (POST, no confirmation) (components/OntologyPanel.tsx:295)
- [ ] "why they are different (optional)" text input, per cluster (components/OntologyPanel.tsx:303)
- [ ] "Not duplicates" — records the rejection with the reason; pair is not suggested again (components/OntologyPanel.tsx:310)
- [ ] "Reconsider" — takes back an earlier rejection (DELETE) (components/OntologyPanel.tsx:325)

**Proposals drawer**
- [ ] Close (×) (components/OntologyPanel.tsx:391)
- [ ] "Accept" — accepts a metric-gap / column-note / table-note proposal into the ontology (components/OntologyPanel.tsx:430)
- [ ] "Dismiss" — dismisses the proposal (components/OntologyPanel.tsx:439)

**Learned skills drawer**
- [ ] Close (×) (components/OntologyPanel.tsx:491)
- [ ] "Use" ("…" while busy) — records a use of the skill (feeds earned autonomy) (components/OntologyPanel.tsx:529)
- [ ] "Delete" — deletes the learned skill (DELETE, no confirmation) (components/OntologyPanel.tsx:533)

**Human edits panel (overrides)**
- [ ] "Close" (components/ontology/OverridesDrawer.tsx:67)
- [ ] Routing proposal "Accept" — the only path from proposed to enforced routing; disabled when the table did not bind (components/ontology/OverridesDrawer.tsx:87)
- [ ] Override "Revert" — deletes the human override; auto-derived value returns (DELETE, no confirmation) (components/ontology/OverridesDrawer.tsx:116)
- [ ] "Export to files" — writes the live ontology as a YAML tree on the server (POST) (components/ontology/OverridesDrawer.tsx:139)
- [ ] "Re-import edits" — re-imports the YAML tree; changed fields become overrides (POST) (components/ontology/OverridesDrawer.tsx:146)

**Reads by entity drawer**
- [ ] Close (×) (components/ontology/ReadsDrawer.tsx:63)

**Entity-type rail (left of the map)**
- [ ] "Find an entity type" search — filters types and parts by display name, object type, id or table (components/ontology/EntityTypeMap.tsx:417)
- [ ] Type row — lights the type on the map and opens it in the entity panel (EntityTypePanel) (components/ontology/EntityTypeMap.tsx:368)
- [ ] Part row (under "Parts") — opens a type folded into a parent; its parent's card lights (components/ontology/EntityTypeMap.tsx:368)
- [ ] Process row (under "Processes") — opens the process in the right panel (ProcessPanel) and lights its entity (components/ontology/EntityTypeMap.tsx:469)
- [ ] "+ New process" — opens the ProcessDesigner over the whole map area; hidden in Domain mode (components/ontology/EntityTypeMap.tsx:484)
- [ ] "+ New action" (under "Actions") — opens the ActionDesigner over the whole map area; hidden in Domain mode (components/ontology/EntityTypeMap.tsx:491)
- [ ] Rule row (under "Rules") — opens the entity the rule is a segment of (components/ontology/EntityTypeMap.tsx:498)

**Explorer draft (rail; Connection mode only)**
- [ ] "Draft the business" / "Draft again" / "Drafting…" — asks an explorer to propose entities, parts, links, processes and rules (one model call; each claim measured on the data) (components/ontology/EntityTypeMap.tsx:583)
- [ ] "Confirm {N}" / "Confirming…" — confirms every proposal still the model's (components/ontology/EntityTypeMap.tsx:589)
- [ ] "Review" / "Hide" — shows/hides the proposal list (components/ontology/EntityTypeMap.tsx:595)
- [ ] Per-proposal "Confirm" (tier proposed only) — confirms one proposal (components/ontology/EntityTypeMap.tsx:607)
- [ ] Per-proposal "Open" — opens the proposal's type in the panel (not for refused/withdrawn) (components/ontology/EntityTypeMap.tsx:613)

**Declare an entity (rail foot; also inside the Domain empty state)**
- [ ] "+ New entity" — opens the declare form (components/ontology/EntityTypeMap.tsx:676)
- [ ] "Id — PascalCase, e.g. PurchaseOrder" input (validated ^[A-Z][A-Za-z0-9]{0,63}$) (components/ontology/EntityTypeMap.tsx:693)
- [ ] "Display name" input (components/ontology/EntityTypeMap.tsx:695)
- [ ] "connection…" select — the connection holding the rows (Domain mode only) (components/ontology/EntityTypeMap.tsx:699)
- [ ] "schema" input (Domain mode, table source only) (components/ontology/EntityTypeMap.tsx:705)
- [ ] Source kind select: "table" / "SELECT" (components/ontology/EntityTypeMap.tsx:711)
- [ ] Table name / "SELECT … one row per object" input (components/ontology/EntityTypeMap.tsx:716)
- [ ] "Key column" input (components/ontology/EntityTypeMap.tsx:721)
- [ ] "Domain (optional)" input (components/ontology/EntityTypeMap.tsx:723)
- [ ] "Declare" / "Declaring…" — declares the entity (server reads columns and counts the key first); selects the new type (components/ontology/EntityTypeMap.tsx:726)
- [ ] "Cancel" — closes the form (components/ontology/EntityTypeMap.tsx:729)

**Entity-type map canvas (React Flow, Connection/Domain modes)**
- [ ] Click a card — selects the type, lights its links and neighbours, opens it in the entity panel (components/ontology/EntityTypeMap.tsx:962)
- [ ] Drag a card — moves it; drop saves the arrangement per connection·schema (localStorage + per-user preference) (components/ontology/EntityTypeMap.tsx:963)
- [ ] Pan (drag background) / scroll-wheel zoom / double-click zoom — React Flow defaults, zoom 0.2–2, fit-to-view on load (components/ontology/EntityTypeMap.tsx:964)
- [ ] Controls: zoom in, zoom out, fit view (lock toggle hidden) (components/ontology/EntityTypeMap.tsx:973)
- [ ] "Reset arrangement" (top-right, only once a card was moved) — puts every card back to the computed layout (components/ontology/EntityTypeMap.tsx:976)
- [ ] (No minimap, no legend on this canvas.) (components/ontology/EntityTypeMap.tsx:956)

**Right-hand panel and full-area designers (doors only; insides inventoried separately)**
- [ ] EntityTypePanel — always open beside the map for the selected type (defaults to the hub type); its "design process"/"design action" doors open the designers below (components/ontology/EntityTypeMap.tsx:312)
- [ ] ProcessPanel — replaces the entity panel when a process row is picked; its "change process" opens ProcessDesigner in edit mode (hidden in Domain mode) (components/ontology/EntityTypeMap.tsx:308)
- [ ] ProcessDesigner — takes the whole map's place (from "+ New process", entity panel, or process panel); Close returns to the map (components/ontology/EntityTypeMap.tsx:269)
- [ ] ActionDesigner — takes the whole map's place (from "+ New action" or the entity panel) (components/ontology/EntityTypeMap.tsx:259)

**Org board (Org mode)**
- [ ] Zoom "−" — zoom out by 5% (min 15%) (components/OntologyOrgCanvas.tsx:250)
- [ ] Zoom "+" — zoom in by 5% (max 150%) (components/OntologyOrgCanvas.tsx:255)
- [ ] ⌘/Ctrl-wheel or trackpad pinch — zoom to cursor; plain scroll pans (components/OntologyOrgCanvas.tsx:182)
- [ ] Cluster label "{connection} · {schema} {TYPE} {N entities}" — opens that connection in Connection mode (schema stays the workspace's scope) (components/OntologyOrgCanvas.tsx:105)
- [ ] Click an entity pill — selects/deselects it; neighbours stay lit, the rest dim (components/OntologyCanvas.tsx:990)
- [ ] Hover an entity pill — dims non-neighbours, lights its links (components/OntologyCanvas.tsx:991)
- [ ] Drag an entity pill — moves it; position saved per cluster in localStorage (components/OntologyCanvas.tsx:355)
- [ ] Hover a link — highlights it and shows its verb label and cardinality badge (components/OntologyCanvas.tsx:623)

**Inside the entity panel — SourceMapping (rendered by EntityTypePanel's Sources tab; TypeOverview is listed in part B)**
- [ ] Source mapping: click a column row — selects the property read from it (components/ontology/SourceMapping.tsx:115)
- [ ] Source mapping: click a property row — selects/deselects it and opens its inspector (components/ontology/SourceMapping.tsx:149)

#### 2. Dialogs, drawers, popovers, panels
- [ ] Tools dropdown menu — six items listed above (components/OntologyPanel.tsx:679)
- [ ] Release strip (inline full-width line under the bar) — "Everyone reads release N…" / "N changes waiting to be published — the agent, the Briefing and automations still read release N.", Review/Discard all/Publish, change list (components/ontology/ReleaseStrip.tsx:157)
- [ ] Release change row — class tag, "{kind} {target_id} — {change}", "by {who}", reasons (red for breaking), "Touches N claims · N automations · N dashboard cards · N approved metrics · N dashboards: {names} — “{titles}” — publishing restates the claims" (components/ontology/ReleaseStrip.tsx:51)
- [ ] Ontology Settings drawer (right, 288px) — Auto-refresh interval, Last built, Manual rebuild (components/OntologyPanel.tsx:115)
- [ ] Possible duplicate entities drawer (right, 340px) — cluster cards (entities + source tables, similarity, merge-into buttons, reason + Not duplicates), "Judged different earlier" list (components/OntologyPanel.tsx:257)
- [ ] Proposals drawer (right, 340px) — pending proposals with kind tag, target, note/reason, evidence, Accept/Dismiss (components/OntologyPanel.tsx:385)
- [ ] Learned skills drawer (right, 340px) — autonomy level line, skill cards with SQL template, parameters, Use/Delete (components/OntologyPanel.tsx:488)
- [ ] Human edits panel — an absolutely-positioned overlay (top-right, 460px), not a side drawer: routing proposals, overrides list, version control (components/ontology/OverridesDrawer.tsx:59)
- [ ] Reads by entity drawer (right, 400px) — every entity ranked least-read-first over 30 days (components/ontology/ReadsDrawer.tsx:54)
- [ ] Explorer draft review list (inline in the rail, max 260px scroll) — each proposal's tier, sentence and reason (components/ontology/EntityTypeMap.tsx:600)
- [ ] Declare-entity form (inline in the rail) (components/ontology/EntityTypeMap.tsx:684)
- [ ] Source-mapping inspector card (inside entity panel) — Property, Display name, Kind, Read from, Role, Marks, Empty %, About (components/ontology/SourceMapping.tsx:163)
- [ ] VisibilityLine tooltip — "{mapped} of {in_scope} tables mapped to business objects · not yet: …" and "held sends by missing definition: …" (components/VisibilityLine.tsx:26)
- [ ] Not on this page: MetricProvenancePanel ("in use", verified/unverified, certified source, N uses, formula, source · author · date, other definitions, known divergent calculations) is reachable only from "Why this number" in Chat, the SQL editor and /receipt/{id} (components/ontology/MetricProvenance.tsx:61)
- [ ] Not reachable anywhere: `OntologyCanvas` main export (tidy, zoom −/+/100%, legend "reference data / business object / event / inferred / verified", per-entity "Investigate →") is mounted by no screen; only its `EntityCluster` is reused by the Org board (components/OntologyCanvas.tsx:1012)

#### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Maturity marker (context bar) — "Maturity" bars + stage ("off for analysis" / stage) + " · layer not set" (components/DatasetProgram.tsx:367)
- [ ] Schema scope tag `{schema}` (Connection mode) (components/OntologyPanel.tsx:629)
- [ ] Facts: "{N} entities · {N} links · {N} processes · {N} rules" (tooltip "described / not yet described in business terms") (components/OntologyPanel.tsx:637)
- [ ] Tag "not yet described in business terms" (components/OntologyPanel.tsx:656)
- [ ] Release chip "Release N · {day month}" / "No release yet"; tooltip "Everyone reads release N, published {time}." (components/ontology/ReleaseStrip.tsx:145)
- [ ] Release button "{name} · {K} to publish" (amber) (components/ontology/ReleaseStrip.tsx:153)
- [ ] Release status line "Published release N — K claims restated" / "Discarded N changes" / "Discarded the change to X" (components/ontology/ReleaseStrip.tsx:132)
- [ ] Change class tags: "breaks something" (red) / "changes a meaning" (amber) / "worth a look" (violet) / "safe" (gray) (components/ontology/ReleaseStrip.tsx:30)
- [ ] VisibilityLine chip — the server's one-sentence visibility line, emphasised when the band is red (components/VisibilityLine.tsx:33)
- [ ] "{N} to approve" button count (components/OntologyPanel.tsx:669)
- [ ] Rail count "{N} types" / "{M} of {N} types" · "{K} parts" (components/ontology/EntityTypeMap.tsx:419)
- [ ] Rail row: kind square, name, row count (or "—", tooltip "its rows are not counted") (components/ontology/EntityTypeMap.tsx:377)
- [ ] Rail row key mark: "✓ key" (green) / "● key not unique" (red) / "● key not counted" (amber) · "{N} links" · "{N} parts" (components/ontology/EntityTypeMap.tsx:324)
- [ ] Rail row "· ● {N} proposed" (violet) (components/ontology/EntityTypeMap.tsx:402)
- [ ] Rail row "on {connection}" (Domain mode) (components/ontology/EntityTypeMap.tsx:388)
- [ ] Process row: "{entity} · {N} stages · {promise} {x.xx}% broken | not counted" (red when refuted) (components/ontology/EntityTypeMap.tsx:475)
- [ ] Rule row: "{entity} · admits {N} | not counted · scopes … · {N} flagged" (components/ontology/EntityTypeMap.tsx:502)
- [ ] Explorer draft counts "{N} proposed · {N} confirmed · {N} refused · {N} withdrawn" (tooltip: provenance, fallback, time) (components/ontology/EntityTypeMap.tsx:570)
- [ ] Proposal tier tags: proposed / confirmed / refused / released / withdrawn (components/ontology/EntityTypeMap.tsx:605)
- [ ] Map card: name, physical table (mono, when different), "proposed" / "{N} proposed" tag, "on {source} · key unique|key not unique|key unmeasured · {T} of {L} links · {N} parts" (components/ontology/EntityTypeMap.tsx:741)
- [ ] Map card states: picked (blue ring), unlit (faded to 38%) (components/ontology/EntityTypeMap.tsx:743)
- [ ] Map link label (picked type's links only): "{verb} · {cardinality} · via {part} · cross-source · proposed · carries {promises/impacts/stages}" (components/ontology/EntityTypeMap.tsx:905)
- [ ] Map link styling: amber dashed = compiler refuses; violet = proposed by the model; dotted = cross-source; blue = followed (components/ontology/EntityTypeMap.tsx:900)
- [ ] Settings: "Refreshes every {h}h" (components/OntologyPanel.tsx:152)
- [ ] Settings: "Last built" timestamp (components/OntologyPanel.tsx:161)
- [ ] Settings: "Rebuilt — {N} entities. {warning}" (green) or error (red) (components/OntologyPanel.tsx:187)
- [ ] Duplicates: "{N} entities", "similarity {x}%", entity "(source tables)", "Already judged different: a ≠ b", "a ≠ b — reason (by)" (components/OntologyPanel.tsx:277)
- [ ] Proposals: "{N} awaiting review", kind tag (metric gap / column note / table note), "{entity}.{column}", "seen ×{N}", "evidence · … · confidence {x}" (components/OntologyPanel.tsx:389)
- [ ] Skills: "autonomy L{n} · {label} — {reason}", "{action_type} · used {N}×", `{param}` chips (components/OntologyPanel.tsx:497)
- [ ] Human edits: "{N} overrides on this scope", target kind/id, "overrides: {fields}", "did not bind — the table it names is unreadable" (components/ontology/OverridesDrawer.tsx:102)
- [ ] Reads drawer: "Reads · {N} days", per entity "{N} reads" / "not counted", "part" tag, "{tables} · last read {day} | not read in {N} days · {N} readers · {N} with no reader recorded", "Shared table: …", footer "Counted from {source}…" (components/ontology/ReadsDrawer.tsx:60)
- [ ] Org board overlay: "Organization Ontology", "{N} connections · {N} schemas · drag nodes · pinch to zoom", zoom "%" (components/OntologyOrgCanvas.tsx:244)
- [ ] Org cluster label: connection, schema, connection-type tag, "{N} entities" (components/OntologyOrgCanvas.tsx:111)
- [ ] Org entity pill: type-colour dot (reference/event/standalone/object), name, actions+metrics count (components/OntologyCanvas.tsx:412)
- [ ] Org link hover: verb label + cardinality badge; verified links green, inferred blue, animated flow (components/OntologyCanvas.tsx:682)
- [ ] Source mapping: column type squares, "not read", property marks (key, display), "= expression / a rollup / a frame / edits / via {binding} / not read here", footer "{N} of {M} properties are read from {table}…" (components/ontology/SourceMapping.tsx:118)

#### 4. Keyboard shortcuts
- [ ] None registered by Pramanyx code on this page (no Escape-to-close on drawers, no global keys) (components/OntologyPanel.tsx:546)
- [ ] Source mapping rows: Enter / Space select a column or property (components/ontology/SourceMapping.tsx:83)
- [ ] Tools menu: Radix DropdownMenu arrow keys / Enter / Esc (library default) (components/OntologyPanel.tsx:673)
- [ ] Map canvas (React Flow 12 defaults, not handled by Pramanyx): Backspace removes a selected card from the canvas view locally (no server write; returns on next read); Shift-drag box-select; ⌘/Ctrl-click multi-select; arrow keys nudge a selected card (not saved — only drag-stop saves) (components/ontology/EntityTypeMap.tsx:956)
- [ ] Org board: ⌘/Ctrl + wheel and trackpad pinch zoom (lib/useWheelZoom.ts:29)

#### 5. URL params / deep links
- [ ] `?tab=ontology` → Intelligence workspace, Ontology layer (app/page.tsx:947)
- [ ] `?tab=intelligence&layer=ontology` — shell reads and writes the layer (app/page.tsx:1243)
- [ ] `?conn={id}` — the selected connection, read and written by the shell (app/page.tsx:1232)
- [ ] Record's "open map" door navigates here (app/page.tsx:1990)
- [ ] Not in the URL (lost on reload): schema (kept in localStorage `pramanyx_schema_choice:{conn}`, lib/schemaChoice.ts:12), Org/Domain/Connection mode, open drawer, selected type, open process, designer (components/OntologyPanel.tsx:553)
- [ ] Map arrangement persisted in localStorage `ont-map-layout` and per-user preference `ontology_map_layout` (components/ontology/EntityTypeMap.tsx:93)
- [ ] Org board pill positions persisted in localStorage `ont-pos:{conn}:{schema}` (components/OntologyCanvas.tsx:826)

#### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] Loading: "Reading the ontology…" (components/OntologyPanel.tsx:746)
- [ ] Not built (server 404 detail): "No ontology built for schema 'x'. Built for: a, b." / "No ontology has been built for this connection yet." (components/OntologyPanel.tsx:593)
- [ ] Fallback texts: "Loading the ontology…" / "Finding your connection…" / "No ontology data available." (components/OntologyPanel.tsx:780)
- [ ] Other schemas built: "Built for {schemas} — switch the schema scope above to see one of those." (components/OntologyPanel.tsx:790)
- [ ] In the not-built state the Tools menu, release chip and facts are absent; the only door is "Build the ontology" (components/OntologyPanel.tsx:672)
- [ ] Map read failed: "The entity-type map could not be read" + error + "Try again" (components/ontology/EntityTypeMap.tsx:234)
- [ ] Map loading: skeleton rows (components/ontology/EntityTypeMap.tsx:240)
- [ ] Empty map (Connection): "This ontology has no entities yet." — no rail, so no New entity / Draft the business door here (components/ontology/EntityTypeMap.tsx:246)
- [ ] Empty map (Domain): "Nothing is declared in the organisation's ontology yet — Declare a type on any connection: its rows are read and its key counted there before anything is written." + declare form (components/ontology/EntityTypeMap.tsx:249)
- [ ] Rail search no match: "No type matches “{q}”." (components/ontology/EntityTypeMap.tsx:425)
- [ ] Explorer draft before any run: "An explorer reads these tables and proposes the business… One model call. Every claim is measured before it lands and stays proposed until you confirm it." (components/ontology/EntityTypeMap.tsx:577)
- [ ] Explorer/declare errors shown inline in red (refused confirmations joined "why; why") (components/ontology/EntityTypeMap.tsx:627)
- [ ] Release strip: read error shown inline in red beside the chip; strip renders nothing until read (components/ontology/ReleaseStrip.tsx:109)
- [ ] Publish disabled tooltip: "{N} changes would break something — discard or fix first" (components/ontology/ReleaseStrip.tsx:171)
- [ ] VisibilityLine renders nothing while loading or on failure ("say nothing rather than guess") (components/VisibilityLine.tsx:24)
- [ ] Duplicates: "Scanning for duplicates…" / "Couldn't load duplicate suggestions." / "No new duplicates: N suggestions you rejected earlier stay hidden." / "No likely duplicates found. (Detection uses embeddings; if none are configured it returns nothing.)" (components/OntologyPanel.tsx:265)
- [ ] Proposals: loading / "Couldn't load proposals." / "Nothing awaiting review. Proposals appear here when the engine notices a recurring metric gap, or when the conversation stages a note…" (components/OntologyPanel.tsx:396)
- [ ] Skills: loading / "Couldn't load learned skills." / "No learned skills yet. A skill is crystallized from a finished deep analysis… run a deep analysis, then “Save as skill”." (components/OntologyPanel.tsx:505)
- [ ] Human edits: "No human overrides yet — everything on screen is auto-derived. Editing an entity, relationship or metric inline writes one; it will be listed here, revertible."; routing-proposal read failures are swallowed silently (components/ontology/OverridesDrawer.tsx:41)
- [ ] Human edits notes: "Accepted — X's routing is now enforced." / "Reverted — the auto-derived value returns on the next read." / "Exported N files to {root}" / "Re-imported — changed fields are now overrides, listed above." (components/ontology/OverridesDrawer.tsx:90)
- [ ] Reads drawer: skeleton / error text / server "said" in amber / "This ontology has no entities yet." / "not counted" rows say why (components/ontology/ReadsDrawer.tsx:68)
- [ ] Org board: whole-board spinner; per cluster spinner; "no ontology yet" (components/OntologyOrgCanvas.tsx:142)
- [ ] Source mapping: "This binding reads a query; the picture needs a table." / "Reading the table’s columns…" / "The table lists no columns." (components/ontology/SourceMapping.tsx:104)
- [ ] Context bar while resolving: Briefing-only empty states; the Ontology layer itself renders without a schema until resolved (components/IntelligenceWorkspace.tsx:166)

#### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] Context bar: GET /ontology/schemas (components/IntelligenceWorkspace.tsx:160)
- [ ] Context bar (connection without a declared schema): GET /catalog/tree — SPENDS (warehouse metadata: lists every connection's schemas, opening each connector) (components/IntelligenceWorkspace.tsx:167)
- [ ] Context bar Maturity: GET /exploration/{conn}/datasets — SPENDS (warehouse metadata: schema listing via quick_schemas) (components/DatasetProgram.tsx:360)
- [ ] GET /ontology?ontology_view=draft — cache read, never builds (components/OntologyPanel.tsx:584)
- [ ] GET /object-types — cache read, "no warehouse query, no model call" (components/ontology/EntityTypeMap.tsx:197)
- [ ] GET /ontology/draft — explorer draft, no model, no warehouse (components/ontology/EntityTypeMap.tsx:214)
- [ ] GET /me/preferences — the person's saved map arrangement (components/ontology/EntityTypeMap.tsx:842)
- [ ] GET /ontology/release (components/ontology/ReleaseStrip.tsx:104)
- [ ] GET /visibility (components/VisibilityLine.tsx:20)
- [ ] Plus whatever EntityTypePanel loads for the auto-picked hub type (separate inventory) (components/ontology/EntityTypeMap.tsx:312)
- [ ] Domain mode: GET /object-types (domain scope), GET /connections (components/ontology/EntityTypeMap.tsx:188)
- [ ] Org mode: GET /catalog/tree — SPENDS (warehouse metadata for every connection), then one GET /ontology per connection·schema pair (N requests) (components/OntologyOrgCanvas.tsx:188)
- [ ] Settings drawer open: GET /connections/{id}/settings (components/OntologyPanel.tsx:86)
- [ ] Duplicates drawer open: GET /ontology/duplicate-entities — SPENDS (embedding model: embeds every entity on each open; empty if no embedder) (components/OntologyPanel.tsx:216)
- [ ] Proposals drawer open: GET /ontology/recommendations (components/OntologyPanel.tsx:362)
- [ ] Skills drawer open: GET /ontology/skills + GET /ontology/autonomy (components/OntologyPanel.tsx:467)
- [ ] Human edits open: GET /ontology/overrides + GET /ontology/routing-proposals (components/ontology/OverridesDrawer.tsx:39)
- [ ] Reads drawer open: GET /object-types/uses?window=30 — the platform's audit log, not the warehouse (components/ontology/ReadsDrawer.tsx:47)
- [ ] On action only (not on open): PUT /connections/{id}/settings; POST /ontology/rebuild — WRITES + SPENDS (warehouse profile + model enrich); POST /ontology/explore — WRITES + SPENDS (model + warehouse measurement); POST /ontology/draft/confirm; POST /ontology/entities — WRITES + SPENDS (warehouse: reads columns, counts key); POST /ontology/release/publish; POST /ontology/release/discard; POST /ontology/entities/merge; POST|DELETE /ontology/duplicate-entities/reject; POST /ontology/recommendations/{id}/accept|dismiss; POST /ontology/skills/{id}/use; DELETE /ontology/skills/{id}; POST /ontology/entities/{id}/routing-proposal/accept; DELETE /ontology/overrides/{kind}/{id}; POST /ontology/export; POST /ontology/import; PUT /me/preferences/ontology_map_layout on every card drop (lib/api.ts:1815)
- [ ] No call on open WRITES. (components/OntologyPanel.tsx:578)

Top rows today (part A, map view): (1) shared context bar — Connection select (>1 only), Schema select (>1 only), Maturity marker; (2) the Ontology bar — Org|Domain|Connection segmented, `{schema}` tag, facts (entities/links/processes/rules), Release chip/button, "not yet described in business terms" tag, VisibilityLine chip, then right-aligned "{N} to approve" and "Tools ▾" — with the release strip wrapping as a full-width line beneath it when opened; below that the map's left rail opens with the "Find an entity type" search, and "Reset arrangement" + zoom controls float on the canvas (Org board: title overlay top-left, −/%/+ top-right).

### Part B — entity type, process and action detail
Entry:
- **EntityTypePanel** (470px right panel beside the map) — rendered when a type is selected and no process is open (components/ontology/EntityTypeMap.tsx:312). Opened by picking a type on the rail/map, and from inside itself: a part, a link's other type, a path hop, a retiring successor, the part-of parent (`onOpen`).
- **ProcessPanel** (takes the entity panel's place, same 470px) — components/ontology/EntityTypeMap.tsx:308. Opened from the rail's process rows (EntityTypeMap.tsx:288), the entity panel's Processes-and-rules buttons (components/ontology/EntityTypePanel.tsx:515), the Overview funnel's "N overdue" / "Open" (components/ontology/TypeOverview.tsx:193, :199), and after an inline "Declare the process" (EntityTypePanel.tsx:597).
- **ProcessDesigner** (full page, replaces rail + map + panel) — components/ontology/EntityTypeMap.tsx:269. Opened by rail "New process" (EntityTypeMap.tsx:484), entity panel Properties → "Declare a process" while editing (EntityTypePanel.tsx:531), ProcessPanel "Change this process" (components/ontology/ProcessPanel.tsx:217 → EntityTypeMap.tsx:310). Never offered in an organisation (domain) ontology.
- **ActionDesigner** — two entry points: (a) Ontology, full page (components/ontology/EntityTypeMap.tsx:259), from rail "New action" (EntityTypeMap.tsx:491) or entity panel Actions tab → "Declare an action" (EntityTypePanel.tsx:2368); (b) Actions page, inline box under the Declared-actions ledger (components/DeclaredActionsPanel.tsx:257), from "New action" (DeclaredActionsPanel.tsx:245) — there it gets no `types` and no `schema`, reads the type map itself, breadcrumb drops "Ontology" (`within=""`).

#### 1. Controls
**EntityTypePanel — header (always)**
- [ ] Make a dashboard — opens the object-dashboard starter dialog; hidden for platform types and in an org ontology (components/dashboards/MakeDashboard.tsx:22, rendered components/ontology/EntityTypePanel.tsx:344)
- [ ] Edit / Done (toggle, aria-pressed) — shows/folds every writing door in all six tabs (components/ontology/EntityTypePanel.tsx:346)
- [ ] Part-of parent name — opens the parent type (components/ontology/EntityTypePanel.tsx:883)
- [ ] Release (edit) — stands this type on its own again (PUT absorbed_into "") (components/ontology/EntityTypePanel.tsx:886)
- [ ] Retiring successor name — opens the successor type (components/ontology/EntityTypePanel.tsx:2201)
- [ ] Take the mark off (edit) — removes the retiring mark (components/ontology/EntityTypePanel.tsx:2207)
- [ ] Mark retiring (edit, opener) — opens the retiring form (components/ontology/EntityTypePanel.tsx:2218)
- [ ] Retiring form: "use instead…" select — successor type (components/ontology/EntityTypePanel.tsx:2228)
- [ ] Retiring form: Retiring on (date input) (components/ontology/EntityTypePanel.tsx:2232)
- [ ] Retiring form: Note ("why, in a few words") (components/ontology/EntityTypePanel.tsx:2235)
- [ ] Retiring form: Mark retiring (save) (components/ontology/EntityTypePanel.tsx:2238)
- [ ] Retiring form: Cancel (components/ontology/EntityTypePanel.tsx:2243)
- [ ] Withdraw (edit, declared types only) — arms the two-click withdraw (components/ontology/EntityTypePanel.tsx:932)
- [ ] Withdraw (confirm) — deletes the declared type and its declared links (components/ontology/EntityTypePanel.tsx:926)
- [ ] Keep — disarms withdraw (components/ontology/EntityTypePanel.tsx:929)
- [ ] Tab strip: Overview (badge = needs count) · Properties n · Links n · Actions n · Sources n · History (components/ontology/EntityTypePanel.tsx:240, :371)

**EntityTypePanel — Overview tab**
- [ ] Needs you › proposed type: Confirm — makes an explorer's proposed type a person's (components/ontology/EntityTypePanel.tsx:405, button :968)
- [ ] Needs you › title not checked: Check — measures the ontology against the data, no model call (components/ontology/EntityTypePanel.tsx:416, button :467)
- [ ] Needs you › title: Change — jumps to Properties with Edit on (components/ontology/EntityTypePanel.tsx:417)
- [ ] Needs you › key not unique/not counted: Check (components/ontology/EntityTypePanel.tsx:426)
- [ ] Needs you › proposals waiting: Sources / Links — jump to that tab (components/ontology/EntityTypePanel.tsx:439, :440)
- [ ] Process funnel promise: "N overdue" / "Open" — opens the ProcessPanel (components/ontology/TypeOverview.tsx:193, :199)
- [ ] Used by: "Metric · name" buttons — jump to Properties (components/ontology/TypeOverview.tsx:259)
- [ ] Used by: action buttons (bolt) — jump to Actions (components/ontology/TypeOverview.tsx:265)
- [ ] Sets chips — hover shows description or refusal (display only) (components/ontology/TypeOverview.tsx:233)
- [ ] Depends on it: dashboard / dependent badges — hover says how it reads the type (components/ontology/TypeOverview.tsx:308, :318)

**EntityTypePanel — Properties tab**
- [ ] Key door (edit; not platform/org): column toggle buttons, several = composite key (components/ontology/EntityTypePanel.tsx:835)
- [ ] Use as the key / Use these N as the key — sets and measures the key (components/ontology/EntityTypePanel.tsx:840)
- [ ] Named by › Declare (select, edit) — writes the display property ON CHANGE (no save button) (components/ontology/EntityTypePanel.tsx:1086)
- [ ] Named by › Measure — counts keys/links/lifecycles/display props on the data (components/ontology/EntityTypePanel.tsx:1092)
- [ ] Properties table — hover a row for description / full source (components/ontology/EntityTypePanel.tsx:1216, :1235, :1244)
- [ ] Expressions › Remove (edit, per row) (components/ontology/EntityTypePanel.tsx:1173)
- [ ] Expressions › Declare an expression (edit, opener) (components/ontology/EntityTypePanel.tsx:1181)
- [ ] Expression form: name / SQL / role select (measure|dimension) / unit / Declare / Cancel (components/ontology/EntityTypePanel.tsx:1184, :1186, :1189, :1194, :1196, :1201)
- [ ] Processes and rules › process name buttons — open the ProcessPanel (components/ontology/EntityTypePanel.tsx:515)
- [ ] Declare a process (edit) — opens ProcessDesigner (components/ontology/EntityTypePanel.tsx:531); fallback inline form where no designer reaches (components/ontology/EntityTypePanel.tsx:606)
- [ ] Inline process form: id / display name / stage name / stage moment select / stage promise select (no promise|within days|within hours) / amount / Remove stage / Add a stage / Declare the process / Cancel (components/ontology/EntityTypePanel.tsx:621, :623, :628, :630, :636, :644, :650, :656, :659, :662)
- [ ] Declare a rule (edit, opener) (components/ontology/EntityTypePanel.tsx:716)
- [ ] Rule form: id / kind select (condition|value set) / property select / values (value set) / operator select (= != in not_in > >= < <= is_null not_null) / value / "scopes" metric checkboxes / Declare the rule / Cancel (components/ontology/EntityTypePanel.tsx:730, :732, :739, :747, :751, :756, :768, :776, :779)
- [ ] Words people use › "Key it to X" — keys a proposed word to the type/property (components/ontology/EntityTypePanel.tsx:2526)

**EntityTypePanel — Links tab**
- [ ] Parts › part name — opens the part type (components/ontology/EntityTypePanel.tsx:1011)
- [ ] Parts › Confirm (proposed part) (components/ontology/EntityTypePanel.tsx:1020)
- [ ] Parts › Release (edit) (components/ontology/EntityTypePanel.tsx:1025)
- [ ] Link › other type's name — lights it on the map and opens it (components/ontology/EntityTypePanel.tsx:1834)
- [ ] Link › Confirm (proposed link; not in org ontology) (components/ontology/EntityTypePanel.tsx:2326)
- [ ] Link › Name it / Rename (edit) — opens inline business-name editor (components/ontology/EntityTypePanel.tsx:1882)
- [ ] Link name editor: input / Save / Cancel (components/ontology/EntityTypePanel.tsx:1892, :1896, :1899)
- [ ] Link › Withdraw (edit; found links too) (components/ontology/EntityTypePanel.tsx:2277)
- [ ] Add a relationship (edit, opener; disabled with no other type) (components/ontology/EntityTypePanel.tsx:1944)
- [ ] Relationship form: verb / target type select / column on this type / column on the other / Declare / Cancel (components/ontology/EntityTypePanel.tsx:1954, :1956, :1963, :1966, :1968, :1971)
- [ ] Path to › target type select (components/ontology/EntityTypePanel.tsx:2593)
- [ ] Path to › Find paths (components/ontology/EntityTypePanel.tsx:2597)
- [ ] Path hop › to-type name — opens it (components/ontology/EntityTypePanel.tsx:2643)

**EntityTypePanel — Actions tab** (connection ontology only)
- [ ] Declare an action (edit) — opens ActionDesigner on this type (components/ontology/EntityTypePanel.tsx:2368)
- [ ] Open Actions (empty state) / Open in Actions — link to the Actions page (components/ontology/EntityTypePanel.tsx:2376, :2399)
- [ ] Moves the edit layer allows › Withdraw (edit, per property) (components/ontology/EntityTypePanel.tsx:2447)
- [ ] Declare how one may move (edit, opener) (components/ontology/EntityTypePanel.tsx:2472)
- [ ] Moves form: property / its states / moves textarea ("unset → flagged") / Declare the moves / Cancel (components/ontology/EntityTypePanel.tsx:2460, :2462, :2463, :2467, :2468)

**EntityTypePanel — Sources tab**
- [ ] Source mapping picture (primary binding's columns ↔ properties; click to highlight; inventoried by the sibling under SourceMapping) (components/ontology/EntityTypePanel.tsx:1562)
- [ ] Binding › Confirm (explorer-proposed binding; not in org) (components/ontology/EntityTypePanel.tsx:1568)
- [ ] Binding › Remove (edit, non-backing) (components/ontology/EntityTypePanel.tsx:1324)
- [ ] Proposed binding › Bind (components/ontology/EntityTypePanel.tsx:1389)
- [ ] Declare a binding (edit, opener) (components/ontology/EntityTypePanel.tsx:1650)
- [ ] Binding form: connection select + schema (org ontology only) / name / source kind (table|SELECT) / table or SELECT / key column / kind (static|timeseries|detail) / time column (timeseries) / Bind / Cancel (components/ontology/EntityTypePanel.tsx:1667, :1674, :1686, :1688, :1693, :1700, :1702, :1711, :1715, :1718)
- [ ] Binding form › frames (timeseries): property / shape select (average of last N, total to date, lowest/highest ever, how many readings, the reading before) / column / readings N / Remove / + Add a frame (components/ontology/EntityTypePanel.tsx:1728, :1731, :1741, :1745, :1749, :1754)
- [ ] Binding form › rollups (detail): property / agg select (sum, how many carry, average, lowest, highest) / column / Remove / + Add a rollup / "Fold that table's own type into X as a part" checkbox (components/ontology/EntityTypePanel.tsx:1768, :1771, :1779, :1782, :1787, :1793)
- [ ] Read from a SELECT / Edit its SELECT (edit, not org) (components/ontology/EntityTypePanel.tsx:1444)
- [ ] Read its table again — withdraws the SELECT backing (components/ontology/EntityTypePanel.tsx:1448)
- [ ] Backing editor: SELECT textarea / key / Preview / Set as backing (disabled until preview passes) (components/ontology/EntityTypePanel.tsx:1462, :1467, :1469, :1472)

**EntityTypePanel — History tab**
- [ ] Versions › Put back into the draft (edit, older versions, when allowed) (components/ontology/EntityTypePanel.tsx:2116)
- [ ] Withdrawn › Restore (binding) (edit) (components/ontology/EntityTypePanel.tsx:2020)
- [ ] Withdrawn › Restore (link) (edit) (components/ontology/EntityTypePanel.tsx:2033)

**ProcessPanel**
- [ ] Close (only on the "No process" state) (components/ontology/ProcessPanel.tsx:119)
- [ ] "goes through it:" entity button — opens the type (components/ontology/ProcessPanel.tsx:197)
- [ ] Start a dashboard for this process — makes a dashboard and switches to Dashboards; disabled when measured false (components/ontology/ProcessPanel.tsx:155)
- [ ] Change this process — opens ProcessDesigner in change mode (not in org) (components/ontology/ProcessPanel.tsx:217)
- [ ] Withdraw → "Withdraw — sure?" (two clicks) / Keep it (components/ontology/ProcessPanel.tsx:585, :589)
- [ ] Stage "touches" role entity buttons — open the type (components/ontology/ProcessPanel.tsx:291)
- [ ] Promise "kept per" grain button — opens that type (components/ontology/ProcessPanel.tsx:506)
- [ ] Impact › Withdraw (components/ontology/ProcessPanel.tsx:383)
- [ ] What bears on this promise? — opens the impact form (components/ontology/ProcessPanel.tsx:350)
- [ ] Impact form: the promise that bears on it (select) / mechanism select (influence | validated | by definition) / definition or evidence / window in days / Count it / Declare it (needs a count unless formula) / Cancel (components/ontology/ProcessPanel.tsx:441, :444, :451, :455, :467, :470, :474)

**ProcessDesigner**
- [ ] Save draft — keeps the draft in this browser (new process only) (components/ontology/ProcessDesigner.tsx:280)
- [ ] Review and publish / Review the change — opens the review callout (components/ontology/ProcessDesigner.tsx:284)
- [ ] Close (components/ontology/ProcessDesigner.tsx:288)
- [ ] Start over — drops the kept draft (components/ontology/ProcessDesigner.tsx:294)
- [ ] Review: Declare the process / Declare it anyway / Save the change / Save it anyway (components/ontology/ProcessDesigner.tsx:311)
- [ ] Review: Not yet (components/ontology/ProcessDesigner.tsx:316)
- [ ] Publish release N (after declaring) (components/ontology/ProcessDesigner.tsx:331)
- [ ] Process name (components/ontology/ProcessDesigner.tsx:341)
- [ ] What moves through it (type select with row counts; locked when changing) (components/ontology/ProcessDesigner.tsx:349)
- [ ] Owner (components/ontology/ProcessDesigner.tsx:363)
- [ ] Description (components/ontology/ProcessDesigner.tsx:368)
- [ ] Stage card: name / "When is it reached?" select (moments with counts | "status is…") / status value checkboxes / Remove (components/ontology/ProcessDesigner.tsx:516, :518, :534, :550)
- [ ] Promise between stages: kind select (no promise | within days | within hours | by a deadline) / amount / deadline moment select / name / target % kept (components/ontology/ProcessDesigner.tsx:577, :584, :588, :595, :599)
- [ ] Add a stage (max 12) (components/ontology/ProcessDesigner.tsx:396)
- [ ] Add an exit / Change the exit (components/ontology/ProcessDesigner.tsx:410)
- [ ] Exit editor: property select / value checkboxes / Done / Remove the exit (components/ontology/ProcessDesigner.tsx:626, :633, :641, :642)
- [ ] "Suggested from your data" stage chips (moments and status values with counts) (components/ontology/ProcessDesigner.tsx:423)
- [ ] How objects move: "Expect A to B" checkboxes (components/ontology/ProcessDesigner.tsx:760)
- [ ] Check (ask): They left the process — sets the exit from the check (components/ontology/ProcessDesigner.tsx:688)
- [ ] Check (ask): They really are late (components/ontology/ProcessDesigner.tsx:690)
- [ ] Check: Show me 20 of them / Show them — lists sample objects (components/ontology/ProcessDesigner.tsx:694)
- [ ] Answered check: Undo (components/ontology/ProcessDesigner.tsx:670)
- [ ] Start a dashboard for this process (after publish) (components/ontology/ProcessDesigner.tsx:477)

**ActionDesigner**
- [ ] Save draft — keeps the draft in this browser, credential stripped (components/ontology/ActionDesigner.tsx:325)
- [ ] Review and declare (components/ontology/ActionDesigner.tsx:329)
- [ ] Close (components/ontology/ActionDesigner.tsx:331)
- [ ] Start over (components/ontology/ActionDesigner.tsx:342)
- [ ] Review: Declare the action / Not yet (components/ontology/ActionDesigner.tsx:358, :361)
- [ ] Publish release N (components/ontology/ActionDesigner.tsx:375)
- [ ] Open {dashboard} (after placing) — opens Dashboards on it (components/ontology/ActionDesigner.tsx:385)
- [ ] 1 Name it: name / what it is for (components/ontology/ActionDesigner.tsx:394, :396)
- [ ] 2 What it's about: type select (with row counts) (components/ontology/ActionDesigner.tsx:405)
- [ ] 3 What a press does: Mark the X (card) / mark name / what it reads / note-from select (components/ontology/ActionDesigner.tsx:418, :422, :424, :426)
- [ ] 3 Tell someone (card) / destination select / message (components/ontology/ActionDesigner.tsx:435, :445, :453)
- [ ] 3 Start a deep analysis (card; sets approval on) / the question (components/ontology/ActionDesigner.tsx:461, :466)
- [ ] 3 Call another system (card; sets approval on) (components/ontology/ActionDesigner.tsx:472)
- [ ] 4 Asks: question label / answer type (Text|Number|Yes or no|Date) / Required checkbox / take off (✕) / Ask for something else (max 6) (components/ontology/ActionDesigner.tsx:480, :482, :487, :491, :500)
- [ ] 5 Conditions: is one of / is none of / take off (✕) / value toggle chips with counts / refused-press message / "Add a condition on…" select (components/ontology/ActionDesigner.tsx:517, :523, :534, :541, :547)
- [ ] 6 Who decides: Runs when pressed / A person approves each press (components/ontology/ActionDesigner.tsx:573, :575)
- [ ] 7 Call step: method / address / credential header / credential (password) / body JSON / check SQL / "finds a row|finds none" / taking it back select / undo action select / hours open (components/ontology/ActionDesigner.tsx:722, :726, :730, :732, :735, :739, :741, :752, :759, :764)
- [ ] Press preview: "Try it with: {ask}" inputs (components/ontology/ActionDesigner.tsx:587)
- [ ] Where it appears: per-dashboard checkboxes (pre-ticked) (components/ontology/ActionDesigner.tsx:653)
- [ ] Add the button to the dashboards ticked (after publish) (components/ontology/ActionDesigner.tsx:664)

#### 2. Dialogs, drawers, popovers, panels
- [ ] Make a dashboard dialog (760px) — ObjectDashboardStarter: title + object count, shape radio cards ("fits best"), "Why X", Days segmented 7/14/30 (queue shape), "It holds" list, Filters/Figures/Chart/Table-and-actions rows with checkboxes + mini previews, caveats, Cancel, Make it / Create dashboard (components/dashboards/MakeDashboard.tsx:25; components/dashboards/ObjectDashboardStarter.tsx:157, :183, :190, :204, :213, :222, :232, :238, :246, :256, :257)
- [ ] Inline withdraw confirm (type) — "Withdraw X and every link declared on it?" (components/ontology/EntityTypePanel.tsx:925)
- [ ] Inline retiring form (components/ontology/EntityTypePanel.tsx:2225)
- [ ] Inline process / rule / expression / binding / relationship / edit-states forms (components/ontology/EntityTypePanel.tsx:614, :723, :1183, :1656, :1951, :2459)
- [ ] Inline backing editor with preview grid (components/ontology/EntityTypePanel.tsx:1457, :1478)
- [ ] Inline link-name editor (components/ontology/EntityTypePanel.tsx:1891)
- [ ] ProcessPanel impact form panel (components/ontology/ProcessPanel.tsx:440)
- [ ] ProcessDesigner review callout / release callout / exit editor tile / check callouts with sample table (components/ontology/ProcessDesigner.tsx:301, :324, :622, :676, :705)
- [ ] ActionDesigner review callout / release callout / placed callout / amber checks callout (components/ontology/ActionDesigner.tsx:349, :369, :382, :675)
- [ ] App-wide approval modal (HTTP 428) can open on any designer write; closing it unapproved toasts "Not approved" (components/ontology/ProcessDesigner.tsx:83; components/ontology/ActionDesigner.tsx:57; lib/approval.ts:4)
- [ ] Toasts — "Draft kept in this browser." / "This browser would not keep the draft." / "Declared. It reaches readers when the release is published." / "Changed. …" / "Published as release N." / "Not declared" / "Not published" / "The dashboard was not made" (components/ontology/ProcessDesigner.tsx:280, :233, :246, :235, :248, :261); "Not withdrawn", impact "Declared. …" (components/ontology/ProcessPanel.tsx:375, :433, :150); "Draft kept in this browser — without its credential." / "Declared. It reaches dashboards and the agent…" / "Added to X, and not to the rest" / "The button was not added" (components/ontology/ActionDesigner.tsx:325, :261, :301)

#### 3. Figures, counts, badges, chips, freshness/as-of lines
**EntityTypePanel**
- [ ] Header tags: domain, role (reference/business object/event/standalone), declared/proposed (hover: provenance) (components/ontology/EntityTypePanel.tsx:332, :333, :335)
- [ ] "read from {connection}" (org ontology) (components/ontology/EntityTypePanel.tsx:355)
- [ ] Four figures: objects (count / "in Pramanyx" / "—, not counted"), key (✓ unique / not unique / not counted), properties, links · parts (components/ontology/TypeOverview.tsx:89, :90, :92, :94)
- [ ] Tab counts and Overview needs badge (components/ontology/EntityTypePanel.tsx:241-247)
- [ ] "part of" / "was a part of" tag + note (components/ontology/EntityTypePanel.tsx:881, :891)
- [ ] "retiring" / "past its retiring date" tag, "retiring on {day} — use X instead", mark note (components/ontology/EntityTypePanel.tsx:2197, :2199, :2215)
- [ ] Overview funnel: stage bars + reached counts, "N left · values", "measured false" note (components/ontology/TypeOverview.tsx:137, :145, :156, :161)
- [ ] Promise line: "broken X%" / "not counted yet", "N overdue" (hover: as of) (components/ontology/TypeOverview.tsx:189, :196)
- [ ] Sets chips with counts (admitted / breached / overdue) and "refused" (components/ontology/TypeOverview.tsx:239, :240)
- [ ] Depends on it: "N dashboards" badges, dependents by kind (automations/processes/rules/links/parts) (components/ontology/TypeOverview.tsx:306, :316)
- [ ] Reads · 30 days: "N reads · N readers", "last read {day}" / "not read", readers_said (components/ontology/TypeOverview.tsx:370, :374, :377)
- [ ] "Shared table: …" (components/ontology/TypeOverview.tsx:330)
- [ ] Reads · 12 months: table names, per-month bar + count (components/ontology/TypeOverview.tsx:333, :349)
- [ ] Key: "measured over N rows", verdict chip unique per object / not unique per row / not yet measured, key note (components/ontology/EntityTypePanel.tsx:821, :825, :827)
- [ ] Named by: warrant (declared by a person / proposed from the profile / no other property names it), names objects / does not name objects / not yet measured (components/ontology/EntityTypePanel.tsx:1065, :1069)
- [ ] Properties: "N, the first N shown", type square, key icon, role, source (components/ontology/EntityTypePanel.tsx:1215, :1238, :1239, :1243, :1244)
- [ ] Expressions: role · unit tag, runs / did not bind (components/ontology/EntityTypePanel.tsx:1168, :1169)
- [ ] Processes and rules: roles, "measured false"; derived rows kind tag + "refused" (components/ontology/EntityTypePanel.tsx:518, :519; components/ontology/ProcessPanel.tsx:547, :548)
- [ ] Verified metrics: name, unit, formula; "N unverified metrics not used by the compiler" (components/ontology/EntityTypePanel.tsx:2544, :2551)
- [ ] Words: "N words" aside, keyed "means X — read from table.col" / "not read here now" (components/ontology/EntityTypePanel.tsx:2508, :2518)
- [ ] Parts: "through {binding} · {kind}", proposed tag (components/ontology/EntityTypePanel.tsx:1014, :1017)
- [ ] Links: "X of Y followed by the compiler"; cardinality, followed/refused, cross-source, declared, proposed tags; "name proposed by the explorer"; business name · mechanical name · on; why_not; "carries …" lines (components/ontology/EntityTypePanel.tsx:2298, :2305-2324, :1876, :2336, :2339, :2341)
- [ ] Paths: "N paths, first N shown · compiler crosses at most N links", followed/refused, "N hops · reach · compiles as", per-hop ✓/✕, cardinality, why_not (components/ontology/EntityTypePanel.tsx:2609, :2624, :2628, :2636, :2646, :2649)
- [ ] Declared actions: "N actions", kind tag, risk tag (read_only/low green, high red), why, params → sets (components/ontology/EntityTypePanel.tsx:2381, :2387, :2388, :2390, :2392)
- [ ] Edit states: "N properties", per property moves (components/ontology/EntityTypePanel.tsx:2441, :2445)
- [ ] Binding row: backing/kind tag, verdict (read / read · latest by X / read · rolled up / no time column / refuted / not yet measured), proposed; Table|Query, Connection, Key, Time, Rows, Covers "N of M objects · N keys reach no object", Supplies; frames, rollups; "Not supplied: …" (components/ontology/EntityTypePanel.tsx:1315, :1287, :1330-1361, :1262, :1277, :1369)
- [ ] Proposed binding: "proposed · kind", key → object key · note, "would supply …" (components/ontology/EntityTypePanel.tsx:1388, :1395, :1398)
- [ ] Backing preview: Now (source · rows), Rows · key unique / NOT unique / not counted, Keeps, Drops (red), Adds (components/ontology/EntityTypePanel.tsx:1480-1502)
- [ ] History: origin sentence + "object_type · id" (components/ontology/EntityTypePanel.tsx:489, :490)
- [ ] Versions: v{n} / "as found", state tag (declared/drafted/withdrawn), "{day} · by · source", note, first 6 changes + "and N more changes" (components/ontology/EntityTypePanel.tsx:2109, :2111, :2113, :2123, :2126, :2131)

**ProcessPanel**
- [ ] process tag, measured / measured false / not counted, proposed / from a pack (components/ontology/ProcessPanel.tsx:182, :183, :185)
- [ ] id, description, "owned by", note, "Leaves the process when …" (components/ontology/ProcessPanel.tsx:190, :192, :198, :202, :207)
- [ ] Freshness: "counted {measured_at}" (components/ontology/ProcessPanel.tsx:212)
- [ ] Dashboard hint (what it would hold) (components/ontology/ProcessPanel.tsx:160)
- [ ] Stages "N in order"; index, name, "no object reaches it", anchor, "N reached · X%" (components/ontology/ProcessPanel.tsx:225, :259-265)
- [ ] Transition "p50 · p90 · p95 days", "N before X", "N with no X moment" (components/ontology/ProcessPanel.tsx:484-486)
- [ ] "N reached X before Y" (red) (components/ontology/ProcessPanel.tsx:270)
- [ ] Promise: terms, kept per, via, "target X% kept", "X% broken", "N of M that reached X broke it", "N not X yet · N already past it as of {as_of}", red flags, segment · metric (components/ontology/ProcessPanel.tsx:503-533)
- [ ] Impact: Upstream/Downstream, mechanism tag, verdict tag, reading, note, flags, "read over {window}" (components/ontology/ProcessPanel.tsx:380-393)
- [ ] How objects move: from → to + count, expected / nobody declared it / never happens; untimed note (components/ontology/ProcessPanel.tsx:312-322)

**ProcessDesigner**
- [ ] Breadcrumb "Ontology › Processes ›", title, state chip (Draft · not published / Declared · waiting for the release / Published in release N) (components/ontology/ProcessDesigner.tsx:272, :275, :277)
- [ ] "id X, made for you"; "N objects · table" (components/ontology/ProcessDesigner.tsx:344, :357)
- [ ] Stage status line: Counting on the data… / Counted / Could not be counted (components/ontology/ProcessDesigner.tsx:378)
- [ ] Stage card reached count, "X% reach it" (components/ontology/ProcessDesigner.tsx:544, :546)
- [ ] Promise "N d median", "X% of those that reached it late" (components/ontology/ProcessDesigner.tsx:575, :603)
- [ ] Exit chip "property is v · N leave" (components/ontology/ProcessDesigner.tsx:404)
- [ ] Moves: count, "nobody expects it", "never happens" (components/ontology/ProcessDesigner.tsx:764-766)
- [ ] Check ask: "X is v for N of the M … would also take out N waiting less than a year"; sample "N in all" (components/ontology/ProcessDesigner.tsx:681, :722)
- [ ] What it creates tiles: Late N, "promise broken X%", duration "N d", says, name (components/ontology/ProcessDesigner.tsx:465-471)
- [ ] Release callout: "release N, which holds N changes waiting" (components/ontology/ProcessDesigner.tsx:328)

**ActionDesigner**
- [ ] Breadcrumb "{within} › Actions ›", title, state chip (Draft · not declared / Declared · waiting / Published in release N / On X) (components/ontology/ActionDesigner.tsx:319, :321, :322)
- [ ] "Its id is made for you: X"; "N {plural}" (components/ontology/ActionDesigner.tsx:399, :412)
- [ ] Destination option "name · type · turned off" (components/ontology/ActionDesigner.tsx:449)
- [ ] "N {plural} allow it now · N don't" (green/red) (components/ontology/ActionDesigner.tsx:563-566)
- [ ] Press dry-run: object key + 3 properties, Allowed / Refused: message, after-press / tell / analysis / call lines (components/ontology/ActionDesigner.tsx:594-622)
- [ ] What it creates (new column / button) (components/ontology/ActionDesigner.tsx:632, :636)
- [ ] Where it appears: "title — beside segment: N of M allow it" (components/ontology/ActionDesigner.tsx:656-658)
- [ ] Release callout "release N, which holds N changes" (components/ontology/ActionDesigner.tsx:373)

#### 4. Keyboard shortcuts
- [ ] Link-name editor: Enter saves, Escape cancels (components/ontology/EntityTypePanel.tsx:1895)
- [ ] Entity panel tab strip: Radix Tabs arrow-key navigation (components/ui/tab-strip.tsx:3, used components/ontology/EntityTypePanel.tsx:371)
- [ ] Make a dashboard dialog: Escape closes (Radix Dialog default) (components/dashboards/MakeDashboard.tsx:25)
- [ ] No other key handling in ProcessPanel, ProcessDesigner or ActionDesigner (no Escape-to-close on the designers)

#### 5. URL params / deep links
- [ ] None read. Selected type, open process and designer state are component state only — no deep link to a type, process or designer (components/ontology/EntityTypeMap.tsx:173)
- [ ] Writes: "Open Actions" / "Open in Actions" → `/?tab=intelligence&layer=kinetic&conn=<id>` (components/ontology/EntityTypePanel.tsx:2365; lib/objectLinks.ts:23)
- [ ] Navigates via `requestTab("dashboards", {conn})` after Make a dashboard / Start a dashboard / Open {dashboard} (components/dashboards/MakeDashboard.tsx:31; components/ontology/ProcessPanel.tsx:148; components/ontology/ProcessDesigner.tsx:259; components/ontology/ActionDesigner.tsx:308)
- [ ] localStorage: `pramanyx:process-draft:{conn}:{schema}` (lib/processDraft.ts:177), `pramanyx:action-draft:{conn}:{schema}` credential stripped (lib/actionDraft.ts:206), `pramanyx:cockpit:{conn}` = dashboard to open (components/ontology/ActionDesigner.tsx:307; lib/dashboards/start.ts:73)

#### 6. Empty / error / loading / withheld states (quote the gist)
**EntityTypePanel**
- [ ] Loading skeleton (components/ontology/EntityTypePanel.tsx:174)
- [ ] "This type could not be read" + error (components/ontology/EntityTypePanel.tsx:172)
- [ ] "No entity “X”" + the refusal reason (components/ontology/EntityTypePanel.tsx:176)
- [ ] Overview quiet: "Nothing waits on a person here, and no process, set, metric or action reads X yet." (components/ontology/EntityTypePanel.tsx:270)
- [ ] "No declared process or rule touches this type yet." (components/ontology/EntityTypePanel.tsx:525)
- [ ] Declare a process disabled: "A process runs between two moments of this type, and it has fewer" (components/ontology/EntityTypePanel.tsx:607)
- [ ] "Nothing derived yet." (components/ontology/ProcessPanel.tsx:540)
- [ ] "No link reaches out from X." (components/ontology/EntityTypePanel.tsx:2299)
- [ ] Path refusal text / "No chain of links reaches X within N hops." (components/ontology/EntityTypePanel.tsx:2602, :2605)
- [ ] "No declared action takes a x." (components/ontology/EntityTypePanel.tsx:2375)
- [ ] Org ontology Actions tab: "Actions are declared, and their moves kept, on each connection's own ontology." (components/ontology/EntityTypePanel.tsx:303)
- [ ] "None declared — an action may set X to any value." (components/ontology/EntityTypePanel.tsx:2455)
- [ ] "No verified metric is defined on this type." (components/ontology/EntityTypePanel.tsx:2541)
- [ ] "No word people use is recorded for x yet." + read error (components/ontology/EntityTypePanel.tsx:2510, :2533)
- [ ] "Nothing on X has been withdrawn." (components/ontology/EntityTypePanel.tsx:1995)
- [ ] "Nobody has declared anything on X yet — what the builder read is all there is." (components/ontology/EntityTypePanel.tsx:2097)
- [ ] "An earlier version cannot be put back here: …" / put-back result sentence (components/ontology/EntityTypePanel.tsx:2143, :2146)
- [ ] WITHHELD SILENTLY: history read failure hides the Versions section with no word (components/ontology/EntityTypePanel.tsx:2091); uses read failure drops "Depends on it" (components/ontology/EntityTypePanel.tsx:167); processes read failure drops funnels/set counts (components/ontology/EntityTypePanel.tsx:233)
- [ ] Retiring unreadable: server sentence "Whether it is retiring could not be read." (components/ontology/EntityTypePanel.tsx:2174)
- [ ] "The table's columns could not be read: …" (components/ontology/EntityTypePanel.tsx:1545)
- [ ] Proposals intro "Proposed from the data — another table carries the X key. Nothing reads a proposal until it is bound." (components/ontology/EntityTypePanel.tsx:1575)
- [ ] Cross-connection note "On another connection a binding is read by key … a static one only." (components/ontology/EntityTypePanel.tsx:1680)
- [ ] Backing blocked: "preview it first" / "it drops X — select it too" / "its key is not unique over these rows" (components/ontology/EntityTypePanel.tsx:1434-1439)
- [ ] Uses: "No dashboard, automation, process or rule depends on it yet."; "No statement named its tables in the last 12 months."; server said lines (components/ontology/TypeOverview.tsx:324, :344, :313, :341)
- [ ] Every write failure shows its reason inline in red beside the door (e.g. components/ontology/EntityTypePanel.tsx:471, :664, :847, :1594)
- [ ] Make a dashboard: "Reading X — each piece is measured before it is offered…" / error / "X declares no key, so its objects are counted and charted here, never listed one by one." / "Tick a figure, the chart or the table — filters alone narrow nothing." (components/dashboards/ObjectDashboardStarter.tsx:105, :102, :229, :254)

**ProcessPanel**
- [ ] Skeleton / "This process could not be read" / "No process “X” — It may have been withdrawn." (components/ontology/ProcessPanel.tsx:115, :113, :118)
- [ ] "Not until it counts — see the note above." (components/ontology/ProcessPanel.tsx:160)
- [ ] Promise "not counted yet" (components/ontology/ProcessPanel.tsx:511)
- [ ] "Not counted as moves: … — reached by a status, which has no moment." (components/ontology/ProcessPanel.tsx:322)
- [ ] Impact not ready: "No other promise is declared here to bear on this one." / "The window is a whole number of days." / "Say the definition that makes it exact." / "Name the recorded evidence." (components/ontology/ProcessPanel.tsx:422-425)

**ProcessDesigner**
- [ ] "Your draft, as this browser kept it." (components/ontology/ProcessDesigner.tsx:293)
- [ ] Type hint "Reading the data…" / read error / "the objects each stage counts"; "Choose a type first" (components/ontology/ProcessDesigner.tsx:358, :520)
- [ ] "Not ready to publish: …"; "N questions below are not answered — the numbers would be published as they stand." (components/ontology/ProcessDesigner.tsx:303, :308)
- [ ] Exits "none — every object stays in the process until it reaches the last stage" (components/ontology/ProcessDesigner.tsx:408)
- [ ] "Not read: …" (components/ontology/ProcessDesigner.tsx:430)
- [ ] Moves "No moves between stages with a moment were counted." / "The moves appear once the draft is counted." (components/ontology/ProcessDesigner.tsx:751)
- [ ] Checks "The checks run once the draft can be counted." / "Counting…" / "The checks appear here once the draft is counted." / "Nothing to ask about."; "You said these are really late."; "Listing them…" (components/ontology/ProcessDesigner.tsx:442, :445, :669, :697)
- [ ] Creates empty "A promise on a stage makes a list of what is late, its rate and its typical duration."; dashboard hint "A dashboard needs a promise…" / "Publish the process first…" (components/ontology/ProcessDesigner.tsx:475, :483)

**ActionDesigner**
- [ ] Status "Reading the draft against the data…" / "Ready to declare — nothing is written until you do." / the not-ready reason (components/ontology/ActionDesigner.tsx:336)
- [ ] "Not ready to declare: …" (components/ontology/ActionDesigner.tsx:351)
- [ ] "No destination is saved yet. Set one up in Notifications, under Operations…" / "Reading the destinations…" (components/ontology/ActionDesigner.tsx:442, :447)
- [ ] "On every x. Add a condition if only some should allow it." / "Nothing a x holds has few enough values to choose from." (components/ontology/ActionDesigner.tsx:509, :557)
- [ ] Allowed line: "Counting…" / count error / "Not counted yet: …" / server's uncounted reason (components/ontology/ActionDesigner.tsx:560, :561)
- [ ] Sample: unread reasons / "No x to try it on." / "Read once the draft is ready."; "Nothing is sent from here." / "Nothing runs from here." (components/ontology/ActionDesigner.tsx:591, :611, :616, :621)
- [ ] "No dashboard of yours shows xs one at a time yet…"; "Once the action is declared and published." (components/ontology/ActionDesigner.tsx:646, :670)
- [ ] Amber: "No x allows it now — every press would be refused." / "N of the M {segment} … can't be pressed" (components/ontology/ActionDesigner.tsx:677, :680)

#### 7. Loads on open (API calls; flag WRITES / SPENDS)
**EntityTypePanel** (re-read on every map version bump)
- [ ] GET /object-types/{type} — the type's detail (lib/objectTypes.ts:664; components/ontology/EntityTypePanel.tsx:153) — served graph + overrides, no warehouse
- [ ] GET /object-types/{type}/uses — dependents + audited reads per month (lib/objectTypes.ts:655; components/ontology/EntityTypePanel.tsx:165) — audit store, no warehouse
- [ ] GET /ontology/processes — only when the type has processes or derived sets (lib/objectTypes.ts:1408; components/ontology/EntityTypePanel.tsx:231) — ⚠ SPENDS (warehouse) conditionally: re-counts a process for the reader where a row policy restricts it (pramanyx/routers/ontology.py:2641)
- [ ] Properties tab: GET /ontology/keys (lib/api.ts:1145; components/ontology/EntityTypePanel.tsx:2487) — "no model and no warehouse"
- [ ] Sources tab: GET /connections/{id}/tables/{table}/columns (lib/api.ts:876; components/ontology/EntityTypePanel.tsx:1543) — ⚠ SPENDS (warehouse, metadata): opens the connection (pramanyx/routers/connections.py:735)
- [ ] History tab: GET /ontology/history?kind=entity&target_id= (lib/objectTypes.ts:635; components/ontology/EntityTypePanel.tsx:2070)
- [ ] Make a dashboard dialog: GET /dashboards/from-object (lib/api.ts:3440; components/dashboards/ObjectDashboardStarter.tsx:95) — ⚠ SPENDS (warehouse): every piece measured before it is offered (pramanyx/routers/dashboards.py:236)
- [ ] On click only (WRITES): POST /ontology/measure (warehouse counts); PUT key / display property / part-of / backing / bindings / expressions / edit-states / link name / retiring / vocabulary key; POST confirm, declare link/process/rule, restore, history put-back, backing preview (warehouse read); DELETE entity / link / binding / expression / backing / edit-states / retiring (lib/objectTypes.ts:306-1559; lib/api.ts:1058)

**ProcessPanel**
- [ ] GET /ontology/processes (components/ontology/ProcessPanel.tsx:102) — ⚠ SPENDS (warehouse) conditionally, as above
- [ ] On click: POST /ontology/impacts/preview (warehouse count), POST /ontology/impacts, DELETE impact, DELETE process, PUT dashboard (start) (components/ontology/ProcessPanel.tsx:430, :432, :374, :575, :145)

**ProcessDesigner**
- [ ] localStorage read of a kept draft (components/ontology/ProcessDesigner.tsx:127)
- [ ] GET /ontology/processes/candidates?entity= when a type is set (lib/objectTypes.ts:1264; components/ontology/ProcessDesigner.tsx:155) — ⚠ SPENDS (warehouse): counts moments and status values (pramanyx/routers/ontology.py:2805)
- [ ] POST /ontology/processes/preview, auto-fired 900 ms after every valid draft change (on open when changing a process or restoring a valid draft) (lib/objectTypes.ts:1320; components/ontology/ProcessDesigner.tsx:169-182) — POST but writes nothing; ⚠ SPENDS (warehouse) each settle
- [ ] On click: POST /objects/list (Show me 20, warehouse read), POST or PUT /ontology/processes (WRITES), GET /ontology/release, POST /ontology/release/publish (WRITES), PUT /dashboards/{id} (WRITES) (components/ontology/ProcessDesigner.tsx:215, :227, :232, :243, :257)

**ActionDesigner**
- [ ] GET /object-types (type map) — only from the Actions page, where no types are passed (lib/objectTypes.ts:505; components/ontology/ActionDesigner.tsx:164)
- [ ] GET /ontology/kinetic-actions (declared actions, for id clash + undo list) (lib/api.ts:10297; components/ontology/ActionDesigner.tsx:171)
- [ ] GET /actions/triggers — when "Tell someone" is chosen (lib/api.ts:7468; components/ontology/ActionDesigner.tsx:180)
- [ ] GET /ontology/processes/candidates?entity= — when a type is set (components/ontology/ActionDesigner.tsx:189) — ⚠ SPENDS (warehouse)
- [ ] GET /dashboards, then GET /dashboards/{id} for EVERY non-retired dashboard (N+1 reads) — when a type is set (lib/api.ts:3338, :3348; components/ontology/ActionDesigner.tsx:202-207)
- [ ] POST /ontology/declared-actions/preview, auto-fired 900 ms after every valid draft change (lib/objectTypes.ts:1374; components/ontology/ActionDesigner.tsx:226-239) — writes nothing; ⚠ SPENDS (warehouse): counts allowed objects and dry-runs a press on a real object (pramanyx/routers/ontology.py:3875)
- [ ] On click: PUT /ontology/kinetic-actions/{id} (WRITES), GET /ontology/release, POST /ontology/release/publish (WRITES), PUT /dashboards/{id} per ticked dashboard + POST /objects/list for default columns (WRITES) (components/ontology/ActionDesigner.tsx:255, :260, :271, :296, :106)

Top rows today (part B, detail panels): EntityTypePanel header row = type icon · name · domain/role/declared tags · (right) Make a dashboard · Edit/Done, then connection line, description, part-of / retiring lines, Withdraw (edit), the four figures, then the six-tab strip; ProcessPanel header = name · process/verdict/origin tags, id, description, "goes through it", note/leaves, "counted …", Start a dashboard, Change this process, Withdraw; ProcessDesigner and ActionDesigner top row = breadcrumb (Ontology › Processes / {within} › Actions) · title · state chip · (right) Save draft · Review and publish|Review and declare · Close, with the status / "your draft" line under it.

---

## Actions
Entry: rail row "Actions" → `?tab=declared-actions` (resolves to Intelligence layer `kinetic`, app/page.tsx:957) or `?tab=intelligence&layer=kinetic`; renders `DeclaredActionsPanel` (components/IntelligenceWorkspace.tsx:295). Per connection (`connectionId`).
### 1. Controls
**Shared Intelligence context bar (above every Intelligence layer)**
- [ ] Connection select — switches the active connection; shown only when >1 briefings-enabled connection (components/IntelligenceWorkspace.tsx:204)
- [ ] Schema select — switches schema scope; shown only when the connection has >1 schema; remembered per connection (components/IntelligenceWorkspace.tsx:221)
- [ ] Scope maturity mark — the scope's maturity beside the pickers (components/IntelligenceWorkspace.tsx:238)

**Declared actions card**
- [ ] Propose from a finding (toggle, aria-expanded) — opens/closes the propose form under the ledger (components/DeclaredActionsPanel.tsx:240)
- [ ] + New action — opens the ActionDesigner inline under the ledger; hidden while designing (components/DeclaredActionsPanel.tsx:245)
- [ ] Action row name (hover shows the action id) — read-only (components/DeclaredActionsPanel.tsx:304)
- [ ] Action row facts line, each fact with a hover title (URL/method, verification SQL, param types) — read-only (components/DeclaredActionsPanel.tsx:309)
- [ ] Retry (on "not refreshed — showing the last read") — re-reads (components/DeclaredActionsPanel.tsx:328)

**Propose form (inline)**
- [ ] "A finding" textarea — the finding text to propose from (components/DeclaredActionsPanel.tsx:363)
- [ ] Propose actions / Proposing… — POST /kinetic-actions/propose; stages each valid proposal to the approvals; 1 model call (components/DeclaredActionsPanel.tsx:366)
- [ ] Close — closes the propose form (components/DeclaredActionsPanel.tsx:369)

**ActionDesigner (opened by New action; covered in depth by the Ontology inventory)**
- [ ] ActionDesigner inline panel, `within=""` — onClose closes it and reloads the ledger; onDeclared reloads the ledger (components/DeclaredActionsPanel.tsx:257)

**Needs you (right column)**
- [ ] Retry (outbox call row) — POST /actions/outbox/{id}/retry, sends the call again (components/DeclaredActionsPanel.tsx:428)
- [ ] Dismiss (outbox call row) — opens the inline "why" form (components/DeclaredActionsPanel.tsx:431)
- [ ] "Why is it left undelivered?" input — the reason, required (components/DeclaredActionsPanel.tsx:437)
- [ ] Leave it undelivered — POST /actions/outbox/{id}/dismiss with the note (components/DeclaredActionsPanel.tsx:439)
- [ ] Cancel — closes the dismiss form (components/DeclaredActionsPanel.tsx:443)
- [ ] ProposalCard per pending approval (controls below) (components/DeclaredActionsPanel.tsx:453)
- [ ] Retry on approvals ReadFailed / RefreshFailed (components/DeclaredActionsPanel.tsx:449, :456)

**ProposalCard (one per staged proposal)**
- [ ] Open-choice inputs ("step N · key", placeholder "#channel" for a channel) — fill a draft's open choices; Accept waits for each (components/ProposalCard.tsx:561)
- [ ] Accept — POST /kinetic-actions/inbox/{id}/accept with actor, mint_grant, fills; runs the action once; disabled until open choices are filled (components/ProposalCard.tsx:575)
- [ ] Open in editor — only for automation_draft / agent_bundle and only when the host passes onOpenInEditor (NOT passed on Actions) (components/ProposalCard.tsx:578)
- [ ] Reject — POST /kinetic-actions/inbox/{id}/reject (components/ProposalCard.tsx:581)
- [ ] "also allow this target unattended" checkbox — declared_action only; mints a standing grant on accept (components/ProposalCard.tsx:583)
- [ ] "always allow this chain to post here" checkbox — outbound_send only (components/ProposalCard.tsx:589)
- [ ] "to allow this account unattended, approve it under Approvals" note — integration only (components/ProposalCard.tsx:595)
- [ ] Open in inbox — only when the host passes inboxHref (NOT passed on Actions) (components/ProposalCard.tsx:426)

**Edit layer card**
- [ ] Annotate a value (toggle, aria-expanded) — opens/closes the annotate form (components/DeclaredActionsPanel.tsx:520)
- [ ] Withdraw / Withdrawing… (per edit row) — DELETE /kinetic-actions/annotations/{id}; the source value shows again (components/DeclaredActionsPanel.tsx:556)
- [ ] Edit row version (hover "version N") and timestamp (hover full time) (components/DeclaredActionsPanel.tsx:543, :552)
- [ ] Retry (edit layer ReadFailed / RefreshFailed) (components/DeclaredActionsPanel.tsx:528, :530)

**Annotate form (inline)**
- [ ] Table input (required) (components/DeclaredActionsPanel.tsx:584)
- [ ] Column input (optional) (components/DeclaredActionsPanel.tsx:585)
- [ ] Key column input (optional) (components/DeclaredActionsPanel.tsx:586)
- [ ] Row key input (optional) (components/DeclaredActionsPanel.tsx:587)
- [ ] Note input (required) (components/DeclaredActionsPanel.tsx:588)
- [ ] Save note — POST /kinetic-actions/annotate (kind "annotation"); clears the note and reloads (components/DeclaredActionsPanel.tsx:591)
- [ ] Close — closes the annotate form (components/DeclaredActionsPanel.tsx:592)

**Calls to other systems card**
- [ ] Call row timestamp (hover full time) — read-only, newest 20 shown (components/DeclaredActionsPanel.tsx:650)
- [ ] Retry on outbox ReadFailed / RefreshFailed (components/DeclaredActionsPanel.tsx:613, :615)
### 2. Dialogs, drawers, popovers, panels
- [ ] Propose form — inline panel under the ledger: finding textarea, "1 model call" chip, proposals list with name, "staged — waits for approval", reasoning, params, error (components/DeclaredActionsPanel.tsx:357)
- [ ] ActionDesigner — inline bordered panel under the ledger: the action designer (decision, ask, conditions, call, declare, release) (components/DeclaredActionsPanel.tsx:256)
- [ ] Dismiss-reason form — inline row under the outbox call (components/DeclaredActionsPanel.tsx:436)
- [ ] Annotate form — inline grid at the top of the Edit layer (components/DeclaredActionsPanel.tsx:581)
- [ ] ProposalCard bodies by kind: agent draft (Agent/Scope/Instructions/Documents) (components/ProposalCard.tsx:165); automation draft (name, Does, chain strip trigger › steps, Runs as, First run, Dry run) (components/ProposalCard.tsx:182); agent bundle (:435); automation edit before › after diff (:445); monitor bundle (Monitor, Watches σ cadence) (:462); brief draft (Brief/When/Delivers via) (:477); automation pause/resume (:484); agent limit before → after (:490); agent grant (:502); outbound Slack send (Posts to/Message) (:510); dashboard draft/publish outline, taken-off, new cards (:245); ontology candidate (Proposes/Seen/On accept) (:520); declared action / integration (Action id + param rows) (:538)
- [ ] Toasts — "Not sent" / "Not dismissed" on outbox failure; info toast with the accept/reject outcome (components/DeclaredActionsPanel.tsx:413, :266)
### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Declared actions count beside the card label (components/DeclaredActionsPanel.tsx:250)
- [ ] Gate chip per action: "runs, audited" (read_only/low) or amber "needs approval" (high / unclassified), hover = the rule (components/DeclaredActionsPanel.tsx:317)
- [ ] "irreversible" chip (red) (components/DeclaredActionsPanel.tsx:315)
- [ ] Facts line: on <type> · creates a <type> with … · sets … · calls METHOD host · key set · its edits wait on it · takes … · must satisfy … · checked by a read · undone by … within N h · reads only/has a side effect/annotates (components/DeclaredActionsPanel.tsx:171)
- [ ] "not refreshed — showing the last read" amber chip (components/DeclaredActionsPanel.tsx:327)
- [ ] "1 model call" chip on the propose form (components/DeclaredActionsPanel.tsx:360)
- [ ] Needs you right-hand count: "N approvals · N calls"; amber label when waiting (components/DeclaredActionsPanel.tsx:418)
- [ ] Outbox call row: action name · N attempts; detail = last error or status words (components/DeclaredActionsPanel.tsx:425)
- [ ] ProposalCard kind chip (action, integration write, new agent, new automation, agent + schedule, pause / resume, agent grant, edit, monitor + chain, brief delivery, Slack post, agent limit, dashboard, dashboard · publish, from query history) (components/ProposalCard.tsx:51)
- [ ] ProposalCard "as <account>" (integration) and "by <who> · waiting <rel time>" (components/ProposalCard.tsx:418, :423)
- [ ] ProposalCard settled status line (executed/accepted green, failed red, rejected/expired/superseded grey, uncertain amber) + outcome note (components/ProposalCard.tsx:602)
- [ ] Chain step "· a choice is open" amber marker (components/ProposalCard.tsx:154)
- [ ] Edit layer count beside the label; "all by <person>" when one person made every edit (components/DeclaredActionsPanel.tsx:519, :522)
- [ ] Edit group head: entity name + row key, or "every row" / "the whole table" (hover = table · key = value) (components/DeclaredActionsPanel.tsx:533)
- [ ] Edit row: label (property / "Corrected x" / "Note on x"), value, "via <action> · note · by <who>", relative time (components/DeclaredActionsPanel.tsx:539)
- [ ] Calls card "newest 20 of N" chip (components/DeclaredActionsPanel.tsx:609)
- [ ] Call row: status words (waiting to be sent again / being sent / delivered / no answer — being checked / could not be delivered / left undelivered) · N attempts · effect kind · writeback; "by <who> — <note>" for dismissed; reconciled/last-error line; relative time (components/DeclaredActionsPanel.tsx:209, :631)
### 4. Keyboard shortcuts
- [ ] None handled by the page.
### 5. URL params / deep links
- [ ] Reads/writes none of its own; reached by `?tab=declared-actions` or `?tab=intelligence&layer=kinetic`; `?conn=` picks the connection (app/page.tsx:957)
### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] No connection: "Choose a connection to see what Pramanyx may do on it." (components/DeclaredActionsPanel.tsx:232)
- [ ] 404 on declared actions: "No ontology is built on this connection yet — an action is declared on one." (components/DeclaredActionsPanel.tsx:282)
- [ ] "No action is declared yet." (components/DeclaredActionsPanel.tsx:290)
- [ ] "Loading the declared actions…" / "Could not read the declared actions — … Retry" (components/DeclaredActionsPanel.tsx:283)
- [ ] Propose: "The agent abstained — nothing to propose."; per-proposal error message; form error (components/DeclaredActionsPanel.tsx:371, :382, :362)
- [ ] Needs you: "Nothing waits for you." (hover explains what lands here) (components/DeclaredActionsPanel.tsx:457)
- [ ] Approvals: "Loading the approvals…" / "Could not read the approvals" (components/DeclaredActionsPanel.tsx:449)
- [ ] Edit layer: "Nothing is set over the data yet." / "Not withdrawn — <reason>" / loading / read failed (components/DeclaredActionsPanel.tsx:531, :526, :528)
- [ ] Calls: "Every call is under Needs you." / "No call has been sent yet." / "Loading the outbox…" / read failed (components/DeclaredActionsPanel.tsx:617, :613)
- [ ] Any refresh failure keeps the last answer with "not refreshed — showing the last read" (components/DeclaredActionsPanel.tsx:324)
- [ ] ProposalCard: "Open choices — yours to make; Accept waits until each has a value."; Accept hover "Fill the open choices first — accepting would arm a placeholder"; red error note (components/ProposalCard.tsx:551, :576, :609)
### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /ontology/kinetic-actions?connection_id= — declared actions, read-only (components/DeclaredActionsPanel.tsx:115)
- [ ] GET /kinetic-actions/annotations?connection_id= — the edit layer (components/DeclaredActionsPanel.tsx:116)
- [ ] GET /kinetic-actions/inbox?connection_id=&status=pending — pending approvals (components/DeclaredActionsPanel.tsx:117; lib/api.ts:7384)
- [ ] GET /actions/outbox?connection_id= — outbox calls (components/DeclaredActionsPanel.tsx:118; lib/objects.ts:633)
- [ ] No call on open writes or spends. On click: Propose actions = SPENDS (model, 1 call) + WRITES (staged proposals); Accept = WRITES (runs the action; may call an external system); Reject/Retry/Dismiss/Save note/Withdraw = WRITES. New action opens ActionDesigner, which on mount reads the type map, declared actions and action triggers, and as the draft changes POSTs /ontology/declared-actions/preview (counts objects — warehouse read) (components/ontology/ActionDesigner.tsx:164, :233)

Top rows today: no title row; the shared Intelligence context bar (Connection select · Schema select · scope maturity) sits above; the page's first row is the "Declared actions N" card label with Propose from a finding + New action at its right, beside the Needs you column.

---

## Graph
Entry: rail row "Graph" → `?tab=graph` (resolves to Intelligence layer `graph`, app/page.tsx:953) or `?tab=intelligence&layer=graph`; renders `ConnectionGraphPanel` (components/IntelligenceWorkspace.tsx:291) with `GraphCanvas` and `graph/WarrantChip`. Per connection + schema.
### 1. Controls
**Shared Intelligence context bar**
- [ ] Connection select / Schema select / scope maturity (components/IntelligenceWorkspace.tsx:204, :221, :238)

**Holds line (top row)**
- [ ] Rebuild / Rebuilding… — shown only when the audit says a rebuild is owed; POST /graph/rebuild then reloads (components/ConnectionGraphPanel.tsx:435)
- [ ] Graph view segmented: Map · Explore · Tour · Review (Review label carries the queue count) (components/ConnectionGraphPanel.tsx:449)
- [ ] Refresh — reloads graph, audit, review, standing; resets to Map and clears the choice (components/ConnectionGraphPanel.tsx:454)

**Map canvas (GraphCanvas)**
- [ ] Click a node — selects it; side panel shows its essentials (components/GraphCanvas.tsx:322)
- [ ] Multi-select (hint says shift-click; React Flow's default is Meta/Ctrl-click) — side panel shows "Chosen" (components/ConnectionGraphPanel.tsx:570; components/GraphCanvas.tsx:322)
- [ ] Drag a node — pins it (fx/fy) and reheats the simulation (components/GraphCanvas.tsx:335)
- [ ] Double-click a table node — opens its table page in Explore (components/GraphCanvas.tsx:366)
- [ ] Pan / zoom (wheel, drag background; min zoom 0.08) and fit view on load (components/GraphCanvas.tsx:367)
- [ ] React Flow Controls: zoom in, zoom out, fit view (interactive lock hidden) (components/GraphCanvas.tsx:406)
- [ ] Legend keys (Domains, Tables, Metrics, Declarations — only kinds present) (components/GraphCanvas.tsx:379)
- [ ] Findings toggle (aria-pressed) — shows/hides findings; resets the replay (components/GraphCanvas.tsx:384)
- [ ] Terms toggle (aria-pressed) — shows/hides glossary terms (components/GraphCanvas.tsx:386)
- [ ] Replay / Pause (icon button) — animates findings accumulating over time; only with Findings on and >1 timestamp (components/GraphCanvas.tsx:389)
- [ ] "Findings up to date" range slider — sets the findings time cutoff (components/GraphCanvas.tsx:394)

**Side panel — at rest**
- [ ] Needs you row check button (one per single-item kind): Measure this join / Ask about it / Define it — sends the item's question to Ask (components/ConnectionGraphPanel.tsx:489)
- [ ] Open (when the item's subject is a table node) — opens its table page (components/ConnectionGraphPanel.tsx:500)
- [ ] Review (on a folded multi-item kind) — switches to the Review view (components/ConnectionGraphPanel.tsx:556)
- [ ] Retry on "what needs checking" ReadFailed (components/ConnectionGraphPanel.tsx:525)
- [ ] Warrant mix bar segments / class rows (hover = count + meaning) (components/graph/WarrantChip.tsx:77, :84)

**Side panel — one node chosen**
- [ ] Ask about this table / Re-examine this finding / Ask about this metric / Ask about this term / Ask about this domain — sends questionFor(node) to Ask (components/ConnectionGraphPanel.tsx:626)
- [ ] Open (table only) — opens its table page (components/ConnectionGraphPanel.tsx:627)
- [ ] Meta line hover = node provenance ("From <source> — note") (components/ConnectionGraphPanel.tsx:624)

**Side panel — several chosen**
- [ ] Ask about these together — sends one question spanning the chosen nodes (components/ConnectionGraphPanel.tsx:656)

**Explore view**
- [ ] Breadcrumb "Domains" button — back to the domain list (components/ConnectionGraphPanel.tsx:305)
- [ ] Breadcrumb domain button (on a table page) — back to the domain's tables (components/ConnectionGraphPanel.tsx:313)
- [ ] Domain row (button) — opens the domain's tables; hover lists cross-domain joins (components/ConnectionGraphPanel.tsx:330)
- [ ] Table row (button) — opens the table page (components/ConnectionGraphPanel.tsx:353)
- [ ] Table page: Ask about this table (components/ConnectionGraphPanel.tsx:703)
- [ ] Table page: findings fold "N more" / "Fewer" (beyond 4) (components/ConnectionGraphPanel.tsx:746)
- [ ] Table page: columns fold "N more" / "Fewer" (beyond 10) (components/ConnectionGraphPanel.tsx:769)
- [ ] Table page: "What depends on this · counts" fold — expands dependents with their breaking SQL site (hover = full site) (components/ConnectionGraphPanel.tsx:815)
- [ ] Governed tag chips (hover = securable — set by) (components/ConnectionGraphPanel.tsx:714)

**Tour view**
- [ ] Step rows (hover = why this step) — read-only (components/ConnectionGraphPanel.tsx:911)
- [ ] Retry on reading-order ReadFailed (components/ConnectionGraphPanel.tsx:904)

**Review view**
- [ ] Per item: check button (Measure this join / Ask about it / Define it) + Open, up to 2 doors (components/ConnectionGraphPanel.tsx:880)
- [ ] Retry on ReadFailed (components/ConnectionGraphPanel.tsx:861)
### 2. Dialogs, drawers, popovers, panels
- [ ] Side panel "Beside the map" — three states: at rest (Needs you + How it is known), one node chosen (NodeEssentials + Joins), several chosen (Chosen list) (components/ConnectionGraphPanel.tsx:277)
- [ ] Legend/toggle/replay overlay panel on the canvas, top-left (components/GraphCanvas.tsx:375)
- [ ] Table page (Explore detail): name, standing, source tables · columns · domain, standing detail, tags, Joins, Findings on this table, Columns with glossary definitions, absent line, What depends on this (components/ConnectionGraphPanel.tsx:668)
- [ ] Error state with "Try again" door when the graph fails to load (components/ConnectionGraphPanel.tsx:267)
### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Holds line: N tables · N joins · N metrics · N findings · N terms (components/ConnectionGraphPanel.tsx:415)
- [ ] Join chip: "every join measured" (green) or "M of N measured" (hover explains unmeasured) (components/ConnectionGraphPanel.tsx:426)
- [ ] Freshness chip: Fresh / Data moved / Stale — rebuild / Freshness unknown; or amber "Rebuild owed" with drift reason on hover; plain when the audit could not be read (components/ConnectionGraphPanel.tsx:51, :433, :442)
- [ ] "Not rebuilt — <reason>" alert (components/ConnectionGraphPanel.tsx:439)
- [ ] Review count inside the Review segment label (components/ConnectionGraphPanel.tsx:453)
- [ ] Needs you count, or "N of M" when truncated; amber label when waiting (components/ConnectionGraphPanel.tsx:522)
- [ ] Needs you item kinds: Graph is behind · Unprobed join(s) · Contested finding(s) · Ungrounded finding(s) · Undocumented hub(s) · Isolated table(s), coloured amber/red/grey; "N things depend on it" (lib/graphView.ts:71; components/ConnectionGraphPanel.tsx:472, :507)
- [ ] "How it is known" N links + Warrant mix bar and five class counts (measured, human, declared, derived, inferred) (components/ConnectionGraphPanel.tsx:563; components/graph/WarrantChip.tsx:67)
- [ ] Warrant chip (class + detail, e.g. overlap) on nodes, joins, findings (components/graph/WarrantChip.tsx:39)
- [ ] Standing chip: Confirmed / Contested / Disputed / Corroborated / Unchecked; "standing not read" chip on failure (components/graph/WarrantChip.tsx:125; components/ConnectionGraphPanel.tsx:621)
- [ ] Node kind dot + word; table domain at right; finding date · contested · superseded; metric "on <tables>"; domain member tables (components/ConnectionGraphPanel.tsx:591)
- [ ] Joins count + per-join warrant (components/ConnectionGraphPanel.tsx:632)
- [ ] Map join labels: measured % overlap / "declared" / "unprobed" (components/GraphCanvas.tsx:168)
- [ ] Replay caption "all findings" / "up to <date>" (components/GraphCanvas.tsx:399)
- [ ] Domains count; per domain "N tables" + "joins X ×n, …" (components/ConnectionGraphPanel.tsx:326, :337, :341)
- [ ] Per table row: N columns · N joins · N findings (components/ConnectionGraphPanel.tsx:360)
- [ ] Table page: findings count + "all <warrant>"; columns "N defined · <warrant>" (components/ConnectionGraphPanel.tsx:736, :755)
- [ ] Dependents line counts by kind, "· first shown" when truncated (components/ConnectionGraphPanel.tsx:816)
- [ ] Review card: count / "N of M" · most consequential first (hover: ranked by dependents) (components/ConnectionGraphPanel.tsx:853)
- [ ] Tour: "N steps" (hover explains the order); per-step number, kind dot, "builds on X", narration (components/ConnectionGraphPanel.tsx:899, :913)
### 4. Keyboard shortcuts
- [ ] None coded by the page. React Flow defaults stay on (not overridden): Backspace removes the selected node from the canvas view (onNodesChange applies it); Meta/Ctrl-click multi-select; Shift-drag box select; Space-drag pan; Meta/Ctrl zoom activation (components/GraphCanvas.tsx:360; node_modules/@xyflow/react defaults)
### 5. URL params / deep links
- [ ] `?table=<node id>` READ on cold load by the shell and passed as initialTableId → opens Explore on that table page; unknown id falls back to Domains (app/page.tsx:1121; components/ConnectionGraphPanel.tsx:159)
- [ ] `?table=` WRITTEN (replaceState) while an Explore table page is open, removed when leaving it (components/ConnectionGraphPanel.tsx:107)
- [ ] Reached by `?tab=graph` or `?tab=intelligence&layer=graph`; `?conn=` picks the connection (app/page.tsx:953)
### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] Loading: skeleton rows (components/ConnectionGraphPanel.tsx:264)
- [ ] Graph failed: ErrorState "Graph failed" + server message, door "Try again" (404 = "No knowledge graph for this connection (build it first)") (components/ConnectionGraphPanel.tsx:267)
- [ ] Needs you: "Nothing to check — joins measured, tables connected and defined, no finding contested." (components/ConnectionGraphPanel.tsx:527)
- [ ] "Could not read what needs checking — …" Retry (components/ConnectionGraphPanel.tsx:525)
- [ ] "Could not read how this graph is known — <error>." / "No links yet." (components/ConnectionGraphPanel.tsx:564, :566)
- [ ] Freshness chip hover when audit failed: "Schema freshness only — whether a rebuild is owed could not be read" (components/ConnectionGraphPanel.tsx:443)
- [ ] Hint: "Click a node to read it · shift-click to choose several · drag to pin." (components/ConnectionGraphPanel.tsx:570)
- [ ] Explore: "No domains yet." / "No tables in this domain." / "Table not found." (components/ConnectionGraphPanel.tsx:327, :351, :372)
- [ ] Table page absent line: "No joins · no findings · no columns." (components/ConnectionGraphPanel.tsx:776)
- [ ] Dependents: "Could not read what depends on this table — …" (silent when nothing depends) (components/ConnectionGraphPanel.tsx:808)
- [ ] Review: "Nothing to review — every join measured, every table connected and defined, no finding contested." / read failed (components/ConnectionGraphPanel.tsx:863, :861)
- [ ] Tour: "No reading order — the graph has no tables or metrics to walk." / "Could not read the reading order" (components/ConnectionGraphPanel.tsx:906, :904)
- [ ] Joins: "No joins." (components/ConnectionGraphPanel.tsx:633)
### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /governance/tags?securable_prefix=table: (components/ConnectionGraphPanel.tsx:85; lib/api.ts:469)
- [ ] GET /graph?connection_id=&schema_name= — **WRITES when no graph is committed**: the handler builds the graph and persists it (save_graph); no model call, no warehouse query (lib/api.ts:1943; pramanyx/routers/ontology.py:929; pramanyx/ontology/context_graph_build.py:491)
- [ ] GET /graph/audit — **WRITES under the same build-on-read fallback** (_load_graph_or_404 builds+persists) (components/ConnectionGraphPanel.tsx:168; pramanyx/routers/ontology.py:1019, :1058)
- [ ] GET /graph/review — same build-on-read fallback (components/ConnectionGraphPanel.tsx:171; pramanyx/routers/ontology.py:1145)
- [ ] GET /graph/trust — read-time sidecar, same fallback (components/ConnectionGraphPanel.tsx:174; pramanyx/routers/ontology.py:1181)
- [ ] On demand: GET /graph/tour (on Tour; narrate=false, no model call) (components/ConnectionGraphPanel.tsx:198); GET /graph/lineage (on opening a table page) (components/ConnectionGraphPanel.tsx:802)
- [ ] On click: Rebuild = POST /graph/rebuild, WRITES (no model, no warehouse); every Ask/Re-examine/Measure/Define button opens Ask and auto-sends the question = SPENDS (model + warehouse) (app/page.tsx:1588; components/ChatPanel.tsx:954)

Top rows today: no title row; shared context bar (Connection · Schema · maturity) above; the page's own top row is the Holds line — counts, join chip, freshness chip, Rebuild (when owed), then Map/Explore/Tour/Review segmented + Refresh at the right.

---

## Memory
Entry: rail row "Memory" → `?tab=memory` (Intelligence layer `memory`, app/page.tsx:954); renders `MemoryPanel` (components/IntelligenceWorkspace.tsx:294). Org-wide: takes no connection, ignores the context bar's connection/schema.
### 1. Controls
**Shared Intelligence context bar** (shown, but has no effect on this page)
- [ ] Connection select / Schema select / scope maturity (components/IntelligenceWorkspace.tsx:204, :221, :238)

**Needs you — trusted queries waiting (proposed first, then drafts)**
- [ ] Approve (proposed) — POST /learning/trusted/{id}/transition approve; it then reaches prompts (components/MemoryPanel.tsx:269)
- [ ] Reject (proposed) — transition reject (components/MemoryPanel.tsx:274)
- [ ] Re-verify & propose (draft) — transition propose; re-runs verification (components/MemoryPanel.tsx:285)
- [ ] Edit (toggle) — opens/closes the inline edit form (components/MemoryPanel.tsx:278, :290)
- [ ] SQL / Hide — shows/hides the query's SQL (components/MemoryPanel.tsx:220)
- [ ] Remove — browser confirm "Remove this trusted query? The removal is audited." then DELETE (components/MemoryPanel.tsx:199, :225)
- [ ] Question title (hover = full question) (components/MemoryPanel.tsx:262)
- [ ] Retry (trusted queries ReadFailed) (components/MemoryPanel.tsx:256)

**Edit trusted query form (inline)**
- [ ] Question input · SQL textarea · note input (components/MemoryPanel.tsx:551)
- [ ] Save — PUT /learning/trusted/{id}; re-verifies and resets any approval (components/MemoryPanel.tsx:558)

**Readings it remembers**
- [ ] Revoke / Revoking (per reading) — DELETE /learning/resolutions/{id}; deleted, not kept (components/MemoryPanel.tsx:315)
- [ ] Show all N — lifts the 30-row cut (components/MemoryPanel.tsx:340)
- [ ] Reading line hovers: subject → reading; served N times · last <time>; created time; resolved SQL (components/MemoryPanel.tsx:313, :324, :328, :332)
- [ ] Retry (readings ReadFailed) (components/MemoryPanel.tsx:305)

**Queries it trusts**
- [ ] Seed a trusted query / Close (toggle) — opens the seed form (components/MemoryPanel.tsx:351)
- [ ] SQL / Hide (per row) (components/MemoryPanel.tsx:367)
- [ ] Deprecate (approved rows) — transition deprecate (components/MemoryPanel.tsx:369)
- [ ] Remove (per row) — confirm then DELETE (components/MemoryPanel.tsx:375)
- [ ] Status dot hover ("approved — reaches prompts" / "<status> — out of every prompt"); note hover (components/MemoryPanel.tsx:379, :384)

**Seed form (inline)**
- [ ] Connection select (defaults to the first connection) (components/MemoryPanel.tsx:513)
- [ ] Question input · SQL textarea · note input (optional) (components/MemoryPanel.tsx:517)
- [ ] Seed / Verifying… — POST /learning/trusted; runs and guards the SQL now (components/MemoryPanel.tsx:526)

**What reviewers said**
- [ ] Verdict bars (hover per verdict) and weekly acceptance columns (hover per week) (components/MemoryPanel.tsx:405, :417)
- [ ] Retry (verdicts ReadFailed) (components/MemoryPanel.tsx:401)

**Training corpus**
- [ ] Export now / Exporting… — POST /learning/export; runs every exporter once (components/MemoryPanel.tsx:437)
- [ ] Gate name hovers (what each gate counts) (components/MemoryPanel.tsx:467)
- [ ] Inspect a corpus: one toggle button per kind (sft, dpo, golden, sft bronze, dpo repair) — GET /learning/datasets/{name}; click again closes (components/MemoryPanel.tsx:589)
- [ ] Retry (corpus ReadFailed) (components/MemoryPanel.tsx:446)
### 2. Dialogs, drawers, popovers, panels
- [ ] Browser confirm dialog on Remove (native `confirm`) (components/MemoryPanel.tsx:199)
- [ ] Inline SQL box under a trusted query (components/MemoryPanel.tsx:214)
- [ ] Inline edit form under a trusted query (components/MemoryPanel.tsx:539)
- [ ] Inline seed form at the top of "Queries it trusts" (components/MemoryPanel.tsx:495)
- [ ] Corpus inspector box: dataset name · version · N examples · exported <day>; N lineage records; amber note (components/MemoryPanel.tsx:600)
### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Needs you count "N trusted queries"; amber when waiting (components/MemoryPanel.tsx:253)
- [ ] Needs-you detail: "Proposed · <conn> · vN — approving lets it reach prompts" / "Verification failed — it stays a draft" / "Draft · … — re-verify to propose it" (components/MemoryPanel.tsx:263)
- [ ] Readings meta: "N · N by a probe, N by a person … · served N× in all" (components/MemoryPanel.tsx:234)
- [ ] Per reading: served count "N×"; "settled by … · <connection> · <day>" (components/MemoryPanel.tsx:312, :329)
- [ ] "30 of N shown" (components/MemoryPanel.tsx:339)
- [ ] Trusted meta "N approved · only approved ones reach a prompt" (components/MemoryPanel.tsx:349)
- [ ] Trusted row: green/grey status dot, status chip (deprecated/rejected), "<connection> · vN · note" (components/MemoryPanel.tsx:379, :382, :385)
- [ ] Green status note after a write (e.g. "Approved — it now reaches prompts, and the approval is on the ledger.") (components/MemoryPanel.tsx:356)
- [ ] Verdicts meta "N verdicts · X% accepted" (hover: correction counts as half) (components/MemoryPanel.tsx:396)
- [ ] Verdict bars: accepted / corrected / rejected counts (components/MemoryPanel.tsx:405)
- [ ] "Accepted each week · A% → B% over N weeks" + weekly columns (components/MemoryPanel.tsx:413)
- [ ] "Only acceptance is measured — not what memory changed." (components/MemoryPanel.tsx:429)
- [ ] Corpus meta "distillation waits until every gate passes"; per gate bar "have of need (days)" + "passes" chip (components/MemoryPanel.tsx:435, :468, :471)
- [ ] "Not gates, graded by execution or a guard: <tier> N · …" (components/MemoryPanel.tsx:479)
### 4. Keyboard shortcuts
- [ ] None.
### 5. URL params / deep links
- [ ] None of its own; reached by `?tab=memory` or `?tab=intelligence&layer=memory` (app/page.tsx:954)
### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] Lead line: "What Pramanyx has learned across every connection: how it reads ambiguous terms, the queries it trusts, and what reviewers said." (components/MemoryPanel.tsx:248)
- [ ] "No trusted query waits for approval." (components/MemoryPanel.tsx:257)
- [ ] "Nothing remembered yet — a reading is kept when a probe, a person or a reviewer settles an ambiguous question." (components/MemoryPanel.tsx:307)
- [ ] "Not revoked — <reason>" (row stays) (components/MemoryPanel.tsx:321)
- [ ] Trusted empty: "None approved yet — the ones waiting are above." / "None yet — seed one, accept one from the Semantic Layer's Import tab, or a verified answer lands here." (components/MemoryPanel.tsx:361)
- [ ] Per-row action error (red) (components/MemoryPanel.tsx:216)
- [ ] "No reviewer has judged an answer yet." / "Fewer than two measured weeks — one point is a number, not a trend." (components/MemoryPanel.tsx:402, :424)
- [ ] Export refused message (red) (components/MemoryPanel.tsx:442)
- [ ] Corpus: "Could not read the <kind> corpus." / "No exported version of "<name>" yet — press Export now once the corpus has rows." (components/MemoryPanel.tsx:596, :598)
- [ ] Seed form hint: "It runs and is guarded now: passing lands it proposed, failing a draft. Only approval reaches a prompt." (components/MemoryPanel.tsx:531)
- [ ] Each section has its own "Loading …" / "Could not read … Retry" (trusted queries, remembered readings, verdicts, training corpus) (components/MemoryPanel.tsx:255, :304, :400, :445)
### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /connections — names connections (components/MemoryPanel.tsx:111)
- [ ] GET /learning/summary (components/MemoryPanel.tsx:125; lib/api.ts:10691)
- [ ] GET /learning/resolutions (components/MemoryPanel.tsx:128; lib/api.ts:492)
- [ ] GET /learning/trusted (components/MemoryPanel.tsx:131; lib/api.ts:12216)
- [ ] GET /learning/datasets — store stats + gate status (components/MemoryPanel.tsx:134; pramanyx/routers/learning.py:151)
- [ ] Nothing on open writes or spends. On click: Seed, Save (edit) and Re-verify & propose run the SQL = SPENDS (warehouse) + WRITES; Approve/Reject/Deprecate/Remove/Revoke = WRITES (audited); Export now = POST /learning/export WRITES (exports datasets) (lib/api.ts:12239, :12253, :12269, :10755)

Top rows today: no title row; shared context bar above (inert here); the page opens with the one-sentence lead, then the Needs you block; section tools sit on section heads (Seed a trusted query, Export now).

---

## Org
Entry: rail row "Org" → `?tab=org-intel` (Intelligence layer `org`, app/page.tsx:951); renders `OrgIntelPanel` (components/IntelligenceWorkspace.tsx:297). Org-wide: takes no connection.
### 1. Controls
**Shared Intelligence context bar** (shown, no effect here)
- [ ] Connection select / Schema select / scope maturity (components/IntelligenceWorkspace.tsx:204, :221, :238)

**Header**
- [ ] Filter findings (search input) — filters by text, domain or angle; shown only when something is promoted (components/OrgIntelPanel.tsx:106)
- [ ] Refresh — re-reads GET /org-intelligence (components/OrgIntelPanel.tsx:109)
- [ ] Retry (on "Could not read Org's findings") (components/OrgIntelPanel.tsx:122)

**Per finding**
- [ ] Remove / Removing… — DELETE /org-intelligence/{id}; no deep analysis is handed it again (components/OrgIntelPanel.tsx:166)
- [ ] "promoted <ago>" hover = full timestamp; "novelty N of 5" hover explains the scale (components/OrgIntelPanel.tsx:154, :156)
### 2. Dialogs, drawers, popovers, panels
- [ ] Toast "Not removed — it is still in Org" on a failed remove (components/OrgIntelPanel.tsx:85)
- [ ] None otherwise.
### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] "N of M" match count while filtering (components/OrgIntelPanel.tsx:104)
- [ ] "not refreshed — showing the last read" amber chip (components/OrgIntelPanel.tsx:115)
- [ ] Per domain heading + "N findings" (domains A–Z; findings newest first) (components/OrgIntelPanel.tsx:144)
- [ ] Per finding facts: angle · from <connection> (only when several sources) · promoted <ago> by <who> · novelty N of 5 (components/OrgIntelPanel.tsx:151)
- [ ] Lead sentence names the one source connection when all findings share it (components/OrgIntelPanel.tsx:91)
### 4. Keyboard shortcuts
- [ ] None.
### 5. URL params / deep links
- [ ] None of its own; reached by `?tab=org-intel` or `?tab=intelligence&layer=org` (app/page.tsx:951)
### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] Lead: "Findings promoted from … Every deep analysis is handed the five closest to its question." (components/OrgIntelPanel.tsx:100)
- [ ] Empty: "Nothing promoted yet" + chip "or its store could not be read" (hover: the store answers an empty list when unreadable) + "On a connection's Briefing, open a finding's ⋯ menu and choose Promote." (components/OrgIntelPanel.tsx:128)
- [ ] No match: "No promoted finding matches "<query>"." (components/OrgIntelPanel.tsx:139)
- [ ] "Loading Org's findings…" / "Could not read Org's findings — … Retry" (components/OrgIntelPanel.tsx:122)
- [ ] Withheld line: "Not recorded yet: people and owners, who to ask, and disagreements over what a term means." (components/OrgIntelPanel.tsx:179)
### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /org-intelligence (components/OrgIntelPanel.tsx:53; lib/api.ts:7596)
- [ ] GET /connections (components/OrgIntelPanel.tsx:60)
- [ ] Nothing on open writes or spends. On click: Remove = DELETE /org-intelligence/{id} WRITES (lib/api.ts:7605)

Top rows today: no title row; shared context bar above (inert here); the card's header row holds the lead sentence with match count, Filter findings and Refresh at its right.

---

## Inbox
Entry: rail Decide ▸ Inbox (lib/navDestinations.ts:75); `?tab=inbox`; app/page.tsx:2255-2260 renders `components/RecommendationInbox.tsx` inside a padded (16px 20px) scrolling div — no workspace shell, no tabs, no header. Paths below are relative to `web/`.

### 1. Controls
**Figures / partial-read line**
- [ ] Retry (beside "N deep analyses could not be read") — re-reads the whole inbox (components/RecommendationInbox.tsx:188)
- [ ] Retry (read-failed state) — re-runs the load (components/RecommendationInbox.tsx:155)

**Needs you — reviews that came due**
- [ ] Verified — marks the recommendation verified (POST outcome) (components/RecommendationInbox.tsx:403)
- [ ] Rejected — marks it rejected (POST outcome) (components/RecommendationInbox.tsx:404)

**Recommendations list**
- [ ] Open | All segmented filter ("Which recommendations") — open-only vs every recommendation (components/RecommendationInbox.tsx:204-205)
- [ ] "from <analysis title>" link — opens the source deep analysis in the chat/Data Canvas (shell sets selectedHistoryInvId + tab chat, app/page.tsx:2258) (components/RecommendationInbox.tsx:360-364)
- [ ] Execute → — opens the trigger menu for this recommendation (components/actions/ExecuteRecommendation.tsx:78-81)
- [ ] Trigger menu item (one per enabled trigger, by name) — fires the recommendation through that trigger past the departure gate (components/actions/ExecuteRecommendation.tsx:92-96)
- [ ] Click outside the trigger menu — closes it (components/actions/ExecuteRecommendation.tsx:84)
- [ ] try again — clears a failed send so Execute shows again (components/actions/ExecuteRecommendation.tsx:72)
- [ ] Mark ▾ / Change ▾ dropdown (open rows only) — opens the status menu (components/RecommendationInbox.tsx:307-314, 380)
- [ ] Menu item "accepted" — logs accepted (server measures a baseline + sets a review date) (components/RecommendationInbox.tsx:316-318; STATUSES :34)
- [ ] Menu item "implemented" (components/RecommendationInbox.tsx:316-318)
- [ ] Menu item "verified" (components/RecommendationInbox.tsx:316-318)
- [ ] Menu item "rejected" (components/RecommendationInbox.tsx:316-318)
- [ ] Menu item "dismissed" (components/RecommendationInbox.tsx:316-318) — the current status is shown disabled (:317)
- [ ] Hover: recommendation text shows full action + "Expected: <impact>" (components/RecommendationInbox.tsx:346)
- [ ] Hover: source shows the analysis question · date (components/RecommendationInbox.tsx:358)
- [ ] Hover: "+N more owners" lists the rest of the owners with counts (components/RecommendationInbox.tsx:283)
- [ ] Hover: unread chip lists the analyses that could not be read (components/RecommendationInbox.tsx:187)

### 2. Dialogs, drawers, popovers, panels
- [ ] Trigger popover (role=menu, anchored under Execute →) — enabled triggers from Notifications, or "Reading the triggers…", "Could not read the triggers — …", "No triggers configured. Set up one in Notifications." (components/actions/ExecuteRecommendation.tsx:82-98)
- [ ] Mark/Change dropdown menu (Radix) — the five statuses (components/RecommendationInbox.tsx:309-320)
- [ ] (none) No dialog or drawer; opening a source analysis leaves the page for chat (app/page.tsx:2258)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Figure "Open" + sub "from N deep analyses" / "nothing open" (components/RecommendationInbox.tsx:173-176)
- [ ] Chip "newest 20 read" (title: only the newest 20 deep analyses are read) (components/RecommendationInbox.tsx:177; READ :31)
- [ ] Figure "In progress" + "accepted or implemented" (components/RecommendationInbox.tsx:179)
- [ ] Figure "Verified" + "checked again and held" (components/RecommendationInbox.tsx:180)
- [ ] Figure "Closed" + "x rejected · y dismissed" (components/RecommendationInbox.tsx:181-182)
- [ ] Amber chip "N deep analyses could not be read" (components/RecommendationInbox.tsx:187)
- [ ] Needs you label, amber when rows; right "N reviews due" (components/RecommendationInbox.tsx:192)
- [ ] Due row: action text, review question, "· asked to <who>" (components/RecommendationInbox.tsx:397-400)
- [ ] Row status mark: dot + word (accepted/implemented/verified/rejected/dismissed, coloured) (components/RecommendationInbox.tsx:324-331, 349)
- [ ] Row "proposed" violet dot (nobody decided yet) (components/RecommendationInbox.tsx:350)
- [ ] Row owner name (components/RecommendationInbox.tsx:351)
- [ ] Row timeline "· by 18 Oct" or the model's words (components/RecommendationInbox.tsx:354, 77-80)
- [ ] Row amber chip "was due <day>" (date passed, still open) (components/RecommendationInbox.tsx:353)
- [ ] Row baseline line "baseline <metric> <value> (<window>)" or "baseline not measured: <note>" + "· review <day>" (components/RecommendationInbox.tsx:369-375)
- [ ] Closed rows drawn at 70% opacity (components/RecommendationInbox.tsx:342)
- [ ] Card "Where they stand" (right: "N recommendations") — funnel Proposed/Accepted/Implemented/Verified bar + count, "x rejected · y dismissed" (components/RecommendationInbox.tsx:223-225, 243-262)
- [ ] Card "Who they are for" (right: "open · by owner") — top-5 owners bar + count, "no owner named", "+N more owners · M open" (components/RecommendationInbox.tsx:228-230, 264-289)
- [ ] Execute results: "Sending…", "✓ sent to <trigger>", "Not sent — held at departure" (why on hover), "Not sent — <why>" (components/actions/ExecuteRecommendation.tsx:63-74, 80)
- [ ] Mark button "Marking…" while saving (components/RecommendationInbox.tsx:312)

### 4. Keyboard shortcuts
- [ ] None handled by the page; the Radix dropdown has its own arrow/Enter/Esc (components/RecommendationInbox.tsx:309). The trigger popover has no Esc handler (components/actions/ExecuteRecommendation.tsx:82-98).

### 5. URL params / deep links
- [ ] `?tab=inbox` read/written by the shell (app/page.tsx:889, 1248-1262); `&conn=` is written too but the Inbox scopes by workspace, not connection (components/RecommendationInbox.tsx:90, 107)
- [ ] The component reads no URL params itself; the source link moves to chat with no `?id=` (app/page.tsx:2258)

### 6. Empty / error / loading / withheld states
- [ ] Loading: "Loading the recommendations…" (components/RecommendationInbox.tsx:157)
- [ ] Error: "Could not read the recommendations — <err>." + Retry; list refusal reads "the list was refused (<status>)" (components/RecommendationInbox.tsx:108, 155)
- [ ] Partial: "N deep analyses could not be read" (not skipped in silence) (components/RecommendationInbox.tsx:121-123, 185-190)
- [ ] Withheld scope: "newest 20 read" — never implies there are no older ones (components/RecommendationInbox.tsx:177)
- [ ] Empty list (Open): "Every recommendation here has been decided." / "No recommendation in the newest 20 deep analyses." (title: "Recommendations arrive from deep analyses; one needing your decision lands here") (components/RecommendationInbox.tsx:209-213)
- [ ] Needs you empty: "No review has come due." (title explains review dates) (components/RecommendationInbox.tsx:192)
- [ ] Owners card empty: "Nothing open." (components/RecommendationInbox.tsx:265)
- [ ] Funnel + owners cards hidden when there are no recommendations (components/RecommendationInbox.tsx:220)
- [ ] Write failure on a row: "Not marked <status> — <error>" (role=alert) (components/RecommendationInbox.tsx:301, 383, 407)

### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /investigations?limit=20&workspace_id=… — read (components/RecommendationInbox.tsx:107; pramanyx/routers/investigations.py:6384)
- [ ] For each completed investigation (up to 20): GET /investigations/{id} and GET /investigations/{id}/outcomes — read; up to 40 calls per open (components/RecommendationInbox.tsx:112-118; lib/api.ts:4010; pramanyx/routers/investigations.py:6407, 6968)
- [ ] Lazily, on opening Execute →: GET /actions/triggers — read (components/actions/ExecuteRecommendation.tsx:35-42)
- [ ] No write or spend on open. On click only: POST /investigations/{id}/recommendations/{i}/outcome — WRITES; "accepted" SPENDS (warehouse): it measures a baseline with run_sql_for (pramanyx/routers/investigations.py:6934-6941, 6867-6883); verified/implemented/rejected also book a decision/outcome into the Record (6942-6960) (lib/api.ts:3989)
- [ ] On click only: POST /investigations/{id}/recommendations/{i}/execute — WRITES + SENDS (Slack/webhook/Jira through the departure gate) (components/actions/ExecuteRecommendation.tsx:48-51)

Top rows today: no header, title or toolbar — the page opens straight on the four-figure tally (Open · In progress · Verified · Closed, components/RecommendationInbox.tsx:172-183); its only list control, the Open | All filter, sits at the right of the "Recommendations" card's label row (:200-206).

---

---

## Record
Entry: rail Decide ▸ Record (lib/navDestinations.ts:76); `?tab=record` (+ legacy `?tab=inquiries|decisions|missions|claims|corrections`); app/page.tsx:1971-1993 renders `components/record/RecordWorkspace.tsx` — a `<Workspace>` with five view tabs (tabs NOT hidden), wrapped by the Inspector drawer host. Views: Inquiries (components/inquiries/InquiriesPanel.tsx), Decisions (components/decisions/DecisionsPanel.tsx), Missions (components/missions/MissionsPanel.tsx), Claims (components/record/RecordPanel.tsx — confirmed), Corrections (components/record/CorrectionsPanel.tsx). Each view is a Ledger; a row opens its Reader in place (`?id=`); a citation opens in the Inspector drawer beside the page. Visited views stay mounted (components/Workspace.tsx:66-69).

### 1. Controls
**Workspace (every view)**
- [ ] View tab "Inquiries" (hover: what is established, open, what would settle it) (components/record/RecordWorkspace.tsx:37; components/Workspace.tsx:82-83)
- [ ] View tab "Decisions" (components/record/RecordWorkspace.tsx:38)
- [ ] View tab "Missions" (components/record/RecordWorkspace.tsx:39)
- [ ] View tab "Claims" (components/record/RecordWorkspace.tsx:40)
- [ ] View tab "Corrections" (components/record/RecordWorkspace.tsx:41)
- [ ] Switching a tab closes any open Reader (app/page.tsx:1979)

**Every ledger list (ListCard / ListRow / BackHeader in kit)**
- [ ] Copy — copies every row in full words (not just the shown page) as cells (components/record/kit.tsx:292; components/TableActions.tsx:104-109)
- [ ] CSV — downloads every row as CSV, file named per list (components/record/kit.tsx:292; components/TableActions.tsx:110-114)
- [ ] Show N more — pages the list (50 a page; 8 on Corrections) (components/record/kit.tsx:314-323)
- [ ] Row name (link) — opens that record's Reader (`?id=`) (components/record/kit.tsx:354-358)
- [ ] Reader breadcrumb "<Ledger name>" link — back to the ledger (components/record/kit.tsx:112-127)

**Inquiries — ledger**
- [ ] Needs you "Open" on a check that came due (components/inquiries/InquiriesPanel.tsx:165)
- [ ] Needs you "Open" on an open inquiry with no run (repeats folded ×N) (components/inquiries/InquiriesPanel.tsx:167-174)
- [ ] State filter segmented All / Open / Waiting / Closed (components/inquiries/InquiriesPanel.tsx:41-46, 185-186)
- [ ] Ask why — goes to the chat to start a deep analysis (opens/wakes an inquiry) (components/inquiries/InquiriesPanel.tsx:187-189; app/page.tsx:1985)
- [ ] Row (question label) — opens the inquiry Reader (components/inquiries/InquiriesPanel.tsx:209)

**Inquiries — Reader**
- [ ] "Inquiries" back link (components/inquiries/InquiriesPanel.tsx:252)
- [ ] Open it as it stands now (superseded version) (components/inquiries/InquiriesPanel.tsx:366)
- [ ] Established claim statement (link) — opens the claim in the Inspector drawer (components/inquiries/InquiriesPanel.tsx:375-377; components/record/kit.tsx:504-505)
- [ ] Mark wrong (established claim) → inline form (components/inquiries/InquiriesPanel.tsx:379; components/record/kit.tsx:525-577)
- [ ] Mark wrong form: "What is true instead" input (claims) (components/record/kit.tsx:557-559)
- [ ] Mark wrong form: "Why" / "What shows it is false" input (components/record/kit.tsx:562-564)
- [ ] Mark wrong form: Mark it wrong (WRITES) / Cancel (components/record/kit.tsx:568-569)
- [ ] Add a hypothesis (toggle) (components/inquiries/InquiriesPanel.tsx:386-388)
- [ ] Add-hypothesis form: "You think" input, Add it (WRITES), Cancel (components/inquiries/InquiriesPanel.tsx:389-409)
- [ ] Mark wrong on a hypothesis (records it refuted) (components/inquiries/InquiriesPanel.tsx:427)
- [ ] Open the decision (one per decision it fed) → Inspector drawer (components/inquiries/InquiriesPanel.tsx:454)
- [ ] Propose the next run — works out the next run and its cost ("Spends no model") (WRITES) (components/inquiries/InquiriesPanel.tsx:460-465)
- [ ] Open the run (per run verdict) — opens the run in the Data Canvas (components/inquiries/InquiriesPanel.tsx:477; app/page.tsx:1984)
- [ ] Close this inquiry → inline close form (components/inquiries/InquiriesPanel.tsx:539-545)
- [ ] Close form: "Closed as" segmented answered / overtaken / abandoned (components/inquiries/InquiriesPanel.tsx:529, 551-552)
- [ ] Close form: "Believed at the start" input, "Turned out" input (components/inquiries/InquiriesPanel.tsx:553-556)
- [ ] Close form: Close it (WRITES) / Cancel (components/inquiries/InquiriesPanel.tsx:559-560)
- [ ] Rail "Hand it on": "Hand to" input + Hand over (WRITES; sends nothing) (components/inquiries/InquiriesPanel.tsx:323-327)
- [ ] Rail: Take <owner> off (WRITES) (components/inquiries/InquiriesPanel.tsx:329-334)
- [ ] Rail: next-check date input + Set (WRITES) (components/inquiries/InquiriesPanel.tsx:336-340)
- [ ] Rail: Clear (check date; reopens it) (WRITES) (components/inquiries/InquiriesPanel.tsx:341-346)
- [ ] Rail: "What it waits for" input (components/inquiries/InquiriesPanel.tsx:348)

**Decisions — ledger**
- [ ] North Star "Why ▾ / ▴" — expands reasons not closed + calibration table (components/decisions/NorthStarLine.tsx:54-57)
- [ ] Calibration table in Why (AugTable SqlResultTable, its own table controls) (components/decisions/NorthStarLine.tsx:75-80)
- [ ] Needs you "Review" (decision whose review is due) — opens its Reader (components/decisions/DecisionsPanel.tsx:385-388)
- [ ] Needs you "Open" (reopened decision) (components/decisions/DecisionsPanel.tsx:390-394)
- [ ] Filter segmented All / Review due / Awaiting its date / Reviewed (components/decisions/DecisionsPanel.tsx:55-60, 405-406)
- [ ] Record a decision → "Record a decision" dialog (components/decisions/DecisionsPanel.tsx:407-410)
- [ ] Row (question label) — opens the decision Reader (components/decisions/DecisionsPanel.tsx:424)
- [ ] Declare a kind → "Declare a kind of decision" dialog (components/decisions/DecisionsPanel.tsx:130)
- [ ] Bring a meeting's notes → meeting dialog (components/decisions/DecisionsPanel.tsx:193)
- [ ] Meeting candidate: "What was chosen" input (components/decisions/DecisionsPanel.tsx:251-252)
- [ ] Meeting candidate: Confirm — books it as the person's decision, then opens it (WRITES) (components/decisions/DecisionsPanel.tsx:237-240, 253)
- [ ] Meeting candidate: Not a decision — refuses it, kept with why (WRITES) (components/decisions/DecisionsPanel.tsx:242-245, 254)

**Decisions — "Record a decision" / "Revise this decision" form (DeclareForm)**
- [ ] What was being decided (components/decisions/DecisionsPanel.tsx:503-504)
- [ ] What was chosen (components/decisions/DecisionsPanel.tsx:505-506)
- [ ] The options not taken (components/decisions/DecisionsPanel.tsx:507-508)
- [ ] Kind select ("none named" + declared kinds; shows the kind's rules) — only when kinds exist (components/decisions/DecisionsPanel.tsx:509-526)
- [ ] Who approves it (emails or names) (components/decisions/DecisionsPanel.tsx:527-532)
- [ ] Expected to move — governed-metric field with typeahead + "Use <metric>" buttons + standing line (components/decisions/DecisionsPanel.tsx:537-540; components/metrics/MetricField.tsx:72, 100-140)
- [ ] Expected low / high / unit inputs (components/decisions/DecisionsPanel.tsx:541-543)
- [ ] Review on (date) (components/decisions/DecisionsPanel.tsx:550-554)
- [ ] Decided on (date, ≤ today) (components/decisions/DecisionsPanel.tsx:555-564)
- [ ] Book it (WRITES) / Cancel (components/decisions/DecisionsPanel.tsx:568-569)

**Decisions — "Declare a kind of decision" form (KindForm)**
- [ ] The kind (name) (components/decisions/DecisionsPanel.tsx:287-288)
- [ ] The metrics it moves — multi-metric field with × remove per metric (components/decisions/DecisionsPanel.tsx:289-293; components/metrics/MetricField.tsx:173-174)
- [ ] Who approves one (components/decisions/DecisionsPanel.tsx:294-295)
- [ ] Reviewed after N days (components/decisions/DecisionsPanel.tsx:296-300)
- [ ] Checkbox "A decision of this kind must say what it expects" (components/decisions/DecisionsPanel.tsx:302-305)
- [ ] Declare it (WRITES) / Cancel (components/decisions/DecisionsPanel.tsx:308-309)

**Decisions — "Bring a meeting's notes" form**
- [ ] The meeting (title) (components/decisions/DecisionsPanel.tsx:198-199)
- [ ] Held on (date) (components/decisions/DecisionsPanel.tsx:200-201)
- [ ] Its notes (textarea; nothing fetched from mail/calendar/drive) (components/decisions/DecisionsPanel.tsx:202-204)
- [ ] Checkbox "Keep the lines each decision was read from" (else only a hash) (components/decisions/DecisionsPanel.tsx:206-209)
- [ ] Find the decisions — one model call proposes decisions (WRITES + SPENDS model) / Cancel (components/decisions/DecisionsPanel.tsx:212-215)

**Decisions — Reader**
- [ ] "Decisions" back link (components/decisions/DecisionsPanel.tsx:588)
- [ ] Revise this decision → same form in a dialog; on book jumps to the new version (`requestTab("decisions",{id})`) (components/decisions/DecisionsPanel.tsx:677-687)
- [ ] Open it as it stands now (superseded) (components/decisions/DecisionsPanel.tsx:691)
- [ ] Reopened callout: "Why it still stands" input + It still stands (WRITES) (components/decisions/DecisionsPanel.tsx:735-738)
- [ ] Reopened callout: Open the claim → Inspector drawer (components/decisions/DecisionsPanel.tsx:739)
- [ ] Add an option → dialog: option input, Add it (WRITES), Cancel (components/decisions/DecisionsPanel.tsx:695-706, 744)
- [ ] Record dissent → dialog: Who disagreed, Why, Record it (WRITES), Cancel (components/decisions/DecisionsPanel.tsx:707-724, 798)
- [ ] Scenario prediction: Open the claim (components/decisions/DecisionsPanel.tsx:1033)
- [ ] Add a projection → dialog (components/decisions/DecisionsPanel.tsx:1044, 1049-1053)
- [ ] Projection form: Method segmented Arithmetic / My assumption / Its own history / Past decisions like it (components/decisions/DecisionsPanel.tsx:1060-1062, 1122-1124)
- [ ] Projection form: What it predicts + unit (components/decisions/DecisionsPanel.tsx:1125-1129)
- [ ] Projection form (Arithmetic): Formula, Inputs (`name = number, …`) (components/decisions/DecisionsPanel.tsx:1130-1136)
- [ ] Projection form (My assumption): variable, value, low, high (components/decisions/DecisionsPanel.tsx:1137-1146)
- [ ] Projection form (Past decisions): past-cases list, read-only (components/decisions/DecisionsPanel.tsx:1147-1173)
- [ ] Projection form: Book the projection (WRITES; "Its own history" reads the metric's last six periods — warehouse) / Cancel (components/decisions/DecisionsPanel.tsx:1068, 1178-1180)
- [ ] What it relied on: claim statement link → Inspector drawer (components/decisions/DecisionsPanel.tsx:786)
- [ ] What it relied on: What replaced it (restated claim) (components/decisions/DecisionsPanel.tsx:788)
- [ ] Outcome form (review due, none booked): Measured actual / Baseline / Effect inputs (components/decisions/DecisionsPanel.tsx:1221-1227)
- [ ] Outcome form: Verdict segmented as expected / better / worse / missed / cannot tell (components/decisions/DecisionsPanel.tsx:1188, 1228-1230)
- [ ] Outcome form: Why input, Book the outcome (WRITES) (components/decisions/DecisionsPanel.tsx:1231-1236)
- [ ] The inquiry: Receipt / Hide the receipt (per step) (components/decisions/DecisionsPanel.tsx:938-940)
- [ ] The inquiry: Open it → (decision it revises / that revised it) (components/decisions/DecisionsPanel.tsx:958)
- [ ] Rail "From Google": file link input + Read its comments (WRITES) (components/decisions/DecisionsPanel.tsx:884-886)
- [ ] Rail hover: By-email address explains replies are kept as evidence (components/decisions/DecisionsPanel.tsx:667)

**Missions — ledger**
- [ ] Write a mission → "Write a mission" dialog (in the empty card or the list's tools) (components/missions/MissionsPanel.tsx:76-78, 130, 165)
- [ ] Needs you "Open" (mission without an owner) (components/missions/MissionsPanel.tsx:151-154)
- [ ] Needs you "Open" (proposed mission) (components/missions/MissionsPanel.tsx:156-159)
- [ ] Row (mission name) — opens the mission Reader (components/missions/MissionsPanel.tsx:167)

**Missions — "Write a mission" / "Edit this mission" form (MissionForm)**
- [ ] Template buttons ("Start from a template the installed packs ship") — fill the form (components/missions/MissionsPanel.tsx:284-292)
- [ ] Name (components/missions/MissionsPanel.tsx:294-295)
- [ ] Achieve — governed-metric field (components/missions/MissionsPanel.tsx:296-302)
- [ ] Direction segmented up / down / hold (components/missions/MissionsPanel.tsx:303)
- [ ] Target, Unit, By when (date) (components/missions/MissionsPanel.tsx:304-306)
- [ ] Without damaging — governed-metric field (components/missions/MissionsPanel.tsx:308-312)
- [ ] Bound segmented at least / at most, Limit (components/missions/MissionsPanel.tsx:313-314)
- [ ] Owner (components/missions/MissionsPanel.tsx:316-320)
- [ ] May interrupt N times a week (components/missions/MissionsPanel.tsx:321-324)
- [ ] Report cadence segmented weekly / monthly / quarterly (components/missions/MissionsPanel.tsx:325)
- [ ] Write it / Save as a new version (WRITES) / Cancel (components/missions/MissionsPanel.tsx:330-332)

**Missions — Reader**
- [ ] "Missions" back link (components/missions/MissionsPanel.tsx:396)
- [ ] Edit (not when retired) → "Edit this mission" dialog (components/missions/MissionsPanel.tsx:400-402, 432-438)
- [ ] Report now (toggle) → inline report panel (components/missions/MissionsPanel.tsx:403, 411-425)
- [ ] Report panel: Book and send (owner only; WRITES + SENDS via gate) (components/missions/MissionsPanel.tsx:420)
- [ ] Report panel: Book without sending (WRITES) / Cancel (components/missions/MissionsPanel.tsx:421-422)
- [ ] State buttons by state — proposed: Activate, Retire; active: Pause, Mark met, Retire; paused: Resume, Retire; met: Retire (WRITES) (components/missions/MissionsPanel.tsx:347-353, 404-406)
- [ ] Back to how it reads now (from a past report) (components/missions/MissionsPanel.tsx:567)
- [ ] Read it in full (past report) (components/missions/MissionsPanel.tsx:589)
- [ ] Monitors — goes to Operations ▸ Monitors (components/missions/MissionsPanel.tsx:646; app/page.tsx:1991)
- [ ] Open the claim (claim watch) → Inspector drawer (components/missions/MissionsPanel.tsx:654)
- [ ] Open the inquiry (per inquiry opened) → Inspector drawer (components/missions/MissionsPanel.tsx:667)
- [ ] Open the decision (per decision) → Inspector drawer (components/missions/MissionsPanel.tsx:681)
- [ ] Proposed decisions: Choose (per option) — books the decision toward this mission (WRITES) (components/missions/MissionsPanel.tsx:484-501, 510)
- [ ] Proposed decisions: Open it → (after booking) → Inspector drawer (components/missions/MissionsPanel.tsx:521)

**Claims — ledger**
- [ ] Find input ("a claim, a metric, an owner") (components/record/RecordPanel.tsx:224-226)
- [ ] As of (date) — re-reads the whole Record as recorded then (components/record/RecordPanel.tsx:227-230)
- [ ] Back to today (clears As of) (components/record/RecordPanel.tsx:227)
- [ ] Facet Kind (checkbox rows, count + bar) (components/record/RecordPanel.tsx:231-232; components/record/kit.tsx:390-415)
- [ ] Facet About (components/record/RecordPanel.tsx:233-237)
- [ ] Facet Warranted (tier) (components/record/RecordPanel.tsx:238-239)
- [ ] Facet Predictions (verdict; only when predictions exist) (components/record/RecordPanel.tsx:240-243)
- [ ] Clear filters (components/record/RecordPanel.tsx:244)
- [ ] Tools ▾ menu (components/record/RecordPanel.tsx:254-257)
- [ ] Tools ▸ Definitions — goes to the Semantic Layer (components/record/RecordPanel.tsx:259; app/page.tsx:1989)
- [ ] Tools ▸ Map — goes to the Ontology (components/record/RecordPanel.tsx:260; app/page.tsx:1990)
- [ ] Needs you "Open definitions" (messages held on an unapproved definition) (components/record/RecordPanel.tsx:214-219)
- [ ] Row (statement / metric·period) — opens the claim Reader (components/record/RecordPanel.tsx:285, 300)

**Claims — Reader**
- [ ] "Claims" back link (components/record/RecordPanel.tsx:423)
- [ ] Open the current one (replaced version) (components/record/RecordPanel.tsx:432)
- [ ] Mark wrong (inline form, as above; page follows to the new version) (components/record/RecordPanel.tsx:442-447)
- [ ] Open the run (run warrant) (components/record/RecordPanel.tsx:461)
- [ ] Its receipt — opens /receipt/<ref> in a new tab (components/record/RecordPanel.tsx:462; app/page.tsx:1986)
- [ ] Open that claim (claim warrant) (components/record/RecordPanel.tsx:463)
- [ ] Open the decision (per relying decision) → Inspector drawer (components/record/RecordPanel.tsx:478)
- [ ] Cross-link far-side claim (link) → Inspector drawer (components/record/RecordPanel.tsx:395)
- [ ] Open (an earlier/later version) (components/record/RecordPanel.tsx:523)

**Corrections**
- [ ] Row (believed / metric·period) — claim or worse decision opens in the Inspector; a refuted cause finds its inquiry by key and opens it (else the Inquiries ledger); a missed move does not open (components/record/CorrectionsPanel.tsx:47-52, 163, 173; components/record/RecordWorkspace.tsx:103-111)
- [ ] Hover a day column in "When" — date, count and kinds (components/record/CorrectionsPanel.tsx:126-134)
- [ ] Per-kind list Copy / CSV / Show N more (8 a page) (components/record/CorrectionsPanel.tsx:150-151)

**Inspector drawer (any view)**
- [ ] Close (×, "Close (Esc)") (components/record/beside.tsx:35-37)
- [ ] Open full page — switches to that view's Reader (`?id=`) (components/record/Inspector.tsx:81-83)
- [ ] Clickable boxes: the version that replaced it, a warrant claim, each relying decision (claim view) (components/record/Inspector.tsx:108, 116, 125)
- [ ] Clickable boxes: current version, each relied-on claim (decision view) (components/record/Inspector.tsx:165, 176)
- [ ] Clickable boxes: current version, established claims, hypotheses (inquiry view) (components/record/Inspector.tsx:218, 225, 234)

### 2. Dialogs, drawers, popovers, panels
- [ ] Inspector drawer (right, under the tabs, page-keyed) — kind label + close; body by kind; foot "Open full page" + "Esc closes it. To change anything, open the full page." (components/record/Inspector.tsx:47-92; components/record/beside.tsx:15-43)
- [ ] Inspector · Claim — statement + status/tier/counted marks, "This version was replaced", Why it is held, Who relies on it, Who else was told, About it (components/record/Inspector.tsx:98-146)
- [ ] Inspector · Decision — review chip, reopened chip, earlier-version box, What was chosen (+ options not taken), What it relied on, What was expected, What became of it, Dissent (components/record/Inspector.tsx:150-204)
- [ ] Inspector · Inquiry — state chip, earlier-version box, What is established, Hypotheses, Still open, About it (components/record/Inspector.tsx:206-253)
- [ ] Inspector · Mission — state chip, objective, Without damaging, Its last report, About it (components/record/Inspector.tsx:255-286)
- [ ] Dialog "Record a decision" (width 820) — DeclareForm (components/decisions/DecisionsPanel.tsx:106-110)
- [ ] Dialog "Declare a kind of decision" (680) — KindForm (components/decisions/DecisionsPanel.tsx:131-135)
- [ ] Dialog "Bring a meeting's notes" (760; held open while the model reads; refusal shown inside) (components/decisions/DecisionsPanel.tsx:194-218)
- [ ] Dialog "Revise this decision" (820) — DeclareForm with `revises` (components/decisions/DecisionsPanel.tsx:683-687)
- [ ] Dialog "Add an option" (640) (components/decisions/DecisionsPanel.tsx:695-706)
- [ ] Dialog "Record dissent" (640) (components/decisions/DecisionsPanel.tsx:707-724)
- [ ] Dialog "Add a projection" (760) — ProjectForm (components/decisions/DecisionsPanel.tsx:1049-1053)
- [ ] Dialog "Write a mission" (820; description names the connection or "will span every connection") (components/missions/MissionsPanel.tsx:86-91)
- [ ] Dialog "Edit this mission" (820; "Version N — saving writes version N+1 and keeps this one") (components/missions/MissionsPanel.tsx:432-438)
- [ ] Inline panel "Report now" callout — what booking does, who it is sent to (components/missions/MissionsPanel.tsx:411-425)
- [ ] Inline form "Mark wrong" (components/record/kit.tsx:553-576)
- [ ] Inline form "Add a hypothesis" (components/inquiries/InquiriesPanel.tsx:389-411)
- [ ] Inline form "Close this inquiry" (components/inquiries/InquiriesPanel.tsx:532-564)
- [ ] Inline form "Book the outcome" (review due) (components/decisions/DecisionsPanel.tsx:1191-1242)
- [ ] Inline expansion North Star "Why" — reasons by rule + calibration table (components/decisions/NorthStarLine.tsx:59-82)
- [ ] Inline expansion step "Receipt" (mono key: value lines) (components/decisions/DecisionsPanel.tsx:943-947)
- [ ] Inline callout "The next run" (proposed run cost + what it could change) (components/inquiries/InquiriesPanel.tsx:506-527)
- [ ] Dropdown menu Claims "Tools" (Definitions, Map) (components/record/RecordPanel.tsx:254-262)
- [ ] Reader right rail "This inquiry" / "This decision" / "This mission" / "This claim" (components/inquiries/InquiriesPanel.tsx:307-357; components/decisions/DecisionsPanel.tsx:650-674; components/missions/MissionsPanel.tsx:540-559; components/record/RecordPanel.tsx:540-555)

### 3. Figures, counts, badges, chips, freshness/as-of lines
**Inquiries**
- [ ] Figure Open + "N with no run yet" / "each has a run" / "none open" (components/inquiries/InquiriesPanel.tsx:143-144)
- [ ] Figure Waiting + "for <reason>" / "on N different things" (hover lists reasons) (components/inquiries/InquiriesPanel.tsx:145-148)
- [ ] Figure Closed + counts by closed-as (components/inquiries/InquiriesPanel.tsx:149-151)
- [ ] Figure Still open (items) + "across N inquiries" + chip "none says what settles it" (components/inquiries/InquiriesPanel.tsx:152-156)
- [ ] Needs-you rows: "<question> · its check was due <date>" + waiting-for; "open, with no run yet · a deep analysis would take about N tokens here" + ×N (components/inquiries/InquiriesPanel.tsx:162-174)
- [ ] List label "Inquiries" / "Everything else" + count "N" or "N of M" · connection or "N connections" (components/inquiries/InquiriesPanel.tsx:179-184)
- [ ] Row: state dot (green answered/blue open/grey), ×N fold, chip "scheduled", chip "N hypotheses", figure "N still open" (hover lists items), meta (state · runs · next check · owner · opened by · connection · latest) (components/inquiries/InquiriesPanel.tsx:194-219)
- [ ] Reader header state chip (open / waiting for … / closed as …) (components/inquiries/InquiriesPanel.tsx:253)
- [ ] Rail facts: Opened by, Owner, Opened, Connection, State, Next check (date · in N days), Runs, Woken N times (components/inquiries/InquiriesPanel.tsx:310-317)
- [ ] Section metas: N statements, hypotheses "x supported · y refuted · z open · w abandoned", N items, N runs (components/inquiries/InquiriesPanel.tsx:370, 385, 438, 459, 500-504)
- [ ] Claim marks: status (Final/Provisional/To date), tier words, "right X% of N times" / "N so far", "as of <date>", amber "restated since this inquiry established it" (components/record/kit.tsx:431-518; components/inquiries/InquiriesPanel.tsx:378)
- [ ] Hypothesis state chip + evidence line ("tested false:", "held:", "marked false by …", "no run has decided it") + held/proposed by (components/inquiries/InquiriesPanel.tsx:418-426)
- [ ] "N hypotheses proposed again after being refuted here were not re-tested" (components/inquiries/InquiriesPanel.tsx:431-435)
- [ ] Run verdict chip (answered/contradicted/other) + why + date (components/inquiries/InquiriesPanel.tsx:466-479)
- [ ] Proposed run: tokens/minutes from N runs, or ceiling; what it could change; its rule (components/inquiries/InquiriesPanel.tsx:506-527)
- [ ] Lessons: turned out + "believed at the start" (components/inquiries/InquiriesPanel.tsx:485-489)

**Decisions**
- [ ] North Star line "NORTH STAR · <quarter>": N loops closed of N outcomes written · calibration error X over N settled predictions (components/decisions/NorthStarLine.tsx:45-53)
- [ ] North Star Why: "N not closed — <rule>" lines, reliance-without-expectation count, rule sentence, calibration table (metric, method, stated/observed coverage, gap, judged, cannot tell) (components/decisions/NorthStarLine.tsx:61-80)
- [ ] Figure Decisions + counts by how booked + "by <decider>" (components/decisions/DecisionsPanel.tsx:364-368)
- [ ] Figure Review due (amber when >0) + "the oldest since …" / "the next …" / "no review date set" (components/decisions/DecisionsPanel.tsx:369-370)
- [ ] Figure Reviewed + "of N" / "no outcome booked yet" (components/decisions/DecisionsPanel.tsx:371-372)
- [ ] Figure With an expectation "N of M" + "N of M reviewed reached a verdict" or chip "N cannot be scored" (components/decisions/DecisionsPanel.tsx:373-379)
- [ ] Needs-you rows "<q> · review due since <date>" / "<q> · reopened" + detail (components/decisions/DecisionsPanel.tsx:384-395)
- [ ] List count "N of M" · scope (components/decisions/DecisionsPanel.tsx:402-404)
- [ ] Row: review dot (amber due/grey waiting/green reviewed), chip chosen words, amber chip "reopened", figure "review in N days"/"reviewed"/"no review date", meta (decided by/date · source · dissent · connection) (components/decisions/DecisionsPanel.tsx:415-433)
- [ ] Kinds of decision: meta "N kinds"; each kind: name (· retired), moves metrics, reviewed after N days, must say what it expects, approved by, declared by (components/decisions/DecisionsPanel.tsx:129, 142-155)
- [ ] Decisions from a meeting: meta "N to confirm"; result line "N decisions proposed from …"; candidate foot (meeting, date, said by, line found / not found, "proposed by the model"), quoted line (components/decisions/DecisionsPanel.tsx:185-192, 219, 256-262)
- [ ] Reader header review chip (reviewed / review due / awaiting its date) (components/decisions/DecisionsPanel.tsx:589)
- [ ] Rail facts: Answerable, Approvers, Approved (who, where, date, "not a named approver"), Decided, Booked, Kind, Review date (· distance), Toward, Connection, By email, From Google ("N files read here") (components/decisions/DecisionsPanel.tsx:652-672, 879)
- [ ] Options: "N options", chosen chip, recommended chip, cost/reversibility/actor, amber "added on … after the decision" (components/decisions/DecisionsPanel.tsx:743-772)
- [ ] Scenario: "N predictions", assumptions (variable = value — source by who), each prediction band + method chip + "scored inside/outside: actual" chip, method words, must-say lines, licence "x of n scored predictions by this method fell inside", "scored on <date>", by; Limits line (components/decisions/DecisionsPanel.tsx:774-779, 972-1042)
- [ ] What it relied on: "N claims", claim marks, "restated since" note, answered-reopening lines (components/decisions/DecisionsPanel.tsx:782-795)
- [ ] Dissent: "N voices", who, "recorded on …, after the decision" (components/decisions/DecisionsPanel.tsx:797-807)
- [ ] Expectation: text, metric: band (coverage), settles date, booked by; amber hindsight line "Booked …, after the decision it predicts" (components/decisions/DecisionsPanel.tsx:810-827)
- [ ] What became of it: verdict chip + why; actual, baseline, against the expectation, measured date by (components/decisions/DecisionsPanel.tsx:830-843)
- [ ] The inquiry: stages with steps + dates, Loops (amber), backwards/forwards links, "Composed by X." (components/decisions/DecisionsPanel.tsx:899-928)
- [ ] Google read result "N comments read · N new" (components/decisions/DecisionsPanel.tsx:870, 889)
- [ ] Metric field standing line (approved / retired / unknown + consequence) (components/metrics/MetricField.tsx:4-10, 136-140)

**Missions**
- [ ] Figure Missions + counts by state (components/missions/MissionsPanel.tsx:139-140)
- [ ] Figure Running + "N without an owner do not run" / "active and owned" (components/missions/MissionsPanel.tsx:141-142)
- [ ] Figure Interruptions this week "used of budget" + "across N running missions" (components/missions/MissionsPanel.tsx:143-144)
- [ ] Figure Next report (date) + "<name> · in N days" (components/missions/MissionsPanel.tsx:145-146)
- [ ] Needs-you rows "<name> has no owner" / "<name> is proposed" (components/missions/MissionsPanel.tsx:149-162)
- [ ] Row: state dot, state chip (non-active), figure "N of M this week" / "does not run", meta (objective · owner · cadence/next) (components/missions/MissionsPanel.tsx:166-177)
- [ ] Reader header state chip (components/missions/MissionsPanel.tsx:397)
- [ ] Rail facts: Owner, Runs, Scope, May interrupt, May spend, Ceiling (L-levels), Reports (· next), Written by · version (components/missions/MissionsPanel.tsx:541-558)
- [ ] Report: period; objective line; verdict chip; actual, baseline, baseline's range, "not measurable yet" (components/missions/MissionsPanel.tsx:609-623)
- [ ] Constraints: "N constraints", held / broken / cannot tell chip, actual, note (components/missions/MissionsPanel.tsx:625-643)
- [ ] What it watched: "N watches", label, kind, state (components/missions/MissionsPanel.tsx:645-658)
- [ ] What it opened: "N inquiries", counts by state (components/missions/MissionsPanel.tsx:660-671)
- [ ] What it decided: "N decisions", chosen, verdict/outcome/review date (components/missions/MissionsPanel.tsx:673-685)
- [ ] What it cost: interruptions used of budgeted, sends held, spent amount/unit or note, runs, unpriced model calls, actions by level (components/missions/MissionsPanel.tsx:687-700)
- [ ] Lessons (components/missions/MissionsPanel.tsx:702-705)
- [ ] Proposed decisions: "N proposals", each option's predicted range, approved by, reviewed after N days, "composed by code … no model", "Booked: <option> · review <date>" (components/missions/MissionsPanel.tsx:458, 473-479, 504-524)
- [ ] Past reports: "N reports", headline, period, verdict, "open above" (components/missions/MissionsPanel.tsx:577-593)
- [ ] Status lines: "Saved as version N. Version M is kept." and report delivery words (sent / held at the gate / not sent) (components/missions/MissionsPanel.tsx:356-361, 410, 437)

**Claims**
- [ ] Figure Claims (or "Claims on <date>") + breakdown by kind + chip "the newest 500" (components/record/RecordPanel.tsx:191-196)
- [ ] Figure Provisional + "N to date · N final" (components/record/RecordPanel.tsx:197-202)
- [ ] Figure Predictions held % + "x of y scored · z open" (components/record/RecordPanel.tsx:203-206)
- [ ] Figure Counted "N of M" + chip "N not counted yet" (reasons on hover) (components/record/RecordPanel.tsx:207-210)
- [ ] Needs-you row "N messages wait for you to approve “<definition>”" + held on <connection> (components/record/RecordPanel.tsx:214-219)
- [ ] Facet rows: value · count · 6px bar, chosen rows tinted (components/record/kit.tsx:397-411)
- [ ] List tools "N of M · as recorded on <date>" (components/record/RecordPanel.tsx:250-253)
- [ ] Day group headings "Recorded <date>" + "N claims · mostly <kind> · <about> · by <author>" (components/record/RecordPanel.tsx:267-274)
- [ ] Prediction row: verdict dot, verdict chip, band figure (expected band on hover), meta settles/scored/actual (components/record/RecordPanel.tsx:283-297)
- [ ] Claim row: status dot, hypothesis state chip, status / tier chips where they differ from the kind's norm, "restated" chip, value figure, meta (kind · about · as of · owned by · by) (components/record/RecordPanel.tsx:299-316)
- [ ] Coverage card (right: connection): coverage line or "N% of its tables are mapped (x of y)", shopping list "would unlock: …" (top 12) (components/record/RecordPanel.tsx:320-362)
- [ ] Reader header: statement + status + tier chips (components/record/RecordPanel.tsx:423-424)
- [ ] What is held: metric: value unit, range, counted (components/record/RecordPanel.tsx:435-441)
- [ ] Why it is held: "N warrants", detail, kind words, attested by, "cannot be re-run: <why>" (components/record/RecordPanel.tsx:450-467)
- [ ] What would change it: falsifier + "next checked on <date>" (components/record/RecordPanel.tsx:469-473)
- [ ] Who relies on it: "N decisions" (components/record/RecordPanel.tsx:475)
- [ ] Who else was told: "N messages", Sent / Held at the gate / state, to whom, date, kind, by, their verdict (components/record/RecordPanel.tsx:483-500)
- [ ] Linked in other connections: "N links", near/far type, connection, relationship name, domain, far claims count "the newest N of M claims" + status/tier marks (components/record/RecordPanel.tsx:366-405, 502-507)
- [ ] Every version: "N versions", version (— this one), as of, recorded, status, state (components/record/RecordPanel.tsx:509-530)
- [ ] Rail facts: Kind, About, Owner, Author, As of, Recorded, Definition version, Valid until, Version (components/record/RecordPanel.tsx:540-555)

**Corrections**
- [ ] Figure Corrections + "not counted: N <kind>s re-booked, same words" / "each one changed what was said" (components/record/CorrectionsPanel.tsx:107-109)
- [ ] Figures for the two largest kinds (Restated / Refuted causes / Missed moves / Predictions that missed / Decisions that went worse) (components/record/CorrectionsPanel.tsx:28-34, 110-113)
- [ ] Figure Other kinds + list + chip "none recorded is not none happened" (components/record/CorrectionsPanel.tsx:114-119)
- [ ] Card "When" — corrections per day, last 14 days, "N corrections · last 14 days" (components/record/CorrectionsPanel.tsx:124-136)
- [ ] Per-kind card count + single shared connection name (components/record/CorrectionsPanel.tsx:152-154)
- [ ] Day group heading + "N corrections" (components/record/CorrectionsPanel.tsx:155)
- [ ] Prediction-missed row: metric · period, red dot, verdict chip, actual figure, "expected <band>" (components/record/CorrectionsPanel.tsx:159-170)
- [ ] Other row: first sentence believed, grey dot, "now:" / "tested false:" replacement (components/record/CorrectionsPanel.tsx:172-179)

**Shared**
- [ ] "Recorded as <name>" actor line in every write form (hover: sign-in vs install login) (components/record/kit.tsx:87-95)
- [ ] ListCard paging line "N of M shown · Copy and CSV take all M" (components/record/kit.tsx:314-318)
- [ ] Mark-wrong outcome "Recorded: N inquiries … woke and N decisions … reopened." / "Recorded. Nothing else relied on it." (components/record/kit.tsx:580-586)

### 4. Keyboard shortcuts
- [ ] Esc closes the Inspector drawer (window keydown while open) (components/record/beside.tsx:46-53; components/record/Inspector.tsx:61)
- [ ] Focus moves to the drawer's close button on open / on a new record (components/record/beside.tsx:27-28)
- [ ] Esc / Close / Cancel put away every FormDialog (components/decisions/DecisionsPanel.tsx:104-106)
- [ ] Radix dropdown keyboard (Claims Tools menu) (components/record/RecordPanel.tsx:254)
- [ ] No page-level shortcuts otherwise.

### 5. URL params / deep links
- [ ] `?tab=record` — written whenever the Record shows (app/page.tsx:1241-1261)
- [ ] Legacy `?tab=inquiries|decisions|missions|claims|corrections` — opens the Record on that view (app/page.tsx:887, 982-988, 1011-1012)
- [ ] `?layer=<view>` — read on load and Back (app/page.tsx:1106, 1288-1289), written (1242, 1258)
- [ ] `?id=<record id>` — read on load (app/page.tsx:1149-1150) and on popstate (1285); written only on the Record (1249, 1255); opening/leaving a Reader is a pushState, so Back closes it (1259-1264)
- [ ] `?conn=` — written by the shell; feeds Decisions (declare), Missions (write), Claims (coverage) as selectedConn (app/page.tsx:1262, 1983)
- [ ] In-app event `requestTab("decisions", {id})` (Revise, inquiry Open it →) — sets view + id (components/decisions/DecisionsPanel.tsx:686, 958; app/page.tsx:1177-1197)
- [ ] `openRecord(view, id)` — how other screens open a record here (app/page.tsx:1762-1767)
- [ ] Inspector drawer state is NOT in the URL (page-keyed state, gone on view/id change) (components/record/Inspector.tsx:56-58)
- [ ] Outbound: /receipt/<ref> (new tab), Semantic Layer, Ontology, Monitors, chat (Ask why), Data Canvas (Open the run) (app/page.tsx:1984-1991)
- [ ] The view components read no URL params themselves.

### 6. Empty / error / loading / withheld states
- [ ] Every read: "Loading <what>…" then "Could not read <what> — <err>." + Retry (what = inquiries, the inquiry, decisions, the decision, the kinds of decision, the meeting's proposals, the scenario, the past cases, missions, the mission, the mission's report, the proposals, the Record, coverage, the claim, the versions, corrections) (components/record/kit.tsx:59-65; components/ui/states.tsx:38-39, 72)
- [ ] Inquiries empty: "No inquiry has been opened yet. A deep analysis opens one, and so does an alert that fires." / "No inquiry is <filter> right now." (components/inquiries/InquiriesPanel.tsx:191-193)
- [ ] Inquiries Needs you empty: "Nothing needs you · the next check is <when>" (components/inquiries/InquiriesPanel.tsx:159)
- [ ] Inquiry Reader absences: "Nothing is established yet…", "No hypothesis is recorded…", "Nothing is left open…", "No decision cites this inquiry yet.", "It was closed without a lesson written.", "Lessons are written when a person closes the inquiry." (components/inquiries/InquiriesPanel.tsx:372, 413, 440, 451, 491, 542)
- [ ] Inquiry write results: "Handed over. Nothing was sent: the name is on the record.", "It waits until that day, then wakes on its own.", "…open again.", refuted look-alike warning on Add (components/inquiries/InquiriesPanel.tsx:325, 331, 338, 343, 399-401); error role=alert (361)
- [ ] Superseded callouts: "This is an earlier version of the inquiry." / "This is the decision as first booked; it has been restated since." / "This version was replaced." (components/inquiries/InquiriesPanel.tsx:363-368; components/decisions/DecisionsPanel.tsx:688-693; components/record/RecordPanel.tsx:429-434)
- [ ] Decisions empty: "No decision is on the record yet. Accepting a recommendation or approving an action books one." / "No decision is in "<filter>" right now." (components/decisions/DecisionsPanel.tsx:412-414)
- [ ] North Star: hidden while loading; "The North Star could not be read: <err>"; "No outcome was written this quarter, so no loop could close."; "calibration error: no prediction settled this quarter" (components/decisions/NorthStarLine.tsx:31-34, 52, 62)
- [ ] Kinds empty: "None declared. A kind says who approves…" (components/decisions/DecisionsPanel.tsx:137-139)
- [ ] Meetings empty: "Nothing waits to be confirmed…"; candidate "its line was not found in the notes — read it before confirming" (components/decisions/DecisionsPanel.tsx:222-223, 259)
- [ ] Decision Reader absences: options "Only the choice was recorded…", scenario "No scenario has been projected…", "No claim was cited…", "No dissent was recorded.", expectation "…it cannot close a loop.", outcome "Its review date is …", outcome-due "Its review date has come and no outcome is booked…" (components/decisions/DecisionsPanel.tsx:746, 993, 784, 799, 820-821, 847-850, 1219)
- [ ] Decision hindsight warning (amber): expectation booked after the decision cannot close a loop (components/decisions/DecisionsPanel.tsx:822-827); declare-form hints for empty metric / past decided-on date (545-547, 558-563)
- [ ] Withheld: Google reading unavailable says which piece is missing instead of a field (components/decisions/DecisionsPanel.tsx:880-881); past cases fewer than needed explained (1165-1169)
- [ ] Reopened callout: "Reopened: a claim this decision relied on was restated… Nothing was undone." (components/decisions/DecisionsPanel.tsx:725-741)
- [ ] Missions empty: "No mission is written yet · a mission says what to achieve and what not to damage" (components/missions/MissionsPanel.tsx:123-133); Needs you empty "Nothing needs you · every live mission is owned and running" (149); "—" figures with "none is running" / "none is due to report" (143-146)
- [ ] Mission Reader: report note "no report yet; the first is due …" (components/missions/MissionsPanel.tsx:574); past-report callout (562-569); proposals empty "No declared kind of decision moves <metric>…" (461-462); absences for past reports, constraints, watches, opened, decided, lessons (579, 626, 647, 661, 674, 703); "not measurable yet — the objective's metric needs an approved definition" (620); Report now "It has no owner, so there is nobody to send it to." (417)
- [ ] Claims empty: "Nothing was on the record on <date>." / "No claim matches that." / "Nothing is on the record yet. An answer, a finding, a tested hypothesis and a booked prediction each land here." (components/record/RecordPanel.tsx:264-266); Needs you empty "Nothing needs you · predictions are scored by code on their day" (213)
- [ ] Claims withheld: chip "the newest 500" when the cap is hit (components/record/RecordPanel.tsx:195)
- [ ] Coverage: "Coverage is measured per connection · choose one…" / "Coverage is not measured for this connection yet" / "Nothing is listed as missing" (components/record/RecordPanel.tsx:322, 343, 350)
- [ ] Claim Reader absences: no warrant, nothing would change it / no re-check, "No decision cites this claim.", nobody told (components/record/RecordPanel.tsx:452, 472, 476, 485)
- [ ] Withheld cross-link: "<type> is linked to a type in a connection you may not see. Withheld: nothing of that connection is listed here." (components/record/RecordPanel.tsx:369-375); read failure "The organisation's ontology could not be read just now, so no link is listed." (504)
- [ ] Corrections empty: "Nothing is recorded as corrected yet: no figure restated, no cause refuted, no prediction scored outside its band." (components/record/CorrectionsPanel.tsx:138-144); Needs you "Nothing needs you · each correction is booked as it happens" (122); per-kind "No <kind> recorded." (156); "none recorded is not none happened" (118)
- [ ] Inspector absences incl. "It has no owner, so it does not run." (components/record/Inspector.tsx:114, 123, 132, 174, 184, 192, 223, 232, 238, 266, 272, 277)
- [ ] Mark-wrong notes: "It is kept, as refuted." / "The wrong version is kept; whatever relied on it is told." (components/record/kit.tsx:570-572)

### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] All views: GET /rbac/me via useMe/useActor (who a write is recorded as) — read (components/record/kit.tsx:81-84; lib/useMe.ts:9)
- [ ] Inquiries ledger: GET /record/inquiries?limit=300 (components/inquiries/InquiriesPanel.tsx:81)
- [ ] Inquiry Reader: GET /record/inquiries/{id} (components/inquiries/InquiriesPanel.tsx:248)
- [ ] Decisions ledger: GET /record/north-star (components/decisions/NorthStarLine.tsx:29), GET /record/decisions?limit=300 (components/decisions/DecisionsPanel.tsx:97), GET /record/decision-kinds (126), GET /record/meetings/candidates?status=proposed (167)
- [ ] Record-a-decision / Revise dialog: GET /record/decision-kinds?state=active (components/decisions/DecisionsPanel.tsx:473); governed metrics via getMetrics, cached 1 min (components/metrics/MetricField.tsx:24-38)
- [ ] Decision Reader: GET /record/decisions/{id} (components/decisions/DecisionsPanel.tsx:584), GET /record/decisions/{id}/scenarios (610), GET /record/calibration?connection_id= (611), GET /record/inquiry-view/{id} (900) — reads
- [ ] Projection dialog, method "Past decisions like it": GET /record/decisions/{id}/cases (components/decisions/DecisionsPanel.tsx:1080-1081)
- [ ] Missions ledger: GET /record/missions (components/missions/MissionsPanel.tsx:75)
- [ ] Write/Edit mission dialog: GET /record/missions/templates?connection_id= (components/missions/MissionsPanel.tsx:198-199) + metrics
- [ ] Mission Reader: GET /record/missions/{id} (components/missions/MissionsPanel.tsx:370)
- [ ] ⚠ Mission Reader — SPENDS (warehouse) on open: GET /record/missions/{id}/report?compose=true composes the report now by running SQL on the connection (run_sql_for); re-runs on each version / report change (components/missions/MissionsPanel.tsx:537-538; pramanyx/routers/record.py:1071-1083)
- [ ] ⚠ Mission Reader, active mission — SPENDS (warehouse) on open: GET /record/missions/{id}/proposals measures the objective with run_sql_for (components/missions/MissionsPanel.tsx:456, 576; pramanyx/routers/record.py:369-384)
- [ ] Past report: GET /record/missions/{id}/reports/{rid} — read (components/missions/MissionsPanel.tsx:538)
- [ ] Claims ledger: GET /record/claims?limit=500[&as_of=] (components/record/RecordPanel.tsx:89); GET /onboarding?connection_id=<selectedConn> — read, "never builds" (components/record/RecordPanel.tsx:90-91; pramanyx/routers/onboarding.py:17-31)
- [ ] Claim Reader: GET /record/claims/{id}, GET /record/claims/{id}/versions, GET /ontology/claim-links/{id} (components/record/RecordPanel.tsx:414-417)
- [ ] Corrections: GET /record/corrections?limit=500 (components/record/CorrectionsPanel.tsx:46)
- [ ] Corrections refuted-cause click: GET /record/inquiries?limit=500 to resolve the key (components/record/RecordWorkspace.tsx:105)
- [ ] Inspector drawer: GET /record/claims/{id} | /record/decisions/{id} | /record/inquiries/{id} | /record/missions/{id} (components/record/Inspector.tsx:99, 151, 207, 256)
- [ ] Writes on click only (all POST, lib/record.ts:36): /record/claims/{id}/wrong; /record/inquiries/{id}/owner|next-check|hypothesis|propose|close; /record/decisions; /record/decision-kinds; /record/meetings/candidates (⚠ SPENDS one model call); …/candidates/{id}/confirm|refuse; /record/decisions/{id}/amend|stands|scenario (⚠ "Its own history" reads the warehouse)|outcome|google-file; /record/missions; /record/missions/{id}/state; /record/missions/{id}/report?deliver= (books, and may SEND via the gate)

Top rows today: the Workspace's view-tab row (Inquiries · Decisions · Missions · Claims · Corrections, components/Workspace.tsx:81-91) is the only shared top row — no title, no context bar, no toolbar. Below it each view's first row differs: Decisions opens on the North Star line (NorthStarLine.tsx:43-58) then the figures; Inquiries, Missions, Claims and Corrections open on their four-figure tally. Each ledger's controls sit in its list card's label row (count · filter · primary action · Copy · CSV): Inquiries — All/Open/Waiting/Closed + Ask why (InquiriesPanel.tsx:181-190); Decisions — All/Review due/Awaiting/Reviewed + Record a decision (DecisionsPanel.tsx:401-411), with Declare a kind and Bring a meeting's notes as section actions lower down (130, 193); Missions — Write a mission (MissionsPanel.tsx:165); Claims — count + Tools ▾ (Definitions, Map) (RecordPanel.tsx:249-263), with Find / As of / facets in a left column (223-245); Corrections — a count per kind card. A Reader's top row is its BackHeader: "<Ledger>" / title / status chip, and for Missions the Edit · Report now · state buttons at the right (kit.tsx:112-127; MissionsPanel.tsx:396-408); Decisions puts "Revise this decision" as the first body row (DecisionsPanel.tsx:677-681).

---

## Evidence
Entry: rail row "Evidence" → `?tab=evidence` (Intelligence layer `evidence`, app/page.tsx:955); renders `EvidencePanel` with connectionId (+ canvasId inside a Data Canvas) (components/IntelligenceWorkspace.tsx:293).
### 1. Controls
**Shared Intelligence context bar**
- [ ] Connection select / Schema select / scope maturity (components/IntelligenceWorkspace.tsx:204, :221, :238)

**Lead row**
- [ ] Refresh — re-reads claims and run names (components/EvidencePanel.tsx:161)
- [ ] Retry (on "Could not read the claim ledger") (components/EvidencePanel.tsx:166)

**Needs you**
- [ ] Review — sets the filter to "unreviewed" and selects the first unreviewed claim (components/EvidencePanel.tsx:192)
- [ ] Show (disputed) — sets the filter to "disputed" (components/EvidencePanel.tsx:197)

**Claims card**
- [ ] Filter segmented: all · unreviewed · validated · disputed · needs context (each with its count) (components/EvidencePanel.tsx:204)
- [ ] Copy — copies the shown claims table (claim, deep analysis, review, confidence, mentions, query, recorded) as cells (components/EvidencePanel.tsx:207; components/TableActions.tsx:104)
- [ ] CSV — downloads the same table as `claims` CSV (components/EvidencePanel.tsx:207; components/TableActions.tsx:110)
- [ ] Claim row (button, aria-current) — selects the claim into the reader (components/EvidencePanel.tsx:238)
- [ ] Run group head hovers: full question; full timestamp (components/EvidencePanel.tsx:224, :226)

**Claim reader (right column, sticky)**
- [ ] Validated / Disputed / Needs context (aria-pressed) — POST feedback on the claim; optimistic, rolled back on failure (components/EvidencePanel.tsx:310)
- [ ] Re-examine — sends "Re-examine this claim: <text>" to a deep analysis (components/EvidencePanel.tsx:317)
- [ ] "recorded <ago>" hover = full timestamp (components/EvidencePanel.tsx:283)
### 2. Dialogs, drawers, popovers, panels
- [ ] Claim reader panel beside the list: label + recorded, head + rest of the claim, confidence/mentions chips, "from <run>", "The query behind it" SQL block (scrolls at 280px), Review buttons, Re-examine (components/EvidencePanel.tsx:275)
### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Lead count: "N claims · N deep analyses" or "the latest 80 claims · …" (hover: older not shown) (components/EvidencePanel.tsx:156)
- [ ] Needs you: "N claims no one has reviewed" + detail; "N claims disputed" (components/EvidencePanel.tsx:190, :195)
- [ ] Filter counts per segment (components/EvidencePanel.tsx:206)
- [ ] Run group: title, "scheduled" chip, "<day> · N claims" (components/EvidencePanel.tsx:224, :225, :227)
- [ ] Claim row: review dot (green validated / red disputed / amber needs context / grey not reviewed), "no query" chip (components/EvidencePanel.tsx:243, :245)
- [ ] Footer: "N of M shown · Guard results and refusals are not recorded with a claim." (components/EvidencePanel.tsx:259)
- [ ] Reader chips: "confidence not counted" or "confidence 0.80" (hover: older, not counted); "mentions <metric>" (hover: a keyword, not a link) (components/EvidencePanel.tsx:289, :294)
- [ ] "Counted by the alerts until marked; it does not change future claims." (components/EvidencePanel.tsx:323)
### 4. Keyboard shortcuts
- [ ] None.
### 5. URL params / deep links
- [ ] None of its own; reached by `?tab=evidence` or `?tab=intelligence&layer=evidence`; `?conn=` sets the scope (app/page.tsx:955)
### 6. Empty / error / loading / withheld states (quote the gist)
- [ ] Lead: "What the deep analyses on this connection (or this canvas) claimed, and the query behind each — newest first." (components/EvidencePanel.tsx:153)
- [ ] "Loading the claim ledger…" / "Could not read the claim ledger — … Retry" (components/EvidencePanel.tsx:166, :169)
- [ ] "No claims yet — each deep analysis on this connection records the claims it made and the query behind each." (components/EvidencePanel.tsx:175)
- [ ] Needs you empty: "Every claim here has been reviewed." (components/EvidencePanel.tsx:187)
- [ ] Filter empty: "No claim here is <filter>." (components/EvidencePanel.tsx:216)
- [ ] Reader: "No query was recorded for this claim." (components/EvidencePanel.tsx:304)
- [ ] "Not saved — <reason>" on failed feedback (components/EvidencePanel.tsx:326)
- [ ] Unnamed run fallback: "deep analysis <id8>" (components/EvidencePanel.tsx:130)
### 7. Loads on open (API calls; flag WRITES / SPENDS)
- [ ] GET /investigations/evidence/recent?connection_id=&canvas_id=&limit=80 (components/EvidencePanel.tsx:113; lib/api.ts:5396)
- [ ] GET /investigations?limit=200 — run questions to name groups (components/EvidencePanel.tsx:116; lib/api.ts:11701)
- [ ] Nothing on open writes or spends. On click: Validated/Disputed/Needs context = POST /investigations/{run}/evidence/{claim}/feedback WRITES; Re-examine opens Ask in investigate mode and auto-sends = SPENDS (model + warehouse) (lib/api.ts:5409; components/IntelligenceWorkspace.tsx:184; components/ChatPanel.tsx:954)

Top rows today: no title row; shared context bar above; the page's first row is the lead sentence with the claims/deep-analyses count and Refresh at its right, then Needs you; the claims card label row holds the filter segmented + Copy + CSV.
