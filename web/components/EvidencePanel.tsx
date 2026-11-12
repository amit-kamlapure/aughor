"use client";

/**
 * Evidence — the claim ledger, laid out to CLARITY (`pramanyx-v2/CLARITY.md`) and, since 2026-11-10, to the Evidence →
 * Action study's register and inspector: one line of what it holds, the claims no one has reviewed under "Needs you",
 * then the claims as a register (Claim · Review · Mentions · Reads · Recorded) under the deep analysis that made them,
 * with search, the review filter and Copy/CSV in the toolbar row. A chosen claim opens in the inspector — the claim said
 * as the run's narrative, its marks and the review buttons (Overview), its whole query with Open in SQL Editor
 * (Definition), where it came from (Provenance). Outside the app's shell it is read beside the list, as it was.
 *
 * Drawn only from what the ledger records (pramanyx/evidence). What it does not carry is left out, not invented: guard
 * results and a verdict per claim, refused claims (the ledger keeps what a run asserted, never what it refused), a
 * receipt id, run time and bytes read, and "used in" or an outcome (`downstream_recommendations` and `outcome_status`
 * have no writer). `data_freshness` is the run's completion time, so a claim reads "recorded", never "data as of";
 * `metric_used` is a keyword guess, so it reads "mentions".
 *
 * Confidence is COUNTED or absent (the 2027 study, phase 1): a row written since carries null and reads "not counted".
 * The 0.8 / 0.5 that older rows carry were set by whether a step called itself significant, and say so on hover.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { CARD, Chip, Dot, Empty, Label, MUTED, NUM, NeedsRow, NeedsYou, ONE_LINE, Page, ROW, RULE }
  from "@/components/clarity/kit";
import { TableActions } from "@/components/TableActions";
import { Button } from "@/components/ui/button";
import { ChromeActions, ChromeFacts, ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import { InspectorFacts, useInspector } from "@/components/shell/Inspector";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Loading, ReadFailed } from "@/components/ui/states";
import {
  getInvestigationsList as listRuns, getRecentEvidenceClaims, submitClaimFeedback, type EvidenceClaim,
} from "@/lib/api";
import { countNoun, formatCount, formatTimestamp, relTime } from "@/lib/format";
import { dayWords } from "@/lib/home";
import { keyToWords } from "@/lib/names";
import { useOpenInQuery } from "@/lib/openInQuery";
import { runDisplayTitle } from "@/lib/runTitle";

type Feedback = "validated" | "disputed" | "needs_context";
type Filter = "all" | "unreviewed" | Feedback;

/** A review's word, its button, and the hue of its mark: checked green, adverse red, waiting on context amber. */
const FEEDBACK: Record<Feedback, { word: string; door: string; hue: "green" | "red" | "amber" }> = {
  validated:     { word: "validated",     door: "Validated",     hue: "green" },
  disputed:      { word: "disputed",      door: "Disputed",      hue: "red" },
  needs_context: { word: "needs context", door: "Needs context", hue: "amber" },
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",           label: "all" },
  { id: "unreviewed",    label: "unreviewed" },
  { id: "validated",     label: "validated" },
  { id: "disputed",      label: "disputed" },
  { id: "needs_context", label: "needs context" },
];

/** How many recent claims the layer reads. */
export const LIMIT = 80;

const matches = (c: EvidenceClaim, f: Filter) =>
  f === "all" || (f === "unreviewed" ? !c.owner_feedback : c.owner_feedback === f);

/** A claim as the ledger writes it — "Headline: what was measured…" — split into the line a row shows and the rest. */
export function splitClaim(text: string): { head: string; rest: string } {
  const t = (text || "").trim();
  const colon = t.indexOf(": ");
  if (colon > 0 && colon <= 140) return { head: t.slice(0, colon), rest: t.slice(colon + 2).trim() };
  const stop = t.search(/[.!?]\s+\S/);
  if (stop > 0 && stop <= 160) return { head: t.slice(0, stop + 1), rest: t.slice(stop + 1).trim() };
  return { head: t, rest: "" };
}

