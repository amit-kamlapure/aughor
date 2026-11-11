"use client";

/**
 * DE-5b (ROADMAP §3.51) — the right-click menu on a result cell.
 *
 * Every entry does one of three things, and says which: puts a phrase into the filter chips
 * (the same chips a typed phrase makes — removable, chainable, honest about the rows it hides),
 * copies the value in a stated form, or opens the value in the viewer. Nothing here re-runs
 * the query, and nothing filters silently: a click lands as a chip the person can see.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { formatCount } from "@/lib/format";
import { COPY_FORMS, copyAs } from "@/lib/gridCopy";
import { NULL_GLYPH, filterPhrase, jsonLiteral, sqlLiteral, type FilterKind } from "@/lib/query/cellMenu";
import type { Cell } from "@/lib/query/resultFilter";

export interface CellMenuTarget {
  x: number;
  y: number;
  /** The VISIBLE column index the menu is about — what the value picker is keyed by. */
  col: number;
  column: string;
  value: Cell;
  /** A header was clicked: the value entries do not apply, the column ones do. */
  header?: boolean;
}

/** A value as the menu names it: short, quoted, never a paragraph. */
function brief(v: Cell): string {
  if (v === null) return NULL_GLYPH;
  const s = String(v);
  return s.length > 24 ? `"${s.slice(0, 23)}…"` : `"${s}"`;
}

/** More than one cell selected — rows, the whole result, or a block — as the menu reads it (the user, 2026-11-09, on
 *  a selection menu): the cells, and the shown columns' names over them. */
export interface CellMenuSelection {
  cells: number;
  rows: number;
  columns: string[];
  grid: readonly (readonly Cell[])[];
}

