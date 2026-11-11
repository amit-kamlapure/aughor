"use client";

/**
 * The ▾ at a result column's head, and the menu it opens — a spreadsheet's AutoFilter.
 *
 * The user, 2026-11-09, on a filter dropdown: "I like the idea of a Downward arrow displaying to show that drop down
 * filters are possible..". The arrow is a button with an edge (an action looks like a button, CLARITY §3), and becomes
 * the funnel in the accent colour while its column is filtered. Later the same day, on another grid: "the dropdown icon
 * should be at the right of the area (stick to it) and not to the text.. It should appear only when hovered over" — so
 * each table draws it at its head's right edge where the pointer is, and at rest only while it says something (the
 * column filtered, its menu open). One menu, the user's choice that day: the two sorts worded by the column's type,
 * the column's own actions (copy its name, pin it, how a number shows), Clear filter, the type's conditions, then a
 * search over the column's distinct values with their counts, "(Select all)" and "(Blanks)", and OK / Cancel. What it filters and sorts by is `lib/query/columnFilter.ts`; the table that owns the
 * rows decides what OK does — the result table keeps the filter itself, the SQL Editor's grid makes it a chip.
 *
 * It floats over the page, as the repo's other pickers do (`ColumnValuePicker`): drawn into the body at the button's
 * place, so a table's own scroll box cannot clip it, with a backdrop that closes it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RESULT_NUMBER_FORMATS, formatCount, formatNumberAs, type NumberFormat } from "@/lib/format";
import {
  BLANK_KEY, CONDITION_HEADING, CONDITIONS, SORT_WORDS, conditionProblem, distinctValues, isFiltering,
  type ColumnFilter, type ColumnKind, type ConditionOp, type SortDir,
} from "@/lib/query/columnFilter";

/** How many values the checklist draws before it says how many more a search would reach. */
const SHOWN = 200;
const WIDTH = 288;

/** The arrow at a column's head: ▾ at rest, the funnel in the accent colour while the column is filtered. */
export function ColumnFilterButton({ column, filtered, open, onOpen }: {
  column: string;
  filtered: boolean;
  open: boolean;
  /** Called with where the button is, so the menu opens under it. */
  onOpen: (anchor: DOMRect) => void;
}) {
  const say = filtered ? `${column} is filtered — change or clear its filter` : `Sort and filter ${column}`;
  // Ant Design draws each head a second time, hidden, in the row it measures column widths with; that copy must not
  // take a Tab stop the reader cannot see.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ref.current?.closest("[aria-hidden='true'], .ant-table-measure-row")) ref.current.tabIndex = -1;
  }, []);
  return (
    <Button
      ref={ref}
      variant={open ? "secondary" : "outline"} size="icon-xs"
      aria-label={say} title={say} aria-haspopup="dialog" aria-expanded={open}
      data-testid="column-filter" data-filtered={filtered ? "true" : undefined}
      // The head sorts on a click and on Enter; this button opens the menu instead, and nothing more.
      onClick={e => { e.stopPropagation(); onOpen(e.currentTarget.getBoundingClientRect()); }}
      onKeyDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        width: 18, height: 18, flexShrink: 0,
        ...(filtered ? { color: "var(--accent)", boxShadow: "inset 0 0 0 1px var(--accent)" } : {}),
      }}
    >
      <Icon name={filtered ? "filter" : "chevd"} size={12} label={filtered ? "Filtered" : undefined} />
    </Button>
  );
}

