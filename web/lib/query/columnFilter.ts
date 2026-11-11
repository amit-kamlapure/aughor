/**
 * A result column's filter and sort, the way a spreadsheet's AutoFilter does them — over rows already in the browser.
 *
 * The user, 2026-11-09, on a spreadsheet's filter dropdown: "I like the idea of a Downward arrow displaying to show that
 * drop down filters are possible..". A result is bounded and its rows are on the page, so nothing here runs a query:
 * the menu at a column's head sorts, keeps the values ticked in a checklist, and applies one condition worded by the
 * column's type. Pure functions, no DOM; `components/query/ColumnFilterMenu.tsx` draws them, and the result table
 * (`components/AugTable.tsx`) and the SQL Editor's grid (`components/query/ResultsGrid.tsx`) both use them, so a
 * column filters and sorts the same way wherever a result is shown.
 *
 * A column's type is read the way the table already reads it: a number is a value `Number()` reads (the table's Σ and
 * alignment test), a date the ISO shape the table collapses and charts (`displayCellValue`, `detectGranularity`), a
 * declared SQL type first where the result carries one. Sorting follows the type — numbers by size, dates by the
 * instant, text in reading order — and blanks go last in both directions, as a spreadsheet puts them.
 */
import { columnTypeKind, formatCount } from "@/lib/format";

export type ColumnKind = "text" | "number" | "date";

/** A blank cell: SQL NULL, a missing value, or the empty string — the spreadsheet's "(Blanks)". */
export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** The table's own numeric test — its Σ, its right alignment and its sort: not blank, and `Number()` reads it. */
export function isNumericValue(v: unknown): boolean {
  if (v == null || v === "") return false;
  return !isNaN(Number(v));
}

/** A value read as a number for a column of numbers: a boolean or a run of spaces is not one. */
const numberish = (v: unknown) => typeof v !== "boolean" && !(typeof v === "string" && v.trim() === "") && isNumericValue(v);

// "2024-01", "2024-01-05", "2024-01-05 10:30", "2024-01-05T10:30:00.123Z", "2024-01-05 10:30:00+05:30"
const ISO = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s?(Z|UTC|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Whether a value has the ISO date shape the table reads as a date. */
export function isDateValue(v: unknown): boolean {
  return typeof v === "string" && ISO.test(v.trim());
}

/** A date's instant in milliseconds, read from its own fields: no locale and no browser timezone decides the order.
 *  A value with no offset is read as written (as UTC); one with an offset is moved by it. Null when it is not a date. */
export function dateMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = ISO.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  let ms = Date.UTC(Number(y), Number(mo) - 1, d ? Number(d) : 1, h ? Number(h) : 0, mi ? Number(mi) : 0,
    s ? Number(s) : 0, frac ? Number(`0.${frac}`) * 1000 : 0);
  if (zone && !/^(z|utc)$/i.test(zone)) {
    const z = /^([+-])(\d{2}):?(\d{2})?$/.exec(zone);
    if (z) ms -= (z[1] === "-" ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3] ?? 0)) * 60_000;
  }
  return ms;
}

