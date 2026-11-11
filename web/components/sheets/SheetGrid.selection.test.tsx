// @vitest-environment jsdom
/**
 * The sheet's grid, as a results grid does it (the user, 2026-11-09): a Number column's Format from its one menu —
 * what its cells and totals show, never what a copy or a filter reads — a row's number selecting its row (Shift, the
 * rows between), the corner selecting every cell, and a right-click on what is selected opening its menu: Copy, Copy
 * as, Copy column names, Filter by and Exclude this value (one cell only, said otherwise) and Open row.
 *
 * jsdom measures every element as 0×0, so the row virtualizer would mount nothing; it is stubbed to hand back every row.
 * What is asserted is what the grid renders, selects and hands up — never geometry.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, start: i * 30, size: 30, key: i })),
    getTotalSize: () => count * 30,
    scrollToIndex: () => {},
    range: { startIndex: 0, endIndex: Math.max(0, count - 1) },
  }),
}));

import { GridHeader, SheetGrid, layoutColumns } from "./SheetGrid";
import type { RowBlocks } from "./useRowBlocks";
import { setOrgSettingsCache } from "@/lib/orgSettings";
import type { OrgSettings } from "@/lib/api";
import type { Condition, Sheet, SheetColumn } from "@/lib/sheets";

const base = {
  role: "stored", integer: false, description: "", currency: "", choices: [], hidden: false, expression: "",
  link: null, via: "", of: "", sheet: "", key: "", by: "", how: "", made_by: "",
};
const col = (id: string, name: string, kind: string, extra: Partial<SheetColumn> = {}) =>
  ({ ...base, id, name, kind, source: name, ...extra }) as SheetColumn;
const COLS = [col("c0", "order_id", "text"), col("c1", "order_status", "text"), col("c2", "revenue", "number", { format: "currency" })];
const SHEET = { id: "s1", name: "Olist orders", table: "t", columns: COLS, rules: [], views: [], me: "user:ana",
  source: { kind: "file", file: "orders.csv", rows: 4 } } as unknown as Sheet;
const DATA: unknown[][] = [
  [1, "e481f51c", "delivered", 1240.35],
  [2, "53cdb2fc", "shipped", 0.5],
  [3, "47770eb9", "delivered", null],
  [4, "949d5b44", "canceled", 12400],
];
const rows = (): RowBlocks => ({
  total: DATA.length, stale: false, columns: COLS.map(c => c.id), failed: null,
  totals: { c2: { filled: 3, sum: 13640.85, average: 4546.95 } },
  rowAt: i => DATA[i], rowByNumber: n => DATA.find(r => r[0] === n), changedOf: () => undefined, versionOf: () => 0,
  marksOf: () => [], onVisible: () => {}, retry: () => {},
});

beforeAll(() => {
  // jsdom has no PointerEvent: a mouse event stands in, so a press carries its button and Shift (as GridSizes.test does)
  if (!("PointerEvent" in globalThis)) {
    class PointerEventStub extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
    }
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
  }
});

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
  });
  setOrgSettingsCache({ currency_code: "USD" } as OrgSettings);
});
afterEach(() => setOrgSettingsCache(null));

const grid = (over: Partial<Parameters<typeof SheetGrid>[0]> = {}) => {
  const onOpenRow = vi.fn();
  const onFilter = vi.fn();
  render(<SheetGrid sheet={SHEET} rows={rows()} hidden={new Set()} editable onEdit={async () => ({ ok: true })}
    onOpenRow={onOpenRow} onFilter={onFilter} filter={[]} onColumnAction={() => {}} {...over} />);
  return { onOpenRow, onFilter };
};
const cellOf = (row: number, column: string) =>
  document.querySelector<HTMLElement>(`[role="gridcell"][data-row="${row}"][data-column="${column}"]`)!;
const selectedCells = () => [...document.querySelectorAll('[role="gridcell"][aria-selected="true"]')]
  .map(el => `${el.getAttribute("data-row")}:${el.getAttribute("data-column")}`);
const rowHead = (n: number) => screen.getByRole("rowheader", { name: `Row ${n}` });
const flush = () => new Promise(r => setTimeout(r, 0));

describe("a Number column's format", () => {
  it("offers the seven in its one menu, each with its example as the menu shows it, the current one ticked", () => {
    const onFormat = vi.fn();
    render(<GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())} onAction={() => {}} onFormat={onFormat} />);
    fireEvent.click(screen.getByLabelText("The revenue column's menu"));
    fireEvent.click(screen.getByRole("button", { name: /^Format/ }));
    const group = screen.getByRole("group", { name: "How revenue shows its values" });
    const items = within(group).getAllByRole("button");
    expect(items.map(b => b.textContent)).toEqual(["None1240.35", "Standard1,240.35", "Compact12.4K",
      "Currency$1,240.35", "Percentage12.4%", "Scientific1.2E3", "Bytes1.21 KB"]);
    expect(items.filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent)).toEqual(["Currency$1,240.35"]);
    expect(items[3].querySelector(".tabler-icon-check")).not.toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: /^Compact/ }));
    expect(onFormat).toHaveBeenCalledWith("c2", "compact");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is a Number column's alone, is greyed for someone who may not change the sheet, and says when no currency is declared", () => {
    setOrgSettingsCache(null);
    const { unmount } = render(<GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())}
      onAction={() => {}} onFormat={() => {}} />);
    fireEvent.click(screen.getByLabelText("The order_id column's menu"));
    expect(screen.queryByRole("button", { name: /^Format/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy column name" })).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("The revenue column's menu"));
    fireEvent.click(screen.getByRole("button", { name: /^Format/ }));
    expect(screen.getByRole("button", { name: /^Currency/ })).toHaveTextContent("Currency1,240.35");
    expect(screen.getByText("No reporting currency is declared, so Currency shows no symbol")).toBeInTheDocument();
    unmount();
    render(<GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())} onAction={() => {}} />);
    fireEvent.click(screen.getByLabelText("The revenue column's menu"));
    const format = screen.getByRole("button", { name: /^Format/ });
    expect(format).toBeDisabled();
    expect(format.title).toBe("Only someone who can change the sheet sets how a column shows its values");
  });

  it("draws the cells and the totals in the format, while a copy reads the value itself", async () => {
    grid();
    expect(cellOf(1, "c2")).toHaveTextContent("$1,240.35");
    expect(cellOf(2, "c2")).toHaveTextContent("$0.50");
    expect(cellOf(4, "c2")).toHaveTextContent("$12,400.00");
    expect(cellOf(1, "c2").querySelector("span")?.title).toBe("1240.35");               // the value itself, on hover
    expect(screen.getByTitle("sum $13,640.85 · avg $4,546.95")).toBeInTheDocument();
    fireEvent.pointerDown(cellOf(1, "c2"), { button: 0 });
    fireEvent.keyDown(screen.getByRole("grid"), { key: "c", metaKey: true });
    await flush();
    expect(written).toEqual(["1240.35"]);
    fireEvent.contextMenu(cellOf(1, "c2"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy as" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "CSV" }));
    await flush();
    expect(written[1]).toBe("revenue\r\n1240.35");
  });
});

describe("a row's number and the corner", () => {
  it("draws its rows at the reading size, in the app's font — as the SQL editor's results draw theirs", () => {
    grid();
    const rows = screen.getAllByRole("row").filter(r => r.querySelector("[role=rowheader], [aria-label^='Open row']"));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r).toHaveClass("aug-fs-ui");
      expect(r.style.fontFamily).toBe("");
    }
  });

  it("selects the whole row on a click, the rows between on Shift+click, and keeps its Open row button", () => {
    const { onOpenRow } = grid();
    fireEvent.pointerDown(rowHead(1), { button: 0 });
    expect(selectedCells()).toEqual(["1:c0", "1:c1", "1:c2"]);
    expect(rowHead(1)).toHaveAttribute("aria-selected", "true");
    fireEvent.pointerDown(rowHead(3), { button: 0, shiftKey: true });
    expect(selectedCells()).toEqual(["1:c0", "1:c1", "1:c2", "2:c0", "2:c1", "2:c2", "3:c0", "3:c1", "3:c2"]);
    expect(rowHead(4)).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("status", { name: "The selected cell" })).toHaveTextContent("3 rows × 3 columns");
    // a plain click starts again from the row clicked
    fireEvent.pointerDown(rowHead(4), { button: 0 });
    expect(selectedCells()).toEqual(["4:c0", "4:c1", "4:c2"]);
    // the Open row button opens the record and selects nothing new
    const open = screen.getByRole("button", { name: "Open row 2" });
    fireEvent.pointerDown(open, { button: 0 });
    fireEvent.click(open);
    expect(onOpenRow).toHaveBeenCalledWith(2);
    expect(selectedCells()).toEqual(["4:c0", "4:c1", "4:c2"]);
  });

  it("selects every row and column the view shows from the corner, drawn selected while they are", () => {
    grid();
    const corner = document.querySelector<HTMLElement>("[data-corner]")!;
    expect(corner.style.background).toBe("var(--bg-2)");
    fireEvent.pointerDown(corner, { button: 0 });
    expect(selectedCells()).toHaveLength(DATA.length * COLS.length);
    expect(corner.style.background).toBe("var(--bg-sel)");
    expect(DATA.every(r => rowHead(Number(r[0])).getAttribute("aria-selected") === "true")).toBe(true);
  });

  it("selects the rows of the selection with Shift+Space", () => {
    grid();
    fireEvent.pointerDown(cellOf(2, "c1"), { button: 0 });
    fireEvent.pointerDown(cellOf(3, "c1"), { button: 0, shiftKey: true });
    fireEvent.keyDown(screen.getByRole("grid"), { key: " ", shiftKey: true });
    expect(selectedCells()).toEqual(["2:c0", "2:c1", "2:c2", "3:c0", "3:c1", "3:c2"]);
  });
});

describe("a right-click on the selection", () => {
  const items = () => screen.getAllByRole("menuitem").map(b => b.textContent);

  it("opens its menu on a cell, selecting that cell first when it is outside the selection", () => {
    grid();
    fireEvent.pointerDown(cellOf(1, "c0"), { button: 0 });
    fireEvent.contextMenu(cellOf(2, "c1"));
    expect(selectedCells()).toEqual(["2:c1"]);
    const menu = screen.getByRole("menu", { name: "The selection — 1 cell" });
    expect(items()).toEqual(["Copy⌘C", "Copy as", "Copy column names", "Filter by this value", "Exclude this value",
      "Open row"]);
    expect(within(menu).getByRole("menuitem", { name: "Filter by this value" })).toBeEnabled();
    expect(document.activeElement).toBe(within(menu).getAllByRole("menuitem")[0]);         // Copy, ready for Enter
  });

  it("keeps a selection right-clicked inside, and greys the filters with their reason", async () => {
    grid();
    fireEvent.pointerDown(rowHead(1), { button: 0 });
    fireEvent.pointerDown(rowHead(2), { button: 0, shiftKey: true });
    fireEvent.contextMenu(cellOf(2, "c1"));
    expect(selectedCells()).toHaveLength(6);
    expect(screen.getByRole("menu", { name: "The selection — 2 rows" })).toBeInTheDocument();
    const filterBy = screen.getByRole("menuitem", { name: /^Filter by this value/ });
    expect(filterBy).toBeDisabled();
    expect(filterBy).toHaveTextContent("select one cell");
    expect(screen.getByRole("menuitem", { name: /^Exclude this value/ })).toBeDisabled();
    // Copy as: the selection with its columns' names, each value itself
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy as" }));
    expect(within(screen.getByRole("group", { name: "Copy as" })).getAllByRole("menuitem").map(b => b.textContent))
      .toEqual(["CSV", "TSV", "JSON", "Markdown table", "SQL values"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "JSON" }));
    await flush();
    expect(JSON.parse(written[0])).toEqual([
      { order_id: "e481f51c", order_status: "delivered", revenue: 1240.35 },
      { order_id: "53cdb2fc", order_status: "shipped", revenue: 0.5 }]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: "The selected cell" })).toHaveTextContent("Copied 6 cells as JSON");
    // a right-click on a row's number among those selected keeps them too
    fireEvent.contextMenu(rowHead(2));
    expect(selectedCells()).toHaveLength(6);
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy column names" }));
    await flush();
    expect(written[1]).toBe("order_id\torder_status\trevenue");
  });

  it("filters by the one cell's value, and excludes it beside what the column already leaves out", () => {
    const { onFilter } = grid({ filter: [{ column: "c1", op: "not_in", value: ["canceled"] }] as Condition[] });
    fireEvent.contextMenu(cellOf(1, "c1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Filter by this value" }));
    expect(onFilter).toHaveBeenLastCalledWith("c1", [{ column: "c1", op: "in", value: ["delivered"] }]);
    fireEvent.contextMenu(cellOf(2, "c1"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Exclude this value" }));
    expect(onFilter).toHaveBeenLastCalledWith("c1", [{ column: "c1", op: "not_in", value: ["canceled", "shipped"] }]);
    // an empty cell's value is the empty cells
    fireEvent.contextMenu(cellOf(3, "c2"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Filter by this value" }));
    expect(onFilter).toHaveBeenLastCalledWith("c2", [{ column: "c2", op: "in", value: [null] }]);
  });

  it("opens the right-clicked row's record, closes on Escape, and opens from the keyboard", () => {
    const { onOpenRow } = grid();
    fireEvent.contextMenu(cellOf(3, "c0"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open row" }));
    expect(onOpenRow).toHaveBeenCalledWith(3);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.contextMenu(cellOf(3, "c0"));
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Copy as" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("grid"));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu", { name: "The selection — 1 cell" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { button: 0 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("copies a column's name from its menu, said in the cell bar", async () => {
    grid();
    fireEvent.click(screen.getByLabelText("The order_status column's menu"));
    fireEvent.click(screen.getByRole("button", { name: "Copy column name" }));
    await flush();
    expect(written).toEqual(["order_status"]);
    expect(screen.getByRole("status", { name: "The selected cell" })).toHaveTextContent("Copied the column name order_status");
  });
});
