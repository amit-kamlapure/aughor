"use client";

/**
 * A column's menu, opened from the arrow at its header's end (or a right-click on the header) — a spreadsheet's filter
 * menu over the sheet's own filter (the user, 2026-11-09, showing a spreadsheet's column filter: "where user can filter the data
 * similar to what they can do as a separate button function"). One box, top to bottom: the sort in the kind's words;
 * Clear filter; the conditions the kind takes ("Text filters"), opened in place; the column's values to tick, each with
 * its rows; a Number column's Format, opened in place, and Copy column name (the user, the same day, on a column
 * menu: one menu, this one, never a second); then the column's own doors — hide, freeze, fit, width, fill.
 *
 * The values are the server's, over the whole view under its OTHER filters (`readColumnValues`): a column filtered to
 * two values still lists the rest, so they can be ticked back. Applying replaces only this column's conditions in the
 * view's filter (`withColumnFilter`); everything else stays. It closes on OK, Cancel, Apply, Escape or a click outside;
 * what is pressed or typed in it never reaches the grid under it.
 */
import {
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, useEffect, useMemo, useState,
} from "react";

import { MUTED, NUM } from "@/components/clarity/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { NUMBER_FORMATS, formatCount, formatNumberAs, type NumberFormat } from "@/lib/format";
import {
  CONDITION_WORDS, EVERYTHING, checklistConditions, checklistOf, columnConditions, conditionsFor, filterFamily, isTicked,
  searchedConditions, sortWords, tick, valueKey, valueless, type Checklist,
} from "@/lib/sheetFilters";
import {
  filterWords, formatSymbol, readColumnValues, showValue, valueWords, type ColumnValues, type Condition, type Sheet,
  type SheetColumn,
} from "@/lib/sheets";

/** What a column's menu does — the grid keeps fitting a width and copies the name; the view does the rest. */
export type ColumnAction = "asc" | "desc" | "then-asc" | "then-desc" | "hide" | "freeze" | "unfreeze" | "fit" | "width"
  | "fill" | "copy-name";

/** The menu's width; the header places it by this, its right edge at the column's. */
export const MENU_WIDTH = 280;

/** How long the values' search waits for the typing to stop before it reads. */
const SEARCH_WAIT = 200;

const LINE: CSSProperties = { height: 1, background: "var(--b0)", margin: "4px 0", flex: "0 0 auto" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "2px 8px", minHeight: 24 };
// left-aligned: a Themes button centres its text, and a label stretched across the row read as pushed right (seen live)
const ELLIPSIS: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1,
  textAlign: "left" };

/** A row of a menu: a whole row that does one thing — this one's, and the grid's right-click menu's (`SelectionMenu`,
 *  where each is a `menuitem`). */
export function Item({ children, onClick, disabled, title, pressed, expanded, role }: {
  children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; pressed?: boolean; expanded?: boolean;
  role?: "menuitem";
}) {
  return (
    <Button variant="plain" size="xs" role={role} disabled={disabled} title={title} aria-pressed={pressed}
      aria-expanded={expanded} onClick={onClick}
      style={{ justifyContent: "flex-start", width: "100%", fontWeight: pressed ? 600 : 400, flex: "0 0 auto" }}>
      {children}
    </Button>
  );
}

/** A Number column's formats, opened in place: each with how it shows its example value, the one it has ticked. A
 *  format is the sheet's — everyone who reads it sees it — so it is set only by someone who may change the sheet. */
function FormatSection({ column, onFormat }: { column: SheetColumn; onFormat?: (format: NumberFormat) => void }) {
  const [open, setOpen] = useState(false);
  const now: NumberFormat = column.format ?? "";
  const symbol = formatSymbol(column);
  return (
    <>
      <Item expanded={open} disabled={!onFormat} onClick={() => setOpen(!open)}
        title={onFormat ? `How ${column.name} shows its values — a copy, the CSV and a filter read the value itself`
          : "Only someone who can change the sheet sets how a column shows its values"}>
        <Icon name={open ? "chevd" : "chevr"} size={12} />
        <span style={ELLIPSIS}>Format</span>
        <span className="aug-fs-xs" style={MUTED}>{NUMBER_FORMATS.find(f => f.id === now)?.label ?? "None"}</span>
      </Item>
      {open && onFormat && (
        <div role="group" aria-label={`How ${column.name} shows its values`}
          style={{ display: "flex", flexDirection: "column", paddingLeft: 18 }}>
          {NUMBER_FORMATS.map(f => (
            <Item key={f.id || "none"} pressed={f.id === now} onClick={() => onFormat(f.id)}>
              <span style={{ width: 12, display: "inline-flex", flex: "0 0 auto" }}>
                {f.id === now && <Icon name="check" size={12} />}
              </span>
              <span style={ELLIPSIS}>{f.label}</span>
              <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>{formatNumberAs(f.example, f.id, symbol)}</span>
            </Item>
          ))}
          {!symbol && (
            // never a "$" the organisation did not declare: said where Currency is picked
            <span className="aug-fs-xs" style={{ ...ROW, ...MUTED }}>No reporting currency is declared, so Currency shows no symbol</span>
          )}
        </div>
      )}
    </>
  );
}

