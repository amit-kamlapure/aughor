"use client";
import { SkeletonRows } from "@/components/ui/motion";

/**
 * The catalog tree — ONE presentation of schema → table → column, for every surface
 * that shows a catalog.
 *
 * It exists because there were three. `CatalogScreen` had a hierarchical tree,
 * `QueryBuilder` had a second one with row counts and join degrees, and SE-2's SQL
 * sidebar had a third that was a flat list of truncated qualified names. Same product,
 * same data, three visual languages — and the flat one taught the user that the SQL
 * editor was a different kind of place than the tab next to it.
 *
 * The conventions here are QueryBuilder's, deliberately: it is the richest of the
 * three, it already sits in this tab, and its vocabulary (a `⋈n` join degree, an
 * `isolated` badge, compact row counts, a per-column type mark) is information
 * the others were simply missing.
 *
 * Its ROWS are the Catalog screen's (`TreeRow`, 2026-11-10): the user, of this rail beside the Catalog's tree, "in
 * the format/font/size exact as the catalog.. no change at all". A schema, a table and a column are drawn at the
 * Catalog's sizes and indents, its icons and its selected look; the rail's own verbs (the `»`, a join degree, the
 * builder's buttons) ride each row's right end.
 *
 * **Presentational only.** It takes data and renders it; it holds no fetch, no
 * connection, and no builder state. Per-table and per-column ACTIONS arrive as render
 * props, which is what lets PR E serve QueryBuilder's rail from this component without
 * dragging `primaryTable` / auto-join / `addDim` into a shared module — those are the
 * builder's own `renderTableActions` / `renderColumnActions`, while the SQL editor
 * passes none and gets the plain catalog.
 *
 * PR E added five props, each standing for one affordance the builder's rail had and
 * this tree did not: a column's drag payload (`onColumnDragStart`), the D/M buttons
 * (`renderColumnActions`), the resolved-table highlight (`isTableActive`), the verb a
 * row's tooltip uses (`actionLabel`), and `loading`. They are all optional and all
 * inert for a caller that passes none — the SQL editor's rail renders as it did.
 *
 * The builder's fifth affordance, an on-demand column fetch, is deliberately NOT here.
 * It existed because that rail listed tables from `/catalog/tree`, which knows table
 * names and no columns. This tree is fed from the rich schema, where a table arrives
 * WITH its columns, so the fetch had nothing left to fetch — the SQL sidebar has run
 * without it since SE-2. An empty column list is now reported, not papered over.
 */
import { useMemo, useState } from "react";
import Fuse from "fuse.js";
import { compactNumber } from "@/lib/format";
import { IcoCatalog, IcoSchema, IcoTable } from "@/components/icons/catalog";
import { TreeRow } from "@/components/catalog/TreeRow";
import { ColumnTypeIcon } from "@/components/icons/columnType";
import { HoverCard } from "@radix-ui/themes";

import { TableCard } from "@/components/query/TableCard";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";

export interface CatalogColumn {
  name: string;
  type?: string;
  is_fk?: boolean;
}

export interface CatalogTable {
  /** Qualified name as the warehouse spells it — what insertion uses. */
  name: string;
  /** Which connection owns this table. Present only when the caller is showing MORE
   *  THAN ONE — the SQL editor browses the whole workspace, the visual builder browses
   *  the connection it is composing against. When set on any row the tree grows a
   *  connection tier above the schema tier; when absent it renders exactly as before. */
  connectionId?: string;
  connectionLabel?: string;
  /** The schema this table groups under, when the caller already knows it.
   *
   *  Without it the schema is parsed back out of `name`, which is fine for a caller
   *  whose names are qualified and wrong for one whose names are not. The builder keys
   *  tables by their BARE name and records the schema separately, so making it re-encode
   *  the schema into the name purely for this tree to split apart again would be a lie
   *  told to a parser — state the fact instead. */
  schema?: string;
  columns: CatalogColumn[];
  rowCount?: string | number | null;
  /** Number of tables this one has a detected join to. */
  joinDegree?: number;
  isolated?: boolean;
}

function fmtRows(rc: string | number | null | undefined): string | null {
  if (rc == null || rc === "") return null;
  const n = typeof rc === "string" ? parseInt(rc.replace(/[^0-9]/g, ""), 10) : rc;
  return Number.isFinite(n) ? compactNumber(n, 1) : null;
}

/** Split "schema.table" into its parts; an unqualified name lands under "". */
function splitName(qualified: string): { schema: string; bare: string } {
  const i = qualified.lastIndexOf(".");
  return i < 0
    ? { schema: "", bare: qualified }
    : { schema: qualified.slice(0, i), bare: qualified.slice(i + 1) };
}