/** The day a date names, as written: "2024-01-05 23:30" is 2024-01-05, "2024-01" its first day. */
export function dayOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3] ?? "01"}` : null;
}

/**
 * A column's kind. The declared SQL type decides where the result carries one (a number type is a number, a DATE or a
 * TIMESTAMP whose values are dates is a date, a text type is text); otherwise the values do: every non-blank value a
 * number → number, every one a date → date, anything else text. A column with no values at all is text.
 */
export function columnKind(values: readonly unknown[], declaredType?: string | null): ColumnKind {
  const present = values.filter(v => !isBlank(v));
  const declared = columnTypeKind(declaredType);
  if (declared === "num") return "number";
  if (declared === "date") return "date";
  if (declared === "time") return present.every(isDateValue) && present.length > 0 ? "date" : "text";
  if (declared !== "unknown") return "text";
  if (!present.length) return "text";
  if (present.every(numberish)) return "number";
  if (present.every(isDateValue)) return "date";
  return "text";
}

// ── Sorting ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc";

/** What the two sorts are called for a kind — a spreadsheet's words. */
export const SORT_WORDS: Record<ColumnKind, Record<SortDir, string>> = {
  text: { asc: "Sort A → Z", desc: "Sort Z → A" },
  number: { asc: "Sort smallest → largest", desc: "Sort largest → smallest" },
  date: { asc: "Sort oldest → newest", desc: "Sort newest → oldest" },
};

/** Two present values in ascending order for their column's kind. A value the kind cannot read (a stray word in a
 *  column of numbers) sorts after the ones it can, in reading order among themselves. */
export function compareValues(a: unknown, b: unknown, kind: ColumnKind): number {
  if (kind === "number" || kind === "date") {
    const read = kind === "number" ? (v: unknown) => (numberish(v) ? Number(v) : null) : dateMs;
    const x = read(a), y = read(b);
    if (x !== null && y !== null) return x === y ? 0 : x < y ? -1 : 1;
    if (x !== null) return -1;
    if (y !== null) return 1;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** The comparison a sorted column uses: by kind, and a blank after every value whichever way the column runs. The
 *  result is for an ascending sort that the caller reverses for a descending one (`desc` true), as both grids do. */
export function compareForSort(a: unknown, b: unknown, kind: ColumnKind, desc = false): number {
  const ab = isBlank(a), bb = isBlank(b);
  if (ab && bb) return 0;
  // Blank last: in a descending sort the caller flips the sign, so the blank's side is flipped first.
  if (ab) return desc ? -1 : 1;
  if (bb) return desc ? 1 : -1;
  return compareValues(a, b, kind);
}

// ── Conditions ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TextOp = "equals" | "notEquals" | "beginsWith" | "endsWith" | "contains" | "notContains";
export type NumberOp = "eq" | "ne" | "gt" | "ge" | "lt" | "le";
export type DateOp = "on" | "before" | "after";
export type ConditionOp = TextOp | NumberOp | DateOp;

export interface Condition { op: ConditionOp; value: string }

/** The conditions each kind offers, in a spreadsheet's order and words. */
export const CONDITIONS: Record<ColumnKind, { op: ConditionOp; label: string; word: string }[]> = {
  text: [
    { op: "equals", label: "Equals", word: "equals" },
    { op: "notEquals", label: "Does not equal", word: "does not equal" },
    { op: "beginsWith", label: "Begins with", word: "begins with" },
    { op: "endsWith", label: "Ends with", word: "ends with" },
    { op: "contains", label: "Contains", word: "contains" },
    { op: "notContains", label: "Does not contain", word: "does not contain" },
  ],
  number: [
    { op: "eq", label: "= equals", word: "=" },
    { op: "ne", label: "≠ does not equal", word: "≠" },
    { op: "gt", label: "> greater than", word: ">" },
    { op: "ge", label: "≥ at least", word: "≥" },
    { op: "lt", label: "< less than", word: "<" },
    { op: "le", label: "≤ at most", word: "≤" },
  ],
  date: [
    { op: "on", label: "On", word: "on" },
    { op: "before", label: "Before", word: "before" },
    { op: "after", label: "After", word: "after" },
  ],
};

/** What the section of conditions is called for a kind. */
export const CONDITION_HEADING: Record<ColumnKind, string> = {
  text: "Text filters", number: "Number filters", date: "Date filters",
};

/** A typed number as a person writes one: "1,234.5", "$1,234", "(42)" for −42, "12%" for 0.12. Null when it is not. */
export function typedNumber(s: string): number | null {
  let t = s.trim().replace(/[,\s$€£¥₹]/g, "");
  const pct = t.endsWith("%");
  if (pct) t = t.slice(0, -1);
  const neg = /^\((.*)\)$/.exec(t);
  if (neg) t = `-${neg[1]}`;
  if (t === "" || isNaN(Number(t))) return null;
  return pct ? Number(t) / 100 : Number(t);
}

/** Why a condition cannot be applied as typed — said under the field — or null when it can. */
export function conditionProblem(kind: ColumnKind, c: Condition): string | null {
  if (!c.value.trim()) return "Type a value to compare with";
  if (kind === "number" && typedNumber(c.value) === null) return "Type a number";
  if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(c.value.trim())) return "Type a date as YYYY-MM-DD";
  return null;
}

/** Whether a cell meets a condition. Text compares without case, as a spreadsheet's text filters do; a number by
 *  size; a date by its day ("on 2024-01-05" holds at any hour of it). A blank meets only "does not equal" and "does
 *  not contain" — it equals nothing typed — and a condition that cannot be read keeps nothing. */
export function meetsCondition(v: unknown, kind: ColumnKind, c: Condition): boolean {
  if (conditionProblem(kind, c)) return false;
  const blank = isBlank(v);
  if (kind === "number") {
    if (blank || !numberish(v)) return c.op === "ne";
    const x = Number(v), y = typedNumber(c.value)!;
    switch (c.op) {
      case "eq": return x === y;
      case "ne": return x !== y;
      case "gt": return x > y;
      case "ge": return x >= y;
      case "lt": return x < y;
      case "le": return x <= y;
      default: return false;
    }
  }
  if (kind === "date") {
    const day = dayOf(v), want = c.value.trim();
    if (day === null) return false;
    switch (c.op) {
      case "on": return day === want;
      case "before": return day < want;
      case "after": return day > want;
      default: return false;
    }
  }
  const text = blank ? "" : String(v).toLowerCase();
  const want = c.value.toLowerCase();
  switch (c.op) {
    case "equals": return text === want;
    case "notEquals": return text !== want;
    case "beginsWith": return !blank && text.startsWith(want);
    case "endsWith": return !blank && text.endsWith(want);
    case "contains": return !blank && text.includes(want);
    case "notContains": return !text.includes(want);
    default: return false;
  }
}

// ── The checklist ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The checklist's key for "(Blanks)" — NULL and the empty string are one entry, as they are one look in a cell. */
export const BLANK_KEY = "\u0000blank";

/** A value's checklist key: its text, or the blanks' key. 5 and "5" are one entry, as they read the same. */
export function valueKey(v: unknown): string {
  return isBlank(v) ? BLANK_KEY : typeof v === "object" ? JSON.stringify(v) : String(v);
}

export interface ValueCount { key: string; value: unknown; count: number }

/** The distinct values of one column of `rows` (only those at `only`, when given), each with how many rows hold it, in
 *  the column's ascending order and "(Blanks)" last — the list a spreadsheet's dropdown shows. */
export function distinctValues(rows: readonly (readonly unknown[])[], col: number, kind: ColumnKind,
                               only?: readonly number[]): ValueCount[] {
  const seen = new Map<string, ValueCount>();
  const visit = (r: readonly unknown[]) => {
    const v = r[col];
    const key = valueKey(v);
    const hit = seen.get(key);
    if (hit) hit.count += 1;
    else seen.set(key, { key, value: isBlank(v) ? null : v, count: 1 });
  };
  if (only) for (const i of only) visit(rows[i]);
  else for (const r of rows) visit(r);
  return Array.from(seen.values()).sort((a, b) => compareForSort(a.value, b.value, kind));
}

// ── A column's filter, and the rows it leaves ─────────────────────────────────────────────────────────────────────────

/** One column's filter: the checklist's kept values (absent: every value) and one condition (absent: none). Both,
 *  when both are set, must hold. */
export interface ColumnFilter {
  keep?: readonly string[];
  condition?: Condition;
}

/** Whether a filter keeps anything out at all. */
export function isFiltering(f: ColumnFilter | null | undefined): boolean {
  return !!f && (f.keep !== undefined || f.condition !== undefined);
}

/** Whether one cell passes its column's filter. */
export function passes(v: unknown, kind: ColumnKind, f: ColumnFilter): boolean {
  if (f.keep !== undefined && !f.keep.includes(valueKey(v))) return false;
  if (f.condition !== undefined && !meetsCondition(v, kind, f.condition)) return false;
  return true;
}

export type ColumnFilters = Readonly<Record<number, ColumnFilter | undefined>>;

/** The positions of the rows every column's filter keeps — every filter but `except`'s, when given (the rows whose
 *  values a column's own checklist lists, as a spreadsheet's does). */
export function keptRows(rows: readonly (readonly unknown[])[], filters: ColumnFilters,
                         kinds: readonly ColumnKind[], except?: number): number[] {
  const live = Object.entries(filters)
    .map(([c, f]) => [Number(c), f] as const)
    .filter((e): e is readonly [number, ColumnFilter] => e[0] !== except && isFiltering(e[1]));
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (live.every(([c, f]) => passes(rows[i][c], kinds[c] ?? "text", f))) out.push(i);
  }
  return out;
}

export interface ColumnSort { col: number; dir: SortDir }

/** The positions in `order`, sorted by one column — stable, so rows that tie keep the order they came in. */
export function sortRows(rows: readonly (readonly unknown[])[], order: readonly number[], sort: ColumnSort | null,
                         kinds: readonly ColumnKind[]): number[] {
  if (!sort) return [...order];
  const kind = kinds[sort.col] ?? "text";
  const desc = sort.dir === "desc";
  return [...order].sort((a, b) => {
    const c = compareForSort(rows[a][sort.col], rows[b][sort.col], kind, desc);
    return (desc ? -c : c) || a - b;
  });
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The row-count line while a filter is on: "12 of 40 rows · filtered". */
export function filteredWords(shown: number, total: number): string {
  return `${formatCount(shown)} of ${formatCount(total)} ${total === 1 ? "row" : "rows"} · filtered`;
}

/** A column's filter in a line — a chip's label, a button's title: `status: 3 of 5 values`, `name begins with "A"`,
 *  `status: 2 of 5 values · name contains "x"` when both are set. */
export function describeFilter(column: string, kind: ColumnKind, f: ColumnFilter, allValues?: number): string {
  const parts: string[] = [];
  if (f.keep !== undefined) {
    const n = f.keep.length;
    const only = n === 1 ? (f.keep[0] === BLANK_KEY ? "(Blanks)" : `"${f.keep[0]}"`) : null;
    parts.push(only ? `${column} is ${only}`
      : `${column}: ${formatCount(n)}${allValues !== undefined ? ` of ${formatCount(allValues)}` : ""} ${n === 1 ? "value" : "values"}`);
  }
  if (f.condition) {
    const word = CONDITIONS[kind].find(c => c.op === f.condition!.op)?.word ?? f.condition.op;
    const value = kind === "text" ? `"${f.condition.value}"` : f.condition.value.trim();
    parts.push(`${column} ${word} ${value}`);
  }
  return parts.join(" · ");
}
