/**
 * A column's filter as a spreadsheet's arrow offers it: the ticked values become the view's conditions, and applying
 * them replaces only that column's.
 */
import { describe, expect, it } from "vitest";

import {
  EVERYTHING, checklistConditions, checklistOf, columnConditions, conditionsFor, excluding, onlyValue, searchedConditions,
  sortWords, tick, valueKey, withColumnFilter, type Checklist,
} from "./sheetFilters";
import type { Condition, SheetColumn } from "./sheets";

const col = (over: Partial<SheetColumn>): SheetColumn => ({
  id: "c1", name: "order_status", kind: "choice", integer: false, description: "", role: "stored", source: "", currency: "",
  choices: [], hidden: false, expression: "", link: null, via: "", of: "", sheet: "", key: "", by: "", how: "",
  made_by: "", ...over,
});
const STATUS = col({});
const PRICE = col({ id: "c2", name: "price", kind: "money" });
const COLUMNS = [STATUS, PRICE, col({ id: "c3", name: "city", kind: "text" })];
const VALUES = ["canceled", "delivered", "shipped"];
const KNOWN = { values: VALUES, complete: true };

const ticked = (on: string[], blanks: boolean): Checklist =>
  VALUES.reduce((l, v) => tick(STATUS, l, v, on.includes(v)), { ...EVERYTHING, blanks });

