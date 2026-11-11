"use client";

/**
 * SE-2 PR E — the catalog rail, for the whole Query workbench.
 *
 * This was `SchemaSidebar`, a frame the SQL editor owned while the visual builder drew
 * its own 220-line tree beside it. Both modes now hang off this one rail, mounted by the
 * workbench OUTSIDE either mode pane, so switching Visual↔SQL leaves the catalog exactly
 * where it was — same scroll position, same expanded tables, same search — instead of
 * swapping one rail for a different rail showing the same warehouse.
 *
 * The frame is deliberately thin. Everything visible belongs to `CatalogTree`: the
 * hierarchy, the search, the type legend, the root node. What differs per mode arrives
 * as props from the workbench — insertion in SQL mode, add-to-query and drag in Visual
 * mode — so this file has no opinion about which mode is up.
 *
 * What it draws itself is its head — "CATALOG" as the Catalog screen draws it, the table count at its right, SQL
 * mode's connection picker under it — and the mode hint under that, because "drag to auto-join" is true in Visual mode and a lie in SQL mode, and an affordance line that
 * lies is worse than no line. SQL mode passes none: its rows each say "Insert … at the cursor" on hover.
 *
 * It does NOT set its own width. The rail lives inside a `ResizableSplit`, and a pane
 * that hardcodes a width silently wins against the drag handle above it — the reason
 * this panel was unadjustable when it looked like it should not be.
 */
import { CatalogTree, type CatalogTable, type CatalogColumn } from "@/components/query/CatalogTree";
import { formatCount } from "@/lib/format";

export type RailTable = CatalogTable;
export type RailColumn = CatalogColumn;

export function CatalogRail({
  tables,
  connectionName,
  loading,
  hint,
  onSelectTable,
  onSelectColumn,
  renderTableActions,
  renderColumnActions,
  onColumnDragStart,
  isTableActive,
  actionLabel,
  onInsertTable,
  onPreviewTable,
  activeConnectionId,
  picker,
  defaultSchema,
  onDefaultSchema,
}: {
  tables: RailTable[];
  /** The connection this catalog belongs to — the tree's root node. */
  connectionName?: string;
  loading?: boolean;
  /** One line naming what this mode lets you do with a row. Omitted when there is
   *  nothing true to say. */
  hint?: string;
  onSelectTable?: (qualifiedName: string) => void;
  onSelectColumn?: (columnName: string, qualifiedTable: string) => void;
  renderTableActions?: (table: RailTable) => React.ReactNode;
  renderColumnActions?: (column: RailColumn, table: RailTable) => React.ReactNode;
  onColumnDragStart?: (e: React.DragEvent, column: RailColumn, table: RailTable) => void;
  isTableActive?: (table: RailTable) => boolean;
  actionLabel?: (name: string, kind: "table" | "column") => string;
  /** SQL mode's `»` — insert `schema.table` at the cursor. */
  onInsertTable?: (table: RailTable) => void;
  /** The `»`'s card's Preview data. */
  onPreviewTable?: (table: RailTable) => void;
  /** The connection the workbench queries: its branch of a workspace-wide tree starts open. */
  activeConnectionId?: string;
  /** The connection the editor queries, as a picker in the rail's head (SQL mode, 2026-11-10 — moved from the Run
   *  row): the tree under it is that connection's schemas, or every connection's. */
  picker?: React.ReactNode;
  /** SQL mode's default schema, said and changed on its schema's row. */
  defaultSchema?: string;
  onDefaultSchema?: (schema: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        borderRight: "0.5px solid var(--b1)", background: "var(--bg-1)", overflow: "hidden",
      }}
    >
      {/* The Catalog screen's head, as it draws it: CATALOG, and here what it counts at the right; the connection
          picker under it in SQL mode; the mode's one line of affordance only where a row's hover does not say it. */}
      <div style={{ padding: "10px 12px 8px", borderBottom: "0.5px solid var(--b1)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="aug-fs-sm" style={{ flex: 1, fontWeight: 600, color: "var(--t1)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Catalog
          </span>
          {!(loading && !tables.length) && (
            <span className="aug-fs-xs" style={{ color: "var(--t3)" }}>
              {formatCount(tables.length)} {tables.length === 1 ? "table" : "tables"}
            </span>
          )}
        </div>
        {picker && <div style={{ marginTop: 8 }}>{picker}</div>}
        {hint && (
          <p className="aug-fs-xs" style={{ color: "var(--t3)", margin: "6px 0 0" }}>{hint}</p>
        )}
      </div>
      <CatalogTree
        tables={tables}
        // With a picker naming the connection, the tree does not name it again: its schemas are the first tier.
        catalogName={picker ? undefined : connectionName}
        loading={loading}
        onSelectTable={onSelectTable}
        onSelectColumn={onSelectColumn}
        renderTableActions={renderTableActions}
        renderColumnActions={renderColumnActions}
        onColumnDragStart={onColumnDragStart}
        isTableActive={isTableActive}
        actionLabel={actionLabel}
        onInsertTable={onInsertTable}
        onPreviewTable={onPreviewTable}
        activeConnectionId={activeConnectionId}
        defaultSchema={defaultSchema}
        onDefaultSchema={onDefaultSchema}
        emptyLabel="No schema loaded."
      />
    </div>
  );
}