/** The column's values, each to tick, with (Select all) and (Blanks) — read from the server, a search narrowing them. */
function ValueList({ sheet, column, filter, search, onApply, onCancel }: {
  sheet: Sheet; column: SheetColumn; filter: Condition[]; search: string;
  onApply: (conditions: Condition[]) => void; onCancel: () => void;
}) {
  const own = useMemo(() => columnConditions(filter, column.id, sheet.columns), [filter, column.id, sheet.columns]);
  const [list, setList] = useState<Checklist>(() => checklistOf(column, own) ?? EVERYTHING);
  const [q, setQ] = useState("");
  // what a search found, each ticked until a person unticks it (by `valueKey`): OK shows the ticked ones' rows alone
  const [searchOff, setSearchOff] = useState<Record<string, true>>({});
  const [all, setAll] = useState<ColumnValues | null>(null);
  const [shown, setShown] = useState<{ q: string; read: ColumnValues } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const filterKey = JSON.stringify(filter);
  const words = q.trim();

  useEffect(() => {
    let live = true;
    const read = () => readColumnValues(sheet.id, column.id, { filter: JSON.parse(filterKey) as Condition[], search, q: words })
      .then(v => {
        if (!live) return;
        setShown({ q: words, read: v });
        setFailed(null);
        if (!words) setAll(v);
      })
      .catch(e => { if (live) setFailed(e instanceof Error ? e.message : String(e)); });
    // the first read at once; a search once the typing stops
    let wait = 0;
    if (words) wait = window.setTimeout(() => void read(), SEARCH_WAIT);
    else void read();
    return () => { live = false; window.clearTimeout(wait); };
  }, [sheet.id, column.id, filterKey, search, words]);

  const known = useMemo(() => ({ values: (all?.values ?? []).map(v => v.value), complete: !!all && all.more === 0,
    blanks: (all?.blanks ?? 0) > 0 }), [all]);
  const searching = words !== "";
  // the list on screen is the one read for what the box says — until the search has read, nothing is applied
  const settled = !!all && shown?.q === words;
  const listed = shown?.read.values ?? [];
  const off = (v: unknown) => valueKey(column, v) in searchOff;
  const found = listed.filter(v => !off(v.value));
  const result = !settled ? null : searching ? searchedConditions(column, found.map(v => v.value))
    : checklistConditions(column, list, known);
  // (Select all): every value and the empty cells, or — while searching — the values the search found
  const allState: boolean | "indeterminate" = searching
    ? (listed.length > 0 && found.length === listed.length ? true : found.length > 0 ? "indeterminate" : false)
    : (result && result.length === 0 ? true : result === null ? false : "indeterminate");
  const toggleAll = () => {
    if (searching) {
      setSearchOff(allState === true ? Object.fromEntries(listed.map(v => [valueKey(column, v.value), true as const])) : {});
      return;
    }
    setList(allState === true ? { base: false, flipped: {}, blanks: false } : EVERYTHING);
  };
  const tickValue = (v: unknown, on: boolean) => {
    if (!searching) { setList(tick(column, list, v, on)); return; }
    const next = { ...searchOff };
    if (on) delete next[valueKey(column, v)];
    else next[valueKey(column, v)] = true;
    setSearchOff(next);
  };
  const ok = () => { if (result) onApply(result); };
  const said = (v: unknown) => valueWords(v, column);
  const read = shown?.read;

  return (
    <>
      <div style={{ padding: "2px 8px" }}>
        <Input value={q} placeholder="Search the values" aria-label={`Search the values of ${column.name}`}
          leading={<Icon name="search" size={12} />}
          onChange={e => { setQ(e.target.value); setSearchOff({}); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); ok(); } }} />
      </div>
      {failed ? <span role="alert" className="aug-fs-xs" style={{ ...ROW, color: "var(--red4)" }}>{failed}</span>
        : !read ? <span className="aug-fs-xs" style={{ ...ROW, ...MUTED }}>Reading the values…</span> : (
          <div role="group" aria-label={`The values of ${column.name}`}
            style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", flex: "0 1 auto",
              borderTop: "1px solid var(--b0)", borderBottom: "1px solid var(--b0)", margin: "4px 0" }}>
            <label className="aug-fs-sm" style={ROW}>
              <Checkbox checked={allState} onChange={toggleAll}
                aria-label={searching ? "(Select all search results)" : "(Select all)"} />
              <span style={ELLIPSIS}>{searching ? "(Select all search results)" : "(Select all)"}</span>
              {!searching && <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>{formatCount(read.rows)}</span>}
            </label>
            {!searching && read.blanks > 0 && (
              <label className="aug-fs-sm" style={ROW}>
                <Checkbox checked={list.blanks} onChange={e => setList({ ...list, blanks: e.target.checked })}
                  aria-label="(Blanks)" />
                <span style={ELLIPSIS}>(Blanks)</span>
                <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>{formatCount(read.blanks)}</span>
              </label>
            )}
            {listed.map(v => (
              <label key={valueKey(column, v.value)} className="aug-fs-sm" style={ROW}>
                <Checkbox checked={searching ? !off(v.value) : isTicked(column, list, v.value)} aria-label={said(v.value)}
                  onChange={e => tickValue(v.value, e.target.checked)} />
                <span style={ELLIPSIS} title={said(v.value)}>{said(v.value)}</span>
                <span className="aug-fs-xs" style={{ ...MUTED, ...NUM }}>{formatCount(v.count)}</span>
              </label>
            ))}
            {searching && settled && listed.length === 0 && (
              <span className="aug-fs-xs" style={{ ...ROW, ...MUTED }}>No value holds “{words}”</span>
            )}
          </div>
        )}
      {read && read.more > 0 && (
        // never a silent cut: how many values the list did not hold
        <span className="aug-fs-xs" style={{ ...ROW, ...MUTED, ...NUM }}>{formatCount(read.more)} more — search to narrow</span>
      )}
      <div style={{ ...ROW, justifyContent: "flex-end" }}>
        <Button size="xs" disabled={!result} onClick={ok}
          title={all && !result ? "Tick a value, or (Blanks), to show its rows" : undefined}>OK</Button>
        <Button variant="ghost" size="xs" onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
}

