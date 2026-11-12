"use client";

/**
 * SE-1/SE-2 — SQL mode: editor over results, history on the right.
 *
 * The catalog rail used to be this file's too. PR E moved it up to the workbench, where
 * ONE rail serves both modes; what remains here is the insertion point it targets,
 * published through `onInsertReady`. The rail decides WHAT to insert (a qualified table,
 * a bare column); this file still owns WHERE, because the cursor is the editor's.
 *
 * This component owns the one decision the editor deliberately does not: **what runs**.
 * The rule is selection-if-any, else the statement under the cursor, else the whole
 * buffer. Keeping it here rather than in `SqlEditorPane` means the editor stays a text
 * surface and the workbench stays the thing that knows about connections and queries.
 *
 * SE-2 adds tabs. Each tab is a document with its own SQL, name and last-run status,
 * persisted per connection. The EDITOR is mounted once and its document swapped on tab
 * change rather than mounted per tab: a CM6 view per tab would multiply the parser
 * worker and the linter by the tab count, and 20 tabs is an allowed state.
 *
 * Redone to `pramanyx-v2/CLARITY.md` (2026-10-12): the toolbar is Run (or Cancel), the schema, the guards' verdict as
 * a chip and ONE Tools ▾ — Explain, Run all, Format and its preferences, Open, Recent runs and the keys moved
 * there from a row of buttons and icons, unchanged in what they do. The assistant that sat in a pane on the right is
 * `/ask` in the editor itself (`editor/ask.ts`): a line `/ask <what you want>` becomes the statement the platform's
 * question-to-SQL path writes (`POST /query/ask`), never run.
 *
 * The start page (the user, 2026-11-09): with no query tab open — a connection with none, or the last tab closed — the
 * editor area is `QueryStart` instead of an editor: Create new, then the recent runs or the saved queries, each opening
 * in a new tab. With a tab open, NOTHING of history sits under the editor ("must not have a history component
 * underneath it in any case"): before a statement runs the results pane is collapsed to one line, and it opens on the
 * first run. A set of restored tabs none of which holds any SQL opens on the start page too — an empty tab is not work
 * in progress, and the platform made most of them itself, on a connection's first visit.
 *
 * Drafts persist per connection so a layer switch or a reload does not lose work in
 * progress. Two rules from this codebase apply and both are load-bearing: storage is
 * NEVER read in a `useState` initializer (that reads during render and breaks
 * hydration), and every access is wrapped — a disabled-storage browser degrades to a
 * working editor with no persistence, not to a blank screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResizableSplit } from "@/components/ResizableSplit";
import { SqlEditorPane } from "@/components/query/editor/SqlEditorPane";
import { blankAskLines } from "@/components/query/editor/ask";
import { ResultsPanel } from "@/components/query/ResultsPanel";
import { HistoryRail } from "@/components/query/HistoryRail";
import { Icon } from "@/components/ui/icon";
import { ParamBar } from "@/components/query/ParamBar";
import { type SavedQueryBinding } from "@/components/query/SavedQueryBar";
import {
  TabsBar, newTab, readTabs, writeTabs, type EditorTab,
} from "@/components/query/TabsBar";
import { sqlDiagnostics } from "@/components/query/editor/diagnostics";
import { splitStatements, statementAt, findParams } from "@/lib/query/parserClient";
import { cmDialect, engineFamily, engineWord, explainPrefix, quoteIdentifier, type EngineHint } from "@/lib/query/dialect";
import {
  DEFAULT_FORMAT_PREFS, formatSql, readFormatPrefs, writeFormatPrefs, type FormatPrefs,
} from "@/lib/query/format";
import { OpenQueryDialog } from "@/components/query/OpenQueryDialog";
import { QueryStart } from "@/components/query/QueryStart";
import { resolveParamValue, type ParamDef, type ParamValue } from "@/lib/query/paramDefs";
import {
  runWorkbenchQuery, QueryCancelled, type QueryValidation, type SavedQuery, type TypedQueryResult, type TypedQueryPage, askForSql } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChromeStatus } from "@/components/shell/PageChrome";
import { Freshness } from "@/components/ui/freshness";
import { ShortcutSheet } from "@/components/query/ShortcutSheet";
import { ToolsMenu } from "@/components/catalog/CatalogTools";
import { Chip, MUTED } from "@/components/clarity/kit";
import { type JoinHint } from "@/components/query/editor/intentions";
import { countNoun, formatCount, formatSeconds } from "@/lib/format";
import { editorTools, tableInsert, tableStarter, verdictChip, type ToolSpec } from "@/lib/query/workbench";

type EditorApi = { insert: (text: string) => void; focus: () => void; relint: () => void; cursorToEnd: () => void };

/** Stable identity — a fresh `{}` each render would re-fire every memo below it. */
const EMPTY_PARAMS: Record<string, ParamValue> = {};
const EMPTY_DEFS: Record<string, ParamDef> = {};

/** SE-8A — the row limits the Run menu offers. Bounded above rather than offering "no
 *  limit": the server honours limit<=0 as uncapped, and an uncapped SELECT over a wide
 *  fact table hands the browser a payload nobody asked to render. 50k is where a browser
 *  grid stops being a grid, and a LIMIT clause in the SQL still
 *  overrides everything here. */
const LIMIT_PRESETS = [100, 500, 1000, 5000, 10000, 50000];

/** SE-1's single-draft key, read once when a connection has no tabs yet. Left in place
 *  rather than deleted after reading: a user who downgrades mid-session should still
 *  find their text, and an orphaned key costs a few hundred bytes. */
function readLegacyDraft(connId: string): string {
  try {
    const raw = localStorage.getItem(`aug.sqledit.draft:${connId}`);
    if (!raw) return "";
    const d = JSON.parse(raw) as { v?: number; sql?: string };
    return typeof d?.sql === "string" ? d.sql : "";
  } catch { return ""; }
}

/** What a table's `»` and its card's Preview data do, by the table's schema-qualified name. */
export interface TableActions { insert: (name: string) => void; preview: (name: string) => void }

/** A table's own name, for its tab. */
const bareName = (name: string) => name.split(".").pop() || name;