describe("the ticked values, as conditions", () => {
  it("everything ticked is no condition", () => {
    expect(checklistConditions(STATUS, EVERYTHING, KNOWN)).toEqual([]);
    expect(checklistConditions(STATUS, ticked(VALUES, true), KNOWN)).toEqual([]);
  });

  it("(Blanks) ticked with some values not: none of the unticked, which admits the empty cells", () => {
    expect(checklistConditions(STATUS, ticked(["delivered", "shipped"], true), KNOWN))
      .toEqual([{ column: "c1", op: "not_in", value: ["canceled"] }]);
  });

  it("(Blanks) not ticked: one of the ticked", () => {
    expect(checklistConditions(STATUS, ticked(["delivered"], false), KNOWN))
      .toEqual([{ column: "c1", op: "in", value: ["delivered"] }]);
  });

  it("(Blanks) alone: is empty", () => {
    expect(checklistConditions(STATUS, ticked([], true), KNOWN)).toEqual([{ column: "c1", op: "empty" }]);
  });

  it("every value and no blank is filled; nothing ticked shows nothing, so it is not applied", () => {
    expect(checklistConditions(STATUS, ticked(VALUES, false), { ...KNOWN, blanks: true }))
      .toEqual([{ column: "c1", op: "not_empty" }]);
    expect(checklistConditions(STATUS, ticked([], false), KNOWN)).toBeNull();
  });

  it("where no cell is empty, every value ticked is the column unfiltered — there is no (Blanks) to tick", () => {
    const none = { ...KNOWN, blanks: false };
    // a column filtered to one value, the other two ticked back
    const back = ["canceled", "shipped"].reduce((l, v) => tick(STATUS, l, v, true),
      checklistOf(STATUS, [{ column: "c1", op: "in", value: ["delivered"] }])!);
    expect(checklistConditions(STATUS, back, none)).toEqual([]);
    expect(checklistConditions(STATUS, back, { ...KNOWN, blanks: true })).toEqual([{ column: "c1", op: "not_empty" }]);
    expect(checklistConditions(STATUS, { ...EVERYTHING, blanks: false }, { values: ["canceled"], complete: false, blanks: false }))
      .toEqual([]);
    // and a pick stays a pick
    expect(checklistConditions(STATUS, ticked(["delivered"], false), none)).toEqual([{ column: "c1", op: "in", value: ["delivered"] }]);
  });

  it("a search's ticked values are the rows shown, and only those", () => {
    expect(searchedConditions(STATUS, ["shipped"])).toEqual([{ column: "c1", op: "in", value: ["shipped"] }]);
    expect(searchedConditions(STATUS, [])).toBeNull();
  });

  it("with values left unlisted, what they are ticked as decides, and the empty cells ride the list", () => {
    const some = { values: ["canceled"], complete: false };
    // the unlisted values ticked (the list started from everything): none of the unticked
    const off = tick(STATUS, EVERYTHING, "canceled", false);
    expect(checklistConditions(STATUS, off, some)).toEqual([{ column: "c1", op: "not_in", value: ["canceled"] }]);
    expect(checklistConditions(STATUS, { ...off, blanks: false }, some))
      .toEqual([{ column: "c1", op: "not_in", value: ["canceled", null] }]);
    // the unlisted values not ticked ((Select all) cleared): one of the ticked, the empty cells as its empty member
    const none: Checklist = { base: false, flipped: {}, blanks: false };
    const one = tick(STATUS, none, "shipped", true);
    expect(checklistConditions(STATUS, one, some)).toEqual([{ column: "c1", op: "in", value: ["shipped"] }]);
    expect(checklistConditions(STATUS, { ...one, blanks: true }, some))
      .toEqual([{ column: "c1", op: "in", value: ["shipped", null] }]);
    expect(checklistConditions(STATUS, none, some)).toBeNull();
    expect(checklistConditions(STATUS, { ...none, blanks: true }, some)).toEqual([{ column: "c1", op: "empty" }]);
  });

  it("reads back what it wrote: a filtered column's list opens ticked as it was applied", () => {
    for (const [on, blanks] of [[["delivered"], false], [["delivered", "shipped"], true], [[], true], [VALUES, false]] as const) {
      const conds = checklistConditions(STATUS, ticked([...on], blanks), KNOWN) ?? [];
      const back = checklistOf(STATUS, conds);
      expect(back).not.toBeNull();
      expect(checklistConditions(STATUS, back!, KNOWN)).toEqual(conds);
    }
    // a group's or a lane's "is" opens with its value ticked alone
    expect(checklistConditions(STATUS, checklistOf(STATUS, [{ column: "c1", op: "is", value: "shipped" }])!, KNOWN))
      .toEqual([{ column: "c1", op: "in", value: ["shipped"] }]);
    // a condition the list cannot show opens with everything ticked — the caller's to say
    expect(checklistOf(STATUS, [{ column: "c1", op: "starts_with", value: "del" }])).toBeNull();
  });

  it("knows a value however it was written: a typed 50 is the 50.00 read back", () => {
    expect(valueKey(PRICE, "50")).toBe(valueKey(PRICE, "50.00"));
    expect(valueKey(PRICE, 50)).toBe(valueKey(PRICE, "50"));
    expect(valueKey(col({ kind: "yesno" }), "true")).toBe(valueKey(col({ kind: "yesno" }), true));
    expect(valueKey(STATUS, "50")).not.toBe(valueKey(STATUS, "50.00"));
    const list = checklistOf(PRICE, [{ column: "c2", op: "in", value: ["50"] }])!;
    expect(checklistConditions(PRICE, list, { values: ["50.00", "60.00"], complete: true }))
      .toEqual([{ column: "c2", op: "in", value: ["50.00"] }]);
  });
});

describe("applying a column's filter", () => {
  const filter: Condition[] = [
    { column: "c3", op: "contains", value: "sao" },
    { column: "c1", op: "in", value: ["delivered"] },
    { column: "", op: "marked", value: "r1" },
    { column: "Order_Status", op: "is_not", value: "canceled" },
    { column: "c2", op: "gt", value: "50" },
  ];

  it("finds the column's conditions by its id or its name, and never a rule's mark", () => {
    expect(columnConditions(filter, "c1", COLUMNS)).toEqual([filter[1], filter[3]]);
    expect(columnConditions(filter, "c3", COLUMNS)).toEqual([filter[0]]);
  });

  it("replaces only that column's conditions, where they stood, and keeps the rest in order", () => {
    const shipped: Condition = { column: "c1", op: "in", value: ["shipped"] };
    expect(withColumnFilter(filter, "c1", COLUMNS, [shipped])).toEqual([filter[0], shipped, filter[2], filter[4]]);
    // none takes the column's filter off
    expect(withColumnFilter(filter, "c1", COLUMNS, [])).toEqual([filter[0], filter[2], filter[4]]);
    // a column not filtered yet: its condition at the end
    const fresh: Condition = { column: "c2", op: "lt", value: "10" };
    expect(withColumnFilter([filter[0]], "c2", COLUMNS, [fresh])).toEqual([filter[0], fresh]);
  });
});