export interface ColumnFilterMenuProps {
  /** The column's name as the reader sees it. */
  column: string;
  kind: ColumnKind;
  /** The result's rows, positional; `col` is the column's position in them. */
  rows: readonly (readonly unknown[])[];
  col: number;
  /** The rows every OTHER column's filter leaves — the values the checklist lists, as a spreadsheet's does. Absent,
   *  every row. */
  only?: readonly number[];
  /** The column's filter, to open with. */
  filter?: ColumnFilter;
  /** Whether the column is filtered at all (its funnel) — what Clear filter clears. */
  filtered: boolean;
  /** Which way the column is sorted, if it is. */
  sortDir?: SortDir | null;
  /** A value as the cell shows it — the checklist's words and what its search reads. */
  label?: (v: unknown) => string;
  /** Said under the checklist, after where its values come from — a cut result's caveat. */
  note?: string;
  /** Under the note: one more way to the column's values (the SQL Editor's live read of a cut result's table). */
  extra?: React.ReactNode;
  anchor: DOMRect | null;
  /** The column's own actions, one menu with its sorts and filters (the user, 2026-11-09: one ▾ menu, not a second ⋮).
   *  Each is offered only where the table gives it. Copy column name: */
  onCopyName?: () => void;
  /** Pinned at the left as the rest scroll under it; Pin column / Unpin column. */
  pinned?: boolean;
  onPin?: () => void;
  /** A number column's display format (`lib/format.ts`) — what its cells show, never what they hold. */
  format?: NumberFormat;
  onFormat?: (format: NumberFormat) => void;
  /** The currency symbol the Currency format shows ("" when the dataset's is not confirmed). */
  currency?: string;
  onSort: (dir: SortDir) => void;
  /** OK: the column's new filter, or null when it keeps every row. */
  onApply: (filter: ColumnFilter | null) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ColumnFilterMenu(props: ColumnFilterMenuProps) {
  const { column, kind, rows, col, only, filter, filtered, sortDir, note, extra, anchor, onSort, onApply, onClear, onClose,
    onCopyName, pinned, onPin, format = "", onFormat, currency = "" } = props;
  const [formatOpen, setFormatOpen] = useState(false);
  const label = props.label ?? ((v: unknown) => String(v));
  const values = useMemo(() => distinctValues(rows, col, kind, only), [rows, col, kind, only]);
  const allKeys = useMemo(() => values.map(v => v.key), [values]);

  const ops = CONDITIONS[kind];
  const [op, setOp] = useState<ConditionOp>(filter?.condition?.op ?? ops[0].op);
  const [typed, setTyped] = useState(filter?.condition?.value ?? "");
  // The ticks with no search, and a search's own: typing a search ticks every value it finds, and OK then keeps the
  // ticked ones among them — a spreadsheet's way, and what "type north, press OK" means.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(filter?.keep ?? allKeys));
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Set<string>>(() => new Set());

  const q = search.trim().toLowerCase();
  const matching = useMemo(
    () => (q ? values.filter(v => v.key !== BLANK_KEY && label(v.value).toLowerCase().includes(q)) : values),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `label` is a formatter, stable for one column
    [values, q],
  );
  const picks = q ? found : ticked;
  const setPicks = q ? setFound : setTicked;
  const everyListed = matching.length > 0 && matching.every(v => picks.has(v.key));

  const toggle = (key: string) => setPicks(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setPicks(prev => {
    const next = new Set(prev);
    for (const v of matching) if (everyListed) next.delete(v.key); else next.add(v.key);
    return next;
  });
  const onSearch = (text: string) => {
    setSearch(text);
    const t = text.trim().toLowerCase();
    if (t) setFound(new Set(values.filter(v => v.key !== BLANK_KEY && label(v.value).toLowerCase().includes(t)).map(v => v.key)));
  };

  const condition = typed.trim() ? { op, value: typed.trim() } : undefined;
  const problem = condition ? conditionProblem(kind, condition) : null;
  const keep = q ? matching.filter(v => found.has(v.key)).map(v => v.key) : allKeys.filter(k => ticked.has(k));
  const keepsAll = !q && keep.length === allKeys.length;
  const canApply = !problem && keep.length > 0;

  const apply = () => {
    if (!canApply) return;
    const next: ColumnFilter = { ...(keepsAll ? {} : { keep }), ...(condition ? { condition } : {}) };
    onApply(isFiltering(next) ? next : null);
    onClose();
  };

  // Escape closes it wherever the focus is — still on the arrow that opened it, as often as not.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = only ? only.length : rows.length;
  const source = `From the ${formatCount(total)} ${total === 1 ? "row" : "rows"}${only && only.length !== rows.length ? " the other filters leave" : ""}`;

  // Under the button, kept on the screen; opened near the bottom, it grows upward instead.
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = Math.max(8, Math.min((anchor?.right ?? WIDTH) - WIDTH, vw - WIDTH - 8));
  const below = vh - (anchor?.bottom ?? 0) - 12;
  const above = (anchor?.top ?? 0) - 12;
  const up = below < 360 && above > below;
  const place: React.CSSProperties = up
    ? { bottom: vh - (anchor?.top ?? 0) + 4, maxHeight: above }
    : { top: (anchor?.bottom ?? 0) + 4, maxHeight: Math.max(240, below) };

  const rule = <div style={{ height: 1, background: "var(--b0)", margin: "6px 0" }} />;
  const heading = (text: string) => (
    <div className="aug-fs-xs" style={{ color: "var(--t3)", fontWeight: 600, padding: "0 2px 4px" }}>{text}</div>
  );

  const menu = (
    <>
      {/* Above the shell's topbar (z 70) and rail (z 60), so a click anywhere outside closes it rather than acting. */}
      <div data-testid="column-filter-backdrop" style={{ position: "fixed", inset: 0, zIndex: 80 }} onClick={onClose} />
      <div
        role="dialog" aria-label={`Sort and filter ${column}`} data-testid="column-filter-menu" className="aug-fs-sm"
        style={{
          position: "fixed", left, ...place, zIndex: 81, width: WIDTH, display: "flex", flexDirection: "column",
          padding: 8, background: "var(--bg-2)", border: "1px solid var(--b2)", borderRadius: "var(--r2)",
          boxShadow: "var(--shadow-md)", color: "var(--t2)", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {(["asc", "desc"] as const).map(dir => (
            <Button key={dir} size="xs" variant={sortDir === dir ? "secondary" : "ghost"} data-testid={`column-sort-${dir}`}
              aria-pressed={sortDir === dir} onClick={() => { onSort(dir); onClose(); }} style={{ flex: 1 }}>
              <Icon name={dir === "asc" ? "sortasc" : "sortdesc"} size={12} /> {SORT_WORDS[kind][dir].replace(/^Sort /, "")}
            </Button>
          ))}
        </div>
        {(onCopyName || onPin || onFormat) && (
          <>
            {rule}
            {onCopyName && (
              <Button size="xs" variant="ghost" data-testid="column-copy-name" style={{ justifyContent: "flex-start" }}
                onClick={() => { onCopyName(); onClose(); }}>
                <Icon name="copy" size={12} /> Copy column name
              </Button>
            )}
            {onPin && (
              <Button size="xs" variant="ghost" data-testid="column-pin" aria-pressed={!!pinned}
                style={{ justifyContent: "flex-start" }} onClick={() => { onPin(); onClose(); }}>
                <Icon name="pin" size={12} /> {pinned ? "Unpin column" : "Pin column"}
              </Button>
            )}
            {onFormat && (
              <>
                {/* the formats open in the menu itself, as its conditions do: nothing here opens a second pop-up */}
                <Button size="xs" variant="ghost" data-testid="column-format" aria-expanded={formatOpen}
                  style={{ justifyContent: "flex-start" }} onClick={() => setFormatOpen(o => !o)}>
                  <Icon name={formatOpen ? "chevd" : "chevr"} size={12} /> Format
                  <span className="aug-fs-xs" style={{ marginLeft: "auto", color: "var(--t3)" }}>
                    {RESULT_NUMBER_FORMATS.find(f => f.id === format)?.label ?? "None"}
                  </span>
                </Button>
                {formatOpen && (
                  <div role="radiogroup" aria-label={`How ${column} is shown`} data-testid="column-formats"
                    style={{ display: "grid", padding: "0 2px 2px 18px" }}>
                    {RESULT_NUMBER_FORMATS.map(f => (
                      <Button key={f.id || "none"} size="xs" variant="ghost" role="radio" aria-checked={format === f.id}
                        data-testid={`column-format-${f.id || "none"}`}
                        style={{ justifyContent: "flex-start", gap: 6 }}
                        onClick={() => { onFormat(f.id); onClose(); }}>
                        <span style={{ width: 12, display: "inline-flex" }}>{format === f.id && <Icon name="check" size={12} />}</span>
                        {f.label}
                        <span className="aug-fs-xs" style={{ marginLeft: "auto", color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>
                          {formatNumberAs(f.example, f.id, currency)}
                        </span>
                      </Button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
        {rule}
        <Button size="xs" variant="ghost" disabled={!filtered} data-testid="column-filter-clear"
          onClick={() => { onClear(); onClose(); }} style={{ justifyContent: "flex-start" }}>
          <Icon name="close" size={12} /> Clear filter from {column}
        </Button>
        {rule}
        {heading(CONDITION_HEADING[kind])}
        {/* The conditions as a spreadsheet lists them, each a choice on the panel: nothing here opens a second
            pop-up over this one. */}
        <div role="radiogroup" aria-label={`${CONDITION_HEADING[kind]} — how to compare`}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px", padding: "0 2px 6px" }}>
          {ops.map(o => (
            // eslint-disable-next-line jsx-a11y/label-has-associated-control -- the Themes radio is the control inside
            <label key={o.op} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Radio name={`column-condition-${col}`} value={o.op} checked={op === o.op} onChange={() => setOp(o.op)}
                data-testid={`column-condition-${o.op}`} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <Input bespoke type={kind === "date" ? "date" : "text"} inputMode={kind === "number" ? "decimal" : undefined}
          value={typed} onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          placeholder={kind === "number" ? "a number" : kind === "date" ? "YYYY-MM-DD" : "a value"}
          aria-label={`${CONDITION_HEADING[kind]} — the value`} data-testid="column-condition-value" />
        {problem && (
          <div className="aug-fs-xs" role="alert" data-testid="column-condition-problem" style={{ color: "var(--amb4)", padding: "3px 2px 0" }}>
            {problem}
          </div>
        )}
        {rule}
        <Input bespoke value={search} onChange={e => onSearch(e.target.value)}
          placeholder={`Search ${formatCount(values.length)} ${values.length === 1 ? "value" : "values"}`}
          aria-label={`Search the values of ${column}`} data-testid="column-filter-search"
          leading={<Icon name="search" size={12} />} />
        <div data-testid="column-filter-values" style={{ overflowY: "auto", maxHeight: 220, minHeight: 0, marginTop: 4 }}>
          {matching.length > 0 && (
            // eslint-disable-next-line jsx-a11y/label-has-associated-control -- the Themes checkbox is the control inside
            <label style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 4px", cursor: "pointer", color: "var(--t1)" }}>
              <Checkbox checked={everyListed} onChange={toggleAll} aria-label={q ? "Select all search results" : "Select all"} />
              <span>{q ? "(Select all search results)" : "(Select all)"}</span>
            </label>
          )}
          {/* The first values, and "(Blanks)" always — it closes the list, however long the list is. */}
          {[...matching.filter(v => v.key !== BLANK_KEY).slice(0, SHOWN), ...matching.filter(v => v.key === BLANK_KEY)].map(v => {
            const blank = v.key === BLANK_KEY;
            const text = blank ? "(Blanks)" : label(v.value);
            return (
              // eslint-disable-next-line jsx-a11y/label-has-associated-control -- the Themes checkbox is the control inside
              <label key={v.key} data-testid="column-filter-value" style={{ display: "flex", alignItems: "center", gap: 7,
                padding: "2px 4px", cursor: "pointer", color: blank ? "var(--t3)" : "var(--t2)" }}>
                <Checkbox checked={picks.has(v.key)} onChange={() => toggle(v.key)} aria-label={text} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={text}>{text}</span>
                <span className="aug-fs-xs" style={{ color: "var(--t3)", fontVariantNumeric: "tabular-nums" }}>{formatCount(v.count)}</span>
              </label>
            );
          })}
          {matching.filter(v => v.key !== BLANK_KEY).length > SHOWN && (
            <div className="aug-fs-xs" style={{ color: "var(--t3)", padding: "4px" }}>
              and {formatCount(matching.filter(v => v.key !== BLANK_KEY).length - SHOWN)} more, not listed — search to narrow
            </div>
          )}
          {!matching.length && (
            <div className="aug-fs-xs" style={{ color: "var(--t3)", padding: "4px" }}>No value matches</div>
          )}
        </div>
        <div className="aug-fs-xs" data-testid="column-filter-source" style={{ color: note ? "var(--amb4)" : "var(--t3)", padding: "4px 2px 0" }}>
          {source}{note ? ` — ${note}` : ""}
        </div>
        {extra}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
          <Button size="xs" variant="ghost" onClick={onClose} data-testid="column-filter-cancel">Cancel</Button>
          <Button size="xs" disabled={!canApply} onClick={apply} data-testid="column-filter-ok">OK</Button>
        </div>
      </div>
    </>
  );
  return typeof document === "undefined" ? null : createPortal(menu, document.body);
}
