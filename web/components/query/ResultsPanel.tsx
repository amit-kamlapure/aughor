"use client";

/**
 * SE-1 — the results panel: the grid plus the facts about the run.
 * SE-4 I — plus filters over the returned rows, a chart view, and the ways out
 * (pin, schedule, share).
 * SE-8B — a statement pager («Results N of M» — "Run all" keeps EVERY statement's rows, not just the last) and a tab
 * strip (Table, one tab per chart).
 *
 * Redone to `pramanyx-v2/CLARITY.md` (2026-10-12). The panel opens on its FIGURES — rows · time · the cut said plainly ·
 * cached — with the two things a cut result can ask for next on the same line, and the result's Copy and CSV beside
 * them (every table a reader is shown leaves the page as a table). The ways out that sat in a footer row of buttons —
 * other formats, a chart, Pin, Schedule — are one Tools ▾. The pager and the chart tabs show only when there is more
 * than one thing to page or view.
 *
 * Errors render INLINE here, never as a toast. A failed query is the primary content
 * of this pane at that moment — a toast would put the one thing the user needs to read
 * on a timer, next to the editor they need to fix. It is said ONCE: Failed, or Refused and why (a guard's block, a
 * table turned off for analysis), the engine's or the gate's own words, and Quick fix on the same row.
 *
 * `truncated` is the load-bearing caveat: the server's n+1 probe row is what makes it honest, so "cut at 500" means
 * there provably are more, not that we stopped counting.
 *
 * **The chart is `ResultChartCard`, not a new builder** — the one chart surface the
 * whole platform shares. One is mounted per chart TAB, each seeded with its
 * own config and KEPT MOUNTED behind `hidden` on tab switch: the card captures its
 * seed once at mount, so unmounting a tab would discard the chart the user just built.
 * Chart tabs describe the CURRENT rows — paging to another statement's result
 * re-draws them over that set, and an incompatible pick degrades rather than throws
 * (the card's own rule).
 */
import { Suspense, lazy, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { countNoun, formatCount, formatSeconds, formatTableNumber, formatTimestamp, utcDayWords } from "@/lib/format";
import { ResultsGrid, type ResultColumnFilters } from "@/components/query/ResultsGrid";
import { ColumnSources, columnOverview, profileColumn } from "@/components/query/ColumnInspector";
import { useInspector } from "@/components/shell/Inspector";
import { ResultChartCard } from "@/components/charts/ResultChartCard";
import { type VizConfig } from "@/components/charts/vizConfig";
import { ResultFilterBar, makeFilter, narrowsColumn, withColumnFilter, type ActiveFilter } from "@/components/query/ResultFilterBar";
import { singleTable } from "@/lib/query/cellMenu";
import { QuickFixPanel } from "@/components/query/QuickFixPanel";
import { SchedulePopover } from "@/components/query/SchedulePopover";
import { ToolsMenu } from "@/components/catalog/CatalogTools";
import { Chip, Empty, MUTED, NUM } from "@/components/clarity/kit";
import { TableActions, rawCells } from "@/components/TableActions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { csvFilename, downloadText } from "@/lib/query/csv";
import { EXTRACTORS, extractorById, guessTableName } from "@/lib/query/extractors";
import { applyFilters } from "@/lib/query/resultFilter";
import { describeRunError, resultFigures, resultTools, unwrapRunSql } from "@/lib/query/workbench";

// Arc SH — loaded only when a person keeps a result's rows as a sheet, so the editor carries none of it otherwise.
const NewSheetDialog = lazy(() => import("@/components/sheets/NewSheetDialog").then(m => ({ default: m.NewSheetDialog })));
import { type RelatedJoin, type TypedQueryPage, type TypedQueryResult } from "@/lib/api";
import type { Cell } from "@/lib/query/resultFilter";
import { Input } from "@/components/ui/input";
import { withUniqueKeys } from "@/lib/listKeys";

/** DE-5d — what cut the result, said by `lib/query/workbench`; re-exported where its callers always found it. */
export { cutNote } from "@/lib/query/workbench";

/** The outcome of "Count all rows": idle, running, a total with its as-of, or the refusal's words. */
type CountState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; total: number; asOf: string }
  | { status: "failed"; message: string };

/** The most rows one "Load more" asks for — the row budget's own ceiling. */
const MAX_PAGE = 10_000;

// Module-level constants, not inline `[]`: a fresh array each render would be a new
// dependency for the filter memo, so it would recompute on every parent render.
const EMPTY_COLS: string[] = [];
const EMPTY_ROWS: TypedQueryResult["rows"] = [];

/** A caveat on the figures line: amber, and allowed to wrap — a cut's reason is a sentence, never clipped. */
const CAVEAT: React.CSSProperties = {
  background: "var(--amb1)", color: "var(--amb4)", borderRadius: "var(--r2)", padding: "1px 8px",
};
const RED: React.CSSProperties = { color: "var(--red4)" };

/** A card title from the SQL — the first table named, else a generic label. Cheap and
 *  deterministic; the user can rename the card on the dashboard. */
function pinTitle(sql: string): string {
  const m = /\bfrom\s+([a-zA-Z_][\w.]*)/i.exec(sql);
  return m ? `Query — ${m[1]}` : "Query result";
}

/** One chart tab. The config is written back by the card's own editor, so
 *  Duplicate copies the chart as it stands, not as it started. */
interface VizTab { id: string; name: string; config: VizConfig }