export function CellMenu({
  target,
  selection,
  onCopySelection,
  valueOpen,
  canFilter,
  onFilter,
  onPickValues,
  onOpenValue,
  onRelated,
  onInspect,
  onClose,
}: {
  target: CellMenuTarget;
  /** Several cells are selected: the menu copies them, and the value filters — one value's — say to select one cell. */
  selection?: CellMenuSelection;
  /** ⌘C: the selection as TSV, as the grid copies it. */
  onCopySelection?: () => void;
  /** The value panel is open: its entry closes it. */
  valueOpen?: boolean;
  /** False when the grid is transposed: its columns are not the result's, so a filter on them
   *  would name a column the chip bar does not have. */
  canFilter: boolean;
  onFilter: (phrase: string) => void;
  onPickValues: () => void;
  onOpenValue: () => void;
  /** DE-5f — open the rows related to this value through a verified join. Absent when the statement
   *  reads no one table, or the grid is transposed: then no column is any table's column. */
  onRelated?: () => void;
  /** Open the column in the shell's inspector — what the loaded rows hold, and where it came from. */
  onInspect?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    onClose();
  };
  const filter = (kind: FilterKind) => { onFilter(filterPhrase(target.column, target.value, kind)); onClose(); };
  const [copyAsOpen, setCopyAsOpen] = useState(false);
  const item = (label: string, onClick: () => void, icon?: Parameters<typeof Icon>[0]["name"], testid?: string,
    opts: { disabled?: string; hint?: string } = {}) => (
    <Button variant="plain" size="xs" className="aug-fs-ui" data-testid={testid} disabled={!!opts.disabled}
      title={opts.disabled || undefined}
      style={{ width: "100%", justifyContent: "flex-start" }} onClick={onClick}>
      {icon && <Icon name={icon} size={12} />}{label}
      {opts.hint && <span className="aug-fs-xs" style={{ marginLeft: "auto", color: "var(--t3)" }}>{opts.hint}</span>}
    </Button>
  );
  const many = !!selection && selection.cells > 1;
  const rule = <div style={{ borderTop: "1px solid var(--b0)", margin: "3px 0" }} />;
  const isNull = target.value === null;

  // Kept inside the viewport: a menu opened near the right or bottom edge is moved in, not clipped.
  const left = Math.min(target.x, (typeof window !== "undefined" ? window.innerWidth : 1e9) - 260);
  const top = Math.min(target.y, (typeof window !== "undefined" ? window.innerHeight : 1e9) - 320);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div role="menu" data-testid="cell-menu" className="aug-fs-ui" style={{
        position: "fixed", left, top, zIndex: 31, minWidth: 240, padding: 5,
        background: "var(--bg-2)", border: "1px solid var(--b2)", borderRadius: "var(--r2)",
        boxShadow: "var(--shadow-md)",
      }}>
        <div className="aug-fs-xs" style={{ color: "var(--t3)", padding: "2px 8px 4px", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {many
            ? `${formatCount(selection!.cells)} cells · ${formatCount(selection!.rows)} ${selection!.rows === 1 ? "row" : "rows"} · ${selection!.columns.length} ${selection!.columns.length === 1 ? "column" : "columns"}`
            : `${target.column}${target.header ? "" : ` · ${brief(target.value)}`}`}
        </div>
        {many && (
          <>
            {item("Copy", () => { onCopySelection?.(); onClose(); }, "copy", "cell-copy-selection", { hint: "⌘C" })}
            {item("Copy as", () => setCopyAsOpen(o => !o), copyAsOpen ? "chevd" : "chevr", "cell-copy-as")}
            {copyAsOpen && (
              <div style={{ paddingLeft: 18 }}>
                {COPY_FORMS.map(f => (
                  <span key={f.id}>{item(f.label, () => copy(copyAs(f.id, selection!.columns, selection!.grid)), undefined,
                    `cell-copy-as-${f.id}`)}</span>
                ))}
              </div>
            )}
            {item("Copy column names", () => copy(selection!.columns.join("\t")), "column", "cell-copy-names")}
            {canFilter && (
              <>
                {rule}
                {item("Filter by this value", () => {}, "filter", "cell-filter-is",
                  { disabled: "Select one cell to filter by its value" })}
                {item("Exclude this value", () => {}, "filter", "cell-filter-isnot",
                  { disabled: "Select one cell to exclude its value" })}
              </>
            )}
            {rule}
            {item(valueOpen ? "Hide the value panel" : "Show the value panel", () => { onOpenValue(); onClose(); }, "text",
              "cell-open")}
          </>
        )}
        {!many && canFilter && !target.header && (
          <>
            {item(isNull ? "Only null rows" : "Filter to this value", () => filter("is"), "filter", "cell-filter-is")}
            {item(isNull ? "Only non-null rows" : "Exclude this value", () => filter("isnot"), "filter", "cell-filter-isnot")}
            {!isNull && item("Only null rows", () => filter("null"), undefined, "cell-filter-null")}
            {!isNull && item("Only non-null rows", () => filter("notnull"), undefined, "cell-filter-notnull")}
          </>
        )}
        {!many && canFilter && item(`Pick values in ${target.column}…`, () => { onPickValues(); onClose(); }, "list", "cell-pick-values")}
        {!many && onRelated && !target.header && !isNull
          && item("Related rows…", () => { onRelated(); onClose(); }, "link", "cell-related")}
        {!many && (canFilter || (onRelated && !target.header && !isNull)) && rule}
        {!many && !target.header && (
          <>
            {item("Copy value", () => copy(target.value === null ? "" : String(target.value)), "copy", "cell-copy")}
            {item("Copy as SQL literal", () => copy(sqlLiteral(target.value)), "sql", "cell-copy-sql")}
            {item("Copy as JSON", () => copy(jsonLiteral(target.value)), "json", "cell-copy-json")}
            {item("Copy column name", () => copy(target.column), "column", "cell-copy-name")}
            {rule}
            {item(valueOpen ? "Hide the value panel" : "Open value", () => { onOpenValue(); onClose(); }, "text", "cell-open")}
          </>
        )}
        {!many && onInspect && (
          <>
            {rule}
            {item(`Inspect ${target.column}`, () => { onInspect(); onClose(); }, "panel", "cell-inspect")}
          </>
        )}
      </div>
    </>
  );
}
