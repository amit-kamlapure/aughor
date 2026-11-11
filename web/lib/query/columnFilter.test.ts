/**
 * A result column's AutoFilter, as pure functions (`lib/query/columnFilter.ts`): what kind a column is, what each
 * condition keeps, how a column sorts, what its checklist lists, and the words the table says while filtered.
 *
 * Every case asserts the rows a filter KEEPS or the order a sort LEAVES — a matcher that half-works looks exactly
 * like a working filter over fewer rows.
 */
import { describe, expect, it } from "vitest";
import {
  BLANK_KEY, columnKind, compareForSort, dateMs, describeFilter, distinctValues, filteredWords, keptRows,
  meetsCondition, sortRows, typedNumber, type ColumnKind, type Condition,
} from "@/lib/query/columnFilter";

const keeps = (values: unknown[], kind: ColumnKind, c: Condition) => values.filter(v => meetsCondition(v, kind, c));

describe("a column's kind is read as the table reads it", () => {
  it("every present value a number — money and shares included — is a number", () => {
    expect(columnKind(["359224.30", "-5421.8", null, ""])).toBe("number");
    expect(columnKind([10, 2.5, 0])).toBe("number");
  });
  it("every present value an ISO date or timestamp is a date", () => {
    expect(columnKind(["2025-09-01", "2025-10-01 00:00:00", "2025-11", null])).toBe("date");
    expect(columnKind(["2024-01-05T10:30:00Z", "2024-01-05 09:00:00+05:30"])).toBe("date");
  });
  it("anything mixed is text, and so are booleans and a column with no values", () => {
    expect(columnKind(["12", "N/A"])).toBe("text");
    expect(columnKind(["2024-01-05", "soon"])).toBe("text");
    expect(columnKind([true, false])).toBe("text");
    expect(columnKind([null, ""])).toBe("text");
  });
  it("a declared type decides first", () => {
    expect(columnKind(["1", "2"], "VARCHAR")).toBe("text");
    expect(columnKind([null], "BIGINT")).toBe("number");
    expect(columnKind(["2024-01-05 10:00:00"], "TIMESTAMP")).toBe("date");
    expect(columnKind(["10:30:00"], "TIME")).toBe("text");
    expect(columnKind(["2024-01-05"], "DATE")).toBe("date");
  });
});

describe("text conditions — without case, as a spreadsheet's", () => {
  const names = ["Alpha", "alpine", "Beta", "gamma ALPHA", null, ""];
  it("Begins with", () => {
    expect(keeps(names, "text", { op: "beginsWith", value: "al" })).toEqual(["Alpha", "alpine"]);
  });
  it("Ends with", () => {
    expect(keeps(names, "text", { op: "endsWith", value: "ALPHA" })).toEqual(["Alpha", "gamma ALPHA"]);
  });
  it("Contains", () => {
    expect(keeps(names, "text", { op: "contains", value: "lph" })).toEqual(["Alpha", "gamma ALPHA"]);
  });
  it("Does not contain keeps the blanks: a blank contains nothing typed", () => {
    expect(keeps(names, "text", { op: "notContains", value: "alp" })).toEqual(["Beta", null, ""]);
  });
  it("Equals is the whole value, and Does not equal keeps the blanks", () => {
    expect(keeps(names, "text", { op: "equals", value: "alpha" })).toEqual(["Alpha"]);
    expect(keeps(names, "text", { op: "notEquals", value: "alpha" })).toEqual(["alpine", "Beta", "gamma ALPHA", null, ""]);
  });
});

