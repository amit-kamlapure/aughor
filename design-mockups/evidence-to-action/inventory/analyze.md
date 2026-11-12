# Feature inventory — Analyze pages: SQL Editor · Dashboards · Spreadsheets

2026-11-10 · parity baseline for the platform-wide UI redesign. The rule: **"Do not remove features as a cost of redesign."** Every `- [ ]` line below must still be reachable after the redesign; tick it when you have checked it on the redesigned page.

Read from code only, on branch `claude/seven-destinations` (nothing was run, no API was called). Each line is `- [ ] <item> — <what it does> (path:line)`. Paths are under `web/` unless they start with `pramanyx/`. `web/app/page.tsx` was being edited by another session while this was read, so its line numbers may drift by a few lines.

Marks used on API calls: **WRITES** = changes stored state; **SPENDS** = runs a model or a warehouse query. A mark on a control means "on click"; a mark under **Loads on open** means the page does it without being asked.

## Counts

| Page / mode | Items |
|---|---|
| 1.0 SQL Editor — workbench (both modes: mode switch, connection, saved queries, catalog rail, version rail, URL) | 65 |
| 1.1 SQL Editor — SQL mode start page (no tab open) | 21 |
| 1.2 SQL Editor — SQL mode editor (tabs, toolbar, editor, parameters, results, grid, history) | 126 |
| 1.3 SQL Editor — Visual mode (QueryBuilder) | 58 |
| 2.0 Dashboards — Intelligence workspace chrome above the layer | 6 |
| 2.1 Dashboards — view mode | 102 |
| 2.2 Dashboards — builder (edit) mode | 130 |
| 2.3 Dashboards — Metrics dashboard / ledger | 36 |
| 2.4 Dashboards — New dashboard dialog (six ways) | 9 |
| 2.5 Dashboards — shared Apps and doors in | 5 |
| 2.6 Dashboards — piece-kind table (26 kinds) | table |
| 3.x Spreadsheets — page-wide | 4 |
| 3.1 Spreadsheets — home | 37 |
| 3.2 Spreadsheets — open sheet: bar, views, toolbar, grid, column/selection menus, groups, keys | 182 |
| 3.3–3.13 Spreadsheets — board 11 · calendar 13 · record 17 · history 19 · sharing 18 · chat 30 · combine 13 · new sheet/import 26 · ontology 15 · make a dashboard 10 · remove 11 | 183 |
| **Total** | **964** |

## What the pages do on open that WRITES or SPENDS (read before redesigning loading)

- **SQL Editor — `POST /query/validate` runs live warehouse probes on open.** The editor's guard linter fires as soon as a restored tab holding SQL mounts, and again on each edit or parameter change (join and filter value-domain probes), to colour the "Guards clean / Checked — N notes" chip (components/query/editor/diagnostics.ts:184-205; pramanyx/routers/query.py:1382-1387).
- **SQL Editor — Visual mode is mounted even when SQL mode is the landing mode**, so every open also calls `GET /metrics` and `GET /connections/{id}/measure-grains`, which opens the warehouse and probes measure columns when no ontology grains and no cache exist (components/QueryBuilder.tsx:1118, :1171-1177; pramanyx/routers/query.py:1971-1999).
- **SQL Editor — a query handed over to Visual mode runs at once** on arrival (components/QueryBuilder.tsx:1454-1486).
- **Dashboards — opening a dashboard runs `POST /cards/{id}/run` once per placed card**, again on every period change and under each "Preview as" group; each run executes the card's SQL and records the result as the card's latest value (writes too). Ontology pieces run `POST /objects/query` / `/objects/list`; big metric tiles read a trend (all warehouse).
- **Dashboards — the Metrics tab is the default landing tab**: it measures every approved metric (`POST …/briefing/measures`) then reads one trend per metric.
- **Dashboards builder — the Variables tab counts every set, chain step and value through `POST /objects/query`** as soon as it is open; every edit writes a dashboard version (`PUT /dashboards/{id}`).
- **Spreadsheets — "Make a dashboard" runs every offered card's query on open** (on the Sheets store, no model, nothing kept), and **New sheet opened from an uploaded file writes a staged copy at once** (`POST /sheets/files/uploaded`). Nothing else on the sheets page writes or spends on open.

## Things the parity check should know

- Reachable from one place only: in Dashboards, **Publish as an App, Retire and Preview as** live only on the builder's edit bar; **which dashboard is open** is kept in localStorage, not the URL, and the builder has no URL state (a reload drops back to view mode); the **"Move it here"** offer for a dashboard kept in a Data Canvas shows once, on the strip. In the SQL Editor, **Recent runs, Keyboard shortcuts, Copy share link and Version history** are inside Tools ▾ only — and Tools ▾ is hidden on the start page.
- Two of the same thing, worth folding without losing either's abilities: the SQL Editor has **two chart customisers** (Visual's CUSTOMIZE tab: title, labels, colour scheme, number format, legend, axis titles; SQL's "Edit visualization" side panel: type, dimension, metric, aggregation, orientation, transform, colour by field, reference lines, PNG download) and **two Pin flows** (Visual's named pin that keeps the chart settings and is re-guarded; SQL's Tools ▾ pin titled "Query — <table>").
- Hard deletes with no confirm: the Saved menu's ✕ deletes a saved query at once (components/query/SavedQueryBar.tsx:300-307).
- Not features today (no control reaches them — do not "restore" them by accident): Visual mode's top-level time range/grain and add-join picker (components/QueryBuilder.tsx:1045, :1064-1069, :1247); Spreadsheets has no "delete row" although `POST /sheets/{id}/rows/remove` exists (lib/sheets.ts:543-544); the Dashboards builder's layout pane has a `words` slot nothing fills (components/dashboards/DashboardBuilder.tsx:138, :269).
- Each section ends with **Top rows today** — the controls that sit in the page's own header/toolbar rows now, to be folded into the new title row and one toolbar row.


## 1. SQL Editor

Data destination, rail row "SQL Editor" → Data workspace layer `query` (`?tab=query`; legacy `?tab=builder` opens Visual mode). Rendered by `QueryWorkbench` (web/app/page.tsx:2294), with the Data workspace's own layer tabs hidden — "the rail is the switcher" (web/app/page.tsx:2290). The app shell's breadcrumb/title ("Data › SQL Editor") sits above the page (web/app/page.tsx:1863). One workbench holds two modes; both stay mounted once opened (display:none), so switching keeps drafts, undo history and fetched state. Paths below are under `web/` unless stated.

### 1.0 Workbench — shared by both modes

**Controls**
- [ ] Mode segmented "Visual" / "SQL" — titles "Compose a query without writing SQL" / "Write SQL with completion and guards"; SQL is the default; writes `?mode=` (components/query/QueryWorkbench.tsx:56-59, :446, :228-231)
- [ ] Connection select — "The warehouse this workbench queries, in both modes"; "Select a connection…" when none; defaults to the first of the workspace's connections (components/query/QueryWorkbench.tsx:447-457, :198-202)
- [ ] Saved ▾ button — bookmark icon, the open saved query's name (else "Saved"), count of saved queries; opens the Saved menu and re-reads the list (components/query/SavedQueryBar.tsx:216-226)
- [ ] Save button — "Save" / "Saving…" / "Saved ✓"; updates the open saved query when it belongs to the current mode, else opens "Save query as" (title says "Save as a new query — “x” was written in the visual composer / SQL editor") (components/query/SavedQueryBar.tsx:228-241, :177-187)
- [ ] Saved menu — "SAVED QUERIES · N" header, "+ Save current as…" (disabled when nothing to save) (components/query/SavedQueryBar.tsx:253-271)
- [ ] Saved menu row — name, one-line SQL, "visual"/"sql" (which mode it opens in); click opens it in the mode it was authored in (components/query/SavedQueryBar.tsx:278-299; QueryWorkbench.tsx:235-239)
- [ ] Saved menu row ✕ "Delete saved query" (hover-revealed) — deletes at once, no confirm (`DELETE /saved-queries/{id}`) — WRITES (components/query/SavedQueryBar.tsx:300-307, :205-212)
- [ ] "Save query as" popover — "Query name" input (prefilled from tab name / FROM clause / builder tables+measures), Enter saves, Escape cancels, "Cancel" / "Save" — WRITES (components/query/SavedQueryBar.tsx:315-354)
- [ ] Sync chip "linked" (visual spec and SQL describe the same query) / "sql-ahead" (SQL is the source of truth) — shown only for a saved query (components/query/QueryWorkbench.tsx:473-480)
- [ ] Workbench Tools ▾ items: "Version history" / "Hide version history" (only once saved), "Copy share link", "Show catalog" / "Hide catalog" — merged into the editor's Tools ▾ in SQL mode; its own Tools ▾ at the end of Visual mode's row (lib/query/workbench.ts:170-183; components/query/QueryWorkbench.tsx:432-441, :504, :564)
- [ ] Catalog rail ⇄ modes split — drag handle, 200–560 px, persisted `workbench.catalog` (components/query/QueryWorkbench.tsx:526-532)
- [ ] Version rail split (right) — drag handle, 240–620 px, persisted `workbench.versions` (components/query/QueryWorkbench.tsx:517-523)

**Catalog rail (one instance, both modes)**
- [ ] Section label "CATALOG" with "N tables" at its right (components/query/CatalogRail.tsx:75-78)
- [ ] Visual-mode hint line "Click to add · drag a column onto Dimensions or Metrics" (components/query/QueryWorkbench.tsx:539)
- [ ] Search "Search tables & columns…" — fuzzy (Fuse) over table and column names; ✕ clears; a search expands every match (components/query/CatalogTree.tsx:276-292, :208-216)
- [ ] Connection root node (one connection) — click folds the tree; table count (components/query/CatalogTree.tsx:314-329)
- [ ] Connection tier (SQL mode browses the whole workspace via `/catalog/tree`) — one node per connection with count; only the active one opens by default (components/query/CatalogTree.tsx:341-354; QueryWorkbench.tsx:326-361)
- [ ] Schema node — toggle, schema name as stored, table count; a sole schema opens by default (components/query/CatalogTree.tsx:360-379, :257)
- [ ] Table row chevron — "Expand columns" / "Collapse columns" (components/query/CatalogTree.tsx:390-397)
- [ ] Table row name click — SQL: inserts the qualified name at the cursor ("Insert x at the cursor"); Visual: adds it to the query with auto-join ("Add x to the query (auto-join)") (components/query/CatalogTree.tsx:398-412; QueryWorkbench.tsx:399-406; QueryBuilder.tsx:1366-1369)
- [ ] Table row count (compact) (components/query/CatalogTree.tsx:411)
- [ ] `»` insert button (SQL mode, hover/focus-revealed) — empty editor gets `SELECT * FROM t LIMIT 100`, an editor with SQL gets the name at the cursor, no tab open opens one; a table on another connection switches the connection first (components/query/CatalogTree.tsx:111-135, :420; QueryWorkbench.tsx:382-389; modes/SqlMode.tsx:454-458)
- [ ] `»` hover card (TableCard) — table name, "schema · connection", copy-name button ("Copied"), facts Rows / Columns ("not read yet") / Joins, the `»` rule in words, "Preview data" (runs `SELECT * … LIMIT 100` in a new tab) — SPENDS warehouse on click (components/query/TableCard.tsx:39-82; modes/SqlMode.tsx:459-464)
- [ ] `⋈n` join-degree badge — "n related tables" (components/query/CatalogTree.tsx:421-428)
- [ ] "isolated" badge — "No detected joins to other tables" (components/query/CatalogTree.tsx:431-435)
- [ ] Column row — type icon, name, type word on hover, "FK" mark; click: SQL inserts the bare column, Visual adds it as a dimension (components/query/CatalogTree.tsx:446-471; QueryBuilder.tsx:1367)
- [ ] Visual-only table status at the row's right: "primary", joined "✓" (title = ON clause) / "⚠" ("no join — wire in SQL"), "isolated", hover "+ add" ("Add to query (auto-join)") (components/QueryBuilder.tsx:1300-1332)
- [ ] Visual-only column buttons "D" (Add as dimension) and "M" (Add as metric → Configure Metric) on hover (components/QueryBuilder.tsx:1335-1357)
- [ ] Visual-only drag a column (grab dots) onto Dimensions or Metrics (components/query/CatalogTree.tsx:449-462; QueryBuilder.tsx:1362-1365)
- [ ] Visual-only highlight: tables in the query are shaded and expanded, their schema opened (components/query/CatalogTree.tsx:249-252, :383-388)