/** Where a table groups, and what its row is labelled — the caller's `schema` wins
 *  over anything parsed out of the name. */
function placeOf(t: CatalogTable): { schema: string; bare: string } {
  const split = splitName(t.name);
  return t.schema == null ? split : { schema: t.schema, bare: split.bare };
}

/** The drag-handle dots, shown only on a column the caller made draggable — an
 *  affordance with no drag behind it is a promise the surface cannot keep. */
const GrabDots = () => (
  <span style={{ flexShrink: 0, color: "var(--t3)", display: "inline-flex" }}>
    <Icon name="grip" size={12} />
  </span>
);

/** A table's `»`, with its card on hovering it. Either of its actions — the `»` itself, the card's Preview data —
 *  closes the card: a pop-up does not outlive the next action. */
function InsertArrow({ table, onInsert, onPreview }: {
  table: CatalogTable; onInsert: (t: CatalogTable) => void; onPreview?: (t: CatalogTable) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={350} closeDelay={150}>
      <HoverCard.Trigger>
        <Button
          variant="plain"
          size="icon-sm"
          onClick={() => { setOpen(false); onInsert(table); }}
          aria-label={`Insert ${table.name}`}
          data-testid="rail-insert-table"
          className="shrink-0 opacity-0 transition group-hover/tbl:opacity-100 group-focus-within/tbl:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
          style={{ color: "var(--blue4)", width: 24, height: 24 }}
        >
          <Icon name="insert" size={18} />
        </Button>
      </HoverCard.Trigger>
      <HoverCard.Content side="right" align="start" size="1" style={{ width: 320 }}>
        <TableCard table={table} onPreview={onPreview && (t => { setOpen(false); onPreview(t); })} />
      </HoverCard.Content>
    </HoverCard.Root>
  );
}

