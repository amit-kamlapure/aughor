// @vitest-environment jsdom
/**
 * A column's filter, as a spreadsheet's arrow offers it (the user, 2026-11-09): the arrow is drawn where the pointer or
 * the keyboard is (the same day, reversing "drawn at rest"), and always on a filtered column, whose arrow
 * is the funnel, and while its menu is open; its menu sorts in the kind's words, clears the column's filter, takes a
 * condition of its kind, and lists the column's values — read from the server under the view's other filters — to tick.
 * What is applied is handed up as the column's own conditions; the view replaces only those.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColumnValues, Condition, Sheet } from "@/lib/sheets";

const reads: { column: string; filter?: Condition[]; search?: string; q?: string }[] = [];
let answer: (column: string, q: string) => Promise<ColumnValues>;
vi.mock("@/lib/sheets", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/sheets")>()),
  readColumnValues: async (_id: string, column: string, q: { filter?: Condition[]; search?: string; q?: string }) => {
    reads.push({ column, ...q });
    return answer(column, q.q ?? "");
  },
}));

import { GridHeader, layoutColumns } from "./SheetGrid";

const COLS = [["order_id", "text"], ["order_status", "choice"], ["Paid", "money"]].map(([name, kind], i) => ({
  id: `c${i}`, name, kind, role: "stored", integer: false, description: "", source: name, currency: "", choices: [],
  hidden: false, expression: "", link: null, via: "", of: "", sheet: "", key: "", by: "", how: "", made_by: "",
}));
const SHEET = { id: "s1", name: "Olist orders", columns: COLS, rules: [], views: [] } as unknown as Sheet;
const STATUSES = [{ value: "canceled", count: 1 }, { value: "delivered", count: 96 }, { value: "shipped", count: 3 }];
const statuses = (q: string): ColumnValues => {
  const values = STATUSES.filter(v => v.value.includes(q));
  return { column: "c1", values, blanks: 2, rows: 102, distinct: values.length, more: 0 };
};

beforeEach(() => {
  reads.length = 0;
  answer = async (_c, q) => statuses(q);
});

const header = (filter: Condition[] = [], search = "") => {
  const onFilter = vi.fn();
  const onKey = vi.fn();
  render(
    // a parent that would take a key as the grid does: nothing pressed in the menu may reach it
    <div onKeyDown={onKey}>
      <GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())} onAction={() => {}} onFilter={onFilter}
        filter={filter} search={search} />
    </div>);
  return { onFilter, onKey };
};
const open = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^The ${name} column's menu`) }));
  return screen.getByRole("dialog", { name: `The ${name} column` });
};
const box = (name: string) => screen.getByRole("checkbox", { name });
const ok = () => fireEvent.click(screen.getByRole("button", { name: "OK" }));

describe("a column's arrow", () => {
  it("is drawn on hover or keyboard focus within its header, with its edge, never at rest", () => {
    header([{ column: "c1", op: "in", value: ["delivered"] }]);
    const plain = screen.getByRole("button", { name: "The order_id column's menu" });
    expect(plain.className).toContain("rt-variant-outline");
    // jsdom draws no hover: what is asserted is the rule that draws it — hidden, shown by its header's hover or focus
    expect(plain.className.split(" ")).toEqual(expect.arrayContaining(
      ["opacity-0", "group-hover:opacity-100", "group-focus-within:opacity-100"]));
    expect(plain.closest('[role="columnheader"]')?.className).toContain("group");
    expect(plain.querySelector("svg")?.getAttribute("class")).toContain("tabler-icon-chevron-down");
    // and at the header's right edge: the last thing in it (a width's handle, where there is one, is drawn over it)
    const head = plain.closest('[role="columnheader"]')!;
    expect([...head.children].slice([...head.children].indexOf(plain) + 1)
      .filter(el => el.getAttribute("role") !== "separator")).toEqual([]);
  });

  it("stays drawn on a filtered column — the funnel in the accent, saying what it is filtered by — and while its menu is open", () => {
    header([{ column: "c1", op: "in", value: ["delivered"] }]);
    const filtered = screen.getByRole("button", { name: "The order_status column's menu — filtered" });
    expect(filtered.className).toMatch(/rt-variant-(surface|outline)/);
    expect(filtered.className).not.toMatch(/opacity-0/);
    expect(filtered.querySelector("svg")?.getAttribute("class")).toContain("tabler-icon-filter");
    expect(filtered.style.color).toBe("var(--accent-text)");
    expect(filtered.title).toBe("Filtered: order_status is one of delivered — sort, filter or clear it");
    const plain = screen.getByRole("button", { name: "The order_id column's menu" });
    fireEvent.click(plain);
    expect(plain).toHaveAttribute("aria-expanded", "true");
    expect(plain.className).not.toMatch(/opacity-0/);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(plain.className).toMatch(/opacity-0/);
  });

  it("keeps the sort beside it at the right edge, faint on hover and always while the column is sorted", () => {
    render(<GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())} onAction={() => {}}
      onSort={() => {}} sort={[{ column: "c2", desc: true }]} />);
    const sortIcon = (name: string) => screen.getByRole("columnheader", { name: new RegExp(`^${name} ·`) })
      .querySelector(".tabler-icon-sort-down-narrow-wide, .tabler-icon-sort-down-wide-narrow")!.parentElement!;
    expect(sortIcon("order_id").className).toContain("group-hover:opacity-60");
    expect(sortIcon("order_id").className).toContain("opacity-0");
    expect(sortIcon("Paid").className).toBe("");                              // sorted by: drawn
    // the last thing in the sort's button, so beside the arrow that follows the button
    const button = sortIcon("order_id").parentElement!;
    expect(button.lastElementChild).toBe(sortIcon("order_id"));
    expect(button.nextElementSibling?.getAttribute("data-menu-for")).toBe("c0");
  });
});

describe("a column's menu", () => {
  it("sorts in the kind's words, and lists the values to tick — real checkboxes, each with its rows", async () => {
    const other = { column: "c2", op: "gt", value: "50" };
    header([{ column: "c1", op: "in", value: ["delivered"] }, other], "sao");
    const menu = await open("order_status");
    expect(screen.getByRole("button", { name: "Sort A → Z" })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "shipped" })).toHaveAttribute("aria-checked", "false");
    expect(box("delivered")).toHaveAttribute("aria-checked", "true");
    expect(box("(Blanks)")).toHaveAttribute("aria-checked", "false");
    expect(box("(Select all)")).toHaveAttribute("aria-checked", "mixed");
    expect(menu.textContent).toContain("96");
    // read with the view's filter and search as they stand: the server leaves out the column's own
    expect(reads[0]).toEqual({ column: "c1", filter: [{ column: "c1", op: "in", value: ["delivered"] }, other],
      search: "sao", q: "" });
  });

  it("applies what is ticked as the column's conditions: none of the unticked, one of the ticked, the blanks alone", async () => {
    const { onFilter } = header();
    await open("order_status");
    fireEvent.click(await screen.findByRole("checkbox", { name: "shipped" }));
    ok();
    expect(onFilter).toHaveBeenLastCalledWith("c1", [{ column: "c1", op: "not_in", value: ["shipped"] }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open("order_status");
    fireEvent.click(await screen.findByRole("checkbox", { name: "(Select all)" }));
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();           // nothing ticked: nothing to show
    fireEvent.click(box("delivered"));
    ok();
    expect(onFilter).toHaveBeenLastCalledWith("c1", [{ column: "c1", op: "in", value: ["delivered"] }]);

    await open("order_status");
    fireEvent.click(await screen.findByRole("checkbox", { name: "(Select all)" }));
    fireEvent.click(box("(Blanks)"));
    ok();
    expect(onFilter).toHaveBeenLastCalledWith("c1", [{ column: "c1", op: "empty" }]);
  });

  it("clears the column's filter, offered only when it has one", async () => {
    const { onFilter } = header([{ column: "c1", op: "in", value: ["delivered"] }]);
    await open("order_id");
    expect(screen.getByRole("button", { name: /Clear filter from “order_id”/ })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await open("order_status");
    fireEvent.click(screen.getByRole("button", { name: /Clear filter from “order_status”/ }));
    expect(onFilter).toHaveBeenCalledWith("c1", []);
  });

  it("takes a condition of the kind in place: Begins with and its value, applied", async () => {
    const { onFilter } = header();
    await open("order_id");
    fireEvent.click(screen.getByRole("button", { name: "Text filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Begins with" }));
    const value = screen.getByRole("textbox", { name: "Begins with — the value" });
    fireEvent.change(value, { target: { value: "e48" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onFilter).toHaveBeenCalledWith("c0", [{ column: "c0", op: "starts_with", value: "e48" }]);
    // a money column's conditions are a number's
    await open("Paid");
    fireEvent.click(screen.getByRole("button", { name: "Number filters" }));
    expect(screen.getByRole("button", { name: "Greater than or equal to" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Is empty" }));          // needs no value: applied at once
    expect(onFilter).toHaveBeenLastCalledWith("c2", [{ column: "c2", op: "empty" }]);
  });

  it("opens a column filtered by a condition with it picked, and says it", async () => {
    header([{ column: "c0", op: "starts_with", value: "e48" }]);
    const menu = await open("order_id");
    expect(screen.getByRole("button", { name: /Text filters/ })).toHaveAttribute("aria-expanded", "true");
    expect(menu.textContent).toContain("begins with e48");
    expect(screen.getByRole("textbox", { name: "Begins with — the value" })).toHaveValue("e48");
  });

  it("says how many values it did not list; a search reads the rest, and OK shows what it found", async () => {
    answer = async (_c, q) => ({ ...statuses(q), more: q ? 0 : 1204 });
    const { onFilter } = header([{ column: "c1", op: "in", value: ["delivered"] }]);
    const menu = await open("order_status");
    await screen.findByRole("checkbox", { name: "shipped" });
    expect(menu.textContent).toContain("1,204 more — search to narrow");
    const search = screen.getByRole("textbox", { name: "Search the values of order_status" });
    fireEvent.change(search, { target: { value: "ship" } });
    // pressed before the search has read: nothing is applied from the list that was on screen
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onFilter).not.toHaveBeenCalled();
    await waitFor(() => expect(reads.at(-1)?.q).toBe("ship"));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "delivered" })).toBeNull());
    // what a search found starts ticked, as a spreadsheet's does, whatever the column was filtered to
    expect(box("shipped")).toHaveAttribute("aria-checked", "true");
    expect(box("(Select all search results)")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("checkbox", { name: "(Blanks)" })).toBeNull();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onFilter).toHaveBeenCalledWith("c1", [{ column: "c1", op: "in", value: ["shipped"] }]);
  });

  it("where no cell is empty, ticking every value back takes the column's filter off", async () => {
    answer = async (_c, q) => ({ ...statuses(q), blanks: 0 });
    const { onFilter } = header([{ column: "c1", op: "in", value: ["delivered"] }]);
    await open("order_status");
    fireEvent.click(await screen.findByRole("checkbox", { name: "canceled" }));
    fireEvent.click(box("shipped"));
    expect(box("(Select all)")).toHaveAttribute("aria-checked", "true");
    ok();
    expect(onFilter).toHaveBeenCalledWith("c1", []);
  });

  it("says why when the values cannot be listed", async () => {
    answer = async () => { throw new Error("order_status is written by a model, and nothing is counted from what a model wrote"); };
    header();
    await open("order_status");
    expect(await screen.findByRole("alert")).toHaveTextContent("nothing is counted from what a model wrote");
  });

  it("works from the keyboard, and nothing pressed in it reaches the grid under it", async () => {
    const { onKey } = header();
    await open("order_status");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sort A → Z" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sort Z → A" }));
    const search = screen.getByRole("textbox", { name: "Search the values of order_status" });
    fireEvent.keyDown(search, { key: "s" });
    fireEvent.keyDown(search, { key: "Delete" });
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "The order_status column's menu" })));
  });
});
