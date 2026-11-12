# Feature inventory: Home · Briefing · Now · Data Canvas · Agent runs · Catalog · Profile · Documents

2026-11-10 · This is the parity baseline for the platform-wide UI redesign. The rule: **"Do not remove features as a cost of redesign."** Every `- [ ]` line below must still be reachable after the redesign. Tick each one once you have checked it on the redesigned page.

The pages cover: Home (tab `home`), the Intelligence workspace's context bar, Briefing (tab `intelligence`, layer `briefing`), Now (tab `now`), Data Canvas (tabs `canvases`, `canvas-workspace` and `chat`), Agent runs (tab `recents`), Catalog (tab `data`, layer `catalog`), Profile (Intelligence layer `hub`) and Documents (tab `documents`).

Everything here was read from code only, on branch `claude/seven-destinations`. Nothing was run and no API was called. Each line has the form `- [ ] <item> — <what it does> (path:line)`, and paths are relative to the repo root. Another session was editing `web/app/page.tsx` in the working tree during the read: it added a `PageHeader` breadcrumb and grew the file from 2,397 to 2,433 lines. Line numbers in that file may therefore drift by a few lines.

Marks on API calls:
- **WRITES** means the call changes stored state.
- **SPENDS** means it runs something that costs: a model call, a warehouse query, or an embedding call.

A mark on a control means "on click". A mark under **Loads on open** means the page does it without being asked.

## Counts

| Page | Items |
|---|---|
| Home | 63 |
| Intelligence context bar (above Briefing, Profile and every other Intelligence layer) | 19 |
| Briefing | 107 |
| Now | 71 |
| Data Canvas: canvas list (with the New canvas creator) | 67 |
| Data Canvas: canvas workspace | 101 |
| Data Canvas: chat (toolbar, threads, history, composer, every answer part) | 194 |
| Agent runs | 37 |
| Catalog (tree, home, catalog/schema page, table page, Add data) | 150 |
| Profile | 74 |
| Documents (list, uploader, fact-check, connected sources) | 75 |
| **Total** | **958** (plus 7 dormant features in the appendix) |

## What these pages do on open that WRITES or SPENDS

Read this before redesigning any loading or mounting behaviour.

- **Every app load, on any tab.** The chat's `ChatPanel` is always mounted. Each mount sends `POST /connections/{id}/prewarm`, which **writes** a kernel profile job and **spends** warehouse profiling queries on a cache miss. Each mount also sends `GET /suggestions`, which **spends** a warehouse schema read on every call and a **model** call on a cache miss, then **writes** the cache. Opening a canvas mounts a second `ChatPanel` that does both again. A seeded question (Home's Ask, "Ask about it", ⌘K) auto-sends about 80 ms after mount.
- **Intelligence context bar, above every Intelligence layer.** `GET /catalog/tree` runs when the registry names no schema for the connection. It **spends** a warehouse read of every connection in the workspace and **writes** the metastore's schema rows. `GET /exploration/{conn}/datasets`, used for the maturity readout, **spends** a schema listing.
- **Briefing.** `GET …/briefing/edition` never calls a model. It does **spend** warehouse statements: `data_edge` runs one per table, and the result is never cached for a live connection. It also runs one information-schema query. The page repeats this read every 30 s while a deep analysis it started is still running. The owner's note "opening the Briefing can spend model calls" applied to the dormant `BriefingPanel`, not to `BriefingEdition`, which is what renders today. The guide GET's docstring says "no warehouse query", but the code runs one whenever a schema is passed; the Canvas section below quotes that docstring.
- **Home.** `POST /exploration/{conn}/briefing/metric/{metric}?count=60` makes one warehouse statement on every open whose lead names an approved metric. `GET /exploration/{conn}/domains` opens a warehouse connection to read the cached schema.
- **Now.** `GET /control-room/needs-human` **writes**: it expires lapsed kinetic-inbox proposals (`expire_stale()`) before it reads.
- **Catalog.**
  - `GET /catalog/tree` **spends** and **writes**, as above, on every open, every change to the connection set, and every Refresh.
  - `GET …/datasets` **spends** once per catalog.
  - `GET /knowledge/status` **spends** one real embedding call. The Docs tab calls it again each time it opens.
  - The Sample tab **spends** a 200-row warehouse read.
  - The Profile tab calls `/catalog/tree` again, unscoped.
- **Profile.** The Patterns tab's GET **writes** the pattern cache whenever the cached entry is more than 6 h old. The Domains, Findings and Schema-profile GETs run metadata queries when a schema is passed or the schema cache is cold.
- **Documents.** `GET /knowledge/status` probes the embedder with a real embedding call. This happens on every open, every "Check again", and after every add, remove, purge or restore.
- **Data Canvas.**
  - The list loads with reads only.
  - The canvas workspace always mounts History and Artifacts, so both are read on every open.
  - A restored conversation's answer tables look up object titles with `POST /objects/titles`, which **spends** one warehouse query per object type.
  - Pressing "Create" in the creator **spends** a model call to suggest the name, then starts a "birth" job that **spends** model and warehouse calls.
- **Agent runs.** Reads only.

## Reachable one way only, or easy to lose in a redesign

- **Chat and canvas workspace.** Neither has a rail row. They are reached only through doors (goToChat, openInvestigation, the History popup, ⌘K) and the new breadcrumb.
- **Intelligence layers.** The layer tab row is hidden on the workspace's only mount, so the rail is the only way to switch layers. The chosen schema lives only in localStorage. The Briefing always opens on Week, and a Profile domain page cannot be linked to.
- **Catalog.** The selected catalog, schema or table, the tab inside it, the search, and the Add data page are not in the URL, so a reload lands on the Catalog home.
- **Agent Ops.** The run door (`onOpenInvestigation`) lands on the Agent runs list, not on the run itself.
- **⌘K.** "New Data Canvas" opens the canvas list, not the creator. The past-run items ask the question again, which spends, instead of reopening the run.
- **Hover-only controls in Data Canvas.** These include canvas delete, thread rename and delete, deleting a History-popup row, question Edit and collapse, Copy answer, playbook Edit/Remove, "Edit visualization", and the grid's column ▾ menus.
- **Documents.** The page's two tools ("Check a document's numbers", "+ Add a document") are reachable only from the Documents card's header.
- **Briefing.** A decision block's "Give it to a team" posts to that team's channel, and Schedule's "Send a test" makes a real delivery. A decision block's "Not now" lasts one visit.

## Deletes and destructive actions with no confirm, or a native browser dialog

These have no confirm at all:
- Catalog ▸ Settings: a file's "×"
- Catalog ▸ Volumes: an object's "Delete"
- Add data: "Remove table"
- Data Canvas: deleting a History-popup row
- Briefing ▸ Schedule: a delivery's "Remove"

These use a native browser dialog:
- Catalog: "Remove schema…" and "Remove table…" use `confirm()`, and their failures use `alert()`
- Profile: a finding's "Dismiss" uses `window.prompt`

## Silent or misleading states found while reading

- **Home.** A failed `/investigations` read shows the first-run "Welcome to Pramanyx" funnel, so the failure reads as a first visit.
- **Chat.** After a run, "Submit feedback" posts to `/investigations/{id}/feedback`, which accepts only paused runs. Feedback on a finished run is dropped with no message.
- **Data Canvas.** "Created by me" only hides auto-generated canvases; it does not filter by owner. The Artifacts tab can only list and remove; nothing in the web app creates an artifact. Configure ▸ Metrics mounts `MetricsPanel` without a connection.
- **Catalog.** The comment says the screen reads the search index status once, but the Docs tab reads it again on every open.

## Not features today (do not "restore" them by accident)

- `BriefingPanel` and about a dozen `web/components/brief/*` pieces that only it renders. See the appendix at the end.
- `AddConnForm` in web/components/CatalogScreen.tsx:61-107 is defined but never rendered. The Add data page replaced it.
- The Profile's canvas branches. `canvasId` is never passed on the main screen.

Each page ends with **Top rows today**: the controls that now sit in the page's own header or toolbar rows, to be folded into the new title row and the one toolbar row. Above every page the shell now also draws the `PageHeader` breadcrumb (web/app/page.tsx:1926, working tree).

---

## Home

Entry: `HomeScreen` (web/app/page.tsx:467) → `HomeDesk` (web/components/home/HomeDesk.tsx:77), rendered at web/app/page.tsx:1930 when `tab === "home"`. Reached by the rail's Home ▸ Home (web/lib/navDestinations.ts:44), the shell breadcrumb's "Home" crumb, `?tab=home`, the default landing tab when the URL names none, and Now's "Start from Home" (web/components/now/NowPanel.tsx:922).

### 1. Controls
- [ ] Ask box (textarea, "Ask anything about your data") — types the question; shown only once a connection exists (web/app/page.tsx:523-531)
- [ ] Quick / Agent depth toggle — picks a fast grounded answer ("ask") or a multi-step Agent run ("investigate", the default) for the question (web/app/page.tsx:533-538)
- [ ] Ask button — sends the question to the chat with the chosen depth and clears the box; disabled while empty — **SPENDS (model, warehouse)** on click (web/app/page.tsx:539, :495-498)
- [ ] "Open that answer" (Ask recall, appears after ≥12 typed characters when the same question is on record) — opens the newest earlier answer in its canvas or the chat (web/components/home/AskRecall.tsx:50)
- [ ] "Run it again and compare" (Ask recall) — sends the typed question anyway — **SPENDS** on click (web/components/home/AskRecall.tsx:51)
- [ ] First-run funnel step 1 "Add a connection →" — opens the shell's Add Connection modal (web/app/page.tsx:554, :565)
- [ ] First-run funnel step 2 "Load the demo →" / "Loading…" — seeds the demo connection (or selects it if present) and goes to the Catalog — **WRITES** `POST /connections/demo` on click (web/app/page.tsx:555, :1562-1586)
- [ ] First-run funnel step 3 "Ask now →" — opens an empty chat (web/app/page.tsx:556)
- [ ] Lead card "Read the analysis" — opens the lead run (in its canvas, else the chat) (web/components/home/HomeDesk.tsx:279)
- [ ] Lead card "Ask a follow-up" — drafts "Why did this happen? <headline>" into the Ask box; never sends (web/components/home/HomeDesk.tsx:280)
- [ ] Lead chart hover — a crosshair and a tip with the day, "may still move" for a settling day, and the value (web/components/home/LeadChart.tsx:69-75, :142-150)
- [ ] Question card answer buttons "A campaign" / "A price change" / "Nothing we did" / "I don't know" — books what the person said about the lead move — **WRITES** `POST /record/claims/said` (web/components/home/HomeDesk.tsx:318, web/lib/home.ts:95, :438-440)
- [ ] Finding card "Decide" — opens an inline "What was decided?" box and the expectation row (web/components/home/HomeDesk.tsx:402)
- [ ] Finding card "Check again" — re-validates the finding's numbers — **SPENDS (warehouse)** `POST /exploration/{conn}/findings/{id}/revalidate` (web/components/home/HomeDesk.tsx:403, :387-394; web/lib/home.ts:431-436)
- [ ] Finding card "Not worth it" — opens an inline "Why is it not worth it?" box (web/components/home/HomeDesk.tsx:404)
- [ ] Decide box: text input + "Book it" — books a decision citing the finding, with "do nothing" as the other option — **WRITES** `POST /record/decisions` (web/components/home/HomeDesk.tsx:408-411, :365-379)
- [ ] Decide box expectation row: metric select ("nothing named — it cannot be scored" + approved, dated metrics), direction select, "all of it / for one <dimension>" select, part input — what the decision should move, so the review can score it (web/components/home/HomeDesk.tsx:416; web/components/decisions/DecideDoor.tsx:64-80)
- [ ] Dismiss box: text input + "Set aside" — dismisses the finding as a decision not to act (restorable) — **WRITES** `POST /exploration/{conn}/findings/{id}/dismiss` (web/components/home/HomeDesk.tsx:408-411, :380-386)
- [ ] Decide/Dismiss "Cancel" — closes the box (web/components/home/HomeDesk.tsx:413)
- [ ] Standing questions rows (each a button) — opens the newest answer to a question asked 3+ times (web/components/home/HomeDesk.tsx:159-172)

