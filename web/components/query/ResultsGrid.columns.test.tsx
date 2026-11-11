// @vitest-environment jsdom
/**
 * The results grid as the user drew it (2026-11-09, with screenshots): the sort and the ▾ at a column head's
 * right edge, shown where the pointer is and drawn at rest only while in force; one ▾ menu that also copies the
 * column's name, pins it at the left and shows a number column in a format; a row's number selects the whole row, the
 * corner every row; and a right-click inside the selection opens a menu about the selection — Copy, Copy as, Copy
 * column names, the value filters (one cell's only), the value panel.
 *
 * jsdom draws no CSS: "shown where the pointer is" is the class that hides the control at rest, asserted as such.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { ResultsGrid, type ResultColumnFilters } from "./ResultsGrid";
import type { Cell } from "@/lib/query/resultFilter";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, start: i * 30, size: 30, key: i })),
    getTotalSize: () => count * 30,
  }),
}));

const COLUMNS = ["status", "total"];
const TYPED = [{ name: "status", type: "VARCHAR" }, { name: "total", type: "BIGINT" }];
const ROWS: Cell[][] = [["Complete", 10], ["Shipped", 5], [null, 7]];

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: vi.fn(async (t: string) => { written.push(t); }) },
  });
});

function filters(filtered: number[] = []): ResultColumnFilters {
  return { rows: ROWS, filterOf: () => undefined, isFiltered: c => filtered.includes(c), others: () => undefined,
    apply: vi.fn(), clear: vi.fn() };
}
const heads = () => screen.getAllByTestId("grid-col-head");
const HOVER_ONLY = "hidden group-hover:inline-flex";
const arrowOf = (head: HTMLElement) => within(head).getByTestId("column-filter").parentElement as HTMLElement;
const openMenu = (i: number) => fireEvent.click(within(heads()[i]).getByTestId("column-filter"));
const aggregate = () => screen.queryByTestId("grid-aggregate")?.textContent ?? "";

describe("a column head: the sort and the ▾ at its right edge, where the pointer is", () => {
  it("draws both only on hover at rest, after the name, the ▾ last before the edge", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} columnFilters={filters()} />);
    const head = heads()[0];
    const sort = within(head).getByTestId("grid-col-sort");
    expect(sort.className).toContain(HOVER_ONLY);
    expect(arrowOf(head).className).toContain(HOVER_ONLY);
    const kids = [...head.children];
    expect(kids.indexOf(sort)).toBeLessThan(kids.indexOf(arrowOf(head)));
    expect(kids.indexOf(arrowOf(head))).toBe(kids.length - 2);          // only the resize edge after it
  });

  it("keeps the sort drawn while the column is sorted, and the ▾ while it is filtered", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} columnFilters={filters([1])} />);
    fireEvent.click(within(heads()[0]).getByRole("button", { name: "Sort by status" }));
    expect(within(heads()[0]).getByTestId("grid-col-sort").className).not.toContain("hidden");
    expect(within(heads()[0]).getByTitle("Lowest first")).toBeInTheDocument();
    expect(arrowOf(heads()[1]).className).not.toContain("hidden");
    expect(arrowOf(heads()[0]).className).toContain(HOVER_ONLY);
  });
});

describe("the ▾ menu: copy the column's name, pin it, show a number column in a format", () => {
  it("copies the name and pins the column at the left, before the others, opaque as the rest scroll under it", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} columnFilters={filters()} />);
    openMenu(1);
    fireEvent.click(screen.getByTestId("column-copy-name"));
    expect(written).toEqual(["total"]);
    openMenu(1);
    fireEvent.click(screen.getByTestId("column-pin"));
    expect(heads().map(h => h.textContent?.includes("total"))).toEqual([true, false]);
    expect(heads()[0].style.position).toBe("sticky");
    const cell = screen.getByText("10");
    expect(cell.style.position).toBe("sticky");
    expect(cell.style.backgroundColor).toBe("var(--bg-0)");
    openMenu(0);
    expect(screen.getByTestId("column-pin")).toHaveTextContent("Unpin column");
    fireEvent.click(screen.getByTestId("column-pin"));
    expect(heads().map(h => h.textContent?.includes("total"))).toEqual([false, true]);
    expect(screen.getByText("10").style.position).not.toBe("sticky");
  });

  it("shows a number column in the format chosen, never changing what the cell holds", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={[["a", 1240.35], ["b", 0.124]]} columnFilters={filters()} />);
    openMenu(1);
    fireEvent.click(screen.getByTestId("column-format"));
    expect(within(screen.getByTestId("column-formats")).getAllByRole("radio").map(r => r.textContent)).toEqual([
      "None1240.35", "Grouped1,240.35", "Standard1,240.35", "Compact12.4K", "Currency1,240.35", "Percentage12.4%",
      "Scientific1.2E3", "Bytes1.21 KB"]);
    fireEvent.click(screen.getByTestId("column-format-standard"));
    const cell = screen.getByText("1,240.35");
    expect(cell).toHaveAttribute("title", "1240.35");
    // a text column has no number format to offer
    openMenu(0);
    expect(screen.queryByTestId("column-format")).toBeNull();
  });
});

describe("a number's digits, grouped by default (the user, 2026-11-10: separators, not on ids)", () => {
  it("groups a measure's thousands, keeps every decimal, and leaves an id, a key or a year as it is", () => {
    render(<ResultsGrid columns={["order_id", "revenue", "year", "ratio"]}
      columnsTyped={[{ name: "order_id", type: "BIGINT" }, { name: "revenue", type: "DOUBLE" }, { name: "year", type: "BIGINT" },
                     { name: "ratio", type: "DOUBLE" }]}
      rows={[[48377, 100522.59, 2024, 0.0034567]]} />);
    expect(screen.getByText("48377")).toBeTruthy();                 // an id is never "48,377"
    expect(screen.getByText("100,522.59")).toHaveAttribute("title", "100522.59");   // the cell still holds the value
    expect(screen.getByText("2024")).toBeTruthy();                  // nor a year "2,024"
    expect(screen.getByText("0.0034567")).toBeTruthy();             // nothing rounded
  });
});

describe("a whole row, and the whole result", () => {
  it("a row's number selects its row, Shift the rows between, and the corner every row", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} />);
    const nums = () => screen.getAllByTestId("grid-rownum");
    fireEvent.mouseDown(nums()[0]);
    expect(aggregate()).toContain("2 cells");
    expect(nums()[0].style.background).toBe("var(--bg-sel)");
    fireEvent.mouseDown(nums()[2], { shiftKey: true });
    expect(aggregate()).toContain("6 cells");
    fireEvent.mouseDown(nums()[1]);
    expect(aggregate()).toContain("2 cells");
    expect(nums()[0].style.background).toBe("var(--bg-1)");
    fireEvent.mouseDown(screen.getByTestId("grid-rownum-header"));
    expect(aggregate()).toContain("6 cells");
  });

  it("a right-click inside the selection keeps it, and its menu copies it in a stated form", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} onAddFilter={vi.fn()} />);
    fireEvent.mouseDown(screen.getByTestId("grid-rownum-header"));
    // as a browser sends a right-click: the button's press first, then the menu
    fireEvent.mouseDown(screen.getByText("Shipped"), { button: 2 });
    fireEvent.contextMenu(screen.getByText("Shipped"));
    const menu = screen.getByTestId("cell-menu");
    expect(menu).toHaveTextContent("6 cells · 3 rows · 2 columns");
    expect(aggregate()).toContain("6 cells");                        // the selection stood
    // the value filters are one value's: with many cells selected, they say to select one
    expect(screen.getByTestId("cell-filter-is")).toBeDisabled();
    expect(screen.getByTestId("cell-filter-is")).toHaveAttribute("title", "Select one cell to filter by its value");
    fireEvent.click(screen.getByTestId("cell-copy-as"));
    fireEvent.click(screen.getByTestId("cell-copy-as-csv"));
    expect(written).toEqual(["status,total\r\nComplete,10\r\nShipped,5\r\n,7"]);
    fireEvent.contextMenu(screen.getByText("Shipped"));
    fireEvent.click(screen.getByTestId("cell-copy-names"));
    expect(written[1]).toBe("status\ttotal");
  });

  it("a right-click outside the selection makes the cell the selection, and its menu is the cell's", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} onAddFilter={vi.fn()} />);
    fireEvent.mouseDown(screen.getAllByTestId("grid-rownum")[0]);
    fireEvent.contextMenu(screen.getByText("Shipped"));
    expect(screen.getByTestId("cell-menu")).toHaveTextContent('status · "Shipped"');
    expect(screen.getByTestId("cell-filter-is")).not.toBeDisabled();
    expect(aggregate()).toBe("");
  });

  it("a right-click on a row's number selects the row and opens the selection's menu", () => {
    render(<ResultsGrid columns={COLUMNS} columnsTyped={TYPED} rows={ROWS} onAddFilter={vi.fn()} />);
    fireEvent.mouseDown(screen.getAllByTestId("grid-rownum")[1], { button: 2 });
    fireEvent.contextMenu(screen.getAllByTestId("grid-rownum")[1]);
    expect(screen.getByTestId("cell-menu")).toHaveTextContent("2 cells · 1 row · 2 columns");
    fireEvent.click(screen.getByTestId("cell-copy-selection"));
    expect(written).toEqual(["Shipped\t5"]);
  });
});
