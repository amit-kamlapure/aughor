"use client";

/**
 * One table, as the Evidence → Action study draws an asset (§11.1, the user's choice 2026-11-10: "overhaul other
 * screens too based on the UI/UX study" — Evidence → Action, the Catalog first). The title row: "‹ schema", the
 * table's name, its business object, and its quick actions — Open in SQL, Ask about it, Tools ▾ (Copy identifier,
 * the column tools, favourite, remove). Then its views, in the study's order:
 *
 *   Overview · Columns · Preview · Lineage · Usage · Findings · Business mapping · Docs · Activity
 *
 * Every view of the page before it is still here (`design-mockups/evidence-to-action/inventory/PARITY.md`): the four
 * figures and an About card on the Overview; the columns' meanings and marks joined to the column list, its type
 * editor and each numeric column's distribution (with Profile beside List) under Columns; the sample grid as Preview;
 * the lifecycle under Business mapping, with the metrics that read the table and the links its columns make; the
 * layer, the on/off switch and the schema's runs under Activity. Lineage reads what depends on the table
 * (`/graph/lineage`); Usage reads the SQL audit log. What the platform does not record is said — "Not configured",
 * "Not recorded" — never filled in. The study's Quality and Permissions views are not drawn: no per-table checks or
 * grants exist to show, and an empty view is a promise the page cannot keep.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, Chip, Dot, Empty, Facts, Figure, Figures, Label, MUTED, NotSet, NUM, ONE_LINE, Page, ROW, RULE } from "@/components/clarity/kit";
import {
  ColumnDistribution, FilterBox, LIST_CELL, LIST_HEAD, PAIR, PanelHead, SampleGrid, ToolsMenu, useFavorite, type ToolItem,
} from "@/components/catalog/CatalogTools";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { useOpenInQuery } from "@/lib/openInQuery";
import { tableStarter } from "@/lib/query/workbench";
import { GlossaryPanel } from "@/components/catalog/GlossaryPanel";
import { programLine, TableProgram } from "@/components/DatasetProgram";
import { Chevron } from "@/components/icons/catalog";
import { ColumnTypeIcon } from "@/components/icons/columnType";
import { SchemaShape } from "@/components/SchemaShape";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/motion";
import { Segmented } from "@/components/ui/segmented";
import { SelectField } from "@/components/ui/select";
import { Loading, ReadFailed } from "@/components/ui/states";
import { TabStrip } from "@/components/ui/tab-strip";
import { ChromeToolbar, useInShell } from "@/components/shell/PageChrome";
import {
  alterColumn, deleteConnectionTable, getExplorationFindings, getGlossary, getGraphLineage, getMetrics, getOntology,
  getQueryHistory, getSchemaRich, getTableColumns, listGovernedTags, lookupGlossaryTable, type GlossaryTable,
  type AuditRecord, type CatalogTableInfo, type DatasetsView, type DistributionProfile, type GovernedTag, type GraphLineage,
  type Metric, type OntologyEntity, type OntologyGraph, type OntologyRelationship, type SchemaColumn, type SchemaTable,
  type TableColumn,
} from "@/lib/api";
import {
  approvedMetrics, columnMarks, columnRows, findingsAbout, findingsIn, itemKey, lifecycleOf, metricsReading, objectFor,
  objectWords, objectsByTable, ofCount, readsTable, type ColumnRow, type TableFinding,
} from "@/lib/catalogSummary";
import { compactNumber, countNoun, formatCount, isNumericType, utcDayWords } from "@/lib/format";
import { dayWords } from "@/lib/home";
import { withUniqueKeys } from "@/lib/listKeys";
import { richSchemaKey, useRichSchema } from "@/lib/schema-context";
import { bare } from "@/lib/tableName";

/** The types a person may set a column to, in the Columns tab's editor. */
const TYPE_OPTIONS = [
  "VARCHAR", "TEXT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT",
  "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "BOOLEAN",
  "DATE", "TIMESTAMP", "TIME", "TIMESTAMPTZ", "INTERVAL",
  "BLOB", "JSON", "UUID",
];

type Tab = "overview" | "columns" | "preview" | "lineage" | "usage" | "findings" | "mapping" | "docs" | "activity";

