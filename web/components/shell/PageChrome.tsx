"use client";

/**
 * The page's chrome — a title row, one toolbar row, and the status strip at the foot of the app — drawn by the shell
 * for EVERY page (2026-11-10, ROADMAP §6 item 64, the Evidence → Action mockups in `design-mockups/evidence-to-action/`).
 * A title row that would only repeat its section's name is not drawn. There is no breadcrumb row (the user, the same
 * day: "I think we should not have breadcrumbs at all"): the rail says where the reader is. A work surface (`bare`)
 * gets neither row.
 *
 * A page says what goes in the rows two ways:
 *   · words — its title, the places it sits in (`trail`), one state chip — through `usePageChrome`;
 *   · controls — its actions, its facts, its toolbar (filters, pickers, its own tabs), its status items, a title that
 *     is a control — by rendering them inside `<ChromeActions>`, `<ChromeFacts>`, `<ChromeToolbar>`, `<ChromeStatus>`
 *     and `<ChromeTitle>`; and its way back through `useChromeBack`, drawn before the title and named by the place it
 *     goes back to. The controls PORTAL into the shell's rows, so they stay live parts of the page — a picker shows
 *     what is picked, a button its state — rather than a copy that goes stale.
 *
 * The user's answers that shaped it: the rows are the mockups'; a page's own top rows FOLD in — its actions into the
 * title row, its filters and pickers into the one toolbar row — so no row repeats another; nothing a page did is lost
 * (the user: "Do not remove features as a cost of redesign").
 *
 * A layer a workspace keeps mounted while hidden must not speak for the page: both ways follow `LayerVisibleContext`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { LayerVisibleContext } from "@/lib/useVisiblePoll";

export type ChromeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface PageChromeSpec {
  /** The title, when the page is a thing of its own (a dashboard, a query, a record) rather than its section. */
  title?: string;
  /** Crumbs after Destination › Section — the thing open, a mode, a view. */
  trail?: string[];
  /** One state chip beside the title: Draft, Published, Editing, Not saved… */
  status?: { label: string; tone?: ChromeTone; title?: string };
  /** A WORK SURFACE (the user, 2026-11-10, of a reference SQL editor: "no header banners, no breadcrumbs … a place you
   *  can actually run queries freely"): the shell draws no breadcrumb row and no title row — the page's own rows say
   *  what is open. The toolbar row stays when something is in it, with any page action at its right end. */
  bare?: boolean;
}

type SlotName = "title" | "actions" | "facts" | "toolbar" | "status";

interface ChromeStore {
  spec: PageChromeSpec;
  set: (owner: symbol, spec: PageChromeSpec) => void;
  clear: (owner: symbol) => void;
  slots: Partial<Record<SlotName, HTMLElement | null>>;
  setSlot: (name: SlotName, el: HTMLElement | null) => void;
  /** What the section's crumb does when the page is somewhere inside its section — an open sheet, a dashboard. */
  back: (() => void) | null;
  setBack: (owner: symbol, fn: (() => void) | null) => void;
}

const ChromeContext = createContext<ChromeStore | null>(null);

