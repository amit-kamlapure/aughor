"use client";
/**
 * Security & Audit — redone to `aughor-v2/CLARITY.md` (2026-10-12): the figures first, then what needs a person,
 * then who ran the queries, then the checks themselves folded into a row per caller and outcome. The log's rows are
 * still all here — behind each group's Show, and behind "All rows" — with their SQL, errors and verdicts.
 *
 * To the Evidence → Action study (2026-11-10): the fold is a register (Outcome · Who · What happened · Checks · When),
 * the log under it a sortable register whose row opens in the inspector — the whole statement with Open in SQL Editor,
 * the whole error, the log's own record; the verdict, the connection and a search over the statements sit in the
 * toolbar row after the lens. The approval trail is a log table (When · Decision · Action · Scope · Who).
 *
 * On theLook the page listed 200 rows a read, and 196 of them were the Briefer's period comparisons: a "suspicious"
 * flag written before each statement ran, then the same statement logged again as it ran (`lib/auditFold.ts` says
 * why). Folded, that is two rows, and the flags are named as the platform's own reads rather than counted as alarm.
 */
import { GateMapView, PoliciesView } from "@/components/operations/GateMapPanel";
import { requestTab } from "@/lib/navigate";
import { Loading, ReadFailed } from "@/components/ui/states";
import { GuardChip, type GuardVerdict } from "@/components/ui/trust";

