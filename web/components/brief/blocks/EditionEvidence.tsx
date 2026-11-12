"use client";

/**
 * Arc BC (ROADMAP §3.67) — where an edition's numbers come from, and the question box under it.
 *
 * Every cited number and every block's "source" opens its source here, in a panel beside the page — never a pop-up:
 * what it is, how it was measured, its status, what the guards said, the SQL, and every row (Copy and CSV). The
 * question box asks the Briefing's quick answer about what is on screen — the whole edition, or the one part "Ask about
 * this" pointed it at — and writes the answer under the page.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { BRIEFING_SURFACE } from "@/components/brief/BriefAskPanel";
import { PartsMessage } from "@/components/chat/PartsMessage";
import { TableActions, rawCells } from "@/components/TableActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EditionSource } from "@/lib/api";
import { projectThread, newSessionId } from "@/lib/chatTurn";
import { fmtValue, partFocus, type AskedPart } from "@/lib/briefingEdition";
import { usePramanyxChat } from "@/lib/usePramanyxChat";

const KIND: Record<string, string> = {
  check: "a check the guide keeps, measured for the range and the ranges before",
  breakdown: "a breakdown the model asked for, each segment against its own usual",
  drill: "a drill a reader asked for, each segment against its own usual",
  query: "a query the model wrote, run through the guarded door",
  answer: "an answer to a question asked on this page",
  analysis: "a deep analysis the platform ran: its verdict, confidence and what it can and cannot say",
  finding: "a finding the explorer kept, with the query it rests on",
  decision: "a decision in the record: what was chosen, when it is reviewed, what the review found",
  discussion: "words a person said outside Pramanyx — in Slack, by email, in a document's comments — with who, where and when",
};
const RULE = "1px solid var(--b1)";

export function EditionEvidence({ source, used, onPick, onClose }: {
  source: EditionSource | null;
  /** Every source the page reads — listed when none is picked. */
  used: EditionSource[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  if (!source) {
    return (
      <div data-testid="edition-evidence">
        <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: "0 0 8px" }}>
          Click a cited number, or a block&apos;s “source”, to see its query here. Nothing on this page was written without one.
        </p>
        {used.map((s, i) => (
          <div key={s.id} style={{ padding: "8px 0", borderTop: RULE }}>
            <span role="button" tabIndex={0} className="aug-fs-sm" style={{ color: "var(--t1)", cursor: "pointer" }}
              onClick={() => onPick(s.id)} onKeyDown={e => { if (e.key === "Enter") onPick(s.id); }}>{i + 1}. {s.label}</span>
            <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>{KIND[s.kind] ?? s.kind} · {s.rows.length} rows</div>
          </div>
        ))}
      </div>
    );
  }
  const rows = source.rows.slice(0, 50);
  return (
    <div data-testid="edition-evidence">
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 className="aug-fs-ui" style={{ color: "var(--t1)", margin: 0, fontWeight: 600 }}>{source.label}</h3>
        <Button size="xs" variant="ghost" style={{ marginLeft: "auto" }} onClick={onClose}>All sources</Button>
      </div>
      <div className="aug-fs-xs" style={{ color: "var(--t3)", margin: "4px 0 8px" }}>
        {KIND[source.kind] ?? source.kind} · {source.status}{source.note ? ` · ${source.note}` : ""}
      </div>
      {source.caveats.length > 0 && (
        <div className="aug-fs-xs" style={{ color: "var(--amb4)", marginBottom: 6 }}>{source.caveats.join(" · ")}</div>
      )}
      {source.receipts.length > 0 && (
        <div className="aug-fs-xs" style={{ color: "var(--t3)", marginBottom: 6 }}>
          {source.receipts.length} guard{source.receipts.length === 1 ? "" : "s"} checked this query
        </div>
      )}
      {source.sql && <pre className="aug-fs-xs" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", margin: "6px 0",
                                                         padding: 8, border: RULE, borderRadius: "var(--r2)", color: "var(--t2)" }}>{source.sql}</pre>}
      {source.columns.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <TableActions name={source.label} read={() => ({ columns: source.columns, rows: rawCells(source.rows) })} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="aug-fs-xs" style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{source.columns.map(c => <th key={c} style={{ textAlign: "left", color: "var(--t3)", fontWeight: 500, padding: "4px 6px", borderBottom: RULE }}>{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, ri) => (
                <tr key={`${ri}-${String(r[0])}`}>{r.map((v, j) => (
                  <td key={source.columns[j] ?? j} style={{ padding: "4px 6px", borderBottom: RULE, textAlign: typeof v === "number" ? "right" : "left" }}>
                    {typeof v === "number" ? fmtValue(v, source.unit) : v === null ? "—" : String(v)}</td>))}</tr>))}</tbody>
            </table>
          </div>
          {source.rows.length > rows.length && <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>
            {source.rows.length - rows.length} more rows — Copy or CSV takes them all</div>}
        </>
      )}
    </div>
  );
}