/** Holds what the page on screen has said. A new page (`pageKey`) starts from nothing. */
export function PageChromeProvider({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const [entry, setEntry] = useState<{ owner: symbol | null; spec: PageChromeSpec }>({ owner: null, spec: {} });
  const [slots, setSlots] = useState<Partial<Record<SlotName, HTMLElement | null>>>({});
  const [backEntry, setBackEntry] = useState<{ owner: symbol; fn: () => void } | null>(null);
  const setBack = useCallback((owner: symbol, fn: (() => void) | null) =>
    setBackEntry(e => (fn ? { owner, fn } : e?.owner === owner ? null : e)), []);
  const set = useCallback((owner: symbol, spec: PageChromeSpec) => setEntry({ owner, spec }), []);
  const clear = useCallback((owner: symbol) => setEntry(e => (e.owner === owner ? { owner: null, spec: {} } : e)), []);
  const setSlot = useCallback((name: SlotName, el: HTMLElement | null) =>
    setSlots(prev => (prev[name] === el ? prev : { ...prev, [name]: el })), []);
  const lastKey = useRef(pageKey);
  useEffect(() => {
    if (lastKey.current !== pageKey) { lastKey.current = pageKey; setEntry({ owner: null, spec: {} }); setBackEntry(null); }
  }, [pageKey]);
  const back = backEntry?.fn ?? null;
  const value = useMemo(() => ({ spec: entry.spec, set, clear, slots, setSlot, back, setBack }),
    [entry.spec, set, clear, slots, setSlot, back, setBack]);
  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}

/** Say the page's title, crumbs and state. Strings only: controls go in the Chrome* slots. Hidden layers say nothing. */
export function usePageChrome(spec: PageChromeSpec): void {
  const store = useContext(ChromeContext);
  const visible = useContext(LayerVisibleContext);
  const owner = useRef(Symbol("page-chrome")).current;
  const key = JSON.stringify(spec);
  useEffect(() => {
    // A page that says nothing (every word undefined) leaves the rows to whoever does — a canvas's title, the section's.
    if (!store || !visible || key === "{}") return;
    store.set(owner, JSON.parse(key) as PageChromeSpec);
    return () => store.clear(owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.set, store?.clear, visible, owner, key]);
}

/**
 * Where "‹ Parent" before the title goes while the page is somewhere inside its section — an open sheet, a dashboard, a
 * record: it takes the reader back to the section's start, as the page's own "‹ Spreadsheets" or "All suites" does. `null` when
 * the page is at its start. Hidden layers say nothing.
 */
export function useChromeBack(fn: (() => void) | null): void {
  const store = useContext(ChromeContext);
  const visible = useContext(LayerVisibleContext);
  const owner = useRef(Symbol("page-back")).current;
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  const on = fn != null;
  useEffect(() => {
    if (!store || !visible || !on) return;
    store.setBack(owner, () => latest.current?.());
    return () => store.setBack(owner, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.setBack, visible, owner, on]);
}

/** The words the page on screen has said — for the shell's rows. */
export function usePageChromeSpec(): PageChromeSpec {
  return useContext(ChromeContext)?.spec ?? {};
}

/** Render children into one of the shell's rows — or, outside the shell (a canvas, a test), right where they stand. */
function Slot({ name, children }: { name: SlotName; children: ReactNode }) {
  const store = useContext(ChromeContext);
  const visible = useContext(LayerVisibleContext);
  if (!store) return <>{children}</>;
  const el = store.slots[name];
  if (!visible || !el) return null;
  return createPortal(children, el);
}
/** The title itself, when it is a control — a name renamed in place. Its words still come from `usePageChrome`. */
export const ChromeTitle = ({ children }: { children: ReactNode }) => <Slot name="title">{children}</Slot>;
/** The page's actions — right-aligned in the title row, its one primary last. */
export const ChromeActions = ({ children }: { children: ReactNode }) => <Slot name="actions">{children}</Slot>;
/** One muted line beside the title: owner, last read, version. */
export const ChromeFacts = ({ children }: { children: ReactNode }) => <Slot name="facts">{children}</Slot>;
/** The one toolbar row under the title: the page's filters, pickers and its own tabs. */
export const ChromeToolbar = ({ children }: { children: ReactNode }) => <Slot name="toolbar">{children}</Slot>;
/** What the page adds to the status strip: its run, its rows, its freshness, its save state. */
export const ChromeStatus = ({ children }: { children: ReactNode }) => <Slot name="status">{children}</Slot>;

/** Whether the shell is drawing the chrome — a component that is also used outside it (a Data Canvas) can keep its own
 *  rows there. */
export function useInShell(): boolean {
  return useContext(ChromeContext) != null;
}

function useSlotRef(name: SlotName) {
  const store = useContext(ChromeContext);
  const setSlot = store?.setSlot;
  return useCallback((el: HTMLElement | null) => { setSlot?.(name, el); }, [setSlot, name]);
}

const TONE: Record<ChromeTone, "secondary" | "default" | "green" | "amber" | "destructive"> = {
  neutral: "secondary", info: "default", success: "green", warning: "amber", danger: "destructive",
};

/**
 * The title row — drawn once it has something to say — and the toolbar row once a page puts something in it. `place`
 * is where the rail says the reader is (Destination › Section), which names the way back; `fallbackTitle` is the
 * section's own name.
 */
export function PageHeader({ place, fallbackTitle }: {
  place: { label: string; id?: string }[];
  fallbackTitle: string;
}) {
  const spec = usePageChromeSpec();
  const back = useContext(ChromeContext)?.back ?? null;
  const crumbs = [...place, ...(spec.trail ?? []).map(label => ({ label, id: undefined as string | undefined }))];
  const title = spec.title ?? fallbackTitle;
  // Every slot's ref is taken before the bare return, so the hooks run in one order whichever rows are drawn.
  const actionsRef = useSlotRef("actions");
  const toolbarRef = useSlotRef("toolbar");
  const titleRef = useSlotRef("title");
  const factsRef = useSlotRef("facts");
  if (spec.bare) {
    return (
      <div className="aug-page-chrome aug-page-chrome-bare">
        <div className="aug-bare-row">
          <div className="aug-page-toolbar" ref={toolbarRef} />
          <div className="aug-title-actions" ref={actionsRef} />
        </div>
      </div>
    );
  }
  // No breadcrumb row (the user, 2026-11-10: "I think we should not have breadcrumbs at all"): the rail says where the
  // reader is, the title what is open. A page inside its section (an open canvas, an agent, a record, a catalog's
  // schema) keeps its way back as one control before the title, named by where it goes: "‹ Data Canvas".
  const parent = back && crumbs.length >= 2 ? crumbs[crumbs.length - 2].label : null;
  // A title row that would only repeat the section's name says nothing the rail does not (the user, 2026-11-10: "the
  // Semantic Layer has header banner.. let remove such where there is no purpose or interactity or info statements").
  // It is marked plain, and drawn only once something arrives in it — a fact, an action (`globals.css`, :has).
  const plain = !parent && !spec.status && (spec.title === undefined || spec.title === fallbackTitle);
  return (
    <div className="aug-page-chrome">
      <div className="aug-titlebar" data-plain={plain ? "true" : undefined}>
        {parent && back && (
          <Button variant="ghost" size="xs" className="aug-title-back" data-testid="page-back"
            aria-label={`Back to ${parent}`} title={`Back to ${parent}`} onClick={back}>
            <Icon name="chevl" size={12} /> {parent}
          </Button>
        )}
        <h1 className="aug-page-title" title={title}>
          <span className="aug-title-slot" ref={titleRef} />
          <span className="aug-title-text">{title}</span>
        </h1>
        {spec.status && (
          <Badge variant={TONE[spec.status.tone ?? "neutral"]} title={spec.status.title}>{spec.status.label}</Badge>
        )}
        <div className="aug-title-facts" ref={factsRef} />
        <div className="aug-title-actions" ref={actionsRef} />
      </div>
      <div className="aug-page-toolbar" ref={toolbarRef} />
    </div>
  );
}

/**
 * The status strip at the foot of the app: where the reader's data is (connection · engine), the agent runs in flight,
 * then whatever the page on screen adds — its run, its rows, its freshness, its save state.
 */
export function StatusStrip({ connection, running }: {
  connection: { name: string; engine?: string } | null;
  running: number;
}) {
  return (
    <footer className="aug-status-strip" aria-label="Status">
      <span className="aug-status-item">
        {connection
          ? <><span className="aug-status-dot" aria-hidden />{connection.name}{connection.engine ? ` · ${connection.engine}` : ""}</>
          : <span className="aug-status-quiet">No connection chosen</span>}
      </span>
      <span className="aug-status-item"><span className="aug-status-sep" aria-hidden>│</span>
        {/* Agent runs in flight — named as such: the LIVE strip in the top bar counts the warehouse's activity. */}
        {running > 0 ? `${running} agent ${running === 1 ? "run" : "runs"} in flight` : "No agent runs in flight"}
      </span>
      <span className="aug-status-page" ref={useSlotRef("status")} />
    </footer>
  );
}