export function SqlMode({
  connId,
  engine,
  schema,
  joins,
  defaultSchema,
  onInsertReady,
  onSavedBinding,
  onSavableChange,
  onSchedule,
  toolbar,
  sharedTools,
  pendingInsert,
  pendingOpen,
  connectionName,
  saved,
  onOpenSaved,
  startTables,
  tablesLoading,
  onTableActionsReady,
  shown = true,
  onTitle,
  catalogOpen,
  onToggleCatalog,
}: {
  connId: string;
  engine: EngineHint | null;
  /** `{ "table": ["col", …] }` for completion — owned by the workbench. */
  schema?: Record<string, string[]>;
  /** Detected relationships, for the ⌥⏎ "Join …" intention. */
  joins?: JoinHint[];
  defaultSchema?: string;
  /** Hands the workbench's catalog rail a way to insert at this editor's cursor. */
  onInsertReady?: (insert: (text: string) => void) => void;
  /** Published ONCE; reads through refs so a keystroke never re-renders the workbench. */
  onSavedBinding?: (binding: SavedQueryBinding) => void;
  onSavableChange?: (savable: boolean) => void;
  /** SE-4 I — hand this result's SQL to a custom-SQL monitor. */
  onSchedule?: (sql: string) => void;
  /** The workbench's own tools (version history, the share link, the catalog), held in this editor's Tools ▾ beside
   *  its own — one menu, not two. */
  sharedTools?: ToolSpec[];
  /** The connection's name, for the start page's empty lists. */
  connectionName?: string;
  /** The Saved menu's list; undefined while it is read, null when the read failed. */
  saved?: SavedQuery[] | null;
  /** Open a saved query the way the Saved menu does. */
  onOpenSaved?: (q: SavedQuery) => void;
  /** This connection's tables, for the start page's catalog: its schemas, columns, rows and largest tables. */
  startTables?: Array<{ name: string; rowCount?: string | number | null; columns?: unknown[]; isolated?: boolean }>;
  tablesLoading?: boolean;
  /** SE-7 — text to drop into the active tab AFTER a connection switch.
   *
   *  The rail's `»` on a table belonging to another connection has to switch the
   *  workbench first, and switching swaps the whole tab set. Inserting at the cursor
   *  in the same tick therefore wrote into the document that was about to be replaced
   *  — measured: the click switched to theLook and the table name was simply gone.
   *  Routing it through STATE instead of the editor's cursor makes the ordering
   *  React's rather than the DOM's: this effect is declared after the tab-restore
   *  effect, so its `setTabs` updater sees the restored tabs. */
  pendingInsert?: { text: string; nonce: number; /** a table's name, from its `»`: `tableInsert`'s rule */ table?: boolean };
  /** A query handed over from elsewhere (a finding's evidence, a chat answer), opened as a
   *  NEW tab so the tab in progress is never overwritten. Same ordering contract as
   *  `pendingInsert`: the workbench switches the connection in the same render. */
  pendingOpen?: { sql: string; name?: string; nonce: number; /** run it once open: Preview data */ run?: boolean };
  /** A table's `»` and its card's Preview data, handed to the workbench's catalog rail once. */
  onTableActionsReady?: (actions: TableActions) => void;
  /** Controls the WORKBENCH owns (connection, saved state, panel toggle). They ride
   *  the TAB STRIP, right-aligned — the same position Visual mode puts them in, which
   *  is the point: they used to sit top-LEFT in Visual and on the RUN BAR in SQL, so
   *  switching modes moved every shared control to a different corner. */
  toolbar?: React.ReactNode;
  /** Whether this mode is the one on screen — only then does it speak in the shell's status strip. */
  shown?: boolean;
  /** The open tab's name, for the page's title (undefined on the start page). */
  onTitle?: (name: string | undefined) => void;
  /** The workbench's catalog rail — shown, and its toggle in the run row (the mockup's panel toggle). */
  catalogOpen?: boolean;
  onToggleCatalog?: () => void;
}) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const activeIdRef = useRef("");
  activeIdRef.current = activeId;
  // SE-8B — every statement's result from the last run, in order. A single run is a
  // one-element array; "Run all" appends as statements complete, so the pager fills
  // in live. The panel shows `results[resultIdx]`.
  const [results, setResults] = useState<TypedQueryResult[]>([]);
  const [resultIdx, setResultIdx] = useState(0);
  // DE-5d — the bound values the last run used, and a counter that changes per run: a count or a
  // page from the results footer is of the statement that RAN, with the values it ran with.
  const [ranParams, setRanParams] = useState<Record<string, unknown> | undefined>(undefined);
  const [runKey, setRunKey] = useState(0);
  // DE-5f — a result the panel opened from a cell (related rows) becomes the next page of the pager.
  const resultsRef = useRef<TypedQueryResult[]>([]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  const appendResult = useCallback((r: TypedQueryResult) => {
    const next = [...resultsRef.current, r];
    resultsRef.current = next;
    setResults(next);
    setResultIdx(next.length - 1);
  }, []);
  const appendRows = useCallback((idx: number, page: TypedQueryPage) => {
    setResults(prev => prev.map((r, i) => i !== idx ? r : {
      ...r,
      rows: [...r.rows, ...page.rows],
      row_count: r.row_count + page.row_count,
      truncated: page.truncated,
      cut_by: page.cut_by ?? null,
      // The page's caveats join the run's, each once — the ORDER BY note is said once, not per page.
      caveats: Array.from(new Set([...(r.caveats ?? []), ...(page.caveats ?? [])])),
    }));
  }, []);
  const [maximizeResults, setMaximizeResults] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<QueryValidation | null>(null);
  // SE-8E — ONE right rail, two occupants: history, or the assistant. Mutually
  // exclusive by construction (they share the space), sharing one persisted width.
  const [rail, setRail] = useState<"" | "history">("");
  const [historyKey, setHistoryKey] = useState(0);
  // SE-3 F — the in-flight run's abort handle and when it started.
  const abort = useRef<AbortController | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  // A finished Run all, as a chip: how many statements ran, each one's rows on hover.
  const [runAllSummary, setRunAllSummary] = useState<{ count: number; detail: string } | null>(null);
  // SE-5a — the statement that produced the current error. NOT `sqlText`: a run can be
  // a selection, or one statement of several, and repairing the whole document would
  // hand the model a different query from the one that failed.
  const [failedSql, setFailedSql] = useState("");
  const [statementCount, setStatementCount] = useState(1);
  // The editor's foot line: where the cursor is, and how many problems the linter holds.
  const [edStatus, setEdStatus] = useState({ line: 1, col: 1, problems: 0 });
  // Bound to THIS connection's engine. Memoised because it is a prop on the editor:
  // a new function each render would re-run the editor's reconfigure effect on every
  // keystroke of the parent.
  const quoteForEngine = useCallback((name: string) => quoteIdentifier(name, engine), [engine]);
  const cursor = useRef(0);
  const selection = useRef<{ from: number; to: number } | null>(null);
  const editorApi = useRef<EditorApi | null>(null);
  // A tab opened holding a statement takes the cursor at its end, where the next word goes. The editor keeps the cursor
  // where it was when a tab's text replaces its document, so a statement opened into an empty editor left it at 0, and a
  // second » put its name in front of SELECT (seen live, 2026-11-09). Set where a tab opens; read once it is the open one.
  const openedAt = useRef("");
  const opening = (t: EditorTab) => { if (t.sql.trim()) openedAt.current = t.id; return t; };
  const relint = useRef<(() => void) | null>(null);

  const active = tabs.find(t => t.id === activeId) ?? null;
  const sqlText = active?.sql ?? "";
  // What a run reads: the text with every `/ask` request blanked — a request is never sent to the warehouse as SQL.
  const runnable = useMemo(() => blankAskLines(sqlText), [sqlText]);

  // SE-8A — the run settings live on the TAB (see EditorTab), read with defaults here.
  const limit = active?.limit ?? 500;
  const runAllPref = !!active?.runAll;
  const [showRunMenu, setShowRunMenu] = useState(false);

  // SE-8F — "+ → Open existing", Format's preferences and the keyboard sheet: each opened from Tools ▾ now.
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Storage read in an EFFECT, never a useState initializer (hydration rule).
  const [fmtPrefs, setFmtPrefs] = useState<FormatPrefs>(DEFAULT_FORMAT_PREFS);
  useEffect(() => { setFmtPrefs(readFormatPrefs()); }, []);
  const patchFmt = useCallback((patch: Partial<FormatPrefs>) => {
    setFmtPrefs(prev => {
      const next = { ...prev, ...patch };
      writeFormatPrefs(next);
      return next;
    });
  }, []);

  // SE-4 H — the `:name` parameters of the CURRENT document, and this tab's values.
  const paramNames = useMemo(() => findParams(sqlText), [sqlText]);

  // The parser runs in a worker, so the count arrives asynchronously; it only drives
  // whether a button is offered, never what runs.
  useEffect(() => {
    let alive = true;
    void splitStatements(runnable).then(r => {
      if (alive) setStatementCount(r.filter(x => x.text.trim()).length || 1);
    }).catch(() => { if (alive) setStatementCount(1); });
    return () => { alive = false; };
  }, [runnable]);
  const paramValues = active?.params ?? EMPTY_PARAMS;
  const paramDefs = active?.paramDefs ?? EMPTY_DEFS;
  // Only the names still present in the SQL, so a value left behind by a deleted
  // parameter is not silently sent (the server would reject an unknown bind name).
  // SE-8C — each value resolves through its widget def: defaults fill in, number
  // widgets bind numbers, ⚡ date tokens become the date they mean today, and a
  // multiselect binds its list.
  const boundParams = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const n of paramNames) {
      const v = resolveParamValue(paramDefs[n], paramValues[n] ?? paramDefs[n]?.default);
      if (v !== undefined) out[n] = v;
    }
    return out;
  }, [paramNames, paramValues, paramDefs]);

  // Built ONCE and read through getters, so a connection or dialect change reaches the
  // linter without rebuilding the editor (which would drop undo history and cursor).
  const connRef = useRef(connId);
  const engineRef = useRef(engine);
  const paramsRef = useRef<Record<string, unknown>>(EMPTY_PARAMS);
  connRef.current = connId;
  engineRef.current = engine;
  paramsRef.current = boundParams;
  // Params changed but the document did not, so nothing would re-trigger the linter
  // on its own. `relint` is published by the editor pane for exactly this.
  useEffect(() => { relint.current?.(); }, [boundParams]);

  const diagnostics = useMemo(
    () => sqlDiagnostics({
      getConn: () => connRef.current,
      getDialect: () => engineFamily(engineRef.current),
      getParams: () => paramsRef.current,
      onVerdict: setVerdict,
    }),
    [],
  );

  // Tab restore — in an EFFECT, never a useState initializer (hydration rule).
  // Keyed on connId so switching connections swaps tab sets rather than merging them.
  useEffect(() => {
    if (!connId) { setTabs([]); setActiveId(""); return; }
    const stored = readTabs(connId);
    const draft = stored ? "" : readLegacyDraft(connId);
    if (stored?.tabs.some(t => (t.sql ?? "").trim())) {
      setTabs(stored.tabs);
      setActiveId(stored.activeId && stored.tabs.some(t => t.id === stored.activeId)
        ? stored.activeId : stored.tabs[0].id);
    } else if (draft.trim()) {
      // One-time migration: SE-1 stored a single draft per connection; SE-2 stores
      // tabs. Without this the editor would come up blank for anyone mid-query when
      // the tabs landed — the work is still on disk, just under the old key, which is
      // the worst kind of data loss because it looks like deletion. Only when there is
      // NO tab set at all: a set closed down to none is the person's own decision, and
      // the old key (left in place, below) must not bring a tab back over it.
      const t = { ...newTab(), sql: draft };
      setTabs([t]);
      setActiveId(t.id);
    } else {
      // The start page: no tab set yet, the last tab closed, or tabs none of which holds any SQL.
      setTabs([]);
      setActiveId("");
    }
    setResults([]);
    setResultIdx(0);
    setError("");
  }, [connId]);

  // Declared AFTER the tab restore above, deliberately: when a connection switch and an
  // insert arrive together, both updaters queue in this order and the second one is
  // handed the tabs the first restored.
  useEffect(() => {
    const text = pendingInsert?.text;
    if (!text) return;
    // A table's `»` (`pendingInsert.table`): a statement that reads it into an empty tab, the name into one holding SQL.
    const table = !!pendingInsert?.table;
    const fresh = table ? tableStarter(text) : text;
    const opened = opening({ ...newTab(table ? bareName(text) : undefined), sql: fresh });
    setTabs(prev => {
      // No tab open on this connection (its start page): the text opens one, which the effect below makes the open tab.
      if (!prev.length) return [opened];
      // ⚠️ `activeIdRef` still holds the PREVIOUS connection's active tab at this
      // point — the restore effect above has queued `setActiveId` but the re-render
      // has not happened, so the ref is one connection behind. Matching on it found
      // nothing and the insert vanished silently, which is the same symptom the
      // cursor insert had. Fall back to the first restored tab when the remembered id
      // is not in this set.
      const id = prev.some(t => t.id === activeIdRef.current) ? activeIdRef.current : prev[0].id;
      return prev.map(t => t.id === id
        ? { ...t, sql: t.sql.trim() ? `${t.sql.replace(/\s+$/, "")}\n${text}` : fresh }
        : t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInsert?.nonce]);

  // Declared after the tab restore for the same reason as the insert above: the new tab
  // is appended to the tabs the restore just installed for this connection.
  useEffect(() => {
    const sql = pendingOpen?.sql;
    if (!sql?.trim()) return;
    const t = opening({ ...newTab(pendingOpen?.name), sql });
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
    if (pendingOpen?.run) setPreviewRun({ sql });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen?.nonce]);

  // The editor has put the opened tab's text in by now (a child's effects run before this one): the cursor to its end.
  useEffect(() => {
    if (!activeId || openedAt.current !== activeId) return;
    openedAt.current = "";
    editorApi.current?.cursorToEnd();
  }, [activeId]);

  // While any tab is open, the open tab is one of them: an insert that lands on a connection with none opens the first.
  useEffect(() => {
    if (tabs.length && !tabs.some(t => t.id === activeId)) setActiveId(tabs[tabs.length - 1].id);
  }, [tabs, activeId]);

  // Debounced persist — the editor fires onChange per keystroke. An EMPTY set is never written from here (on a mount or
  // a connection switch the state holds no tabs for a moment); closing the last tab writes it, at once (`closeTab`).
  useEffect(() => {
    if (!connId || !tabs.length) return;
    const t = setTimeout(() => writeTabs(connId, tabs, activeId), 400);
    return () => clearTimeout(t);
  }, [connId, tabs, activeId]);

  const patchActive = useCallback((patch: Partial<EditorTab>) => {
    setTabs(prev => prev.map(t =>
      t.id === activeId ? { ...t, ...patch, touched: Date.now() } : t));
  }, [activeId]);

  const setSql = useCallback((sql: string) => patchActive({ sql }), [patchActive]);

  const openInNewTab = useCallback((
    sql: string, name = "Query", paramDefs?: Record<string, ParamDef>,
  ) => {
    const t = opening({ ...newTab(name), sql, ...(paramDefs && Object.keys(paramDefs).length ? { paramDefs } : {}) });
    setTabs(prev => [...prev, t]);
    setActiveId(t.id);
  }, []);

  /** Close a tab; closing the open one opens the strip's last remaining tab. Closing the LAST
   *  tab is the person deciding to have none: the empty set is written before anything else (the debounced write skips
   *  an empty set, so without this the closed tab came back on the next visit), any run in flight is stopped, and the
   *  result it showed goes with the tab — the start page is a fresh start. */
  const closeTab = useCallback((id: string) => {
    const next = tabs.filter(t => t.id !== id);
    if (next.length) {
      setTabs(next);
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return;
    }
    if (connId) writeTabs(connId, [], "");
    abort.current?.abort();
    setTabs([]);
    setActiveId("");
    setResults([]);
    setResultIdx(0);
    setError("");
    setFailedSql("");
    setRunAllSummary(null);
    setMaximizeResults(false);
  }, [tabs, activeId, connId]);

  // The catalog rail's » puts a name at the cursor — or, with no tab open, opens a tab holding it: the editor is hidden
  // under the start page then, and text put into it would land in no tab. Published once; reads through the ref.
  const insertRef = useRef<(text: string) => void>(() => {});
  insertRef.current = text => { if (tabs.length) editorApi.current?.insert(text); else openInNewTab(text); };
  const insertText = useCallback((text: string) => insertRef.current(text), []);

  // A table's `»` (the user, 2026-11-09): an empty editor gets a statement that reads the table, one holding SQL gets
  // its schema-qualified name at the cursor, and with no tab open a tab opens holding the statement. Its card's Preview
  // data opens the statement in a new tab and runs it there, once that tab is the open one.
  const [previewRun, setPreviewRun] = useState<{ sql: string } | null>(null);
  const tableRef = useRef<TableActions>({ insert: () => {}, preview: () => {} });
  tableRef.current = {
    insert: name => {
      if (!tabs.length) openInNewTab(tableStarter(name), bareName(name));
      else editorApi.current?.insert(tableInsert(name, sqlText));
    },
    preview: name => {
      const t = opening({ ...newTab(bareName(name)), sql: tableStarter(name) });
      setTabs(prev => [...prev, t]);
      setActiveId(t.id);
      setPreviewRun({ sql: t.sql });
    },
  };
  useEffect(() => {
    onTableActionsReady?.({ insert: name => tableRef.current.insert(name), preview: name => tableRef.current.preview(name) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** What ⌘↵ would run: the selection if there is one, else the statement under the
   *  caret, else the buffer. Extracted because Explain needs exactly the same answer —
   *  explaining a different statement from the one Run would execute is worse than no
   *  explain at all. */
  const statementToRun = useCallback(async (): Promise<string> => {
    const sel = selection.current;
    const text = (sel && sel.to > sel.from)
      ? runnable.slice(sel.from, sel.to)
      : statementAt(await splitStatements(runnable), cursor.current)?.text ?? runnable;
    return text.trim().replace(/;\s*$/, "");
  }, [runnable]);

  const run = useCallback(async (override?: string) => {
    if (!connId || running) return;
    const toRun = override ?? await statementToRun();
    if (!toRun) return;

    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    setError("");
    setRunAllSummary(null);
    setFailedSql("");
    setStartedAt(Date.now());
    try {
      const res = await runWorkbenchQuery(connId, toRun, limit, boundParams, ac.signal);
      setResults([res]);
      setResultIdx(0);
      setRanParams(boundParams);
      setRunKey(k => k + 1);
      if (res.error) setFailedSql(toRun);
      // A query that RAN and reported an error is a value, not an exception — the
      // panel shows the engine's own message rather than a generic failure.
      setError(res.error ?? "");
      patchActive({ status: res.error ? "error" : "ok" });
    } catch (e) {
      setResults([]);
      // A cancellation is the user's own decision arriving back at them. Reporting it
      // as a failure would make the button they just pressed look like a malfunction,
      // so the panel returns to its resting state and says nothing.
      if (e instanceof QueryCancelled) {
        patchActive({ status: undefined });
      } else {
        setError(e instanceof Error ? e.message : "Query failed");
        setFailedSql(toRun);
        patchActive({ status: "error" });
      }
    } finally {
      abort.current = null;
      setRunning(false);
      setStartedAt(0);
      // The rail reads the audit log this run just wrote to.
      setHistoryKey(k => k + 1);
    }
  }, [connId, running, statementToRun, patchActive, boundParams, limit]);

  /** SE-7 — Explain plan. DataGrip puts this beside Run because the two questions —
   *  "what does it return" and "what will it cost" — are asked of the same statement a
   *  minute apart. It goes through the SAME run path, so the plan lands in the same
   *  grid with the same cancel button, and it explains exactly what Run would execute.
   *
   *  `EXPLAIN` is a metadata statement: the workbench label is what lets it past the
   *  SELECT-only rule (`_METADATA_LABELS`), and the result wrap is skipped for it —
   *  a plan cannot be a subquery source. Both were fixed in SE-3 G. */
  const explainWith = explainPrefix(engine);
  const explain = useCallback(async () => {
    const stmt = await statementToRun();
    if (!stmt || !explainWith) return;
    if (/^\s*explain\b/i.test(stmt)) { void run(stmt); return; }
    void run(`${explainWith} ${stmt}`);
  }, [statementToRun, run, explainWith]);

  /** SE-4 H — run every statement in the buffer, in order, keeping the LAST result.
   *
   *  Sequential and stop-on-error, not parallel: statements in one buffer are written
   *  to be read top-down and often depend on each other, and firing them together
   *  would make the order of a temp table and its use a race. Stopping on the first
   *  failure is the same reasoning — continuing past a broken statement produces
   *  results whose meaning depends on a failure the user has not seen yet.
   *
   *  The roadmap asks for one results TAB per statement (LRU 5). That is a results-
   *  surface change; this ships the execution half and shows the last result plus a
   *  per-statement summary, so "Run all" is usable without pre-empting the tabbed
   *  results design that PR I revisits. */
  const runAll = useCallback(async () => {
    if (!connId || running) return;
    const ranges = await splitStatements(runnable);
    const statements = ranges
      .map(r => r.text.trim().replace(/;\s*$/, ""))
      .filter(Boolean);
    if (statements.length < 2) { void run(); return; }

    const ac = new AbortController();
    abort.current = ac;
    setRunning(true);
    setError("");
    setFailedSql("");
    setStartedAt(Date.now());
    // SE-8B — the pager fills as statements land, so it starts empty.
    setResults([]);
    setResultIdx(0);
    setRanParams(boundParams);
    setRunKey(k => k + 1);
    const done: string[] = [];
    // Which statement is in flight — so a failure hands Quick Fix THAT statement rather
    // than the whole multi-statement document, which is a different query.
    let inFlight = "";
    try {
      for (const [i, stmt] of statements.entries()) {
        inFlight = stmt;
        const res = await runWorkbenchQuery(connId, stmt, limit, boundParams, ac.signal);
        // SE-8B — EVERY statement's rows are kept now (the roadmap's per-statement
        // results), and the pager follows the one in flight.
        setResults(prev => [...prev, res]);
        setResultIdx(i);
        if (res.error) {
          setError(`Statement ${i + 1} of ${statements.length} failed: ${res.error}`);
          setFailedSql(stmt);
          patchActive({ status: "error" });
          return;
        }
        done.push(`${i + 1}: ${res.row_count} ${res.row_count === 1 ? "row" : "rows"}`);
        setError("");
      }
      setRunAllSummary({ count: statements.length, detail: done.join(" · ") });
      patchActive({ status: "ok" });
    } catch (e) {
      if (e instanceof QueryCancelled) {
        setError(`Cancelled after ${done.length} of ${statements.length} statements.`);
        patchActive({ status: undefined });
      } else {
        setError(e instanceof Error ? e.message : "Query failed");
        setFailedSql(inFlight);
        patchActive({ status: "error" });
      }
    } finally {
      abort.current = null;
      setRunning(false);
      setStartedAt(0);
      setHistoryKey(k => k + 1);
    }
  }, [connId, running, runnable, boundParams, patchActive, run, limit]);

  /** Abort the in-flight fetch. Closing the socket is what reaches the server, which
   *  interrupts the engine — so this stops the QUERY, not just the waiting. */
  const cancel = useCallback(() => abort.current?.abort(), []);

  // The elapsed ticker. It exists because a long query with no clock is
  // indistinguishable from a hung one, and that ambiguity is what makes people
  // reload the page. Only ticks while a run is in flight, and only past a second —
  // a counter that flashes "0s" on every fast query is noise, not information.
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!startedAt) { setElapsed(""); return; }
    const tick = () => {
      const s = (Date.now() - startedAt) / 1000;
      setElapsed(s < 1 ? "" : s < 60 ? `${s.toFixed(0)}s` : `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  // SE-8A — what ⌘↵ and the Run button DO: the tab's "Run all statements" preference
  // promotes them to the whole buffer when there is more than one statement. The
  // single-statement verb survives as ⌘⇧↵ — a preference must not delete a verb.
  const runPreferred = useCallback(() => {
    if (runAllPref && statementCount > 1) void runAll(); else void run();
  }, [runAllPref, statementCount, runAll, run]);

  // The run command must see the CURRENT text and cursor. `run` is rebuilt when those
  // change, and the editor calls through this ref, so ⌘↵ never fires a stale closure.
  const runRef = useRef(runPreferred);
  runRef.current = runPreferred;
  const runStatementRef = useRef(run);
  runStatementRef.current = run;

  // Preview data: the tab, its being the open one and this run are set in one batch, so the run here is the one built
  // with the new tab open, and its result and the tab's mark land on that tab.
  useEffect(() => {
    if (!previewRun) return;
    setPreviewRun(null);
    void runStatementRef.current(previewRun.sql);
  }, [previewRun]);

  // ── The saved-query bar's binding ───────────────────────────────────────────
  //
  // A SQL-mode save writes `sql` with an EMPTY spec. That is not a lesser save: this
  // mode's query IS its text, and inventing a builder spec for it would claim the
  // composer could reproduce a statement it may not be able to decompile. The empty
  // spec is what routes the query back here when it is loaded.
  const captureRef = useRef<() => {
    sql: string; spec: Record<string, unknown>; param_defs?: Record<string, unknown>;
  } | null>(null);
  const loadRef = useRef<(q: {
    sql: string; name: string; param_defs?: Record<string, unknown>;
  }) => void>(() => {});
  const nameRef = useRef<() => string>(() => "Untitled query");
  // SE-8C — widget definitions save WITH the query and come back with it: a dropdown
  // someone configured is part of what "this saved query" means.
  captureRef.current = () => (sqlText.trim()
    ? { sql: sqlText, spec: {}, param_defs: active?.paramDefs ?? {} }
    : null);
  loadRef.current = q =>
    openInNewTab(q.sql, q.name, (q.param_defs ?? {}) as Record<string, ParamDef>);
  // A tab the user renamed is a name they chose — better than anything derived. Only
  // an untouched tab falls back to reading the query's own FROM clause.
  nameRef.current = () => {
    if (active && active.name && active.name !== "Query") return active.name;
    const m = /\bfrom\s+([A-Za-z_][\w.$"]*)/i.exec(sqlText);
    return m ? `${m[1].replace(/"/g, "")} query` : "Untitled query";
  };

  const savedBinding = useMemo<SavedQueryBinding>(() => ({
    capture: () => captureRef.current?.() ?? null,
    load: q => loadRef.current(q),
    suggestName: () => nameRef.current(),
  }), []);
  useEffect(() => { onSavedBinding?.(savedBinding); }, [onSavedBinding, savedBinding]);

  const savable = !!sqlText.trim();
  useEffect(() => { onSavableChange?.(savable); }, [savable, onSavableChange]);

  // Tools ▾ — every action that left the toolbar, then the workbench's own. Explain and Run all are offered only
  // when they can run: a connection, no run in flight (Run is Cancel then), and — for Explain — an engine with a plan
  // statement (`explainPrefix`; BigQuery has none, and an unconditional button returned a 400 there).
  const tools: ToolSpec[] = [
    ...editorTools({
      connected: !!connId && !running,
      explainWith: explainWith || null,
      statementCount,
      runAllPref,
      hasSql: !!sqlText.trim(),
      historyOpen: rail === "history",
      act: {
        explain: () => void explain(),
        runAll: () => void runAll(),
        format: () => setSql(formatSql(sqlText, engine, fmtPrefs)),
        formatPrefs: () => setShowFormatMenu(true),
        openExisting: () => setShowOpenDialog(true),
        toggleHistory: () => setRail(r => r === "history" ? "" : "history"),
        shortcuts: () => setShowShortcuts(true),
      },
    }),
    ...(sharedTools ?? []),
  ];
  const verdictView = verdict ? verdictChip(verdict) : null;

  // The page's title is the open tab's name (2026-11-10, the SQL Editor mockup); the start page has none.
  const titleName = active?.name;
  useEffect(() => { onTitle?.(titleName); }, [onTitle, titleName]);
  // The run, said in the shell's status strip: what happened and how long it took, how much came back, whether it was
  // read live or served from the result cache — and its receipt, one click from the signed record. The read time is
  // when the result reached this page; a cached result's measured time is not kept, so it says so.
  const [readAt, setReadAt] = useState<string | undefined>(undefined);
  useEffect(() => { setReadAt(results.length ? new Date().toISOString() : undefined); }, [results.length, runKey]);
  const shownResult = results[resultIdx] ?? null;
  const runStatus = !shown || tabs.length === 0 ? null : running ? (
    <ChromeStatus><span>Running{elapsed ? ` · ${elapsed}` : ""}</span></ChromeStatus>
  ) : shownResult ? (
    <ChromeStatus>
      <span>
        {shownResult.error ? "Failed" : "Succeeded"} · {formatSeconds(shownResult.duration_ms)} ·{" "}
        {countNoun(shownResult.row_count, "row")}{shownResult.truncated ? " · cut" : ""}
        {results.length > 1 ? ` · statement ${formatCount(resultIdx + 1)} of ${formatCount(results.length)}` : ""}
      </span>
      {!shownResult.error && (
        <span>
          <Freshness state={shownResult.cached ? "cached" : "live"} at={shownResult.cached ? undefined : readAt}
            receipt={shownResult.receipt_id ?? undefined}
            onReceipt={id => window.open(`/receipt/${encodeURIComponent(id)}`, "_blank", "noreferrer")} />
        </span>
      )}
    </ChromeStatus>
  ) : error ? (
    <ChromeStatus><span>Failed</span></ChromeStatus>
  ) : null;

  // With no tab open the editor area is the start page; the toolbar, the editor and its results stay mounted beneath
  // it, hidden, so the first tab opened lands in the same editor (the remount trap this file already paid for).
  const noTabs = tabs.length === 0;
  // The results pane opens on the first run — a run in flight, a result, an error — and before that it is one line.
  const outputOpen = running || results.length > 0 || !!error;

  // The editor column — tabs, then the start page or the toolbar and the editor-over-results split.
  const editorPane = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        {runStatus}
        <TabsBar
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={() => openInNewTab("")}
          onClose={closeTab}
          onRename={(id, name) => setTabs(prev => prev.map(t => t.id === id ? { ...t, name } : t))}
          trailing={toolbar}
          onOpenExisting={() => setShowOpenDialog(true)}
          startLabel="New tab"
        />

        <OpenQueryDialog
          connId={connId}
          open={showOpenDialog}
          onClose={() => setShowOpenDialog(false)}
          onOpen={(sql, name) => openInNewTab(sql, name)}
        />

        {noTabs && (
          <QueryStart
            connId={connId}
            connectionName={connectionName}
            refreshKey={historyKey}
            saved={saved}
            onNewQuery={() => openInNewTab("")}
            onOpenRun={sql => openInNewTab(sql, "History")}
            onOpenSaved={q => onOpenSaved?.(q)}
            tables={startTables}
            tablesLoading={tablesLoading}
            joins={joins}
            onOpenTable={name => openInNewTab(tableStarter(name), bareName(name))}
          />
        )}

        <div data-testid="sql-editor-column"
          style={{ flex: 1, minHeight: 0, display: noTabs ? "none" : "flex", flexDirection: "column" }}>
        {/* The toolbar: Run (its limit on the label, its settings on the caret) and the schema it resolves against;
            the guards' verdict and Ask at the right, then Tools ▾ — a few primary actions and one menu. */}
        <div
          data-testid="sql-toolbar"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderBottom: "1px solid var(--b0)", flexShrink: 0,
          }}
        >
          {/* Run and Cancel side by side, as the mockup draws them (the user, 2026-11-10: "both always" — this
              reverses SE-3's one control in two states). Cancel is greyed until a statement runs, then stops it —
              the engine is interrupted, not just the wait — with the time it has run on it. */}
          {(
            // SE-8A — the row limit is said before the run, not after: on the mockup's "Limit" control beside Run
            // (2026-11-10), which opens the run settings; both persist on the tab.
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Button variant="default" size="xs" className="aug-fs-ui" data-testid="sql-run"
                title={runAllPref && statementCount > 1
                  ? `Run all ${statementCount} statements in order (⌘↵) — ⌘⇧↵ runs just the statement under the cursor`
                  : "Runs the selection, or the statement under the cursor (⌘↵)"}
                onClick={() => runPreferred()} disabled={!connId || running}>
                <Icon name="run" size={12} /> {running ? "Running…" : "Run"} <kbd className="aug-kbd">⌘↵</kbd>
              </Button>
              <Button variant="outline" size="xs" className="aug-fs-ui"
                title="Run settings — the row limit, and whether ⌘↵ runs every statement"
                aria-label="Run settings"
                onClick={() => setShowRunMenu(v => !v)} disabled={!connId || running}
                data-testid="sql-run-menu">
                <span style={{ color: "var(--t3)" }}>Limit</span> {formatCount(limit)}
                {runAllPref ? <span style={{ color: "var(--t3)" }}>· all statements</span> : null}
                <Icon name="chevd" size={12} />
              </Button>
              <Button variant="outline" size="xs" className="aug-fs-ui" data-testid="sql-cancel"
                disabled={!running}
                title={running ? "Stop this query — the engine is interrupted, not just the wait" : "Nothing is running"}
                onClick={cancel}>
                <Icon name="stop" size={12} /> Cancel
                {running && elapsed && <span style={{ marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>{elapsed}</span>}
              </Button>
              {showRunMenu && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowRunMenu(false)} />
                  <div className="aug-fs-ui" style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 41, marginTop: 4,
                    minWidth: 230, padding: 5, background: "var(--bg-2)",
                    border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
                  }}>
                    <div className="aug-label" style={{ padding: "3px 7px" }}>Row limit</div>
                    {LIMIT_PRESETS.map(n => (
                      <Button key={n} variant="plain" size="xs" className="aug-fs-ui"
                        style={{ width: "100%", justifyContent: "flex-start", gap: 6 }}
                        onClick={() => { patchActive({ limit: n }); setShowRunMenu(false); }}>
                        <span style={{ width: 14, flexShrink: 0 }}>
                          {n === limit && <Icon name="check" size={12} />}
                        </span>
                        {formatCount(n)}{n === 500 ? " — default" : n === 50000 ? " — max" : ""}
                      </Button>
                    ))}
                    <div style={{ borderTop: "1px solid var(--b1)", margin: "5px 0" }} />
                    <Button variant="plain" size="xs" className="aug-fs-ui"
                      style={{ width: "100%", justifyContent: "flex-start", gap: 6 }}
                      title="When on, Run and ⌘↵ run every statement in the tab, in order, stopping at the first error"
                      onClick={() => patchActive({ runAll: !runAllPref })}>
                      <span style={{ width: 14, flexShrink: 0 }}>
                        {runAllPref && <Icon name="check" size={12} />}
                      </span>
                      Run all statements
                    </Button>
                    <div className="aug-fs-xs" style={{ padding: "3px 7px", color: "var(--t3)" }}>
                      ⌘⇧↵ always runs just the statement under the cursor
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {runAllSummary && !error && (
            <Chip testId="sql-run-all-summary" title={runAllSummary.detail}>
              {formatCount(runAllSummary.count)} statements ran
            </Chip>
          )}
          {/* Format, on the row as the mockup draws it (it stays in Tools ▾ too, with its preferences). */}
          <Button variant="outline" size="xs" className="aug-fs-ui" data-testid="sql-format"
            disabled={!sqlText.trim()} title="Format the SQL (⌘⇧F) — its preferences are in Tools ▾"
            onClick={() => setSql(formatSql(sqlText, engine, fmtPrefs))}>
            Format
          </Button>
          <div style={{ flex: 1, minWidth: 0 }} />
          {/* The guard battery's own verdict, as a chip: green only when every guard ran and passed. */}
          {verdictView && (
            <Chip tone={verdictView.tone} title={verdictView.title} testId="sql-verdict">{verdictView.text}</Chip>
          )}
          {/* The two side panes, as the mockup's toggles: the catalog at the left, the recent runs at the right. */}
          {onToggleCatalog && (
            <Button variant={catalogOpen ? "secondary" : "ghost"} size="icon-xs" aria-pressed={!!catalogOpen}
              aria-label={catalogOpen ? "Hide the catalog" : "Show the catalog"} title={catalogOpen ? "Hide the catalog" : "Show the catalog"}
              data-testid="sql-toggle-catalog" onClick={onToggleCatalog}>
              <Icon name="catalog" size={13} />
            </Button>
          )}
          <Button variant={rail === "history" ? "secondary" : "ghost"} size="icon-xs" aria-pressed={rail === "history"}
            aria-label={rail === "history" ? "Hide recent runs" : "Show recent runs"}
            title={rail === "history" ? "Hide recent runs" : "Show recent runs"}
            data-testid="sql-toggle-history" onClick={() => setRail(r => r === "history" ? "" : "history")}>
            <Icon name="history" size={13} />
          </Button>
          {/* Everything else this editor does, in ONE menu (CLARITY: "Tools in one menu", not a row of icons):
              Explain, Run all, Format and its preferences, Open, Recent runs, the keys — and the workbench's
              own (version history, the share link, the catalog). Format's preferences open beneath it. */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <ToolsMenu items={tools} testId="sql-tools" />
            {showFormatMenu && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowFormatMenu(false)} />
                <div data-testid="sql-format-menu" className="aug-fs-ui" style={{
                  position: "absolute", top: "100%", right: 0, zIndex: 41, marginTop: 4,
                  minWidth: 250, padding: "5px 7px 7px", background: "var(--bg-2)",
                  border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
                }}>
                  <div className="aug-label" style={{ padding: "3px 0" }}>Formatting</div>
                  {([
                    ["Keywords", "keywordCase", [["upper", "UPPER"], ["lower", "lower"], ["preserve", "as written"]]],
                    ["Functions", "functionCase", [["upper", "UPPER"], ["lower", "lower"], ["preserve", "as written"]]],
                  ] as const).map(([label, field, opts]) => (
                    <div key={field} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
                      <span style={{ color: "var(--t3)", width: 74, flexShrink: 0 }}>{label}</span>
                      {opts.map(([v, name]) => (
                        <Button key={v} size="xs" className="aug-fs-ui"
                          variant={fmtPrefs[field] === v ? "secondary" : "ghost"}
                          onClick={() => patchFmt({ [field]: v })}>
                          {name}
                        </Button>
                      ))}
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
                    <span style={{ color: "var(--t3)", width: 74, flexShrink: 0 }}>Indent</span>
                    {([2, 4] as const).map(w => (
                      <Button key={w} size="xs" className="aug-fs-ui"
                        variant={fmtPrefs.tabWidth === w ? "secondary" : "ghost"}
                        onClick={() => patchFmt({ tabWidth: w })}>
                        {w} spaces
                      </Button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
                    <span style={{ color: "var(--t3)", width: 74, flexShrink: 0 }}>Line width</span>
                    {([80, 100, 120] as const).map(w => (
                      <Button key={w} size="xs" className="aug-fs-ui" data-testid={`sql-format-width-${w}`}
                        variant={fmtPrefs.lineWidth === w ? "secondary" : "ghost"}
                        onClick={() => patchFmt({ lineWidth: w })}>
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          {/* SE-6 — the keys, listed: opened from Tools ▾, or by Esc then H. */}
          <ShortcutSheet open={showShortcuts} onOpenChange={setShowShortcuts} />
        </div>

        <ResizableSplit
          storageKey="sqlmode"
          direction="vertical"
          initial={260}
          min={120}
          max={720}
          // SE-8B — the results pane's ⤢: the editor collapses, the results take the
          // column, and the editor keeps its document because `collapsed` hides
          // rather than unmounts (the remount trap this file already paid for).
          // Before the first run the RESULTS are what is folded away — the editor takes
          // the column — and a ⤢ from an earlier run never hides an editor with no
          // results to show instead.
          collapsed={maximizeResults && outputOpen}
          soloFirst={!outputOpen}
          style={{ flex: 1, minHeight: 0 }}
          left={
            // SE-8C — the parameter widgets sit BETWEEN editor and results: fill
            // these, then look below, in reading order.
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <SqlEditorPane
                value={sqlText}
                onChange={setSql}
                onRun={() => runRef.current()}
                onRunStatement={() => void runStatementRef.current()}
                onFormat={(text) => formatSql(text, engineRef.current)}
                onCursor={(pos, sel) => { cursor.current = pos; selection.current = sel; }}
                onReady={api => {
                  editorApi.current = api;
                  relint.current = api.relint;
                  onInsertReady?.(insertText);
                }}
                schema={schema}
                defaultSchema={defaultSchema}
                dialect={cmDialect(engine)}
                quote={quoteForEngine}
                joins={joins}
                diagnostics={diagnostics}
                onAsk={connId ? (request, context, signal) =>
                  askForSql(connId, request, { sql: context, schema: defaultSchema, signal }) : undefined}
                onStatus={setEdStatus}
              />
              {/* The editor's foot (the mockup's): where the cursor is, the dialect, how many statements, what ⌘↵ runs,
                  and the linter's problems — said, so "No problems" is a reading, not an absence. */}
              <div data-testid="sql-editor-foot" className="aug-editor-foot aug-fs-xs">
                <span>Ln {formatCount(edStatus.line)}, Col {formatCount(edStatus.col)}</span>
                {/* Where ⌘↵ runs, said here while the catalog (where it is picked) may be closed: the connection, its
                    default schema, and the dialect when the connection's name does not already say it. */}
                <span data-testid="sql-runs-on" title="Where ⌘↵ runs — pick the connection at the catalog's head, the default schema on its row">
                  {connectionName ?? "No connection"}{defaultSchema ? ` · ${defaultSchema}` : ""}
                </span>
                {engineWord(engine) !== connectionName && <span>{engineWord(engine)}</span>}
                <span>{statementCount === 1 ? "One statement" : `${formatCount(statementCount)} statements`}</span>
                <span>{runAllPref && statementCount > 1
                  ? `⌘↵ runs all ${formatCount(statementCount)} in order · ⌘⇧↵ the one at the cursor`
                  : "⌘↵ runs the statement at the cursor, or the selection"}</span>
                <span style={{ marginLeft: "auto", color: edStatus.problems ? "var(--amb4)" : undefined }}>
                  {edStatus.problems ? countNoun(edStatus.problems, "problem") : "No problems"}
                </span>
              </div>
              <ParamBar
                connId={connId}
                names={paramNames}
                values={paramValues}
                defs={paramDefs}
                onChange={next => patchActive({ params: next })}
                onDefsChange={next => patchActive({ paramDefs: next })}
              />
            </div>
          }
          right={
            <ResultsPanel
              results={results}
              resultIdx={resultIdx}
              onResultIdx={setResultIdx}
              error={error}
              running={running}
              connId={connId}
              onSchedule={onSchedule}
              maximized={maximizeResults}
              onToggleMaximize={() => setMaximizeResults(v => !v)}
              params={ranParams}
              pageSize={limit}
              runKey={runKey}
              readAt={readAt}
              verdict={verdictView ? { text: verdictView.text, title: verdictView.title } : null}
              onAppendRows={appendRows}
              onAppendResult={appendResult}
              failedSql={failedSql}
              onApplyFix={(fixed) => {
                // Into the document, never into a run. Applying is the user accepting a
                // proposal to EDIT; whether it executes is still their next decision.
                // `setSql` is enough on its own — SqlEditorPane reconciles an externally
                // changed `value` back into the CM6 document, the same path a tab switch
                // and a restored draft take.
                setSql(fixed);
                setError("");
                setFailedSql("");
              }}
            />
          }
        />
        {/* The results pane, folded to one quiet line until a statement runs — nothing of history, ever. */}
        {!outputOpen && (
          <div data-testid="sql-output-rest" className="aug-fs-sm"
            style={{ ...MUTED, padding: "6px 14px", borderTop: "1px solid var(--b0)", flexShrink: 0 }}>
            Results open here when a statement runs.
          </div>
        )}
        </div>
    </div>
  );

  // `resizePane="second"` because history sits on the RIGHT: sizing the left pane
  // would make the rail's width whatever was left over, so it would drift every time
  // the window changed rather than staying where the user put it.
  //
  // `collapsed` rather than rendering the split only when history is open: the
  // conditional form changed the element tree, so every toggle remounted the editor
  // beside it and took the undo history and cursor with it.
  return (
    <ResizableSplit
      storageKey="sqlmode.history"
      resizePane="second"
      initial={280}
      min={200}
      max={560}
      // The start page lists the recent runs itself, and its Tools ▾ (the rail's toggle) is not on screen.
      collapsed={!rail || noTabs}
      style={{ flex: 1, minWidth: 0, minHeight: 0 }}
      left={editorPane}
      right={
        <HistoryRail
          connId={connId}
          refreshKey={historyKey}
          onRestore={sql => openInNewTab(sql, "History")}
        />
      }
    />
  );
}
