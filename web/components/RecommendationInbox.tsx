"use client";

/**
 * The Inbox — what the deep analyses recommended, and what became of each. Four figures (open, in progress,
 * verified, closed), then the reviews that came due in amber with their answer on the row, then the queue, then where
 * the recommendations stand beside who they are for.
 *
 * The queue is the Evidence → Action study's decision grid (§13.1, 2026-11-10, the third screen of the overhaul):
 * one row a recommendation — Recommendation · Expected impact · Owner · Status · Due · Evidence (the deep analysis it
 * came from) · Read (when) — with search, Open/All and an owner filter in the page's toolbar row. Selecting one opens
 * the shell's inspector: its overview, the analysis behind it, what acceptance recorded, and its actions. The study's
 * Priority and Affected object columns are not drawn: a recommendation carries neither.
 *
 * A report keeps its recommendations as `recommendations` — `{ action, expected_impact, owner, timeline }` — and
 * an older or hand-built one as `recommended_actions`, plain strings. This page read only the second, so on an
 * install whose every report used the first it said "No pending recommendations" over seventeen of them. Both are
 * read now, in the order the report holds them: the index is the one the outcome and Execute doors key by.
 */
import { DropdownMenu } from "@radix-ui/themes";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExecuteRecommendation as ExecuteButton } from "@/components/actions/ExecuteRecommendation";
import {
  Bar, CARD, Card, Chip, Dot, Empty, Figure, Tally, MUTED, NUM, NeedsYou, ONE_LINE, ROW, RULE, type Tone,
} from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select";
import { ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import { InspectorFacts, useInspector } from "@/components/shell/Inspector";
import { Loading, ReadFailed } from "@/components/ui/states";
import { getInvestigationOutcomes as readOutcomes, logOutcome, type RecOutcome, type RecStatus } from "@/lib/api";
import { getApiBase } from "@/lib/config";
import { countNoun, formatCount } from "@/lib/format";
import { dayWords } from "@/lib/home";
import { runDisplayTitle } from "@/lib/runTitle";

/** How many of the newest deep analyses the page reads — said on the page, never implied. */
const READ = 20;

const TERMINAL: RecStatus[] = ["verified", "rejected", "dismissed"];
const STATUSES: RecStatus[] = ["accepted", "implemented", "verified", "rejected", "dismissed"];

/** A status as a mark: its word and its colour. "Proposed" is a model's suggestion nobody has decided on (violet). */
const MARK: Record<RecStatus | "proposed", { word: string; color: string; tone: Tone }> = {
  proposed: { word: "proposed", color: "var(--vio4)", tone: "violet" },
  accepted: { word: "accepted", color: "var(--blue4)", tone: "accent" },
  implemented: { word: "implemented", color: "var(--blue4)", tone: "accent" },
  verified: { word: "verified", color: "var(--grn4)", tone: "up" },
  rejected: { word: "rejected", color: "var(--red4)", tone: "down" },
  dismissed: { word: "dismissed", color: "var(--t3)", tone: "plain" },
};

/** One recommendation as the page reads it. */
export interface Rec { action: string; impact: string; owner: string; timeline: string }

/** A report's recommendations, in the order the report holds them, from either shape it may keep them in. */
export function readRecs(report: unknown): Rec[] {
  const r = (report && typeof report === "object" ? report : {}) as Record<string, unknown>;
  const raw = Array.isArray(r.recommendations) && r.recommendations.length ? r.recommendations
    : Array.isArray(r.recommended_actions) ? r.recommended_actions : [];
  return raw.map(item => {
    if (typeof item === "string") return { action: item.trim(), impact: "", owner: "", timeline: "" };
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const text = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
    const impact = text("expected_impact");
    return { action: text("action") || text("text"), impact: /^n\/?a$/i.test(impact) ? "" : impact,
      owner: text("owner"), timeline: text("timeline") };
  }).filter(x => x.action);
}

/** The analyses the list endpoint returns, as this page uses them. */
interface Analysis {
  id: string; question: string; headline: string | null; status: string; kind: string;
  started_at: string; completed_at: string | null;
}

interface Item { run: Analysis; recs: Rec[] }
interface QueueRow { run: Analysis; rec: Rec; index: number; outcome: RecOutcome | undefined }

const keyOf = (runId: string, index: number) => `${runId}:${index}`;
const isOpen = (o: RecOutcome | undefined) => !o || !TERMINAL.includes(o.status);
const titleOf = (run: Analysis) => run.headline?.trim() || runDisplayTitle(run.question).title;

/** "by 18 Oct" for a date the report set; the model's own words ("Next 7 days") otherwise. */
function timelineWords(t: string): string {
  if (!t) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? `by ${dayWords(t)}` : t.toLowerCase();
}

/** A date the report set that has passed while the recommendation is still open. */
function overdue(t: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && t < today;
}

interface Props {
  onOpenInvestigation?: (runId: string) => void;
  /** Active workspace — scopes recommendations to its connections' deep analyses. */
  workspaceId?: string;
}

export function RecommendationInbox({ onOpenInvestigation: openRun, workspaceId }: Props) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [unread, setUnread] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Map<string, RecOutcome>>(new Map());
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const inShell = useInShell();
  const inspector = useInspector();
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setFailed(null);
      try {
        const res = await fetch(`${getApiBase()}/investigations?limit=${READ}${workspaceId ? `&workspace_id=${encodeURIComponent(workspaceId)}` : ""}`);
        if (!res.ok) throw new Error(`the list was refused (${res.status})`);
        const runs: Analysis[] = await res.json();
        const done = runs.filter(r => r.status === "complete" && r.kind === "investigation");
        const missed: string[] = [];
        const read = await Promise.all(done.map(async run => {
          try {
            const [detail, outs] = await Promise.all([
              fetch(`${getApiBase()}/investigations/${encodeURIComponent(run.id)}`)
                .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
              readOutcomes(run.id),
            ]);
            return { run, recs: readRecs(detail?.report), outs };
          } catch {
            // Not skipped in silence: the page says how many analyses it could not read.
            missed.push(titleOf(run));
            return null;
          }
        }));
        if (cancelled) return;
        const got = read.filter((x): x is { run: Analysis; recs: Rec[]; outs: RecOutcome[] } => x !== null && x.recs.length > 0);
        const map = new Map<string, RecOutcome>();
        for (const x of got) for (const o of x.outs) map.set(keyOf(x.run.id, o.rec_index), o);
        setOutcomes(map);
        setItems(got.map(({ run, recs }) => ({ run, recs })));
        setUnread(missed);
      } catch (e) {
        if (!cancelled) { setFailed(e instanceof Error ? e.message : String(e)); setItems(null); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [workspaceId, tick]);

  const onOutcome = useCallback((o: RecOutcome) => {
    setOutcomes(prev => new Map(prev).set(keyOf(o.inv_id, o.rec_index), o));
  }, []);

  const rows = useMemo(() => {
    const out: QueueRow[] = [];
    for (const it of items ?? []) it.recs.forEach((rec, index) => out.push({ run: it.run, rec, index, outcome: outcomes.get(keyOf(it.run.id, index)) }));
    // Open first, then the newest analysis first, then the report's own order.
    const when = (r: Analysis) => r.completed_at ?? r.started_at;
    return out.sort((a, b) => Number(isOpen(b.outcome)) - Number(isOpen(a.outcome))
      || when(b.run).localeCompare(when(a.run)) || a.index - b.index);
  }, [items, outcomes]);

  // The inspector shows the picked recommendation; when its outcome changes (marked here or in the inspector) the
  // panel is drawn again from the new row, so it never shows a status the row has left.
  const inspectRow = useCallback((r: QueueRow) => {
    setPicked(keyOf(r.run.id, r.index));
    inspector.inspect(recSubject(r, onOutcome, openRun));
  }, [inspector, onOutcome, openRun]);
  const heldKey = inspector.subject?.key;
  useEffect(() => {
    if (!picked || heldKey !== `inbox:${picked}`) return;
    const r = rows.find(x => keyOf(x.run.id, x.index) === picked);
    if (r) inspector.inspect(recSubject(r, onOutcome, openRun));
  }, [rows]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (failed !== null) {
    return <ReadFailed what="the recommendations" error={failed} onRetry={reload} />;
  }
  if (items === null) return <Loading what="the recommendations" />;

  const count = (pred: (o: RecOutcome | undefined) => boolean) => rows.filter(r => pred(r.outcome)).length;
  const open = count(isOpen);
  const inProgress = count(o => o?.status === "accepted" || o?.status === "implemented");
  const verified = count(o => o?.status === "verified");
  const rejected = count(o => o?.status === "rejected");
  const dismissed = count(o => o?.status === "dismissed");
  const runsWithOpen = new Set(rows.filter(r => isOpen(r.outcome)).map(r => r.run.id)).size;
  const due = rows.filter(r => r.outcome?.review_question && isOpen(r.outcome));
  const q = query.trim().toLowerCase();
  const owners = [...new Set(rows.map(r => r.rec.owner).filter(Boolean))].sort();
  const visible = rows
    .filter(r => filter === "all" || isOpen(r.outcome))
    .filter(r => !owner || r.rec.owner === owner)
    .filter(r => !q || [r.rec.action, r.rec.impact, r.rec.owner, titleOf(r.run)].some(t => t.toLowerCase().includes(q)));
  const narrowed = !!q || !!owner;
  const tools = (
    <>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search recommendations…"
        aria-label="Search recommendations" leading={<Icon name="search" size={11} />} style={{ width: 240 }} />
      <Segmented label="Which recommendations" value={filter} onChange={setFilter}
        options={[{ value: "pending", label: "Open" }, { value: "all", label: "All" }]} />
      <SelectField bespoke aria-label="Owner" value={owner} onChange={e => setOwner(e.target.value)} style={{ minWidth: 150 }}
        data-testid="inbox-owner">
        <option value="">Every owner</option>
        {owners.map(o => <option key={o} value={o}>{o}</option>)}
      </SelectField>
    </>
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div data-testid="inbox" style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%" }}>
      <Tally testId="inbox-figures">
        <Figure testId="inbox-fig-open" label="Open" value={formatCount(open)}
          title={`Recommendations nobody has verified, rejected or dismissed, from the newest ${READ} deep analyses`}
          sub={<>
            <span>{open ? `from ${countNoun(runsWithOpen, "deep analysis", "deep analyses")}` : "nothing open"}</span>
            <Chip title={`Only the newest ${READ} deep analyses are read here`}>newest {READ} read</Chip>
          </>} />
        <Figure testId="inbox-fig-progress" label="In progress" value={formatCount(inProgress)} sub="accepted or implemented" />
        <Figure testId="inbox-fig-verified" label="Verified" value={formatCount(verified)} sub="checked again and held" />
        <Figure testId="inbox-fig-closed" label="Closed" value={formatCount(rejected + dismissed)}
          sub={`${rejected} rejected · ${dismissed} dismissed`} />
      </Tally>

      {unread.length > 0 && (
        <div className="aug-fs-xs" style={ROW}>
          <Chip tone="amber" title={unread.join("\n")}>{countNoun(unread.length, "deep analysis", "deep analyses")} could not be read</Chip>
          <Button variant="link" size="xs" onClick={reload}>Retry</Button>
        </div>
      )}

      <NeedsYou testId="inbox-needs" right={due.length ? `${countNoun(due.length, "review")} due` : undefined} empty={<span title="When a recommendation is accepted, a review date is set; on that day its question is asked here">No review has come due.</span>}>
        {due.map((r, i) => (
          <DueRow key={keyOf(r.run.id, r.index)} first={i === 0} runId={r.run.id} index={r.index} rec={r.rec}
            outcome={r.outcome!} onOutcome={onOutcome} />
        ))}
      </NeedsYou>

      {/* the queue's search and filters: inside the app, the page's toolbar row; on its own, the card's head */}
      {inShell && <ChromeToolbar>{tools}</ChromeToolbar>}
      <section aria-label="Recommendations" data-testid="inbox-list" style={CARD}>
        <div className="aug-fs-xs" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--t3)",
          textTransform: "uppercase", letterSpacing: ".06em" }}>
          Recommendations
          <span style={{ textTransform: "none", letterSpacing: 0 }}>
            {narrowed ? `${formatCount(visible.length)} shown` : null}
          </span>
          {!inShell && <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, ...ROW }}>{tools}</span>}
        </div>
        {visible.length === 0 ? (
          <Empty title="Recommendations arrive from deep analyses; one needing your decision lands here">
            {narrowed ? "No recommendation matches." : filter === "pending"
              ? (rows.length ? "Every recommendation here has been decided." : `No recommendation in the newest ${READ} deep analyses.`)
              : `No recommendation in the newest ${READ} deep analyses.`}
          </Empty>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 1100 }} role="table" aria-label="Recommendations">
              <div role="row" className="aug-fs-xs" style={{ ...QUEUE_GRID, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px 8px" }}>
                <span role="columnheader">Recommendation</span><span role="columnheader">Expected impact</span>
                <span role="columnheader">Owner</span><span role="columnheader">Status</span><span role="columnheader">Due</span>
                <span role="columnheader">Evidence</span><span role="columnheader">Read</span><span role="columnheader" />
              </div>
              {visible.map((r, i) => (
                <RecRow key={keyOf(r.run.id, r.index)} first={i === 0} run={r.run} index={r.index} rec={r.rec}
                  outcome={r.outcome} today={today} onOutcome={onOutcome} onOpen={openRun}
                  picked={picked === keyOf(r.run.id, r.index) && heldKey === `inbox:${picked}`}
                  onPick={() => inspectRow(r)} />
              ))}
            </div>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card label="Where they stand" testId="inbox-funnel" right={`${countNoun(rows.length, "recommendation")}`}>
              <Funnel rows={rows.map(r => r.outcome)} />
            </Card>
          </div>
          <div style={{ flex: "1 1 340px", minWidth: 0 }}>
            <Card label="Who they are for" testId="inbox-owners" right="open · by owner">
              <Owners recs={rows.filter(r => isOpen(r.outcome)).map(r => r.rec)} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

// ── the picture ──────────────────────────────────────────────────────────────────────────

const RANK: Partial<Record<RecStatus, number>> = { accepted: 1, implemented: 2, verified: 3 };

/** The process a recommendation goes through, as stage · bar · count: how many reached at least each stage. */
function Funnel({ rows }: { rows: (RecOutcome | undefined)[] }) {
  const reached = (n: number) => rows.filter(o => (o ? RANK[o.status] ?? -1 : 0) >= n).length;
  const stages: [string, number][] = [["Proposed", rows.length], ["Accepted", reached(1)], ["Implemented", reached(2)], ["Verified", reached(3)]];
  const off = rows.filter(o => o?.status === "rejected").length;
  const gone = rows.filter(o => o?.status === "dismissed").length;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 40px", gap: "7px 10px", alignItems: "center" }}>
        {stages.map(([stage, n], i) => (
          <div key={stage} style={{ display: "contents" }}>
            <span className="aug-fs-sm" style={{ color: "var(--t2)" }}>{stage}</span>
            <Bar value={n} max={rows.length} color={i === 0 ? "var(--chart-3)" : "var(--chart-1)"} />
            <span className="aug-fs-sm" style={{ ...NUM, textAlign: "right", color: "var(--t1)" }}>{formatCount(n)}</span>
          </div>
        ))}
      </div>
      <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 8 }}>{off} rejected · {gone} dismissed</div>
    </div>
  );
}