import { connectionLabel } from "@/lib/names";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactNumber, fmtDate, formatCount, MONTHS_SHORT } from "@/lib/format";
import { getApiBase } from "@/lib/config";
import { ActivityLog } from "@/components/ActivityLog";
import {
  getConnections,
  getApprovalsAudit, getAllowlist, revokeApproval,
  type ApprovalAuditEvent, type AllowlistEntry,
} from "@/lib/api";
import {
  blockedSince, byCaller, callerName, callerText, flagSplit, foldChecks, fromWhom, isPlatformCaller, outcomeOf, OUTCOME_WORD,
  type AuditRecord, type CheckGroup, type Outcome,
} from "@/lib/auditFold";
import { SelectField } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Button } from "@/components/ui/button";
import { ChromeActions, ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import { InspectorFacts, useInspector } from "@/components/shell/Inspector";
import { useOpenInQuery } from "@/lib/openInQuery";
import { Icon } from "@/components/ui/icon";
import {
  CARD, Chip, Dot, Figure, Tally, HBars, Label, MUTED, NeedsRow, NeedsYou, ONE_LINE, Page, ROW,
} from "@/components/clarity/kit";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConnectionItem {
  id: string;
  name: string;
  conn_type: string;
}

interface AuditStats {
  total: number;
  blocked: number;
  suspicious: number;
  errors: number;
  pii_redacted: number;
  avg_duration_ms: number;
  /** GM-5 — the platform's own queries (probes, profiling, samples): counted, not listed. */
  internal_statements?: number;
  internal_since?: string | null;
}

interface QueryBudget {
  connection_id: string;
  max_rows: number;
  warn_time_ms: number;
  max_time_ms: number;
  is_default: boolean;
}

// ── API helpers ───────────────────────────────────────────────────────────────

/** The window the page folds: the latest checks, enough to show who ran them and to name the noise. */
const WINDOW = 500;

async function fetchAuditLog(connId?: string, verdict?: string, limit = WINDOW): Promise<AuditRecord[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (connId) qs.set("connection_id", connId);
  if (verdict) qs.set("verdict", verdict);
  const res = await fetch(`${getApiBase()}/security/audit?${qs}`);
  if (!res.ok) throw new Error("Failed to fetch audit log");
  const data = await res.json();
  return data.records ?? [];
}

async function fetchAuditStats(connId?: string): Promise<AuditStats> {
  const qs = connId ? `?connection_id=${connId}` : "";
  const res = await fetch(`${getApiBase()}/security/audit/stats${qs}`);
  if (!res.ok) throw new Error("Failed to fetch audit stats");
  return res.json();
}

async function fetchBudget(connId: string): Promise<QueryBudget> {
  const res = await fetch(`${getApiBase()}/security/budget/${connId}`);
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  return res.json();
}

async function saveBudget(
  connId: string,
  patch: { max_rows?: number; warn_time_ms?: number; max_time_ms?: number },
): Promise<void> {
  const res = await fetch(`${getApiBase()}/security/budget/${connId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
}

// ── Words for times and durations ─────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
function dayOf(iso: string): string {
  // A bare day ("2026-09-30") is that day wherever the reader is, not UTC midnight shifted into their zone.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return isNaN(d.getTime()) ? iso : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
function clockOf(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** "22:46–23:41" within a day, "9 Oct – 11 Oct" across days. */
function span(earliest: string, latest: string): string {
  if (!earliest) return "";
  if (dayOf(earliest) === dayOf(latest)) {
    const a = clockOf(earliest), b = clockOf(latest);
    return a === b ? `${dayOf(latest)} ${a}` : `${dayOf(latest)} ${a}–${b}`;
  }
  return `${dayOf(earliest)} – ${dayOf(latest)}`;
}
function ms(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1).replace(/\.0$/, "")} s`;
}
const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

// ── A log row, as the detail table draws it ───────────────────────────────────

// The audit's verdicts are guard readings: safe passed, suspicious warned, blocked refused.
const VERDICT_GUARD: Record<string, GuardVerdict> = { safe: "passed", suspicious: "warned", blocked: "refused" };

function VerdictBadge({ verdict }: { verdict: string }) {
  const guard = VERDICT_GUARD[verdict];
  if (verdict === "pii_blocked") return <GuardChip verdict="refused">withheld · sensitive values</GuardChip>;
  return guard ? <GuardChip verdict={guard}>{verdict}</GuardChip> : <span className="aug-guard">{verdict}</span>;
}

function AgentCell({ hypothesisId }: { hypothesisId: string }) {
  const { agent, detail } = callerName(hypothesisId);
  return (
    <span title={hypothesisId} style={{ whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--t2)", fontWeight: 500 }}>{agent}</span>
      {detail && <span className="aug-fs-xs" style={{ color: "var(--t3)", marginLeft: 5 }}>{detail}</span>}
    </span>
  );
}

const PRE: React.CSSProperties = {
  margin: 0, background: "var(--code-bg)", borderRadius: "var(--r2)", padding: "8px 10px",
  whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "var(--font-code)", minWidth: 0,
};

type SecSortCol = "ts" | "connection" | "verdict" | "rows" | "duration" | "pii";
const VERDICT_RANK: Record<string, number> = { blocked: 0, pii_blocked: 1, suspicious: 2, safe: 3 };

function sortRecords(rows: AuditRecord[], col: SecSortCol, dir: "asc" | "desc"): AuditRecord[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (col) {
      case "ts":         return m * a.ts.localeCompare(b.ts);
      case "connection": return m * a.connection_id.localeCompare(b.connection_id);
      case "verdict":    return m * ((VERDICT_RANK[a.verdict] ?? 9) - (VERDICT_RANK[b.verdict] ?? 9));
      case "rows":       return m * (a.row_count - b.row_count);
      case "duration":   return m * (a.duration_ms - b.duration_ms);
      case "pii":        return m * (a.pii_redacted - b.pii_redacted);
      default:           return 0;
    }
  });
}

function SortMark({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <span style={{ marginLeft: 3, opacity: 0.25 }}>⇅</span>;
  return <span style={{ marginLeft: 3, color: "var(--blue3)" }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

/** Time · Connection · Who · Verdict · Statement · Rows · Took · Masked · Error — fixed or fractional widths only. */
const LOG_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 12,
  gridTemplateColumns: "128px minmax(80px, .8fr) minmax(140px, 1.3fr) 96px minmax(200px, 2.4fr) 56px 60px 56px minmax(110px, 1.2fr)",
};
const LOG_HEAD: { label: string; col: SecSortCol | null; right?: boolean }[] = [
  { label: "Time", col: "ts" }, { label: "Connection", col: "connection" }, { label: "Who", col: null },
  { label: "Verdict", col: "verdict" }, { label: "Statement", col: null }, { label: "Rows", col: "rows", right: true },
  { label: "Took", col: "duration", right: true }, { label: "Masked", col: "pii", right: true }, { label: "Error", col: null },
];

/** The log's rows, every column the page ever showed: time, connection, who, verdict, the statement, rows, duration,
 *  masked values and the error — sortable by their heads. A row opens in the inspector (the whole statement, the whole
 *  error, where it ran); outside the app's shell it opens in place, as it did. */
function AuditTable({ records, connections, testId }: { records: AuditRecord[]; connections: ConnectionItem[]; testId?: string }) {
  const [sortCol, setSortCol] = useState<SecSortCol>("ts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const sorted = useMemo(() => sortRecords(records, sortCol, sortDir), [records, sortCol, sortDir]);
  const inShell = useInShell();
  const inspector = useInspector();
  const held = inspector.subject?.key;
  const sortBy = (col: SecSortCol) => {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir(col === "ts" ? "desc" : "asc"); }
  };
  const pick = (rec: AuditRecord) => {
    if (inShell) inspector.inspect(checkSubject(rec, connections));
    else setOpenRow(o => (o === rec.id ? null : rec.id));
  };
  return (
    <div data-testid={testId} style={{ overflow: "auto", maxHeight: 420, marginTop: 6 }}>
      <div role="table" aria-label="Query checks" className="aug-fs-xs" style={{ minWidth: 1040 }}>
        <div role="row" style={{ ...LOG_GRID, padding: "0 0 6px 8px", position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
          {LOG_HEAD.map(h => {
            const active = h.col != null && sortCol === h.col;
            return (
              <span key={h.label} role="columnheader" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                onClick={h.col ? () => sortBy(h.col!) : undefined}
                style={{ textAlign: h.right ? "right" : "left", color: active ? "var(--blue3)" : "var(--t3)", whiteSpace: "nowrap",
                  textTransform: "uppercase", letterSpacing: ".06em", cursor: h.col ? "pointer" : "default", userSelect: "none" }}>
                {h.label}{h.col && <SortMark active={active} dir={sortDir} />}
              </span>
            );
          })}
        </div>
        {sorted.map(rec => {
          const picked = inShell ? held === `check:${rec.id}` : openRow === rec.id;
          return (
            <React.Fragment key={rec.id}>
              <div role="row" data-testid="audit-row" tabIndex={0} aria-selected={picked} onClick={() => pick(rec)}
                onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(rec); } }}
                style={{ ...LOG_GRID, padding: "5px 0 5px 8px", borderTop: "1px solid var(--b0)", cursor: "pointer",
                  background: picked ? "var(--bg-hover)" : undefined, boxShadow: picked ? "inset 2px 0 0 var(--blue3)" : undefined }}>
                <span role="cell" style={{ color: "var(--t3)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                  {rec.ts.replace("T", " ").replace("Z", "").slice(0, 19)}
                </span>
                <span role="cell" title={rec.connection_id} style={{ ...ONE_LINE, color: "var(--t2)" }}>{connectionLabel(rec.connection_id, connections)}</span>
                <span role="cell" style={{ minWidth: 0, overflow: "hidden" }}><AgentCell hypothesisId={rec.hypothesis_id} /></span>
                <span role="cell" style={{ whiteSpace: "nowrap", overflow: "hidden" }}><VerdictBadge verdict={rec.verdict} /></span>
                <span role="cell" title={rec.sql_digest} style={{ ...ONE_LINE, fontFamily: "var(--font-code)", color: "var(--t2)" }}>{rec.sql_digest}</span>
                <span role="cell" style={{ color: "var(--t2)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatCount(rec.row_count)}</span>
                <span role="cell" style={{ color: "var(--t2)", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{ms(rec.duration_ms)}</span>
                <span role="cell" style={{ color: rec.pii_redacted > 0 ? "var(--amb4)" : "var(--t3)", textAlign: "right" }}>
                  {rec.pii_redacted > 0 ? rec.pii_redacted : "none"}
                </span>
                <span role="cell" title={rec.error ?? undefined} style={{ ...ONE_LINE, color: rec.error ? "var(--red4)" : "var(--t3)" }}>
                  {rec.error ?? "none"}
                </span>
              </div>
              {!inShell && openRow === rec.id && (
                <div data-testid="audit-row-detail" style={{ padding: "4px 0 8px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <pre style={{ ...PRE, color: "var(--t1)" }}>{rec.sql_full}</pre>
                  {rec.error && <pre style={{ ...PRE, color: "var(--red4)" }}>{rec.error}</pre>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** A statement the audit log holds, as the inspector says it: what happened to it and who ran it (Overview), the whole
 *  statement with Open in SQL Editor (Definition), and the log's own record of it (Provenance). */
function checkSubject(rec: AuditRecord, connections: ConnectionItem[]) {
  const outcome = outcomeOf(rec);
  const { agent, detail } = callerName(rec.hypothesis_id);
  return {
    key: `check:${rec.id}`, kind: "Query check", title: rec.sql_digest || "A statement", icon: "shield" as const,
    meta: <>{OUTCOME_WORD[outcome]} · {rec.ts.replace("T", " ").replace("Z", "").slice(0, 16)}</>,
    tab: "overview" as const,
    tabs: {
      overview: (
        <div data-testid="audit-check" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <InspectorFacts rows={[
            { label: "Outcome", value: OUTCOME_WORD[outcome], note: outcome === "failed" ? "the guard passed it; the warehouse answered with an error" : undefined },
            { label: "Guard", value: <VerdictBadge verdict={rec.verdict} />, note: "its verdict, written before the statement ran" },
            { label: "Who", value: detail ? `${agent} · ${detail}` : agent, note: isPlatformCaller(rec.hypothesis_id) ? "the platform's own read" : undefined },
            { label: "Connection", value: connectionLabel(rec.connection_id, connections) },
            { label: "When", value: rec.ts.replace("T", " ").replace("Z", " UTC") },
            { label: "Rows", value: formatCount(rec.row_count) },
            { label: "Took", value: ms(rec.duration_ms) },
            { label: "Masked", value: rec.pii_redacted > 0 ? `${formatCount(rec.pii_redacted)} sensitive values hidden` : "none" },
          ]} />
          {rec.error && (
            <div>
              <Label>Error</Label>
              <pre className="aug-fs-xs" style={{ ...PRE, color: "var(--red4)" }}>{rec.error}</pre>
            </div>
          )}
        </div>
      ),
      definition: <CheckStatement rec={rec} />,
      provenance: (
        <InspectorFacts rows={[
          { label: "Check", value: <span style={{ fontVariantNumeric: "tabular-nums" }}>{rec.id}</span> },
          { label: "Caller", value: <code>{rec.hypothesis_id}</code>, note: "as the log records it" },
          { label: "Connection", value: <code>{rec.connection_id}</code> },
          { label: "Verdict", value: <code>{rec.verdict}</code>, note: "the guard's word, written before the statement ran" },
        ]} />
      ),
    },
  };
}

/** The whole statement, as it was logged, with Open in SQL Editor where the app provides one. */
function CheckStatement({ rec }: { rec: AuditRecord }) {
  const openInQuery = useOpenInQuery();
  return (
    <div data-testid="audit-check-sql" style={{ minWidth: 0 }}>
      <Label right={openInQuery ? (
        <Button size="xs" variant="ghost" title="Opens the statement, as it was logged, in a new SQL Editor tab — it is not run"
          onClick={() => openInQuery({ sql: rec.sql_full, connId: rec.connection_id, mode: "sql" })}>Open in SQL Editor</Button>
      ) : undefined}>The statement</Label>
      <pre className="aug-fs-xs" style={{ ...PRE, color: "var(--t1)" }}>{rec.sql_full}</pre>
    </div>
  );
}

// ── Lens toggle ───────────────────────────────────────────────────────────────

// The gate map and the policies read back as sentences (the 2027 study §V, screen 12) are two more
// views of this page. The first view is labelled for what it lists — the tab above already says "Security".
type Lens = "security" | "activity" | "approvals" | "gates" | "policies";

function LensToggle({ value, onChange }: { value: Lens; onChange: (v: Lens) => void }) {
  return (
    <Segmented label="Security view" value={value} onChange={onChange} options={[
      { value: "security", label: "Queries" },
      { value: "activity", label: "Activity" },
      { value: "approvals", label: "Approvals" },
      { value: "gates", label: "Gate map" },
      { value: "policies", label: "Policies" },
    ]} />
  );
}

// ── The query lens ────────────────────────────────────────────────────────────

const HUE: Record<Outcome, "green" | "amber" | "red" | "grey"> = {
  passed: "green", flagged: "amber", failed: "red", blocked: "red", withheld: "red",
};

/** One group's muted line: what happened, the noise named as noise (when it happened has its own column). */
function groupMeta(g: CheckGroup): string {
  const n = g.rows.length;
  const avg = g.rows.reduce((s, r) => s + r.duration_ms, 0) / Math.max(1, n);
  switch (g.outcome) {
    case "flagged":
      return g.own ? "the platform's own reads — flagged before they ran, then run"
        : "flagged before running, then run";
    case "blocked":  return `refused before running${g.reason ? ` · ${g.reason}` : ""}`;
    case "withheld": return "the result held sensitive values and was held back";
    case "failed":   return g.reason ?? "an error";
    default:         return `avg ${ms(avg)}${n > 1 ? "" : ` · ${plural(g.rows[0].row_count, "row")}`}`;
  }
}

/** Outcome · Who · What happened · Checks · When · Show — the fold's register. */
const GROUP_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14,
  gridTemplateColumns: "96px minmax(130px, 1.3fr) minmax(160px, 2.4fr) 56px minmax(96px, .9fr) 72px",
};

function GroupRow({ g, open, onToggle, connections }: {
  g: CheckGroup; open: boolean; onToggle: () => void; connections: ConnectionItem[];
}) {
  const word = OUTCOME_WORD[g.outcome];
  const meta = groupMeta(g);
  return (
    <div data-testid="check-group" style={{ borderTop: "1px solid var(--b0)" }}>
      <div style={{ ...GROUP_GRID, padding: "7px 0 7px 8px" }}>
        <span className="aug-fs-chrome" style={{ ...ROW, gap: 6, flexWrap: "nowrap", color: "var(--t1)" }}>
          <Dot hue={g.outcome === "flagged" && g.own ? "grey" : HUE[g.outcome]} title={word} />{word}
        </span>
        <span className="aug-fs-chrome" data-testid="check-group-who" style={{ ...ONE_LINE, color: "var(--t2)" }} title={g.name}>{g.name}</span>
        <span className="aug-fs-xs" title={g.reason ?? meta} style={{ ...MUTED, ...ONE_LINE }}>{meta}</span>
        <span className="aug-fs-chrome" data-testid="check-group-count"
          style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
          {formatCount(g.rows.length)}
        </span>
        <span className="aug-fs-xs" style={{ ...MUTED, ...ONE_LINE, fontVariantNumeric: "tabular-nums" }}>{span(g.earliest, g.latest)}</span>
        <span style={{ justifySelf: "end" }}>
          <Button size="xs" variant="ghost" aria-expanded={open} onClick={onToggle}>
            {open ? "Hide" : "Show"} <Icon name={open ? "chevu" : "chevd"} size={12} />
          </Button>
        </span>
      </div>
      {open && <AuditTable records={g.rows} connections={connections} />}
    </div>
  );
}

/** The limits a statement runs under on this connection — read first, edited behind Edit. */
function LimitsCard({ connId, connName }: { connId: string; connName: string }) {
  const [budget, setBudget] = useState<QueryBudget | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const read = useCallback(() => {
    setReadError(null);
    fetchBudget(connId).then(setBudget).catch(e => setReadError(e instanceof Error ? e.message : String(e)));
  }, [connId]);
  useEffect(() => { read(); }, [read]);

  return (
    <section aria-label="Query limits" data-testid="audit-limits" style={{ ...CARD, flex: "1 1 260px" }}>
      <Label right={budget && !editing ? <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit</Button> : null}>
        Limits · {connName}
      </Label>
      {readError ? <ReadFailed what="the limits" error={readError} onRetry={read} />
        : !budget ? <Loading what="the limits" />
        : editing ? <BudgetEditor connId={connId} budget={budget} onDone={b => { if (b) setBudget(b); setEditing(false); }} />
        : (
          <div style={ROW}>
            <Chip>{`${formatCount(budget.max_rows)} rows at most`}</Chip>
            <Chip>{`warns at ${ms(budget.warn_time_ms)}`}</Chip>
            <Chip>{`stops at ${ms(budget.max_time_ms)}`}</Chip>
            {budget.is_default && <Chip title="No limits were set for this connection; saving an edit sets its own">the default</Chip>}
          </div>
        )}
    </section>
  );
}

function BudgetEditor({ connId, budget, onDone }: { connId: string; budget: QueryBudget; onDone: (b: QueryBudget | null) => void }) {
  const [draft, setDraft] = useState({ max_rows: budget.max_rows, warn_time_ms: budget.warn_time_ms, max_time_ms: budget.max_time_ms });
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setFailed(null);
    try {
      await saveBudget(connId, draft);
      onDone({ ...budget, ...draft, is_default: false });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  const FIELDS: { key: keyof typeof draft; label: string }[] = [
    { key: "max_rows", label: "Max rows" }, { key: "warn_time_ms", label: "Warn after (ms)" }, { key: "max_time_ms", label: "Stop after (ms)" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {budget.is_default && <div className="aug-fs-xs" style={{ color: "var(--amb4)" }}>These are the defaults — saving sets this connection&apos;s own.</div>}
      {FIELDS.map(f => (
        <label key={f.key} className="aug-fs-sm" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--t2)", width: 110, flexShrink: 0 }}>{f.label}</span>
          <Input type="number" value={draft[f.key]} style={{ width: 110 }}
            onChange={e => setDraft(d => ({ ...d, [f.key]: Number(e.target.value) }))} />
        </label>
      ))}
      <div style={ROW}>
        <Button size="xs" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save limits"}</Button>
        <Button size="xs" variant="ghost" onClick={() => onDone(null)} disabled={saving}>Cancel</Button>
      </div>
      {failed && <div role="alert" className="aug-fs-xs" style={{ color: "var(--red4)" }}>Not saved — {failed}</div>}
    </div>
  );
}

const VERDICT_FILTERS = [
  { value: "all", label: "All" },
  { value: "safe", label: "Passed" },
  { value: "suspicious", label: "Flagged" },
  { value: "blocked", label: "Blocked" },
] as const;
type VerdictFilter = typeof VERDICT_FILTERS[number]["value"];

function QueriesLens({ connId, connections, reloadKey, onLoading }: {
  connId?: string;
  connections: ConnectionItem[];
  reloadKey: number;
  onLoading: (b: boolean) => void;
}) {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [blockedRows, setBlockedRows] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [filterConnId, setFilterConnId] = useState<string | undefined>(connId);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [allRows, setAllRows] = useState(false);
  const [query, setQuery] = useState("");
  const inShell = useInShell();
  /** When the log was last read: "this week" is counted back from the read, not from each render. */
  const [readAt, setReadAt] = useState(0);
  const listRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setFilterConnId(connId); }, [connId]);

  const load = useCallback(async () => {
    setLoading(true);
    onLoading(true);
    setError(null);
    try {
      const v = verdict === "all" ? undefined : verdict;
      const [s, r, b] = await Promise.all([
        fetchAuditStats(filterConnId),
        fetchAuditLog(filterConnId, v),
        // The blocked statements on their own read: a refusal a week old is far outside the latest checks.
        v === "blocked" ? Promise.resolve(null) : fetchAuditLog(filterConnId, "blocked", 50),
      ]);
      setStats(s);
      setRecords(r);
      setBlockedRows(b ?? r);
      setReadAt(Date.now());
      setOpen(new Set());
      setAllRows(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit data");
    } finally {
      setLoading(false);
      onLoading(false);
    }
  }, [filterConnId, verdict, onLoading]);
  useEffect(() => { load(); }, [load, reloadKey]);

  // A search narrows the checks listed — by the statement, who ran it, or its error — never the figures above them.
  const listed = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return !needle ? records : records.filter(r => [r.sql_full, callerText(r.hypothesis_id), r.hypothesis_id, r.error ?? ""]
      .some(t => t.toLowerCase().includes(needle)));
  }, [records, query]);
  const groups = useMemo(() => foldChecks(listed), [listed]);
  const callers = useMemo(() => byCaller(records), [records]);
  const split = useMemo(() => flagSplit(records), [records]);
  const recentBlocked = useMemo(() => blockedSince(blockedRows, readAt, 7), [blockedRows, readAt]);
  const lastBlocked = blockedRows.find(r => outcomeOf(r) === "blocked");
  const windowSpan = records.length ? span(records[records.length - 1].ts, records[0].ts) : "";
  const filterWord = verdict === "all" ? "checks" : verdict === "safe" ? "passed" : verdict === "suspicious" ? "flagged" : "blocked";

  const review = (keys: string[]) => {
    setQuery("");
    setOpen(new Set(keys));
    listRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  if (error) return <Page><ReadFailed what="the audit log" error={error} onRetry={load} /></Page>;
  if (!stats) return <Page><Loading what="the audit log" /></Page>;

  const flagSub = verdict !== "all" && verdict !== "suspicious" ? "flagged before they ran, then run"
    : split.flagged === 0 ? `none in the latest ${formatCount(records.length)}`
    : split.asked.length === 0 ? `${formatCount(split.flagged)} recent, all the platform's own`
    : `${formatCount(split.asked.length)} recent from people or agents`;
  const notListed = stats.internal_statements ?? 0;
  /** How many the log holds of what this view lists — not counted apart for "passed". */
  const ofAll = verdict === "all" ? stats.total : verdict === "suspicious" ? stats.suspicious : verdict === "blocked" ? stats.blocked : null;
  /** Whether the rows read can say anything about flags: the Passed and Blocked views hold none. */
  const flagsRead = verdict === "all" || verdict === "suspicious";

  // The log's verdict, its connection and a search over its statements: inside the app, the page's toolbar row (after
  // the lens); on its own, the card's head.
  const tools = (
    <>
      <Segmented label="Verdict" value={verdict} onChange={v => setVerdict(v)}
        options={VERDICT_FILTERS.map(f => ({ value: f.value, label: f.label }))} />
      <SelectField aria-label="Connection" value={filterConnId || ""} onChange={e => setFilterConnId(e.target.value || undefined)}>
        <option value="">All connections</option>
        {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </SelectField>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search statements, callers, errors…"
        aria-label="Search the checks" leading={<Icon name="search" size={11} />} style={{ width: 240 }} />
      {loading && <Loading inline />}
    </>
  );

  return (
    <Page testId="audit-queries">
      {inShell && <ChromeToolbar>{tools}</ChromeToolbar>}
      <Tally testId="audit-figures">
        <Figure label="Queries checked" value={compactNumber(stats.total)} title={`${formatCount(stats.total)} statements checked and logged`}
          sub={`${compactNumber(stats.errors)} errors · avg ${ms(stats.avg_duration_ms)}`} testId="fig-checked" />
        <Figure label="Blocked" value={compactNumber(stats.blocked)} tone={recentBlocked.length ? "red" : undefined}
          sub={lastBlocked ? `refused before running · last ${dayOf(lastBlocked.ts)}` : "refused before running"} testId="fig-blocked" />
        <Figure label="Flagged" value={compactNumber(stats.suspicious)} sub={flagSub} testId="fig-flagged"
          title={verdict === "all" && split.flagged ? `Of the latest ${formatCount(records.length)} checks, ${formatCount(split.flagged)} were flagged`
            + ` and ${formatCount(split.own)} of those were the platform's own reads. A flag is written before a statement runs; the`
            + " statement is logged again when it runs." : undefined} />
        <Figure label="Values masked" value={compactNumber(stats.pii_redacted)} sub="sensitive values hidden in results" testId="fig-masked" />
      </Tally>

      <NeedsYou testId="audit-needs" empty={flagsRead
        ? "Nothing needs you · no recent flag from a person or an agent, nothing blocked this week"
        : "Nothing needs you · nothing blocked this week"}>
        {[
          flagsRead && split.asked.length > 0 && (
            <NeedsRow key="asked" testId="needs-asked"
              title={`${plural(split.asked.length, "flagged query", "flagged queries")} from people or agents`}
              detail={fromWhom(split.asked)}
              actions={<Button size="xs" variant="secondary"
                onClick={() => review(groups.filter(g => g.outcome === "flagged" && !g.own).map(g => g.key))}>Review</Button>} />
          ),
          recentBlocked.length > 0 && (
            <NeedsRow key="blocked" testId="needs-blocked"
              title={`${plural(recentBlocked.length, "query", "queries")} blocked this week`}
              detail={`${fromWhom(recentBlocked)}${recentBlocked[0].error ? ` · ${recentBlocked[0].error}` : ""}`}
              actions={<Button size="xs" variant="secondary" onClick={() => setVerdict("blocked")}>Review</Button>} />
          ),
        ]}
      </NeedsYou>

      <section ref={listRef} aria-label="Query checks" data-testid="audit-checks" style={CARD}>
        <Label right={<>
          {records.length > 0 && <span>{`${listed.length < records.length ? `${formatCount(listed.length)} matching · ` : ""}latest ${formatCount(records.length)} ${filterWord}${ofAll != null ? ` of ${compactNumber(ofAll)}` : ""}`}</span>}
          {notListed > 0 && (
            <Chip testId="audit-not-listed"
              title={`Not listed here: ${formatCount(notListed)} queries the platform ran for its own checks — probes, profiling`
                + ` and samples${stats.internal_since ? ` — since ${fmtDate(stats.internal_since, "day")}` : ""}.`}>
              {`${compactNumber(notListed)} probes not listed${stats.internal_since ? ` · since ${dayOf(stats.internal_since)}` : ""}`}
            </Chip>
          )}
        </>}>
          Query checks
        </Label>
        {!inShell && <div style={{ ...ROW, marginBottom: 6 }}>{tools}</div>}
        {groups.length === 0 ? (
          <div className="aug-fs-sm" style={MUTED}>
            {query.trim() ? "No check matches." : verdict === "all" ? "No query has been checked here yet." : `No ${filterWord} query in the log.`}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 690 }}>
              <div className="aug-fs-xs" style={{ ...GROUP_GRID, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px 8px" }}>
                <span>Outcome</span><span>Who</span><span>What happened</span><span style={{ textAlign: "right" }}>Checks</span><span>When</span><span />
              </div>
              {groups.map(g => (
                <GroupRow key={g.key} g={g} connections={connections} open={open.has(g.key)}
                  onToggle={() => setOpen(prev => { const n = new Set(prev); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} />
              ))}
            </div>
          </div>
        )}
        {listed.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <Button size="xs" variant="ghost" aria-expanded={allRows} onClick={() => setAllRows(a => !a)}>
              {allRows ? "Hide the rows" : `All ${formatCount(listed.length)} rows`} <Icon name={allRows ? "chevu" : "chevd"} size={12} />
            </Button>
            {allRows && <AuditTable records={listed} connections={connections} testId="audit-all-rows" />}
          </div>
        )}
      </section>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section aria-label="Who ran them" data-testid="audit-callers" style={{ ...CARD, flex: "1.6 1 420px" }}>
          <Label right={records.length ? <span>{windowSpan}</span> : null}>
            Who ran them
          </Label>
          {callers.length === 0 ? <div className="aug-fs-sm" style={MUTED}>Nothing in the log yet.</div> : (
            <HBars bars={callers.map(c => {
              const parts = [
                c.flagged ? (c.flaggedOwn === c.flagged ? `${formatCount(c.flagged)} flagged, its own reads` : `${formatCount(c.flagged)} flagged`) : "",
                c.blocked ? `${formatCount(c.blocked)} blocked` : "",
                c.withheld ? `${formatCount(c.withheld)} withheld` : "",
                c.failed ? plural(c.failed, "error") : "",
              ].filter(Boolean);
              return {
                key: c.name, name: c.name, meta: parts.join(" · ") || undefined, value: c.total, shown: compactNumber(c.total),
                tip: `${c.name}: ${plural(c.total, "check")}${parts.length ? ` — ${parts.join(", ")}` : ", all passed"}`,
              };
            })} />
          )}
        </section>
        {connId && <LimitsCard key={connId} connId={connId} connName={connectionLabel(connId, connections)} />}
      </div>
    </Page>
  );
}

// ── Action approvals (P4) — the graduated-approval allowlist and its decisions ──

/** Decisions that refused something: an action's row carries a red dot when any of them is among its decisions. */
const REFUSALS = new Set(["blocked", "proposal_rejected", "criterion_failed"]);
/** The order an action's decisions are said in: refusals first, then what a person granted, then the rest. */
const DECISION_ORDER = ["blocked", "criterion_failed", "proposal_rejected", "approved", "allowlisted", "revoked", "executed", "auto"];
const DECISION_WORD: Record<string, string> = {
  allowlisted: "pre-approved", auto: "automatic", criterion_failed: "check failed", proposal_rejected: "proposal rejected",
};
/** An action's id in words: `connection.schema.delete` → "connection schema delete". A declared action's namespace goes —
 *  `<namespace>.open_case` → "open case" — because its own name already says what it does. */
const actionWords = (a: string) => a.replace(/^[a-z]+\.(?=[a-z]+_[a-z_]+$)/, "").replace(/[._]+/g, " ").trim();
const decisionWords = (d: string) => DECISION_WORD[d] ?? d.replace(/_/g, " ");

/** When · Decision · Action · Scope · Who — the approval trail as a log, newest first as the server keeps it. */
const TRAIL_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 12,
  gridTemplateColumns: "128px 96px minmax(120px, 1.6fr) minmax(80px, 1fr) minmax(60px, .7fr)",
};

function ActionApprovalsSection() {
  const [audit, setAudit] = useState<ApprovalAuditEvent[] | null>(null);
  const [allow, setAllow] = useState<AllowlistEntry[] | null>(null);
  const [auditFailed, setAuditFailed] = useState<string | null>(null);
  const [allowFailed, setAllowFailed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openAction, setOpenAction] = useState<ReadonlySet<string>>(new Set());
  const [trail, setTrail] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
    Promise.all([
      getApprovalsAudit(100).then(a => { setAudit(a); setAuditFailed(null); }).catch(e => setAuditFailed(msg(e))),
      getAllowlist().then(l => { setAllow(l); setAllowFailed(null); }).catch(e => setAllowFailed(msg(e))),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const [revokeError, setRevokeError] = useState<string | null>(null);
  async function handleRevoke(e: AllowlistEntry) {
    setRevokeError(null);
    try {
      await revokeApproval(e.action, e.scope);
    } catch (err) {
      // No auto-poll on this panel — a swallowed failure left the entry
      // looking allowlisted with zero feedback.
      setRevokeError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      load();
    }
  }

  // Repeats folded: one row per action on the allowlist, one per decision and action in the trail.
  const allowByAction = useMemo(() => {
    const m = new Map<string, AllowlistEntry[]>();
    for (const e of allow ?? []) m.set(e.action, [...(m.get(e.action) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [allow]);
  const decisions = useMemo(() => {
    const m = new Map<string, { action: string; n: number; by: Map<string, number>; last: string; actor: string }>();
    for (const e of audit ?? []) {
      const g = m.get(e.action) ?? { action: e.action, n: 0, by: new Map<string, number>(), last: "", actor: e.actor };
      g.n++;
      g.by.set(e.decision, (g.by.get(e.decision) ?? 0) + 1);
      if ((e.at ?? "") > g.last) { g.last = e.at ?? ""; g.actor = e.actor; }
      m.set(e.action, g);
    }
    const rank = (d: string) => { const i = DECISION_ORDER.indexOf(d); return i < 0 ? DECISION_ORDER.length : i; };
    return [...m.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).map(g => ({
      ...g,
      refused: [...g.by.keys()].some(d => REFUSALS.has(d)),
      said: [...g.by.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([d, k]) => `${k} ${decisionWords(d)}`).join(" · "),
    }));
  }, [audit]);

  return (
    <Page testId="audit-approvals">
      {revokeError && <div role="alert" className="aug-fs-sm" style={{ color: "var(--red4)" }}>Revoke failed: {revokeError}</div>}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <section aria-label="Pre-approved actions" style={{ ...CARD, flex: "1 1 360px" }}>
          <Label right={<>
            {allow && <span>{`${formatCount(allow.length)} pre-approved`}</span>}
            <Button size="xs" variant="ghost" onClick={load} disabled={loading}>{loading ? "Reading…" : "Refresh"}</Button>
          </>}>Pre-approved</Label>
          {allowFailed ? <ReadFailed what="the pre-approved actions" error={allowFailed} onRetry={load} />
            : !allow ? <Loading what="the pre-approved actions" />
            : allowByAction.length === 0 ? <div className="aug-fs-sm" style={MUTED}>No action is pre-approved.</div>
            : allowByAction.map(([action, entries], i) => {
              const isOpen = openAction.has(action);
              return (
                <div key={action} style={{ borderTop: i ? "1px solid var(--b0)" : undefined, padding: "7px 2px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 10, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="aug-fs-chrome" title={action} style={{ ...ONE_LINE, color: "var(--t1)" }}>{actionWords(action)}</div>
                      <div className="aug-fs-xs" title={entries.map(e => e.scope || "everywhere").join(", ")} style={{ ...MUTED, ...ONE_LINE }}>
                        {entries.slice(0, 2).map(e => e.scope || "everywhere").join(" · ")}{entries.length > 2 ? ` · +${entries.length - 2} more` : ""}
                      </div>
                    </div>
                    <span className="aug-fs-chrome" style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}>{entries.length}</span>
                    <Button size="xs" variant="ghost" aria-expanded={isOpen}
                      onClick={() => setOpenAction(p => { const n = new Set(p); if (n.has(action)) n.delete(action); else n.add(action); return n; })}>
                      {isOpen ? "Hide" : "Show"} <Icon name={isOpen ? "chevu" : "chevd"} size={12} />
                    </Button>
                  </div>
                  {isOpen && entries.map(e => (
                    <div key={`${e.action}@${e.scope}`} className="aug-fs-sm"
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 0 12px" }}>
                      <code className="aug-fs-xs" style={{ color: "var(--t2)", ...ONE_LINE }}>{e.scope || "*"}</code>
                      <span className="aug-fs-xs" style={MUTED}>{[e.by, e.at ? dayOf(e.at) : ""].filter(Boolean).join(" · ")}</span>
                      <span style={{ flex: 1 }} />
                      <Button size="xs" variant="outline" onClick={() => handleRevoke(e)}>Revoke</Button>
                    </div>
                  ))}
                </div>
              );
            })}
        </section>

        <section aria-label="Decisions" style={{ ...CARD, flex: "1 1 360px" }}>
          <Label right={audit ? <span>{`latest ${formatCount(audit.length)}`}</span> : null}>Decisions</Label>
          {auditFailed ? <ReadFailed what="the approval decisions" error={auditFailed} onRetry={load} />
            : !audit ? <Loading what="the approval decisions" />
            : decisions.length === 0 ? (
              <div className="aug-fs-sm" style={{ ...ROW, ...MUTED }}>
                No high-risk action attempted yet.
                <Chip title="AUGHOR_ACTION_APPROVAL=0 on the server switches the approval gate off">the gate is on unless the server switched it off</Chip>
              </div>
            ) : (
              <>
                {decisions.map((d, i) => (
                  <div key={d.action} data-testid="decision-row" style={{ display: "grid", gridTemplateColumns: "12px minmax(0, 1fr) auto",
                    gap: 10, alignItems: "center", borderTop: i ? "1px solid var(--b0)" : undefined, padding: "7px 2px" }}>
                    <Dot hue={d.refused ? "red" : "green"} title={d.refused ? "something was refused" : "nothing refused"} />
                    <div style={{ minWidth: 0 }}>
                      <div className="aug-fs-chrome" title={d.action} style={{ ...ONE_LINE, color: "var(--t1)" }}>{actionWords(d.action)}</div>
                      <div className="aug-fs-xs" title={d.said} style={{ ...MUTED, ...ONE_LINE }}>
                        {d.said}{d.last ? ` · last ${dayOf(d.last)}, ${d.actor}` : ""}
                      </div>
                    </div>
                    <span className="aug-fs-chrome" style={{ color: "var(--t2)", fontVariantNumeric: "tabular-nums" }}>{d.n}</span>
                  </div>
                ))}
                <div style={{ marginTop: 6 }}>
                  <Button size="xs" variant="ghost" aria-expanded={trail} onClick={() => setTrail(t => !t)}>
                    {trail ? "Hide the trail" : "Full trail"} <Icon name={trail ? "chevu" : "chevd"} size={12} />
                  </Button>
                  {trail && (
                    <div data-testid="approval-trail" role="table" aria-label="The approval trail" className="aug-fs-xs"
                      style={{ maxHeight: 260, overflow: "auto", marginTop: 4 }}>
                      <div role="row" style={{ ...TRAIL_GRID, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 4px",
                        position: "sticky", top: 0, background: "var(--bg-2)" }}>
                        <span role="columnheader">When</span><span role="columnheader">Decision</span><span role="columnheader">Action</span>
                        <span role="columnheader">Scope</span><span role="columnheader">Who</span>
                      </div>
                      {audit.map((e, i) => (
                        <div key={e.seq ?? i} role="row" title={e.detail || undefined}
                          style={{ ...TRAIL_GRID, padding: "4px 0", borderTop: "1px solid var(--b0)" }}>
                          <span role="cell" style={{ ...MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.at ? e.at.slice(0, 19).replace("T", " ") : "not recorded"}</span>
                          <span role="cell" style={{ color: REFUSALS.has(e.decision) ? "var(--red4)" : "var(--t1)", fontWeight: 600 }}>{decisionWords(e.decision)}</span>
                          <code role="cell" style={{ ...ONE_LINE, color: "var(--t2)" }}>{e.action}</code>
                          <span role="cell" style={{ ...ONE_LINE, color: "var(--t2)" }} title={e.scope || undefined}>{e.scope || "everywhere"}</span>
                          <span role="cell" style={{ ...ONE_LINE, ...MUTED }}>{e.actor}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
        </section>
      </div>
    </Page>
  );
}

export function SecurityAuditPanel({
  connId,
  lens = "security",
  onLensChange,
}: {
  connId?: string;
  lens?: Lens;
  onLensChange?: (v: Lens) => void;
}) {
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getConnections()
      .then(cs => setConnections(cs.map(c => ({ id: c.id, name: c.name, conn_type: c.conn_type }))))
      .catch(() => setConnections([]));
  }, []);

  const inShell = useInShell();
  const lensToggle = <LensToggle value={lens} onChange={v => onLensChange?.(v)} />;
  // The Queries lens names its connection in its own picker, beside it in the toolbar; the other lenses say it here.
  const connChip = connId && lens !== "security" && <Chip title={connId}>{connectionLabel(connId, connections)}</Chip>;
  const refresh = lens === "security" && (
    <Button variant="ghost" size="xs" onClick={() => setReloadKey(k => k + 1)} disabled={loading}>
      <Icon name="refresh" size={12} />{loading ? "Reading…" : "Refresh"}
    </Button>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-0)" }}>
      {/* Which lens and which connection, then Refresh (Queries only). Inside the app the lens and the connection go to
          the shell's toolbar row and Refresh to the title row (2026-11-10, ROADMAP §6 item 64); outside it, one row. */}
      {inShell ? (
        <>
          <ChromeToolbar>{lensToggle}{connChip}</ChromeToolbar>
          {refresh && <ChromeActions>{refresh}</ChromeActions>}
        </>
      ) : (
        <div style={{ padding: "12px 20px 0", display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
          {lensToggle}
          {connChip}
          <div style={{ flex: 1 }} />
          {refresh}
        </div>
      )}

      {/* Activity lens — exploration episode log (merged Audit Log) */}
      {lens === "activity" && <ActivityLog connectionId={connId ?? ""} isActive />}

      {/* Approvals lens — the pre-approved actions and every high-risk decision, on its own tab */}
      {lens === "approvals" && <ActionApprovalsSection />}

      {lens === "gates" && <GateMapView />}
      {lens === "policies" && (
        <PoliciesView onOpenSettings={() => requestTab("settings")} onOpenSpend={() => requestTab("spend")} />
      )}

      {lens === "security" && (
        <QueriesLens connId={connId} connections={connections} reloadKey={reloadKey} onLoading={setLoading} />
      )}
    </div>
  );
}
