// @vitest-environment jsdom
/**
 * A column's header, as a spreadsheet's is (the user, 2026-10-27, the next tier after the first-minute basics): a
 * click sorts, Shift+click sorts after the sorts there are, its ▾ or a right-click opens its menu — sort, filter, hide,
 * freeze, fit — and the menu closes when anything else is pressed. Only what a person picks is done.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GridHeader, layoutColumns } from "./SheetGrid";
import type { Sheet } from "@/lib/sheets";

const COLS = ["order_id", "order_status", "Paid"].map((name, i) => ({
  id: `c${i}`, name, kind: i === 2 ? "money" : "text", role: "stored", integer: false, description: "", source: name,
  currency: "", choices: [], hidden: false, expression: "", link: null, via: "", of: "", sheet: "", key: "", by: "",
  how: "", made_by: "",
}));
const SHEET = { id: "s1", name: "Olist orders", columns: COLS, rules: [], views: [] } as unknown as Sheet;

const header = (over: Partial<Parameters<typeof GridHeader>[0]> = {}) => {
  const onSort = vi.fn();
  const onAction = vi.fn();
  render(<GridHeader sheet={SHEET} shown={layoutColumns(SHEET.columns, new Set())} sort={[{ column: "c1", desc: false }]}
    onSort={onSort} onAction={onAction} onFit={() => {}} {...over} />);
  return { onSort, onAction };
};

describe("a column's header", () => {
  it("draws its kind's icon before its name, at the reading size the SQL editor's results use", () => {
    header();
    const head = screen.getByRole("columnheader", { name: "order_id · Text" });
    expect(head.closest("[role=row]")).toHaveClass("aug-fs-ui");
    const icon = head.querySelector("svg") as SVGElement;
    expect(icon.getAttribute("width")).toBe("14");
    expect(icon.compareDocumentPosition(screen.getByText("order_id")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sorts on a click, and after the others on a Shift+click", () => {
    const { onSort } = header();
    fireEvent.click(screen.getByText("Paid"));
    fireEvent.click(screen.getByText("Paid"), { shiftKey: true });
    expect(onSort.mock.calls).toEqual([["c2", false], ["c2", true]]);
  });

  it("opens its menu from its arrow or a right-click, and does only what is picked", () => {
    const { onAction, onSort } = header();
    fireEvent.click(screen.getByLabelText("The Paid column's menu"));
    const menu = screen.getByRole("dialog", { name: "The Paid column" });
    const labels = [...menu.querySelectorAll("button")].map(b => b.textContent);
    // a money column sorts smallest to largest, in its kind's words
    // and no Format: that is a Number column's, and a money column is shown in its currency
    expect(labels).toEqual(["Sort smallest → largest", "Sort largest → smallest", "Then by this, smallest → largest",
      "Then by this, largest → smallest", "Copy column name", "Hide this column", "Freeze up to this column",
      "Fit the width to what it holds"]);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Then by this, largest → smallest"));
    expect(onAction).toHaveBeenCalledWith("then-desc", "c2");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();          // gone once something is picked
    fireEvent.contextMenu(screen.getByRole("columnheader", { name: "order_id · Text" }));
    expect(screen.getByRole("dialog", { name: "The order_id column" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSort).not.toHaveBeenCalled();
  });

  it("offers to unfreeze once columns are frozen, and to put back a width given", () => {
    header({ shown: layoutColumns(SHEET.columns, new Set(), { c0: 300 }, 1), sort: [] });
    fireEvent.click(screen.getByLabelText("The order_id column's menu"));
    const labels = [...screen.getByRole("dialog").querySelectorAll("button")].map(b => b.textContent);
    expect(labels).toContain("Unfreeze the columns");
    expect(labels).toContain("Back to its own width");
    expect(labels).toContain("Sort A → Z");
    expect(labels).not.toContain("Then by this, A → Z");          // nothing else sorts the view
  });
});