function Owners({ recs }: { recs: Rec[] }) {
  if (recs.length === 0) return <Empty>Nothing open.</Empty>;
  const by = new Map<string, number>();
  for (const r of recs) by.set(r.owner || "no owner named", (by.get(r.owner || "no owner named") ?? 0) + 1);
  const ranked = [...by.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, 5);
  const max = top[0]?.[1] ?? 1;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 190px) minmax(0, 1fr) 40px", gap: "7px 10px", alignItems: "center" }}>
        {top.map(([owner, n]) => (
          <div key={owner} style={{ display: "contents" }}>
            <span className="aug-fs-sm" style={{ ...ONE_LINE, color: owner === "no owner named" ? "var(--t3)" : "var(--t2)" }} title={owner}>{owner}</span>
            <Bar value={n} max={max} />
            <span className="aug-fs-sm" style={{ ...NUM, textAlign: "right", color: "var(--t1)" }}>{formatCount(n)}</span>
          </div>
        ))}
      </div>
      {ranked.length > 5 && (
        <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 8 }} title={ranked.slice(5).map(([o, n]) => `${o} · ${n}`).join("\n")}>
          +{ranked.length - 5} more owners · {formatCount(ranked.slice(5).reduce((s, [, n]) => s + n, 0))} open
        </div>
      )}
    </div>
  );
}

