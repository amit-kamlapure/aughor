"use client";

/**
 * The Briefing as a running account (2026-11-12). The user, on the edition page: "Argue how actionable this is? And
 * is it role based?" — an edition was blocks of equal weight, and almost every step it offered was "look more".
 *
 * Three parts, all read from what the server says of a written edition (`briefing/storylines.py`), none written by
 * a model and none stored:
 *
 *   · `AccountTally` — how many storylines have an owner, how many decisions are taken, how many wait;
 *   · `BusinessLine` — every measured figure under the part of the business it reads on, against its usual range;
 *   · `Storylines` — one row per storyline: its owner, its worth and its one next step, said before it is opened;
 *     opened, the four things that make it something to act on (owner · worth · decision · check), its chart, the
 *     edition's own blocks about it — drawn by the same renderer as before, so every citation, drill, table and
 *     ask still works — and its trail.
 *
 * A figure read outside its usual range that the platform does not CALL a move is drawn as a ring and is not
 * priced; a storyline with no owner, no decision or nothing to check says so in its place.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";

import { VegaChart } from "@/components/charts/vega/VegaChart";
import { Chip, type Tone } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import type { EditionFigure, EditionStage, EditionStoryline, StorylineTrail } from "@/lib/api";
import {
  STANDING_COLOR, figureSpec, scoreOf, sideOf, standingOf, tallyOf, trackOf, usualWords,
} from "@/lib/briefingAccount";
import { countNoun, utcDayWords } from "@/lib/format";
import { requestTab } from "@/lib/navigate";

const RULE = "1px solid var(--b1)";
const LABEL: React.CSSProperties = { color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 };
const NUM: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
const PANEL: React.CSSProperties = { background: "var(--bg-1)", border: RULE, borderRadius: "var(--r3)" };
const STATE: Record<EditionStoryline["state"], { label: string; tone: Tone }> = {
  new: { label: "New", tone: "accent" }, developing: { label: "Developing", tone: "amber" }, decided: { label: "Decided", tone: "up" },
};
const day = (iso?: string): string => (iso ? utcDayWords(iso) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function SectionHead({ title, note, right }: { title: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "22px 0 8px" }}>
      <h2 className="aug-fs-xs" style={{ ...LABEL, margin: 0 }}>{title}</h2>
      {note && <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>{note}</span>}
      {right && <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>{right}</span>}
    </div>
  );
}

/** The page's opening counts. Each is a fact about the storylines below, never a score. */
export function AccountTally({ stories, unread }: { stories: EditionStoryline[]; unread?: Record<string, string> }) {
  const t = tallyOf(stories);
  const cell = (n: number, words: string, testid: string) => (
    <div style={{ textAlign: "right" }}>
      <div className="aug-fs-display" data-testid={testid} style={{ ...NUM, color: "var(--t1)", fontWeight: 600, lineHeight: 1.1 }}>{n}</div>
      <div className="aug-fs-xs" style={{ color: "var(--t3)" }}>{words}</div>
    </div>
  );
  return (
    <div data-testid="account-tally">
      <div style={{ display: "flex", gap: 28, justifyContent: "flex-end", flexWrap: "wrap", margin: "10px 0 0" }}>
        {cell(t.owned, `of ${countNoun(t.stories, "storyline")} ${t.owned === 1 ? "has" : "have"} an owner`, "tally-owned")}
        {cell(t.decided, `of ${countNoun(t.decisions, "decision")} taken`, "tally-decided")}
        {cell(t.waiting, t.waiting === 1 ? "waits on a person" : "wait on a person", "tally-waiting")}
      </div>
      {Object.entries(unread ?? {}).map(([store, why]) => (
        <p key={store} className="aug-fs-xs" data-testid="account-unread" style={{ color: "var(--amb4)", margin: "6px 0 0", textAlign: "right" }}>
          Not read: {store} — {why}
        </p>
      ))}
    </div>
  );
}

/** A figure's place against its usual range: the range as a band, this range as a mark — filled when the platform
 *  calls the move, a ring when it reads it outside but does not call it. */