export function CatalogTable({ connId, catalogName, schemaName, table, view, onAsk, onRemoved, onProgramChanged }: {
  connId: string;
  catalogName: string;
  schemaName: string;
  table: CatalogTableInfo;
  view: DatasetsView | null | undefined;
  onAsk?: (table: string, connId: string) => void;
  onRemoved?: () => void;
  onProgramChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const inShell = useInShell();
  const [colsMode, setColsMode] = useState<"list" | "profile">("list");
  const [baseCols, setBaseCols] = useState<TableColumn[]>([]);
  const [colsLoading, setColsLoading] = useState(true);
  const [richTable, setRich] = useState<SchemaTable | null>(null);
  const [distMap, setDistMap] = useState<Record<string, DistributionProfile>>({});
  const [findings, setFindings] = useState<TableFinding[] | null | undefined>(undefined);
  const [findingsRead, setFindingsRead] = useState(0);
  const [metrics, setMetrics] = useState<Metric[] | null | undefined>(undefined);
  const [graph, setGraph] = useState<OntologyGraph | null | undefined>(undefined);
  const fav = useFavorite(itemKey.table(connId, schemaName, table.name));
  // One shared read per connection, serving the columns' descriptions and FK flags.
  const { schema: catalogSchema } = useRichSchema(connId);
  const qc = useQueryClient();

  // The authoritative column list comes from the per-table reader (the Sample's path); the connection's rich schema
  // only layers on FK flags and descriptions.
  useEffect(() => {
    setColsLoading(true);
    setBaseCols([]);
    getTableColumns(connId, table.name, schemaName)
      .then(setBaseCols)
      .catch(err => { console.error("[Catalog] getTableColumns failed:", err); setBaseCols([]); })
      .finally(() => setColsLoading(false));
  }, [connId, schemaName, table.name]);

  useEffect(() => { setRich(catalogSchema?.tables.find(t => t.name === table.name) ?? null); }, [catalogSchema, table.name]);

  // The explorer's read: each numeric column's distribution, and its findings. Its distributions are keyed
  // "<table>:<column>", where <table> may be schema-qualified, so they are matched on the bare name.
  useEffect(() => {
    let alive = true;
    setDistMap({});
    setFindings(undefined);
    getExplorationFindings(connId)
      .then(f => {
        if (!alive) return;
        const m: Record<string, DistributionProfile> = {};
        const target = bare(table.name);
        for (const [key, d] of Object.entries(f.distributions ?? {})) {
          const sep = key.lastIndexOf(":");
          if (sep < 0) continue;
          const tbl = key.slice(0, sep), col = key.slice(sep + 1);
          if (bare(tbl) === target && col && d.shape !== "unknown") m[col] = d;
        }
        setDistMap(m);
        setFindings(findingsIn(f));
      })
      .catch(() => { if (alive) { setDistMap({}); setFindings(null); } });
    return () => { alive = false; };
  }, [connId, table.name, findingsRead]);

  useEffect(() => {
    let alive = true;
    setMetrics(undefined);
    getMetrics(connId).then(m => { if (alive) setMetrics(m); }).catch(() => { if (alive) setMetrics(null); });
    return () => { alive = false; };
  }, [connId]);

  useEffect(() => {
    let alive = true;
    setGraph(undefined);
    getOntology(connId, schemaName).then(g => { if (alive) setGraph(g); }).catch(() => { if (alive) setGraph(null); });
    return () => { alive = false; };
  }, [connId, schemaName]);

  // Unify: the per-table columns, enriched with the rich schema's FK flags and descriptions.
  const enrich = new Map((richTable?.columns ?? []).map(c => [c.name, c]));
  const cols: SchemaColumn[] = baseCols.length
    ? baseCols.map(b => {
        const e = enrich.get(b.name);
        const type = b.type?.trim?.() ? b.type : undefined;
        return { ...(e ?? {}), name: b.name, type: type ?? e?.type ?? "" } as SchemaColumn;
      })
    : (richTable?.columns ?? []);

  const entity = useMemo(() => (graph ? objectFor(objectsByTable([graph]), [graph], schemaName, table.name) : null),
    [graph, schemaName, table.name]);
  const rows = columnRows(cols, entity, Object.values(graph?.relationships ?? {}), table.name);
  const lifecycle = lifecycleOf(entity);
  const ds = view?.schemas.find(s => s.name === schemaName);
  const dt = ds?.tables.find(t => t.name === table.name);
  const reading = metrics ? metricsReading(approvedMetrics(metrics, schemaName), table.name) : null;
  const questions = ofCount(dt?.maturity.questions.note, "questions");
  const about = findings ? findingsAbout(findings, table.name, entity?.id ?? null) : null;
  const objectName = entity ? objectWords(entity.id, entity.display_name) : null;

  const handleSave = async (colName: string, type: string) => {
    if (!type.trim() || type.trim() === (cols.find(c => c.name === colName)?.type ?? "")) return;
    const res = await alterColumn(connId, table.name, colName, type.trim(), schemaName);
    const [refreshed, rich] = await Promise.all([
      getTableColumns(connId, table.name, schemaName),
      // Deliberately NOT the cached read: this runs right after the ALTER and needs the shape after it. The cache is
      // invalidated below so every other reader stops serving the shape from before.
      getSchemaRich(connId).then(s => s.tables.find(t => t.name === table.name) ?? null).catch(() => null),
    ]);
    qc.invalidateQueries({ queryKey: richSchemaKey(connId) });
    setBaseCols(refreshed);
    if (rich) setRich(rich);
    // Honest when the change is a display-only override (a connector that cannot ALTER).
    if (res && res.applied === false && res.message) alert(res.message);
  };

  // What the warehouse calls it, for Copy identifier and Open in SQL: the name as listed when it is qualified, else
  // schema.table.
  const identifier = table.name.includes(".") || !schemaName ? table.name : `${schemaName}.${table.name}`;
  const openInQuery = useOpenInQuery();
  const openInSql = openInQuery
    ? () => openInQuery({ sql: tableStarter(identifier), connId, mode: "sql", name: bare(table.name) })
    : undefined;
  const copyIdentifier = () => {
    try { void navigator.clipboard?.writeText(identifier); toast.success(`Copied ${identifier}`); }
    catch { toast.error("This browser would not copy it"); }
  };
  // The table's own description and grain, from the glossary Docs edits (`/glossary`).
  const docsOpen = tab === "docs";
  const [gloss, setGloss] = useState<GlossaryTable | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setGloss(undefined);
    getGlossary().then(g => { if (alive) setGloss(lookupGlossaryTable(g, bare(table.name), schemaName) ?? null); })
      .catch(() => { if (alive) setGloss(null); });
    return () => { alive = false; };
  }, [table.name, schemaName, docsOpen]);   // read again on leaving Docs, where it is edited
  // The table's governed tags (`table:{connection}.{schema}.{table}` — `metastore/models.table_securable`).
  const [tags, setTags] = useState<GovernedTag[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setTags(undefined);
    listGovernedTags({ securablePrefix: `table:${connId}.${schemaName}.${bare(table.name)}` })
      .then(t => { if (alive) setTags(t); }).catch(() => { if (alive) setTags(null); });
    return () => { alive = false; };
  }, [connId, schemaName, table.name]);

  const tools: ToolItem[] = [
    { label: "Copy identifier", onSelect: copyIdentifier, title: identifier, testId: "tool-copy-identifier" },
    { label: "Edit column types", onSelect: () => { setTab("columns"); setColsMode("list"); }, title: "Click a column's type to change it", apart: true },
    { label: "Profile its columns", onSelect: () => { setTab("columns"); setColsMode("profile"); },
      title: "Each column's empty share, distinct values and shape" },
    { label: fav.on ? "Remove from favorites" : "Add to favorites", onSelect: fav.toggle, apart: true },
    { label: "Remove table…", danger: true, apart: true, hidden: !onRemoved, testId: "tool-remove-table", onSelect: async () => {
      if (!confirm(`Remove table "${table.name}" from the workspace? This drops the table and deletes its uploaded file.`)) return;
      try { await deleteConnectionTable(connId, table.name, schemaName); onRemoved?.(); }
      catch (e) { alert((e as Error).message); }
    } },
  ];

  const readers = metrics ? metricsOf(approvedMetrics(metrics, schemaName), table.name) : null;
  const links = useMemo(() => linksOf(Object.values(graph?.relationships ?? {}), table.name, entity), [graph, table.name, entity]);
  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "columns", label: cols.length ? `Columns · ${formatCount(cols.length)}` : "Columns" },
    { id: "preview", label: "Preview" },
    { id: "lineage", label: "Lineage" },
    { id: "usage", label: "Usage" },
    { id: "findings", label: about?.length ? `Findings · ${formatCount(about.length)}` : "Findings" },
    { id: "mapping", label: "Business mapping" },
    { id: "docs", label: "Docs" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--bg-0)" }}>
      <PanelHead testId="catalog-table-head" crumbs={[catalogName, schemaName]} name={table.name} mono
        chips={<>
          {objectName
            ? <Chip title={`The business object read from ${table.name}`} testId="catalog-table-object">{objectName}</Chip>
            : graph !== undefined && <Chip title="No business object is read from this table">Not mapped</Chip>}
        </>}
        actions={<>
          {openInSql && (
            <Button variant="outline" size="xs" data-testid="catalog-open-in-sql" onClick={openInSql}
              title={`Open ${tableStarter(identifier)} in a new SQL Editor tab, on ${catalogName}`}>
              <Icon name="sql" size={12} /> Open in SQL
            </Button>
          )}
          {onAsk && <Button variant="secondary" size="xs" onClick={() => onAsk(table.name, connId)}>Ask about it</Button>}
          <ToolsMenu items={tools} />
        </>} />
      {/* the views: inside the app, the shell's toolbar row (2026-11-10, ROADMAP §6 item 64) */}
      {inShell
        ? <ChromeToolbar><TabStrip label={`${table.name} views`} value={tab} onChange={setTab} className="aug-layer-tabs" tabs={TABS} /></ChromeToolbar>
        : <TabStrip label={`${table.name} views`} value={tab} onChange={setTab} style={{ padding: "0 14px", flexShrink: 0 }} tabs={TABS} />}

      {tab === "docs" ? (
        <GlossaryPanel table={bare(table.name)} columns={cols.map(c => c.name)} schema={schemaName} connectionId={connId} />
      ) : tab === "preview" ? (
        <SampleGrid connId={connId} tableName={table.name} schemaName={schemaName} />
      ) : tab === "columns" && colsMode === "profile" ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 22px 0" }}><ColumnsMode value={colsMode} onChange={setColsMode} /></div>
          <SchemaShape connectionId={connId} schemaTables={[table.name]} />
        </div>
      ) : (
        <Page testId={`catalog-table-${tab}`}>
          {tab === "overview" && (
            <>
              <Figures testId="catalog-table-figures">
                <Figure label="Rows" value={table.row_count == null ? "—" : compactNumber(Number(table.row_count))} testId="fig-table-rows"
                  sub={table.row_count == null ? "not counted" : `${formatCount(Number(table.row_count))} in all`} />
                <Figure label="Columns" value={colsLoading ? "—" : formatCount(cols.length)} testId="fig-table-columns"
                  sub={colsLoading ? "reading…" : cols.length ? columnMarks(rows) : "could not be read"} />
                <Figure label="Metrics read it" value={reading == null ? "—" : formatCount(reading)} testId="fig-table-metrics"
                  title="Approved metrics that read this table" onOpen={() => setTab("mapping")}
                  sub={metrics === undefined ? "reading…" : reading == null ? "could not be read"
                    : !reading ? "no approved metric reads it" : dt?.maturity.time.note ?? "approved"} />
                <Figure label="Questions" value={questions ? formatCount(questions.n) : "—"} testId="fig-table-questions"
                  sub={questions ? `of ${formatCount(questions.of)} asked of it`
                    : dt ? (dt.maturity.questions.note === "no question on its own" ? "none asked of it alone" : dt.maturity.questions.note)
                    : view === undefined ? "reading…" : "not read"} />
              </Figures>
              <Card label="About" testId="catalog-table-about">
                <Facts rows={[
                  ["Identifier", <span key="id" style={{ ...ROW, flexWrap: "nowrap", minWidth: 0 }}>
                    <span style={{ ...ONE_LINE, fontFamily: "var(--font-mono)", color: "var(--t1)" }} title={identifier}>{identifier}</span>
                    <Button variant="ghost" size="icon-xs" aria-label={`Copy ${identifier}`} title="Copy identifier" onClick={copyIdentifier}>
                      <Icon name="copy" size={12} />
                    </Button>
                  </span>],
                  ["Source", `${catalogName} · ${schemaName || "no schema"}`],
                  ["Description", gloss === undefined ? "Reading…" : gloss?.description?.trim()
                    || <NotSet key="d" what="No description is written for it — Docs is where it is written" />],
                  ["Grain", gloss === undefined ? "Reading…" : gloss?.grain?.trim()
                    || <NotSet key="g" what="Its grain (what one row is) is not written — Docs is where it is written" />],
                  ["Business object", objectName ?? (graph === undefined ? "Reading…" : <NotSet key="o" word="Not mapped"
                    what={graph === null ? "The ontology is not built for this schema" : "No business object is read from this table"} />)],
                  ["Owner", <NotSet key="ow" what="No owner is recorded for a table" />],
                  ["Tags", tags === undefined ? "Reading…" : tags === null ? <NotSet key="t" word="Not available" what="The tags could not be read" />
                    : tags.length ? <span key="tg" style={{ ...ROW }}>{tags.map(t => <Chip key={`${t.key}=${t.value}`} title={`Set by ${t.set_by}`}>{t.value ? `${t.key}: ${t.value}` : t.key}</Chip>)}</span>
                    : <NotSet key="t" what="No governed tag is set on it" />],
                  ["Layer", dt ? (dt.layer.effective || "—") : view === undefined ? "Reading…" : <NotSet key="l" word="Not available" what="The datasets do not list it" />],
                  ["Size", table.row_count == null ? <NotSet key="s" word="Not counted" what="Its rows have not been counted" />
                    : `${formatCount(Number(table.row_count))} rows · ${countNoun(cols.length, "column")}`],
                  ["Metadata", colsLoading ? "Reading…" : cols.length
                    ? `${formatCount(rows.filter(r => r.means).length)} of ${countNoun(cols.length, "column")} described`
                    : <NotSet key="m" word="Not available" what="Its columns could not be read" />],
                ]} />
              </Card>
            </>
          )}
          {tab === "columns" && (
            <ColumnsList cols={cols} rows={rows} loading={colsLoading} distMap={distMap} onSave={handleSave}
              mode={<ColumnsMode value={colsMode} onChange={setColsMode} />} />
          )}
          {tab === "lineage" && <LineageView connId={connId} table={table.name} schemaName={schemaName} catalogName={catalogName} />}
          {tab === "usage" && <UsageView connId={connId} table={table.name} catalogName={catalogName} />}
          {tab === "findings" && (
            <Card label={about ? countNoun(about.length, "finding") : "Findings"} right="what the explorer found reading it"
              testId="catalog-table-findings">
              {findings === undefined ? <Loading what="the findings" />
                : findings === null || !about ? <ReadFailed what="the findings" onRetry={() => setFindingsRead(n => n + 1)} />
                : about.length === 0 ? <Empty>No finding has read this table yet.</Empty>
                : withUniqueKeys(about, f => f.id).map(([key, f], i) => (
                  <div key={key} data-testid="catalog-table-finding" style={{ padding: "8px 0", ...(i ? RULE : {}) }}>
                    <div style={{ ...ROW, flexWrap: "nowrap" }}>
                      <span className="aug-fs-sm" title={f.question || f.angle} style={{ ...ONE_LINE, color: "var(--t1)", fontWeight: 500 }}>
                        {f.angle && f.angle !== "pinned-question" ? f.angle : f.question || f.domain || "Finding"}
                      </span>
                      {f.domain && <Chip>{f.domain}</Chip>}
                      {f.generated_at && <span className="aug-fs-xs" style={{ ...MUTED, marginLeft: "auto", whiteSpace: "nowrap" }}>
                        {dayWords(f.generated_at)}</span>}
                    </div>
                    <div className="aug-fs-sm" title={f.finding} style={{ color: "var(--t2)", ...ONE_LINE }}>{f.finding}</div>
                  </div>
                ))}
            </Card>
          )}
          {tab === "mapping" && (
            <>
              <Card label="Business object" testId="catalog-mapping-object"
                right={entity ? <Chip tone="up" title="Read from this table by the ontology">Mapped</Chip> : graph !== undefined ? "Not mapped" : undefined}>
                {graph === undefined ? <Loading what="the ontology" />
                  : graph === null ? <Empty>The ontology is not built for this schema.</Empty>
                  : !entity ? <Empty>No business object is read from this table.</Empty>
                  : <Facts rows={[
                    ["Object", objectName ?? entity.id],
                    ["Identity key", entity.identity_key || <NotSet key="k" what="The ontology records no key for it" />],
                    ["Read from", (entity.source_tables ?? []).join(", ") || table.name],
                    ["Links", links.length ? <span key="ln" style={{ ...ROW }}>{links.map(l => (
                      <Chip key={l.key} tone="accent" title={l.title}>{l.words}</Chip>))}</span>
                      : <NotSet key="lk" word="None" what="No link to another object is read from it" />],
                  ]} />}
              </Card>
              <div style={PAIR}>
                <Card label={lifecycle ? `Lifecycle · ${lifecycle.column}` : "Lifecycle"} testId="catalog-table-lifecycle"
                  style={{ flex: "1 1 260px" }}
                  right={lifecycle ? `${lifecycle.ends} of ${countNoun(lifecycle.states.length, "state")} end it` : undefined}>
                  {graph === undefined ? <Loading what="the ontology" />
                    : graph === null ? <Empty>The ontology is not built for this schema.</Empty>
                    : !entity ? <Empty>No business object is read from this table.</Empty>
                    : !lifecycle ? <Empty>{`${objectName} has no lifecycle the platform has read.`}</Empty>
                    : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                          {lifecycle.states.map((s, i) => (
                            <div key={`${i}-${s.name}`} style={{ display: "contents" }}>
                              <span className="aug-fs-sm" style={{ ...ROW, flexWrap: "nowrap", padding: "6px 0", ...(i ? RULE : {}) }}>
                                <Dot hue={s.ends ? "grey" : "blue"} />{s.name}
                              </span>
                              <span className="aug-fs-xs" style={{ ...MUTED, padding: "6px 0", textAlign: "right", ...(i ? RULE : {}) }}>
                                {s.ends ? "ends" : "open"}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 8 }}>How many sit in each state is not read here.</div>
                      </>
                    )}
                </Card>
                <Card label={readers ? `Metrics that read it · ${formatCount(readers.length)}` : "Metrics that read it"}
                  testId="catalog-table-metrics" style={{ flex: "2 1 460px" }} right="approved, by the tables each declares">
                  {metrics === undefined ? <Loading what="the metrics" />
                    : readers === null ? <Empty>The metrics could not be read.</Empty>
                    : readers.length === 0 ? <Empty>No approved metric reads this table.</Empty>
                    : withUniqueKeys(readers, m => m.name).map(([key, m], i) => (
                      <div key={key} className="aug-fs-sm" style={{ ...ROW, flexWrap: "nowrap", padding: "6px 0", ...(i ? RULE : {}) }}>
                        <span style={{ ...ONE_LINE, color: "var(--t1)" }} title={m.name}>{m.label || m.name}</span>
                        <span className="aug-fs-xs" style={{ ...MUTED, marginLeft: "auto", whiteSpace: "nowrap" }}>
                          {m.owner ? `owner ${m.owner}` : "no owner recorded"}
                        </span>
                      </div>
                    ))}
                </Card>
              </div>
            </>
          )}
          {tab === "activity" && (
            <>
              <Card label="Layer and analysis" testId="catalog-table-history">
                {view === undefined ? <Loading what="its datasets" />
                  : view === null ? <Empty>Its datasets could not be read.</Empty>
                  : !dt ? <Empty>The datasets do not list this table.</Empty>
                  : <TableProgram connId={connId} schema={schemaName} t={dt} view={view} schemaOff={!!ds?.off} onChanged={onProgramChanged} />}
              </Card>
              <Card label={`Runs over ${schemaName}`} testId="catalog-table-runs">
                {ds ? (programLine(ds).length
                  ? programLine(ds).map((l, i) => (
                    <div key={`${i}-${l}`} className="aug-fs-sm" style={{ color: "var(--t2)", padding: "6px 0", ...(i ? RULE : {}) }}>{l}</div>
                  ))
                  : <Empty>Nothing has run over it yet.</Empty>)
                  : <Empty>{view === undefined ? "Reading…" : "Not read."}</Empty>}
              </Card>
            </>
          )}
        </Page>
      )}
    </div>
  );
}

