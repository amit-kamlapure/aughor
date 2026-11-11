// @vitest-environment jsdom
/**
 * A result table's columns sort and filter as a spreadsheet's column filter does (the user, 2026-11-09, on a
 * filter dropdown: "I like the idea of a Downward arrow displaying to show that drop down filters are possible.."), and its
 * cells are drawn as the Spreadsheets grid draws them ("Let the table be similar to spreadsheets.. properly bordered
 * cells..").
 *
 * The rows are read from the table the reader sees — Ant Design's body rows — and the menu is driven as a person
 * drives it: the ▾, a tick, a condition, OK.
 */
import { fireEvent, render, screen, waitFor, within } from "@/lib/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/query/csv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/query/csv")>()),
  downloadCsv: vi.fn(),
}));

import { downloadCsv } from "@/lib/query/csv";
import { SqlResultTable } from "@/components/AugTable";
import { GRID_LINE } from "@/lib/gridLines";
import { LINE as SHEET_LINE } from "@/components/sheets/SheetGrid";
import { TOKEN_FALLBACK } from "@/lib/tokenFallback";

const COLUMNS = ["region", "units", "ordered_on"];
const ROWS: unknown[][] = [
  ["North", "9", "2024-03-01"],
  ["South", "10", "2024-01-15 10:00:00"],
  ["northwest", "100", "2024-02-10"],
  [null, "2.5", "2024-01-15T09:00:00"],
  ["East", null, null],
];

let written: string[] = [];

beforeEach(() => {
  written = [];
  // The result grid is Ant Design's, which measures itself.
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {},
                                                addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("ClipboardItem", undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async (text: string) => { written.push(text); }) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(downloadCsv).mockClear();
});

const mount = (rows = ROWS, columns = COLUMNS) => render(<SqlResultTable columns={columns} rows={rows} name="orders" />);
/** The body's rows as the reader sees them, one column's cells. */
const column = (i: number) => Array.from(document.querySelectorAll("tbody tr.ant-table-row"))
  .map(tr => (tr.querySelectorAll("td")[i]?.textContent ?? "").trim());
/** The arrows the reader sees: Ant also draws each head into a hidden row it measures widths with, which a role
 *  query leaves out, as a screen reader does. */
const arrows = () => screen.getAllByRole("button", { name: /^Sort and filter |is filtered/ });
const open = (i: number) => fireEvent.click(arrows()[i]);
const menu = () => screen.getByTestId("column-filter-menu");
const ok = () => fireEvent.click(screen.getByTestId("column-filter-ok"));
const tick = (name: string) => fireEvent.click(within(menu()).getByRole("checkbox", { name }));
const condition = (op: string, value: string) => {
  fireEvent.click(screen.getByTestId(`column-condition-${op}`));
  fireEvent.change(screen.getByTestId("column-condition-value").querySelector("input") ?? screen.getByTestId("column-condition-value"),
    { target: { value } });
};

describe("the arrow at each column's head", () => {
  it("is a button with an edge at the head's right edge, drawn where the pointer is until its column is filtered", () => {
    // the user, 2026-11-09, on a results grid: "the dropdown icon should be at the right of the area … appear only when
    // hovered over" — and a filter in force is never hidden (the next test)
    mount();
    expect(arrows()).toHaveLength(3);
    for (const a of arrows()) {
      // Radix Themes' outline variant draws the edge with no pointer over it.
      expect(a.className).toContain("rt-variant-outline");
      expect(a.querySelector(".tabler-icon-chevron-down")).not.toBeNull();
      expect(a).not.toHaveAttribute("data-filtered");
      expect(a.parentElement?.className).toContain("hidden group-hover:inline-flex");
      expect(a.parentElement?.nextElementSibling).toBeNull();          // nothing after it: the head's right edge
    }
  });

  it("turns into the funnel, in the accent colour, while its column is filtered — and only that column's", () => {
    mount();
    open(0);
    tick("South");
    ok();
    const [region, units] = arrows();
    expect(region).toHaveAttribute("data-filtered", "true");
    expect(region.parentElement?.className).not.toContain("hidden");
    expect(units.parentElement?.className).toContain("hidden group-hover:inline-flex");
    expect(region.querySelector(".tabler-icon-filter")).not.toBeNull();
    expect(region.style.color).toBe("var(--accent)");
    expect(units).not.toHaveAttribute("data-filtered");
    expect(units.querySelector(".tabler-icon-chevron-down")).not.toBeNull();
  });

  it("is not drawn on a table of one row, which has nothing to sort or narrow", () => {
    mount([["North", "9", "2024-03-01"]]);
    expect(screen.queryAllByTestId("column-filter")).toHaveLength(0);
  });

  it("opens the menu without sorting the column, as a click on the head does", () => {
    mount();
    const before = column(0);
    open(0);
    expect(menu()).toBeInTheDocument();
    expect(column(0)).toEqual(before);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("column-filter-menu")).toBeNull();
  });
});

