"use client";
/**
 * Monitors — redone to `pramanyx-v2/CLARITY.md` (2026-10-12): four figures (how many, open alerts, proven to fire,
 * checks a day), then what needs a person — open alerts, monitors never proven to fire — then the alerts over twelve
 * weeks, then the monitors; identical alerts fold into one row with a count.
 *
 * Redone again to the Evidence → Action study's observability (§14.3, 2026-11-10): the monitors are a register — On ·
 * Monitor (what it watches) · Rule · Schedule · Proof · Last alert · Open · Sends to · Run now — and a selected one opens
 * in the shell's inspector: its overview, its query, its alerts as a log with each one's severity beside what it affects,
 * and its actions (Run now, the proofs, Edit, Delete — what its Details fold held). Under them, the connection's run
 * log: every check from the SQL audit log, with its time, its rows, how long it took and how it ended — said as what it
 * is, the statement, since the log does not name the monitor that ran it.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  MonitorDef,
  MonitorAlert,
  getMonitors,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  triggerMonitor,
  getAllAlerts,
  acknowledgeAlert,
  getMetrics,
  getActionTriggers,
  type ActionTrigger,
  Metric,
  MonitorProof,
  backtestMonitor,
  drillMonitor,
  getMonitorProof,
  getQueryHistory,
  type AuditRecord,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { TabStrip } from "@/components/ui/tab-strip";
import { ChromeActions, ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import { InspectorFacts, useInspector } from "@/components/shell/Inspector";
import { RadioCards } from "@radix-ui/themes";
import { EmptyState as SharedEmptyState } from "@/components/ui/empty-state";
import { takeMonitorDraft } from "@/lib/query/monitorDraft";
import { Loading, ReadFailed } from "@/components/ui/states";
import { SelectField } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { FormDialog } from "@/components/ui/dialog";
import { useConnectionMetrics } from "@/components/metrics/MetricField";
import { countNoun, formatCount, formatTimestamp, relTime } from "@/lib/format";
import { withUniqueKeys } from "@/lib/listKeys";
import { offeredMetrics } from "@/lib/metricField";
import {
  alertText, alertsByWeek, channelWords, checksPerDay, dayMonth, FIRES, firedOnly, foldAlerts, fromRemovedMonitors, isOpen,
  isRecovery, proofState, proofWords, removedWords, ruleWords,
  scheduleMix, scheduleWords, short, type AlertGroup, type ProofState,
} from "@/lib/monitorSummary";
import {
  CARD, Chip, Columns, Dot, Empty, Figure, Figures, Label, MUTED, NeedsRow, NeedsYou, NUM, ONE_LINE, Page, ROW, RULE, type Tone,
} from "@/components/clarity/kit";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertOn = MonitorDef["alert_on"];
type View = "list" | "alerts";

const ALERT_TYPES: { value: AlertOn; label: string; desc: string }[] = [
  { value: "threshold_cross", label: "Threshold", desc: "Alert when value crosses a boundary" },
  { value: "anomaly",         label: "Anomaly",   desc: "Statistical deviation from rolling mean" },
  { value: "trend_reversal",  label: "Trend reversal", desc: "Direction of change flips" },
  { value: "segment_drift",   label: "Segment drift",  desc: "Distribution shifts across a dimension" },
  { value: "data_freshness",  label: "Data freshness", desc: "Table hasn't updated within SLA" },
  { value: "any_change",      label: "Any change",     desc: "Fire on every value change" },
];

const CRON_PRESETS = [
  { label: "Hourly",   cron: "0 * * * *" },
  { label: "Every 6h", cron: "0 */6 * * *" },
  { label: "Daily",    cron: "0 9 * * *" },
  { label: "Weekly",   cron: "0 9 * * 1" },
  { label: "Custom",   cron: "" },
];

/** A severity names a state by its hue (INSTRUMENT §3): critical adverse, warning needs a person, info plain. */
const SEVERITY_HUE: Record<string, "red" | "amber" | "blue"> = { critical: "red", warning: "amber", info: "blue" };

const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** The proof chip's tone: amber where a person is owed a proof, green where the alert path was seen end to end. */
const PROOF_TONE: Record<ProofState, Tone> = {
  proven: "up", delivered: "up", checked: "plain", undelivered: "amber", silent: "amber", never: "amber", unknown: "plain",
};

/** The server's proof sentence with its timestamps as a person reads them. */
function proofSentence(s: string): string {
  return s.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?/g, iso => dayMonth(iso));
}

// ── Blank form state ──────────────────────────────────────────────────────────

