"use client";

/**
 * The grid's right-click menu, on what is selected — a cell, a range, whole rows or every cell (the user, 2026-11-09,
 * on a results grid). Copy is the grid's own ⌘C; Copy as copies the selection with its columns' names in a stated
 * form (`copyAs`); Copy column names copies the names alone. Filter by this value and Exclude this value add to the
 * view's filter as the column's menu does — and only from one cell, so each is greyed with its reason otherwise. Open
 * row opens the row's record, the sheet's side panel.
 *
 * Placed at the pointer, kept inside the window; it closes on a pick, Escape, a click outside or a scroll of the grid,
 * and every key pressed in it is its own: up and down go from one item to the next.
 */
import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useState } from "react";

import { MUTED } from "@/components/clarity/kit";
import { Item } from "@/components/sheets/ColumnMenu";
import { Icon } from "@/components/ui/icon";
import { COPY_FORMS, type CopyForm } from "@/lib/gridCopy";

/** The menu's width; it is moved in from the window's right edge by this. */
export const SELECTION_MENU_WIDTH = 248;
/** About its height with Copy as open — what it is moved up from the window's foot by. */
const ROOM_BELOW = 360;

export function SelectionMenu({ at, boxRef, what, single, filterWhy, onCopy, onCopyAs, onCopyNames, onFilterBy, onExclude,
  onOpenRow, onClose }: {
  /** Where the pointer was, in the window. */
  at: { x: number; y: number };
  boxRef: RefObject<HTMLDivElement | null>;
  /** What is selected, in words: "1 cell", "3 rows × 4 columns". */
  what: string;
  /** Whether one cell is selected — the value Filter and Exclude would use. */
  single: boolean;
  /** Why the grid cannot filter at all here, or "". */
  filterWhy: string;
  onCopy: () => void;
  onCopyAs: (form: CopyForm) => void;
  onCopyNames: () => void;
  onFilterBy: () => void;
  onExclude: () => void;
  onOpenRow: () => void;
  /** Closed — the keyboard back on the grid. */
  onClose: () => void;
}) {
  const [forms, setForms] = useState(false);
  useEffect(() => { focusables(boxRef.current)[0]?.focus(); }, [boxRef]);
  const pick = (then: () => void) => () => { onClose(); then(); };
  const why = filterWhy || (single ? "" : "select one cell");

  const keys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = focusables(boxRef.current);
    const i = list.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  };

  const width = typeof window !== "undefined" ? window.innerWidth : 1e9;
  const height = typeof window !== "undefined" ? window.innerHeight : 1e9;
  return (
    <div ref={boxRef} role="menu" aria-label={`The selection — ${what}`} className="aug-fs-sm" onKeyDown={keys}
      onContextMenu={e => e.preventDefault()}
      style={{ position: "fixed", left: Math.max(4, Math.min(at.x, width - SELECTION_MENU_WIDTH - 4)),
        top: Math.max(4, Math.min(at.y, height - ROOM_BELOW)), zIndex: 30, width: SELECTION_MENU_WIDTH,
        background: "var(--bg-2)", border: "1px solid var(--b1)", borderRadius: "var(--r3)", padding: 4,
        display: "flex", flexDirection: "column", color: "var(--t1)", boxShadow: "var(--shadow-sm)" }}>
      <span className="aug-fs-xs" style={{ ...MUTED, padding: "2px 8px 4px" }}>{what}</span>
      <Item role="menuitem" onClick={pick(onCopy)}>
        <Icon name="copy" size={12} /><span style={{ flex: 1, textAlign: "left" }}>Copy</span>
        <span className="aug-fs-xs" style={MUTED}>⌘C</span>
      </Item>
      <Item role="menuitem" expanded={forms} onClick={() => setForms(!forms)}>
        <Icon name={forms ? "chevd" : "chevr"} size={12} /><span style={{ flex: 1, textAlign: "left" }}>Copy as</span>
      </Item>
      {forms && (
        <div role="group" aria-label="Copy as" style={{ display: "flex", flexDirection: "column", paddingLeft: 18 }}>
          {COPY_FORMS.map(f => <Item key={f.id} role="menuitem" onClick={pick(() => onCopyAs(f.id))}>{f.label}</Item>)}
        </div>
      )}
      <Item role="menuitem" onClick={pick(onCopyNames)}>Copy column names</Item>
      <div role="separator" style={{ height: 1, background: "var(--b0)", margin: "4px 0" }} />
      {/* greyed with the reason beside it, never hidden: a filter that needs one cell says so */}
      <Item role="menuitem" disabled={!!why} onClick={pick(onFilterBy)}>
        <Icon name="filter" size={12} /><span style={{ flex: 1, textAlign: "left" }}>Filter by this value</span>
        {why && <span className="aug-fs-xs" style={MUTED}>{why}</span>}
      </Item>
      <Item role="menuitem" disabled={!!why} onClick={pick(onExclude)}>
        <Icon name="filter" size={12} /><span style={{ flex: 1, textAlign: "left" }}>Exclude this value</span>
        {why && <span className="aug-fs-xs" style={MUTED}>{why}</span>}
      </Item>
      <div role="separator" style={{ height: 1, background: "var(--b0)", margin: "4px 0" }} />
      <Item role="menuitem" onClick={pick(onOpenRow)}>
        <Icon name="expand" size={12} /><span style={{ flex: 1, textAlign: "left" }}>Open row</span>
      </Item>
    </div>
  );
}

/** The items a key moves among, in their order. */
function focusables(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
}