/** The approved metrics that declare they read `table`. */
function metricsOf(metrics: Metric[], table: string): Metric[] {
  const t = bare(table);
  return metrics.filter(m => (m.tables ?? []).some(x => bare(x) === t));
}

/** The links the ontology reads from or into this table, each said from this table's side — "placed by → users" for
 *  one it makes, "← order_items · belongs to" for one made into it — once each (two relationships can say the same). */
function linksOf(rels: OntologyRelationship[], table: string, entity: OntologyEntity | null):
  { key: string; words: string; title: string }[] {
  const t = bare(table);
  const out = new Map<string, { key: string; words: string; title: string }>();
  for (const r of rels) {
    const from = bare(r.from_table) === t || (!!entity && r.from_entity === entity.id && bare(r.to_table) !== t);
    const into = !from && (bare(r.to_table) === t || (!!entity && r.to_entity === entity.id));
    if (!from && !into) continue;
    const words = from ? `${r.verb} → ${r.to_table}` : `← ${r.from_table} · ${r.verb}`;
    if (!out.has(words)) out.set(words, {
      key: words, words, title: `${r.from_table}.${r.from_col} → ${r.to_table}.${r.to_col} · ${r.cardinality} · ${r.join_confidence}`,
    });
  }
  return [...out.values()];
}