function newVizId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `viz-${Math.random().toString(36).slice(2)}`;
}

export function ResultsPanel({
  results,
  resultIdx,
  onResultIdx,
  error,
  running,
  connId,
  onSchedule,
  failedSql,
  onApplyFix,
  maximized,
  onToggleMaximize,
  params,
  pageSize,
  runKey,
  onAppendRows,
  onAppendResult,
  readAt,
  verdict,
}: {
  /** SE-8B — every statement's result, in run order. One entry for a single run. */
  results: TypedQueryResult[];
  resultIdx: number;
  onResultIdx: (i: number) => void;
  error: string;
  running: boolean;
  connId?: string;
  /** Opens a custom-SQL monitor prefilled from this result's SQL. */
  onSchedule?: (sql: string) => void;
  /** SE-5a — the statement that produced `error`. Passed separately because a failed run
   *  leaves no usable result, so the SQL is not otherwise reachable from here. */
  failedSql?: string;
  /** SE-5a — put an accepted proposal into the editor. Never called without a click. */
  onApplyFix?: (sql: string) => void;
  /** SE-8B — the ⤢ button: the editor collapses and the results take the column. */
  maximized?: boolean;
  onToggleMaximize?: () => void;
  /** DE-5d — the bound values the run used, so a count or a page is of the SAME statement. */
  params?: Record<string, unknown>;
  /** DE-5d — the run's row limit: how many rows one "Load more" asks for. */
  pageSize?: number;
  /** DE-5d — changes on every new run, so a count from the last run is not shown over this one. */
  runKey?: number;
  /** DE-5d — append a page the server returned to `results[idx]`. Without it, no "Load more". */
  onAppendRows?: (idx: number, page: TypedQueryPage) => void;
  /** DE-5f — add a result the panel opened from a cell (related rows) as a new page of the pager. Without
   *  it, the cell menu offers no related rows. */
  onAppendResult?: (result: TypedQueryResult) => void;
  /** When the result reached the page (ISO) — the Execution view's read time. */
  readAt?: string;
  /** The guard battery's verdict on the statement, as the run row's chip says it. */
  verdict?: { text: string; title?: string } | null;
}) {
  const [showExport, setShowExport] = useState(false);
  const [copyState, setCopyState] = useState<"" | "ok" | "fail">("");
  // Arc SH, SH-7 — "Keep the rows as a sheet".
  const [keeping, setKeeping] = useState(false);
  const [filters, setFilters] = useState<ActiveFilter[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCount, setScheduleCount] = useState(0);
  const pinning = useRef(false);
  // SE-8B — the tab strip: "table" or a chart's id.
  const [vizTabs, setVizTabs] = useState<VizTab[]>([]);
  const [activeView, setActiveView] = useState("table");
  const [vizMenu, setVizMenu] = useState("");        // chart id whose ⌄ menu is open
  const [renaming, setRenaming] = useState("");      // chart id being renamed
  const [renameDraft, setRenameDraft] = useState("");

  // DE-5d — "Count all rows" and "Load more" for a cut result. Both go to the server, which runs the
  // statement again through the run's door; the panel only shows what came back, and says a refusal
  // in the server's words. Reset when a new run lands or the pager moves: a total belongs to one
  // run of one statement, and its as-of says when it was true.
  const [count, setCount] = useState<CountState>({ status: "idle" });
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState("");
  useEffect(() => {
    setCount({ status: "idle" });
    setMoreBusy(false);
    setMoreError("");
  }, [runKey, resultIdx]);

  const result = results[resultIdx] ?? null;
  const columns = result?.columns ?? EMPTY_COLS;
  const rawRows = result?.rows ?? EMPTY_ROWS;
  const nextPage = Math.min(Math.max(1, pageSize ?? 500), MAX_PAGE);
  // DE-5f — a result opened from a cell ran with its own bound value; the run's values are the fallback.
  const effectiveParams = result?.params ?? params;
  const [relatedError, setRelatedError] = useState("");
  useEffect(() => { setRelatedError(""); }, [runKey, resultIdx]);

  // A result column in the shell's inspector (2026-11-10, the SQL Editor mockup): opened from a column's menu, it then
  // follows the selection to the next column until it is closed. What it says of values is of the rows LOADED.
  const inspector = useInspector();
  const panelId = useId();
  const mine = `result-col:${panelId}:`;
  const current = `${mine}${runKey}:${resultIdx}:`;
  const inspectKey = (i: number) => `${current}${i}`;
  // A new run (or another statement's result) is not the column the inspector holds: it closes rather than go stale.
  const heldKey = inspector.subject?.key;
  const closeInspector = inspector.close;
  useEffect(() => {
    if (heldKey?.startsWith(mine) && !heldKey.startsWith(current)) closeInspector();
  }, [heldKey, mine, current, closeInspector]);
  const inspectColumn = (i: number) => {
    if (!result || i < 0 || i >= columns.length) return;
    const name = columns[i];
    const type = result.columns_typed?.[i]?.type ?? null;
    const profile = profileColumn(rawRows, i, type);
    inspector.inspect({
      key: inspectKey(i), kind: "Result column", title: name, icon: "column",
      meta: <>{type ?? "type not said"} · {countNoun(profile.loaded, "row")} loaded{result.truncated ? " · result cut" : ""}</>,
      tabs: {
        overview: columnOverview({ name, type, profile, truncated: !!result.truncated }),
        provenance: <ColumnSources receiptId={result.receipt_id} column={name} />,
      },
    });
  };
  const followColumn = (i: number) => {
    const open = inspector.subject?.key;
    if (open?.startsWith(mine) && open !== inspectKey(i)) inspectColumn(i);
  };

  const countAll = async () => {
    if (!connId || !result) return;
    setCount({ status: "busy" });
    try {
      const { countQueryRows } = await import("@/lib/api");
      const r = await countQueryRows(connId, result.sql, effectiveParams);
      if (r.total === null) setCount({ status: "failed", message: r.error ?? r.code ?? "no answer" });
      else setCount({ status: "done", total: r.total, asOf: r.as_of });
    } catch (e) {
      setCount({ status: "failed", message: e instanceof Error ? e.message : "no answer" });
    }
  };

  const loadMore = async () => {
    if (!connId || !result || !onAppendRows) return;
    setMoreBusy(true);
    setMoreError("");
    try {
      const { loadMoreRows } = await import("@/lib/api");
      // The offset is every row shown so far, filtered or not: the page continues the RESULT.
      const page = await loadMoreRows(connId, result.sql, rawRows.length, nextPage, effectiveParams);
      if (page.error) setMoreError(page.error);
      else onAppendRows(resultIdx, page);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : "could not load more rows");
    } finally {
      setMoreBusy(false);
    }
  };
  // Filtering runs over every returned row on each keystroke. Deferred so typing stays
  // responsive on a full-limit result — the grid catching up a frame late is a far
  // better trade than the input stuttering.
  const deferredFilters = useDeferredValue(filters);
  const rows = useMemo(() => {
    if (!deferredFilters.length) return rawRows;
    return applyFilters(
      rawRows,
      deferredFilters.map((f) => f.clause).filter((c): c is NonNullable<typeof c> => !!c),
      deferredFilters.map((f) => f.rank).filter((r): r is NonNullable<typeof r> => !!r),
    );
  }, [rawRows, deferredFilters]);

  // DE-5c — a live read of a column's values, offered only when the statement reads exactly ONE
  // table: then a result column is that table's column by name. A join, a CTE or a computed column
  // has no one table to ask, and the picker says the rows on screen are a sample instead.
  const resultSql = result?.sql;
  const sourceTable = useMemo(() => (resultSql ? singleTable(resultSql) : null), [resultSql]);
  // DE-close — the table column a result column reads: DE-4's lineage on the typed response first (so a
  // joined statement's columns are each their own table's), else the one-table rule. Null for a column no
  // table owns (a computed column, a star the tracer could not expand): nothing is read live or opened for it.
  const typedSources = useMemo(() => {
    const out = new Map<string, { table: string; schema?: string; column: string }>();
    for (const c of result?.columns_typed ?? []) {
      if (!c.source) continue;
      const parts = c.source.table.split(".").filter(Boolean);
      out.set(c.name, { table: parts[parts.length - 1] ?? c.source.table,
        schema: parts.length > 1 ? parts[parts.length - 2] : undefined, column: c.source.column });
    }
    return out;
  }, [result?.columns_typed]);
  const columnSource = useMemo(() => {
    if (!connId || (!sourceTable && typedSources.size === 0)) return undefined;
    return (column: string): { table: string; schema?: string; column: string } | null => {
      const typed = typedSources.get(column);
      if (typed) return typed;
      if (sourceTable) return { table: sourceTable.table, schema: sourceTable.schema, column };
      return null;
    };
  }, [connId, sourceTable, typedSources]);

  const fetchDistinct = useMemo(() => {
    if (!connId || !columnSource) return undefined;
    return async (column: string) => {
      const src = columnSource(column);
      if (!src) return null;
      const { getColumnDistinct } = await import("@/lib/api");
      const r = await getColumnDistinct(connId, src.table, src.column, src.schema);
      const table = src.schema ? `${src.schema}.${src.table}` : src.table;
      const source = src.column === column ? table : `${table} (${src.column})`;
      // DE-5d: a table the route could not read is a typed refusal, and the picker says it in the
      // engine's words. An empty list with no error is an empty column, and the rows then speak.
      if (r.error) return { values: [], truncated: false, source, error: r.error };
      return r.values.length ? { values: r.values, truncated: r.truncated, source } : null;
    };
  }, [connId, columnSource]);

  // DE-5f — the rows related to a value, through the joins the data bears out. Offered for a column whose
  // table column is known (above), on a joined statement too.
  const fetchRelated = useMemo(() => {
    if (!connId || !columnSource) return undefined;
    return async (column: string) => {
      const src = columnSource(column);
      if (!src) return { table: "", column, joins: [], ontology: "not built" as const };
      const { getRelatedJoins } = await import("@/lib/api");
      return getRelatedJoins(connId, src.table, src.column, src.schema);
    };
  }, [connId, columnSource]);
  const onOpenRelated = useMemo(() => {
    if (!connId || !columnSource || !onAppendResult) return undefined;
    return async (join: RelatedJoin, column: string, value: Cell) => {
      setRelatedError("");
      const src = columnSource(column);
      if (!src) { setRelatedError(`no table owns ${column}, so its related rows cannot be opened`); return; }
      try {
        const { openRelatedRows } = await import("@/lib/api");
        const r = await openRelatedRows(connId, {
          table: src.table, column: src.column, value, otherTable: join.other_table, otherColumn: join.other_column,
          schema: src.schema,
        }, nextPage);
        // A refusal is said where the person is looking, not opened as an empty page.
        if (r.error && r.code) setRelatedError(r.error);
        else onAppendResult(r);
      } catch (e) {
        setRelatedError(e instanceof Error ? e.message : "the related rows could not be opened");
      }
    };
  }, [connId, columnSource, onAppendResult, nextPage]);

  // DE-5b — a chip from a click on the grid: the same object a typed phrase makes, and the bar
  // opens with it, so the chip is seen the moment it narrows the rows.
  const addFilterPhrase = (phrase: string) => {
    const made = makeFilter(phrase, columns);
    if (!made) return;
    setFilters(prev => [...prev, made]);
    setShowFilters(true);
  };

  // A column's ▾ menu at the grid's head (2026-11-09) makes chips too — one per column, which the menu opens with again
  // and OK replaces — and its Clear takes every chip that narrows by the column. Its checklist lists the values the
  // OTHER chips leave, as a spreadsheet's does.
  const columnFilters = useMemo<ResultColumnFilters>(() => {
    const at = new Map(rawRows.map((r, i) => [r, i] as const));
    return {
      rows: rawRows,
      filterOf: col => filters.find(f => f.menu?.col === col)?.menu?.filter,
      isFiltered: col => filters.some(f => narrowsColumn(f, col, columns[col])),
      others: col => {
        const rest = filters.filter(f => f.menu?.col !== col);
        if (!rest.length) return undefined;
        const kept = applyFilters(rawRows,
          rest.map(f => f.clause).filter((c): c is NonNullable<typeof c> => !!c),
          rest.map(f => f.rank).filter((r): r is NonNullable<typeof r> => !!r));
        return kept.map(r => at.get(r) ?? -1).filter(i => i >= 0).sort((a, b) => a - b);
      },
      apply: (col, kind, filter) => {
        setFilters(prev => withColumnFilter(prev, col, columns[col], kind, filter));
        if (filter) setShowFilters(true);
      },
      clear: col => setFilters(prev => prev.filter(f => !narrowsColumn(f, col, columns[col]))),
    };
  }, [rawRows, filters, columns]);
  // A ▾-menu chip is bound to its column's position; a run whose columns moved would leave it narrowing another
  // column under the first one's name, so it goes with the shape it was made for.
  const shape = columns.join("\u0000");
  useEffect(() => {
    setFilters(prev => (prev.some(f => f.menu && columns[f.menu.col] !== f.clause?.column)
      ? prev.filter(f => !f.menu || columns[f.menu.col] === f.clause?.column) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shape IS the dependency
  }, [shape]);

  if (running && !result) {
    return <div className="aug-fs-chrome" style={{ ...MUTED, padding: "12px 14px" }}>Running…</div>;
  }

  if (error) {
    const e = describeRunError(error);
    return (
      <div data-testid="run-error" role="alert" style={{ padding: "12px 14px", overflow: "auto" }}>
        {/* Said once: what happened (Failed, or Refused and why), which statement of a Run all, the engine's or
            the gate's own words — and Quick fix on the same row. The kind is a chip on the TEXT, never a class on a
            row holding the fix: an upper-casing class there rendered the proposed SQL as `SELECT BRAND_NAEM …`. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              <Chip tone={e.kind === "cancelled" ? "plain" : "down"} testId="run-error-kind">
                {e.title}{e.why ? ` · ${e.why}` : ""}
              </Chip>
              {e.statement && <Chip>{e.statement}</Chip>}
            </div>
            <pre
              data-testid="run-error-message"
              className="aug-fs-chrome"
              style={{
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
                fontFamily: "var(--font-code, monospace)", color: "var(--t2)",
              }}
            >
              {e.message}
            </pre>
          </div>
          {/* SE-5a — offered only when there is a statement AND a connection to repair it against. It proposes;
              it never applies on its own. */}
          {connId && failedSql && onApplyFix && (
            <QuickFixPanel connId={connId} sql={failedSql} error={error} onApply={onApplyFix} />
          )}
        </div>
      </div>
    );
  }

  // Nothing has run: one line, never a history (the user, 2026-11-09 — the recent runs and the saved queries are the
  // start page's, with no tab open; SqlMode folds this pane away until a statement runs).
  if (!result) {
    return (
      <div className="aug-fs-chrome" style={{ ...MUTED, padding: "12px 14px" }}>
        ⌘↵ runs the statement under the cursor.
      </div>
    );
  }

  // A statement that returned no grid (DDL, or a genuinely empty result) says so once, on the figures line.
  const empty = result.row_count === 0;
  // Filtered everything away is NOT the same as "the query returned nothing", and saying
  // "No rows returned" for it would blame the warehouse for the user's own chip.
  const filteredOut = !empty && rows.length === 0;
  // The grid carries the figures at its foot while it is the view on screen; otherwise they are their own strip at the
  // panel's foot — the figures and the ways out never leave with the grid.
  const gridShown = !empty && !filteredOut && activeView === "table";
  const figs = resultFigures(result, { shown: rows.length, returned: rawRows.length });

  /** Render the CURRENT rows — filtered, if filters are on — through one extractor.
   *  Filters narrow what is on screen, and exporting what is not on screen would be a
   *  different result set wearing the same button. */
  const renderAs = (id: string) =>
    extractorById(id).render(columns, rows, guessTableName(result?.sql ?? ""));

  const copyAs = (id: string) => {
    const settle = (s: "ok" | "fail") => { setCopyState(s); setTimeout(() => setCopyState(""), 1600); };
    // The clipboard API rejects on an insecure origin, without focus, or when
    // permission is denied. Swallowing that leaves the user clicking a button that
    // does nothing and says nothing — so the failure is SHOWN, and the download
    // (which needs no permission) sits beside every format.
    const write = navigator.clipboard?.writeText(renderAs(id));
    if (write) write.then(() => settle("ok")).catch(() => settle("fail"));
    else settle("fail");
  };

  const downloadAs = (id: string) => {
    const x = extractorById(id);
    downloadText(csvFilename("result").replace(/\.csv$/, `.${x.ext}`), renderAs(id), x.mime);
  };

  const addViz = () => {
    const v: VizTab = { id: newVizId(), name: `Chart ${vizTabs.length + 1}`, config: {} };
    setVizTabs(prev => [...prev, v]);
    setActiveView(v.id);
  };

  const patchViz = (id: string, patch: Partial<VizTab>) =>
    setVizTabs(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));

  const removeViz = (id: string) => {
    setVizTabs(prev => prev.filter(v => v.id !== id));
    if (activeView === id) setActiveView("table");
    setVizMenu("");
  };

  const duplicateViz = (id: string) => {
    const src = vizTabs.find(v => v.id === id);
    if (!src) return;
    const copy: VizTab = { id: newVizId(), name: `${src.name} copy`, config: { ...src.config } };
    setVizTabs(prev => [...prev, copy]);
    setActiveView(copy.id);
    setVizMenu("");
  };

  const pin = async () => {
    if (!connId || pinning.current) return;
    pinning.current = true;
    try {
      const { pinQueryToDashboard } = await import("@/lib/api");
      await pinQueryToDashboard(connId, result.sql, pinTitle(result.sql));
      toast.success("Pinned to the dashboard");
    } catch {
      toast.error("Pin failed");
    } finally {
      pinning.current = false;
    }
  };

  const tools = resultTools({
    hasRows: !empty, connected: !!connId, filtered: filters.length > 0, scheduleCount,
    act: { addChart: addViz, export: () => setShowExport(true), pin: () => void pin(),
      schedule: () => setShowSchedule(true), keepAsSheet: () => setKeeping(true) },
  });

  const filtersVisible = showFilters || filters.length > 0;
  const headerIcon = (name: Parameters<typeof Icon>[0]["name"], title: string,
    onClick: () => void, active = false, testid?: string) => (
    <Button variant={active ? "secondary" : "ghost"} size="xs" title={title} aria-label={title}
      onClick={onClick} data-testid={testid}>
      <Icon name={name} size={14} />
    </Button>
  );
  const caveats = result.caveats ?? [];

  // The result's figures and the ways its rows leave — at the grid's FOOT, one strip, as the SQL Editor mockup draws it
  // (2026-11-10): rows · time · cached · the cut, with what a cut result can ask for next, then Find, Transpose and
  // Columns, then filter · Copy · CSV · Tools ▾ · ⤢. The count and the outcome are said first, in the views row above.
  const figuresLead = (
    <span data-testid="results-figures" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginRight: 6 }}>
      {/* When a filter is active the line must not still report the RUN's row count: "4 rows" above two
          visible rows reads as a description of what you are looking at. The run's own count stays as "of N". */}
      <span data-testid="results-rows" className="aug-fs-chrome" style={{ color: "var(--t1)", fontWeight: 600, ...NUM }}>
        {figs.rows}
      </span>
      {figs.time && <span className="aug-fs-sm" style={{ ...MUTED, ...NUM }}>{figs.time}</span>}
      {figs.cached && <Chip title="Served from the result cache, not run again">cached</Chip>}
      {figs.cut && (
        <>
          <span data-testid="cut-note" className="aug-fs-xs" style={CAVEAT}>{figs.cut}</span>
          {/* DE-5d — the two things a cut result can ask for next, each a statement the server runs
              through the same door as the query. The count's as-of rides with the number. */}
          {connId && (
            <Button
              variant="ghost" size="xs" className="aug-fs-ui" data-testid="count-all"
              disabled={count.status === "busy"}
              title="Count every row this statement returns — run through the same door as the query"
              onClick={countAll}
            >
              {count.status === "busy" ? "Counting…" : "Count all rows"}
            </Button>
          )}
          {connId && onAppendRows && (
            <Button
              variant="ghost" size="xs" className="aug-fs-ui" data-testid="load-more"
              disabled={moreBusy}
              title={`Fetch the next ${formatCount(nextPage)} rows through the same door, after the ${formatCount(rawRows.length)} shown`}
              onClick={loadMore}
            >
              {moreBusy ? "Loading…" : `Load ${formatCount(nextPage)} more`}
            </Button>
          )}
        </>
      )}
      {count.status === "done" && (
        <span data-testid="count-result" className="aug-fs-sm" style={{ color: "var(--t2)", ...NUM }}>
          {formatCount(count.total)} {count.total === 1 ? "row" : "rows"} in all · as of {formatTimestamp(count.asOf, "short")}
        </span>
      )}
      {count.status === "failed" && (
        <span data-testid="count-result" className="aug-fs-sm" style={RED}>Could not count — {count.message}</span>
      )}
      {moreError && <span data-testid="more-result" className="aug-fs-sm" style={RED}>{moreError}</span>}
      {relatedError && <span data-testid="related-result" className="aug-fs-sm" style={RED}>{relatedError}</span>}
      {readAt && !result.cached && (
        <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>Live · read {utcDayWords(readAt, true)}</span>
      )}
    </span>
  );
  const figuresTail = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8 }}>

      {/* Find-in-results stays ⌘F inside the grid, which owns the rows. */}
      {!empty && headerIcon("filter",
        filtersVisible ? "Hide the filter bar" : "Filter these rows — plain phrases, chips, OR",
        () => setShowFilters(v => !v), filtersVisible, "results-filter-toggle")}
      {!empty && (
        // Copy and CSV of the rows ON SCREEN — filtered, when filters are on: exporting what is not on screen
        // would be a different result set wearing the same button.
        <TableActions name="result" read={() => ({ columns, rows: rawCells(rows) })}
          shown={filters.length > 0 ? { rows: rows.length, of: rawRows.length } : undefined} />
      )}
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <ToolsMenu items={tools} testId="results-tools" />
        {copyState && (
          <span className="aug-fs-xs" style={{
            position: "absolute", bottom: "100%", right: 0, marginBottom: 2, whiteSpace: "nowrap",
            color: copyState === "ok" ? "var(--grn4)" : "var(--red4)",
          }}>
            {copyState === "ok" ? "Copied" : "Copy failed"}
          </span>
        )}
        {showExport && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setShowExport(false)} />
            <div data-testid="results-export-menu" className="aug-fs-sm" style={{
              position: "absolute", bottom: "100%", right: 0, zIndex: 21, marginBottom: 4,
              minWidth: 230, padding: 5, background: "var(--bg-2)",
              border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
            }}>
              {filters.length > 0 && (
                <div className="aug-fs-xs" style={{ ...MUTED, padding: "2px 7px 4px" }}>The filtered rows</div>
              )}
              {EXTRACTORS.map(x => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ flex: 1, padding: "3px 7px", color: "var(--t2)" }}>{x.label}</span>
                  <Button variant="ghost" size="xs" title={`Copy as ${x.label}`}
                    onClick={() => { copyAs(x.id); setShowExport(false); }}>Copy</Button>
                  <Button variant="ghost" size="xs" title={`Download as ${x.label}`}
                    onClick={() => { downloadAs(x.id); setShowExport(false); }}>File</Button>
                </div>
              ))}
            </div>
          </>
        )}
        {/* SE-8D — schedules are created here; onSchedule survives as the "Open in Monitors" path for
            thresholds and anomaly rules. Always mounted, so the menu can say how many this statement has. */}
        {connId && (
          <SchedulePopover connId={connId} sql={result.sql} open={showSchedule} onOpenChange={setShowSchedule}
            onCount={setScheduleCount} onOpenMonitors={onSchedule} />
        )}
        {keeping && connId && (
          <Suspense fallback={null}>
            <NewSheetDialog start={{ source: "rows", connectionId: connId, sql: unwrapRunSql(result.sql),
              name: pinTitle(result.sql) }} onClose={() => setKeeping(false)}
              onMade={() => { setKeeping(false); toast.success("Kept as a sheet — it is in Spreadsheets"); }} />
          </Suspense>
        )}
      </span>
      {onToggleMaximize && headerIcon("expand",
        maximized ? "Bring the editor back" : "Give the results the whole column",
        onToggleMaximize, !!maximized, "results-maximize")}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {/* One run seen five ways (2026-11-10, the SQL Editor mockup): Results · Chart · Profile · Execution · Logs, with
          how the run went at the right. A chart is a tab of its own, as before — "Chart" draws the first. The pager of a
          run of several statements leads the row. */}
      <div className="aug-rtabs" data-testid="results-views">
          {results.length > 1 && (
            <span style={{ display: "flex", alignItems: "center", gap: 2, marginRight: 6, flexShrink: 0 }}>
              <Button variant="ghost" size="xs" title="Previous statement's result" aria-label="Previous result"
                disabled={resultIdx === 0} onClick={() => onResultIdx(resultIdx - 1)}>
                <Icon name="chevl" size={13} />
              </Button>
              <span className="aug-fs-chrome" data-testid="results-pager" style={{ color: "var(--t3)", whiteSpace: "nowrap", ...NUM }}>
                Results {resultIdx + 1} of {results.length}{result?.label ? ` · ${result.label}` : ""}
              </span>
              <Button variant="ghost" size="xs" title="Next statement's result" aria-label="Next result"
                disabled={resultIdx >= results.length - 1} onClick={() => onResultIdx(resultIdx + 1)}>
                <Icon name="chevr" size={13} />
              </Button>
            </span>
          )}

          <Button variant="ghost" size="xs" className="aug-fs-ui aug-rtab" aria-pressed={activeView === "table"}
            data-testid="results-view-results" onClick={() => setActiveView("table")}>
            Results <span style={{ color: "var(--t3)", ...NUM }}>{formatCount(rawRows.length)}</span>
          </Button>
          {vizTabs.map(v => (
            <span key={v.id} style={{ position: "relative", display: "flex", alignItems: "center", flexShrink: 0 }}>
              {renaming === v.id ? (
                <Input bespoke
                  className="aug-fs-ui" autoFocus value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  onBlur={() => { if (renameDraft.trim()) patchViz(v.id, { name: renameDraft.trim() }); setRenaming(""); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") { if (renameDraft.trim()) patchViz(v.id, { name: renameDraft.trim() }); setRenaming(""); }
                    if (e.key === "Escape") setRenaming("");
                  }}
                  style={{ width: 120 }}
                />
              ) : (
                <Button variant="ghost" size="xs" aria-pressed={activeView === v.id}
                  className="aug-fs-ui aug-rtab"
                  onClick={() => setActiveView(v.id)}
                  onDoubleClick={() => { setRenaming(v.id); setRenameDraft(v.name); }}
                  title="Double-click to rename">
                  {v.name}
                </Button>
              )}
              {activeView === v.id && renaming !== v.id && (
                <Button variant="ghost" size="xs" title="Chart options"
                  aria-label="Chart options"
                  onClick={() => setVizMenu(m => m === v.id ? "" : v.id)}
                  style={{ paddingLeft: 2, paddingRight: 2 }}>
                  <Icon name="chevd" size={12} />
                </Button>
              )}
              {vizMenu === v.id && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setVizMenu("")} />
                  <div className="aug-fs-ui" style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 41, marginTop: 4,
                    minWidth: 150, padding: 5, background: "var(--bg-2)",
                    border: "1px solid var(--b2)", borderRadius: "var(--r2)", boxShadow: "var(--shadow-md)",
                  }}>
                    <Button variant="plain" size="xs" className="aug-fs-ui"
                      style={{ width: "100%", justifyContent: "flex-start" }}
                      onClick={() => { setRenaming(v.id); setRenameDraft(v.name); setVizMenu(""); }}>
                      Rename
                    </Button>
                    <Button variant="plain" size="xs" className="aug-fs-ui"
                      style={{ width: "100%", justifyContent: "flex-start" }}
                      onClick={() => duplicateViz(v.id)}>
                      Duplicate
                    </Button>
                    <Button variant="plain" size="xs" className="aug-fs-ui"
                      style={{ width: "100%", justifyContent: "flex-start", color: "var(--red4)" }}
                      onClick={() => removeViz(v.id)}>
                      Remove
                    </Button>
                  </div>
                </>
              )}
            </span>
          ))}
          {vizTabs.length === 0 && (
            <Button variant="ghost" size="xs" className="aug-fs-ui aug-rtab" aria-pressed={false}
              data-testid="results-view-chart" title="Chart these rows — a chart is a tab of its own" onClick={addViz}>
              Chart
            </Button>
          )}
          {(["profile", "execution", "logs"] as const).map(v => (
            <Button key={v} variant="ghost" size="xs" className="aug-fs-ui aug-rtab" aria-pressed={activeView === v}
              data-testid={`results-view-${v}`} onClick={() => setActiveView(v)}>
              {v === "profile" ? "Profile" : v === "execution" ? "Execution" : "Logs"}
            </Button>
          ))}
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Badge variant={result.error ? "destructive" : "green"} data-testid="results-status">
              <Icon name={result.error ? "warning" : "check"} size={12} />
              {result.error ? "Failed" : "Succeeded"} · {formatSeconds(result.duration_ms)}
            </Badge>
            {result.receipt_id && (
              <a href={`/receipt/${encodeURIComponent(result.receipt_id)}`} target="_blank" rel="noreferrer"
                className="aug-fs-xs aug-mono" style={{ color: "var(--t3)" }} title="The signed provenance record for this run">
                receipt {result.receipt_id.slice(0, 8)}
              </a>
            )}
          </span>
      </div>


      {/* Caveats are said, never hidden — each once, in amber, under the figures they qualify. */}
      {caveats.length > 0 && (
        <div data-testid="results-caveats" className="aug-fs-sm" style={{
          display: "flex", flexDirection: "column", gap: 2, padding: "5px 14px", color: "var(--amb4)",
          borderBottom: "1px solid var(--b0)", flexShrink: 0,
        }}>
          {caveats.map((c, i) => <div key={`caveat-${i}`}>{c}</div>)}
        </div>
      )}

      {!empty && filtersVisible && (
        <ResultFilterBar
          columns={columns}
          filters={filters}
          onChange={setFilters}
        />
      )}

      {/* The GRID scrolls, not this wrapper: a second scroll container above a
          virtualized list is what makes the virtualizer mount every row. */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {empty ? null : filteredOut ? (
          <div style={{ padding: "12px 14px" }}><Empty>No rows match these filters.</Empty></div>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, display: activeView === "table" ? "flex" : "none", flexDirection: "column" }}>
              <ResultsGrid
                footLead={gridShown ? figuresLead : undefined}
                footTail={gridShown ? figuresTail : undefined}
                columns={columns}
                columnsTyped={result.columns_typed}
                rows={rows}
                onAddFilter={addFilterPhrase}
                columnFilters={columnFilters}
                truncated={!!result.truncated}
                fetchDistinct={fetchDistinct}
                columnSource={columnSource}
                fetchRelated={fetchRelated}
                onOpenRelated={onOpenRelated}
                onInspectColumn={result ? inspectColumn : undefined}
                onSelectColumn={followColumn}
              />
            </div>
            {/* Every chart stays MOUNTED — the card seeds its controls once, so an
                unmounted tab would come back as a default chart. `display:none`, the
                same trick the workbench plays with its mode panes. */}
            {vizTabs.map(v => (
              <div key={v.id} style={{
                flex: 1, minHeight: 0, overflow: "auto", padding: "8px 12px",
                display: activeView === v.id ? "block" : "none",
              }}>
                {/* No `fillHeight`: it is a PIXEL height, not a boolean, and this pane is
                    resizable — pinning a number here would fight the splitter. The wrapper
                    scrolls instead, so the chart keeps its natural size at any pane height. */}
                <ResultChartCard
                  columns={columns} rows={rows}
                  config={v.config}
                  onConfigChange={cfg => patchViz(v.id, { config: cfg })}
                />
              </div>
            ))}
          </>
        )}
        {activeView === "profile" && (
          <div className="aug-rview aug-fs-sm" data-testid="results-profile">
            <p style={{ margin: "0 0 8px", color: "var(--t3)" }}>
              Every column of the {countNoun(rawRows.length, "loaded row")}{result.truncated ? " — the result was cut, so this is the loaded rows, not the whole result" : ""}.
              A row opens its column in the inspector.
            </p>
            <table>
              <thead><tr>
                <th>Column</th><th>Type</th><th className="num">Empty</th><th className="num">Distinct</th>
                <th className="num">Lowest</th><th className="num">Highest</th><th>Most common</th>
              </tr></thead>
              <tbody>
                {withUniqueKeys(columns.map((c, i) => ({ c, i })), x => x.c).map(([k, { c, i }]) => {
                  const type = result.columns_typed?.[i]?.type ?? null;
                  const pr = profileColumn(rawRows, i, type);
                  const show = (v: unknown) => (typeof v === "number" ? formatTableNumber(v) : v == null ? "—" : String(v));
                  return (
                    <tr key={k} data-testid="results-profile-row" onClick={() => inspectColumn(i)} style={{ cursor: "pointer" }}>
                      <td className="aug-mono" style={{ color: "var(--t1)" }}>{c}</td>
                      <td>{type || "—"}</td>
                      <td className="num">{formatCount(pr.empty)}</td>
                      <td className="num">{formatCount(pr.distinct)}</td>
                      <td className="num">{show(pr.low)}</td>
                      <td className="num">{show(pr.high)}</td>
                      <td>{pr.common.length ? pr.common.slice(0, 2).map(x => `${show(x.value)} (${formatCount(x.n)})`).join(" · ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {activeView === "execution" && (
          <div className="aug-rview aug-fs-sm" data-testid="results-execution">
            <table>
              <tbody>
                <tr><th>Outcome</th><td>{result.error ? `Failed — ${result.error}` : "Succeeded"}</td></tr>
                <tr><th>Took</th><td>{formatSeconds(result.duration_ms)}</td></tr>
                <tr><th>Rows</th><td>{formatCount(result.row_count)}{result.truncated
                  ? ` — cut by ${result.cut_by === "budget" ? "the connection's row budget" : result.cut_by === "cap" ? "the connector's per-call cap" : "the row limit"}`
                  : " — the whole result"}</td></tr>
                <tr><th>Served</th><td>{result.cached
                  ? "From the result cache — not run again; when it was measured is not kept"
                  : `Run on the warehouse${readAt ? `, read ${utcDayWords(readAt, true)}` : ""}`}</td></tr>
                <tr><th>Guards</th><td>{verdict ? <span title={verdict.title}>{verdict.text}</span> : "Not checked for this run"}</td></tr>
                <tr><th>Receipt</th><td>{result.receipt_id
                  ? <a href={`/receipt/${encodeURIComponent(result.receipt_id)}`} target="_blank" rel="noreferrer" className="aug-mono">{result.receipt_id}</a>
                  : "This run left no receipt"}</td></tr>
                {result.params && Object.keys(result.params).length > 0 && (
                  <tr><th>Bound values</th><td className="aug-mono">{Object.entries(result.params).map(([k2, v2]) => `${k2} = ${String(v2)}`).join(" · ")}</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ margin: "12px 0 4px", color: "var(--t3)" }}>The statement as it ran</div>
            <pre className="aug-mono aug-fs-xs" style={{ margin: 0, padding: 10, background: "var(--bg-1)", border: "1px solid var(--b0)",
              borderRadius: "var(--r2)", whiteSpace: "pre-wrap", color: "var(--t1)" }}>{result.sql}</pre>
          </div>
        )}
        {activeView === "logs" && (
          <div className="aug-rview aug-fs-sm" data-testid="results-logs">
            <table>
              <thead><tr><th>#</th><th>Statement</th><th className="num">Rows</th><th className="num">Took</th><th>Outcome</th></tr></thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={`log-${i}`} data-testid="results-log-row" onClick={() => onResultIdx(i)}
                    style={{ cursor: results.length > 1 ? "pointer" : undefined, background: i === resultIdx ? "var(--bg-sel)" : undefined }}>
                    <td className="num">{formatCount(i + 1)}</td>
                    <td className="aug-mono" style={{ maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={r.sql}>{r.label || r.sql.replace(/\s+/g, " ").slice(0, 140)}</td>
                    <td className="num">{formatCount(r.row_count)}</td>
                    <td className="num">{formatSeconds(r.duration_ms)}</td>
                    <td style={{ color: r.error ? "var(--red4)" : undefined }}>
                      {r.error ? `failed — ${r.error}` : r.cached ? "from the result cache" : r.truncated ? "succeeded · cut" : "succeeded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {caveats.length > 0 && (
              <div style={{ marginTop: 10, color: "var(--amb4)" }}>{caveats.map((c, i) => <div key={`lc-${i}`}>{c}</div>)}</div>
            )}
          </div>
        )}
      </div>
      {!gridShown && (
        <div data-testid="results-foot" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flexShrink: 0,
          padding: "4px 10px", minHeight: 33, borderTop: "1px solid var(--b0)", background: "var(--bg-1)", position: "relative" }}>
          {figuresLead}
          <span style={{ flex: 1 }} />
          {figuresTail}
        </div>
      )}
    </div>
  );
}
