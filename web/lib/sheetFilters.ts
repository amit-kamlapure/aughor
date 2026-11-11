/**
 * A column's filter, as a spreadsheet's arrow offers it (the user, 2026-11-09, showing a spreadsheet's column filter): its sort in
 * its kind's words, the conditions its kind takes, and the list of its values ticked or not — and how each becomes the
 * conditions the view's filter holds. Pure: the column's menu (`components/sheets/ColumnMenu.tsx`) draws it.
 *
 * A column's conditions are the ones naming it, by its id or its name, as the server reads a filter; applying the
 * column's menu replaces only those, and every other column's conditions stay as they were.
 */
import type { Condition, Kind, SheetColumn } from "@/lib/sheets";

/** A column's two sorts, in its kind's words. */
export function sortWords(kind: Kind): { asc: string; desc: string } {
  if (kind === "number" || kind === "money") return { asc: "smallest → largest", desc: "largest → smallest" };
  if (kind === "date" || kind === "datetime") return { asc: "oldest → newest", desc: "newest → oldest" };
  if (kind === "yesno") return { asc: "No → Yes", desc: "Yes → No" };
  return { asc: "A → Z", desc: "Z → A" };
}

/** The family of conditions a kind takes — none for a Yes/No, whose list of values is all there is to pick. */
export function filterFamily(kind: Kind): "Text" | "Number" | "Date" | null {
  if (kind === "number" || kind === "money") return "Number";
  if (kind === "date" || kind === "datetime") return "Date";
  if (kind === "yesno") return null;
  return "Text";
}

/** Each condition in the words the column's menu names it by. */
export const CONDITION_WORDS: Record<string, string> = {
  is: "Equals", is_not: "Does not equal", starts_with: "Begins with", ends_with: "Ends with", contains: "Contains",
  not_contains: "Does not contain", gt: "Greater than", gte: "Greater than or equal to", lt: "Less than",
  lte: "Less than or equal to", on: "On", before: "Before", after: "After", empty: "Is empty", not_empty: "Is filled",
};

/** The conditions a kind's family offers, in the order a spreadsheet lists them. */
export function conditionsFor(kind: Kind): string[] {
  const family = filterFamily(kind);
  if (family === "Number") return ["is", "is_not", "gt", "gte", "lt", "lte", "empty", "not_empty"];
  if (family === "Date") return ["on", "before", "after", "empty", "not_empty"];
  if (family === "Text") return ["is", "is_not", "starts_with", "ends_with", "contains", "not_contains", "empty", "not_empty"];
  return [];
}

/** A condition that needs no value. */
export const valueless = (op: string) => op === "empty" || op === "not_empty";

/** The column a condition names — by its id, else its name, as the server finds it (`Sheet.column`). A rule's mark
 *  names none. */
function named(c: Condition, columns: SheetColumn[]): SheetColumn | undefined {
  if (c.op === "marked" || c.op === "not_marked") return undefined;
  const ref = String(c.column ?? "");
  return columns.find(x => x.id === ref) ?? columns.find(x => x.name.toLowerCase() === ref.trim().toLowerCase());
}

/** The conditions of a filter that are on this column. */
export function columnConditions(filter: Condition[], column: string, columns: SheetColumn[]): Condition[] {
  return filter.filter(c => named(c, columns)?.id === column);
}

/** The filter with this column's conditions replaced by `conditions` — where its first one stood, or at the end — and
 *  every other condition kept, in its order. No conditions takes the column's filter off. */
export function withColumnFilter(filter: Condition[], column: string, columns: SheetColumn[],
  conditions: Condition[]): Condition[] {
  const own = (c: Condition) => named(c, columns)?.id === column;
  const at = filter.findIndex(own);
  const kept = filter.filter(c => !own(c));
  const place = at < 0 ? kept.length : filter.slice(0, at).filter(c => !own(c)).length;
  return [...kept.slice(0, place), ...conditions, ...kept.slice(place)];
}

// ── the list of values ────────────────────────────────────────────────────────────────────────────────────────────────

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** A value's identity in a column's list: the same value however it was written — a typed "50" and a read 50 in a
 *  number column, "29.9" and "29.90" in money — so a filter kept as text ticks the value read back as a number. */
export function valueKey(column: Pick<SheetColumn, "kind">, value: unknown): string {
  if (isBlank(value)) return "∅";
  if (column.kind === "number" || column.kind === "money") {
    const n = Number(value);
    return Number.isNaN(n) ? `s:${String(value)}` : `n:${n}`;
  }
  if (column.kind === "yesno") return `b:${value === true || String(value).toLowerCase() === "true"}`;
  return `s:${String(value)}`;
}

/**
 * Which of a column's values are ticked: every value as `base` says, but those in `flipped` (by `valueKey`), which are
 * the other way — so a value never read (past what was listed) is ticked as `base` says. `blanks`: the empty cells.
 */
export interface Checklist { base: boolean; flipped: Record<string, unknown>; blanks: boolean }

/** Everything ticked: the column unfiltered. */
export const EVERYTHING: Checklist = { base: true, flipped: {}, blanks: true };

export function isTicked(column: Pick<SheetColumn, "kind">, list: Checklist, value: unknown): boolean {
  return valueKey(column, value) in list.flipped ? !list.base : list.base;
}

