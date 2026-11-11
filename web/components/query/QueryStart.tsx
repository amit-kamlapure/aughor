"use client";

/**
 * The SQL editor's start page (the user, 2026-11-09, with a reference console's start page: "lets have a layout similar
 * to this for the opening of SQL editor, unless a session has a tab/s open"). With no query tab open — a connection with
 * none yet, or the last tab closed — the editor area is this page instead of an editor: Create new, one card that opens
 * an empty query tab (what the tab strip's + ▸ New query does), then Quick access — the statements run here lately (a
 * repeat folded into "×3", never listed again) or the queries saved for this connection, one list at a time. Each row
 * opens its statement in a new tab, and the page gives way to the editor.
 *
 * It used to sit under the editor, in the results pane before anything had run. The user: "Actual SQL input component
 * must not have a history component underneath it in any case" — so the lists moved here. Beside them, the catalog the
 * connection holds, in figures — its schemas, tables, columns and rows, and its largest tables (the user, 2026-11-09:
 * "keep the largest tables and information about the overall schema. I want users to understand the nature of the
 * catalogue that they have"). A table opens a query on it in a new tab, never run.
 *
 * Read from what the screen already holds: the Saved menu's list and the connection's tables arrive as props; the recent
 * runs are the audit log's workbench rows, the read the history rail makes. Nothing here runs a statement.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Bar, CARD, Chip, Empty, MUTED, NUM, ONE_LINE, RULE } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Loading, ReadFailed } from "@/components/ui/states";
import { describeStatements, getQueryHistory, type AuditRecord, type SavedQuery } from "@/lib/api";
import { compactNumber, countNoun, formatCount, relTime } from "@/lib/format";
import { withUniqueKeys } from "@/lib/listKeys";
import { catalogShape, recentRuns, runMark, runMeta, startTables } from "@/lib/query/workbench";
import { isVisualQuery } from "@/components/query/SavedQueryBar";

const HEADING: React.CSSProperties = { margin: "0 0 10px", fontWeight: 600, color: "var(--t1)" };
const ROW_BTN = "block h-auto w-full whitespace-normal px-1 py-1.5 text-left font-normal";
const MONO_LINE: React.CSSProperties = {
  ...ONE_LINE, display: "block", marginTop: 2, fontFamily: "var(--font-mono)", color: "var(--t3)",
};
/** How many runs the audit read returns; the distinct statements among them are what Recent can list. */
const READ = 30;
/** How many distinct recent statements Recent lists — as many as one read of their words can describe. */
const RECENT = 20;

type View = "recent" | "saved";

type StartTableInput = { name: string; rowCount?: string | number | null; columns?: unknown[]; isolated?: boolean };
/** A list of names with a bar and a figure at the right — the schemas, the largest tables. */
const BARS: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(40px, 80px) auto", gap: "4px 10px", alignItems: "center",
};
const SUBHEAD: React.CSSProperties = { margin: "0 0 6px", fontWeight: 500, color: "var(--t2)" };
/** How many tables "Largest tables" lists. */
const LARGEST = 8;

/** The catalog the connection holds, in figures: how many schemas, tables, columns and rows, each schema's share, how its
 *  tables join, and its largest tables — so a person knows what they are writing against before they write. */