// ── Lineage: what depends on the table ───────────────────────────────────────────────────────────────────────────

const LINEAGE_GRID = {
  display: "grid", gridTemplateColumns: "minmax(90px, 120px) minmax(0, 1.4fr) 56px minmax(0, 1fr)", alignItems: "stretch",
} as const;

function LineageView({ connId, table, schemaName, catalogName }: {
  connId: string; table: string; schemaName: string; catalogName: string;
}) {
  const [read, setRead] = useState<GraphLineage | null | undefined>(undefined);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setRead(undefined);
    getGraphLineage(connId, { table: bare(table), schemaName })
      .then(l => { if (alive) setRead(l); }).catch(() => { if (alive) setRead(null); });
    return () => { alive = false; };
  }, [connId, table, schemaName, again]);
  const kinds = read ? Object.entries(read.counts_by_kind).filter(([, n]) => n > 0) : [];
  return (
    <>
      <Card label="Upstream" testId="catalog-lineage-upstream">
        <div className="aug-fs-sm" style={{ color: "var(--t2)" }}>
          {`Read straight from ${catalogName}${schemaName ? ` · ${schemaName}` : ""}. `}
          <span style={MUTED}>No transformation that writes it is recorded here.</span>
        </div>
      </Card>
      <Card label={read ? `Downstream · ${formatCount(read.dependents.length)}` : "Downstream"} testId="catalog-lineage-downstream"
        right={kinds.length ? kinds.map(([k, n]) => countNoun(n, k)).join(" · ") : "what reads it, and would break if it changed"}>
        {read === undefined ? <Loading what="its lineage" />
          : read === null ? <ReadFailed what="its lineage" onRetry={() => setAgain(n => n + 1)} />
          : read.dependents.length === 0 ? <Empty>Nothing the platform knows of reads this table yet.</Empty>
          : (
            <>
              <div className="aug-fs-sm" style={LINEAGE_GRID} data-testid="catalog-lineage-list">
                <span className="aug-fs-xs" style={LIST_HEAD}>Kind</span>
                <span className="aug-fs-xs" style={LIST_HEAD}>Name</span>
                <span className="aug-fs-xs" style={{ ...LIST_HEAD, textAlign: "right" }}>Hops</span>
                <span className="aug-fs-xs" style={LIST_HEAD}>Where it reads it</span>
                {withUniqueKeys(read.dependents, d => d.node_id).map(([key, d]) => (
                  <div key={key} style={{ display: "contents" }}>
                    <span style={{ ...LIST_CELL, ...MUTED }}>{d.kind}</span>
                    {/* the cell is a flex column, so its text is its own line, which is what ellipsis cuts */}
                    <span style={{ ...LIST_CELL, color: "var(--t1)" }} title={d.label}><span style={ONE_LINE}>{d.label}</span></span>
                    <span style={{ ...LIST_CELL, ...NUM, justifyContent: "flex-end", color: "var(--t3)" }}>{formatCount(d.depth)}</span>
                    <span style={{ ...LIST_CELL, fontFamily: d.site ? "var(--font-mono)" : undefined, color: "var(--t3)" }}
                      title={d.site || d.via}><span style={ONE_LINE}>{d.site || d.via || "—"}</span></span>
                  </div>
                ))}
              </div>
              {read.truncated && <div className="aug-fs-xs" style={{ ...MUTED, marginTop: 8 }}>The list is cut short; more depend on it.</div>}
            </>
          )}
      </Card>
    </>
  );
}

