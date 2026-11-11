"use client";

/**
 * The one inspector (2026-11-10, ROADMAP §6 item 64; the Evidence → Action mockups). Selecting a thing anywhere — an
 * object in a table, a result column, a claim, a metric — opens ONE panel at the right of the page with that thing's
 * tabs: Overview · Definition · Relations · Provenance · Activity · Actions · Assist, the ones that do not apply hidden.
 *
 * The user's answers: it opens on SELECTION and stays open while the reader moves between things; Esc or × closes it;
 * a page keeps its full width otherwise. It JOINS the drawers and detail pieces that exist — it replaces one only once
 * it does all that one did ("Do not remove features as a cost of redesign").
 *
 * A page opens it with `useInspector().inspect(subject)`; the shell draws `<InspectorHost/>` once, beside the content.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { TabStrip } from "@/components/ui/tab-strip";

export const INSPECTOR_TABS = ["overview", "definition", "relations", "provenance", "activity", "actions", "assist"] as const;
export type InspectorTab = (typeof INSPECTOR_TABS)[number];
const TAB_WORD: Record<InspectorTab, string> = {
  overview: "Overview", definition: "Definition", relations: "Relations", provenance: "Provenance",
  activity: "Activity", actions: "Actions", assist: "Assist",
};

export interface InspectorSubject {
  /** Stable identity: the same thing opened twice keeps its tab. */
  key: string;
  /** What kind of thing it is, as a chip: "Order", "Result column", "Claim". */
  kind: string;
  title: string;
  icon?: IconName;
  /** A line under the title: its id, its state. */
  meta?: ReactNode;
  /** Its tabs; a tab not given is not drawn. */
  tabs: Partial<Record<InspectorTab, ReactNode>>;
  /** The tab to open on, when the subject is new. */
  tab?: InspectorTab;
}

interface InspectorStore {
  subject: InspectorSubject | null;
  inspect: (subject: InspectorSubject) => void;
  close: () => void;
}

const InspectorContext = createContext<InspectorStore | null>(null);

/** Holds what is inspected. Closes when the page changes (`pageKey`): a thing from one page never stays over the next. */
export function InspectorProvider({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const [subject, setSubject] = useState<InspectorSubject | null>(null);
  const inspect = useCallback((s: InspectorSubject) => setSubject(s), []);
  const close = useCallback(() => setSubject(null), []);
  useEffect(() => { setSubject(null); }, [pageKey]);
  const value = useMemo(() => ({ subject, inspect, close }), [subject, inspect, close]);
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

/** Open (or replace) what the inspector shows, close it, or read what it shows. Outside the shell it does nothing. */
export function useInspector(): InspectorStore {
  return useContext(InspectorContext) ?? NO_INSPECTOR;
}
const NO_INSPECTOR: InspectorStore = { subject: null, inspect: () => {}, close: () => {} };

const WIDTH_KEY = "aughor_inspector_width";
const MIN_W = 320, MAX_W = 520, DEFAULT_W = 360;

function readWidth(): number {
  try {
    const raw = Number(window.localStorage.getItem(WIDTH_KEY));
    return raw >= MIN_W && raw <= MAX_W ? raw : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

/** The panel itself — drawn once by the shell, beside the content; nothing at all while nothing is inspected. */
export function InspectorHost() {
  const { subject, close } = useInspector();
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [width, setWidth] = useState(DEFAULT_W);
  const lastKey = useRef<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => { setWidth(readWidth()); }, []);
  // A new thing opens on its own tab; the same thing again keeps the tab the reader was on.
  useEffect(() => {
    if (!subject) { lastKey.current = null; return; }
    if (subject.key !== lastKey.current) {
      lastKey.current = subject.key;
      const first = INSPECTOR_TABS.find(t => subject.tabs[t] != null) ?? "overview";
      setTab(subject.tab && subject.tabs[subject.tab] != null ? subject.tab : first);
    }
  }, [subject]);
  // Esc closes it — unless the reader is typing, or an overlay (a menu, a dialog) is open above the page.
  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[role='dialog'][data-state='open'], [role='menu']")) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, close]);

  const keep = (w: number) => {
    const next = Math.min(MAX_W, Math.max(MIN_W, Math.round(w)));
    setWidth(next);
    try { window.localStorage.setItem(WIDTH_KEY, String(next)); } catch { /* a per-viewer convenience only */ }
  };
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    const move = (ev: PointerEvent) => keep(startW + (startX - ev.clientX));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!subject) return null;
  const tabs = INSPECTOR_TABS.filter(t => subject.tabs[t] != null);
  const shown = tabs.includes(tab) ? tab : tabs[0];
  return (
    <aside ref={panelRef} className="aug-inspector" aria-label={`Inspector: ${subject.title}`} style={{ width }}>
      <div className="aug-inspector-grip" role="separator" aria-orientation="vertical" aria-label="Resize the inspector"
        aria-valuemin={MIN_W} aria-valuemax={MAX_W} aria-valuenow={width} tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={e => {
          if (e.key === "ArrowLeft") { e.preventDefault(); keep(width + 16); }
          if (e.key === "ArrowRight") { e.preventDefault(); keep(width - 16); }
        }} />
      <header className="aug-inspector-head">
        <div className="aug-inspector-row1">
          {subject.icon && <span className="aug-inspector-glyph" aria-hidden><Icon name={subject.icon} size={14} /></span>}
          <span className="aug-inspector-title" title={subject.title}>{subject.title}</span>
          <span className="aug-inspector-kind">{subject.kind}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Close the inspector" title="Close · Esc" onClick={close}
            style={{ marginLeft: "auto" }}>
            <Icon name="close" size={14} />
          </Button>
        </div>
        {subject.meta && <div className="aug-inspector-meta">{subject.meta}</div>}
      </header>
      {tabs.length > 1 && (
        <TabStrip label="Inspector tabs" size="1" value={shown} onChange={setTab} className="aug-inspector-tabs"
          tabs={tabs.map(t => ({ id: t, label: TAB_WORD[t] }))} />
      )}
      <div className="aug-inspector-body" role="tabpanel" aria-label={TAB_WORD[shown]}>
        {subject.tabs[shown]}
      </div>
    </aside>
  );
}

/** A key/value grid for an inspector tab: the label muted on the left, the value beside it. */
export function InspectorFacts({ rows }: { rows: { label: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="aug-inspector-facts">
      {rows.map((r, i) => (
        <div key={`${i}:${r.label}`} className="aug-inspector-fact">
          <dt>{r.label}</dt>
          <dd>{r.value}{r.note && <div className="aug-inspector-note">{r.note}</div>}</dd>
        </div>
      ))}
    </dl>
  );
}