describe("number conditions — by size, never as text", () => {
  const amounts = ["9", "10", "100", 2.5, null, "-3"];
  it("> and ≥", () => {
    expect(keeps(amounts, "number", { op: "gt", value: "9" })).toEqual(["10", "100"]);
    expect(keeps(amounts, "number", { op: "ge", value: "9" })).toEqual(["9", "10", "100"]);
  });
  it("< and ≤", () => {
    expect(keeps(amounts, "number", { op: "lt", value: "9" })).toEqual([2.5, "-3"]);
    expect(keeps(amounts, "number", { op: "le", value: "9" })).toEqual(["9", 2.5, "-3"]);
  });
  it("= and ≠, and ≠ keeps the blanks", () => {
    expect(keeps(amounts, "number", { op: "eq", value: "10.0" })).toEqual(["10"]);
    expect(keeps(amounts, "number", { op: "ne", value: "10" })).toEqual(["9", "100", 2.5, null, "-3"]);
  });
  it("reads a number as a person types one", () => {
    expect(typedNumber("1,234.5")).toBe(1234.5);
    expect(typedNumber("$1,000")).toBe(1000);
    expect(typedNumber("(42)")).toBe(-42);
    expect(typedNumber("12%")).toBeCloseTo(0.12);
    expect(typedNumber("twelve")).toBeNull();
    expect(keeps([0.1, 0.5, 0.9], "number", { op: "gt", value: "50%" })).toEqual([0.9]);
  });
  it("a value that is not a number keeps nothing", () => {
    expect(keeps(amounts, "number", { op: "gt", value: "lots" })).toEqual([]);
  });
});

describe("date conditions — by the day", () => {
  const days = ["2024-01-04", "2024-01-05 00:00:00", "2024-01-05 23:59:59", "2024-01-06T08:00:00", "2024-02", null];
  it("on holds at any hour of the day", () => {
    expect(keeps(days, "date", { op: "on", value: "2024-01-05" })).toEqual(["2024-01-05 00:00:00", "2024-01-05 23:59:59"]);
  });
  it("before and after leave the day itself out", () => {
    expect(keeps(days, "date", { op: "before", value: "2024-01-05" })).toEqual(["2024-01-04"]);
    expect(keeps(days, "date", { op: "after", value: "2024-01-05" })).toEqual(["2024-01-06T08:00:00", "2024-02"]);
  });
  it("a date typed any other way keeps nothing", () => {
    expect(keeps(days, "date", { op: "after", value: "Jan 5" })).toEqual([]);
  });
});

describe("sorting follows the kind, and blanks go last both ways", () => {
  const rows = (vals: unknown[]) => vals.map(v => [v]);
  const order = (vals: unknown[], kind: ColumnKind, dir: "asc" | "desc") =>
    sortRows(rows(vals), vals.map((_v, i) => i), { col: 0, dir }, [kind]).map(i => vals[i]);

  it("numbers by size — 9 before 10, as text would not", () => {
    const vals = ["10", "9", "100", null, "-1", "2.5"];
    expect(order(vals, "number", "asc")).toEqual(["-1", "2.5", "9", "10", "100", null]);
    expect(order(vals, "number", "desc")).toEqual(["100", "10", "9", "2.5", "-1", null]);
  });
  it("dates by the instant — a T and a space, an offset, a month — not by their letters", () => {
    const vals = ["2024-01-05T09:00:00", "2024-01-05 10:00:00", "2024-01-05T12:00:00+05:00", "2024-01", ""];
    // 12:00+05:00 is 07:00 UTC; "2024-01" is the first of the month.
    expect(order(vals, "date", "asc")).toEqual(["2024-01", "2024-01-05T12:00:00+05:00", "2024-01-05T09:00:00", "2024-01-05 10:00:00", ""]);
    expect(order(vals, "date", "desc")).toEqual(["2024-01-05 10:00:00", "2024-01-05T09:00:00", "2024-01-05T12:00:00+05:00", "2024-01", ""]);
  });
  it("text in reading order, without case, numbers inside it by size", () => {
    expect(order(["item10", "Item9", "apple", null, "Banana"], "text", "asc")).toEqual(["apple", "Banana", "Item9", "item10", null]);
  });
  it("rows that tie keep the order they came in", () => {
    const r = [["b", 1], ["a", 2], ["b", 3], ["a", 4]];
    expect(sortRows(r, [0, 1, 2, 3], { col: 0, dir: "asc" }, ["text", "number"]).map(i => r[i][1])).toEqual([2, 4, 1, 3]);
    expect(sortRows(r, [0, 1, 2, 3], { col: 0, dir: "desc" }, ["text", "number"]).map(i => r[i][1])).toEqual([1, 3, 2, 4]);
  });
  it("the comparison a grid flips for a descending sort still leaves blanks last", () => {
    // A grid that negates the comparison for desc (TanStack does) asks with desc = true.
    expect(-compareForSort(null, "5", "number", true)).toBeGreaterThan(0);
    expect(compareForSort(null, "5", "number", false)).toBeGreaterThan(0);
  });
  it("reads a date's instant from its own fields", () => {
    expect(dateMs("2024-01-05T12:00:00+05:00")).toBe(Date.UTC(2024, 0, 5, 7));
    expect(dateMs("2024-01-05 00:00:00")).toBe(Date.UTC(2024, 0, 5));
    expect(dateMs("not a date")).toBeNull();
  });
});