// ── rows ─────────────────────────────────────────────────────────────────────────────────

/** Mark a recommendation; a write that failed says so on its row (it used to be swallowed). */
function useMark(runId: string, index: number, text: string, onOutcome: (o: RecOutcome) => void) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mark = useCallback(async (status: RecStatus) => {
    setSaving(true);
    setError("");
    try { onOutcome(await logOutcome(runId, index, text, status)); }
    catch (e) { setError(`Not marked ${status} — ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  }, [runId, index, text, onOutcome]);
  return { mark, saving, error };
}

function MarkMenu({ current, saving, onMark }: { current?: RecStatus; saving: boolean; onMark: (s: RecStatus) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button variant="outline" size="xs" disabled={saving}>
          {saving ? "Marking…" : current ? "Change" : "Mark"} <Icon name="chevd" size={12} />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="1" align="end">
        {STATUSES.map(s => (
          <DropdownMenu.Item key={s} disabled={s === current} onSelect={() => onMark(s)}>{MARK[s].word}</DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function StatusMark({ status }: { status: RecStatus | "proposed" }) {
  const m = MARK[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: m.color }}>
      <Dot color={m.color} />{m.word}
    </span>
  );
}

const QUEUE_GRID = {
  display: "grid", alignItems: "center", columnGap: 14,
  // Every column a fixed or fractional width — an `auto` one sized per row and pulled the header out of line with the
  // rows (seen live, 2026-11-10); the last holds Execute and Mark.
  gridTemplateColumns: "minmax(240px, 3fr) minmax(120px, 1.6fr) minmax(80px, .8fr) 100px minmax(100px, 1fr) minmax(140px, 1.6fr) 64px 176px",
} as const;

/** One recommendation in the queue. Its words open it in the inspector; Execute and Mark act on it where it is. */
function RecRow({ first, run, index, rec, outcome, today, onOutcome, onOpen, picked, onPick }: {
  first: boolean; run: Analysis; index: number; rec: Rec; outcome: RecOutcome | undefined; today: string;
  onOutcome: (o: RecOutcome) => void; onOpen?: (runId: string) => void; picked: boolean; onPick: () => void;
}) {
  const { mark, saving, error } = useMark(run.id, index, rec.action, onOutcome);
  const open = isOpen(outcome);
  const late = open && overdue(rec.timeline, today);
  const source = titleOf(run);
  const none = <span style={MUTED}>—</span>;
  return (
    // The row is selected as a whole — a click or Enter opens it in the inspector (the study: "selecting a case opens
    // the inspector"); Execute, Mark and the analysis link keep their own clicks.
    <div role="row" data-testid="inbox-rec" data-picked={picked || undefined} aria-selected={picked} tabIndex={0}
      onClick={onPick}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      title={rec.impact ? `${rec.action}\n\nExpected: ${rec.impact}` : rec.action}
      style={{ padding: "7px 0 7px 8px", opacity: open ? 1 : 0.7, ...RULE, cursor: "pointer",
        background: picked ? "var(--bg-hover)" : undefined, boxShadow: picked ? "inset 2px 0 0 var(--blue3)" : undefined }}>
      <div style={QUEUE_GRID}>
        <span role="cell" style={{ minWidth: 0 }}>
          <div className="aug-fs-chrome" data-testid="inbox-rec-open" style={{ ...ONE_LINE, color: "var(--t1)" }}>{rec.action}</div>
          {/* What acceptance decided: the baseline measured then, and the review date. */}
          {outcome?.baseline_at && (
            <div className="aug-fs-xs" style={{ ...MUTED, ...ONE_LINE }}>
              {outcome.baseline_value != null
                ? `baseline ${outcome.metric_name ?? "metric"} ${outcome.baseline_value} (${outcome.baseline_window})`
                : `baseline not measured${outcome.review_note ? `: ${outcome.review_note}` : ""}`}
              {outcome.review_at ? ` · review ${dayWords(outcome.review_at)}` : ""}
            </div>
          )}
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={rec.impact || undefined}>{rec.impact || none}</span>
        <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={rec.owner || undefined}>{rec.owner || none}</span>
        <span role="cell" className="aug-fs-xs">
          {/* Every open row is "proposed" until someone decides (violet). */}
          <StatusMark status={outcome?.status ?? "proposed"} />
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={rec.timeline ? timelineWords(rec.timeline) : undefined}>
          {!rec.timeline ? none : late
            ? <Chip tone="amber" title="The date the report set has passed and it is still open">was due {dayWords(rec.timeline)}</Chip>
            : timelineWords(rec.timeline)}
        </span>
        {/* The analysis it came from, cut to one line; its question on hover. An ellipsis cannot cut a button,
            so the words inside it are what is cut. */}
        <span role="cell" className="aug-fs-xs" style={{ minWidth: 0, display: "flex" }} onClick={e => e.stopPropagation()}
          title={`${runDisplayTitle(run.question).title} · ${dayWords(run.completed_at ?? run.started_at)}`}>
          {onOpen
            ? <Button variant="link" size="xs" onClick={() => onOpen(run.id)}
                style={{ height: "auto", padding: 0, margin: 0, minWidth: 0, flexShrink: 1 }}>
                <span style={ONE_LINE}>{source}</span>
              </Button>
            : <span style={{ ...ONE_LINE, color: "var(--t2)" }}>{source}</span>}
        </span>
        <span role="cell" className="aug-fs-xs" style={{ ...MUTED, whiteSpace: "nowrap" }}
          title="When the deep analysis it came from finished">{dayWords(run.completed_at ?? run.started_at)}</span>
        <span role="cell" style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}
          onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          <ExecuteButton invId={run.id} index={index} />
          {open && <MarkMenu current={outcome?.status} saving={saving} onMark={s => void mark(s)} />}
        </span>
      </div>
      {error && <div className="aug-fs-xs" role="alert" style={{ color: "var(--red4)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

/** A recommendation in the inspector: what it says and expects, the analysis behind it, what acceptance recorded,
 *  and its actions (the study's §13.1 inspector, drawn from what a recommendation carries). */
function recSubject(r: QueueRow, onOutcome: (o: RecOutcome) => void, onOpen?: (runId: string) => void) {
  const o = r.outcome;
  const status = o?.status ?? "proposed";
  return {
    key: `inbox:${keyOf(r.run.id, r.index)}`, kind: "Recommendation", title: r.rec.action, icon: "inbox" as const,
    meta: <>{MARK[status].word}{r.rec.owner ? ` · ${r.rec.owner}` : ""}</>,
    tab: "overview" as const,
    tabs: {
      overview: <InspectorFacts rows={[
        { label: "Recommendation", value: r.rec.action },
        { label: "Expected impact", value: r.rec.impact || <span style={MUTED}>Not said by the analysis</span> },
        { label: "Owner", value: r.rec.owner || <span style={MUTED}>No owner named</span> },
        { label: "Due", value: r.rec.timeline ? timelineWords(r.rec.timeline) : <span style={MUTED}>No date set</span> },
        { label: "Status", value: <StatusMark status={status} /> },
      ]} />,
      provenance: <InspectorFacts rows={[
        { label: "Deep analysis", value: titleOf(r.run),
          note: onOpen ? <Button variant="outline" size="xs" onClick={() => onOpen(r.run.id)}>Open the analysis</Button> : undefined },
        { label: "Question", value: runDisplayTitle(r.run.question).title },
        { label: "Finished", value: dayWords(r.run.completed_at ?? r.run.started_at) },
        { label: "Place in its report", value: `recommendation ${r.index + 1}` },
        { label: "Analysis id", value: <span style={{ fontFamily: "var(--font-mono)" }}>{r.run.id}</span> },
      ]} />,
      activity: o ? <InspectorFacts rows={[
        { label: "Marked", value: `${MARK[o.status].word} · ${dayWords(o.updated_at || o.created_at)}` },
        ...(o.accepted_by ? [{ label: "Accepted by", value: o.accepted_by }] : []),
        ...(o.baseline_at ? [{ label: "Baseline", value: o.baseline_value != null
          ? `${o.metric_name ?? "metric"} ${o.baseline_value} (${o.baseline_window ?? ""})`
          : `not measured${o.review_note ? `: ${o.review_note}` : ""}` }] : []),
        ...(o.review_at ? [{ label: "Review", value: `${dayWords(o.review_at)}${o.review_question ? ` — ${o.review_question}` : ""}` }] : []),
        ...(o.reviewed_at ? [{ label: "Reviewed", value: `${dayWords(o.reviewed_at)}${o.review_value != null ? ` · read ${o.review_value}` : ""}` }] : []),
      ]} /> : <Empty>Nobody has decided on it yet.</Empty>,
      actions: <InspectorActions r={r} onOutcome={onOutcome} />,
    },
  };
}

/** The actions on a recommendation, in the inspector: Execute where it maps to a declared action, and Mark. */
function InspectorActions({ r, onOutcome }: { r: QueueRow; onOutcome: (o: RecOutcome) => void }) {
  const { mark, saving, error } = useMark(r.run.id, r.index, r.rec.action, onOutcome);
  const open = isOpen(r.outcome);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...ROW }}>
        <ExecuteButton invId={r.run.id} index={r.index} />
        {open
          ? <MarkMenu current={r.outcome?.status} saving={saving} onMark={s => void mark(s)} />
          : <span className="aug-fs-xs" style={MUTED}>{`Closed — ${MARK[r.outcome!.status].word}`}</span>}
      </div>
      {error && <div className="aug-fs-xs" role="alert" style={{ color: "var(--red4)" }}>{error}</div>}
    </div>
  );
}

/** A review that came due: the question it asks, answered on the row. */
function DueRow({ first, runId, index, rec, outcome, onOutcome }: {
  first: boolean; runId: string; index: number; rec: Rec; outcome: RecOutcome; onOutcome: (o: RecOutcome) => void;
}) {
  const { mark, saving, error } = useMark(runId, index, rec.action, onOutcome);
  return (
    <div data-testid="inbox-due" style={{ padding: "8px 0", ...(first ? {} : RULE) }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div className="aug-fs-chrome" style={{ ...ONE_LINE, color: "var(--t1)", fontWeight: 500 }} title={rec.action}>{rec.action}</div>
          <div className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={outcome.review_question}>
            {outcome.review_question}{outcome.review_asked_to ? ` · asked to ${outcome.review_asked_to}` : ""}
          </div>
        </div>
        <span style={{ display: "inline-flex", gap: 6 }}>
          <Button size="xs" variant="secondary" disabled={saving} onClick={() => void mark("verified")}>Verified</Button>
          <Button size="xs" variant="ghost" disabled={saving} onClick={() => void mark("rejected")}>Rejected</Button>
        </span>
      </div>
      {error && <div className="aug-fs-xs" role="alert" style={{ color: "var(--red4)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}