### 2. Dialogs, drawers, popovers, panels
- [ ] Add Connection modal (from funnel step 1) — name, connector type grid grouped Built-in / Warehouse / File / API·CRM / Federation / Knowledge, per-type fields, "Save Connection" / "Cancel"; **WRITES** a connection (web/app/page.tsx:661-810, :2402-2407)
- [ ] Ask recall panel — "Already on record: answered N times since <d>, last on <d>", the newest headline, two buttons (web/components/home/AskRecall.tsx:41-53)
- [ ] Inline Decide / Not-worth-it editor inside the finding card (web/components/home/HomeDesk.tsx:406-416)
- [ ] Lead chart tooltip (hover) (web/components/home/LeadChart.tsx:142-150)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] "Since your last visit · <day>" / "Your first visit in this browser" — the visit line (browser-local) (web/components/home/HomeDesk.tsx:133-135)
- [ ] Lead label "One thing to know" / "… · nothing new since your last visit" (web/components/home/HomeDesk.tsx:244)
- [ ] Lead chips: "not read as a move" (amber, the metric never settles), "<x> confidence" (when not HIGH), "N days behind today" (web/components/home/HomeDesk.tsx:237-243)
- [ ] Lead figure line "<metric> · <day>" and the big value (shows "—" until today's reading is in) (web/components/home/HomeDesk.tsx:248-250)
- [ ] Lead change: today's reading change text, or an up/down chip "<change> · ±x.x%" (web/components/home/HomeDesk.tsx:251-256)
- [ ] Lead restated chip (amber) "reported <v> on <d> · restated −x%" — the warehouse reads the day differently now (web/components/home/HomeDesk.tsx:257-261)
- [ ] Lead chart — 60 days of the metric, the day marked "<v> now", the reported point, older-day average line, settling days marked (web/components/home/LeadChart.tsx:45-75)
- [ ] "Looked into on <day> · <Verdict>" foot line (web/components/home/HomeDesk.tsx:281-283)
- [ ] Question card "Needs you · a question" (amber edge) with "Did the team do anything that explains it?" and the subject (web/components/home/HomeDesk.tsx:307-313)
- [ ] "Kept as said by you · <answer>" confirmation + "Recorded as <actor>" (web/components/home/HomeDesk.tsx:315, :319; web/components/record/kit.tsx:87-95)
- [ ] Finding card "Needs you · a finding to act on" (amber edge) with the finding's age at right (web/components/home/HomeDesk.tsx:397)
- [ ] Finding result lines: "Booked as a decision · review <day>[ · nothing expected, so it cannot be scored]", "Set aside · booked as a decision not to act · it can be restored", "Checked again · the numbers still hold" / "· a number moved — open the finding to see which" (web/components/home/HomeDesk.tsx:376-392)
- [ ] The week ahead — reviews and forecasts landing in the next 7 days; day one lists up to 4 forecasts with ranges ("+N more"), later days as chips (up to 5, "+N"); label right "<day> · for <span>" (web/components/home/HomeDesk.tsx:425-465)
- [ ] Between you and Pramanyx — "you told it", "your forecasts", "landed in range" (N of M or "—") (web/components/home/HomeDesk.tsx:467-488)
- [ ] Standing questions — latest headline, the question, "N×", label right "asked 3+ times · latest answer" (web/components/home/HomeDesk.tsx:153-173)
- [ ] First-run funnel "Welcome to Pramanyx" with three numbered steps (web/app/page.tsx:546-571)

### 4. Keyboard shortcuts
- [ ] Enter in the Ask box sends; Shift+Enter makes a new line (web/app/page.tsx:527)

### 5. URL params / deep links read or written
- [ ] `?tab=home` (written by the shell; also the landing tab with no `?tab=`) and `?conn=<id>` (the shell's selected connection) (web/app/page.tsx:1244-1268)
- [ ] localStorage `pramanyx_home_last_seen` — read once, rewritten on every visit (web/components/home/HomeDesk.tsx:33, :86-92)
- [ ] Nothing else (lead, finding, standing question) is addressable

### 6. Empty / error / loading / withheld states that say something
- [ ] No connection: the Ask box is hidden and only the funnel shows (web/app/page.tsx:519)
- [ ] No runs yet: "Welcome to Pramanyx … Get started in three steps" — NOTE: a FAILED `/investigations` read also lands here (the catch leaves the list empty), so a read failure reads as a first run (web/app/page.tsx:504-507, :546)
- [ ] "Choose a connection to see what is on your desk." (web/components/home/HomeDesk.tsx:122-124)
- [ ] "No daily run has reported a move here yet." (web/components/home/HomeDesk.tsx:215-221)
- [ ] "The line behind this figure could not be read · <why>" (web/components/home/HomeDesk.tsx:267-268)
- [ ] "As the analysis reported it · not read again here" (no approved metric matches) (web/components/home/HomeDesk.tsx:271-272)
- [ ] "Every finding here has been acted on." and "Nothing to ask you today." (web/components/home/HomeDesk.tsx:352-358, :418)
- [ ] "Nothing lands in the next seven days." (web/components/home/HomeDesk.tsx:437-438)
- [ ] "No question asked three times yet." (web/components/home/HomeDesk.tsx:157-158)
- [ ] Booking/decision errors print the server's words in red under the card (web/components/home/HomeDesk.tsx:322, :378)

### 7. Loads on open
- [ ] `GET /investigations?workspace_id=` — the recent runs Home picks its lead, question and standing questions from (default limit 50) (web/app/page.tsx:501-508; pramanyx/routers/investigations.py:6384)
- [ ] `GET /record/claims?kind=said` and `?kind=prediction`, `GET /record/decisions` (connection-scoped) (web/components/home/HomeDesk.tsx:100-106)
- [ ] `GET /exploration/{conn}/domains` — findings for "a finding to act on"; opens a warehouse connection to read the cached schema for triage (introspects on a cold schema cache) (web/lib/home.ts:418-421; pramanyx/routers/exploration.py:639-670, :582-599)
- [ ] `GET /record/you` — the "Between you and Pramanyx" counts (web/lib/home.ts:452-453)
- [ ] `GET /investigations/{lead id}` — the lead run's report for its figure (web/lib/home.ts:388-389)
- [ ] `GET /metrics?connection_id=` then **`POST /exploration/{conn}/briefing/metric/{metric}?count=60` — SPENDS (warehouse): one statement, no model call**, on every Home open whose lead names an approved metric (web/components/home/HomeDesk.tsx:194-214; pramanyx/routers/exploration.py:1010-1027)
- [ ] `GET /ask/prior` — debounced 350 ms while typing ≥12 characters; a read (web/components/home/AskRecall.tsx:28-36; pramanyx/routers/investigations.py:6056-6067)
- [ ] `GET /metrics` again when Decide opens (approved, dated metrics for the expectation) (web/components/home/HomeDesk.tsx:342-349)
- [ ] Who-am-I read for "Recorded as" (`useActor` → `useMe`) (web/components/record/kit.tsx:81-84)

Top rows today: Home has no title or toolbar of its own. Above it the shell now draws the PageHeader breadcrumb "Home" (web/app/page.tsx:1926, working tree). The first row on the page is the Ask composer (textarea · Quick|Agent · Ask), then the "Since your last visit" line.

---


## Intelligence context bar

Entry: `IntelligenceWorkspace` (web/components/IntelligenceWorkspace.tsx:128), mounted once at
web/app/page.tsx:2120-2134 with `hideTabs`, `connections` = workspace connections filtered to `briefings_enabled !== false`
(page.tsx:2129), `onConnectionChange=setSelectedConn` (page.tsx:2130), `workspaceId`, and `contextReady`. The bar is the
`headerControls` row of the shared `Workspace` shell (web/components/Workspace.tsx:79). It sits above **every** layer
whose rail row resolves to tab `intelligence`, not only above the Briefing and the Profile. Those rows are Briefing (Home),
Profile (Data), Dashboards (Analyze), Ontology / Actions / Graph / Memory / Org (Define), Evidence (Decide) and Brain map
(Operations) (web/lib/navDestinations.ts:43-91; page.tsx:940-965). The bar renders only when at least one of its three
items shows (IntelligenceWorkspace.tsx:201).

### 1. Controls
- [ ] Connection picker — `Connection` select listing briefings-enabled connections. It sets the app-wide selected connection, which every layer re-reads, and `?conn=` is replaced in the URL. Shown only when there is no canvas, `onConnectionChange` is given, and there is more than one such connection (web/components/IntelligenceWorkspace.tsx:196, 204-217)
- [ ] Schema picker — `Schema scope` select listing the connection's schemas. It scopes Briefing, Profile, Ontology and Graph together, and a change remounts the Briefing (key includes schema, IntelligenceWorkspace.tsx:263). It remembers the choice per browser in localStorage `pramanyx_schema_choice:<conn>` and sets the "current dataset" whose confirmed currency labels figures (web/lib/schemaChoice.ts:14-19). Shown only when there is more than one schema and no canvas. There is no "All schemas" option, which was removed (IntelligenceWorkspace.tsx:197, 221-237)
- [ ] Layer tab row (Briefing · Dashboards · Profile · Ontology · Graph · Evidence · Memory · Actions · Org · Brain map, each with its blurb as hover title) — HIDDEN on the main screen (`hideTabs`). The rail replaces it. Nothing else mounts `IntelligenceWorkspace` (the Data Canvas mounts `BriefingEdition` directly, web/components/CanvasWorkspace.tsx:678), so this row is unreachable today (web/components/Workspace.tsx:81-91; IntelligenceWorkspace.tsx:70-88, 193-194)
- [ ] Layer help "?" button — not wired for Intelligence (`help` prop not passed) (web/components/Workspace.tsx:84-90)

### 2. Dialogs, drawers, popovers, panels
- none found

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Maturity readout — label "Maturity", three vertical bars (Structure · Questions · Time), the percent, and the stage word. It reads "off for analysis" when the dataset is off and appends " · layer not set" when no layer is set. Shown when there is no canvas, a connection is selected and the schema has settled (IntelligenceWorkspace.tsx:199, 238; web/components/DatasetProgram.tsx:355-373)
- [ ] Maturity bars hover tooltip and aria-label — each reading with its percent and note, e.g. "Structure 80% — …" (web/components/DatasetProgram.tsx:53-55, 58-84)

### 4. Keyboard shortcuts
- none found (the native `<select>` keyboard only. App-wide ⌘K lists "Briefing" and "Profile", web/components/CommandPalette.tsx:354, 358, 398, 402)

### 5. URL params / deep links read or written
- [ ] Reads `?tab=` — `intelligence` / `briefing` (Briefing), `intel-hub` / `intel` (Profile), `ontology`, `graph`, `memory`, `evidence`, `brain`, `org-intel`, `declared-actions` (→ kinetic), `dashboards`, and `cockpit` as an alias of dashboards (web/app/page.tsx:940-965, 993-1012, 1013-1023)
- [ ] Reads `?layer=` — honoured only for tab intelligence, for any of briefing, dashboards, hub, ontology, graph, evidence, memory, kinetic, org, brain, with `cockpit` → dashboards. Applied at mount, on popstate and through the in-app navigate event (web/app/page.tsx:1021-1023, 1034-1038, 1095-1104, 1116-1131, 1170-1195, 1268-1285)
- [ ] Reads `?conn=` — the selected connection, which the bar's picker shows. Also accepted as `params.conn` on the in-app navigate event (page.tsx:1178)
- [ ] Writes `?tab=intelligence&layer=<layer>&conn=<id>` — a tab change pushes history and other changes replace it. Every Intelligence layer is written as `tab=intelligence`, not as its rail id (web/app/page.tsx:1205-1262)
- [ ] Rail highlight follows the layer (RAIL_TAB_FOR_INTEL_LAYER), so `layer=hub` lights "Profile" and `layer=briefing` lights "Briefing" (web/app/page.tsx:953-963, 1890)
- [ ] NOT in the URL: the schema choice, which lives only in localStorage (web/lib/schemaChoice.ts:11-19), so a shared link can open on a different schema

### 6. Empty / error / loading / withheld states that say something
- [ ] While the schema resolves, the Briefing layer says "Reading this connection's schemas…" — "The briefing opens once its schema scope settles — a cold catalog can take a few seconds." (web/components/IntelligenceWorkspace.tsx:271-276)
- [ ] Before the workspace and its connections are known: "Finding your connections…" — "The workspace and its connections are still loading." (IntelligenceWorkspace.tsx:273, 277-278)
- [ ] No connection: "No connection selected" — "Briefings are per connection. Choose one in the bar above." when the picker shows, else "…Add one from the Catalog, then come back here." (IntelligenceWorkspace.tsx:274, 279-281)
- [ ] Silent: a failed datasets read draws no maturity mark at all, with no words (web/components/DatasetProgram.tsx:360, 364). A failed catalog read leaves the schema picker hidden (IntelligenceWorkspace.tsx:179)

### 7. Loads on open
- [ ] GET `/ontology/schemas?connection_id=` — when the registry names the connection's schema, adds ontology-built schemas to the picker. A read (web/lib/objectTypes.ts:1396-1400; pramanyx/routers/ontology.py:866-879)
- [ ] GET `/catalog/tree?workspace_id=` — only when the registry names NO schema. **SPENDS (warehouse)**: it introspects the schemas of EVERY connection in the workspace, eight in parallel (pramanyx/routers/catalog.py:234-257). It also **WRITES** the metastore's schema rows for each connection it read (`set_catalog_schemas`, pramanyx/routers/catalog.py:269-273) (web/lib/api.ts:945-951; IntelligenceWorkspace.tsx:167)
- [ ] GET `/exploration/{conn}/datasets` — the maturity readout. **SPENDS (warehouse)**: one schema/table listing through `quick_schemas` (a file listing for uploads). The rest is read from stores (pramanyx/routers/datasets.py:58-64, 155-159; pramanyx/routers/catalog.py:38-68) (web/lib/api.ts:2486-2490; web/components/DatasetProgram.tsx:360)

Top rows today: on the main screen the context bar is the only row above every Intelligence layer: `Connection` select · `Schema` select · Maturity readout, each conditional. The layer tab row is hidden.


---

## Briefing

> **What the Briefing layer renders today.** The `briefing` layer mounts `BriefingEdition` (web/components/IntelligenceWorkspace.tsx:262-265), not `BriefingPanel`. `<BriefingPanel>` has been rendered nowhere since Arc BG/BC (#635); only its exported pieces are used (`FindingActions` and `EvidenceDrawer` by the Profile, `DossierTrace` by chat). Most of `web/components/brief/*` (BriefFigures, BriefPaper, BriefPeriod, BriefingSections, BriefingStrip, EditionCovers, IndustryKpiStrip, InlineInvestigationThread, PinnedCards, GroundedNumber, StatTile) is reachable only through that dormant panel; see the appendix.

Entry: `BriefingEdition` (web/components/brief/BriefingEdition.tsx:42), rendered by IntelligenceWorkspace.tsx:262-265 once
the schema has settled, with `key=conn:canvas:schema` and `onDeepAnalysis = onInvestigate(q, "investigate")`. It is
reached from the rail row "Briefing" (destination Home, row id `intelligence`, web/lib/navDestinations.ts:46; handled at
page.tsx:1687-1691), ⌘K "Briefing" (CommandPalette.tsx:354, 398), Now's "open the Briefing" door, which can also switch
connection (page.tsx:1926-1929), and links `?tab=intelligence` / `?tab=briefing` / `?layer=briefing`. The Data Canvas
mounts the same component with `canvasId` (web/components/CanvasWorkspace.tsx:678). Lines marked "(canvas only)" appear
only there.

### 1. Controls

**Masthead row (BriefingEdition.tsx:223-232)**
- [ ] Range — segmented Week · Month · Year · Custom, each with a hover title such as "The last complete week old enough to read". It re-reads the edition for that range. "What we know" / Day / MTD / YTD are deliberately not offered here (web/components/brief/BriefingEdition.tsx:36, 227-228; web/components/brief/BriefRange.tsx:30-38, 59-68)
- [ ] Custom range — `First day` and `Last day` date inputs (each bounded by the other), with a `Show` button that is enabled only when start ≤ end (web/components/brief/BriefRange.tsx:69-81)
- [ ] `Schedule` / `Close schedule` toggle — opens the Scheduled delivery card inline. Hidden in a canvas (BriefingEdition.tsx:229, 233)
- [ ] `Sources & guide` — reopens the side panel. Shown only when the panel is hidden (BriefingEdition.tsx:230)

**Reader row**
- [ ] "Reading as" segmented — "The organisation" plus every function group in name order. It re-reads the edition for that reader and **WRITES** the person's preference `briefing_reader` (PUT `/me/preferences/briefing_reader`). If that write fails, a toast says "Your reader could not be kept; it holds for this visit" (BriefingEdition.tsx:122-126, 234-237; web/lib/briefingEdition.ts:22-31)

**Body actions (by state)**
- [ ] `Draft the guide` / "Drafting…" — only when the dataset has no Briefing guide. **SPENDS (model)**: one call, plus each check measured once. **WRITES** a draft guide version (BriefingEdition.tsx:269-277)
- [ ] `Write this week's edition` (or month's / year's, or "Write this range's edition" for a custom range), showing "Looking into it and writing…" — only when there is no edition for this range and reader. **SPENDS (model + warehouse)** and **WRITES** the edition (BriefingEdition.tsx:278-302, 128-133; web/lib/briefingEdition.ts:52-55)
- [ ] `Write it again` (title "Measure again, look again and write again") — under a written edition, with the same cost as above (BriefingEdition.tsx:330-334)

**Each block of a written edition (web/components/brief/blocks/EditionBlocks.tsx)**
- [ ] Cited number in any sentence — a dotted-underlined number that opens its source in the side panel, by click, Enter or Space (EditionBlocks.tsx:64-77; BriefingEdition.tsx:142)
- [ ] `source` link at a card's foot, with " · provisional" etc. when the source is not final — opens that source in the side panel by click or Enter (EditionBlocks.tsx:437-439)
- [ ] Drill buttons "By <column>" / "By <column>, within <segment>", showing "Drilling…" — redraw the card one level deeper. Up to 3 drills on a check and 2 on a breakdown or drill. **SPENDS (warehouse)**: a compiled query, no model (EditionBlocks.tsx:429-434; web/lib/briefingEdition.ts:15-16, 150-160; BriefingEdition.tsx:146-157)
- [ ] Drill trail — `Original` › earlier step buttons › current step. It goes back to any earlier version of the card, and the drills belong to this reader's view and this writing only (EditionBlocks.tsx:374-390, 419; BriefingEdition.tsx:159-161)
- [ ] `Ask about this` / `Asking about this` (pressed state) on every block that says or draws something. It points the ask box under the page at this part, then scrolls it into view and focuses it (EditionBlocks.tsx:196-205, 436, 443; web/lib/briefingEdition.ts:164-166; BriefingEdition.tsx:163; EditionEvidence.tsx:134-139)
- [ ] Control block — a segmented "All" plus up to 8 values of a column. It fades the rows of every other value in the blocks that listen to it (EditionBlocks.tsx:356-367, 91-98, 273)
- [ ] Table block — `Copy` (copies the table as cells) and `CSV` (downloads the table) (EditionBlocks.tsx:265-268; web/components/TableActions.tsx:74-112)
- [ ] Table block object links — a key column the model linked opens the object page `/objects/<type>/<key>?conn=&schema=`. It needs the object catalog (EditionBlocks.tsx:276-281, 475-482; web/lib/objectLinks.ts:12-18)
- [ ] Decision block `Deep analysis` — hands the decision's sentence to the Agent as a deep analysis (Data Canvas, investigate mode). With no handler, it seeds the ask box instead (EditionBlocks.tsx:165; BriefingEdition.tsx:175-180)
- [ ] Decision block `Give it to a team` — toggles a row of function-group buttons, showing "Giving…". Each button **WRITES** to the edition and posts the decision to the channel that group binds, through the departure gate, so it can send a message (EditionBlocks.tsx:166-183; BriefingEdition.tsx:165-173; pramanyx/routers/exploration.py:2307-2330)
- [ ] Decision block `Not now` — hides the decision for this visit only. Nothing is written (EditionBlocks.tsx:170; BriefingEdition.tsx:176)
- [ ] Context block `Open the deep analysis` / `Open the decision` / `Open the decision it is about` — navigates to the chat run, or to Record ▸ Decisions with the id (EditionBlocks.tsx:130-132, 143-147)
- [ ] Map block — hover tooltip on each country (Vega geoshape `tooltip: true`) (EditionBlocks.tsx:298-308)
- [ ] Heat block — a cell under 30 shows the hover title "under 30 — too few to call" (EditionBlocks.tsx:337)
- [ ] Range bars figure — a hover `<title>` on each bar with its start date (web/components/brief/EditionFigure.tsx:50, 67)

**Ask box (web/components/brief/blocks/EditionEvidence.tsx:103-182), shown once the range has a period**
- [ ] Question input ("Ask about this edition", placeholder "Ask about this week — answered here, from the data"). Enter sends. **SPENDS (model + warehouse)**: POST `/api/chat` with depth "quick", surface "briefing" and the edition's period key (EditionEvidence.tsx:121-125, 140-146, 175-177)
- [ ] `Ask` / "Answering…" button (EditionEvidence.tsx:178)
- [ ] "Asking about “…”" chip with `×` ("Ask about the whole edition"), which points the ask back at the whole edition (EditionEvidence.tsx:161-174)
- [ ] Each answer renders as a chat answer (ChatMessage via PartsMessage). Its follow-up suggestions ask again here, and its "deeper" hands to the Data Canvas (EditionEvidence.tsx:157-158; web/components/chat/PartsMessage.tsx:56-83)

**Side panel header**
- [ ] Segmented `Sources` · `Guide`. Guide is offered only when a guide exists (BriefingEdition.tsx:349-350)
- [ ] `Hide` — closes the side panel (BriefingEdition.tsx:351)

**Sources tab (EditionEvidence.tsx:36-99)**
- [ ] Numbered list of every source the page reads. Clicking a source, or pressing Enter on it, opens it (EditionEvidence.tsx:49-55)
- [ ] `All sources` — goes back from one source to the list (EditionEvidence.tsx:64)
- [ ] Source `Copy` / `CSV` — copies or downloads ALL rows, not only the 50 shown (EditionEvidence.tsx:79-83, 93-94)

**Guide tab (web/components/brief/BriefingGuidePanel.tsx)**
- [ ] `Publish this version` / "Publishing…" — only when the newest version is a draft. **WRITES** (BriefingGuidePanel.tsx:90-94)
- [ ] `Edit` / `Cancel` — opens the edit form (BriefingGuidePanel.tsx:95-97)
- [ ] Edit form — "The business" textarea, plus "What a week is for", "What a month is for" and "What a year is for" textareas. Only these four fields are editable: comparisons, calendar, care, checks and readers are not (BriefingGuidePanel.tsx:105-116)
- [ ] `Save as a draft` / "Saving…" — **WRITES** a new version with the note "edited by a person" (BriefingGuidePanel.tsx:117-124)
- [ ] `Redraft` / "Drafting…" (title "One model call; kept as a new draft") — **SPENDS (model)** and **WRITES** (BriefingGuidePanel.tsx:98-101)
- [ ] `Hide` — inside the guide, goes back to the Sources tab (BriefingGuidePanel.tsx:102; BriefingEdition.tsx:356)
- [ ] Proposed reader `Add` — **WRITES** a function group (POST `/groups`, org-wide) and adds the reader to the guide with the proposal's own checks, with no model call (BriefingGuidePanel.tsx:60-68, 188-199)
- [ ] `+ Add a reader` — opens a form with "Reader's name" (placeholder "Product"), "What they watch" (placeholder "What this department or team watches and decides, in your words"), `Add the reader` / "Adding…" (title "One model call maps the words onto the guide's checks") and `Cancel`. **WRITES** a group and a guide draft, and **SPENDS (model)**: one call, plus up to four new checks measured (BriefingGuidePanel.tsx:200-217; pramanyx/routers/exploration.py:2254-2275)
- [ ] History `N versions` / `Hide` — expands the version list (BriefingGuidePanel.tsx:219-229)

**Scheduled delivery card (web/components/brief/BriefSchedule.tsx), opened by Schedule**
- [ ] Each delivery row has `Pause` / `Resume` — **WRITES** (BriefSchedule.tsx:129-137)
- [ ] Each delivery row has `Send a test` — **sends** a real delivery to the trigger (BriefSchedule.tsx:138-142)
- [ ] Each delivery row has `Remove` — **WRITES**, with no confirmation (BriefSchedule.tsx:143-147)
- [ ] New delivery: "Name this delivery" input (BriefSchedule.tsx:153-154)
- [ ] New delivery: period select (weekly · daily · monthly · yearly). Monthly and yearly force "briefing for the period" and their own cron (BriefSchedule.tsx:155-167)
- [ ] New delivery: "What to send" select (alert summary, only for weekly and daily, · briefing for the period) (BriefSchedule.tsx:168-172)
- [ ] New delivery: cron preset select (Weekdays / Daily / Mondays 8:00 UTC, or "1st of the month" / "1 January" 8:00 UTC) (BriefSchedule.tsx:26-36, 173-176)
- [ ] New delivery: trigger select, listing enabled triggers as "name (type)" (BriefSchedule.tsx:178-181)
- [ ] New delivery: `Schedule it` — **WRITES** a subscription. Enabled only with a name and a trigger (BriefSchedule.tsx:182-189)

**Turned-off state**
- [ ] `Turn it on in the Catalog` — navigates to the Catalog for this connection (web/components/brief/BriefingOff.tsx:33-35)

### 2. Dialogs, drawers, popovers, panels
- [ ] Side panel "Sources and guide" — a 380px right column, OPEN by default on the Sources tab. Each side scrolls on its own (BriefingEdition.tsx:62, 219, 345-361)
- [ ] Sources tab, one source — label, kind sentence, status, note, caveats in amber, "N guards checked this query", the SQL in a monospace block, and a table of the first 50 rows with "N more rows — Copy or CSV takes them all" (EditionEvidence.tsx:23-33, 59-97)
- [ ] Guide tab — "Briefing guide" with version pill `vN · state`, "This version kept by …", "Editions read version N, published / a draft no person has published yet", then the sections The business · What each range is for · What counts as news · Fair comparisons (with "Compared without X before Y — applied / applied once a person publishes the guide") · The calendar · Read with care · What an edition measures · N (each check with "approved metric X" or its evidence) · "Kept out: …" · Readers (the current reader highlighted, with "N checks" each) · The guide proposes · History (BriefingGuidePanel.tsx:71-231)
- [ ] Scheduled delivery card, inline under the masthead — rows with name, description ("weekly briefing · Slack bot to #ch · replaces an automation, paused after 7 delivered mornings (n so far)"), cron, last-sent status and last error (first 60 characters, full text on hover) (BriefSchedule.tsx:41-50, 90-195)
- [ ] Team picker row under a decision ("Give it to …"), inline (EditionBlocks.tsx:172-183)
- [ ] Inline answers under the page — each in a dashed card (EditionEvidence.tsx:148-160)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Title "The Briefing" with the period it covers, e.g. "the week of 27 Oct–2 Nov" (BriefingEdition.tsx:224-225)
- [ ] Dateline "What changed in {covers}, written for {reader}, against {compared_with}. Every underlined number opens where it came from." plus " Written from a draft guide no person has published." when the guide is a draft (BriefingEdition.tsx:238-244)
- [ ] Lag-moved warning, in amber — "Written when this data was read N days behind; it is now read M days behind, so a figure marked provisional may have changed since. Write it again…" (BriefingEdition.tsx:245-251)
- [ ] Canvas scope note — "This canvas reads … N of the guide's M checks … Left out, because they read other tables: …", or "…its Briefing is the dataset's own edition" (canvas only) (BriefingEdition.tsx:252-264)
- [ ] "This edition was drawn by code from what was measured: …", in amber (BriefingEdition.tsx:305-309)
- [ ] Withheld section — "Held back: “sentence” — why", "Left out: …" and "Not read: label — reason" (BriefingEdition.tsx:316-324)
- [ ] Footer — "written {time} · N model steps · N queries of its own · read N deep analyses, N findings, N decisions and N discussions · started a deep analysis · guide vN" (BriefingEdition.tsx:335-339)
- [ ] Block kicker (uppercase, e.g. "Drill" with a blue border) and block title, which falls back to the source label (EditionBlocks.tsx:411, 416-423)
- [ ] Figure block — large current value, "usual low–high", "not read against usual" (amber, with a hover reason), "the range before X", and range bars (EditionBlocks.tsx:222-242; EditionFigure.tsx:35-84)
- [ ] Bridge, compare (pair rows with change, faded when filtered), map with the top 5 and bottom 2, small multiples, heat table tinted by change, progress bars and line marks (EditionBlocks.tsx:243-355; EditionFigure.tsx:86-239)
- [ ] Context block kicker — "Being looked into — a deep analysis this edition started" (amber), "Deep analysis · date · x confidence", "Explorer finding · domain", "Slack/Said · who · when", or "Decision · state" (EditionBlocks.tsx:119-127)
- [ ] "Finished before the definition of X changed on D, so what it says of it is about the old figures." (amber) (EditionBlocks.tsx:140-142; web/lib/briefingEdition.ts:94-103)
- [ ] Given-to lines — "Given to {team} by {who} · sent to its channel / held at departure / not sent — note" (amber unless sent) (EditionBlocks.tsx:154, 184-189)
- [ ] Source link status suffix — " · provisional" etc. (EditionBlocks.tsx:439)
- [ ] Sources list — "N. label", then "{kind sentence} · N rows" (EditionEvidence.tsx:49-54)
- [ ] Answer header — "{what the turn was about}" + " · this answer did not read it" (EditionEvidence.tsx:152-156)
- [ ] Schedule row status — "last sent {time} · ok/err" in green or red, or "never sent yet". Cron shown in monospace (BriefSchedule.tsx:113-122)
- [ ] Guide version pill `vN · draft/published` (BriefingGuidePanel.tsx:79-80)
- [ ] Turned-off notice — the server's sentence, plus "Turned off by X · Marked system tables / deprecated / not this business's data / sensitive" (BriefingOff.tsx:12-31)

### 4. Keyboard shortcuts
- [ ] Enter / Space on a cited number opens its source (EditionBlocks.tsx:71)
- [ ] Enter on a block's `source` link opens it (EditionBlocks.tsx:438)
- [ ] Enter on a source in the Sources list opens it (EditionEvidence.tsx:52)
- [ ] Enter in the ask box sends (EditionEvidence.tsx:177)
- [ ] Arrow keys inside the Range, Reading-as, Side-panel and control segmented controls (Radix SegmentedControl default) (web/components/ui/segmented.tsx:3)
- none page-level (no global keydown listener in these files)

### 5. URL params / deep links read or written
- [ ] Reached by `?tab=intelligence` (or `briefing`) with `layer=briefing` and `conn=`. Written back as `?tab=intelligence&layer=briefing&conn=<id>` (see the context bar, page.tsx:1205-1262)
- [ ] NOT in the URL: the range, custom dates, reader, side-panel state, picked source, drill trails, the ask's target, and hidden ("Not now") decisions. All reset on remount. The range always opens on Week (BriefingEdition.tsx:51). The reader is kept server-side as a preference, not in the URL (BriefingEdition.tsx:125)
- [ ] Links out: `/objects/<type>/<key>?conn=&schema=` from table cells (EditionBlocks.tsx:280); in-app navigate to `chat` with `run`, `decisions` with `id`, and `catalog` with `conn` (EditionBlocks.tsx:130-131; BriefingOff.tsx:33)

### 6. Empty / error / loading / withheld states that say something
- [ ] Loading — "Reading the edition…" (BriefingEdition.tsx:268)
- [ ] Read error — the error text in amber above the body (BriefingEdition.tsx:266). Action failures (write, draft, drill, give) show as toasts (BriefingEdition.tsx:131, 138, 155, 171)
- [ ] No guide — "This dataset has no Briefing guide yet" — "The guide says how this dataset's Briefing is written … The Explorer drafts it at the end of an exploration; draft it now from what was learned (one model call)." (BriefingEdition.tsx:269-277)
- [ ] Not written — "Not written yet for {reader}" — it explains what writing does: "the guide's N checks are measured … at most 8 queries of its own … may start one deep analysis … It takes about a minute." In a canvas it adds "Measured here: …" and "Left out, because they read other tables: …" (BriefingEdition.tsx:278-302)
- [ ] Turned off — "{off.said}" with who and why, and the Catalog door (BriefingOff.tsx:19-37; BriefingEdition.tsx:267)
- [ ] Block of an unknown type — "This edition has a block of type “x”, which this page cannot draw." (EditionBlocks.tsx:425-426)
- [ ] Missing source or measurement — "This block's source is not in the edition." / "This figure's measurement is not in the edition." / "This bridge's steps could not be read from its source." (EditionBlocks.tsx:116, 224, 245)
- [ ] Withheld — "Held back: “…” — why" / "Left out: …" / "Not read: … — reason" (BriefingEdition.tsx:316-324)
- [ ] Sources panel with nothing picked — "Click a cited number, or a block's “source”, to see its query here. Nothing on this page was written without one." (EditionEvidence.tsx:46-48)
- [ ] No function groups when giving — "— there are no function groups yet" (EditionBlocks.tsx:175-176)
- [ ] Guide with no readers — "No reader added yet — editions are written for the organisation." (BriefingGuidePanel.tsx:179)
- [ ] Schedule with no triggers — "No delivery triggers exist yet — a schedule needs somewhere to send." — "Create a webhook or Slack trigger under Operations ▸ Notifications first…" (BriefSchedule.tsx:100-106)
- [ ] Schedule notes — "Paused." / "Resumed." / "Test delivery sent — the result is on the row after reload." / "Removed." / "Scheduled — the first delivery follows the cron.", and errors in red (BriefSchedule.tsx:135-145, 187, 192-193)
- [ ] Ask transport failure — "The answer failed." inside the turn (EditionEvidence.tsx:129)
- [ ] Reader preference not kept — toast "Your reader could not be kept; it holds for this visit" (BriefingEdition.tsx:125)

### 7. Loads on open
- [ ] GET `/groups` — the reader options. A read (web/lib/api.ts:9851-9853; pramanyx/routers/groups.py:68-82) (BriefingEdition.tsx:78)
- [ ] GET `/exploration/{conn}/briefing/guide?schema=` — no model call. **SPENDS (warehouse, small)** when a schema is passed: `canonical_schema` runs one `INFORMATION_SCHEMA.TABLES` query (pramanyx/routers/_shared.py:589-601, 608-620). That contradicts the route's own docstring "no warehouse query" (pramanyx/routers/exploration.py:2051-2056) (web/lib/api.ts:8437-8439; BriefingEdition.tsx:82-86)
- [ ] GET `/exploration/{conn}/briefing/edition?preset=&reader=&schema=&workspace_id=` — never composes and spends no model call (pramanyx/routers/exploration.py:2184-2217). **SPENDS (warehouse)**: `resolve_for` → `data_edge` runs one statement per table behind each approved metric's date column, cached 10 minutes in-process and NEVER cached for a live connection (pramanyx/briefing/ranges.py:1478-1520, 845-899, esp. 860-866). It also runs the `canonical_schema` information-schema query (pramanyx/routers/exploration.py:2121-2131). It runs again on every range or reader change (web/lib/api.ts:8378-8384; BriefingEdition.tsx:89-107)
- [ ] Repeating GET `/exploration/{conn}/briefing/edition` every 30 s while any deep analysis the edition started is still running. It **SPENDS (warehouse)** each time, as above (BriefingEdition.tsx:109-120)
- [ ] GET `/objects/catalog?connection_id=&schema_name=` — only when a table block links a key column. A read (web/lib/objects.ts:323-324; pramanyx/routers/objects.py:351-360; EditionBlocks.tsx:475-482)
- [ ] GET `/api/chat/{session}/stream` — the ask box's resume probe on mount, which answers 204 for its new session (web/lib/usePramanyxChat.ts:113-118)
- [ ] Only when Schedule is opened: GET `/briefing/subscriptions?conn_id=` and GET `/actions/triggers`. Both reads (BriefSchedule.tsx:69-81)
- [ ] The owner's note "opening the Briefing can spend model calls" is no longer true of the page rendered today: model spend happens only on `Draft the guide`, `Write…` / `Write it again`, `Redraft`, `Add the reader` (words only), and the ask. It was true of the dormant `BriefingPanel` (see the appendix).

Top rows today: (1) the context bar above (Connection · Schema · Maturity); (2) the masthead row — "The Briefing" + covers on the left, and on the right Range (Week · Month · Year · Custom + date inputs + Show), `Schedule`, and `Sources & guide` (when the panel is hidden); (3) the "Reading as" reader segmented; then the dateline line(s). The side panel has its own header row: Sources · Guide segmented + `Hide`.

---

## Now

Entry: `NowPanel` (web/components/now/NowPanel.tsx:137), rendered at web/app/page.tsx:1945 inside an ErrorBoundary ("The Now page hit an error."), keyed by workspace. Reached by the rail's Home ▸ Now (web/lib/navDestinations.ts:46), `?tab=now`.

### 1. Controls
- [ ] Waiting row title (a decision or an inquiry) — opens the record in the side drawer (web/components/now/NowPanel.tsx:393-395, :475, :484)
- [ ] "Open the decision" — goes to the Record's decision page (web/components/now/NowPanel.tsx:477)
- [ ] "Open the inquiry" — goes to the Record's inquiry page (web/components/now/NowPanel.tsx:486)
- [ ] "Answer" / "Mark it" (a send waiting on an owner's answer or a declarer's verdict) — opens Agent Ops ▸ Departures with `?departure=<id>` (web/components/now/NowPanel.tsx:496; web/app/page.tsx:1772-1780)
- [ ] "Review and decide" / "Close" (a proposed action from the kinetic inbox) — opens the proposal card in place (web/components/now/NowPanel.tsx:515-516)
- [ ] Proposal card inside the row: fill-in choices (e.g. "#channel"), "Accept", "Open in editor", "Reject", "Open in inbox" — **WRITES** on Accept/Reject (web/components/now/NowPanel.tsx:521-525; web/components/ProposalCard.tsx:427, :564-582)
- [ ] "Resolve" (any other approval: paused run, automation approval, agent alert, broken automation) — opens Agent Ops ▸ Attention (web/components/now/NowPanel.tsx:517; web/app/page.tsx Now doors)
- [ ] "Not now" on every waiting row — opens the set-aside form (web/components/now/NowPanel.tsx:444)
- [ ] Set-aside form: date ("Not until", from tomorrow), "Why — what it waits for", "Set aside" (needs both), "Cancel" — **WRITES** `POST /record/set-aside` (web/components/now/NowPanel.tsx:342-375)
- [ ] Set-aside fold "Show" / "Hide" — lists what is set aside (web/components/now/NowPanel.tsx:537)
- [ ] "Restore" on a set-aside row — puts it back on the list — **WRITES** `POST /record/set-aside/restore` (web/components/now/NowPanel.tsx:542, :457-460)
- [ ] Running now "Open in Agent Ops" — opens Agent Ops (web/components/now/NowPanel.tsx:233-235)
- [ ] Slots per place "Set slots" → number input + "Save" / "Cancel" — sets how many sends a week a place takes (0 holds everything) — **WRITES** `POST /attention/slots` (web/components/now/NowPanel.tsx:595-605)
- [ ] The Briefing card "Read" (per connection) — selects that connection and opens the Briefing (web/components/now/NowPanel.tsx:896)
- [ ] The Briefing card "Open the Briefing" (none kept yet) (web/components/now/NowPanel.tsx:875)
- [ ] Sent this week header "Every departure" — opens Agent Ops ▸ Departures (web/components/now/NowPanel.tsx:263)
- [ ] Send group name (toggle, chevron) — expands each send of the fold (web/components/now/NowPanel.tsx:709-714)
- [ ] Send group "Receipt" — opens the latest send's departure receipt (web/components/now/NowPanel.tsx:726-727)
- [ ] Expanded send "Open its receipt" (per send) (web/components/now/NowPanel.tsx:742)
- [ ] Since you were here header "All corrections" — opens the Record's Corrections (web/components/now/NowPanel.tsx:274)
- [ ] Since you were here "Details" toggle — lists up to 8 corrections (web/components/now/NowPanel.tsx:834-837)
- [ ] Correction detail line (when it is a claim or a decision) — opens it in the side drawer (web/components/now/NowPanel.tsx:846)
- [ ] Held this week "Open" (per held send) — opens its departure (web/components/now/NowPanel.tsx:647)
- [ ] Every "Retry" on a card whose read failed (web/components/record/kit.tsx:62; web/components/ui/states.tsx:84-100)
- [ ] First run "Start from Home" / "Write a mission" (web/components/now/NowPanel.tsx:922-923)

### 2. Dialogs, drawers, popovers, panels
- [ ] Record side drawer ("<Kind>, opened beside the page") — a claim, decision, inquiry or mission read-only, with "Open full page" and "Esc closes it. To change anything, open the full page."; Close (×) button (web/components/record/Inspector.tsx:47-90; web/components/record/beside.tsx:15-35)
- [ ] Inline set-aside form under a row (web/components/now/NowPanel.tsx:342-375)
- [ ] Inline proposal card under a row (web/components/now/NowPanel.tsx:521-526)
- [ ] Inline slots editor on a place row (web/components/now/NowPanel.tsx:595-602)
- [ ] Expanded send fold and corrections Details (web/components/now/NowPanel.tsx:729-746, :838-858)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Figure "Sent this week" — count since the week start; sub "U of S slots used" / "no place has slots yet"; amber "a floor" chip when the 200-row read is all this week's; amber "this API serves no departures ledger" (web/components/now/NowPanel.tsx:191-198)
- [ ] Figure "Waiting on you" (amber when > 0) — sub "1 review · 2 approvals …" or "nothing is due", "· N set aside" (web/components/now/NowPanel.tsx:199-203)
- [ ] Figure "Held this week" — sub "lost a slot to something stronger" / "nothing lost a slot" (web/components/now/NowPanel.tsx:204-207)
- [ ] Figure "Corrected" — sub "since your last visit, <day>" / "in the last seven days" (web/components/now/NowPanel.tsx:208-210)
- [ ] Any figure whose read failed: amber chip "<what> could not be read"; in flight: "reading…" (web/components/now/NowPanel.tsx:131-135)
- [ ] Needs you header "N items · oldest first" (web/components/now/NowPanel.tsx:213)
- [ ] Waiting row meta: "decision · review <day> · <distance> · by <who>", "inquiry · check date <d> · was waiting for <x>", "an owner's answer is needed / its declarer marks it right or wrong · <place>", "<why it waits> · <connection> · since <when>" (web/components/now/NowPanel.tsx:476, :485, :495, :506-511)
- [ ] Amber "back on its day" / "back early: <why>" chip on a row that returned from set-aside (web/components/now/NowPanel.tsx:450-454)
- [ ] Set-aside fold line "N items set aside · the next back <day>" and each row "by <who> until <day> · <distance> · <why>" (web/components/now/NowPanel.tsx:533-541)
- [ ] Running now — "N runs", title, "<agent> · <connection> · started <x> ago" (web/components/now/NowPanel.tsx:221-238)
- [ ] Slots this week — per place a bar, "U of S", "· N held" (amber when full); label right "since <day>" (web/components/now/NowPanel.tsx:244-249, :585-594)
- [ ] The Briefing — per connection headline, "<connection> · as of <day>", or "<covers> · data ended <day>" for data that ended; "N connections have no Briefing kept yet" (web/components/now/NowPanel.tsx:881-903)
- [ ] Sent this week — per fold: source name, "→ <place>" or chip "no place · used no slot", "· bears on <mission>", "· ranked on <terms> — score x", "· latest <day> <time>", "×N"; "newest first" (web/components/now/NowPanel.tsx:699-725)
- [ ] Since you were here — per correction kind: label, up to 4 metric chips "+N", "latest <day>", count; "N more were re-issued with the same words"; "a floor · the read held its newest 60" (web/components/now/NowPanel.tsx:812-832)
- [ ] Correction detail "<metric>: <now>" / "was: <before> · <when>"; "+N more in All corrections" (web/components/now/NowPanel.tsx:840-856)
- [ ] Held this week — first line of each held send, "<why> · ranked on … — score x · from <who>" (web/components/now/NowPanel.tsx:638-646)
- [ ] "Recorded as <actor>" in the set-aside form (web/components/now/NowPanel.tsx:366)

### 4. Keyboard shortcuts
- [ ] Esc closes the record drawer (web/components/record/Inspector.tsx:61)

### 5. URL params / deep links read or written
- [ ] `?tab=now` and `?conn=` (shell) (web/app/page.tsx:1244-1268)
- [ ] Writes `?departure=<id>` when a row opens Agent Ops ▸ Departures (web/app/page.tsx:1772-1777)
- [ ] localStorage `pramanyx_now_last_seen` — read on arrival, written when the page is left (web/components/now/NowPanel.tsx:43, :161-167)
- [ ] The drawer's open record is not in the URL; it closes when the page changes (web/components/record/Inspector.tsx:56-58)

### 6. Empty / error / loading / withheld states that say something
- [ ] First run: "Nothing has been sent, held or asked yet." / "It fills once data is connected and a mission is written." (web/components/now/NowPanel.tsx:912-927)
- [ ] "Nothing waits on you." / "Nothing else waits on you." with the tooltip "Checked: review dates that have come, inquiries due, sends waiting on an answer, and open approvals" (web/components/now/NowPanel.tsx:466-470)
- [ ] "Nothing used a slot since <day>." (web/components/now/NowPanel.tsx:553-558)
- [ ] "This API serves no departures ledger, so what left is not known here." / "Nothing left the platform since <day>." (web/components/now/NowPanel.tsx:694-695)
- [ ] "The newest 200 departures are all this week's — earlier sends this week are not read here." (web/components/now/NowPanel.tsx:750-754)
- [ ] "Nothing you were told has been restated, refuted or missed since then." (web/components/now/NowPanel.tsx:802-808)
- [ ] "Nothing lost a slot this week." (web/components/now/NowPanel.tsx:629-634)
- [ ] "No Briefing kept yet for any of the N connections." (web/components/now/NowPanel.tsx:869-877)
- [ ] Every card: "Loading <what>…" and "Could not read <what> — <error>. Retry" (web/components/record/kit.tsx:59-65; web/components/ui/states.tsx:72, :84-100)
- [ ] Inline errors on set-aside, slots ("Slots are a whole number, 0 or more."), restore (web/components/now/NowPanel.tsx:372, :573, :607, :465)

### 7. Loads on open
- [ ] `GET /departures?limit=200`, `GET /attention/held`, then `GET /attention/budget?addressee=` once per place (web/components/now/NowPanel.tsx:83-92)
- [ ] `GET /record/decisions?due=true`, `GET /record/inquiries?due=true`, `GET /departures?awaiting=true&limit=50`, **`GET /control-room/needs-human?limit=50` — WRITES: sweeps lapsed kinetic-inbox proposals (`expire_stale()`) before reading** (web/components/now/NowPanel.tsx:101-106; pramanyx/routers/control_room.py:432-470)
- [ ] `GET /record/set-aside` (web/components/now/NowPanel.tsx:145; pramanyx/routers/record.py:846-853)
- [ ] `GET /record/corrections?limit=60` (web/components/now/NowPanel.tsx:146; pramanyx/routers/record.py:897-908)
- [ ] `GET /briefing/organisation` — each connection's latest kept Briefing; a read, no narrative written (web/components/now/NowPanel.tsx:108-112; pramanyx/routers/briefs.py:84-90)
- [ ] `GET /jobs?state=active`, re-read on every `job.state` kernel event (web/components/now/NowPanel.tsx:151-154)
- [ ] `GET /record/missions?state=active` (names a send's mission) (web/components/now/NowPanel.tsx:157)
- [ ] Who-am-I read for "Recorded as" (web/components/record/kit.tsx:81-84)
- [ ] When the drawer opens: `GET /record/claims/{id}` / `/record/decisions/{id}` / `/record/inquiries/{id}` / `/record/missions/{id}` (web/components/record/Inspector.tsx:99, :151, :207)

Top rows today: no title or toolbar of its own. The shell's PageHeader breadcrumb "Home › Now" sits above (web/app/page.tsx:1926, working tree). The first row is the four figures. Navigation links sit in card headers: "Every departure" (Sent this week) and "All corrections" (Since you were here).

---

## Data Canvas

> Read from code only. `web/app/page.tsx` was being edited in the working tree while this was read (it grew from 2,397 to 2,432 lines: a new `PageHeader` breadcrumb, `StatusStrip` and `railTab`); page.tsx line numbers below are for the 2,432-line version. Shared chat organs (ChatPanel / ChatMessage and what they render) are listed in full under the Chat sub-page; the Canvas workspace's Chat view embeds the same ChatPanel and inherits every one of those items.

### Data Canvas — Canvas list (tab canvases)

Entry: CanvasBrowser (web/components/CanvasBrowser.tsx:175) — rendered at web/app/page.tsx:1997-2004 when `tab === "canvases"`. Reached from: the rail, Ask ▸ "Data Canvas" (web/lib/navDestinations.ts:49; it is the Ask destination's first section, so the "Ask" destination row lands here unless "Agent runs" was the last section opened, navDestinations.ts:99-101); ⌘K "Data Canvas" (web/components/CommandPalette.tsx:353,397); ⌘K "New Data Canvas" (CommandPalette.tsx:185; it only navigates to this list and does NOT open the creator); the chat toolbar's "Canvas" button (page.tsx:2062-2071); the workspace's "← Data Canvas" back button (web/components/CanvasWorkspace.tsx:64-67 → page.tsx:2014); the new breadcrumb crumb "Data Canvas" on the chat and workspace screens (page.tsx:1865-1868,1926); a `?tab=canvases` link.

#### 1. Controls
- [ ] Search box "Search Data Canvases, connections…" — filters by name, description and connection name, client-side (web/components/CanvasBrowser.tsx:392-397, 222-229)
- [ ] Clear-search "✕" — only while the box has text (web/components/CanvasBrowser.tsx:398-403)
- [ ] "+ New" (primary) — opens the CanvasCreator modal (web/components/CanvasBrowser.tsx:405-412 → web/app/page.tsx:2002)
- [ ] Filter chip "All" (web/components/CanvasBrowser.tsx:429)
- [ ] Filter chip "Created by me" — actually hides auto-generated (`is_legacy`) canvases; it is not an ownership filter (web/components/CanvasBrowser.tsx:430, 221)
- [ ] Sliders glyph tile before the chips — decorative, not clickable (web/components/CanvasBrowser.tsx:421-428)
- [ ] View toggle "Card view" / "List view" (role=button, aria-pressed) (web/components/CanvasBrowser.tsx:444-457)
- [ ] Sort button "Sort: <current> ▾" (web/components/CanvasBrowser.tsx:460-476)
- [ ] Sort item "Latest Agent run" (default: last_activity, then modified) (web/components/CanvasBrowser.tsx:233-235, 249, 484-503)
- [ ] Sort item "Last modified" (web/components/CanvasBrowser.tsx:236-238, 250)
- [ ] Sort item "Name" (web/components/CanvasBrowser.tsx:239, 251)
- [ ] Sort item "Table count" (web/components/CanvasBrowser.tsx:240-241, 252)
- [ ] Card (card view): click opens the canvas → `handleCanvasSelect` (web/components/CanvasBrowser.tsx:76-80, 554; web/app/page.tsx:1779-1790)
- [ ] Card trash "Delete Data Canvas" — hover-only (opacity 0 until the card is hovered); absent on auto-generated canvases (web/components/CanvasBrowser.tsx:110-122, 548)
- [ ] List row click opens the canvas (web/components/CanvasBrowser.tsx:586-588)
- [ ] List row trash "Delete Data Canvas" — hover-only; absent on auto-generated (web/components/CanvasBrowser.tsx:352-374, 563)
- [ ] List column headers Name · Description · Modified · Connection · Tables — not sortable (web/components/CanvasBrowser.tsx:257-351)
- [ ] Empty-state button "Create your first Data Canvas" — only with no canvases and no search text (web/components/CanvasBrowser.tsx:537-543)
- [ ] "Retry" on a failed list read (web/components/CanvasBrowser.tsx:511)
- [ ] Delete confirm: "Cancel", "Delete" / "Deleting…", backdrop click cancels (web/components/CanvasBrowser.tsx:595-630)
- [ ] Creator: close "×" and backdrop click (cancel) (web/components/CanvasCreator.tsx:183, 201-203)
- [ ] Creator: "Search" box — filters the open connection's tables only; on the connection list it filters nothing (web/components/CanvasCreator.tsx:218-223, 91-94)
- [ ] Creator: "Refresh" (icon, title "Refresh") — acts only once a connection is open; also resets search and selection (web/components/CanvasCreator.tsx:225-235, 109-114)
- [ ] Creator: breadcrumb "All connections" — back to the connection list (web/components/CanvasCreator.tsx:240-248)
- [ ] Creator: connection row (name · engine · ›) — opens that connection's tables (web/components/CanvasCreator.tsx:267-284)
- [ ] Creator: "All tables" row with checkbox ("auto-includes new tables") (web/components/CanvasCreator.tsx:294-309)
- [ ] Creator: schema row "Tick/Untick every table in <schema>" — only when the tables span >1 schema (web/components/CanvasCreator.tsx:339-360, 107)
- [ ] Creator: per-table checkbox row (dimmed while "All tables" is picked) (web/components/CanvasCreator.tsx:316-337)
- [ ] Creator: selected chips with "×" remove (first 4, then "+N more") (web/components/CanvasCreator.tsx:376-387, 422-440)
- [ ] Creator: "Cancel" (web/components/CanvasCreator.tsx:392)
- [ ] Creator: "Create" / "Creating…" — disabled until a connection and a selection; asks the model for a name, then creates and opens the canvas (web/components/CanvasCreator.tsx:393-400, 150-172; web/app/page.tsx:2419-2422)

#### 2. Dialogs, drawers, popovers, panels
- [ ] Sort dropdown — hand-rolled absolute popover; closes 120ms after blur (web/components/CanvasBrowser.tsx:477-505)
- [ ] "Delete Data Canvas" confirm modal — "Are you sure you want to delete <name>? This cannot be undone." plus a refusal line (web/components/CanvasBrowser.tsx:595-630)
- [ ] CanvasCreator modal "Connect your data" — intro copy, search, refresh, breadcrumb, connection list → table multi-select, footer chips + error + Cancel/Create (web/components/CanvasCreator.tsx:177-404; rendered at web/app/page.tsx:2416-2425)

#### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Section count "All Data Canvases (N)" (reads "Loading…" while reading) (web/components/CanvasBrowser.tsx:437-439)
- [ ] Card mark: canvas glyph (grey when auto-generated), name, type line "Data Canvas" / "Data Canvas · auto-generated" (web/components/CanvasBrowser.tsx:92-109)
- [ ] Card description (two-line clamp) or "No description." (web/components/CanvasBrowser.tsx:126-131)
- [ ] Card chip: connection name with db glyph (web/components/CanvasBrowser.tsx:135-141)
- [ ] Card chip: "All tables" (green) or "N tables" (web/components/CanvasBrowser.tsx:72-73, 142-147)
- [ ] Card freshness: "just now" / "Nm ago" / "Nh ago" / "Nd ago" / "Mon D" from updated_at (web/components/CanvasBrowser.tsx:37-48, 148-150)
- [ ] List cells: Name (+ "auto-generated"), Description or "—", Modified (same relative time), Connection chip with engine label (DuckDB / PG / 4-letter code), Tables chip (web/components/CanvasBrowser.tsx:257-351)
- [ ] Creator: engine label per connection (DuckDB / PostgreSQL / raw type) (web/components/CanvasCreator.tsx:174-175, 281)
- [ ] Creator: schema row "N tables" (web/components/CanvasCreator.tsx:359)
- [ ] Creator: "Selected:" chips "<connection> · all tables" / table names / "+N more" (web/components/CanvasCreator.tsx:376-387)

#### 4. Keyboard shortcuts
- [ ] Enter / Space on a focused card opens it (web/components/CanvasBrowser.tsx:80)
- [ ] Enter / Space on the Card/List toggle (web/components/CanvasBrowser.tsx:449)
- [ ] ⌘K / Ctrl+K opens the command palette (global; its "Data Canvas" and "New Data Canvas" entries land here), Esc closes it (web/app/page.tsx:1545-1552)
- [ ] Sort menu items are mouse-only (onMouseDown, closes on blur) — no keyboard path (web/components/CanvasBrowser.tsx:462, 487)
- [ ] List rows open on click only (no keyboard handler) (web/components/CanvasBrowser.tsx:586-588)

#### 5. URL params / deep links read or written
- [ ] `?tab=canvases` read after mount (web/app/page.tsx:1019-1024, 1116-1158) and written by the URL sync — a tab change pushes a history entry (web/app/page.tsx:1207-1272)
- [ ] `?conn=` kept in step with the selected connection (web/app/page.tsx:1260)
- [ ] `?canvas=` deleted on this tab (web/app/page.tsx:1252, 1263)
- [ ] Opening a canvas writes `?tab=canvas-workspace&canvas=<id>` and sets `?conn=` to the canvas's primary connection (web/app/page.tsx:1779-1790, 1252)
- [ ] Search, filter chip, sort and card/list view are not in the URL (state only) (web/components/CanvasBrowser.tsx:180-184)

#### 6. Empty / error / loading / withheld states that say something
- [ ] Loading: header reads "Loading…"; the list waits for the workspace rather than read every workspace's canvases (web/components/CanvasBrowser.tsx:189-191, 438); list view shows the table spinner (web/components/CanvasBrowser.tsx:583)
- [ ] Read failed: "Could not read the Data Canvases — <error>." + Retry (never shown as "No Data Canvases yet") (web/components/CanvasBrowser.tsx:195-197, 510-512; web/components/ui/states.tsx:84-98)
- [ ] Empty: "No Data Canvases yet" — "Create a Data Canvas to scope a workspace to a connection and specific tables." + CTA (web/components/CanvasBrowser.tsx:528-543); also shown when "Created by me" hides every (auto-generated) canvas
- [ ] Search miss: "No matching Data Canvases" — "Try a different search or clear the filter." (web/components/CanvasBrowser.tsx:529-533)
- [ ] Delete refused: "Not deleted — <reason>" and the confirm stays open (web/components/CanvasBrowser.tsx:212-214, 614-616)
- [ ] Creator: "No connections available." (web/components/CanvasCreator.tsx:262-265)
- [ ] Creator: "Loading tables…" (web/components/CanvasCreator.tsx:286-289)
- [ ] Creator: "No matching tables" / "No tables found" (web/components/CanvasCreator.tsx:311-314)
- [ ] Creator: create error in red in the footer ("Failed to create Data Canvas" or the server's message) (web/components/CanvasCreator.tsx:168-170, 390)

#### 7. Loads on open (each API call on mount/open, method + path; mark **WRITES** / **SPENDS (model)** / **SPENDS (warehouse)** with backend evidence file:line)
- [ ] GET /canvases?workspace_id=<ws> (web/lib/api.ts:4426-4431) — read; joins last activity from history (pramanyx/routers/canvas.py:55-78). Re-read after a delete (web/components/CanvasBrowser.tsx:211)
- [ ] (on Delete, not on open) DELETE /canvases/{id} — **WRITES**: permanently purges the canvas's cards, dashboard history and exploration and cancels its explorer jobs (pramanyx/routers/canvas.py:209-232)
- [ ] (creator, on picking a connection) GET /connections/{id}/schema/rich via useRichSchema (web/lib/schema-context.tsx:48-56) — **SPENDS (warehouse)** schema + declared-FK metadata read, server-cached (pramanyx/routers/connections.py:557-588); fallback GET /catalog/tree (web/lib/api.ts:945-953)
- [ ] (creator, on Create) POST /canvases/suggest-name — **SPENDS (warehouse)** `db.get_schema` + **SPENDS (model)** "coder" call (pramanyx/routers/canvas.py:314-361); then POST /canvases — **WRITES** the canvas and **SPENDS (model + warehouse)** by submitting the canvas "birth" kernel job (intelligence build + exploration) (pramanyx/routers/canvas.py:94-130; pramanyx/routers/_shared.py:543-573)

Top rows today: row 1 — search box (+ ✕) · "+ New"; row 2 — sliders tile · "All" · "Created by me"; row 3 (section bar) — "All Data Canvases (N)" · Card/List toggle · "Sort: … ▾". Above them the shell now draws the breadcrumb "Ask › Data Canvas" (web/app/page.tsx:1861-1863, 1926; working tree).

### Data Canvas — Canvas workspace (tab canvas-workspace)

Entry: CanvasWorkspace (web/components/CanvasWorkspace.tsx:524) — rendered at web/app/page.tsx:2007-2021 only when `tab === "canvas-workspace"` AND an `activeCanvas` object is held (otherwise the pane is blank). Reached via `handleCanvasSelect` (web/app/page.tsx:1779-1790) from a canvas card/row, the creator's onCreated (page.tsx:2419-2422) and the SQL editor's onOpenCanvas (page.tsx:2293); via `openInvestigation` (page.tsx:1621-1661) from Home (page.tsx:1936) and Agent runs (page.tsx:2142) when the run's canvas_id — or failing that its connection — matches a canvas of this workspace (a deep run opens in History, a chat restores into Chat); via a `?tab=canvas-workspace&canvas=<id>` link (page.tsx:1478-1500). No rail row lights here (the Ask destination holds only canvases and recents, navDestinations.ts:48-51); the new breadcrumb reads "Ask › Data Canvas › <canvas name>" (page.tsx:1866-1869).

#### 1. Controls
- [ ] "← Data Canvas" — back to the list, clears the open canvas (web/components/CanvasWorkspace.tsx:64-67; web/app/page.tsx:2014)
- [ ] Name — read-only, truncates, full name on hover (web/components/CanvasWorkspace.tsx:68-71)
- [ ] View tabs "Chat" · "Briefing" · "History" · "Artifacts" (aria-pressed) (web/components/CanvasWorkspace.tsx:519-522, 625-632, 589-593)
- [ ] "+" New conversation (icon only) — fresh canvas conversation, back to Chat (web/components/CanvasWorkspace.tsx:633-635, 605-608)
- [ ] "Tools ▾" menu (web/components/CanvasWorkspace.tsx:636; web/components/catalog/CatalogTools.tsx:79-102)
- [ ] Tools ▸ "Configure…" — "The tables it reads, its instructions and metrics, and its documents" (web/components/CanvasWorkspace.tsx:611-612)
- [ ] Tools ▸ "Settings…" — "Its name and description, pinned documents and versions" (web/components/CanvasWorkspace.tsx:613-614)
- [ ] Chat view: the full ChatPanel (every control under the Chat sub-page below: composer, Quick/Agent, agent picker, attach, drag-drop, suggestions, answer actions, drawers), with every turn filed under this canvas (`canvas_id` in the body) (web/components/CanvasWorkspace.tsx:656-669; web/components/ChatPanel.tsx:616)
- [ ] Chat view landing replaces the generic greeting: "What do you want to know about <table | these N tables | connection>?" with two static (non-clickable) chips "Quick · one query" / "Agent · a deep analysis" (web/components/CanvasWorkspace.tsx:140-157, 667; web/components/ChatPanel.tsx:1130-1137)
- [ ] Briefing view: embedded BriefingEdition, mounted on first open and then kept — range control, "Reading as" reader segmented (saves a preference), "Sources & guide" / "Hide" side panel, "Draft the guide", "Write it" / "Write it again", per-card cite / drill / drill back / decide / give / point-the-ask, EditionAsk; "Schedule" is hidden on a canvas — full detail belongs to the Briefing page's inventory (web/components/CanvasWorkspace.tsx:673-681; web/components/brief/BriefingEdition.tsx:221-345)
- [ ] Briefing → deep analysis: opens a fresh canvas conversation that asks it in Agent mode (web/components/CanvasWorkspace.tsx:596-603)
- [ ] History row click — opens the newest run: a deep analysis as a report in this view, a chat restored into Chat (web/components/CanvasWorkspace.tsx:245, 574-587)
- [ ] History "Details ▾/▴" — lists each run of a question asked more than once (web/components/CanvasWorkspace.tsx:255-258)
- [ ] History row trash "Remove from history" — hover-only on single-run rows; permanent, no confirm (web/components/CanvasWorkspace.tsx:45, 259-264, 183-196)
- [ ] History expanded run: "Open" (web/components/CanvasWorkspace.tsx:277)
- [ ] History expanded run: trash "Remove from history" (always visible there; no confirm) (web/components/CanvasWorkspace.tsx:278-281)
- [ ] History "Retry" on a failed read (web/components/CanvasWorkspace.tsx:221)
- [ ] Opened run (HistoryDetailPanel): "← Back" to the history list, "Report" / "Evidence" tabs, "Keep on a dashboard", "Export ▾", "Thought process", report actions, evidence feedback, follow-up composer (Quick/Agentic + Send) that asks in a fresh canvas conversation — items as in the Chat sub-page's HistoryDetailPanel (web/components/CanvasWorkspace.tsx:688-708; web/components/HistoryDetailPanel.tsx:192-200)
- [ ] Artifacts row trash "Remove artifact" — hover-only, no confirm (web/components/CanvasWorkspace.tsx:345-348, 311-319)
- [ ] Artifacts row — title (hover shows description/question), kind chip, date; there is no open action, and nothing in the web app creates a canvas artifact (the POST route is unused) (web/components/CanvasWorkspace.tsx:333-350; pramanyx/routers/canvas.py:378-385)
- [ ] Artifacts "Retry" on a failed read (web/components/CanvasWorkspace.tsx:331)
- [ ] Settings: "Name" input (web/components/CanvasWorkspace.tsx:469-472)
- [ ] Settings: "Description" textarea (web/components/CanvasWorkspace.tsx:473-476)
- [ ] Settings: "Cancel" / "Save" ("Saving…"; disabled with an empty name); backdrop click closes (web/components/CanvasWorkspace.tsx:462, 480-485)
- [ ] Settings: per pinned document "Unpin" — saves at once (web/components/CanvasWorkspace.tsx:405-418)
- [ ] Settings: "Pin a document…" select — saves at once; only when unpinned documents exist (web/components/CanvasWorkspace.tsx:420-428)
- [ ] Settings ▸ LifecyclePanel (only once the canvas has a revision): per version "Publish", "Revert to", "Freeze"; "Unfreeze" on the pinned banner (web/components/LifecyclePanel.tsx:101-150)
- [ ] Configure: close "×" and backdrop click (web/components/ConfigurePanel.tsx:580-584, 598-600)
- [ ] Configure tabs "About" · "Data" · "Instructions" · "Docs" (web/components/ConfigurePanel.tsx:570-575, 604)
- [ ] Configure ▸ About: "Data Canvas name" input, "Description" textarea, "Save" ("Saved ✓") — a second door to what Settings edits (web/components/ConfigurePanel.tsx:117-148)
- [ ] Configure ▸ Data: "Include all" and "Clear" — save at once (web/components/ConfigurePanel.tsx:350-365)
- [ ] Configure ▸ Data: "Filter tables…" (web/components/ConfigurePanel.tsx:367-371)
- [ ] Configure ▸ Data: per-table membership checkbox "Add to canvas" / "Remove from canvas" — saves at once (web/components/ConfigurePanel.tsx:393-410)
- [ ] Configure ▸ Data: table name or "›" opens the table detail (web/components/ConfigurePanel.tsx:412-422)
- [ ] Configure ▸ Data ▸ table: back chevron, "Overview" / "Sample Data" tabs; Sample Data is a SqlResultTable (sort, column ▾ filters, Copy, CSV — see Chat) (web/components/ConfigurePanel.tsx:198-258)
- [ ] Configure ▸ Instructions: "Text" / "Metrics" sub-tabs (web/components/ConfigurePanel.tsx:516-520)
- [ ] Configure ▸ Instructions ▸ Text: "This Canvas" textarea + "Save"; "Whole connection" textarea + "Save" (web/components/ConfigurePanel.tsx:523-540)
- [ ] Configure ▸ Instructions ▸ Metrics: the Semantic Layer's MetricsPanel, mounted with no connection (so it lists only the stored registry; its Validate/Check freshness tools hide) — its controls belong to the Semantic Layer inventory (web/components/ConfigurePanel.tsx:543-547; web/components/MetricsPanel.tsx:649, 781, 1152-1154)
- [ ] Configure ▸ Docs: "Open Documents" → Data ▸ Documents (web/components/ConfigurePanel.tsx:617-633; web/app/page.tsx:2013)

#### 2. Dialogs, drawers, popovers, panels (each one and what is inside, one line each)
- [ ] Tools ▾ dropdown (Radix) — Configure…, Settings… (web/components/catalog/CatalogTools.tsx:83-100)
- [ ] Settings popover under the header — Name, Description, Cancel/Save, Pinned documents (Unpin, Pin a document…), History & lifecycle (web/components/CanvasWorkspace.tsx:435-499, 638-644)
- [ ] Configure slide-over (400px, right, below the top bars) — About / Data / Instructions / Docs (web/components/ConfigurePanel.tsx:564-639; web/components/CanvasWorkspace.tsx:724-732)
- [ ] Table detail inside Configure ▸ Data — columns with types and FK marks; 100 sample rows (web/components/ConfigurePanel.tsx:167-261)
- [ ] HistoryDetailPanel inside the History view — Report / Evidence, source drawer, follow-up composer (web/components/CanvasWorkspace.tsx:688-708)
- [ ] Briefing "Sources & guide" side panel (380px) (web/components/brief/BriefingEdition.tsx:346-351)
- [ ] Every chat drawer/popover (Source panel, Why this number, Edit visualization, column ▾ menu, Export ▾, Keep on a dashboard, debug log) — as in Chat
- [ ] Toast "The linked canvas isn't in this workspace" (web/app/page.tsx:1494-1495)

#### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Header description, one line, the first thing to give way (web/components/CanvasWorkspace.tsx:72-77)
- [ ] Chip: connection name (hover "<name> · <engine>") or amber "connection gone" (web/components/CanvasWorkspace.tsx:111-119)
- [ ] Chip: scope "All tables" / "N tables" (hover lists up to 12 tables "and N more") (web/components/CanvasWorkspace.tsx:120; web/lib/canvasList.ts:42-53)
- [ ] Chip: "N documents pinned", "· not checked", or amber "N documents pinned · M deleted" (web/components/CanvasWorkspace.tsx:121-131)
- [ ] Chip: "auto-generated" (web/components/CanvasWorkspace.tsx:132)
- [ ] History meta: "N runs" or "the latest 30 runs" · "N questions" (web/components/CanvasWorkspace.tsx:199-204)
- [ ] History scope chip "this canvas · finished runs" (hover: other canvases' runs and unfinished deep analyses are under Agent runs) (web/components/CanvasWorkspace.tsx:205-210)
- [ ] History row: kind chip "Chat" / "Deep analysis", "×N" asked-count, state chip "failed" / "timed out" / "running", "today / yesterday / N days ago / N months ago" (full timestamp on hover) (web/components/CanvasWorkspace.tsx:247-254; web/lib/canvasList.ts:20-29, 89, 106-112)
- [ ] History expanded run: timestamp + state chip (web/components/CanvasWorkspace.tsx:272-275)
- [ ] Artifacts card count; row kind chip; date "3 Oct" (web/components/CanvasWorkspace.tsx:323, 340-344)
- [ ] Settings: "Pinned documents" count; "deleted" chip on a missing document (shown by id) (web/components/CanvasWorkspace.tsx:399, 409-412)
- [ ] Lifecycle: "Pinned to vN" / "Pinned to vN — <reason or drifted>"; per version "vN · published | <state> · <timestamp>" (web/components/LifecyclePanel.tsx:107-130)
- [ ] Configure header "Configure · <canvas name>" (web/components/ConfigurePanel.tsx:593-597)
- [ ] Configure ▸ About scope table: Connection, Type, Schema, Tables ("All tables" / "N selected") (web/components/ConfigurePanel.tsx:109-159)
- [ ] Configure ▸ Data: "All tables included in this canvas." / "N of M tables included." · "saving…"; columns Name · Cols · Rows (compact) (web/components/ConfigurePanel.tsx:343-347, 376-419)
- [ ] Table detail: "N cols · N rows"; Column / Type / FK with type glyphs (web/components/ConfigurePanel.tsx:205-241)
- [ ] Briefing: period, dateline "What changed in …, written for …, against …", lag-moved warning, canvas scope note ("This canvas reads …, so its edition is its own …" / "…the dataset's own edition"), "written … · N model steps · N queries …" (web/components/brief/BriefingEdition.tsx:221-262, 336)

#### 4. Keyboard shortcuts
- [ ] Composer: Enter sends, Shift+Enter newline; ⌘/Ctrl+Shift+L debug log — as in Chat (web/components/ChatPanel.tsx:167-169, 703-712)
- [ ] HistoryDetailPanel follow-up: Enter sends (web/components/HistoryDetailPanel.tsx:377-379)
- [ ] Tools ▾: Radix menu keyboard navigation (web/components/catalog/CatalogTools.tsx:83)
- [ ] No shortcut for the view tabs, "+", Configure or Settings — none found

#### 5. URL params / deep links read or written
- [ ] `?tab=canvas-workspace&canvas=<id>` read after mount (web/app/page.tsx:1122, 1151-1168); the URL sync holds while the roster is read (web/app/page.tsx:1213-1227); resolved against GET /canvases for the selected workspace only (web/app/page.tsx:1478-1500)
- [ ] `?canvas=<id>` written only while on this tab; entering the tab pushes a history entry (web/app/page.tsx:1252, 1263, 1270)
- [ ] `?conn=` set to the canvas's primary connection on open (web/app/page.tsx:1783-1784, 1260)
- [ ] `?chat=<session>` written by the canvas ChatPanel once its conversation has messages (web/components/ChatPanel.tsx:921-928). On a reload the id is claimed once per page load by whichever ChatPanel mounts first (module-level latch, web/components/ChatPanel.tsx:498-505, 585-593); the shell's always-mounted chat panel is a static import while CanvasWorkspace is a dynamic one (web/app/page.tsx:82, 2123), so a reloaded canvas conversation is likely restored into the hidden chat tab rather than the canvas (inferred from code, not run)
- [ ] Not in the URL: the view (Chat/Briefing/History/Artifacts), the opened run, Configure/Settings (web/components/CanvasWorkspace.tsx:528-541); the Briefing reader is a stored preference, not a URL param (web/components/brief/BriefingEdition.tsx:131-135)

#### 6. Empty / error / loading / withheld states that say something
- [ ] Blank pane when the tab is `canvas-workspace` with no canvas held (e.g. `?tab=canvas-workspace` without `?canvas=`) — nothing is said (web/app/page.tsx:2007)
- [ ] Unknown or foreign canvas link: toast "The linked canvas isn't in this workspace" — "It may have been deleted, or it belongs to another workspace." (web/app/page.tsx:1494-1495)
- [ ] Error boundary "The Canvas workspace hit an error." (web/app/page.tsx:2008)
- [ ] History: "Loading the history…"; "Could not read this canvas's history — <error>." + Retry; "Nothing asked on this canvas yet."; "Could not remove that run — it is still here." (web/components/CanvasWorkspace.tsx:215-222)
- [ ] Artifacts: "Loading the artifacts…"; "Could not read this canvas's artifacts — <error>." + Retry; "Nothing saved on this canvas yet."; "Could not remove that artifact — it is still here." (web/components/CanvasWorkspace.tsx:325-332)
- [ ] "connection gone" chip — "This workspace no longer has the connection this canvas reads" (web/components/CanvasWorkspace.tsx:112-114)
- [ ] Docs chip "· not checked" — "Could not check that they still exist"; deleted docs — "A pinned document was deleted — unpin it in Settings" (web/components/CanvasWorkspace.tsx:121-130)
- [ ] Settings: "Not saved — <reason>" (web/components/CanvasWorkspace.tsx:478); "None pinned · a pinned document is always in reach here; the rest stay searchable." (web/components/CanvasWorkspace.tsx:401-403); "No documents uploaded yet — add them in Documents." (web/components/CanvasWorkspace.tsx:430); a failed pin/unpin is silent (web/components/CanvasWorkspace.tsx:387-389)
- [ ] Lifecycle: error line in red; renders nothing until a revision exists (web/components/LifecyclePanel.tsx:101, 153)
- [ ] Briefing: "Loading the Briefing…" (web/components/CanvasWorkspace.tsx:39-40); "Reading the edition…", "This dataset has no Briefing guide yet", "Not written yet for <reader>" with what the canvas measures and leaves out, withheld lines "Held back…", "Left out…", "Not read…", "This edition was drawn by code…" (web/components/brief/BriefingEdition.tsx:264-326)
- [ ] Configure ▸ Data: "No tables match "<filter>"." / "No tables available in this connection."; a failed scope save is silent (web/components/ConfigurePanel.tsx:309, 426-431)
- [ ] Table detail: "Loading the sample rows…", "No data available."; a failed sample read is silent (web/components/ConfigurePanel.tsx:188, 248-256)
- [ ] Instructions: textarea reads "Loading…" until loaded; a failed load enables an empty box silently; About's Save failure is silent (web/components/ConfigurePanel.tsx:96-107, 457-462, 486)
- [ ] Docs tab: "Documents are shared across every canvas and connection — a policy uploaded once is retrievable everywhere. …" (web/components/ConfigurePanel.tsx:619-623)
- [ ] Every chat state under Chat applies inside the Chat view

#### 7. Loads on open (each API call on mount/open, method + path; mark **WRITES** / **SPENDS (model)** / **SPENDS (warehouse)** with backend evidence file:line)
- [ ] GET /canvases/{id}/documents — only when documents are pinned (web/components/CanvasWorkspace.tsx:88-101; web/lib/api.ts:4784-4787) — read (pramanyx/routers/canvas.py:181-206)
- [ ] GET /canvases/{id}/history?limit=30 — the History view is always mounted, so this reads on every open (web/components/CanvasWorkspace.tsx:175-181; web/lib/api.ts:4825-4830) — read (pramanyx/routers/canvas.py:245-259)
- [ ] GET /canvases/{id}/artifacts — always mounted, reads on every open even if the tab is never shown (web/components/CanvasWorkspace.tsx:303-309; web/lib/api.ts:4811-4815) — read (pramanyx/routers/canvas.py:373-376)
- [ ] The canvas ChatPanel's mount (a second ChatPanel beside the shell's always-mounted one): GET /api/chat/{session}/stream, GET /agents/custom, GET /connections, POST /connections/{conn}/prewarm — **WRITES + SPENDS (warehouse)**, GET /suggestions?connection_id= — **SPENDS (warehouse)**, **SPENDS (model)** on a cache miss, **WRITES** the cache — evidence as in Chat §7 (web/components/ChatPanel.tsx:668, 675-679, 755-781)
- [ ] Opened from a past chat: GET /chat-sessions/{id}/messages, retried up to 8 more times 1.5s apart (web/components/ChatPanel.tsx:784-819) — read (pramanyx/routers/investigations.py:6820-6828)
- [ ] Opened from a past run: GET /investigations/{id} (web/components/HistoryDetailPanel.tsx:96-105) — read (pramanyx/routers/investigations.py:6407-6414); a legacy/direct report also GET /investigations/{id}/outcomes (web/components/ReportView.tsx:513-520)
- [ ] Briefing view, first open: GET /groups, GET /exploration/{conn}/briefing/guide — read, "no model call, no warehouse query" (pramanyx/routers/exploration.py:2051-2056), GET /exploration/{conn}/briefing/edition?…&canvas_id= — read, "A READ never builds" (pramanyx/routers/exploration.py:2184-2190); re-read every 30s while an edition's deep analysis runs (web/components/brief/BriefingEdition.tsx:76-125)
- [ ] Settings open: GET /canvases/{id}/documents, GET /documents, GET /lifecycle/canvas/history, GET /lifecycle/canvas/freeze (web/components/CanvasWorkspace.tsx:377-380; web/components/LifecyclePanel.tsx:60-73) — reads
- [ ] Configure ▸ Data: the shell's SchemaProvider schema = GET /connections/{selectedConn}/schema/rich — **SPENDS (warehouse)** metadata read, server-cached (web/components/ConfigurePanel.tsx:277; web/app/page.tsx:1924; pramanyx/routers/connections.py:557-588)
- [ ] Configure ▸ Data ▸ table ▸ Sample Data: GET /connections/{conn}/tables/{t}/sample?limit=100 — **SPENDS (warehouse)** `SELECT * … LIMIT 100` (web/components/ConfigurePanel.tsx:182-190; pramanyx/routers/connections.py:696-715)
- [ ] Configure ▸ Instructions: GET /canvases/{id}/instructions, GET /connections/{conn}/instructions — reads (web/components/ConfigurePanel.tsx:509-512; pramanyx/routers/canvas.py:294-297)
- [ ] Configure ▸ Instructions ▸ Metrics: GET /metrics (no connection) (web/components/MetricsPanel.tsx:777)
- [ ] (on action) PUT /canvases/{id} name/description/tables/doc_ids, PUT instructions, DELETE /investigations/{id} (purge), DELETE /canvases/{id}/artifacts/{a}, POST/DELETE /lifecycle/canvas/{publish|revert|freeze} — **WRITES** (pramanyx/routers/canvas.py:142-155, 300-304, 387-391; pramanyx/routers/investigations.py:6632-6642); "Draft the guide" — **SPENDS (model)**, "Write it" — **SPENDS (model + warehouse)** (pramanyx/routers/exploration.py:2059-2066; web/components/brief/BriefingEdition.tsx:296-301)

Top rows today: the shell breadcrumb "Ask › Data Canvas › <name>" (web/app/page.tsx:1866-1869, 1926; working tree), then ONE header line (CanvasHead, web/components/CanvasWorkspace.tsx:56-83, 620-644): "← Data Canvas" · name · description · chips (connection / scope / documents / auto-generated) · [Chat | Briefing | History | Artifacts] · "+" · "Tools ▾", with the Settings popover anchored to it. Inside views: an opened run adds "← Back · Report | Evidence" (web/components/HistoryDetailPanel.tsx:191-204); the Briefing adds its own title row ("The Briefing" · period · range · Sources & guide) and a "Reading as" row (web/components/brief/BriefingEdition.tsx:221-235).

### Data Canvas — Chat (tab chat)

Entry: the always-mounted chat block (web/app/page.tsx:2023-2137; `display:none` unless `tab === "chat"`) holding ChatPanel (web/components/ChatPanel.tsx:578), ThreadsRail and HistoryDetailPanel. Reached by `goToChat` (web/app/page.tsx:1588-1600) from Home (page.tsx:1934), the Briefing/Intelligence "investigate" (page.tsx:2155), the Record's Ask (page.tsx:1987), Spreadsheets (page.tsx:2250), Health (page.tsx:2266), the Catalog's "Tell me about the <table> table" and ask (page.tsx:2309-2318), ⌘K (page.tsx:2380, 2388 — the palette's past-run items re-ask the question rather than open the run, web/components/CommandPalette.tsx:466-474); `goToAgentChat` from Agent Ops, which clears the canvas (page.tsx:1611-1616, 2224); `openInvestigation`'s fallback when no canvas matches (page.tsx:1651-1660); `openRun` from the Record (page.tsx:1755-1760, 1986); the Recommendation Inbox (page.tsx:2258); the in-app navigate event with `params.run` (page.tsx:1193-1197); a History popup row (page.tsx:2364-2371); `?tab=chat`. No rail row lights (no destination names "chat"); the new breadcrumb reads "Ask › Data Canvas › Conversation" (page.tsx:1865).

#### 1. Controls
Page toolbar
- [ ] Canvas chip "<canvas name>" — only when a canvas is active; not clickable (web/app/page.tsx:2027-2038)
- [ ] "N tables" tag — only when that canvas scopes tables (web/app/page.tsx:2039-2043)
- [ ] "×" Clear canvas (icon only, title "Clear canvas") — un-scopes the chat from the canvas (web/app/page.tsx:2044-2054)
- [ ] Connection name tag — when no canvas is active (web/app/page.tsx:2056-2060)
- [ ] "Canvas" — "Pick a Data Canvas" → the canvas list; only when no canvas is active (web/app/page.tsx:2062-2071)
- [ ] "+ New" — fresh conversation (drops the restored session/run and any seed) (web/app/page.tsx:2072-2074)
- [ ] "Conversations" toggle (pressed style) — shows the ThreadsRail; draws nothing when no connection is chosen or no thread exists (web/app/page.tsx:2075-2079, 2103; web/components/ThreadsRail.tsx:109-111)
- [ ] "History" toggle — opens the History popup (web/app/page.tsx:2080-2082, 2348-2375)

Conversations rail (ThreadsRail)
- [ ] "New" (web/components/ThreadsRail.tsx:124)
- [ ] "Filter conversations" — only with more than 6 threads (web/components/ThreadsRail.tsx:127-136)
- [ ] Thread row — restores that conversation (web/components/ThreadsRail.tsx:180-200; web/app/page.tsx:2107-2111)
- [ ] "✎" Rename (hover-only) → inline "Conversation name" input; Enter or blur saves, Esc cancels, empty restores the first question (web/components/ThreadsRail.tsx:149-168, 209-217)
- [ ] Trash Delete (hover-only) → in-place "Delete?" "Cancel" / "Delete"; deleting the open thread starts a new one (web/components/ThreadsRail.tsx:90-101, 218-256)

History popup (HistoryPanel)
- [ ] Close "×"; backdrop click closes (web/app/page.tsx:2350, 2360-2362)
- [ ] "Clear all" — browser confirm, then deletes every Agent run and chat with evidence and index (web/components/HistoryPanel.tsx:74-86, 111-120)
- [ ] "Search…" — filters by question and headline (web/components/HistoryPanel.tsx:124-129, 97-103)
- [ ] Row — opens the run (report) or the chat (restored) in this tab (web/components/HistoryPanel.tsx:142-143; web/app/page.tsx:2366-2371)
- [ ] "ask why" — failed runs only; asks Spotlight why it failed (web/components/HistoryPanel.tsx:214-223)
- [ ] Row trash "Delete" — hover-only, NO confirm, permanent (web/components/HistoryPanel.tsx:61-72, 225-234)

Composer (InputBox)
- [ ] Textarea "Ask anything about your data…" (empty state) / "Ask your question…" (in a conversation); never disabled — sending while a turn streams interrupts it (web/components/ChatPanel.tsx:162-179, 984-1002)
- [ ] "How to answer" segmented "Quick" / "Agent" (Agent is the default) (web/components/ChatPanel.tsx:184-188, 664)
- [ ] Agent picker select "No agent" / each enabled saved agent — only when the roster is non-empty (web/components/ChatPanel.tsx:192-210)
- [ ] "Clear" — clear conversation; only in an active conversation's composer and not while streaming (web/components/ChatPanel.tsx:214-225, 881-887)
- [ ] Attach (paperclip, "Attach file (PDF, CSV)") — picker accepts .pdf .csv .txt .md (web/components/ChatPanel.tsx:228-244)
- [ ] Attached-file chip "×" "Remove attachment" (web/components/ChatPanel.tsx:144-159)
- [ ] Subject chip (handed over from a dashboard) "×" "Ask without it" (web/components/ChatPanel.tsx:126-142, 1033)
- [ ] Send (disabled when empty) ⇄ Stop (while streaming; also cancels the kernel job) (web/components/ChatPanel.tsx:249-276, 879)
- [ ] Drag and drop any file onto the panel — overlay "Drop to add to this conversation"; a data file becomes a table, anything else context (web/components/ChatPanel.tsx:977-982, 1043-1072; web/lib/attachments.ts:50-75)
- [ ] Upload result chips (→ table / added as context / error) with "×" Dismiss (web/components/ChatPanel.tsx:1076-1119)

Empty conversation
- [ ] Suggested questions — at most 4, "Show me interesting facts about this schema" always first (the overview tour); a click sends at once (web/components/ChatPanel.tsx:38-41, 1158-1199)
- [ ] Agent landing — when arriving to talk to a saved agent (web/components/ChatPanel.tsx:521-576, 1135-1137)
- [ ] Slash commands — none found

Each turn
- [ ] Depth banner re-run "Answer quickly instead →" / "Investigate instead →" — finished, non-overview turns (web/components/ChatPanel.tsx:360-398, 1221-1224)
- [ ] Question collapse/expand chevron — hover-only, finished turns (web/components/ChatMessage.tsx:1568-1578)
- [ ] Question "Edit" — hover-only, finished turns → inline editor "Cancel" / "Send"; re-sends from here and truncates the thread below (web/components/ChatMessage.tsx:1579-1614; web/components/ChatPanel.tsx:1255-1258)
- [ ] "Thought process" row (Agent turns) — toggles steps (ThinkingTrace), tools (ToolTrail), delegations, guards; query sub-steps open the Source panel (web/components/ChatMessage.tsx:921-977; web/components/ThinkingTrace.tsx:438-458)
- [ ] Answer parts: section expand/collapse; follow-up action buttons; embedded approval card (web/components/chat/AnswerParts.tsx:61-139)
- [ ] Staged proposal card: open-choice inputs, "Accept" (disabled until every choice is filled), "Reject", "also allow this target unattended" / "always allow this chain to post here" checkboxes (web/components/ChatMessage.tsx:1643-1649; web/components/ProposalCard.tsx:381-404, 551-597)
- [ ] Plan gate "Review plan before running": per-step toggle, "Run N steps →", "Reject" (cancels the run) (web/components/PlanGateCard.tsx:43-88; web/components/ChatPanel.tsx:892-902)
- [ ] Clarify gate "Which reading did you mean?": option buttons (remembered for the connection) (web/components/ClarifyGateCard.tsx:41-57; web/components/ChatPanel.tsx:904-909)
- [ ] Clarify card (ask-vs-guess): option chips, "Add the detail…" + "Send", "Answer anyway →" (web/components/ChatPanel.tsx:423-472, 1261-1267)
- [ ] Escalate bar "Investigate this →" — inconclusive quick answers (web/components/ChatPanel.tsx:477-496, 1268-1273)
- [ ] Failed turn: "Raise the budget" (→ Agent Ops agent page) or "Retry" (web/components/ChatMessage.tsx:85-92, 1722-1742)
- [ ] Quick answer: "Run fresh" — answer came from a similar past analysis (web/components/ChatMessage.tsx:1113-1125)
- [ ] Quick answer: "Source data" under a chart (web/components/ChatMessage.tsx:412-422)
- [ ] Quick answer: "Explain the data" (web/components/ChatMessage.tsx:1159-1169)
- [ ] Quick answer: Follow-ups list (web/components/ChatMessage.tsx:1193-1210)
- [ ] Quick answer: "Run a deep analysis" (web/components/ChatMessage.tsx:1033-1046)
- [ ] "Pin to dashboard" / "Pinning…" / "Retry pin" → "✓ Pinned to dashboard" — needs SQL and rows; quick and deep answers (web/components/ChatMessage.tsx:1015, 1047-1068, 1822)
- [ ] "Copy" answer — hover-only (web/components/ChatMessage.tsx:471-492, 1219-1223)
- [ ] "Methodology & details" disclosure (web/components/ChatMessage.tsx:1400-1482; web/components/brief/Brief.tsx:248-270)
- [ ] Details ▸ Agent context: remove a table "✕" / "+ <table>" add back — rescopes the context (web/components/ContextRibbon.tsx:60-90)
- [ ] Details ▸ Validate: "Validate", "Copy SQL", "Annotate" → note textarea, "Pin note", "Cancel" (web/components/ChatMessage.tsx:1282-1322)
- [ ] Details ▸ Grounding: "Show grounding" / "Hide grounding" (web/components/ChatMessage.tsx:1343-1382)
- [ ] Details ▸ "View source data & SQL" (web/components/ChatMessage.tsx:1458-1473)
- [ ] "Playbook referenced" expand ▼; per item "Edit" (textarea "Save" / "Cancel") and "Remove from playbook" — hover-only (web/components/ChatMessage.tsx:816-910, 1475, 1803)
- [ ] Deep answer: "Run fresh ↺" — from a similar past analysis (web/components/ChatMessage.tsx:1777-1799)
- [ ] Deep report: per-finding source button ("Data + SQL behind …"), "Table" toggle, "SQL", collapsed result tables, uncited "Sources" buttons (web/components/InvestigationReport.tsx:180-190, 312-320, 566-575, 653-660)
- [ ] Exploration report: per-step "SQL" toggle, "Details" disclosure, "Was this finding right?" "Accept" / "Partly" / "Reject" → correction form (web/components/ExplorationReport.tsx:112-117, 226-247, 288-339)
- [ ] Dossier answer: "Investigate deeper →" (web/components/ChatMessage.tsx:700-705)
- [ ] Deep answer follow-up chips (web/components/ChatMessage.tsx:1804-1821)
- [ ] Overview tour: "Explore this fact →", "View SQL & data" (web/components/OverviewReport.tsx:131-167; web/components/ChatPanel.tsx:1243)
- [ ] Feedback 👍 "Helpful" / 👎 "Not helpful" → "What was wrong?", "+ add corrected SQL", "Record correction", "Cancel" (web/components/AnswerFeedback.tsx:66-87; web/components/FixItForm.tsx:40-85)
- [ ] "Why this number →" — opens the Trust Receipt drawer (web/components/WhyThisNumber.tsx:573-583)
- [ ] "↺ Regenerate" — last turn only (web/components/ChatPanel.tsx:1294-1306)
- [ ] Post-run feedback (deep runs with hypotheses): textarea, "Submit feedback", "Skip" — it posts to /investigations/{id}/feedback, which refuses any run that is not paused, so a finished run's feedback is dropped (web/components/ChatPanel.tsx:1007-1016, 1307-1321; web/components/FeedbackPrompt.tsx:78-107; pramanyx/routers/investigations.py:4949-4960)
- [ ] "Export ▾": "PDF document", "PowerPoint (.pptx)", "Add AI executive summary" checkbox (web/components/ChatMessage.tsx:1827-1834; web/components/ExportButton.tsx:47-93)
- [ ] "Keep on a dashboard" (finished runs) → "Dashboard" select + question composer (question textarea, "Daily / Weekly / Monthly / Only when I ask", "Keep the question", "Cancel"), or "Start one" / "Cancel" when there is none (web/components/dashboards/KeepOnDashboard.tsx:64-99; web/components/dashboards/QuestionComposer.tsx:74-89)
- [ ] "Save as skill" / "Retry — not skill-worthy?" (web/components/ChatMessage.tsx:1853-1880)
- [ ] Inline code and ids in prose — click to copy (web/components/chat/AnswerProse.tsx:36-62)
- [ ] Tables written in prose: "Copy", "CSV" (web/components/TableActions.tsx:114-132)
- [ ] Object-key cells link to the object's page (new tab) (web/components/objects/objectColumnLinks.tsx:142-158)
- [ ] Result tables: header click sorts; per-column ▾ (hover-only at rest) → sort asc/desc, copy name, pin column, number format, value checklist with search and select-all, condition, "Clear", "Cancel"/apply; "Σ Totals on/off"; "Clear filters"; "Copy" / "CSV" (or "Copy shown" / "CSV shown"); 100-row pages (web/components/AugTable.tsx:204-439; web/components/query/ColumnFilterMenu.tsx:196-331; web/components/TableActions.tsx:84-112)
- [ ] "Edit visualization" on a chart — hover-only (web/components/charts/ResultChartCard.tsx:470-480)
- [ ] "Jump to latest" — only when scrolled up off the newest content (web/components/ChatPanel.tsx:1338-1361)

Source panel drawer
- [ ] "Download as CSV", "Copy SQL", "Close", "Explore with Query Builder" (→ Data ▸ SQL editor) (web/components/ChatMessage.tsx:566-650; web/app/page.tsx:1796-1806)

Why-this-number drawer
- [ ] Close "✕", scrim click, Esc (web/components/WhyThisNumber.tsx:172-177, 214, 236)
- [ ] Per executed statement "copy" (web/components/WhyThisNumber.tsx:125-146)
- [ ] "Whose definition is "<metric>"?" / "Hide <metric>'s provenance" (web/components/WhyThisNumber.tsx:362-378)
- [ ] "Run the statement now" / "Run it again" (re-perform) (web/components/WhyThisNumber.tsx:514-553)
- [ ] "Add as eval case" → "Target eval suite" select (incl. "＋ New suite…"), "New suite name", add, cancel (web/components/WhyThisNumber.tsx:495-502; web/components/AddToEvalSuite.tsx:81-115)

Edit-visualization panel (VizEditorPanel)
- [ ] Close; "Download PNG" (chart view); Visualization (chart / table / pivot + chart type); X axis field + axis title; Y axis metric + number format + axis title + aggregation; Color field (remove) + scale type + display name + legend; Labels; Tooltip; Orientation; Transform; Annotation — value/label "Add", "Add average line", remove (web/components/charts/VizEditorPanel.tsx:269-414; web/components/charts/ResultChartCard.tsx:413-466)

Opened run (HistoryDetailPanel — replaces the conversation when a run is selected)
- [ ] "Report" / "Evidence (N)" tabs — no Back button here; leave via "+ New", "Conversations" or "History" (web/components/HistoryDetailPanel.tsx:191-204; web/app/page.tsx:2087-2097)
- [ ] "Keep on a dashboard" and "Export ▾" in the Question header (web/components/HistoryDetailPanel.tsx:256-262)
- [ ] "Thought process" disclosure; query nodes open the Source panel (web/components/HistoryDetailPanel.tsx:282-298)
- [ ] Report body: deep report (as above), exploration report (here without the Accept/Partly/Reject buttons), or legacy/direct ReportView — collapsible sections, SQL toggles, per-recommendation "Mark" ▾ accepted / implemented / verified / rejected / dismissed (web/components/HistoryDetailPanel.tsx:302-333; web/components/ReportView.tsx:458-499)
- [ ] Follow-up composer: "Ask anything about your data…", "Quick" / "Agentic", "Send" → a fresh conversation that asks it (web/components/HistoryDetailPanel.tsx:358-404; web/app/page.tsx:2089-2096)
- [ ] Evidence claim: "SQL source" toggle; "Validated" / "Disputed" / "Needs context" (until one is set) (web/components/HistoryDetailPanel.tsx:498-535)
- [ ] Source panel drawer (web/components/HistoryDetailPanel.tsx:410-421)

Debug log
- [ ] ⌘⇧L "SSE Event Log" drawer: close "×", click an event to expand its payload (web/components/ChatPanel.tsx:297-355)

#### 2. Dialogs, drawers, popovers, panels (each one and what is inside, one line each)
- [ ] History popup (fixed, 420px, top-right) — HistoryPanel: Clear all, count, search, rows, ask why, delete (web/app/page.tsx:2348-2375; web/components/HistoryPanel.tsx:105-239)
- [ ] Conversations rail (208px, left of the panel) — threads, filter, rename, delete (web/components/ThreadsRail.tsx:113-262)
- [ ] Source panel drawer (380px, right) — rows table, CSV, Copy SQL, formatted SQL, Explore with Query Builder (web/components/ChatMessage.tsx:528-659; web/components/ChatPanel.tsx:1379-1393)
- [ ] Why-this-number drawer (right, over a scrim) — the signed receipt (web/components/WhyThisNumber.tsx:148-510)
- [ ] Edit-visualization panel (portal, one open app-wide) (web/components/charts/ResultChartCard.tsx:509-510)
- [ ] Column ▾ sort-and-filter popover (web/components/query/ColumnFilterMenu.tsx:196-331)
- [ ] Export ▾ menu (closes on an outside click) (web/components/ExportButton.tsx:21-93)
- [ ] Keep-on-a-dashboard inline picker + question composer (web/components/dashboards/KeepOnDashboard.tsx:74-99)
- [ ] Add-as-eval-case inline picker (web/components/AddToEvalSuite.tsx:88-115)
- [ ] Inline disclosures/forms: Methodology & details, Annotate, correction form, Thought process, Playbook referenced (web/components/ChatMessage.tsx:816-977, 1302-1322; web/components/FixItForm.tsx:35-88)
- [ ] Debug log drawer (fixed bottom-right) (web/components/ChatPanel.tsx:297-355)
- [ ] Drag-drop overlay (web/components/ChatPanel.tsx:1053-1072)
- [ ] Thread delete in-place confirm; "Clear all" browser confirm (web/components/ThreadsRail.tsx:233-256; web/components/HistoryPanel.tsx:76)
- [ ] HistoryDetailPanel — a panel that replaces the conversation (web/app/page.tsx:2086-2097)
- [ ] Global modals fired by responses: Upgrade (HTTP 402) and Approval (HTTP 428) (web/app/page.tsx:2393-2397)

#### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Toolbar: canvas chip, "N tables", connection tag (web/app/page.tsx:2027-2060)
- [ ] Thread row: "N turns · <relative> ago" (web/components/ThreadsRail.tsx:197-199)
- [ ] History popup: total count; kind badge "Ask" / "Inv"; "◉" indexed (Qdrant) mark; time ago; headline; "N hypotheses · N queries · <connection id>"; "⏱ timed out" / "✕ failed" / "● running" (web/components/HistoryPanel.tsx:121, 153-207)
- [ ] Depth banner: route chip "Agent" / "Overview" / "Quick answer", the router's why, the subject ("· this answer did not read them"), "· deep analysis needs an upgrade" (web/components/ChatPanel.tsx:360-383)
- [ ] Agent badge "Answering as <name>" · "N bound documents" (web/components/ChatPanel.tsx:402-417)
- [ ] Thought-process row: the latest update while running, then "Thought process · N steps" (web/components/ChatMessage.tsx:945-964)
- [ ] "Completed in Xs" (deep turns, and inside Details) (web/components/ChatMessage.tsx:1477-1479, 1747-1749)
- [ ] "From a similar past deep analysis" (+ "originally: …") (web/components/ChatMessage.tsx:1113-1125, 1777-1787)
- [ ] "compiled" badge "from declared definitions: <measure on entity by dimension>" (web/components/ChatMessage.tsx:1231-1241)
- [ ] Result figure: single-row metric tiles, or chart/table with caption and source tables (web/components/ChatMessage.tsx:372-431)
- [ ] Context ribbon "Context · N tables · ~N tokens · −N tok" (web/components/ContextRibbon.tsx:46-58)
- [ ] Validate verdict "✓ Validated — no fan-out, join, or filter issues found." or ⚠ list; "note pinned to <table>" (web/components/ChatMessage.tsx:1300, 1323-1335)
- [ ] Playbook: "— N items", "N% success" / "no outcome data", "when <trigger>" (web/components/ChatMessage.tsx:855-891)
- [ ] Recheck box "Re-checked <date>: this answer has changed" — old → new (variance), rows no longer returned, the cause (web/components/AnswerRecheck.tsx:30-58; web/components/ChatMessage.tsx:1755)
- [ ] Deep report: headline, figures, period chip, ⚠ caveat chips, "Exhibits — N of M results drawn", "Sources — N results", significance badge, trend strip, key numbers, rule-outs, Next / Recommended actions, Bottom line (web/components/InvestigationReport.tsx:612-680, 755-812)
- [ ] Exploration: confidence chip, "Investigative chain · N steps", "N queries · N steps" (web/components/ExplorationReport.tsx:259-345)
- [ ] Plan gate "N/M steps · ~N tok" (web/components/PlanGateCard.tsx:48-55)
- [ ] Clarify gate metric label and previews (web/components/ClarifyGateCard.tsx:24-55)
- [ ] Proposal: kind chip, "by <who> · waiting <relative>", settled status line (web/components/ProposalCard.tsx:415-428, 600-608)
- [ ] Answer parts: fact rows with status chips; progress "done/total" (web/components/chat/AnswerParts.tsx:34-115)
- [ ] Feedback said back: "Thanks — recorded as accepted" / "Thanks — noted" / "Noted" / "Correction recorded — future answers cite it" (web/components/AnswerFeedback.tsx:58-63)
- [ ] Receipt drawer: mode chip, "server-signed", Executed SQL (N), guards that fired, trusted patterns (N), settled readings, what the loop learned, capabilities, caveats, governed-metric chips, nodes / input tables, "Columns read · N" with confidence, "N% of n held", "Who else was told", stated confidence, footer Connection / Model / Cost / Recorded / Receipt id (web/components/WhyThisNumber.tsx:225-494)
- [ ] Upload chips "<file> → <table>" / "added as context" / error; "Importing <file>…" (web/components/ChatPanel.tsx:1078-1104)
- [ ] Table: "Total" / "Total of those shown", "N of M rows" filtered words, currency note (web/components/AugTable.tsx:354, 376-381, 435-440)
- [ ] Keep: "Kept on "<title>". It is answered there on its rhythm." / cost estimate / "N / max" counter (web/components/dashboards/KeepOnDashboard.tsx:50-53; web/components/dashboards/QuestionComposer.tsx:78-91)
- [ ] Opened run: "Agentic" / "Quick" badge, connection id; evidence confidence dot/bar or "confidence not counted", "phase: …", metric chip, "data as of …", feedback badge (web/components/HistoryDetailPanel.tsx:250-276, 459-496)
- [ ] Footer line "Always review the accuracy of responses." (web/components/ChatPanel.tsx:1151, 1370)

#### 4. Keyboard shortcuts
- [ ] Composer: Enter sends, Shift+Enter new line (web/components/ChatPanel.tsx:167-169)
- [ ] ⌘/Ctrl+Shift+L toggles the debug log — registered on window by every mounted ChatPanel, the hidden shell one included (web/components/ChatPanel.tsx:703-712)
- [ ] Clarify card detail: Enter sends (web/components/ChatPanel.tsx:455)
- [ ] Question editor: Enter sends, Shift+Enter new line, Esc cancels (web/components/ChatMessage.tsx:1597-1600)
- [ ] Post-run feedback: ⌘+Enter submits (web/components/FeedbackPrompt.tsx:86)
- [ ] Thread rename: Enter saves, Esc cancels (web/components/ThreadsRail.tsx:158-162)
- [ ] Opened-run follow-up: Enter sends (web/components/HistoryDetailPanel.tsx:377-379)
- [ ] Why-this-number drawer: Esc closes (web/components/WhyThisNumber.tsx:172-177)
- [ ] Edit-visualization panel: Esc closes; reference-line inputs Enter adds (web/components/charts/VizEditorPanel.tsx:233-235, 269-273)
- [ ] Column ▾ menu: Esc closes (web/components/query/ColumnFilterMenu.tsx:167-170)
- [ ] ⌘K / Ctrl+K palette (global) (web/app/page.tsx:1545-1552)

#### 5. URL params / deep links read or written
- [ ] `?tab=chat` read and written (web/app/page.tsx:888, 1019-1024, 1258)
- [ ] `?chat=<sessionId>` — read once per page load by the first ChatPanel to mount (web/components/ChatPanel.tsx:498-505, 585-593); written with replaceState once the conversation has messages (web/components/ChatPanel.tsx:921-928); removed when a fresh (non-resumed) panel mounts (web/components/ChatPanel.tsx:729-737)
- [ ] `?conn=` — the chat follows the selected connection; moving to another connection starts a new conversation (web/app/page.tsx:1260; web/components/ChatPanel.tsx:718-737)
- [ ] `?canvas=` is removed on this tab even while a canvas scopes the chat (web/app/page.tsx:1252, 1263)
- [ ] Not in the URL: the opened run, the Conversations rail, the History popup, the mode, the agent (web/app/page.tsx:1070-1076, 1297-1303)
- [ ] In-app navigate event `{tab, params.run}` opens a run here (web/app/page.tsx:1175-1202)
- [ ] "Raise the budget" pushes `?tab=agentic-ops&layer=agents&agent=<id>` and fires popstate (web/components/ChatMessage.tsx:85-92)
- [ ] A bare `/` redirects to the separate full-page `/chat` when the organisation chose chat as its front door (web/app/page.tsx:1524-1540)
- [ ] Export downloads GET /investigations/{id}/export?format=pdf|pptx&narrate= (web/lib/api.ts:8753-8768)
- [ ] Object links (new tab) (web/components/objects/objectColumnLinks.tsx:150-158)

#### 6. Empty / error / loading / withheld states that say something
- [ ] Empty conversation: "Ask your data anything" — "Agent investigates in depth — switch to Quick for a straight answer." (web/components/ChatPanel.tsx:1139-1147)
- [ ] Suggestions: four skeleton rows while loading; "Suggested questions need a working model — <reason>" when the model half is missing (web/components/ChatPanel.tsx:1160-1168; pramanyx/routers/system.py:411-420)
- [ ] No connection: static starters, no prewarm, no suggestions request (web/components/ChatPanel.tsx:739-754)
- [ ] Quick wait: bouncing dots + "Thinking…" / "Running query…" / "Investigating…" + shimmer scaffold (web/components/ChatMessage.tsx:336-352, 1552-1559, 1684-1701)
- [ ] "Taking longer than usual — still working…" after 12s without a frame (web/components/ChatMessage.tsx:453-466)
- [ ] Fallback hop: "<backend> didn't respond — continuing with <backend>" / "<backend> also failed — trying the next backend…" (web/components/ChatMessage.tsx:440-448)
- [ ] Failed turn "Answer failed" + hint + "Switching the model in Settings → Inference is the other way through." / "The fix is in Settings → Inference." (web/components/ChatMessage.tsx:1722-1742)
- [ ] One answer that cannot draw: "This answer couldn't be displayed." (web/components/ChatPanel.tsx:1229)
- [ ] Withheld: an answer the numbers check withheld still shows the query's result (web/components/ChatMessage.tsx:1087-1088); "Result may be incomplete — …" (web/components/ChatMessage.tsx:1143-1151)
- [ ] Pin refused: the guard battery's reason shown beside the button (web/components/ChatMessage.tsx:1063-1068)
- [ ] Grounding: "Grounding receipt isn't available for this answer." / "No grounding blocks fired for this question." / unreached sources "<title> — <note>" (web/components/ChatMessage.tsx:1383-1394)
- [ ] Degraded report: "Narrative synthesis was unavailable — … The queries ran (N executed)" or "No query ran — …" (web/components/InvestigationReport.tsx:740-752)
- [ ] Overview: "No notable facts surfaced for this schema." (web/components/OverviewReport.tsx:204-207)
- [ ] Unknown part: "(a <kind> part this client does not render yet)"; "unrecognised: <event>" payload block (web/components/chat/AnswerParts.tsx:131-137; web/components/chat/PartsMessage.tsx:59-81)
- [ ] Proposal: "loading proposal…" / "proposal <id> is no longer in the inbox — resolved elsewhere, or swept." (web/components/ProposalCard.tsx:640-652)
- [ ] Receipt: "Loading the receipt…" / "No receipt is available for this answer." / "Not traced to columns — …" / "Not enough to count yet: …" / "Not re-performed: …" / "It could not be compared: …" (web/components/WhyThisNumber.tsx:241-242, 421-426, 440, 538-548)
- [ ] Upload: "<file> — <error>", "No connection selected to import this into." (web/components/ChatPanel.tsx:1099-1104; web/lib/attachments.ts:57-58)
- [ ] Table: "No rows match these filters" (web/components/AugTable.tsx:401)
- [ ] Keep: "Reading your dashboards…", "You have no dashboard on this connection yet." + Start one, "Not kept on "<title>": …", "Not kept: …" (web/components/dashboards/KeepOnDashboard.tsx:57-60, 76-82)
- [ ] Conversations: the rail draws nothing with no threads; "No conversation matches "<q>"."; rename/delete failures are silent and corrected by the reload (web/components/ThreadsRail.tsx:83-100, 109-111, 139-143)
- [ ] History popup: "No Agent runs yet." — "Run your first to see it here."; "No matches"; a failed load is silent (web/components/HistoryPanel.tsx:48, 88-95, 132-134)
- [ ] Opened run: dots while loading; "Failed to load the deep analysis."; "This deep analysis did not complete — no report available."; Evidence "No evidence claims yet." — "Claims are extracted automatically when a deep analysis completes." (web/components/HistoryDetailPanel.tsx:144-166, 219-226, 337-341)
- [ ] Legacy report: a failed read of the recommendations' status is said under them (web/components/ReportView.tsx:510-520)
- [ ] Debug log: "No events yet. Send a message to start." (web/components/ChatPanel.tsx:330-331)
- [ ] A restored session that never arrives stays empty after ~12s of retries, unsaid (web/components/ChatPanel.tsx:795-797, 808-811)

#### 7. Loads on open (each API call on mount/open, method + path; mark **WRITES** / **SPENDS (model)** / **SPENDS (warehouse)** with backend evidence file:line)
The chat block is mounted on every app load whatever the tab (web/app/page.tsx:2023), and its ChatPanel remounts on every New / goToChat / thread pick (chatKey, web/app/page.tsx:2124). Each mount:
- [ ] GET /api/chat/{sessionId}/stream — reattach to an in-flight run (Next route → backend GET /ask/stream/{id}) — read (web/lib/usePramanyxChat.ts:113-118; web/app/api/chat/[id]/stream/route.ts:27-40)
- [ ] GET /agents/custom (web/components/ChatPanel.tsx:668; web/lib/api.ts:10268-10269) — read (pramanyx/routers/agents.py:273)
- [ ] GET /connections (web/components/ChatPanel.tsx:675-679) — read
- [ ] POST /connections/{selectedConn}/prewarm — **WRITES** (a kernel "profile" job; profile cache and entity-value samples) and **SPENDS (warehouse)** profiling queries on a cache miss; no model; skipped when the Curator agent is off (web/components/ChatPanel.tsx:759-760; pramanyx/routers/connections.py:317-337, 346-378)
- [ ] GET /suggestions?connection_id= — **SPENDS (warehouse)**: opens the connection and runs `db.get_schema` on every call (pramanyx/routers/system.py:320-324); **SPENDS (model)** on a cache miss (pramanyx/routers/system.py:394-411); **WRITES** the suggestions cache (pramanyx/routers/system.py:425) (web/components/ChatPanel.tsx:761-781)
- [ ] Resuming (`restoreSessionId` or `?chat=`): GET /chat-sessions/{id}/messages, up to 9 attempts 1.5s apart (web/components/ChatPanel.tsx:784-819) — read (pramanyx/routers/investigations.py:6820-6828)
- [ ] Seeded question (goToChat(q), an opened run's follow-up, ⌘K, the Catalog's "Tell me about…", the Briefing's investigate): auto-sent 80ms after mount → POST /api/chat → backend /ask — **SPENDS (model)** + **SPENDS (warehouse)** + **WRITES** the run (web/components/ChatPanel.tsx:946-966; web/app/api/chat/route.ts:333; pramanyx/routers/investigations.py:5999)
- [ ] Per finished answer with a public receipt: GET /receipt/{id} (web/components/WhyThisNumber.tsx:565-571) — read
- [ ] Per answer table whose columns name objects: object catalog read + POST /objects/titles — **SPENDS (warehouse)**, one query per object type, also for restored conversations (web/components/objects/objectColumnLinks.tsx:31-41, 62-92; pramanyx/routers/objects.py:370-397)
- [ ] Per staged proposal: GET the inbox record, re-polled every 15s while pending (web/components/ProposalCard.tsx:626-640)
- [ ] Opened run: GET /investigations/{id} — read (web/components/HistoryDetailPanel.tsx:96-105; pramanyx/routers/investigations.py:6407-6414); Evidence tab GET /investigations/{id}/evidence (web/components/HistoryDetailPanel.tsx:108-115); legacy report GET /investigations/{id}/outcomes (web/components/ReportView.tsx:513-520)
- [ ] Conversations toggle: GET /chat-sessions?conn_id= — read (web/components/ThreadsRail.tsx:59-67; pramanyx/routers/investigations.py:6663-6668)
- [ ] History popup: GET /investigations, GET /investigations/indexed-ids (vector-store scroll), refreshed on kernel investigation events (web/components/HistoryPanel.tsx:37-59; pramanyx/routers/investigations.py:6384-6404)
- [ ] Keep on a dashboard opened: GET dashboards list, GET /dashboards/questions/cost (web/components/dashboards/KeepOnDashboard.tsx:32-43; web/components/dashboards/QuestionComposer.tsx:49-53)
- [ ] Receipt drawer opened: GET /receipt/{id}/trace (graph load) (web/components/WhyThisNumber.tsx:183-187)
- [ ] (on click, not on open) any send, suggestion, follow-up, Regenerate, Run fresh, Investigate instead, Explore this fact (also POST /overview/drill **WRITES**), Retry, Edit — **SPENDS (model + warehouse)**; Validate — **SPENDS (warehouse)** live probes (pramanyx/routers/query.py:1381-1390); Pin to dashboard — re-runs the SQL through the guards (pramanyx/routers/cards.py:240-252); Run the statement now — POST /investigations/{id}/recheck **SPENDS (warehouse)**; Export with "Add AI executive summary" — **SPENDS (model)** (pramanyx/routers/investigations.py:6567-6573); Show grounding — GET /ask/context, schema read (pramanyx/routers/investigations.py:6070-6100); attachments, annotate, feedback, verdicts, rescope, skills, eval cases, thread rename/delete, run delete, Clear all — **WRITES**

Top rows today: the shell breadcrumb "Ask › Data Canvas › Conversation" (web/app/page.tsx:1865, 1926; working tree), then the page toolbar `.aug-toolbar` (web/app/page.tsx:2026-2084): left — canvas chip · "N tables" · "×" Clear canvas, or the connection tag; right — "Canvas" (no canvas) · "+ New" · "Conversations" · "History". With a run open, HistoryDetailPanel adds a "Report | Evidence" row (no Back) and puts "Keep on a dashboard" + "Export ▾" in its Question header (web/components/HistoryDetailPanel.tsx:191-262). The composer (Quick/Agent · agent picker · Clear · attach · send/stop) floats at the bottom (web/components/ChatPanel.tsx:1364-1372).

---

## Agent runs

Entry: `RecentsScreen` = `AgentRuns` (web/components/runs/AgentRuns.tsx:116), dynamically imported at web/app/page.tsx:588 and rendered at web/app/page.tsx:2141 when `tab === "recents"`. Reached by the rail's Ask ▸ Agent runs (web/lib/navDestinations.ts:50), `?tab=recents`, Agent Ops' "runs" door (`onOpenRuns`), and Agent Ops' `onOpenInvestigation`, which sets the chat's history id and then navigates HERE — so that door lands on this list, not on the run (web/app/page.tsx Agent Ops block).

### 1. Controls
- [ ] Needs-you row "Open" — opens the latest run of a question that failed, timed out, stopped or is paused (canvas if one matches, else the chat) (web/components/runs/AgentRuns.tsx:259)
- [ ] Needs-you row "Ask again" (hidden for scheduled questions and paused runs) — asks the question again in a new chat — **SPENDS (model, warehouse)** on click (web/components/runs/AgentRuns.tsx:260-265)
- [ ] Running now "Open in Agent Ops" (per live job) — opens Agent Ops ▸ Overview (web/components/runs/AgentRuns.tsx:184)
- [ ] Filter "All N / Deep analyses N / Conversations N" (segmented) (web/components/runs/AgentRuns.tsx:274-278)
- [ ] "Traces & spans ›" — opens the machine view of every run in Agent Ops ▸ Overview (web/components/runs/AgentRuns.tsx:279-284)
- [ ] Question row (whole row is a button) — opens the latest run of that question (web/components/runs/AgentRuns.tsx:332-351)
- [ ] "×N ▾" on a question with repeats — expands the earlier runs (web/components/runs/AgentRuns.tsx:353-359)
- [ ] Earlier-run row (expanded) — opens that specific run (web/components/runs/AgentRuns.tsx:368-377)
- [ ] "Retry" (list not refreshed) and "Retry" on a failed first read (web/components/runs/AgentRuns.tsx:243, :192)
- [ ] "Ask a question" (no runs yet) — opens an empty chat (web/components/runs/AgentRuns.tsx:202)

### 2. Dialogs, drawers, popovers, panels
- [ ] Inline earlier-runs fold under a question (date · status · headline per run) (web/components/runs/AgentRuns.tsx:366-379)
- [ ] none others — a run opens on the Data Canvas or Chat page, not in a drawer

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Figure "Runs" — count; sub "since <day> · <connection or N connections>"; chip "newest 50" when the read is capped (web/components/runs/AgentRuns.tsx:225-229)
- [ ] Figure "Questions" — distinct questions; sub "N repeat runs folded" / "none repeated" (web/components/runs/AgentRuns.tsx:230-231)
- [ ] Figure "Didn't finish" (red when > 0) — sub "failed, timed out or stopped" (web/components/runs/AgentRuns.tsx:232-233)
- [ ] Figure "Running" — runs plus live kernel jobs; sub "N paused, waiting" / "in flight now" / "nothing in flight" (web/components/runs/AgentRuns.tsx:234-235)
- [ ] Running now card — "N runs", blue dot, job title, "<agent> · <connection> · started <x> ago" (web/components/runs/AgentRuns.tsx:173-188)
- [ ] Needs you card — "N questions"; per row the status mark, "· <x> ago · N times" (web/components/runs/AgentRuns.tsx:247-269)
- [ ] Status marks (only when not complete): "failed", "timed out" (red), "stopped" (grey), "paused · waiting" (amber), "running" (blue) (web/components/runs/AgentRuns.tsx:52-59, :299-308)
- [ ] Row icon: chat bubble = conversation, spark = deep analysis (web/components/runs/AgentRuns.tsx:334-336)
- [ ] Row headline, or "no headline" for a completed run that kept none (web/components/runs/AgentRuns.tsx:311-314)
- [ ] Chip "scheduled" (asked by a schedule) (web/components/runs/AgentRuns.tsx:343)
- [ ] "· <connection>" per row when several connections are listed (web/components/runs/AgentRuns.tsx:344)
- [ ] Chip "N earlier didn't finish" (web/components/runs/AgentRuns.tsx:345-349)
- [ ] "<x> ago" with the full timestamp on hover; earlier runs show a short timestamp (web/components/runs/AgentRuns.tsx:361-364, :371)
- [ ] Amber chip "not refreshed — showing the last list read" (web/components/runs/AgentRuns.tsx:240-245)

### 4. Keyboard shortcuts
- none found

### 5. URL params / deep links read or written
- [ ] `?tab=recents` and `?conn=` (shell) (web/app/page.tsx:1244-1268)
- [ ] The filter and the expanded rows are not in the URL

### 6. Empty / error / loading / withheld states that say something
- [ ] "Loading the runs…" / "Could not read the runs — <error>. Retry" (web/components/runs/AgentRuns.tsx:190-194)
- [ ] "No runs yet." / "No question asked here yet." (when only live jobs exist) (web/components/runs/AgentRuns.tsx:196-205)
- [ ] "No conversations in the newest 50 runs" / "No deep analyses in the runs" (filter empty) (web/components/runs/AgentRuns.tsx:288-289)
- [ ] "A run with no question recorded" (title for a run with no question) (web/components/runs/AgentRuns.tsx:108)
- [ ] The 8-second timeout aborts the read and shows the error (web/components/runs/AgentRuns.tsx:135-142)

### 7. Loads on open
- [ ] `GET /connections` (names each row's connection) (web/components/runs/AgentRuns.tsx:128)
- [ ] `GET /investigations?limit=50&workspace_id=` — re-read on every `investigation.*` kernel event (web/components/runs/AgentRuns.tsx:132-148; pramanyx/routers/investigations.py:6384)
- [ ] `GET /jobs?state=active` + `GET /workspaces/{id}` — live jobs on this workspace's connections; re-read on every `job.state` event (web/components/runs/AgentRuns.tsx:153-169)
- [ ] Nothing writes or spends on open

Top rows today: no title or toolbar of its own. The shell's PageHeader breadcrumb "Ask › Agent runs" sits above (web/app/page.tsx:1926, working tree). The first row is the four figures. The page's only toolbar-like controls are in the "By question" card header: the All / Deep analyses / Conversations filter and "Traces & spans ›".

---

## Catalog

Entry: `CatalogScreen` (web/components/CatalogScreen.tsx:212), rendered as the "catalog" layer of the Data workspace at web/app/page.tsx:2281-2320 (tab "data", layer "catalog", `hideTabs`). Reached by the rail's Data ▸ Catalog (web/lib/navDestinations.ts:55), `?tab=catalog` (also `?tab=connections`, an alias, web/app/page.tsx:908-916), ⌘K "Add a data source" (opens the Add data page here, web/app/page.tsx:2384), Home's "Load the demo", and Agent Ops' "open connection" door. Three right-hand views: nothing chosen → `CatalogHome`; a catalog or schema → `CatalogScope`; a table → `CatalogTable`. The connection removal modal belongs to the shell (web/app/page.tsx:814-875).

### 1. Controls

Left tree (always shown)
- [ ] "Catalog" (top bar title, a button) — clears the selection and shows the Catalog home (web/components/CatalogScreen.tsx:510-515)
- [ ] "+" (top bar) — opens the Add data page (web/components/CatalogScreen.tsx:516-523)
- [ ] Refresh (↻, "Refresh schema") — re-reads the tree and refreshes the server schema cache for the selected connection — **WRITES + SPENDS (warehouse)** `POST /connections/{id}/schema/refresh`, then re-reads `/catalog/tree` (web/components/CatalogScreen.tsx:524-531; web/lib/schema-context.tsx:58-65)
- [ ] "Search catalog…" box — filters catalogs, schemas and tables by name (web/components/CatalogScreen.tsx:536-537, :318)
- [ ] Section header "Add" (on Connections) — opens the Add data page (web/components/CatalogScreen.tsx:332-342)
- [ ] Catalog row — selects it (and the shell's connection) and toggles it open (web/components/CatalogScreen.tsx:360-370)
- [ ] Schema row — selects it and toggles it open (web/components/CatalogScreen.tsx:383-393)
- [ ] Table row — opens the table and records it in Recent (web/components/CatalogScreen.tsx:404-411)
- [ ] Chevron on a catalog/schema row — expands/collapses without selecting (web/components/CatalogScreen.tsx:162-166)
- [ ] Drag the divider between tree and detail — resizes the tree (240–560 px, remembered as "catalog") (web/components/CatalogScreen.tsx:504)

Catalog home (nothing chosen)
- [ ] View "All / ★ Favorites / 🕑 Recent" (segmented) (web/components/catalog/CatalogHome.tsx:52-56)
- [ ] Needs-you "Compare" (a catalog listed twice) — opens the copy (web/components/catalog/CatalogHome.tsx:121-122)
- [ ] Needs-you "Retry" (a catalog's exploration could not be read) (web/components/catalog/CatalogHome.tsx:133)
- [ ] Catalogs table: catalog name link — opens the catalog (web/components/catalog/CatalogHome.tsx:178-181)
- [ ] Favorites/Recent: "Filter…" box (web/components/catalog/CatalogHome.tsx:230)
- [ ] Favorites/Recent: item name link — opens the catalog, schema or table (web/components/catalog/CatalogHome.tsx:243-245)
- [ ] Favorites/Recent: ★ toggle — adds/removes a favorite (browser-local) (web/components/catalog/CatalogHome.tsx:249-253)

Catalog or schema page (header and tabs)
- [ ] "Ask about it" — asks "Tell me about <catalog>" / "Tell me about the <schema> schema in <catalog>" in the chat — **SPENDS (model, warehouse)** on click (web/components/catalog/CatalogScope.tsx:146-151)
- [ ] Tools ▾ menu (web/components/catalog/CatalogScope.tsx:112-126, :152; web/components/catalog/CatalogTools.tsx:79-102), its items:
  - [ ] "Test connection" (catalog only, real connections) — `POST /connections/{id}/test` (web/components/catalog/CatalogScope.tsx:113; web/components/CatalogScreen.tsx:311-316)
  - [ ] "Sync and files" (catalog with a syncable/knowledge/upload connector) — opens Settings (web/components/catalog/CatalogScope.tsx:114)
  - [ ] "Profile" (schema only) — opens the Profile tab (web/components/catalog/CatalogScope.tsx:115)
  - [ ] "Volumes" (catalog only) — opens the Volumes tab (web/components/catalog/CatalogScope.tsx:116)
  - [ ] "Permissions" (catalog only) — opens the Permissions tab (web/components/catalog/CatalogScope.tsx:117)
  - [ ] "Add to favorites" / "Remove from favorites" (web/components/catalog/CatalogScope.tsx:118)
  - [ ] "Remove connection…" (catalog only, red) — opens the shell's type-the-name removal modal (web/components/catalog/CatalogScope.tsx:119)
  - [ ] "Remove schema…" (schema only, not "main", red) — native `confirm()` then **WRITES** `DELETE /connections/{id}/schemas/{schema}` (drops its tables, files, profile and exploration) (web/components/catalog/CatalogScope.tsx:120-125)
- [ ] Tabs: "Overview", "Tables · N", "Diagram" (schema scope, or a one-schema connection), "Docs" (real connections), "Settings"; plus "Profile" / "Volumes" / "Permissions" appear only while open from Tools ▾ (web/components/catalog/CatalogScope.tsx:131-133, :154-155)
- [ ] Overview needs-you "Compare" (this is a copy / its tables are also listed elsewhere) (web/components/catalog/CatalogScope.tsx:170-180)
- [ ] Overview needs-you "See them" (documents for it can't be searched) — opens Docs (web/components/catalog/CatalogScope.tsx:181-186)
- [ ] Overview needs-you "Set it" (datasets wait for their layers), "Settings" (exploration held / monthly budget spent) — open Settings (web/components/catalog/CatalogScope.tsx:187-201)
- [ ] Overview table rows (name link) — open the table (web/components/catalog/CatalogScope.tsx:322-323; web/components/catalog/CatalogTools.tsx:215-218)
- [ ] Overview "All N tables" — opens the Tables tab (more than 12 tables) (web/components/catalog/CatalogScope.tsx:324-328)
- [ ] Tables tab: "Filter tables…" box (name or business object) (web/components/catalog/CatalogScope.tsx:349)
- [ ] Tables tab: schema filter column — "All schemas" and each schema with its count bar (multi-schema catalogs) (web/components/catalog/CatalogScope.tsx:358-377)
- [ ] Tables tab: "Open <schema>" — opens the chosen schema's page (web/components/catalog/CatalogScope.tsx:378-382)
- [ ] Tables tab: table name link — opens the table (web/components/catalog/CatalogTools.tsx:215)
- [ ] Diagram tab: ER diagram — pan, zoom, drag tables, fit-view and zoom controls, "Show more / Show less" on a table's column list (web/components/catalog/CatalogScope.tsx:393-412; web/components/ERDiagram.tsx:345-352, :395, :436-444)
- [ ] Docs tab: "Documents" link — opens the Documents page (web/components/catalog/CatalogTools.tsx:462-466)
- [ ] Settings (catalog): "Test connection", "Remove connection…" (red) (web/components/catalog/CatalogScope.tsx:225-236)
- [ ] Settings (catalog): "Show this connection in the Briefing" switch — **WRITES** `PUT /connections/{id}/settings` `briefings_enabled` (web/components/catalog/CatalogScope.tsx:237-239; web/components/catalog/CatalogTools.tsx:257-286)
- [ ] Settings (catalog) ▸ Exploration: "Accept the proposed layers" — **WRITES** `POST /exploration/{conn}/datasets/layers/accept`, and starts questions within the budget — **SPENDS** (web/components/DatasetProgram.tsx:282-333; pramanyx/routers/datasets.py:162, :247)
- [ ] Settings (catalog) ▸ Exploration: "This connection's monthly budget (tokens)" input + "Save" — **WRITES** `exploration_monthly_tokens` (web/components/DatasetProgram.tsx:340-346)
- [ ] Settings (catalog) ▸ "Sync now" / "Sync knowledge" (Stripe, HubSpot, Salesforce, S3 / Confluence, Notion) — **WRITES + SPENDS** a background sync (web/components/catalog/CatalogTools.tsx:324-336, :371-378)
- [ ] Settings (catalog) ▸ "Upload CSV, Parquet or Excel" (local-upload connections) — **WRITES** a table (web/components/catalog/CatalogTools.tsx:338-350, :381-386)
- [ ] Settings (catalog) ▸ file row "×" Remove — deletes the file and its table, NO confirm (web/components/catalog/CatalogTools.tsx:352-355, :387-395)
- [ ] Settings (catalog) ▸ "Restore sample data" — re-adds removed bundled sample schemas (web/components/catalog/CatalogTools.tsx:357-365, :396-402)
- [ ] Settings (schema) ▸ "Layer" select ("Not set" + layers) and "Set as <proposed>" — **WRITES** (setting a question-asking layer starts questions — SPENDS) (web/components/catalog/CatalogScope.tsx:217-222; web/components/DatasetProgram.tsx:104-140; pramanyx/routers/datasets.py:162, :206)
- [ ] Settings (schema) ▸ on/off switch → reason select + "Turn off" / "Cancel"; switching back on is immediate — **WRITES** (web/components/DatasetProgram.tsx:157-195)
- [ ] Profile tab (schema): "Show all N tables" / "Domain tables only (N)"; per-table "derived quantities" fold; column rows with a confident concept open their evidence layers (web/components/SchemaShape.tsx:150-165, :223, :276, :460-467)
- [ ] Volumes tab: "New volume…" input + "Add" (Enter also adds) — **WRITES** (web/components/catalog/MetastorePanels.tsx:77-80)
- [ ] Volumes tab: volume row — selects it (web/components/catalog/MetastorePanels.tsx:85-92)
- [ ] Volumes tab: "Upload object" (file picker) — **WRITES** (web/components/catalog/MetastorePanels.tsx:104-108)
- [ ] Volumes tab: per object "Download" link and "Delete" (NO confirm) (web/components/catalog/MetastorePanels.tsx:119-121)
- [ ] Permissions tab: per workspace "Grant" / "Revoke" — **WRITES** an explicit grant (web/components/catalog/MetastorePanels.tsx:149-159, :181-185)

Table page
- [ ] "Ask about it" — asks "Tell me about the <table> table" in the chat — **SPENDS** on click (web/components/catalog/CatalogTable.tsx:195; web/app/page.tsx:2313-2316)
- [ ] Tools ▾: "Edit column types" (Columns ▸ List), "Profile its columns" (Columns ▸ Profile), "Add/Remove from favorites", "Remove table…" (red; native `confirm()` → **WRITES** `DELETE /connections/{id}/tables/{table}`, drops the table and its uploaded file) (web/components/catalog/CatalogTable.tsx:170-180, :196)
- [ ] Tabs: "Overview", "Columns", "Sample", "Findings · N", "Docs", "History" (web/components/catalog/CatalogTable.tsx:182-186, :198)
- [ ] Columns: "List / Profile" (segmented) (web/components/catalog/CatalogTable.tsx:310-313)
- [ ] Columns ▸ List: "Filter columns…" box (name or type) (web/components/catalog/CatalogTable.tsx:381)
- [ ] Columns ▸ List: chevron on a profiled numeric column — opens its distribution (shape, p25, median, p75, mean, range) (web/components/catalog/CatalogTable.tsx:397-402, :425; web/components/catalog/CatalogTools.tsx:525-552)
- [ ] Columns ▸ List: click a column's type → type select (19 types) + "Save" — **WRITES** `POST …/tables/{t}/alter-column` (ALTER, or a display-only override said in an alert) (web/components/catalog/CatalogTable.tsx:408-421, :154-168)
- [ ] Columns ▸ Profile: the schema profile for this one table (as the scope's Profile tab) (web/components/catalog/CatalogTable.tsx:204-208)
- [ ] Sample: the first 200 rows in the shared results grid — sort, column ▾ menus, filters, Totals, Copy, CSV (see Data Canvas ▸ Chat for the grid's own controls) — **SPENDS (warehouse)** when the tab opens (web/components/catalog/CatalogTools.tsx:473-504)
- [ ] Sample / Findings "Retry" (web/components/catalog/CatalogTools.tsx:496; web/components/catalog/CatalogTable.tsx:269)
- [ ] Docs: inline editors (click to edit; Save / Cancel) — "Table comment", "Grain — one row per…", "Join hints — one per line", and per column "Add a comment…", "Known values", "⚠ Caveats" — **WRITES** the glossary (web/components/catalog/GlossaryPanel.tsx:36-91, :137-185)
- [ ] Docs: "Clear" on "Note the agent reads" (per column; kept in the column's history) — **WRITES** (web/components/catalog/GlossaryPanel.tsx:187-201)
- [ ] History: the table's "Layer" select / "Set as <proposed>" and on/off switch (as schema Settings; "Off with its schema" when the schema is off) — **WRITES** (web/components/catalog/CatalogTable.tsx:286-293; web/components/DatasetProgram.tsx:253-280)

Add data page (replaces the whole Catalog while open)
- [ ] "Search data sources…" box; Files tiles; connector cards grouped by category; "NOT INSTALLED" cards disabled with the missing note (web/components/AddDataPanel.tsx:103-140, :765-791)
- [ ] Close (×, "Close (Esc)") (web/components/AddDataPanel.tsx:754)
- [ ] Connector form: "Connection name", per-type fields, "Create connection" (phases "Testing the connection…", "Adding to the catalogue…", "Waiting for the catalogue…"), "Back" — **WRITES** a connection (web/components/AddDataPanel.tsx:700-735, :805-841)
- [ ] File upload: mode "review / bulk" toggle (web/components/AddDataPanel.tsx:492-500)
- [ ] File upload (review): drop zone / click to choose; per file "Configure import" — "Table name", "Schema" select, "New schema name…" + add (Enter), per-column type select with a suggested-type button; "Add table" / "Replace table", "Skip", "Cancel" — **WRITES** (makes the workspace's uploads connection on first upload) (web/components/AddDataPanel.tsx:233-300, :333-470, :505-521)
- [ ] File upload (bulk): "Target schema" select, "New schema name…" + add, drop zone "Drop files to add to <schema>" — **WRITES** (web/components/AddDataPanel.tsx:300-312, :535-570)
- [ ] File upload: "Tables in <uploads> · N" list with per-table "Remove table" — deletes, NO confirm (web/components/AddDataPanel.tsx:315-318, :598-620)

### 2. Dialogs, drawers, popovers, panels
- [ ] Tools ▾ dropdown (scope and table variants) (web/components/catalog/CatalogTools.tsx:79-102)
- [ ] Shell "Remove connection" modal — "This removes <name> from Pramanyx. The database is not affected.", type the name to confirm (Enter confirms), "Cancel" / "Remove" — **WRITES** `DELETE /connections/{id}` (web/app/page.tsx:814-875, :1816-1824, :2410-2416)
- [ ] Native `confirm()` for Remove schema and Remove table; native `alert()` for their failures and for a display-only type change (web/components/catalog/CatalogScope.tsx:122-124; web/components/catalog/CatalogTable.tsx:167, :176-178)
- [ ] Add data full page (replaces the Catalog) — gallery → connector form, or the file uploader (web/components/AddDataPanel.tsx; web/components/CatalogScreen.tsx:485-500)
- [ ] Profile / Volumes / Permissions open as extra tabs, not dialogs (web/components/catalog/CatalogScope.tsx:131-133)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Tree: per catalog its table count; per schema its table count and maturity bars + number, or "off"; per table its maturity bars, or "off" (web/components/CatalogScreen.tsx:112-130, :364, :386-387, :407)
- [ ] Home figure "Catalogs" — count, names (web/components/catalog/CatalogHome.tsx:99-100)
- [ ] Home figure "Tables" — each counted once; amber chip "+N listed twice" or "in N schemas" (web/components/catalog/CatalogHome.tsx:101-104)
- [ ] Home figure "Rows" — compact; "in N tables · N not counted" / "no table carries a row count" (web/components/catalog/CatalogHome.tsx:105-108)
- [ ] Home figure "Turned off" — "N schemas · N tables" / "no schema or table set aside" / "N catalogs not read" (web/components/catalog/CatalogHome.tsx:88-94, :109-110)
- [ ] Home needs-you rows: "<catalog> lists the same tables as <other>" + "counted once here · <copy> is N% explored"; "N <catalog> documents can't be searched" + "N of M parts are missing from the search index"; "<catalog>: how far it is explored could not be read" (web/components/catalog/CatalogHome.tsx:113-136)
- [ ] Home Catalogs table — Catalog (+ what it is), Tables, Rows ("not counted"), Explored (bar + %, "reading…", "not read", "not given"), State (✓ watched daily, ● exploring, listed twice …) (web/components/catalog/CatalogHome.tsx:139-212)
- [ ] Home Largest tables — up to 8 bars, "counted rows · each once" (web/components/catalog/CatalogHome.tsx:143-153)
- [ ] Scope header — crumbs, name, "N tables" / what it is, state chip "✓ watched daily · 100%", "testing…" / "✓ connection works" / "✗ connection failed" (web/components/catalog/CatalogScope.tsx:137-153)
- [ ] Scope figures "Tables" (stages), "Rows", "Metrics" ("approved · newest <grain> <day>"), "Last explored" ("N new findings · nothing failed" / "the run <outcome>") (web/components/catalog/CatalogScope.tsx:279-295)
- [ ] Scope needs-you header "N items" (web/components/catalog/CatalogScope.tsx:297)
- [ ] Scope "Rows by table" bars (top 10, "and N smaller tables", "N not counted") (web/components/catalog/CatalogScope.tsx:300-311)
- [ ] Scope "What the platform knows" share bars (N of M, hatched when unknown) + "Newest <grain>: <day> · read <time>" (web/components/catalog/CatalogScope.tsx:312-319; web/components/catalog/CatalogTools.tsx:154-179)
- [ ] Tables list columns — Table (+ schema), Business object, Rows ("not counted"), Questions (n/of), Metrics read it ("not read" / "—"), State (web/components/catalog/CatalogTools.tsx:199-241)
- [ ] Settings: exploration badge (phase, "Paused · " / "Interrupted · ", "N findings", "Nq") — polls every 60 s and on events (web/components/ExplorationBadge.tsx:24-90)
- [ ] Settings ▸ Exploration: "Budget: <sentence>" (amber when spent), "Every dataset's layer is set.", "Saved" (web/components/DatasetProgram.tsx:335-346)
- [ ] Settings ▸ Sync: "Last sync: <time>" / "Never synced" / "Sync triggered — running in background…"; file rows "<name> · NKB" (web/components/catalog/CatalogTools.tsx:308-336, :387-395)
- [ ] Docs: per compiled document "N parts" or amber "N searchable of M" (web/components/catalog/CatalogTools.tsx:447-459)
- [ ] Profile tab: "N tables · N columns · avg null N% · N categorical", per column Nulls / Distinct / Shape, FK tag, "N derived quantities" (web/components/SchemaShape.tsx:150-165, :261-289, :455-460)
- [ ] Volumes: "N objects", per object size and MIME type (web/components/catalog/MetastorePanels.tsx:103, :113-118)
- [ ] Permissions: per workspace "Member" / "Granted" / "No access", "(default)" (web/components/catalog/MetastorePanels.tsx:172-179)
- [ ] Table header — "catalog › schema ›", mono table name, business-object chip (web/components/catalog/CatalogTable.tsx:190-193)
- [ ] Table figures "Rows", "Columns" (column marks), "Metrics read it", "Questions" ("of N asked of it") (web/components/catalog/CatalogTable.tsx:213-226)
- [ ] Table Lifecycle card — states with "ends" / "open", "N of M states end it", "How many sit in each state is not read here." (web/components/catalog/CatalogTable.tsx:228-252)
- [ ] Table Columns grid — Column, Type, Means, chips "✓ key", "→ <linked table>", "N states", "time" (web/components/catalog/CatalogTable.tsx:324-347)
- [ ] Columns list — type icon, description, "link" chip, "N profiled · open a column for its distribution · click a type to change it" (web/components/catalog/CatalogTable.tsx:382-386, :404-423)
- [ ] Findings — angle/question, domain chip, day, finding text (web/components/catalog/CatalogTable.tsx:265-285)
- [ ] History — "Runs over <schema>" lines (web/components/catalog/CatalogTable.tsx:294-301)
- [ ] Sample — "First 200 rows · N rows" (web/components/catalog/CatalogTools.tsx:500)
- [ ] Docs (glossary) — "Note the agent reads · written by the agent / by a person" (web/components/catalog/GlossaryPanel.tsx:187-201)

### 4. Keyboard shortcuts
- [ ] Esc closes the Add data page (or backs out of a connector form) (web/components/AddDataPanel.tsx:662-667)
- [ ] Column type select: Enter saves, Esc cancels (web/components/catalog/CatalogTable.tsx:412)
- [ ] Glossary editors: ⌘/Ctrl+Enter saves; Enter saves a one-line field; Esc cancels (web/components/catalog/GlossaryPanel.tsx:66-72)
- [ ] Remove-connection modal: Enter confirms once the name matches (web/app/page.tsx:853)
- [ ] New volume / new schema inputs: Enter adds (web/components/catalog/MetastorePanels.tsx:78; web/components/AddDataPanel.tsx:359, :544)

### 5. URL params / deep links read or written
- [ ] `?tab=catalog` (the Data layer is written as the tab; `?tab=connections` resolves here) and `?conn=` (the catalog clicked becomes the shell's connection) (web/app/page.tsx:908-916, :1244-1268)
- [ ] The selected catalog/schema/table, the tab inside it, the search and the Add data page are NOT in the URL — a reload lands on the Catalog home
- [ ] localStorage `aug.catalog.favs` and `aug.catalog.recents` (15 newest) (web/components/catalog/CatalogTools.tsx:33-56); the tree width under "catalog" (web/components/CatalogScreen.tsx:504)
- [ ] ⌘K "Add a data source" bumps a nonce that opens the Add data page (web/app/page.tsx:2384; web/components/CatalogScreen.tsx:279)

### 6. Empty / error / loading / withheld states that say something
- [ ] Tree: skeleton while loading; "No connections yet." (web/components/CatalogScreen.tsx:542-547, :346-348)
- [ ] Home: "Loading the catalog…" / "Could not read the catalog — <error>. Retry"; "No connections yet. Add one to get started." (web/components/catalog/CatalogHome.tsx:59-60)
- [ ] Home needs-you empty: "Nothing needs you" / "… · the search index's status could not be read" (web/components/catalog/CatalogHome.tsx:113-114)
- [ ] "No table carries a row count yet." (web/components/catalog/CatalogHome.tsx:152)
- [ ] Favorites/Recent: "No favorites yet — star a catalog, schema or table from its Tools menu." / "Nothing opened yet — a table you open appears here." / "Nothing here matches that filter." (web/components/catalog/CatalogHome.tsx:232-235)
- [ ] Scope: "None of its tables carries a row count.", "No table matches that filter.", "No tables." (web/components/catalog/CatalogScope.tsx:308, :352)
- [ ] Diagram: "Loading the diagram…", "The diagram could not be read." / "No diagram for this schema." (web/components/catalog/CatalogScope.tsx:409-410)
- [ ] Docs: "Nothing compiled for <name> yet — it is written when intelligence runs over a schema."; "Your own documents are shared by every connection, so they live in Documents" (web/components/catalog/CatalogTools.tsx:443-466)
- [ ] Settings: "Its datasets could not be read." / "Reading its datasets…" (web/components/catalog/CatalogScope.tsx:221, :245-246)
- [ ] Profile: "Schema profile not yet built. The column profiler runs automatically when the background explorer analyses your schema…"; "No profiled tables in this scope." (web/components/SchemaShape.tsx:402-410, :473)
- [ ] Volumes: "No volumes yet.", "Select or create a volume to manage its objects.", "No objects. Upload a file to get started." (web/components/catalog/MetastorePanels.tsx:84, :99, :112)
- [ ] Permissions: "No workspaces." (web/components/catalog/MetastorePanels.tsx:189)
- [ ] Table: Lifecycle "The ontology is not built for this schema." / "No business object is read from this table." / "<object> has no lifecycle the platform has read."; "Its columns could not be read."; "No column matches that filter." (web/components/catalog/CatalogTable.tsx:231-234, :256, :388)
- [ ] Sample: skeleton; "Could not read the sample — <error>. Retry"; "The table is empty — no rows to show." (web/components/catalog/CatalogTools.tsx:495-497)
- [ ] Findings: "Loading the findings…", "Could not read the findings. Retry", "No finding has read this table yet." (web/components/catalog/CatalogTable.tsx:268-270)
- [ ] History: "The datasets do not list this table.", "Nothing has run over it yet." (web/components/catalog/CatalogTable.tsx:291, :299)
- [ ] Add data: "No sources match."; "Connection created, but it has not appeared in the catalogue yet…"; "No tables yet. Upload a file to create your first one." (web/components/AddDataPanel.tsx:791, :720-722, :601)

### 7. Loads on open
- [ ] **`GET /catalog/tree?workspace_id=` — SPENDS (warehouse) + WRITES**: reads every listed connection's schemas from its own warehouse (in parallel) and reconciles the metastore's Schema rows (`set_catalog_schemas`). Re-runs whenever the workspace or the connection set changes, and on Refresh (web/components/CatalogScreen.tsx:246-275; pramanyx/routers/catalog.py:234-275)
- [ ] **`GET /exploration/{conn}/datasets` once per catalog — SPENDS (warehouse)**: lists the schemas and tables again through `quick_schemas` (uploads answer from their files); layers, off, maturity and budget come from stores (web/components/CatalogScreen.tsx:228-240, :283-299; pramanyx/routers/datasets.py:58-64, :155)
- [ ] **`GET /knowledge/status` — SPENDS (embedding model)**: probes the embedder with one real embedding call; read once per mount (web/components/CatalogScreen.tsx:291-296; pramanyx/knowledge/health.py:32-60)
- [ ] Shell: the selected connection's rich schema `GET /connections/{id}/schema/rich` (SchemaProvider wraps every page) (web/app/page.tsx:1923; web/lib/schema-context.tsx:48-56)
- [ ] Opening a catalog/schema: `GET /metrics?connection_id=`, `GET /ontology?…&ontology_view=draft` per schema (stores only) (web/components/catalog/CatalogScope.tsx:83-100)
- [ ] Settings tab: `GET /connections/{id}/settings`, `GET /exploration/{conn}/status` (polled 60 s), sync status / files reads for connector types (web/components/catalog/CatalogTools.tsx:261-267, :308-322; web/components/ExplorationBadge.tsx:28-46)
- [ ] Docs tab: `GET /documents` and **`GET /knowledge/status` again — SPENDS (embedding) every time Docs opens**, despite the screen's "read once" comment (web/components/catalog/CatalogTools.tsx:424-439)
- [ ] Diagram tab: the rich schema (shared, cached) (web/components/catalog/CatalogScope.tsx:394)
- [ ] Profile tab: `GET /catalog/tree` (UNSCOPED — every connection; same spend/write as above) + `GET /connections/{id}/schema/profile` + `GET /exploration/{conn}/findings` (web/components/SchemaShape.tsx:367-386)
- [ ] Volumes tab: `GET /metastore/catalogs/{id}/volumes` (+ objects); Permissions tab: `GET /workspaces` + `GET /metastore/workspaces/{ws}/grants` per workspace (web/components/catalog/MetastorePanels.tsx:42-48, :139-147)
- [ ] Opening a table: `GET /connections/{id}/tables/{t}/columns`, `GET /exploration/{conn}/findings`, `GET /metrics`, `GET /ontology` (web/components/catalog/CatalogTable.tsx:84-131)
- [ ] Sample tab: **`GET /connections/{id}/tables/{t}/sample?limit=200` — SPENDS (warehouse)** (web/components/catalog/CatalogTools.tsx:480-493; pramanyx/routers/connections.py:696)
- [ ] Table Docs tab: `GET /glossary`, `GET /ontology/column-config` (web/components/catalog/GlossaryPanel.tsx:111-112)
- [ ] Add data: `GET /connectors/types`; uploads: `GET /workspaces/{id}` + `GET /connections` to find the uploads connection (it is created only on the first upload) (web/components/AddDataPanel.tsx:659, :168-176; web/lib/uploadTarget.ts:38)

Top rows today: the shell's PageHeader breadcrumb "Data › Catalog" (web/app/page.tsx:1926, working tree). Inside, two columns each with their own top rows: the tree's top bar ("Catalog" · "+" · ↻) and the "Search catalog…" row (web/components/CatalogScreen.tsx:509-538). On the right, the home has the All / Favorites / Recent switch as its first row. A catalog, schema or table page opens on the PanelHead line (crumbs › name · what it is · state/test chips · "Ask about it" · "Tools ▾") with the TabStrip under it (web/components/catalog/CatalogScope.tsx:137-155; web/components/catalog/CatalogTable.tsx:190-198). The Add data page has its own "Add data" title + close row (web/components/AddDataPanel.tsx:740-760).

---

## Profile

Entry: `ProfileLayer` (web/components/ProfileLayer.tsx:380), rendered by IntelligenceWorkspace.tsx:292 for layer `hub`.
It is reached from the rail row "Profile" (destination Data, row id `intel-hub`, web/lib/navDestinations.ts:56 →
INTEL_LAYER_FOR_TAB `hub`, page.tsx:944, 1704-1708), ⌘K "Profile" (`nav-intel` → `intel` → hub, CommandPalette.tsx:358,
402), and links `?tab=intel-hub` / `?tab=intel` / `?tab=intelligence&layer=hub`. `canvasId` is never passed on the main
screen, so the canvas branches (canvas domains and patterns, the "connection-wide" chip) are unreachable today.

### 1. Controls

**Left column (ProfileLayer.tsx:433-461)**
- [ ] `Overview` row (title "What this business is, and its data") — shows the profile overview (ProfileLayer.tsx:434)
- [ ] Domain rows — name, finding count, a 6px bar against the largest domain, "N promoted to the org" meta, and a hover title "{domain} · N findings". Clicking one opens the domain's page (ProfileLayer.tsx:450-457, 357-376)
- [ ] `Filter domains…` input — shown only when there are more than 8 domains (ProfileLayer.tsx:438-441)
- [ ] `Refresh` — re-reads domains and org promotions (ProfileLayer.tsx:458-460)

**Domain page (ProfileLayer.tsx:302-352)**
- [ ] Tabs `Findings N` · `Patterns` · `Org knowledge N` (Radix TabStrip) (ProfileLayer.tsx:318-322, 337-341)
- [ ] `Search findings…` input — on the Findings tab only. It filters by finding text or angle (ProfileLayer.tsx:338-341, 129-133)
- [ ] Finding row — click to expand or collapse (chevron), with a 2-line clamp when closed and text selectable (ProfileLayer.tsx:97-107)
- [ ] Expanded finding: `Monitor` — **WRITES** an anomaly monitor from the finding's SQL, re-anchoring its window. Disabled with no SQL or "no data" (web/components/BriefingPanel.tsx:1066-1081, 1213-1215)
- [ ] Expanded finding: `Pin` — **WRITES** a guard-checked card on the person's dashboard, with toast "Pinned to your dashboard" or "Couldn't pin finding" (BriefingPanel.tsx:1083-1097, 1216-1218)
- [ ] Expanded finding: `Promote` — **WRITES** the finding to Org intelligence, showing ✓ when done. A failure toasts "Not promoted" with why (BriefingPanel.tsx:1099-1110, 1219-1221)
- [ ] Expanded finding: `Share` — a menu headed "Send to channel" listing each trigger as "type name (disabled)". Choosing one **sends** through the departure gate, which re-runs the finding's query (**SPENDS (warehouse)**), and shows "Sent to X ✓" / "Not sent — why" / "Failed: …". With no triggers it toasts "No delivery channel yet — Add a Slack or webhook trigger in Notifications…" (BriefingPanel.tsx:1112-1134, 1222-1249; ProfileLayer.tsx:418-420)
- [ ] Expanded finding: `Evidence` — opens the Evidence drawer (BriefingPanel.tsx:1250-1251)
- [ ] Expanded finding: `Dismiss` — a browser `window.prompt` asks "Dismiss this finding. Why is it wrong or stale? (optional)". **WRITES** the dismissal, and the row disappears (BriefingPanel.tsx:1054-1064, 1252-1254; ProfileLayer.tsx:99-100)
- [ ] Patterns tab: segmented filter `All · N` / `Recurring angle · N` / `Cross-domain driver · N` / `High-novelty cluster · N` (ProfileLayer.tsx:152-159, 258-259)
- [ ] Patterns tab: `Refresh` / "Refreshing" — recomputes patterns (`refresh=true`) and **WRITES** the pattern cache. No model call (ProfileLayer.tsx:260-262; pramanyx/knowledge/patterns.py:215-236)
- [ ] Pattern row — click to expand or collapse. It shows domains (this one accented), up to 8 entities "+N more", angles and example findings (ProfileLayer.tsx:161-214)
- [ ] Retry buttons on each failed read: domains, patterns, patterns again, and org (ProfileLayer.tsx:247, 264, 282, 445; web/components/ui/states.tsx:84-98)

**Overview (web/components/ProfilePanel.tsx)**
- [ ] `Why Pramanyx thinks so` fold — shows the profile's evidence (ProfilePanel.tsx:207-215)
- [ ] Currency fact: `Confirm {inferred}` — **WRITES** the confirmed currency for this dataset (ProfilePanel.tsx:484-486, 453-466)
- [ ] Currency fact: `Change` / `Another currency` — opens a 3-letter "Currency code" input with `Save` (enabled only for 3 letters), `Clear` (only when confirmed) and `Cancel`. **WRITES** (ProfilePanel.tsx:491-504)
- [ ] Tables card `Copy` / `CSV` — the table profile: table, key, key verified, rows, latest record, average null rate, profiled (ProfilePanel.tsx:260-264)
- [ ] Governed metrics `Deprecated · N` fold — shows deprecated metrics (ProfilePanel.tsx:389-399)
- [ ] Retry on each failed read: business profile, org settings, tables, findings (status and blanks), metrics (ProfilePanel.tsx:69-75, 199, 246, 266, 317, 350, 383)

### 2. Dialogs, drawers, popovers, panels
- [ ] Evidence drawer — a right-side 520px drawer over a scrim. Clicking the scrim closes it, and so does `×` (aria "Close"). There is no Escape handler. Inside: the domain tag; the finding; Confidence / Novelty / Freshness; Entities and Measures chips; the dossier ("Question the explorer asked / the Briefing measured", "Why this holds — the mechanism", "Why it matters", grounded figures ✓/⚠, structural ground: joins with orphans, distributions, lifecycles, null meanings); `Re-validate` / "Re-validating…" with "as of …" and the result line "✓ Confirmed — still holds" / "⚠ Drifted — …" / "✕ Could not re-run — …" (**SPENDS (warehouse)**: re-runs the SQL, and **WRITES** a re-stamp of the dossier, pramanyx/routers/exploration.py:1952-1984); the source query, with `Open in SQL Editor` (opens a new SQL Editor tab named "Evidence: …" and closes the drawer) or "— no query recorded —"; and the trust receipt (job, version, inputs, ✓ guards) (web/components/BriefingPanel.tsx:1411-1551, 1273-1369, 1373-1407; ProfileLayer.tsx:430-431)
- [ ] Share menu — an anchored popover under `Share`, as above (BriefingPanel.tsx:1226-1248)
- [ ] Dismiss reason prompt — a native browser `window.prompt` dialog (BriefingPanel.tsx:1057)
- [ ] Domain page — replaces the Overview beside the column (ProfileLayer.tsx:463-468)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Column "Domains" label with the domain count (ProfileLayer.tsx:436)
- [ ] Domain row count, 6px bar and "N promoted to the org" (ProfileLayer.tsx:366-373, 451-455)
- [ ] Domain header — "N findings · N angles (hover: the angles) · explored P% (hover: the share of the explorer's query budget this domain has spent) · N promoted to the org" (ProfileLayer.tsx:326-333, 64-68)
- [ ] Tab counts — Findings N and Org knowledge N. The Org count is omitted when the read failed (ProfileLayer.tsx:317-322)
- [ ] Finding groups — "High novelty" / "Mid novelty" / "Low novelty", each with a count and a hover range (ProfileLayer.tsx:57-61, 137-145)
- [ ] Expanded finding — angle chip, entities (mono), "P% confidence · novelty N · found X ago" (ProfileLayer.tsx:110-119)
- [ ] Finding action states — "Label ✓" when done, "!" on error, a "no data" chip, the share result text, and "Dismissed ✓ — hidden from intelligence (kept for review)" (BriefingPanel.tsx:1011-1029, 1143-1148, 1255-1263)
- [ ] Pattern row — kind chip (in "All" only), description (one line, full on hover), "N findings · novelty N" (ProfileLayer.tsx:169-180)
- [ ] Org knowledge row — the text, plus "angle · high/mid/low novelty · promoted X ago" (ProfileLayer.tsx:286-292)
- [ ] Overview, The business — "inferred X ago" (exact time on hover), and a "connection-wide" chip (canvas only) (ProfilePanel.tsx:193-196)
- [ ] Industry heading with chip "org setting" / "org setting · corrected" / "✓ held · P%" / "inferred · P%" (hover explains the 0.86 threshold) (ProfilePanel.tsx:410-435)
- [ ] Facts — Model (3-line clamp, full on hover); Currency ("CODE ✓ confirmed", "X suggested by the profile · unconfirmed", or "not known · amounts print plain"); "Fiscal year starts {Month}" with an "org setting" chip, shown only when the setting is not January (ProfilePanel.tsx:218-250, 471-507)
- [ ] Tables card — "N tables · profiled X ago" (hover "Each figure is the profiler's; none records a human decision."). Columns: table, key (✓ verified / "unverified"), rows, latest record ("no timestamp"), blank %, and profiled (only when tables were profiled on different days) (ProfilePanel.tsx:256-309)
- [ ] Status columns card — "N columns · no order claimed", each table.column with up to 8 value pills (terminal ones dashed; hover shows the full value and terminal/active) and "+N more", plus "N transitions" (ProfilePanel.tsx:312-346, 101-119)
- [ ] What a blank means card — "N columns", grouped by meaning ("a data-quality gap" amber chip first), each table.column with its business rule and null rate (ProfilePanel.tsx:348-376, 80-96)
- [ ] Governed metrics card — live count, an "every connection" chip, and each metric's label, "vN" and state chip (proposed / draft / deprecated) with its formula on one line (full SQL on hover) or "no formula recorded" (ProfilePanel.tsx:379-404, 511-534)

### 4. Keyboard shortcuts
- [ ] Arrow keys in the domain TabStrip and the Patterns segmented (Radix default) (web/components/ui/tab-strip.tsx:3; web/components/ui/segmented.tsx:3)
- none page-level (no keydown handler. The Evidence drawer has no Escape)

### 5. URL params / deep links read or written
- [ ] Reached by `?tab=intel-hub`, `?tab=intel`, or `?tab=intelligence&layer=hub`, with `conn=`. Written back as `?tab=intelligence&layer=hub&conn=<id>` (page.tsx:940-946, 1205-1262)
- [ ] NOT in the URL: the selected domain, the domain tab, the search, the domain filter, the pattern filter, expanded rows, and the open Evidence drawer. A domain page cannot be linked to

### 6. Empty / error / loading / withheld states that say something
- [ ] Domains loading — skeleton rows (ProfileLayer.tsx:442-443)
- [ ] Domains failed — "Could not read the domains — {error}." + Retry (ProfileLayer.tsx:444-445)
- [ ] No domains — "No domains yet — the explorer files each finding under one as it runs." (ProfileLayer.tsx:446-447)
- [ ] Filter matches none — "No domain matches." (ProfileLayer.tsx:448-449)
- [ ] Findings — "No finding in this domain matches that search." / "No findings yet for this domain." (ProfileLayer.tsx:134-136)
- [ ] Patterns failed — "Could not read the patterns …" + Retry. After a refresh fails: "Could not read the patterns again — these are the last ones read …" (ProfileLayer.tsx:247, 264)
- [ ] Patterns empty — "No patterns yet — they emerge as the explorer covers more domains and angles." / "No {kind} pattern involves {domain}." Plus "N more patterns involve other domains only." (ProfileLayer.tsx:265-274)
- [ ] Org knowledge failed — "Could not read what this domain promoted to the org …" + Retry (ProfileLayer.tsx:282)
- [ ] Org knowledge empty — "Nothing from this domain is promoted to the org yet — a finding's actions can promote it." (ProfileLayer.tsx:283)
- [ ] No business profile — "No business profile inferred for this schema/connection yet — the explorer infers one when it runs." (ProfilePanel.tsx:200-201)
- [ ] Org settings failed — "Could not read them — a setting a person made may be missing here." + Retry (ProfilePanel.tsx:242-249)
- [ ] No table profile — "No table profile yet — tables are profiled when the connection is first read, and after its schema changes." (ProfilePanel.tsx:267-268)
- [ ] "No status column mapped yet." / "No column's blanks are explained yet." / "No governed metric applies to this connection." (ProfilePanel.tsx:318, 351, 384)
- [ ] Currency read failure — the Currency line is silently left out (ProfilePanel.tsx:450, 467)
- [ ] Triggers read failure — silent. Share then acts as if no trigger exists and toasts "No delivery channel yet" (ProfileLayer.tsx:398)
- [ ] Each Overview card while loading — skeleton rows (ProfilePanel.tsx:72)
- [ ] A finding with no data — "no data" chip, with Monitor / Pin / Promote / Share disabled (title "This finding has no data — nothing to act on") (BriefingPanel.tsx:1136-1141, 1255-1260)

### 7. Loads on open
- [ ] GET `/actions/triggers` — read (web/lib/api.ts:7468-7470; pramanyx/routers/actions.py:103-107; ProfileLayer.tsx:396-400)
- [ ] GET `/exploration/{conn}/domains?schema=` — no model call and no write. **SPENDS (warehouse, metadata)**: `canonical_schema` runs one INFORMATION_SCHEMA query when a schema is passed (pramanyx/routers/_shared.py:589-601, 608-620), and `_connection_col_types` opens the connection and reads its schema, which introspects on a cold schema cache (pramanyx/routers/exploration.py:582-595; pramanyx/routers/_shared.py:28-35) (web/lib/api.ts:2643-2647; ProfileLayer.tsx:404-408; pramanyx/routers/exploration.py:639-672)
- [ ] GET `/org-intelligence?connection_id=&schema=` — read. A 503 when Org is unreadable (web/lib/api.ts:7596; pramanyx/routers/knowledge.py:667-679; ProfileLayer.tsx:411-413)
- [ ] GET `/business-profile?connection_id=&schema_name=` — read, with no inference (web/lib/api.ts:146; pramanyx/routers/profile.py:55-87; ProfilePanel.tsx:129)
- [ ] GET `/org-settings/effective?workspace_id=` — read (web/lib/api.ts:529; pramanyx/routers/orgsettings.py:137; ProfilePanel.tsx:130)
- [ ] GET `/connections/{conn}/schema/profile` — read of the cached profiles. **SPENDS (warehouse, metadata)** on a cold schema cache: it opens the connection and runs `get_schema` (pramanyx/routers/connections.py:613-630; pramanyx/routers/_shared.py:28-35; ProfilePanel.tsx:131)
- [ ] GET `/metrics` — read (web/lib/api.ts:1218; pramanyx/routers/metrics.py:106; ProfilePanel.tsx:132)
- [ ] GET `/exploration/{conn}/findings?schema=` — read of explorer state. **SPENDS (warehouse, metadata)** when a schema is passed (canonical_schema plus the schema filter, pramanyx/routers/exploration.py:526-578; ProfilePanel.tsx:24-26, 133)
- [ ] GET `/business-profile/currency?connection_id=&schema_name=` — read (web/lib/api.ts:8517; pramanyx/routers/profile.py:30-36; ProfilePanel.tsx:446-452)
- [ ] Only when the Patterns tab opens: GET `/exploration/{conn}/patterns?schema=` — no model call. **WRITES** the pattern cache whenever the cached entry is more than 6 h old, even without Refresh (pramanyx/knowledge/patterns.py:26, 215-236; pramanyx/routers/exploration.py:676-690; ProfileLayer.tsx:239-245)
- [ ] Only when the Evidence drawer opens: GET `/exploration/{conn}/findings/{id}/receipt` — read (web/lib/api.ts:9337-9343; pramanyx/routers/exploration.py:1840; BriefingPanel.tsx:1420-1424)

Top rows today: the context bar (Connection · Schema · Maturity) is the only row across the top. The Profile has no title row or toolbar of its own. Its controls are the sticky left column (Overview · Domains label/count · Filter domains… (more than 8) · domain rows · Refresh). On a domain page the header is the domain name with its counts line, then the tab row Findings · Patterns · Org knowledge with `Search findings…` at its right end. Inside Patterns there is a filter segmented and `Refresh`.

---

## Documents

Entry: `DocumentsPage` (web/components/documents/DocumentsPage.tsx:66), dynamically imported at web/app/page.tsx:75 and rendered at web/app/page.tsx:2243 when `tab === "documents"`. Reached by the rail's Data ▸ Documents (web/lib/navDestinations.ts:57), `?tab=documents`, the Catalog's Docs-tab "Documents" link (web/components/catalog/CatalogTools.tsx:464), and the Canvas workspace's documents door (web/app/page.tsx canvas-workspace block).

### 1. Controls
- [ ] "Check a document's numbers" (toggle) — opens or hides the fact-check tool above the list; once opened it stays mounted, so closing it keeps a running check (web/components/documents/DocumentsPage.tsx:298-300, :82-89, :284-289)
- [ ] "+ Add a document" (toggle) — opens or hides the five-step uploader; it stays mounted too (web/components/documents/DocumentsPage.tsx:301-303, :290-294)
- [ ] Needs-you "Add a document" (search down and no documents) (web/components/documents/DocumentsPage.tsx:247)
- [ ] Needs-you "Check again" (search unavailable / index not compared) — re-reads the list and the status — **SPENDS (embedding)** (web/components/documents/DocumentsPage.tsx:248, :279)
- [ ] Needs-you "Restore…" (index and list disagree) — reads first what a restore (or else a re-index) would do; nothing is written yet (web/components/documents/DocumentsPage.tsx:440-444)
  - [ ] "Restore" (after the plan) — puts lost chunks back from the compiled documentation — **WRITES + SPENDS (embedding)** (web/components/documents/DocumentsPage.tsx:447-452, :415-425)
  - [ ] "Correct the list" (after the plan, when nothing can be restored) — re-embeds what the index holds and sets each listed count to it — **WRITES + SPENDS (embedding; "hosted — billed per chunk" said)** (web/components/documents/DocumentsPage.tsx:453-460, :427-436)
  - [ ] "Cancel" / "Try again" (web/components/documents/DocumentsPage.tsx:438, :466-468)
- [ ] Needs-you "Purge orphans…" — dry run of what a purge would delete; then "Purge" (red) / "Cancel" — **WRITES** (deletes index orphans, no re-embed) (web/components/documents/DocumentsPage.tsx:264-275, :146-171)
- [ ] Document row "View" / "Close" — opens the stored document under the row (web/components/documents/DocumentsPage.tsx:506)
- [ ] Document row "⋯" menu (uploads only; the formats are read when it opens) (web/components/documents/DocumentsPage.tsx:529-560), its items:
  - [ ] "Open the original file" (new tab; only when the original is kept) (web/components/documents/DocumentsPage.tsx:539-543)
  - [ ] "Download as <format>" per available format; unavailable ones disabled as "· not installed" (web/components/documents/DocumentsPage.tsx:544-554)
  - [ ] "Remove" (red) — asks on the row first (web/components/documents/DocumentsPage.tsx:556)
- [ ] Row remove confirm "Remove <name>? N chunks leave search and the original file is deleted." → "Remove" (red) / "Keep it" — **WRITES** `DELETE /documents/{id}` (web/components/documents/DocumentsPage.tsx:511-519)
- [ ] Stored document "Original / Markdown" (segmented) (web/components/documents/DocumentsPage.tsx:589-593)
- [ ] Stored document "Open the original file" link (inline, and under a blank PDF frame) (web/components/documents/DocumentsPage.tsx:581-585, :607, :611)
- [ ] "Compiled from your schemas · N · N chunks" fold (when uploads also exist) (web/components/documents/DocumentsPage.tsx:332-336)
- [ ] Every "Retry" on a failed read (web/components/documents/DocumentsPage.tsx:200, :309)

Add a document (uploader)
- [ ] Close (×) (web/components/DocumentUploader.tsx:274)
- [ ] Step 1 drop zone — drop files or click to browse (multiple); Enter/Space opens the picker (web/components/DocumentUploader.tsx:285-299, :332)
- [ ] Step 1 staged file (click) — shows that file in the review; "Remove" per staged file; "Choose different files…" (web/components/DocumentUploader.tsx:313, :324, :327-329)
- [ ] Step 2 "Set how it is cut": delimiter, "Maximum chunk length", "Chunk overlap", "Minimum chunk length" (shorter chunks are discarded) (web/components/DocumentUploader.tsx:336-370)
- [ ] Step 2 checkboxes: "Replace consecutive spaces, newlines and tabs" (on), "Delete all URLs and email addresses" (off), "Keep unlabelled runs of figures out of search" (on) (web/components/DocumentUploader.tsx:374-395)
- [ ] Step 3 "Convert & review" / "Convert again" — reads the file and previews its chunks; stores nothing (`POST /documents/convert`, `POST /documents/preview`) (web/components/DocumentUploader.tsx:407-410, :190-210)
- [ ] "Reset" — clears settings and staged files (web/components/DocumentUploader.tsx:411)
- [ ] Step 5 "Add to knowledge" / "Add N documents" (enabled only after a review under the current settings) — **WRITES + SPENDS (embedding)** `POST /documents/upload` (web/components/DocumentUploader.tsx:412-416, :220-230)
- [ ] Step 4 review view "Original / Markdown / Chunks" (segmented) (web/components/DocumentUploader.tsx:437-441)

Check a document's numbers (fact-check)
- [ ] Close (×) (web/components/FactCheckPanel.tsx:73)
- [ ] "Paste a memo, an email or a deck's text…" textarea (web/components/FactCheckPanel.tsx:86-92)
- [ ] "Or choose a file…" / file "Remove" (web/components/FactCheckPanel.tsx:96-106)
- [ ] "Check the numbers" — checks up to 25 claims against the current connection — **SPENDS (model + warehouse; "a few model calls per claim")** (web/components/FactCheckPanel.tsx:109, :54, :71-72)
- [ ] Result "Export" button and result grid (sort, column ▾, Copy, CSV — the shared results grid) (web/components/FactCheckPanel.tsx:118-128)

Connected sources
- [ ] "+ Confluence" / "+ Notion" (one per source type; "Cancel" while open) — opens the connect form (web/components/KnowledgeSourcesSection.tsx:100-106)
- [ ] Connect form: "Name (e.g. Team <type>)", per-type fields (secret ones masked), "Test & connect" — **WRITES** a source after a live credential test (web/components/KnowledgeSourcesSection.tsx:107-124)
- [ ] Per source "Sync now" — **WRITES + SPENDS (embedding)** a sync (web/components/KnowledgeSourcesSection.tsx:156-158, :89)
- [ ] Per source "N pages were not indexed" disclosure — each skipped page (link) with why (web/components/KnowledgeSourcesSection.tsx:162-178)

### 2. Dialogs, drawers, popovers, panels
- [ ] Add a document tool (inline panel above the list): five numbered steps, chip "nothing stored until step 5" (web/components/DocumentUploader.tsx:270-283)
- [ ] Check a document's numbers tool (inline panel): chips "a few model calls per claim", "first 25 claims", the verdict headline, grid, notes and caveats (web/components/FactCheckPanel.tsx:68-139)
- [ ] Row "⋯" dropdown menu (web/components/documents/DocumentsPage.tsx:529-560)
- [ ] Inline remove confirm on the row (web/components/documents/DocumentsPage.tsx:511-519)
- [ ] Stored document viewer under a row — iframe of the original, or the Markdown in a code block (web/components/documents/DocumentsPage.tsx:567-625)
- [ ] Connect-a-source inline form (web/components/KnowledgeSourcesSection.tsx:107-124)

### 3. Figures, counts, badges, chips, freshness/as-of lines
- [ ] Figure "Documents" — sub "N uploaded · N from your schemas" / "all uploaded" / "all compiled from your schemas" / "none yet" / "could not be read" / "reading…" (web/components/documents/DocumentsPage.tsx:203-207)
- [ ] Figure "Chunks indexed" — the index's own count; sub "matches the list" / "of N listed" / "N of them not listed" / "search status not read"; embedder chip (model name, or amber "no embedder answering") (web/components/documents/DocumentsPage.tsx:208-220)
- [ ] Figure "Sources connected" — count; names, or the available types, or "none yet" (web/components/documents/DocumentsPage.tsx:221-225)
- [ ] Figure "Last added" — date words; the document's name (web/components/documents/DocumentsPage.tsx:226-228)
- [ ] Needs-you rows: "Search is unavailable — <reason>" (+ amber "<model> at <host>"), "The index and this list disagree on N documents" (names, index vs listed counts), "N chunks across N documents are in the index but not listed", "The index was not compared with this list" (web/components/documents/DocumentsPage.tsx:234-281)
- [ ] Group heads "Uploaded · N" and "Compiled from your schemas · N" with "searchable · not uploaded by you" (web/components/documents/DocumentsPage.tsx:316-329)
- [ ] Document row: format chip, name, file name / "original not kept", chunks bar, chunk count (amber chip when the index disagrees), "added <when>" (web/components/documents/DocumentsPage.tsx:487-503)
- [ ] Stored Markdown "N characters · the text every agent, canvas and prompt sees" (web/components/documents/DocumentsPage.tsx:594-598)
- [ ] Uploader: per staged file format chip and size; review line "N characters · N chunks to index · N of M pages read"; amber chips for pages not read (OCR off) and figures kept out of search (web/components/DocumentUploader.tsx:313-322, :442-446, :530-545)
- [ ] Connected source row: type chip, name, "last sync <x> ago / never · N pages indexed · N not indexed", or the error in red (web/components/KnowledgeSourcesSection.tsx:146-158)

### 4. Keyboard shortcuts
- [ ] Enter or Space on the uploader's drop zone opens the file picker (web/components/DocumentUploader.tsx:294)

### 5. URL params / deep links read or written
- [ ] `?tab=documents` and `?conn=` (the connection a memo's numbers are checked against) (web/app/page.tsx:1244-1268)
- [ ] Original file and "Download as" are direct links to `/documents/{id}/original` and the convert URL (web/components/documents/DocumentsPage.tsx:541, :548)
- [ ] Which document is open, which tool is open, and the schema fold are not in the URL

### 6. Empty / error / loading / withheld states that say something
- [ ] "Could not read the search status — <error>. Retry" banner (web/components/documents/DocumentsPage.tsx:200)
- [ ] Needs-you empty: "Nothing needs you · search is up and the index matches the list" / "Nothing needs you that could be checked · the search status was not read" / "Reading the search status…" (web/components/documents/DocumentsPage.tsx:231-233)
- [ ] Search down detail: "A local model — indexing and search work only where it runs. Documents already uploaded are unaffected." / "…nothing can be indexed or searched until this is resolved." (web/components/documents/DocumentsPage.tsx:243-245)
- [ ] "Could not read the documents — <error>. Retry" / "Loading the documents…" / "No documents yet — add one to give agents your own context." (web/components/documents/DocumentsPage.tsx:308-313)
- [ ] Restore plan states: "Reading what a restore would do…", "Nothing to restore from — no compiled documentation is kept for it.", "Uploads' chunks come back only by adding the file again.", "Restored from the compiled documentation — re-reading the index.", "Re-indexed — the list now says what the index holds.", red failure text (web/components/documents/DocumentsPage.tsx:406-468)
- [ ] Purge: "The index could not be read whole, so nothing was planned.", "Purged N — re-reading the status." (web/components/documents/DocumentsPage.tsx:151, :163)
- [ ] "Could not remove it — <error>" (web/components/documents/DocumentsPage.tsx:520)
- [ ] Row menu "Reading the formats…" (web/components/documents/DocumentsPage.tsx:545)
- [ ] Viewer: "Blank? Open the original file — some browsers cannot show it inline. The Markdown view always works."; "A browser cannot display this format…"; "Uploaded before originals were kept, so only its text remains — re-upload it to preview."; "Loading the Markdown…" (web/components/documents/DocumentsPage.tsx:607-622)
- [ ] Uploader hints: "Choose a file to begin. Converting reads it and indexes nothing.", "Settings changed since the last read — convert again…", "This was read under the previous settings.", "Convert at step 3 to see the cut.", "Upload failed" error state (web/components/DocumentUploader.tsx:418-425, :474, :517, :547)
- [ ] Fact-check: "Choose a connection to check numbers against."; "Loading the verdicts — one answer per claim, which can take a few minutes…" (web/components/FactCheckPanel.tsx:81, :114-116)
- [ ] Sources: "None yet — a connected wiki's pages land in the same corpus as an upload."; "Credentials are tested live before anything is saved, then encrypted at rest." (web/components/KnowledgeSourcesSection.tsx:122, :136)

### 7. Loads on open
- [ ] `GET /documents` (web/components/documents/DocumentsPage.tsx:110; pramanyx/routers/knowledge.py:599)
- [ ] **`GET /knowledge/status` — SPENDS (embedding model)**: probes the embedder with one real embedding call ("probe") on every open, every "Check again", after every add, remove, purge or restore (web/components/documents/DocumentsPage.tsx:103-116, :126, :136, :164; pramanyx/routers/knowledge.py:585-596; pramanyx/knowledge/health.py:32-60)
- [ ] `GET /documents/formats` (web/components/documents/DocumentsPage.tsx:115)
- [ ] `GET /knowledge/sources` (web/components/KnowledgeSourcesSection.tsx:57)
- [ ] On "View": `GET /documents/{id}/markdown`; on the row menu: `GET /documents/{id}/formats` (web/components/documents/DocumentsPage.tsx:575, :533)
- [ ] Fact-check panel, when first opened: `GET /documents/formats` (web/components/FactCheckPanel.tsx:42-44)

Top rows today: no title or toolbar of its own. The shell's PageHeader breadcrumb "Data › Documents" sits above (web/app/page.tsx:1926, working tree). The first row is the four figures, then Needs you. The page's two tools are buttons in the "Documents" list card's header: "Check a document's numbers" and "+ Add a document" (web/components/documents/DocumentsPage.tsx:297-304). "Connected sources" has its own header buttons, "+ Confluence" and "+ Notion".

---

## Appendix — features in code that no page reaches today

These exist in the repo and are tested, but nothing renders them. The redesign cannot "remove" them because they are already
unreachable. They are listed so the owner can decide whether any belongs on a page.

- [ ] `BriefingPanel` (the pre-Arc-BG Briefing) — not rendered anywhere (web/components/BriefingPanel.tsx:2557). Its masthead held: a RangeControl with every preset ("What we know", Day, Week, Month, Year, Month to date, Year to date, Custom); `Stop`; a `Tools ▾` menu with Generate/Regenerate brief, `↻ Reload`, `Start`/`Restart` exploration, `Trigger Intel`, `↻ Refresh` (re-run intelligence from scratch), `Stop`, `Schedule` and `Sections` (BriefingPanel.tsx:3307-3388)
- [ ] `BriefingPanel` body — the verdict hero with `Investigate →`, the industry KPI strip, the findings ledger with domain scope chips and per-finding "Which rows the chart draws" segmented, `Evidence` and `Investigate →`, edition covers, the briefing strip, the new-card composer and pinned cards, the inline ask panel, the running-exploration notice, and the paper dateline and edge notice (BriefingPanel.tsx:3389-3727, 1553-2556)
- [ ] `BriefingSections` — the person's own switches for the Briefing's sections (web/components/brief/BriefingSections.tsx). Only `BriefingPanel` renders it
- [ ] `RangeMeasures` / `RangeMeasuresExpected` / `RangeSections` — the measured-metrics ledger with an "Expected next" band column. It booked predictions via GET `readExpectedNext` (web/components/brief/BriefRange.tsx:144-254), along with "What moved", "Too few to call" and "Newer days — early read" (BriefRange.tsx:263-330). They are exported but imported by nothing outside tests
- [ ] `FindingActions` overflow layout (Monitor + Pin inline, with Promote / Share / Evidence / Dismiss under `⋯`) — the Profile uses only the inline layout (BriefingPanel.tsx:1151-1209)
- [ ] The dormant panel's mount spent model calls. That is the source of the owner's note "opening the Briefing can spend model calls". It does not apply to `BriefingEdition`
- [ ] The Intelligence layer tab row and its blurbs — hidden by `hideTabs` on the only mount (see the context bar). The blurbs survive as `blurb` on the rail sections (web/lib/navDestinations.ts:46, 57-70, 80, 90)