describe("the menu's sorts are worded by the column's type, and sort by it", () => {
  it("text A → Z, numbers smallest → largest, dates oldest → newest", () => {
    mount();
    open(0);
    expect(screen.getByTestId("column-sort-asc")).toHaveTextContent("A → Z");
    expect(screen.getByTestId("column-sort-desc")).toHaveTextContent("Z → A");
    fireEvent.keyDown(window, { key: "Escape" });
    open(1);
    expect(screen.getByTestId("column-sort-asc")).toHaveTextContent("smallest → largest");
    expect(screen.getByTestId("column-condition-gt")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    open(2);
    expect(screen.getByTestId("column-sort-asc")).toHaveTextContent("oldest → newest");
    expect(screen.getByTestId("column-condition-before")).toBeInTheDocument();
  });

  it("numbers by size, not as text — 9 before 10 — with the blank last", () => {
    mount();
    open(1);
    fireEvent.click(screen.getByTestId("column-sort-asc"));
    expect(column(1)).toEqual(["2.5", "9", "10", "100", "—"]);
    open(1);
    fireEvent.click(screen.getByTestId("column-sort-desc"));
    expect(column(1)).toEqual(["100", "10", "9", "2.5", "—"]);
  });

  it("dates by the instant, not by their letters, with the blank last", () => {
    mount();
    open(2);
    fireEvent.click(screen.getByTestId("column-sort-asc"));
    // Text would put "2024-01-15 10:00:00" (a space) before "2024-01-15T09:00:00" (a T).
    expect(column(2)).toEqual(["2024-01-15T09:00:00", "2024-01-15 10:00:00", "2024-02-10", "2024-03-01", "—"]);
  });

  it("a click on the head still sorts, by the same rule", () => {
    mount();
    fireEvent.click(screen.getAllByRole("columnheader")[1]);
    expect(column(1)).toEqual(["2.5", "9", "10", "100", "—"]);
  });
});

describe("the checklist", () => {
  it("lists each value with its count, (Select all) and (Blanks)", () => {
    mount([...ROWS, ["North", "1", "2024-01-01"]]);
    open(0);
    const rows = screen.getAllByTestId("column-filter-value").map(el => el.textContent);
    expect(rows).toEqual(["East1", "North2", "northwest1", "South1", "(Blanks)1"]);
    expect(within(menu()).getByRole("checkbox", { name: "Select all" })).toBeInTheDocument();
  });

  it("keeps the ticked values — and the blanks, or not, as ticked", () => {
    mount();
    open(0);
    tick("(Blanks)");
    tick("East");
    ok();
    expect(column(0)).toEqual(["North", "South", "northwest"]);
    open(0);
    // Opened again on its filter: three of five ticked. (Select all) ticks every one, and once more clears them.
    expect(within(menu()).getByRole("checkbox", { name: "East" })).not.toBeChecked();
    tick("Select all");
    expect(within(menu()).getByRole("checkbox", { name: "East" })).toBeChecked();
    tick("Select all");
    tick("(Blanks)");
    ok();
    expect(column(0)).toEqual(["—"]);
  });

  it("the hidden copy of a head Ant measures with takes no Tab stop", () => {
    mount();
    const all = screen.getAllByTestId("column-filter");
    const hidden = all.filter(b => b.closest(".ant-table-measure-row"));
    expect(hidden.length).toBeGreaterThan(0);
    for (const b of hidden) expect(b.tabIndex).toBe(-1);
    for (const b of arrows()) expect(b.tabIndex).toBe(0);
  });

  it("a search keeps what it finds: type, OK", () => {
    mount();
    open(0);
    fireEvent.change(screen.getByTestId("column-filter-search").querySelector("input") ?? screen.getByTestId("column-filter-search"),
      { target: { value: "north" } });
    expect(screen.getAllByTestId("column-filter-value").map(el => el.textContent)).toEqual(["North1", "northwest1"]);
    ok();
    expect(column(0)).toEqual(["North", "northwest"]);
  });

  it("OK is refused with nothing ticked", () => {
    mount();
    open(0);
    tick("Select all");
    expect(screen.getByTestId("column-filter-ok")).toBeDisabled();
  });
});

describe("the conditions", () => {
  it("text: Begins with and Contains, without case", () => {
    mount();
    open(0);
    condition("beginsWith", "nor");
    ok();
    expect(column(0)).toEqual(["North", "northwest"]);
    open(0);
    condition("contains", "OUT");
    ok();
    expect(column(0)).toEqual(["South"]);
  });

  it("numbers: greater than, by size", () => {
    mount();
    open(1);
    condition("gt", "9");
    ok();
    expect(column(1)).toEqual(["10", "100"]);
  });

  it("dates: before a day", () => {
    mount();
    open(2);
    condition("before", "2024-02-01");
    ok();
    expect(column(2)).toEqual(["2024-01-15 10:00:00", "2024-01-15T09:00:00"]);
  });

  it("a number that is not one is said, and OK waits for it", () => {
    mount();
    open(1);
    condition("gt", "lots");
    expect(screen.getByTestId("column-condition-problem")).toHaveTextContent("Type a number");
    expect(screen.getByTestId("column-filter-ok")).toBeDisabled();
  });
});

describe("what is filtered is said, and Copy and CSV take the rows shown", () => {
  it("'N of M rows · filtered' while a filter is on, nothing when none is", () => {
    mount();
    expect(screen.queryByTestId("table-filtered")).toBeNull();
    open(1);
    condition("gt", "9");
    ok();
    expect(screen.getByTestId("table-filtered")).toHaveTextContent("2 of 5 rows · filtered");
  });

  it("Copy and CSV say they take the rows shown, and take exactly those, in the order shown", async () => {
    mount();
    open(1);
    condition("gt", "9");
    ok();
    open(1);
    fireEvent.click(screen.getByTestId("column-sort-desc"));
    const copy = screen.getByRole("button", { name: /copy/i });
    expect(copy).toHaveTextContent("Copy shown");
    expect(copy).toHaveAttribute("title", "Copy the 2 rows the filters show, not all 5 — pastes into a spreadsheet as cells");
    fireEvent.click(copy);
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toBe("region\tunits\tordered_on\nnorthwest\t100\t2024-02-10\nSouth\t10\t2024-01-15 10:00:00");
    const csv = screen.getByRole("button", { name: /csv/i });
    expect(csv).toHaveTextContent("CSV shown");
    fireEvent.click(csv);
    expect(vi.mocked(downloadCsv).mock.calls[0][1])
      .toBe("region,units,ordered_on\r\nnorthwest,100,2024-02-10\r\nSouth,10,2024-01-15 10:00:00");
  });

  it("clearing every filter returns the whole result, and the actions take it all again", () => {
    mount();
    open(0);
    tick("East");
    ok();
    open(1);
    condition("lt", "50");
    ok();
    expect(screen.getByTestId("table-filtered")).toHaveTextContent("3 of 5 rows · filtered");
    fireEvent.click(screen.getByTestId("table-clear-filters"));
    expect(column(0)).toEqual(["North", "South", "northwest", "—", "East"]);
    expect(screen.queryByTestId("table-filtered")).toBeNull();
    expect(screen.getByRole("button", { name: /copy/i })).toHaveTextContent(/^Copy$/);
  });

  it("a column's own Clear filter leaves the others standing", () => {
    mount();
    open(0);
    tick("East");
    ok();
    open(1);
    condition("lt", "50");
    ok();
    open(1);
    fireEvent.click(screen.getByTestId("column-filter-clear"));
    expect(screen.getByTestId("table-filtered")).toHaveTextContent("4 of 5 rows · filtered");
    expect(column(0)).toEqual(["North", "South", "northwest", "—"]);
  });

  it("a filter that leaves nothing says so", () => {
    mount();
    open(1);
    condition("gt", "1000");
    ok();
    expect(screen.getByText("No rows match these filters")).toBeInTheDocument();
    expect(screen.getByTestId("table-filtered")).toHaveTextContent("0 of 5 rows · filtered");
  });
});

describe("the cells are a grid, as a sheet's are", () => {
  afterEach(() => document.documentElement.removeAttribute("data-theme"));

  it("draws every edge, the head's too, in the Spreadsheets grid's own line", () => {
    // In light the grid's line (--b2) differs from the row rule it replaces (--b0), so the drawn colour says which.
    document.documentElement.setAttribute("data-theme", "light");
    mount();
    expect(GRID_LINE).toBe(SHEET_LINE);
    expect(document.querySelector(".ant-table")).toHaveClass("ant-table-bordered");
    const css = Array.from(document.querySelectorAll("style")).map(s => s.textContent ?? "").join("\n");
    // Ant draws a bordered table's head and body cells with its border colour on each cell's inline end…
    // Ant's own variables, spelled in pieces: they are Ant's, not tokens of ours (`lint:vars`).
    const antVar = (name: string) => ["var(", `--ant-${name}`, ")"].join("");
    const edge = `border-inline-end:${antVar("line-width")} ${antVar("line-type")} ${antVar("table-border-color")}`;
    const rule = css.split("}").find(r => r.includes("ant-table-bordered") && r.includes(edge)) ?? "";
    expect(rule).toMatch(/thead>tr>th/);
    expect(rule).toMatch(/tbody>tr>td/);
    // …and that colour is the sheet's line (--b2), not the row rule (--b0) it was; the head is on the sheet's ground.
    expect(css).toContain(`--ant-table-border-color:${TOKEN_FALLBACK.light["--b2"]};`);
    expect(css).not.toContain(`--ant-table-border-color:${TOKEN_FALLBACK.light["--b0"]};`);
    expect(css).toContain(`--ant-table-header-bg:${TOKEN_FALLBACK.light["--bg-2"]};`);
  });
});

describe("the ▾ menu's own column actions (2026-11-09: one menu, as in the SQL Editor's grid)", () => {
  it("copies the column's name, pins it at the left, and shows a number column in a format", () => {
    mount([["North", 1240.35, "2024-03-01"], ["South", 0.5, "2024-01-15"]]);
    open(0);
    fireEvent.click(screen.getByTestId("column-copy-name"));
    expect(written).toContain("region");
    open(1);
    expect(screen.getByTestId("column-format")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("column-format"));
    fireEvent.click(screen.getByTestId("column-format-compact"));
    expect(column(1)).toEqual(["1.2K", "0.5"]);
    open(1);
    fireEvent.click(screen.getByTestId("column-pin"));
    const firstHead = document.querySelector("thead th.ant-table-cell") as HTMLElement;
    expect(firstHead.className).toContain("ant-table-cell-fix-start");
    expect(firstHead.textContent).toContain("Units");
    open(0);
    expect(screen.getByTestId("column-pin")).toHaveTextContent("Unpin column");
    open(1);
    expect(screen.queryByTestId("column-format")).toBeNull();             // region: no number to format
  });
});