function blankForm(connId: string): Partial<MonitorDef> & { conn_id: string; name: string } {
  return {
    conn_id: connId,
    name: "",
    metric_name: null,
    custom_sql: null,
    check_cron: "0 * * * *",
    alert_on: "threshold_cross",
    warning_threshold: null,
    critical_threshold: null,
    threshold_direction: "below",
    sigma_threshold: 2.5,
    history_days: 30,
    dimension_column: null,
    freshness_table: null,
    freshness_column: "updated_at",
    freshness_sla_hours: 24,
    grace_period_hours: 4,
    notification_channel: "in_app",
    enabled: true,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  connId?: string;
  workspaceId?: string;
}

export function MonitorsPanel({ connId, workspaceId }: Props) {
  const [view, setView]           = useState<View>("list");
  const inShell = useInShell();
  /** The create/edit form, a dialog over the page — opened only by New monitor, Create first monitor, a row's Edit, or
   *  a statement the workbench handed over (the user, 2026-11-07: "a pop-up overlay where I enter the details"). */
  const [formOpen, setFormOpen]   = useState(false);
  const [monitors, setMonitors]   = useState<MonitorDef[]>([]);
  const [alerts, setAlerts]       = useState<MonitorAlert[]>([]);
  const [metrics, setMetrics]     = useState<Metric[]>([]);
  /** Where an alert can go besides in-app; null when they could not be read. */
  const [triggers, setTriggers]   = useState<ActionTrigger[] | null>(null);
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);
  const [readFailed, setReadFailed] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<MonitorDef | null>(null);
  const [form, setForm]           = useState<Partial<MonitorDef> & { conn_id: string; name: string }>(blankForm(connId ?? ""));
  const [cronPreset, setCronPreset] = useState("0 * * * *");
  const [isCustomCron, setIsCustomCron] = useState(false);
  const [metricSource, setMetricSource] = useState<"catalog" | "sql">("catalog");
  const [runResult, setRunResult] = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  /** Each monitor's proof — null where the read failed, absent while it is being read. */
  const [proofs, setProofs]       = useState<Record<string, MonitorProof | null>>({});
  const [checking, setChecking]   = useState(false);
  const [openRows, setOpenRows]   = useState<ReadonlySet<string>>(new Set());

  // SE-4 I — a statement handed over by the query workbench's "Schedule". Opens the
  // form on the custom-SQL source with the SQL already in it, and stops there: the
  // thresholds are the user's call, and a monitor invented with a default one is an
  // alert that fires at 3am for a number nobody chose.
  useEffect(() => {
    const draft = takeMonitorDraft(connId ?? "");
    if (!draft) return;
    setEditTarget(null);
    setForm({ ...blankForm(draft.connId), custom_sql: draft.sql, name: "" });
    setMetricSource("sql");
    setFormOpen(true);
  }, [connId]);

  const readProofs = useCallback(async (ms: MonitorDef[]) => {
    const got = await Promise.allSettled(ms.map(m => getMonitorProof(m.id)));
    setProofs(Object.fromEntries(ms.map((m, i) => {
      const r = got[i];
      return [m.id, r.status === "fulfilled" ? r.value : null];
    })));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ms, as, mets, trs] = await Promise.all([
        getMonitors(connId, workspaceId),
        getAllAlerts(connId, 100, workspaceId),
        getMetrics().catch(() => []),
        getActionTriggers().catch(() => null),
      ]);
      setMonitors(ms);
      setAlerts(as);
      setMetrics(mets);
      setTriggers(trs);
      setReadFailed(null);
      void readProofs(ms);
    } catch (e: unknown) {
      setReadFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [connId, workspaceId, readProofs]);

  useEffect(() => { load(); }, [load]);

  // ── Form helpers ─────────────────────────────────────────────────────────────

  function openCreate() {
    setEditTarget(null);
    setForm(blankForm(connId ?? ""));
    setCronPreset("0 * * * *");
    setIsCustomCron(false);
    setMetricSource("catalog");
    setError(null);
    setFormOpen(true);
  }

  function openEdit(m: MonitorDef) {
    setEditTarget(m);
    setForm({ ...m });
    const preset = CRON_PRESETS.find(p => p.cron === m.check_cron && p.label !== "Custom");
    setCronPreset(m.check_cron);
    setIsCustomCron(!preset);
    setMetricSource(m.custom_sql ? "sql" : "catalog");
    setError(null);
    setFormOpen(true);
  }

  /** A failed save's error belongs to the form: put away with it, it is not left on the page. */
  function closeForm() {
    setFormOpen(false);
    setError(null);
  }

  function setField<K extends keyof MonitorDef>(key: K, val: MonitorDef[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function save() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.conn_id)     { setError("Connection ID is required"); return; }
    setSaving(true);
    setError(null);
    try {
      if (editTarget) {
        await updateMonitor(editTarget.id, form);
      } else {
        await createMonitor(form as MonitorDef & { conn_id: string; name: string });
      }
      await load();
      setFormOpen(false);
      setView("list");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this monitor?")) return;
    try {
      await deleteMonitor(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
    await load();
  }

  async function runNow(id: string) {
    setRunResult(r => ({ ...r, [id]: "running…" }));
    try {
      const res = await triggerMonitor(id);
      // What it read is said with the verdict, so "no condition met" can be checked against the line (Gap 36).
      const read = res.read ? ` · ${res.read}` : "";
      const msg = "fired" in res && res.fired === false
        ? `No condition met${read}`
        : `Would fire: ${(res as MonitorAlert).severity} — ${alertText((res as MonitorAlert).message)}${read} · shown, not sent`;
      setRunResult(r => ({ ...r, [id]: msg }));
      setTimeout(() => setRunResult(r => { const n = { ...r }; delete n[id]; return n; }), 6000);
    } catch {
      setRunResult(r => ({ ...r, [id]: "Error" }));
    }
  }

  async function toggle(m: MonitorDef) {
    try {
      await updateMonitor(m.id, { enabled: !m.enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
    await load();
  }

  async function ack(ids: string[]) {
    const failed: string[] = [];
    await Promise.all(ids.map(id => acknowledgeAlert(id).then(
      () => setAlerts(as => as.map(a => a.id === id ? { ...a, acknowledged: true } : a)),
      // Optimistic flip on a failed ack left the UI lying until the next load.
      e => { failed.push(e instanceof Error ? e.message : "Acknowledge failed"); },
    )));
    if (failed.length) setError(failed[0]);
  }

  /** Feeds each rule a synthetic outlier — no warehouse query, nothing sent — and reads the proofs again. */
  async function checkRules(ms: MonitorDef[]) {
    setChecking(true);
    setError(null);
    for (const m of ms) {
      try { await drillMonitor(m.id, false); }
      catch (e) { setError(`${m.name}: ${e instanceof Error ? e.message : "the check failed"}`); }
    }
    await readProofs(monitors);
    setChecking(false);
  }

  // ── Cron picker ───────────────────────────────────────────────────────────────

  function handleCronPreset(cron: string) {
    if (cron === "") {
      setIsCustomCron(true);
    } else {
      setIsCustomCron(false);
      setCronPreset(cron);
      setField("check_cron", cron);
    }
  }

  // open: not acknowledged, and not closed by a recovery (TC-4) — a recovery itself waits on nobody
  const openAlerts = useMemo(() => alerts.filter(isOpen), [alerts]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const viewTabs = [
    { id: "list" as View, label: "Overview" },
    { id: "alerts" as View, label: "Alerts", badge: openAlerts.length },
  ];
  const newMonitor = (
    <Button variant="ghost" size="xs" onClick={openCreate} aria-haspopup="dialog"><Icon name="plus" size={12} />New monitor</Button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-0)", color: "var(--t1)" }}>
      {/* The views as a tab strip, and the page's one door. The first view is "Overview": the title already says
          "Monitors". Inside the app the views go to the shell's toolbar row and the door to the title row (2026-11-10,
          ROADMAP §6 item 64); outside it they keep their one row. */}
      {inShell ? (
        <>
          <ChromeToolbar>
            <TabStrip label="Monitor views" value={view} onChange={setView} className="aug-layer-tabs" tabs={viewTabs} />
          </ChromeToolbar>
          <ChromeActions>{newMonitor}</ChromeActions>
        </>
      ) : (
        <TabStrip label="Monitor views" value={view} onChange={setView}
          style={{ padding: "12px 20px 0", flexShrink: 0 }}
          tabs={viewTabs}
          trailing={newMonitor} />
      )}

      <FormDialog open={formOpen} onOpenChange={o => { if (!o) closeForm(); }}
        title={editTarget ? "Edit monitor" : "New monitor"} testId="monitor-form-dialog" width={640}>
        <MonitorForm
          form={form}
          setField={setField}
          metricSource={metricSource}
          setMetricSource={setMetricSource}
          triggers={triggers}
          cronPreset={cronPreset}
          isCustomCron={isCustomCron}
          onCronPreset={handleCronPreset}
          onCustomCronChange={v => { setField("check_cron", v); setCronPreset(v); }}
          saving={saving}
          error={error}
          isEdit={!!editTarget}
          onSave={save}
          onCancel={closeForm}
        />
      </FormDialog>

      <Page testId={view === "list" ? "monitors-overview" : "monitors-alerts"}>
        {/* The form's own error is said in the form while it is open, not twice. */}
        {error && !formOpen && <div role="alert" className="aug-fs-sm" style={{ color: "var(--red4)" }}>{error}</div>}
        {readFailed && <ReadFailed what="the monitors" error={readFailed} onRetry={load} />}
        {!loaded && loading && <Loading what="monitors" />}
        {loaded && !readFailed && view === "alerts" && <AlertsList alerts={alerts} monitors={monitors} onAck={ack} />}
        {loaded && !readFailed && view === "list" && (monitors.length === 0
          ? <EmptyState onAdd={openCreate} />
          : <Overview monitors={monitors} alerts={alerts} openAlerts={openAlerts} proofs={proofs} metrics={metrics} triggers={triggers}
              checking={checking} runResult={runResult} openRows={openRows}
              onToggleRow={id => setOpenRows(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onAck={ack} onSeeAlerts={() => setView("alerts")} onCheckRules={checkRules} onEdit={openEdit}
              onDelete={m => remove(m.id)} onRun={m => runNow(m.id)} onToggle={toggle} connId={connId}
              onProofChanged={() => readProofs(monitors)} />)}
      </Page>
    </div>
  );
}

// ── The overview: figures, Needs you, the picture, the list ───────────────────

function Overview({ monitors, alerts, openAlerts, proofs, metrics, triggers, checking, runResult, openRows, onToggleRow, onAck,
  onSeeAlerts, onCheckRules, onEdit, onDelete, onRun, onToggle, onProofChanged, connId }: {
  /** The connection whose checks the run log reads (none: every connection's monitors — no one log). */
  connId?: string;
  monitors: MonitorDef[];
  alerts: MonitorAlert[];
  openAlerts: MonitorAlert[];
  proofs: Record<string, MonitorProof | null>;
  metrics: Metric[];
  triggers: ActionTrigger[] | null;
  checking: boolean;
  runResult: Record<string, string>;
  openRows: ReadonlySet<string>;
  onToggleRow: (id: string) => void;
  onAck: (ids: string[]) => void;
  onSeeAlerts: () => void;
  onCheckRules: (ms: MonitorDef[]) => void;
  onEdit: (m: MonitorDef) => void;
  onDelete: (m: MonitorDef) => void;
  onRun: (m: MonitorDef) => void;
  onToggle: (m: MonitorDef) => void;
  onProofChanged: () => void;
}) {
  const inspector = useInspector();
  const held = inspector.subject?.key;
  // The inspector shows the picked monitor; when its proof, its alerts or a Run now's result change, it is drawn again
  // from them, so it never says a state the row has left.
  useEffect(() => {
    if (!held?.startsWith("monitor:")) return;
    const m = monitors.find(x => `monitor:${x.id}` === held);
    if (!m) { inspector.close(); return; }
    inspector.inspect(monitorSubject({
      monitor: m, proof: proofs[m.id], proofRead: m.id in proofs,
      metricLabel: m.metric_name ? (metrics.find(x => x.name === m.metric_name)?.label ?? m.metric_name) : null,
      channel: channelWords(m.notification_channel, triggers), alerts: alerts.filter(a => a.monitor_id === m.id),
      runResult: runResult[m.id], onEdit: () => onEdit(m), onDelete: () => onDelete(m), onRun: () => onRun(m), onProofChanged,
    }));
  }, [monitors, alerts, proofs, runResult]);   // eslint-disable-line react-hooks/exhaustive-deps
  const on = monitors.filter(m => m.enabled);
  const read = monitors.filter(m => m.id in proofs);
  const unread = read.filter(m => proofs[m.id] === null);
  const stateOf = (m: MonitorDef) => proofState(proofs[m.id]);
  const fires = read.filter(m => FIRES.has(stateOf(m)));
  const endToEnd = read.filter(m => stateOf(m) === "proven" || stateOf(m) === "delivered");
  const never = read.filter(m => stateOf(m) === "never");
  const broken = read.filter(m => stateOf(m) === "silent" || stateOf(m) === "undelivered");
  const perDay = on.map(m => checksPerDay(m.check_cron));
  const known = perDay.filter((n): n is number => n != null);
  // a recovery (TC-4) closes an alert and is none: never counted, charted or "last"
  const fired = firedOnly(alerts);
  const lastAlert = [...fired].sort((a, b) => b.triggered_at.localeCompare(a.triggered_at))[0];
  const acked = fired.filter(a => a.acknowledged).length;
  const closed = fired.filter(a => !a.acknowledged && a.closed_by).length;

  const openByMonitor = new Map<string, MonitorAlert[]>();
  for (const a of openAlerts) openByMonitor.set(a.monitor_id, [...(openByMonitor.get(a.monitor_id) ?? []), a]);
  const alertsOf = (id: string) => alerts.filter(a => a.monitor_id === id);

  const weeks = alertsByWeek(fired, new Date(), 12);
  const inWeeks = weeks.reduce((s, w) => s + w.n, 0);
  // an alert outlives its monitor (supersede, do not delete): said apart, as Notifications says its removed triggers
  const since = weeks[0]?.start.toISOString() ?? "";
  const removedInWeeks = removedWords(fired.filter(a => a.triggered_at >= since), monitors);
  const removed = removedWords(fired, monitors);

  return (
    <>
      <Figures testId="monitor-figures">
        <Figure label="Monitors" value={formatCount(monitors.length)} testId="fig-monitors"
          sub={on.length === monitors.length ? "all on" : `${on.length} on · ${monitors.length - on.length} off`} />
        <Figure label="Open alerts" value={formatCount(openAlerts.length)} tone={openAlerts.length ? "amber" : undefined} testId="fig-open"
          sub={fired.length === 0 ? "none has fired here yet"
            : `${formatCount(acked)} acknowledged${closed ? ` · ${formatCount(closed)} closed by a recovery` : ""} · last ${dayMonth(lastAlert.triggered_at)}${removed ? ` · ${removed}` : ""}`} />
        <Figure label="Proven to fire" testId="fig-proven"
          value={read.length < monitors.length ? "—" : `${fires.length} of ${monitors.length}`}
          sub={read.length < monitors.length ? "reading their proofs…"
            : unread.length ? `${unread.length} could not be read`
            : endToEnd.length ? `${endToEnd.length} delivered end to end` : "none delivered end to end"} />
        <Figure label="Checks a day" value={known.length ? short(known.reduce((s, n) => s + n, 0)) : "—"} testId="fig-checks"
          title="Each check runs the monitor's query on its connection"
          sub={on.length ? `${scheduleMix(on)}${known.length < on.length ? " · not all counted" : ""}` : "every monitor is off"} />
      </Figures>

      <NeedsYou testId="monitor-needs" empty={read.length < monitors.length || unread.length
        ? "Nothing needs you · no open alert"
        : "Nothing needs you · no open alert, and every monitor has been seen to fire"}>
        {[
          ...[...openByMonitor.entries()].map(([id, open]) => (
            <NeedsRow key={`open-${id}`} testId="needs-open"
              title={`${open[0].monitor_name}${monitors.some(m => m.id === id) ? "" : " · since removed"} · ${plural(open.length, "open alert")}`}
              detail={`${alertText(open[0].message)}${open.some(a => a.caveat) ? " · value may be mis-computed" : ""}`}
              actions={<>
                <Button size="xs" variant="secondary" onClick={() => onAck(open.map(a => a.id))}>
                  {open.length === 1 ? "Acknowledge" : "Acknowledge all"}
                </Button>
                <Button size="xs" variant="ghost" onClick={onSeeAlerts}>See alerts</Button>
              </>} />
          )),
          never.length > 0 && (
            <NeedsRow key="never" testId="needs-never"
              title={`${never.length === 1 ? "1 monitor has" : `${never.length} monitors have`} never been proven to fire`}
              detail="Checking feeds each rule a made-up outlier — no query runs and nothing is sent"
              actions={<Button size="xs" variant="secondary" disabled={checking} onClick={() => onCheckRules(never)}>
                {checking ? "Checking…" : never.length === 1 ? "Check its rule" : "Check their rules"}
              </Button>} />
          ),
          ...broken.map(m => (
            <NeedsRow key={`broken-${m.id}`} testId="needs-broken"
              title={`${m.name}: ${stateOf(m) === "silent" ? "its rule did not fire in a drill" : "its test alert was not delivered"}`}
              detail={proofs[m.id]?.last_drill?.detail}
              actions={<Button size="xs" variant="secondary" onClick={() => onEdit(m)}>Edit</Button>} />
          )),
        ]}
      </NeedsYou>

      {/* The picture appears when there is something to picture: with no alert in the twelve weeks, the figure above
          already says when the last one fired, or that none has. */}
      {inWeeks > 0 && (
        <section aria-label="Alerts over twelve weeks" data-testid="monitor-alert-weeks" style={CARD}>
          <Label right={<span>{`${plural(inWeeks, "alert")}${removedInWeeks ? ` · ${removedInWeeks}` : ""}${alerts.length >= 100 ? " · of the latest 100 read" : ""}`}</span>}>
            Alerts · last 12 weeks
          </Label>
          <Columns columns={weeks.map(w => ({
            key: w.start.toISOString(), value: w.n, label: dayMonth(w.start.toISOString()),
            tip: `Week of ${dayMonth(w.start.toISOString())}: ${plural(w.n, "alert")}${w.n ? ` — ${Object.entries(w.bySeverity)
              .map(([s, n]) => `${n} ${s}`).join(", ")}` : ""}`,
          }))} />
        </section>
      )}

      <section aria-label="Monitors" data-testid="monitor-list" style={CARD}>
        <Label>Monitors</Label>
        <div style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Monitors" style={{ minWidth: 1060 }}>
            <div role="row" className="aug-fs-xs" style={{ ...REGISTER, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px 8px" }}>
              <span role="columnheader">On</span><span role="columnheader">Monitor</span><span role="columnheader">Rule</span>
              <span role="columnheader">Schedule</span><span role="columnheader">Proof</span><span role="columnheader">Last alert</span>
              <span role="columnheader">Sends to</span><span role="columnheader" />
            </div>
            {monitors.map(m => {
              const metricLabel = m.metric_name ? (metrics.find(x => x.name === m.metric_name)?.label ?? m.metric_name) : null;
              const channel = channelWords(m.notification_channel, triggers);
              const pick = () => inspector.inspect(monitorSubject({
                monitor: m, proof: proofs[m.id], proofRead: m.id in proofs, metricLabel, channel, alerts: alertsOf(m.id),
                runResult: runResult[m.id], onEdit: () => onEdit(m), onDelete: () => onDelete(m), onRun: () => onRun(m),
                onProofChanged,
              }));
              return (
                <MonitorRow key={m.id} monitor={m} proof={proofs[m.id]} proofRead={m.id in proofs} metricLabel={metricLabel}
                  channel={channel} alerts={alertsOf(m.id)} runResult={runResult[m.id]}
                  picked={held === `monitor:${m.id}`} onPick={pick}
                  onRun={() => onRun(m)} onToggle={() => onToggle(m)} />
              );
            })}
          </div>
        </div>
      </section>

      {connId && <RunLog connId={connId} />}
    </>
  );
}

// ── A monitor, one row of the register ──────────────────────────────────────────

const REGISTER: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14,
  gridTemplateColumns: "44px minmax(190px, 2fr) minmax(140px, 1.4fr) minmax(70px, .7fr) minmax(220px, 1.7fr) minmax(110px, 1fr) minmax(100px, .9fr) 84px",
};

/** One monitor: on or off, what it is and watches, its rule, how often it checks, whether it has been proven to fire,
 *  its last alert (and how many are open), where it sends — and Run now. A click (or Enter) opens it in the inspector. */
function MonitorRow({ monitor, proof, proofRead, metricLabel, channel, alerts, runResult, picked, onPick, onRun, onToggle }: {
  monitor: MonitorDef;
  proof: MonitorProof | null | undefined;
  proofRead: boolean;
  metricLabel: string | null;
  /** Where its alerts go, in words (`channelWords`). */
  channel: string;
  alerts: MonitorAlert[];
  runResult?: string;
  picked: boolean;
  onPick: () => void;
  onRun: () => void;
  onToggle: () => void;
}) {
  const lastAlert = [...firedOnly(alerts)].sort((a, b) => b.triggered_at.localeCompare(a.triggered_at))[0];
  const unacked = alerts.filter(isOpen).length;
  const state = proofRead ? proofState(proof) : "unknown";
  const watches = metricLabel ? `watches ${metricLabel}` : "watches its own query";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div role="row" data-testid="monitor-row" tabIndex={0} aria-selected={picked} onClick={onPick}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      style={{ ...REGISTER, padding: "8px 0 8px 8px", borderTop: "1px solid var(--b0)", cursor: "pointer",
        background: picked ? "var(--bg-hover)" : undefined, boxShadow: picked ? "inset 2px 0 0 var(--blue3)" : undefined }}>
      <span role="cell" onClick={stop} onKeyDown={stop}>
        <Switch checked={monitor.enabled} onChange={onToggle}
          title={monitor.enabled ? "Turn off" : "Turn on"} aria-label={`${monitor.enabled ? "Turn off" : "Turn on"} ${monitor.name}`} />
      </span>
      <span role="cell" style={{ minWidth: 0 }}>
        <span className="aug-fs-chrome" title={monitor.name} style={{ ...ONE_LINE, display: "block", fontWeight: 600, color: "var(--t1)" }}>
          {monitor.name}
        </span>
        <span className="aug-fs-xs" style={{ ...MUTED, ...ONE_LINE, display: "block" }}>
          {watches}{!monitor.enabled ? " · off" : ""}
        </span>
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={ruleWords(monitor)}>{ruleWords(monitor)}</span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={monitor.check_cron}>{scheduleWords(monitor.check_cron)}</span>
      <span role="cell" style={{ minWidth: 0, overflow: "hidden" }}>
        {proofRead
          ? <Chip tone={PROOF_TONE[state]} title={proof ? proofSentence(proof.sentence) : "Could not read whether this alert was proven"}>
              {proof ? proofWords(proof) : "proof unread"}
            </Chip>
          : <span className="aug-fs-xs" style={MUTED}>reading…</span>}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ROW, gap: 6, flexWrap: "nowrap", color: "var(--t2)" }}>
        {lastAlert
          ? <span title={formatTimestamp(lastAlert.triggered_at)}>{`${relTime(lastAlert.triggered_at)} ago`}</span>
          : <span style={MUTED}>never fired</span>}
        {unacked > 0 && <Chip tone="amber">{`${unacked} open`}</Chip>}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: channel.startsWith("sends nowhere") ? "var(--amb4)" : "var(--t2)" }} title={channel}>{channel}</span>
      <span role="cell" onClick={stop} onKeyDown={stop} style={{ justifySelf: "end" }}>
        <Button size="xs" variant="outline" onClick={onRun} title={runResult || "Run its check now"}>Run now</Button>
      </span>
    </div>
  );
}

/** A monitor in the inspector: what it watches and how, its query, its alerts as a log — each one's severity beside
 *  what it affects — and its actions: Run now, the proofs, Edit and Delete (what the row's Details held). */
function monitorSubject({ monitor: m, proof, proofRead, metricLabel, channel, alerts, runResult, onEdit, onDelete, onRun, onProofChanged }: {
  monitor: MonitorDef; proof: MonitorProof | null | undefined; proofRead: boolean; metricLabel: string | null; channel: string;
  alerts: MonitorAlert[]; runResult?: string; onEdit: () => void; onDelete: () => void; onRun: () => void; onProofChanged: () => void;
}) {
  const fired = [...firedOnly(alerts)].sort((a, b) => b.triggered_at.localeCompare(a.triggered_at));
  const perDay = checksPerDay(m.check_cron);
  return {
    key: `monitor:${m.id}`, kind: "Monitor", title: m.name, icon: "health" as const,
    meta: <>{m.enabled ? "on" : "off"} · {scheduleWords(m.check_cron)}</>,
    tab: "overview" as const,
    tabs: {
      overview: <InspectorFacts rows={[
        { label: "Watches", value: metricLabel ? `the metric ${metricLabel}` : "its own query" },
        { label: "Rule", value: ruleWords(m) },
        { label: "Schedule", value: scheduleWords(m.check_cron), note: perDay != null ? `${countNoun(perDay, "check")} a day` : undefined },
        { label: "Sends to", value: channel },
        { label: "Quiet after an alert", value: `${m.grace_period_hours} h`,
          note: "The same or a lower severity stays quiet this long; a worse one fires at once" },
        { label: "Proof", value: proofRead ? (proof ? proofWords(proof) : "could not be read") : "reading…",
          note: proof ? proofSentence(proof.sentence) : undefined },
        ...(m.created_at ? [{ label: "Made", value: dayMonth(m.created_at) }] : []),
      ]} />,
      definition: m.custom_sql
        ? <pre data-testid="monitor-sql" className="aug-fs-xs" style={{ margin: 0, background: "var(--code-bg)", borderRadius: "var(--r2)", padding: "8px 10px",
            whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-code)", color: "var(--t2)" }}>{m.custom_sql}</pre>
        : <InspectorFacts rows={[{ label: "Watches the metric", value: metricLabel ?? m.metric_name ?? "—" }]} />,
      activity: fired.length === 0 ? <Empty>It has never fired.</Empty> : (
        <div data-testid="monitor-alert-log">
          {fired.slice(0, 30).map((a, i) => (
            <div key={a.id} className="aug-fs-xs" style={{ padding: "7px 0", ...(i ? RULE : {}) }}>
              <div style={{ ...ROW, gap: 6, flexWrap: "nowrap" }}>
                <Dot hue={SEVERITY_HUE[a.severity] ?? "blue"} />
                <span style={{ color: "var(--t1)", fontWeight: 500 }}>{a.severity}</span>
                <span style={MUTED} title={formatTimestamp(a.triggered_at)}>{formatTimestamp(a.triggered_at)}</span>
                <span style={{ marginLeft: "auto", ...MUTED }}>
                  {a.acknowledged ? "acknowledged" : a.closed_by ? "closed by a recovery" : "open"}
                </span>
              </div>
              <div style={{ color: "var(--t2)", marginTop: 2 }}>{alertText(a.message)}</div>
              <div style={{ ...MUTED, marginTop: 2 }}>
                {/* the severity beside what it affects (the study, §14.3) */}
                affects {a.metric_name ? `the metric ${a.metric_name}` : metricLabel ? `the metric ${metricLabel}` : "what its own query reads"}
                {a.current_value != null ? ` · read ${a.current_value}` : ""}{a.threshold != null ? ` against ${a.threshold}` : ""}
                {a.caveat ? " · the value may be mis-computed" : ""}
              </div>
            </div>
          ))}
          {fired.length > 30 && <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 6 }}>{`the latest 30 of ${formatCount(fired.length)}`}</div>}
        </div>
      ),
      actions: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={ROW}>
            <Button size="xs" variant="outline" onClick={onRun}>Run now</Button>
            <Button size="xs" variant="outline" onClick={onEdit}>Edit</Button>
            <Button size="xs" variant="destructive" onClick={onDelete}>Delete</Button>
          </div>
          {runResult && <div role="status" className="aug-fs-xs" style={MUTED}>{runResult}</div>}
          <MonitorProofRow monitorId={m.id} proof={proofRead ? proof : undefined} onChanged={onProofChanged} />
        </div>
      ),
    },
  };
}

// ── The run log: every check on the connection, from the SQL audit log ─────────────

/** How many of the newest checks the log reads — said on the card. */
const RUN_LOG_READ = 40;

function RunLog({ connId }: { connId: string }) {
  const [log, setLog] = useState<AuditRecord[] | null | undefined>(undefined);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setLog(undefined);
    getQueryHistory(connId, RUN_LOG_READ, "__monitor__")
      .then(r => { if (alive) setLog(r); }).catch(() => { if (alive) setLog(null); });
    return () => { alive = false; };
  }, [connId, again]);
  const failed = log ? log.filter(r => r.error).length : 0;
  return (
    <section aria-label="Run log" data-testid="monitor-run-log" style={CARD}>
      <Label right={log ? `the latest ${formatCount(log.length)} checks${failed ? ` · ${formatCount(failed)} failed` : ""} · the log names the statement, not the monitor` : undefined}>
        Run log
      </Label>
      {log === undefined ? <Loading what="the run log" />
        : log === null ? <ReadFailed what="the run log" onRetry={() => setAgain(n => n + 1)} />
        : log.length === 0 ? <Empty>No check has run on this connection yet.</Empty>
        : (
          <div style={{ overflowX: "auto" }}>
            <div role="table" aria-label="Run log" style={{ minWidth: 760 }}>
              <div role="row" className="aug-fs-xs" style={{ ...LOG_GRID, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px" }}>
                <span role="columnheader">When</span><span role="columnheader">Ended</span><span role="columnheader">Statement</span>
                <span role="columnheader" style={{ textAlign: "right" }}>Rows</span><span role="columnheader" style={{ textAlign: "right" }}>Took</span>
              </div>
              {log.map(r => (
                <div key={r.id} role="row" data-testid="run-log-row" className="aug-fs-xs" style={{ ...LOG_GRID, padding: "5px 0", ...RULE }}>
                  <span role="cell" style={{ ...MUTED, whiteSpace: "nowrap" }} title={r.ts}>{formatTimestamp(r.ts)}</span>
                  <span role="cell" style={{ color: r.error ? "var(--red4)" : "var(--grn4)" }} title={r.error ?? undefined}>{r.error ? "failed" : "ran"}</span>
                  <span role="cell" style={{ ...ONE_LINE, fontFamily: "var(--font-code)", color: "var(--t2)" }} title={r.sql_full}>{r.sql_full.replace(/\s+/g, " ")}</span>
                  <span role="cell" style={{ ...NUM, textAlign: "right", color: "var(--t2)" }}>{r.row_count == null ? "—" : formatCount(r.row_count)}</span>
                  <span role="cell" style={{ ...NUM, textAlign: "right", ...MUTED }}>{r.duration_ms == null ? "—" : `${formatCount(Math.round(r.duration_ms))} ms`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
    </section>
  );
}

const LOG_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14, gridTemplateColumns: "150px 60px minmax(0, 1fr) 70px 80px",
};

// ── Proof — idea 6, alerts that prove they work ─────────────────────────────────
// The backtest, the drill and "last proven working" were API doors only: a monitor
// could be proven, but nobody on a screen could ask for the proof or see it.

type ProofOutcome = { tone: "ok" | "warn"; text: string };

/** The proof's sentence and the three ways to earn one. Reads its own proof when the page has not (`proof` absent). */
export function MonitorProofRow({ monitorId, proof: given, onChanged }: {
  monitorId: string;
  /** The page's read of this monitor's proof — null when that read failed; absent to read it here. */
  proof?: MonitorProof | null;
  onChanged?: () => void;
}) {
  const [own, setOwn] = useState<MonitorProof | null>(null);
  const [ownFailed, setOwnFailed] = useState(false);
  const [busy, setBusy] = useState<"" | "backtest" | "check" | "send">("");
  const [outcome, setOutcome] = useState<ProofOutcome | null>(null);
  const standalone = given === undefined;

  const readProof = useCallback(() => {
    if (!standalone) { onChanged?.(); return; }
    getMonitorProof(monitorId)
      .then(p => { setOwn(p); setOwnFailed(false); })
      .catch(() => setOwnFailed(true));
  }, [monitorId, standalone, onChanged]);
  useEffect(() => { if (standalone) readProof(); }, [standalone, readProof]);

  const proof = standalone ? own : given;
  const failed = standalone ? ownFailed : given === null;

  async function run(kind: "backtest" | "check" | "send") {
    if (kind === "send" && !confirm(
      "Send a [DRILL] alert through this monitor's real channel? The people it notifies will see it.")) return;
    setBusy(kind);
    setOutcome(null);
    try {
      if (kind === "backtest") {
        const b = await backtestMonitor(monitorId);
        // The server's sentence has no subject ("would have fired 3 times in the last 362 days";
        // the quieter σ, when there is one, is already in it); a failed replay says why instead.
        setOutcome(b.ok && b.sentence
          ? { tone: "ok", text: `This alert ${b.sentence}` }
          : { tone: "warn", text: b.reason || b.sentence || "The backtest could not run." });
      } else {
        const d = await drillMonitor(monitorId, kind === "send");
        const text = !d.fired ? `The rule did not fire on a synthetic outlier: ${d.detail}`
          : d.delivered === true ? `Delivered a [DRILL] alert through ${d.channel || "its channel"}.`
          : d.delivered === false ? `The rule fired, but delivery failed: ${d.detail}`
          : "The rule fired on a synthetic outlier — no message was sent.";
        setOutcome({ tone: d.fired && d.delivered !== false ? "ok" : "warn", text });
        readProof();
      }
    } catch (e) {
      setOutcome({ tone: "warn", text: e instanceof Error ? e.message : "The request failed" });
    } finally {
      setBusy("");
    }
  }

  const btn = (kind: "backtest" | "check" | "send", label: string, title: string) => (
    <Button size="xs" variant="ghost" onClick={() => run(kind)} disabled={busy !== ""} title={title}>
      {busy === kind ? `${label}…` : label}
    </Button>
  );

  return (
    <div>
      <div style={{ ...ROW, gap: 6 }}>
        {proof || failed ? (
          <span className="aug-fs-xs" style={{ ...MUTED, flex: "1 1 160px", minWidth: 160 }}>
            {proof ? proofSentence(proof.sentence) : "Could not read whether this alert was proven."}
          </span>
        ) : (
          <Loading what="its proof" inline style={{ flex: "1 1 160px", minWidth: 160 }} />
        )}
        {btn("backtest", "Backtest", "Replay the last year of this monitor's own series under its rule — one warehouse query")}
        {btn("check", "Check rule", "Feed the rule a synthetic outlier; nothing is sent")}
        {btn("send", "Send test alert", "Feed the rule a synthetic outlier and deliver the [DRILL] alert through its real channel")}
      </div>
      {outcome && (
        <div role="status" className="aug-fs-xs" style={{ marginTop: 6, color: outcome.tone === "ok" ? "var(--t2)" : "var(--amb4)" }}>
          {outcome.text}
        </div>
      )}
    </div>
  );
}

// ── Alerts, repeats folded ────────────────────────────────────────────────────

function AlertsList({ alerts, monitors, onAck }: { alerts: MonitorAlert[]; monitors: MonitorDef[]; onAck: (ids: string[]) => void }) {
  const groups = useMemo(() => foldAlerts(alerts), [alerts]);
  const open = alerts.filter(isOpen).length;
  const gone = useMemo(() => new Set(fromRemovedMonitors(alerts, monitors).map(a => a.monitor_id)), [alerts, monitors]);
  return (
    <section aria-label="Alerts" data-testid="alert-list" style={CARD}>
      <Label right={alerts.length ? <span>{`${formatCount(alerts.length)}${alerts.length >= 100 ? " latest" : ""} · ${open} open`}</span> : null}>
        Alerts
      </Label>
      {groups.length === 0 ? <div className="aug-fs-sm" style={MUTED}>No alerts yet.</div>
        : groups.map((g, i) => <AlertRow key={g.key} g={g} first={i === 0} removed={gone.has(g.latest.monitor_id)}
            onAck={() => onAck(g.open)} />)}
    </section>
  );
}

function AlertRow({ g, first, removed, onAck }: { g: AlertGroup; first: boolean; removed: boolean; onAck: () => void }) {
  const a = g.latest;
  const settled = g.open.length === 0;
  // TC-4 — a recovery is one row of its own, nothing to acknowledge; the alert it closed reads "closed", not "acknowledged"
  const recovery = isRecovery(a);
  const when = g.count === 1 ? `${relTime(a.triggered_at)} ago`
    : dayMonth(g.first) === dayMonth(g.last) ? `${g.count} times · ${dayMonth(g.last)}` : `${g.count} times · ${dayMonth(g.first)} – ${dayMonth(g.last)}`;
  return (
    <div data-testid="alert-row" style={{ borderTop: first ? undefined : "1px solid var(--b0)", padding: "8px 2px", opacity: settled ? 0.6 : 1 }}>
      <div style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto auto", gap: 10, alignItems: "center" }}>
        <Dot hue={recovery ? "green" : SEVERITY_HUE[a.severity] ?? "grey"} title={recovery ? "recovered" : a.severity} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="aug-fs-chrome" style={{ ...ONE_LINE, fontWeight: 500, color: "var(--t1)" }}>{a.monitor_name}</span>
            {recovery
              ? <Chip tone="up" title="Back within its limit. A recovery is recorded here and never sent.">recovered</Chip>
              : <span className="aug-fs-xs" style={MUTED}>{a.severity}</span>}
            {a.caveat && <Chip tone="amber" title={a.caveat}>value may be mis-computed</Chip>}
            {removed && <Chip title="This monitor no longer exists — these alerts are history">since removed</Chip>}
          </div>
          <div className="aug-fs-xs" title={a.message} style={{ ...MUTED, ...ONE_LINE }}>
            {alertText(a.message)}{a.previous_value != null && !recovery ? ` · was ${short(a.previous_value)}` : ""} · {when}
          </div>
        </div>
        <span className="aug-fs-chrome" style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums", minWidth: 24, textAlign: "right" }}>
          {g.count > 1 ? `×${g.count}` : ""}
        </span>
        {recovery ? <span />
          : settled ? (a.closed_by && !a.acknowledged
            ? <span className="aug-fs-xs" style={MUTED} title={a.closed_at ? `Closed by a recovery ${relTime(a.closed_at)} ago` : undefined}>closed</span>
            : <span className="aug-fs-xs" style={MUTED}>acknowledged</span>)
          : <Button size="xs" variant="secondary" onClick={onAck}>{g.open.length > 1 ? `Acknowledge ${g.open.length}` : "Acknowledge"}</Button>}
      </div>
    </div>
  );
}

// ── Monitor form ──────────────────────────────────────────────────────────────

function MonitorForm({
  form, setField, metricSource, setMetricSource, triggers,
  cronPreset, isCustomCron, onCronPreset, onCustomCronChange,
  saving, error, isEdit, onSave, onCancel,
}: {
  form: Partial<MonitorDef> & { conn_id: string; name: string };
  setField: <K extends keyof MonitorDef>(k: K, v: MonitorDef[K]) => void;
  metricSource: "catalog" | "sql";
  setMetricSource: (s: "catalog" | "sql") => void;
  triggers: ActionTrigger[] | null;
  cronPreset: string;
  isCustomCron: boolean;
  onCronPreset: (cron: string) => void;
  onCustomCronChange: (v: string) => void;
  saving: boolean;
  error: string | null;
  isEdit: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const alertOn = form.alert_on ?? "threshold_cross";
  const channel = form.notification_channel || "in_app";
  // A stored channel that names no trigger (the form once offered "slack" and "email") is shown as what it is.
  const stranded = triggers !== null && channel !== "in_app" && !triggers.some(t => t.id === channel);
  // The metrics of the monitor's OWN connection: the set its name is resolved in when it runs
  // (`monitors/runner._metric_of` scopes `get_metric` to `conn_id`). Every connection's list offered a name twice
  // where two warehouses define it, and offered metrics this monitor could never read. Approved first, then
  // waiting for review and drafts; a retired definition is not offered — it would still run its old formula.
  const { metrics: own } = useConnectionMetrics(form.conn_id);
  const offered = offeredMetrics(own);
  // An existing monitor's metric that is no longer offered stays selectable, and says why.
  const kept = form.metric_name && !offered.some(m => m.name === form.metric_name)
    ? own.find(m => m.name === form.metric_name) ?? null : null;
  const keptWords = !form.metric_name || !own.length || offered.some(m => m.name === form.metric_name) ? null
    : kept?.status === "deprecated" ? `${kept.label || kept.name} — retired in the Semantic Layer`
    : `${form.metric_name} — not a governed metric on this connection`;

  return (
    <div data-testid="monitor-form" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Name — the dialog's title says New or Edit; the form does not say it again. */}
      <Field label="Name">
        <Input
          value={form.name}
          onChange={e => setField("name", e.target.value as any)}
          placeholder="e.g. Daily revenue drop alert"
          style={{ width: "100%" }}
        />
      </Field>

      {/* Metric source */}
      <Field label="Metric">
        <Segmented label="Metric source" value={metricSource} onChange={setMetricSource} style={{ marginBottom: 8, alignSelf: "flex-start" }}
          options={[{ value: "catalog", label: "From catalog" }, { value: "sql", label: "Custom SQL" }]} />
        {metricSource === "catalog" ? (
          <SelectField value={form.metric_name ?? ""} onChange={e => setField("metric_name", e.target.value as any)} style={{ width: "100%" }}>
            <option value="">Select a metric…</option>
            {keptWords && <option value={form.metric_name ?? ""}>{keptWords}</option>}
            {withUniqueKeys(offered, m => m.name).map(([key, m]) => (
              <option key={key} value={m.name}>{m.label || m.name}{m.status === "proposed" ? " — waiting for review" : m.status === "draft" ? " — draft" : ""}</option>
            ))}
          </SelectField>
        ) : (
          <Textarea
            rows={3}
            value={form.custom_sql ?? ""}
            onChange={e => setField("custom_sql", e.target.value as any)}
            placeholder="SELECT SUM(revenue) FROM orders WHERE date = CURRENT_DATE"
            style={{ width: "100%", resize: "vertical" }}
          />
        )}
      </Field>

      {/* Alert type */}
      <Field label="Alert condition">
        {/* A choice with a sentence under each option: Themes' radio cards. */}
        <RadioCards.Root size="1" columns="2" gap="2" aria-label="Alert condition" value={alertOn}
          onValueChange={v => setField("alert_on", v as AlertOn)}>
          {ALERT_TYPES.map(at => (
            <RadioCards.Item key={at.value} value={at.value} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span className="aug-fs-sm" style={{ fontWeight: 600 }}>{at.label}</span>
              <span className="aug-fs-xs" style={{ color: "var(--t3)", textAlign: "left" }}>{at.desc}</span>
            </RadioCards.Item>
          ))}
        </RadioCards.Root>
      </Field>

      {/* Conditional fields */}
      {alertOn === "threshold_cross" && (
        <>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Warning threshold" style={{ flex: 1 }}>
              <Input type="number" value={form.warning_threshold ?? ""}
                onChange={e => setField("warning_threshold", e.target.value ? Number(e.target.value) as any : null as any)}
                placeholder="e.g. 10000" style={{ width: "100%" }} />
            </Field>
            <Field label="Critical threshold" style={{ flex: 1 }}>
              <Input type="number" value={form.critical_threshold ?? ""}
                onChange={e => setField("critical_threshold", e.target.value ? Number(e.target.value) as any : null as any)}
                placeholder="e.g. 8000" style={{ width: "100%" }} />
            </Field>
          </div>
          <Field label="Direction">
            <Segmented label="Direction" value={form.threshold_direction ?? ""} onChange={d => setField("threshold_direction", d)} style={{ alignSelf: "flex-start" }}
              options={[{ value: "below", label: "Alert when below (e.g. revenue)" }, { value: "above", label: "Alert when above (e.g. error rate)" }]} />
          </Field>
        </>
      )}

      {(alertOn === "anomaly" || alertOn === "trend_reversal") && (
        <div style={{ display: "flex", gap: 12 }}>
          {alertOn === "anomaly" && (
            <Field label={`Sigma threshold (${form.sigma_threshold ?? 2.5}σ)`} style={{ flex: 1 }}>
              <input type="range" min={1} max={5} step={0.5}
                value={form.sigma_threshold ?? 2.5}
                onChange={e => setField("sigma_threshold", Number(e.target.value) as any)}
                style={{ width: "100%" }} />
              <div className="aug-fs-xs" style={{ display: "flex", justifyContent: "space-between", color: "var(--t3)" }}>
                <span>1σ (sensitive)</span><span>5σ (strict)</span>
              </div>
            </Field>
          )}
          <Field label="History window (days)" style={{ flex: 1 }}>
            <Input type="number" min={7} max={365}
              value={form.history_days ?? 30}
              onChange={e => setField("history_days", Number(e.target.value) as any)}
              style={{ width: "100%" }} />
          </Field>
        </div>
      )}

      {alertOn === "segment_drift" && (
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Dimension column" style={{ flex: 2 }}>
            <Input value={form.dimension_column ?? ""}
              onChange={e => setField("dimension_column", e.target.value as any)}
              placeholder="e.g. region, channel" style={{ width: "100%" }} />
          </Field>
          <Field label={`p-value threshold (${form.drift_p_threshold ?? 0.05})`} style={{ flex: 1 }}>
            <input type="range" min={0.01} max={0.2} step={0.01}
              value={form.drift_p_threshold ?? 0.05}
              onChange={e => setField("drift_p_threshold", Number(e.target.value) as any)}
              style={{ width: "100%" }} />
          </Field>
        </div>
      )}

      {alertOn === "data_freshness" && (
        <>
          <div style={{ display: "flex", gap: 12 }}>
            <Field label="Table" style={{ flex: 2 }}>
              <Input value={form.freshness_table ?? ""}
                onChange={e => setField("freshness_table", e.target.value as any)}
                placeholder="e.g. orders" style={{ width: "100%" }} />
            </Field>
            <Field label="Timestamp column" style={{ flex: 1 }}>
              <Input value={form.freshness_column ?? "updated_at"}
                onChange={e => setField("freshness_column", e.target.value as any)}
                style={{ width: "100%" }} />
            </Field>
          </div>
          <Field label="SLA (hours)">
            <Input type="number" min={1}
              value={form.freshness_sla_hours ?? 24}
              onChange={e => setField("freshness_sla_hours", Number(e.target.value) as any)}
              style={{ width: 120 }} />
          </Field>
        </>
      )}

      {/* Schedule */}
      <Field label="Schedule">
        <Segmented label="Schedule" style={{ marginBottom: 8, alignSelf: "flex-start" }}
          value={isCustomCron ? "Custom" : (CRON_PRESETS.find(p => p.cron === cronPreset && p.label !== "Custom")?.label ?? "")}
          onChange={label => onCronPreset(CRON_PRESETS.find(p => p.label === label)?.cron ?? "")}
          options={CRON_PRESETS.map(p => ({ value: p.label, label: p.label }))} />
        {isCustomCron && (
          <Input value={form.check_cron ?? ""}
            onChange={e => onCustomCronChange(e.target.value)}
            placeholder="cron expression, e.g. 0 9 * * 1-5"
            style={{ width: "100%" }} />
        )}
        {!isCustomCron && (
          <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 2 }}>
            Runs: <code style={{ fontFamily: "var(--font-code)" }}>{form.check_cron}</code>
          </div>
        )}
      </Field>

      {/* Grace period (anti-flap debounce) */}
      <Field label="Grace period (hours)">
        <Input type="number" min={0} step={0.5}
          value={form.grace_period_hours ?? 4}
          onChange={e => setField("grace_period_hours", Number(e.target.value) as any)}
          style={{ width: 120 }} />
        <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 2 }}>
          After an alert, the same or a lower severity stays quiet this long; a worse one fires at once.
        </div>
      </Field>

      {/* Notification */}
      <Field label="Notification">
        <SelectField aria-label="Notification" value={channel} onChange={e => setField("notification_channel", e.target.value)}
          style={{ width: "100%" }}>
          <option value="in_app">In-app</option>
          {(triggers ?? []).map(t => <option key={t.id} value={t.id}>{`${t.name} (${t.type})${t.enabled ? "" : " — off"}`}</option>)}
          {stranded && <option value={channel}>{`"${channel}" — no such destination`}</option>}
        </SelectField>
        {triggers !== null && triggers.length === 0 && (
          <div className="aug-fs-xs" style={{ color: "var(--t3)", marginTop: 2 }}>
            Alerts stay in-app until a webhook or Slack trigger exists under Operations ▸ Notifications.
          </div>
        )}
        {stranded && (
          <div className="aug-fs-xs" style={{ color: "var(--red4)", marginTop: 2 }}>
            {`"${channel}" names no destination, so these alerts are sent nowhere. Choose one.`}
          </div>
        )}
      </Field>

      {/* Error */}
      {error && <p className="aug-fs-sm" style={{ color: "var(--red4)", margin: 0 }}>{error}</p>}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button size="sm" onClick={onSave} disabled={saving} style={{ minWidth: 100 }}>
          {saving ? "Saving…" : isEdit ? "Update" : "Create monitor"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, ...style }}>
      <label className="aug-label aug-fs-xs" style={{ color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <SharedEmptyState icon="gauge" title="No monitors yet"
      action={<Button variant="secondary" size="xs" onClick={onAdd}>Create first monitor</Button>}>
      A monitor alerts you when a metric crosses a line, drifts, or goes stale.
    </SharedEmptyState>
  );
}