function Track({ figure }: { figure: EditionFigure }) {
  const t = trackOf(figure);
  if (!t) return null;
  const standing = standingOf(figure);
  const color = STANDING_COLOR[standing];
  const called = standing === "inside" || (figure.outside && figure.status === "final");
  return (
    <div aria-hidden style={{ position: "relative", height: 10, gridColumn: "1 / 3" }}>
      <span style={{ position: "absolute", left: 0, right: 0, top: 4, height: 2, background: "var(--b1)" }} />
      <span style={{ position: "absolute", left: `${t.low}%`, width: `${Math.max(t.high - t.low, 1)}%`, top: 2, height: 6, background: "var(--b2, var(--b1))" }} />
      <span data-called={called ? "yes" : "no"} style={{ position: "absolute", left: `calc(${t.at}% - 5px)`, top: 0, width: 10, height: 10,
        borderRadius: "50%", boxSizing: "border-box", background: called ? color : "var(--bg-1)", border: called ? "none" : `2px solid ${color}` }} />
    </div>
  );
}

export function BusinessLine({ stages, figures, chosen, onChoose }: {
  stages: EditionStage[];
  figures: EditionFigure[];
  /** The stage picked, or "" — picking one opens its storyline below. */
  chosen: string;
  onChoose: (stage: string) => void;
}) {
  const byId = Object.fromEntries(figures.map(f => [f.id, f]));
  const key = (stage: string) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChoose(stage); } };
  return (
    <>
      <div data-testid="business-line" style={{ ...PANEL, display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(210px, 1fr))` }}>
        {stages.map(s => {
          const figs = s.figures.map(id => byId[id]).filter(Boolean);
          const out = figs.filter(f => sideOf(f) !== 0).length;
          return (
            <div key={s.id} role="button" tabIndex={0} data-testid="business-stage" aria-pressed={chosen === s.id}
              onClick={() => onChoose(chosen === s.id ? "" : s.id)} onKeyDown={key(chosen === s.id ? "" : s.id)}
              style={{ padding: "12px 14px 10px", borderRight: RULE, borderBottom: RULE, marginRight: -1, marginBottom: -1, cursor: "pointer",
                       background: chosen === s.id ? "var(--blue1)" : undefined }}>
              <div className="aug-fs-ui" style={{ color: "var(--t1)", fontWeight: 600 }}>{s.name}</div>
              <div className="aug-fs-xs" style={{ ...NUM, color: "var(--t3)", margin: "0 0 8px" }}>
                {out ? `${out} of ${figs.length} outside usual` : "all inside usual"}
              </div>
              {figs.map(f => (
                <div key={f.id} data-testid="line-figure" className="aug-fs-sm"
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", padding: "5px 0", borderTop: RULE }}>
                  <span style={{ color: "var(--t2)" }} title={f.why || undefined}>{f.label}</span>
                  <span style={{ ...NUM, color: "var(--t1)", fontWeight: 600, textAlign: "right" }}>{f.current_text ?? "—"}</span>
                  <Track figure={f} />
                  <span className="aug-fs-xs" style={{ ...NUM, gridColumn: "1 / 3", color: "var(--t3)" }}
                    title={f.equal_age && !f.equal_age.equal ? f.equal_age.why : undefined}>
                    {f.usual ? `usual ${usualWords(f)}${sideOf(f) && !f.outside ? " · read, not called a move" : ""}` : "not read against a usual range"}
                    {f.status !== "final" ? ` · ${f.status.replace("_", " ")}` : ""}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="aug-fs-xs" style={{ color: "var(--t3)", margin: "8px 0 0" }}>
        The band is a figure&apos;s usual range and the mark is this range. A filled mark is a move the platform calls; a ring is
        read outside the range but not called. Green is the better way, amber the worse, by what the guide says of the figure.
      </p>
    </>
  );
}

function Cell({ label, big, tone, children }: { label: string; big: ReactNode; tone?: "none" | "done"; children?: ReactNode }) {
  return (
    <div style={{ padding: "12px 14px", borderRight: RULE, minWidth: 0 }}>
      <div className="aug-fs-xs" style={LABEL}>{label}</div>
      <div className="aug-fs-ui" style={{ ...NUM, fontWeight: 600, margin: "3px 0 4px",
        color: tone === "none" ? "var(--amb4)" : tone === "done" ? "var(--grn4)" : "var(--t1)" }}>{big}</div>
      <div className="aug-fs-xs" style={{ color: "var(--t3)", lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function Trail({ trail, onCite }: { trail: StorylineTrail[]; onCite: (source: string) => void }) {
  return (
    <ol data-testid="storyline-trail" style={{ listStyle: "none", margin: 0, padding: 0, marginLeft: 4, borderLeft: "2px solid var(--b1)" }}>
      {trail.map((t, i) => (
        <li key={i} className="aug-fs-sm" style={{ position: "relative", padding: "0 0 10px 14px", color: "var(--t2)" }}>
          <span aria-hidden style={{ position: "absolute", left: -6, top: 5, width: 8, height: 8, boxSizing: "content-box",
            background: t.now ? "var(--blue4)" : "var(--bg-1)",
            border: `2px ${t.open ? "dashed var(--amb4)" : `solid ${t.now ? "var(--blue4)" : "var(--t3)"}`}` }} />
          <time className="aug-fs-xs" style={{ display: "block", color: "var(--t3)" }}>{t.when ? day(t.when) : "Open"}</time>
          {t.says}
          {t.source && <>{" "}<Button size="xs" variant="link" onClick={() => onCite(t.source!)}>source</Button></>}
        </li>
      ))}
    </ol>
  );
}

export function Storylines({ stories, figures, period, readerName, teams, open, onOpen, stage, renderBlocks, onCite, onOwner, onDecide, busy }: {
  stories: EditionStoryline[];
  figures: EditionFigure[];
  /** "week" · "month" · … — the edition's range, in the chart's caption. */
  period: string;
  /** The team the page is read as, or "" for the organisation: a storyline that team owns is "yours". */
  readerName: string;
  teams: { id: string; name: string }[];
  open: string;
  onOpen: (id: string) => void;
  /** A stage picked on the business line: storylines elsewhere are drawn quieter. */
  stage: string;
  renderBlocks: (ids: string[]) => ReactNode;
  onCite: (source: string) => void;
  /** Say who owns the metric a storyline stands on ("" = nobody). */
  onOwner: (story: EditionStoryline, owner: string) => void;
  /** Open the form that takes a decision on a storyline. */
  onDecide: (story: EditionStoryline) => void;
  /** The storyline whose owner is being written. */
  busy: string;
}) {
  const [giving, setGiving] = useState("");
  const byId = Object.fromEntries(figures.map(f => [f.id, f]));
  if (!stories.length) {
    return <p className="aug-fs-sm" data-testid="storylines-none" style={{ color: "var(--t2)", margin: 0 }}>
      Every measured figure read inside its usual range and the edition cites no decision, so there is no storyline to carry.
    </p>;
  }
  const worthWords = (s: EditionStoryline) => s.worth.value != null ? `${s.worth.unit ? `${s.worth.unit} ` : ""}${s.worth.text}` : "Not sized";
  // the one next step a reader has on a storyline, said on its row before it is opened
  const step = (s: EditionStoryline): { label: string; act: () => void } | null => {
    if (s.decision?.taken) return s.decision.id ? { label: s.check.state === "reviewed" ? "Open the decision" : "Open the review",
                                                    act: () => requestTab("decisions", { id: String(s.decision!.id) }) } : null;
    if (!s.owner && s.kind === "figures") {
      return readerName ? { label: `Take it for ${readerName}`, act: () => onOwner(s, readerName) }
                        : { label: "Give it to a team", act: () => { onOpen(s.id); setGiving(s.id); } };
    }
    return { label: s.decision ? "Decide it" : "Propose a decision", act: () => onDecide(s) };
  };
  const key = (id: string) => (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(id); } };

  return (
    <div data-testid="storylines" style={{ ...PANEL, overflow: "hidden" }}>
      {stories.map((s, i) => {
        const next = step(s);
        const mine = !!readerName && !!s.owner && same(s.owner, readerName);
        const anchor = byId[s.anchor];
        const isOpen = open === s.id;
        return (
          <div key={s.id} data-testid="storyline" data-state={s.state} style={{ borderTop: i ? RULE : undefined }}>
            <div role="button" tabIndex={0} aria-expanded={isOpen} data-testid="storyline-row" onClick={() => onOpen(isOpen ? "" : s.id)} onKeyDown={key(isOpen ? "" : s.id)}
              style={{ display: "grid", gridTemplateColumns: "92px minmax(260px,1fr) 140px 120px 176px 76px", gap: 12, alignItems: "center",
                       padding: "10px 14px", cursor: "pointer", background: isOpen ? "var(--blue1)" : undefined,
                       opacity: stage && s.stage !== stage ? 0.4 : 1 }}>
              <span><Chip tone={STATE[s.state].tone}>{STATE[s.state].label}</Chip></span>
              <span className="aug-fs-ui" style={{ color: "var(--t1)", fontWeight: 600, lineHeight: 1.35 }}>
                {s.head}{mine && <>{" "}<Chip tone="accent">yours</Chip></>}
                {!s.called && <>{" "}<Chip title="Read outside its usual range, but the platform does not call it a move">not called</Chip></>}
                {s.status !== "final" && <>{" "}<Chip tone="amber" title="Its range is still filling, so the figure may yet change">{s.status.replace("_", " ")}</Chip></>}
              </span>
              <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>
                <b className="aug-fs-sm" data-testid="storyline-owner" style={{ display: "block", fontWeight: 600, color: s.owner ? "var(--t1)" : "var(--amb4)" }}>
                  {s.owner || "No owner"}</b>
                {s.stage_name || (s.decision?.decided ? `decided ${day(s.decision.decided)}` : "")}
              </span>
              <span className="aug-fs-xs" style={{ ...NUM, color: "var(--t3)" }}>
                <b className="aug-fs-sm" style={{ display: "block", fontWeight: 600, color: "var(--t1)" }}>{worthWords(s)}</b>
                {s.worth.value != null ? (s.worth.value > 0 ? "above its usual top" : "below its usual bottom") : ""}
              </span>
              <span>{next && <Button size="sm" variant="outline" disabled={busy === s.id} data-testid="storyline-step"
                onClick={e => { e.stopPropagation(); next.act(); }}>{next.label}</Button>}</span>
              <span aria-hidden>{anchor && <VegaChart spec={figureSpec(anchor, true)} tier={2} height={30} />}</span>
            </div>
            {isOpen && (
              <div data-testid="storyline-open" style={{ borderTop: RULE, padding: "14px 14px 16px" }}>
                <div data-testid="storyline-four" style={{ display: "grid", gridTemplateColumns: "2fr 2fr 4fr 3fr", background: "var(--bg-0, transparent)",
                                                           border: RULE, borderRadius: "var(--r3)", marginBottom: 16, overflow: "hidden" }}>
                  <Cell label="Owner" big={s.owner || "No owner"} tone={s.owner ? undefined : "none"}>
                    {s.owner_from === "decision" ? "The Record names them owner of its decision."
                      : s.owner_from === "metric" ? `Owns ${anchor?.label ?? s.metric}, the metric this storyline stands on.`
                      : s.kind === "figures" ? `Nobody owns ${anchor?.label ?? s.metric}. An owner is set on the metric, so it carries to every edition.`
                      : "The Record names no owner for this decision."}
                    {s.kind === "figures" && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {readerName && !mine && <Button size="xs" disabled={busy === s.id} onClick={() => onOwner(s, readerName)}>Take it for {readerName}</Button>}
                        <Button size="xs" variant="outline" aria-expanded={giving === s.id} onClick={() => setGiving(giving === s.id ? "" : s.id)}>
                          {s.owner ? "Hand it on" : "Give it to a team"}</Button>
                        {giving === s.id && (teams.length ? teams.filter(t => !same(t.name, s.owner)).map(t => (
                          <Button key={t.id} size="xs" variant="outline" disabled={busy === s.id} data-testid="storyline-give"
                            onClick={() => { onOwner(s, t.name); setGiving(""); }}>{t.name}</Button>
                        )) : <span>— there are no function groups yet</span>)}
                        {giving === s.id && s.owner && <Button size="xs" variant="outline" disabled={busy === s.id} onClick={() => { onOwner(s, ""); setGiving(""); }}>Nobody</Button>}
                      </div>
                    )}
                  </Cell>
                  <Cell label="Worth" big={worthWords(s)} tone={s.worth.value == null ? "none" : undefined}>
                    {s.worth.value != null ? s.worth.says : s.worth.why}
                  </Cell>
                  <Cell label={s.decision?.taken ? `Decided${s.decision.decided ? ` ${day(s.decision.decided)}` : ""}${s.decision.by ? ` · ${s.decision.by}` : ""}`
                                : s.decision ? "Proposed by this edition · not taken" : "No decision proposed"}
                    big={s.decision?.text || "Nothing has been decided or proposed on this."}>
                    {s.decision?.taken ? s.decision.where : s.decision
                      ? "Taking it books the decision in the Record with what it is expected to change, before the fact."
                      : "A decision can still be taken on it: say what will be done and what it is expected to change."}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {s.decision?.taken
                        ? s.decision.id && <Button size="xs" variant="outline" onClick={() => requestTab("decisions", { id: String(s.decision!.id) })}>Open the decision</Button>
                        : s.kind === "figures" && <Button size="xs" data-testid="storyline-decide" onClick={() => onDecide(s)}>{s.decision ? "Decide it" : "Propose a decision"}</Button>}
                    </div>
                  </Cell>
                  <Cell label="Checked" tone={s.check.state === "booked" || s.check.state === "reviewed" ? "done" : "none"}
                    big={s.check.state === "none" ? "Nothing to check" : s.check.state === "reviewed" ? "Reviewed"
                      : `Review ${s.check.on ? day(s.check.on) : "date not set"}`}>
                    <span data-testid="storyline-check">{s.check.says}</span>
                  </Cell>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 28 }}>
                  <div style={{ minWidth: 0 }}>
                    {anchor && (
                      <figure style={{ margin: "0 0 12px" }}>
                        <figcaption className="aug-fs-xs" style={{ color: "var(--t3)", display: "flex", gap: 10, marginBottom: 4 }}>
                          <span>{anchor.label}, the last {countNoun(anchor.series.length, period)} — the band is its usual range</span>
                          <span style={{ marginLeft: "auto" }}><Button size="xs" variant="link" onClick={() => onCite(anchor.id)}>source</Button></span>
                        </figcaption>
                        <VegaChart spec={figureSpec(anchor)} tier={2} height={190} />
                      </figure>
                    )}
                    {s.figures.length > 1 && (
                      <p className="aug-fs-sm" data-testid="storyline-with" style={{ ...NUM, color: "var(--t2)", margin: "0 0 12px" }}>
                        Also outside usual on {s.stage_name}:{" "}
                        {s.figures.slice(1).map(id => byId[id]).filter(Boolean).map(f => `${f.label} ${f.current_text} (usual ${usualWords(f)})`).join(" · ")}.
                      </p>
                    )}
                    {s.blocks.length > 0 ? renderBlocks(s.blocks)
                      : <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: 0 }}>This edition wrote nothing more about it.</p>}
                  </div>
                  <div>
                    <div className="aug-fs-xs" style={{ ...LABEL, marginBottom: 8 }}>The trail</div>
                    <Trail trail={s.trail} onCite={onCite} />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** How the range read against its usual ranges — counted from the measurement, never written. */
export function ScoreLedger({ figures }: { figures: EditionFigure[] }) {
  const s = scoreOf(figures);
  if (!s.read) return null;
  const rows = [...s.above, ...s.below].slice(0, 6);
  return (
    <section data-testid="account-score" style={{ ...PANEL, padding: "12px 14px", margin: "12px 0 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "0 0 8px" }}>
        <h2 className="aug-fs-ui" style={{ margin: 0, color: "var(--t1)", fontWeight: 600 }}>Against its usual range</h2>
        <span className="aug-fs-xs" style={{ ...NUM, color: "var(--t3)" }}>
          {s.inside} of {countNoun(s.read, "figure")} read inside · {s.above.length} above · {s.below.length} below
        </span>
      </div>
      {rows.length === 0 ? <p className="aug-fs-sm" style={{ color: "var(--t3)", margin: 0 }}>Every figure read inside its usual range.</p> : (
        <table className="aug-fs-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map(f => (
              <tr key={f.id} data-testid="score-row">
                <td style={{ padding: "6px 12px 6px 0", borderTop: RULE, color: "var(--t1)" }}>{f.label}</td>
                <td style={{ ...NUM, padding: "6px 12px 6px 0", borderTop: RULE, color: "var(--t3)" }}>usual {usualWords(f)}</td>
                <td style={{ ...NUM, padding: "6px 12px 6px 0", borderTop: RULE, color: "var(--t1)", textAlign: "right" }}>read {f.current_text}</td>
                <td style={{ padding: "6px 0", borderTop: RULE, textAlign: "right" }}>
                  {f.outside ? <Chip tone={standingOf(f) === "better" ? "up" : standingOf(f) === "worse" ? "amber" : "plain"}>{sideOf(f) > 0 ? "above" : "below"}</Chip>
                             : <Chip title={f.equal_age && !f.equal_age.equal ? f.equal_age.why : "Read outside its usual range, not called a move"}>not called</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