/** A question about the edition on screen, answered under the page by the Briefing's quick answer — about the whole
 *  edition, or about the one part a reader pointed it at with "Ask about this" (ROADMAP §6 item 46). */
export function EditionAsk({ connectionId, schema, canvasId, periodKey, reader, seed, onDeeper, about, onClearAbout }: {
  connectionId: string;
  schema?: string;
  /** A Data Canvas's edition: the answer reads the canvas's tables and its edition. */
  canvasId?: string;
  /** `range:<preset>:<start>..<last day>` — with the reader it names the edition the answer reads. */
  periodKey: string;
  reader: string;
  /** A question to ask at once (a decision's Deep analysis, with no deep analysis to hand it to). */
  seed?: string;
  onDeeper?: (q: string) => void;
  /** The part the next question is about, and ``n``, the clicks that pointed it here: each brings the box into view. */
  about?: (AskedPart & { n: number }) | null;
  /** Point the ask back at the whole edition. */
  onClearAbout?: () => void;
}) {
  const [sessionId] = useState(() => newSessionId());
  const edition = `${periodKey}@${reader || "_organisation"}`;
  const { messages, sendMessage, status, error } = usePramanyxChat({
    connectionId, sessionId,
    body: { depth: "quick", schema: schema ?? null, canvas_id: canvasId ?? null, surface: BRIEFING_SURFACE,
            brief_period: edition },
  });
  const streaming = status === "submitted" || status === "streaming";
  const [draft, setDraft] = useState(seed ?? "");
  const turns = useMemo(() => projectThread(messages, {
    streaming, transportError: status === "error" ? (error?.message ?? "The answer failed.") : null,
  }), [messages, streaming, status, error]);
  // A part was pointed at, from wherever it is on the page: the box comes into view, ready to type in.
  const box = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const summoned = about?.n ?? 0;
  useEffect(() => {
    if (!summoned) return;
    box.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    field.current?.focus({ preventScroll: true });
  }, [summoned]);
  const send = (q: string) => {
    if (!q.trim() || streaming) return;
    setDraft("");
    // the part rides THIS turn's body as its focus; the server reads what it grounds on from the edition it kept
    void sendMessage({ text: q.trim(), metadata: { mode: "ask" } },
      about ? { body: { focus: partFocus(about, edition) } } : undefined);
  };
  return (
    <section ref={box} data-testid="edition-ask" style={{ marginTop: 22 }}>
      {turns.map(({ turn, assistantMsg }) => (
        <div key={turn.id} style={{ margin: "14px 0", padding: "14px 16px", border: "1px dashed var(--blue4)", borderRadius: "var(--r3)" }}>
          {/* what the turn was about, as the server read it — and said when the body answering did not read it */}
          {turn.route?.subject && (
            <p data-testid="edition-ask-answered-about" className="aug-fs-xs" style={{ color: "var(--t3)", margin: "0 0 8px" }}>
              {turn.route.subject.said}{turn.route.subject.carried ? "" : " · this answer did not read it"}
            </p>
          )}
          <PartsMessage turn={turn} message={assistantMsg} connectionId={connectionId}
            onFollowUp={(q: string) => send(q)} onDeeper={(q: string) => onDeeper?.(q)} />
        </div>
      ))}
      {about && (
        <div style={{ display: "flex", padding: "0 0 6px" }}>
          <div data-testid="edition-ask-part" className="aug-fs-xs" style={{
            display: "flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%", padding: "2px 8px",
            borderRadius: "var(--r2)", background: "var(--blue1)", border: "1px solid var(--blue2)", color: "var(--blue5)",
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Asking about “{about.words}”</span>
            <Button variant="ghost" size="icon-xs" onClick={() => onClearAbout?.()} title="Ask about the whole edition"
              aria-label="Ask about the whole edition" data-testid="edition-ask-part-clear"
              className="aug-fs-sm h-auto w-auto p-0 hover:bg-transparent dark:hover:bg-transparent"
              style={{ marginLeft: 2, opacity: .6, lineHeight: 1, color: "inherit" }}>×</Button>
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Input ref={field} value={draft} aria-label="Ask about this edition" placeholder="Ask about this week — answered here, from the data"
          onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(draft); }} />
        <Button disabled={streaming || !draft.trim()} onClick={() => send(draft)}>{streaming ? "Answering…" : "Ask"}</Button>
      </div>
    </section>
  );
}