function CatalogFigures({ tables, joins, loading, where, onOpenTable }: {
  tables: StartTableInput[];
  joins: Array<{ t1: string; t2: string }>;
  loading?: boolean;
  where: string;
  onOpenTable: (name: string) => void;
}) {
  const shape = useMemo(() => catalogShape(tables, joins), [tables, joins]);
  const top = useMemo(() => startTables(tables, LARGEST), [tables]);
  if (!tables.length) {
    return loading ? <Loading what="the catalog" /> : <Empty>No tables in {where}.</Empty>;
  }
  const maxSchema = Math.max(1, ...shape.schemas.map(x => x.rows));
  const maxTable = Math.max(1, ...top.map(t => t.rows ?? 0));
  const whole = [
    countNoun(shape.schemas.length, "schema"), countNoun(shape.tables, "table"),
    shape.columns
      ? `${countNoun(shape.columns, "column")}${shape.read < shape.tables ? ` in the ${formatCount(shape.read)} tables read` : ""}`
      : "",
    `${compactNumber(shape.rows)} rows${shape.uncounted ? ` in the ${formatCount(shape.tables - shape.uncounted)} counted` : ""}`,
  ].filter(Boolean).join(" · ");
  const joined = [
    shape.joins ? `${formatCount(shape.joins)} ${shape.joins === 1 ? "pair" : "pairs"} of tables known to join` : "no joins known",
    shape.isolated ? `${countNoun(shape.isolated, "table")} joining none` : "",
  ].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="aug-fs-sm" data-testid="query-start-catalog-whole">
        <div style={{ color: "var(--t1)", ...NUM }}>{whole}</div>
        <div style={{ ...MUTED, marginTop: 2 }}>{joined}</div>
      </div>
      <div>
        <div className="aug-fs-sm" style={SUBHEAD}>Schemas</div>
        <div style={BARS} data-testid="query-start-schemas">
          {withUniqueKeys(shape.schemas, x => x.name).map(([key, x]) => {
            const rows = `${formatCount(x.rows)} rows${x.uncounted ? `, ${countNoun(x.uncounted, "table")} not counted` : ""}`;
            return (
              <div key={key} style={{ display: "contents" }}
                title={`${x.name || "No schema"}: ${countNoun(x.tables, "table")}, ${countNoun(x.columns, "column")}, ${rows}`}>
                <span className="aug-fs-sm" style={{ ...ONE_LINE, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--t1)" }}>{x.name || "no schema"}</span>
                  <span style={{ ...MUTED, ...NUM }}> · {countNoun(x.tables, "table")}</span>
                </span>
                <Bar value={x.rows} max={maxSchema} hatched={x.rows === 0 && x.uncounted > 0} />
                <span className="aug-fs-xs" style={{ ...MUTED, ...NUM, textAlign: "right", whiteSpace: "nowrap" }}>
                  {x.rows || !x.uncounted ? compactNumber(x.rows) : "not counted"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="aug-fs-sm" style={SUBHEAD}>Largest tables</div>
        <div style={BARS} data-testid="query-start-tables">
          {withUniqueKeys(top, t => t.name).map(([key, t]) => (
            <div key={key} style={{ display: "contents" }}>
              <Button variant="plain" size="xs" className="justify-start px-1 font-normal" style={{ minWidth: 0 }}
                aria-label={t.name} title={`Open a query on ${t.name} in a new tab`} onClick={() => onOpenTable(t.name)}>
                {/* the schema quiet, the table's own name to read: long qualified names fit the column */}
                <span className="aug-fs-sm" style={{ ...ONE_LINE, fontFamily: "var(--font-mono)", color: "var(--t1)" }}>
                  {t.name.includes(".") && <span style={{ color: "var(--t3)" }}>{t.name.slice(0, t.name.lastIndexOf(".") + 1)}</span>}
                  {t.name.slice(t.name.lastIndexOf(".") + 1)}
                </span>
              </Button>
              <span title={t.rows == null ? `${t.name}: rows not counted` : `${t.name}: ${formatCount(t.rows)} rows`}>
                <Bar value={t.rows ?? maxTable} max={maxTable} hatched={t.rows == null} />
              </span>
              <span className="aug-fs-xs" style={{ ...MUTED, ...NUM, textAlign: "right", whiteSpace: "nowrap" }}>{t.shown}</span>
            </div>
          ))}
        </div>
        {shape.tables > top.length && (
          <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 6 }}>
            The largest {formatCount(top.length)} of {formatCount(shape.tables)} — the catalog at the left lists them all
          </div>
        )}
      </div>
    </div>
  );
}

export function QueryStart({
  connId, connectionName, refreshKey, saved, tables = [], tablesLoading, joins = [], onNewQuery, onOpenRun, onOpenSaved,
  onOpenTable,
}: {
  connId: string;
  connectionName?: string;
  /** Bumped after every run — the recent list is a read of the log a run writes. */
  refreshKey: number;
  /** The Saved menu's list for this connection; undefined while it is read, null when the read failed. */
  saved: SavedQuery[] | null | undefined;
  /** Open an empty query tab — the tab strip's + ▸ New query. */
  onNewQuery: () => void;
  /** Open a statement in a new tab — the history rail's restore. */
  onOpenRun: (sql: string) => void;
  /** Open a saved query the way the Saved menu does: in the mode it was written in, Save updating it. */
  onOpenSaved: (q: SavedQuery) => void;
  /** This connection's tables, as the editor read them for completion and the catalog rail. */
  tables?: StartTableInput[];
  tablesLoading?: boolean;
  /** The joins known between them. */
  joins?: Array<{ t1: string; t2: string }>;
  /** Open a query on a table in a new tab. */
  onOpenTable?: (name: string) => void;
}) {
  const [view, setView] = useState<View>("recent");
  const [records, setRecords] = useState<AuditRecord[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!connId) { setRecords([]); setFailed(null); return; }
    getQueryHistory(connId, READ)
      .then(r => { setRecords(r); setFailed(null); })
      .catch(e => { setRecords([]); setFailed(e instanceof Error ? e.message : String(e)); });
  }, [connId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const runs = useMemo(() => recentRuns(records ?? [], RECENT), [records]);
  // What each run does, in words — read from the statement on the server, no query and no model. Until it arrives,
  // or for a statement that does not say, the row is the statement alone.
  const [titles, setTitles] = useState<Record<string, string>>({});
  const runKey = runs.map(r => r.sql).join("\u0000");
  useEffect(() => {
    if (!connId || !runs.length) return;
    let alive = true;
    describeStatements(connId, runs.map(r => r.sql))
      .then(t => { if (alive) setTitles(Object.fromEntries(runs.map((r, i) => [r.sql, t[i] ?? ""]))); })
      .catch(() => { /* the statements still show; only their words are missing */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, runKey]);
  const distinct = useMemo(() => recentRuns(records ?? [], Number.MAX_SAFE_INTEGER).length, [records]);
  const where = connectionName || "this connection";

  const count = (n: number | null) => n ? <span style={{ ...MUTED, ...NUM }}>{formatCount(n)}</span> : null;

  const recentList = records === null ? <Loading what="recent runs" />
    : failed !== null ? <ReadFailed what="the recent runs" error={failed} onRetry={load} />
    : runs.length === 0 ? (
      <EmptyState icon="history" title={`Nothing has run on ${where} yet`}>
        The statements you run in the SQL editor show up here, newest first — each opens again in a new tab.
      </EmptyState>
    )
    : (
      <>
        {runs.map((r, i) => {
          const mark = runMark(r.last);
          const words = titles[r.sql];
          return (
            // Two lines a run: what it does, in words, with what it returned at the right; then the statement.
            <Button key={r.last.id} variant="plain" className={ROW_BTN} style={i ? RULE : undefined}
              title="Open this statement in a new tab" onClick={() => onOpenRun(r.sql)}>
              <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span className="aug-fs-ui" data-testid="query-start-run-words"
                  style={{ ...ONE_LINE, flex: "1 1 0%", color: "var(--t1)",
                    ...(words ? {} : { fontFamily: "var(--font-mono)" }) }}>
                  {words || r.preview}
                </span>
                {mark && <Chip tone={mark.tone === "red" ? "down" : "amber"}
                  title={r.last.error ?? undefined}>{mark.word}</Chip>}
                <span className="aug-fs-xs" style={{ ...MUTED, ...NUM, flexShrink: 0, whiteSpace: "nowrap" }}>
                  {[runMeta(r.last), r.last.ts ? `${relTime(r.last.ts)} ago` : ""].filter(Boolean).join(" · ")}
                  {r.times > 1 && <span title={`Run ${r.times} times among the latest`}> · ×{r.times}</span>}
                </span>
              </span>
              {words && (
                <span className="aug-fs-xs" data-testid="query-start-run-sql" style={MONO_LINE}>{r.preview}</span>
              )}
            </Button>
          );
        })}
        {distinct > runs.length && (
          <div className="aug-fs-xs" style={{ ...MUTED, ...RULE, paddingTop: 6 }}>
            The latest {formatCount(runs.length)} of {formatCount(distinct)} — + ▸ Open existing… searches them all
          </div>
        )}
      </>
    );

  const savedList = saved === undefined ? <Loading what="saved queries" />
    : saved === null ? <Empty>The saved queries could not be read.</Empty>
    : saved.length === 0 ? (
      <EmptyState icon="bookmark" title={`None saved for ${where} yet`}>
        Save names the open tab&apos;s query and keeps it here — it opens again in a new tab, and Save updates it.
      </EmptyState>
    )
    : saved.map((q, i) => (
      <Button key={q.id} variant="plain" className={ROW_BTN} style={i ? RULE : undefined}
        title="Open this saved query — Save updates it" onClick={() => onOpenSaved(q)}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="aug-fs-ui" style={{ ...ONE_LINE, flex: "1 1 0%", color: "var(--t1)" }}>{q.name}</span>
          <span className="aug-fs-xs" style={{ ...MUTED, flexShrink: 0, whiteSpace: "nowrap" }}>
            {isVisualQuery(q) ? "visual" : "sql"}{q.updated_at ? ` · ${relTime(q.updated_at)} ago` : ""}
          </span>
        </span>
        {q.sql.trim() && (
          <span className="aug-fs-xs" style={MONO_LINE}>{q.sql.replace(/\s+/g, " ").trim()}</span>
        )}
      </Button>
    ));

  return (
    <div data-testid="query-start" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "var(--bg-0)",
      padding: "20px 22px 28px" }}>
      <h2 className="aug-fs-h2" style={HEADING}>Create new</h2>
      {/* A card with an edge, at rest: the one way to begin, as the strip's + ▸ New query begins. */}
      <Button variant="outline" data-testid="query-start-new" onClick={onNewQuery} disabled={!connId}
        title={connId ? "Opens an empty query tab" : "Choose a connection first"}
        className="aug-fs-ui h-auto justify-start"
        style={{ gap: 10, padding: "14px 18px", minWidth: 220, borderRadius: "var(--r3)" }}>
        <Icon name="sql" size={18} />
        SQL query
      </Button>

      {/* Quick access, and the catalog beside it — under it where the pane is narrow */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "28px 32px", marginTop: 28, alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 520px", minWidth: 0 }}>
          <h2 className="aug-fs-h2" style={HEADING}>Quick access</h2>
          {!connId ? (
            <EmptyState icon="db" title="Choose a connection to start">
              The statements run on it and the queries saved for it show up here.
            </EmptyState>
          ) : (
            <>
              <Segmented label="Quick access" value={view} onChange={setView} options={[
                { value: "recent", label: <>Recent {count(distinct)}</>, title: "Statements run here lately, newest first" },
                { value: "saved", label: <>Saved {count(saved?.length ?? null)}</>, title: "The queries saved for this connection" },
              ]} />
              <section aria-label={view === "recent" ? "Recent runs" : "Saved queries"}
                data-testid={view === "recent" ? "query-start-runs" : "query-start-saved"}
                style={{ ...CARD, marginTop: 12 }}>
                {view === "recent" ? recentList : savedList}
              </section>
            </>
          )}
        </div>
        {connId && onOpenTable && (
          <section aria-label="Catalog" data-testid="query-start-catalog" style={{ flex: "1 1 400px", minWidth: 0 }}>
            <h2 className="aug-fs-h2" style={HEADING}>Catalog</h2>
            <div style={CARD}>
              <CatalogFigures tables={tables} joins={joins} loading={tablesLoading} where={where} onOpenTable={onOpenTable} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
