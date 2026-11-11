"use client";

/**
 * The questions on a connection that reached none of its declared business terms — its rules and its processes'
 * stages — over `GET /framing/misses` (PENDING item 28). Near-matches stay unwired (ROADMAP §6 item 62): a question
 * worded otherwise than the business declared is framed only once a PERSON adds the words it used, and this is where
 * they do. Each row is a question, newest first: when, what was asked while the session log keeps it, and how often;
 * Add a synonym opens a form over the page that names the word and the declared term it means, saved through the key
 * door (`PUT /ontology/vocabulary/key`). A refusal is said in the form, never behind it.
 *
 * What the record does not keep is said: a run's question is read from the session log, which ages out, so the misses
 * whose words are gone are one line saying so — not a row each that reads as a question nobody asked. The door counts
 * every miss and lists the newest; the count and the listed number are both shown.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Card, Chip, Empty, MUTED, NUM, ROW, RULE } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Loading, ReadFailed } from "@/components/ui/states";
import {
  addSynonym, getDeclaredTerms, getFramingMisses,
  type DeclaredTerm, type DeclaredTermKind, type FramingMiss, type FramingMisses,
} from "@/lib/api";
import { countNoun, utcDayWords } from "@/lib/format";
import { withUniqueKeys } from "@/lib/listKeys";

/** One row: a question asked one or more times, or every miss whose words the session log no longer keeps. */
export interface MissRow {
  key: string;
  question: string | null;
  times: number;
  newest: string | null;
  oldest: string | null;
  scheduled: boolean;
  mightMean: string[];
}

const textKey = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

/** The door's misses as rows, newest first: the same words asked again are one row with how many times; every miss
 *  whose words are gone is one row, where its newest one stands. */
export function missRows(recent: FramingMiss[]): MissRow[] {
  const sorted = [...recent].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const byText = new Map<string, MissRow>();
  const rows: MissRow[] = [];
  let unkept: MissRow | null = null;
  for (const m of sorted) {
    const asked = (m.question ?? "").trim();
    if (!asked) {
      if (!unkept) {
        unkept = { key: "not-kept", question: null, times: 0, newest: m.at, oldest: m.at, scheduled: false, mightMean: [] };
        rows.push(unkept);
      }
      unkept.times += 1;
      unkept.oldest = m.at;
      continue;
    }
    const k = textKey(asked);
    const seen = byText.get(k);
    if (seen) {
      seen.times += 1;
      seen.oldest = m.at;
      seen.scheduled ||= m.scheduled;
      continue;
    }
    const row: MissRow = { key: `q:${k}`, question: asked, times: 1, newest: m.at, oldest: m.at, scheduled: m.scheduled,
      mightMean: (m.might_mean ?? []).map(c => c.label || c.name) };
    byText.set(k, row);
    rows.push(row);
  }
  return rows;
}

function whenWords(row: MissRow): string {
  if (row.question === null) {
    const newest = utcDayWords(row.newest);
    const oldest = utcDayWords(row.oldest);
    return `${countNoun(row.times, "question")} · ${oldest && oldest !== newest ? `${oldest} to ${newest}` : newest}`;
  }
  const at = utcDayWords(row.newest, true);
  return row.times === 1 ? `${at} · asked once` : `asked ${row.times} times · the last on ${at}`;
}

const missedWords = (n: number) => `${countNoun(n, "question")} missed`;

const GROUPS: { kind: DeclaredTermKind; label: string }[] = [
  { kind: "rule", label: "Business rules" },
  { kind: "stage", label: "Process stages" },
  { kind: "metric", label: "Metrics" },
  { kind: "entity", label: "Entities" },
];
const termValue = (t: DeclaredTerm) => `${t.kind}|${t.id}`;
/** Only a word for a rule or a stage frames a question; a metric's or an entity's helps an answer find what it names. */
const frames = (kind: DeclaredTermKind) => kind === "rule" || kind === "stage";