describe("the checklist lists a column's values", () => {
  it("each once, with its count, in the column's order, blanks — NULL and empty as one — last", () => {
    const r = [["10"], ["9"], [null], ["10"], [""], ["100"]];
    expect(distinctValues(r, 0, "number")).toEqual([
      { key: "9", value: "9", count: 1 },
      { key: "10", value: "10", count: 2 },
      { key: "100", value: "100", count: 1 },
      { key: BLANK_KEY, value: null, count: 2 },
    ]);
  });
  it("from the rows the other filters leave, when told which", () => {
    const r = [["a"], ["b"], ["a"]];
    expect(distinctValues(r, 0, "text", [1, 2]).map(v => [v.key, v.count])).toEqual([["a", 1], ["b", 1]]);
  });
});

describe("the rows a set of column filters keeps", () => {
  const r = [["North", 10], ["South", 20], [null, 30], ["North", 40], ["East", null]];
  const kinds: ColumnKind[] = ["text", "number"];
  it("a checklist keeps its ticked values, blanks included", () => {
    expect(keptRows(r, { 0: { keep: ["North", BLANK_KEY] } }, kinds)).toEqual([0, 2, 3]);
    expect(keptRows(r, { 0: { keep: [BLANK_KEY] } }, kinds)).toEqual([2]);
  });
  it("a condition and a checklist on one column must both hold; filters on two columns too", () => {
    expect(keptRows(r, { 0: { keep: ["North", "South"] }, 1: { condition: { op: "gt", value: "15" } } }, kinds)).toEqual([1, 3]);
    expect(keptRows(r, { 1: { keep: ["10", "40"], condition: { op: "ge", value: "20" } } }, kinds)).toEqual([3]);
  });
  it("leaves one column's own filter out when asked — the rows its checklist lists", () => {
    const f = { 0: { keep: ["North"] }, 1: { condition: { op: "lt" as const, value: "35" } } };
    expect(keptRows(r, f, kinds, 0)).toEqual([0, 1, 2]);
    expect(keptRows(r, f, kinds)).toEqual([0]);
  });
  it("no filter keeps every row", () => {
    expect(keptRows(r, {}, kinds)).toEqual([0, 1, 2, 3, 4]);
    expect(keptRows(r, { 0: {} }, kinds)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("the words", () => {
  it("say how many rows a filter leaves of how many", () => {
    expect(filteredWords(12, 40)).toBe("12 of 40 rows · filtered");
    expect(filteredWords(1204, 5000)).toBe("1,204 of 5,000 rows · filtered");
    expect(filteredWords(0, 1)).toBe("0 of 1 row · filtered");
  });
  it("say a column's filter in a line", () => {
    expect(describeFilter("status", "text", { keep: ["a", "b"] }, 5)).toBe("status: 2 of 5 values");
    expect(describeFilter("status", "text", { keep: ["Complete"] })).toBe('status is "Complete"');
    expect(describeFilter("status", "text", { keep: [BLANK_KEY] })).toBe("status is (Blanks)");
    expect(describeFilter("name", "text", { condition: { op: "beginsWith", value: "A" } })).toBe('name begins with "A"');
    expect(describeFilter("total", "number", { condition: { op: "ge", value: "10" } })).toBe("total ≥ 10");
    expect(describeFilter("day", "date", { condition: { op: "before", value: "2024-01-05" }, keep: ["x", "y"] }))
      .toBe("day: 2 values · day before 2024-01-05");
  });
});