/** "2d ago"; nothing when the time cannot be read. */
const ago = (iso: string) => { const t = relTime(iso); return t === "—" ? "" : `${t} ago`; };

/** A run's name: its question as a person asked it (a scheduled run's grounding stripped), cut to its first sentence. */
interface RunName { title: string; full: string; scheduled: boolean }

function runName(question: string): RunName {
  const { title, scheduled } = runDisplayTitle(question);
  const cut = title.search(/[?!.]\s+\S/);
  return { title: cut > 0 ? title.slice(0, cut + 1) : title, full: title, scheduled };
}

/** The run a claim came from — the wire spells it as the deep analysis's frozen name. */
const runOf = (c: EvidenceClaim) => c.investigation_id;

/** The claims of one run, in the order the ledger gave them. */
interface Group { run: string; at: string; claims: EvidenceClaim[] }

function groupByRun(claims: readonly EvidenceClaim[]): Group[] {
  const out = new Map<string, Group>();
  for (const c of claims) {
    const run = runOf(c);
    const g = out.get(run);
    if (g) g.claims.push(c);
    else out.set(run, { run, at: c.created_at, claims: [c] });
  }
  return [...out.values()];
}

export function EvidencePanel({ connectionId, canvasId, onInvestigate: reexamine }: {
  connectionId:  string;
  canvasId?:     string;
  onInvestigate?: (q: string) => void;
}) {
  const [claims, setClaims]         = useState<EvidenceClaim[] | null>(null);
  const [failed, setFailed]         = useState("");
  const [filter, setFilter]         = useState<Filter>("all");
  const [query, setQuery]           = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [notSaved, setNotSaved]     = useState("");
  // The runs' questions, so a group is headed by what was asked — never by the run's id. A failed read leaves each
  // group headed "deep analysis <id>", which says what it is without a name.
  const [names, setNames] = useState<Map<string, RunName>>(new Map());

  const load = useCallback(() => {
    setFailed("");
    setClaims(null);
    getRecentEvidenceClaims(connectionId, canvasId, LIMIT)
      .then(setClaims)
      .catch(e => setFailed(e instanceof Error ? e.message : String(e)));
    listRuns(200)
      .then(rows => setNames(new Map(rows.map(r => [r.id, runName(r.question)]))))
      .catch(() => undefined);
  }, [connectionId, canvasId]);

  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => claims ?? [], [claims]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(f => [f.id, all.filter(c => matches(c, f.id)).length])) as
    Record<Filter, number>, [all]);
  const nameOf = useCallback((run: string): RunName => names.get(run)
    ?? { title: `deep analysis ${run.slice(0, 8)}`, full: "", scheduled: false }, [names]);
  const ofReview = useMemo(() => all.filter(c => matches(c, filter)), [all, filter]);
  const shown = useMemo(() => ofReview.filter(c => searched(c, query, nameOf(runOf(c)))), [ofReview, query, nameOf]);
  const groups = useMemo(() => groupByRun(shown), [shown]);

  const handleFeedback = useCallback(async (claim: EvidenceClaim, fb: Feedback) => {
    setSaving(true);
    setNotSaved("");
    // Optimistic; clicking the active one is still a set — the server is the source of truth.
    setClaims(cs => (cs ?? []).map(c => (c.id === claim.id ? { ...c, owner_feedback: fb } : c)));
    try {
      await submitClaimFeedback(runOf(claim), claim.id, fb);
    } catch (e) {
      setNotSaved(e instanceof Error ? e.message : String(e));
      setClaims(cs => (cs ?? []).map(c => (c.id === claim.id ? { ...c, owner_feedback: claim.owner_feedback } : c)));
    } finally {
      setSaving(false);
    }
  }, []);

  // Inside the app a chosen claim opens in the shell's inspector (the study's register and inspector); on its own (no
  // shell) it is read beside the list, as it was.
  const inShell = useInShell();
  const inspector = useInspector();
  const held = inspector.subject?.key;
  const subjectOf = useCallback((c: EvidenceClaim) => claimSubject({
    claim: c, run: nameOf(runOf(c)), saving, notSaved, connectionId,
    onFeedback: fb => void handleFeedback(c, fb),
    onReexamine: reexamine ? () => reexamine(`Re-examine this claim: ${c.claim_text}`) : undefined,
  }), [nameOf, saving, notSaved, connectionId, handleFeedback, reexamine]);
  const pick = (c: EvidenceClaim) => {
    setSelectedId(c.id);
    setNotSaved("");
    if (inShell) inspector.inspect(subjectOf(c));
  };
  // The inspected claim is drawn again when its review, its saving or the run names change, so it never says a state
  // the row has left.
  useEffect(() => {
    if (!inShell || !held?.startsWith("claim:") || claims === null) return;
    const c = all.find(x => `claim:${x.id}` === held);
    if (!c) { inspector.close(); return; }
    inspector.inspect(subjectOf(c));
  }, [all, saving, notSaved, names]);   // eslint-disable-line react-hooks/exhaustive-deps

  const scope = canvasId ? "this canvas" : "this connection";
  const capped = all.length >= LIMIT;

  // Inside the app the count sits beside the title and Refresh with the page's actions (2026-11-10, ROADMAP §6 item 64);
  // the lead sentence stays the page's first line. Outside it (a Data Canvas) the three share one row, as they did.
  const count = claims && claims.length > 0 && (
    <span className="aug-fs-sm" style={{ ...MUTED, ...NUM }}
      title={capped ? `Only the latest ${LIMIT} claims are read; older ones are not shown.` : undefined}>
      {capped ? `the latest ${LIMIT} claims` : countNoun(all.length, "claim")} · {countNoun(groupByRun(all).length, "deep analysis", "deep analyses")}
    </span>
  );
  const refresh = <Button variant="ghost" size="xs" onClick={load}>Refresh</Button>;
  const lead = (
    <div style={{ ...ROW, gap: 10 }}>
      <p className="aug-fs-ui" style={{ margin: 0, color: "var(--t2)", flex: "1 1 360px", minWidth: 0 }}>
        What the deep analyses on {scope} claimed, and the query behind each — newest first.
      </p>
      {inShell ? <><ChromeFacts>{count}</ChromeFacts><ChromeActions>{refresh}</ChromeActions></> : <>{count}{refresh}</>}
    </div>
  );

  if (failed) {
    return <Page testId="evidence-page">{lead}<ReadFailed what="the claim ledger" error={failed} onRetry={load} /></Page>;
  }
  if (!claims) {
    return <Page testId="evidence-page">{lead}<Loading what="the claim ledger" /></Page>;
  }
  if (claims.length === 0) {
    return (
      <Page testId="evidence-page">
        {lead}
        <Empty>No claims yet — each deep analysis on {scope} records the claims it made and the query behind each.</Empty>
      </Page>
    );
  }

  const unreviewed = all.filter(c => !c.owner_feedback);
  const review = () => {
    setFilter("unreviewed");
    setQuery("");
    if (unreviewed[0]) pick(unreviewed[0]); else setSelectedId(null);
  };
  // On its own the reader shows the chosen claim, or the first one listed; in the app nothing opens until one is chosen.
  const reading = inShell ? null : shown.find(c => c.id === selectedId) ?? shown[0] ?? null;
  const tools = (
    <>
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search claims, questions, queries…"
        aria-label="Search claims" leading={<Icon name="search" size={11} />} style={{ width: 240 }} />
      <Segmented label="Filter claims by review" value={filter}
        onChange={f => { setFilter(f); setSelectedId(null); }}
        options={FILTERS.map(f => ({ value: f.id, label: <>{f.label} <span style={NUM}>{formatCount(counts[f.id])}</span></> }))} />
      <TableActions name="claims" read={() => ({
        columns: ["claim", "deep analysis", "review", "confidence", "mentions", "query", "recorded"],
        rows: shown.map(c => [c.claim_text, nameOf(runOf(c)).full || nameOf(runOf(c)).title,
          c.owner_feedback ? FEEDBACK[c.owner_feedback].word : "not reviewed", c.confidence ?? "not counted",
          c.metric_used ?? "", c.sql_source ?? "", c.created_at]),
      })} />
    </>
  );

  const register = (
    <section aria-label="Claims" data-testid="evidence-list" style={CARD}>
      <Label right={<>
        {shown.length < all.length && <span style={NUM}>{formatCount(shown.length)} of {formatCount(all.length)} shown</span>}
        {!inShell && tools}
      </>}>Claims</Label>

      {groups.length === 0 ? (
        <Empty>{query.trim() ? "No claim matches." : `No claim here is ${FILTERS.find(f => f.id === filter)?.label}.`}</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <div role="table" aria-label="Claims" style={{ minWidth: 660 }}>
            <div role="row" className="aug-fs-xs" style={{ ...CLAIM_GRID, ...MUTED, textTransform: "uppercase", letterSpacing: ".06em", padding: "0 0 6px 8px" }}>
              <span role="columnheader">Claim</span><span role="columnheader">Review</span>
              <span role="columnheader">Mentions</span><span role="columnheader">Reads</span>
              <span role="columnheader" style={{ textAlign: "right" }}>Recorded</span>
            </div>
            {groups.map(g => {
              const name = nameOf(g.run);
              return (
                <div key={g.run} role="rowgroup" data-testid="evidence-run">
                  <div role="row" className="aug-fs-xs" style={{ display: "flex", alignItems: "baseline", gap: 8,
                    padding: "10px 0 4px 8px", borderTop: "1px solid var(--b1)" }}>
                    <span role="cell" title={name.full || undefined} style={{ ...ONE_LINE, color: "var(--t2)", fontWeight: 600 }}>{name.title}</span>
                    {name.scheduled && <Chip>scheduled</Chip>}
                    <span title={formatTimestamp(g.at)} style={{ ...MUTED, ...NUM, marginLeft: "auto", whiteSpace: "nowrap" }}>
                      {dayWords(g.at)} · {countNoun(g.claims.length, "claim")}
                    </span>
                  </div>
                  {g.claims.map(c => (
                    <ClaimRow key={c.id} claim={c} picked={inShell ? held === `claim:${c.id}` : reading?.id === c.id}
                      onPick={() => pick(c)} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="aug-fs-xs" style={{ ...MUTED, ...RULE, marginTop: 10, paddingTop: 8 }}>
        Guard results and refusals are not recorded with a claim.
      </div>
    </section>
  );

  return (
    <Page testId="evidence-page">
      {lead}

      <NeedsYou testId="evidence-needs" empty="Every claim here has been reviewed.">
        {unreviewed.length > 0 && (
          <NeedsRow key="unreviewed" testId="evidence-needs-unreviewed"
            title={`${countNoun(unreviewed.length, "claim")} no one has reviewed`}
            detail="The alerts count them until each is marked validated, disputed or needs context."
            actions={<Button size="xs" variant="secondary" onClick={review}>Review</Button>} />
        )}
        {counts.disputed > 0 && (
          <NeedsRow key="disputed" title={`${countNoun(counts.disputed, "claim")} disputed`}
            detail="Open one and Re-examine sends it to a deep analysis."
            actions={<Button size="xs" variant="ghost" onClick={() => { setFilter("disputed"); setSelectedId(null); }}>Show</Button>} />
        )}
      </NeedsYou>

      {/* the register's search, review filter and copy: inside the app, the page's toolbar row; on its own, the card's head */}
      {inShell && <ChromeToolbar>{tools}</ChromeToolbar>}
      {inShell ? register : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 36%)", gap: 14, alignItems: "start" }}>
          {register}
          {reading && (
            <section aria-label="The chosen claim" style={{ ...CARD, position: "sticky", top: 0 }}>
              <ClaimReader claim={reading} run={nameOf(runOf(reading))} saving={saving} notSaved={notSaved}
                onFeedback={fb => void handleFeedback(reading, fb)}
                onReexamine={reexamine ? () => reexamine(`Re-examine this claim: ${reading.claim_text}`) : undefined} />
              <QueryBehind claim={reading} connectionId={connectionId} />
            </section>
          )}
        </div>
      )}
    </Page>
  );
}

/** A claim matches a search by its words, the question of the run that made it, its keyword or its query. */
function searched(c: EvidenceClaim, q: string, run: RunName): boolean {
  const needle = q.trim().toLowerCase();
  return !needle || [c.claim_text, run.full || run.title, c.metric_used ?? "", c.sql_source ?? ""]
    .some(t => t.toLowerCase().includes(needle));
}

/** The tables a claim's query reads, in the order it names them: FROM and JOIN targets with their quotes taken off, the
 *  query's own WITH names left out (they are steps of the query, not tables). A scan, not a parser — enough to say
 *  "order_items" in a column. */
export function tablesRead(sql: string | null | undefined): string[] {
  if (!sql) return [];
  const steps = new Set([...sql.matchAll(/(?:\bwith|,)\s*([A-Za-z_][\w$]*)\s+as\s*\(/gi)].map(m => m[1].toLowerCase()));
  const out: string[] = [];
  for (const m of sql.matchAll(/\b(?:from|join)\s+([`"[]?[A-Za-z_][\w$.`"\]-]*)/gi)) {
    const at = m.index ?? 0;
    // a function's FROM (EXTRACT(YEAR FROM d)) or a call (FROM UNNEST(…)) names no table
    if (/extract\s*\(\s*\w+\s*$/i.test(sql.slice(Math.max(0, at - 40), at))) continue;
    if (/^\s*\(/.test(sql.slice(at + m[0].length))) continue;
    const name = m[1].replace(/[`"[\]]/g, "");
    const bare = name.split(".").pop() ?? name;
    if (!bare || steps.has(name.toLowerCase()) || out.includes(bare)) continue;
    out.push(bare);
  }
  return out;
}

/** Claim · Review · Mentions · Reads · Recorded — every column a fixed or fractional width, so the header holds its line;
 *  narrow enough to sit beside the inspector without a scroll. */
const CLAIM_GRID: React.CSSProperties = {
  display: "grid", alignItems: "center", columnGap: 14,
  gridTemplateColumns: "minmax(260px, 3fr) minmax(108px, 1fr) minmax(76px, .8fr) minmax(96px, 1fr) 60px",
};

/** One claim: its headline and the rest of its sentence, its review, the metric it mentions, whether a query was
 *  recorded, and when. A click (or Enter) chooses it. */
function ClaimRow({ claim: c, picked, onPick }: { claim: EvidenceClaim; picked: boolean; onPick: () => void }) {
  const { head, rest } = splitClaim(c.claim_text);
  const fb = c.owner_feedback ? FEEDBACK[c.owner_feedback] : null;
  const reads = tablesRead(c.sql_source);
  return (
    <div role="row" data-testid="evidence-claim" tabIndex={0} aria-selected={picked} onClick={onPick}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(); } }}
      style={{ ...CLAIM_GRID, padding: "6px 0 6px 8px", borderTop: "1px solid var(--b0)", cursor: "pointer",
        background: picked ? "var(--bg-hover)" : undefined, boxShadow: picked ? "inset 2px 0 0 var(--blue3)" : undefined }}>
      <span role="cell" style={{ minWidth: 0 }} title={c.claim_text}>
        <span className="aug-fs-chrome" style={{ ...ONE_LINE, display: "block", color: "var(--t1)" }}>{head}</span>
        {rest && <span className="aug-fs-xs" style={{ ...MUTED, ...ONE_LINE, display: "block" }}>{rest}</span>}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ROW, gap: 6, flexWrap: "nowrap", color: fb ? "var(--t1)" : "var(--t3)" }}>
        <Dot hue={fb?.hue ?? "grey"} />{fb?.word ?? "not reviewed"}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: c.metric_used ? "var(--t2)" : "var(--t3)" }}
        title={c.metric_used ? "A keyword found in the claim, not a link to the metric." : undefined}>
        {c.metric_used ?? "none"}
      </span>
      <span role="cell" className="aug-fs-xs" style={{ ...ONE_LINE, color: "var(--t2)" }} title={reads.join(", ") || undefined}>
        {c.sql_source ? (reads.length ? reads.join(", ") : "its query") : <Chip title="No query was recorded for this claim.">no query</Chip>}
      </span>
      <span role="cell" className="aug-fs-xs" title={formatTimestamp(c.created_at)} style={{ ...MUTED, ...NUM, textAlign: "right", whiteSpace: "nowrap" }}>
        {ago(c.created_at)}
      </span>
    </div>
  );
}

/** A claim in the inspector: the claim, its marks and its review (Overview); the query behind it (Definition); where it
 *  came from (Provenance). */
function claimSubject({ claim: c, run, saving, notSaved, connectionId, onFeedback, onReexamine }: {
  claim: EvidenceClaim; run: RunName; saving: boolean; notSaved: string; connectionId: string;
  onFeedback: (fb: Feedback) => void; onReexamine?: () => void;
}) {
  const { head } = splitClaim(c.claim_text);
  const fb = c.owner_feedback ? FEEDBACK[c.owner_feedback] : null;
  return {
    key: `claim:${c.id}`, kind: "Claim", title: head, icon: "check" as const,
    meta: <>{fb?.word ?? "not reviewed"} · recorded {ago(c.created_at)}</>,
    tab: "overview" as const,
    tabs: {
      overview: <ClaimReader claim={c} run={run} saving={saving} notSaved={notSaved} onFeedback={onFeedback} onReexamine={onReexamine} />,
      definition: <QueryBehind claim={c} connectionId={connectionId} />,
      provenance: (
        <InspectorFacts rows={[
          { label: "From", value: run.full || run.title, note: run.scheduled ? "asked by a schedule" : undefined },
          ...(c.hypothesis_id ? [{ label: "Stage", value: keyToWords(c.hypothesis_id) }] : []),
          { label: "Recorded", value: formatTimestamp(c.created_at),
            note: c.data_freshness ? "when its run finished — the ledger keeps no data-as-of time" : undefined },
          { label: "Query", value: c.sql_source ? "recorded with the claim" : "none recorded",
            note: tablesRead(c.sql_source).length ? `reads ${tablesRead(c.sql_source).join(", ")}` : undefined },
          { label: "Claim", value: <span style={NUM}>{c.id}</span> },
          { label: "Deep analysis", value: <span style={NUM}>{runOf(c)}</span> },
        ]} />
      ),
    },
  };
}

/** The chosen claim: the whole sentence (the run's own reading of its query's result), its marks, and the review. */
function ClaimReader({ claim, run, saving, notSaved, onFeedback, onReexamine }: {
  claim: EvidenceClaim; run: RunName; saving: boolean; notSaved: string;
  onFeedback: (fb: Feedback) => void; onReexamine?: () => void;
}) {
  const { head, rest } = splitClaim(claim.claim_text);
  return (
    <div data-testid="evidence-reader" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <Label right={<span title={formatTimestamp(claim.created_at)} style={NUM}>recorded {ago(claim.created_at)}</span>}>Claim</Label>
      <div>
        <div className="aug-fs-xs" style={{ ...ROW, gap: 6, color: "var(--t3)", marginBottom: 4 }}>
          <span style={{ border: "1px solid var(--b2)", borderRadius: "var(--r-chip)", padding: "0 6px", color: "var(--t2)", lineHeight: "16px" }}>
            Narrative
          </span>
          the deep analysis’s reading of its query’s result
        </div>
        <p className="aug-fs-ui" style={{ margin: 0, color: "var(--t1)", fontWeight: 500 }}>{head}</p>
        {rest && <p className="aug-fs-chrome" style={{ margin: "4px 0 0", color: "var(--t2)", lineHeight: 1.55 }}>{rest}</p>}
      </div>
      <div style={{ ...ROW, gap: 6 }}>
        {claim.confidence == null
          ? <Chip title="No counted confidence for this claim yet.">confidence not counted</Chip>
          : <Chip title="Written by an older version from whether the step called itself significant — not counted.">
              confidence {claim.confidence.toFixed(2)}
            </Chip>}
        {claim.metric_used && <Chip title="A keyword found in the claim, not a link to the metric.">mentions {claim.metric_used}</Chip>}
        <span className="aug-fs-xs" title={run.full || undefined} style={{ ...MUTED, ...ONE_LINE }}>from {run.title}</span>
      </div>

      <div>
        <Label>Review</Label>
        <div style={ROW}>
          {(Object.keys(FEEDBACK) as Feedback[]).map(k => (
            <Button key={k} variant="outline" size="xs" disabled={saving} aria-pressed={claim.owner_feedback === k}
              className={`aug-fb-door aug-fb-door-${k}`} onClick={() => onFeedback(k)}>
              {FEEDBACK[k].door}
            </Button>
          ))}
          {onReexamine && (
            <Button variant="secondary" size="xs" style={{ marginLeft: "auto" }} onClick={onReexamine}
              title="Ask a deep analysis to check this claim again">Re-examine</Button>
          )}
        </div>
        <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 6 }}
          title="Recorded on this claim. The alert summary counts the claims no one has reviewed; nothing else reads a review yet, so it does not change future claims.">
          Counted by the alerts until marked; it does not change future claims.
        </div>
        {claim.feedback_note && <div className="aug-fs-xs" style={{ color: "var(--t2)", marginTop: 4 }}>{claim.feedback_note}</div>}
        {notSaved && (
          <div role="alert" className="aug-fs-xs" style={{ color: "var(--red4)", marginTop: 4 }}>Not saved — {notSaved}</div>
        )}
      </div>
    </div>
  );
}

/** The query behind a claim, as it was recorded, with Open in SQL Editor where the app provides one. */
function QueryBehind({ claim, connectionId }: { claim: EvidenceClaim; connectionId: string }) {
  const openInQuery = useOpenInQuery();
  return (
    <div data-testid="evidence-query" style={{ minWidth: 0, marginTop: 10 }}>
      <Label right={openInQuery && claim.sql_source ? (
        <Button size="xs" variant="ghost" title="Opens the query, as it was recorded, in a new SQL Editor tab — it is not run"
          onClick={() => openInQuery({ sql: claim.sql_source!, connId: connectionId, mode: "sql" })}>Open in SQL Editor</Button>
      ) : undefined}>The query behind it</Label>
      {claim.sql_source
        ? <pre className="aug-fs-xs" style={{ margin: 0, padding: "8px 10px", background: "var(--bg-1)", borderRadius: "var(--r2)",
            color: "var(--t2)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            maxHeight: 420, overflowY: "auto" }}>{claim.sql_source}</pre>
        : <Empty>No query was recorded for this claim.</Empty>}
    </div>
  );
}