/** The conditions the column's kind takes, opened in place; one picked takes its value here and is applied. */
function ConditionSection({ column, own, onApply }: {
  column: SheetColumn; own: Condition[]; onApply: (conditions: Condition[]) => void;
}) {
  const family = filterFamily(column.kind);
  const ops = conditionsFor(column.kind);
  // the column filtered by one of these already: open, with it picked and its value in the box
  const now = own.length === 1 && ops.includes(own[0].op) ? own[0] : undefined;
  const [open, setOpen] = useState(!!now);
  const [op, setOp] = useState(now?.op ?? "");
  const [value, setValue] = useState(now && !Array.isArray(now.value) ? String(now.value ?? "") : "");
  if (!family) return null;
  const custom = !checklistOf(column, own);
  const shownNow = custom && own.length
    ? (own.length === 1 && CONDITION_WORDS[own[0].op]
      ? `${CONDITION_WORDS[own[0].op].toLowerCase()}${valueless(own[0].op) ? "" : ` ${showValue(own[0].value, column) || String(own[0].value ?? "")}`}`
      : `${formatCount(own.length)} conditions`)
    : "";
  const number = family === "Number";
  const usable = value.trim() !== "" && (!number || !Number.isNaN(Number(value.replace(/[\s,]/g, "").replace(/^[^\d.-]+/, ""))));
  const apply = () => { if (op && usable) onApply([{ column: column.id, op, value: value.trim() }]); };
  const pick = (o: string) => {
    if (valueless(o)) { onApply([{ column: column.id, op: o }]); return; }
    setOp(o);
  };
  return (
    <>
      <Item expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={open ? "chevd" : "chevr"} size={12} />
        <span style={ELLIPSIS}>{family} filters</span>
        {shownNow && <span className="aug-fs-xs" style={{ ...MUTED, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{shownNow}</span>}
      </Item>
      {open && (
        <div role="group" aria-label={`${family} filters`} style={{ display: "flex", flexDirection: "column", paddingLeft: 18 }}>
          {ops.map(o => <Item key={o} pressed={op === o} onClick={() => pick(o)}>{CONDITION_WORDS[o]}</Item>)}
          {op && !valueless(op) && (
            <div style={{ ...ROW, padding: "4px 8px 4px 0" }}>
              <Input value={value} autoFocus type={family === "Date" ? "date" : "text"} inputMode={number ? "decimal" : undefined}
                aria-label={`${CONDITION_WORDS[op]} — the value`}
                placeholder={number ? "a number" : family === "Date" ? "2018-10-17" : "the text"}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(); } }} style={{ flex: 1 }} />
              <Button size="xs" disabled={!usable} onClick={apply}>Apply</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function ColumnMenu({ sheet, column, sort, frozen, canFit, hasWidth, canFill, filter, search, onAction, onFilter,
  onFormat, onClose, boxRef, style }: {
  sheet: Sheet; column: SheetColumn; sort: { column: string; desc: boolean }[];
  /** Whether columns are frozen (Unfreeze is offered), the grid fits a width, the person gave it one, a model fills it. */
  frozen: boolean; canFit: boolean; hasWidth: boolean; canFill: boolean;
  /** The view's filter and search as on screen; with `onFilter`, the menu filters the column too. */
  filter: Condition[]; search: string;
  onAction: (action: ColumnAction) => void;
  /** This column's conditions, to replace the ones it has. */
  onFilter?: (conditions: Condition[]) => void;
  /** A Number column's format, set for the sheet; none where the person may not change the sheet. */
  onFormat?: (format: NumberFormat) => void;
  /** Closed: `refocus` gives the focus back to the column's arrow (Escape, OK, Cancel, a pick). */
  onClose: (refocus: boolean) => void;
  /** The menu's box — the header's, which closes it on a click outside it. */
  boxRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
}) {
  const own = columnConditions(filter, column.id, sheet.columns);
  const { asc, desc } = sortWords(column.kind);
  const sorts: { action: ColumnAction; label: string }[] = [
    { action: "asc", label: `Sort ${asc}` },
    { action: "desc", label: `Sort ${desc}` },
    ...(sort.some(s => s.column !== column.id) ? [
      { action: "then-asc" as const, label: `Then by this, ${asc}` },
      { action: "then-desc" as const, label: `Then by this, ${desc}` }] : []),
  ];
  const rest: { action: ColumnAction; label: string }[] = [
    { action: "hide", label: "Hide this column" },
    { action: "freeze", label: "Freeze up to this column" },
    ...(frozen ? [{ action: "unfreeze" as const, label: "Unfreeze the columns" }] : []),
    ...(canFit ? [{ action: "fit" as const, label: "Fit the width to what it holds" }] : []),
    ...(hasWidth ? [{ action: "width" as const, label: "Back to its own width" }] : []),
    ...(canFill && column.model_writes ? [{ action: "fill" as const, label: "Fill with the model…" }] : []),
  ];
  const act = (a: ColumnAction) => { onClose(true); onAction(a); };
  const filterBy = (conditions: Condition[]) => { onClose(true); onFilter?.(conditions); };
  const formatAs = onFormat ? (f: NumberFormat) => { onClose(true); if (f !== (column.format ?? "")) onFormat(f); } : undefined;

  useEffect(() => { focusables(boxRef.current)[0]?.focus(); }, [boxRef]);

  /** Every key pressed here is the menu's — the grid under it would take an arrow as a move and a letter as a change to
   *  a cell. Up and down go from one control to the next; Escape closes. */
  const keys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); onClose(true); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const list = focusables(boxRef.current);
    const i = list.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    list[(i + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return (
    <div ref={boxRef}
      role="dialog" aria-label={`The ${column.name} column`} className="aug-fs-sm"
      onKeyDown={keys} onPaste={e => e.stopPropagation()}
      style={{ position: "absolute", top: "100%", marginTop: 2, zIndex: 12, width: MENU_WIDTH, background: "var(--bg-2)",
        border: "1px solid var(--b1)", borderRadius: "var(--r3)", padding: 4, display: "flex", flexDirection: "column",
        fontWeight: 400, color: "var(--t1)", boxShadow: "var(--shadow-sm)", overflowY: "auto", ...style }}>
      {sorts.map(it => <Item key={it.action} onClick={() => act(it.action)}>{it.label}</Item>)}
      {onFilter && (
        <>
          <div role="separator" style={LINE} />
          <Item disabled={!own.length} onClick={() => filterBy([])}
            title={own.length ? `Filtered: ${filterWords(own, sheet.columns, sheet.rules)}` : `${column.name} is not filtered`}>
            <Icon name="filter" size={12} /> <span style={ELLIPSIS}>Clear filter from “{column.name}”</span>
          </Item>
          <ConditionSection column={column} own={own} onApply={filterBy} />
          <ValueList sheet={sheet} column={column} filter={filter} search={search} onApply={filterBy}
            onCancel={() => onClose(true)} />
        </>
      )}
      <div role="separator" style={LINE} />
      {column.kind === "number" && <FormatSection column={column} onFormat={formatAs} />}
      <Item onClick={() => act("copy-name")}>Copy column name</Item>
      <div role="separator" style={LINE} />
      {rest.map(it => <Item key={it.action} onClick={() => act(it.action)}>{it.label}</Item>)}
    </div>
  );
}

/** The controls of the menu a key moves among, in their order. */
function focusables(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? [])];
}
