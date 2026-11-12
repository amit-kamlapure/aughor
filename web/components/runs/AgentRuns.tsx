"use client";

/**
 * Agent runs — the person's run history, laid out to CLARITY (`pramanyx-v2/CLARITY.md`) and, since 2026-11-10, to the
 * Evidence → Action study's register and inspector (§9, §12.3): four figures (runs, the questions behind them, the
 * ones that did not finish, what is running), the runs that need a person in amber with their buttons on the row, then
 * the register — one row per question (Question · Kind · Latest answer · Runs · When), its repeats folded into ×N with
 * the earlier runs one click away. A selected run opens in the inspector: what it was asked and found (the headline
 * said as the model's narrative), its stages as they ran, the SQL each finding executed, its gaps and what it withheld,
 * and Open / Ask again.
 *
 * It was a wall of fifty cards: the same three questions asked ten times each, a green "Completed" on every one, a
 * dash where a run kept no headline. Only what is not completed is said now, and it is said first.
 *
 * This is the person's history (the run list). The machine view of the same runs — events, traces, spans — is at the
 * foot of Agent Ops' Overview, one link away; they are views over different records, so they stay two (PX-6).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CARD, Chip, Dot, Empty, Figure, Label, MUTED, NUM, NeedsRow, NeedsYou, ONE_LINE, Page, ROW, RULE, Tally }
  from "@/components/clarity/kit";
import { ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import { InspectorFacts, useInspector } from "@/components/shell/Inspector";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Loading, ReadFailed } from "@/components/ui/states";
import { getConnections, getJobs, getRunRecord, getWorkspace, DEEP_ANALYSIS_JOB_KIND, type Connection, type JobRow, type RunFinding,
  type RunRecord } from "@/lib/api";
import { getApiBase } from "@/lib/config";
import { subscribeKernelEvents } from "@/lib/events";
import { countNoun, formatCount, formatSeconds, formatTimestamp, relTime } from "@/lib/format";
import { dayWords, normalizeQuestion } from "@/lib/home";
import { withUniqueKeys } from "@/lib/listKeys";
import { connectionLabel, keyToWords } from "@/lib/names";
import { useOpenInQuery } from "@/lib/openInQuery";
import { localizeCurrency } from "@/lib/orgSettings";
import { runDisplayTitle } from "@/lib/runTitle";

/** How many of the newest runs the page reads — the list endpoint's own default, said on the page when it is hit. */
export const READ = 50;

/** The two kinds the run list holds, spelled as the wire spells them (the deep analysis keeps its frozen name). */
export type RunKind = "investigation" | "chat";

/** One row of the run list, as this page uses it. */
export interface Run {
  id: string;
  question: string;
  started_at: string;
  completed_at?: string | null;
  status: string;
  headline: string | null;
  kind?: string;
  connection_id?: string;
  canvas_id?: string | null;
  /** How many statements a conversation's turn ran (a deep analysis keeps its own in its report). */
  query_count?: number;
}

/** A status that is not "complete", as a mark: its word and its hue. A completed run wears none. */
const MARK: Record<string, { word: string; hue: "red" | "amber" | "blue" | "grey" }> = {
  failed: { word: "failed", hue: "red" },
  timed_out: { word: "timed out", hue: "red" },
  interrupted: { word: "stopped", hue: "grey" },
  cancelled: { word: "stopped", hue: "grey" },
  paused: { word: "paused · waiting", hue: "amber" },
  running: { word: "running", hue: "blue" },
};
/** Ended without an answer. */
const UNFINISHED = new Set(["failed", "timed_out", "interrupted", "cancelled"]);
/** What a person is needed for: a run that ended without an answer, or one waiting at a step. */
const NEEDS = new Set([...UNFINISHED, "paused"]);

/** A conversation, not a deep analysis — the run list's one other kind. Agent Ops' Overview reads the rest as its deep runs. */
export const isChat = (r: Pick<Run, "kind">) => r.kind === "chat";
const kindOf = (r: Run): RunKind => (isChat(r) ? "chat" : "investigation");
const markOf = (status: string) => status === "complete" ? null
  : MARK[status] ?? { word: keyToWords(status) || "unknown", hue: "grey" as const };
/** Ended badly first, then what is in flight, then the rest. */
const rank = (status: string) => (UNFINISHED.has(status) ? 0 : status === "running" || status === "paused" ? 1 : 2);

/** Prose the platform wrote, as a line: no markdown emphasis (nothing renders it here), the org's currency. */
const plain = (text: string) => localizeCurrency(text).replace(/\*+/g, "");