describe("a column's sort and conditions, in its kind's words", () => {
  it("sorts text A to Z, numbers smallest first, dates oldest first", () => {
    expect(sortWords("text")).toEqual({ asc: "A → Z", desc: "Z → A" });
    expect(sortWords("money").asc).toBe("smallest → largest");
    expect(sortWords("datetime").desc).toBe("newest → oldest");
  });

  it("offers begins with and ends with for text, the comparisons for numbers, on, before and after for dates", () => {
    expect(conditionsFor("text")).toEqual(["is", "is_not", "starts_with", "ends_with", "contains", "not_contains",
      "empty", "not_empty"]);
    expect(conditionsFor("number")).toContain("gte");
    expect(conditionsFor("date")).toEqual(["on", "before", "after", "empty", "not_empty"]);
    expect(conditionsFor("yesno")).toEqual([]);
  });
});

describe("a cell's value, from the grid's right-click", () => {
  const ITEMS = col({ id: "c4", name: "items", kind: "number" });

  it("filters by the value alone, as the column's checklist with it ticked; an empty cell is the empty cells", () => {
    expect(onlyValue(STATUS, "shipped")).toEqual([{ column: "c1", op: "in", value: ["shipped"] }]);
    expect(onlyValue(STATUS, "")).toEqual([{ column: "c1", op: "in", value: [null] }]);
    expect(checklistOf(STATUS, onlyValue(STATUS, "shipped")))
      .toEqual({ base: false, flipped: { "s:shipped": "shipped" }, blanks: false });
  });

  it("excludes the value beside what the column already leaves out, or off what it keeps, else one more condition", () => {
    expect(excluding([], STATUS, "shipped")).toEqual([{ column: "c1", op: "not_in", value: ["shipped"] }]);
    const out: Condition[] = [{ column: "c1", op: "not_in", value: ["canceled"] }];
    expect(excluding(out, STATUS, "shipped")).toEqual([{ column: "c1", op: "not_in", value: ["canceled", "shipped"] }]);
    expect(excluding(out, STATUS, "canceled")).toBe(out);                          // already left out
    const kept: Condition[] = [{ column: "c1", op: "in", value: ["delivered", "shipped"] }];
    expect(excluding(kept, STATUS, "shipped")).toEqual([{ column: "c1", op: "in", value: ["delivered"] }]);
    // the last value kept: one more condition, never an empty list
    expect(excluding([{ column: "c1", op: "in", value: ["shipped"] }], STATUS, "shipped")).toEqual([
      { column: "c1", op: "in", value: ["shipped"] }, { column: "c1", op: "not_in", value: ["shipped"] }]);
    // a value kept as text in the filter and read as a number in the cell is the same value
    const typed: Condition[] = [{ column: "c4", op: "not_in", value: ["2"] }];
    expect(excluding(typed, ITEMS, 2)).toBe(typed);
    const gt: Condition[] = [{ column: "c4", op: "gt", value: "1" }];
    expect(excluding(gt, ITEMS, 3)).toEqual([...gt, { column: "c4", op: "not_in", value: [3] }]);
    expect(excluding([], STATUS, null)).toEqual([{ column: "c1", op: "not_in", value: [null] }]);  // the empty cells out
  });
});