/** The list with one value ticked or not. */
export function tick(column: Pick<SheetColumn, "kind">, list: Checklist, value: unknown, on: boolean): Checklist {
  const key = valueKey(column, value);
  const flipped = { ...list.flipped };
  if (on === list.base) delete flipped[key];
  else flipped[key] = value;
  return { ...list, flipped };
}

/**
 * The list as a column's conditions show it: nothing — everything ticked; one of — those ticked; none of — those not;
 * is empty — the empty cells alone; is filled — every value and no empty cell; a list's empty member — the empty cells
 * among the ticked. Null when the column is filtered some other way (a condition such as begins with): the list cannot
 * show that, and starts with everything ticked.
 */
export function checklistOf(column: Pick<SheetColumn, "kind">, conditions: Condition[]): Checklist | null {
  if (conditions.length === 0) return EVERYTHING;
  if (conditions.length > 1) return null;
  const [c] = conditions;
  const values = Array.isArray(c.value) ? c.value : [c.value];
  const flipped = Object.fromEntries(values.filter(v => !isBlank(v)).map(v => [valueKey(column, v), v]));
  const withBlank = values.some(isBlank);
  if (c.op === "in") return { base: false, flipped, blanks: withBlank };
  if (c.op === "not_in") return { base: true, flipped, blanks: !withBlank };
  if (c.op === "is" && !isBlank(c.value)) return { base: false, flipped, blanks: false };
  if (c.op === "empty") return { base: false, flipped: {}, blanks: true };
  if (c.op === "not_empty") return { base: true, flipped: {}, blanks: false };
  return null;
}

/**
 * The conditions a list of ticked values is applied as — on the column `column`, given the values the list was read
 * with (`known`, `complete` when none was left unlisted). Everything ticked is no condition. With every value known, a
 * spreadsheet's reading: (Blanks) ticked with some values not is "none of" those (it admits the empty cells); (Blanks)
 * not ticked is "one of" the values ticked; (Blanks) alone is "is empty"; every value but no blank is "is filled". With
 * values left unlisted, what they are ticked as (`base`) decides, and the empty cells ride the list as its empty member.
 * Where no cell is empty (`known.blanks` false — no (Blanks) to tick), every value ticked is everything ticked. Null
 * when nothing is ticked — there would be no row to show.
 */
export function checklistConditions(column: Pick<SheetColumn, "id" | "kind">, list: Checklist,
  known: { values: unknown[]; complete: boolean; blanks?: boolean }): Condition[] | null {
  const on = (op: string, value?: unknown): Condition[] => [{ column: column.id, op, ...(value === undefined ? {} : { value }) }];
  const everything = list.blanks || known.blanks === false;
  if (known.complete) {
    const ticked = known.values.filter(v => isTicked(column, list, v));
    const unticked = known.values.filter(v => !isTicked(column, list, v));
    if (!unticked.length) return everything ? [] : on("not_empty");
    if (!ticked.length) return list.blanks ? on("empty") : null;
    return list.blanks ? on("not_in", unticked) : on("in", ticked);
  }
  const flipped = Object.values(list.flipped);
  if (list.base) {
    if (!flipped.length) return everything ? [] : on("not_empty");
    return on("not_in", list.blanks ? flipped : [...flipped, null]);
  }
  if (!flipped.length) return list.blanks ? on("empty") : null;
  return on("in", list.blanks ? [...flipped, null] : flipped);
}

// ── a cell's value, from the grid's right-click ──────────────────────────────────────────────────────────────────────

/** "Filter by this value": the column's rows holding this value alone — its checklist with it ticked, so the column's
 *  menu opens showing it. A cell in sight holds a value its column's conditions admit, so this narrows them, never
 *  widens them. An empty cell is the list's empty member: the empty cells. */
export function onlyValue(column: Pick<SheetColumn, "id">, value: unknown): Condition[] {
  return [{ column: column.id, op: "in", value: [isBlank(value) ? null : value] }];
}

/** "Exclude this value": the column's conditions with this value left out too — added to the list its checklist leaves
 *  out, taken off the list it keeps, else one more condition beside the ones it has. An empty cell leaves out the
 *  empty cells; any other value leaves them in. */
export function excluding(own: Condition[], column: Pick<SheetColumn, "id" | "kind">, value: unknown): Condition[] {
  const key = valueKey(column, value);
  const member = isBlank(value) ? null : value;
  const out: Condition = { column: column.id, op: "not_in", value: [member] };
  if (own.length === 1 && Array.isArray(own[0].value)) {
    const values = own[0].value as unknown[];
    const listed = values.some(v => valueKey(column, v) === key);
    if (own[0].op === "not_in") return listed ? own : [{ ...own[0], value: [...values, member] }];
    if (own[0].op === "in" && listed && values.length > 1) {
      return [{ ...own[0], value: values.filter(v => valueKey(column, v) !== key) }];
    }
  }
  return [...own, out];
}

/** A search's ticked values, applied as a spreadsheet applies them: the rows holding one of them, and only those —
 *  searching "ship" and pressing OK shows the shipped rows. Null when none is ticked. */
export function searchedConditions(column: Pick<SheetColumn, "id">, ticked: unknown[]): Condition[] | null {
  return ticked.length ? [{ column: column.id, op: "in", value: ticked }] : null;
}
