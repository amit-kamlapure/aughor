# Feature inventory: Operations, Settings and the shell

**Date:** 2026-11-10
**Pages:** Health · Monitors · Agent Ops (Overview, Roster, Attention, Automations, Hub, Departures, By duty, Action centre, Developer) · Notifications · Spend · Security & Audit · Evals · Brain map · Settings (Organization, Access, Appearance, Models, System, Integrations) · the shell (top bar, rail, ⌘K palette, global overlays)
**Purpose:** the parity baseline for the platform-wide redesign. The product owner's rule: "Do not remove features as a cost of redesign." Every `- [ ]` line below must still be reachable after the redesign; tick it when you have checked it on the redesigned page.

**How it was made:** read from code only. Nothing was run, no API was called, and no file other than this one was written. Each page has seven sections: Controls; Dialogs/drawers/popovers; Figures/counts/badges/status; Keyboard; URL params; Empty/error/loading/withheld states; Loads on open. Each page ends with a "Top rows today" line naming what sits in its own header or toolbar rows, which the redesign folds into one title row and one toolbar row.

**Line numbers:** taken from the working tree on 2026-11-10 (HEAD d52fde56). `web/app/page.tsx` was being edited live while this was read: the uncommitted PageHeader, StatusStrip and Inspector were added. So its line numbers can be off by a few lines. Every other file was stable.

**Flags:** "WRITES ON OPEN" / "SPENDS ON OPEN" mark a call that changes state, or costs warehouse or model work, just because a page was opened. They are summarised just below.

## Item counts

| Page | Items |
|---|---|
| Health | 29 |
| Monitors | 81 |
| Agent Ops: workspace chrome | 41 |
| Agent Ops: Overview | 165 |
| Agent Ops: Roster | 244 |
| Agent Ops: Attention | 58 |
| Agent Ops: Automations | 220 |
| Agent Ops: Hub | 30 |
| Agent Ops: Departures | 55 |
| Agent Ops: By duty | 51 |
| Agent Ops: Action centre | 57 |
| Agent Ops: Developer | 57 |
| **Agent Ops total** | **978** |
| Notifications | 44 |
| Spend | 70 |
| Security & Audit | 109 |
| Evals | 152 |
| Brain map | 38 |
| Settings: chrome 25, Organization 117, Access 70, Appearance 22, Models 83, System 79, Integrations 134 | 530 |
| Shell | 148 |
| **Total** | **2,179** |

## Calls that write or spend when a page opens

- **GET /control-room/needs-human** (`pramanyx/routers/control_room.py:432`) expires lapsed proposals and resumes parked automation runs whose approvals are answered. A resumed run can finish its remaining chain steps, including governed writes and sends. Three timers call it:
  - the Agent Ops badge, every 20 s on every layer;
  - the Overview, every 15 s and on every `job.state` event;
  - Attention, every 10 s.

  The shell does not poll it, on purpose (`web/components/shell/useNavCounts.ts:17`).
- **GET /catalog/tree** (`pramanyx/routers/catalog.py:273-279`) introspects every connection's warehouse and reconciles the metastore's schema rows. It fires from:
  - opening the Create-agent dialog (Roster);
  - the Brain map / Intelligence when a connection has no declared schema;
  - expanding a pack in Settings ▸ System.
- **POST /mcp-servers/{id}/discover** fires automatically on Settings ▸ Integrations for any MCP server that is signed in but was never discovered. It contacts the remote server and stores its tool list.
- **GET /workspaces** (`pramanyx/routers/workspace.py:49`) runs `ensure_default_workspace()` on every call. That call creates the Default workspace if it is absent and adds newly registered connections to it.
- **GET /connections/{id}/health-scorecard** (Health) runs every targeted metric's SQL on the warehouse on every visit. This is warehouse spend; there is no model call.
- **Outbound fetches on open that write nothing:** Spend and Models fetch the provider's price list (`/usage`, `/obs/usage-summary`, `/llm/models`), at most hourly.
- **No model spend on open was found on any page.** Model spend happens only on a click:
  - Activity: Resume, Restart, Fix all, Run fix;
  - Automations: Propose, Run now;
  - the ⌘K palette: Ask Spotlight, and picking a recent run or a table, which re-asks it as a new chat.

  Evals "Run" replays SQL on the warehouse (cases × iterations) with no confirm.

## Things noticed while reading (not fixed; one line each)

- **Doors to the wrong place:**
  - Agent Ops ▸ Developer "Manage packs" opens Settings at whichever section was open last, not at System, where packs live.
  - Security ▸ Policies "Groups › Access" opens Settings, not the Access section.
- **Not in the URL, so lost on reload:**
  - the Security & Audit lens (only the legacy `?tab=activity` link reads it);
  - the open agent and its tab on the Roster (`?agent=` opens built-in agents only);
  - the Action centre's action record;
  - the focused automation.
- **No confirm:**
  - Access: Revoke, Delete group, remove member;
  - Organization: Re-seed from KB, Unlink, Clear;
  - Roster: Rotate key, Restore revision, Delete alert rule;
  - Departures: Reject;
  - Action centre: grant Withdraw;
  - Developer: method Withdraw, principal Revoke;
  - Security & Audit ▸ Approvals: Revoke a pre-approved scope;
  - Attention: an alert rule's "Test" really fires the alert to its channel.
- **Failures shown as empty or zero:**
  - Agent Ops badges and the rail's badges;
  - the Automations Inbox;
  - playbook versions;
  - Activity with no connection says "No activity recorded yet.";
  - the Overview's "Kill" button fails silently.
- **Stale copy:**
  - the Automations Inbox empty state names the retired `automations.proposals` flag;
  - the System footer says "auto-refreshes every 15s" but it polls every 60 s;
  - the pack deploy hint says "enable the flag".
- **Controls that do nothing:**
  - the Upgrade modal's "See plans →" only closes it;
  - Agent Ops' RangePicker scopes none of Hub, Departures, By duty, Action centre or Developer;
  - its Connection picker scopes only Automations and the Action centre;
  - the Brain map's Schema picker changes nothing.
- **Selecting a "Recent Agent runs" row in ⌘K re-asks its question as a new run.** It does not open the old run.
- **The "Run a chain" automation step has no fields in the step editor.**

---

## Health (`tab=health`)
_Source: web/components/ProcessHealthPanel.tsx (rendered from web/app/page.tsx:2233); figures and rows from web/components/clarity/kit.tsx_

### Controls
- [ ] Set a target (button) — empty state only; clears a stale `?semtab=` and opens Data ▸ Semantic Layer ▸ Metrics, where a metric's target is set (web/components/ProcessHealthPanel.tsx:88, handler web/app/page.tsx:2237)
- [ ] "Semantic Layer › a metric › Edit" chip — a signpost (hover: "open a metric, then its Edit tab: Target value, Warning and Critical"); not clickable (web/components/ProcessHealthPanel.tsx:89)
- [ ] Ask why (per row, Needs you only) — opens a chat and asks "Why is <metric> off target? Find the root cause and the contributing factors." (web/components/ProcessHealthPanel.tsx:121, question at :102)
- [ ] Retry — re-reads the scorecard after a failed read (web/components/ProcessHealthPanel.tsx:75, button web/components/ui/states.tsx:98)
- [ ] Connection scope — the page has no picker of its own; it scores the shell's selected connection (`connectionId` prop) (web/components/ProcessHealthPanel.tsx:47)

### Dialogs, drawers, popovers, panels
- [ ] Needs you section — the metrics off target or at a warning, amber label, count of metrics at its right (web/components/ProcessHealthPanel.tsx:118)
- [ ] Scorecard section — the on-target and not-computed metrics (web/components/ProcessHealthPanel.tsx:127)
- [ ] Hover titles: status dot names its status; metric name and period/benchmark line show full text; variance chip "<+x%> against its target"; "no value" chip "The metric's query failed or returned no value, so it was not scored" (web/components/ProcessHealthPanel.tsx:146-159)

### Figures, counts, badges, status chips, freshness
- [ ] On target figure — count green, sub "of N metrics with a target" (web/components/ProcessHealthPanel.tsx:107)
- [ ] Warning figure — count yellow, amber when non-zero, sub "past the warning line" (web/components/ProcessHealthPanel.tsx:109)
- [ ] Off target figure — count red, red when non-zero, sub "past the critical line" (web/components/ProcessHealthPanel.tsx:111)
- [ ] Not computed figure — count unknown, sub "its query failed or returned nothing" / "every one computed" (web/components/ProcessHealthPanel.tsx:113)
- [ ] Needs you count — "N metrics" at the section's right (web/components/ProcessHealthPanel.tsx:118)
- [ ] Scorecard label count — "N on target · N not computed" (web/components/ProcessHealthPanel.tsx:128)
- [ ] Per row: status dot (green/amber/red/grey) (web/components/ProcessHealthPanel.tsx:146)
- [ ] Per row: metric label + target period · benchmark source (web/components/ProcessHealthPanel.tsx:148-149)
- [ ] Per row: current value formatted by unit (money, percent, days, compact) (web/components/ProcessHealthPanel.tsx:153, formatter :37)
- [ ] Per row: "vs <target>" (web/components/ProcessHealthPanel.tsx:156)
- [ ] Per row: variance chip, toned by status (web/components/ProcessHealthPanel.tsx:159)
- [ ] Per row: status word "off target" / "warning" / "not computed" / "on target" (web/components/ProcessHealthPanel.tsx:163)
- [ ] Sort order: off target, warning, not computed, on target, then by label (web/components/ProcessHealthPanel.tsx:99)
- [ ] No freshness / as-of line on this page (read once per visit; never polled) (web/components/ProcessHealthPanel.tsx:8)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] Reached as `?tab=health` via the shell; the Set a target door deletes `semtab` from the URL before navigating to `semantic` (web/app/page.tsx:2239)

### Empty / error / loading / withheld states
- [ ] "Choose a connection to score its metrics." — no connection selected (web/components/ProcessHealthPanel.tsx:72)
- [ ] "Could not read the scorecard — <error>." + Retry — the read failed (deliberately not shown as "no metrics") (web/components/ProcessHealthPanel.tsx:75)
- [ ] "Loading the scorecard (it runs each metric's query)…" — while reading (web/components/ProcessHealthPanel.tsx:78)
- [ ] "No metric has a target yet, so nothing is scored." + Set a target — no targeted metric (web/components/ProcessHealthPanel.tsx:86)
- [ ] "no value" chip — a metric whose query failed or returned nothing (web/components/ProcessHealthPanel.tsx:154)

### Loads on open
- [ ] GET /connections/{conn_id}/health-scorecard — every targeted metric scored against its target (web/lib/api.ts:1212 → pramanyx/routers/metrics.py:1357) [SPENDS ON OPEN (warehouse): runs each targeted metric's governed SQL on the connection every visit and on Retry; no write, no model call]

**Top rows today:** no header or toolbar row — the page opens straight on the four figures (On target · Warning · Off target · Not computed); its only actions are per-row Ask why and the empty-state Set a target.

## Monitors (`tab=operations`, layer `monitors`)
_Source: web/components/MonitorsPanel.tsx (rendered by web/components/OperationsWorkspace.tsx:95; the workspace hides its layer tabs, `hideTabs` at web/components/OperationsWorkspace.tsx:92, so the left rail is the switcher between Monitors / Notifications / Spend / Security & Audit)_

### Controls
- [ ] View tab "Overview" — figures, Needs you, 12-week chart, monitor list (web/components/MonitorsPanel.tsx:330)
- [ ] View tab "Alerts" (badge = open alerts) — the folded alert list (web/components/MonitorsPanel.tsx:331)
- [ ] + New monitor (trailing the tab strip) — opens the create dialog (web/components/MonitorsPanel.tsx:333)
- [ ] Create first monitor — empty-state door into the create dialog (web/components/MonitorsPanel.tsx:975)
- [ ] Needs you › open-alert row › Acknowledge / Acknowledge all — acks every open alert of that monitor (web/components/MonitorsPanel.tsx:451)
- [ ] Needs you › open-alert row › See alerts — switches to the Alerts view (web/components/MonitorsPanel.tsx:454)
- [ ] Needs you › never-proven row › Check its rule / Check their rules — drills each never-proven rule with a synthetic outlier, nothing sent (POST drill deliver=false), then re-reads proofs; "Checking…" while busy (web/components/MonitorsPanel.tsx:461, loop :295)
- [ ] Needs you › broken-proof row › Edit — opens that monitor's edit dialog (web/components/MonitorsPanel.tsx:469)
- [ ] Monitor row › on/off Switch ("Turn off <name>" / "Turn on <name>") — flips `enabled` via PUT (web/components/MonitorsPanel.tsx:536, :275)
- [ ] Monitor row › Run now — checks the monitor now; result line "No condition met · <read>" or "Would fire: <severity> — <message> · <read> · shown, not sent", clears after 6 s; "running…"/"Error" (web/components/MonitorsPanel.tsx:551, :259)
- [ ] Monitor row › Details (chevron, aria-expanded) — expands the row's details (web/components/MonitorsPanel.tsx:552)
- [ ] Details › Backtest — replays the last year of the monitor's series under its rule, one warehouse query; outcome sentence (web/components/MonitorsPanel.tsx:658)
- [ ] Details › Check rule — feeds a synthetic outlier, nothing sent; outcome sentence + proof re-read (web/components/MonitorsPanel.tsx:659)
- [ ] Details › Send test alert — confirm() "Send a [DRILL] alert through this monitor's real channel? The people it notifies will see it." then delivers a [DRILL] alert (web/components/MonitorsPanel.tsx:660, confirm :614)
- [ ] Details › Edit — opens the edit dialog (web/components/MonitorsPanel.tsx:574)
- [ ] Details › Delete (destructive) — confirm() "Delete this monitor?" then DELETE, reloads (web/components/MonitorsPanel.tsx:575, :250)
- [ ] Alerts view › row › Acknowledge / Acknowledge N — acks the folded group's open alerts (web/components/MonitorsPanel.tsx:720)
- [ ] Form › Name input (placeholder "e.g. Daily revenue drop alert") (web/components/MonitorsPanel.tsx:769)
- [ ] Form › Metric source segmented "From catalog" / "Custom SQL" (web/components/MonitorsPanel.tsx:779)
- [ ] Form › Metric select "Select a metric…" — the monitor's own connection's metrics, approved first; "— waiting for review" / "— draft" suffixes; a kept retired/unknown metric shown with why (web/components/MonitorsPanel.tsx:782-787)
- [ ] Form › Custom SQL textarea (placeholder "SELECT SUM(revenue) FROM orders WHERE date = CURRENT_DATE") (web/components/MonitorsPanel.tsx:790)
- [ ] Form › Alert condition radio cards: Threshold · Anomaly · Trend reversal · Segment drift · Data freshness · Any change, each with a one-line description (web/components/MonitorsPanel.tsx:803, list :59)
- [ ] Form › Threshold: Warning threshold, Critical threshold number inputs (web/components/MonitorsPanel.tsx:819, :824)
- [ ] Form › Threshold: Direction segmented "Alert when below (e.g. revenue)" / "Alert when above (e.g. error rate)" (web/components/MonitorsPanel.tsx:830)
- [ ] Form › Anomaly: Sigma threshold slider 1σ (sensitive)–5σ (strict) (web/components/MonitorsPanel.tsx:840)
- [ ] Form › Anomaly / Trend reversal: History window (days) input 7–365 (web/components/MonitorsPanel.tsx:850)
- [ ] Form › Segment drift: Dimension column input; p-value threshold slider 0.01–0.2 (web/components/MonitorsPanel.tsx:861, :866)
- [ ] Form › Data freshness: Table input, Timestamp column input (default updated_at), SLA (hours) input (web/components/MonitorsPanel.tsx:878, :883, :889)
- [ ] Form › Schedule segmented Hourly · Every 6h · Daily · Weekly · Custom; Custom shows a cron input; otherwise "Runs: <cron>" (web/components/MonitorsPanel.tsx:899-912, presets :68)
- [ ] Form › Grace period (hours) input, with its explanation (web/components/MonitorsPanel.tsx:918)
- [ ] Form › Notification select: In-app + every action trigger "<name> (<type>)" with " — off" for disabled; a stranded channel shown as "no such destination" (web/components/MonitorsPanel.tsx:929-934)
- [ ] Form › Create monitor / Update ("Saving…") — POST or PUT, reloads, closes, returns to Overview (web/components/MonitorsPanel.tsx:952, save :228)
- [ ] Form › Cancel — closes the dialog and drops its error (web/components/MonitorsPanel.tsx:955)
- [ ] Hand-off from the SQL editor's "Schedule" — opens the create dialog on Custom SQL with the statement pre-filled (web/components/MonitorsPanel.tsx:153)

### Dialogs, drawers, popovers, panels
- [ ] New monitor / Edit monitor FormDialog (640px) — the whole monitor form (web/components/MonitorsPanel.tsx:335)
- [ ] Monitor row Details (inline expand) — proof sentence + Backtest / Check rule / Send test alert, "quiet N h after an alert" chip, "made <date>" chip, the custom SQL (pre) or "Watches the metric <label>", Edit, Delete (web/components/MonitorsPanel.tsx:559-577)
- [ ] Native confirm() — "Delete this monitor?" (web/components/MonitorsPanel.tsx:250)
- [ ] Native confirm() — "Send a [DRILL] alert through this monitor's real channel? The people it notifies will see it." (web/components/MonitorsPanel.tsx:614)
- [ ] Needs you section — open alerts by monitor, never-proven monitors, broken proofs (web/components/MonitorsPanel.tsx:442)
- [ ] "Alerts · last 12 weeks" column chart, per-week tooltip "Week of <d>: N alerts — n critical, n warning" (web/components/MonitorsPanel.tsx:477-485)
- [ ] Hover titles: proof chip = the server's proof sentence; "quiet N h" = grace rule; "recovered" = "Back within its limit. A recovery is recorded here and never sent."; "since removed" = "This monitor no longer exists — these alerts are history"; Checks a day figure = "Each check runs the monitor's query on its connection" (web/components/MonitorsPanel.tsx:542, :563, :704, :707, :438)

### Figures, counts, badges, status chips, freshness
- [ ] Alerts tab badge = open alerts (unacknowledged, not closed by a recovery) (web/components/MonitorsPanel.tsx:331, :319)
- [ ] Figure "Monitors" — count; sub "all on" or "N on · N off" (web/components/MonitorsPanel.tsx:427)
- [ ] Figure "Open alerts" — count, amber when non-zero; sub "N acknowledged · N closed by a recovery · last <d> · <removed>" or "none has fired here yet" (web/components/MonitorsPanel.tsx:429)
- [ ] Figure "Proven to fire" — "N of M" or "—"; sub "reading their proofs…" / "N could not be read" / "N delivered end to end" / "none delivered end to end" (web/components/MonitorsPanel.tsx:432)
- [ ] Figure "Checks a day" — summed from enabled crons; sub schedule mix, "· not all counted", or "every monitor is off" (web/components/MonitorsPanel.tsx:437)
- [ ] Needs-you open row: "<monitor> · since removed · N open alerts", detail = alert text, "· value may be mis-computed" (web/components/MonitorsPanel.tsx:448)
- [ ] Needs-you never row: "N monitors have never been proven to fire", detail "Checking feeds each rule a made-up outlier — no query runs and nothing is sent" (web/components/MonitorsPanel.tsx:459)
- [ ] Needs-you broken row: "<name>: its rule did not fire in a drill" / "its test alert was not delivered" + drill detail (web/components/MonitorsPanel.tsx:467)
- [ ] 12-week chart label count "N alerts · <removed> · of the latest 100 read" (web/components/MonitorsPanel.tsx:478)
- [ ] Monitor row: proof chip — proven <d> / alert delivered <d> / rule checked <d> · not delivered / delivery failed / rule did not fire / never proven / proof unread (web/components/MonitorsPanel.tsx:542, words web/lib/monitorSummary.ts:31)
- [ ] Monitor row: "N open" amber chip; "off" chip (web/components/MonitorsPanel.tsx:546-547)
- [ ] Monitor row meta line: rule words · schedule words · channel words · metric label or "your own query" · "last fired <rel> ago" (web/components/MonitorsPanel.tsx:528)
- [ ] Alerts list label "N (latest) · N open" (web/components/MonitorsPanel.tsx:679)
- [ ] Alert row: severity dot (critical red / warning amber / info blue / recovered green) (web/components/MonitorsPanel.tsx:699)
- [ ] Alert row: monitor name, severity word or "recovered" chip, "value may be mis-computed" chip, "since removed" chip (web/components/MonitorsPanel.tsx:702-707)
- [ ] Alert row: message · "was <previous>" · "<rel> ago" or "N times · <d> – <d>" (web/components/MonitorsPanel.tsx:710, :694)
- [ ] Alert row: repeat count "×N" (web/components/MonitorsPanel.tsx:714)
- [ ] Alert row state word: "closed" (hover "Closed by a recovery <rel> ago") / "acknowledged"; settled rows dimmed (web/components/MonitorsPanel.tsx:717-719)
- [ ] Run-now result line and proof outcome line (role=status) (web/components/MonitorsPanel.tsx:557, :662)

### Keyboard shortcuts
- none found (dialog Esc comes from the shared FormDialog)

### URL params / deep links
- [ ] No URL params read or written by the panel; reached as `?tab=operations&layer=monitors` via the shell
- [ ] sessionStorage `pramanyx.monitorDraft.v1` — one-shot hand-off from the SQL editor's Schedule, consumed on mount, only for the same connection (web/lib/query/monitorDraft.ts:20, read web/components/MonitorsPanel.tsx:154)

### Empty / error / loading / withheld states
- [ ] "Loading monitors…" — first read (web/components/MonitorsPanel.tsx:359)
- [ ] "Could not read the monitors — <error>." + Retry (web/components/MonitorsPanel.tsx:358)
- [ ] "No monitors yet" / "A monitor alerts you when a metric crosses a line, drifts, or goes stale." + Create first monitor (web/components/MonitorsPanel.tsx:974)
- [ ] "Nothing needs you · no open alert" / "…, and every monitor has been seen to fire" — Needs you when empty (web/components/MonitorsPanel.tsx:442)
- [ ] "No alerts yet." — Alerts view empty (web/components/MonitorsPanel.tsx:682)
- [ ] "Could not read whether this alert was proven." / "Loading its proof…" — Details proof line (web/components/MonitorsPanel.tsx:653, :656)
- [ ] Page-level red error line (delete/update/ack/drill failure; not repeated while the form is open) (web/components/MonitorsPanel.tsx:357)
- [ ] Form errors: "Name is required", "Connection ID is required", server error (web/components/MonitorsPanel.tsx:229-230, :948)
- [ ] "Alerts stay in-app until a webhook or Slack trigger exists under Operations ▸ Notifications." — no triggers (web/components/MonitorsPanel.tsx:937)
- [ ] "\"<channel>\" names no destination, so these alerts are sent nowhere. Choose one." — stranded channel (web/components/MonitorsPanel.tsx:942)
- [ ] Backtest/drill outcomes: "The backtest could not run.", "The rule did not fire on a synthetic outlier: …", "The rule fired, but delivery failed: …", "The rule fired on a synthetic outlier — no message was sent.", "Delivered a [DRILL] alert through <channel>." (web/components/MonitorsPanel.tsx:625-631)
- [ ] Withheld-by-scope: monitors and alerts filtered fail-closed by workspace and organisation server-side (an unknown workspace returns nothing, not an error) (pramanyx/routers/monitors.py:139-146, :327-339)

### Loads on open
- [ ] GET /monitors?conn_id=&workspace_id= — the monitors (web/lib/api.ts:5495 → pramanyx/routers/monitors.py:135)
- [ ] GET /alerts?conn_id=&limit=100&workspace_id= — latest 100 alerts, recovery-annotated (web/lib/api.ts:5637 → pramanyx/routers/monitors.py:318)
- [ ] GET /metrics — metric labels for rows (failure tolerated) (web/lib/api.ts:1218 → pramanyx/routers/metrics.py:106)
- [ ] GET /actions/triggers — notification destinations, credential URL masked (failure tolerated → null) (web/lib/api.ts:7468 → pramanyx/routers/actions.py:103)
- [ ] GET /monitors/{id}/proof — one per monitor, after the list (web/lib/api.ts:5594 → pramanyx/routers/monitors.py:388)
- [ ] GET /metrics?connection_id= — only when the form opens, the form connection's metrics (cached) (web/components/MonitorsPanel.tsx:756 → web/components/metrics/MetricField.tsx)
- [ ] No GET found that writes; Run now (POST /monitors/{id}/trigger) runs the monitor's query on the warehouse but files and sends nothing (pramanyx/routers/monitors.py:286)

**Top rows today:** one row — tab strip "Overview | Alerts (badge)" on the left, "+ New monitor" at its right end; then the four figures (Monitors · Open alerts · Proven to fire · Checks a day).

## Agent Ops — workspace chrome (all layers)
_Source: web/components/AgenticOpsWorkspace.tsx, web/components/Workspace.tsx, web/components/agentops/RangePicker.tsx, web/components/agentops/useTimeRange.ts, web/lib/agentOpsLayers.ts_

### Controls
- [ ] Layer tab "Overview" (`fleet`) — opens the Overview; hover blurb "What's wrong · what's running · what it cost" (web/components/AgenticOpsWorkspace.tsx:77; web/components/Workspace.tsx:82)
- [ ] Layer tab "Roster" (`agents`) — one agent, fully: health, runs, spend, config (web/components/AgenticOpsWorkspace.tsx:78)
- [ ] Layer tab "Attention" (`attention`) — what needs a human; carries the amber waiting badge (web/components/AgenticOpsWorkspace.tsx:79)
- [ ] Layer tab "Automations" (`automations`) — scheduled agent work and the proposal queue (web/components/AgenticOpsWorkspace.tsx:85)
- [ ] Layer tab "Hub" (`hub`) — every automation on one screen (web/components/AgenticOpsWorkspace.tsx:90)
- [ ] Layer tab "Departures" (`departures`) — what left, what was held; carries the amber "owed" badge (web/components/AgenticOpsWorkspace.tsx:93)
- [ ] Layer tab "By duty" (`duties`) — the week by duty (web/components/AgenticOpsWorkspace.tsx:97)
- [ ] Layer tab "Action centre" (`action-centre`) — every declared action and its level (web/components/AgenticOpsWorkspace.tsx:101)
- [ ] Layer tab "Developer" (`developer`) — packs, doors, service principals, kits, agent contract (web/components/AgenticOpsWorkspace.tsx:102)
- [ ] "?" help button (aria "What is this layer?") at the tab row's right end — opens Spotlight (the ⌘K palette) on the question "help ao", a deterministic platform help topic, not a model call (web/components/AgenticOpsWorkspace.tsx:230; web/components/Workspace.tsx:84-89; pramanyx/agent/platform_tools.py:563)
- [ ] "Connection" select in the context bar — sets the shell's selected connection; options are every connection by name, "choose…" when none is chosen; hover says "Scopes Automations and the Action centre; the Hub and Departures stay hub-wide"; rendered only when the shell passes the setter AND at least one connection was read (web/components/AgenticOpsWorkspace.tsx:231-243)
- [ ] "Range" segmented control 1h / 6h / 24h / 7d / 30d — the ONE time window every layer reads (Overview figures, chart, runs, Roster); tooltips "Last hour" … "Last 30 days"; none selected while a brush stands (web/components/agentops/RangePicker.tsx:29-32; web/components/agentops/useTimeRange.ts:20-26)
- [ ] "brushed · clear" link — appears while a chart brush narrows the range; returns to the named range (web/components/agentops/RangePicker.tsx:33-38)
- [ ] "+ Create agent" button (right end of toolbar) — from ANY layer switches to Roster and (re)opens the create-agent flow (counter, so a second click re-opens) (web/components/AgenticOpsWorkspace.tsx:248-255)
- [ ] Cross-layer drill: "open automation" from any layer → Automations layer opened ON that automation (focusId) (web/components/AgenticOpsWorkspace.tsx:162-166)
- [ ] Cross-layer drill: "open agent" (Overview, Hub) → Roster focused on that agent (charter or persona) (web/components/AgenticOpsWorkspace.tsx:167-170)
- [ ] Cross-layer drill: "open trace" (Roster, Departures) → Overview with its "Every trace" fold open on that deep analysis (web/components/AgenticOpsWorkspace.tsx:216-219)
- [ ] Doors out of the workspace passed to layers: open a run in Runs (recents), Integrations (Settings), a connection's Catalog, chat with an agent, Runs list, Declared actions (Intelligence ▸ Actions), Approvals (Security & Audit ▸ Approvals), Settings (web/app/page.tsx:2168-2200)

### Dialogs, drawers, popovers, panels
- [ ] Create-agent flow — opened by "+ Create agent" or `?create=agent`, rendered inside the Roster layer (inventoried with Roster) (web/components/AgenticOpsWorkspace.tsx:186, 252, 261-262)
- [ ] Layer tab tooltips — each tab's `title` is its blurb (web/components/Workspace.tsx:83)
- [ ] Help answer — rendered by the Spotlight / command palette, not by this workspace (web/components/AgenticOpsWorkspace.tsx:230)

### Figures, counts, badges, status chips, freshness
- [ ] Attention tab badge (amber) — needs-human `count`, polled every 20 s from every layer; hidden at 0 (web/components/AgenticOpsWorkspace.tsx:193-200, 227; web/components/ui/tab-strip.tsx:70-73)
- [ ] Departures tab badge (amber) — departures `awaiting` a person, same 20 s poll; hidden at 0 (web/components/AgenticOpsWorkspace.tsx:196, 227)
- [ ] Range selected state (filled segment) and the brushed marker "brushed · clear" (web/components/agentops/RangePicker.tsx:26-37)

### Keyboard shortcuts
- [ ] Arrow keys move between layer tabs (Radix Tabs roving focus; no own handler) (web/components/ui/tab-strip.tsx:59-60)
- [ ] Arrow keys move within the Range segmented control (Radix SegmentedControl) (web/components/ui/segmented.tsx:3)

### URL params / deep links
- [ ] `?tab=agentic-ops&layer=<fleet|agents|attention|automations|hub|departures|duties|action-centre|developer>` — read and written by the shell (ids frozen) (web/lib/agentOpsLayers.ts:11-13; web/app/page.tsx:1099, 1253-1257)
- [ ] `layer=activity` — a folded layer, resolves to the Overview (web/lib/agentOpsLayers.ts:23-29)
- [ ] Legacy `?tab=fleet|control-room` → Overview, `?tab=agents` → Roster, `?tab=action-centre|developer` → those layers (web/app/page.tsx:972-978)
- [ ] `?agent=<built-in agent id>` — sets the Roster's focused agent on arrival (used by chat's budget refusal), then removed from the address (web/components/AgenticOpsWorkspace.tsx:150-158)
- [ ] `?create=agent` — switches to Roster and opens the create flow, then consumed (palette deep link) (web/components/AgenticOpsWorkspace.tsx:204-214)
- [ ] `?aoRange=<1h|6h|24h|7d|30d>[~<since>~<until>]` — the range (and brush) read after mount and mirrored with replaceState; absent means 24h (web/components/agentops/useTimeRange.ts:55-99)
- [ ] `?conn=<id>` — written by the shell when the Connection picker changes it (web/app/page.tsx:1255)

### Empty / error / loading / withheld states
- [ ] Skeleton rows (6) — while a layer's lazy chunk loads on first visit (web/components/AgenticOpsWorkspace.tsx:20-24)
- [ ] "The Agents workspace hit an error." — ErrorBoundary around the whole workspace (web/app/page.tsx:2169)
- [ ] Connection picker ABSENT (not empty) when the connections read fails or returns none — said nowhere (web/components/AgenticOpsWorkspace.tsx:171-178, 231)
- [ ] Badge reads fail silently (`.catch(() => {})`) — a failed read shows no badge, indistinguishable from zero (web/components/AgenticOpsWorkspace.tsx:194-197)

### Loads on open
- [ ] GET /connections — once, for the picker and run names (web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] GET /control-room/needs-human?limit=1 — on mount and every 20 s while the browser tab is visible, from EVERY layer, for the Attention badge (web/components/AgenticOpsWorkspace.tsx:193-200; web/lib/api.ts:11429 → pramanyx/routers/control_room.py:432) [WRITES ON OPEN: runs `expire_stale()` — flips every lapsed pending proposal to `expired` (pramanyx/actions/inbox.py:562) — and `resume_parked_runs()` — resumes every parked automation run whose approvals are all answered, i.e. finishes those chains' remaining steps, which can dispatch governed writes/sends and any model step they hold (pramanyx/automations/engine.py:3266). `limit=1` trims rows only; counts still scan 500 per source (control_room.py:427-449)]
- [ ] GET /departures/summary — on mount and every 20 s, for the Departures badge; read-only (also reads ask-door uptake from the session log) (web/lib/api.ts:6975 → pramanyx/routers/departures.py:75)
- [ ] Each layer's chunk and reads load on its first visit, then stay mounted (keep-alive); hidden layers and a background browser tab stop polling (web/components/Workspace.tsx:65-102; web/lib/useVisiblePoll.ts)

**Top rows today:** context bar: "Connection" select · layer tab row: Overview · Roster · Attention [badge] · Automations · Hub · Departures [badge] · By duty · Action centre · Developer · "?" (right end) · toolbar: "Range" 1h/6h/24h/7d/30d · "brushed · clear" (when brushed) · "+ Create agent" (right end).

## Agent Ops — Overview (`layer=fleet`)
_Source: web/components/FleetOverviewPanel.tsx (+ web/components/agentops/{ProvenanceDrawer,ActivityChart,UsageLists,DeepRuns,RunPhases,TraceFlow,TraceWaterfall,RunNodes}.tsx, web/components/ActivityStreamPanel.tsx, web/components/TraceExplorerPanel.tsx, web/components/clarity/kit.tsx)_

### Controls
Figures (each a door)
- [ ] "Runs" figure (label "Runs · with background" when background runs are switched in) — opens the provenance drawer for runs started in the range (web/components/FleetOverviewPanel.tsx:431-450)
- [ ] "Failed" figure — opens the drawer: agent-produced failures, restart cut-offs counted apart (web/components/FleetOverviewPanel.tsx:452-473)
- [ ] "Running now" figure — opens the drawer: built-in agents' runs in flight of any age (web/components/FleetOverviewPanel.tsx:475-485)
- [ ] "Model spend" / "Model spend · at least" figure — opens the drawer: priced calls, coverage, fallback (web/components/FleetOverviewPanel.tsx:487-535)
- [ ] Drawer button "Open these runs" — sets the Runs list to "All" and scrolls to it (web/components/FleetOverviewPanel.tsx:448-449)
- [ ] Drawer button "Open failed and stopped runs" — sets the Runs list to "Failed or stopped" (web/components/FleetOverviewPanel.tsx:471-472)
- [ ] Drawer button "Open what is running" ("with a Kill on each") — sets the Runs list to "Running" (web/components/FleetOverviewPanel.tsx:484)
- [ ] Drawer close "×" (web/components/agentops/ProvenanceDrawer.tsx:81-82)
Needs you (top 3 waiting rows)
- [ ] "Open Attention" link — switches to the Attention layer (web/components/FleetOverviewPanel.tsx:545)
- [ ] "Accept" on a row that decides a proposal (inbox proposal, or automation approval carrying `proposal_id`) — POST accept, actor "agent-ops" (web/components/FleetOverviewPanel.tsx:576-579, 349-359)
- [ ] "Reject" on the same rows (web/components/FleetOverviewPanel.tsx:580-581)
- [ ] "Open in Attention" — proposal/alert rows with nothing to decide here (web/components/FleetOverviewPanel.tsx:98-101, 584-586)
- [ ] "Open & resume" — paused deep run, opens it in the shell's Runs screen (web/components/FleetOverviewPanel.tsx:342; web/app/page.tsx:2180-2183)
- [ ] "Open automation" — automation approval / broken automation, opens the Automations layer ON that automation (web/components/FleetOverviewPanel.tsx:343-345)
Chart
- [ ] Chart mode segmented "Runs by agent" / "Tokens by model" (web/components/FleetOverviewPanel.tsx:66-69, 603-604)
- [ ] Legend swatch buttons — click hides/shows a series ("Hide X" / "Show X"); tokens mode names at most 8 models (web/components/FleetOverviewPanel.tsx:391, 616-628)
- [ ] Checkbox "include N background runs" (runs mode only) — switches the automation engine's per-minute check into the figures and chart (refetch with include_runners) (web/components/FleetOverviewPanel.tsx:630-636)
- [ ] Click a bar — narrows the WHOLE surface's range to that bucket (writes the shared range) (web/components/agentops/ActivityChart.tsx:119-128)
- [ ] Drag across bars — brushes a span; figures, runs, Roster follow (web/components/agentops/ActivityChart.tsx:107-128)
- [ ] Hover a bar — tooltip with per-series values (web/components/agentops/ActivityChart.tsx:113-117, 216-246)
- [ ] "Clear the brushed range" link under the chart (web/components/FleetOverviewPanel.tsx:652-655)
Agents card
- [ ] Agent name button (with chevron) — expands/collapses the row's details (web/components/FleetOverviewPanel.tsx:767-774)
- [ ] "Pause" / "Resume" per agent — PATCH enabled on a built-in or custom agent (web/components/FleetOverviewPanel.tsx:329-339, 795)
- [ ] "Open" per agent — Roster focused on that agent (web/components/FleetOverviewPanel.tsx:796)
Where the tokens went (three lists)
- [ ] "top 3 of N · all ›" / "top 3" toggle on each list (models, roles, call sites) (web/components/agentops/UsageLists.tsx:120-124)
- [ ] "Explore ›" on a model row — opens the Live events fold filtered to that model + provider (web/components/agentops/UsageLists.tsx:74, 137-139)
- [ ] "Explore ›" on a role row — opens Live events filtered to that role (none for "(unattributed)") (web/components/agentops/UsageLists.tsx:83)
- [ ] Call-site rows — no drill, by design (web/components/agentops/UsageLists.tsx:86-94)
Runs card
- [ ] Run filter segmented "Running" / "Failed or stopped" / "Succeeded" / "All" (web/components/FleetOverviewPanel.tsx:74-79, 680-681)
- [ ] "Kill" on each running row — POST cancel; a failure is swallowed silently (web/components/FleetOverviewPanel.tsx:686, 882)
Deep runs card
- [ ] "Open" / "Close" per question — opens its phases and its trace beside it (web/components/agentops/DeepRuns.tsx:119-122)
- [ ] "+N more questions · all ›" / "the first 5" (web/components/agentops/DeepRuns.tsx:77-82)
- [ ] "Each time it ran:" — one button per run of a repeated question, picks which run is shown (web/components/agentops/DeepRuns.tsx:149-158)
- [ ] "Open & resume" in a paused run's phases — opens the run in Runs to resume (web/components/agentops/RunPhases.tsx:157-160)
- [ ] Embedded trace view (all TraceView controls below) beside the phases (web/components/agentops/DeepRuns.tsx:165-175)
Live events fold
- [ ] Fold "Show" / "Hide" (web/components/clarity/kit.tsx:220-222; web/components/FleetOverviewPanel.tsx:697-698)
- [ ] "filtered to <model|role> — clear" (web/components/FleetOverviewPanel.tsx:704-707)
- [ ] Kind chip "all" (web/components/ActivityStreamPanel.tsx:147-148)
- [ ] Kind chips "<kind> · N" — built from the data's own histogram; toggle a kind filter (web/components/ActivityStreamPanel.tsx:149-154)
- [ ] "N routine guardrail checks / PII checks hidden · show" (web/components/ActivityStreamPanel.tsx:156-160)
- [ ] "routine checks shown · hide" (web/components/ActivityStreamPanel.tsx:161-164)
- [ ] "errors only" toggle (web/components/ActivityStreamPanel.tsx:166-167)
- [ ] "trace" on an event row — opens the Every trace fold on that trace (web/components/ActivityStreamPanel.tsx:230-231; web/components/FleetOverviewPanel.tsx:410-414)
Every trace fold (trace explorer)
- [ ] Fold "Show" / "Hide" (web/components/FleetOverviewPanel.tsx:711-712)
- [ ] "one deep analysis's traces — show all" — drops the deep-analysis narrowing (web/components/FleetOverviewPanel.tsx:720-726)
- [ ] Search "Search question or answer…" — applies on Enter or blur (server-side) (web/components/TraceExplorerPanel.tsx:156-165)
- [ ] Hide runs index (panel icon) / Show runs index (collapsed rail button) (web/components/TraceExplorerPanel.tsx:122-125, 166-169)
- [ ] Status filter "All" / "OK" / "Failed" / "No result" (web/components/TraceExplorerPanel.tsx:175-182)
- [ ] "User ID" filter input — disabled "User ID — none recorded" until any run records a user (web/components/TraceExplorerPanel.tsx:190-195)
- [ ] Duration select "Any duration" / over 1s / over 10s / over 1m (web/components/TraceExplorerPanel.tsx:196-205)
- [ ] Tokens select "Any tokens" / over 1K / over 10K / over 100K (web/components/TraceExplorerPanel.tsx:206-215)
- [ ] "Clear filters" (when any filter set) (web/components/TraceExplorerPanel.tsx:217-223)
- [ ] Trace row — selects the run for the trace view (web/components/TraceExplorerPanel.tsx:243-279)
- [ ] Page size select 10 / 25 / 50 / 100 (web/components/TraceExplorerPanel.tsx:291-296)
- [ ] "‹" / "›" paging (web/components/TraceExplorerPanel.tsx:297-302)
- [ ] Resizable index/canvas divider — drag; double-click resets; width persists in localStorage `split:traces-index` (web/components/TraceExplorerPanel.tsx:144-148; web/components/ResizableSplit.tsx:74-83, 137)
Trace view (in the fold and in a deep run)
- [ ] Reading tabs "Flow" / "Waterfall" / "Events" / "Logs" / "Feedback" (default Flow) (web/components/TraceExplorerPanel.tsx:502-510)
- [ ] Events: "← Step" / "Step →" replay through the run (web/components/TraceExplorerPanel.tsx:546-552)
- [ ] Events: "Show all" — leave replay (web/components/TraceExplorerPanel.tsx:558-562)
- [ ] Events: click a row — expands its detail grid and payload JSON (web/components/TraceExplorerPanel.tsx:576-578, 616-634)
- [ ] Feedback: note textarea "Optional note (what was right or wrong)" (web/components/TraceExplorerPanel.tsx:701-704)
- [ ] Feedback: "Helpful" / "Unhelpful" — records a run judgement (web/components/TraceExplorerPanel.tsx:705-709)
- [ ] Feedback: corrected-SQL textarea — only when ONE SQL statement ran (web/components/TraceExplorerPanel.tsx:753-759)
- [ ] Feedback: "Accept" / "Needs correction" / "Reject" verdict on the finding — only with a deep-analysis id (web/components/TraceExplorerPanel.tsx:760-767)
Flow canvas (TraceFlow)
- [ ] "N guardrails hidden" / "Guardrails shown" toggle (web/components/agentops/TraceFlow.tsx:1209-1221)
- [ ] "Group repeats" / "Grouped" toggle (default on above a node threshold) (web/components/agentops/TraceFlow.tsx:1238-1244)
- [ ] "Collapse all" — re-folds expanded repeat stacks (web/components/agentops/TraceFlow.tsx:1231-1236)
- [ ] "Timeline" / "Hide timeline" — opens the docked rail (web/components/agentops/TraceFlow.tsx:1247-1252)
- [ ] Canvas pan + zoom, and React Flow controls zoom in / zoom out / fit view (nodes not draggable) (web/components/agentops/TraceFlow.tsx:1258-1297)
- [ ] Node "Details" / "Hide details" — one open at a time (web/components/agentops/TraceFlow.tsx:665-677)
- [ ] Stacked repeats card (×N) — click expands the stack (web/components/agentops/TraceFlow.tsx:776-781)
- [ ] "collapse ×N" on an expanded stack's first card (web/components/agentops/TraceFlow.tsx:639-648)
- [ ] Rail node list — click selects, centres and opens that node (web/components/agentops/TraceFlow.tsx:879-883)
Waterfall
- [ ] Row hover highlight only (no click is wired from the trace view) (web/components/agentops/TraceWaterfall.tsx:118-123)

### Dialogs, drawers, popovers, panels
- [ ] Provenance drawer "Where this number comes from" (right, 372px, page stays visible): eyebrow, title, big value, Range, Definition, Out of, Coverage, fact rows, the open-list button, closing note (web/components/agentops/ProvenanceDrawer.tsx:57-126)
- [ ] Runs drawer facts: typical run, slow run (95th) (web/components/FleetOverviewPanel.tsx:447)
- [ ] Failed drawer facts: cut off by a restart (web/components/FleetOverviewPanel.tsx:470)
- [ ] Running-now drawer facts: agents on, paused; denominator = runs in flight of every kind (web/components/FleetOverviewPanel.tsx:482-483)
- [ ] Model-spend drawer facts: tokens from N runs, runs with no usage, calls with no usage, fell back to another provider; note "A floor, not a total…" (web/components/FleetOverviewPanel.tsx:522-534)
- [ ] Chart hover tooltip: bucket time · N runs, per-series values, "click to filter · drag to brush" (web/components/agentops/ActivityChart.tsx:216-246)
- [ ] Agent row details: runs · failed · cut off, tokens, queries, usage completeness, "about X a run", "spend measured from the run records / the session log", kinds of run owned (web/components/FleetOverviewPanel.tsx:799-815)
- [ ] Deep-run detail: "Phases" column + trace view column (560px) (web/components/agentops/DeepRuns.tsx:148-177)
- [ ] Phases panel: status · branch · checkpoint step · last wrote; topology chain with the paused gate marked; phase rows (status chip, name, summary/skip reason); paused banner (web/components/agentops/RunPhases.tsx:86-163)
- [ ] Live events fold (460px) — mounted on first open, kept after (web/components/FleetOverviewPanel.tsx:697-710; web/components/clarity/kit.tsx:211-229)
- [ ] Every trace fold (640px) — mounted on first open, or opened by another layer's drill and scrolled into view (web/components/FleetOverviewPanel.tsx:214-221, 283-285, 711-728)
- [ ] Trace view header: run title (full question on hover), events count, duration, "via <service>", built-in agent, "custom agent <id>", model or "N models", "deep analysis <id>", ok/failed chip (web/components/TraceExplorerPanel.tsx:471-499)
- [ ] Event detail grid: model, prompt/completion tokens, retries, rows returned, error class, session, agent, payload JSON, "prompt content captured" note (web/components/TraceExplorerPanel.tsx:616-634, 807-828)
- [ ] Logs tab: journal lines (kind chip, time), tolerated errors with "tolerated because: <reason>" (web/components/TraceExplorerPanel.tsx:645-693)
- [ ] Feedback tab: "Was this run helpful?", run-feedback list, "Verdicts on record · <conn>" list (web/components/TraceExplorerPanel.tsx:695-792)
- [ ] Flow timeline rail: "Timeline", Origin (service / "inside the platform" / agent / custom agent / connection / job), Timing (wall, busy, idle, overlapped, tokens), clickable node index (web/components/agentops/TraceFlow.tsx:830-910)
- [ ] Flow node detail: kind, at, offset, waited before, provider, role, fallback, retries, rows, error, payload (web/components/agentops/TraceFlow.tsx:680-728)

### Figures, counts, badges, status chips, freshness
- [ ] Runs value; "a floor" chip when truncated; "typical X · slow Y" or "none finished yet" (web/components/FleetOverviewPanel.tsx:431-437)
- [ ] Failed value (red when > 0); "N% of finished runs" / "nothing finished yet"; "+N cut off by a restart" chip (web/components/FleetOverviewPanel.tsx:452-461)
- [ ] Running now value; "X of N agents on · P paused" (web/components/FleetOverviewPanel.tsx:475-477)
- [ ] Model spend value; "N% of calls priced" chip; "N tokens"; "· N calls"; "· N% fell back" (amber when any); "calls not read" chip; "N unmetered" chip (web/components/FleetOverviewPanel.tsx:487-513)
- [ ] Needs you: amber edge when waiting; "N items waiting"; source word (proposal / paused run / automation / alert / broken automation); live waiting timer ticking each second (red for paused runs, amber otherwise); " *" when aged from run start; "+N more in Attention" (web/components/FleetOverviewPanel.tsx:542-596, 87-90, 298)
- [ ] Chart caption "<range> · per hour/day/…"; "N% of calls named a model" chip (tokens) (web/components/FleetOverviewPanel.tsx:605-612)
- [ ] Chart axes (y ticks, bucket labels), stacked bars by agent colour, hatched runners, brush highlight (web/components/agentops/ActivityChart.tsx:155-213)
- [ ] Agents card header "N built-in · M custom" (web/components/FleetOverviewPanel.tsx:660-661)
- [ ] Agent row: colour swatch (= its chart series), "paused" chip or "N running" chip, role, "· N tokens", "· N failed", "+N cut off", "N unmetered", "not counted as runs", 24h sparkline, runs count, last run "Xm ago" (web/components/FleetOverviewPanel.tsx:770-793)
- [ ] Background runner row: hatched swatch, "background · never in the agents' totals", sparkline, "N checks", last run, "N failed" (web/components/FleetOverviewPanel.tsx:821-845)
- [ ] Token lists: model (provider · calls · % failed · without usage), role (calls), call site (calls · without usage, "prompt tokens"); token value per row; mean ms on hover (web/components/agentops/UsageLists.tsx:64-104)
- [ ] Run state marks: running / waiting to start / paused / succeeded / failed / cancelled / stopped at its budget / cut off by a restart (web/components/FleetOverviewPanel.tsx:110-118, 849-856)
- [ ] Running rows: title (raw on hover), state, agent, "started X ago", duration; "+N more running" past 60 (web/components/FleetOverviewPanel.tsx:868-886)
- [ ] Ranged runs: "a floor · the newest 200 of <kinds>" chip; folded groups "×N", "latest X ago · typical Y", errors on hover; "+N more kinds of run" past 40 (web/components/FleetOverviewPanel.tsx:905-938)
- [ ] Deep runs: "in the newest 30 runs"; "scheduled" chip or "asked"; "×N"; status (complete / status mark); age (web/components/agentops/DeepRuns.tsx:58-62, 108-118)
- [ ] Live events fold meta: "N recent events · M of them guardrail checks, the routine ones hidden until asked for" (web/components/FleetOverviewPanel.tsx:699-703)
- [ ] Every trace fold meta: "N traces in the newest M events · search by question or answer, filter by result, duration, tokens" (web/components/FleetOverviewPanel.tsx:713-719)
- [ ] Stream status chip "live" / "polling" (web/components/ActivityStreamPanel.tsx:168-171)
- [ ] Stream row: relative time, kind chip, name/question, model, error class, "failed", tokens, duration, built-in agent, role, "fell back", agent id (web/components/ActivityStreamPanel.tsx:189-229)
- [ ] Trace list row: question, "→ answer", time, "u:<user>", "N llm · N tools", duration, tokens, "N err", "failed", "no result recorded", "$cost · N unpriced" (web/components/TraceExplorerPanel.tsx:250-278)
- [ ] Paging line "a–b of N · last M events"; collapsed rail "N runs" (web/components/TraceExplorerPanel.tsx:129-132, 287-290)
- [ ] Waterfall stats: wall, working (% of wall), waiting, nodes (model calls), tokens (prompt); "slowest" tag; per row tokens, "+gap", duration (web/components/agentops/TraceWaterfall.tsx:87-182)
- [ ] Events replay counter "N events" / "step i of N" (web/components/TraceExplorerPanel.tsx:553-557)
- [ ] Logs "N journal lines · M swallowed errors" (web/components/TraceExplorerPanel.tsx:653-660)
- [ ] Feedback "N helpful · M unhelpful"; verdict chips accept/correct/reject; "this run" chip (web/components/TraceExplorerPanel.tsx:710-714, 776-788)
- [ ] Flow: "N repeats folded"; "×N" on stacks; rail "N spans · M model calls" (web/components/agentops/TraceFlow.tsx:1228, 790, 836-840)

### Keyboard shortcuts
- [ ] Escape closes the provenance drawer (web/components/agentops/ProvenanceDrawer.tsx:48-54)
- [ ] Enter in the trace search applies it (web/components/TraceExplorerPanel.tsx:161-163)
- [ ] Enter / Space on a stacked-repeats card expands it (web/components/agentops/TraceFlow.tsx:781)
- [ ] Arrow keys inside the chart-mode and run-filter segmented controls (Radix) (web/components/ui/segmented.tsx:3)

### URL params / deep links
- [ ] Reads the shared range (`?aoRange=`) through the workspace; a bar click or drag writes since/until into it (web/components/agentops/useTimeRange.ts:91-99; web/components/agentops/ActivityChart.tsx:126-127)
- [ ] Trace focus from other layers (Roster, Departures) opens "Every trace" on a deep analysis — a prop, not a URL (web/components/FleetOverviewPanel.tsx:214-221)
- [ ] Trace index width in localStorage `split:traces-index` (not URL) (web/components/ResizableSplit.tsx:74-83)

### Empty / error / loading / withheld states
- [ ] "Could not read the overview — <error>." + Retry (first read failed) (web/components/FleetOverviewPanel.tsx:361-363)
- [ ] "Loading the overview…" (web/components/FleetOverviewPanel.tsx:364-366)
- [ ] "Could not read the overview again — the figures below are from the last read." (web/components/FleetOverviewPanel.tsx:538)
- [ ] "Not done — <error>" — a pause/accept/reject the server refused (web/components/FleetOverviewPanel.tsx:539)
- [ ] "Could not read what needs a person" + Retry (web/components/FleetOverviewPanel.tsx:548-549)
- [ ] "Nothing waits on a person." — hover: every source was read (web/components/FleetOverviewPanel.tsx:550-553)
- [ ] "Could not read the run chart / the token chart"; "Loading the run chart…"; "No agent runs in this range." / "No model calls in this range." (web/components/FleetOverviewPanel.tsx:639-645)
- [ ] "Could not read where the tokens went"; "Loading where the tokens went…"; "No model calls in this range." / "No call in this range recorded a role." / "No call in this range named where it was made." (web/components/agentops/UsageLists.tsx:53-62, 99-104)
- [ ] "Could not read what is running"; "Nothing running right now." (web/components/FleetOverviewPanel.tsx:863-865)
- [ ] "Could not read the runs"; "Loading the runs…"; "No failed or stopped runs in <range>." / "No succeeded runs in <range>." / "No agent runs in <range>." (web/components/FleetOverviewPanel.tsx:897-914)
- [ ] "Could not read the deep runs"; "Loading the deep runs…"; "No deep runs in the newest 30 runs." / "No deep runs yet — ask a “why” question to start one."; "…again — these are from the last read" (web/components/agentops/DeepRuns.tsx:63-71)
- [ ] "Could not read which trace holds this run" + Retry; "Loading its trace…" (web/components/agentops/DeepRuns.tsx:167-171)
- [ ] Phases: "Could not read this run's phases"; "No phase record for this run."; "Loading its phases…"; "No phases recorded yet." / "This run left no checkpoint — its phase history is not reconstructible."; "Paused at <gate> — resume with feedback from the Agent view." (web/components/agentops/RunPhases.tsx:82-156)
- [ ] Stream: "Could not read the live events"; "Only routine <checks> among the newest N events."; "No events for <model|role> in this window."; "Quiet — recording is on; events will appear the moment an agent does anything."; "No matching events." (web/components/ActivityStreamPanel.tsx:176-185)
- [ ] Traces list: "Could not read the traces"; "Loading…"; "No run matches these filters."; "Recording is on — the next question asked will appear here as a trace." (web/components/TraceExplorerPanel.tsx:233-240)
- [ ] Trace view: "Could not read this trace"; "Not recorded — enable obs.session_log."; "The log holds no trace under this id."; "Loading the trace…"; "Select a trace." (web/components/TraceExplorerPanel.tsx:456-463)
- [ ] "This run predates the laid-out timeline…" (Waterfall and Flow tabs) (web/components/TraceExplorerPanel.tsx:517-520, 531-534)
- [ ] "This run recorded no events. Nothing to lay out — not an error, and not a zero." (web/components/agentops/TraceWaterfall.tsx:74-79)
- [ ] "This run recorded no nodes to draw." / "This run is a single sequence — nothing nested inside anything else…" (web/components/agentops/TraceFlow.tsx:1181, 1199)
- [ ] Node: "This row carries no payload." / "Prompt content was not captured for this run (obs.prompt_capture was off)." / "No stored row matched this node, so there is nothing further to show." (web/components/agentops/TraceFlow.tsx:713, 721, 727)
- [ ] Events: "no result recorded — entry-side evidence of a hang or cancel" (web/components/TraceExplorerPanel.tsx:595-599)
- [ ] Logs: "No kernel journal lines for this run. Spans are recorded separately — the waterfall is unaffected." (web/components/TraceExplorerPanel.tsx:646-650)
- [ ] Feedback: "This trace recorded no deep analysis id (a quick turn), so there is no finding to accept or reject…"; verdicts "None yet." (web/components/TraceExplorerPanel.tsx:735-740, 771-772)
- [ ] Withheld chips: "a floor", "calls not read", "N unmetered", "N% of calls priced", "not counted as runs", "count not read" on fold headers (web/components/FleetOverviewPanel.tsx:435, 491-513, 702, 717, 783)
- [ ] Kill failure is swallowed (`.catch(() => {})`) — nothing is said (web/components/FleetOverviewPanel.tsx:686)

### Loads on open
- [ ] GET /control-room/fleet?range=…|since&until[&include_runners=true] — on open, every 15 s while visible, and on every `job.state` kernel event; read-only (web/lib/api.ts:11383 → pramanyx/routers/control_room.py:138)
- [ ] SSE /events/stream — the shared kernel event stream, filtered to `job.state`, drives refetches (web/components/FleetOverviewPanel.tsx:291-295; web/lib/events.ts → pramanyx/routers/events.py:69)
- [ ] GET /jobs?state=active&limit=200 — same 15 s / event cycle (web/lib/api.ts:9219 → pramanyx/routers/jobs.py:71)
- [ ] GET /obs/timeseries?source=jobs&range — same cycle (web/lib/api.ts:11550 → pramanyx/routers/obs.py:678)
- [ ] GET /control-room/needs-human?limit=100 — same 15 s cycle plus every `job.state` event (web/lib/api.ts:11429 → pramanyx/routers/control_room.py:432) [WRITES ON OPEN: expires lapsed proposals and resumes parked automation runs whose approvals are answered — see chrome; this layer adds its own calls on top of the workspace's 20 s badge poll]
- [ ] GET /obs/usage-summary?range — same cycle (web/lib/api.ts:11616 → pramanyx/routers/obs.py:716) [outbound on open: `ensure_catalogue_prices()` fetches the provider (OpenRouter) model catalogue at most hourly into an in-process price cache (pramanyx/obs/usage.py:177, 223); no model spend]
- [ ] GET /activity?limit=1 — once, for the Live events fold's count (web/lib/api.ts:11627 → pramanyx/routers/obs.py:828)
- [ ] GET /traces?limit=1 — once, for the Every trace fold's count (web/lib/api.ts:11235 → pramanyx/routers/obs.py:176)
- [ ] GET /investigations?limit=30 — Deep runs, on open and every 20 s (web/lib/api.ts:11701 → pramanyx/routers/investigations.py:6384)
- [ ] GET /obs/timeseries?group=model&measure=tokens — only after "Tokens by model" is chosen, then every 15 s (web/components/FleetOverviewPanel.tsx:256-263)
- [ ] GET /jobs?kind=<k>&range&limit=200 — one per agent kind, only when the run filter is not "Running", every 30 s (web/components/FleetOverviewPanel.tsx:308-321)
- [ ] On a deep run's Open: GET /traces?investigation_id&limit=1, GET /investigations/{id}/graph, GET /traces/{id} (web/components/agentops/DeepRuns.tsx:141; web/components/agentops/RunPhases.tsx:76 → pramanyx/routers/investigations.py:6417; pramanyx/routers/obs.py:246)
- [ ] On Live events' first open: GET /activity?kind&errors_only&limit=100|300&model&provider&role&range + SSE /activity/stream?kind&errors_only&since_seq, 15 s fallback poll when the stream is down (web/components/ActivityStreamPanel.tsx:93-137 → pramanyx/routers/obs.py:828, 868)
- [ ] On Every trace's first open: GET /traces?filters&limit&offset; on selecting a trace GET /traces/{id} (web/components/TraceExplorerPanel.tsx:78-98, 345-353)
- [ ] Logs tab: GET /traces/{id}/logs; Feedback tab: GET /traces/{id}/feedback and GET /verify/verdicts?connection_id&limit=50 (web/lib/api.ts:11783, 11754, 11680 → pramanyx/routers/obs.py:499, 473; pramanyx/routers/verify.py:56)
- [ ] Writes by controls (not on open): PATCH /agents/{id} or /agents/custom/{id} (Pause/Resume); POST /jobs/{id}/cancel (Kill); POST /kinetic-actions/inbox/{id}/accept|reject; POST /traces/{id}/feedback (also pins the run's evidence past the 14-day sweep, pramanyx/routers/obs.py:427, 469); POST /verify/verdict (web/lib/api.ts:9291, 10433, 9238, 7401, 7434, 11739, 428)

**Top rows today:** the Overview has no header or toolbar of its own (it lives under the workspace chrome); its top is the four figure tiles Runs · Failed · Running now · Model spend, then the "Needs you" card whose label row carries "N items waiting · Open Attention". Card-level header controls further down: the chart's "Runs by agent / Tokens by model" segmented + range caption, and the Runs card's "Running / Failed or stopped / Succeeded / All" segmented.

## Agent Ops — Roster (`layer=agents`)
_Source: web/components/AgenticAgentsPanel.tsx (+ children: web/components/agentops/CreateAgentFlow.tsx, AgentSlackDoor.tsx, AgentDoors.tsx, AgentMap.tsx (+ web/lib/agentMap.ts), AgentAlertRulesPanel.tsx, RunTimeline.tsx, Term.tsx; web/lib/agentEval.ts for the eval chip)_

The Roster is an INDEX (one table, two groups); clicking a row replaces the index with that agent's PAGE (breadcrumb back). A custom agent's page has 8 tabs; a built-in agent's page is one scrolling body. Create-an-agent is a dialog over either.

### Controls

#### Workspace chrome that acts on this layer (owned by AgenticOpsWorkspace, listed here because it drives the Roster)
- [ ] Layer tab "Roster" — opens this layer; tooltip "One agent, fully: health, runs, spend, config" (web/components/AgenticOpsWorkspace.tsx:78)
- [ ] "+ Create agent" (toolbar, right end) — switches to Roster and opens the Create-an-agent dialog from any layer (web/components/AgenticOpsWorkspace.tsx:254)
- [ ] Range picker — the shared window; every Roster row figure, the custom agent's Overview/Runs/Spend tiles and the built-in agent's runs and tiles read it (web/components/AgenticOpsWorkspace.tsx:245)
- [ ] "?" help — askSpotlight("help ao"): Spotlight's Agent Ops help topic (web/components/AgenticOpsWorkspace.tsx:230)

#### Roster index (AgentIndex)
- [ ] Group row "Custom agents" with "+ Create agent" (secondary) — opens the Create-an-agent dialog (web/components/AgenticAgentsPanel.tsx:258)
- [ ] "Create your first agent" — empty-state button, opens the Create dialog (web/components/AgenticAgentsPanel.tsx:268)
- [ ] "Ask Spotlight to draft one" — opens Spotlight pre-filled "Help me create my first agent: walk me through it, then draft it and stage it for my approval." (web/components/AgenticAgentsPanel.tsx:271)
- [ ] Custom-agent row (click, Enter or Space; title "Open <name>") — opens that agent's page (web/components/AgenticAgentsPanel.tsx:278, :372)
- [ ] Group row "Built-in agents · <workspace name>" or "· Org" — section heading (web/components/AgenticAgentsPanel.tsx:285)
- [ ] Built-in-agent row — opens that built-in agent's page (web/components/AgenticAgentsPanel.tsx:287)
- [ ] Table columns Agent · Kind · Role · Runs · Success · Avg run · Tokens · Last run — no sort, filter or search exists (web/components/AgenticAgentsPanel.tsx:247)
- [ ] "Retry" on "the roster's run figures" read failure — re-reads the fleet fold (web/components/AgenticAgentsPanel.tsx:241)
- [ ] "Retry" on "the agent roster" read failure — re-reads both lists (web/components/AgenticAgentsPanel.tsx:170)
- [ ] "Dismiss" — closes the delete receipt notice shown after an agent is deleted (web/components/AgenticAgentsPanel.tsx:166)

#### Custom agent page — header and tabs (AgentDetail)
- [ ] Breadcrumb "Agents" (link, title "Back to every agent") — back to the index (web/components/AgenticAgentsPanel.tsx:337)
- [ ] "Chat" (primary) — opens the chat already talking to this agent (shell goToAgentChat) (web/components/AgenticAgentsPanel.tsx:495; web/app/page.tsx:1606)
- [ ] "Pause" / "Resume" — PATCH /agents/custom/{id} {enabled}; no confirm (web/components/AgenticAgentsPanel.tsx:499, :461)
- [ ] Tab "Overview" (web/components/AgenticAgentsPanel.tsx:473)
- [ ] Tab "Runs" (web/components/AgenticAgentsPanel.tsx:473)
- [ ] Tab "Doors" (web/components/AgenticAgentsPanel.tsx:474)
- [ ] Tab "Map" (web/components/AgenticAgentsPanel.tsx:474)
- [ ] Tab "Alerts" (web/components/AgenticAgentsPanel.tsx:474)
- [ ] Tab "Quality" (web/components/AgenticAgentsPanel.tsx:475)
- [ ] Tab "Spend" (web/components/AgenticAgentsPanel.tsx:475)
- [ ] Tab "Setup" (web/components/AgenticAgentsPanel.tsx:475)

#### Custom agent — Overview tab (CustomAgentOverview + AgentRail)
- [ ] Run-history bar (one per run, newest right) — click opens that run's trace in the Overview layer's "Every trace" fold (web/components/AgenticAgentsPanel.tsx:810; web/components/agentops/RunTimeline.tsx:74)
- [ ] "trace" (ghost) per deep run in Recent runs — opens the trace in the Overview fold (web/components/AgenticAgentsPanel.tsx:837)
- [ ] Details rail "Open Setup" (link) — switches to the Setup tab (web/components/AgenticAgentsPanel.tsx:573)

#### Custom agent — Runs tab (AgentRuns)
- [ ] Runs ledger table Started · Question · Kind · Status · Queries — read-only, no sort (web/components/AgenticAgentsPanel.tsx:649)
- [ ] "Trace" (link) per deep run — opens the trace in the Overview fold (web/components/AgenticAgentsPanel.tsx:662)

#### Custom agent — Doors tab (AgentDoors)
- [ ] Chat door "Chat" — opens chat with this agent (only while enabled) (web/components/agentops/AgentDoors.tsx:102)
- [ ] Slack door "Open Integrations" — goes to Settings › Integrations (both the none row and each bot row) (web/components/agentops/AgentDoors.tsx:106, :116)
- [ ] Automation door "Open automation" — Automations layer, focused on that automation (web/components/agentops/AgentDoors.tsx:125)
- [ ] HTTP door "Issue key" / "Rotate key" — POST /agents/custom/{id}/key; no confirm; rotating replaces the live key (web/components/agentops/AgentDoors.tsx:138)
- [ ] Fresh-key box "Hide" — hides the once-shown key (web/components/agentops/AgentDoors.tsx:151)
- [ ] Fresh-key box "Revoke key" — DELETE /agents/custom/{id}/key; only reachable inside the box shown right after issuing (web/components/agentops/AgentDoors.tsx:153)
- [ ] Embed door "Open" — opens the embed chat page in a new tab; only when a key is issued (web/components/agentops/AgentDoors.tsx:164)
- [ ] Teams door "Add a Teams bot" / "Cancel" — opens/closes the bind form (web/components/agentops/AgentDoors.tsx:181)
- [ ] Teams bind form: bot name, "Microsoft App ID", "App password (client secret)" inputs (web/components/agentops/AgentDoors.tsx:192)
- [ ] Teams "Bind" — POST /teams-bots; says the messaging endpoint back (web/components/agentops/AgentDoors.tsx:200)
- [ ] Teams bot row "Remove" — DELETE /teams-bots/{id}; no confirm (web/components/agentops/AgentDoors.tsx:187)
- [ ] MCP, Webhook, A2A and Grounding door rows — read-only state rows, no action (web/components/agentops/AgentDoors.tsx:129, :167, :170, :173)
- [ ] "Retry" on "this agent's doors" read failure (web/components/agentops/AgentDoors.tsx:87)

#### Custom agent — Map tab (AgentMap)
- [ ] Read-only node canvas — pan and zoom (0.3–1.4), nodes not draggable or connectable (web/components/agentops/AgentMap.tsx:200)
- [ ] Connection node "Open" — sets the page's connection and goes to Data › Catalog (web/components/agentops/AgentMap.tsx:156; web/app/page.tsx:2188)
- [ ] Automation node "Open" — Automations layer, focused on that automation (web/components/agentops/AgentMap.tsx:159)
- [ ] Slack node "Open" — Settings › Integrations (web/components/agentops/AgentMap.tsx:162)
- [ ] Alert and grant nodes target Attention, but the Roster passes no onOpenAttention, so they draw no "Open" (web/components/agentops/AgentMap.tsx:163; web/components/AgenticAgentsPanel.tsx:523)

#### Custom agent — Alerts tab (AgentAlertRulesPanel scoped to this agent)
- [ ] "New rule" / "Cancel" — opens/closes the rule form (web/components/agentops/AgentAlertRulesPanel.tsx:162)
- [ ] Rule form: Name input (web/components/agentops/AgentAlertRulesPanel.tsx:174)
- [ ] Rule form: Metric select (server vocabulary: Error rate, Failed runs, Runs started, p95 duration, Tokens, Cost, Runs with no spend recorded) (web/components/agentops/AgentAlertRulesPanel.tsx:178)
- [ ] Rule form: Condition select (is above / at or above / below / at or below) (web/components/agentops/AgentAlertRulesPanel.tsx:186)
- [ ] Rule form: Threshold, Window (min), Quiet period (min) number inputs (web/components/agentops/AgentAlertRulesPanel.tsx:194)
- [ ] Rule form: Severity select info / warning / critical (web/components/agentops/AgentAlertRulesPanel.tsx:206)
- [ ] Rule form: Channel (trigger id) input, placeholder "in-app only" (web/components/agentops/AgentAlertRulesPanel.tsx:214)
- [ ] Rule form: Scope — fixed to this agent here (a select of every agent only on the Attention copy) (web/components/agentops/AgentAlertRulesPanel.tsx:218)
- [ ] "Save rule" — POST /obs/agent-alerts/rules; check cron is fixed at "*/5 * * * *", not editable (web/components/agentops/AgentAlertRulesPanel.tsx:233, :47)
- [ ] Rule row "Test" — POST /obs/agent-alerts/rules/{id}/test; prints the verdict reason under the rule (web/components/agentops/AgentAlertRulesPanel.tsx:266)
- [ ] Rule row "Disable" / "Enable" (web/components/agentops/AgentAlertRulesPanel.tsx:268)
- [ ] Rule row "Delete" — DELETE; no confirm (web/components/agentops/AgentAlertRulesPanel.tsx:270)

#### Custom agent — Quality tab (AgentBenchmark)
- [ ] Candidate "Certify" — opens an inline reference-SQL editor prefilled with the SQL that answered (web/components/AgenticAgentsPanel.tsx:959)
- [ ] Candidate "Dismiss" — DELETE the candidate golden; no confirm (web/components/AgenticAgentsPanel.tsx:961)
- [ ] Certify editor: SQL textarea, "Certify with this SQL", "Cancel" (web/components/AgenticAgentsPanel.tsx:973)
- [ ] "Draft questions" — POST goldens/draft; one model call (SPENDS ON CLICK); tooltip says it is refused while the org has not allowed scheduled model work (web/components/AgenticAgentsPanel.tsx:1006)
- [ ] "Run evaluation" — POST /agents/custom/{id}/evaluate; one coder-model call per golden (SPENDS ON CLICK); disabled with no goldens (web/components/AgenticAgentsPanel.tsx:1012)
- [ ] Golden row "Remove" — DELETE; no confirm; hover shows its reference SQL (web/components/AgenticAgentsPanel.tsx:1063, :1059)
- [ ] "Golden question" input + "Reference SQL" textarea + "Add golden" (web/components/AgenticAgentsPanel.tsx:1069)

#### Custom agent — Setup tab (PersonaConfigure)
- [ ] Name input (max 120) (web/components/AgenticAgentsPanel.tsx:1161)
- [ ] "What it is for" input (max 240) (web/components/AgenticAgentsPanel.tsx:1166)
- [ ] Instructions textarea (max 8000) (web/components/AgenticAgentsPanel.tsx:1172)
- [ ] Connection select — "Any (use the ask's connection)" + every connection (web/components/AgenticAgentsPanel.tsx:1178)
- [ ] Schema scope — free-text input (the Create flow uses a catalogue picker instead) (web/components/AgenticAgentsPanel.tsx:1186)
- [ ] Documents checklist (web/components/AgenticAgentsPanel.tsx:1203)
- [ ] Packs checklist — only loadable packs; section hidden when none (web/components/AgenticAgentsPanel.tsx:1215)
- [ ] "Actions this agent may propose" grants checklist — the chosen connection's declared actions plus any granted action no longer declared (web/components/AgenticAgentsPanel.tsx:1261)
- [ ] Guardrails "Sensitive data" select Off / Redact / Block — PUT guardrails immediately on change (web/components/AgenticAgentsPanel.tsx:1417)
- [ ] Guardrails "Tokens per run" number — PUT guardrails on every keystroke; empty = no cap (web/components/AgenticAgentsPanel.tsx:1432)
- [ ] Configuration history "What changed" / "Hide" — expands a before/after diff per changed field (web/components/AgenticAgentsPanel.tsx:1530)
- [ ] Configuration history "Restore" — POST revisions/{v}/restore (writes a new revision); no confirm (web/components/AgenticAgentsPanel.tsx:1542)
- [ ] "Save changes" — PATCH /agents/custom/{id} with every field (web/components/AgenticAgentsPanel.tsx:1287)
- [ ] "Delete agent" (destructive) — confirm, then DELETE; the roster shows the receipt (web/components/AgenticAgentsPanel.tsx:1288, :1144)

#### Built-in agent page (CharterDetail)
- [ ] Breadcrumb "Agents" — back to the index (web/components/AgenticAgentsPanel.tsx:1622, :337)
- [ ] "Pause" / "Resume" — PATCH /agents/{id} {enabled}; only for background, non-reserved agents; no confirm (web/components/AgenticAgentsPanel.tsx:1635)
- [ ] Run history bars — tooltip only, no click (no trace door for a built-in agent's jobs) (web/components/AgenticAgentsPanel.tsx:1669)
- [ ] "Retry" on "this agent's runs" read failure (web/components/AgenticAgentsPanel.tsx:1666)
- [ ] "Retry" on "the alert rules" read failure in the Map block (web/components/AgenticAgentsPanel.tsx:715)
- [ ] Model pin input (paste a model id) + "Pin" / "Clear pin" — PATCH model; a paid OpenRouter id asks a confirm first and sends allow_paid (web/components/AgenticAgentsPanel.tsx:1895, :1879)
- [ ] "Use Models default" — clears the pin (web/components/AgenticAgentsPanel.tsx:1906)
- [ ] Budget per run "Tokens" input + "Save" (appears when changed) (web/components/AgenticAgentsPanel.tsx:1724, :1752)
- [ ] Budget per run "Time" (seconds) input + "Save" (web/components/AgenticAgentsPanel.tsx:1726)
- [ ] Limits — one number input per declared knob + "Save" (when changed) + "Default" (reset to charter default) (web/components/AgenticAgentsPanel.tsx:1781, :1813, :1818)

#### Create-an-agent dialog (CreateAgentFlow inside FormDialog)
- [ ] Dialog close (corner X, Escape, scrim) — a cancel before the agent is saved; after it is saved, closes onto the new agent (web/components/AgenticAgentsPanel.tsx:194, :142)
- [ ] Stepper 1 Describe · 2 Start · 3 Scope · 4 Define · 5 Prove · 6 Reach — display only, not clickable (web/components/agentops/CreateAgentFlow.tsx:58, :276)
- [ ] Describe: "Which connection?" select (web/components/agentops/CreateAgentFlow.tsx:308)
- [ ] Describe: "What should it answer?" textarea (web/components/agentops/CreateAgentFlow.tsx:319)
- [ ] Describe: "Draft it" — POST /agents/custom/propose; reads the catalogue and calls a model (SPENDS ON CLICK); nothing is created (web/components/agentops/CreateAgentFlow.tsx:325)
- [ ] Describe: "Skip — start from a pack instead" (web/components/agentops/CreateAgentFlow.tsx:329)
- [ ] Describe: "Use this draft" — adopts the draft into the next steps' fields (web/components/agentops/CreateAgentFlow.tsx:384)
- [ ] Describe: "Draft again" (SPENDS ON CLICK) (web/components/agentops/CreateAgentFlow.tsx:387)
- [ ] Start: "Start from <pack>" per template card (web/components/agentops/CreateAgentFlow.tsx:421)
- [ ] Start: "Start from scratch" (web/components/agentops/CreateAgentFlow.tsx:428)
- [ ] Scope: Name input (autofocus, max 120) (web/components/agentops/CreateAgentFlow.tsx:438)
- [ ] Scope: "What it is for" input (max 240) (web/components/agentops/CreateAgentFlow.tsx:444)
- [ ] Scope: Connection select ("Any — use the question's connection") (web/components/agentops/CreateAgentFlow.tsx:455)
- [ ] Scope: Schema select from the real catalogue (disabled until a connection is chosen) (web/components/agentops/CreateAgentFlow.tsx:466)
- [ ] Scope: "Back" / "Continue" (Continue disabled without a name) (web/components/agentops/CreateAgentFlow.tsx:489, :717)
- [ ] Define: Instructions textarea (max 8000; prefilled from a pack) (web/components/agentops/CreateAgentFlow.tsx:503)
- [ ] Define: Documents checklist (only this connection's and org-wide documents) (web/components/agentops/CreateAgentFlow.tsx:518)
- [ ] Define: Packs checklist (scratch path only) (web/components/agentops/CreateAgentFlow.tsx:544)
- [ ] Define: "Back" / "Continue" (web/components/agentops/CreateAgentFlow.tsx:560)
- [ ] Prove: "Add reference SQL →" per suggested/drafted question — moves it into the editor (web/components/agentops/CreateAgentFlow.tsx:586)
- [ ] Prove: Question input + "Reference SQL" textarea + "Add question" (web/components/agentops/CreateAgentFlow.tsx:602, :612)
- [ ] Prove: "Remove" per added ground-truth question (web/components/agentops/CreateAgentFlow.tsx:630)
- [ ] Prove: "Back" (web/components/agentops/CreateAgentFlow.tsx:644)
- [ ] Prove: "Create agent" — POST /agents/custom (or /agents/custom/from-template), then POST each golden; goes to Reach (web/components/agentops/CreateAgentFlow.tsx:649, :212)
- [ ] (Outside a dialog only) "Cancel" / "Close" — not drawn in the Roster's dialog (web/components/agentops/CreateAgentFlow.tsx:268)
- [ ] Reach (one-token path): "App name" + "Configuration token" inputs + "Create the app" — POST /slack-bots/apps (web/components/agentops/AgentSlackDoor.tsx:243, :251)
- [ ] Reach: "Open it at api.slack.com ↗" — external link to the created app (web/components/agentops/AgentSlackDoor.tsx:262)
- [ ] Reach: "Install to Slack" — navigates the browser to the API's OAuth install URL (HTTPS deployments) (web/components/agentops/AgentSlackDoor.tsx:272)
- [ ] Reach: pasted bot token input "xoxb-…" (no OAuth) (web/components/agentops/AgentSlackDoor.tsx:283)
- [ ] Reach: app-level token input "xapp-…" (web/components/agentops/AgentSlackDoor.tsx:289)
- [ ] Reach: "Finish — the bot goes live" — PATCH /slack-bots/{id} with the tokens (web/components/agentops/AgentSlackDoor.tsx:291)
- [ ] Reach: "Do it by hand instead — paste the manifest at api.slack.com" (web/components/agentops/AgentSlackDoor.tsx:306)
- [ ] Reach (manual): "Use one token instead" (web/components/agentops/AgentSlackDoor.tsx:318)
- [ ] Reach (manual): App name + "Generate JSON" / "Re-render" — GET /slack-bots/manifest (web/components/agentops/AgentSlackDoor.tsx:331, :334)
- [ ] Reach (manual): "Copy JSON" / "Copied" — clipboard; falls back to selecting the JSON (web/components/agentops/AgentSlackDoor.tsx:345, :126)
- [ ] Reach (manual): Bot user OAuth token, App-level token, Signing secret inputs + "Create Slack bot" — POST /slack-bots (verified against Slack) (web/components/agentops/AgentSlackDoor.tsx:383, :402)
- [ ] Reach: "Skip — the agent is already created" / "Done" — closes onto the new agent (web/components/agentops/AgentSlackDoor.tsx:416)

### Dialogs, drawers, popovers, panels
- [ ] "Create an agent" FormDialog (900px, blurred scrim) — the six-step CreateAgentFlow (web/components/AgenticAgentsPanel.tsx:194)
- [ ] Agent page — replaces the index in place (not a drawer): breadcrumb, name, chips, actions, tab strip (web/components/AgenticAgentsPanel.tsx:173, :332)
- [ ] Details rail (aside "Agent details", Overview tab only) — grounding line, Connection, Schema scope, Documents, Packs, May propose, State, Owner, History, Instructions (web/components/AgenticAgentsPanel.tsx:569)
- [ ] Browser confirm "Delete agent “<name>”? Its Slack bots are switched off, its automations keep running as nobody, its configuration history is kept; documents stay." (web/components/AgenticAgentsPanel.tsx:1145)
- [ ] Browser confirm "<model> is a PAID OpenRouter model … Pin it anyway?" (web/components/AgenticAgentsPanel.tsx:1883)
- [ ] Inline certify editor under a candidate golden (web/components/AgenticAgentsPanel.tsx:971)
- [ ] Inline before/after diff under a configuration revision (web/components/AgenticAgentsPanel.tsx:1548)
- [ ] Inline once-shown key box — auth header + curl line, amber "Copy this now — it is shown once" (web/components/agentops/AgentDoors.tsx:142)
- [ ] Inline Teams bind form, then "Set this as the Azure Bot's messaging endpoint: …" (web/components/agentops/AgentDoors.tsx:189, :210)
- [ ] Inline alert-rule form (web/components/agentops/AgentAlertRulesPanel.tsx:171)
- [ ] Built-in agent "Map" block — door / runs / watched by rows (web/components/AgenticAgentsPanel.tsx:698)
- [ ] Built-in agent "Governance · this workspace" / "· Org (all workspaces)" box — model pin, budget, limits (web/components/AgenticAgentsPanel.tsx:1681)
- [ ] Draft proposal card "Drafted: <name>" — Why this scope, Scope, Stance, drafted questions, backend disclosures (web/components/agentops/CreateAgentFlow.tsx:341)
- [ ] Slack manifest JSON block with the server's numbered steps (web/components/agentops/AgentSlackDoor.tsx:350, :359)
- [ ] Term tooltips (dotted underline, hover): "built-in" (Kind chip), "goldens" (Quality), "grant" (Setup), "door" (Doors) (web/components/agentops/Term.tsx:12; web/components/AgenticAgentsPanel.tsx:387, :1001, :1237; web/components/agentops/AgentDoors.tsx:96)

### Figures, counts, badges, status chips, freshness
- [ ] Roster row name + second line eval chip text "goldens p/t" / "goldens p/t · stale" (custom only) (web/components/AgenticAgentsPanel.tsx:281; web/lib/agentEval.ts)
- [ ] Roster Kind chip "custom" / "built-in" + "paused" chip (web/components/AgenticAgentsPanel.tsx:385, :389)
- [ ] Roster Role — purpose, "Scoped to <schema>", "Any schema", or the charter role (web/components/AgenticAgentsPanel.tsx:280, :392)
- [ ] Roster Runs count in the window (web/components/AgenticAgentsPanel.tsx:393)
- [ ] Roster Success % — tooltip "x of y finished runs succeeded" / "x of y answers had no failed call" · "n interrupted by a restart" (web/components/AgenticAgentsPanel.tsx:394)
- [ ] Roster Avg run duration — tooltip says model time vs start-to-finish (web/components/AgenticAgentsPanel.tsx:404)
- [ ] Roster Tokens (compact, exact in tooltip) (web/components/AgenticAgentsPanel.tsx:409)
- [ ] Roster Last run date-time (web/components/AgenticAgentsPanel.tsx:412)
- [ ] Reserved built-in rows drawn dimmed (opacity 0.55) (web/components/AgenticAgentsPanel.tsx:374)
- [ ] Custom page chips "custom agent", eval chip (tooltip explains current / stale / unknown), "active" / "paused" (web/components/AgenticAgentsPanel.tsx:482)
- [ ] Details rail grounding line "answers on <connection> · schema X · N documents · N skill packs · N action grants (propose-only)" (web/components/AgenticAgentsPanel.tsx:453, :575)
- [ ] Details rail rows incl. State "paused — keeps its history, answers nothing", Owner/"unowned", "created … · updated …" (web/components/AgenticAgentsPanel.tsx:577)
- [ ] Overview tiles: Runs ("d deep · q quick · in <window>"), Model calls, Tokens, Cost (sub: unpriced floor), p90 latency (MLflow only) (web/components/AgenticAgentsPanel.tsx:794)
- [ ] Run-history strip — bar colour = state, height = duration vs slowest; caption "N most recent · oldest left, newest right · height is duration against the slowest shown (Xs)"; bar tooltip label/state/duration/age/attempt (web/components/agentops/RunTimeline.tsx:58, :87)
- [ ] Recent runs rows — kind chip "quick ·N" / "deep", status chip, start time (web/components/AgenticAgentsPanel.tsx:831)
- [ ] Runs table — kind chip quick/deep, status chip (complete/running/paused/failed/timed_out hues), query count (web/components/AgenticAgentsPanel.tsx:658)
- [ ] Spend tiles: Model calls, Tokens, Cost, Unpriced calls, Calls without usage, Failure rate, Runs — each captioned with the window (web/components/AgenticAgentsPanel.tsx:737)
- [ ] Doors rows — kind label, state chip (open / paused / listening / not listening / off / none / no key / bound / enabled), detail (listening since + supervisor id, key issued at, URLs) (web/components/agentops/AgentDoors.tsx:99)
- [ ] Map node detail lines (e.g. "Slack door · listening since …", "runs as this agent", "may PROPOSE · a human accepts before anything runs") and amber warnings (web/lib/agentMap.ts:157; web/components/agentops/AgentMap.tsx:99)
- [ ] Alerts header "N of M enabled"; per rule severity chip and summary "metric comparator threshold · over Wm · checked cron · quiet Dm · via channel|in-app · only <agent>|every agent" (web/components/agentops/AgentAlertRulesPanel.tsx:159, :244, :250)
- [ ] Quality learning receipt "Learned N corrections · N goldens certified from use · pass a/b → c/d" or loop-off count of verdicts (web/components/AgenticAgentsPanel.tsx:925)
- [ ] Quality candidate source chip "from use" / "drafted" + "the answer said: …" (web/components/AgenticAgentsPanel.tsx:955, :966)
- [ ] Quality eval result "p/t passing (was a/b)", up to three failures with generated SQL and expected/got rows, "newly failing" / "newly passing" (web/components/AgenticAgentsPanel.tsx:1018)
- [ ] Quality golden row source chip "from use" / "drafted" (web/components/AgenticAgentsPanel.tsx:1060)
- [ ] Setup grant row action title, or amber "no longer declared" (web/components/AgenticAgentsPanel.tsx:1268)
- [ ] Setup guardrail hints per mode; "This agent stops once a run has spent N tokens." / "No ceiling…"; "Saving…" / "Saved." (web/components/AgenticAgentsPanel.tsx:1423, :1444, :1451)
- [ ] Configuration history rows: vN, timestamp, changed-field chips, "current", "same as current" (web/components/AgenticAgentsPanel.tsx:1511, :1535)
- [ ] Built-in page chips "built-in", "reserved — wiring soon" / "active" / "paused" / "always on — user-initiated" (web/components/AgenticAgentsPanel.tsx:1624)
- [ ] Built-in page lane · role line, goal, job-kind tags, tool tags (web/components/AgenticAgentsPanel.tsx:1643)
- [ ] Built-in tiles: Runs, Tokens, Queries (in window), Token budget / run ("role default" or N; "enforced live — an over-budget run is cancelled") (web/components/AgenticAgentsPanel.tsx:1654)
- [ ] Built-in Map rows: door (inline vs scheduled), runs (job kinds · tools), watched by (alert rules with on/off) (web/components/AgenticAgentsPanel.tsx:702)
- [ ] Model pin status — pinned vs "No pin — runs on Settings → Models (coder → X · narrator → Y · fast → Z)" (web/components/AgenticAgentsPanel.tsx:1914)
- [ ] Fallback line — amber "Failing over now —", "Fallback: <model> on <provider>", built-in chain, or "No fallback configured." (web/components/AgenticAgentsPanel.tsx:1931)
- [ ] Limits per knob — unit, description, "Default N unit. Applies to …" (web/components/AgenticAgentsPanel.tsx:1831)
- [ ] Create flow: tables-in-scope count (lists them when 8 or fewer), document chunk counts and "the whole organisation's", template status chip + domains + suggested-question count, "ground truth" chip, pack status chip (web/components/agentops/CreateAgentFlow.tsx:477, :526, :411, :626, :551)

### Keyboard shortcuts
- [ ] Enter or Space on a focused roster row opens the agent (web/components/AgenticAgentsPanel.tsx:373)
- [ ] Escape closes the Create dialog (a cancel before save; opens the new agent after save) (web/components/ui/dialog.tsx:60; web/components/AgenticAgentsPanel.tsx:194)
- [ ] Arrow keys move between the agent page's tabs (Radix Tabs under TabStrip) (web/components/ui/tab-strip.tsx:3; web/components/AgenticAgentsPanel.tsx:503)

### URL params / deep links
- [ ] `?tab=agentic-ops&layer=agents` opens the Roster (web/lib/agentOpsLayers.ts; web/components/AgenticOpsWorkspace.tsx:78)
- [ ] `?agent=<built-in agent id>` — read once, removed from the URL, opens that built-in agent's page (the chat's budget refusal links here) (web/components/AgenticOpsWorkspace.tsx:153)
- [ ] `?create=agent` — opens the Create dialog on arrival, then consumed (the command palette's deep link) (web/components/AgenticOpsWorkspace.tsx:207)
- [ ] Not written: the open agent and its tab live only in memory — no URL reaches a custom agent's page or a tab, and a reload returns to the index (web/components/AgenticAgentsPanel.tsx:103, :439)
- [ ] In-app focus: an agent opened from the Overview or Hub layer arrives selected (focusAgent) (web/components/AgenticAgentsPanel.tsx:127)
- [ ] Out-links: Slack OAuth install URL on the API (same window); embed page and api.slack.com in new tabs (web/components/agentops/AgentSlackDoor.tsx:273, :262; web/components/agentops/AgentDoors.tsx:165)

### Empty / error / loading / withheld states
- [ ] "Agent action failed" + the error — any failed pause/save/delete/restore/guardrail/golden action (web/components/AgenticAgentsPanel.tsx:159)
- [ ] Delete receipt "Deleted “X”. N Slack bots switched off (…). N automations now run as nobody (…). N configuration revisions kept." (or which part could not be done) (web/components/AgenticAgentsPanel.tsx:161; web/lib/api.ts:10470)
- [ ] Read failed: "the agent roster" + Retry — a failed list is said, never shown as no agents (web/components/AgenticAgentsPanel.tsx:170)
- [ ] Loading "the agent" — a focused agent not yet arrived (web/components/AgenticAgentsPanel.tsx:188)
- [ ] Read failed: "the roster's run figures" + Retry; every figure cell then reads "—" (web/components/AgenticAgentsPanel.tsx:241)
- [ ] Loading "agents" / "built-in agents" inline rows (web/components/AgenticAgentsPanel.tsx:260, :286)
- [ ] "No custom agents yet. An agent is a scope and a stance — where it may look, and how it should think." (web/components/AgenticAgentsPanel.tsx:264)
- [ ] Figure cells "…" (title "Loading this range…") until the fold answers; "—" when nothing measured; Success "—" titled "N runs, none finished on its own" (web/components/AgenticAgentsPanel.tsx:361, :401)
- [ ] Loading / Read failed "this agent's figures" / "this agent's runs" / "this agent's spend" + Retry (web/components/AgenticAgentsPanel.tsx:772, :635, :730)
- [ ] "No runs in <window>." (Overview strip, Recent runs, Runs tab) (web/components/AgenticAgentsPanel.tsx:641, :810, :820)
- [ ] Overview Model calls / Tokens / Cost tiles are omitted when spend is not measured — nothing on screen says why (web/components/AgenticAgentsPanel.tsx:796)
- [ ] Cost sub "no price is declared for the model it ran on" / "N calls unpriced — a floor, not a total" / "a floor — some calls unpriced" (web/components/AgenticAgentsPanel.tsx:784, :740)
- [ ] Spend footnote: "Priced from each provider's published catalogue, or a rate the operator declared (PRAMANYX_MODEL_PRICES). A model nothing prices counts as unpriced, never as free." (web/components/AgenticAgentsPanel.tsx:751)
- [ ] Details rail "any — the asker's connection", "all schemas", "nothing — no grants", "No instructions — the agent answers on the platform's defaults." (web/components/AgenticAgentsPanel.tsx:577, :598)
- [ ] Quality "The learning loop is off (Settings ▸ Organization ▸ What Pramanyx may do): verdicts … are recorded but teach it nothing as itself — N so far." (web/components/AgenticAgentsPanel.tsx:936)
- [ ] Quality "Candidates — waiting for a person's SQL … A candidate counts for nothing until you certify it" (web/components/AgenticAgentsPanel.tsx:945)
- [ ] Quality "This agent has no golden questions, so it ships unmeasured — every answer it gives is unfalsifiable." (web/components/AgenticAgentsPanel.tsx:993)
- [ ] Quality "Draft questions" refused-while-off tooltip "Refused while the organisation has not let Pramanyx run model work on its own schedule (Settings ▸ Organization)" (web/components/AgenticAgentsPanel.tsx:1008)
- [ ] Setup "No uploaded documents yet — an agent only sees the documents attached to it." (web/components/AgenticAgentsPanel.tsx:1197)
- [ ] Setup grants "Bind a connection first — grants name that connection's declared actions." / "No declared actions on this connection yet — declare one in the ontology (Actions), then grant it here." (web/components/AgenticAgentsPanel.tsx:1244, :1253)
- [ ] Setup "Name is required." on save (web/components/AgenticAgentsPanel.tsx:1136)
- [ ] Setup Guardrails section silently absent until (and unless) its read succeeds (web/components/AgenticAgentsPanel.tsx:1402)
- [ ] Setup Configuration history absent with no revisions; rows "earlier history not loaded", "the configuration it started with", "no governing change" (web/components/AgenticAgentsPanel.tsx:1486, :1516)
- [ ] Built-in runs "This built-in agent owns no job kind, so it can never show runs here — its work is answered inline" / "No runs in <window>." / Read failed + Retry (web/components/AgenticAgentsPanel.tsx:1665)
- [ ] Built-in Map "no alert rule names this agent — Attention → Alert rules adds one"; "…" while loading (web/components/AgenticAgentsPanel.tsx:716)
- [ ] Budget/limit validation "a whole number above 0" / "min–max" (web/components/AgenticAgentsPanel.tsx:1756, :1826)
- [ ] Charter knobs copy "These are the charter's REAL knobs. There is no per-agent temperature, topP or tool toggle here…" (web/components/AgenticAgentsPanel.tsx:1700)
- [ ] Doors Loading / Read failed "this agent's doors" + Retry (web/components/agentops/AgentDoors.tsx:87)
- [ ] Doors "No Slack bot fronts this agent — Create one from the agent's Reach step or Integrations → Slack."; "No automation runs as this agent"; Teams "no bot fronts this agent — Register an Azure Bot…" (web/components/agentops/AgentDoors.tsx:104, :119, :178)
- [ ] Map "could not read <Slack doors, chains, alerts, connections> — this map is missing what they hold" (web/components/agentops/AgentMap.tsx:218)
- [ ] Map Documents node warning "sees NO documents at all — fewer than asking with no agent" (web/lib/agentMap.ts:175)
- [ ] Alerts "none yet — nothing about this agent is being watched"; read/save errors in red (web/components/agentops/AgentAlertRulesPanel.tsx:157, :167)
- [ ] Create "Agent draft failed" + error; partial "Agent created. N golden(s) were refused (the SQL must parse and be read-only): …" (web/components/agentops/CreateAgentFlow.tsx:296, :237)
- [ ] Create "It declined to draft this" + reason / "nothing here can support that agent" (web/components/agentops/CreateAgentFlow.tsx:336)
- [ ] Create "Reading your catalogue…" while drafting; "Creating…" while saving (web/components/agentops/CreateAgentFlow.tsx:327, :650)
- [ ] Create "No packs are installed, so there is nothing to start from — create from scratch…" (web/components/agentops/CreateAgentFlow.tsx:399)
- [ ] Create Scope "No tables found in this scope yet." / amber "a narrower scope answers more reliably" (over 30 tables) / "A name is required." (web/components/agentops/CreateAgentFlow.tsx:476, :481, :491)
- [ ] Create Documents "Attaching none is not neutral: an agent with no documents attached sees NO documents at all" + "No documents uploaded yet…" / "No documents for this connection yet…" + "N documents of other connections are not listed" (web/components/agentops/CreateAgentFlow.tsx:511, :513, :533)
- [ ] Create Packs "A pack steers a question only once it is active AND pinned to the connection — binding one here is inert until then." (web/components/agentops/CreateAgentFlow.tsx:542)
- [ ] Create Prove "These carry no SQL on purpose — a suite the model writes for itself measures nothing." / "You can create the agent without any — it will simply have no evidence behind it" / "Creating it makes it available in chat straight away." (web/components/agentops/CreateAgentFlow.tsx:595, :638, :647)
- [ ] Reach "Clipboard blocked by the browser — the JSON is selected, press ⌘C."; Slack errors in red; success "Slack bot X is live…" / "created and verified against Slack" (web/components/agentops/AgentSlackDoor.tsx:139, :412, :300, :375)

### Loads on open
- [ ] GET /agents?workspace_id&range|since|until — built-in roster with governance and windowed spend (web/lib/api.ts:9278 → pramanyx/routers/agents.py:67)
- [ ] GET /agents/custom — custom agents of the active workspace (web/lib/api.ts:10268 → pramanyx/routers/agents.py:273)
- [ ] GET /control-room/fleet?range… — the row figures, one read for the whole table, re-read on range change (web/lib/api.ts:11383 → pramanyx/routers/control_room.py:138)
- [ ] Workspace poll, every 20 s while the browser tab is visible, from any layer including this one: GET /control-room/needs-human?limit=1 — WRITES ON OPEN: expires stale proposals and resumes parked runs (web/components/AgenticOpsWorkspace.tsx:194, :200 → web/lib/api.ts:11429 → pramanyx/routers/control_room.py:432)
- [ ] Same poll: GET /departures/summary — Departures badge (web/components/AgenticOpsWorkspace.tsx:196 → web/lib/api.ts:6975 → pramanyx/routers/departures.py:75)
- [ ] Workspace once: GET /connections — the connection picker (web/components/AgenticOpsWorkspace.tsx:177 → web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] Custom agent page: GET /connections (connection name), GET /agents/custom/{id}/observability?range… (Overview; also MLflow trace stats when configured), GET /documents, GET /packs (Details rail) (web/components/AgenticAgentsPanel.tsx:448, :621, :550 → pramanyx/routers/agents.py:738, pramanyx/routers/knowledge.py:598, pramanyx/routers/packs.py:66)
- [ ] Runs / Spend tab: GET /agents/custom/{id}/observability again (each tab its own read) (web/components/AgenticAgentsPanel.tsx:634, :729 → pramanyx/routers/agents.py:738)
- [ ] Doors tab: GET /slack-bots, GET /automations, GET /agents/custom/{id}/doors (web/components/agentops/AgentDoors.tsx:68 → pramanyx/routers/slackbots.py:40, pramanyx/routers/automations.py:219, pramanyx/routers/agents.py:657)
- [ ] Map tab: GET /slack-bots, GET /automations, GET /obs/agent-alerts/rules, GET /connections (web/components/agentops/AgentMap.tsx:148 → pramanyx/routers/obs.py:952)
- [ ] Alerts tab: GET /obs/agent-alerts/rules, GET /obs/agent-alerts/metrics (web/components/agentops/AgentAlertRulesPanel.tsx:83, :93 → web/lib/api.ts:11473, :11482 → pramanyx/routers/obs.py:952, :942)
- [ ] Quality tab: GET /agents/custom/{id}/goldens, GET /agents/custom/{id}/learning (web/components/AgenticAgentsPanel.tsx:877 → web/lib/api.ts:10572, :10542 → pramanyx/routers/agents.py:570, :725)
- [ ] Setup tab: GET /connections, /documents, /packs; GET /ontology/kinetic-actions?conn… (grants roster, failure read as none); GET /agents/custom/{id}/guardrails; GET /agents/custom/{id}/revisions (web/components/AgenticAgentsPanel.tsx:1104, :1116, :1377, :1466 → web/lib/api.ts:10297, :10227, :10248 → pramanyx/routers/ontology.py:1469, pramanyx/routers/agents.py:504, :449)
- [ ] Built-in agent page: GET /jobs?kind=<k>&limit=20&range… once per owned job kind; GET /obs/agent-alerts/rules (Map); GET /llm/config (model pin, non-reserved only) (web/components/AgenticAgentsPanel.tsx:1595, :685, :1861 → web/lib/api.ts:9219, :8903 → pramanyx/routers/jobs.py:71, pramanyx/routers/llm.py:21)
- [ ] Create dialog: GET /agents/templates, GET /connections, GET /documents, GET /packs, GET /catalog/tree — WRITES ON OPEN: the tree introspects every connection's warehouse and reconciles the metastore's schema rows (set_catalog_schemas) (web/components/agentops/CreateAgentFlow.tsx:148 → web/lib/api.ts:10345, :945 → pramanyx/routers/agents.py:281, pramanyx/routers/catalog.py:234, :276)
- [ ] Clicks that SPEND: "Draft it" / "Draft again" (POST /agents/custom/propose), "Draft questions" (POST /agents/custom/{id}/goldens/draft), "Run evaluation" (POST /agents/custom/{id}/evaluate) (web/lib/api.ts:10406, :10560, :10596 → pramanyx/routers/agents.py:332, :641, :810)

**Top rows today:** (workspace, above the layer) context bar: Connection select (scopes Automations and Action centre, not the Roster) · layer tabs: Overview, Roster, Attention (badge), Automations, Hub, Departures (badge), By duty, Action centre, Developer, "?" help · toolbar: Range picker … "+ Create agent" (right end). Roster index has no header of its own — its first row is the in-table group row "Custom agents" … "+ Create agent". An agent page's header row: "Agents" / <name> · chips (custom agent, eval chip, active/paused; or built-in, state) … "Chat", "Pause/Resume"; then the tab row Overview · Runs · Doors · Map · Alerts · Quality · Spend · Setup (custom agents only).

## Agent Ops — Attention (`layer=attention`)
_Source: web/components/NeedsHumanPanel.tsx (+ web/components/agentops/AgentAlertRulesPanel.tsx, web/components/ProposalCard.tsx `ProposalCardById`/`ProposalCard`)_

### Controls
Alert rules (top card)
- [ ] "New rule" / "Cancel" — opens/closes the inline rule form (web/components/agentops/AgentAlertRulesPanel.tsx:162-164)
- [ ] Name input (placeholder "Error rate across agents") (web/components/agentops/AgentAlertRulesPanel.tsx:174-177)
- [ ] Metric select — options from the SERVER's vocabulary (Error rate, Failed runs, Runs started, p95 duration (ms), Tokens, Cost (USD), Runs with no spend recorded; unknown names shown raw) (web/components/agentops/AgentAlertRulesPanel.tsx:37-41, 178-185)
- [ ] Condition select — is above / is at or above / is below / is at or below (server list) (web/components/agentops/AgentAlertRulesPanel.tsx:31-33, 186-193)
- [ ] Threshold number input (default 0.25) (web/components/agentops/AgentAlertRulesPanel.tsx:194-197)
- [ ] "Window (min)" number input (default 15) (web/components/agentops/AgentAlertRulesPanel.tsx:198-201)
- [ ] "Quiet period (min)" number input (default 30) (web/components/agentops/AgentAlertRulesPanel.tsx:202-205)
- [ ] Severity select info / warning / critical (web/components/agentops/AgentAlertRulesPanel.tsx:206-213)
- [ ] "Channel (trigger id)" input (placeholder "in-app only") (web/components/agentops/AgentAlertRulesPanel.tsx:214-217)
- [ ] "Scope" select — "every agent" or one custom agent (web/components/agentops/AgentAlertRulesPanel.tsx:218-230)
- [ ] Check cadence — fixed `*/5 * * * *`, not editable in the form (shown on each rule) (web/components/agentops/AgentAlertRulesPanel.tsx:47, 254)
- [ ] "Save rule" — disabled until a name is given (web/components/agentops/AgentAlertRulesPanel.tsx:232-235)
- [ ] Per rule "Test" — evaluates now and prints the verdict's reason under the rule (web/components/agentops/AgentAlertRulesPanel.tsx:137-147, 266-267)
- [ ] Per rule "Enable" / "Disable" (web/components/agentops/AgentAlertRulesPanel.tsx:113-123, 268-269)
- [ ] Per rule "Delete" — no confirmation (web/components/agentops/AgentAlertRulesPanel.tsx:125-135, 270-271)
Waiting rows
- [ ] "Open & resume" — paused deep run, opens it in the shell's Runs screen (web/components/NeedsHumanPanel.tsx:214-217; web/app/page.tsx:2180-2183)
- [ ] "Open automation" — automation approval, opens the Automations layer ON that automation (web/components/NeedsHumanPanel.tsx:218-221)
- [ ] "Acknowledge" — agent alert, acknowledges inline (web/components/NeedsHumanPanel.tsx:110-121, 222-225)
- [ ] "Fix automation" — broken automation, opens that automation; deliberately no Acknowledge (web/components/NeedsHumanPanel.tsx:226-232)
- [ ] Retry on a failed read (web/components/NeedsHumanPanel.tsx:126, 147)
Approval card (inbox proposals, and automation approvals that carry a proposal id)
- [ ] "Accept" — disabled until every open choice is filled (web/components/ProposalCard.tsx:574-577)
- [ ] "Reject" (web/components/ProposalCard.tsx:581-582)
- [ ] Open-choice inputs, one per "step N · key" (placeholder "#channel" for channels) (web/components/ProposalCard.tsx:546-566)
- [ ] Checkbox "also allow this target unattended" — declared actions (mints a grant on accept) (web/components/ProposalCard.tsx:583-588)
- [ ] Checkbox "always allow this chain to post here" — model-drafted Slack posts (web/components/ProposalCard.tsx:589-594)
- [ ] Not offered here: "Open in editor" and "Open in inbox" (the panel passes neither callback) (web/components/ProposalCard.tsx:426-428, 578-580; web/components/NeedsHumanPanel.tsx:209-210)

### Dialogs, drawers, popovers, panels
- [ ] Inline "New rule" form (no modal) (web/components/agentops/AgentAlertRulesPanel.tsx:171-237)
- [ ] Approval card body by proposal kind: new agent, new automation, agent + schedule, edit (field before › after), monitor + chain, brief delivery, pause / resume, agent limit, agent grant, Slack post (posts to / message), dashboard, from query history, action / integration params; reasoning line (web/components/ProposalCard.tsx:430-545)
- [ ] Approval card footnotes: "One decision: accepting creates the agent and saves the chain…", "A cap on spend is governance…", "A grant is permission to propose…", "A model drafted this send — it waits for you on every run until you allow it.", "to allow this account unattended, approve it under Approvals" (web/components/ProposalCard.tsx:440-599)

### Figures, counts, badges, status chips, freshness
- [ ] "Waiting on a human" stat (amber when > 0) (web/components/NeedsHumanPanel.tsx:152-153)
- [ ] Per-source stats "Inbox proposals", "Paused deep runs", "Automation approvals", "Agent alerts", "Broken automations" (red when > 0); "—" for a source that could not be read (web/components/NeedsHumanPanel.tsx:55-61, 139, 156-160)
- [ ] "Oldest waiting" stat (e.g. "2h 14m"; red past one hour) (web/components/NeedsHumanPanel.tsx:135-136, 164-166)
- [ ] Alert rules header "N of M enabled" (web/components/agentops/AgentAlertRulesPanel.tsx:155-160)
- [ ] Rule row: severity chip (dim when disabled), name, "<metric> <comparator> <threshold> · over Nm · checked <cron> · quiet Nm · via <channel>|in-app · only <agent>|only built-in <charter>|every agent", last Test verdict line (web/components/agentops/AgentAlertRulesPanel.tsx:244-263)
- [ ] Row chip by source: proposal / paused run / approval / alert / broken; an alert's own severity (critical / warning / info) replaces it (web/components/NeedsHumanPanel.tsx:45-71, 198)
- [ ] Row title (full on hover); "waiting <relative>"; "(since start — pause event aged out)"; connection name (web/components/NeedsHumanPanel.tsx:200-206)
- [ ] Approval card: kind chip; "as <account>" for integration writes; "by <who> · waiting <relative>"; settled status line (executed / accepted / failed / rejected + note) (web/components/ProposalCard.tsx:51-67, 411-424, 601-610)
- [ ] Badge on the Attention tab (count) — owned by the workspace chrome (web/components/AgenticOpsWorkspace.tsx:227)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] `?tab=agentic-ops&layer=attention` — the only address; reached from the Overview's "Open Attention" / "Open in Attention" (web/lib/agentOpsLayers.ts:11-13; web/components/FleetOverviewPanel.tsx:346, 545)

### Empty / error / loading / withheld states
- [ ] "Could not read what needs a person — <error>." + Retry — shown whenever a read fails and no rows are on screen (web/components/NeedsHumanPanel.tsx:125-127)
- [ ] "Loading what needs a person…" (web/components/NeedsHumanPanel.tsx:128-130)
- [ ] "Could not read what needs a person again — the list below is from the last read." (web/components/NeedsHumanPanel.tsx:147-148)
- [ ] "Not done — <error>" — an acknowledge the server refused (web/components/NeedsHumanPanel.tsx:149-150)
- [ ] "Could not read <sources> — anything waiting there is not shown." (web/components/NeedsHumanPanel.tsx:169-174)
- [ ] "Nothing waits in the sources that could be read." / "Nothing needs a human. Every source is empty right now." (web/components/NeedsHumanPanel.tsx:176-181)
- [ ] "none yet — nothing about the agents is being watched" (no rules) (web/components/agentops/AgentAlertRulesPanel.tsx:156-158)
- [ ] Rule save/toggle/delete/test/vocabulary errors in red text (web/components/agentops/AgentAlertRulesPanel.tsx:167-169)
- [ ] "loading proposal…" / "proposal <id> is no longer in the inbox — resolved elsewhere, or swept." (web/components/ProposalCard.tsx:640-649)
- [ ] "Open choices — yours to make; Accept waits until each has a value."; Accept tooltip "Fill the open choices first — accepting would arm a placeholder" (web/components/ProposalCard.tsx:546-550, 576)
- [ ] Connection names fail silently (row shows the label helper's fallback) (web/components/NeedsHumanPanel.tsx:81, 205)

### Loads on open
- [ ] GET /control-room/needs-human?limit=100 — on open and every 10 s while the layer is visible; overlapping replies ordered so a stale one never replaces a newer one (web/components/NeedsHumanPanel.tsx:91-108; web/lib/api.ts:11429 → pramanyx/routers/control_room.py:432) [WRITES ON OPEN: `expire_stale()` flips lapsed pending proposals to `expired`; `resume_parked_runs()` resumes parked automation runs whose approvals are answered (can dispatch their remaining governed steps). With the workspace's 20 s badge poll, this sweep runs about every 10 s and 20 s concurrently while Attention is open]
- [ ] GET /connections — once, for row connection names (web/components/NeedsHumanPanel.tsx:81; web/lib/api.ts:30)
- [ ] GET /obs/agent-alerts/rules?enabled_only=false (web/components/agentops/AgentAlertRulesPanel.tsx:83; web/lib/api.ts:11473 → pramanyx/routers/obs.py:952)
- [ ] GET /agents/custom — for the Scope select and rule labels (web/components/agentops/AgentAlertRulesPanel.tsx:86; web/lib/api.ts:10268 → pramanyx/routers/agents.py:273)
- [ ] GET /obs/agent-alerts/metrics — the metric and comparator vocabulary (web/components/agentops/AgentAlertRulesPanel.tsx:93; web/lib/api.ts:11482 → pramanyx/routers/obs.py:942)
- [ ] GET /kinetic-actions/inbox/{id} — per approval card, then every 15 s while it stays pending (web/components/ProposalCard.tsx:619-637; web/lib/api.ts:7415 → pramanyx/routers/kinetic.py:249)
- [ ] GET /rbac/me — cached once per token, to word "by you" on cards (web/components/ProposalCard.tsx:363; web/lib/useMe.ts:25; web/lib/api.ts:9786)
- [ ] Writes by controls (not on open): POST /obs/agent-alerts/rules (save, enable/disable); DELETE /obs/agent-alerts/rules/{id}; POST /obs/agent-alerts/rules/{id}/test [evaluates with the quiet period OFF — a crossing rule fires a real alert event (and its channel)] (pramanyx/routers/obs.py:998-1014); POST /obs/agent-alerts/events/{id}/ack; POST /kinetic-actions/inbox/{id}/accept (actor "control-room", mint flag, open-choice fills) | /reject (web/lib/api.ts:11488, 11498, 11506, 11518, 7401, 7434)

**Top rows today:** no header or toolbar of its own (under the workspace chrome). The first block is the "Alert rules" card whose header row holds "Alert rules · N of M enabled" and "New rule"; under it the stat row Waiting on a human · Inbox proposals · Paused deep runs · Automation approvals · Agent alerts · Broken automations · Oldest waiting.

## Agent Ops — Automations (`layer=automations`)
_Source: web/components/AutomationsPanel.tsx (+ web/components/AutomationGraph.tsx, web/components/automations/{AutomationAuthor,AutomationRows,AutomationPalette,ScheduleEditor,DeployMenu,OutcomeKeyPicker,WhatGetsPosted}.tsx, web/components/ProposalCard.tsx, web/components/metrics/MetricField.tsx). Mounted at web/components/AgenticOpsWorkspace.tsx:277; the workspace's shared rows (Connection picker, layer tabs + "?", range + "+ Create agent") sit above it._

### Controls
#### Workspace-level (scopes this layer)
- [ ] Connection select (context bar) — scopes the whole Automations layer (list, Runs, Inbox, palette counts); hover title "Scopes Automations and the Action centre; the Hub and Departures stay hub-wide"; shows "choose…" when none (web/components/AgenticOpsWorkspace.tsx:235)
- [ ] Arrive-on-automation (focusId) — "Open automation" from Roster Doors/Map, Attention, Departures or Hub opens that automation's canvas directly, once per id (web/components/AutomationsPanel.tsx:171)

#### View tabs (panel's own tab strip)
- [ ] Tab "Automations" — the list view (web/components/AutomationsPanel.tsx:336)
- [ ] Tab "Runs" — per-automation tick history (web/components/AutomationsPanel.tsx:336)
- [ ] Tab "Inbox" (badge = pending proposals) — proposal queue + standing grants (web/components/AutomationsPanel.tsx:336)

#### List view toolbar (trailing the tab strip; list tab only)
- [ ] Describe-it input "or describe it — e.g. post a Monday pipeline summary to #revenue" — Enter proposes (web/components/AutomationsPanel.tsx:344)
- [ ] "Propose" / "Drafting…" — asks the agent to draft a chain from the sentence; opens it on a fresh canvas with a dry-run receipt, nothing saved (web/components/AutomationsPanel.tsx:351)
- [ ] "Import flow…" — file picker (.json) translating a Langflow/Flowise export into a governed chain (web/components/AutomationsPanel.tsx:362)
- [ ] "+ New automation" — opens a blank canvas named "Untitled automation" (trigger node only) (web/components/AutomationsPanel.tsx:368)

#### List view rows (AutomationCard)
- [ ] Enable/Disable switch — toggles `enabled` (web/components/AutomationsPanel.tsx:591)
- [ ] "Design" — opens this automation's full-panel canvas (web/components/AutomationsPanel.tsx:605)
- [ ] "Run now" — runs immediately; banner reports "<name>: <outcome> — <reason>" (web/components/AutomationsPanel.tsx:607)
- [ ] "History" — jumps to Runs tab for this automation (web/components/AutomationsPanel.tsx:608)
- [ ] "Mute" / "Unmute" — pauses for 24h, or clears the mute (web/components/AutomationsPanel.tsx:609)
- [ ] "Edit" — opens the canvas (same as Design, clears any create draft) (web/components/AutomationsPanel.tsx:610)
- [ ] "Delete" (red) — browser confirm `Delete automation "<name>"?` then DELETE (web/components/AutomationsPanel.tsx:611)
- [ ] Empty-state button "Create first automation" / "Create one here" — opens a blank canvas (web/components/AutomationsPanel.tsx:904)

#### Runs view
- [ ] Automation picker chips (one button per automation, active = filled) — loads that automation's runs + versions (web/components/AutomationsPanel.tsx:720)

#### Inbox view (proposal queue)
- [ ] ProposalCard "Accept" — accepts the staged proposal (disabled until open choices filled) (web/components/ProposalCard.tsx:577)
- [ ] ProposalCard "Open in editor" — automation_draft / agent_bundle: draws the draft on the canvas; saving it supersedes the proposal (web/components/ProposalCard.tsx:579, web/components/AutomationsPanel.tsx:490)
- [ ] ProposalCard "Reject" (red) — rejects, "Rejected — nothing changed" (web/components/ProposalCard.tsx:582)
- [ ] ProposalCard checkbox "also allow this target unattended" (declared_action) — mints a standing grant on accept (web/components/ProposalCard.tsx:586)
- [ ] ProposalCard checkbox "always allow this chain to post here" (outbound_send) (web/components/ProposalCard.tsx:592)
- [ ] ProposalCard note "to allow this account unattended, approve it under Approvals" (integration) (web/components/ProposalCard.tsx:597)
- [ ] ProposalCard open-choice inputs ("step N · key", placeholder "#channel" or key) — fill before Accept (web/components/ProposalCard.tsx:552)
- [ ] Standing grant row "Revoke" (red) — revokes the grant (web/components/AutomationsPanel.tsx:835)

#### Import report overlay
- [ ] "Cancel" — dismisses the translation report (web/components/AutomationsPanel.tsx:404)
- [ ] "Open on canvas — nothing saved yet" — draws the translated draft on a fresh canvas (web/components/AutomationsPanel.tsx:407)

#### Canvas header strip (AutomationGraph)
- [ ] "← Automations" — back to the list (web/components/AutomationGraph.tsx:1640)
- [ ] Name input "Name this automation" (create mode only; otherwise name is text) (web/components/AutomationGraph.tsx:1645)
- [ ] Mode toggle "Design" / "Execution" (Execution disabled for an unsaved chain unless previewing) (web/components/AutomationGraph.tsx:1667)
- [ ] "Discard" — reverts the draft to the stored record (dirty only) (web/components/automations/AutomationAuthor.tsx:238)
- [ ] "Dry run" / "Walking…" — walks the draft inert, nothing sent; opens Execution with preview (web/components/automations/AutomationAuthor.tsx:243)
- [ ] "Save design" / "Create automation" / "Saving…" — PUT or POST the draft; disabled while incomplete (web/components/automations/AutomationAuthor.tsx:250)
- [ ] "Deploy" — opens the Deploy dialog (saved chains, Design mode) (web/components/automations/DeployMenu.tsx:104)
- [ ] "Run now" / "Running…" — real run, named first so the canvas can watch it live (saved chains) (web/components/AutomationGraph.tsx:1720)

#### Canvas rail (left strip)
- [ ] Palette toggle (layers icon, "Open the palette"/"Collapse the palette") (web/components/AutomationGraph.tsx:1738)
- [ ] Runs toggle (history icon, "Open the runs list"/"Collapse the runs list") — switches to Execution (web/components/AutomationGraph.tsx:1751)
- [ ] Runs list rows (date · outcome · "N failed") — pick a run to decorate the graph (web/components/AutomationGraph.tsx:1777)

#### Canvas on-canvas toolbar (Design, top-left panel)
- [ ] "Add Trigger" — opens the palette narrowed to Triggers (web/components/AutomationGraph.tsx:1895)
- [ ] "Add Action" — opens the palette narrowed to Actions (web/components/AutomationGraph.tsx:1900)
- [ ] Undo (⌘Z) (web/components/AutomationGraph.tsx:1908)
- [ ] Redo (⌘⇧Z) (web/components/AutomationGraph.tsx:1913)
- [ ] Zoom/fit Controls (xyflow, no interactive lock) — both modes (web/components/AutomationGraph.tsx:1877)
- [ ] MiniMap "Chain overview" / "Run overview" (pannable, zoomable; only at ≥5 nodes) (web/components/AutomationGraph.tsx:1878)

#### Canvas step node (Design)
- [ ] Edit (pencil) — opens the step editor dialog (also: double-click the node) (web/components/AutomationGraph.tsx:592)
- [ ] Run to here (run icon) — inert dry run up to this step (saved chains) (web/components/AutomationGraph.tsx:599)
- [ ] Duplicate (copy icon, ⌘D) (web/components/AutomationGraph.tsx:608)
- [ ] Remove (×) — absent on the last remaining step (web/components/AutomationGraph.tsx:616)
- [ ] Inline primary field inputs per kind (question; channel+message; trigger_id+message; subscription_id; action_id; automation_id; operation; metric; query_id; data+context) (web/components/AutomationGraph.tsx:488)
- [ ] Inline metric field on a Governed metric node (MetricField, governed metrics as you type) (web/components/AutomationGraph.tsx:661)
- [ ] Bound-field chip with "unbind" × (web/components/AutomationGraph.tsx:653)
- [ ] Input port dots (drag a "gives" dot onto them to bind) incl. "only if", "otherwise", "for each" ports (web/components/AutomationGraph.tsx:633)
- [ ] Output "gives <key>" port dots — drag to bind; dropped on empty canvas opens the palette filtered to consumers (web/components/AutomationGraph.tsx:770, :1340)
- [ ] Drag nodes to arrange (positions persisted per user, debounced) (web/components/AutomationGraph.tsx:1843)
- [ ] Double-click an edge — removes that binding (web/components/AutomationGraph.tsx:1863)
- [ ] Click a node — selects it (for ⌘C/⌘D) (web/components/AutomationGraph.tsx:1836)
- [ ] Drop a palette row onto the canvas — adds at the drop point (web/components/AutomationGraph.tsx:1820)

#### Palette (AutomationPalette)
- [ ] Search "Search steps…" (autofocus; Esc closes) (web/components/automations/AutomationPalette.tsx:290)
- [ ] Close palette × (web/components/automations/AutomationPalette.tsx:298)
- [ ] Binding-filter banner "can bind <step.key>" with clear × (web/components/automations/AutomationPalette.tsx:303)
- [ ] Row "+" add button (click adds at viewport centre) and drag-to-canvas (ready rows only) (web/components/automations/AutomationPalette.tsx:167, :207)
- [ ] Fold "N steps need setup" per group (gated rows collapsed when not searching) (web/components/automations/AutomationPalette.tsx:372)
- [ ] Trigger rows (server-served, pramanyx/automations/palette.py:69): Schedule, Webhook, Metric, Source change, New entity, Promise breached, Objects admitted, New finding (web/components/automations/AutomationPalette.tsx:365)
- [ ] Action rows (pramanyx/automations/palette.py:103): Investigate, Post to Slack, Notify, Deliver briefing, Declared action, Run a chain, Use an integration, Governed metric, Call an MCP tool, Synthesize, Trusted query, Measure expectations (web/components/automations/AutomationPalette.tsx:365)

#### Step editor dialog — trigger node ("When (all match|any match)")
- [ ] Trigger kind select per condition: Schedule, Webhook, Metric, Source change, New entity, Promise breached, New finding, Objects admitted (web/components/automations/AutomationRows.tsx:613)
- [ ] Remove trigger ✕ (absent on the last one) (web/components/automations/AutomationRows.tsx:618)
- [ ] "Add Trigger" (web/components/automations/AutomationAuthor.tsx:326)
- [ ] Schedule: "Repeats" select Hourly / Daily / Weekly / Monthly / Custom (cron) (web/components/automations/ScheduleEditor.tsx:198)
- [ ] Schedule: "At (<tz>)" time input (daily/weekly/monthly) (web/components/automations/ScheduleEditor.tsx:215)
- [ ] Schedule: "At minute" number (hourly) (web/components/automations/ScheduleEditor.tsx:223)
- [ ] Schedule: "On day" 1–28 select (monthly) (web/components/automations/ScheduleEditor.tsx:231)
- [ ] Schedule: "On" weekday chips Mon–Sun toggles (weekly; last one cannot be cleared) (web/components/automations/ScheduleEditor.tsx:151)
- [ ] Schedule: "Cron expression (<tz>)" input (custom) (web/components/automations/ScheduleEditor.tsx:251)
- [ ] Metric trigger: "monitor id" input (web/components/automations/AutomationRows.tsx:626)
- [ ] Source change / New entity: "table (schema.table)" input (web/components/automations/AutomationRows.tsx:629)
- [ ] Objects admitted: "Entity" + "Segment" inputs (web/components/automations/AutomationRows.tsx:635)
- [ ] "Done" — closes the dialog (web/components/automations/AutomationAuthor.tsx:349)

#### Step editor dialog — action node ("<alias> · <kind>")
- [ ] Action kind select: Notify, Investigate, Deliver briefing, Declared action, Post to Slack, Run a chain, Call an MCP tool, Use an integration, Governed metric, Synthesize, Trusted query, Measure expectations (web/components/automations/AutomationRows.tsx:937)
- [ ] Notify: "Notifications trigger id" (web/components/automations/AutomationRows.tsx:944)
- [ ] Investigate: "Agent question" + "Run as agent" select ("Run unbound (no agent)" / "Run as <agent>") (web/components/automations/AutomationRows.tsx:948)
- [ ] Deliver briefing: "briefing subscription id" (web/components/automations/AutomationRows.tsx:962)
- [ ] Post to Slack: "Post as bot" select (incl. "(paused)" / "Removed bot — id" kept options) (web/components/automations/AutomationRows.tsx:971)
- [ ] Post to Slack: channel input (bindable) + cast select (web/components/automations/AutomationRows.tsx:998)
- [ ] Post to Slack: message input (bindable) + cast select — hidden when What gets posted owns the words (web/components/automations/AutomationRows.tsx:1008)
- [ ] Binding cast select "as-is" / "as <cast>" (only when the field holds a binding) (web/components/automations/AutomationRows.tsx:175)
- [ ] Use an integration: "Act as…" grant select, "Do what…" operation select ("(write)" marked), per-param inputs (+ cast) (web/components/automations/AutomationRows.tsx:757)
- [ ] Call an MCP tool: "Which server…", "Which tool…" (+ "(granted)"), per-argument inputs (web/components/automations/AutomationRows.tsx:883)
- [ ] Declared action: "declared action id" + "params JSON" (web/components/automations/AutomationRows.tsx:1022)
- [ ] Governed metric: MetricField (suggests governed metrics; "Use <metric>" near-miss buttons) (web/components/automations/AutomationRows.tsx:1033, web/components/metrics/MetricField.tsx:71)
- [ ] Trusted query: "Pick a query" / "Write SQL" mode buttons; query id input, or question + SQL textarea (web/components/automations/AutomationRows.tsx:354)
- [ ] Measure expectations: "Table" input; per row Column, "What it must meet" select, value inputs, "If not met" (say so / block publishing), remove ✕, "Add an expectation" (web/components/automations/AutomationRows.tsx:293)
- [ ] Synthesize: data input (bindable) + context textarea (web/components/automations/AutomationRows.tsx:1056)
- [ ] Run a chain (subchain): only the node-face "automation id" input — the dialog row has no editor for this kind (web/components/AutomationGraph.tsx:496)
- [ ] "Only if": logic select all/any, "+ condition", subject select (upstream refs, "(missing)" kept), comparison select, value input, remove ✕ (web/components/automations/AutomationRows.tsx:416)
- [ ] "Otherwise": select "— runs regardless —" / "runs when <step>'s Only if does not hold" (web/components/automations/AutomationRows.tsx:492)
- [ ] "For each": "+ list", "+ item" (capped), "runs once", per-item inputs + remove ✕ (web/components/automations/AutomationRows.tsx:560)
- [ ] "Done" (web/components/automations/AutomationAuthor.tsx:349)

#### What gets posted (Slack step editor, right half of a 1060px dialog)
- [ ] "Edit the question" — jumps the editor to the source investigate step (web/components/automations/WhatGetsPosted.tsx:140)
- [ ] "The words" segmented: Summary / Headline / Both / Own words (+ own-words input) (web/components/automations/WhatGetsPosted.tsx:147)
- [ ] "Picture" segmented: None / Table / Chart (web/components/automations/WhatGetsPosted.tsx:163)
- [ ] "Kind of chart" segmented: Auto / Bars / Horizontal bars / Line / Pie / Number (only kinds the last run's rows fit) (web/components/automations/WhatGetsPosted.tsx:171)
- [ ] "Drawn from" select: The answer's main result / A result over time / Every result, one picture each (web/components/automations/WhatGetsPosted.tsx:186)
- [ ] "Title" segmented: The result's own sentence / The automation's name / My own words (+ title input) (web/components/automations/WhatGetsPosted.tsx:205)
- [ ] "Names" table: per-column rename inputs + axis name input (web/components/automations/WhatGetsPosted.tsx:217)

#### Open-set key picker (binding an "outcome" port)
- [ ] Observed key chips — bind with that key (web/components/automations/OutcomeKeyPicker.tsx:69)
- [ ] "or type a key" input (Enter binds, Esc cancels) (web/components/automations/OutcomeKeyPicker.tsx:79)
- [ ] "Bind" / "Cancel" (web/components/automations/OutcomeKeyPicker.tsx:91)

#### Deploy dialog
- [ ] Schedule door: "Turn on" / "Turn off" (web/components/automations/DeployMenu.tsx:193)
- [ ] MCP tool door: "Offer as tool" / "Stop offering" (web/components/automations/DeployMenu.tsx:198)
- [ ] Webhook door: "Issue URL" / "Rotate", "Revoke" (red) (web/components/automations/DeployMenu.tsx:203)
- [ ] Issued webhook "Copy" / "Copied" — copies the full curl command (web/components/automations/DeployMenu.tsx:238)
- [ ] Slack door (and any other): no verb here — the server's reason says where to fix it (web/components/automations/DeployMenu.tsx:217)

### Dialogs, drawers, popovers, panels
- [ ] Full-panel canvas (replaces the list; Design = editable draft, Execution = server graph of a run/preview) (web/components/AutomationsPanel.tsx:519)
- [ ] Import translation report overlay — verdict title, reason, "Still to fill on the canvas: …", suggested NEW agent note ("Create it from Agent Ops → Roster…"), per-node rows (mapped/refused/…, component, detail) (web/components/AutomationsPanel.tsx:391)
- [ ] Step editor dialog (FormDialog over blurred canvas, 760px; 1060px for Slack steps) — trigger conditions or one step's full widget set (web/components/automations/AutomationAuthor.tsx:311)
- [ ] What gets posted panel inside the Slack step dialog, with live "As Slack will show it" preview (web/components/automations/WhatGetsPosted.tsx:133)
- [ ] Palette side column (232px) beside the canvas (web/components/automations/AutomationPalette.tsx:281)
- [ ] Runs list side column (132px, Execution mode) (web/components/AutomationGraph.tsx:1766)
- [ ] Open-set key picker panel (top-centre of canvas) (web/components/AutomationGraph.tsx:1920)
- [ ] Deploy dialog "Deploy" — "What this deployment can open for this chain. <summary>", one row per door with state + server reason (web/components/automations/DeployMenu.tsx:109)
- [ ] One-time webhook credential block (curl command, "Shown once — copy it now. Rotating is the only way to get another.") (web/components/automations/DeployMenu.tsx:224)
- [ ] Browser confirm() on Delete (web/components/AutomationsPanel.tsx:319)
- [ ] Transient banner (4s) for run/propose/import/toggle outcomes (web/components/AutomationsPanel.tsx:378)
- [ ] Canvas notice chip (refused drag, paste drops, "<alias> copied — ⌘V to paste it into any chain.") (web/components/AutomationGraph.tsx:1932)

### Figures, counts, badges, status chips, freshness
- [ ] Inbox tab badge = pending proposal count (web/components/AutomationsPanel.tsx:336)
- [ ] MiniStats: Automations (total) · Enabled · Muted (web/components/AutomationsPanel.tsx:465)
- [ ] Row: "muted" amber badge (web/components/AutomationsPanel.tsx:595)
- [ ] Row: "● <last_status>" coloured fired/not_fired/gated/error (web/components/AutomationsPanel.tsx:596)
- [ ] Row: one-line chain summary "schedule(cron) AND … → kind(target) · per item" (web/components/AutomationsPanel.tsx:598)
- [ ] Row: dimmed (60%) when disabled (web/components/AutomationsPanel.tsx:588)
- [ ] Runs: "Versions · runs as vN" + per version "vN saved by … · <relTime> · <source>" (web/components/AutomationsPanel.tsx:692)
- [ ] Runs: collapsed quiet ticks "not fired ×N" + reason + time span (web/components/AutomationsPanel.tsx:737)
- [ ] Runs: outcome badge, reason, "<relTime> · <ms>ms · vN / no version kept" (web/components/AutomationsPanel.tsx:750)
- [ ] Runs: per-effect "status · kind (target) ×attempts — message", error line (web/components/AutomationsPanel.tsx:760)
- [ ] Inbox MiniStats: Pending proposals · Standing grants (web/components/AutomationsPanel.tsx:804)
- [ ] Inbox: grant row "<action_id> → arg=value · used N× · by <who>" (web/components/AutomationsPanel.tsx:832)
- [ ] Inbox: "Recently resolved" (last 8): status · action · resolver — message (web/components/AutomationsPanel.tsx:843)
- [ ] ProposalCard kind chip (action / integration write / new agent / new automation / agent + schedule / pause / resume / agent grant / edit / monitor + chain / brief delivery / Slack post / agent limit / dashboard / dashboard · publish / from query history) (web/components/ProposalCard.tsx:50)
- [ ] ProposalCard "by <who> · waiting <relTime>", "as <account>" for integration (web/components/ProposalCard.tsx:423)
- [ ] ProposalCard body rows per kind (Agent/Scope/Instructions/Documents; Automation/Does/Runs as/First run/Dry run; diff before›after; Monitor/Watches σ; Brief/When/Delivers via; Change; Grant; Posts to/Message; Proposes/Seen/On accept; Action + params) (web/components/ProposalCard.tsx:165)
- [ ] ProposalCard settled status line "<status> — <note>" (web/components/ProposalCard.tsx:602)
- [ ] Canvas header: "● enabled" / "● disabled" (web/components/AutomationGraph.tsx:1656)
- [ ] Canvas header: "unsaved" (web/components/automations/AutomationAuthor.tsx:235)
- [ ] Canvas header: first incomplete reason "Action N needs …" "· +N" (full list on hover) or save error (web/components/automations/AutomationAuthor.tsx:224)
- [ ] Canvas header (Execution): "preview — nothing was sent", "never run — showing the design", "last run <outcome> — <reason>" (web/components/AutomationGraph.tsx:1679)
- [ ] Execution step card: kind, label, detail, "only if …", "otherwise of …", "● would run / held · condition not met / not taken / <status>", "· X of N · M held", duration, attempts, "for each …", "as/delegated to <agent>", "gives …" (web/components/AutomationGraph.tsx:176)
- [ ] Execution trigger card: "when <detail>", "fired · …", timestamp · duration, "steps run in parallel — as the arrows allow" (web/components/AutomationGraph.tsx:273)
- [ ] Design trigger node: "Trigger", "all match/any match", condition lines ("on schedule · cron", "monitor X fires", "<table> changes", "new key in …", "<entity> objects entering <segment>", "when its URL is called"), "manual only" (web/components/AutomationGraph.tsx:799)
- [ ] Design step node: kind label + hue, alias chip, "picture: chart · bars · over time" summary (Slack) (web/components/AutomationGraph.tsx:585, :676)
- [ ] Edges: data (animated), guard (dashed), fan (dotted), route "otherwise" (dashed, still), sequence spine (web/components/AutomationGraph.tsx:1530)
- [ ] Runs rail rows: "MM-DD HH:MM", outcome, "N failed" (red) (web/components/AutomationGraph.tsx:1788)
- [ ] Palette row: label (description on hover), "gives …", dimmed + reason sentence when not ready (web/components/automations/AutomationPalette.tsx:143)
- [ ] Schedule read-back "Every Mon, Wed at 09:00 UTC · next run Tue 11 Nov, 09:00 UTC" (web/components/automations/ScheduleEditor.tsx:258)
- [ ] For each: "runs once per item · read it as item.value" / "N items · edited on the canvas" (web/components/automations/AutomationRows.tsx:546, :589)
- [ ] Deploy door state "● open / closed / needs setup / unavailable" + detail + server reason (web/components/automations/DeployMenu.tsx:144)
- [ ] What gets posted: "The question it answers · <step>", "Read from <step> on each run.", "Not offered for this result — <kinds>: <why>", chosen results list "<claim> · N rows", preview "As Slack will show it · from the run at …Z" (web/components/automations/WhatGetsPosted.tsx:137)
- [ ] MetricField note (approved / retired / waiting for review / draft / unknown + near-miss) (web/components/metrics/MetricField.tsx:43)

### Keyboard shortcuts
- [ ] Enter in the describe-it input — Propose (web/components/AutomationsPanel.tsx:348)
- [ ] ⌘Z / Ctrl+Z undo, ⌘⇧Z redo (canvas in Design, works inside fields too) (web/components/AutomationGraph.tsx:1187)
- [ ] ⌘C copy selected step, ⌘V paste a step (across chains), ⌘D duplicate selected step (not while typing) (web/components/AutomationGraph.tsx:1195)
- [ ] Esc in palette search — closes the palette (web/components/automations/AutomationPalette.tsx:294)
- [ ] Enter / Esc in the outcome-key picker — bind / cancel (web/components/automations/OutcomeKeyPicker.tsx:83)
- [ ] Double-click node — open editor; double-click edge — unbind (web/components/AutomationGraph.tsx:1862)
- [ ] Hint line on canvas: "double-click a step to open its editor · drag a gives dot onto an input dot to bind · double-click an edge to unbind · ⌘D … ⌘C / ⌘V …" (web/components/AutomationGraph.tsx:1941)

### URL params / deep links
- [ ] `?tab=agentic-ops&layer=automations` — the shell reads/writes the layer (web/app/page.tsx:1257)
- [ ] `?conn=<id>` — the shell's selected connection, which scopes this layer (web/app/page.tsx:1256)
- [ ] focusId ("Open automation" target) is in-memory only — no URL param opens one automation (web/components/AgenticOpsWorkspace.tsx:162)
- [ ] Panel's own view (list/Runs/Inbox/canvas) is not in the URL (web/components/AutomationsPanel.tsx:88)

### Empty / error / loading / withheld states
- [ ] "Loading… automations" (Loading) — only when nothing is on screen yet (web/components/AutomationsPanel.tsx:454)
- [ ] ReadFailed "the automations" with Retry — a failed read is not "No automations yet" (web/components/AutomationsPanel.tsx:457)
- [ ] "No automations yet" + "Bind a condition (a schedule, a metric, a data change) to an effect — investigate, deliver a briefing, notify, or run a governed action." (web/components/AutomationsPanel.tsx:902)
- [ ] "No automations on this connection" + "N automations exist on <names>. This list shows only the connection you have selected — switch to it to see them." (web/components/AutomationsPanel.tsx:902)
- [ ] Runs: "Pick an automation to see its tick history." / "No ticks yet — hit “Run now”." (web/components/AutomationsPanel.tsx:723)
- [ ] Versions: "Its versions could not be read." / "None kept yet." / why_not line (web/components/AutomationsPanel.tsx:689)
- [ ] Inbox without a connection: "Select a connection to see its proposal queue." (web/components/AutomationsPanel.tsx:800)
- [ ] Inbox empty: "No staged proposals. When the agent proposes a declared action, it lands here for you to accept or reject." + "(Requires the automations.proposals flag.)" — stale: that flag was retired (pramanyx/kernel/flags.py:61) (web/components/AutomationsPanel.tsx:811)
- [ ] Inbox read failure is swallowed — shows as empty, not as an error (web/components/AutomationsPanel.tsx:228)
- [ ] Propose refusal banner: server reason, or "nothing here can do that yet" (web/components/AutomationsPanel.tsx:252)
- [ ] Propose success banner "Proposed N steps — dry-run checked, nothing saved yet. Note: …" (web/components/AutomationsPanel.tsx:262)
- [ ] Import: "<file> is not JSON — export the flow from the editor"; titles "Nothing in this flow mapped onto a governed step" / "Could not read this file"; "Imported from <source> — nothing saved yet — still to fill: …" (web/components/AutomationsPanel.tsx:282, :397, :296)
- [ ] Banners "Could not toggle" / "Could not pause" / "Run failed" / "Could not delete" / `Created "<name>"` (web/components/AutomationsPanel.tsx:301)
- [ ] Canvas Run now banner "Ran" / "Waiting on approval — <reason>" / "Did not run — <reason>" (web/components/AutomationsPanel.tsx:138)
- [ ] Execution: "Could not load the graph: <error>" (web/components/AutomationGraph.tsx:1612)
- [ ] Execution: "Loading… the run" (web/components/AutomationGraph.tsx:1955)
- [ ] Runs rail: "no runs yet" (web/components/AutomationGraph.tsx:1772)
- [ ] Paste drop notice "<alias>: <refs> was/were not carried over — the step they read is not in this chain." (web/components/AutomationGraph.tsx:1069)
- [ ] Run-to-here failure "Could not walk the chain" (web/components/AutomationGraph.tsx:1098)
- [ ] Incomplete draft: "Trigger N needs …", "Action N needs …", "add at least one action" (web/components/automations/AutomationAuthor.tsx:129)
- [ ] Palette: "Loading…", "Could not load the palette — the canvas still adds steps from the buttons above.", "Nothing matches “<q>”." (web/components/automations/AutomationPalette.tsx:329)
- [ ] Webhook trigger: "Nothing to fill in — issue this chain's URL under Deploy." (web/components/automations/AutomationRows.tsx:650)
- [ ] Objects admitted: "The first check records the objects already in; later checks fire for the ones that enter." (web/components/automations/AutomationRows.tsx:641)
- [ ] Slack: "No Slack bots configured — create one first, then this step can post as it." + bot note for paused/removed bot (web/components/automations/AutomationRows.tsx:968)
- [ ] Integration: "No connected accounts — connect one under Integrations, then this step can act as it." / "This step acts as an account you can no longer pick — reconnect it under Integrations, or choose another." / server reason / "A write — it passes the approval gate before it runs." (web/components/automations/AutomationRows.tsx:750)
- [ ] MCP: "No MCP server with a tool this step may call — allow one under MCP servers and discover its tools, then pick it here." / "(not callable now)" (web/components/automations/AutomationRows.tsx:876)
- [ ] Trusted query: "Saving runs this once to verify it. It stays private to this automation until you promote it." (web/components/automations/AutomationRows.tsx:381)
- [ ] Synthesize: "Every number in the summary has to appear in the data it was given. Leave the context empty and it simply summarises." (web/components/automations/AutomationRows.tsx:1066)
- [ ] Expectations: "Each is measured read-only and counts the rows that break it, never the rows themselves…" (web/components/automations/AutomationRows.tsx:336)
- [ ] Outcome-key picker: "looking up what this step has published…" / "keys it published on its last run — a declared action may carry others" / "this step has not run here yet, so its keys are not known — type the one the action returns" (web/components/automations/OutcomeKeyPicker.tsx:99)
- [ ] Deploy: "Could not read this chain's doors." / server error text (web/components/automations/DeployMenu.tsx:82)
- [ ] What gets posted: "Save the chain once to see its post here.", "The preview could not be drawn: …", server `said` (e.g. "This chain has not run yet — a dry run or its first run gives the preview something to draw."), "These rows have no honest <picture>; none is posted.", "No picture." (web/components/automations/WhatGetsPosted.tsx:251)
- [ ] MetricField: "The governed metrics could not be read — the name is kept as typed." (web/components/metrics/MetricField.tsx:58)
- [ ] ProposalCard: "Fill the open choices first — accepting would arm a placeholder" (Accept tooltip) (web/components/ProposalCard.tsx:576)

### Loads on open
- [ ] GET /automations?conn_id= — the list, on open and after every verb (web/lib/api.ts:7013 → pramanyx/routers/automations.py:219)
- [ ] GET /automations (unscoped) + GET /connections — only when the scoped list is empty, to say where the others are (web/components/AutomationsPanel.tsx:197; web/lib/api.ts:30 → pramanyx/routers/connections.py:83)
- [ ] GET /kinetic-actions/inbox?connection_id= + GET /kinetic-actions/grants?connection_id= — when the Inbox tab opens (web/lib/api.ts:7384, :7442 → pramanyx/routers/kinetic.py:242, :305); pure reads
- [ ] GET /integrations/connections — Inbox account labels (useIntegrationGrants), and integration step editor (web/lib/api.ts:6283 → pramanyx/routers/integrations.py:286)
- [ ] GET /automations/{id}/runs?limit= + GET /automations/{id}/versions — when an automation is picked in Runs/History (web/lib/api.ts:7234, :6676 → pramanyx/routers/automations.py:826, :946)
- [ ] GET /automations/vocabulary — canvas open (cached module-side) (web/lib/api.ts:5796 → pramanyx/routers/automations.py:93)
- [ ] GET /automations/{id}/layout — saved canvas arrangement (web/lib/api.ts:5894 → pramanyx/routers/automations.py:197)
- [ ] GET /automations/{id}/graph?run=latest|<id> — Execution mode, and on a pending open-set bind (web/lib/api.ts:7314 → pramanyx/routers/automations.py:774); read-only
- [ ] GET /automations/palette?conn_id= — each time the palette opens (not cached) (web/lib/api.ts:5875 → pramanyx/routers/automations.py:141)
- [ ] GET /agents/custom + GET /slack-bots — step editor dialog open (web/lib/api.ts:10268, :6356 → pramanyx/routers/agents.py:273, pramanyx/routers/slackbots.py:40)
- [ ] GET /integrations/operations?connection_id= / GET /mcp-servers / GET /metrics?connection_id= — only for those step kinds' editors (web/lib/api.ts:6273, :6081, :1218 → pramanyx/routers/integrations.py:313, pramanyx/routers/mcpservers.py:133)
- [ ] GET /automations/{id}/doors — when the Deploy dialog opens (web/lib/api.ts:7149 → pramanyx/routers/automations.py:604); "Reading this opens nothing"
- [ ] POST /automations/{id}/picture-preview — fires automatically (debounced 450ms) whenever a saved chain's Slack step editor is open and its config changes; a POST on open but read-only by its docstring ("nothing runs, nothing is sent, no model is called") (web/lib/api.ts:7224 → pramanyx/routers/automations.py:885)
- [ ] GET /activity?trace_id=<run>&limit=200 — POLLS every 1s while a canvas "Run now" is in flight (web/components/AutomationGraph.tsx:1248 → pramanyx/routers/obs.py:828)
- [ ] PUT /automations/{id}/layout — WRITES on drag/undo/palette-drop (debounced 500ms), not on open (web/lib/api.ts:5900 → pramanyx/routers/automations.py:209)
- [ ] SPENDS on click (not on open): POST /automations/propose (model drafts a chain), POST /automations/{id}/run ("Run now", real run through the gates) (web/lib/api.ts:7035, :7198 → pramanyx/routers/automations.py:278, :690)
- [ ] No poll on the list, Runs or Inbox views; no WRITES ON OPEN found for this layer

**Top rows today:** above the layer, the workspace's three shared rows — context bar [Connection select]; layer tabs [Overview · Roster · Attention(badge) · Automations · Hub · Departures(badge) · By duty · Action centre · Developer · "?"]; toolbar [RangePicker (no effect on this layer) … "+ Create agent"]. Then the panel's own row: tabs [Automations · Runs · Inbox(badge)] with, on the list tab only, trailing [describe-it input · Propose · Import flow… · + New automation]. Inside a canvas the strip is [← Automations · name · ● enabled · Design|Execution · status chips … unsaved/incomplete · Discard · Dry run · Save design/Create automation · Deploy · Run now].

## Agent Ops — Hub (`layer=hub`)
_Source: web/components/agentops/HubMapPanel.tsx (+ web/lib/hubMap.ts text helpers, web/components/agentops/Term.tsx). Mounted at web/components/AgenticOpsWorkspace.tsx:303 with no connId on purpose — hub-wide; the workspace's shared rows sit above it._

### Controls
- [ ] "Refresh" — re-reads the hub map (web/components/agentops/HubMapPanel.tsx:106)
- [ ] "Retry" — after a failed read (web/components/agentops/HubMapPanel.tsx:76)
- [ ] Automation name link (automations only, not monitors) — "Open automation": switches to the Automations layer opened on that automation's canvas (web/components/agentops/HubMapPanel.tsx:154)
- [ ] "runs as <agent id>" link — opens that agent in the Roster (web/components/agentops/HubMapPanel.tsx:227)
- [ ] "Probation" column header term — hover explains probation (web/components/agentops/HubMapPanel.tsx:126, web/components/agentops/Term.tsx)
- [ ] Hover titles: name → description; last-run time → ISO timestamp; trigger → full list; destination → resolved principals/target; grant → "<action> · used N×"; cost → caveat or "N runs · M deep runs in Nd"; probation → detail; failure rate → "X of Y runs failed in the last N days" (web/components/agentops/HubMapPanel.tsx:155)
- [ ] Table columns (no sort, no filter, no search): Automation · Last run · Trigger · Destinations · Grant · Owner · Cost · Probation (web/components/agentops/HubMapPanel.tsx:119)
- [ ] Connection select in the workspace context bar does NOT scope this layer (hover title says so) (web/components/AgenticOpsWorkspace.tsx:235)

### Dialogs, drawers, popovers, panels
- none found (links switch layers: Automations canvas, Roster agent page)

### Figures, counts, badges, status chips, freshness
- [ ] Header title "Every automation and monitor, one screen" (web/components/agentops/HubMapPanel.tsx:98)
- [ ] Totals line "N automations · N monitors · N live · N on probation · cost over Nd is a floor" (web/components/agentops/HubMapPanel.tsx:101)
- [ ] Row state dot (live green / muted amber / expired·disabled grey), title = state (web/components/agentops/HubMapPanel.tsx:152, web/lib/hubMap.ts:65)
- [ ] Row sub-line "monitor · <conn_id> · <state>" (web/components/agentops/HubMapPanel.tsx:166)
- [ ] Last run date-time + "● fired / not_fired / gated / error / paused" coloured, or "never" (web/components/agentops/HubMapPanel.tsx:170)
- [ ] Failure rate "<label> · Nd" (red when failures measured; "no runs" / "not permitted" never 0%) (web/components/agentops/HubMapPanel.tsx:179, web/lib/hubMap.ts:77)
- [ ] Trigger list "a · b" (mono, truncated) (web/components/agentops/HubMapPanel.tsx:188)
- [ ] Destinations: "slack #ch", "in-app", "<label> (<type>)", "trigger X", "nowhere: no trigger "X"", "routed(<about>) → N destinations" (cyan) (web/components/agentops/HubMapPanel.tsx:196, web/lib/hubMap.ts:6)
- [ ] Grant "<action>→<target>" or "—" (web/components/agentops/HubMapPanel.tsx:207)
- [ ] Owner "declared_by" (violet when "pack:…") + "runs as <agent>" (web/components/agentops/HubMapPanel.tsx:220)
- [ ] Cost (tokens / runs, "—" when none) with "*" when a floor caveat applies (unpriced calls / calls without usage) (web/components/agentops/HubMapPanel.tsx:236, web/lib/hubMap.ts:29)
- [ ] Probation "probation · NN% of D" / "probation · not measured" / "graduated" / "—" (amber when on) (web/components/agentops/HubMapPanel.tsx:242, web/lib/hubMap.ts:49)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] `?tab=agentic-ops&layer=hub` — shell-written layer id (web/app/page.tsx:1257)
- [ ] The door accepts `?conn_id=` for a narrow read but this layer never passes it (prop `connId` unused by the workspace) (web/components/agentops/HubMapPanel.tsx:57)

### Empty / error / loading / withheld states
- [ ] Skeleton rows (6) while first loading (web/components/agentops/HubMapPanel.tsx:66)
- [ ] "Could not read the hub map — <error>" + Retry — an unreadable map is not an empty one (web/components/agentops/HubMapPanel.tsx:74)
- [ ] "No hub map on this API" — "This API predates the hub map door (HB-6). Update the server and reload." (404) (web/components/agentops/HubMapPanel.tsx:83)
- [ ] "Nothing on the map yet" — "The map fills as automations are declared — by people, or by an installed function pack." (web/components/agentops/HubMapPanel.tsx:110)
- [ ] Failure rate withheld: "not permitted" — "You may not see these runs." (no count, row kept) (web/lib/hubMap.ts:83)
- [ ] Unmeasured precision says "not measured", never 0% (web/lib/hubMap.ts:51)
- [ ] Cost caveat "<…> — a floor, not a total" (web/lib/hubMap.ts:43)

### Loads on open
- [ ] GET /hub/map — one read on first open and on Refresh/Retry; 7-day failure window by default; no poll (web/lib/api.ts:6799 → pramanyx/routers/hub.py:15); read-only (no write found in pramanyx/hub/map.py)

**Top rows today:** above the layer, the workspace's shared rows — context bar [Connection select (does not scope Hub)]; layer tabs [Overview · Roster · Attention(badge) · Automations · Hub · Departures(badge) · By duty · Action centre · Developer · "?"]; toolbar [RangePicker (no effect on Hub) … "+ Create agent"]. Then the panel's own header row: [title "Every automation and monitor, one screen" · totals line … Refresh].

## Agent Ops — Departures (`layer=departures`)
_Source: web/components/agentops/DeparturesPanel.tsx (+ web/lib/departures.ts shaping; mounted at web/components/AgenticOpsWorkspace.tsx:298-302)_

### Controls
- [ ] Filter "All" — shows every ledger row (web/components/agentops/DeparturesPanel.tsx:27, 130-137)
- [ ] Filter "Needs a person" — rows still owed a mark or an answer (web/components/agentops/DeparturesPanel.tsx:28; web/lib/departures.ts:62-67)
- [ ] Filter "Held" — every row whose state is not `departed` (web/components/agentops/DeparturesPanel.tsx:29; web/lib/departures.ts:64)
- [ ] Filter "Departed" — only rows the gate let go (web/components/agentops/DeparturesPanel.tsx:30; web/lib/departures.ts:65)
- [ ] "Refresh" — re-reads the ledger and the summary (web/components/agentops/DeparturesPanel.tsx:138)
- [ ] Row button "Review" (owed rows) / "Details" (others) / "Hide" (open) — expands or collapses the row's detail beneath it (web/components/agentops/DeparturesPanel.tsx:215-218)
- [ ] Mark: "Accept" — books an accept verdict on a probation send or on the answer a departure carried; says if the automation graduated (web/components/agentops/DeparturesPanel.tsx:302-305)
- [ ] Mark: "Needs correction" — books a correct verdict (web/components/agentops/DeparturesPanel.tsx:306-309)
- [ ] Mark: "Reject" — books a reject verdict (destructive styling, no confirm) (web/components/agentops/DeparturesPanel.tsx:310-313)
- [ ] Choose a reading — one button per reading ("{label} {preview}") when an owner question waits; remembers the choice for the next run (web/components/agentops/DeparturesPanel.tsx:326-336)
- [ ] Remedy door "Open automation" — switches to the Automations layer opened ON that automation (hover title "Automations · {name}") (web/components/agentops/DeparturesPanel.tsx:247-251; web/components/AgenticOpsWorkspace.tsx:162-166)
- [ ] Remedy door "Open the analysis" — switches to the Overview with its "Every trace" fold opened on that analysis (web/components/agentops/DeparturesPanel.tsx:253-256; web/components/AgenticOpsWorkspace.tsx:216-219)
- [ ] Remedy door "Open the Semantic Layer" — navigates to the Semantic Layer scoped to the row's connection (`requestTab("semantic", {conn})`) (web/components/agentops/DeparturesPanel.tsx:258-260)
- [ ] Remedy door "Ask Spotlight about this hold" — opens Spotlight (Cmd-K palette) seeded with a question about this hold, with the departure as its object (web/components/agentops/DeparturesPanel.tsx:265-270)
- [ ] "Retry" — on a failed read, reads again (web/components/agentops/DeparturesPanel.tsx:99)
- [ ] Hover titles: full source name on "What" (195), raw target address on the destination (199), full why line on the clamped "Why" cell (206) (web/components/agentops/DeparturesPanel.tsx:195-211)
- [ ] Table headings When / What, and where to / State / Why / (action) — fixed layout, no sort, no column menu (web/components/agentops/DeparturesPanel.tsx:152-160)

### Dialogs, drawers, popovers, panels
- [ ] Inline detail row under a ledger row (no dialog) — opened by Review/Details (web/components/agentops/DeparturesPanel.tsx:221-227)
- [ ] Detail: "Mark this departure" block — probation prompt "This automation is on probation: its sends reach {who} first. Was this one worth sending?" or "Was the answer this departure carried right? Your mark is a verdict on it…" + Accept / Needs correction / Reject (web/components/agentops/DeparturesPanel.tsx:292-316)
- [ ] Detail: "Choose a reading" block — the owner's question (or "The readings of {metric} disagree.") + reading buttons (web/components/agentops/DeparturesPanel.tsx:318-338)
- [ ] Detail: action result note (role=status) (web/components/agentops/DeparturesPanel.tsx:340)
- [ ] Detail: "Marked {verdict chip} · {when}" (web/components/agentops/DeparturesPanel.tsx:342-347)
- [ ] Detail: "Answered: {reading} · {when} — remembered for the next run" (web/components/agentops/DeparturesPanel.tsx:348-352)
- [ ] Detail: who it waits on ("waiting on {who}" / "no owner is routable — anyone who can answer may" / "waiting on its declarer") (web/components/agentops/DeparturesPanel.tsx:353-355; web/lib/departures.ts:160-168)
- [ ] Detail: "Why" — every reason it was held, as a list (web/components/agentops/DeparturesPanel.tsx:357-366)
- [ ] Detail: "What to do next" — remedy lead (held rows) and, per guard, its label, meaning, action and its doors (web/components/agentops/DeparturesPanel.tsx:368-388)
- [ ] Detail: "The message" — the text preview that left or would have left (web/components/agentops/DeparturesPanel.tsx:390-398)
- [ ] Detail: "Guards, in the order they ran" — guard label · outcome · summary grid (web/components/agentops/DeparturesPanel.tsx:400-413; web/lib/departures.ts:9-18, 121-134)
- [ ] Detail: "The receipt it carried" / "The receipt it would have carried" — the receipt line verbatim (mono) (web/components/agentops/DeparturesPanel.tsx:415-424)

### Figures, counts, badges, status chips, freshness
- [ ] Header title "What left the platform, and what was held" (web/components/agentops/DeparturesPanel.tsx:121-123)
- [ ] Summary line "{n} departed · {n} held · {n} need a person" (held = held + held_probation + held_owner + held_budget) (web/components/agentops/DeparturesPanel.tsx:112-113, 124-128)
- [ ] Layer-tab badge on "Departures" = departures awaiting a person, polled every 20 s from any Agent Ops layer (web/components/AgenticOpsWorkspace.tsx:196, 200, 227)
- [ ] "When" column — timestamp as "YYYY-MM-DD HH:MM" in mono (web/components/agentops/DeparturesPanel.tsx:189-192; web/lib/departures.ts:110-112)
- [ ] "What" column — automation name / source id / kind, then kind label (Slack post, Action Hub send, Monitor alert, Scheduled briefing, Agent alert, Shared finding, Recommendation, Subscription delivery) → destination label (web/components/agentops/DeparturesPanel.tsx:194-201; web/lib/departures.ts:91-108)
- [ ] State chip — "departed" / "departed — not delivered" / "departed — no answer from the receiver" / "awaiting its declarer" / "marked {verdict}" / "asking its owner" / "answered" / "held — the week's slots were spent" / "held", each with its hue (web/components/agentops/DeparturesPanel.tsx:202-204; web/lib/departures.ts:69-89)
- [ ] "Why" column — owner question, first held reason, or "checked: {passed guards}" / "departed" (two-line clamp) (web/components/agentops/DeparturesPanel.tsx:205-213; web/lib/departures.ts:152-157)
- [ ] Guard outcome words, coloured: passed / held / asked / unavailable / not applicable / recorded (web/components/agentops/DeparturesPanel.tsx:404-410; web/lib/departures.ts:136-149)
- [ ] Verdict chip (accept positive / reject negative / correct caution) (web/components/agentops/DeparturesPanel.tsx:344)
- [ ] Focused row (from a receipt link) marked aria-selected (web/components/agentops/DeparturesPanel.tsx:188)
- [ ] List is the newest 200 rows only — not said on screen (web/components/agentops/DeparturesPanel.tsx:62)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] Reached as `?tab=agentic-ops&layer=departures` (web/lib/agentOpsLayers.ts:11-13)
- [ ] Reads `?departure=<id>` — opens that row expanded and scrolls it to centre (the receipt's link) (web/components/agentops/DeparturesPanel.tsx:55-57, 82-85; web/lib/departures.ts:175-177)
- [ ] Writes: deletes `departure` from the address after reading it (replaceState) (web/components/agentops/DeparturesPanel.tsx:74-80)
- [ ] Out: Open the Semantic Layer carries `conn` (web/components/agentops/DeparturesPanel.tsx:260)

### Empty / error / loading / withheld states
- [ ] Skeleton rows — first load (web/components/agentops/DeparturesPanel.tsx:89-91)
- [ ] "Could not read the departures ledger — {error}" + Retry — read failed (web/components/agentops/DeparturesPanel.tsx:93-101)
- [ ] "No departures ledger on this API" — "This API predates the departure gate's ledger (HB-2). Update the server and reload." — the door 404s (web/components/agentops/DeparturesPanel.tsx:104-109)
- [ ] "Nothing has left yet" — "Every Slack post, webhook, ticket, alert and scheduled briefing is judged here before it leaves. The ledger fills with the first one." (web/components/agentops/DeparturesPanel.tsx:141-145)
- [ ] "Nothing under this filter." — filter matches nothing (web/components/agentops/DeparturesPanel.tsx:146-147)
- [ ] "Nothing was sent. The reading you choose is remembered, and the next run uses it." — under an owner question (web/components/agentops/DeparturesPanel.tsx:323-325)
- [ ] "Marked. It has graduated — its next sends reach the channel." / "Marked." / "Remembered: {reading}." / error text — after an action (web/components/agentops/DeparturesPanel.tsx:303-305, 331, 340)

### Loads on open
- [ ] GET /departures?limit=200 — the ledger rows (web/lib/api.ts:6964 → pramanyx/routers/departures.py:59) read-only
- [ ] GET /departures/summary — counts by state + awaiting (+ Spotlight ask-door uptake read from the session log) (web/lib/api.ts:6975 → pramanyx/routers/departures.py:75) read-only
- [ ] Workspace poll, every 20 s while visible, on every Agent Ops layer: GET /departures/summary (badge) and GET /control-room/needs-human?limit=1 (Attention badge) (web/components/AgenticOpsWorkspace.tsx:193-200) [WRITES ON OPEN: needs-human expires stale proposals and resumes parked runs — pramanyx/routers/control_room.py:432-470]
- [ ] On action: POST /departures/{id}/verdict (web/lib/api.ts:6983 → pramanyx/routers/departures.py:98); POST /departures/{id}/answer (web/lib/api.ts:6997 → pramanyx/routers/departures.py:146)

**Top rows today:** the panel's own header row — title "What left the platform, and what was held" · summary counts · (spacer) · filter group All / Needs a person / Held / Departed · Refresh. Above it the Agent Ops chrome: context bar "Connection" picker (does not scope this layer — its hover says Departures stays hub-wide), layer tabs (Departures with its badge, "?"), toolbar range picker (not applied to this layer) and "+ Create agent".

## Agent Ops — By duty (`layer=duties`)
_Source: web/components/operations/WorkPanel.tsx (+ web/components/operations/FilingsSection.tsx, web/components/record/kit.tsx; mounted at web/components/AgenticOpsWorkspace.tsx:280-289)_

### Controls
- [ ] "Every run" (Failures by type) — leaves Agent Ops for the Runs screen (`handleNavigate("recents")`) (web/components/operations/WorkPanel.tsx:157; web/app/page.tsx:2225)
- [ ] "Every departure" (Departures) — switches to the Departures layer (web/components/operations/WorkPanel.tsx:178; web/components/AgenticOpsWorkspace.tsx:283)
- [ ] "Hub map" (On probation) — switches to the Hub layer (web/components/operations/FilingsSection.tsx:125; web/components/AgenticOpsWorkspace.tsx:288)
- [ ] "Roster" (Principals) — switches to the Roster layer (hover "Each built-in and custom agent's runs, quality and setup") (web/components/operations/WorkPanel.tsx:206)
- [ ] "Authority" (Principals) — switches to the Action centre layer (hover "What each action may do, and its grants") (web/components/operations/WorkPanel.tsx:207)
- [ ] "Keys" (Principals) — switches to the Developer layer (hover "Service principals and their keys") (web/components/operations/WorkPanel.tsx:208)
- [ ] "Open Overview" (The live events and traces) — switches to the Overview layer (web/components/operations/WorkPanel.tsx:219)
- [ ] Filings row "Close" — opens the inline close form for that filing (row highlighted) (web/components/operations/FilingsSection.tsx:84-87, 95)
- [ ] Close form input "What happened" (placeholder "what happened, in a sentence"; required) (web/components/operations/FilingsSection.tsx:101-102)
- [ ] Close form input "What it recovered" (placeholder "what it recovered, if anything — e.g. 34 late lines") (web/components/operations/FilingsSection.tsx:103-104)
- [ ] Close form "Close it" — closes the filing with its outcome; toast on success/failure (web/components/operations/FilingsSection.tsx:57-68, 106)
- [ ] Close form "Cancel" (web/components/operations/FilingsSection.tsx:107)
- [ ] Filings "Reference" link — opens the filing's URL in a new tab (hover shows URL; label is the ref or "Open it") (web/components/operations/FilingsSection.tsx:73-78)
- [ ] Copy · CSV under each ledger (week-by-duty, open-filings, principals) — copies cells / downloads CSV; control columns excluded (web/components/record/kit.tsx:241-249)
- [ ] "Retry" on any section whose read failed (web/components/record/kit.tsx:62; web/components/ui/states.tsx:97-98)
- [ ] Hover on "Tokens per warranted entry" cell — the cost note (web/components/operations/WorkPanel.tsx:118-125)

### Dialogs, drawers, popovers, panels
- [ ] Inline "Close “{filing}” — what happened?" form under the filings ledger, with "Recorded as {actor}" (read-only, hover explains sign-in) and the note "Closing says what happened. For a promise, its measures are read again now and kept beside the ones read when it was filed." (web/components/operations/FilingsSection.tsx:97-112; web/components/record/kit.tsx:87-96)
- [ ] No dialogs or drawers

### Figures, counts, badges, status chips, freshness
- [ ] Section "The week by duty" meta "since {day} · every connection" (web/components/operations/WorkPanel.tsx:144)
- [ ] Week-by-duty ledger columns: Duty · Carried today by · Runs ("—" when unmetered) · Booked · Warranted · Failed · Tokens per warranted entry ("not metered for this duty" / cost note) (web/components/operations/WorkPanel.tsx:111-126, 148)
- [ ] The week's note line under the ledger (server-written) (web/components/operations/WorkPanel.tsx:150)
- [ ] Section "Failures by type" meta "{n} failures"; each row: count + failure words (e.g. "the change was not visible afterwards", "held by a law of the gate", "ran out of its budget") + the duties that failed that way (web/components/operations/WorkPanel.tsx:52-67, 156, 163-171)
- [ ] Section "Departures": "{n} {state} · …" all states, "{n} sends waiting on a person" / "none waits on a person", "all time, every connection" (web/components/operations/WorkPanel.tsx:178-195)
- [ ] Section "Filed and open" meta "{n} filings"; columns Filed · Kind (Ticket/Thread/Webhook/Document) · Reference · About ("promise · order to delivery.dispatch") · Filed on · Open for ("today" / "{n} days") · By ("a person, not signed in" when anonymous) · Close (web/components/operations/FilingsSection.tsx:24-46, 70-88, 91)
- [ ] Section "On probation": "{n} of {m} automations on probation" + "Its sends reach its declarer first, and each is marked right or wrong on Departures. The Hub map lists every one with its marks so far." (web/components/operations/FilingsSection.tsx:133-141)
- [ ] Section "Principals" meta "{n} principals"; columns Principal · Is (a person / a built-in agent / the platform's code / an outside agent) · Entries · By kind · Restated · Hypotheses · Predictions inside their band ("x of y" / "none scored") (web/components/operations/WorkPanel.tsx:79-96, 128-136, 203)
- [ ] Principals capped at the first 40 names — not said on screen (web/components/operations/WorkPanel.tsx:87)
- [ ] Section "The live events and traces" — pointer copy only (web/components/operations/WorkPanel.tsx:219-221)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] Reached as `?tab=agentic-ops&layer=duties` (web/lib/agentOpsLayers.ts:11-13)
- [ ] None read or written by the panel; "Every run" changes the shell's `tab` (web/app/page.tsx:2225)

### Empty / error / loading / withheld states
- [ ] "Loading {what}…" spinner per section — the week by duty / the failures / departures / the open filings / the hub map / principals (web/components/record/kit.tsx:63; web/components/ui/states.tsx:60-73)
- [ ] "Could not read {what} — {error}." + Retry per section (web/components/record/kit.tsx:62; web/components/ui/states.tsx:84-101)
- [ ] "The week by duty could not be read ({status})" — duty read error text (web/components/operations/WorkPanel.tsx:48)
- [ ] "No duty is declared in the agent contract." (web/components/operations/WorkPanel.tsx:149)
- [ ] "Nothing failed this week: every run answered, every verification that ran passed, and nothing was held." (web/components/operations/WorkPanel.tsx:160)
- [ ] "Nothing has reached the departure gate yet." (web/components/operations/WorkPanel.tsx:183)
- [ ] "Nothing is filed and open. A ticket, a thread or a document filed against a promise, a process or a finding is listed here until it is closed with what happened." (web/components/operations/FilingsSection.tsx:96)
- [ ] "The hub map is not on this install." / "No automation is declared yet, so none is on probation." / "None of {n} automations is on probation." (web/components/operations/FilingsSection.tsx:127-132)
- [ ] "Nobody has booked an entry yet. A person, a built-in agent and an outside vendor's agent appear here in the same rows, each with what became of what it booked." (web/components/operations/WorkPanel.tsx:214)
- [ ] Toasts "Closed “{filing}”." / "It was not closed" + reason (web/components/operations/FilingsSection.tsx:62, 66)
- [ ] "What is running now, each run's trace and a deep run's phases are on the Overview." (web/components/operations/WorkPanel.tsx:220)

### Loads on open
- [ ] GET /record/duties — the week by duty (web/components/operations/WorkPanel.tsx:46-50 → pramanyx/routers/record.py:884) read-only
- [ ] GET /departures/summary (web/lib/api.ts:6975 → pramanyx/routers/departures.py:75) read-only
- [ ] GET /record/claims?limit=1000 — every author (web/lib/record.ts:149 → pramanyx/routers/record.py:87) read-only
- [ ] GET /ledger/v1/principals/service (web/lib/record.ts:824 → pramanyx/routers/ledger.py:396) read-only
- [ ] GET /ledger/v1/principals/{principal}/record — one call per principal, up to 40 in parallel, each scanning 5,000 claims + calibration (web/components/operations/WorkPanel.tsx:87-88; web/lib/record.ts:825 → pramanyx/routers/ledger.py:322) read-only, heavy fan-out
- [ ] GET /links?status=open&limit=200 — open filings (web/lib/api.ts:6828 → pramanyx/routers/links.py:47) read-only
- [ ] GET /hub/map — probation totals, hub-wide (web/lib/api.ts:6799 → pramanyx/routers/hub.py:15) read-only
- [ ] GET /rbac/me — who a close is recorded as, shared once per page (web/lib/useMe.ts:22-31; web/lib/api.ts:9786 → pramanyx/routers/roles.py:49)
- [ ] Plus the workspace's 20 s badge poll (GET /control-room/needs-human?limit=1 + GET /departures/summary) (web/components/AgenticOpsWorkspace.tsx:193-200) [WRITES ON OPEN: needs-human expires stale proposals and resumes parked runs]
- [ ] On action: POST /links/{id}/close (web/lib/api.ts:6835)

**Top rows today:** no header or toolbar of its own — the page opens on the section head "The week by duty" with its "since … · every connection" meta; every other section carries its own one action at its head's right (Every run · Every departure · Hub map · Roster/Authority/Keys · Open Overview). Above it the Agent Ops chrome: Connection picker (does not scope this layer), layer tabs + "?", toolbar range picker (not applied — the page is fixed to this week) and "+ Create agent".

## Agent Ops — Action centre (`layer=action-centre`)
_Source: web/components/operations/ActionCentrePanel.tsx (+ web/components/record/kit.tsx; mounted at web/components/AgenticOpsWorkspace.tsx:290-293)_

### Controls
- [ ] Context-bar "Connection" select (with "choose…" when none) — the connection this layer reads; hover "Scopes Automations and the Action centre; the Hub and Departures stay hub-wide" (web/components/AgenticOpsWorkspace.tsx:231-242)
- [ ] "Declared actions" (authority table head) — leaves for Define ▸ Actions (`handleNavigate("declared-actions")`); hover "Each declaration, the overlay edits, and what waits on approval" (web/components/operations/ActionCentrePanel.tsx:92-93; web/app/page.tsx:2226)
- [ ] "Approval trail" (authority table head) — leaves for Operations ▸ Security & Audit on its Approvals lens; hover "What the approval gate decided, and what is on its allowlist" (web/components/operations/ActionCentrePanel.tsx:94-95; web/app/page.tsx:2227)
- [ ] Authority row (first cell is a link; whole row clickable) — opens that action's record view (web/components/operations/ActionCentrePanel.tsx:103; web/components/record/kit.tsx:215-226)
- [ ] Standing-grant row (whole row clickable) — opens its action's record view (web/components/operations/ActionCentrePanel.tsx:113, 196)
- [ ] Grant "Withdraw" — revokes that standing grant at once, no confirm (web/components/operations/ActionCentrePanel.tsx:177-181, 188-190)
- [ ] Demotion "Open its record" — opens that action's record view (web/components/operations/ActionCentrePanel.tsx:130)
- [ ] Copy · CSV under the authority and standing-grants ledgers (Withdraw column excluded) (web/components/record/kit.tsx:241-249)
- [ ] Record view: back link "Authority" — returns to the ledger (web/components/operations/ActionCentrePanel.tsx:236; web/components/record/kit.tsx:117-119)
- [ ] Record view: "Book the graduation" — shown only when the record earns L4; writes the graduation receipt (web/components/operations/ActionCentrePanel.tsx:262-267)
- [ ] Record view: execution "Run the undo" — runs the declared undo through the approval gate; only while its undo window is open (hover "Runs the declared undo of this execution through the same approval gate") (web/components/operations/ActionCentrePanel.tsx:275-276, 383-386)
- [ ] Record view: segmented "Cap it at" L0 / L1 / L2 / L3 / L4 (web/components/operations/ActionCentrePanel.tsx:289-290)
- [ ] Record view: input "Why (optional)" for the cap (web/components/operations/ActionCentrePanel.tsx:291)
- [ ] Record view: "Set the ceiling" — books a person's ceiling (disabled until a level is picked) (web/components/operations/ActionCentrePanel.tsx:292-295)
- [ ] Record view: "Lift it" — removes the person's ceiling (only when one is set) (web/components/operations/ActionCentrePanel.tsx:296-298)
- [ ] Record view: standing grants list with "Withdraw" per grant (web/components/operations/ActionCentrePanel.tsx:303-307)
- [ ] Record view (L4+): inputs "The one target value it may run on", "Expires in days" (default 30) + "days", "Most uses" (placeholder "no cap") + "uses" (web/components/operations/ActionCentrePanel.tsx:308-314)
- [ ] Record view (L4+): "Sign the grant" — signs a standing grant for one target value (web/components/operations/ActionCentrePanel.tsx:315-321)
- [ ] Record view: segmented "For real" / "As a drill" (web/components/operations/ActionCentrePanel.tsx:330-331)
- [ ] Record view: input "Why — it is written on the demotion" (required) (web/components/operations/ActionCentrePanel.tsx:332)
- [ ] Record view: "Demote it" / "Run the drill" — demotes the action (a drill really drops it to L3) and withdraws its grants (web/components/operations/ActionCentrePanel.tsx:333-336)
- [ ] "Retry" on any failed read (web/components/record/kit.tsx:62)

### Dialogs, drawers, popovers, panels
- [ ] Action record view — replaces the ledger in place (not a dialog, not in the URL): back header, rail "This action", sections Why it runs at this level · What the next level needs · Executions · The ceiling a person set · Standing grants · Take authority away (web/components/operations/ActionCentrePanel.tsx:58-60, 213-349)
- [ ] Record rail "This action": On · May run at · Ceiling (— set by {who}) · Record earned · Executions · Verified · Failed checks · Undone (web/components/operations/ActionCentrePanel.tsx:241-253)
- [ ] "Recorded as {actor}" line above the write sections (web/components/operations/ActionCentrePanel.tsx:279-281)

### Figures, counts, badges, status chips, freshness
- [ ] Section "The authority table" meta = connection name (web/components/operations/ActionCentrePanel.tsx:89)
- [ ] Authority columns: Action · May run at (chip "L{n} · {label}", hue per level) · Ceiling "L{n}" · Record earned "L{n}" · Verified ("x of y" / "never run") · Last run · Can it be undone ("yes, an undo is declared" / "no — declared irreversible" / reversibility) · Demoted (chip "demoted" / "—") (web/components/operations/ActionCentrePanel.tsx:39-43, 77-86)
- [ ] Ladder note "{note}. Graduating to L4 takes {n} approved executions whose verification passed." (web/components/operations/ActionCentrePanel.tsx:105)
- [ ] Section "Standing grants" meta "{n} grants"; columns Allows ("{action} where {arg} is {value}") · Signed by · Signed · Limits ("{used} of {max} uses · until {day}" / "{n} uses, no cap" / "no expiry") · Licensed by ("its graduation receipt" / "a person, when approving" / "an {owner_kind}") (web/components/operations/ActionCentrePanel.tsx:111, 162-191)
- [ ] Section "Demotions" — each demoted action with the demotion's words (web/components/operations/ActionCentrePanel.tsx:118-136)
- [ ] Section "Writes through other doors" meta "{n} writes"; first 20 rows: action · "through {door}" · status · "by {who}" · day; then the note (the meta counts all, the list shows 20 — the cut is not said) (web/components/operations/ActionCentrePanel.tsx:138-153)
- [ ] Record header chip "L{n} · {label}" (web/components/operations/ActionCentrePanel.tsx:236-237)
- [ ] Record "Why it runs at this level" rule text + notes (web/components/operations/ActionCentrePanel.tsx:257-260)
- [ ] Record "What the next level needs" — reasons list, or "The record earns L4. Booking the graduation writes the receipt that grants it." (web/components/operations/ActionCentrePanel.tsx:262-271)
- [ ] Record "Executions" meta "{n} executions"; each: parameters, verification chip (verified / verification failed / verification could not run / no verification declared), "undone" chip, why, "by {who} under {gate}", time, undo window words ("it can be undone until … UTC" / "its {h}-hour undo window closed on …" / "no undo is declared for this action") (web/components/operations/ActionCentrePanel.tsx:208-211, 273-277, 351-390)
- [ ] Record "The ceiling a person set" — "Capped at L{n} by {who} on {day}: {why}" / "No ceiling is set here…" + "A ceiling only lowers. Setting it above L{earned}, what the record earned, grants nothing." (web/components/operations/ActionCentrePanel.tsx:282-301)
- [ ] Record "Take authority away" note, drill addendum "A drill is that same demotion, marked as a drill: the action really drops to L3 and has to earn its way back." (web/components/operations/ActionCentrePanel.tsx:338-341)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] Reached as `?tab=agentic-ops&layer=action-centre`; the connection is the shell's `?conn=` (web/lib/agentOpsLayers.ts:11-13; web/app/page.tsx:1261)
- [ ] The open action record is component state only — not deep-linkable, lost on reload (web/components/operations/ActionCentrePanel.tsx:54)

### Empty / error / loading / withheld states
- [ ] "Authority is held per connection: an action earns its level on the record of one. Choose a connection in the bar above." — no connection chosen (web/components/operations/ActionCentrePanel.tsx:55-57)
- [ ] "No object model is built for this connection yet, so no action can be declared on it. Actions are declared on the model, each with the read that verifies it and how it is undone." — /authority 404 (web/components/operations/ActionCentrePanel.tsx:69-74, 100)
- [ ] "No action is declared on this connection. A declared action names its verification read and its undo; until then nothing here can change anything outside the platform." (web/components/operations/ActionCentrePanel.tsx:104)
- [ ] "No standing grant is signed on this connection, so every execution asks a person. One is signed from an action's record, once the action is at L4." (web/components/operations/ActionCentrePanel.tsx:114)
- [ ] "No action has been demoted on this connection. A failed verification demotes its action by itself and withdraws its standing grants; a person can do the same with a reason." (web/components/operations/ActionCentrePanel.tsx:123)
- [ ] "{note}. None is on the record." — no gateway writes (web/components/operations/ActionCentrePanel.tsx:140)
- [ ] "It has never run on this connection." — no executions (web/components/operations/ActionCentrePanel.tsx:274)
- [ ] "No standing grant is signed for this action here, so each execution asks a person." (web/components/operations/ActionCentrePanel.tsx:306)
- [ ] "A standing grant is signed for an action at L4 — it cites the graduation receipt. This one runs at L{n}." — below L4 (web/components/operations/ActionCentrePanel.tsx:324)
- [ ] Inline red error line (role=alert) after a failed write or withdraw (web/components/operations/ActionCentrePanel.tsx:194, 256)
- [ ] "Loading the authority table…" / "Could not read the authority table — …" + Retry, and the same for the standing grants, demotions, the gateway's writes, the action's record (web/components/record/kit.tsx:59-65)

### Loads on open
- [ ] GET /authority?connection_id= — the authority table; 404 = no ontology (web/lib/record.ts:759 → pramanyx/routers/authority.py:34) read-only
- [ ] GET /authority/writes — gateway and MCP writes (web/lib/record.ts:777 → pramanyx/routers/authority.py:125) read-only
- [ ] GET /kinetic-actions/grants?connection_id= (web/lib/api.ts:7442 → pramanyx/routers/kinetic.py:305) read-only
- [ ] On opening a record: GET /authority/{action}/record?connection_id= and the grants again (web/lib/record.ts:761 → pramanyx/routers/authority.py:75) read-only
- [ ] GET /rbac/me — the actor line (web/lib/api.ts:9786 → pramanyx/routers/roles.py:49)
- [ ] Plus the workspace's 20 s badge poll (GET /control-room/needs-human?limit=1 + GET /departures/summary) (web/components/AgenticOpsWorkspace.tsx:193-200) [WRITES ON OPEN: needs-human expires stale proposals and resumes parked runs]
- [ ] On action: POST /kinetic-actions/grants/{id}/revoke; POST /authority/{id}/graduate; POST /authority/{id}/executions/{entry}/undo; POST /authority/{id}/ceiling; POST /authority/{id}/widen; POST /authority/{id}/demote (web/lib/api.ts:7449; web/lib/record.ts:763-776 → pramanyx/routers/authority.py:91, 109, 142, 163, 192)

**Top rows today:** ledger view — no toolbar of its own; the first row is the section head "The authority table" · connection name · (spacer) · Declared actions · Approval trail. Record view — back header "Authority / {action} [L-chip]". Above both, the Agent Ops chrome: context bar "Connection" picker (this layer's scope), layer tabs + "?", toolbar range picker (not applied here) and "+ Create agent".

## Agent Ops — Developer (`layer=developer`)
_Source: web/components/operations/DeveloperPanel.tsx (+ web/components/record/kit.tsx; mounted at web/components/AgenticOpsWorkspace.tsx:294-297)_

### Controls
- [ ] "Manage packs" (Packs head) — leaves for Settings (`handleNavigate("settings")`); hover "Bind a pack to a connection, measure it, activate or demote it". Lands on whichever Settings section was last open (default Organization), not on System where the packs manager lives (web/components/operations/DeveloperPanel.tsx:98-99; web/app/page.tsx:1088, 2228; web/components/SystemPanel.tsx imports PacksManager)
- [ ] Pack folder picker "A pack's folder" (file input, folder mode, multiple) — reads the text files and runs the static check at once (web/components/operations/DeveloperPanel.tsx:188-211, 234-237)
- [ ] "Upload as a draft" — uploads a pack that passed the check (web/components/operations/DeveloperPanel.tsx:213-226, 254-256)
- [ ] "Replace the one that exists" — re-uploads with overwrite, shown only after an "already exists" error (web/components/operations/DeveloperPanel.tsx:230, 257)
- [ ] "Integrations" (Doors head) — leaves for Settings ▸ Integrations (web/components/operations/DeveloperPanel.tsx:111; web/app/page.tsx:2218, 1746-1748)
- [ ] Principal "Revoke" — revokes a service principal at once, no confirm (reason sent: "revoked from the Developer page") (web/components/operations/DeveloperPanel.tsx:445-449, 464)
- [ ] "Mint a principal" — opens the mint dialog (web/components/operations/DeveloperPanel.tsx:469-470)
- [ ] Mint dialog input "Service principal name" (placeholder "a name: vendor-forecaster", autofocus; required) (web/components/operations/DeveloperPanel.tsx:493-494)
- [ ] Mint dialog input "What it is for" (web/components/operations/DeveloperPanel.tsx:495)
- [ ] Mint dialog area checkboxes: "Read connections, metrics, findings and past runs" · "Read objects and the ontology's contract" · "Propose a declared action for a person to approve" · "Ask questions and start analyses (spends model calls)" · "Run an automation" · "Read the ledger's claims" · "Post a claim to the ledger" (web/components/operations/DeveloperPanel.tsx:501-507; web/lib/record.ts:800-808)
- [ ] Mint dialog input "Entities it may read" (placeholder "only these entities: Order, Customer") (web/components/operations/DeveloperPanel.tsx:509-510)
- [ ] Mint dialog input "Actions it may propose" (placeholder "only these actions: flag_order") (web/components/operations/DeveloperPanel.tsx:511-512)
- [ ] Mint dialog "Cancel" / "Mint it" (web/components/operations/DeveloperPanel.tsx:515-518)
- [ ] Minted-key view "I have copied it" — closes the dialog and forgets the key; the key is select-all text, there is no Copy button (web/components/operations/DeveloperPanel.tsx:476-488)
- [ ] Method "Withdraw" — withdraws a registered projection method at once, no confirm (web/components/operations/DeveloperPanel.tsx:318)
- [ ] "Register a method" — opens the register dialog (web/components/operations/DeveloperPanel.tsx:323)
- [ ] Register dialog: "Name" (placeholder "vendor-forecaster"), segmented "Kind of method" forecaster / estimator / simulator (web/components/operations/DeveloperPanel.tsx:329-334)
- [ ] Register dialog: "Runs as" server id (placeholder "the connected tool server's id") + "Tool" (placeholder "the tool it calls") (web/components/operations/DeveloperPanel.tsx:335-339)
- [ ] Register dialog: "Its backtest" — cases, "Measured on" (comma-separated), "Mean error, percent", "Interval held, percent" (web/components/operations/DeveloperPanel.tsx:340-346)
- [ ] Register dialog "Register it" / "Cancel" (web/components/operations/DeveloperPanel.tsx:349-350)
- [ ] "Declare an action" (Declared actions section) — leaves for Define ▸ Actions (web/components/operations/DeveloperPanel.tsx:156; web/app/page.tsx:2226)
- [ ] Copy · CSV under the packs, event-catalogue and agent-contract-duties ledgers (web/components/record/kit.tsx:241-249)
- [ ] "Retry" on any failed section read (web/components/record/kit.tsx:62)

### Dialogs, drawers, popovers, panels
- [ ] "Mint a principal" dialog (FormDialog, 640px, blurred scrim): name, purpose, area checkboxes, entities, actions; after minting, an amber callout "The key for {name} is shown once and stored hashed. Copy it now." with the key (web/components/operations/DeveloperPanel.tsx:474-521)
- [ ] "Register a method" dialog (FormDialog, 800px): name, kind, runs as, backtest; note "A method with no backtest is refused: a projection nobody has scored is a guess with a name." (web/components/operations/DeveloperPanel.tsx:326-354)
- [ ] Pack check verdict callout (inline, green/amber): pass/fail sentence, each error, each "Warning: …", "It declares …" / "It declares nothing the platform reads.", "Left behind, not text or over the size limit: …", upload buttons (web/components/operations/DeveloperPanel.tsx:241-261)

### Figures, counts, badges, status chips, freshness
- [ ] Section "Packs" meta "{n} packs"; columns Pack · Status chip (active / draft / demoted / deprecated) · Layer · Claims that held ("{pct} of {n}" / "not measured on an install") · Installs · Measured on ("{dataset}: {x} of {y} in range" / "no public dataset") · Demotion (chip "due" / "—"); the rule line under it (web/components/operations/DeveloperPanel.tsx:56, 71-79, 98-106)
- [ ] Pack upload limits — text files only (.yaml .yml .md .json .sql .txt .csv), 512 KB each (web/components/operations/DeveloperPanel.tsx:177-178)
- [ ] Section "Doors": "The ledger API, under {prefix}" + every route; "The tool server's contract tools: …" + note; "What no door offers: …" (web/components/operations/DeveloperPanel.tsx:359-382)
- [ ] Section "Events out" meta "{n} kinds"; columns Event (mono) · What it says · Carries · Subscribable (yes/no) (web/components/operations/DeveloperPanel.tsx:81-86, 117-121)
- [ ] Section "Principals and keys" meta "{n} service principals"; each: name — note, "Held to its grant: …" / "Held to the agent policy alone", "minted {day}", "by {who}" (web/components/operations/DeveloperPanel.tsx:123-127, 454-467)
- [ ] Section "The kits": the kit's principle and each anatomy file (mono) "— required" + what it declares (web/components/operations/DeveloperPanel.tsx:129-145)
- [ ] Section "Projection methods" meta "{n} built-in methods · {n} registered"; "Built in: …" + rule; each registered: name, kind chip, backtest words ("scored on {n} cases of {metric} (…): mean error …; its interval held …"), "runs as {tool} on {server}", "registered by {who}" (web/components/operations/DeveloperPanel.tsx:147-151, 270-321)
- [ ] Section "The agent contract" meta "version {v}"; duties columns Duty · Books · May propose · Carried today by · Why it exists; scoring principle; "A run ends in one of: …"; "What a door refuses, by name" — reason + code (web/components/operations/DeveloperPanel.tsx:88-94, 160-169, 384-403)

### Keyboard shortcuts
- [ ] Escape closes either dialog (not while busy) (web/components/ui/dialog.tsx:60-79)

### URL params / deep links
- [ ] Reached as `?tab=agentic-ops&layer=developer` (web/lib/agentOpsLayers.ts:11-13)
- [ ] None read or written by the panel

### Empty / error / loading / withheld states
- [ ] "No pack is installed." (web/components/operations/DeveloperPanel.tsx:103)
- [ ] "choose the pack's folder; checking writes nothing" — hint by the picker (web/components/operations/DeveloperPanel.tsx:237)
- [ ] "{pack} is uploaded as a draft. It steers nothing until a person activates it." — after upload (web/components/operations/DeveloperPanel.tsx:218, 240)
- [ ] Red error line after a failed check/upload (web/components/operations/DeveloperPanel.tsx:239)
- [ ] "No event kind is declared." (web/components/operations/DeveloperPanel.tsx:119)
- [ ] "No outside agent has a principal. One is minted by a person; it is then held to the organisation's agent policy and scored in the same rows as the built-in agents." (web/components/operations/DeveloperPanel.tsx:453)
- [ ] "No method is registered from outside." (web/components/operations/DeveloperPanel.tsx:307)
- [ ] "An action is declared on a connection's object model, with the read that verifies it and how it is undone." (web/components/operations/DeveloperPanel.tsx:155)
- [ ] "No duty is declared." (web/components/operations/DeveloperPanel.tsx:164)
- [ ] "{path} could not be read ({status})" — packs/kit read error text (web/components/operations/DeveloperPanel.tsx:50-54)
- [ ] "Loading {what}…" / "Could not read {what} — …" + Retry for the packs, the doors, the event catalogue, service principals, the pack kit, the methods, the agent contract (web/components/record/kit.tsx:59-65)
- [ ] Red error lines (role=alert) in the page or inside a dialog after a failed mint / revoke / register / withdraw (web/components/operations/DeveloperPanel.tsx:322, 327, 468, 491)

### Loads on open
- [ ] GET /packs/listing (web/components/operations/DeveloperPanel.tsx:64 → pramanyx/routers/packs.py:117) read-only
- [ ] GET /ledger/v1/contract — doors + the agent contract (web/lib/record.ts:822 → pramanyx/routers/ledger.py:65) read-only
- [ ] GET /ledger/v1/events/catalogue (web/lib/record.ts:823 → pramanyx/routers/ledger.py:72) read-only
- [ ] GET /ledger/v1/principals/service (web/lib/record.ts:824 → pramanyx/routers/ledger.py:396) read-only
- [ ] GET /packs/kit (web/components/operations/DeveloperPanel.tsx:68 → pramanyx/routers/packs.py:91) read-only
- [ ] GET /ledger/v1/methods (web/lib/record.ts:845 → pramanyx/routers/ledger.py:444) read-only
- [ ] Plus the workspace's 20 s badge poll (GET /control-room/needs-human?limit=1 + GET /departures/summary) (web/components/AgenticOpsWorkspace.tsx:193-200) [WRITES ON OPEN: needs-human expires stale proposals and resumes parked runs]
- [ ] On action: POST /packs/check (writes nothing) (pramanyx/routers/packs.py:98); POST /packs/upload (pramanyx/routers/packs.py:105); POST /ledger/v1/principals/service (pramanyx/routers/ledger.py:360); DELETE /ledger/v1/principals/service/{name}?why= (pramanyx/routers/ledger.py:403); POST /ledger/v1/methods (pramanyx/routers/ledger.py:452); DELETE /ledger/v1/methods/{name} (pramanyx/routers/ledger.py:464) (web/lib/record.ts:826-859)

**Top rows today:** no header or toolbar of its own — the page opens on the "Packs" section head ({n} packs · Manage packs); each later section carries its one action at its head (Integrations · Mint a principal and Register a method sit at the foot of their sections, Declare an action inline). Above it the Agent Ops chrome: Connection picker (does not scope this layer), layer tabs + "?", toolbar range picker (not applied) and "+ Create agent".

## Notifications (`tab=operations`, layer `actions`)
_Source: web/components/ActionHubPanel.tsx (rendered by web/components/OperationsWorkspace.tsx:96; layer tabs hidden, the rail is the switcher); log folding in web/lib/notificationLog.ts_

### Controls
- [ ] + New trigger (at the Triggers label's right; disabled while the new form is open) — opens the inline create form (web/components/ActionHubPanel.tsx:317)
- [ ] Needs you › failing row › Test ("Testing…") — sends a test through that trigger (web/components/ActionHubPanel.tsx:306)
- [ ] Needs you › failing row › Edit — opens that trigger's inline edit form (web/components/ActionHubPanel.tsx:309)
- [ ] Trigger row › on/off Switch ("Turn off <name>" / "Turn on <name>") — PUT with `enabled` flipped (web/components/ActionHubPanel.tsx:381, :224)
- [ ] Trigger row › Test ("Testing…", hover "Send a test message through this trigger") — POST test; result chip on the row (web/components/ActionHubPanel.tsx:398, :239)
- [ ] Trigger row › Edit / Close (aria-expanded) — toggles the inline edit form under the row (web/components/ActionHubPanel.tsx:401)
- [ ] Trigger row › Delete (trash icon only, aria-label "Delete <name>", hover "Delete") — confirm() then DELETE (web/components/ActionHubPanel.tsx:402, :212)
- [ ] Delivery log row › Details (chevron, aria-expanded) — expands the folded group (web/components/ActionHubPanel.tsx:434)
- [ ] Trigger form › Name input (required, placeholder "My Slack Webhook") (web/components/ActionHubPanel.tsx:118)
- [ ] Trigger form › Sends to select: Webhook (generic) · Slack incoming webhook · Jira (create issue) (web/components/ActionHubPanel.tsx:122-126)
- [ ] Trigger form › Webhook URL / Jira base URL input (required; placeholder per type) (web/components/ActionHubPanel.tsx:129-131)
- [ ] Trigger form › Slack: Channel (optional) input "#general" (web/components/ActionHubPanel.tsx:137)
- [ ] Trigger form › Jira: Project key input "OPS"; Issue type input "Task" (web/components/ActionHubPanel.tsx:144, :148)
- [ ] Trigger form › Create / Update ("Saving…") — POST /actions/triggers or PUT /actions/triggers/{id}, closes and reloads (web/components/ActionHubPanel.tsx:153, :198)
- [ ] Trigger form › Cancel (web/components/ActionHubPanel.tsx:156)

### Dialogs, drawers, popovers, panels
- [ ] Inline New trigger form at the top of the Triggers card (not a dialog) (web/components/ActionHubPanel.tsx:321)
- [ ] Inline Edit form under a trigger row; one form open at a time (web/components/ActionHubPanel.tsx:335)
- [ ] Native confirm() — "Delete the trigger “<name>”? This cannot be undone." (web/components/ActionHubPanel.tsx:213)
- [ ] Delivery row Details — time or time range chip, "sent by <sources>" chip, "HTTP <status>" chip, up to 3 messages quoted "· and N more", full redacted error in a code block (web/components/ActionHubPanel.tsx:438-454)
- [ ] Needs you section — every live trigger whose newest send failed (web/components/ActionHubPanel.tsx:296)
- [ ] Hover titles: last-outcome chip shows the redacted error; delivery meta line shows the full error; "since removed" = "This trigger no longer exists — these sends are history" (web/components/ActionHubPanel.tsx:388, :428, :426)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "Triggers" — count or "—"; sub "could not be read" / "none set up" / "all on" / "N on · N off" (web/components/ActionHubPanel.tsx:286)
- [ ] Figure "Delivered" — sends ok; sub "of the latest N sends · N skipped" / "nothing sent yet" / "could not be read" (web/components/ActionHubPanel.tsx:289)
- [ ] Figure "Failed" — failed + timed out, red when a live trigger failed; sub "none failed" / "from N triggers" / "all from N triggers since removed" / "N from live triggers · the rest from removed ones" (web/components/ActionHubPanel.tsx:292, :274)
- [ ] Needs-you row title "<name> · its last send failed" / "its last N sends failed"; detail "<short error> · <when> · sent by <source>" (web/components/ActionHubPanel.tsx:303-304)
- [ ] Trigger row: type chip Webhook / Slack / Jira (web/components/ActionHubPanel.tsx:386)
- [ ] Trigger row: last outcome chip "sent / failed / timed out / skipped <4m ago | 31 Aug>" toned (web/components/ActionHubPanel.tsx:389)
- [ ] Trigger row: "off" chip; action-result chip ("test sent · HTTP 200", "test skipped: …", "test failed: …", "update failed (…)", "delete failed (…)") (web/components/ActionHubPanel.tsx:392-393, :244-246)
- [ ] Trigger row meta: where it sends (channel/project on host, secret cut) · "used by <sources>" / "no send in the latest 50" / "not fired yet" (web/components/ActionHubPanel.tsx:374-377)
- [ ] Delivery row: outcome dot (green/red/amber/grey), trigger name, "since removed" chip, meta "<outcome> · last <when> · <short error>", repeat count "×N" (web/components/ActionHubPanel.tsx:422-432)
- [ ] Log window = latest 50 sends (web/components/ActionHubPanel.tsx:43)

### Keyboard shortcuts
- [ ] Enter in the trigger form submits it (native form submit) (web/components/ActionHubPanel.tsx:114)

### URL params / deep links
- none found (reached as `?tab=operations&layer=actions` via the shell; Monitors' form points here in words: "Operations ▸ Notifications")

### Empty / error / loading / withheld states
- [ ] "Loading notifications…" — first read (web/components/ActionHubPanel.tsx:282)
- [ ] "Could not read the triggers — HTTP <n>." + Retry (web/components/ActionHubPanel.tsx:324)
- [ ] "Could not read the delivery log — HTTP <n>." + Retry (web/components/ActionHubPanel.tsx:344)
- [ ] "A trigger sends to Slack, a webhook or Jira when a recommendation, a monitor or an automation fires it." — no triggers (web/components/ActionHubPanel.tsx:327)
- [ ] "A trigger's sends show here, a test fire among them." — empty log (web/components/ActionHubPanel.tsx:345)
- [ ] "Nothing needs you" / "Nothing needs you · no live trigger is failing" (web/components/ActionHubPanel.tsx:297)
- [ ] "The stored URL is kept unless you replace it." — edit form note (URL is masked by the API) (web/components/ActionHubPanel.tsx:157)
- [ ] Form save error inline (role=alert), e.g. server detail or "Save failed" (web/components/ActionHubPanel.tsx:158, :207)
- [ ] Withheld: "since removed" is not said when the triggers could not be read (web/components/ActionHubPanel.tsx:258)

### Loads on open
- [ ] GET /actions/triggers — the triggers, URLs masked (direct fetch web/components/ActionHubPanel.tsx:182 → pramanyx/routers/actions.py:103)
- [ ] GET /actions/logs?limit=50 — latest sends (direct fetch web/components/ActionHubPanel.tsx:183 → pramanyx/routers/actions.py:365)
- [ ] Neither GET writes or spends; the page uses raw fetch, not web/lib/api.ts

**Top rows today:** no header or toolbar — the page opens on three figures (Triggers · Delivered · Failed); "+ New trigger" sits at the right of the Triggers section label further down.

## Spend (`tab=operations`, layer `spend`)
_Source: web/components/SpendPanel.tsx (rendered by web/components/OperationsWorkspace.tsx:97; layer tabs hidden, the rail is the switcher); folds and words in web/lib/spend.ts_

### Controls
- [ ] Spend cap figure › Edit (shown when a cap exists and the editor is closed) — opens the caps editor (web/components/SpendPanel.tsx:186)
- [ ] Needs you › Set a cap (shown when no cap is set) — opens the caps editor (web/components/SpendPanel.tsx:222)
- [ ] Caps editor › Close (web/components/SpendPanel.tsx:364)
- [ ] Caps editor › per-cap Remove (trash + "Remove") — DELETE that cap (web/components/SpendPanel.tsx:376, :353)
- [ ] Caps editor › Scope select "whole org" / "one user" (web/components/SpendPanel.tsx:382)
- [ ] Caps editor › user id input (when scope = one user) (web/components/SpendPanel.tsx:387)
- [ ] Caps editor › Metric select: calls / total tokens / cost usd (from the server's vocabulary) (web/components/SpendPanel.tsx:390)
- [ ] Caps editor › limit input (decimal) (web/components/SpendPanel.tsx:394)
- [ ] Caps editor › window hours input ("per … hours") (web/components/SpendPanel.tsx:397)
- [ ] Caps editor › Action select "alert only" / "block new work" (web/components/SpendPanel.tsx:400)
- [ ] Caps editor › Declare the cap — PUT /governance/caps, re-reads caps (web/components/SpendPanel.tsx:404, :339)
- [ ] Governance › Full feed / Hide feed (aria-expanded; clears any focus) (web/components/SpendPanel.tsx:464)
- [ ] Governance › CSV (download icon) — client-side CSV of the visible feed rows (filtered rows when the full feed is open), columns at, category, kind, actor, org_id, conn_id, summary (web/components/SpendPanel.tsx:466, :452)
- [ ] Governance fold row › View (amber folds only) — opens the full feed focused on that fold's events (web/components/SpendPanel.tsx:486, :451)
- [ ] Full feed › Category select "All categories" + server categories — a SERVER filter, re-reads (web/components/SpendPanel.tsx:632)
- [ ] Full feed › Event select "All events" + kinds seen in the window (web/components/SpendPanel.tsx:637)
- [ ] Full feed › Actor select "All actors" + actors seen (web/components/SpendPanel.tsx:641)
- [ ] Full feed › Search "Search summary, event, actor…" (summary, kind, actor, connection id) (web/components/SpendPanel.tsx:645)
- [ ] Full feed › From / To date inputs — only while the organisation requires a reason to read runs (`reason_to_read_runs` allow); server-dated read (web/components/SpendPanel.tsx:649-652)
- [ ] Full feed › Clear filters (when any filter is set) (web/components/SpendPanel.tsx:656)
- [ ] Full feed › Export (download icon; only when dated windows are on) — server CSV of every event in the dates and category (GET /audit/feed/export) (web/components/SpendPanel.tsx:669, :595)
- [ ] Full feed › focus line › Show all — clears the fold focus (web/components/SpendPanel.tsx:679)
- [ ] Full feed › sortable headers When · Category · Event · Actor (toggle asc/desc, chevron); "What happened" not sortable (web/components/SpendPanel.tsx:693-695, :499)
- [ ] Full feed › row click — expands the event's detail JSON (only rows with detail; chevron) (web/components/SpendPanel.tsx:531)
- [ ] Details (chevron, aria-expanded) — shows route mix and the cost query (web/components/SpendPanel.tsx:236)
- [ ] Details › Copy — copies the cost SQL to the clipboard (web/components/SpendPanel.tsx:728)
- [ ] Retry buttons on each failed read: caps, usage rollup, last 24 hours, governance feed, a category (web/components/SpendPanel.tsx:198, :257, :288, :473, :682)

### Dialogs, drawers, popovers, panels
- [ ] Spend caps editor — inline card: each cap's amount, "per Nh · whole org|user <id>", "blocks new work"/"alerts", meter, "set by <who>", Remove; then the declare row; note "Alert records a breach in the governance feed · block refuses new work and names the number" (web/components/SpendPanel.tsx:363-410)
- [ ] Needs you strip — unpriced calls or no cap (web/components/SpendPanel.tsx:201)
- [ ] Tokens by model card — horizontal bars, priced blue, unpriced hatched grey, folded grey; legend "priced" / "no price" (web/components/SpendPanel.tsx:255-273)
- [ ] Where tokens go card — last-24h bars by call site role; hover lists the call sites (web/components/SpendPanel.tsx:284-299)
- [ ] Governance card — one fold per kind of event, icon by tone (warning / bolt / check / dot), count, View on amber (web/components/SpendPanel.tsx:460-488)
- [ ] Full feed (inline under Governance) — filter bar, count, focus line, sortable table (max 58vh), per-row detail JSON (web/components/SpendPanel.tsx:564-704)
- [ ] Details fold — route mix sentence and "The cost query" SQL block with Copy (web/components/SpendPanel.tsx:713-737)
- [ ] Hover titles: unpriced explainer "A price is declared by the operator (PRAMANYX_MODEL_PRICES) or published in the provider's catalogue…"; cap meter "<observed> of <limit> in the last Nh"; bars' titles; date inputs "From this day" / "To this day, inclusive"; Export "Every event in the chosen dates and category, as a CSV file" (web/components/SpendPanel.tsx:208, :319, :650-652, :670)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "Spent" / "Spent · at least" — cost, grey when unknown; sub = amber caveat chip (share priced) or a note, or "could not be read" (web/components/SpendPanel.tsx:172-176)
- [ ] Figure "Model calls" — total calls; sub "N in the last 7 days" (web/components/SpendPanel.tsx:177)
- [ ] Figure "Failed" — failures; sub failedLine (web/components/SpendPanel.tsx:180)
- [ ] Figure "Spend cap" — tightest cap amount or "None" (amber) or red when over; sub "<observed> so far · per Nh · blocks new work|alerts · +N more" / "nothing stops a runaway run" / "could not be read" (web/components/SpendPanel.tsx:183-194)
- [ ] Needs you: "N calls have no price, so the real spend is unknown" + up to 3 models "· N calls" "+N more"; or "No spend cap is set — nothing stops a runaway run" (web/components/SpendPanel.tsx:209-218)
- [ ] Tokens by model scope chip "all time" / "newest 5,000 calls" (web/components/SpendPanel.tsx:253)
- [ ] Per model bar: name, sub line, token figure (web/components/SpendPanel.tsx:264)
- [ ] Where tokens go label "last 24 hours · <tokens>"; per row "N calls" + tokens; "N calls reported no token count" (web/components/SpendPanel.tsx:285, :295, :302)
- [ ] Cap meter — bar green/amber (>80%)/red (over) + observed value (web/components/SpendPanel.tsx:313)
- [ ] Governance label "Governance · <since words>" + "N events" (window = newest 500) (web/components/SpendPanel.tsx:463, :471, :62)
- [ ] Governance fold: title, sub, count (web/components/SpendPanel.tsx:481-485)
- [ ] Full feed count "N of M events" / "N events" + " — the newest N; the export has every one" (web/components/SpendPanel.tsx:662-666)
- [ ] Full feed focus line "Showing the N events behind “<fold>”" (web/components/SpendPanel.tsx:678)
- [ ] Route mix "N% of finished ask turns were answered by the conversation agent." (web/components/SpendPanel.tsx:725)

### Keyboard shortcuts
- none found

### URL params / deep links
- none found (reached as `?tab=operations&layer=spend` via the shell)

### Empty / error / loading / withheld states
- [ ] "could not be read" under any figure whose read failed; "—" as its value (web/components/SpendPanel.tsx:174, :187)
- [ ] "Could not read the spend caps — <error>." + Retry (web/components/SpendPanel.tsx:198)
- [ ] "Loading the usage rollup…" / "Could not read the usage rollup…" / "No model calls recorded yet." (web/components/SpendPanel.tsx:257-259)
- [ ] "Loading the last 24 hours…" / "Could not read the last 24 hours…" / "No model calls in the last 24 hours." (web/components/SpendPanel.tsx:288-290)
- [ ] "Loading the governance feed…" / "Could not read the governance feed…" / "Nothing recorded yet." (web/components/SpendPanel.tsx:473-475)
- [ ] Full feed: "Loading this category…", "Could not read this category…" + Retry, "Nothing recorded in this category yet.", "No event in the window matches these filters." (web/components/SpendPanel.tsx:682-686)
- [ ] Export error inline (red) (web/components/SpendPanel.tsx:675)
- [ ] Caps form error "The limit must be a number ≥ 0." or server error (web/components/SpendPanel.tsx:341, :409)
- [ ] Details: "Loading the route mix…", "Route mix: not measured yet.", "-- the cost query could not be read" (web/components/SpendPanel.tsx:723-724, :718)
- [ ] Withheld-by-honesty: cost is a floor ("at least") when any call is unpriced; not a number when none is priced; unpriced bars hatched, never zero (web/components/SpendPanel.tsx:14-19)
- [ ] Withheld: date filters and server export are absent unless the org setting is on; an unreadable setting leaves them out (web/components/SpendPanel.tsx:432-434, :444)

### Loads on open
- [ ] GET /usage?by=provider,model — usage and cost rollup (web/lib/api.ts:12115 → pramanyx/routers/governance.py:22) [NETWORK ON OPEN: `ensure_catalogue_prices()` fetches the provider's price catalogue at most hourly before pricing; in-memory, no model call]
- [ ] GET /obs/usage-summary?range=24h — Where tokens go (web/lib/api.ts:11616 → pramanyx/routers/obs.py:716) [same hourly catalogue fetch]
- [ ] GET /obs/usage-summary?range=7d — the 7-day call line (failure drops the line) (web/lib/api.ts:11616 → pramanyx/routers/obs.py:716)
- [ ] GET /governance/caps — caps with observed usage per window (web/lib/api.ts:12059 → pramanyx/routers/governance.py:164)
- [ ] GET /audit/feed?limit=500 — the governance window (web/lib/api.ts:12142 → pramanyx/routers/governance.py:66)
- [ ] GET /connections — names for folded rows (web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] GET /org-settings/allows — whether dated feed + export is on (web/lib/api.ts:224 → pramanyx/routers/orgsettings.py:29)
- [ ] On Details open: GET /obs/route-mix (web/lib/api.ts:12191 → pramanyx/routers/obs.py:581) and GET /usage/cost-sql (web/lib/api.ts:12121 → pramanyx/routers/governance.py:53)
- [ ] On full-feed category/date change: GET /audit/feed?category=&limit=500&since=&until= (web/components/SpendPanel.tsx:590)
- [ ] On Export: GET /audit/feed/export?format=csv&category=&since=&until= (404 unless the org setting is on) (web/lib/api.ts:12160 → pramanyx/routers/governance.py:113)

**Top rows today:** no header or toolbar — the page opens on four figure cards (Spent · Model calls · Failed · Spend cap with an Edit at its right); Full feed / CSV sit in the Governance card's label, Details at the page foot.

## Security & Audit (`tab=operations`, layer `security`; lenses Queries · Activity · Approvals · Gate map · Policies)
_Source: web/components/SecurityAuditPanel.tsx (rendered by web/components/OperationsWorkspace.tsx:98; layer tabs hidden, the rail is the switcher) + web/components/ActivityLog.tsx (Activity lens) + web/components/operations/GateMapPanel.tsx (Gate map, Policies) + web/components/TableActions.tsx (Copy · CSV)_

### Controls
**Page header (every lens)**
- [ ] Lens segmented "Queries" · "Activity" · "Approvals" · "Gate map" · "Policies" — lens state is owned by the shell (`secLens`) (web/components/SecurityAuditPanel.tsx:288-294, :785)
- [ ] Connection chip — names the shell's selected connection (hover = id); not clickable (web/components/SecurityAuditPanel.tsx:786)
- [ ] Refresh / "Reading…" (Queries lens only) — re-reads stats and log (web/components/SecurityAuditPanel.tsx:789)

**Queries lens**
- [ ] Needs you › flagged-by-people row › Review — opens every flagged (not platform-own) group and scrolls to Query checks (web/components/SecurityAuditPanel.tsx:520, :480)
- [ ] Needs you › blocked-this-week row › Review — switches the verdict filter to Blocked (web/components/SecurityAuditPanel.tsx:527)
- [ ] Verdict segmented "All" · "Passed" · "Flagged" · "Blocked" — server filter (web/components/SecurityAuditPanel.tsx:546, :416)
- [ ] Connection select "All connections" + each connection — server filter; starts on the shell's connection (web/components/SecurityAuditPanel.tsx:548)
- [ ] Check group row › Show / Hide (chevron) — opens the group's row table (web/components/SecurityAuditPanel.tsx:338)
- [ ] "All N rows" / "Hide the rows" — the whole window as one table (web/components/SecurityAuditPanel.tsx:564)
- [ ] Row table sortable headers Time · Connection · Verdict · Rows · Duration · Masked (⇅ / ↑ / ↓); Who, SQL, Error not sortable (web/components/SecurityAuditPanel.tsx:220-243)
- [ ] Row table › SQL cell click — shows/hides the whole statement ("Show the whole statement") (web/components/SecurityAuditPanel.tsx:165)
- [ ] Row table › Error cell click — shows/hides the whole error ("Show the whole error") (web/components/SecurityAuditPanel.tsx:178)
- [ ] Limits card › Edit (only when a connection is selected) — opens the budget editor (web/components/SecurityAuditPanel.tsx:360)
- [ ] Budget editor › Max rows, Warn after (ms), Stop after (ms) number inputs (web/components/SecurityAuditPanel.tsx:394-404)
- [ ] Budget editor › Save limits ("Saving…") — PUT /security/budget/{conn} (web/components/SecurityAuditPanel.tsx:408)
- [ ] Budget editor › Cancel (web/components/SecurityAuditPanel.tsx:409)

**Activity lens (exploration episode log)**
- [ ] Status bar › Stop ("stopping…") — stops the running exploration (web/components/ActivityLog.tsx:208)
- [ ] Status bar › Resume / Continue ("resuming…") — resumes a stopped or interrupted run (SPENDS: restarts model work) (web/components/ActivityLog.tsx:216-219)
- [ ] Status bar › Restart ("restarting…") — restarts exploration from scratch, clears the list (SPENDS) (web/components/ActivityLog.tsx:221-224)
- [ ] Date segmented "All dates" · "Today" · "Yesterday" · "This week" (web/components/ActivityLog.tsx:696-703)
- [ ] Status segmented "All" · "Success" · "Error" (web/components/ActivityLog.tsx:705-711)
- [ ] Fix all (N) ("fixing…", hover "Repair the N errored queries visible under the current filter") — POST fix-all for the visible errored episodes (SPENDS: model repair) (web/components/ActivityLog.tsx:720-727)
- [ ] Show all N / Show less — past the first 30 rows (web/components/ActivityLog.tsx:742-748)
- [ ] Sortable headers # · timestamp · type · message · status · rows · object (web/components/ActivityLog.tsx:438-458)
- [ ] Row click (▼/▲) — expands SQL, Result, Query intent (web/components/ActivityLog.tsx:475)
- [ ] Expanded error row › "↺ Retry with fix" — opens the retry panel (web/components/ActivityLog.tsx:259-261)
- [ ] Retry panel › Guidance (optional) input "e.g. use click_ts instead of click_id…" (Enter runs) (web/components/ActivityLog.tsx:269-272)
- [ ] Retry panel › Run fix ("fixing…") — POST retry-query (SPENDS: model correction + warehouse run) (web/components/ActivityLog.tsx:273-277)
- [ ] Retry panel › ✕ close (no text label) (web/components/ActivityLog.tsx:278-279)
- [ ] Retry panel › Save as finding ("saving…") — POST fix-episode, stores a finding through the guards (web/components/ActivityLog.tsx:305-308)

**Approvals lens**
- [ ] Pre-approved › Refresh / "Reading…" — re-reads allowlist and decisions (web/components/SecurityAuditPanel.tsx:675)
- [ ] Pre-approved action row › Show / Hide — lists its scopes (web/components/SecurityAuditPanel.tsx:692)
- [ ] Pre-approved scope row › Revoke — POST /approvals/revoke, no confirm (web/components/SecurityAuditPanel.tsx:703, :632)
- [ ] Decisions › Full trail / Hide the trail — every decision event (web/components/SecurityAuditPanel.tsx:736)

**Gate map lens**
- [ ] Statements in › Copy · CSV (TableActions "statement-doors": Door, Places, Uses, Last used) (web/components/operations/GateMapPanel.tsx:226)
- [ ] Messages out › Copy · CSV (TableActions "departure-laws": Law, Number, What a hold means, The law, Passed, Held, Asked, Last held) (web/components/operations/GateMapPanel.tsx:235)
- [ ] How each place meets the engine's dialect › Copy · CSV (TableActions "statement-doors-by-dialect") (web/components/operations/GateMapPanel.tsx:249)

**Policies lens**
- [ ] Agents › Change it — navigates to Settings (`requestTab("settings")`) (web/components/operations/GateMapPanel.tsx:335, wired web/components/SecurityAuditPanel.tsx:803)
- [ ] Spending › Spend — navigates to Operations ▸ Spend (web/components/operations/GateMapPanel.tsx:356)
- [ ] Groups › Access — navigates to Settings (not to the Access section specifically) (web/components/operations/GateMapPanel.tsx:374)
- [ ] The ledger › Download (link) — downloads `pramanyx-ledger.jsonl` from /ledger/v1/export (web/components/operations/GateMapPanel.tsx:416)
- [ ] Retry on any failed read (Gate / ReadFailed) across lenses (web/components/record/kit.tsx:62, web/components/SecurityAuditPanel.tsx:363, :485, :677, :713)

### Dialogs, drawers, popovers, panels
- [ ] Queries: Needs you section (web/components/SecurityAuditPanel.tsx:512)
- [ ] Queries: Query checks card — groups folded by caller and outcome, each opening its row table (max 420px scroll) (web/components/SecurityAuditPanel.tsx:532-570)
- [ ] Queries: "Who ran them" horizontal bars by caller, tooltip "<caller>: N checks — n flagged, n blocked…" (web/components/SecurityAuditPanel.tsx:573-590)
- [ ] Queries: Limits · <connection> card + inline budget editor (web/components/SecurityAuditPanel.tsx:359-412)
- [ ] Activity: status bar (per-schema chips or one phase chip, counters, Stop/Resume/Restart) (web/components/ActivityLog.tsx:153-229)
- [ ] Activity: expanded row detail — SQL, Result (600 chars), Query intent, Retry panel (web/components/ActivityLog.tsx:348-377)
- [ ] Activity: Retry panel — corrected SQL, explanation, up to 15 result rows, Save as finding / save feedback (web/components/ActivityLog.tsx:265-323)
- [ ] Approvals: Pre-approved card (actions folded, scopes on Show) and Decisions card (per action, Full trail) (web/components/SecurityAuditPanel.tsx:672-757)
- [ ] Gate map: "Statements in" flow picture — places in the code → doors → The warehouse (web/components/operations/GateMapPanel.tsx:137-156)
- [ ] Gate map: "Messages out · the departure gate" flow — Leaving → each law in order → Out; law hover shows meaning + the law's sentence (web/components/operations/GateMapPanel.tsx:170-210)
- [ ] Gate map: "How each place meets the engine's dialect" bars and "Places nothing guards" list (path · function · written by) (web/components/operations/GateMapPanel.tsx:247-274)
- [ ] Policies: one card of rules — Agents, Spending, Groups, Identity, The ledger (web/components/operations/GateMapPanel.tsx:334-423)

### Figures, counts, badges, status chips, freshness
- [ ] Queries figure "Queries checked" — total; sub "N errors · avg <ms>" (web/components/SecurityAuditPanel.tsx:501)
- [ ] Queries figure "Blocked" — red when any this week; sub "refused before running · last <day>" (web/components/SecurityAuditPanel.tsx:503)
- [ ] Queries figure "Flagged" — sub "none in the latest N" / "N recent, all the platform's own" / "N recent from people or agents"; hover explains flags (web/components/SecurityAuditPanel.tsx:505, :488)
- [ ] Queries figure "Values masked" — "sensitive values hidden in results" (web/components/SecurityAuditPanel.tsx:509)
- [ ] Needs-you rows "N flagged queries from people or agents" (detail from whom) and "N queries blocked this week" (detail + first error) (web/components/SecurityAuditPanel.tsx:518, :525)
- [ ] Query checks label "latest N <checks|passed|flagged|blocked> of <total>" (window = 500) (web/components/SecurityAuditPanel.tsx:534, :71)
- [ ] "N probes not listed · since <day>" chip — the platform's own statements counted, not listed (web/components/SecurityAuditPanel.tsx:536)
- [ ] Group row: outcome dot (passed green, flagged amber or grey when platform-own, failed/blocked/withheld red), "<outcome> · <caller>", meta (avg ms / rows / reason / span), count (web/components/SecurityAuditPanel.tsx:327-336, :305)
- [ ] Row table cells: time, connection name (hover id), who (agent + detail), verdict chip (passed/warned/refused, "withheld · sensitive values"), rows, duration, masked count (amber), error (web/components/SecurityAuditPanel.tsx:251-270)
- [ ] Who ran them label = window span ("22:46–23:41" / "9 Oct – 11 Oct") (web/components/SecurityAuditPanel.tsx:574)
- [ ] Limits chips "N rows at most", "warns at <ms>", "stops at <ms>", "the default" (web/components/SecurityAuditPanel.tsx:368-371)
- [ ] Activity status chip: phase (schema/nulls/joins/lifecycle/dist/patterns/intel/quick/agentic) with live pulse; "stopped", "idle", "complete", "failed", "interrupted at <phase>"; per-schema chips (web/components/ActivityLog.tsx:165-190, :36)
- [ ] Activity counters "N queries · N facts · N findings", interrupted note, amber "held: <note>", domain-intel skipped note, "N tables · N joins" (web/components/ActivityLog.tsx:192-205)
- [ ] Activity filter bar: "N errors" chip, fix-all summary "fixed a/b · saved n (n flagged) · n still failing", "30 of N" count, "live" dot while running (web/components/ActivityLog.tsx:714-739)
- [ ] Activity row: #, timestamp, type chip, message, status chip success/error, rows, object table (web/components/ActivityLog.tsx:485-523)
- [ ] Activity save feedback: "✓ Saved as finding" / "⚠ Saved as unverified — <note>" / "✓ Query fixed — <reason>" / "✕ <error>" (web/components/ActivityLog.tsx:328-341)
- [ ] Approvals: "N pre-approved"; per action row: action in words, scopes "· +N more", count; scope row: scope, by · day (web/components/SecurityAuditPanel.tsx:674-701)
- [ ] Approvals: Decisions "latest N"; per action: red/green dot (refused or not), "n check failed · n approved · …", "last <day>, <actor>", count; trail rows decision · action @ scope · actor · timestamp (web/components/SecurityAuditPanel.tsx:712-750)
- [ ] Gate map: "N places in the code" + "N with no guard" / "each one guarded"; per door "N places · N uses · last <d>" or "not used since <d>"; "uses since <d>" / "uses not counted yet" chip (web/components/operations/GateMapPanel.tsx:143-151, :225)
- [ ] Gate map: "Leaving · newest N checked"; per law "N held · n asked · n passed · last <d>" or "met none"; dot filled when met (web/components/operations/GateMapPanel.tsx:176, :192-200)
- [ ] Gate map: per dialect bar "N places — <meaning>"; Places nothing guards count (web/components/operations/GateMapPanel.tsx:255, :262)
- [ ] Policies chips: level, "on N connections only"/"every connection", "N tools only"/"every tool its level allows", "the default · nobody has set it" / "set by <who> · <d>", "narrowed by <env>"; "no cap" (amber); per group members + "N permissions"; "narrow nothing while identity is off"; "PRAMANYX_REQUIRE_IDENTITY=1 turns it on" (web/components/operations/GateMapPanel.tsx:343-408)

### Keyboard shortcuts
- [ ] Enter in the Activity retry guidance input runs the fix (web/components/ActivityLog.tsx:270)

### URL params / deep links
- [ ] Lens is held in shell state, not written to the URL; `?tab=activity` (legacy) opens this layer on the Activity lens (web/app/page.tsx:997, :1696)
- [ ] Agent Ops' "approvals" door sets lens = approvals and layer = security (web/app/page.tsx:2196)
- [ ] Policies' buttons dispatch `requestTab("settings")` / `requestTab("spend")` (web/lib/navigate.ts:29)
- [ ] Ledger download link: {apiBase}/ledger/v1/export (web/components/operations/GateMapPanel.tsx:416)

### Empty / error / loading / withheld states
- [ ] "Loading the audit log…" / "Could not read the audit log — <error>." + Retry (web/components/SecurityAuditPanel.tsx:485-486)
- [ ] "Nothing needs you · no recent flag from a person or an agent, nothing blocked this week" / "Nothing needs you · nothing blocked this week" (web/components/SecurityAuditPanel.tsx:512-514)
- [ ] "No query has been checked here yet." / "No <passed|flagged|blocked> query in the log." (web/components/SecurityAuditPanel.tsx:556)
- [ ] "Nothing in the log yet." — Who ran them (web/components/SecurityAuditPanel.tsx:577)
- [ ] "Loading the limits…" / "Could not read the limits…"; "These are the defaults — saving sets this connection's own."; "Not saved — <error>" (web/components/SecurityAuditPanel.tsx:363-364, :399, :411)
- [ ] Withheld (said): "N probes not listed" — internal statements counted but not listed; "withheld · sensitive values" verdict; "the result held sensitive values and was held back" (web/components/SecurityAuditPanel.tsx:536, :142, :314)
- [ ] Withheld (403): an explicit cross-org connection filter is refused server-side rather than shown empty (pramanyx/routers/security.py:41-46)
- [ ] Activity: "No activity recorded yet." / "Activity appears here as background exploration runs." (web/components/ActivityLog.tsx:681-682)
- [ ] Activity with NO connection selected: the panel is given `connectionId=""`, reads `/exploration//episodes` (a non-OK answer becomes `[]`) and says "No activity recorded yet." — an implied-empty, not a "choose a connection" (web/components/SecurityAuditPanel.tsx:796, web/lib/api.ts:3837)
- [ ] Activity: "No entries match the current filters." (web/components/ActivityLog.tsx:757)
- [ ] Activity: amber run error "The run did not continue" / "The run did not restart" / server reason (spent budget) (web/components/ActivityLog.tsx:622, :632, :679)
- [ ] Approvals: "Revoke failed: <error>" (web/components/SecurityAuditPanel.tsx:670)
- [ ] Approvals: "Loading/Could not read the pre-approved actions", "No action is pre-approved." (web/components/SecurityAuditPanel.tsx:677-679)
- [ ] Approvals: "Loading/Could not read the approval decisions", "No high-risk action attempted yet." + chip "the gate is on unless the server switched it off" (hover "PRAMANYX_ACTION_APPROVAL=0 on the server switches the approval gate off") (web/components/SecurityAuditPanel.tsx:713-718)
- [ ] Gate map: "Loading the gate map…" / "Could not read the gate map…" (web/components/operations/GateMapPanel.tsx:217)
- [ ] Gate map: "<census note>." when the install has no census; "The departure gate declares no law."; "No place is recorded."; "Every statement declares its dialect, is written for its engine, or is rendered for it."; "no reason recorded" (web/components/operations/GateMapPanel.tsx:231, :241, :254, :264, :267)
- [ ] Policies: per rule Loading/Could not read "the agent policy" / "the spend caps" / "the groups" / "who you are to the platform" (web/components/operations/GateMapPanel.tsx:336, :357, :375, :399)
- [ ] Policies: "Nothing alerts or blocks on usage." (no cap); "Off: nobody is asked who they are, and every caller is treated as the owner."; groups "nobody assigned" (web/components/operations/GateMapPanel.tsx:361, :404, :385)

### Loads on open
- [ ] GET /connections — names for the chip, filter and rows (web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] Queries: GET /security/audit/stats?connection_id= (direct fetch web/components/SecurityAuditPanel.tsx:85 → pramanyx/routers/security.py:53)
- [ ] Queries: GET /security/audit?limit=500&connection_id=&verdict= (web/components/SecurityAuditPanel.tsx:77 → pramanyx/routers/security.py:28)
- [ ] Queries: GET /security/audit?limit=50&verdict=blocked — blocked rows on their own read (web/components/SecurityAuditPanel.tsx:455)
- [ ] Queries (connection selected): GET /security/budget/{conn} (web/components/SecurityAuditPanel.tsx:91 → pramanyx/routers/security.py:80)
- [ ] Activity: GET /exploration/{conn}/episodes?phase=&limit=1000 + GET /exploration/{conn}/status, re-read every 60 s and on `exploration.*` kernel events (web/lib/api.ts:3829, :2530 → pramanyx/routers/exploration.py:1236, :438; poll web/components/ActivityLog.tsx:595-598)
- [ ] Approvals: GET /approvals/audit?limit=100 + GET /approvals/allowlist (web/lib/api.ts:409, :414 → pramanyx/routers/approvals.py:43, :37)
- [ ] Gate map: GET /governance/gate-map (direct fetch web/components/operations/GateMapPanel.tsx:214 → pramanyx/routers/governance.py:142)
- [ ] Policies: GET /org-settings/agent-policy, GET /governance/caps, GET /rbac/roles, GET /rbac/assignments, GET /rbac/me (web/components/operations/GateMapPanel.tsx:326-329 → pramanyx/routers/orgsettings.py:222, pramanyx/routers/governance.py:164, pramanyx/routers/roles.py:37, :67, :49)
- [ ] No GET on this page found to write or spend; every spend is behind a button (Resume, Restart, Fix all, Run fix)

**Top rows today:** one header row — lens segmented (Queries · Activity · Approvals · Gate map · Policies), the connection chip, then Refresh at the right (Queries only). The Activity lens adds its own status bar (phase chips · counters · Stop/Resume/Restart) and a filter bar (dates · status · errors · Fix all · count · Show all) beneath it; Queries puts its Verdict + Connection filters inside the Query checks card.

## Evals (`tab=evals`)
_Source: web/components/EvalsWorkspace.tsx, web/components/EvalSuitesPanel.tsx, web/components/EvalRunPanel.tsx, web/components/EvalExperimentsPanel.tsx (+ web/lib/evalSummary.ts, web/components/TableActions.tsx, web/components/AugTable.tsx, web/components/Workspace.tsx)_

Spend summary: nothing on Evals calls a model. The two run controls (Suites row "Run", suite detail "Run suite") replay each case's SQL on the suite's connection (cases x iterations warehouse queries), synchronously, with NO confirm; the button tooltip and chips say "no model calls" and how many queries. Experiments has no run control at all (pairs come from `scripts/flag_ab_grid.py`).

### Controls
#### Workspace
- [ ] Layer tab "Suites" — opens Suites; tooltip "What is measured, and how each suite last did" (web/components/EvalsWorkspace.tsx:45)
- [ ] Layer tab "Runs" — opens Runs; tooltip "Each set-up's score as a band, with its trend" (web/components/EvalsWorkspace.tsx:46)
- [ ] Layer tab "Experiments" — opens Experiments; tooltip "A against B, and whether the gap clears the noise" (web/components/EvalsWorkspace.tsx:47)
#### Suites
- [ ] "New suite" (+) in the Suites card header — opens the New suite dialog (web/components/EvalSuitesPanel.tsx:328)
- [ ] "New suite" (+) in the empty Suites card — same dialog when no suite exists (web/components/EvalSuitesPanel.tsx:397)
- [ ] Suite row "Run" — runs the suite once (iterations 1) via POST /evals/suites/{id}/run; no confirm; disabled while any row run is in flight; reads "Running…"; tooltip "Replays N queries on <connection> once — no model calls" (web/components/EvalSuitesPanel.tsx:262-270, 332)
- [ ] Needs-you row "Run" — same run, from a needs-you row (web/components/EvalSuitesPanel.tsx:278)
- [ ] Suite row "Open" — opens the suite detail (cases, run settings, delete) (web/components/EvalSuitesPanel.tsx:387)
- [ ] Needs-you row "Open" — opens the same suite detail (web/components/EvalSuitesPanel.tsx:272, 278)
- [ ] New suite dialog: "Name" input (placeholder "e.g. Golden SQL — revenue questions") (web/components/EvalSuitesPanel.tsx:420-423)
- [ ] New suite dialog: "Description" textarea ("What this suite measures") (web/components/EvalSuitesPanel.tsx:424-427)
- [ ] New suite dialog: "Connection" select ("Select a connection…" + every connection); defaults to the shell's selected connection (web/components/EvalSuitesPanel.tsx:428-434, 125)
- [ ] New suite dialog: "Create suite" — POST /evals/suites (target "reference"), reloads, opens the new suite's detail; reads "Creating…" (web/components/EvalSuitesPanel.tsx:436, 147-166)
- [ ] New suite dialog: "Cancel" (web/components/EvalSuitesPanel.tsx:437)
- [ ] Suite detail: "All suites" (back arrow) — returns to the list and reloads (web/components/EvalSuitesPanel.tsx:490, 225)
- [ ] Suite detail: "Iterations" number input, clamped 1–10; tooltip on flaky counting (web/components/EvalSuitesPanel.tsx:530-532)
- [ ] Suite detail: "Run suite" — runs with the chosen iterations via POST /evals/suites/{id}/run; disabled with 0 cases; no confirm; reads "Running…" (web/components/EvalSuitesPanel.tsx:533-535, 472-484)
- [ ] Run summary: "See runs" — switches to the Runs layer (web/components/EvalSuitesPanel.tsx:579, 226)
- [ ] Cases card: "Add case" (+) — opens the Add case dialog (web/components/EvalSuitesPanel.tsx:629)
- [ ] Add case dialog: "Question" input ("Question (a label, e.g. 'Total revenue by month')") (web/components/EvalSuitesPanel.tsx:636-637)
- [ ] Add case dialog: "SQL" textarea ("SELECT … — the SQL this case replays") (web/components/EvalSuitesPanel.tsx:638-639)
- [ ] Add case dialog: "Add case" — POST /evals/suites/{id}/cases; requires SQL; reads "Adding…" (web/components/EvalSuitesPanel.tsx:641, 599-613)
- [ ] Add case dialog: "Cancel" (web/components/EvalSuitesPanel.tsx:642)
- [ ] Case row "Remove" — DELETE /evals/cases/{id}; no confirm (web/components/EvalSuitesPanel.tsx:661, 620-623)
- [ ] "Show all N" / "Show fewer" — toggles past the first 25 cases (web/components/EvalSuitesPanel.tsx:664-667, 58)
- [ ] Suite detail: "Delete suite" (destructive) — browser confirm "Delete this suite and all its cases and runs?" then DELETE /evals/suites/{id} (web/components/EvalSuitesPanel.tsx:548, 168-177)
- [ ] "Retry" on a failed suites read (web/components/EvalSuitesPanel.tsx:209)
#### Runs
- [ ] "Refresh" in the "Runs by set-up" card header — re-reads runs and suites (web/components/EvalRunPanel.tsx:148)
- [ ] Set-up row "Details" (chevron) — expands/collapses that set-up's individual runs, newest first (web/components/EvalRunPanel.tsx:209-216)
- [ ] Run line "Cases" — opens that run's detail (per-case results) (web/components/EvalRunPanel.tsx:254, 77-81)
- [ ] Trend marks — hover tooltip per run: "<when> · <rate> stable pass / failed / never finished" (web/components/EvalRunPanel.tsx:264-287)
- [ ] Run detail: "All runs" (back arrow) — returns to the list and reloads (web/components/EvalRunPanel.tsx:344, 88)
- [ ] Run detail Cases table: "Copy" / "CSV" (TableActions — copy as cells, download CSV) (web/components/EvalRunPanel.tsx:383; web/components/TableActions.tsx:105-112)
- [ ] Run detail Cases table: pagination, 50 per page, when over 50 results (web/components/EvalRunPanel.tsx:389)
- [ ] "Retry" on a failed runs read (web/components/EvalRunPanel.tsx:94)
#### Experiments
- [ ] "Refresh" in the "Pairs" card header (web/components/EvalExperimentsPanel.tsx:164)
- [ ] Pair row "Details" — reads the per-case compare and opens it (web/components/EvalExperimentsPanel.tsx:220, 107-111)
- [ ] Compare detail: "All experiments" (back arrow) (web/components/EvalExperimentsPanel.tsx:272)
- [ ] Compare detail "Cases that changed": "Copy" / "CSV" (TableActions) (web/components/EvalExperimentsPanel.tsx:304)
- [ ] Compare detail table: pagination, 50 per page, when over 50 rows (web/components/EvalExperimentsPanel.tsx:312)
- [ ] "Retry" on a failed experiments read (web/components/EvalExperimentsPanel.tsx:133)
- [ ] (absent, for the record) no search, filter, sort, rename, or start-an-experiment control on any Evals layer; backend PATCH /evals/suites/{id} (rename) and POST /evals/flags/{flag}/graduate have no UI here (pramanyx/routers/evals.py:149, 280)

### Dialogs, drawers, popovers, panels
- [ ] New suite dialog (FormDialog, 600px, "New suite") — Name, Description, Connection, Create suite / Cancel; its own error line inside (web/components/EvalSuitesPanel.tsx:217-221, 408-441)
- [ ] Add case dialog (FormDialog, 720px, "Add a case to <suite>") — Question, SQL, Add case / Cancel; refusal said inside (web/components/EvalSuitesPanel.tsx:632-645)
- [ ] Suite detail view (replaces the list in-page) — header, figures, Run card, Cases card, Delete suite (web/components/EvalSuitesPanel.tsx:449-552)
- [ ] Run summary block (appears in the Run card after a run) — figures + fired-check chips + See runs (web/components/EvalSuitesPanel.tsx:554-583)
- [ ] Set-up row expansion — the set-up's runs as run lines (web/components/EvalRunPanel.tsx:213-217)
- [ ] Run detail view (replaces the list) — header chips, figures, Checks that failed, Cases table (web/components/EvalRunPanel.tsx:293-396)
- [ ] Compare detail view (replaces the list) — header, figures, chips, Cases that changed table (web/components/EvalExperimentsPanel.tsx:229-319)
- [ ] FormDialog corner Close; Escape and the scrim close it unless busy (web/components/ui/dialog.tsx:64-79)

### Figures, counts, badges, status chips, freshness
#### Suites
- [ ] Figure "Suites" — count; sub "N have run · M never" or "runs could not be read" (web/components/EvalSuitesPanel.tsx:303-304)
- [ ] Figure "Cases" — total across suites, "—" while reading/failed; sub "reading each suite…" / "N suites could not be read" / "across N suites" (web/components/EvalSuitesPanel.tsx:305-307)
- [ ] Figure "Passed in full" — "X of Y" suites at 100% at last run; sub "every last run passed every case" / "N below 100% at their last run" (web/components/EvalSuitesPanel.tsx:308-311)
- [ ] Figure "Never run" — count, amber when > 0; sub "no measurement yet" / "every suite has a result" (web/components/EvalSuitesPanel.tsx:312-314)
- [ ] Needs-you row "<suite> has never run" — detail cases · SQL replay · connection (+ "no run among the latest 500" when the read was cut) (web/components/EvalSuitesPanel.tsx:279-281)
- [ ] Needs-you row "<suite> fell to X%" — "from Y the run before, same set-up · <day>" (web/components/EvalSuitesPanel.tsx:283-286)
- [ ] Needs-you row "<suite>: its last run failed" — day + note or "no result came back" (web/components/EvalSuitesPanel.tsx:288-291)
- [ ] Needs-you row "<suite>: its last run never finished" — "marked running since <day>" (web/components/EvalSuitesPanel.tsx:293-295)
- [ ] Suites card header chip "a run replays SQL · no model calls" (web/components/EvalSuitesPanel.tsx:325-327)
- [ ] Suite row meta line — "N cases · SQL replay · <connection> · ×N runs · last <day>" (web/components/EvalSuitesPanel.tsx:369-371, 383)
- [ ] Suite row chip "consistency, not correctness" (when the description says so) (web/components/EvalSuitesPanel.tsx:379-381)
- [ ] Suite row result chip — "never run" (amber) / "last run failed" (red) / "never finished" / "running" / "no result" / "result unread" / "X% · stable/total" (green at 100%, amber when fell) (web/components/EvalSuitesPanel.tsx:341-353, 385)
- [ ] Suite row block chip in place of Run — "runs outside the app" / "no connection" with why on hover (web/components/EvalSuitesPanel.tsx:386; web/lib/evalSummary.ts:182-187)
- [ ] Suite row run status line — "Finished · X% · N of M stable" or the run's error (web/components/EvalSuitesPanel.tsx:194-196, 389)
- [ ] Suite detail header chips — target ("SQL replay"/…), connection name, "consistency, not correctness" (web/components/EvalSuitesPanel.tsx:491-494)
- [ ] Suite detail description line (web/components/EvalSuitesPanel.tsx:496-500)
- [ ] Suite detail figure "Cases" — sub "N with SQL to replay" / "each checks one claim" (web/components/EvalSuitesPanel.tsx:503-505)
- [ ] Suite detail figure "Last result" — rate / "—" / "never run"; amber when fell, red when failed; sub stable count · day · "fell from X" (web/components/EvalSuitesPanel.tsx:506-511)
- [ ] Suite detail figure "Runs" — count; sub band text "over N replicates" / "1 replicate — no band" / "nothing measured yet" (web/components/EvalSuitesPanel.tsx:512-515)
- [ ] Run card chips — "no model calls", "replays N queries on <connection>", "N deterministic checks" (web/components/EvalSuitesPanel.tsx:519-525)
- [ ] Run summary figures — "Pass rate (stable)", "Flaky" (amber), "Errors" (red), "Accuracy"/"Robustness" (web/components/EvalSuitesPanel.tsx:558-571)
- [ ] Run summary fired-check chips — "<check> ×n" (web/components/EvalSuitesPanel.tsx:573-577)
- [ ] Cases card count (web/components/EvalSuitesPanel.tsx:628)
- [ ] Case row — question (or "No question"), SQL on one line, "no SQL" chip (web/components/EvalSuitesPanel.tsx:653-659)
#### Runs
- [ ] Figure "Runs" — count; sub "N set-ups of M suites · last <day>" (web/components/EvalRunPanel.tsx:133-134)
- [ ] Figure "With a band" — "X of Y"; sub "every set-up ran 2+ times" / "N ran once — no band" (web/components/EvalRunPanel.tsx:135-137)
- [ ] Figure "Held the noise floor" — "X of Y" banded; sub "replicates within 5 pts of each other" (web/components/EvalRunPanel.tsx:138-140)
- [ ] Figure "Didn't finish" — count; sub "N failed · M never finished" / "every run finished" (web/components/EvalRunPanel.tsx:141-142)
- [ ] Card header count — "N runs as M rows" (+ "· the latest 200" when cut) (web/components/EvalRunPanel.tsx:147)
- [ ] Set-up row chips — "consistency, not correctness", "×N" run count, set-up cell name, floor chip "holds within N pts" / "steady — no spread" / "varies N pts" (web/components/EvalRunPanel.tsx:194-198, 159-167)
- [ ] Set-up row meta — "last <day> · N failed · N never finished · N running · N flaky · accuracy <band>" (web/components/EvalRunPanel.tsx:180-187)
- [ ] Set-up row Trend — up to 24 marks: column at pass rate, red stub failed, hatched stub unfinished (web/components/EvalRunPanel.tsx:202, 264-287)
- [ ] Set-up row score — band text ("79.5% ± 9.1"), under it "N replicates" / "— no band" / "no measurement" (web/components/EvalRunPanel.tsx:203-207)
- [ ] Run line — when, state chip (finished/no result/failed/running/never finished), "X% · N of M stable", "N iterations", "N flaky", "N errors", "accuracy X%", note (web/components/EvalRunPanel.tsx:231-257)
- [ ] Run detail header chips — set-up cell, "consistency, not correctness", state, "started <when>", "N iterations", "questions unread" (web/components/EvalRunPanel.tsx:345-351)
- [ ] Run detail note line (web/components/EvalRunPanel.tsx:353)
- [ ] Run detail figures — "Pass rate (stable)" (red when failed), "Flaky", "Errors", "Accuracy"/"Robustness" (web/components/EvalRunPanel.tsx:355-367)
- [ ] Run detail "Checks that failed" card — count + "<check> ×n" chips (web/components/EvalRunPanel.tsx:369-378)
- [ ] Run detail Cases table columns — Case, Iteration, Passed (pass/fail chip), Correct (correct/wrong chip), Time (ms), Checks failed, Error; "N results" count (web/components/EvalRunPanel.tsx:313-333, 382)
#### Experiments
- [ ] Figure "Pairs" — count; sub "on N suites" (web/components/EvalExperimentsPanel.tsx:147-148)
- [ ] Figure "Clear the noise floor" — "X of Y"; sub "N better · M worse" / "no difference is wider than the noise" (web/components/EvalExperimentsPanel.tsx:149-153)
- [ ] Figure "Can't be called" — count; sub "N baseline ran once · M baseline too noisy" / "every baseline has a floor" (web/components/EvalExperimentsPanel.tsx:154-156)
- [ ] Figure "A side failed" — count, red when > 0; sub "nothing to compare" / "both sides finished" (web/components/EvalExperimentsPanel.tsx:157-158)
- [ ] Pairs header label "A is the baseline" (web/components/EvalExperimentsPanel.tsx:163)
- [ ] Pair row — axis words title, axis kind chip, "consistency, not correctness", meta "suite · N cases · day · accuracy a → b" (web/components/EvalExperimentsPanel.tsx:207-215)
- [ ] Pair row — "A <rate> → B <rate>" and the difference in points (web/components/EvalExperimentsPanel.tsx:216-218)
- [ ] Pair row verdict chip — "<side> failed — nothing to compare" / "can't call — A ran once" / "can't call — A varies N pts" / "within noise" / "B better|worse by N pts" / "floor unread" (web/components/EvalExperimentsPanel.tsx:52-73, 191, 219)
- [ ] Compare header — axis words, kind chip, suite name, consistency chip, verdict chip (web/components/EvalExperimentsPanel.tsx:271-280)
- [ ] Compare figures — "Paired cases" (N gave the same verdict), "A correct", "B correct" (red when lower; gained · lost · other), "Left out" (amber; unrun by one side) (web/components/EvalExperimentsPanel.tsx:282-291)
- [ ] Compare chips — "accuracy over paired cases only", "verdicts only — no SQL captured", "A <day> · B <day>" (web/components/EvalExperimentsPanel.tsx:293-299)
- [ ] "Cases that changed" table — Question, A verdict chip, B verdict chip, Change (gained/lost/other), SQL (A → B) or error; "N cases" count (web/components/EvalExperimentsPanel.tsx:243-263, 303)

### Keyboard shortcuts
- none found (no handlers in the three panels; FormDialog's Escape-to-close is the dialog primitive's) (web/components/ui/dialog.tsx:67-78)

### URL params / deep links
- [ ] `?tab=evals&layer=suites|runs|experiments` — read on load/popstate and honoured only for these three (web/app/page.tsx:1030, 1098)
- [ ] The shell writes `layer=<evals layer>` back as the layer changes (pushState/replaceState) (web/app/page.tsx:1240, 1257)
- [ ] `?conn=` is written by the shell; Evals uses the selected connection only as the New suite dialog's default (web/app/page.tsx:2159; web/components/EvalSuitesPanel.tsx:125)
- [ ] (not addressable) the open suite, run and pair detail views live in component state; a reload returns to the list (web/components/EvalSuitesPanel.tsx:63; web/components/EvalRunPanel.tsx:45; web/components/EvalExperimentsPanel.tsx:83)

### Empty / error / loading / withheld states
#### Suites
- [ ] "Loading eval suites…" — first read (web/components/EvalSuitesPanel.tsx:210)
- [ ] "Could not read the eval suites — <error>." + Retry — the suites read failed (web/components/EvalSuitesPanel.tsx:209)
- [ ] "No eval suites yet — a suite replays the same cases and reports its score as a band, never a single run." — no suites (web/components/EvalSuitesPanel.tsx:400)
- [ ] "Nothing needs you · every suite has run, and none fell or failed at its last run" — needs-you empty (web/components/EvalSuitesPanel.tsx:318)
- [ ] "Could not read the runs, so no suite's last result is known." — runs read failed (web/components/EvalSuitesPanel.tsx:321)
- [ ] "runs could not be read" / "result unread" / "cases unread" / "… cases" — per-figure and per-row withheld reads (web/components/EvalSuitesPanel.tsx:259, 304, 342)
- [ ] "no connection" / "a connection no longer listed" — connection name fallbacks (web/components/EvalSuitesPanel.tsx:118-119)
- [ ] "<why>." in the Run card — "Only SQL-replay suites run from here; this one is run by its own harness" / "A SQL replay needs a connection to replay its cases on" (web/components/EvalSuitesPanel.tsx:526; web/lib/evalSummary.ts:184-186)
- [ ] "A case that passes only some iterations counts as flaky — never rounded into the pass rate." — before a run (web/components/EvalSuitesPanel.tsx:536-538)
- [ ] "No cases yet — a case is a question and the SQL it replays." — empty suite (web/components/EvalSuitesPanel.tsx:647)
- [ ] Error alerts — "A suite needs a name", "Could not create the suite", "Could not open the suite", "Delete failed", "The run failed", "A case needs SQL to replay", "Could not add the case" (web/components/EvalSuitesPanel.tsx:148, 162, 143, 175, 480, 600, 609)
#### Runs
- [ ] "Loading the eval runs…" (web/components/EvalRunPanel.tsx:95)
- [ ] "Could not read the eval runs — <error>." + Retry (web/components/EvalRunPanel.tsx:94)
- [ ] "No runs yet — run a suite from Suites, and its result lands here as a band." (web/components/EvalRunPanel.tsx:100)
- [ ] "Could not open the run" — run detail read failed (web/components/EvalRunPanel.tsx:80)
- [ ] "Suite no longer listed" — a run whose suite is gone (web/components/EvalRunPanel.tsx:36)
- [ ] "no band" / "nothing measured" titles — "Run once: there is nothing to say how far it disagrees with itself…" (web/components/EvalRunPanel.tsx:160-162)
- [ ] "Still marked running a day later — it never finished" — unfinished chip title (web/components/EvalRunPanel.tsx:239)
- [ ] "questions unread" — the suite's cases could not be read, results named by case id (web/components/EvalRunPanel.tsx:351)
- [ ] "no result came back" — run detail with no summary (web/components/EvalRunPanel.tsx:357)
- [ ] "This run recorded no case results." (web/components/EvalRunPanel.tsx:385)
#### Experiments
- [ ] "Loading experiments…" (web/components/EvalExperimentsPanel.tsx:134)
- [ ] "Could not read the experiments — <error>." + Retry (web/components/EvalExperimentsPanel.tsx:133)
- [ ] "No experiments yet. An experiment is two runs of one suite that differ on exactly one setting — a flag, or a model; run a suite under both (the A/B grid runner) and the pair appears here." (web/components/EvalExperimentsPanel.tsx:139-140)
- [ ] "runs could not be read" / "floor unread" — figures and verdicts when the runs read failed (web/components/EvalExperimentsPanel.tsx:153-156, 191)
- [ ] "Could not compare the two runs" (web/components/EvalExperimentsPanel.tsx:110)
- [ ] "No case changed verdict between the two — N agreed." (web/components/EvalExperimentsPanel.tsx:307)
- [ ] "Suite no longer listed" (web/components/EvalExperimentsPanel.tsx:114)
#### All layers
- [ ] Every /evals route is gated by Capability.EVAL_SUITE — an unlicensed install gets a 402 on open (pramanyx/routers/evals.py:127)

### Loads on open
#### Suites
- [ ] GET /evals/suites — the suite list (web/lib/api.ts:10875 → pramanyx/routers/evals.py:127)
- [ ] GET /connections — connection names + the dialog's options (web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] GET /evals/evaluators — deterministic check count (web/lib/api.ts:10961 → pramanyx/routers/evals.py:346)
- [ ] GET /evals/runs?limit=500 — each suite's last result (web/lib/api.ts:10946 → pramanyx/routers/evals.py:233)
- [ ] GET /evals/suites/{id} once PER SUITE — case counts (N+1 reads) (web/components/EvalSuitesPanel.tsx:103; web/lib/api.ts:10881 → pramanyx/routers/evals.py:139)
#### Runs
- [ ] GET /evals/runs?limit=200 + GET /evals/suites — list and names (web/components/EvalRunPanel.tsx:50-53)
- [ ] Polls the same every 60 s via setInterval (not visibility-gated; keeps running while the layer is hidden but mounted) (web/components/EvalRunPanel.tsx:72)
- [ ] Subscribes to the shared EventSource /events/stream for `eval.` and `job.state` events (web/components/EvalRunPanel.tsx:73; web/lib/events.ts:47)
- [ ] On "Cases": GET /evals/runs/{id} + GET /evals/suites/{id} (web/lib/api.ts:10955 → pramanyx/routers/evals.py:238)
#### Experiments
- [ ] GET /evals/experiments?limit=50 — pairs derived from run history on read, not stored (web/lib/api.ts:11005 → pramanyx/routers/evals.py:248)
- [ ] GET /evals/suites, GET /evals/runs?limit=500 — names and noise floors (web/components/EvalExperimentsPanel.tsx:89-90)
- [ ] GET /system/flags — flag labels for axis names (web/lib/api.ts:9745 → pramanyx/routers/system.py:235)
- [ ] On "Details": GET /evals/experiments/compare?a=&b= (web/lib/api.ts:11014 → pramanyx/routers/evals.py:261)
#### Writes, on action only (nothing writes or spends on open)
- [ ] POST /evals/suites — Create suite (web/lib/api.ts:10887 → pramanyx/routers/evals.py:132)
- [ ] POST /evals/suites/{id}/cases — Add case (web/lib/api.ts:10905 → pramanyx/routers/evals.py:169)
- [ ] DELETE /evals/cases/{id} — Remove (no confirm) (web/lib/api.ts:10918 → pramanyx/routers/evals.py:177)
- [ ] DELETE /evals/suites/{id} — Delete suite (browser confirm) (web/lib/api.ts:10900 → pramanyx/routers/evals.py:160)
- [ ] POST /evals/suites/{id}/run — Run / Run suite: synchronous SQL replay on the suite's connection, persists a run; SPENDS warehouse queries (cases x iterations), no model calls, no confirm (web/lib/api.ts:10923 → pramanyx/routers/evals.py:186)

**Top rows today:** Evals has no context bar, no toolbar and no "?" help — only the layer tab row "Suites · Runs · Experiments" (web/components/EvalsWorkspace.tsx:67-78). Each layer then opens on its four-figure row; Suites' list card header carries the chip "a run replays SQL · no model calls" + "New suite"; Runs' card header carries "N runs as M rows" + "Refresh"; Experiments' card header carries "A is the baseline" + "Refresh". Detail views open with a row: back button ("All suites"/"All runs"/"All experiments") · title · chips.

## Brain map (`tab=intelligence&layer=brain`)
_Source: web/components/BrainMapPanel.tsx (+ web/lib/brainMap.ts; mounted by web/components/IntelligenceWorkspace.tsx:296 inside web/app/page.tsx:2151-2166)_

### Controls
- [ ] Rail row "Brain map" (Operations destination, last row) — opens tab `intelligence`, layer `brain` (web/lib/navDestinations.ts:87; web/app/page.tsx:956)
- [ ] Command palette action "Brain map" ("Every store behind what Pramanyx knows, with live counts") (web/components/CommandPalette.tsx:367, 410)
- [ ] Context-bar "Connection" select — only when more than one briefings-enabled connection exists; lists briefings-enabled connections only (web/components/IntelligenceWorkspace.tsx:196, 204-217; web/app/page.tsx:2160)
- [ ] Context-bar "Schema" select — only when the connection has more than one schema; remembered per connection; it does not change the Brain map (the panel takes no schema) (web/components/IntelligenceWorkspace.tsx:197, 221-237)
- [ ] "Retry" — on a failed read, reads the map again (web/components/BrainMapPanel.tsx:55)
- [ ] Hover an arrow's count pill — tooltip with the full sentence "{from} → {to}: {count} {label}" (web/components/BrainMapPanel.tsx:116-127; web/lib/brainMap.ts:29-32)
- [ ] Hover a store box — its serving route (for a developer) (web/components/BrainMapPanel.tsx:142-143)
- [ ] Hover a box's figure — "{count} {unit}" or "Not read — the line below says why" (web/components/BrainMapPanel.tsx:146)
- [ ] Hover a box's line — the full (two-line-clamped) line (web/components/BrainMapPanel.tsx:152)
- [ ] Hover the "read live …" note — "Nothing here is estimated: every box is a store read now, every arrow a count." (web/components/BrainMapPanel.tsx:66-67)
- [ ] Hover a changed fact — its id; its "was …" line — the full replaced value; its date — the full timestamp (web/components/BrainMapPanel.tsx:189, 199, 204)
- [ ] Picture scrolls horizontally below 820px wide (web/components/BrainMapPanel.tsx:88-89)
- [ ] No click, zoom, pan, filter, sort or export on the picture or the facts list (web/components/BrainMapPanel.tsx:86-212)
- [ ] Layer tabs hidden on the main screen (`hideTabs`) — the rail is the switcher (web/app/page.tsx:2158; web/components/IntelligenceWorkspace.tsx:248)

### Dialogs, drawers, popovers, panels
- [ ] Edge tooltip (hover only) (web/components/BrainMapPanel.tsx:117)
- [ ] No dialogs, drawers or popovers

### Figures, counts, badges, status chips, freshness
- [ ] Heading "Where Pramanyx's knowledge lives" + right note "read live · an arrow is a measured count · a dash, a store not read" (web/components/BrainMapPanel.tsx:66-69)
- [ ] Vault column titles (uppercase) over the boxes (web/components/BrainMapPanel.tsx:90-95)
- [ ] Each store box: title, live count (percent for the visibility box), one line saying what the count holds; a hatched "—" when the store was not read (web/components/BrainMapPanel.tsx:134-157; web/lib/brainMap.ts:18-22)
- [ ] Arrows between boxes — solid for a measured count, faint for zero, each with a short count pill (web/components/BrainMapPanel.tsx:97-127; web/lib/brainMap.ts:39-43)
- [ ] "Also measured: …" — links the picture cannot draw, in words (web/components/BrainMapPanel.tsx:71-75)
- [ ] Card "Facts that changed, and what each replaced" + right count "newest {n} of {m}" or "{n}" (web/components/BrainMapPanel.tsx:171-181)
- [ ] Each changed fact: name (`table.column` mono for a column, a metric in words), kind word (column/table/metric/finding/domain), reason chip (when not "changed"), "was {replaced}" or "what it replaced was not kept", changed date (day-month) (web/components/BrainMapPanel.tsx:162-207; web/lib/brainMap.ts:46-60)
- [ ] Context-bar "Maturity" mark — bars + stage ("off for analysis" / stage) + " · layer not set" (web/components/IntelligenceWorkspace.tsx:199, 238; web/components/DatasetProgram.tsx:355-373)

### Keyboard shortcuts
- none found

### URL params / deep links
- [ ] Reads `?tab=brain` (rail id) → intelligence/brain; `?tab=intelligence&layer=brain` (web/app/page.tsx:890, 956, 1027)
- [ ] Writes `?tab=intelligence&layer=brain&conn=<id>` (shell URL sync) (web/app/page.tsx:1241-1267)

### Empty / error / loading / withheld states
- [ ] "The brain map is per connection. Choose one in the bar above." — no connection, context resolved (web/components/BrainMapPanel.tsx:47-49)
- [ ] "Finding your connection…" — shell still resolving the workspace (web/components/BrainMapPanel.tsx:50)
- [ ] "Reading every store…" — loading (web/components/BrainMapPanel.tsx:59)
- [ ] "Could not read the brain map — no store was changed — {error}." + Retry — read failed (error text "Failed to load the brain map") (web/components/BrainMapPanel.tsx:52-57; web/lib/api.ts:7836)
- [ ] Unread store: hatched dash, and its line says why — never a zero (web/components/BrainMapPanel.tsx:136-154)
- [ ] "Fact history not read — {why}" / "… the facts store is not on this map" (web/components/BrainMapPanel.tsx:182-183)
- [ ] "No fact has changed since it was first seen." (web/components/BrainMapPanel.tsx:184-185)

### Loads on open
- [ ] GET /brain/map?connection_id=&workspace_id= — every store's count and the measured edges (web/lib/api.ts:7832 → pramanyx/routers/brain.py:14) read-only ("a read, never a build")
- [ ] Workspace scope, connection with a declared schema: GET /ontology/schemas?connection_id= (web/lib/objectTypes.ts:1396 → pramanyx/routers/ontology.py:866) read-only
- [ ] Workspace scope, connection with no declared schema: GET /catalog/tree?workspace_id= — introspects every connection in the workspace (web/components/IntelligenceWorkspace.tsx:167-179; web/lib/api.ts:945 → pramanyx/routers/catalog.py:234) [WRITES ON OPEN: reconciles the metastore's schema rows via set_catalog_schemas — pramanyx/routers/catalog.py:273-279]
- [ ] GET /exploration/{conn}/datasets — the Maturity mark (web/components/DatasetProgram.tsx:360; web/lib/api.ts:2486 → pramanyx/routers/datasets.py:155) read-only
- [ ] No polling

**Top rows today:** no layer tabs and no toolbar (hidden on the main screen); one context bar holding "Connection" select (only when >1 briefings-enabled connection) · "Schema" select (only when >1 schema; no effect on this layer) · "Maturity" mark. The page then opens on the heading "Where Pramanyx's knowledge lives" with its "read live …" note at the right.

## Settings — screen chrome (`tab=settings`)
_Source: web/app/page.tsx (SettingsScreen 591-635; section state 1083; URL routing 936-998, 1095-1104, 1112-1163, 1170-1197, 1203-1290; theme plumbing 1353-1406)_

### Controls
- [ ] Settings rail row — opens `tab=settings` on the section last held this session (default Organization) (web/app/page.tsx:437)
- [ ] Section tab strip "Settings sections" (Radix Tabs) — switches the one section shown below; no page title row above it (web/app/page.tsx:609)
- [ ] Tab "Organization" — renders OrgSettingsPanel then OwnersPanel (web/app/page.tsx:597, 614-620)
- [ ] Tab "Access" — renders RolesPanel (web/app/page.tsx:598, 626)
- [ ] Tab "Appearance" — renders AppearancePanel with the shell's theme + setter (web/app/page.tsx:599, 622)
- [ ] Tab "Models" — renders InferencePanel (web/app/page.tsx:600, 624)
- [ ] Tab "System" — renders SystemPanel (web/app/page.tsx:601, 628)
- [ ] Tab "Integrations" — renders IntegrationsPanel (moved here from Operations 2026-11-10) (web/app/page.tsx:603, 630)
- [ ] Door in: Command palette entry "Settings — Theme, model, system configuration" → `settings` (web/components/CommandPalette.tsx:383, 438)
- [ ] Door in: Security & Audit ▸ Policies "open Settings" → `requestTab("settings")` (web/components/SecurityAuditPanel.tsx:803)
- [ ] Door in: Agent Ops ▸ Developer "Manage packs" → `handleNavigate("settings")` — lands on the last-held section (default Organization), NOT System where the Packs list lives (web/components/operations/DeveloperPanel.tsx:99 → web/components/AgenticOpsWorkspace.tsx:295 → web/app/page.tsx:2197)
- [ ] Door in: Agent Ops ▸ Roster map / Developer "Integrations" → `handleNavigate("integrations")` → Settings ▸ Integrations (web/app/page.tsx:2187, 1741-1744)
- [ ] Theme setter shared with the top bar's "Theme" dark/light segmented toggle — one click there persists exactly as Appearance does (web/app/page.tsx:283, 1399-1406)

### Dialogs, drawers, popovers, panels
- none at chrome level (each section owns its own; see the section entries)

### Figures, counts, badges, status chips, freshness
- none at chrome level (section tabs carry no badges)

### Keyboard shortcuts
- [ ] Arrow keys move focus between section tabs (Radix Tabs roving focus in TabStrip) (web/components/ui/tab-strip.tsx:3)

### URL params / deep links
- [ ] `?tab=settings&layer=<organization|access|appearance|models|system|integrations>` — read at mount and applied to the section (web/app/page.tsx:1102, 1141-1142)
- [ ] `layer=` written from the open section on every change; a section change REPLACES the history entry (same tab), a tab change PUSHES (web/app/page.tsx:1243, 1257, 1261-1266)
- [ ] `?tab=integrations` (the link every Slack door hands out) resolves to Settings ▸ Integrations — cold load, popstate and navigate event (web/app/page.tsx:893, 998, 1129, 1282, 1185)
- [ ] Legacy `?settings=<section>` honoured once at mount, then deleted on every URL write (web/app/page.tsx:1130-1132, 1254)
- [ ] Back/forward (popstate) restores tab + section from the URL (web/app/page.tsx:1268-1284)
- [ ] In-app `NAVIGATE_EVENT` / `requestTab("settings"|"integrations")` opens the screen/section (web/app/page.tsx:1170-1197; web/lib/navigate.ts:29)
- [ ] `conn=` is carried through unchanged while on Settings (web/app/page.tsx:1256)

### Empty / error / loading / withheld states
- [ ] Skeleton rows (6) while a lazy section bundle loads (System, Integrations, Access are dynamic imports) — "never a spinner" (web/app/page.tsx:49-60, 69-71)
- [ ] No chrome-level error boundary: Settings renders without an ErrorBoundary wrapper, unlike Operations/Evals/Agent Ops (web/app/page.tsx:2303-2308)

### Loads on open
- [ ] none at chrome level; each section loads its own (see sections)
- [ ] (App-wide, not on open) GET /me/preferences at app load and after each chat turn — syncs theme + look into the shell (web/app/page.tsx:1359-1388 → web/lib/api.ts:45 → pramanyx/routers/preferences.py:18)

**Top rows today:** the section tab strip only (Organization · Access · Appearance · Models · System · Integrations), padded 10px 16px 0, no title row and no toolbar (web/app/page.tsx:609-610); each section draws its own header/figures below it.

## Settings — Organization (`tab=settings&layer=organization`)
_Source: web/components/OrgSettingsPanel.tsx + web/components/OwnersPanel.tsx, mounted at web/app/page.tsx:614-620 (children: web/components/OrgPrioritiesSection.tsx, web/components/OrgIndustriesSection.tsx, web/components/OrgPlaybookSection.tsx → web/components/PlaybookPanel.tsx, web/components/AgentPolicySection.tsx, web/components/OrgByokSection.tsx, web/components/settings/parts.tsx)_

Note: the section rides `?layer=`, not `?settings=` (the old name is still read, then deleted). Several cards render at app scope only — with a workspace selected and the scope set to the workspace, Priorities, Exploration budget, What Pramanyx may do, Industries, Playbook, Outside agents and BYOK disappear (web/components/OrgSettingsPanel.tsx:342, 380, 402, 430, 439, 444).

### Controls
#### Scope (only when a workspace is active)
- [ ] "Scope" switch "App default" — edits the app-wide settings (web/components/OrgSettingsPanel.tsx:297-309)
- [ ] "Scope" switch "<workspace name>" / "This workspace" — edits that workspace's overrides; blank fields inherit; placeholders read "Inherits: <app value>", selects offer "(inherit)" (web/components/OrgSettingsPanel.tsx:300-315, 166-167, 183)
#### Needs you
- [ ] Needs-you row "Link" — scrolls to the Owners card and focuses the first unlinked owner's input (web/components/OrgSettingsPanel.tsx:292-293; web/components/settings/parts.tsx:122-128)
#### Organization card (saved by the one Save)
- [ ] "Company name" text field (web/components/OrgSettingsPanel.tsx:323)
- [ ] "Website" text field (web/components/OrgSettingsPanel.tsx:324)
- [ ] "HQ location" text field (web/components/OrgSettingsPanel.tsx:325)
- [ ] "Industry" text field — a set industry overrides what Pramanyx infers (web/components/OrgSettingsPanel.tsx:326, 328)
#### Localization card (saved by the one Save)
- [ ] "Reporting currency" select — (none)/USD/EUR/GBP/JPY/CNY/INR/AUD/CAD/CHF/SGD/BRL/ZAR (web/components/OrgSettingsPanel.tsx:332, 58)
- [ ] "Timezone" select — (none)/UTC + 12 zones (web/components/OrgSettingsPanel.tsx:333, 60-64)
- [ ] "Date format" select — (none)/YYYY-MM-DD/DD/MM/YYYY/MM/DD/YYYY/DD MMM YYYY (web/components/OrgSettingsPanel.tsx:334, 59)
- [ ] "Fiscal year starts" select — January…December (web/components/OrgSettingsPanel.tsx:335)
#### This quarter's priorities card (app scope; saved by the one Save)
- [ ] "Add a priority" — appends an empty priority row (web/components/OrgPrioritiesSection.tsx:30)
- [ ] Priority row "metric" input (placeholder "return rate") (web/components/OrgPrioritiesSection.tsx:39-42)
- [ ] Priority row "target" input (placeholder "< 8%") (web/components/OrgPrioritiesSection.tsx:43-46)
- [ ] Priority row "good when" select — (unsaid)/up/down (web/components/OrgPrioritiesSection.tsx:47-54)
- [ ] Priority row "by" input (placeholder "Q4") (web/components/OrgPrioritiesSection.tsx:55-58)
- [ ] Priority row "Remove" — drops the row (web/components/OrgPrioritiesSection.tsx:59)
#### Display card (saved by the one Save)
- [ ] "Chart palette" select — "Default" + every named palette (web/components/OrgSettingsPanel.tsx:349)
- [ ] "Open on the conversation" checkbox — land on the chat; the workbench stays one click away (web/components/OrgSettingsPanel.tsx:352-357)
#### Briefing card (saved by the one Save)
- [ ] "Headline metrics per Briefing" numeric input (blank = default; capped at 60) (web/components/OrgSettingsPanel.tsx:365-372)
#### Exploration budget card (app scope; saved by the one Save)
- [ ] "Monthly budget (model tokens)" numeric input (blank = none) (web/components/OrgSettingsPanel.tsx:383-390)
- [ ] "Details" fold — the per-connection budget and Start rules (web/components/OrgSettingsPanel.tsx:394-397; web/components/settings/parts.tsx:62-77)
#### What Pramanyx may do card (app scope; saved by the one Save; the org switches of pramanyx/orgsettings/allows.py:15-22)
- [ ] "Share summary statistics with other installs" checkbox (`share_aggregates`) (web/components/OrgSettingsPanel.tsx:208-209)
- [ ] "Send row text to an outside, cheaper model" checkbox (`outside_row_model`) (web/components/OrgSettingsPanel.tsx:210-211)
- [ ] "Ask for a reason before anyone reads a run's details" checkbox (`reason_to_read_runs`) (web/components/OrgSettingsPanel.tsx:212-213)
- [ ] "Let Pramanyx run model work on its own schedule" checkbox (`scheduled_model_work`) (web/components/OrgSettingsPanel.tsx:214-215)
- [ ] "Read each warehouse's own query history" checkbox (`read_query_history`) (web/components/OrgSettingsPanel.tsx:216-217)
- [ ] "Copy a source's rows into the federation engine for cross-source joins" checkbox (`copy_rows_across_sources`) (web/components/OrgSettingsPanel.tsx:218-219)
#### Save line
- [ ] "Save" — app scope: PUT /org-settings; workspace scope: PUT /workspaces/{id} with only the set fields; then refreshes the app-wide formatter cache; no confirm (web/components/OrgSettingsPanel.tsx:414-416, 133-157)
#### Industries card (app scope; saves itself)
- [ ] "Every industry" radio (web/components/OrgIndustriesSection.tsx:84-87)
- [ ] "Only these" radio — reveals one checkbox per shipped industry package (web/components/OrgIndustriesSection.tsx:88-105)
- [ ] Industry package checkboxes (name; description on hover) (web/components/OrgIndustriesSection.tsx:95-104)
- [ ] "Save industries" — PUT /org-settings/industries; disabled until changed; may drop business profiles that are rebuilt (with a model call) next time their data is used (web/components/OrgIndustriesSection.tsx:118-121, 58-72)
#### Playbook card (app scope)
- [ ] "Show the plays" / "Hide the plays" — expands the embedded Playbook panel (460px) (web/components/OrgPlaybookSection.tsx:77-86)
- [ ] Playbook: "Re-seed from KB" — POST /playbook/seed (force); no confirm; reads "Seeding…" (web/components/PlaybookPanel.tsx:140-151, 95-101)
- [ ] Playbook: rule-outs toggle "N data-quality rule-outs run in the Verifier — not listed" / "N data-quality rule-outs shown" (web/components/PlaybookPanel.tsx:156-167)
- [ ] Playbook: "Search recommendations…" input — matches metric, recommendation, condition, tags (reaches hidden rule-outs) (web/components/PlaybookPanel.tsx:169-174, 110-121)
- [ ] Playbook: status filter chips "all" / "active" / "draft" / "deprecated" (web/components/PlaybookPanel.tsx:175-191)
- [ ] Playbook: entry row — selects/deselects the entry into the right-hand detail (web/components/PlaybookPanel.tsx:207-237)
- [ ] Playbook detail: "Version history" fold (v<current>) — reads the frozen versions on first open (web/components/PlaybookPanel.tsx:386-405)
- [ ] Playbook detail: "Promote to active" — PUT /playbook/{id} status active (web/components/PlaybookPanel.tsx:340-350)
- [ ] Playbook detail: "Deprecate" — PUT /playbook/{id} status deprecated (web/components/PlaybookPanel.tsx:351-361)
- [ ] Playbook detail: "Restore to draft" (deprecated entries) — PUT /playbook/{id} status draft (web/components/PlaybookPanel.tsx:362-370)
#### Outside agents (MCP) card (app scope; saves itself)
- [ ] Agent level radios "Read" / "Run" / "Act" (disabled without `admin.manage_org`) (web/components/AgentPolicySection.tsx:135-147, 28-32)
- [ ] "Connections the agent may touch" input (comma list; blank = all) (web/components/AgentPolicySection.tsx:150-153)
- [ ] "Tools the agent may call" input (comma list; blank = all) (web/components/AgentPolicySection.tsx:154-157)
- [ ] "Save agent policy" — PUT /org-settings/agent-policy (web/components/AgentPolicySection.tsx:166-168)
- [ ] "Return to the default (run)" — DELETE /org-settings/agent-policy; shown only when a policy is saved; no confirm (web/components/AgentPolicySection.tsx:169-173)
#### Models & keys (BYOK) card (app scope AND multi-tenant only; saves itself)
- [ ] "Provider" select — "(deployment default)" + every provider the server lists (web/components/OrgByokSection.tsx:108-118)
- [ ] "API key" password input (write-only; blank keeps the stored key) — only for providers that take a key (web/components/OrgByokSection.tsx:119-133)
- [ ] "Coder model" / "Narrator model" / "Fast model" inputs (blank = backend default) (web/components/OrgByokSection.tsx:134-146, 31-35)
- [ ] "Allow paid models (off = free-tier models only)" checkbox — OpenRouter only (web/components/OrgByokSection.tsx:148-157)
- [ ] "Save models & keys" — PUT /org-settings/llm (web/components/OrgByokSection.tsx:163-165)
- [ ] "Clear (use deployment default)" — DELETE /org-settings/llm; shown when configured; no confirm (web/components/OrgByokSection.tsx:166-170)
#### Owners card (OwnersPanel, below the org panel)
- [ ] Unresolved owner: "Principal for <owner>" input (placeholder "user:ana@corp"); Enter links (web/components/OwnersPanel.tsx:108-115)
- [ ] Unresolved owner: "Link" — PUT /owners/links, then announces the change so the org figure and needs-you re-read (web/components/OwnersPanel.tsx:116, 57-71)
- [ ] Linked owner: "Unlink" — DELETE /owners/links; no confirm (web/components/OwnersPanel.tsx:122-124, 73-84)

### Dialogs, drawers, popovers, panels
- [ ] Settings section tab strip (Organization · Access · Appearance · Models · System · Integrations) — the shell's, above this panel (web/app/page.tsx:596-610)
- [ ] Exploration budget "Details" fold (web/components/OrgSettingsPanel.tsx:394-397)
- [ ] Embedded Playbook panel (list + detail split) inside the Playbook card (web/components/OrgPlaybookSection.tsx:81-86; web/components/PlaybookPanel.tsx:133-260)
- [ ] Playbook detail pane — metric, status, "from KB", condition, Recommendation, Expected impact, Timeline, Owner, Historical success rate, evidence count, tags, Version history, status buttons (web/components/PlaybookPanel.tsx:262-372)
- [ ] Playbook "Version history" fold — each frozen version with its receipt (web/components/PlaybookPanel.tsx:375-410)
- [ ] Playbook status change failure uses a browser alert ("status change failed (<code>)") (web/components/PlaybookPanel.tsx:88)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "Industries" — "—" / "None" / "Every" / "X of Y"; sub "each connection's, detected from its data" / kept names / "no industry package ships" / "none — shared knowledge only" / "not read" (web/components/OrgSettingsPanel.tsx:262-268)
- [ ] Figure "Priorities" — count; sub the metric names or "none set this quarter" (web/components/OrgSettingsPanel.tsx:269-272)
- [ ] Figure "Owners reachable" — "X of Y", amber when any unresolved; sub "N unresolved" / "every owner reachable" / "no declaration names an owner" / "reading…" / "could not be read" (web/components/OrgSettingsPanel.tsx:273-278)
- [ ] Figure "Exploration budget" — compact tokens or "None"; sub "model tokens a month, every connection" / "the Explorer's own runs have no monthly cap" (web/components/OrgSettingsPanel.tsx:279-282)
- [ ] Needs-you row "N owner(s) is/are unresolved" — each owner · where used — "a question for it has nowhere to go" (web/components/OrgSettingsPanel.tsx:288-293)
- [ ] Workspace-scope note "Overrides for <workspace>. Blank fields inherit the app default…" (web/components/OrgSettingsPanel.tsx:310-315)
- [ ] Per-allow amber line "On through this server's environment until you choose here." (web/components/OrgSettingsPanel.tsx:236-240)
- [ ] Card notes — Organization ("Steers briefings, metric recipes and exploration…"), Localization ("Empty = inferred from the data…"), Display ("“Default” follows the light or dark theme."), Briefing ("Empty = the default: 24 while the Briefing reads by area, 12 otherwise. Each one is three warehouse queries per Briefing."), Exploration budget, What Pramanyx may do ("Off unless chosen here…") (web/components/OrgSettingsPanel.tsx:328, 337, 351, 375, 393, 408)
- [ ] Save line — "unsaved changes" chip (amber) when dirty; "Saved ✓"; "Saves everything above" / "Saves <workspace>'s overrides above" (web/components/OrgSettingsPanel.tsx:413-421; web/components/settings/parts.tsx:81-90)
- [ ] Priorities card count (web/components/OrgPrioritiesSection.tsx:29)
- [ ] Industries notes — what the choice means; amber "Ignored, because no package carries it: …"; amber server problem; after save "Saved. N business profiles will be rebuilt the next time their data is used." / "Saved ✓" (web/components/OrgIndustriesSection.tsx:107-122, 64-66)
- [ ] Playbook card header "N plays"; "From your installed industry packages"; chips "N data-quality rule-outs, run by the Verifier" and "N read when a run's numbers match" (web/components/OrgPlaybookSection.tsx:60-76)
- [ ] Playbook list header counts — "N active · N draft · N proven" (web/components/PlaybookPanel.tsx:152-155)
- [ ] Playbook entry row — recommendation (truncated), trigger metric, status chip, success rate (web/components/PlaybookPanel.tsx:219-235)
- [ ] Outside agents header "In force: <level> · set by <who> on <date> / the default — set by nobody; the environment narrowed the …" (web/components/AgentPolicySection.tsx:117-121, 41-50)
- [ ] Outside agents amber line "The server's environment pins … — a saved policy can only be narrower than that, never wider." (web/components/AgentPolicySection.tsx:125-133)
- [ ] BYOK header — "this organisation's own · <provider>" / "the deployment's binding" (web/components/OrgByokSection.tsx:104-106)
- [ ] BYOK key chip — "set ✓" / "stored, unreadable" / "not set" (web/components/OrgByokSection.tsx:121)
- [ ] Owners card header "N owners in use" (web/components/OwnersPanel.tsx:92)
- [ ] Owner row — owner text, where used ("N metrics · N glossary terms…" / "not used by any declaration"), "unresolved" chip (amber) or principal chip + "linked by <who>" / "as written" (web/components/OwnersPanel.tsx:101-126, 28-33)

### Keyboard shortcuts
- [ ] Enter in an owner's principal input links it (web/components/OwnersPanel.tsx:112)

### URL params / deep links
- [ ] `?tab=settings&layer=organization` — opens this section; Organization is also the default section (web/app/page.tsx:1083, 1102, 939)
- [ ] Shell writes `layer=organization` back as the section changes (web/app/page.tsx:1243, 1257)
- [ ] Legacy `?settings=organization` is still read on load, then deleted from the address (web/app/page.tsx:1131-1132, 1254)
- [ ] In-page anchors (not URL): `#settings-owners` card id used by the needs-you "Link" scroll (web/components/OwnersPanel.tsx:90; web/components/OrgSettingsPanel.tsx:293)

### Empty / error / loading / withheld states
- [ ] "Loading settings…" — while the settings read (web/components/OrgSettingsPanel.tsx:246)
- [ ] "Failed to load settings" / "Failed to save settings" (or the server's words) — in the Save line (web/components/OrgSettingsPanel.tsx:108, 153, 413)
- [ ] "Nothing needs you · every owner the declarations name is reachable" (web/components/OrgSettingsPanel.tsx:287)
- [ ] "Nothing needs you that could be read · the owners could not be read" (web/components/OrgSettingsPanel.tsx:286)
- [ ] BYOK card hidden (not disabled) on a single-tenant install or when capabilities cannot be read (web/components/OrgSettingsPanel.tsx:116-120, 444)
- [ ] "A finding that bears on a priority ranks higher, and the Briefing says which goal it bears on." — no priorities (web/components/OrgPrioritiesSection.tsx:32-34)
- [ ] Industries: "Failed to load the industry choice" in red instead of the card; card absent when no package ships (web/components/OrgIndustriesSection.tsx:49-53)
- [ ] Industries: "No industry package: every connection uses only the knowledge all industries share." (web/components/OrgIndustriesSection.tsx:110-111)
- [ ] Playbook card says nothing (no count) when /playbook cannot be read — never "0 plays" (web/components/OrgPlaybookSection.tsx:49-53)
- [ ] Playbook: "No playbook entries yet. Click \"Re-seed from KB\" to generate." / "No entries match." (web/components/PlaybookPanel.tsx:202-205)
- [ ] Playbook: skeleton rows while loading; a failed read is swallowed and shows the empty copy (web/components/PlaybookPanel.tsx:194-201, 62-69)
- [ ] Playbook detail: "Select an entry to view and edit" (web/components/PlaybookPanel.tsx:245-247)
- [ ] Playbook: "No data yet" success rate; "Loading versions…"; "No frozen versions yet." (a failed versions read also lands here) (web/components/PlaybookPanel.tsx:313, 398-399, 104)
- [ ] Outside agents: "Could not read the agent policy" / "Could not save…" / "Could not clear…" (web/components/AgentPolicySection.tsx:75, 94, 106)
- [ ] Outside agents locked: "Changing this needs the admin.manage_org permission; the policy in force is shown above." (web/components/AgentPolicySection.tsx:160-164)
- [ ] BYOK: "Failed to load model settings" / "Failed to save…" / "Failed to clear…"; key placeholder "re-paste — the stored key cannot be decrypted" (web/components/OrgByokSection.tsx:55, 77, 89, 127)
- [ ] Owners: "Reading the declarations…" / "No declaration names an owner yet." / red error line (web/components/OwnersPanel.tsx:96-97, 129)

### Loads on open
- [ ] GET /org-settings — the app settings (re-read on every scope switch and after Save) (web/lib/api.ts:233 → pramanyx/routers/orgsettings.py:23)
- [ ] GET /org-settings/allows — each allow's answer and whether set (web/lib/api.ts:224 → pramanyx/routers/orgsettings.py:29)
- [ ] GET /workspaces/{id} — workspace scope only, the override (web/lib/api.ts:178 → pramanyx/routers/workspace.py:68)
- [ ] GET /capabilities — multi-tenant? (shows BYOK) (web/lib/api.ts:93 → pramanyx/routers/system.py:206)
- [ ] GET /owners — read TWICE: once by OrgSettingsPanel for the figure/needs-you, once by OwnersPanel; both re-read on every link/unlink (web/components/OrgSettingsPanel.tsx:122-131; web/components/OwnersPanel.tsx:42-55; web/lib/api.ts:3934 → pramanyx/routers/owners.py:37)
- [ ] GET /org-settings/industries (web/lib/api.ts:272 → pramanyx/routers/orgsettings.py:106)
- [ ] GET /playbook — the count, raw fetch; a second GET /playbook when "Show the plays" mounts PlaybookPanel (web/components/OrgPlaybookSection.tsx:41; web/components/PlaybookPanel.tsx:65 → pramanyx/routers/metrics.py:1437)
- [ ] GET /org-settings/agent-policy + GET /rbac/me (web/lib/api.ts:4971, 9786 → pramanyx/routers/orgsettings.py:222, pramanyx/routers/roles.py:49)
- [ ] GET /org-settings/llm — multi-tenant only (web/lib/api.ts:314 → pramanyx/routers/orgsettings.py:158)
- [ ] On version-history open: GET /playbook/{id}/versions (web/lib/api.ts:9693 → pramanyx/routers/metrics.py:1452)
- [ ] After Save: GET /org-settings/effective (formatter cache) (web/lib/api.ts:529 → pramanyx/routers/orgsettings.py:137)
- [ ] Writes on action only — PUT /org-settings (orgsettings.py:38), PUT /workspaces/{id} (workspace.py:77), PUT /org-settings/industries (orgsettings.py:113; may drop business profiles, rebuilt later with a model call), POST /playbook/seed (metrics.py:1502), PUT /playbook/{id} (metrics.py:1473), PUT/DELETE /org-settings/agent-policy (orgsettings.py:229, 244), PUT/DELETE /org-settings/llm (orgsettings.py:167, 180; gated SECURITY_SUITE), PUT/DELETE /owners/links (owners.py). Nothing writes or spends on open.

**Top rows today:** no toolbar; the shell's settings section tab strip sits above (web/app/page.tsx:609). The panel opens on the four-figure row (Industries · Priorities · Owners reachable · Exploration budget), then the Needs-you block, then — only with a workspace active — the "Scope: App default | <workspace>" switch. The one "Save" is at the BOTTOM of the form cards (after What Pramanyx may do), not in a top row; Industries, Outside agents, BYOK and Owners each save in their own card.

## Settings — Access (`tab=settings&layer=access`)
_Source: web/components/RolesPanel.tsx, mounted at web/app/page.tsx:626 (+ web/components/settings/parts.tsx)_

Note: every write control here appears only with `admin.manage_roles` (`canManage`); without it the page is read-only and says so. None of the destructive row actions (Revoke, Delete group, remove member ×, revoke grant ×) asks for confirmation.

### Controls
#### Needs you
- [ ] Needs-you row "Add members" (per empty function group) — opens that group, scrolls to Groups, and (for a manager) opens the New member dialog (web/components/RolesPanel.tsx:297-301, 261-266)
#### Roles card
- [ ] Per-role "<N> permissions" fold — lists the role's permission ids (web/components/RolesPanel.tsx:315-317)
- [ ] "Your permissions · N" fold — lists the caller's permission ids (web/components/RolesPanel.tsx:320-328)
#### Groups card
- [ ] "Create group" (+) — opens the New function group dialog (manager only) (web/components/RolesPanel.tsx:332-334)
- [ ] Group row "Open" / "Close" — expands members and grants (reads both on open) (web/components/RolesPanel.tsx:356-360, 126-134)
- [ ] Group row "Delete" — DELETE /groups/{id}, removes its memberships and grants; no confirm (manager only) (web/components/RolesPanel.tsx:361-364, 221-227)
- [ ] Open group: member chip "×" — remove that member (DELETE /groups/{id}/members); no confirm (manager only) (web/components/RolesPanel.tsx:379-382, 229-236)
- [ ] Open group: "Add member" (+) — opens the New member dialog (manager only) (web/components/RolesPanel.tsx:385-389)
- [ ] Open group: grant chip "×" — revoke that grant (DELETE /access/grants); no confirm (manager only) (web/components/RolesPanel.tsx:402-405, 238-243)
- [ ] Open group: "Add a grant" (+) — opens the New grant dialog (manager only) (web/components/RolesPanel.tsx:408-411)
#### New function group dialog
- [ ] "Group id" input (placeholder "new group id (e.g. supply-chain)"), lower-cased on save; Enter submits (web/components/RolesPanel.tsx:432-434, 137)
- [ ] Channel select — "no channel yet" + every action trigger (web/components/RolesPanel.tsx:435-438)
- [ ] "Cancel" / "Create group" — POST /groups (web/components/RolesPanel.tsx:441-442, 136-145)
#### New member dialog
- [ ] Principal input (placeholder "user:alice@acme.com or agent:ua_…"); Enter submits (web/components/RolesPanel.tsx:450-452)
- [ ] "Cancel" / "Add member" — POST /groups/{id}/members (web/components/RolesPanel.tsx:454-455, 152-164)
#### New grant dialog
- [ ] "Securable" input (placeholder "securable (e.g. domain:supply-chain, promise:dispatch-24h)"); Enter submits (web/components/RolesPanel.tsx:465-467)
- [ ] "Level" select — the server's ladder (default "subscribe") (web/components/RolesPanel.tsx:468-470, 71)
- [ ] "Cancel" / "Grant" — POST /access/grants for `group:<id>` (web/components/RolesPanel.tsx:473-474, 171-184)
#### Role assignments card
- [ ] "Assign a role" (+) — opens the Assign a role dialog (manager only) (web/components/RolesPanel.tsx:499-501)
- [ ] Assignment row "Revoke" — DELETE /rbac/assignments for that user+role; no confirm (web/components/RolesPanel.tsx:515-516, 213-219)
#### Assign a role dialog
- [ ] "User id" input (placeholder "user id (e.g. alice@acme.com)"); Enter submits (web/components/RolesPanel.tsx:484-486)
- [ ] "Role" select — every built-in role by display name (default "viewer") (web/components/RolesPanel.tsx:487-489, 55)
- [ ] "Cancel" / "Assign" — POST /rbac/assignments (web/components/RolesPanel.tsx:492-493, 195-206)
#### Page
- [ ] "Retry" on a failed load (web/components/RolesPanel.tsx:246)

### Dialogs, drawers, popovers, panels
- [ ] Settings section tab strip (the shell's) above this panel (web/app/page.tsx:609)
- [ ] "New function group" dialog (560px; "A function group carries members, a channel and its grants.") — id, channel, refusal line (web/components/RolesPanel.tsx:428-444)
- [ ] "New member of <group>" dialog (560px) — principal, refusal line (web/components/RolesPanel.tsx:447-457)
- [ ] "New grant for <group>" dialog (640px) — securable, level, refusal line (web/components/RolesPanel.tsx:461-476)
- [ ] "Assign a role" dialog (560px) — user id, role, refusal line (web/components/RolesPanel.tsx:480-495)
- [ ] Group expansion — Members row and Grants row (web/components/RolesPanel.tsx:367-415)
- [ ] Permission folds (Details) per role and for "Your permissions" (web/components/RolesPanel.tsx:315, 322; web/components/settings/parts.tsx:62-77)
- [ ] Dialogs hold Escape/scrim/close while busy (FormDialog `busy`) (web/components/RolesPanel.tsx:428, 447, 461, 480)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "You" — your role names (or "No role"); sub user id / actor · "not signed in" · org; hover "Recorded as <actor> · org <id>" (web/components/RolesPanel.tsx:272-276)
- [ ] Figure "Role assignments" — count or "—"; sub "N <role> · …" / "visible to role administrators" / "the first identified user becomes Owner" (web/components/RolesPanel.tsx:277-280)
- [ ] Figure "Function groups" — count; sub "plus N built-in groups" (web/components/RolesPanel.tsx:281-282)
- [ ] Figure "Calls attributed" — % of recorded calls carrying a user, amber when none; sub "of N recorded calls" / "no calls recorded yet" / "not measured" (web/components/RolesPanel.tsx:283-285)
- [ ] Needs-you row "No recorded call carries a user" — "Identity is configured, but nothing has authenticated yet." / "Attribution starts once OIDC is configured and callers present tokens." (web/components/RolesPanel.tsx:290-296)
- [ ] Needs-you row "<group> has no members" (web/components/RolesPanel.tsx:297-301)
- [ ] Roles card row — role display name, "you" chip, description, "held by N" (managers only) (web/components/RolesPanel.tsx:307-314)
- [ ] Permission id chips (mono) (web/components/RolesPanel.tsx:316, 324)
- [ ] Groups card "Built-in, on everything:" chips "<name> · <default level>" (web/components/RolesPanel.tsx:337-342)
- [ ] Group row — name, `group:<id>`, "→ <channel trigger>" / "no channel", "N members" (web/components/RolesPanel.tsx:349-354)
- [ ] Open group — member principal chips; grant chips "<level> · <securable>" (web/components/RolesPanel.tsx:376-407)
- [ ] Role assignments row — user id + role chip (web/components/RolesPanel.tsx:511-517)
- [ ] "Users · measured" card — header "N users"; row user id, role chips, "N calls · $X.XX" ("+" when cost incomplete) (web/components/RolesPanel.tsx:529-543)
- [ ] Attribution footnote "X% of N calls attributed · N carry no user and are not shown as a blank cohort" (web/components/RolesPanel.tsx:544-549)

### Keyboard shortcuts
- [ ] Enter submits each dialog's text field (Group id, member principal, securable, user id) (web/components/RolesPanel.tsx:434, 452, 467, 486)

### URL params / deep links
- [ ] `?tab=settings&layer=access` — opens this section (web/app/page.tsx:939, 1102)
- [ ] Shell writes `layer=access` back on section change (web/app/page.tsx:1243, 1257)
- [ ] Legacy `?settings=access` read then deleted (web/app/page.tsx:1131-1132, 1254)
- [ ] In-page anchor (not URL): `#access-groups`, the needs-you "Add members" scroll target (web/components/RolesPanel.tsx:331, 263)

### Empty / error / loading / withheld states
- [ ] "Loading roles…" (web/components/RolesPanel.tsx:245)
- [ ] "Could not read the roles and groups — <server reason>." + Retry — any of the five opening reads failed (no read-only fallback) (web/components/RolesPanel.tsx:246, 94-114)
- [ ] "Nothing needs you · every call carries a person and every group has members" (web/components/RolesPanel.tsx:288)
- [ ] "visible to role administrators" — members, grants and the assignments figure when the caller may not see them (web/components/RolesPanel.tsx:279, 373, 396)
- [ ] "none yet" — a group with no members / no grants (web/components/RolesPanel.tsx:375, 398)
- [ ] "No function groups yet — an owner creates them, and each carries members, a channel and its grants." — non-managers with no groups (web/components/RolesPanel.tsx:419-421)
- [ ] "Managing roles needs the admin.manage_roles permission — ask an Owner to grant it." (web/components/RolesPanel.tsx:502-505)
- [ ] "No explicit assignments yet — the org's first identified user becomes Owner automatically." (web/components/RolesPanel.tsx:520)
- [ ] "No identified users yet — the ledger and the role table are both empty of names." (web/components/RolesPanel.tsx:532)
- [ ] Refusal lines (the server's own reason, "The change was refused" fallback) in the card or dialog the write came from (web/components/RolesPanel.tsx:36-45, 335, 430, 449, 463, 482, 508)

### Loads on open
- [ ] GET /rbac/me — who you are, roles, permissions (web/lib/api.ts:9786 → pramanyx/routers/roles.py:49)
- [ ] GET /rbac/roles — the role catalogue (web/lib/api.ts:9793 → pramanyx/routers/roles.py:37)
- [ ] GET /admin/users — users measured from the ledger (scans up to 5,000 ledger rows by default) (web/lib/api.ts:10726 → pramanyx/routers/admin.py:22)
- [ ] GET /groups — built-in + function groups + the level ladder (web/lib/api.ts:9851 → pramanyx/routers/groups.py:68)
- [ ] GET /actions/triggers — channel names (web/lib/api.ts:7468 → pramanyx/routers/actions.py:103)
- [ ] GET /rbac/assignments — only when you hold `admin.manage_roles` (web/lib/api.ts:9801 → pramanyx/routers/roles.py:67)
- [ ] GET /groups/{id}/members once PER function group — member counts (N+1 reads) (web/components/RolesPanel.tsx:87-92; web/lib/api.ts:9872 → pramanyx/routers/groups.py:112)
- [ ] On group "Open": GET /groups/{id}/members + GET /access/grants?principal=group:<id> (web/lib/api.ts:9896 → pramanyx/routers/groups.py:140)
- [ ] Writes on action only — POST /rbac/assignments (roles.py:78), DELETE /rbac/assignments (roles.py:91), POST /groups (groups.py:85), DELETE /groups/{id} (groups.py:96), POST/DELETE /groups/{id}/members (groups.py:120, 132), POST/DELETE /access/grants (groups.py:152, 171). Nothing writes or spends on open.

**Top rows today:** no toolbar; the shell's settings section tab strip sits above (web/app/page.tsx:609). The panel opens on the four-figure row (You · Role assignments · Function groups · Calls attributed), then Needs you. Actions live in card headers further down: "Create group" (Groups card) and "Assign a role" (Role assignments card), both manager-only.

## Settings — Appearance
_Source: web/components/settings/AppearancePanel.tsx (+ web/components/LookPanel.tsx, web/components/settings/parts.tsx, web/lib/look.ts, web/lib/lookValues.ts; theme setter web/app/page.tsx:1399-1406)_

### Controls
- [ ] Theme card, radio "Dark — Dark backgrounds, light text" — sets theme dark (html data-theme, localStorage, PUT /me/preferences/theme) (web/components/settings/AppearancePanel.tsx:19, 32; web/app/page.tsx:1399-1405)
- [ ] Theme card, radio "Light — White backgrounds, dark text" — sets theme light, same path (web/components/settings/AppearancePanel.tsx:20, 32)
- [ ] Look card header button "Back to the default" — shown only when any knob differs from default; resets all seven knobs (web/components/LookPanel.tsx:95)
- [ ] Preset radio "Pramanyx" (hover: "Blue · slate · small corners · 100% · Inter · 36px rows — the default") — sets all knobs at once (web/components/LookPanel.tsx:37, 97-107)
- [ ] Preset radio "Workbench" (hover: "Blue · slate · small corners · 95% · Source Sans · compact rows — a denser look") (web/components/LookPanel.tsx:38, 97-107)
- [ ] Accent swatches (26 radios: gray, gold, bronze, brown, yellow, amber, orange, tomato, red, ruby, crimson, pink, plum, purple, violet, iris, indigo, blue, cyan, teal, jade, green, grass, lime, mint, sky), each with a name tooltip (web/components/LookPanel.tsx:109-111; web/lib/lookValues.ts:6-10)
- [ ] Grey swatches (6 radios: gray, mauve, slate, sage, olive, sand; "gray" drawn desaturated) (web/components/LookPanel.tsx:112-114; web/lib/lookValues.ts:11)
- [ ] Corners segmented: Square · Small · Medium · Large · Round (web/components/LookPanel.tsx:115-120)
- [ ] Scaling segmented: 90% · 95% · 100% · 105% · 110% (web/components/LookPanel.tsx:121-126; web/lib/lookValues.ts:13)
- [ ] Edges segmented: Off · On (web/components/LookPanel.tsx:127-132)
- [ ] Typeface segmented: Inter · Source Sans (web/components/LookPanel.tsx:133-138)
- [ ] Rows segmented: Compact · Default · Comfortable (32 / 36 / 44 px at 100%) (web/components/LookPanel.tsx:139-144; web/lib/look.ts ROW_PX)
- [ ] Every knob change writes this browser's copy at once and PUTs /me/preferences/<knob> fire-and-forget (web/components/LookPanel.tsx:49-55)

### Dialogs, drawers, popovers, panels
- [ ] Tooltip on each swatch (colour name) and on each preset (what it sets) (web/components/LookPanel.tsx:65, 100)

### Figures, counts, badges, status chips, freshness
- [ ] Selected theme marked with a check glyph and blue outline (web/components/settings/AppearancePanel.tsx:44)
- [ ] Selected preset drawn "secondary" only when the look matches a preset exactly (web/components/LookPanel.tsx:43-45, 101)
- [ ] Footnote "Kept for you, in this browser and wherever you sign in. Charts keep their own colours." (web/components/LookPanel.tsx:146-148)

### Keyboard shortcuts
- [ ] Radix SegmentedControl arrow-key movement within each knob (web/components/LookPanel.tsx:116-143)
- none page-specific beyond that

### URL params / deep links
- [ ] `?tab=settings&layer=appearance` opens this section (web/app/page.tsx:1102)

### Empty / error / loading / withheld states
- [ ] Preference write failures are swallowed silently (theme and look stay applied in this browser; nothing says the store refused) (web/app/page.tsx:1405; web/components/LookPanel.tsx:53)
- none rendered

### Loads on open
- [ ] none on open — reads the in-memory/localStorage look (`useLook`) and the shell's theme; the shell's GET /me/preferences at app load is what fills them (web/lib/look.ts getLook/useLook; web/app/page.tsx:1365-1380 → pramanyx/routers/preferences.py:18)
- [ ] Writes on change only: PUT /me/preferences/{key} (web/lib/api.ts:51 → pramanyx/routers/preferences.py:28)

**Top rows today:** no header or toolbar; the section opens straight onto two cards side by side — "Theme" (Dark / Light) and "Look" (with "Back to the default" at the Look card's top right) (web/components/settings/AppearancePanel.tsx:26-51; web/components/LookPanel.tsx:94-95).

## Settings — Models
_Source: web/components/InferencePanel.tsx (+ ProviderDialog/ProviderForm/RemoveProvider, ModelField, CatalogFooter in the same file; web/components/settings/parts.tsx ToolsMenu/goTo)_

### Controls
- [ ] Needs-you "Paste a key" — scrolls to the Provider card and focuses the API key field (web/components/InferencePanel.tsx:724)
- [ ] Needs-you "Re-paste" (built-in provider key unreadable) — focuses the API key field (web/components/InferencePanel.tsx:729)
- [ ] Needs-you "Re-paste" (added provider key unreadable) — opens the Edit provider dialog (web/components/InferencePanel.tsx:734)
- [ ] Needs-you "Choose" (a role has no model) — focuses the first empty role's model field (web/components/InferencePanel.tsx:741)
- [ ] Needs-you "Choose" (fallback has no model) — focuses the fallback model field (web/components/InferencePanel.tsx:746)
- [ ] Needs-you "Open Spend" (a bound model has no price) — `requestTab("spend")` (web/components/InferencePanel.tsx:761)
- [ ] Provider card: "Provider" select — every backend incl. added ones; switching restores that backend's remembered role models and JSON pins (web/components/InferencePanel.tsx:868-873, 604-618)
- [ ] Provider card: "API key" password field (hosted backends) — write-only; blank keeps the stored key (web/components/InferencePanel.tsx:877-891)
- [ ] Provider card: added provider's Base URL readout + "Edit" — opens the Edit provider dialog (web/components/InferencePanel.tsx:895-904)
- [ ] Provider card: "Base URL" field (local backends, e.g. Ollama/LM Studio) (web/components/InferencePanel.tsx:908-917)
- [ ] Role model field "Coder · SQL & reasoning" — free text with the provider's catalogue as datalist suggestions (web/components/InferencePanel.tsx:930-944, 39-45)
- [ ] Role model field "Narrator · report prose" (web/components/InferencePanel.tsx:930-944)
- [ ] Role model field "Fast · per-phase interprets" (web/components/InferencePanel.tsx:930-944)
- [ ] "+ Keep" beside a model field — pins a typed id into this backend's list (POST /llm/models) (web/components/InferencePanel.tsx:161-171, 538-544)
- [ ] Catalogue footer toggle "<n> free — show paid" / "all <n> — hide paid" (OpenRouter only; free-only by default) (web/components/InferencePanel.tsx:215-222)
- [ ] Catalogue footer "Refresh" — re-fetches the provider's live model list (web/components/InferencePanel.tsx:223-225, 953)
- [ ] Custom model chip "×" — removes a kept id from the list (DELETE /llm/models) (web/components/InferencePanel.tsx:239-257, 546-552)
- [ ] "Use JSON structured output for <model>" checkbox per bound model (only for backends that honour the pin) (web/components/InferencePanel.tsx:959-977)
- [ ] Fallback card: "Provider" select — "Built-in order (try each configured provider)", "No fallback — fail on the primary", or one other backend (suffix " — no key set") (web/components/InferencePanel.tsx:989-1004)
- [ ] Fallback card: "Model" field with the fallback provider's own catalogue as suggestions (web/components/InferencePanel.tsx:1006-1019)
- [ ] Paid-model acknowledgment checkbox "Bind it/them anyway — I accept the charges" (OpenRouter non-`:free` role or fallback model) (web/components/InferencePanel.tsx:1040-1058)
- [ ] "Save" — POST /llm/config with provider, role models, base URL, typed keys, fallback, paid ack, JSON pins; disabled until the paid ack is ticked when needed (web/components/InferencePanel.tsx:1060-1067, 632-660)
- [ ] "Tools" menu (web/components/InferencePanel.tsx:1068-1074; web/components/settings/parts.tsx:102-118)
- [ ] Tools ▸ "Test connection" — real completions against every distinct model on the form, saved or not (SPENDS on click) (web/components/InferencePanel.tsx:1069, 662-672)
- [ ] Tools ▸ "Measure prefix cache" — a handful of real completions on the coder model; persists the verdict and reloads the chips (SPENDS + WRITES on click) (web/components/InferencePanel.tsx:1071-1073, 674-684)
- [ ] Added providers card "Add a provider" — opens the provider dialog in add mode (web/components/InferencePanel.tsx:1087-1088)
- [ ] Added provider row "Edit" — opens the dialog in edit mode (web/components/InferencePanel.tsx:1104)
- [ ] Added provider row "Remove" (destructive) — opens the dialog in remove mode (web/components/InferencePanel.tsx:1105-1106)
- [ ] Dialog (add/edit): "Name" field — "fixed once added" (disabled on edit) (web/components/InferencePanel.tsx:329-332)
- [ ] Dialog (add/edit): "Base URL" field (web/components/InferencePanel.tsx:333-336)
- [ ] Dialog (add/edit): "API key" password field with key-state chip; blank keeps the stored key (web/components/InferencePanel.tsx:338-345)
- [ ] Dialog (edit): checkbox "Remove the stored key — this endpoint takes none" (web/components/InferencePanel.tsx:346-352)
- [ ] Dialog (add/edit): "Models" textarea — "optional, one per line" (web/components/InferencePanel.tsx:353-356)
- [ ] Dialog (add/edit): "Cancel" / "Add provider" or "Save changes" — saved at once (POST or PUT /llm/providers) (web/components/InferencePanel.tsx:361-367, 309-323)
- [ ] Dialog (remove): "Cancel" / "Remove <name>" — DELETE /llm/providers/{id}; says first what it will clear (web/components/InferencePanel.tsx:398-415)

### Dialogs, drawers, popovers, panels
- [ ] Provider dialog (FormDialog, 600px) titled "Add a provider" / "Edit <name>" / "Remove <name>?"; add mode description "An OpenAI-compatible endpoint, chosen afterwards for the roles or as the fallback."; Escape/scrim held while saving (web/components/InferencePanel.tsx:419-442; web/components/ui/dialog.tsx:64-79)
- [ ] Remove confirmation body: what it clears (the binding every role runs on; the fallback), then "Its key and its listed models are deleted…" (web/components/InferencePanel.tsx:383-406)
- [ ] Tools dropdown menu (Test connection, Measure prefix cache) (web/components/settings/parts.tsx:102-118)
- [ ] Browser datalist suggestion popup on each model field (label · ctx · free/paid) (web/components/InferencePanel.tsx:196-204)
- [ ] Test result panel (green/red, per model: ✓/✗ model · used by roles · ms · error) (web/components/InferencePanel.tsx:765-796)
- [ ] Prefix-cache probe result panel (verdict headline, warm vs cold ms, ratio, recorded cache_mode) (web/components/InferencePanel.tsx:799-825)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "Provider" — the in-force provider; sub: added provider's host / "runs on this machine" / chip "no key" or "key unreadable"; privacy chip "prompts leave this machine" (hover: what leaves) / "On-device" / "Private endpoint" (web/components/InferencePanel.tsx:830-837)
- [ ] Figure "Roles bound" — "<n> of 3", amber when any empty; sub the distinct bound models or "no model bound" (web/components/InferencePanel.tsx:838-840)
- [ ] Figure "Fallback" — first link "+N", hover "Tried in order: …"; sub fallback model / "then …" / "the built-in order" / "a failing primary fails the call"; chip "set by the environment" (web/components/InferencePanel.tsx:841-851)
- [ ] Figure "Keys" — "<usable> of <keyed>"; sub chip "<n> keys unreadable" or "providers with a usable key" (web/components/InferencePanel.tsx:852-855)
- [ ] Needs-you row "<provider> has no API key" — "Every call to it fails until a key is pasted." (web/components/InferencePanel.tsx:721-725)
- [ ] Needs-you row "<provider>'s stored key cannot be decrypted" — PRAMANYX_SECRET_KEY missing/changed (built-in and added variants) (web/components/InferencePanel.tsx:726-736)
- [ ] Needs-you row "<n> roles have no model · Coder, …" — "Nothing is assumed: a blank role fails its calls, saying so." (web/components/InferencePanel.tsx:737-742)
- [ ] Needs-you row "The fallback, <X>, has no model" — "this link is skipped" (web/components/InferencePanel.tsx:743-747)
- [ ] Needs-you row "The fallback provider(s) have no usable key · …" (web/components/InferencePanel.tsx:748-752)
- [ ] Needs-you row "The primary is spent — calls are landing on the fallback" + "Answering on A → B." (web/components/InferencePanel.tsx:753-756)
- [ ] Needs-you row "<model> has no price" / "<n> bound models have no price" with "<n> calls unpriced — its spend is unknown, not zero" (web/components/InferencePanel.tsx:757-762, 264-272)
- [ ] API key state chip "configured" / "stored, but unreadable" / "not set" (web/components/InferencePanel.tsx:879-880)
- [ ] Added provider key chip "key set" / "no key" / "key unreadable" (web/components/InferencePanel.tsx:277-281, 896-897)
- [ ] Capability chips per role (or once as "Every role:"): privacy class, context window ("1M ctx" / "128k ctx"), prefix-cache mode, "tools", cost "$/token" or "free", "unsaved" (typed but not saved), "est. tokens" — each with a hover explanation (web/components/InferencePanel.tsx:84-126, 943-946)
- [ ] Catalogue line "<n> models from <provider>" / "no live list" / "no models — this list comes from the provider" · "<n> custom" (web/components/InferencePanel.tsx:206-214)
- [ ] Added provider row chips "in use", "fallback", key state, "<n> models" (hover lists them) (web/components/InferencePanel.tsx:1100-1103)
- [ ] "✓ Saved" for 2.5s after Save; "Testing…" / "Measuring…" while a tool runs (web/components/InferencePanel.tsx:1075-1076, 655)
- [ ] Removal note "<name> is removed. <what the server said it cleared>" (web/components/InferencePanel.tsx:1109-1113)

### Keyboard shortcuts
- [ ] Escape closes the provider dialog (held while it is saving) (web/components/ui/dialog.tsx:67-78)
- none page-specific beyond that

### URL params / deep links
- [ ] `?tab=settings&layer=models` opens this section (web/app/page.tsx:1102)
- [ ] Writes none; "Open Spend" navigates out via `requestTab("spend")` (web/components/InferencePanel.tsx:761)
- [ ] In-page anchors used by Needs-you buttons: `#models-provider`, `#models-fallback`, `#models-added`, `#llm-key`, `#llm-model-<role>`, `#llm-fallback-model` (web/components/InferencePanel.tsx:865, 986, 1085; web/components/settings/parts.tsx:122-128)

### Empty / error / loading / withheld states
- [ ] "Loading the model settings…" — before the config arrives (web/components/InferencePanel.tsx:555)
- [ ] "Could not read the model settings — <error>." + Retry — config read failed (web/components/InferencePanel.tsx:554)
- [ ] "Could not re-read the settings: <error>" — a reload after a probe failed (web/components/InferencePanel.tsx:1077)
- [ ] "Couldn't reach <provider> for its model list (<error>). Type a model id directly, or Refresh to retry." — live catalogue failed (web/components/InferencePanel.tsx:232-237)
- [ ] "Nothing needs you · every role has a model and the provider a key" — nothing owed (web/components/InferencePanel.tsx:860)
- [ ] "Nothing needs you · prices not checked (the usage ledger could not be read)" — withheld said when /usage failed (web/components/InferencePanel.tsx:859)
- [ ] Added providers empty: "None yet. Any endpoint that speaks the OpenAI API can be added — Azure OpenAI, Mistral, DeepSeek, xAI, Fireworks, your own vLLM…" (web/components/InferencePanel.tsx:1089-1093)
- [ ] Dialog refusal: the server's own reason in a red alert (web/components/InferencePanel.tsx:284-288)
- [ ] Key notes: "Stored encrypted on the server (secretvault). Save before testing a new key." / "A key is stored but cannot be decrypted — PRAMANYX_SECRET_KEY is missing or has changed…" (web/components/InferencePanel.tsx:920-926)
- [ ] "Any model id works — the list is what this provider serves. A blank role fails its calls, saying so." (web/components/InferencePanel.tsx:957)
- [ ] Fallback notes: "One model for every role; without one this link is skipped." / "No fallback — a failing primary fails the call." / "Agents in Agent Ops inherit this…" (web/components/InferencePanel.tsx:1021-1027)
- [ ] Env pin note: "PRAMANYX_FALLBACK_BACKENDS is set in the environment and overrides the choice above…" (web/components/InferencePanel.tsx:1028-1033)
- [ ] Paid warning: "<model> is a paid model — every paid call bills your OpenRouter credit (:free models are the default)." (web/components/InferencePanel.tsx:1046-1051)
- [ ] Save disabled hover: "A paid model is bound — tick the acknowledgment above to save" (web/components/InferencePanel.tsx:1063-1065)
- [ ] Test failure "✗ <error or 'test failed'>"; probe failure "✗ <error or 'probe failed'>" (web/components/InferencePanel.tsx:794, 806)

### Loads on open
- [ ] GET /llm/config — the saved binding, keys state, capabilities, fallback chain, added providers (web/lib/api.ts:8903 → pramanyx/routers/llm.py:21)
- [ ] GET /usage?by=provider,model — only to name bound models with no price; asks the provider's price catalogue at most hourly (outbound fetch, in-memory, no write, no model spend) (web/lib/api.ts:12115 → pramanyx/routers/governance.py:22, 49; pramanyx/obs/usage.py:223)
- [ ] GET /llm/models?backend=<selected> — live model list fetched from the provider (outbound call, cached in memory; no write, no spend) (web/lib/api.ts:8930 → pramanyx/routers/llm.py:135)
- [ ] GET /llm/models?backend=<fallback> — when a fallback provider is chosen (web/components/InferencePanel.tsx:514-521)
- [ ] On click only: POST /llm/config (llm.py:45), POST /llm/config/test (SPENDS: real completions, llm.py:116), POST /llm/config/cache-probe (SPENDS + persists verdict, llm.py:188), POST|DELETE /llm/models (llm.py:153, 170), POST /llm/providers (llm.py:73), PUT|DELETE /llm/providers/{id} (llm.py:88, 98) (web/lib/api.ts:8855-9022)

**Top rows today:** no header or toolbar; the section opens on the Figures row (Provider · Roles bound · Fallback · Keys) then the "Needs you" card. Save and the Tools menu sit mid-page under the Provider/Fallback cards; "Add a provider" is at the Added providers card's top right (web/components/InferencePanel.tsx:829-862, 1059-1074, 1087).

## Settings — System
_Source: web/components/SystemPanel.tsx (+ Backend, FeatureFlags, FlagRow, GraduationEvidence in the same file; web/components/PacksManager.tsx with PackDeploy; web/components/PackInstalls.tsx with UpgradeDiff)_

### Controls
- [ ] "Reset counters" — zeroes the in-process stats (POST /dev/stats/reset), then re-reads (web/components/SystemPanel.tsx:254-260, 211-216)
- [ ] Backend: "Backend URL" field — where this browser sends every request (per-browser setting) (web/components/SystemPanel.tsx:150-158)
- [ ] Backend: "Save" ("checking…" while probing) — stores the URL even if the probe fails, then probes it; disabled unless changed (web/components/SystemPanel.tsx:159-161, 122-131)
- [ ] Backend: "Test" — probes `<typed URL>/health` from the browser without saving (web/components/SystemPanel.tsx:162-164, 102-120)
- [ ] Backend: "Reset to default" — clears this browser's override (only when the value is the user's own) (web/components/SystemPanel.tsx:170-172, 133)
- [ ] Feature flags: search "Search <n> flags" — filters by name, label, summary, description, facts; opens every matching group (web/components/SystemPanel.tsx:453-458, 434-437)
- [ ] Feature flags: "Clear" — clears the search (web/components/SystemPanel.tsx:459-461)
- [ ] Feature flags: group fold "Deliberate opt-ins" (open by default) (web/components/SystemPanel.tsx:421-422, 466-481)
- [ ] Feature flags: group fold "Experiments" (open by default) (web/components/SystemPanel.tsx:425-426)
- [ ] Feature flags: group fold "Migrations" (open by default) (web/components/SystemPanel.tsx:427-428)
- [ ] Feature flags: group fold "Queued to graduate" (collapsed by default) (web/components/SystemPanel.tsx:429-430)
- [ ] Feature flags: group fold "On by default" (collapsed by default) (web/components/SystemPanel.tsx:431-432)
- [ ] Feature flags: per-flag switch — PUT /system/flags/{name}; the server's refusal is shown under the search (web/components/SystemPanel.tsx:530, 542-544, 391-401)
- [ ] Feature flags: per-flag "Details" — shows the description and `name · ENV_VAR` (web/components/SystemPanel.tsx:516-528)
- [ ] Packs: pack row (name + badges) — expands/collapses the pack (▸/▾) (web/components/PacksManager.tsx:35-50)
- [ ] Pack deploy: "Connection" select (web/components/PacksManager.tsx:156-158)
- [ ] Pack deploy: "Schema" select (web/components/PacksManager.tsx:159-162)
- [ ] Pack deploy: "1 · Propose bindings" — POST /packs/{id}/propose-bindings (web/components/PacksManager.tsx:163-165, 125-129)
- [ ] Pack deploy: "2 · Bind + verify" — POST /packs/{id}/bind with the proposed bindings (web/components/PacksManager.tsx:166-168, 131-138)
- [ ] Pack deploy: "3 · Evaluate" — POST /packs/{id}/evaluate; runs one planner pass per golden (SPENDS on click); disabled until verified (web/components/PacksManager.tsx:169-172, 140-142)
- [ ] Pack changelog: "Accept" per proposed learning — POST /packs/deltas/{id}/status accepted (web/components/PacksManager.tsx:238, 144-147)
- [ ] Pack changelog: "Dismiss" per proposed learning — POST /packs/deltas/{id}/status dismissed (web/components/PacksManager.tsx:239)
- [ ] Pack install row: "What changed" / "Check" / "Hide what changed" — opens the upgrade diff for that connection+schema (web/components/PackInstalls.tsx:160-163)
- [ ] Upgrade diff: "Upgrade to v<n>" — POST /packs/{id}/upgrade; proposes new/changed items for confirmation (web/components/PackInstalls.tsx:113-115, 83-96)

### Dialogs, drawers, popovers, panels
- [ ] Expanded pack panel: deploy controls, proposed bindings, eval results, changelog, installs (web/components/PacksManager.tsx:51-57, 152-246)
- [ ] Knowledge package (layer) expanded: description only — "Reference knowledge every connection reads." (web/components/PacksManager.tsx:51-54)
- [ ] Upgrade diff panel per install: groups Added / Changed / Removed / "Declined, and unchanged — they stay declined" (web/components/PackInstalls.tsx:69-124)
- [ ] Flag Details expansion (description + name · env var) (web/components/SystemPanel.tsx:523-528)
- [ ] Toast success "Upgraded <connection> to v<n>" — "Proposed <n> terms and <n> alerts; <n> items you declined stay declined." (web/components/PackInstalls.tsx:88-91)
- [ ] Toast error "The upgrade did not go through" + reason (web/components/PackInstalls.tsx:94)

### Figures, counts, badges, status chips, freshness
- [ ] Header "System Stats" — "Uptime: <h m>" · "refreshed <time>" (web/components/SystemPanel.tsx:244-252)
- [ ] Backend "In force: <url> — from <your setting (this browser) | the built-in demo — completed analyses only, no live engine | NEXT_PUBLIC_API_URL at build time | the built-in default>" (web/components/SystemPanel.tsx:136-140, 167-169)
- [ ] Backend probe line "Connected" / "Reached it, but it answered <status>" / "Reached it, but it is not a Pramanyx backend" (web/components/SystemPanel.tsx:108-111)
- [ ] Ontology (M12): "ACTION token expansions", "Enrichment runs (LLM)", "Enrichment cache hits" (web/components/SystemPanel.tsx:278-294)
- [ ] Deep analysis: "Tier 0 skips (baseline only)" (sub "within normal variance"), "Tier 1 skips (no dimensional)", "Tier 2 skips (no behavioral)" (web/components/SystemPanel.tsx:297-314)
- [ ] SQL Quality: "Self-correction retries", "Corrections succeeded", "Correction success rate" (green > 70%) (web/components/SystemPanel.tsx:317-337)
- [ ] Prior Analysis RAG (M1d): "RAG cache hits" (sub "of <n> deep analyses"), "RAG misses (fresh)", "Hit rate" (web/components/SystemPanel.tsx:340-353)
- [ ] Footer "Counters reset on server restart · auto-refreshes every 15s" — the actual poll is 60s plus kernel events (web/components/SystemPanel.tsx:355-357 vs 206-207)
- [ ] Flag group header: title, count, hint (e.g. "Off on purpose. Turn on by hand.") (web/components/SystemPanel.tsx:468-472)
- [ ] Flag source chip "changed here" / "this run" / "env: <VAR>" (only when not default) (web/components/SystemPanel.tsx:448-449, 505)
- [ ] Flag fact badges (model, free, schedule, sends [amber], warehouse, needs, private, route) + summary line (web/components/SystemPanel.tsx:488-491, 507-515)
- [ ] Graduation evidence under "Queued to graduate": "evidence says: graduate" / "evidence says: not yet" · "pass rate X against a bar of Y" · "decided <date>" — reasons (web/components/SystemPanel.tsx:554-577)
- [ ] Packs heading "Packs" (+ " · flag off (gated)" when the API says disabled) (web/components/PacksManager.tsx:29-31)
- [ ] Pack badges: status (active / deprecated / draft), "valid" / "invalid", engine scope, layer ("industry · <name>") (web/components/PacksManager.tsx:39-44)
- [ ] Pack counts "<n> metrics · <n> roles · <n> evals" (web/components/PacksManager.tsx:46-48)
- [ ] Proposed bindings "all <n> roles groundable" / "<g>/<n> roles groundable" · "deployed ✓ verified" / "pinned but not verified"; per role value and confidence % (web/components/PacksManager.tsx:178-203)
- [ ] Evals "<n>% pass" / "not run"; per question ✓/✗; "Activation — ready ✓ / blocked" + reasons (web/components/PacksManager.tsx:206-226)
- [ ] Pack changelog "<n> proposed learning(s)" — "[kind target] content" (web/components/PacksManager.tsx:229-236)
- [ ] Installs "Installed on <n> connections · the pack is at v<n>" (web/components/PackInstalls.tsx:147-149)
- [ ] Install row: connection · schema, "installed vN · vM available" / "installed vN · up to date" / "installed before versions were kept · vM available", "bound by <who>" (web/components/PackInstalls.tsx:26-30, 154-159)
- [ ] Upgrade item: kind, label, "was → said", "you declined this in vN", "proposed on upgrade" or the reason not (web/components/PackInstalls.tsx:38-55)
- [ ] Upgrade footer "Proposes <n> items for you to confirm; nothing you declined comes back unchanged." / "Up to date." (web/components/PackInstalls.tsx:116-120)
- [ ] Deploy hint "Deploy a pack: propose → bind + verify → evaluate → (set status active + enable the flag to steer runs)." — names a flag step that no longer exists (web/components/PacksManager.tsx:174)

### Keyboard shortcuts
- [ ] Enter in the Backend URL field saves it (web/components/SystemPanel.tsx:153)

### URL params / deep links
- [ ] `?tab=settings&layer=system` opens this section (web/app/page.tsx:1102)
- [ ] Agent Ops ▸ Developer "Manage packs" lands on Settings but not on this section (web/app/page.tsx:2197)
- [ ] Backend URL is stored in this browser (lib/config `setApiBase`), not in the URL (web/components/SystemPanel.tsx:128, 133)

### Empty / error / loading / withheld states
- [ ] "Loading stats…" — first read pending (web/components/SystemPanel.tsx:219)
- [ ] "Could not read the system stats — <error>." + Retry — and Backend, Feature flags and Packs still render beneath it (web/components/SystemPanel.tsx:220-227)
- [ ] Backend probe failures: "Not a valid http(s) URL" / "Could not reach it — is the backend running, and does it allow this origin?" (web/components/SystemPanel.tsx:104, 115)
- [ ] "Could not read the feature flags — <error>." + Retry (web/components/SystemPanel.tsx:406-411)
- [ ] Refused flag change "<flag>: <server reason or 'the change was refused'>" (web/components/SystemPanel.tsx:398, 463-465)
- [ ] Feature flags section renders NOTHING when no switchable flag is registered — the expected state since 2026-10-28 (no feature flags), and silent (web/components/SystemPanel.tsx:405, 413)
- [ ] Packs section renders nothing when there are no packs or the read fails (failure swallowed) (web/components/PacksManager.tsx:22, 25)
- [ ] "No evidence recorded yet." — a queued flag with no graduation decision (web/components/SystemPanel.tsx:555-560)
- [ ] Pack deploy error line (rose) with the failure message (web/components/PacksManager.tsx:175)
- [ ] Evaluate disabled hover "Deploy first: run Bind + verify" (web/components/PacksManager.tsx:170)
- [ ] Schema select shows "(schema)" when none were found (web/components/PacksManager.tsx:160)
- [ ] "Reading what changed…" / error text / "Nothing was added, changed or removed since v<n>." / "Not read (<what>): <why>" (web/components/PackInstalls.tsx:98-111)
- [ ] Installs block renders nothing when installs cannot be read (web/components/PackInstalls.tsx:135, 144)

### Loads on open
- [ ] GET /dev/stats — in-process counters; re-read every 60s and on each `node.span` / `job.` kernel event (web/lib/api.ts:3853 → pramanyx/routers/system.py:269; web/components/SystemPanel.tsx:203-209)
- [ ] EventSource /events/stream — kernel journal subscription that triggers the stats re-read (web/lib/events.ts:47-48)
- [ ] GET /system/flags (web/lib/api.ts:9745 → pramanyx/routers/system.py:235)
- [ ] GET /evals/graduations — graduation evidence for queued flags (web/lib/api.ts:12320 → pramanyx/routers/evals.py:340)
- [ ] GET /packs (web/lib/api.ts:9950 → pramanyx/routers/packs.py:66)
- [ ] On expanding a pack: GET /connections, GET /packs/{id}/deltas?status=proposed, GET /packs/{id}/installs (web/components/PacksManager.tsx:100-107; web/components/PackInstalls.tsx:133-142 → pramanyx/routers/connections.py:82, packs.py:552, 382)
- [ ] On expanding a pack: GET /catalog/tree — WRITES ON OPEN (on expand): introspects every connection's warehouse and reconciles the metastore's schema rows (web/components/PacksManager.tsx:109-117 → web/lib/api.ts:945 → pramanyx/routers/catalog.py:234, 263-278)
- [ ] On "What changed"/"Check": GET /packs/{id}/upgrade?connection_id=… — read-only, no model call (web/lib/api.ts:10110 → pramanyx/routers/packs.py:400)
- [ ] On click only: POST /dev/stats/reset (system.py:276), PUT /system/flags/{name} (system.py:247), POST /packs/{id}/propose-bindings, /bind, /evaluate (SPENDS), /upgrade, POST /packs/deltas/{id}/status (web/lib/api.ts:3859-10117)

**Top rows today:** the panel's own header row — "System Stats" with "Uptime … · refreshed …" on the left and "Reset counters" on the right (web/components/SystemPanel.tsx:244-261); next the Backend section (URL field, Save, Test, Reset to default).

## Settings — Integrations
_Source: web/components/IntegrationsPanel.tsx (+ web/components/agentops/AgentSlackDoor.tsx, web/components/McpServersSection.tsx with ToolRoster; web/lib/slackBots.ts)_

### Controls
- [ ] Sub-tab strip "Integrations": "Providers" · "Slack bots" (only when a provider routes to the Slack app door) · "MCP servers" (web/components/IntegrationsPanel.tsx:976-980)
- [ ] Needs-you "Dismiss" — clears the "remove the grant on the account's own page too" notice (web/components/IntegrationsPanel.tsx:366-371)
- [ ] Needs-you "Reconnect" (menu of products, or a button) — re-runs consent for an expired/withdrawn grant (web/components/IntegrationsPanel.tsx:377-384)
- [ ] Needs-you "Edit app" — opens the provider's set-up form when its stored client id is wrong (web/components/IntegrationsPanel.tsx:385-391)
- [ ] Needs-you "Connect" (menu of products, or a button) — provider set up, nothing connected (web/components/IntegrationsPanel.tsx:392-399)
- [ ] Needs-you "Restart" — restarts the API-managed Slack supervisor (stopped / waiting / not listening) (web/components/IntegrationsPanel.tsx:403-423)
- [ ] Needs-you "Edit" — opens a bot's edit form when its @mentions are refused (web/components/IntegrationsPanel.tsx:427-432)
- [ ] Needs-you "Restart supervisor" — a bot enabled but not listening (managed supervisor) (web/components/IntegrationsPanel.tsx:435-442)
- [ ] Needs-you "Resume" — re-enables a bot that was switched off (web/components/IntegrationsPanel.tsx:444-448)
- [ ] Needs-you "Generate key" — mints the supervisor key when a hand-run supervisor has none (web/components/IntegrationsPanel.tsx:451-456)
- [ ] ConnectMenu dropdown — one item per not-yet-connected product of the provider (web/components/IntegrationsPanel.tsx:114-129)
- [ ] Provider row "Add Slack app" / "Close" — opens the Slack app door (when OAuth needs HTTPS here) (web/components/IntegrationsPanel.tsx:508-512)
- [ ] Provider row "Set up" / "Edit app" / "Close" — opens the OAuth client form (web/components/IntegrationsPanel.tsx:516-526)
- [ ] Provider row "Disconnect all" (with products) / "Revoke" (without) — revokes the grant (web/components/IntegrationsPanel.tsx:527-532, 311-325)
- [ ] Provider row "Connect" / "Reconnect" (provider without products) — opens consent in a new tab (web/components/IntegrationsPanel.tsx:533-537, 285-309)
- [ ] Provider row "Details" — toggles the facts block (web/components/IntegrationsPanel.tsx:539-541)
- [ ] Product row "Connect" / "Reconnect" — consent for that product alone; disabled until the app is set up or while the client id is wrong (web/components/IntegrationsPanel.tsx:563-570)
- [ ] Details: "the <provider> console" link (new tab) (web/components/IntegrationsPanel.tsx:594-597)
- [ ] Set-up form: "the <provider> console" link (web/components/IntegrationsPanel.tsx:659)
- [ ] Set-up form: "Redirect URI" field (editable; unchanged = no override stored) (web/components/IntegrationsPanel.tsx:669-673)
- [ ] Set-up form: "Client ID" field (web/components/IntegrationsPanel.tsx:689-691)
- [ ] Set-up form: "Client secret" field ("blank keeps <preview>") (web/components/IntegrationsPanel.tsx:692-697)
- [ ] Set-up form: "Save" — PUT /integrations/{provider}/app (web/components/IntegrationsPanel.tsx:699-705, 265-283)
- [ ] Set-up form: "Cancel" (web/components/IntegrationsPanel.tsx:706-708)
- [ ] Slack app door: "Answers as" agent select ("No agent — posting only" + each custom agent) (web/components/IntegrationsPanel.tsx:604-622)
- [ ] Slack app door: "Asks on" connection select ("No connection — posting only" + each connection) (web/components/IntegrationsPanel.tsx:623-635)
- [ ] Slack app door (one-token path): "App name" field, "Configuration token" field, "Create the app" — POST /slack-bots/apps (web/components/agentops/AgentSlackDoor.tsx:240-255, 173-189)
- [ ] Slack app door: "Open it at api.slack.com" link after creation (web/components/agentops/AgentSlackDoor.tsx:261-263)
- [ ] Slack app door: "Install to Slack" (HTTPS deployments) — navigates this tab to the API's install URL (web/components/agentops/AgentSlackDoor.tsx:270-279)
- [ ] Slack app door: bot token paste "xoxb-…" (when no install button) (web/components/agentops/AgentSlackDoor.tsx:281-285)
- [ ] Slack app door: app-level token paste "xapp-…" (web/components/agentops/AgentSlackDoor.tsx:289-290)
- [ ] Slack app door: "Finish — the bot goes live" — PATCH /slack-bots/{id} with the tokens (web/components/agentops/AgentSlackDoor.tsx:291-295, 191-211)
- [ ] Slack app door: "Do it by hand instead — paste the manifest at api.slack.com" (web/components/agentops/AgentSlackDoor.tsx:304-310)
- [ ] Slack app door (by hand): "Use one token instead" (web/components/agentops/AgentSlackDoor.tsx:318)
- [ ] Slack app door (by hand): "App name" + "Generate JSON" / "Re-render" — GET /slack-bots/manifest (web/components/agentops/AgentSlackDoor.tsx:328-337, 108-122)
- [ ] Slack app door (by hand): "Copy JSON" (falls back to selecting the JSON for ⌘C) (web/components/agentops/AgentSlackDoor.tsx:345-348, 126-146)
- [ ] Slack app door (by hand): three fields — "Bot user OAuth token", "App-level token", "Signing secret" (web/components/agentops/AgentSlackDoor.tsx:382-396)
- [ ] Slack app door (by hand): "Create Slack bot" — POST /slack-bots, verified against Slack first (web/components/agentops/AgentSlackDoor.tsx:402-405, 148-169)
- [ ] Slack app door: "Close" / "Done" (web/components/agentops/AgentSlackDoor.tsx:415-418; web/components/IntegrationsPanel.tsx:644)
- [ ] Bot row "Edit" / "Cancel" — opens the bot's edit form (web/components/IntegrationsPanel.tsx:757-759)
- [ ] Bot row "Pause" / "Resume" — PATCH enabled (web/components/IntegrationsPanel.tsx:760-766)
- [ ] Bot row delete (trash icon) — confirm() then DELETE /slack-bots/{id} (web/components/IntegrationsPanel.tsx:767-770, 254-263)
- [ ] Bot edit: "Bot name" field (web/components/IntegrationsPanel.tsx:777-779)
- [ ] Bot edit: "Answers as agent" select (brings the agent's connection along) (web/components/IntegrationsPanel.tsx:780-792)
- [ ] Bot edit: "Asks on connection" select (shows "<id> (not found)" for a missing one) (web/components/IntegrationsPanel.tsx:793-806)
- [ ] Bot edit: "Home channel" field (#name or C…, optional) (web/components/IntegrationsPanel.tsx:808-810)
- [ ] Bot edit: "Rehearse" checkbox — mentions answered in the asker's DM first; automation posts wait for a click (web/components/IntegrationsPanel.tsx:813-819)
- [ ] Bot edit: "Save" — PATCH /slack-bots/{id} with the whole record (web/components/IntegrationsPanel.tsx:821-824, 238-246)
- [ ] Supervisor row "Restart" (managed only) (web/components/IntegrationsPanel.tsx:907-911)
- [ ] Supervisor row "Details" (web/components/IntegrationsPanel.tsx:912-914)
- [ ] Supervisor key "Generate" / "Regenerate" — POST /slack-bots/supervisor-key; shows the env line once (web/components/IntegrationsPanel.tsx:853-855, 334-343)
- [ ] MCP card "Custom MCP" — opens the add form (web/components/McpServersSection.tsx:461-465)
- [ ] MCP add form: "Name" field (web/components/McpServersSection.tsx:238-239)
- [ ] MCP add form: transport toggle "URL" · "Local process" (web/components/McpServersSection.tsx:241-250)
- [ ] MCP add form (URL): "Server URL" field (web/components/McpServersSection.tsx:254-256)
- [ ] MCP add form (URL): access toggle "Sign in" · "API key" · "None" (web/components/McpServersSection.tsx:257-267)
- [ ] MCP add form (API key): "Auth header name" + "Auth header value" fields (web/components/McpServersSection.tsx:278-287)
- [ ] MCP add form (Local process): "Command" + "Arguments" fields (web/components/McpServersSection.tsx:302-308)
- [ ] MCP add form: "Add" (POST /mcp-servers; contacts nothing) / "Cancel" (web/components/McpServersSection.tsx:320-328)
- [ ] One-click card "Composio" — "Connect" / "Sign in" / "Sign in again" (creates the server if needed, opens sign-in in a new tab) (web/components/McpServersSection.tsx:66-69, 474-490, 199-204)
- [ ] One-click card "Jira" — same (one Atlassian sign-in) (web/components/McpServersSection.tsx:70-72)
- [ ] One-click card "Confluence" — same (one Atlassian sign-in) (web/components/McpServersSection.tsx:73-75)
- [ ] Custom server row primary "Sign in" / "Sign in again" (OAuth, not signed in) or "Discover" (not discovered) (web/components/McpServersSection.tsx:501-510)
- [ ] MCP row "Manage" / "Close" — opens the server's controls (web/components/McpServersSection.tsx:439-444)
- [ ] MCP row "Details" (web/components/McpServersSection.tsx:445-447)
- [ ] MCP pending sign-in "open it" link (when the browser blocked the tab) (web/components/McpServersSection.tsx:349-356)
- [ ] Manage ▸ "Sign out" (OAuth, signed in) (web/components/McpServersSection.tsx:368-373)
- [ ] Manage ▸ "Discover" / "Re-discover" — POST /mcp-servers/{id}/discover (web/components/McpServersSection.tsx:374-377)
- [ ] Manage ▸ "Check" — live health probe (web/components/McpServersSection.tsx:378-381, 219-225)
- [ ] Manage ▸ "Turn off" / "Turn on" — PUT /mcp-servers/{id} enabled (web/components/McpServersSection.tsx:382-388)
- [ ] Manage ▸ "Remove" — DELETE /mcp-servers/{id} with no confirmation (web/components/McpServersSection.tsx:390-393)
- [ ] Tool roster "Grant" / "Grant again" / "Revoke" per non-callable tool — PUT/DELETE /mcp-servers/{id}/grants/{tool} (web/components/McpServersSection.tsx:611-617, 544-555)

### Dialogs, drawers, popovers, panels
- [ ] Provider Details block: Redirect URI ("(set by hand)"), Client ID, Client secret ("stored, encrypted — never shown"), Callback (HTTPS rule), Why an app, Account + status + since, Granted scopes, Tools per product, Group, Console link (web/components/IntegrationsPanel.tsx:577-600)
- [ ] Set-up form (inline under the row): instructions, redirect URI explainer, override note, http:// refusal warning, client fields, lock note (web/components/IntegrationsPanel.tsx:653-714)
- [ ] Slack app door (inline under the Slack row, AgentSlackDoor): "Add a Slack app" — one-token path (steps 1-3) or by-hand manifest path (steps 1-2) (web/components/IntegrationsPanel.tsx:602-651; web/components/agentops/AgentSlackDoor.tsx:213-421)
- [ ] Manifest JSON block + the server's numbered steps (web/components/agentops/AgentSlackDoor.tsx:339-363)
- [ ] Bot edit form (inline) (web/components/IntegrationsPanel.tsx:775-831)
- [ ] Supervisor Details: Run by, Why / Start it (`cd bots/slack && npm run dev`), Process pid, Since, Restarts, Last heartbeat (open/failed), Last exit, Last error, Missing, Its log, and the key row when managed (web/components/IntegrationsPanel.tsx:917-940)
- [ ] Fresh supervisor key shown once (`PRAMANYX_RUNTIME_KEY=…`) with copy-now warning and grace-until line (web/components/IntegrationsPanel.tsx:857-872)
- [ ] window.confirm "Delete the Slack bot "<name>"? Its tokens are removed and its socket closes…" (web/components/IntegrationsPanel.tsx:255-258)
- [ ] ConnectMenu dropdown (web/components/IntegrationsPanel.tsx:118-127)
- [ ] MCP Manage controls block with health line (web/components/McpServersSection.tsx:359-396)
- [ ] MCP Details: blurb, address/command, "Signed in <time>", tool roster (web/components/McpServersSection.tsx:399-414)
- [ ] Consent / sign-in pages open in a NEW browser tab (falls back to this tab or a link if blocked) (web/components/IntegrationsPanel.tsx:292-302; web/components/McpServersSection.tsx:181-191)

### Figures, counts, badges, status chips, freshness
- [ ] Figure "Connected" — "<n> of <m>"; sub the connected providers ("<name>, by its app") or "nothing yet" (web/components/IntegrationsPanel.tsx:952-954)
- [ ] Figure "Slack bots" — count; sub "<n> listening" / "<n> of <m> listening" · "<n> paused" / "none added"; amber when some are deaf (web/components/IntegrationsPanel.tsx:955-961)
- [ ] Figure "Supervisor" — Running / Run by hand / Waiting on setup / Starting / Restarting / Stopped / Failed; sub "heard <x> ago" / "not heard since <date>" / "no heartbeat yet" · "run by the API" / "started outside the app" / "its setup is missing" / last error (web/components/IntegrationsPanel.tsx:962-971, 93-96)
- [ ] Provider chip "connected" / "<n> of <m> connected" / "needs reconnecting" / "set up · not connected" / "set up · 0 of <m> connected" / "not set up" / "no app added" / "connected by its app" / "by its app · not listening" (web/components/IntegrationsPanel.tsx:69-91, 481)
- [ ] Provider chip "OAuth needs HTTPS" (hover explains the app door) (web/components/IntegrationsPanel.tsx:484-489)
- [ ] Provider meta line "<account> · since <date> · <n> permissions granted" or the blurb (web/components/IntegrationsPanel.tsx:470-473, 491)
- [ ] Product chip "connected" (hover: blurb · account · tools) (web/components/IntegrationsPanel.tsx:556, 563)
- [ ] Providers card chip "tokens held encrypted · never shown" (web/components/IntegrationsPanel.tsx:984-986)
- [ ] Bot chips: "paused" / "switched off" / "listening since <date>" (hover: since · last heard) / "not listening", "@mentions refused", "rehearses" (web/components/IntegrationsPanel.tsx:738-752)
- [ ] Bot meta "answers as <agent|nobody — posting only> · asks on <connection> · home channel <id>"; hover "Slack member ID …" (web/components/IntegrationsPanel.tsx:724-728, 735)
- [ ] Supervisor row dot + chip (state), meta "no heartbeat yet" / "not heard since …" / "started outside the app — how, in Details" / "restarted <n>×" (web/components/IntegrationsPanel.tsx:881-904)
- [ ] Supervisor key chip "set" / "not set" (web/components/IntegrationsPanel.tsx:849)
- [ ] MCP chip "connected" / "added with a key" / "waiting for the sign-in" / "not connected" / "off" / "not signed in" / "added" (web/components/McpServersSection.tsx:481-482, 497-499)
- [ ] MCP meta "<reach> · signed in <when> · renews itself · <n> tools · <n> callable here" / "not discovered yet" / "<header> header stored" (web/components/McpServersSection.tsx:337-347)
- [ ] MCP health line "reachable" / "unreachable — <reason>" (web/components/McpServersSection.tsx:361-366)
- [ ] Tool roster freshness "Read from the server at <time>." (web/components/McpServersSection.tsx:559-562)
- [ ] Tool row: dot (callable / granted / stale / refused), "writes" for granted, the server's refusal sentence verbatim, "Granted by <who> on <date>…" (web/components/McpServersSection.tsx:569-610)

### Keyboard shortcuts
- none found (⌘C is suggested only when the clipboard is blocked: web/components/agentops/AgentSlackDoor.tsx:139)

### URL params / deep links
- [ ] `?tab=integrations` (the link every Slack door hands out) and `?tab=settings&layer=integrations` open this section (web/app/page.tsx:998, 1102)
- [ ] Sub-tab (Providers / Slack bots / MCP servers) is local state — not in the URL (web/components/IntegrationsPanel.tsx:132)
- [ ] OAuth consent returns to the API's own "Connected" page in the other tab; this tab refetches on window focus (web/components/IntegrationsPanel.tsx:207-214)
- [ ] "Install to Slack" navigates this tab to `<api>/…install_url` (web/components/agentops/AgentSlackDoor.tsx:273)

### Empty / error / loading / withheld states
- [ ] "Loading integrations…" — first read pending (web/components/IntegrationsPanel.tsx:360-362)
- [ ] ErrorState "Integration failed" — any failed read or action, with the message (web/components/IntegrationsPanel.tsx:949)
- [ ] "Nothing needs you" — no rows owed (web/components/IntegrationsPanel.tsx:974)
- [ ] "Remove the <provider> grant on the account's own security page too" — provider has no revocation endpoint (web/components/IntegrationsPanel.tsx:366-371)
- [ ] "<provider> did not grant <products> on the last connect — connect that card again and tick its box…" — withheld products said (web/components/IntegrationsPanel.tsx:492-497)
- [ ] "<client id problem>. Edit the app to fix it — Connect is held until then." (web/components/IntegrationsPanel.tsx:498-502)
- [ ] "<provider> refuses an http:// redirect URL, localhost included — registering the URI above will fail…" (web/components/IntegrationsPanel.tsx:682-688)
- [ ] Product Connect disabled hover "Set up the <provider> app first — one app serves every <provider> product" (web/components/IntegrationsPanel.tsx:565-566)
- [ ] Providers empty: "No provider is offered on this deployment." (web/components/IntegrationsPanel.tsx:987)
- [ ] Slack bots empty: "A bot is added with Add Slack app, on the Slack row under Providers." (web/components/IntegrationsPanel.tsx:993)
- [ ] Needs-you supervisor rows: "The Slack supervisor stopped — no bot is answering" / "…is waiting on its setup — no bot is answering" / "…is not listening" (web/components/IntegrationsPanel.tsx:403-423)
- [ ] Needs-you bot rows: "<bot>: @mentions are refused" / "<bot> is not listening" / "<bot> was switched off"; "No supervisor key" (web/components/IntegrationsPanel.tsx:427-457)
- [ ] Fresh key warning "Copy this now — it is shown once…" (web/components/IntegrationsPanel.tsx:864-870)
- [ ] Slack door errors (red line), incl. "Clipboard blocked by the browser — the JSON is selected, press ⌘C." (web/components/agentops/AgentSlackDoor.tsx:139, 411-413)
- [ ] Slack door success: "App <name> created in Slack (<id>); its signing secret is stored. Two steps remain…" / "Slack bot <name> is live…" / "…created and verified against Slack…" (web/components/agentops/AgentSlackDoor.tsx:258-264, 298-303, 373-378)
- [ ] MCP error alert (red) with the failure (web/components/McpServersSection.tsx:466-470)
- [ ] MCP empty posture: "Nothing is registered, so this deployment can call no MCP server at all — a server's read-only tools become steps once one is added and discovered." (web/components/McpServersSection.tsx:515-520)
- [ ] MCP pending: "Waiting for you to finish signing in on the server's page…" (web/components/McpServersSection.tsx:349-355)
- [ ] MCP Details: "It offers no tools." / "Its tools are not discovered yet." (web/components/McpServersSection.tsx:410-412)
- [ ] MCP add form notes: sign-in explainer, "Stored encrypted, and never returned by any read — not even masked.", local-process privilege warning, "Adding a server contacts nothing. Press Discover afterwards…" (web/components/McpServersSection.tsx:268-332)
- [ ] Tool roster grant failure text (web/components/McpServersSection.tsx:563-567)

### Loads on open
- [ ] GET /integrations/catalog — providers, products, grants, redirect URI (web/lib/api.ts:6182 → pramanyx/routers/integrations.py:67)
- [ ] GET /slack-bots, GET /agents/custom, GET /connections — only when a provider routes to the Slack app door (web/lib/api.ts:6356, 10268, 30 → pramanyx/routers/slackbots.py:40, agents.py:273, connections.py:82)
- [ ] GET /slack-bots/supervisor and GET /slack-bots/supervisor-key (status only, never the key) (web/lib/api.ts:6428, 6348 → pramanyx/routers/slackbots.py:248, 293)
- [ ] All of the above re-run on every window focus (web/components/IntegrationsPanel.tsx:210-214)
- [ ] GET /mcp-servers — when the MCP servers tab opens; polled every 3s while a sign-in is pending (web/lib/api.ts:6081 → pramanyx/routers/mcpservers.py:133; web/components/McpServersSection.tsx:134-142)
- [ ] POST /mcp-servers/{id}/discover — WRITES ON OPEN: fired automatically, once per server per mount, for any server signed in but never discovered (contacts the remote server and stores its roster) (web/components/McpServersSection.tsx:206-217 → pramanyx/routers/mcpservers.py:243)
- [ ] On click only: GET /mcp-servers/{id}/health — a live probe that also refreshes the stored roster (a GET that writes) (web/lib/api.ts:6159 → pramanyx/routers/mcpservers.py:263-269)
- [ ] On click only: PUT /integrations/{p}/app (integrations.py:191), POST /integrations/{p}/connect (214), POST /integrations/connections/{id}/revoke (291), POST /slack-bots/apps (slackbots.py:116), GET /slack-bots/manifest (53), POST /slack-bots (402), PATCH /slack-bots/{id} (417), DELETE /slack-bots/{id} (451), POST /slack-bots/supervisor/restart (257), POST /slack-bots/supervisor-key (273), POST/PUT/DELETE /mcp-servers… (mcpservers.py:140-321)

**Top rows today:** no header; the section opens on the Figures row (Connected · Slack bots · Supervisor), then "Needs you", then the sub-tab strip (Providers · Slack bots · MCP servers); the Providers card carries "tokens held encrypted · never shown" and the MCP card "Custom MCP" at their top right (web/components/IntegrationsPanel.tsx:951-986; web/components/McpServersSection.tsx:460-465).

## The shell (everything rendered outside a page)
_Source: web/app/page.tsx (Topbar, Sidebar, Home), web/app/layout.tsx, web/components/WorkspaceSwitcher.tsx, web/components/shell/ActivityStrip.tsx, web/components/shell/useNavCounts.ts, web/components/shell/useNavCollapsed.ts, web/lib/navDestinations.ts, web/components/AuthControl.tsx, web/components/CommandPalette.tsx, web/components/HistoryPanel.tsx, web/components/ApprovalModal.tsx, web/components/UpgradeModal.tsx, web/components/ui/toast.tsx_

### Controls

#### Top bar (left to right)
- [ ] "Pramanyx" wordmark — static text, not a link (web/app/page.tsx:264)
- [ ] Workspace switcher pill — shows the active workspace's name + caret; click opens the workspace popover (web/components/WorkspaceSwitcher.tsx:144)
- [ ] Workspace row (per workspace) — switch the whole app to that workspace; clears the open canvas and chat/history session (web/components/WorkspaceSwitcher.tsx:243, web/app/page.tsx:1829)
- [ ] Workspace row pencil "Manage <name>" — opens that workspace's membership editor (web/components/WorkspaceSwitcher.tsx:286)
- [ ] Membership editor: one checkbox per org connection — add/remove the connection from the workspace (web/components/WorkspaceSwitcher.tsx:195)
- [ ] Membership editor: "Back" — return to the workspace list without saving (web/components/WorkspaceSwitcher.tsx:180)
- [ ] Membership editor: "Save" / "Saving…" — PUT the workspace's connection list (web/components/WorkspaceSwitcher.tsx:207, web/app/page.tsx:1903)
- [ ] Membership editor: trash icon (non-default workspaces only) — delete the workspace after a window.confirm ("Its connections are not deleted — they stay in the org.") (web/components/WorkspaceSwitcher.tsx:211)
- [ ] "New workspace" — reveals a name field (web/components/WorkspaceSwitcher.tsx:322)
- [ ] New-workspace name field "Workspace name…" + "Create" — creates the workspace, switches to it, and drops straight into its membership editor; Enter submits, Escape cancels (web/components/WorkspaceSwitcher.tsx:307, :316, web/app/page.tsx:1897)
- [ ] Click outside the popover — closes it and resets create/manage state (web/components/WorkspaceSwitcher.tsx:80)
- [ ] LIVE activity strip — clickable (role=link, Enter too) opens Agent Ops (Overview); hidden entirely when the series cannot be read (web/components/shell/ActivityStrip.tsx:104, :113, web/app/page.tsx:274)
- [ ] Per-tick hover — "<N>h ago · <n> agent runs · mostly <agent>" (web/components/shell/ActivityStrip.tsx:120)
- [ ] "Search, ask, or run a command ⌘K" button — opens the command palette (web/app/page.tsx:278)
- [ ] Theme segmented control "dark | light" — applies the theme, stores it in localStorage `pramanyx_theme` and PUTs /me/preferences/theme (web/app/page.tsx:285, :1404)
- [ ] User menu (AuthControl), three states: static "AU" avatar when no identity is configured (tooltip "No identity configured") (web/components/AuthControl.tsx:41, :104)
- [ ] User menu: "Sign in with Google" button (Google Identity Services) when OIDC=google and signed out; on credential → POST sign-in, page reloads (web/components/AuthControl.tsx:77, :109)
- [ ] User menu: signed-in chip (initials + email local part + caret) → popover with full email, "verified by the server on every call", and "Sign out" (signs out, reloads) (web/components/AuthControl.tsx:123, :139, :143)

#### Left rail (`Sidebar`)
- [ ] Collapse / expand toggle (panel icon at the rail head; tooltip "Collapse navigation · ⌘\") — collapses the rail to icons; state in localStorage + `data-nav` attribute (web/app/page.tsx:424, web/components/shell/useNavCollapsed.ts:15)
- [ ] Destination row "Home" — opens the section last used there this tab, else Home; sections Home · Briefing · Now (web/app/page.tsx:386, web/lib/navDestinations.ts:43)
- [ ] Destination row "Ask" — sections Data Canvas · Agent runs (web/lib/navDestinations.ts:48)
- [ ] Destination row "Data" — sections Catalog · Profile · Documents (web/lib/navDestinations.ts:54)
- [ ] Destination row "Analyze" — sections SQL Editor · Dashboards · Spreadsheets (web/lib/navDestinations.ts:59)
- [ ] Destination row "Define" — sections Semantic Layer · Ontology · Actions · Graph · Memory · Org (web/lib/navDestinations.ts:64)
- [ ] Destination row "Decide" — sections Inbox · Record · Evidence (web/lib/navDestinations.ts:74)
- [ ] Destination row "Operations" — sections Health · Monitors · Agent Ops · Notifications · Spend · Security & Audit · Evals · Brain map (web/lib/navDestinations.ts:79)
- [ ] Section rows — shown only under the destination holding the open page; click opens that screen; active row gets aria-current + accent bar (web/app/page.tsx:408)
- [ ] Destination chevron — drawn on every destination row; aria-expanded on the open one (web/app/page.tsx:405)
- [ ] Section hover tooltips — label, badge count, and the blurb for former Briefing tabs (Briefing, Dashboards, Ontology, Graph, Evidence, Brain map); always on for blurbed rows, else only when collapsed (600 ms delay) (web/app/page.tsx:373)
- [ ] "Settings" row pinned at the rail foot (web/app/page.tsx:439)
- [ ] Footer meta "v2 · Local" / "v2 · Demo" (web/app/page.tsx:444)
- [ ] Demo-only line "Synthetic data · illustrative only" with a long hover explanation (web/app/page.tsx:453)

#### Command palette (⌘K) — search mode
- [ ] Search field "Search — or ask Spotlight anything…" — fuzzy (Fuse) search across commands, navigation, recent runs, tables (web/components/CommandPalette.tsx:633)
- [ ] "ESC" key-cap in the input row — clickable, closes the palette (web/components/CommandPalette.tsx:637)
- [ ] Backdrop click — closes the palette (web/components/CommandPalette.tsx:592)
- [ ] Commands group, global: "Ask a question" (new chat) (web/components/CommandPalette.tsx:184)
- [ ] Commands group, global: "New Data Canvas" (goes to Data Canvas list) (web/components/CommandPalette.tsx:185)
- [ ] Commands group, global: "New monitor" (goes to Monitors; does not open a create form) (web/components/CommandPalette.tsx:186)
- [ ] Commands group, global: "Build a query" (SQL Editor in Visual mode via `builder`) (web/components/CommandPalette.tsx:187)
- [ ] Commands group, global: "Add a data source" (Catalog's Add data page, via a nonce) (web/components/CommandPalette.tsx:188, web/app/page.tsx:2378)
- [ ] Commands group, contextual: commands registered by mounted surfaces — Briefing, the visual Query Builder, Dashboards' pinned cards (web/components/BriefingPanel.tsx:3047, web/components/QueryBuilder.tsx:1658, web/components/brief/PinnedCards.tsx:119)
- [ ] Navigation group, 40 rows (every rail section and more): Home, Data Canvas, Briefing, Agent runs, Inbox, Documents, Profile, Ontology, Dashboards, Actions, Graph, Memory, Org, Evidence, Brain map, Health, Agent Ops, Create agent, Playbook, Catalog, SQL Editor, Semantic Layer, Connections, Metrics Catalog, Monitors, Notifications, Integrations, Spend, Security & Audit, Evals, Settings, Now, Inquiries, Decisions, Missions, Claims, Corrections, Action centre, Developer (web/components/CommandPalette.tsx:351-392)
- [ ] "Create agent" row — sets `?create=agent` and opens Agent Ops, where the create flow opens (web/components/CommandPalette.tsx:416)
- [ ] "Recent Agent runs" group (20 newest; 4 shown with no query) — selecting one RE-ASKS its question as a new chat; it does not open the old run (web/components/CommandPalette.tsx:466)
- [ ] "Tables" group (selected connection's tables, with row counts) — selecting asks "Tell me about the <table> table" in a new chat (web/components/CommandPalette.tsx:476)
- [ ] "Objects" group — objects found by name from 2 characters (250 ms debounce); selecting opens the object's page (web/components/CommandPalette.tsx:307, :318)
- [ ] "Spotlight" group: "Ask Spotlight <query>" row (always last when there is a query) — switches to the Spotlight answer pane (web/components/CommandPalette.tsx:515)
- [ ] Row click / hover — hover moves the cursor; click activates; async commands show " · running…" and keep the overlay open (web/components/CommandPalette.tsx:730, :753)
- [ ] Empty query defaults — all commands, then Data Canvas, Agent runs, Catalog, SQL Editor, 4 recent runs, 4 tables (web/components/CommandPalette.tsx:498)

#### Command palette — Spotlight mode
- [ ] "← Back" button — back to search (web/components/CommandPalette.tsx:611)
- [ ] "ESC" key-cap in the identity row — back to search (web/components/CommandPalette.tsx:618)
- [ ] Answer pane — streamed turns (PartsMessage) with follow-up suggestions (re-ask in the overlay) and "deeper" (opens the full chat with the question and closes the palette) (web/components/CommandPalette.tsx:661, :662)
- [ ] Follow-up field "Ask a follow-up — answers stay in this overlay" (Enter sends; disabled while answering) (web/components/CommandPalette.tsx:669)

#### Overlays and modals mounted by the shell
- [ ] History overlay (opened by "History" in the chat screen's header): close ×; HistoryPanel search "Search…"; trash "Delete all Agent runs and chats" (confirm); per-row open; per-row "Ask Spotlight why this run failed"; per-row delete (web/app/page.tsx:2348, web/components/HistoryPanel.tsx:114, :128, :219, :230)
- [ ] Approval modal (any HTTP 428 approval_required): "Cancel" and "Approve for this scope" → POST /approvals/allow; then "Done" (web/components/ApprovalModal.tsx:100, :103, :118)
- [ ] Upgrade modal (any HTTP 402 capability_locked): "Maybe later" and "See plans →" (both only close it) (web/components/UpgradeModal.tsx:82, :83)
- [ ] Add Connection modal (opened from Home's add-connection step): Name; Connector type grid in groups Built-in / Warehouse / File / API / CRM / Federation / Knowledge; per-type fields (optional ones marked); "Cancel"; "Save Connection" / "Connecting…" (web/app/page.tsx:658-800, :2399)
- [ ] Remove connection modal (opened from the Catalog): type the connection's name to confirm; Enter or "Remove" / "Removing…"; "Cancel"; backdrop closes (web/app/page.tsx:811-870, :2407)
- [ ] Canvas creator modal (opened from the Data Canvas list's New) — creates a canvas and opens it (web/app/page.tsx:2416)
- [ ] Toasts (bottom stack, max visible capped): success / error / info / warning; auto-dismiss (errors linger), paused on hover and while the tab is hidden; manual × dismiss; aria-live (web/components/ui/toast.tsx:13, :169, :180, web/app/layout.tsx:94)

### Dialogs, drawers, popovers, panels
- [ ] Workspace popover — list view: "WORKSPACES" header, rows, divider, "New workspace" (web/components/WorkspaceSwitcher.tsx:162)
- [ ] Workspace popover — membership editor: "<name> · connections", checkbox list, "Checked connections belong to this workspace — every panel scopes to them.", Save, delete (web/components/WorkspaceSwitcher.tsx:175)
- [ ] User-menu popover — email, server-verified note, Sign out (web/components/AuthControl.tsx:132)
- [ ] Command palette overlay — input row, grouped results, footer hints, result count (web/components/CommandPalette.tsx:599)
- [ ] Spotlight answer pane inside the palette (web/components/CommandPalette.tsx:648)
- [ ] History overlay (420px panel, top-right) (web/app/page.tsx:2348)
- [ ] Approval modal — lock icon, "Approval required", "<risk>-risk action", action label (friendly names for connection/schema/table delete, ontology override/remove/import, metric approve), scope, "every attempt is recorded in Security & Audit" (web/components/ApprovalModal.tsx:71)
- [ ] Upgrade modal — "Unlock <feature>", current vs required tier, "<TIER> PLAN INCLUDES" three highlights (web/components/UpgradeModal.tsx:39)
- [ ] Add Connection, Remove connection, Canvas creator modals (web/app/page.tsx:2399, :2407, :2416)
- [ ] Error boundaries per workspace ("The Operations workspace hit an error.", "The Evals workspace hit an error.", "The Agents workspace hit an error.", "The Intelligence workspace hit an error.", and others); Settings and Health have none (web/app/page.tsx:2152-2281)

### Figures, counts, badges, status chips, freshness
- [ ] Workspace row sub-line "<n> connections · <k> via grant · default" (web/components/WorkspaceSwitcher.tsx:273)
- [ ] Active-workspace check mark (web/components/WorkspaceSwitcher.tsx:283)
- [ ] LIVE strip: "LIVE" label, 24 hourly ticks (height = agent runs; hue = the agent that ran most that hour; older ticks fade) (web/components/shell/ActivityStrip.tsx:114)
- [ ] LIVE strip status: "exploring · <n> live" or "idle"; hover gives "Explorer phase: <phase>" (web/components/shell/ActivityStrip.tsx:101, :125)
- [ ] LIVE strip dot — live (running or exploring) vs idle (web/components/shell/ActivityStrip.tsx:126)
- [ ] Rail badge on Monitors — open (unacknowledged, not recovered) monitor alerts; amber (web/app/page.tsx:326)
- [ ] Rail badge on Agent runs — agent runs in flight; neutral (counts only the 50 newest investigations) (web/app/page.tsx:327, web/components/shell/useNavCounts.ts:58)
- [ ] Rail badge on Now — decisions due + inquiries due + departures owed, minus anything set aside; amber (web/app/page.tsx:328, web/components/shell/useNavCounts.ts:44)
- [ ] Rolled-up badge on a closed destination (sum of its sections' badges; "<n> waiting" / "<n> running" in its name and tooltip) (web/app/page.tsx:391)
- [ ] Palette: Objects header "searched <n> of <m> entities · more in … · some withheld from you" (hover lists skipped entities and withheld rows) (web/components/CommandPalette.tsx:709)
- [ ] Palette: recent-run sublabel "<time> ago · <status>"; icon colour by status (web/components/CommandPalette.tsx:466)
- [ ] Palette: table sublabel "<n> rows" (web/components/CommandPalette.tsx:479)
- [ ] Palette footer: "<n> results" in search; "answering…" / "grounded by tool calls" in Spotlight (web/components/CommandPalette.tsx:796)
- [ ] Palette: focused row shows "↵" (web/components/CommandPalette.tsx:763)
- [ ] User chip: initials + email local part (web/components/AuthControl.tsx:126)

### Keyboard shortcuts
- [ ] ⌘K / Ctrl+K — toggle the command palette, from anywhere (even inside fields) (web/app/page.tsx:1547)
- [ ] Escape — closes the palette (shell handler) (web/app/page.tsx:1548)
- [ ] Escape inside the palette — Spotlight → search → closed (one level at a time) (web/components/CommandPalette.tsx:338)
- [ ] ↑ / ↓ / Enter in the palette — move the cursor over the rendered (grouped) rows / activate (web/components/CommandPalette.tsx:554)
- [ ] Enter in the Spotlight follow-up field — send (Shift+Enter does not) (web/components/CommandPalette.tsx:672)
- [ ] ⌘\ / Ctrl+\ — collapse/expand the rail (ignored while focus is in an input, textarea, select or editor) (web/components/shell/useNavCollapsed.ts:19)
- [ ] Enter on the LIVE strip — opens Agent Ops (web/components/shell/ActivityStrip.tsx:108)
- [ ] Enter / Escape in the new-workspace name field — create / cancel (web/components/WorkspaceSwitcher.tsx:311)
- [ ] Enter in the Remove-connection field — confirms when the name matches (web/app/page.tsx:851)
- [ ] Escape / backdrop on the Approval and Upgrade modals — close (Approval: the held request gets its 428) (web/components/ApprovalModal.tsx:71, web/components/UpgradeModal.tsx:39)

### URL params / deep links
- [ ] `?tab=<id>` — the router: every screen id in VALID_TABS; read on mount and on Back/Forward; tab changes PUSH history (web/app/page.tsx:886, :1116, :1293)
- [ ] Tab aliases resolved to a workspace layer: `monitors|actions|spend|security` → Operations; `activity` → Security & Audit on the Activity lens; `integrations` → Settings ▸ Integrations; `catalog|builder|query|semantic|connections` → Data; `briefing|ontology|dashboards|intel-hub|intel|org-intel|graph|memory|evidence|brain|declared-actions` → Intelligence; `fleet|agents|control-room|action-centre|developer` → Agent Ops; `inquiries|decisions|missions|claims|corrections` → Record (web/app/page.tsx:998)
- [ ] `?tab=cockpit` / `?layer=cockpit` — legacy alias for Dashboards (web/app/page.tsx:1017)
- [ ] `?tab=builder` — opens the SQL Editor in Visual mode (never written back) (web/app/page.tsx:1142)
- [ ] `?layer=<id>` — read and written for Intelligence, Operations, Evals, Agent Ops (incl. folded `activity` → Overview), Record and Settings sections (web/app/page.tsx:1101, :1258)
- [ ] `?settings=<section>` — legacy Settings section link; read once, then deleted in favour of `?layer=` (web/app/page.tsx:1136, :1259)
- [ ] `?conn=<id>` — the bound connection; a deep link outranks the remembered one; connection changes REPLACE history (web/app/page.tsx:1417, :1258)
- [ ] `?canvas=<id>` — opens that canvas, resolved inside the active workspace (toast if not found) (web/app/page.tsx:1122, :1494)
- [ ] `?id=<id>` — the open record on the Record workspace (web/app/page.tsx:1149)
- [ ] `?table=<name>` — entity link consumed once by the Graph layer (web/app/page.tsx:1121)
- [ ] `?departure=<id>` — written by the shell's openDepartures (from Now) before opening Agent Ops ▸ Departures (web/app/page.tsx:1769)
- [ ] `?create=agent` — written by the palette's "Create agent"; consumed by Agent Ops (web/components/CommandPalette.tsx:416)
- [ ] Bare `/` with org setting `chat_first_home` — redirects once to `/chat` (web/app/page.tsx:1536)
- [ ] `pramanyx:navigate` window event — a nested surface asks the shell to change screen (validated against VALID_TABS; may carry conn, id, run) (web/app/page.tsx:1200)
- [ ] `pramanyx:ask-spotlight` window event — opens the palette straight into Spotlight with a parked question (askSpotlight) (web/app/page.tsx:1400)
- [ ] `pramanyx:turn-complete` window event — re-reads /me/preferences so a theme set in chat applies without reload (web/app/page.tsx:1391)
- [ ] localStorage keys: `pramanyx_last_conn`, `pramanyx_last_workspace`, `pramanyx_theme`, the rail's collapsed key (web/app/page.tsx:877, web/lib/themeSwitch.ts:14, web/lib/navCollapse.ts:14)

### Empty / error / loading / withheld states
- [ ] "No connections in the org yet — add one first, then pick it here." — membership editor with no connections (web/components/WorkspaceSwitcher.tsx:186)
- [ ] "Create failed." / "Save failed." / "Delete failed." (or the server's message) — red line at the top of the workspace popover (web/components/WorkspaceSwitcher.tsx:109, :121, :135)
- [ ] Workspace pill reads "—" until workspaces load (web/components/WorkspaceSwitcher.tsx:157)
- [ ] LIVE strip not drawn at all when /obs/timeseries cannot be read ("no ticks is honest") (web/components/shell/ActivityStrip.tsx:99)
- [ ] "OIDC configured — supply a bearer token" — non-Google OIDC, signed out (web/components/AuthControl.tsx:112)
- [ ] "No results for "<query>"" — palette, nothing matched (web/components/CommandPalette.tsx:700)
- [ ] "No object is named "<q>" — searched …" — palette object search found none (web/components/CommandPalette.tsx:777)
- [ ] Palette command failure — red role=alert line with the error ("The command failed.") (web/components/CommandPalette.tsx:693)
- [ ] "Asking Spotlight…" — Spotlight before the first turn; "Answering…" placeholder while streaming (web/components/CommandPalette.tsx:651, :680)
- [ ] "The linked canvas isn't in this workspace" + "It may have been deleted, or it belongs to another workspace." — toast for a `?canvas=` link (web/app/page.tsx:1494)
- [ ] Approval: "Approval failed" (or server message); after approve "✓ Approved — it is running now." or "✓ Approved. Retry the action — it will now proceed." (web/components/ApprovalModal.tsx:64, :115)
- [ ] History overlay: "No Agent runs yet." / "No matches"; delete-all confirm "Delete all <n> Agent runs and chats? … can't be undone." (web/components/HistoryPanel.tsx:76, :91, :133)
- [ ] Lazy panels show 6 skeleton rows while their code loads (web/app/page.tsx:51)
- [ ] Context not ready: screens that depend on a connection read `contextReady` so a cold load does not paint an empty "no connection" state (web/app/page.tsx:1426)
- [ ] Failed rail-count reads are swallowed: the badge is simply absent (same look as zero) (web/components/shell/useNavCounts.ts:57)

### Loads on open
- [ ] GET /connections — the connection list (web/lib/api.ts:30 → pramanyx/routers/connections.py:82)
- [ ] GET /workspaces — the workspace list (web/lib/api.ts:172 → pramanyx/routers/workspace.py:49) [WRITES ON OPEN: ensure_default_workspace() creates the Default workspace if absent and adds newly registered connections to it, on every call]
- [ ] GET /me/preferences — theme and look (accent, grey, corners, scaling); again after every chat turn (web/lib/api.ts:45 → pramanyx/routers/preferences.py:18)
- [ ] GET /org-settings/effective — currency/date formats and the chat-first-home redirect; again on workspace switch (web/lib/api.ts:529 → pramanyx/routers/orgsettings.py:137)
- [ ] GET /business-profile/currency — the dataset's confirmed currency, per connection + schema (web/lib/api.ts:8517 → pramanyx/routers/profile.py:30)
- [ ] GET /auth/config — which identity control to draw (web/components/AuthControl.tsx:59)
- [ ] GET /obs/timeseries?source=jobs&range=24h — LIVE ticks; on job/exploration kernel events (throttled 10 s) and every 60 s (web/lib/api.ts:11550 → pramanyx/routers/obs.py:678)
- [ ] GET /jobs?state=active&limit=200 — LIVE "<n> live" (Worker jobs excluded) (web/lib/api.ts:9219 → pramanyx/routers/jobs.py:71)
- [ ] GET /exploration/{conn}/status — LIVE "exploring" (web/lib/api.ts:2530 → pramanyx/routers/exploration.py:438)
- [ ] GET /alerts?limit=100&workspace_id= — Monitors badge; on monitor/investigation/inquiry/outcome events (throttled 5 s), every 60 s and on the waiting-changed event (web/lib/api.ts:5637 → pramanyx/routers/monitors.py:318)
- [ ] GET /investigations?workspace_id= — Agent runs badge (web/components/shell/useNavCounts.ts:58 → pramanyx/routers/investigations.py:6384)
- [ ] GET /record/decisions?due=true, GET /record/inquiries?due=true, GET /record/set-aside — Now badge (web/lib/record.ts:383, :203, :665 → pramanyx/routers/record.py:274, :560, :846)
- [ ] GET /departures/summary (or GET /departures?awaiting=true&limit=200 when a departure is set aside) — Now badge (web/lib/api.ts:6975, :6964 → pramanyx/routers/departures.py:75)
- [ ] GET /canvases?workspace_id= — only when a `?canvas=` link is pending (web/lib/api.ts:4426 → pramanyx/routers/canvas.py:55)
- [ ] Palette, on every open: GET /investigations (recent runs) and GET /connections/{id}/schema/rich (tables, shared cache) (web/components/CommandPalette.tsx:282, :292)
- [ ] Palette, while typing (2+ chars): POST /objects/find (read-only search, POST body) (web/lib/objects.ts:449)
- [ ] Palette "Ask Spotlight", follow-ups, and selecting a recent run or a table: start a chat turn via POST /api/chat, which forwards to the API's /ask or /chat [SPENDS: each is a model-backed chat turn; Spotlight pins depth "quick", a recent run or a table opens a full chat turn on the chat screen] (web/lib/usePramanyxChat.ts:85, web/app/api/chat/route.ts:247, web/components/CommandPalette.tsx:228)
- [ ] Not polled by the shell on purpose: GET /control-room/needs-human (it writes), which stays inside Agent Ops (web/components/shell/useNavCounts.ts:17)

### In flight on 2026-11-10 (uncommitted in the live checkout, not part of the baseline; listed so it is not double-counted)
- [ ] PageHeader — breadcrumb (Destination › Section, crumbs clickable) + page title + one status chip + facts + actions + one toolbar row, fed by `usePageChrome` (web/components/shell/PageChrome.tsx:96, web/app/page.tsx:1926)
- [ ] StatusStrip footer — connection name · engine, running-runs count (web/components/shell/PageChrome.tsx:140, web/app/page.tsx:2345)
- [ ] Inspector side panel — resizable (grip, keyboard), tabs, "Close · Esc" (web/components/shell/Inspector.tsx:79, :128, :141)

**Top rows today:** Top bar, left to right: Pramanyx wordmark · workspace switcher pill · LIVE activity strip · (right) "Search, ask, or run a command ⌘K" · dark/light segmented toggle · user menu. There is no connection picker in the shell: connection pickers live inside pages (Agent Ops context bar, Intelligence, Data). Rail head: collapse toggle. Rail foot: Settings · "v2 · Local".