**Version rail (right; a saved query's history)**
- [ ] "VERSIONS" label with count (components/query/VersionRail.tsx:126)
- [ ] Version row — "vN", "current" on the newest, relative time (full timestamp on hover); selecting diffs it against the one before, never loads it (components/query/VersionRail.tsx:139-157)
- [ ] Field-change line — "N changes" / "No field changes", then each changed path — kind (components/query/VersionRail.tsx:168-195)
- [ ] "Restore" — restores the selected version onto the live query (disabled on current) → toast "Restored version N", editor reloads — WRITES (components/query/VersionRail.tsx:174-183, :102-113; QueryWorkbench.tsx:592-604)
- [ ] Unified read-only SQL diff (MergeView, unchanged lines collapsed) (components/query/VersionRail.tsx:77-98)

**Dialogs / drawers / popovers / panels**
- [ ] Saved menu popover (list + "+ Save current as…") (components/query/SavedQueryBar.tsx:243-313)
- [ ] "Save query as" naming popover (components/query/SavedQueryBar.tsx:315-354)
- [ ] Workbench Tools ▾ dropdown (components/catalog/CatalogTools.tsx:79-101)
- [ ] `»` table hover card (components/query/CatalogTree.tsx:116-133)
- [ ] Version rail panel (components/query/QueryWorkbench.tsx:589-606)

**Figures / counts / badges / chips**
- [ ] Saved count on the Saved button and menu header (components/query/SavedQueryBar.tsx:225, :260)
- [ ] linked / sql-ahead chip (components/query/QueryWorkbench.tsx:473-480)
- [ ] Catalog "N tables"; per connection / schema / table counts; row counts; ⋈n; isolated; FK (components/query/CatalogRail.tsx:76; CatalogTree.tsx:326, :352, :377, :411, :426, :433, :470)
- [ ] Versions count, vN, current, relative time, N changes (components/query/VersionRail.tsx:126-171)

**Keyboard shortcuts**
- [ ] Escape closes the Saved menu and the naming popover (components/query/SavedQueryBar.tsx:122-129)
- [ ] Enter saves / Escape cancels in "Save query as" (components/query/SavedQueryBar.tsx:332-335)

**URL params / deep links**
- [ ] `?tab=query` opens the workbench; `?tab=builder` (legacy) opens it in Visual mode (web/app/page.tsx:907-908, :1141)
- [ ] `?mode=visual|sql` — read on mount, written (replaceState) on every mode switch (components/query/QueryWorkbench.tsx:62-75, :186-190)
- [ ] `?query=<savedQueryId>` — opens a shared saved query once per connection, found in that connection's list (components/query/QueryWorkbench.tsx:245-265)
- [ ] `?conn=<id>` — the app-level connection param (written by the shell; part of the share link) (components/query/QueryWorkbench.tsx:277)
- [ ] Copy share link — writes `?tab=query&conn=<id>&query=<id>` to the clipboard (components/query/QueryWorkbench.tsx:269-287)
- [ ] Hand-off in ("Open in Query" from a finding's evidence or a chat answer): `mode:"sql"` opens a NEW tab on that connection; otherwise Visual mode loads the SQL and RUNS it (web/app/page.tsx:1796-1807; components/query/QueryWorkbench.tsx:204-221; QueryBuilder.tsx:1454-1486)
- [ ] Hand-off out: Schedule ▸ "Open in Monitors" stores a monitor draft and opens Monitors on this connection (components/query/QueryWorkbench.tsx:292-296)

**Empty / error / loading / withheld states**
- [ ] Shared link that cannot be opened — toast "That shared query could not be opened — it may have been deleted." / "That shared query could not be opened." (components/query/QueryWorkbench.tsx:262-264)
- [ ] Share without a saved query — toast "Save this query first — a share link points at a saved query."; success "Share link copied"; clipboard failure "Copy failed — the link is …" / "Copy unavailable — the link is …" (components/query/QueryWorkbench.tsx:270-286)
- [ ] Saved menu empty — "No saved queries for this connection yet." (components/query/SavedQueryBar.tsx:274-277)
- [ ] Save/update failure — toast "Could not save" / "Could not update" + server words (components/query/SavedQueryBar.tsx:148, :166)
- [ ] Catalog — "Loading catalog" skeleton (distinct from empty), "No schema loaded.", "No match.", "No columns available — the schema may need a refresh." (components/query/CatalogTree.tsx:301-309, :438-444; CatalogRail.tsx:96)
- [ ] Versions — "Save this query to start a version history.", "Loading versions", "No versions yet — one is recorded each time you save a change."; restore failure toast; "Restored, but reloading the editor failed — reopen the query." (components/query/VersionRail.tsx:115-136, :110; QueryWorkbench.tsx:602)

**Loads on open**
- [ ] `GET /connections/{id}/schema/rich` (useRichSchema) — opens the warehouse connection for schema metadata (server-cached); one read feeds completion, the rail and the builder (components/query/QueryWorkbench.tsx:86; lib/schema-context.tsx; pramanyx/routers/connections.py:557)
- [ ] `GET /catalog/tree?workspace=` — SQL mode only, the workspace-wide rail (components/query/QueryWorkbench.tsx:327-330)
- [ ] `GET /saved-queries?connection_id=` — on mount and per connection switch, again whenever the Saved menu opens (components/query/SavedQueryBar.tsx:97-118, :219)
- [ ] Visual mode is mounted even when SQL is the landing mode, so opening the SQL Editor also calls `GET /metrics` and `GET /connections/{id}/measure-grains` — the latter **may SPEND (warehouse probe)**: with no ontology grains and no cache it opens the connection and probes measure columns (components/QueryBuilder.tsx:1118, :1171-1177; pramanyx/routers/query.py:1971-1999)
- [ ] Version rail — `GET /saved-queries/{id}/versions` and `…/versions/{n}/diff` only once a saved query is open (components/query/VersionRail.tsx:49-72)
- [ ] localStorage reads (no network): split widths (components/ResizableSplit.tsx)

**Top rows today (workbench):** the app shell's breadcrumb/title row; then, in SQL mode, the tab strip row carries the shared controls right-aligned — [Visual|SQL] [Connection] [Saved ▾ n] [Save] [linked/sql-ahead]; in Visual mode a row of its own — (spacer) [Visual|SQL] [Connection] [Saved ▾ n] [Save] [linked/sql-ahead] [Tools ▾].

### 1.1 SQL mode — start page (no query tab open)

Shown when a connection has no tabs, the last tab was closed, or every restored tab is empty (components/query/modes/SqlMode.tsx:318-340, :747-761).

**Controls**
- [ ] Start tab "New tab" in the strip — not closable or renamable (components/query/TabsBar.tsx:149-155; modes/SqlMode.tsx:737)
- [ ] "+" (New tab) menu — "New query" / "Open existing…" (components/query/TabsBar.tsx:223-251)
- [ ] "Create new" → card button "SQL query" — opens an empty tab; disabled with no connection ("Choose a connection first") (components/query/QueryStart.tsx:262-270)
- [ ] "Quick access" segmented — "Recent N" (statements run here lately) / "Saved N" (components/query/QueryStart.tsx:282-285)
- [ ] Recent run row — what it does in words (else the SQL), outcome chip when not a pass (blocked / withheld / flagged / failed; title = error), "N rows · 769 ms · 5m ago", "×N" repeats folded; click opens the statement as written in a new tab named "History" (components/query/QueryStart.tsx:203-228; lib/query/workbench.ts:219-264)
- [ ] Saved row — name, "visual"/"sql" · "updated N ago", one-line SQL; click opens it as the Saved menu does (Save then updates it) (components/query/QueryStart.tsx:244-257)
- [ ] Catalog section — "Largest tables" row click opens `SELECT * FROM t LIMIT 100` in a new tab (not run) (components/query/QueryStart.tsx:109-128)

**Figures / counts**
- [ ] Recent / Saved counts on the segmented control (components/query/QueryStart.tsx:283-284)
- [ ] Catalog whole line — "N schemas · N tables · N columns [in the N tables read] · N rows [in the N counted]" (components/query/QueryStart.tsx:71-77, :84-86)
- [ ] Joins line — "N pairs of tables known to join · N tables joining none" / "no joins known" (components/query/QueryStart.tsx:78-81)
- [ ] Schemas list — name · N tables, a bar, rows or "not counted" (hatched bar) (components/query/QueryStart.tsx:88-108)
- [ ] Largest tables (8) — name, bar, compact rows / "not counted" (components/query/QueryStart.tsx:109-128)
- [ ] "The largest N of M — the catalog at the left lists them all" (components/query/QueryStart.tsx:129-133)
- [ ] "The latest N of M — + ▸ Open existing… searches them all" (components/query/QueryStart.tsx:229-233)

**Empty / error / loading states**
- [ ] No connection — "Choose a connection to start" / "The statements run on it and the queries saved for it show up here." (components/query/QueryStart.tsx:276-280)
- [ ] Recent — Loading "recent runs"; ReadFailed "the recent runs" + Retry; empty "Nothing has run on <connection> yet" / "The statements you run in the SQL editor show up here, newest first — each opens again in a new tab." (components/query/QueryStart.tsx:194-200)
- [ ] Saved — Loading "saved queries"; "The saved queries could not be read."; empty "None saved for <connection> yet" / "Save names the open tab's query and keeps it here — it opens again in a new tab, and Save updates it." (components/query/QueryStart.tsx:237-243)
- [ ] Catalog — Loading "the catalog"; "No tables in <connection>." (components/query/QueryStart.tsx:66-68)

**Loads on open**
- [ ] `GET /security/audit?label=query_workbench&limit=30&connection_id=` — re-read after every run (components/query/QueryStart.tsx:167-173; lib/api.ts:5213-5223)
- [ ] `POST /query/describe` (≤20 statements) — read-only despite POST: words from the statement text, "no query and no model" (components/query/QueryStart.tsx:180-188; lib/api.ts:5199-5210)
- [ ] The history rail is collapsed here but still mounted, so its own audit read fires too (components/query/modes/SqlMode.tsx:1009-1025)

**Top rows today:** tab strip only — [New tab] [+] … [Visual|SQL] [Connection] [Saved ▾] [Save] [chip]. The Run toolbar and Tools ▾ are hidden (so Recent runs / shortcuts / share are not reachable from here).

### 1.2 SQL mode — editor (a tab open)

**Controls — tab strip**
- [ ] Folder tab — click selects; double-click renames (input: Enter commits, Escape cancels, blur commits); status dot green "The last run succeeded" / red "The last run failed" (components/query/TabsBar.tsx:156-205)
- [ ] Tab × "Close tab" — closing the last tab returns to the start page, stops any run and drops its result (components/query/TabsBar.tsx:206-218; modes/SqlMode.tsx:424-441)
- [ ] "+" menu — "New query" / "Open existing…" (components/query/TabsBar.tsx:223-251)
- [ ] Tabs persist per connection in localStorage `aug.sqledit.tabs:<conn>`, max 20 (LRU), visible order kept; each tab keeps its SQL, name, parameter values, widget definitions, row limit, Run-all preference and last status (components/query/TabsBar.tsx:23-82)

**Controls — toolbar row**
- [ ] "Run (N)" — label carries the tab's row limit; runs the selection, else the statement under the cursor, else the buffer; or every statement when the tab's Run-all is on — SPENDS warehouse (components/query/modes/SqlMode.tsx:788-794, :471-525, :637-639)
- [ ] Run settings ▾ — "Row limit": 100 / 500 — default / 1,000 / 5,000 / 10,000 / 50,000 — max (check on current); "Run all statements" toggle; note "⌘⇧↵ always runs just the statement under the cursor" (components/query/modes/SqlMode.tsx:795-837, :82)
- [ ] "Cancel" (replaces Run while running) with elapsed "12s" / "1m 4s" after 1 s — interrupts the engine (components/query/modes/SqlMode.tsx:777-782, :616-632)
- [ ] Default-schema select — "(all schemas)" + each schema; tables there complete and resolve unqualified (components/query/QueryWorkbench.tsx:418-428; modes/SqlMode.tsx:842)
- [ ] Chip "N statements ran" after Run all (hover: each statement's rows) (components/query/modes/SqlMode.tsx:843-847)
- [ ] Guards verdict chip — "Guards clean" (green) / "Checked — N notes" / "Not all checked" / "Not checked — fill parameters" (amber); title lists unchecked guards (components/query/modes/SqlMode.tsx:850-852; lib/query/workbench.ts:105-117)
- [ ] Editor Tools ▾ — "Explain plan" (hidden where the engine has none, e.g. BigQuery; SPENDS warehouse); "Run all N statements" (≥2 statements and Run-all off; SPENDS); "Format SQL" (⌘⇧F); "Formatting preferences…"; — "Open a saved or recent query…"; "Recent runs" / "Hide recent runs"; "Keyboard shortcuts"; — then the workbench's "Version history", "Copy share link", "Show/Hide catalog" (lib/query/workbench.ts:135-183; modes/SqlMode.tsx:697-716, :857)
- [ ] Formatting preferences popover — Keywords UPPER / lower / as written; Functions UPPER / lower / as written; Indent 2 / 4 spaces; Line width 80 / 100 / 120 (persisted) (components/query/modes/SqlMode.tsx:858-904, :256-264)

**Controls — the editor (CodeMirror 6)**
- [ ] Placeholder "SELECT … — ⌘↵ runs the statement under the cursor · /ask writes one for you" (components/query/editor/SqlEditorPane.tsx:118)
- [ ] Line numbers, fold gutter, bracket matching, auto-closing brackets, active-line highlight, selection-match highlight, rectangular selection, line wrapping, lint gutter (components/query/editor/SqlEditorPane.tsx:259-301)
- [ ] Schema completion — tables (bare name when one schema owns it) and columns after a dot, dialect keywords (components/query/editor/SqlEditorPane.tsx:108-113, :278; QueryWorkbench.tsx:85-104)
- [ ] Live templates in the completion popup (section "Templates"): sel, selw, selc, gb, ob, jn, ljn, cte, win, case, ins, upd, del, ct, ctas, cv, exp, lim, dt, nn, dup — Tab moves between holes (components/query/editor/templates.ts:31-87)
- [ ] ⌥⏎ intentions menu (only what applies at the caret): "Expand wildcard", "Introduce alias “x”", "Rename “x”" (multi-caret), "Join <table>" (ON from detected joins), "Add LIMIT 100", "Wrap in a CTE", "Count the rows instead" — ↑ ↓ ⏎ Esc (components/query/editor/intentions.ts:109-250, :346-394)
- [ ] `/ask <request>` line — accent + hint "↵ writes the SQL — nothing runs" / "say what the SQL should give you"; ↵ or ⌘↵ asks `POST /query/ask` — SPENDS (model); "writing SQL…  Esc cancels"; the answer replaces the line in one edit as `-- /ask …`, up to 3 `-- notes`, then the SQL (never run); refusals said on the line; "choose a connection first" (components/query/editor/ask.ts:95-195; modes/SqlMode.tsx:947-948)
- [ ] Two-tier diagnostics — "syntax (approximate)" squiggles (~300 ms) and guard findings in the gutter: join value-domain ("measured key overlap is N%"), filter value-domain ("No row in t.c = 'x' — did you mean 'y'?"), grain fan-out, fan-out hints, trust findings, mutation blockers (error) (components/query/editor/diagnostics.ts:63-123, :149-234)
- [ ] Find / replace panel (top) (components/query/editor/SqlEditorPane.tsx:277)
- [ ] Editor font size ⌥+ / ⌥− (11–24 px, persisted `aug.sqledit.fontsize`) (components/query/editor/SqlEditorPane.tsx:156-172)
- [ ] Editor ⇄ results split — vertical drag 120–720 px (persisted `sqlmode`); results folded to one line until a first run (components/query/modes/SqlMode.tsx:910-924, :991-996)

**Controls — parameter bar (only when the SQL has `:name` parameters)**
- [ ] "PARAMETERS" label; one control per parameter, labelled by its widget label or `:name` (components/query/ParamBar.tsx:142-157)
- [ ] Widget kinds — Text (with suggestion datalist), Number, Date, Dropdown ("— pick —", "Loading…", "Choices failed to load"), Multi-select button ("N selected") with a checklist popover (components/query/ParamBar.tsx:159-205, :251-281)
- [ ] ⚡ dynamic date menu — today, yesterday, start of this week, start of last week, start of this month, start of last month, start of this year; "Clear — type a date instead"; a chosen token shows as ⚡ token (components/query/ParamBar.tsx:187-249; lib/query/paramDefs.ts:39-47)
- [ ] ⚙ "Configure the x widget" popover — Label; Widget select (Text/Number/Date/Dropdown/Multi-select); Suggest / Choices (one per line); "From query" (a saved query's first column as choices — runs that query when the control is focused/opened, SPENDS warehouse); Default; multi-select note "Write the SQL as IN :name"; definitions save with the query (components/query/ParamBar.tsx:283-350, :92-115)
- [ ] "Clear" — clears every parameter value (components/query/ParamBar.tsx:357-365)
- [ ] Missing line — ":x has no value — guards cannot check this query until filled" (components/query/ParamBar.tsx:370-375)

**Controls — results panel**
- [ ] Figures line — rows ("N rows" / "No rows" / "2 of 5 rows" when filtered), run time ("4 ms" / "1.2 s"; none when cached), "cached" chip ("Served from the result cache, not run again") (components/query/ResultsPanel.tsx:480-490; lib/query/workbench.ts:43-57)
- [ ] Cut note (amber) — "cut at N rows — more exist beyond this limit" / "… by this connection's row budget …" / "… this connector returns at most that many a call …" (components/query/ResultsPanel.tsx:491-493; lib/query/workbench.ts:16-24)
- [ ] "Count all rows" → "N rows in all · as of <time>" / "Could not count — …" — SPENDS warehouse (components/query/ResultsPanel.tsx:496-505, :518-525, :182-193)
- [ ] "Load N more" — next page through the same door, appended — SPENDS warehouse; error said on the line (components/query/ResultsPanel.tsx:506-515, :195-210, :526)
- [ ] "receipt" link — the run's signed provenance record, opens `/receipt/<id>` in a new tab (components/query/ResultsPanel.tsx:528-539)
- [ ] Filter icon — "Filter these rows — plain phrases, chips, OR" / "Hide the filter bar" (components/query/ResultsPanel.tsx:544-546)
- [ ] "Copy" / "CSV" (become "Copy shown" / "CSV shown" when filtered) — Copy pastes into a spreadsheet as cells (TSV + HTML) (components/query/ResultsPanel.tsx:547-552; TableActions.tsx:71-112)
- [ ] Result Tools ▾ — "Add a chart"; "Other formats…" / "Other formats, filtered rows…"; — "Pin to the dashboard" (WRITES; toast "Pinned to the dashboard" / "Pin failed"); "Schedule…" / "Schedule (n)…"; "Keep the rows as a sheet…" (lib/query/workbench.ts:186-210; components/query/ResultsPanel.tsx:445-463, :554)
- [ ] Other formats menu — Copy / File for each: CSV, TSV, CSV for Excel, JSON, Markdown, HTML table, SQL INSERTs, Plain text table; "The filtered rows" note; "Copied" / "Copy failed" (components/query/ResultsPanel.tsx:563-585; lib/query/extractors.ts:70-123)
- [ ] Maximize ⤢ — "Give the results the whole column" / "Bring the editor back" (components/query/ResultsPanel.tsx:600-602)
- [ ] Caveat lines (amber, each once) (components/query/ResultsPanel.tsx:606-613)
- [ ] Statement pager (after Run all, or related rows opened) — ‹ "Results N of M · label" › (components/query/ResultsPanel.tsx:621-635)
- [ ] Chart tabs — "Table" + "Chart N" tabs; double-click renames (Enter/Escape); ▾ "Chart options": "Rename", "Duplicate", "Remove" (components/query/ResultsPanel.tsx:637-700, :421-443)
- [ ] Chart tab body (ResultChartCard) — hover pencil "Edit visualization" opens the right-docked viz editor: chart / table / pivot view; chart type; dimension; metric; aggregation SUM/AVG/COUNT/MIN/MAX (when the dimension repeats); bar orientation; transform None / Period-over-period / Share of total / Rolling avg (3) / Cumulative (`POST /query/postproc`); data labels; legend Default/Right/Bottom/Top/Hidden; colour by field + scale + name; number format; X / Y axis titles; tooltip on/off; reference lines (add, average line, remove); download PNG (components/query/ResultsPanel.tsx:736-750; charts/ResultChartCard.tsx:41-64, :414-476)
- [ ] Filter bar — input `Filter these rows — e.g. "col contains a", "top 10"`; Enter adds a chip; Backspace on empty removes the last; chip × "Remove filter x"; unknown column → red error chip with its reason; "Clear" (components/query/ResultFilterBar.tsx:95-153)

**Controls — results grid**
- [ ] "Transpose" — rows ⇄ columns, first 30 rows; note "Showing the first 30 rows as columns — N more are in the result but not in this view." (components/query/ResultsGrid.tsx:441-448, :895-901)
- [ ] "Columns" / "Columns · N hidden" — checklist to hide columns (never the last), "Show all" (components/query/ResultsGrid.tsx:450-482)
- [ ] "Value" (with a cell selected; ⇧↵) — the value viewer (components/query/ResultsGrid.tsx:483-489)
- [ ] "Find" (⌘F) — "Find in these rows", "i of N" / "no match", ▲ previous (⇧↵) / ▼ next (↵) (components/query/ResultsGrid.tsx:490-520)
- [ ] Go to row (⌘G) — "Row 1–N" input (components/query/ResultsGrid.tsx:521-545)
- [ ] Selection "Copy" (⌘C, TSV) — "Copied" (components/query/ResultsGrid.tsx:565-569)
- [ ] "#" corner — click selects every row; right-click opens the selection menu (components/query/ResultsGrid.tsx:609-618)
- [ ] Column head — type icon, pin mark, name; click sorts (asc → desc → off); sort button at the right edge (hover, or while sorted); ▾ filter button (hover, or while filtered/open; funnel when filtered); right-click → header menu; drag the edge to resize (components/query/ResultsGrid.tsx:619-691)
- [ ] Row number — click selects the row, ⇧click extends; right-click opens the selection menu (components/query/ResultsGrid.tsx:712-733)
- [ ] Cell — press selects, drag extends, ⇧click extends, double-click opens the value viewer, right-click opens the cell menu; NULL shows ∅; numbers right-aligned in tabular figures (components/query/ResultsGrid.tsx:747-793)
- [ ] Virtualized rows; row height follows the person's Rows setting (32/36/44) (components/query/ResultsGrid.tsx:159-160, :284-290)
- [ ] Column ▾ menu — two sorts worded by kind (A → Z / Z → A; smallest → largest; oldest → newest); "Copy column name"; "Pin column" / "Unpin column"; "Format" ▸ None / Standard / Compact / Currency / Percentage / Scientific / Bytes (number columns, with examples); "Clear filter from x"; conditions — text: Equals / Does not equal / Begins with / Ends with / Contains / Does not contain; number: = ≠ > ≥ < ≤; date: On / Before / After — with a value box and its problem message; "Search N values"; "(Select all)" / "(Select all search results)"; value checklist with counts and "(Blanks)"; "and N more, not listed — search to narrow"; "No value matches"; source line "From the N rows [the other filters leave] — the result was cut, so more values may exist"; "Read the table's own values…" (cut, one-table result); "Cancel" / "OK" (components/query/ColumnFilterMenu.tsx:193-334; ResultsGrid.tsx:857-894; lib/query/columnFilter.ts:88-155; lib/format.ts:754-762)
- [ ] Cell menu (one cell) — header "col · “value”"; "Filter to this value" / "Exclude this value" (NULL: "Only null rows" / "Only non-null rows"); "Only null rows"; "Only non-null rows"; "Pick values in x…"; "Related rows…"; "Copy value"; "Copy as SQL literal"; "Copy as JSON"; "Copy column name"; "Open value" / "Hide the value panel" (components/query/CellMenu.tsx:146-167)
- [ ] Header right-click menu — "Pick values in x…" (components/query/CellMenu.tsx:154)
- [ ] Selection menu (several cells) — "N cells · N rows · N columns"; "Copy ⌘C"; "Copy as" ▸ CSV / TSV / JSON / Markdown table / SQL values; "Copy column names"; "Filter by this value" / "Exclude this value" disabled with "Select one cell to …"; "Show the value panel" (components/query/CellMenu.tsx:113-145; lib/gridCopy.ts:12-17)
- [ ] Value picker — column name, source line, "Search N values", checklist with counts, "and N more — search to narrow", "Filter to N values", "Cancel", × close; reads the table's own distinct values live when the result was cut and one table is read — SPENDS warehouse (components/query/ColumnValuePicker.tsx:60-167; ResultsPanel.tsx:252-266)
- [ ] Related rows picker — "Related rows · col = value"; one button per join the data bears out ("t · c = value", its sentence and source "the ontology"/"the schema"); unproven joins listed disabled with why; opening appends the rows as a new pager page — SPENDS warehouse (components/query/RelatedRowsPicker.tsx:40-103; ResultsPanel.tsx:268-298)
- [ ] Value viewer (docked under the grid) — column, "row N · N chars" / NULL, how the value was read, "Text"/"Viewer" toggle, "Copy value", × close; JSON as an expandable tree; image "Load image" (note "Not loaded — loading it tells <host> that you looked."); geometry outline with bounds; else text (components/query/ValueViewer.tsx:60-180; GeometryOutline.tsx)

**Controls — history rail (right; Tools ▾ "Recent runs")**
- [ ] "RECENT RUNS" label with "N · n blocked · n failed" tally; ↻ "Read the history again" (components/query/HistoryRail.tsx:74-83)
- [ ] Run row — one-line SQL as written, outcome chip (blocked / withheld / flagged / failed; title = error), "N rows · 769 ms · 5m ago"; click opens it in a new "History" tab (components/query/HistoryRail.tsx:91-118)
- [ ] Rail width 200–560 px, persisted `sqlmode.history` (components/query/modes/SqlMode.tsx:1009-1016)

**Dialogs / drawers / popovers / panels**
- [ ] "+" new-tab menu (components/query/TabsBar.tsx:230-249)
- [ ] Run settings popover (components/query/modes/SqlMode.tsx:803-837)
- [ ] Formatting preferences popover (components/query/modes/SqlMode.tsx:858-904)
- [ ] Editor Tools ▾ dropdown (components/catalog/CatalogTools.tsx:79-101)
- [ ] "Open a query" dialog — "Saved N" / "Recent N" pills, search ("Search saved queries by name or SQL…" / "Search recent runs…"), × close; every row opens a COPY in a new tab (Save then creates a new record) (components/query/OpenQueryDialog.tsx:88-186)
- [ ] "Keyboard" shortcuts sheet — "everything this editor binds, in one place"; groups Run / Write / Select / Find / Results; × Close (components/query/ShortcutSheet.tsx:30-163)
- [ ] ⌥⏎ intentions tooltip; completion popup; find/replace panel (components/query/editor/intentions.ts; SqlEditorPane.tsx:277-278)
- [ ] Parameter popovers — ⚡ dates, multi-select checklist, ⚙ widget config (opens upward) (components/query/ParamBar.tsx:229-352)
- [ ] Quick fix panel — offer on the error's row (components/query/QuickFixPanel.tsx:87-145)
- [ ] Result Tools ▾, Other formats menu, Schedule popover — "SCHEDULED n" (name, cron, "paused"); "Add schedule": name ("Watch — table"), presets Hourly / Every 6h / Daily 9:00 / Weekly Mon 9:00 / "Cron…" + cron input; chips "server time", "tracks the first cell", "alerts on any change"; "Create" (WRITES a monitor) / "Creating…" / "Failed — retry"; "Open in Monitors →" (components/query/SchedulePopover.tsx:117-185)
- [ ] "Keep the rows as a sheet" → New sheet dialog (rows source; the statement runs again and is frozen) → toast "Kept as a sheet — it is in Spreadsheets" — WRITES + SPENDS warehouse (components/query/ResultsPanel.tsx:592-598)
- [ ] Viz editor side panel (from a chart tab) (components/charts/ResultChartCard.tsx:509-510)
- [ ] Chart tab ▾ menu; column ▾ menu; cell / selection menu; value picker; related rows picker; value viewer; columns checklist (as listed above)
- [ ] History rail; version rail (as listed above)

**Figures / counts / badges / chips**
- [ ] Tab status dots; "N statements ran" chip; guards verdict chip; elapsed timer (components/query/TabsBar.tsx:201-202; modes/SqlMode.tsx:781, :843-852)
- [ ] Run button's row limit "Run (500)" (components/query/modes/SqlMode.tsx:793)
- [ ] Figures line: rows / "x of y rows", time, cached, cut note, "N rows in all · as of", receipt link (components/query/ResultsPanel.tsx:486-539)
- [ ] Pager "Results N of M"; chart tab names (components/query/ResultsPanel.tsx:627-629)
- [ ] Grid aggregate readout for a multi-cell selection — "N cells", "N distinct", "N null" (amber), Σ, x̄, min, max (components/query/ResultsGrid.tsx:550-564)
- [ ] Find "i of N"; Columns "N hidden"; row numbers; type icons; pin marks; funnel on filtered columns (components/query/ResultsGrid.tsx:453, :513, :653-654, :678)
- [ ] History tally "N · n blocked · n failed"; per-row outcome chips (components/query/HistoryRail.tsx:57-63, :114)
- [ ] Schedule (n) count; per-schedule cron and "paused" (lib/query/workbench.ts:203; components/query/SchedulePopover.tsx:125-135)
- [ ] Semantic notes: "(not checked)" guard reasons in the verdict chip title (lib/query/workbench.ts:106-112)

**Keyboard shortcuts**
- [ ] ⌘↵ — run the selection / statement under the cursor (or every statement when Run-all is on); on an `/ask` line, asks instead (components/query/editor/SqlEditorPane.tsx:192-197; editor/ask.ts:180-184)
- [ ] ⌘⇧↵ — run just the selection / statement under the cursor, always (components/query/editor/SqlEditorPane.tsx:198-204)
- [ ] ⌘⌥L and ⌘⇧F — reformat the selection, else the whole query, one undo step (components/query/editor/SqlEditorPane.tsx:205-219)
- [ ] ⌘D next occurrence · ⌘⇧L all occurrences · ⌥⌘↑ / ⌥⌘↓ add a caret · ⌥-click add a caret (components/query/editor/SqlEditorPane.tsx:237-240, :276)
- [ ] ⌘J completion with templates · Tab next template hole / indent (components/query/editor/SqlEditorPane.tsx:241, :294)
- [ ] ⌘/ line comment · ⌥⌘/ block comment (components/query/editor/SqlEditorPane.tsx:242-243)
- [ ] ⌘L go to line · ⌥⌘G go to line (CodeMirror's own) · ⌘F / ⌥⌘F find & replace (components/query/editor/SqlEditorPane.tsx:248-250; ShortcutSheet.tsx:64-69)
- [ ] ⌥+ / ⌥− editor font size (components/query/editor/SqlEditorPane.tsx:254-256)
- [ ] ⌥⏎ intentions menu; ↑ ↓ ⏎ Esc inside it (components/query/editor/intentions.ts:346-394)
- [ ] ↵ on an `/ask` line asks; Esc cancels a pending ask (components/query/editor/ask.ts:180-184)
- [ ] CodeMirror defaults — undo/redo (⌘Z / ⌘⇧Z), fold keys, close-bracket keys, completion keys (components/query/editor/SqlEditorPane.tsx:292-295)
- [ ] Esc then H (outside an editor or input) — opens the Keyboard sheet; Escape closes it (components/query/ShortcutSheet.tsx:95-121)
- [ ] Tab strip — ← / → move focus between tabs, Enter / Space select; rename Enter / Escape (components/query/TabsBar.tsx:171-195)
- [ ] Grid — arrows move, ⇧+arrows extend, PageUp / PageDown (20 rows), Home / End, ⌘A all cells, ⌘C copy TSV, ⌘F find (↵ next, ⇧↵ previous, Esc close), ⌘G go to row (↵ / Esc), ⇧↵ value viewer, Esc clears selection/find/go-to (components/query/ResultsGrid.tsx:360-386, :502-505, :527-538)
- [ ] Filter bar — Enter adds a chip, Backspace on empty removes the last (components/query/ResultFilterBar.tsx:98-105)
- [ ] Column ▾ menu — Enter in the condition value applies; Escape closes (components/query/ColumnFilterMenu.tsx:168-172, :281)
- [ ] Escape closes: Open a query dialog, parameter popovers, Schedule popover, cell menu, related rows picker, value picker via ×, chart rename (components/query/OpenQueryDialog.tsx:71-76; ParamBar.tsx:83-88; SchedulePopover.tsx:86-92; CellMenu.tsx:76-80; RelatedRowsPicker.tsx:48-52; ResultsPanel.tsx:652)

**URL params / deep links**
- [ ] None of its own beyond the workbench's (`?mode=sql`, `?query=`); `/receipt/<id>` opened in a new tab from the figures line (components/query/ResultsPanel.tsx:528-539)

**Empty / error / loading / withheld states**
- [ ] Results before a run — folded line "Results open here when a statement runs." / "⌘↵ runs the statement under the cursor." (components/query/modes/SqlMode.tsx:991-996; ResultsPanel.tsx:384-390)
- [ ] "Running…" (components/query/ResultsPanel.tsx:342-344)
- [ ] Run error, said once — chip "Failed" / "Refused · blocked by a guard" / "· turned off for analysis" / "· sensitive data withheld" / "· only SELECT runs here" / "Cancelled", "statement N of M" chip, the engine's or gate's own words (components/query/ResultsPanel.tsx:346-380; lib/query/workbench.ts:61-97)
- [ ] Run all — "Statement i of n failed: …", "Cancelled after k of n statements." (components/query/modes/SqlMode.tsx:587, :599)
- [ ] A user Cancel is not an error — the panel returns to rest (components/query/modes/SqlMode.tsx:511-513)
- [ ] Quick fix — "Proposing a fix…"; "Proposed fix" + rationale + diff, "Apply" (into the editor, not run) / "Reject"; "No change proposed. <diagnosis>" / "No change proposed — the repair model did not find a fix for this." + "Dismiss"; failure in red (components/query/QuickFixPanel.tsx:66-145)
- [ ] Filtered to nothing — "No rows match these filters." (components/query/ResultsPanel.tsx:715-716)
- [ ] Cut result — cut note + caveats; value lists say "the result was cut, so more values may exist" (components/query/ResultsPanel.tsx:491-493; ColumnFilterMenu.tsx:326-328; ColumnValuePicker.tsx:80-89)
- [ ] Value picker live read — "Reading the table's values…", "From the table t, read live — NULL not listed", "The table t could not be read live (…) — from the N rows shown …" (components/query/ColumnValuePicker.tsx:80-89)
- [ ] Related rows — "Reading the joins the data bears out…", "The joins could not be read — …", "No verified join touches t.c — nothing to open." (+ "No ontology is built for this connection; only the schema's keys and names were read.", "The join map was …"); a refusal opening rows said on the figures line (components/query/RelatedRowsPicker.tsx:74-89; ResultsPanel.tsx:284, :292)
- [ ] Image viewer — "Not loaded — loading it tells <host> that you looked.", "The image could not be loaded from <host>." (components/query/ValueViewer.tsx:150-176)
- [ ] Parameters missing — ":x has no value — guards cannot check this query until filled"; chip "Not checked — fill parameters" (components/query/ParamBar.tsx:370-375; lib/query/workbench.ts:113)
- [ ] History rail — ReadFailed "the query history" + Retry; "Queries you run here appear in this list." (components/query/HistoryRail.tsx:85-90)
- [ ] Open a query dialog — Loading; ReadFailed + Retry per list; "No saved queries for this connection yet — Save names the current tab."; "Nothing has run on this connection yet."; "Nothing matches this search." (components/query/OpenQueryDialog.tsx:130-165)
- [ ] Multi-select — "No choices yet — add them with the gear"; "Choices failed to load" (components/query/ParamBar.tsx:255-262)

**Loads on open**
- [ ] Tabs from localStorage (no network) (components/query/modes/SqlMode.tsx:318-344)
- [ ] **SPENDS (warehouse):** the linter's tier 2, `POST /query/validate`, fires as soon as a restored tab holding SQL mounts, and again on each edit (≥300 ms idle) or parameter change — the guard battery runs LIVE probes (join and filter value-domain) against the warehouse to colour the verdict chip and gutter (components/query/editor/diagnostics.ts:184-205; pramanyx/routers/query.py:1382-1387)
- [ ] Tier-1 syntax parse and statement split — in a web worker, no network (components/query/editor/diagnostics.ts:165; modes/SqlMode.tsx:271-277)
- [ ] `GET /security/audit?label=query_workbench&limit=40&connection_id=` — the history rail, mounted even while collapsed; re-read after every run (components/query/HistoryRail.tsx:48-56; modes/SqlMode.tsx:1016-1025)
- [ ] Per result: `GET /monitors?conn=` to count this statement's schedules (Schedule popover is always mounted) (components/query/SchedulePopover.tsx:68-84)
- [ ] Every Run / Explain / Run all / Preview data / Count / Load more / related rows goes through `POST /query/run` (or `/query/count`, `/query/more`, `/query/related`) and writes an audit row — on click, never on open (lib/api.ts:5128-5160, :5052-5120)

**Top rows today:** Row 1 — tab strip: [tabs… ×] [+] … [Visual|SQL] [Connection] [Saved ▾ n] [Save] [linked/sql-ahead]. Row 2 — toolbar: [Run (500)] [▾ run settings] [schema] [N statements ran] … [guards verdict chip] [Tools ▾]. Then, under the editor, the results' own rows: figures line [rows] [time] [cached] [cut + Count all rows + Load N more] [count] [receipt] … [filter] [Copy] [CSV] [Tools ▾] [⤢]; optional caveats; optional pager/chart-tab strip; optional filter bar; grid control bar [Transpose] [Columns] [Value] [Find] … [aggregate] [Copy].

### 1.3 Visual mode (QueryBuilder)

**Controls — header row (56 px, under the workbench row)**
- [ ] Table chips — the primary (blue) and each joined table (green when a join was found, amber when not), title = the ON clause; × on a joined table removes it with its fields (components/QueryBuilder.tsx:1672-1699, :1249-1254)
- [ ] "imported query · edit SQL below" chip (a handed-over query with no builder state) (components/QueryBuilder.tsx:1700-1704)
- [ ] "Drag a field from the catalog to begin" (components/QueryBuilder.tsx:1706)
- [ ] "Pin" / "Pinning…" / "Pinned ✓" — "Pin this query to the briefing dashboard — re-guarded on save" (components/QueryBuilder.tsx:1717-1725)
- [ ] Pin popover — "Pin to briefing dashboard", "Re-run through the trust guards on save — a query that fails a guard is refused, not pinned.", "Card title" input (Enter pins, Escape closes), error line, "Cancel" / "Pin" — WRITES a card with its chart settings; toast "Pinned to your dashboard" / "Card refused by the trust guards" (components/QueryBuilder.tsx:1728-1747, :1609-1640)
- [ ] "↺ Regenerate SQL" — shown after the SQL was edited by hand; returns control to the chips (components/QueryBuilder.tsx:1751-1757)
- [ ] Run status chip "valid" / "error" after a run (components/QueryBuilder.tsx:1758-1773)
- [ ] "Cache" checkbox — run against the result cache (components/QueryBuilder.tsx:1774-1777)
- [ ] "Run" / "Running…" — SPENDS warehouse (components/QueryBuilder.tsx:1778-1787, :1440-1449)

**Controls — bottom control panel**
- [ ] "DATA" / "CUSTOMIZE" tabs; collapse / expand chevron ("Collapse panel" / "Expand panel") (components/QueryBuilder.tsx:1799-1810)
- [ ] Panel resize divider — drag (140 px to 72% of the window) "Drag to resize" (components/QueryBuilder.tsx:2235-2240, :1593-1604)
- [ ] DATA — "Display" select (after a run): Chart group "Auto" + each chart type the result allows; Data group "Table", "Pivot" (components/QueryBuilder.tsx:1814-1833)
- [ ] DATA — auto-join hint banner "Auto-joined a → b" / "Auto-joined t via x → y → t" / "No join path to t — add the ON clause manually in SQL", × dismiss (auto-clears after 4.5 s) (components/QueryBuilder.tsx:1849-1855, :1216-1244)
- [ ] DATA — "Dimensions · GROUP BY" drop zone ("Drop a column or click D" / "Release to add dimension") (components/QueryBuilder.tsx:1860-1876)
- [ ] Dimension chip — name (table.col when several tables); for a date/time column a grain select raw / DATE / MONTH / QUARTER / YEAR / HOUR / MIN and a range select All time / Last 7 days / Last 30 days / Last 90 days / This month / Last month / This quarter / This year / Year to date ("Relative time range (WHERE)"); × remove (components/QueryBuilder.tsx:1877-1911)
- [ ] DATA — "Metrics · aggregations" drop zone ("Drop a column or click M" / "Release to configure metric") (components/QueryBuilder.tsx:1916-1960)
- [ ] "Catalog" button → "Metrics Catalog" popover — each approved metric (label + SQL); a click adds it as a measure (components/QueryBuilder.tsx:1922-1947)
- [ ] Metric chip — agg label / "fx" / metric icon, alias (title = the SQL expression); grain warning ⚠ (per-unit SUM under-counts, per-line × quantity double-counts) with "fix" (rewrites as SUM(col × quantity)); × remove (also removes its HAVING rows) (components/QueryBuilder.tsx:1961-1983, :272-298, :1584-1592)
- [ ] Configure Metric modal — "Configure Metric", table.col · type, "Aggregation function" grid SUM / AVG / COUNT / C.DIST / MIN / MAX / MEDIAN / STDDEV / VAR / Custom, "SQL expression" (Custom), "Column alias", "SQL preview", "Cancel" / "Add Metric", × (components/QueryBuilder.tsx:627-708, :2296-2300)
- [ ] "Resolved joins · N tables" (collapsed) with "⚠ fan-out" badge when a join can inflate aggregates; each row pivot → table ON a.c = b.c with "exact"/match badge, or "no join — wire in SQL" (components/QueryBuilder.tsx:1989-2019)
- [ ] "Filters" (WHERE — narrow down your results) — chips with ×; "Add filter" → table (several tables) / column / operator = != > >= < <= LIKE ILIKE IN IS NULL IS NOT NULL / value with the column's distinct values as suggestions; "Add" / "Cancel"; Enter adds (components/QueryBuilder.tsx:2025-2075, :1558-1580)
- [ ] "Having" (HAVING — filter on aggregated metrics) — measure select, operator > >= < <= = !=, value, ×; "Add having" (components/QueryBuilder.tsx:2078-2104)
- [ ] "ORDER BY" text input ("e.g. total_revenue DESC") and "LIMIT" number (default 1000; blank/0 = no limit, max 50,000) (components/QueryBuilder.tsx:2107-2124)
- [ ] "SQL" section (collapsed by default) — "manually edited" chip; "⌘↵ to run"; "Import → builder" (reverse-compiles the SQL into chips, `POST /query/decompile`; says "Imported into the builder." / "Imported. N filters couldn't be mapped — check the SQL." / why it could not); "Format"; "Copy"; highlighted SQL textarea with a cursor autocomplete list ("Suggestions — ↑↓ ↵ insert Esc") of columns, tables and SQL words (components/QueryBuilder.tsx:2130-2173, :1388-1434, :711-739, :2292-2293)
- [ ] CUSTOMIZE — "Chart title"; "Labels: Show data labels on the chart"; "Color scheme" Default / Tableau 10 / Category 10 / Set 2 / Dark 2 / Pastel / Tableau 20 ("Applies to multi-series charts."); "Number format" Auto / 1,234 / 1,234.56 / $1,234 / $1,234.56 / 1.2K (compact) / 12% / 12.3%; "Legend" Default / Right / Bottom / Top / Hidden; "X axis title"; "Y axis title" (components/QueryBuilder.tsx:2177-2230, :1659-1661)

**Controls — chart area (top, the hero)**
- [ ] Result title — the open saved query's name, else the primary table, else "Results"; "N rows · 12ms"; "cached" chip (components/QueryBuilder.tsx:2245-2253)
- [ ] Meta line "N rows · Nms · cached · semantic: <op>" (components/QueryBuilder.tsx:842-847, :885)
- [ ] "Why this number →" — opens the Trust Receipt drawer for this run (components/QueryBuilder.tsx:887; WhyThisNumber.tsx:576-583)
- [ ] "CSV" — download the shown rows (components/QueryBuilder.tsx:851-854, :888-892)
- [ ] Chart (controlled by Display + Customize) (components/QueryBuilder.tsx:902-906)
- [ ] Table view (SqlResultTable) — "Σ Totals on/off", column ▾ menus (same menu as the SQL grid: sorts, copy name, pin, format, conditions, value checklist), "N of M rows" + "Clear filters", "Copy" / "CSV", pages of 100 (components/QueryBuilder.tsx:909-912; AugTable.tsx:365-425)
- [ ] Pivot view — Rows field, Columns field, Values field, aggregation; row and column totals (components/QueryBuilder.tsx:895-898; PivotTable.tsx:1-12)
- [ ] "Semantic step — reason over a text column with an LLM" (collapsed): operator filter / extract / top-k / aggregate; column ("(not text?)" marks); predicate, or criterion + "keep" k, or instruction, or fields (name + what to extract, "+ field", ×); "Apply" / "Applying…" — SPENDS (model) ; "Revert"; "in → out rows · N calls"; notes; error (components/QueryBuilder.tsx:65-180, :786-811, :915-927)
- [ ] "Start Canvas" / "Creating…" — creates a Data Canvas over the query's tables and opens it — WRITES; then asks a model for the canvas's name in the background — SPENDS (components/QueryBuilder.tsx:856-878, :929-950)

**Dialogs / drawers / popovers / panels**
- [ ] Pin popover (components/QueryBuilder.tsx:1728-1747)
- [ ] Configure Metric modal (components/QueryBuilder.tsx:627-708)
- [ ] Metrics Catalog popover (components/QueryBuilder.tsx:1928-1945)
- [ ] SQL autocomplete dropdown (components/QueryBuilder.tsx:711-739)
- [ ] Trust Receipt drawer ("Why this number →") (components/WhyThisNumber.tsx:584)
- [ ] Column ▾ menu in the table view (components/AugTable.tsx:409-425)
- [ ] Semantic step panel (inline, collapsible) (components/QueryBuilder.tsx:915-929)

**Figures / counts / badges / chips**
- [ ] Table chips (primary / joined / unjoined colours); "valid"/"error"; "Pinned ✓"; "manually edited"; "⚠ fan-out"; join match badge; grain ⚠ (components/QueryBuilder.tsx:1672-1773, :1995-2011, :2138-2141, :1973)
- [ ] Rows · time · cached; semantic "in → out rows · N calls"; "N of M rows" in the table view (components/QueryBuilder.tsx:2249-2252, :169; AugTable.tsx:377-381)

**Keyboard shortcuts**
- [ ] ⌘↵ in the SQL textarea runs (components/QueryBuilder.tsx:1434)
- [ ] Autocomplete — ↑ / ↓, Tab or Enter inserts, Esc closes (components/QueryBuilder.tsx:1427-1432)
- [ ] Pin title — Enter pins, Escape closes; filter value — Enter adds (components/QueryBuilder.tsx:1735, :2055)
- [ ] ⌘K palette commands while mounted — "Run query", "Pin query to dashboard" (components/QueryBuilder.tsx:1654-1658)

**URL params / deep links**
- [ ] `?mode=visual`; legacy `?tab=builder`; a hand-over (`importRequest`) switches connection, loads the SQL, opens the SQL section and RUNS it at once — SPENDS warehouse on arrival (components/QueryBuilder.tsx:1454-1486)

**Empty / error / loading states**
- [ ] Onboarding — "Drag a field from the catalog to begin" / "Drop columns into Dimensions or Metrics below. Fields from related tables join automatically along the studied schema relationships." (components/QueryBuilder.tsx:1838-1846)
- [ ] Before a run — "Configure your query in the panel, then Run or press ⌘↵" (components/QueryBuilder.tsx:2283-2286)
- [ ] "Running query…" (components/QueryBuilder.tsx:2255-2259)
- [ ] ErrorState "Query failed" + the engine's message + "Edit the SQL and run it again." (components/QueryBuilder.tsx:2261-2265)
- [ ] Result error (ChartWrapper); "Query returned no rows." (components/QueryBuilder.tsx:813-827)
- [ ] CUSTOMIZE before a chartable result — "Run a chartable query, then customize its chart here." (components/QueryBuilder.tsx:2179)
- [ ] Start Canvas failure — browser `alert()` with the error (components/QueryBuilder.tsx:874)

**Loads on open**
- [ ] Rich schema (shared read), `GET /metrics`, `GET /connections/{id}/measure-grains` (may probe the warehouse — see 1.0) (components/QueryBuilder.tsx:1006, :1118, :1171-1177)
- [ ] Nothing runs until Run — except a handed-over query, which runs on arrival (components/QueryBuilder.tsx:1470-1486)
- [ ] On choosing a filter column: `GET` distinct values (up to 200) — SPENDS warehouse (components/QueryBuilder.tsx:1565-1579)

**Not reachable today (state with no control — not part of the parity list, noted so nobody "restores" them by accident):** a top-level time column / range preset / custom from–to / grain (`timeCol`, `timePreset`, `timeGrain` — compiled into SQL and saved in the spec, but no control sets them), and an "add join" picker (`showAddJoin`, `addJoin`, `joinableOptions`) (components/QueryBuilder.tsx:1045, :1064-1069, :1193, :1247).

**Top rows today:** Row 1 (workbench) — (spacer) [Visual|SQL] [Connection] [Saved ▾ n] [Save] [linked/sql-ahead] [Tools ▾]. Row 2 (builder header) — [builder icon] [table chips / "imported query" / "Drag a field…"] … [Pin] [↺ Regenerate SQL] [valid/error] [☐ Cache] [Run]. The control panel's own tab row [DATA] [CUSTOMIZE] … [collapse] sits at the BOTTOM of the page, under the chart.


## 2. Dashboards

Intelligence workspace, layer `dashboards` (`?tab=dashboards`, or `?tab=intelligence&layer=dashboards`; old `?tab=cockpit` / `?layer=cockpit` still open it). Rendered by `IntelligenceWorkspace` → `MetricDetailHost` → `BriefingDashboards` (web/components/IntelligenceWorkspace.tsx:284). All paths below are under `web/components/` unless they start with `web/lib/`.

### 2.0 Workspace chrome above the layer (shared with Briefing, Hub…)

- [ ] Connection picker — select "Connection", lists briefings-enabled connections; only when >1 (IntelligenceWorkspace.tsx:203)
- [ ] Schema scope picker — select "Schema", only when the connection has >1 schema; remembered per connection (IntelligenceWorkspace.tsx:220)
- [ ] ScopeMaturity chip — the scope's exploration maturity, beside the pickers (IntelligenceWorkspace.tsx:240)
- [ ] Layer tabs of the Intelligence workspace (unless `hideTabs`) — "Dashboards" has blurb "Your own dashboards — the cards you keep watching" (IntelligenceWorkspace.tsx:88, :242)
- [ ] Dashboards layer is never offered for a canvas — a canvas forces the Briefing layer (IntelligenceWorkspace.tsx:187-190)
- [ ] MetricDetailHost wrapper — supplies "See how it is defined" drawer and "Ask why it moved" to the Metrics ledger (IntelligenceWorkspace.tsx:285; brief/MetricDetail.tsx)

### 2.1 View mode (a dashboard opened to be read)

**Controls**
- [ ] Dashboard picker strip (TabStrip "Your dashboards") — first tab "Metrics", then heading "Your dashboards" + one tab per live dashboard, then heading "Apps shared with you" + one tab per shared App ("title · publisher") (dashboards/BriefingDashboards.tsx:1313-1321)
- [ ] "+ New dashboard" — trailing button on the strip; opens the New dashboard dialog (dashboards/BriefingDashboards.tsx:1322)
- [ ] Choosing a strip tab — opens that dashboard to be read; remembered per connection in localStorage `pramanyx:cockpit:<conn>` (dashboards/BriefingDashboards.tsx:882-888, :112-118)
- [ ] Period picker (select "Dashboard period") — As written / Current day / Current week / Current month / Current year / Last week / Last month / Last year / Custom range… ; default Last month; hidden when every card is standing (dashboards/PeriodPicker.tsx:21-29; BriefingDashboards.tsx:1367-1369)
- [ ] Custom range — "First day" / "Last day" date inputs + "Show" (dashboards/PeriodPicker.tsx:85-93)
- [ ] "History" / "Hide history" toggle — shows the version list inline (dashboards/BriefingDashboards.tsx:1372-1378)
- [ ] "Edit" — opens the builder (disabled while reading or busy) (dashboards/BriefingDashboards.tsx:1379-1383)
- [ ] History row "Go back to this" — restores an earlier version (kept as a new version) (dashboards/BriefingDashboards.tsx:1071-1075)
- [ ] "Move it here" — one per dashboard that lived in a Data Canvas (CT-10 offer) (dashboards/BriefingDashboards.tsx:1332-1344)
- [ ] "Start “My dashboard” from N pinned cards" — shown in the empty state / none-yet line when pinned cards exist; else "New dashboard" (dashboards/BriefingDashboards.tsx:1015-1041)
- [ ] "Pin to release N" / "Re-pin to release N" — PinStrip button; keeps the dashboard as a version composed against the current ontology release (dashboards/PinStrip.tsx:32-37; BriefingDashboards.tsx:1390-1394)
- [ ] "Try again" — on the "Your dashboard could not be read" error (dashboards/BriefingDashboards.tsx:1349-1350)
- [ ] Tabs of a dashboard (DashboardTabs) — reader picks a tab; choice survives a card refresh (dashboards/ComposedDashboard.tsx:210-225)
- [ ] Laid-out section tabs (layout "tabs") — tab buttons per sub-section; hidden tabs stay mounted (dashboards/ComposedDashboard.tsx:322-334)
- [ ] Card tile hover doors (show on hover/focus): Evidence (shield, findings only), Why (external, opens source finding), Set an alert (bell), Refresh (run again), Take off this dashboard (builder only) (dashboards/DashboardTile.tsx:189-218)
- [ ] Set an alert form — threshold number input, below/above select, "Save" → schedules a monitor (brief/PinnedCardBody.tsx:83-100; DashboardTile.tsx:352-355)
- [ ] Rows/chart tile — "Edit visualization" (opens the viz editor; config persisted per card) (charts/ResultChartCard.tsx:471-476; DashboardTile.tsx:427-441)
- [ ] Query tile (drafted from a file) — "Details" toggle shows definition + SQL (dashboards/DashboardTile.tsx:491-506)
- [ ] Note tile — read only in view; Image tile — read only in view (dashboards/StaticTile.tsx)
- [ ] Filter column (ObjectFilters) — one facet per property: checkbox per value with count, "Show all N" / "Show fewer"; empty values disabled (dashboards/OntologyPieces.tsx:1018-1112)
- [ ] Filter bar — chip per chosen filter with × "Clear <prop>", "Clear" all, live count of objects left (dashboards/OntologyPieces.tsx:1236-1250)
- [ ] File filter column (QueryFilters) — checkbox facets per column, "Clear filters" (dashboards/QueryFilters.tsx:94-153)
- [ ] Values bar ("Values you set") — reader-set values: toggle chips (list), select (offered choices) or typed input; "Reset" back to the made value; kept per dashboard in localStorage (dashboards/OntologyPieces.tsx:1137-1212, :130-173, :262)
- [ ] Reader filters persist per dashboard in localStorage (dashboards/OntologyPieces.tsx:138, :173)
- [ ] Object table — row click chooses an object (if wired), tick checkboxes (if wired) with "N ticked" + "Clear", Previous/Next page (dashboards/OntologyPieces.tsx:674-775)
- [ ] Object detail — follows a choice; shows the chosen object's properties (dashboards/OntologyPieces.tsx:800-860)
- [ ] Action button (in a detail) — runs or proposes a declared action; parameter inputs + Run/"Cancel"; "It needs approval — proposed in Actions." (dashboards/OntologyPieces.tsx:900-940) — WRITES on click
- [ ] Action buttons piece — one button per wired action; opens a dialog with parameters (checkbox/inputs), "Cancel", "<label> · N" runs once per ticked object (dashboards/ActionButtonsPiece.tsx:156-205) — WRITES on click
- [ ] Process board — per-stage promise breach rate; "N open and overdue" (shows the table of these) and place-table button (builder) (dashboards/OntologyPieces.tsx:545-610)
- [ ] Object figure — click (when wired "shows") switches the list to its set; Enter/Space too (dashboards/OntologyPieces.tsx:1298-1304)
- [ ] Object breakdown — rows/bars clickable to choose a group (dashboards/OntologyPieces.tsx:1393-1430)
- [ ] Object chart — bars over last N days, split legend (dashboards/OntologyPieces.tsx:1600-1700)
- [ ] Object list — card click chooses; ticks; Previous/Next page (dashboards/AppPieces.tsx:95-164)
- [ ] Object map — points placed by lat/lng (dashboards/AppPieces.tsx:205-250)
- [ ] Object timeline — bars start→end per object (dashboards/AppPieces.tsx:280-320)
- [ ] Choose one — "Find by <prop>" search input, option buttons, "Let go" (dashboards/AppPieces.tsx:352-372)
- [ ] Object search — words narrow every piece over the same objects (dashboards/AppPieces.tsx)
- [ ] Drawer — opens at right when its choice is made; × "Close the drawer"; Escape closes (dashboards/ComposedDashboard.tsx:1052-1111)
- [ ] Scenario inputs — "Scenarios" segmented presets ("As it is" + saved presets), one slider per value (dashboards/ScenarioInputs.tsx:43-66)
- [ ] Add a row piece — "+ Add a row" / "Close", one field per sheet column, "Add it" (dashboards/AddRowPiece.tsx:48-66) — WRITES on click
- [ ] Question piece — "Ask now" / "Ask again now" → confirm "This asks the agent now — a full run." + confirm/"Cancel"; "Open in Data Canvas"; earlier answers each open in the Data Canvas; "Show all N" / "Show fewer" (dashboards/QuestionPiece.tsx:123-201) — SPENDS (model run) on confirm
- [ ] Shared App view — period picker + "Start my dashboard from this" (copies it as yours) (dashboards/BriefingDashboards.tsx:683-690) — WRITES on click

**Dialogs / drawers / popovers / panels**
- [ ] New dashboard dialog (FormDialog, 900 px, title "New dashboard"; held open with Close disabled while a draft/start runs) — see 2.4 (dashboards/BriefingDashboards.tsx:1324-1329)
- [ ] History panel — version line + ordered list of versions (see Figures) (dashboards/BriefingDashboards.tsx:1048-1081)
- [ ] Refusal panel "Refused · nothing was kept" / "Not checked · nothing was kept" with the rules' sentences (dashboards/BriefingDashboards.tsx:120-134)
- [ ] Spec refusal "Refused · the dashboard's spec" — the dashboard is not drawn, issues listed (dashboards/ComposedDashboard.tsx:1223-1234)
- [ ] Object drawer (right side, 460 px) (dashboards/ComposedDashboard.tsx:1100-1111)
- [ ] Action buttons run dialog (DialogContent) (dashboards/ActionButtonsPiece.tsx:170-205)
- [ ] Card alert form (inline) (brief/PinnedCardBody.tsx:83-100)
- [ ] Viz editor (opened by Edit visualization) (charts/ResultChartCard.tsx:471)
- [ ] PinStrip — "Composed against release N; its pieces read release M. N changes since touch what they read:" + change list with class tag (dashboards/PinStrip.tsx:46-72)

**Figures / counts / badges / chips / as-of**
- [ ] Period trigger text — "<covers> · final/provisional/to date" or "<name> · reading…" (dashboards/PeriodPicker.tsx:44-49)
- [ ] Edge note under the period (data.range.edge_note) (dashboards/BriefingDashboards.tsx:1397-1399)
- [ ] Figure tile: figure at its unit; "Outside what its unit states"; change line "X higher/lower than <prev>" coloured only when the card has a limit side; "· not at equal age"; "No figure for <prev> to compare with"; standing change "than its last run" (dashboards/DashboardTile.tsx:220-243, :312-339)
- [ ] "All history, not <covers> — <why>" (card could not be scoped) (dashboards/DashboardTile.tsx:340-344)
- [ ] Limit line "Limit: at or above X" / "Past its limit…" + "· alerting" (dashboards/DashboardTile.tsx:345-351)
- [ ] Bigger figure tile — metric trend strip over prior ranges (dashboards/DashboardTile.tsx:257-284, :356)
- [ ] Trend tile — newest point "date · value", limit rule on chart (dashboards/DashboardTile.tsx:405-423)
- [ ] Tile foot — source: "Approved metric" / "Trusted query" / "Finding" / "Query" (+ ", by <gran>" / ", for <covers>") and "N guard caveat(s)" (dashboards/DashboardTile.tsx:96-105, :357-363)
- [ ] Query tile foot — "Your query · <duration>, for <covers> · read straight from the tables" or "Reads the sheet"; figure + "beside" chip; "said" notes (dashboards/DashboardTile.tsx:491-525)
- [ ] Section header — "N cards wait on a condition"; tab — "N sections wait on a condition" (dashboards/ComposedDashboard.tsx:242-246, :409-413)
- [ ] Note tile — "Your words" chip, author + date stamp; Image tile — "Static" chip, uploader + date (dashboards/StaticTile.tsx:90, :146)
- [ ] "Not filtered" chip on pieces the filters do not narrow — "this one reads everything" (dashboards/OntologyPieces.tsx:484)
- [ ] Table/list: "a–b of N · by <sort>, highest first", "not counted"; edited/masked cell icons (dashboards/OntologyPieces.tsx:694-771)
- [ ] Process board: "broken on X%", "N left the process", "Measured <date>" (dashboards/OntologyPieces.tsx:574-610)
- [ ] Object detail foot "Follows the choice · read live" (dashboards/OntologyPieces.tsx:854)
- [ ] Question piece chips: asking now / contradicted / answered / no answer; "Answered <when>, for <period> against <x>"; cost words; "No answer yet. The first comes <when>" (dashboards/QuestionPiece.tsx:42-45, :83, :172-204)
- [ ] Shared App line — "An App by <person>, for <groups> · version N · read-only" (dashboards/BriefingDashboards.tsx:685-687)
- [ ] Version line — "Version N · drafted, kept / kept by <person> · <date time>"; history rows "N added · N removed · N changed" or the change in words, "· what its readers read", "current" (dashboards/BriefingDashboards.tsx:1051-1070)
- [ ] PinStrip one-liner — "Its pieces read release N of the ontology, the one it was composed against." (dashboards/PinStrip.tsx:38-43)

**Keyboard shortcuts**
- [ ] Escape closes an open object drawer (dashboards/ComposedDashboard.tsx:1065-1070)
- [ ] Enter / Space on a clickable figure, breakdown row or list card chooses it (dashboards/OntologyPieces.tsx:1300, :1395, :1425; AppPieces.tsx:150)
- [ ] Values bar input — Enter commits, Escape reverts (dashboards/OntologyPieces.tsx:1196)

**URL params / deep links**
- [ ] Reads/writes `?tab=dashboards` (and `?layer=dashboards` with `tab=intelligence`); `cockpit` aliases (web/app/page.tsx:943, :1011-1012)
- [ ] Writes none of its own for the chosen dashboard — the choice lives in localStorage `pramanyx:cockpit:<conn>` (dashboards/BriefingDashboards.tsx:112-118)
- [ ] `requestTab("dashboards", { conn })` — a file dashboard opens on the Sheets connection (dashboards/BriefingDashboards.tsx:373)
- [ ] Out-links: Question piece → `requestTab("chat", { run })` (Data Canvas) (dashboards/QuestionPiece.tsx:123, :191)

**Empty / error / loading / withheld states**
- [ ] "Reading your dashboards…" (list loading) (dashboards/BriefingDashboards.tsx:1004)
- [ ] "Reading the dashboard…" / Loading "the cards for <period>" with the old cards dimmed (dashboards/BriefingDashboards.tsx:1396, :1400-1407)
- [ ] Empty: "You have no dashboards yet / in use — A dashboard is the set of cards you keep watching for one area… It is yours: nobody else sees it or changes it." (dashboards/BriefingDashboards.tsx:1031-1045)
- [ ] Under Metrics: "No dashboard of your own yet / in use — the cards you keep watching for one area" + door (dashboards/BriefingDashboards.tsx:1024-1030)
- [ ] Error "Failed · Your dashboard could not be read." + Try again (dashboards/BriefingDashboards.tsx:1348-1351)
- [ ] Withheld card — "Withheld · Not shown · You may not see this card. It is here, and it is not empty" (dashboards/DashboardTile.tsx:583-595)
- [ ] "Not one of your cards — The dashboard places a card you do not have." (dashboards/ComposedDashboard.tsx:807)
- [ ] "Could not be drawn — This card is here, and drawing it failed: …" (dashboards/ComposedDashboard.tsx:440)
- [ ] Figure tile "Could not be read"; sheet removed says why (dashboards/DashboardTile.tsx:313-316)
- [ ] "No figure for <covers>" / "No figure" / "…" (dashboards/DashboardTile.tsx:324-326)
- [ ] Query tile "This query cannot be read: <why>" / "Reading…" / waiting "<choose words> — this reads <label> from it." (dashboards/DashboardTile.tsx:458-580; ComposedDashboard.tsx:780)
- [ ] Pieces: "This table/list/map/timeline/choice cannot be read", "Not a process here", "Follows nothing here", "No objects in this set.", "None of these has a place to put on a map.", "Choose one to see it here." (dashboards/OntologyPieces.tsx:542-812; AppPieces.tsx:123-353)
- [ ] Action buttons: "Reading the declared actions…", "The declared actions could not be read, so no button is offered." (dashboards/ActionButtonsPiece.tsx:47-49)
- [ ] Shared App: "Not read · This shared dashboard could not be read." / "Reading the shared dashboard…" (dashboards/BriefingDashboards.tsx:679-680)
- [ ] Toast "Couldn't refresh card — The query failed the trust guards or the source is unavailable." (dashboards/BriefingDashboards.tsx:896)

**Loads on open (API calls)**
- [ ] `GET /dashboards?connection_id=` — the person's dashboards (listDashboards) (dashboards/BriefingDashboards.tsx:808; web/lib/api.ts:3338)
- [ ] `GET /dashboards/shared` — Apps shared with the person (dashboards/BriefingDashboards.tsx:821; web/lib/api.ts:3542)
- [ ] `GET /dashboards/{id}?preset|start|end` — the chosen dashboard for the period (dashboards/BriefingDashboards.tsx:832)
- [ ] **WRITES + SPENDS (warehouse)** `POST /cards/{id}/run?…&compare=true` — once PER PLACED CARD on every open and every period change; runs the card's SQL through the guards and records a single-cell result as the card's latest value (dashboards/BriefingDashboards.tsx:834-839; web/lib/api.ts:3116; pramanyx/routers/cards.py:359-364)
- [ ] **WRITES + SPENDS (warehouse)** same `POST /cards/{id}/run` with values/filters for each query card that reads dashboard values or a file's filters (dashboards/ComposedDashboard.tsx:748-772)
- [ ] **SPENDS (warehouse)** `POST /objects/query` and `POST /objects/list` — every ontology piece (filters' facet counts, tables, figures, breakdowns, charts, lists, maps, timelines) (dashboards/OntologyPieces.tsx:331, :983; web/lib/objects.ts:504, :557)
- [ ] `POST …/metric trend` (readMetricTrend) for a bigger metric figure tile — **SPENDS (warehouse)** (dashboards/DashboardTile.tsx:265; web/lib/api.ts:8606)
- [ ] Question piece `readQuestion` (reads kept answers; never asks) (dashboards/QuestionPiece.tsx:141)
- [ ] `getDeclaredActions` for action buttons; object catalog (cached) (dashboards/ActionButtonsPiece.tsx)
- [ ] Image bytes `dashboardImageUrl` per placed image (dashboards/BriefingDashboards.tsx:998-1001)

**Top rows today:** (1) the Intelligence workspace header — layer tabs + Connection / Schema pickers + ScopeMaturity; (2) the dashboard picker strip "Metrics | Your dashboards … | Apps shared with you … | + New dashboard"; (3) the dashboard's own bar — Period picker (left) and History + Edit (right); then optional move-offer lines, PinStrip and edge note above the canvas.

### 2.2 Builder (edit) mode — opened by "Edit"

Three panes under one edit bar: left Layout/Variables pane (232 px) · middle canvas · right Setup (304 px) (dashboards/DashboardBuilder.tsx:237-383). The app rail folds to icons while the builder is open (dashboards/BriefingDashboards.tsx:975). Every change is drawn at once, rules-checked first, and kept as ONE version ~900 ms after a burst (dashboards/BriefingDashboards.tsx:700, :913-956).

**Controls — edit bar**
- [ ] Dashboard picker (select "The dashboard being edited") — switches dashboards without leaving the builder (dashboards/BriefingDashboards.tsx:1142-1146)
- [ ] "Editing" tag (dashboards/DashboardBuilder.tsx:445)
- [ ] Saved readout — "Saving…" / "saved HH:MM · version N" (dashboards/BriefingDashboards.tsx:1130-1132; DashboardBuilder.tsx:446)
- [ ] "Undo" — last change back, kept as a version of its own (≤50 steps) (dashboards/DashboardBuilder.tsx:447; BriefingDashboards.tsx:957-962)
- [ ] "Redo" (dashboards/DashboardBuilder.tsx:448; BriefingDashboards.tsx:963-968)
- [ ] "Preview as" select — "Preview as · you" / "Preview as <group>" (only when the person has groups) (dashboards/BriefingDashboards.tsx:1149-1155)
- [ ] "History" — swaps the Setup pane for the history list (dashboards/BriefingDashboards.tsx:1156-1159)
- [ ] Publish door — label "Publish as an App" / "An App for <groups>" / "An App for <groups> · readers see version N"; toggles the Publish panel (dashboards/BriefingDashboards.tsx:1160-1164; web/lib/dashboards/appVersion.ts:27-35)
- [ ] "Retire" — opens the retire confirm (dashboards/BriefingDashboards.tsx:1165-1167)
- [ ] "Done" — keeps any waiting burst and returns to view mode (dashboards/DashboardBuilder.tsx:451; BriefingDashboards.tsx:969-973)

**Controls — left pane**
- [ ] Segmented "Layout | Variables" (dashboards/DashboardBuilder.tsx:242-243)
- [ ] Layout tree "Layout · N lines" — one line per element (icon, name, w × h), click chooses it (dashboards/DashboardBuilder.tsx:78-108, :250-251)
- [ ] Add section — "Add a piece" (opens the piece picker for the chosen section) (dashboards/DashboardBuilder.tsx:258-263)
- [ ] Add — "+ Card" (NewCardComposer) (dashboards/BriefingDashboards.tsx:1173-1175)
- [ ] Add — "+ Note" (by hand only) (dashboards/BriefingDashboards.tsx:1176-1179)
- [ ] Add — "+ Question" (agent answers on a rhythm) (dashboards/BriefingDashboards.tsx:1180-1183)
- [ ] Add — "+ Image" (upload) (dashboards/BriefingDashboards.tsx:1184-1187)
- [ ] Add — "+ Finding" (findings ledger picker) (dashboards/BriefingDashboards.tsx:1188-1192)
- [ ] Add — "+ From the ontology" (process board / objects table / object detail / action button composer) (dashboards/BriefingDashboards.tsx:1193-1197)
- [ ] Add — "+ Action buttons" (places a buttons piece wired to the first declared action; toast "No action is declared here — Declare one in Ontology ▸ Actions" when none) (dashboards/BriefingDashboards.tsx:1198-1212)
- [ ] Variables pane — "Values N of 8" list (mark, label, where it comes from, holds now, "used in N"/"not used yet"), "+ New value" (dashboards/WiringSetup.tsx:235-255)
- [ ] Variables pane — "Sets N of 12" list (label, start · segment · N conditions → linked · combined; count + read time; "read by N"), "+ New set"; "None yet: every piece reads its own entity." (dashboards/WiringSetup.tsx:256-263, :112-138)
- [ ] Variables pane — "From the pieces" choices (a row clicked / rows ticked / a figure clicked in …; "used in N") (dashboards/WiringSetup.tsx:220-266)

**Controls — canvas selection bar (above the canvas)**
- [ ] Chosen element kind + title; "Choose a piece on the dashboard, or a line in its layout." when none (dashboards/DashboardBuilder.tsx:285-351)
- [ ] Move earlier / Move later (chevrons) (dashboards/DashboardBuilder.tsx:292-295)
- [ ] Split (section): above / below / left / right (dashboards/DashboardBuilder.tsx:297-305)
- [ ] "Section inside" (laid-out section) (dashboards/DashboardBuilder.tsx:306-311)
- [ ] "Duplicate" (not for filter column or drawer) (dashboards/DashboardBuilder.tsx:315-320)
- [ ] "Take off" (dashboards/DashboardBuilder.tsx:321-322)
- [ ] Width steps −/+ "of 12" for a section in columns (dashboards/DashboardBuilder.tsx:325-331)
- [ ] Width / Height steps −/+ for a gridded piece (dashboards/DashboardBuilder.tsx:333-338)
- [ ] Filter column width steps −/+ "<px> px" (dashboards/DashboardBuilder.tsx:340-346)
- [ ] Checks chip — "N read cleanly · N reading · N to fix"; opens a list of pieces to fix, each click chooses it (dashboards/DashboardBuilder.tsx:390-424)
- [ ] Fit / zoom toggle — "Fit · NN%" ↔ "100%" (canvas lays out ≥1100 px, scaled to fit) (dashboards/DashboardBuilder.tsx:354-358)
- [ ] Variable/set/choice chosen — header says "Set/Variable/Chosen <name> — the N pieces that read it are dashed" (dashboards/DashboardBuilder.tsx:275-284)

**Controls — on the canvas (builder doors)**
- [ ] Click any piece / section / filter column / drawer to choose it (outlined) (dashboards/ComposedDashboard.tsx:191-194, :297-304, :714-716)
- [ ] Grid handles — drag right edge (columns), bottom edge (rows), corner (both), one grade at a time, with "w × h" readout and dashed ghost (dashboards/ComposedDashboard.tsx:518-579, :727-736)
- [ ] Size-by-name corner "◢" (sections not on the grid, where offered) (dashboards/ComposedDashboard.tsx:448-491, :737-740)
- [ ] Filter column width handle (40 px a step, "<px> px" readout) (dashboards/ComposedDashboard.tsx:582-620)
- [ ] Empty section — "Add a piece" and "Split into…" → "Columns" / "Rows" / "Tabs" (dashboards/ComposedDashboard.tsx:352-385)
- [ ] Drawer drawn open in the builder with "Add a piece" (dashboards/ComposedDashboard.tsx:1080-1096)
- [ ] Tile "Take off this dashboard" (card kept) + Size pick select (small / wide / tall / large / full / hero, where offered) (dashboards/DashboardTile.tsx:195-215; SizePick.tsx:21-35; web/lib/dashboards/catalog.ts:71)
- [ ] Note tile — "Edit the note" (textarea, save/"Cancel"), "Take off this dashboard" (dashboards/StaticTile.tsx:80-98)
- [ ] Image tile — "Change the caption" (input, Enter saves, Escape cancels, "Cancel"), "Take off this dashboard" (dashboards/StaticTile.tsx:127-143)
- [ ] Process board "N open and overdue · add a table" — places an objects table of that segment (dashboards/OntologyPieces.tsx:584-588; BriefingDashboards.tsx:988-989)

**Controls — Setup pane (right) per element kind** (PieceSetup)
- [ ] Empty: "Choose a piece on the dashboard, or a line in its layout, to set it up…" (dashboards/PieceSetup.tsx:736-743)
- [ ] Dashboard (Cockpit): Name (dashboards/PieceSetup.tsx:764-766)
- [ ] Tab: Label (dashboards/PieceSetup.tsx:767-769)
- [ ] Section: Title, "In the tab" select, "Laid out" readout (on the grid / N columns) (dashboards/PieceSetup.tsx:770-784)
- [ ] Card: "Edge" tone select (None/Good/Watch/Bad/Note/Plain) (dashboards/PieceSetup.tsx:785-793)
- [ ] Card of your own query: QuerySetup inline (see below) (dashboards/BriefingDashboards.tsx:1215-1224)
- [ ] Note: Words (textarea) (dashboards/PieceSetup.tsx:794-798)
- [ ] Image: Caption (dashboards/PieceSetup.tsx:799-801)
- [ ] Drawer: Title, "Opens on" (a chosen choice) (dashboards/PieceSetup.tsx:802-810)
- [ ] Process board: Process select (dashboards/PieceSetup.tsx:495-509)
- [ ] Object detail: "Shows the object chosen in" select (dashboards/PieceSetup.tsx:812-819)
- [ ] Action button: Action select (only actions taking the detail's object) (dashboards/PieceSetup.tsx:511-530)
- [ ] Reads (set readers): "Every <entity>" or a named set (dashboards/PieceSetup.tsx:631-642)
- [ ] Choosers: "A click — Names the <noun> it chooses, for other pieces" checkbox; "Ticks — A tick beside each row/card" checkbox; "Figures switch it" select (dashboards/PieceSetup.tsx:661-691)
- [ ] Objects table: "Lists" segment select; "Columns N of 8" checklist (order numbers); "Sorted by" + Descending/Ascending (dashboards/PieceSetup.tsx:286-330)
- [ ] Table / list: "Mark rows in" segment + colour (Good/Watch/Bad/Note/Plain) (dashboards/PieceSetup.tsx:269-284)
- [ ] Figure: Label; Measures (How many / How many different / The sum of / The average of / The least / The most) + Of; "Written as" A number / Money; "Said beside" (of another set); "A click shows it" (dashboards/PieceSetup.tsx:333-377, :694-713)
- [ ] Chart: Label; Across (date); Days 7/14/30/60/90; Measures; "Split by" + "Values drawn" Top 3–6 (dashboards/PieceSetup.tsx:379-411)
- [ ] Breakdown: Label; Grouped by; one to three measures ("Add a measure", "Take this measure off"); "Groups shown" Top 5/8/10/12; "Shown as" Table with shares / Bars (dashboards/PieceSetup.tsx:415-454)
- [ ] Filter column: "Filters by N of 6" list with move up/down/take off, "+ Add a filter"; "Counts within" (dashboards/PieceSetup.tsx:456-493, :646-657)
- [ ] Object list: "Each is called by", "Beside it", "Marked by", "Sorted by" + order (dashboards/PieceSetup.tsx:545-570)
- [ ] Map: Latitude, Longitude, "Each is called by" (dashboards/PieceSetup.tsx:572-585)
- [ ] Timeline: From, To, "Each is called by" (dashboards/PieceSetup.tsx:587-602)
- [ ] Choose one: "Found by" (dashboards/PieceSetup.tsx:604-613)
- [ ] Search: Label, "Looks in" (dashboards/PieceSetup.tsx:615-626)
- [ ] Action buttons (ButtonsSetup): button list (choose, "primary", move earlier, take off), "+ Add a button", the button's action, label, Primary checkbox, per-parameter "Where <p> comes from" (Asked in the form / The same every time / a choice) + fixed value, "Ask first" Show the form / Run when complete, "When it cannot run" Disabled, saying why / Hidden, "Read <set> again" after (dashboards/ButtonsSetup.tsx:78-175)
- [ ] Placed elements: "In the section" select incl. "A new section…" (name input, Enter/Escape, "Cancel") (dashboards/PieceSetup.tsx:236-263)
- [ ] Set setup: Name, "Starts from" (entity or another set), "Keeps only" segment, "And where" conditions (property, "Is" operator, "Compared with" a variable or a typed value, × take off, "+ A condition on a property"; max 6), "Linked to" + "Through", "Gets its linked objects", "Combined with" Either/Both/But not + set, "Holds now" (count · counted in Xs), "Step by step" chain, "Keep as a segment" (declares a condition rule in the ontology draft), "Read by", "Take away" (only when unread) (dashboards/WiringSetup.tsx:351-676) — "Keep as a segment" WRITES the ontology draft
- [ ] Value setup: Name (`{{name}}` in a query), "Comes from" (Set by you / Set by the reader on the page / Counted from a set / Summed over a set / Read from a query of yours / Read from the chosen object) + its set/property/query/column, "Is" kind (A number of days / A number / A word / A day / Yes or no / A list), the value (Yes/No, input), "The reader chooses from" choices, "Holds now", "Read by", "Take away" (dashboards/WiringSetup.tsx:681-900)
- [ ] Choice setup: "Chosen by the reader" — "Made by" a row clicked / rows ticked / a figure clicked in …; "Read by" (dashboards/WiringSetup.tsx:905-918)
- [ ] History (in place of Setup): "Back to the setup", version list with "Go back to this" (dashboards/BriefingDashboards.tsx:1225-1232)

**Controls — "above the canvas" area**
- [ ] "In words" composer (AskChange) — input "In words: “add the finding about returns by category”, “make the net sales card bigger”, “share this with the sales team”", "Propose" (Enter too) → DraftReview (dashboards/BriefingDashboards.tsx:506-556, :1284-1285) — SPENDS (one model run) on Propose
- [ ] DraftReview — summary, "Why it is arranged this way", editable outline (DashboardArrange), "Taken off: …", "Keep it" / "Keep, with my changes", "Discard" (dashboards/BriefingDashboards.tsx:222-288)
- [ ] DashboardArrange (outline editor inside a draft) — Dashboard name, Tab name + move tab ↑↓, Section name + move ↑↓ + "Move to tab…" (incl. "A new tab…"), per card: Size pick, ↑↓, "Move to…" (incl. "A new section…"), "Take off"; "Name of the new section/tab" + "Add"/"Cancel" (dashboards/DashboardArrange.tsx:40-196)
- [ ] Preview banner — "Previewing as <group>. Each piece reads what you and a member of it may both see; nothing is run or changed." + "Stop previewing"; "Withheld — <line>" per row policy/mask, or "No row policy or mask holds back what these pieces read from this group." (dashboards/BriefingDashboards.tsx:1242-1259)
- [ ] Retire confirm — "Retire this dashboard? It leaves your strip for good and cannot be brought back; its history stays in the record." + "Retire it" / "Keep it" (dashboards/BriefingDashboards.tsx:1261-1272) — WRITES
- [ ] PinStrip with "Pin to / Re-pin to release N" (dashboards/BriefingDashboards.tsx:1286-1290)
- [ ] Piece picker dialog (see Dialogs)
- [ ] Composers (see Dialogs)

**Dialogs / drawers / popovers / panels**
- [ ] Piece picker dialog "Add a piece" — "To <section>." / "To the dashboard."; "What it reads" entity select + "Which of them" (Every one / a set); "Find a piece" search; groups: Show objects (Objects table, Object list, Map, Timeline, Object detail, Linked objects, Drawer) · Measure (Figure, Chart, Breakdown, Process board, Card, Your own query, Finding) · Filter (Filter column, Search, Choose one) · Act (Action buttons) · Words & media (Note, Image); disabled entries say why; "No piece is called that." (dashboards/PiecePicker.tsx:43-72, :295-345)
- [ ] NewCardComposer "New card" — modes "From metric" / "Build"; metric select + shape buttons; Build: table, aggregation, measure, "By: nothing (single value)"; title; live preview ("Running preview…" / "No preview"); "Cancel"; "Pin to dashboard" (brief/NewCardComposer.tsx:191-316) — SPENDS (warehouse preview on each change); WRITES on Pin
- [ ] NoteComposer — textarea ("Target for Q4: return rate under **10%**…"), "N / 2000", "Place the note", "Cancel" (dashboards/BriefingDashboards.tsx:138-155)
- [ ] ImageComposer — file input (PNG/JPEG/GIF/WebP/SVG ≤5 MB), Caption, "Upload and place" / "Uploading…", "Cancel" (dashboards/BriefingDashboards.tsx:158-194) — WRITES (upload)
- [ ] QuestionComposer — "The question" textarea, "Answer it" Daily / Weekly / Monthly / Only when I ask, period line, cost estimate, "Keep the question", "Cancel" (dashboards/QuestionComposer.tsx:19-95) — WRITES an automation that SPENDS on its rhythm
- [ ] FindingPicker "From the findings ledger" — search "Search by words, domain or angle", findings by domain, per row "· no query — nothing to measure" / "· on this dashboard", place button, "Close"; "The first N are shown; search to narrow them." (dashboards/FindingPicker.tsx:59-110) — place re-runs the finding's query through the guards (SPENDS warehouse, WRITES card)
- [ ] OntologyPieceComposer — "What to place": Process board / Objects table / Object detail / Action button; Process, Entity, Segment, columns checklist, "And a detail beside it", "Table it follows", Detail, Action, "Actions in the detail", Section; "Place" / "Cancel" (dashboards/OntologyPieceComposer.tsx:26-29, :159-251)
- [ ] QuerySetup "Card · your own query" — Name, SQL textarea ("read-only · one SELECT"), "Tables" list (insert a table name), "A variable" list (insert `{{name}}`), "Run" (also Cmd/Ctrl+Enter), try-values inputs, result preview ("· the SQL changed since"), "Shown as" Table / Figure / Bar / Line / Area / Scatter, columns chips, sort Largest first / Smallest, Calculation (Count / Count of different / Sum / Average / Least / Most), Label, series ("Another series", take off), by Day/Week/Month/Quarter/Year, Split by, Segments, Labels, Top N · the rest as Other, Summed by the platform switch, Running total switch, "Keep" / "Keep the change", "Close" (dashboards/QuerySetup.tsx:37-421) — Run SPENDS (warehouse, `POST /dashboards/queries/preview`); Keep WRITES (`POST /dashboards/queries`)
- [ ] Publish panel "Publish as an App to" — checkbox per group/role ("a group you belong to" / "a role you hold"), explainer, "Its readers read version N. What you kept since is a draft…", "Publish the App" / "Publish your changes", "Unpublish the App", "Close" (dashboards/BriefingDashboards.tsx:561-621) — WRITES
- [ ] Checks list popover (dashboards/DashboardBuilder.tsx:407-421)
- [ ] Refusal panel for a refused keep (dashboards/BriefingDashboards.tsx:1260)

**Figures / counts / badges / chips / as-of**
- [ ] "saved HH:MM · version N" / "Saving…" (dashboards/BriefingDashboards.tsx:1131-1132)
- [ ] "Layout · N lines"; each line's "w × h" (dashboards/DashboardBuilder.tsx:88, :250)
- [ ] Checks chip counts (dashboards/DashboardBuilder.tsx:405)
- [ ] Zoom "Fit · NN%" (dashboards/DashboardBuilder.tsx:357)
- [ ] Width/Height readouts, "of 12", "<px> px" (dashboards/DashboardBuilder.tsx:117-121, :330, :345)
- [ ] Drag readout "w × h" / "<px> px" (dashboards/ComposedDashboard.tsx:570-575, :613-616)
- [ ] Variables: "Values N of 8", "Sets N of 12", set counts + read time "· 0.4 s", "read by N", "used in N" (dashboards/WiringSetup.tsx:235-256, :131-134)
- [ ] Set setup "Holds now … · counted in Xs"; "Kept as segment <id> · N" + "In the draft: readers get it when the ontology is published." (dashboards/WiringSetup.tsx:452-457, :555-567)
- [ ] Setup "Columns N of 8", "Filters by N of 6" (dashboards/PieceSetup.tsx:304, :468)
- [ ] Drawer in builder: "A drawer — opens beside the page when “…” is chosen" (dashboards/ComposedDashboard.tsx:1087)
- [ ] Action buttons in preview: disabled buttons + "Nothing is run from a preview." (dashboards/ActionButtonsPiece.tsx:55-59)

**Keyboard shortcuts**
- [ ] Alt + Arrow keys on a focused piece — one grade wider/narrower/taller/shorter (dashboards/ComposedDashboard.tsx:635, :717-724)
- [ ] Enter in the "In words" input proposes (dashboards/BriefingDashboards.tsx:531)
- [ ] Enter commits / blur saves in every Setup text field; Escape cancels a new-section name, a condition draft, a caption edit (dashboards/PieceSetup.tsx:174-190, :247-249; WiringSetup.tsx:666; StaticTile.tsx:140)
- [ ] Cmd/Ctrl + Enter runs the query in QuerySetup (dashboards/QuerySetup.tsx:221)

**URL params / deep links**
- [ ] None of its own; the builder is local state (`editing`) — a reload returns to view mode (dashboards/BriefingDashboards.tsx:774)

**Empty / error / loading / withheld states**
- [ ] Toast "That change is not made — <rule>" when the rules refuse an edit (dashboards/DashboardBuilder.tsx:173-179)
- [ ] Toast "The new size was not kept" (dashboards/BriefingDashboards.tsx:931)
- [ ] Setup: "Reading what <noun> holds…" / "What <noun> holds could not be read: …" (dashboards/PieceSetup.tsx:752-756)
- [ ] Set: "cannot be read", "counted on the page", "waits on the <choice>", "nothing to add up"; "No other set holds … objects yet." (dashboards/WiringSetup.tsx:99-109, :447-449)
- [ ] Condition draft: "Give it what it <op> to keep it — Escape leaves it as it was." (dashboards/WiringSetup.tsx:669-672)
- [ ] Keep as a segment refused sentence (dashboards/WiringSetup.tsx:547-552)
- [ ] Publish panel: "Who you may publish to could not be read: …", "You belong to no group and hold no role a dashboard can be published to." (dashboards/BriefingDashboards.tsx:581-583)
- [ ] "Not proposed — No change was drafted for this." (dashboards/BriefingDashboards.tsx:541-547)
- [ ] QuerySetup "This dashboard holds no value yet: add one in Variables." / "No tables are listed for this connection." / "Run the query to choose its columns." (dashboards/QuerySetup.tsx:237-315)
- [ ] FindingPicker "The explorer has recorded no findings on this connection yet." (dashboards/FindingPicker.tsx:82)

**Loads on open (API calls)**
- [ ] `GET /groups` — for Preview as (dashboards/BriefingDashboards.tsx:778)
- [ ] Object catalog (cached) for entity names (dashboards/DashboardBuilder.tsx:43-56)
- [ ] Everything the canvas draws, as in view mode — card runs (**WRITES + SPENDS warehouse**) and object-door queries (**SPENDS warehouse**); again under each "Preview as" group (`as_group`) (dashboards/BriefingDashboards.tsx:1293-1302)
- [ ] Choosing an element: `getObjectType` (+ linked types, processes) for its fields (dashboards/PieceSetup.tsx:106-142)
- [ ] Variables tab: **SPENDS (warehouse)** `POST /objects/query` count per set line, per chain step, per counted/summed value (dashboards/WiringSetup.tsx:75-110)
- [ ] Set setup: `getProcesses` to find an already-kept segment (dashboards/WiringSetup.tsx:537-546)
- [ ] Publish panel: `GET /dashboards/audiences` (dashboards/BriefingDashboards.tsx:571)
- [ ] QuestionComposer: `GET /dashboards/questions/cost` (dashboards/QuestionComposer.tsx:48-52)
- [ ] Each edit: **WRITES** `PUT /dashboards/{id}` (one version per burst) (web/lib/api.ts:3358)

**Top rows today:** the builder replaces the strip and the view bar with ONE edit bar — dashboard select · "Editing" · saved readout · Undo · Redo · (spacer) · Preview as · History · Publish door · Retire · Done; under it the canvas's own selection bar (chosen element + move/split/duplicate/take off/steps · checks chip · Fit/100%). The "In words" composer, preview banner, retire confirm, PinStrip and open composers sit at the top of the canvas, above the dashboard.

### 2.3 Metrics dashboard / ledger (strip tab "Metrics", the default)

**Controls**
- [ ] Period picker (no "As written" use: it says why) (dashboards/MetricsDashboard.tsx:44-46)
- [ ] Segmented "Which metrics" — "All N" / "Key movements N" (dashboards/MetricsLedger.tsx:399-401)
- [ ] "Find a metric" search with "N of M" found (dashboards/MetricsLedger.tsx:403-405)
- [ ] "See them" (needs-you row) → filter to not-measured; "Show all" back (dashboards/MetricsLedger.tsx:394, :409)
- [ ] Table actions — "Copy" / "CSV" (or "Copy shown" / "CSV shown") (dashboards/MetricsLedger.tsx:412; TableActions.tsx:71-82)
- [ ] Metric name (link) — opens the row's reasons in place (dashboards/MetricsLedger.tsx:280-282)
- [ ] Readout work-kind buttons (open the row) (dashboards/MetricsLedger.tsx:308)
- [ ] Opened row: "Open the deep analysis" / "Open the decision" (→ `?tab=chat&run=` / `?tab=decisions&id=`) (dashboards/MetricsLedger.tsx:137-140, :186)
- [ ] Opened row: "See how it is defined" (opens the MetricDetail drawer) (dashboards/MetricsLedger.tsx:202-205)
- [ ] Opened row: "Ask why it moved" (sends the question to the agent) (dashboards/MetricsLedger.tsx:207) — SPENDS on click (model run)
- [ ] Not-measured row: "Open in the Semantic Layer" (dashboards/MetricsLedger.tsx:351-357)
- [ ] "Try again" when the data could not be reached / load failed (dashboards/MetricsDashboard.tsx:104)
- [ ] Below the ledger, when no own dashboard: none-yet line + "Start “My dashboard”…" / "New dashboard" (dashboards/BriefingDashboards.tsx:1357)

**Dialogs / drawers / panels**
- [ ] Opened row ("Reasons"): How it is reading · What the platform knows (work items with kind chip, when, note) · How it is measured (+ Expected next band words) (dashboards/MetricsLedger.tsx:142-212)
- [ ] MetricDetail drawer — "Measured for <covers>" (current, previous, a year earlier), "How it ran", "Expected next — <label>", "What moved inside it", per-range history table, "How it is measured" (+ caveat), "Ask why it moved" (brief/MetricDetail.tsx:149-264)

**Figures / counts / badges / chips / as-of**
- [ ] Bar chips — "<period short>", "vs <previous>", amber "data N days behind" (title says which tables still move) (dashboards/MetricsDashboard.tsx:52-64)
- [ ] "measured / as the Briefing measured it · just now / N ago" (dashboards/MetricsDashboard.tsx:65-69)
- [ ] Edge note under the bar (dashboards/MetricsDashboard.tsx:73-75)
- [ ] Tally — "N measured · N key movements · N not read against usual · N still settling · read live · N not measured" (dashboards/MetricsLedger.tsx:380-387)
- [ ] Needs-you row — "N approved metrics are not measured for <period>" + why counts; empty "Nothing needs you — every approved metric is measured for this period" (dashboards/MetricsLedger.tsx:389-396)
- [ ] Table columns — Metric · <current> · Trend (sparkline) · vs <previous> · vs a year ago · Expected <target> · Readout; grouped by area with group head counts (dashboards/MetricsLedger.tsx:420-430, :340-347)
- [ ] Row chips — "not at equal age", "live", "to date" / "still settling", band doubt chip (dashboards/MetricsLedger.tsx:287-289, :310)
- [ ] Sorted bad-first, then furthest from usual (dashboards/MetricsLedger.tsx:242)

**Keyboard shortcuts**
- [ ] None of its own

**URL params / deep links**
- [ ] Out: `requestTab("semantic", { conn })`, `("chat", { run })`, `("decisions", { id })` (dashboards/MetricsLedger.tsx:137-140, :357)

**Empty / error / loading / withheld states**
- [ ] "“As written” is for cards. A metric is measured for a period — pick one above." (dashboards/MetricsDashboard.tsx:77-78)
- [ ] Loading "the metrics for <period>", old table dimmed (dashboards/MetricsDashboard.tsx:76-83)
- [ ] Unreachable: "The data could not be reached, so nothing was measured — <why>. No metric needs anything from you; the figures are read again when the data answers." + Try again (dashboards/MetricsDashboard.tsx:96-104)
- [ ] "No approved metric is on this connection yet. Approve one in the Semantic Layer and it is measured here." (dashboards/MetricsDashboard.tsx:108)
- [ ] Ledger: "No metric matches “…”.", "Reading each metric's past…", no-key-move words, "Nothing here.", not-read lines, "The data also holds X and Y, with no metric reading them yet." (dashboards/MetricsLedger.tsx:433-445)
- [ ] Hatched not-measured rows with their reason (dashboards/MetricsLedger.tsx:351-360)

**Loads on open (API calls)**
- [ ] **SPENDS (warehouse)** `POST /exploration/{conn}/briefing/measures?…` — measures every approved metric for the period (unless reused "as the Briefing measured it") (dashboards/MetricsDashboard.tsx:31-34; web/lib/api.ts:8551)
- [ ] **SPENDS (warehouse)** `POST` metric trend — ONE PER MEASURED METRIC, a few at a time (dashboards/MetricsLedger.tsx:58-75; web/lib/api.ts:8606)
- [ ] `POST` expected-next band (readExpectedNext) (dashboards/MetricsLedger.tsx:222; web/lib/api.ts:8690)
- [ ] `GET /exploration/{conn}/briefing/edition` (readBriefingEdition — the Briefing's work on each metric) (dashboards/MetricsLedger.tsx:224; web/lib/api.ts:8378)
- [ ] `getMetricCoverage` (dashboards/MetricsLedger.tsx:226)

**Top rows today:** the dashboard strip (Metrics selected) then one bar — Period picker left; period chip, "vs" chip, "data N days behind", "measured … ago" right; then tally line, Needs-you, and a filter row (All/Key movements · Find a metric · Copy/CSV).

### 2.4 New dashboard dialog (from "+ New dashboard")

- [ ] Way buttons: "Start empty" / "From a file" / "From an object" / "From a pack template" / "For a process" / "Draft it with a model" (dashboards/BriefingDashboards.tsx:360-364)
- [ ] Start empty — "The dashboard's name", "What this dashboard is for — its first note", "Start it"; hints "Name it." / "Say what it is for…" / "No model is asked." (dashboards/BriefingDashboards.tsx:376-393) — WRITES
- [ ] From a file (FromFile) — "Choose a file" / "Choose another file" or drag-drop (.csv .tsv .xlsx .xls), "It becomes a sheet…"; "What should it show?" words; "Draft it"; "Stop"; "Put back" earlier words; "Not sure what to ask?" → "Write the words for me" / "Explore and draw it"; "What it looked at"; review: dashboard name, "Back to the words", "Keep N", "Needs you" questions (Yes / alternative / Change), "Open the sheet", "What it noticed", rows with keep checkboxes, "Edit" (card title + query, "Run it", "Cancel", "Runs on the file. No model is asked."), "Query" toggle, "Changed by you", filter rows, "Add a row" button row, "What if" scenario row, "Ask for a change…" + "Change it" (dashboards/FromFile.tsx:102-506) — WRITES a sheet; Draft / Write the words / Explore / Change it SPEND (model)
- [ ] From an object — "The object" select (or "What each object suggests" suggestion cards with shape label), then ObjectDashboardStarter: Shape radio ("fits best"), groups "Which <noun> wait", "It holds", "Filters · its categories", "Figures · its numbers", "Chart · its dates", "Table (and actions)" checkboxes, "Cancel", "Make it" / "Create dashboard" (dashboards/BriefingDashboards.tsx:395-430; ObjectDashboardStarter.tsx:150-260) — WRITES
- [ ] From a pack template — list of templates, "Draft" per template ("No model is asked. Nothing is kept until you keep it."), then DraftReview (dashboards/PackTemplatePicker.tsx:41-75)
- [ ] For a process — "The process" select, "Start it", what it holds; "No process is declared on this connection yet. Design one in the Ontology, with New process." (dashboards/BriefingDashboards.tsx:440-467) — WRITES
- [ ] Draft it with a model — "What is it for? Returns, pricing, marketing…", "Draft it" (Enter too), "Drafting asks a model once. Nothing is kept until you keep it." → DraftReview / "Not drafted" refusal (dashboards/BriefingDashboards.tsx:469-498) — SPENDS (one model run)
- [ ] Loads: object catalog + `GET /dashboards/shapes` (From an object), `getProcesses` (For a process), `GET /packs/templates` (pack) — only when that way is chosen (dashboards/BriefingDashboards.tsx:304-329; web/lib/api.ts:3432, :10146)
- [ ] Dialog is held open (Close disabled, Escape and scrim ignored) while a draft or a start is in flight (dashboards/BriefingDashboards.tsx:754-759, :1324)

### 2.5 Shared dashboards (Apps shared with you) and other doors in

- [ ] Strip heading "Apps shared with you" + one tab per App: "<title> · <publisher>"; strip id `shared:<owner>/<id>` (dashboards/BriefingDashboards.tsx:1319-1320)
- [ ] Shared view — Period picker, "An App by … · version N · read-only", "Start my dashboard from this", PinStrip (no re-pin), the dashboard with Refresh only (dashboards/BriefingDashboards.tsx:626-697)
- [ ] Loads `GET /dashboards/shared/{owner}/{id}` + **WRITES + SPENDS** `POST /cards/{id}/run` per placed card (dashboards/BriefingDashboards.tsx:641-648)
- [ ] Doors into Dashboards from elsewhere: "Keep on a dashboard" on a chat answer / history detail (dashboards/KeepOnDashboard.tsx:67-90, used by ChatMessage.tsx, HistoryDetailPanel.tsx); "Make a dashboard" in Ontology entity panel (dashboards/MakeDashboard.tsx:22, used by ontology/EntityTypePanel.tsx); a sheet's dashboard (sheets/SheetDashboard.tsx)
- [ ] "Ask about these" / "Ask about this set" under an object table or list — hands the ticked objects / the set to the agent (dashboards/AskAbout.tsx:27-58; OntologyPieces.tsx:761; AppPieces.tsx:167)

### 2.6 Piece kinds (the catalog the renderer draws — every one must stay placeable and drawable)

| Kind | Drawn by | Placed from |
|---|---|---|
| Cockpit (root), Tabs, Tab, Section, Drawer | ComposedDashboard.tsx:156-385, :1052 | spec / split / picker "Drawer" |
| Card (figure · trend · rows · own query) | ComposedDashboard.tsx:786; DashboardTile.tsx | + Card, + Finding, Your own query, pinned cards |
| Note, Image | ComposedDashboard.tsx:818, :865; StaticTile.tsx | + Note, + Image |
| Question | ComposedDashboard.tsx:855; QuestionPiece.tsx | + Question |
| ProcessBoard, ObjectTable, ObjectDetail, ActionButton | ComposedDashboard.tsx:883-922 | + From the ontology, picker |
| ObjectFilters, ObjectFigure, ObjectChart, ObjectBreakdown | ComposedDashboard.tsx:927-978 | From an object, picker |
| ActionButtons | ComposedDashboard.tsx:982 | + Action buttons, picker |
| ObjectList, ObjectMap, ObjectTimeline, ChooseOne, ObjectSearch | ComposedDashboard.tsx:994-1048; AppPieces.tsx | picker |
| QueryFilters, ScenarioInputs, AddRow | ComposedDashboard.tsx:831-852 | From a file |
| (Linked objects) | picker entry — a set linked to the chosen one | picker |
(registry: dashboards/ComposedDashboard.tsx:1115-1142)


## 3. Spreadsheets

Reached from the rail row "Spreadsheets" (`?tab=spreadsheets`, web/app/page.tsx:2249-2251). `SpreadsheetsPage` shows the home or, when `?sheet=<id>` is set, one sheet; its `onAsk` hands a question to the main chat (`goToChat`). Every path below is under `web/components/sheets/` unless written in full.

**Page-wide**
- [ ] `?sheet=<id>` read on mount — opens that sheet directly (SpreadsheetsPage.tsx:16-19, 29)
- [ ] `?sheet=<id>` written / removed with `history.replaceState` on open and back — a sheet is linkable, Back leaves it (SpreadsheetsPage.tsx:21-26, 31)
- [ ] Each open sheet remounts by id — no state carries between sheets (SpreadsheetsPage.tsx:34)
- [ ] Any popover on a sheet closes on a click outside it or Escape (useCloseOutside.ts:14-31)

### 3.1 Sheets home (SheetsHome.tsx)

**Controls**
- [ ] Find a sheet (search box) — filters the list by sheet name or its "From" text; also filters the not-shared rows by name (SheetsHome.tsx:57-64, 100-102)
- [ ] Start tile "From a file" — opens New sheet on the file source ("CSV, TSV, Parquet, JSON · an Excel workbook becomes one sheet per tab") (SheetsHome.tsx:71-72, 110-122)
- [ ] Start tile "Blank" — opens New sheet on the blank source ("Name it, then add columns and rows") (SheetsHome.tsx:73)
- [ ] Start tile "From a query or an answer" — opens New sheet on the query source ("Keep the rows of a SQL result or a chat answer") (SheetsHome.tsx:74-75)
- [ ] Start tile "In the chat" — opens the make-a-sheet chat panel ("Drop a file and say what it is for") (SheetsHome.tsx:76, 112, 259-261)
- [ ] Sheet name (link button, table icon) — opens the sheet (SheetsHome.tsx:151-154)
- [ ] "Shared with" chip button — toggles the Share popover for that row (SheetsHome.tsx:166-172)
- [ ] "Remove" (maker only, outline) — opens the inline remove confirmation under the row; closes any share box (SheetsHome.tsx:175-179, 187-197)
- [ ] Made-from-this-file buttons (up to 2 per file, ghost, table icon + sheet name) — open the sheet made from that file (SheetsHome.tsx:233-238)
- [ ] "Make a sheet" per uploaded file — opens New sheet with that upload pre-chosen (SheetsHome.tsx:239-242)
- [ ] "+ N more files" / "Show fewer" — expands the uploads list past the largest 6 (SheetsHome.tsx:84-85, 245-249)

**Dialogs / drawers / popovers / panels**
- [ ] New sheet dialog — see 3.10 (SheetsHome.tsx:255-258)
- [ ] "Chat" make-a-sheet side panel (NewSheetChat) — see 3.10 (SheetsHome.tsx:259-261)
- [ ] Share popover per row (SharePop) — see 3.7 (SheetsHome.tsx:171-172)
- [ ] Inline "Remove <sheet>?" confirmation row (RemoveSheetConfirm) — see 3.13 (SheetsHome.tsx:187-197)

**Figures / counts / badges / chips / as-of**
- [ ] Title "Spreadsheets" (SheetsHome.tsx:92)
- [ ] "Workspace" chip — tooltip: a sheet belongs to its workspace until its maker shares it with chosen people (SheetsHome.tsx:93-95)
- [ ] "N sheets · N rows · N not shared with you" (SheetsHome.tsx:96-99)
- [ ] Section label "Start a sheet" (SheetsHome.tsx:108)
- [ ] Section label "Sheets in this workspace", right side "N of M" while searching (SheetsHome.tsx:127-129)
- [ ] Table columns Sheet · Rows · Columns · From · Last change · Shared with · (Remove) (SheetsHome.tsx:136-143)
- [ ] "can read" marker beside a sheet shared to read only (SheetsHome.tsx:155)
- [ ] Rows count and Columns count per sheet (SheetsHome.tsx:157-160)
- [ ] From — where the sheet came from, full text on hover (SheetsHome.tsx:161)
- [ ] Last change — "you/<who> … when", tooltip: what changed · short timestamp (SheetsHome.tsx:162-165)
- [ ] Shared-with chip — "Workspace" or "N chosen" (SheetsHome.tsx:169; lib/sheets.ts:388-392)
- [ ] "Only <maker> can remove it" in place of Remove for non-makers (SheetsHome.tsx:180-184)
- [ ] Not-shared rows: lock icon + name, the withheld reason, chip "Not shared with you" — named, never opened (SheetsHome.tsx:200-212)
- [ ] Section label "Files already uploaded here", right side "N files" (SheetsHome.tsx:219-221)
- [ ] Per file: file name (mono), "<schema> · " when several schemas, size (B/KB/MB) (SheetsHome.tsx:229-232, 29-33)
- [ ] "<sheet> was removed." status line after a remove (SheetsHome.tsx:130)

**Keyboard shortcuts** — none on the home itself (Escape in the remove row = Keep it, see 3.13).

**URL params / deep links** — opening a sheet writes `?sheet=` (see page-wide).

**Empty / error / loading / withheld states**
- [ ] Loading: "Loading the sheets…" (SheetsHome.tsx:67)
- [ ] Error: "Could not read the sheets — <error>." + Retry (SheetsHome.tsx:66)
- [ ] No sheets: "No sheet yet. Start one from a file, from nothing, or from a query's rows." (SheetsHome.tsx:131-132)
- [ ] No uploads: "No file is uploaded to the Workspace yet." (SheetsHome.tsx:222-223)
- [ ] Withheld sheet rows stated with their reason, not hidden (SheetsHome.tsx:200-212)

**Loads on open**
- [ ] `GET /sheets` (listSheets) — sheets, withheld sheets, Workspace uploads, `me`; read-only (SheetsHome.tsx:48-55; lib/sheets.ts:355-357; pramanyx/routers/sheets.py:112-120)

**Top rows today:** one bar — "Spreadsheets" title · "Workspace" chip · sheet/row/not-shared counts · "Find a sheet" box at the right (SheetsHome.tsx:91-103). The four "Start a sheet" tiles sit below it in the scrolling body.

### 3.2 Open sheet — bar, views, toolbar and the grid (SheetView.tsx, SheetGrid.tsx, ColumnMenu.tsx, SelectionMenu.tsx, SheetGroups.tsx)

#### 3.2a Sheet bar (top row)

**Controls**
- [ ] "Spreadsheets /" breadcrumb — back to the home (SheetView.tsx:469)
- [ ] Sheet name button — click to rename in place (input: Enter keeps, Escape or blur leaves); disabled for readers (SheetView.tsx:470-483)
- [ ] "Make a dashboard" (narrow: "Dashboard") — opens the Make-a-dashboard dialog, 3.12; tooltip says whether cards read the view or the sheet (SheetView.tsx:503-506)
- [ ] "Share · Workspace / N chosen" (narrow: "Share") — toggles the Share popover, 3.7 (SheetView.tsx:507-511)
- [ ] Ontology button — "Put on the ontology" / "On the ontology · <entity>" / "… (draft)" (narrow: "Ontology…" / "Ontology"); hidden for readers when not placed — 3.11 (SheetView.tsx:512; SheetOntology.tsx:27-49)
- [ ] "Combine" (link icon; editors only; pressed while open) — toggles the Combine panel, 3.9 (SheetView.tsx:513-516)
- [ ] "Chat" (chat icon; pressed while open) — toggles the chat panel, 3.8; closed by default (SheetView.tsx:148-150, 517-518)

**Figures / chips**
- [ ] Source chip — where the sheet came from; tooltip shows its SQL when made from a query (SheetView.tsx:486-492)
- [ ] "N of M rows · K columns" (the "N of" only when the view narrows the rows) (SheetView.tsx:300-302, 493-494)
- [ ] "Can read" chip for a sheet shared to read — tooltip names who shared it (SheetView.tsx:495-499)

**Panels beside the sheet** (one at a time, `panel` state): chat, combine, record, history (SheetView.tsx:88, 711-731)

#### 3.2b Views strip (second row)

**Controls**
- [ ] View tabs — one per view, icon by layout (grid / grouped / board / calendar); click switches view and resets the person's own changes (SheetView.tsx:86, 525-541)
- [ ] Take off the view (× on the active tab; editors; not the last shared view) — "Undo puts it back" (SheetView.tsx:410-418, 542-547)
- [ ] "+ View" (editors) — opens the new-view popover (SheetView.tsx:552-563)
- [ ] "Keep in <view>" — saves the on-screen filter/sort/search/hidden/layout into the current view (SheetView.tsx:420, 569)
- [ ] "Back to the view" — drops the person's own changes (SheetView.tsx:570)
- [ ] "Make it yours alone" / "Share it" (view owner only) — toggles a view between shared and own (SheetView.tsx:575-580)

**Figures / badges**
- [ ] Person icon on a view only you see; tooltip "Your own view — only you see it" (SheetView.tsx:535, 538)
- [ ] Row count on a tab whose view filters or searches (SheetView.tsx:527-528, 539)
- [ ] "proposed" chip (violet) on a view proposed by the assistant, applied by a person (SheetView.tsx:540)
- [ ] Right side: "changed here, not kept" when the screen differs from the view; else "Shared view" / "Your own view — only you see it" (SheetView.tsx:565-583)

**Popover — New view (ViewPop)**
- [ ] Name input ("<view> 2" or "New view"; Enter keeps) (SheetView.tsx:559, 828-829)
- [ ] "Lay the rows out as" Grid / Board / Calendar — Board offered only with a choice or yes/no column, Calendar only with a date column (SheetView.tsx:822-832)
- [ ] Lane column or date column select for Board / Calendar (SheetView.tsx:833-838)
- [ ] "Who sees it": "Everyone who reads the sheet" / "Only me" (SheetView.tsx:839-840)
- [ ] "Keep the view" (SheetView.tsx:841-842)

#### 3.2c Toolbar (third row) and its popovers

**Controls**
- [ ] "+ Row" (grid layout, editors) — adds a row; says "Row N added" with Undo (SheetView.tsx:424-429)
- [ ] "Fields" / "Fields · N hidden" (grid) — opens Fields popover (SheetView.tsx:430-433)
- [ ] "Filter" / "Filter · N" — opens Filter popover (SheetView.tsx:434-435)
- [ ] "Sort" / "Sort · N" (not on calendar) — opens Sort popover (SheetView.tsx:436-439)
- [ ] "Group" / "Group · <column>" (grid) — opens Group popover (SheetView.tsx:440-443)
- [ ] "Lanes by <column>" (board) — opens lanes popover (SheetView.tsx:444-447)
- [ ] "By <column>" (calendar) — opens date-column popover (SheetView.tsx:448-451)
- [ ] "Card shows" / "Card shows N" (board, calendar) — opens card-fields popover (SheetView.tsx:452-455)
- [ ] "Rules" / "Rules · N" — opens Rules popover (SheetView.tsx:456-457)
- [ ] "Search this sheet" box — the view's server-side search; Escape returns focus to the grid (SheetView.tsx:589-598)
- [ ] Undo (icon; editors) — tooltip "Undo: <what>" or "Nothing to undo" (SheetView.tsx:602-605)
- [ ] Redo (icon; editors) — tooltip "Redo: <what>" or "Nothing to redo" (SheetView.tsx:606-609)
- [ ] "History" — opens the History panel on every change, 3.6 (SheetView.tsx:612-613)
- [ ] "Copy" (grid) — copies the view's first 2,000 rows as TSV with headers; says "Copied N rows" or "Copied the first N of M rows — the CSV holds them all" (SheetView.tsx:48-49, 308-320, 616)
- [ ] "CSV" (grid) — downloads the whole view as CSV in a new tab (`GET /sheets/{id}/csv`) (SheetView.tsx:617-618; lib/sheets.ts:534)
- [ ] Narrow mode (< 860px) — toolbar buttons become icon-only with names on hover; bar labels shorten (SheetView.tsx:51, 123-133, 736-748)
- [ ] Every toolbar button is "pressed" (secondary) while its setting is in force (SheetView.tsx:743)

**Status strip under the toolbar**
- [ ] "Filter: <conditions in words>" while a filter is on (SheetView.tsx:661-664)
- [ ] What was just done (green) or why it failed (red) (SheetView.tsx:665-668)
- [ ] "· Undo" / "· Redo" beside the message (SheetView.tsx:669-676)
- [ ] Dismiss × (SheetView.tsx:677)

**Popover — Fields (FieldsPop)**
- [ ] Per column: show/hide checkbox (the person's own until kept in the view) (SheetView.tsx:914, 922)
- [ ] Per column: kind label and role (computed / lookup / total) (SheetView.tsx:924)
- [ ] Per column: edit pencil (editors) → Name, Description ("What this column holds"), Kind select (stored, non-link columns), "Keep", "Take off" (destructive — removes the column) (SheetView.tsx:925-951)
- [ ] New column: name input + kind select + "Add" (editors) (SheetView.tsx:956-973)
- [ ] "Written by a model — it fills a view you pick, at most 200 rows a fill, and nothing is counted from it" checkbox (SheetView.tsx:975-980)
- [ ] Model column: "What it writes for each row" input + "It reads, for each row:" column checkboxes (stored, non-model, non-link) (SheetView.tsx:907, 981-996)

**Popover — Filter (FilterPop)**
- [ ] Header "Show the rows where every condition holds" (SheetView.tsx:1120)
- [ ] Rule marks already in the filter, said in words (kept as they are) (SheetView.tsx:1113, 1121)
- [ ] Condition rows: Column select · How select (kind's ops) · Value input (date placeholder, comma list for "is one of/none of"; none for empty/filled) · × remove (SheetView.tsx:1060-1099)
- [ ] "+ Condition" (SheetView.tsx:1100-1103)
- [ ] "Apply" / "Clear" (SheetView.tsx:1124-1125)
- [ ] Ops by kind — Number/Money: is, is not, >, ≥, <, ≤, is empty, is filled; Date: is, before, after, empty, filled; Date & time: on, before, after, empty, filled; Yes/No: is, empty, filled; Choice: is, is not, is one of, is none of, empty, filled; Text/Email/Link: contains, lacks, begins with, ends with, is, is not, empty, filled (lib/sheets.ts:755-771)

**Popover — Sort (SortPop)**
- [ ] Per term: Column select · "lowest first"/"highest first" toggle · × (SheetView.tsx:1139-1155)
- [ ] "+ Then by" · "Apply" · "Clear" (SheetView.tsx:1156-1162)

**Popover — Group / Lanes / By (ColumnPop)**
- [ ] Group: "Group the rows by — the largest group first, each with its totals", any column, "No grouping" (SheetView.tsx:635-639)
- [ ] Lanes: "A lane for each value of — a choice or a yes/no column" (SheetView.tsx:640-644)
- [ ] By: "Place the rows by — a date column" (date or date & time) (SheetView.tsx:645-649)
- [ ] Options show "<name> · <kind>"; empty: "No column of this sheet is of that kind." (SheetView.tsx:766-784)

**Popover — Card shows (CardPop)**
- [ ] Up to four columns ticked to show on a card; "Back to the first dates and amounts" resets (SheetView.tsx:787-807)

**Popover — Rules (RulesPop)**
- [ ] Header "A rule marks the rows meeting its conditions — counted as a filter counts them" (SheetView.tsx:860)
- [ ] Per rule: colour dot · name · conditions in words · "N rows" (SheetView.tsx:862-868)
- [ ] "Show these" — filters the grid to that rule's marked rows (SheetView.tsx:657-658, 869)
- [ ] "Take off" (editors) — removes the rule, with Undo (SheetView.tsx:870-874)
- [ ] New rule (editors): name ("e.g. Late and still open"), mark colour select amber/red/green/blue/violet, condition rows, "Keep the rule" (SheetView.tsx:877-894; lib/sheets.ts:84)
- [ ] Readers see the rules and "Show these", never keep or take off (SheetView.tsx:851-852)

**Popover — Fill a model-written column (FillPop)** (opened from a column menu's "Fill with the model…")
- [ ] Header "Fill <column> · written by a model — <instruction>" (SheetView.tsx:1028)
- [ ] The plan in words — rows (≤200), model calls (25 rows a call), cost or "price not set" (SheetView.tsx:1038; pramanyx/routers/sheets.py:401-404)
- [ ] Disclaimer "Each value is a model's reading, not a fact: no total, group, rule or card counts from it. A fill is one change; undo takes it back whole." (SheetView.tsx:1039-1044)
- [ ] "Fill N rows" / "Filling…" — disabled when no model is set (SheetView.tsx:1045-1049)
- [ ] Result: "Filled N rows with K model calls; the model found nothing to write for X; Y were not filled — a call failed." (SheetView.tsx:1031-1037)

All popovers: a "Close" button at the foot; close on outside click / Escape (SheetView.tsx:750-763).

#### 3.2d Columns and kinds

- [ ] Kinds: Text, Number, Money, Date, Date & time, Choice, Yes/No, Email, Link (lib/sheets.ts:20-23; SheetGrid.tsx:42-45)
- [ ] Kinds a person may give a new column: all but Link (Link is made in Combine) (lib/sheets.ts:25-26)
- [ ] Roles: stored · computed ("Computed from <expression>") · lookup / "linked" ("Read from another sheet through <link>") · total ("The <how> of another sheet's rows per <column>") (SheetGrid.tsx:81-86, 151-166)
- [ ] Choice cells drawn as coloured chips, same value same colour (SheetGrid.tsx:51-62, 134)
- [ ] Yes/No cells drawn as a checkbox; editing toggles it (SheetGrid.tsx:135, 779)
- [ ] Link cells drawn in blue (SheetGrid.tsx:136-138)
- [ ] Number columns carry a sheet-wide Format (None, Standard, Compact, Currency, Percentage, Scientific, Bytes) (ColumnMenu.tsx:68-101; lib/format.ts:754-762)
- [ ] Model-written columns: violet "written by a model" chip; empty cell reads "not filled" (SheetGrid.tsx:132, 344-348)
- [ ] Column that read a removed sheet: amber "sheet removed" chip with why (SheetGrid.tsx:144-148, 341)
- [ ] "proposed" chip on a column the assistant proposed (SheetGrid.tsx:343)
- [ ] Default widths by kind; widths and frozen count kept per sheet in this browser (`pramanyx.sheets.widths.<id>`, `pramanyx.sheets.frozen.<id>`) (SheetGrid.tsx:47-49; SheetView.tsx:58-84)

#### 3.2e Flat grid (SheetGrid)

**Cell bar (always above the grid)**
- [ ] Nothing selected (editor): "Select a cell to see where its value came from · double-click, Enter or type to change it · drag or Shift selects a range · paste with Cmd or Ctrl+V" (SheetGrid.tsx:1382-1384)
- [ ] Nothing selected (reader): "… drag or Shift selects a range · copy with Cmd or Ctrl+C" (SheetGrid.tsx:1385-1387)
- [ ] One cell: "<column> · row N", its value ("empty" / "not filled"), and where it came from — "Imported from <file>, row N · not changed since", "Kept from a query's rows…", "Set by <who> · <when> · changed N times", "Written by a model for <who> … a reading, not a fact", "Typed in", computed/lookup/total wording (SheetGrid.tsx:501-521, 1397-1406)
- [ ] "Change" (or "Switch" for Yes/No; editors, stored columns) (SheetGrid.tsx:1408-1410)
- [ ] "History" — opens this cell's whole story in the History panel (stored columns) (SheetGrid.tsx:1411-1413)
- [ ] "Open row" — opens the record panel (SheetGrid.tsx:1414)
- [ ] Range: "R rows × C columns · N cells · sum <x> of N values[ in the rows read]" + "Cmd or Ctrl+C copies it" (SheetGrid.tsx:1049-1070, 1392-1396)
- [ ] "<column> · reading the row…" for a row reached by keys before it was read (SheetGrid.tsx:1389-1391)
- [ ] Error line (red) / done line (green) in the bar (SheetGrid.tsx:1404-1406)

**Column header**
- [ ] Corner cell — selects every cell of the view (Cmd/Ctrl+A) (SheetGrid.tsx:311-314)
- [ ] Click anywhere on the header — sort lowest → highest → sheet order; Shift+click adds a further sort (SheetView.tsx:366-377; SheetGrid.tsx:326-331)
- [ ] Press-and-drag a header — moves the column for everyone (one undoable change); drop line shown; auto-scrolls at the grid edge (SheetGrid.tsx:251-298, 408-412; SheetView.tsx:406-407)
- [ ] Kind icon · name · role chip · sort arrow (faint on hover, solid when sorted) · sort rank number when several sorts (SheetGrid.tsx:339-359)
- [ ] ⓘ "What <column> is" popover — kind, role, expression, link, total, description, proposed, model reads (SheetGrid.tsx:361-366, 413-425)
- [ ] ▾ menu arrow — at the header's right edge on hover/focus; always shown (funnel, accent) while filtered, tooltip "Filtered: <words>" (SheetGrid.tsx:367-386)
- [ ] Right-click on a header — opens its column menu (SheetGrid.tsx:322)
- [ ] Right edge — drag to resize (60–800px), double-click to fit, Left/Right arrows ±10px (SheetGrid.tsx:387-404)

**Column menu (ColumnMenu)**
- [ ] "Sort A → Z" / "Sort Z → A" (text), "smallest → largest" (numbers), "oldest → newest" (dates), "No → Yes" (Yes/No), and reverses (ColumnMenu.tsx:291-294; lib/sheetFilters.ts:12-17)
- [ ] "Then by this, <asc>" / "Then by this, <desc>" (when another column is sorted) (ColumnMenu.tsx:295-297)
- [ ] "Clear filter from "<column>"" (greyed when not filtered) (ColumnMenu.tsx:336-339)
- [ ] "<Text|Number|Date> filters" section (none for Yes/No) — Equals, Does not equal, Begins with, Ends with, Contains, Does not contain, Greater than, Greater than or equal to, Less than, Less than or equal to, On, Before, After, Is empty, Is filled — value box + "Apply" (ColumnMenu.tsx:222-270; lib/sheetFilters.ts:28-41)
- [ ] Value list: "Search the values" box (Enter = OK) (ColumnMenu.tsx:170-175)
- [ ] "(Select all)" with row count / "(Select all search results)" (ColumnMenu.tsx:181-186)
- [ ] "(Blanks)" with count (ColumnMenu.tsx:187-194)
- [ ] Each value with a tick and its row count (ColumnMenu.tsx:195-202)
- [ ] "N more — search to narrow" (never a silent cut) (ColumnMenu.tsx:208-211)
- [ ] "OK" / "Cancel" (ColumnMenu.tsx:212-216)
- [ ] "Format" (Number kind only) — None / Standard / Compact / Currency / Percentage / Scientific / Bytes, each with an example; disabled for readers (ColumnMenu.tsx:68-101, 346)
- [ ] "Copy column name" (ColumnMenu.tsx:347)
- [ ] "Hide this column" (ColumnMenu.tsx:300)
- [ ] "Freeze up to this column" / "Unfreeze the columns" (ColumnMenu.tsx:301-302)
- [ ] "Fit the width to what it holds" (ColumnMenu.tsx:303)
- [ ] "Back to its own width" (only after a resize) (ColumnMenu.tsx:304)
- [ ] "Fill with the model…" (model-written columns, editors) (ColumnMenu.tsx:305)

**Rows and cells**
- [ ] Row number (sticky) — click selects the row, Shift+click the rows between, right-click opens the selection menu (SheetGrid.tsx:464-497)
- [ ] Rule colour bar at a row's start; tooltip "row N · marked: <rules>" (SheetGrid.tsx:473-482)
- [ ] "Open row N" expand button on each row number — opens the record panel (SheetGrid.tsx:492-494)
- [ ] Click a cell selects it; Shift+click extends a range; press-and-drag selects a range (auto-scroll at edges) (SheetGrid.tsx:793-800, 1172-1201)
- [ ] Double-click, Enter, F2 or typing a character edits a cell in place (stored columns, editors) (SheetGrid.tsx:776-783, 801, 998-1002)
- [ ] Cell editor: Enter keeps and moves down (Shift+Enter up), Tab keeps and moves right (Shift+Tab left), Escape leaves, blur keeps a changed value; choice columns offer their values; date placeholders (SheetGrid.tsx:1313-1357)
- [ ] Changed cells tinted blue (SheetGrid.tsx:811)
- [ ] Right-click a cell — selects it (unless inside the selection) and opens the selection menu (SheetGrid.tsx:802-808)
- [ ] Paste (Cmd/Ctrl+V) — lays the clipboard's cells from the active cell, or one value over a range; one undoable change; says what was left out (rows past the end, rows not read, columns past the last, derived columns) (SheetGrid.tsx:593-639, 930-940)
- [ ] Delete / Backspace — empties the cell or the range (derived columns keep their values) (SheetGrid.tsx:641-657, 943-953)
- [ ] Cmd/Ctrl+C — copies the cell or range as TSV (SheetGrid.tsx:844-856)
- [ ] More than 10,000 cells in one paste/clear refused with a message (SheetGrid.tsx:584, 908-912)
- [ ] Rows read in blocks of 200 as they scroll into sight; placeholder rows while reading (useRowBlocks.ts:16, 58-60; SheetGrid.tsx:1278-1283)

**Selection menu (SelectionMenu — right-click, Menu key or Shift+F10)**
- [ ] Heading: "1 cell" / "N rows" / "R rows × C columns" / "Every cell · N rows" (SelectionMenu.tsx:69; SheetGrid.tsx:894-900)
- [ ] "Copy" ⌘C (SelectionMenu.tsx:70-73)
- [ ] "Copy as" → CSV · TSV · JSON · Markdown table · SQL values (with column names) (SelectionMenu.tsx:74-81; lib/gridCopy.ts:12-18)
- [ ] "Copy column names" (SelectionMenu.tsx:82)
- [ ] "Filter by this value" — greyed with reason "select one cell" / "not in this grid" (SelectionMenu.tsx:85-88)
- [ ] "Exclude this value" — same greying (SelectionMenu.tsx:89-92)
- [ ] "Open row" (SelectionMenu.tsx:94-96)

**Foot and footer**
- [ ] Totals row ("total") over every row of the view: numbers/money "sum · avg", dates "earliest", Yes/No "N yes", others "N values", "empty" (SheetGrid.tsx:441-459; lib/sheets.ts:735-752)
- [ ] Footer "Rows a–b of N · <view> · sorted by <cols>" or "· in the sheet's order" (SheetGrid.tsx:1302-1306; SheetView.tsx:705-706)

#### 3.2f Grouped grid (SheetGroups — grid layout with Group set)
- [ ] Same header (sort, menu, filter, format, resize, move) and cell work (select, edit, right-click menu) as the flat grid; no select-all corner, no paste, a range is one cell (SheetGroups.tsx:97-104, 135-142)
- [ ] Group head: open/close chevron, the value (chip) or "empty", "N rows", per-group totals under their columns (SheetGroups.tsx:150-170)
- [ ] First three groups open, the rest closed (SheetGroups.tsx:30-31, 68-69)
- [ ] "+ N more in <value> — show 50" — reads further rows of a group (SheetGroups.tsx:109-120, 181-188)
- [ ] Totals foot over all groups (SheetGroups.tsx:192)
- [ ] Footer "N rows in K groups · grouped by <column> · a group's totals are over its own rows · the largest N listed, M more not" (SheetGroups.tsx:196-202)
- [ ] Loading "Loading the groups…" / "Could not read the groups — … Retry" (SheetGroups.tsx:106-107)

**Keyboard shortcuts (sheet + grid)**
- [ ] Cmd/Ctrl+F — focuses the sheet's own search box (SheetView.tsx:244-257)
- [ ] Escape in the search box — back to the grid (SheetView.tsx:593-597)
- [ ] Arrows (Cmd/Ctrl+arrow to the edge), Tab/Shift+Tab, Home/End (Cmd/Ctrl to first/last cell), PageUp/PageDown — move the active cell; Shift extends a range (SheetGrid.tsx:557-581, 969-973)
- [ ] Cmd/Ctrl+A — select every cell (SheetGrid.tsx:967)
- [ ] Cmd/Ctrl+C — copy (SheetGrid.tsx:961)
- [ ] Cmd/Ctrl+V — paste (SheetGrid.tsx:930-940, 1266)
- [ ] Cmd/Ctrl+Z — undo; Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y — redo (SheetGrid.tsx:962-966)
- [ ] Enter / F2 — edit; any character — type over (SheetGrid.tsx:998-1002)
- [ ] Delete / Backspace — empty cell or range (SheetGrid.tsx:997)
- [ ] Escape — clear the selection (SheetGrid.tsx:996)
- [ ] Shift+Space — select the whole rows of the selection (SheetGrid.tsx:986-993)
- [ ] Menu key / Shift+F10 — selection menu at the active cell (SheetGrid.tsx:975-985)
- [ ] In column/selection menus: Up/Down move between items, Escape closes (ColumnMenu.tsx:315-323; SelectionMenu.tsx:50-58)
- [ ] Column edge: Left/Right resize (SheetGrid.tsx:395-401)
- [ ] Rename box Enter/Escape; new-view name Enter; column-menu search Enter = OK; condition value Enter = Apply (SheetView.tsx:473-476, 829; ColumnMenu.tsx:174, 262)

**URL params / deep links** — `?sheet=<id>` (page-wide). Copy link in Share writes `?tab=spreadsheets&sheet=<id>` to the clipboard (SheetSharing.tsx:49-54).

**Empty / error / loading / withheld states**
- [ ] Not shared with you (403) / removed (404): the server's sentence with a lock or info icon + "Back to Spreadsheets" — not a retry (SheetView.tsx:144-146, 284-293)
- [ ] "Loading the sheet…" / "Could not read the sheet — … Retry" (SheetView.tsx:294-295)
- [ ] "Loading the rows…" / "Could not read the rows — … Retry" (SheetView.tsx:693-694)
- [ ] Read-only sheet: no Row, Combine, Undo/Redo, view +, rename, edits; paste says "This sheet is read here, not changed" (SheetView.tsx:140-142; SheetGrid.tsx:935)
- [ ] Clipboard refused: "Not copied — this browser gives the page no clipboard" / "Not copied — the browser refused the page its clipboard" (SheetView.tsx:314-318; SheetGrid.tsx:838-842)
- [ ] Stale edit (changed by someone since): rows re-read, the refusal said (SheetView.tsx:211-214, 227-230)
- [ ] Value list: "Reading the values…", "No value holds "<q>"", error line (ColumnMenu.tsx:176-205)
- [ ] Format: "No reporting currency is declared, so Currency shows no symbol" (ColumnMenu.tsx:93-96)
- [ ] "Nothing to undo" / "Nothing to redo" (SheetView.tsx:701-704)

**Loads on open (a sheet)**
- [ ] `GET /sheets/{id}` (readSheet) — definition, views, rules, counts (SheetView.tsx:163-174; lib/sheets.ts:359)
- [ ] `GET /sheets/{id}/changes` (readChanges) — undo/redo words; editors only (SheetView.tsx:176-180; lib/sheets.ts:589-591)
- [ ] `GET /sheets/{id}/rows?offset&limit=200…` per block in sight (flat grid); or `GET /groups`, `/board`, `/calendar` for those layouts — queries over the sheet store, read-only, no warehouse (useRowBlocks.ts:58-60; lib/sheets.ts:448-468)
- [ ] `GET /sheets/{id}/ontology` (readOnOntology) — for the bar's ontology button; computes per-column filled/distinct counts over the sheet (SheetOntology.tsx:38-39; lib/sheets.ts:370-371)
- [ ] On opening a column menu: `GET /sheets/{id}/columns/{col}/values` (ColumnMenu.tsx:119-134; lib/sheets.ts:485)
- [ ] On opening Fill: `POST /sheets/{id}/columns/{col}/fill/preview` — a POST that only plans; "No model is called" (SheetView.tsx:1015-1020; pramanyx/routers/sheets.py:401-404)
- [ ] **SPENDS** on "Fill N rows" (not on open): `POST …/fill` runs model calls and **WRITES** the column (SheetView.tsx:1021-1025)
- [ ] **WRITES** on any edit/paste/clear/move/format/add row/column/view/rule (not on open): `PATCH /cells`, `POST /rows`, `PATCH|DELETE /columns/{id}`, `PUT|DELETE /views`, `PUT|DELETE /rules`, `PATCH /{id}`, `POST /undo|/redo` (lib/sheets.ts:528-615)

**Top rows today:** three rows above the grid — (1) sheet bar: "Spreadsheets /" breadcrumb · sheet name (rename) · source chip · row/column count · "Can read" chip · right: Make a dashboard · Share · Ontology · Combine · Chat (SheetView.tsx:467-520); (2) views strip: view tabs · "+ View" · right: "changed here, not kept" + Keep in / Back to the view, or Shared view / own view + Share it / Make it yours alone (SheetView.tsx:523-584); (3) toolbar: + Row · Fields · Filter · Sort · Group (or Lanes by / By / Card shows) · Rules · Search this sheet · right: Undo · Redo · History · Copy · CSV (SheetView.tsx:587-621). Then a conditional status strip (Filter words + last action + Undo) and the grid's own cell bar.

### 3.3 Board view (SheetBoard.tsx — a view whose layout is Board)

**Controls**
- [ ] Toolbar (from 3.2c) shows Filter · Sort · "Lanes by <column>" · "Card shows" · Rules · Search · Undo/Redo · History (no Row/Fields/Group/Copy/CSV) (SheetView.tsx:422-459, 599-620)
- [ ] Drag a card to another lane — edits the lane column (with who/when; stale refused) (SheetBoard.tsx:79-102, 125-127, 139-147)
- [ ] Card title button — opens the row as a record (SheetBoard.tsx:153-159)
- [ ] "Move row N to another lane" (⋮) — opens a "Move to" list of lane buttons (SheetBoard.tsx:160-178)
- [ ] "+ N more" per lane — reads 20 more cards, to at most 100 per lane (then disabled: "filter the view, or read it as a grid") (SheetBoard.tsx:25-27, 194-200)

**Figures / badges**
- [ ] Lane head: value (chip) or "empty", card count (SheetBoard.tsx:131-134)
- [ ] Card: title (sheet key or first text column), up to 3–4 fields (chosen in Card shows, else first dates/money/numbers), rule colour bar + "marked: …" tooltip (SheetBoard.tsx:29-41, 137-151, 179-190)
- [ ] Footer: "N rows in K lanes by <column> · not in this view: <value> N · moving a card changes its <column>, kept as an edit" or "<column> is read from elsewhere, so its cards stay where they are" (SheetBoard.tsx:206-213)

**Keyboard** — on a card: ← / → move it to the lane beside (focus follows), Enter opens it (SheetBoard.tsx:104-113, 139-142)

**States**
- [ ] "Loading the board…" / "Could not read the board — … Retry" (SheetBoard.tsx:71-72)
- [ ] Empty lane: "No row yet — drop a card here." (SheetBoard.tsx:201)
- [ ] Refused move (red alert line above the board); stale move re-reads the board (SheetBoard.tsx:88-92, 118)

**Loads on open** — `GET /sheets/{id}/board?column=&per_lane=20` (read-only) (SheetBoard.tsx:58-63; lib/sheets.ts:462-464). **WRITES** on a move: `PATCH /cells`.

**Top rows today:** the same three sheet rows as 3.2 (bar, views, toolbar with "Lanes by" and "Card shows" in place of Fields/Group/Copy/CSV); the board has no header row of its own — its count line is a footer.

### 3.4 Calendar view (SheetCalendar.tsx — a view whose layout is Calendar)

**Controls**
- [ ] Toolbar (from 3.2c) shows Filter · "By <date column>" · "Card shows" · Rules · Search · Undo/Redo · History (no Sort) (SheetView.tsx:436, 448-455)
- [ ] "The month before" ‹ / "The month after" › (SheetCalendar.tsx:68-74)
- [ ] "To where the rows end · <Month Year>" — jumps to the latest month holding ≥1% of rows (SheetCalendar.tsx:75-79)
- [ ] Day cell — click opens/closes that day's rows as cards (disabled on an empty day) (SheetCalendar.tsx:91-108)
- [ ] Day card — opens the row as a record (SheetCalendar.tsx:119-131)

**Figures**
- [ ] Month title (SheetCalendar.tsx:71)
- [ ] "<earliest> to <latest>" date span (SheetCalendar.tsx:80-84)
- [ ] Mon…Sun header, each day's number and row count, shaded by how busy (SheetCalendar.tsx:23, 88-107)
- [ ] Day section "<date> · N rows" (SheetCalendar.tsx:113)
- [ ] "The first N of M; the grid filtered to this day shows them all." (SheetCalendar.tsx:136-139)
- [ ] Footer: "N rows in <Month> on K days by <column> · N rows have no <column> and are on no day · a day opens its rows" (SheetCalendar.tsx:143-149)

**Keyboard** — none of its own.

**States**
- [ ] "Loading the calendar…" / "Could not read the calendar — … Retry" (SheetCalendar.tsx:53-54)
- [ ] "Loading the day's rows…" (SheetCalendar.tsx:114)

**Loads on open** — `GET /sheets/{id}/calendar?column=[&month=]` (read-only); on a day, `GET /rows` filtered to that day, limit 50 (SheetCalendar.tsx:35-50; lib/sheets.ts:466-468).

**Top rows today:** the same three sheet rows (toolbar with "By <column>" and "Card shows"); inside the body a month row: ‹ Month › · "To where the rows end" · date span at the right (SheetCalendar.tsx:67-85).

### 3.5 Record panel — a row opened (SheetRecord.tsx)

Opened by a row number's expand button, "Open row" in the cell bar or selection menu, a board/calendar card (SheetView.tsx:303, 723-726).

**Controls**
- [ ] Close × (SheetRecord.tsx:36-38)
- [ ] Tabs "Fields" · "Linked · N" · "History" · "Comments · N" — scroll to each part (SheetRecord.tsx:85, 91-97)
- [ ] "Open <other sheet>" per linked sheet (SheetRecord.tsx:138)
- [ ] "See or put back a change" (editors) / "See every change" — opens this row's story in the History panel (SheetRecord.tsx:150-154)
- [ ] Comment box "Write a comment…" + "Keep" (Enter sends; editors) (SheetRecord.tsx:181-188)

**Figures**
- [ ] Head: row key (cut to 18 chars) or "Row N"; chip "row N of <sheet>" (SheetRecord.tsx:87, 90)
- [ ] Rule marks (dot + name) and where the row came from (SheetRecord.tsx:101-110)
- [ ] Fields: name, value (as its column shows it, "empty"), source line per field; description on hover (SheetRecord.tsx:111-128)
- [ ] Linked: "<link> → <sheet>" or "<sheet> · by <link>" · count; linked rows as cards; "+ N more" (SheetRecord.tsx:129-146, 199-225)
- [ ] History lines: column "set to <value>" / "back to its source's value" · who · when · "proposed by the assistant" (SheetRecord.tsx:156-166)
- [ ] Comments: text · who · when · "a said claim in the Record" (SheetRecord.tsx:175-180)

**States**
- [ ] "Loading the row…" / "Could not read the row — … Retry" (SheetRecord.tsx:99)
- [ ] "This sheet links to no other sheet, and none links to it. Links are made in Combine." (SheetRecord.tsx:131-133)
- [ ] "No row matches." (SheetRecord.tsx:140)
- [ ] "… · not changed since." (SheetRecord.tsx:157)
- [ ] "No comments yet. A comment is kept in the Record, in your name, readable by whoever can read this row." (SheetRecord.tsx:171-174)
- [ ] Comment refused (red) (SheetRecord.tsx:189)

**Loads on open** — `GET /sheets/{id}/records/{row}` (read-only) (SheetRecord.tsx:63-67; lib/sheets.ts:617-618). **WRITES** on Keep: `POST /records/{row}/comments` (a Record claim).

**Top rows today:** panel head (title · chip · ×) and the four-tab strip (SheetRecord.tsx:90-97).

### 3.6 History panel and put back (SheetHistory.tsx)

Opened by the toolbar's "History" (every change), a cell bar's "History" (one cell), or a record's "See or put back a change" (one row) (SheetView.tsx:304, 612-613, 727-731).

**Controls**
- [ ] Close × (SheetHistory.tsx:69)
- [ ] "All changes" — leaves a row/cell story for the whole history (SheetHistory.tsx:80)
- [ ] "Undo your last: <what>" (whole history, editors) (SheetHistory.tsx:89-93)
- [ ] "Put back all N" per multi-line change — puts back every value still standing (editors) (SheetHistory.tsx:132-138)
- [ ] "Show all N" — reads every line of a long change (SheetHistory.tsx:145-148)
- [ ] Cell link "<column> · row N" — narrows to that cell's story (SheetHistory.tsx:180-185)
- [ ] Per line "Put back <old value>" (cell) / "Put back" (row) / "Take out" (a row that was added) — touches nothing else; shows "Putting back…" (SheetHistory.tsx:165-172, 209-215)

**Figures**
- [ ] Head chip "N changes" / "N+ changes" (SheetHistory.tsx:66, 69)
- [ ] Scope head: "<column> · row N" or "Row N", row key, "Holds <value> now." / "Every change to this row, its cells included." / "This row has been removed from the sheet." (SheetHistory.tsx:73-87)
- [ ] Per change: what · who · when · origin ("proposed by the assistant, applied by them", "written by a model", "a put back", "an undo", "a redo", "a newer file") (SheetHistory.tsx:129-131, 149-151; lib/sheets.ts:914-922)
- [ ] Per cell line: "<from> → <to> · now <value>"; per row line: "Row N added/removed/changed" + its values (SheetHistory.tsx:176-205)
- [ ] "Already back" / "Already out" when the value already stands (SheetHistory.tsx:209-210)
- [ ] Scoped foot: where it came from "· not changed since" (SheetHistory.tsx:98-102)

**States**
- [ ] "Loading the history…" / "Could not read the history — … Retry" (SheetHistory.tsx:71)
- [ ] "Nothing has changed here yet." (SheetHistory.tsx:103)
- [ ] "The latest N are listed; older changes are kept too. Open a cell or a row to read its whole story." (SheetHistory.tsx:104-108)
- [ ] "The first N of M are listed. Open a cell or a row to read its story." (SheetHistory.tsx:146)
- [ ] "Cannot be put back: <reason>." (SheetHistory.tsx:207)
- [ ] Put back on a value changed since: re-reads and says the refusal (SheetView.tsx:206-216)

**Loads on open** — `GET /sheets/{id}/history[?row=&column=]` (read-only); "Show all" → `GET /history/{change}` (SheetHistory.tsx:47-62; lib/sheets.ts:594-605). **WRITES** on Put back (`POST /put-back`) and Undo (`POST /undo`).

**Top rows today:** panel head "History" · count chip · × (SheetHistory.tsx:69); scope head with "All changes" when narrowed.

### 3.7 Sharing (SheetSharing.tsx — SharePop, from the sheet bar's Share or the home's Shared-with chip)

**Controls**
- [ ] "Who it is shared with": "Everyone in Workspace" / "Only people chosen" (maker only) (SheetSharing.tsx:113-116)
- [ ] Per chosen person/group: "Can read" / "Can edit" segmented (maker only) (SheetSharing.tsx:131-135)
- [ ] Stop sharing × per person/group (SheetSharing.tsx:136-137)
- [ ] Add box "A person's sign-in name, or a group" with suggestions (people, groups, built-in groups); Enter adds (SheetSharing.tsx:144-152)
- [ ] "Read" / "Edit" level for the one being added + "Add" (SheetSharing.tsx:153-155)
- [ ] "Save" / "Saving…" (only when changed; disabled with an empty chosen list) (SheetSharing.tsx:169-175)
- [ ] "Copy link" — copies `?tab=spreadsheets&sheet=<id>` (SheetSharing.tsx:49-54)
- [ ] "Done" (SheetSharing.tsx:55)

**Figures / text**
- [ ] "Share · <sheet>" (SheetSharing.tsx:43)
- [ ] "Everyone in Workspace can read and edit this sheet." (SheetSharing.tsx:117-118)
- [ ] "<maker> made it, and can always read and edit it. No one else can open it unless listed here." (SheetSharing.tsx:121-123)
- [ ] Per entry "· group" / "· built-in group"; for non-makers "can edit"/"can read" (SheetSharing.tsx:20, 129, 140)
- [ ] "Views: N shared · N your own (only you see them)" (from the sheet bar only) (SheetSharing.tsx:45-47)
- [ ] Non-maker: "You can edit it / can read it. Only <maker>, who made it, can change who it is shared with." (SheetSharing.tsx:160-164)
- [ ] Saved: "Shared with the people and groups chosen" / "Shared with everyone in Workspace" (SheetSharing.tsx:102)

**States**
- [ ] "Reading who it is shared with…" / error line (SheetSharing.tsx:81-82)
- [ ] "No one is chosen yet." (SheetSharing.tsx:124)
- [ ] Adding the maker refused: "<maker> made it, and can always read and edit it." (SheetSharing.tsx:89-92)

**Loads on open** — `GET /sheets/{id}/sharing` (read-only) (SheetSharing.tsx:73-76; lib/sheets.ts:378). **WRITES** on Save: `PUT /sharing`.

**Top rows today:** n/a (popover under the Share button).

### 3.8 Chat beside a sheet (SheetChat.tsx — SheetChat, RowsCard, ProposalCard)

**Controls**
- [ ] Close × (SheetChat.tsx:128-129)
- [ ] Message box "Ask about this sheet, drop a file, or ask for a change…" — Enter sends; words that ask for a change go to Propose, others to Ask (SheetChat.tsx:103-108, 201-203)
- [ ] Send (SheetChat.tsx:204)
- [ ] "Make a sheet from a file" (paperclip) — file picker (.csv .tsv .parquet .json .xlsx) (SheetChat.tsx:197-200)
- [ ] Drop a file anywhere on the panel — proposes a new sheet of it (dashed outline while over) (SheetChat.tsx:120-127, 138)
- [ ] Answer (house chat answer: receipt, follow-ups asked here, "Investigate deeper →" hands to the main chat via onAsk) (SheetChat.tsx:153-155)
- [ ] "propose a change instead" under an answer (SheetChat.tsx:161-164)
- [ ] "ask it as a question instead" under a proposal (SheetChat.tsx:184-189)
- [ ] Rows card: "Show in the grid" / "Shown in the grid" — puts the answer's filter on the grid as the person's own (SheetChat.tsx:231-233; SheetView.tsx:346-347)
- [ ] Rows card: "Keep as a view · <name>" / "Kept as the view <name>" (SheetChat.tsx:234-237; SheetView.tsx:350-362)
- [ ] Proposal card: tick/untick each change (all ticked by default) (SheetChat.tsx:248, 288-292)
- [ ] "Apply N changes" / "Create sheet" (SheetChat.tsx:316-318)
- [ ] After applying: "Undo all" / "Undo — remove the sheet" (SheetChat.tsx:307-312)
- [ ] An applied view opens on the grid; an applied new sheet opens (SheetChat.tsx:110-116)

**Figures / text**
- [ ] Head "Ask about this sheet", chip "<sheet> · <view>" (SheetChat.tsx:128-129)
- [ ] Grounding line: "The chat reads <table> · the view <name>: N rows" (tooltip: WHERE clause) (SheetChat.tsx:130-136)
- [ ] Rows card: "N rows of M [in this view] · x%", the filter in words (SheetChat.tsx:221-228)
- [ ] Proposal card: "N changes" or "A new sheet · <name>"; chip "nothing applied yet" / "nothing created yet" / "Applied by you"; for a new sheet "<file> · N rows · K columns, read as written:" + column kinds (SheetChat.tsx:274-287)
- [ ] Per change: its sentence; "computed, no model"; rule colour + "marks the rows where …" (SheetChat.tsx:293-302)
- [ ] "Answered as a question ·" / "Proposed as a change ·" (SheetChat.tsx:161-162, 185-186)
- [ ] "Untick what you do not want." / "Undo removes it whole." / "Each change is in the sheet's history." (SheetChat.tsx:312, 319)

**States**
- [ ] Empty: "Ask about this sheet — answers are queries on it, each with its receipt — or ask for a change… nothing changes until you apply it. Drop a file here to make a new sheet of it." (SheetChat.tsx:139-144)
- [ ] "Proposing — every change is checked and counted first…" (SheetChat.tsx:173)
- [ ] "Nothing was proposed:" + the server's sentences (SheetChat.tsx:179-182)
- [ ] Proposal / apply / undo errors (red) (SheetChat.tsx:172, 305)

**Loads on open**
- [ ] `GET /sheets/{id}/grounding[?view=]` — read-only (SheetChat.tsx:72-74; lib/sheets.ts:624-626)
- [ ] **SPENDS** on Ask (not on open): chat turn on the Sheets connection, depth "quick" (model + query) (SheetChat.tsx:55-60, 81-85)
- [ ] **SPENDS** on a change asked for: `POST /sheets/{id}/propose` calls a model (SheetChat.tsx:87-93; pramanyx/routers/sheets.py:980-984)
- [ ] **WRITES + SPENDS** on a dropped file: `POST /sheets/files` stages it, `POST /sheets/proposals/new` (model when tool-capable) (SheetChat.tsx:95-101)
- [ ] **WRITES** on Apply (`POST /proposals/{id}/apply`) and Undo all (`POST /undo`)

**Top rows today:** panel head "Ask about this sheet" · chip · × and the grounding line (SheetChat.tsx:128-136).

### 3.9 Combine — links, totals, a newer file (SheetCombine.tsx; editors only)

**Controls**
- [ ] Close × (SheetCombine.tsx:83)
- [ ] Step 1 "Link a column to another sheet": "This sheet's column", "The other sheet", "Its key" selects; "Count the matches"; "Bring in from <sheet>" column checkboxes; "Keep the link [and N columns]"; "+ Link another column" (SheetCombine.tsx:107-178)
- [ ] Step 2 "Total another sheet's rows per key": "The other sheet", "Its key", "How" (sum, count, average, min, max, earliest, latest), "Of" (not for count), "Per this sheet's column"; "Count it"; name ("e.g. Paid"); "Keep the total"; "+ Another total" (SheetCombine.tsx:26, 180-240)
- [ ] Step 3 "Add a newer file to this sheet": "Choose a file…" (.csv .tsv .parquet .json .xlsx), "Match rows on" select, "Compare with the sheet", "Apply the file" / "Nothing to change" (SheetCombine.tsx:242-304)
- [ ] Step 4 "Keep a query's rows as a new sheet" — text only, points to the SQL Editor's results or New sheet ▸ From a query (SheetCombine.tsx:89-92)

**Figures**
- [ ] Step chips "N kept" (SheetCombine.tsx:61, 121, 197)
- [ ] Kept link: "<column> → <sheet> · N of M rows matched · N misses · Brings in …" ("a removed sheet" when gone) (SheetCombine.tsx:122-130)
- [ ] Kept total: "<name> · <how> of <sheet> per <column>" + description (SheetCombine.tsx:198-202)
- [ ] Link preview: "N of M rows matched · N misses · N have no key", "Missed, e.g.: …", amber "N keys repeat in <sheet>… total its rows instead" (SheetCombine.tsx:145-153)
- [ ] Total preview: "N rows have rows in <sheet> · N have none, and show empty, never zero (0 for count)", "N rows of <sheet> counted · N match no row here · the <how>: <total>" (SheetCombine.tsx:223-229)
- [ ] Merge preview: "N rows added · N cells changed in N rows · N rows not in the file, kept as they are"; amber misfit count; "Not in the sheet, not added: …"; old → new list per cell, "+ N more cells"; "Applied as one change" (SheetCombine.tsx:272-293)

**States**
- [ ] Refusal line (red) at the top (SheetCombine.tsx:85)
- [ ] "A merge never removes a row." (SheetCombine.tsx:254-255)

**Loads on open** — `GET /sheets` (other sheets the person may read) (SheetCombine.tsx:73-77); choosing another sheet → `GET /sheets/{other}` (SheetCombine.tsx:98-105). Previews are POSTs that count (`/links/preview`, `/totals/preview`, `/merge/preview`; a file pick **WRITES** a staged copy via `POST /files`); Keep/Apply **WRITE** (`/links`, `/totals`, `/merge`).

**Top rows today:** panel head "Combine" · chip <sheet> · × (SheetCombine.tsx:83).

### 3.10 New sheet and import (NewSheetDialog.tsx; NewSheetChat in SheetChat.tsx)

**New sheet dialog — Controls**
- [ ] Title "New sheet" + "Make it from": "From a file" / "Blank" / "From a query" (NewSheetDialog.tsx:133-138)
- [ ] File: "Choose a file" / "Choose another" (.csv .tsv .txt .parquet .json .xlsx) (NewSheetDialog.tsx:156-160)
- [ ] File: name per sheet (per Excel tab: "Tab <name>") (NewSheetDialog.tsx:165-170)
- [ ] File: Kind select per column — only kinds every value reads back as (NewSheetDialog.tsx:187-194)
- [ ] Blank: "Name the sheet"; per column name + kind select + "Take this column off"; "+ Column" (NewSheetDialog.tsx:227-251)
- [ ] From a query: "Name the sheet", Connection select, "Schema (optional)", SQL box (NewSheetDialog.tsx:254-270)
- [ ] "Cancel" · "Create sheet" / "Create N sheets" / "Making…" (NewSheetDialog.tsx:279-282)

**New sheet dialog — Figures / text**
- [ ] File card: file name, "N MB · already uploaded to Workspace · N rows · K columns" or "· N tabs" (NewSheetDialog.tsx:146-154)
- [ ] "An Excel workbook becomes one sheet per tab; you name each." (NewSheetDialog.tsx:162)
- [ ] Per column table: Column · Kind (+ note why it stayed Text) · First row (shown as the kind) · Empty count; Choice values as chips with counts (NewSheetDialog.tsx:172-210)
- [ ] "A kind is offered only where every value reads back as written." + fallback count ("No column fell back to Text…" / "N columns stay Text because…") (NewSheetDialog.tsx:42-51, 216-219)
- [ ] "Every value keeps its source: this file and its row. Changes made later keep who and when." (NewSheetDialog.tsx:220-221)
- [ ] Query: "The query is saved beside the rows. A result over 200,000 rows keeps the first 200,000 and says so." (NewSheetDialog.tsx:271-272)
- [ ] Foot: "Opens on its first view. Shared with everyone in Workspace." (NewSheetDialog.tsx:278)

**New sheet dialog — States**
- [ ] "No file chosen" / "Reading the file…" (NewSheetDialog.tsx:146)
- [ ] Error line (red) — e.g. a refused import (NewSheetDialog.tsx:276)

**New sheet dialog — Loads on open**
- [ ] **WRITES** when opened from an uploaded file's "Make a sheet": `POST /sheets/files/uploaded` copies the file into staging and reads it, immediately on open (NewSheetDialog.tsx:86-91; pramanyx/routers/sheets.py:159-168)
- [ ] Switching to "From a query": `GET` connections (NewSheetDialog.tsx:93-96)
- [ ] Choosing a file: **WRITES** `POST /sheets/files` (staged) (NewSheetDialog.tsx:98-104)
- [ ] Create: **WRITES** `POST /sheets`; "From a query" also **runs the SQL on the warehouse once** (NewSheetDialog.tsx:106-125; lib/sheets.ts:405-414)

**Make a sheet in the chat (NewSheetChat, home tile "In the chat")**
- [ ] Panel "Chat" · chip "Workspace" · × (SheetChat.tsx:351)
- [ ] "Choose or drop a file" (or the file's name); drop anywhere on the panel (SheetChat.tsx:349-361)
- [ ] "What is it for? — e.g. a sheet I can follow up complaints from" (SheetChat.tsx:362-363)
- [ ] "Propose a sheet" / "Reading the file…" — **WRITES** staging + **SPENDS** `POST /proposals/new` (SheetChat.tsx:335-347, 364-366)
- [ ] Proposal card with "Create sheet" (see 3.8) or the server's sentences (SheetChat.tsx:368-370)
- [ ] Intro: "Drop a file and say what it is for. It comes back as one proposal… nothing is made until you create it." (SheetChat.tsx:353-356)

**Top rows today:** dialog title row "New sheet" + the From a file / Blank / From a query switch (NewSheetDialog.tsx:133-138).

### 3.11 Sheet on the ontology — sheet-backed entity (SheetOntology.tsx)

**Controls**
- [ ] Bar button (see 3.2a) opens a form dialog titled "Put <sheet> on the ontology" or "<sheet> on the ontology" (SheetOntology.tsx:47-60)
- [ ] "What a reader calls one row" (entity name, "e.g. Store target") (SheetOntology.tsx:159-162)
- [ ] "Its key — one value per object" select (only eligible columns) (SheetOntology.tsx:163-170)
- [ ] "Columns it keeps" checkboxes (the key always kept) (SheetOntology.tsx:173-184)
- [ ] "What it is (optional)" description (SheetOntology.tsx:185-188)
- [ ] "Cancel" · "Place on the ontology" / "Placing…" (SheetOntology.tsx:192-193)
- [ ] Placed: "Close" · "Open it in Ontology" / "Review and publish in Ontology" (navigates to Ontology on the Sheets connection) (SheetOntology.tsx:79-84)

**Figures / text**
- [ ] Dialog description: "As an entity: one object per row, named by a column that is one per object. Nothing reaches the ontology until you ask, and readers see it once it is published." (SheetOntology.tsx:53-54)
- [ ] "Not one per object:" list — each column with "N distinct of M filled" / "holds no value" / "<role>, read from other columns"; full reason on hover (SheetOntology.tsx:89-113)
- [ ] "Drafted in the Sheets ontology; readers see it once it is published." (SheetOntology.tsx:191)
- [ ] Placed: "This sheet is the entity <name>, one object per row by its <key>. Readers see it… / It is a draft…" + three rules (repeated key refused; renames followed; removing the sheet leaves the entity) (SheetOntology.tsx:70-78)

**States**
- [ ] Reader: "Only someone who can change this sheet puts it on the ontology." (SheetOntology.tsx:126-128)
- [ ] No eligible key: "No column of this sheet is one per object, so it cannot be an entity yet. Each column, and why:" + list + Close (SheetOntology.tsx:129-140)
- [ ] "Every column could be the key." (SheetOntology.tsx:99)
- [ ] Place error (red) (SheetOntology.tsx:189)

**Loads on open** — `GET /sheets/{id}/ontology` (on the sheet's open, for the button) (SheetOntology.tsx:38-39). **WRITES** on Place: `POST /sheets/{id}/ontology` (a draft; needs ontology-edit) (lib/sheets.ts:374-376; pramanyx/routers/sheets.py:830).

**Top rows today:** n/a (dialog from the sheet bar).

### 3.12 Make a dashboard from a sheet (SheetDashboard.tsx)

**Controls**
- [ ] Name input (prefilled) (SheetDashboard.tsx:105-108)
- [ ] One checkbox per offered card (figure / bar / line / table), refused ones disabled (SheetDashboard.tsx:110-130)
- [ ] "Cancel" · "Make it with N cards" / "Make it" (SheetDashboard.tsx:137-140)
- [ ] After making: opens the Dashboards tab on the Sheets connection (SheetDashboard.tsx:84-85)

**Figures / text**
- [ ] Title "Make a dashboard from <sheet>" (SheetDashboard.tsx:96)
- [ ] "Every card reads the view <name>: N rows." / "Every card reads the whole sheet: N rows." + "A card runs on the sheet each time it is read, so it follows every edit." (SheetDashboard.tsx:100-104)
- [ ] Per card: kind icon, title, why, preview in words ("<value>", top values, "N months, <first> to <last>", "N rows listed") or its refusal (red) (SheetDashboard.tsx:29-50, 118-127)
- [ ] Progress: "Keeping <title> (i of n)…", "Keeping the dashboard…"; else "Kept as your own dashboard on the Sheets connection; nothing calls a model." (SheetDashboard.tsx:77, 81, 136)

**States**
- [ ] "Reading the sheet — each card is run once before it is offered…" (SheetDashboard.tsx:97)
- [ ] Error (red) (SheetDashboard.tsx:134)

**Loads on open** — **RUNS QUERIES on open**: `GET /sheets/{id}/dashboard[?view=]` runs each offered card once on the sheet (Sheets connection, not a warehouse; no model); nothing kept (SheetDashboard.tsx:59-68; pramanyx/routers/sheets.py:716-720). **WRITES** on Make: one dashboard query card per pick + the dashboard (SheetDashboard.tsx:70-91).

**Top rows today:** n/a (dialog from the sheet bar).

### 3.13 Remove a sheet (SheetRemove.tsx — inline under the home's row)

**Controls**
- [ ] "Keep it" (focused first) (SheetRemove.tsx:75)
- [ ] "Remove the sheet" / "Removing…" (destructive; waits until what reads it is known) (SheetRemove.tsx:76-78)
- [ ] "Try again" when the dependents read failed (SheetRemove.tsx:56-59)

**Figures / text**
- [ ] "Remove <sheet>?" (SheetRemove.tsx:49)
- [ ] "This cannot be undone. Its N rows go for everyone, with every edit and its history." (SheetRemove.tsx:50-53)
- [ ] What stays (e.g. the uploaded file) (SheetRemove.tsx:54)
- [ ] "What reads it" list — other sheets (links, columns left empty) and dashboards/cards, withheld ones named and counted (SheetRemove.tsx:65-71; lib/sheets.ts:420-425)

**Keyboard** — Escape = Keep it (SheetRemove.tsx:46)

**States**
- [ ] "Reading what reads it…" (SheetRemove.tsx:60-61)
- [ ] "No other sheet and no dashboard card reads it." (SheetRemove.tsx:62-63)
- [ ] "What reads it could not be read, so it is not removed yet: <error>" (SheetRemove.tsx:55-59)
- [ ] Remove failed (red) (SheetRemove.tsx:73)

**Loads on open** — `GET /sheets/{id}/dependents` (read-only) (SheetRemove.tsx:25-29). **WRITES** on Remove: `DELETE /sheets/{id}`.

**Top rows today:** n/a (inline row in the home's table).

### 3.14 Gaps noticed while reading (not features, recorded for the redesign)
- `removeRows` (`POST /sheets/{id}/rows/remove`) exists in lib/sheets.ts:543-544 but no sheet control calls it — there is no "delete row" in the UI today.
- `GET /sheets/{id}/check` and `GET /sheets/{id}/cells/{row}/{col}` routes have no caller in web/components/sheets (pramanyx/routers/sheets.py:313, 594).
- The sheet-side "dashboard from a sentence" (`/dashboard/draft`, `/dashboard/explore`, both SPEND) is driven from the Dashboards builder (components/dashboards/FromFile.tsx), not from this page.