/** A long question's short label — its first sentence, when more follow ("What changed in theLook in the last day?"
 *  for the daily run's four sentences of instructions). The full text stays on hover. */
export function shortQuestion(q: string): string {
  const cut = q.search(/[?!.]\s+\S/);
  return cut > 0 ? q.slice(0, cut + 1) : q;
}

/** "2d ago", or "just now". */
export function ago(iso: string): string {
  const t = relTime(iso);
  return t === "—" ? "" : /^\d+s$/.test(t) ? "just now" : `${t} ago`;
}

/** The runs of one question: the same kind, on the same connection, asked in the same words (a scheduled run's
 *  grounding stripped first, so a daily run is one question however its date line reads). */
export interface RunGroup {
  key: string;
  /** The question as a person reads it — never the scheduled run's grounding. */
  title: string;
  scheduled: boolean;
  /** Newest first; `runs[0]` is the latest. */
  runs: Run[];
}

export function foldRuns(runs: readonly Run[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  const newestFirst = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  for (const r of newestFirst) {
    const { title, scheduled } = runDisplayTitle(r.question);
    const key = `${kindOf(r)}|${r.connection_id ?? ""}|${normalizeQuestion(title)}`;
    const g = groups.get(key);
    if (g) g.runs.push(r);
    else groups.set(key, { key, title: plain(title) || "A run with no question recorded", scheduled, runs: [r] });
  }
  return [...groups.values()].sort((a, b) => rank(a.runs[0].status) - rank(b.runs[0].status)
    || b.runs[0].started_at.localeCompare(a.runs[0].started_at));
}

/** A question's runs that match a search: its words, or any run's headline. */
export function matchesSearch(g: RunGroup, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || g.title.toLowerCase().includes(needle)
    || g.runs.some(r => (r.headline ?? "").toLowerCase().includes(needle));
}

type Filter = "all" | "deep" | "chat";

export function AgentRuns({ onGoToChat, onOpenRun, onOpenMachineView, workspaceId }: {
  /** Opens a chat — with a question it asks it straight away. */
  onGoToChat: (q?: string) => void;
  onOpenRun: (id: string, kind: RunKind, connectionId?: string, canvasId?: string | null) => void;
  onOpenMachineView?: () => void;
  workspaceId?: string;
}) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const inShell = useInShell();
  // A row names its connection, never its id.
  const [conns, setConns] = useState<Connection[]>([]);
  useEffect(() => { getConnections().then(setConns).catch(() => {}); }, []);

  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8_000);
      const scope = workspaceId ? `&workspace_id=${encodeURIComponent(workspaceId)}` : "";
      fetch(`${getApiBase()}/investigations?limit=${READ}${scope}`, { signal: ctrl.signal })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`the list was refused (${r.status})`))))
        .then(d => { if (alive) { setRuns(Array.isArray(d) ? d : []); setFailed(null); } })
        .catch(e => { if (alive) setFailed(e instanceof Error ? e.message : String(e)); })
        .finally(() => clearTimeout(to));
    };
    load();
    // Refresh on a run's lifecycle events, so a run started elsewhere (another tab, the API) appears without a reload.
    const unsub = subscribeKernelEvents(() => load(), { kinds: ["investigation."] });
    return () => { alive = false; unsub(); };
  }, [workspaceId, tick]);

  // What else is running in this workspace — the explorer, an automation — from the kernel's jobs, the record Agent Ops
  // lists (the Olist study, Gaps 10 and 34: this page said "No runs yet" through a live exploration). A deep analysis
  // is already a run here, so its job is not counted twice.
  const [live, setLive] = useState<JobRow[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () => {
      Promise.all([getJobs({ state: "active" }), workspaceId ? getWorkspace(workspaceId) : Promise.resolve(null)])
        .then(([jobs, ws]) => {
          if (!alive) return;
          const ids = ws ? new Set(ws.connection_ids ?? []) : null;
          setLive((Array.isArray(jobs) ? jobs : []).filter(j => j.kind !== DEEP_ANALYSIS_JOB_KIND
            && (!ids || (!!j.conn_id && ids.has(j.conn_id)))));
        })
        .catch(() => { /* unread: the runs list stands on its own */ });
    };
    read();
    const unsub = subscribeKernelEvents(() => read(), { kinds: ["job.state"] });
    return () => { alive = false; unsub(); };
  }, [workspaceId, tick]);

  const all = useMemo(() => runs ?? [], [runs]);
  const groups = useMemo(() => foldRuns(all), [all]);

  // A selected deep analysis's own record, read once when it is first selected (a conversation's row holds its answer).
  const [details, setDetails] = useState<Record<string, RunRecord | null>>({});
  const asked = useRef(new Set<string>());
  const readDetail = useCallback((r: Run) => {
    if (isChat(r) || asked.current.has(r.id)) return;
    asked.current.add(r.id);
    getRunRecord(r.id)
      .then(d => setDetails(m => ({ ...m, [r.id]: d })))
      .catch(() => { asked.current.delete(r.id); setDetails(m => ({ ...m, [r.id]: null })); });
  }, []);

  const inspector = useInspector();
  const held = inspector.subject?.key;
  const open = useCallback((r: Run) => onOpenRun(r.id, kindOf(r), r.connection_id, r.canvas_id), [onOpenRun]);
  const subjectOf = useCallback((r: Run, g: RunGroup) => runSubject({
    run: r, group: g, detail: details[r.id], detailRead: r.id in details, conns,
    onOpen: () => open(r), onAskAgain: () => onGoToChat(runDisplayTitle(r.question).title), onOpenMachineView,
    onReadAgain: () => readDetail(r),
  }), [details, conns, open, onGoToChat, onOpenMachineView, readDetail]);
  const pick = (r: Run, g: RunGroup) => { inspector.inspect(subjectOf(r, g)); readDetail(r); };
  // The inspector shows the picked run; when its record arrives or the list refreshes it is drawn again from them.
  useEffect(() => {
    if (!held?.startsWith("run:") || runs === null) return;
    const id = held.slice(4);
    const g = groups.find(x => x.runs.some(r => r.id === id));
    const r = g?.runs.find(x => x.id === id);
    if (!g || !r) { inspector.close(); return; }
    inspector.inspect(subjectOf(r, g));
  }, [details, groups, conns]);   // eslint-disable-line react-hooks/exhaustive-deps

  const liveLine = live.length > 0 && (
    <section aria-label="Running now" data-testid="runs-live" style={CARD}>
      <Label right={countNoun(live.length, "run")}>Running now</Label>
      {live.map((j, i) => (
        <div key={j.id} data-testid="runs-live-row" style={{ ...ROW, gap: 8, padding: "6px 0", ...(i ? RULE : {}) }}>
          <Dot color="var(--blue4)" />
          <span className="aug-fs-chrome" style={{ ...ONE_LINE, color: "var(--t1)", flex: 1, minWidth: 0 }}>{j.title || j.kind}</span>
          <span className="aug-fs-xs" style={MUTED}>
            {j.agent?.agent || j.kind}{j.conn_id ? ` · ${connectionLabel(j.conn_id, conns)}` : ""}
            {j.started_at || j.created_at ? ` · started ${relTime(j.started_at || j.created_at || "")} ago` : ""}
          </span>
          {onOpenMachineView && <Button size="xs" variant="ghost" onClick={onOpenMachineView}>Open in Agent Ops</Button>}
        </div>
      ))}
    </section>
  );

  if (runs === null) {
    return <Page testId="runs">{failed !== null
      ? <ReadFailed what="the runs" error={failed} onRetry={retry} style={CARD} />
      : <Loading what="the runs" style={CARD} />}</Page>;
  }

  if (all.length === 0) {
    return (
      <Page testId="runs">
        {liveLine}
        <section aria-label="Runs" style={CARD}>
          <Empty>{live.length ? "No question asked here yet." : "No runs yet."}</Empty>
          <Button size="xs" variant="secondary" style={{ marginTop: 8 }} onClick={() => onGoToChat()}>Ask a question</Button>
        </section>
      </Page>
    );
  }

  const deep = all.filter(r => !isChat(r)).length;
  const unfinished = all.filter(r => UNFINISHED.has(r.status)).length;
  const running = all.filter(r => r.status === "running").length + live.length;
  const paused = all.filter(r => r.status === "paused").length;
  const since = all.reduce((min, r) => (r.started_at < min ? r.started_at : min), all[0].started_at);
  // Said once: one connection is named in the figures, not on every row; several are named on each row.
  const connIds = [...new Set(all.map(r => r.connection_id).filter((id): id is string => !!id))];
  const where = connIds.length === 1 ? ` · ${connectionLabel(connIds[0], conns)}`
    : connIds.length > 1 ? ` · ${countNoun(connIds.length, "connection")}` : "";
  const capped = all.length >= READ;
  const waiting = groups.filter(g => NEEDS.has(g.runs[0].status));
  const ofKind = filter === "all" ? groups : groups.filter(g => (filter === "chat") === isChat(g.runs[0]));
  const shown = ofKind.filter(g => matchesSearch(g, query));
  const showConn = connIds.length > 1;
  const grid = showConn ? REGISTER_CONN : REGISTER;

  const tools = (
    <>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search questions and answers…"
        aria-label="Search runs" leading={<Icon name="search" size={11} />} style={{ width: 240 }} />
      <Segmented label="Which runs" value={filter} onChange={setFilter} options={[
        { value: "all", label: <>All <span style={{ ...MUTED, ...NUM }}>{formatCount(all.length)}</span></> },
        { value: "deep", label: <>Deep analyses <span style={{ ...MUTED, ...NUM }}>{formatCount(deep)}</span></> },
        { value: "chat", label: <>Conversations <span style={{ ...MUTED, ...NUM }}>{formatCount(all.length - deep)}</span></> },
      ]} />
      {onOpenMachineView && (
        <Button variant="ghost" size="xs" onClick={onOpenMachineView}
          title="The machine view of every run — its events, traces and spans — in Agent Ops">
          Traces &amp; spans <Icon name="chevr" size={12} />
        </Button>
      )}
    </>
  );

  return (
    <Page testId="runs">
      <Tally testId="runs-figures">
        <Figure testId="runs-fig-runs" label="Runs" value={formatCount(all.length)}
          sub={<>
            <span>since {dayWords(since)}{where}</span>
            {capped && <Chip title={`This page reads the newest ${READ} runs; older ones are not listed`}>newest {READ}</Chip>}
          </>} />
        <Figure testId="runs-fig-questions" label="Questions" value={formatCount(groups.length)}
          sub={all.length > groups.length ? `${formatCount(all.length - groups.length)} repeat runs folded` : "none repeated"} />
        <Figure testId="runs-fig-unfinished" label="Didn't finish" value={formatCount(unfinished)}
          tone={unfinished ? "red" : undefined} sub="failed, timed out or stopped" />
        <Figure testId="runs-fig-running" label="Running" value={formatCount(running)}
          sub={paused ? `${formatCount(paused)} paused, waiting` : running ? "in flight now" : "nothing in flight"} />
      </Tally>

      {liveLine}

      {failed !== null && (
        <div className="aug-fs-xs" style={ROW}>
          <Chip tone="amber" title={failed}>not refreshed — showing the last list read</Chip>
          <Button variant="link" size="xs" onClick={retry}>Retry</Button>
        </div>
      )}

      {waiting.length > 0 && (
        <NeedsYou testId="runs-needs" right={countNoun(waiting.length, "question")}>
          {waiting.map(g => {
            const latest = g.runs[0];
            const repeats = g.runs.filter(r => r.status === latest.status).length;
            return (
              <NeedsRow key={g.key} testId="runs-needs-row" title={<span style={ONE_LINE} title={g.title}>{shortQuestion(g.title)}</span>}
                detail={<span style={{ ...ROW, flexWrap: "nowrap", gap: 6 }}>
                  <StatusMark status={latest.status} />
                  <span>· {ago(latest.started_at)}{repeats > 1 ? ` · ${repeats} times` : ""}</span>
                </span>}
                actions={<>
                  <Button size="xs" variant="secondary" onClick={() => open(latest)}>Open</Button>
                  {!g.scheduled && latest.status !== "paused" && (
                    <Button size="xs" variant="ghost" title="Asks it again in a chat"
                      onClick={() => onGoToChat(runDisplayTitle(latest.question).title)}>
                      Ask again
                    </Button>
                  )}
                </>} />
            );
          })}
        </NeedsYou>
      )}

      {/* the register's search and filters: inside the app, the page's toolbar row; on its own, the card's head */}
      {inShell && <ChromeToolbar>{tools}</ChromeToolbar>}
      <section aria-label="Runs by question" data-testid="runs-list" style={CARD}>
        <Label right={<>
          {query.trim() ? <span style={NUM}>{formatCount(shown.length)} of {formatCount(ofKind.length)}</span> : null}
          {!inShell && tools}
        </>}>
          By question
        </Label>
        {shown.length === 0 ? (
          <Empty>{query.trim() ? "No run matches."
            : `${filter === "chat" ? "No conversations" : "No deep analyses"} in the ${capped ? `newest ${READ} runs` : "runs"}.`}</Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div role="table" aria-label="Runs by question" style={{ minWidth: showConn ? 900 : 800 }}>
              <div role="row" className="aug-fs-xs" style={{ ...grid, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px 8px" }}>
                <span role="columnheader">Question</span><span role="columnheader">Kind</span>
                <span role="columnheader">Latest answer</span>
                {showConn && <span role="columnheader">Connection</span>}
                <span role="columnheader" style={{ textAlign: "right" }}>Runs</span>
                <span role="columnheader" style={{ textAlign: "right" }}>When</span>
                <span role="columnheader" />
              </div>
              {shown.map(g => (
                <GroupRow key={g.key} g={g} grid={grid} showConn={showConn} conns={conns} held={held}
                  onPick={r => pick(r, g)} onOpen={open} />
              ))}
            </div>
          </div>
        )}
      </section>
    </Page>
  );
}

/** A status that is not "complete" as its mark — a dot and a word in its hue; nothing for a completed run. */
export function StatusMark({ status }: { status: string }) {
  const m = markOf(status);
  if (!m) return null;
  return (
    <span data-testid="run-status" style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto",
      color: m.hue === "red" ? "var(--red4)" : m.hue === "amber" ? "var(--amb4)" : m.hue === "blue" ? "var(--blue4)" : "var(--t2)" }}>
      <Dot hue={m.hue} />{m.word}
    </span>
  );
}

