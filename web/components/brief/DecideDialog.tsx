"use client";

/**
 * Take a decision on a Briefing storyline (2026-11-12). The Record already books a decision with its expectation
 * (`POST /record/decisions`); what the Briefing lacked was the door. The form says what will be done, who owns it
 * and — the part that lets the loop close — what the storyline's figure is expected to read afterwards, BEFORE the
 * fact: the Record does not count an expectation written after the decision. The figure the decision was taken on
 * is cited by the server, measured for the edition's own days.
 */
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import type { EditionFigure, EditionStoryline } from "@/lib/api";
import { sideOf, usualWords } from "@/lib/briefingAccount";
import { declareDecision } from "@/lib/record";

const FIELD: React.CSSProperties = { display: "grid", gap: 4, marginBottom: 12 };
const HINT: React.CSSProperties = { color: "var(--t3)" };

/** The numbers a person typed, or null — an empty box is "not said", never zero. */
const numberOf = (text: string): number | null => {
  const n = Number(text.replace(/,/g, "").trim());
  return text.trim() && Number.isFinite(n) ? n : null;
};

export function DecideDialog({ story, figure, connectionId, schema, start, end, readerName, onClose, onDone }: {
  /** The storyline being decided on, or null when the form is closed. */
  story: EditionStoryline | null;
  /** The figure it stands on. */
  figure?: EditionFigure;
  connectionId: string;
  schema?: string;
  /** The edition's range: first day, and the day after its last. */
  start?: string;
  end?: string;
  readerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [direction, setDirection] = useState<"up" | "down" | "hold">("hold");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [reviewOn, setReviewOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A storyline opens the form on its own words: the edition's proposal, its owner, and "back inside its usual range".
  useEffect(() => {
    if (!story) return;
    setText(story.decision && !story.decision.taken ? story.decision.text : "");
    setOwner(story.owner || readerName);
    const way = figure ? sideOf(figure) : 0;
    setDirection(way > 0 ? "down" : way < 0 ? "up" : "hold");
    setLow(figure?.usual ? String(Number(figure.usual.low.toPrecision(6))) : "");
    setHigh(figure?.usual ? String(Number(figure.usual.high.toPrecision(6))) : "");
    setReviewOn("");
    setError("");
  }, [story, figure, readerName]);

  const expects = numberOf(low) != null || numberOf(high) != null;
  const save = async () => {
    if (!story) return;
    setBusy(true);
    setError("");
    try {
      await declareDecision({
        question: story.head, chosen: text.trim(), options: [text.trim(), "not act"], owner: owner.trim(),
        objective: story.metric, connection_id: connectionId, schema_name: schema, review_on: reviewOn || undefined,
        expectation: story.metric && expects ? { metric: story.metric, direction, low: numberOf(low), high: numberOf(high),
          text: `${figure?.label ?? story.metric} ${numberOf(low) ?? "…"}–${numberOf(high) ?? "…"} after: ${text.trim()}` } : null,
        figure: story.metric && start && end ? { metric: story.metric, start, end } : undefined,
        note: "taken on a Briefing storyline",
      });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <FormDialog open={!!story} onOpenChange={o => { if (!o) onClose(); }} busy={busy} width={640} testId="decide-dialog"
      title="Take a decision" description={story?.head}>
      <label className="aug-fs-sm" style={FIELD}>
        What will be done
        <Textarea data-testid="decide-text" rows={3} value={text} onChange={e => setText(e.target.value)}
          placeholder="One sentence, in your own words" />
      </label>
      <label className="aug-fs-sm" style={FIELD}>
        Who owns it
        <Input data-testid="decide-owner" value={owner} onChange={e => setOwner(e.target.value)} placeholder="A team or a person" />
      </label>
      {story?.metric ? (
        <fieldset style={{ border: "1px solid var(--b1)", borderRadius: "var(--r3)", padding: "10px 12px", margin: "0 0 12px" }}>
          <legend className="aug-fs-sm" style={{ padding: "0 6px" }}>What {figure?.label ?? story.metric} is expected to read afterwards</legend>
          <p className="aug-fs-xs" style={{ ...HINT, margin: "0 0 10px" }}>
            It read {figure?.current_text ?? "—"}{figure?.usual ? ` against a usual ${usualWords(figure)}` : ""}. The review scores the figure
            against this range. Leave both empty and the decision is booked with nothing to score — said on the page.
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <Segmented label="Expected to go" value={direction} onChange={v => setDirection(v as "up" | "down" | "hold")}
              options={[{ value: "down", label: "Down" }, { value: "hold", label: "Hold" }, { value: "up", label: "Up" }]} />
            <label className="aug-fs-xs" style={{ display: "grid", gap: 4 }}>At least
              <Input data-testid="decide-low" inputMode="decimal" value={low} onChange={e => setLow(e.target.value)} style={{ width: 130 }} /></label>
            <label className="aug-fs-xs" style={{ display: "grid", gap: 4 }}>At most
              <Input data-testid="decide-high" inputMode="decimal" value={high} onChange={e => setHigh(e.target.value)} style={{ width: 130 }} /></label>
          </div>
        </fieldset>
      ) : null}
      <label className="aug-fs-sm" style={FIELD}>
        Review on
        <Input data-testid="decide-review" type="date" value={reviewOn} onChange={e => setReviewOn(e.target.value)} style={{ width: 180 }} />
        <span className="aug-fs-xs" style={HINT}>Left empty, the Record proposes the date: 30 days plus the time this data takes to settle.</span>
      </label>
      {error && <p role="alert" className="aug-fs-sm" style={{ color: "var(--red4)", margin: "0 0 10px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button data-testid="decide-save" disabled={busy || !text.trim()} onClick={() => void save()}>
          {busy ? "Booking…" : expects && story?.metric ? "Book the decision and its expectation" : "Book the decision"}
        </Button>
      </div>
    </FormDialog>
  );
}