export function MissedQuestions({ connId }: { connId: string }) {
  const [read, setRead] = useState<FramingMisses | null>(null);
  const [readErr, setReadErr] = useState("");
  const [terms, setTerms] = useState<DeclaredTerm[] | null>(null);
  const [termsErr, setTermsErr] = useState("");
  // The row the form was last opened on stays while it closes; `n` gives each opening a fresh form.
  const [adding, setAdding] = useState<{ row: MissRow; n: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState("");

  const load = useCallback(() => {
    setReadErr("");
    getFramingMisses(connId).then(setRead).catch((e: unknown) => setReadErr(e instanceof Error ? e.message : String(e)));
  }, [connId]);
  const loadTerms = useCallback(() => {
    setTermsErr("");
    getDeclaredTerms(connId).then(setTerms).catch((e: unknown) => setTermsErr(e instanceof Error ? e.message : String(e)));
  }, [connId]);
  useEffect(() => { load(); loadTerms(); }, [load, loadTerms]);

  const rows = useMemo(() => missRows(read?.recent ?? []), [read]);
  const declaresNone = terms !== null && !terms.some(t => frames(t.kind));
  const listed = read?.recent.length ?? 0;
  const openOn = (row: MissRow) => {
    setAdded("");
    setAdding(a => ({ row, n: (a?.n ?? 0) + 1 }));
    setOpen(true);
  };

  return (
    <Card label="Questions that missed every declared term" testId="missed-questions"
      right={read && read.misses > 0 && (
        <span style={NUM}>{read.misses > listed ? `${missedWords(read.misses)} · the newest ${listed} listed` : missedWords(read.misses)}</span>
      )}>
      <p className="aug-fs-sm" style={{ ...MUTED, margin: "-2px 0 10px" }}>
        A question here was framed on none of this connection&apos;s rules or process stages. Add the words it used as a
        synonym, and the next question worded so is framed on the term they mean.
      </p>
      {added && <p className="aug-fs-sm" role="status" style={{ color: "var(--grn4)", margin: "0 0 8px" }}>{added}</p>}
      {readErr && <ReadFailed what="the missed questions" error={readErr} onRetry={load} />}
      {!read && !readErr && <Loading what="missed questions" />}
      {read && read.misses === 0 && (
        <Empty>
          No question missed every declared term
          {declaresNone ? " — this connection declares no business rule or process stage, so none is counted." : "."}
        </Empty>
      )}
      {rows.map((row, i) => (
        <div key={row.key} data-testid="missed-question"
          style={{ ...ROW, flexWrap: "nowrap", alignItems: "flex-start", gap: 12, padding: "8px 0", ...(i ? RULE : {}) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {row.question !== null ? (
              <div className="aug-fs-chrome" style={{ color: "var(--t1)", overflowWrap: "anywhere" }}>&ldquo;{row.question}&rdquo;</div>
            ) : (
              <div className="aug-fs-sm" style={{ color: "var(--t2)" }}>
                What was asked is no longer kept: the session log keeps a run&apos;s question for a while, and these
                runs have aged out of it.
              </div>
            )}
            <div className="aug-fs-xs" style={{ ...MUTED, ...NUM, marginTop: 2 }}>{whenWords(row)}</div>
          </div>
          {row.scheduled && (
            <Chip title="The ask of a scheduled run, with the context the schedule adds taken off">scheduled</Chip>
          )}
          {row.question !== null && (
            <Button size="xs" variant="outline" aria-haspopup="dialog" style={{ flexShrink: 0 }} onClick={() => openOn(row)}>
              Add a synonym
            </Button>
          )}
        </div>
      ))}
      <AddSynonym connId={connId} open={open} adding={adding} terms={terms} termsErr={termsErr} onRetryTerms={loadTerms}
        onClose={() => setOpen(false)}
        onAdded={(word, term) => {
          setOpen(false);
          setAdded(`“${word}” now means ${term.label}${frames(term.kind) ? ": the next question worded so is framed on it" : ""}.`);
        }} />
    </Card>
  );
}

function AddSynonym({ connId, open, adding, terms, termsErr, onRetryTerms, onClose, onAdded }: {
  connId: string;
  open: boolean;
  adding: { row: MissRow; n: number } | null;
  terms: DeclaredTerm[] | null;
  termsErr: string;
  onRetryTerms: () => void;
  onClose: () => void;
  onAdded: (word: string, term: DeclaredTerm) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog open={open && adding !== null} onOpenChange={o => { if (!o) onClose(); }} title="Add a synonym" width={560}
      testId="add-synonym" busy={busy}
      description={adding?.row.question ? <>For &ldquo;{adding.row.question}&rdquo;</> : undefined}>
      {adding && (
        <SynonymForm key={adding.n} connId={connId} row={adding.row} terms={terms} termsErr={termsErr}
          onRetryTerms={onRetryTerms} busy={busy} setBusy={setBusy} onCancel={onClose} onAdded={onAdded} />
      )}
    </FormDialog>
  );
}

function SynonymForm({ connId, row, terms, termsErr, onRetryTerms, busy, setBusy, onCancel, onAdded }: {
  connId: string;
  row: MissRow;
  terms: DeclaredTerm[] | null;
  termsErr: string;
  onRetryTerms: () => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onAdded: (word: string, term: DeclaredTerm) => void;
}) {
  const [word, setWord] = useState("");
  const [choice, setChoice] = useState("");
  const [problem, setProblem] = useState("");

  const offered = terms ?? [];
  // The select shows its first option while nothing is chosen; the form saves what it shows.
  const chosen = offered.find(t => termValue(t) === choice) ?? offered[0] ?? null;

  const save = async () => {
    const said = word.trim();
    if (!chosen || !said) return;
    setBusy(true);
    setProblem("");
    try {
      await addSynonym(connId, { synonym: said, kind: chosen.kind, subject: chosen.id });
      onAdded(said, chosen);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="aug-fs-xs" style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--t2)" }}>
        The word or phrase people use
        <Input value={word} onChange={e => setWord(e.target.value)} placeholder="finished purchases" aria-label="Word or phrase" />
      </label>
      {termsErr ? (
        <ReadFailed what="the terms this connection declares" error={termsErr} onRetry={onRetryTerms} />
      ) : terms === null ? (
        <Loading what="declared terms" />
      ) : offered.length === 0 ? (
        <p className="aug-fs-sm" style={{ ...MUTED, margin: 0 }}>
          This connection declares nothing a word can name yet — no rule, process stage, metric or entity.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="aug-fs-xs" style={{ color: "var(--t2)" }}>The declared term it means</span>
          <SelectField value={chosen ? termValue(chosen) : ""} onChange={e => setChoice(e.target.value)}
            aria-label="The declared term it means">
            {withUniqueKeys(GROUPS.filter(g => offered.some(t => t.kind === g.kind)), g => g.kind).map(([key, g]) => (
              <optgroup key={key} label={g.label}>
                {offered.filter(t => t.kind === g.kind).map(t => <option key={termValue(t)} value={termValue(t)}>{t.label}</option>)}
              </optgroup>
            ))}
          </SelectField>
          {chosen && !frames(chosen.kind) && (
            <span className="aug-fs-xs" style={MUTED}>
              A word for {chosen.kind === "metric" ? "a metric" : "an entity"} helps an answer find what it names; only a
              rule or a process stage frames the question, so one worded so is still counted here.
            </span>
          )}
        </div>
      )}
      {row.mightMean.length > 0 && (
        <span className="aug-fs-xs" style={MUTED}>
          The near-match finder would offer {row.mightMean.join(", ")}. It frames nothing by itself; the choice is yours.
        </span>
      )}
      {problem && <p className="aug-fs-sm" role="alert" style={{ color: "var(--red4)", margin: 0 }}>{problem}</p>}
      <div style={ROW}>
        <Button size="sm" onClick={() => void save()} disabled={busy || !word.trim() || !chosen}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