/** What a run found, as its muted line — or, for a finished run that kept no headline, that it kept none. */
function Headline({ run }: { run: Run }) {
  if (run.headline?.trim()) return <span style={{ ...ONE_LINE, flex: "0 1 auto" }} title={plain(run.headline)}>{plain(run.headline)}</span>;
  return run.status === "complete" ? <span style={{ ...MUTED, flex: "0 0 auto" }}>no headline</span> : null;
}

// ── The register: one row per question ─────────────────────────────────────────────────────────────────────────────

/** Question · Kind · Latest answer · Runs · When · Open — every column a fixed or fractional width (an `auto` one
 *  pulls the header out of line with the rows). */
const REGISTER: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14,
  gridTemplateColumns: "minmax(240px, 2.2fr) 172px minmax(240px, 2.8fr) 56px 72px 60px",
};
/** The same, with a Connection column when the runs span several. */
const REGISTER_CONN: React.CSSProperties = {
  ...REGISTER, gridTemplateColumns: "minmax(240px, 2.2fr) 172px minmax(240px, 2.6fr) minmax(100px, .9fr) 56px 72px 60px",
};
const EARLIER_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14, gridTemplateColumns: "130px minmax(0, 1fr) 60px",
};

const pickedStyle = (picked: boolean): React.CSSProperties => ({
  background: picked ? "var(--bg-hover)" : undefined, boxShadow: picked ? "inset 2px 0 0 var(--blue3)" : undefined,
});
const onEnter = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fn(); }
};
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function GroupRow({ g, grid, showConn, conns, held, onPick, onOpen }: {
  g: RunGroup; grid: React.CSSProperties; showConn: boolean; conns: Connection[]; held?: string;
  onPick: (r: Run) => void; onOpen: (r: Run) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const latest = g.runs[0];
  const earlier = g.runs.slice(1);
  const earlierUnfinished = earlier.filter(r => UNFINISHED.has(r.status)).length;
  const chat = isChat(latest);
  const picked = held === `run:${latest.id}`;
  return (
    <div data-testid="run-group" style={{ borderTop: "1px solid var(--b0)" }}>
      <div role="row" data-testid="run-row" tabIndex={0} aria-selected={picked} title={g.title}
        onClick={() => onPick(latest)} onKeyDown={onEnter(() => onPick(latest))}
        style={{ ...grid, padding: "7px 0 7px 8px", cursor: "pointer", ...pickedStyle(picked) }}>
        <span role="cell" style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ display: "inline-flex", color: "var(--t3)", flex: "0 0 auto" }}>
            <Icon name={chat ? "chat" : "spark"} size={13} />
          </span>
          <span className="aug-fs-chrome" style={{ ...ONE_LINE, color: "var(--t1)", fontWeight: 500 }}>{shortQuestion(g.title)}</span>
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...ROW, flexWrap: "nowrap", gap: 6, color: "var(--t2)", minWidth: 0 }}>
          <span style={ONE_LINE}>{chat ? "conversation" : "deep analysis"}</span>
          {g.scheduled && <Chip title="Asked by a schedule, not a person">scheduled</Chip>}
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...ROW, flexWrap: "nowrap", gap: 6, color: "var(--t2)", minWidth: 0 }}>
          <StatusMark status={latest.status} />
          <Headline run={latest} />
          {earlierUnfinished > 0 && (
            <Chip tone="down" title="Earlier runs of this question that ended without an answer">
              {formatCount(earlierUnfinished)} earlier didn&apos;t finish
            </Chip>
          )}
        </span>
        {showConn && (
          <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }}>
            {latest.connection_id ? connectionLabel(latest.connection_id, conns) : ""}
          </span>
        )}
        <span role="cell" style={{ textAlign: "right" }} onClick={stop} onKeyDown={stop}>
          {earlier.length > 0 ? (
            <Button variant="ghost" size="xs" aria-expanded={expanded} onClick={() => setExpanded(e => !e)}
              title={expanded ? "Hide the earlier runs" : `Show the ${countNoun(earlier.length, "earlier run")}`}
              style={{ ...NUM, fontWeight: 600, color: "var(--t1)" }}>
              ×{formatCount(g.runs.length)} <Icon name={expanded ? "chevu" : "chevd"} size={12} />
            </Button>
          ) : <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>1</span>}
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...MUTED, ...NUM, textAlign: "right", whiteSpace: "nowrap" }}
          title={formatTimestamp(latest.started_at)}>
          {ago(latest.started_at)}
        </span>
        <span role="cell" style={{ justifySelf: "end" }} onClick={stop} onKeyDown={stop}>
          <Button size="xs" variant="outline" onClick={() => onOpen(latest)}
            title={chat ? "Opens the conversation" : "Opens the run where it was asked"}>Open</Button>
        </span>
      </div>
      {expanded && (
        <div data-testid="run-earlier" style={{ margin: "0 0 6px 28px", paddingLeft: 10, borderLeft: "1px solid var(--b1)" }}>
          {earlier.map(r => {
            const on = held === `run:${r.id}`;
            return (
              <div key={r.id} role="row" data-testid="run-earlier-row" tabIndex={0} aria-selected={on}
                title={formatTimestamp(r.started_at)} onClick={() => onPick(r)} onKeyDown={onEnter(() => onPick(r))}
                style={{ ...EARLIER_GRID, padding: "4px 0 4px 8px", cursor: "pointer", ...pickedStyle(on) }}>
                <span role="cell" className="aug-fs-xs" style={{ ...MUTED, ...NUM, whiteSpace: "nowrap" }}>{formatTimestamp(r.started_at, "short")}</span>
                <span role="cell" className="aug-fs-xs" style={{ ...ROW, flexWrap: "nowrap", gap: 6, color: "var(--t2)", minWidth: 0 }}>
                  <StatusMark status={r.status} />
                  <Headline run={r} />
                </span>
                <span role="cell" style={{ justifySelf: "end" }} onClick={stop} onKeyDown={stop}>
                  <Button size="xs" variant="ghost" onClick={() => onOpen(r)}>Open</Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── A run in the inspector ─────────────────────────────────────────────────────────────────────────────────────────

/** How the study labels a figure's origin (§12.3): a hairline word, and what it means beside it. */
function Origin({ word, says, testId }: { word: string; says: string; testId?: string }) {
  return (
    <div data-testid={testId} className="aug-fs-xs" style={{ ...ROW, gap: 6, color: "var(--t3)", marginBottom: 4 }}>
      <span style={{ border: "1px solid var(--b2)", borderRadius: "var(--r-chip)", padding: "0 6px", color: "var(--t2)", lineHeight: "16px" }}>
        {word}
      </span>
      {says}
    </div>
  );
}

const CODE: React.CSSProperties = {
  margin: 0, background: "var(--code-bg)", borderRadius: "var(--r2)", padding: "8px 10px", whiteSpace: "pre-wrap",
  overflowWrap: "anywhere", fontFamily: "var(--font-code)", color: "var(--t2)", minWidth: 0,
};

/** A finding's statement, exactly as it ran, with Open in SQL Editor where the app provides one. */
function FindingSql({ f, connId }: { f: RunFinding; connId?: string }) {
  const openInQuery = useOpenInQuery();
  return (
    <div data-testid="run-finding" style={{ padding: "8px 0", ...RULE }}>
      <div className="aug-fs-xs" style={{ ...ROW, gap: 6, flexWrap: "nowrap", marginBottom: 4 }}>
        <span style={{ ...ONE_LINE, color: "var(--t1)", fontWeight: 500 }} title={f.title}>{f.title || f.finding_id || "A finding"}</span>
        <span style={{ marginLeft: "auto", ...MUTED, ...NUM, whiteSpace: "nowrap" }}>
          {f.error ? "failed" : f.row_count != null ? countNoun(f.row_count, "row") : ""}
        </span>
        {openInQuery && f.sql && (
          <Button size="xs" variant="ghost" title="Opens the statement, as it ran, in a new SQL Editor tab — it is not run"
            onClick={() => openInQuery({ sql: f.sql!, connId, mode: "sql", name: f.title })}>Open in SQL Editor</Button>
        )}
      </div>
      {f.sql && <pre className="aug-fs-xs" style={CODE}>{f.sql}</pre>}
      {f.error && <div className="aug-fs-xs" style={{ color: "var(--red4)", marginTop: 4 }}>{f.error}</div>}
    </div>
  );
}

const durationOf = (r: Run) => {
  if (!r.completed_at) return null;
  const ms = Date.parse(r.completed_at) - Date.parse(r.started_at);
  return Number.isFinite(ms) && ms > 0 ? formatSeconds(ms) : null;
};

/** A run in the inspector: what it was asked and found (the headline as the model's narrative), its figures, its
 *  stages as they ran, the SQL each finding executed with its gaps and what it withheld, and its actions. A deep
 *  analysis's own record is read on selection; until it lands the overview says what the list holds. */
export function runSubject({ run: r, group: g, detail, detailRead, conns, onOpen, onAskAgain, onOpenMachineView, onReadAgain }: {
  run: Run; group: RunGroup; detail: RunRecord | null | undefined; detailRead: boolean; conns: Connection[];
  onOpen: () => void; onAskAgain: () => void; onOpenMachineView?: () => void; onReadAgain: () => void;
}) {
  const chat = isChat(r);
  const report = detail?.report ?? null;
  const mark = markOf(r.status);
  const conn = r.connection_id ? connectionLabel(r.connection_id, conns) : null;
  const took = durationOf(r);
  const phases = withUniqueKeys(report?.phases ?? [], p => p.phase_id);
  const findings = phases.flatMap(([, p]) => p.findings ?? []);
  const executed = findings.filter(f => f.sql);
  const metric = typeof report?.metric === "string" ? report.metric : report?.metric?.stated;
  const period = report?.period_as_measured;
  const pending = !chat && !detailRead;
  const unread = !chat && detailRead && !detail;
  const reading = pending ? <div className="aug-fs-xs" style={MUTED}>Reading the run’s record…</div>
    : unread ? (
      <div className="aug-fs-xs" style={{ ...ROW, color: "var(--t2)" }}>
        <Chip tone="amber">its record could not be read</Chip>
        <Button size="xs" variant="link" onClick={onReadAgain}>Read again</Button>
      </div>
    ) : null;
  const headline = report?.headline || r.headline;

  const overview = (
    <div data-testid="run-overview" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      {headline?.trim() ? (
        <div>
          <Origin testId="run-narrative-label" word="Narrative"
            says={chat ? "the answer, written by the model from the rows its query returned" : "written by the model from the run’s queries"} />
          <div className="aug-fs-sm" style={{ color: "var(--t1)", whiteSpace: "pre-wrap" }}>{plain(headline)}</div>
          {report?.executive_summary && (
            <div className="aug-fs-xs" style={{ color: "var(--t2)", marginTop: 6 }}>{plain(report.executive_summary)}</div>
          )}
        </div>
      ) : (
        <div className="aug-fs-xs" style={MUTED}>{r.status === "complete" ? "It kept no headline." : "It ended without an answer."}</div>
      )}
      <InspectorFacts rows={[
        { label: "Question", value: g.title },
        { label: "Asked by", value: g.scheduled ? "a schedule" : "a person" },
        ...(conn ? [{ label: "Connection", value: report?.frame?.schema_name ? `${conn} · ${report.frame.schema_name}` : conn }] : []),
        { label: "Status", value: mark ? mark.word : "complete", note: detail?.error || undefined },
        { label: "Started", value: formatTimestamp(r.started_at), note: took ? `took ${took}` : undefined },
        ...(metric ? [{ label: "Metric", value: metric }] : []),
        ...(period?.stated ? [{ label: "Period measured", value: period.stated,
          note: period.within_stated === false ? "some reads fell outside the question’s window" : undefined }] : []),
        ...(report?.confidence ? [{ label: "Confidence", value: `${report.confidence.toLowerCase()} — the report’s own grade`,
          note: report.confidence_justification }] : []),
        ...(chat && r.query_count != null ? [{ label: "Statements", value: formatCount(r.query_count),
          note: "Its SQL is in the conversation" }] : []),
        ...(g.runs.length > 1 ? [{ label: "Asked", value: `${formatCount(g.runs.length)} times`,
          note: "this run and its earlier ones, under ×N on the row" }] : []),
      ]} />
      {(report?.figures?.length ?? 0) > 0 && (
        <div data-testid="run-figures">
          <Origin word="Narrative" says="figures the report quotes; one the platform could not match to a result is withheld (Provenance)" />
          {withUniqueKeys(report!.figures!, f => f.label).map(([key, f], i) => (
            <div key={key} className="aug-fs-xs" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", columnGap: 10,
              padding: "5px 0", ...(i ? RULE : {}) }}>
              <span style={{ color: "var(--t2)", minWidth: 0 }}>{f.label}{f.note && <span style={{ ...MUTED, display: "block" }}>{f.note}</span>}</span>
              <span style={{ ...NUM, color: "var(--t1)", fontWeight: 600 }}>{f.value}</span>
            </div>
          ))}
        </div>
      )}
      {reading}
    </div>
  );

  const activity = chat ? undefined : (
    phases.length === 0 ? (reading ?? <Empty>Its record holds no stages.</Empty>) : (
      <div data-testid="run-stages" style={{ minWidth: 0 }}>
        {phases.map(([key, p], i) => (
          <div key={key} data-testid="run-stage" className="aug-fs-xs" style={{ padding: "7px 0", ...(i ? RULE : {}) }}>
            <div style={{ ...ROW, gap: 6, flexWrap: "nowrap" }}>
              <Dot hue={p.status === "complete" ? "green" : p.status === "failed" ? "red" : "grey"} />
              <span style={{ ...ONE_LINE, color: "var(--t1)", fontWeight: 500 }} title={p.phase_name}>{p.phase_name}</span>
              <span style={{ marginLeft: "auto", ...MUTED, whiteSpace: "nowrap" }}>
                {p.status === "complete" ? "" : `${keyToWords(p.status)} · `}{countNoun(p.findings?.length ?? 0, "finding")}
              </span>
            </div>
            {p.summary && <div style={{ color: "var(--t2)", marginTop: 2 }}>{plain(p.summary)}</div>}
          </div>
        ))}
      </div>
    )
  );

  const provenance = (
    <div data-testid="run-provenance" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <InspectorFacts rows={[
        { label: "Run", value: <span style={NUM}>{r.id}</span> },
        ...(detail?.trace_id ? [{ label: "Trace", value: <span style={NUM}>{detail.trace_id}</span>,
          note: "its spans are under Traces & spans in Agent Ops" }] : []),
        ...(conn ? [{ label: "Ran on", value: conn }] : []),
      ]} />
      {chat ? (
        <div className="aug-fs-xs" style={MUTED}>A conversation keeps its statements on its turns — Open shows each one’s SQL as it ran.</div>
      ) : reading ?? (
        <>
          <div>
            <Origin testId="run-computed-label" word="Computed" says={`from the executed statements · ${countNoun(executed.length, "statement")}`} />
            {executed.length === 0
              ? <Empty>Its record keeps no executed statement.</Empty>
              : withUniqueKeys(executed, f => f.finding_id ?? f.title ?? "").map(([key, f]) => (
                <FindingSql key={key} f={f} connId={r.connection_id} />
              ))}
          </div>
          {(report?.data_gaps?.length ?? 0) > 0 && (
            <div data-testid="run-gaps">
              <Label>What it could not establish</Label>
              {withUniqueKeys(report!.data_gaps!, t => t).map(([key, t], i) => (
                <div key={key} className="aug-fs-xs" style={{ color: "var(--t2)", padding: "5px 0", ...(i ? RULE : {}) }}>{plain(t)}</div>
              ))}
            </div>
          )}
          {(report?.withheld?.length ?? 0) > 0 && (
            <div data-testid="run-withheld">
              <Label>Withheld</Label>
              {withUniqueKeys(report!.withheld!, w => w.text).map(([key, w], i) => (
                <div key={key} className="aug-fs-xs" style={{ padding: "5px 0", ...(i ? RULE : {}) }}>
                  <div style={{ color: "var(--t2)" }}>{plain(w.text)}</div>
                  <div style={{ ...MUTED, marginTop: 2 }}>
                    from {keyToWords(w.from)}{w.figures?.length ? ` · the figure${w.figures.length > 1 ? "s" : ""} ${w.figures.join(", ")} matched no result` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const actions = (
    <div style={{ ...ROW }}>
      <Button size="xs" variant="outline" onClick={onOpen}>{chat ? "Open the conversation" : "Open the run"}</Button>
      {!g.scheduled && r.status !== "paused" && (
        <Button size="xs" variant="outline" onClick={onAskAgain} title="Asks it again in a chat">Ask again</Button>
      )}
      {onOpenMachineView && <Button size="xs" variant="ghost" onClick={onOpenMachineView}>Traces &amp; spans</Button>}
    </div>
  );

  return {
    key: `run:${r.id}`, kind: chat ? "Conversation" : "Deep analysis", title: shortQuestion(g.title),
    icon: chat ? "chat" as const : "spark" as const,
    meta: <>{mark ? mark.word : "complete"} · {ago(r.started_at) || formatTimestamp(r.started_at)}{conn ? ` · ${conn}` : ""}</>,
    tab: "overview" as const,
    tabs: { overview, ...(activity ? { activity } : {}), provenance, actions },
  };
}