export function CatalogTree({
  activeConnectionId,
  tables,
  catalogName,
  onSelectTable,
  onSelectColumn,
  renderTableActions,
  renderColumnActions,
  onColumnDragStart,
  isTableActive,
  actionLabel = name => `Insert ${name} at the cursor`,
  onInsertTable,
  onPreviewTable,
  defaultSchema,
  onDefaultSchema,
  loading = false,
  emptyLabel = "No tables in this connection.",
}: {
  tables: CatalogTable[];
  /** The CONNECTION this catalog belongs to, rendered as the tree's root.
   *
   *  Without it the tree began at schema level, so the SQL editor showed
   *  `luxexperience` with nothing saying which warehouse that was — while the Catalog
   *  screen and Visual mode both root at the connection. Two schemas in different
   *  connections can share a name, so the root is not decoration: it is the only thing
   *  on screen that says what you are querying. A caller that names the connection in
   *  a picker above passes none, and the schemas are the tree's first tier. */
  catalogName?: string;
  onSelectTable?: (qualifiedName: string) => void;
  onSelectColumn?: (columnName: string, qualifiedTable: string) => void;
  /** Builder-specific affordances (add-to-query, primary/joined chips) go here, so
   *  this component never learns what a "primary table" is.
   *
   *  When given it REPLACES the default `isolated` badge rather than sitting beside it:
   *  the builder's status is one exclusive chain (primary → joined → isolated → add),
   *  and a row showing both "isolated" and "+ add" would be stating a fact and offering
   *  its contradiction in the same breath. `⋈n` is unaffected — a join degree is a
   *  catalog fact, true on every surface. */
  renderTableActions?: (table: CatalogTable) => React.ReactNode;
  /** Per-column affordances (the builder's D / M buttons), at the column row's right end — never inside its click
   *  target, so the two never fight over a click. */
  renderColumnActions?: (column: CatalogColumn, table: CatalogTable) => React.ReactNode;
  /** Makes columns draggable and lets the caller write the payload. The wire format
   *  (`application/x-col`) stays with the builder that reads it — this tree knows only
   *  that a column can be picked up. */
  onColumnDragStart?: (e: React.DragEvent, column: CatalogColumn, table: CatalogTable) => void;
  /** Tables already in the caller's query: highlighted, and expanded by default so the
   *  columns you are working with are the ones in front of you. */
  isTableActive?: (table: CatalogTable) => boolean;
  /** What clicking a row DOES, for its tooltip. Insertion is the default because that is
   *  what the SQL editor does; Visual mode adds the row to the query instead, and a
   *  tooltip promising to insert at a cursor there would describe a different product. */
  actionLabel?: (name: string, kind: "table" | "column") => string;
  /** The `»` button on a table row. Separate from `onSelectTable` because they are
   *  different promises: clicking the NAME may navigate or add, while this one always
   *  writes `schema.table` where the caret is. A row that does both has to say which is
   *  which, and a hover-revealed button beside the name is how an editor says it. */
  onInsertTable?: (table: CatalogTable) => void;
  /** The `»`'s card's Preview data: the table's first hundred rows, run in a new tab. */
  onPreviewTable?: (table: CatalogTable) => void;
  /** The schema whose tables complete and resolve without naming it (the SQL Editor's; the Run row's dataset picker
   *  until 2026-11-10). Its row says "default" and starts open. */
  defaultSchema?: string;
  /** Makes a schema the default, or `""` for none — offered on a schema row's hover. */
  onDefaultSchema?: (schema: string) => void;
  /** The catalog itself is still arriving. Distinct from an EMPTY catalog, which is a
   *  finished answer — showing "no tables" while they load reads as a broken connection. */
  loading?: boolean;
  /** The connection the workbench queries (2026-11-10, the SQL Editor mockup): its branch of a workspace-wide tree
   *  starts open, and its only dataset with it — the rail opens on what the editor reads. */
  activeConnectionId?: string;
  emptyLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(true);
  // Records, not Sets: a node has THREE states — opened, closed, and never touched —
  // and only a record can tell the last two apart. A Set would make "not opened" and
  // "deliberately closed" the same value, so a default-open rule could never be
  // overridden by the user closing the thing.
  const [openSchemas, setOpenSchemas] = useState<Record<string, boolean>>({});
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});

  const fuse = useMemo(
    () => new Fuse(tables, { keys: ["name", "columns.name"], threshold: 0.35, ignoreLocation: true }),
    [tables],
  );

  const visible = useMemo(() => {
    const q = search.trim();
    return q ? fuse.search(q).map(r => r.item) : tables;
  }, [search, tables, fuse]);

  /** connection → schema → its tables, in catalog order.
   *
   *  The connection tier appears only when the rows carry one. Two schemas in
   *  different warehouses can share a name — `main` is in four of them here — so
   *  without the tier a workspace-wide tree would merge tables that have nothing to do
   *  with each other under one heading. */
  const multiConn = useMemo(() => new Set(visible.map(t => t.connectionId).filter(Boolean)).size > 1, [visible]);

  const byConnection = useMemo(() => {
    const conns = new Map<string, { label: string; schemas: Map<string, CatalogTable[]> }>();
    for (const t of visible) {
      const cid = (multiConn ? t.connectionId : "") ?? "";
      let entry = conns.get(cid);
      if (!entry) { entry = { label: t.connectionLabel ?? "", schemas: new Map() }; conns.set(cid, entry); }
      if (!entry.label && t.connectionLabel) entry.label = t.connectionLabel;
      const { schema } = placeOf(t);
      const list = entry.schemas.get(schema);
      if (list) list.push(t); else entry.schemas.set(schema, [t]);
    }
    return [...conns.entries()]
      .map(([cid, e]) => ({
        cid,
        label: e.label,
        count: [...e.schemas.values()].reduce((n, l) => n + l.length, 0),
        schemas: [...e.schemas.entries()].sort(([a], [b]) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visible, multiConn]);

  /** Schemas that own a table the caller is already querying. Such a table is drawn
   *  highlighted, and a highlight inside a collapsed parent is invisible. */
  const activeSchemas = useMemo(() => {
    if (!isTableActive) return new Set<string>();
    return new Set(visible.filter(isTableActive).map(t => placeOf(t).schema));
  }, [visible, isTableActive]);

  // A lone schema starts open: closed, it would say nothing you cannot already see and cost a click to get past.
  const soleSchema = byConnection.length === 1 && byConnection[0].schemas.length === 1;

  // Which connections start open. Browsing a whole workspace means most of the tree is
  // about warehouses you are not querying, so only the ACTIVE one unfolds — everything
  // else is one click away, which is what the Catalog screen does too.
  const [openConns, setOpenConns] = useState<Record<string, boolean>>({});

  // A search narrows to what matched, so everything it found should be visible without
  // a second click — expanding on search is the difference between a filter and a hunt.
  const searching = !!search.trim();
  const toggle = (
    open: Record<string, boolean>,
    key: string,
    fallback: boolean,
    apply: (next: Record<string, boolean>) => void,
  ) => apply({ ...open, [key]: !(open[key] ?? fallback) });

  // The Catalog screen's indents: a tier per level, the connection's root (or a workspace's connections) first.
  const rooted = !!catalogName && !multiConn;
  const schemaDepth = rooted || multiConn ? 1 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {/* The Catalog screen's search, as it draws it; its clear at the right end, and Escape clears it too. */}
      <div style={{ padding: "8px 10px", borderBottom: "0.5px solid var(--b1)", flexShrink: 0 }}>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables &amp; columns…"
          aria-label="Search tables and columns"
          onKeyDown={e => { if (e.key === "Escape" && search) { e.preventDefault(); setSearch(""); } }}
          leading={<Icon name="search" size={11} />}
          trailing={search ? (
            <Button variant="plain" size="icon-xs" aria-label="Clear the search" title="Clear the search (Esc)"
              onClick={() => setSearch("")} style={{ color: "var(--t3)" }}>
              <Icon name="close" size={11} />
            </Button>
          ) : null}
          style={{ width: "100%" }} />
        {/* No legend. There was one here — three coloured dots captioned num · date ·
            text — and it existed only to decode the dots. The mark says `123`, `ABC`, a
            calendar or a clock now, so the key has nothing left to explain and the rail
            gets its two lines back. */}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 12px" }}>
        {loading && tables.length === 0 && (
          <div style={{ padding: "4px 12px" }} aria-label="Loading catalog"><SkeletonRows rows={6} /></div>
        )}
        {!loading && tables.length === 0 && (
          <p className="aug-fs-chrome" style={{ color: "var(--t3)", padding: "6px 12px", margin: 0 }}>{emptyLabel}</p>
        )}
        {tables.length > 0 && visible.length === 0 && (
          <p className="aug-fs-chrome" style={{ color: "var(--t3)", padding: "6px 12px", margin: 0 }}>No match.</p>
        )}

        {/* The connection-name root is the ONE-connection form of the connection tier.
            Rendering both put "Workspace 87" above a list that contained "Workspace 61"
            — the same word at two levels meaning two different things. */}
        {rooted && visible.length > 0 && (
          <TreeRow depth={0} icon={<IcoCatalog color="var(--t2)" />} label={catalogName ?? ""}
            count={tables.length} hasChildren isOpen={catalogOpen}
            onClick={() => setCatalogOpen(o => !o)} onToggle={() => setCatalogOpen(o => !o)} />
        )}

        {(!rooted || catalogOpen) && byConnection.map(conn => {
          // A connection whose tables include an active one is open; so is the only
          // connection there is. Everything else waits to be asked for.
          const cHasActive = isTableActive
            ? conn.schemas.some(([, ts]) => ts.some(isTableActive))
            : false;
          const cFallback = !multiConn || cHasActive || (!!activeConnectionId && conn.cid === activeConnectionId);
          const cOpen = searching || (openConns[conn.cid] ?? cFallback);
          const queried = !multiConn || (!!activeConnectionId && conn.cid === activeConnectionId);
          return (
        <div key={conn.cid || "(one)"}>
        {multiConn && (
          <TreeRow depth={0} icon={<IcoCatalog color="var(--t2)" />} label={conn.label}
            title={`${conn.label} — ${conn.count} table${conn.count === 1 ? "" : "s"}`}
            count={conn.count} hasChildren isOpen={cOpen}
            onClick={() => toggle(openConns, conn.cid, cFallback, setOpenConns)}
            onToggle={() => toggle(openConns, conn.cid, cFallback, setOpenConns)} />
        )}
        {cOpen && conn.schemas.map(([schema, schemaTables]) => {
          const isDefault = queried && !!defaultSchema && schema === defaultSchema;
          const sFallback = soleSchema || activeSchemas.has(schema) || schema === "" || isDefault
            || (!!activeConnectionId && conn.cid === activeConnectionId && conn.schemas.length === 1);
          const sKey = `${conn.cid}\u0000${schema}`;
          const sOpen = searching || (openSchemas[sKey] ?? sFallback);
          const tableDepth = schema === "" ? schemaDepth : schemaDepth + 1;
          return (
            <div key={`${conn.cid}:${schema || "(root)"}`}>
              {/* Rendered as STORED, not uppercased: a schema name is an identifier — in several dialects its case
                  is significant, so shouting it is a small lie about what you would have to type. */}
              {schema !== "" && (
                <TreeRow depth={schemaDepth} icon={<IcoSchema color="var(--blue3)" />} label={schema}
                  className="group/sch" testId="rail-schema"
                  badge={isDefault ? (
                    <span className="aug-fs-xs" title="Tables here complete and resolve without naming the schema"
                      style={{ color: "var(--t3)", border: "0.5px solid var(--b2)", padding: "0 4px", flexShrink: 0 }}>default</span>
                  ) : undefined}
                  count={schemaTables.length} hasChildren isOpen={sOpen}
                  onClick={() => toggle(openSchemas, sKey, sFallback, setOpenSchemas)}
                  onToggle={() => toggle(openSchemas, sKey, sFallback, setOpenSchemas)}
                  trailing={onDefaultSchema && queried ? (
                    <Button variant="outline" size="xs" data-testid="rail-default-schema"
                      className="hidden group-hover/sch:inline-flex group-focus-within/sch:inline-flex"
                      title={isDefault
                        ? "Stop resolving bare table names in this schema"
                        : "Tables in this schema complete and resolve without naming it"}
                      onClick={() => onDefaultSchema(isDefault ? "" : schema)}>
                      {isDefault ? "Unset default" : "Make default"}
                    </Button>
                  ) : undefined} />
              )}

              {sOpen && schemaTables.map(t => {
                const active = isTableActive?.(t) ?? false;
                const tOpen = searching || (openTables[t.name] ?? active);
                const { bare } = placeOf(t);
                const flip = () => toggle(openTables, t.name, active, setOpenTables);
                return (
                  <div key={t.name}>
                    <TreeRow depth={tableDepth} icon={<IcoTable active={active} />} label={bare}
                      className="group/tbl" testId="rail-table"
                      title={onSelectTable ? actionLabel(t.name, "table") : t.name}
                      count={fmtRows(t.rowCount)} isSelected={active} hasChildren isOpen={tOpen}
                      onClick={onSelectTable ? () => onSelectTable(t.name) : flip} onToggle={flip}
                      trailing={(onInsertTable || (t.joinDegree ?? 0) > 0 || renderTableActions || t.isolated) ? (
                        <>
                          {/* The insert affordance, drawn on the row's hover or focus: a button on every one of 60
                              rows is decoration; revealed, it is the fastest thing on the rail. Big enough to hit
                              (the user, 2026-11-09: "Its too small"), and its card — the table's details and Preview
                              data — on hovering it. */}
                          {onInsertTable && <InsertArrow table={t} onInsert={onInsertTable} onPreview={onPreviewTable} />}
                          {(t.joinDegree ?? 0) > 0 && (
                            <span title={`${t.joinDegree} related table${(t.joinDegree ?? 0) > 1 ? "s" : ""}`}
                              className="aug-fs-xs" style={{ color: "var(--t3)" }}>
                              ⋈{t.joinDegree}
                            </span>
                          )}
                          {renderTableActions
                            ? renderTableActions(t)
                            : t.isolated && (
                              <span title="No detected joins to other tables" className="aug-fs-xs" style={{ color: "var(--t3)" }}>
                                isolated
                              </span>
                            )}
                        </>
                      ) : undefined} />

                    {tOpen && t.columns.length === 0 && (
                      <p className="aug-fs-xs" style={{ color: "var(--t3)", margin: 0, padding: `6px 10px 6px ${10 + (tableDepth + 1) * 15 + 17}px` }}>
                        No columns available — the schema may need a refresh.
                      </p>
                    )}

                    {tOpen && t.columns.map(c => (
                      <TreeRow key={c.name} depth={tableDepth + 1}
                        icon={<>{onColumnDragStart && <GrabDots />}<ColumnTypeIcon type={c.type} size={14} /></>}
                        label={c.name}
                        title={onSelectColumn
                          ? `${actionLabel(c.name, "column")}${c.type ? ` (${c.type})` : ""}`
                          : `${c.name}${c.type ? ` (${c.type})` : ""}`}
                        // the type, said at the row's right as the mockup's rail says it (2026-11-10) — not only on hover
                        badge={(c.type || c.is_fk) ? (
                          <span className="aug-fs-xs" style={{ color: "var(--t3)", flexShrink: 0, textTransform: "uppercase" }}>
                            {c.type ? c.type.split(" ")[0].slice(0, 10) : ""}{c.is_fk ? `${c.type ? " · " : ""}FK` : ""}
                          </span>
                        ) : undefined}
                        onClick={onSelectColumn ? () => onSelectColumn(c.name, t.name) : undefined}
                        draggable={!!onColumnDragStart}
                        onDragStart={onColumnDragStart ? e => onColumnDragStart(e, c, t) : undefined}
                        trailing={renderColumnActions?.(c, t) ?? undefined} />
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
        </div>
          );
        })}
      </div>
    </div>
  );
}