// ── Usage: the statements in the SQL audit log that read the table ───────────────────────────────────────────────

/** How many of the latest audited statements are read for Usage — said on the page, so its counts are not taken as
 *  all-time. */
const USAGE_WINDOW = 500;
const SURFACE: Record<string, string> = {
  query_workbench: "SQL Editor", query_builder: "Visual builder", dashboard: "Dashboards", sheets: "Spreadsheets",
};
const surfaceOf = (label: string) => SURFACE[label] ?? (label.startsWith("__") ? "the platform's own checks" : label || "unlabelled");

function UsageView({ connId, table, catalogName }: { connId: string; table: string; catalogName: string }) {
  const [log, setLog] = useState<AuditRecord[] | null | undefined>(undefined);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let alive = true;
    setLog(undefined);
    getQueryHistory(connId, USAGE_WINDOW, "")
      .then(r => { if (alive) setLog(r); }).catch(() => { if (alive) setLog(null); });
    return () => { alive = false; };
  }, [connId, again]);
  const named = useMemo(() => {
    if (!log) return null;
    return log.filter(r => readsTable(r.sql_written || r.sql_full || "", table));
  }, [log, table]);
  const bySurface = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of named ?? []) m.set(surfaceOf(r.hypothesis_id), (m.get(surfaceOf(r.hypothesis_id)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [named]);
  return (
    <Card label={named ? `Statements that read it · ${formatCount(named.length)}` : "Usage"} testId="catalog-usage"
      right={log ? `of the latest ${formatCount(log.length)} audited on ${catalogName}` : undefined}>
      {log === undefined ? <Loading what="the audit log" />
        : log === null || !named ? <ReadFailed what="the audit log" onRetry={() => setAgain(n => n + 1)} />
        : named.length === 0 ? <Empty>{`None of the latest ${formatCount(log.length)} statements on ${catalogName} reads this table.`}</Empty>
        : (
          <>
            <Facts rows={[
              ["Last read", utcDayWords(named[0].ts, true) || named[0].ts],
              ["By", bySurface.map(([s, n]) => `${s} ${formatCount(n)}`).join(" · ")],
              ["Failed", `${formatCount(named.filter(r => r.error).length)} of ${formatCount(named.length)}`],
            ]} />
            <div style={{ marginTop: 12 }}>
              <Label right={named.length > 20 ? `the latest 20 of ${formatCount(named.length)}` : undefined}>Latest</Label>
              {named.slice(0, 20).map((r, i) => (
                <div key={r.id} data-testid="catalog-usage-row" style={{ ...ROW, flexWrap: "nowrap", padding: "6px 0", ...(i ? RULE : {}) }}>
                  <span className="aug-fs-xs" style={{ ...MUTED, whiteSpace: "nowrap", width: 150, flexShrink: 0 }}>{utcDayWords(r.ts, true)}</span>
                  <span className="aug-fs-xs" style={{ ...MUTED, whiteSpace: "nowrap", width: 120, flexShrink: 0, ...ONE_LINE }}>{surfaceOf(r.hypothesis_id)}</span>
                  <span className="aug-fs-sm" style={{ ...ONE_LINE, fontFamily: "var(--font-mono)", color: r.error ? "var(--red4)" : "var(--t2)" }}
                    title={r.error ? `${r.error}\n\n${r.sql_written || r.sql_full}` : r.sql_written || r.sql_full}>
                    {(r.sql_written || r.sql_full).replace(/\s+/g, " ")}
                  </span>
                  <span className="aug-fs-xs" style={{ ...MUTED, ...NUM, marginLeft: "auto", whiteSpace: "nowrap" }}>
                    {r.error ? "failed" : r.row_count == null ? "" : countNoun(r.row_count, "row")}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
    </Card>
  );
}

function ColumnsMode({ value, onChange }: { value: "list" | "profile"; onChange: (v: "list" | "profile") => void }) {
  return <Segmented label="Columns view" value={value} onChange={onChange}
    options={[{ value: "list", label: "List" }, { value: "profile", label: "Profile", title: "Each column's empty share, distinct values and shape" }]} />;
}

// ── Columns: the list, its type editor and each numeric column's distribution ────────────────────────────────────

function ColumnsList({ cols, rows, loading, distMap, onSave, mode }: {
  cols: SchemaColumn[];
  /** What each column means and its marks (✓ key, → linked table, N states, time) — the Overview's grid until
   *  2026-11-10, joined to the list so a column is read in one place. */
  rows: ColumnRow[];
  loading: boolean;
  distMap: Record<string, DistributionProfile>;
  onSave: (col: string, type: string) => Promise<void>;
  mode: React.ReactNode;
}) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editType, setEditType] = useState("");
  const [busy, setBusy] = useState(false);
  const q = filter.toLowerCase();
  const shown = q ? cols.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)) : cols;
  // A distribution only means something for a numeric column — gated on its live type, so a VARCHAR id never shows
  // percentiles and a column just changed to VARCHAR stops showing its stale one.
  const dist = (c: SchemaColumn) => (isNumericType(c.type) ? distMap[c.name] : undefined);
  const profiled = cols.filter(dist).length;
  const marks = new Map(rows.map(r => [r.name, r]));
  const save = async (name: string) => {
    setBusy(true);
    try { await onSave(name, editType); }
    catch (e) { alert((e as Error).message || "Failed to alter column"); }
    finally { setBusy(false); setEditing(null); }
  };

  return (
    <section aria-label="Columns" data-testid="catalog-columns-list"
      style={{ background: "var(--bg-2)", border: "1px solid var(--card-edge)", borderRadius: "var(--r3)", padding: "12px 14px" }}>
      <div style={{ ...ROW, marginBottom: 8 }}>
        {mode}
        <FilterBox value={filter} onChange={setFilter} placeholder="Filter columns…" width={200} />
        <span className="aug-fs-xs" style={{ ...MUTED, marginLeft: "auto" }}>
          {profiled ? `${profiled} profiled · open a column for its distribution · click a type to change it` : "click a type to change it"}
        </span>
      </div>
      <Label right={countNoun(cols.length, "column")}>Columns</Label>
      {loading ? <SkeletonRows rows={6} />
        : shown.length === 0 ? <Empty>{q ? "No column matches that filter." : "Its columns could not be read."}</Empty>
        : withUniqueKeys(shown, c => c.name).map(([key, c], i) => {
          const d = dist(c);
          const isOpen = open.has(c.name);
          const r = marks.get(c.name);
          const means = r?.means || c.description || "";
          return (
            <div key={key} style={i ? RULE : undefined}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 150px auto", alignItems: "center", padding: "6px 2px", columnGap: 8 }}>
                <div style={{ ...ROW, flexWrap: "nowrap", minWidth: 0 }} title={means}>
                  <span style={{ width: 16, flexShrink: 0, display: "flex" }}>
                    {d && (
                      <Button variant="ghost" size="icon-xs" aria-expanded={isOpen} aria-label={`${c.name}'s distribution`}
                        onClick={() => setOpen(p => { const n = new Set(p); if (n.has(c.name)) n.delete(c.name); else n.add(c.name); return n; })}>
                        <Chevron open={isOpen} />
                      </Button>
                    )}
                  </span>
                  <ColumnTypeIcon type={c.type} size={13} />
                  <span className="aug-fs-sm" style={{ fontFamily: "var(--font-mono)", color: "var(--t1)", ...ONE_LINE }}>{c.name}</span>
                  {means && <span className="aug-fs-xs" style={{ ...MUTED, ...ONE_LINE, maxWidth: 360 }}>{means}</span>}
                </div>
                {editing === c.name ? (
                  <div style={{ ...ROW, flexWrap: "nowrap", gap: 4 }}>
                    <SelectField value={editType} onChange={e => setEditType(e.target.value)} autoFocus style={{ width: 110 }}
                      aria-label={`${c.name}'s type`}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(c.name); } if (e.key === "Escape") setEditing(null); }}>
                      {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </SelectField>
                    <Button variant="secondary" size="xs" disabled={busy} onClick={() => save(c.name)}>Save</Button>
                  </div>
                ) : (
                  <Button variant="plain" size="xs" title="Change its type" onClick={() => { setEditing(c.name); setEditType(c.type); }}
                    style={{ justifyContent: "flex-start", fontFamily: "var(--font-mono)", color: "var(--t3)", ...NUM }}>
                    {c.type || "—"}
                  </Button>
                )}
                <span style={{ justifySelf: "end", ...ROW, flexWrap: "nowrap", gap: 4 }} data-testid="catalog-column-marks">
                  {r?.key && <Chip>✓ key</Chip>}
                  {r?.link ? <Chip tone="accent" title={`Links to ${r.link}`}>{`→ ${r.link}`}</Chip>
                    : c.is_fk ? <Chip tone="accent" title="Links to another table">link</Chip> : null}
                  {r?.states != null && <Chip title="Its business object's lifecycle states">{countNoun(r.states, "state")}</Chip>}
                  {r?.time && <Chip>time</Chip>}
                </span>
              </div>
              {d && isOpen && <ColumnDistribution d={d} />}
            </div>
          );
        })}
    </section>
  );
}
