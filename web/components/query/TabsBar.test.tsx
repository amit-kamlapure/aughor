// @vitest-environment jsdom
/**
 * The SQL editor's tabs are tabs (the user, 2026-11-09: "the tabs dont look like tabs to me", choosing folder tabs):
 * a tablist; the open query's tab is the editor's own surface with a line at its foot; one target per tab — its name
 * selects, a double-click renames, its × closes without selecting; the arrows move between tabs.
 */
import { fireEvent, render, screen } from "@/lib/testing";
import { describe, expect, it, vi } from "vitest";

import { TabsBar, type EditorTab } from "./TabsBar";

const tab = (id: string, name: string, extra: Partial<EditorTab> = {}): EditorTab =>
  ({ id, name, sql: "", touched: 1, ...extra });
const TABS = [tab("a", "month_cat_item_return", { status: "ok" }), tab("b", "Query"), tab("c", "New Query")];

function setup(activeId = "a") {
  const on = { onSelect: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), onRename: vi.fn() };
  render(<TabsBar tabs={TABS} activeId={activeId} {...on} trailing={<span>Saved</span>} />);
  return on;
}

describe("SQL editor tabs", () => {
  it("are a tablist whose open tab is the editor's surface with a line at its foot", () => {
    setup("a");
    expect(screen.getByRole("tablist", { name: "Open queries" })).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map(t => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs[0].style.background).toBe("var(--bg-0)");
    expect(tabs[0].style.boxShadow).toContain("var(--t1)");
    expect(tabs[1].style.background).toBe("");               // the others sit on the strip
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
    expect(screen.getByText("Saved")).toBeInTheDocument();   // what rides on the right stays
  });

  it("select by name, close by × without selecting, rename by double-click", () => {
    const on = setup("a");
    fireEvent.click(screen.getByRole("tab", { name: "Query" }));
    expect(on.onSelect).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getByRole("button", { name: "Close New Query" }));
    expect(on.onClose).toHaveBeenCalledWith("c");
    expect(on.onSelect).toHaveBeenCalledTimes(1);
    fireEvent.doubleClick(screen.getByRole("tab", { name: "Query" }));
    const box = screen.getByDisplayValue("Query");
    fireEvent.change(box, { target: { value: "Returns by month" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(on.onRename).toHaveBeenCalledWith("b", "Returns by month");
  });

  // Was: a lone tab had no × (the editor always held one). Since the start page (2026-11-09) the last tab closes too.
  it("the last tab closes too, and with none open the strip's open tab is the start page's — no ×, no rename", () => {
    const on = { onSelect: vi.fn(), onNew: vi.fn(), onClose: vi.fn(), onRename: vi.fn() };
    const { rerender } = render(<TabsBar tabs={[tab("a", "Query")]} activeId="a" {...on} startLabel="New tab" />);
    expect(screen.queryByTestId("sql-start-tab")).toBeNull();               // a query tab is open: no start tab
    fireEvent.click(screen.getByRole("button", { name: "Close Query" }));
    expect(on.onClose).toHaveBeenCalledWith("a");
    rerender(<TabsBar tabs={[]} activeId="" {...on} startLabel="New tab" />);
    const start = screen.getByRole("tab", { name: "New tab" });
    expect(start).toHaveAttribute("aria-selected", "true");
    expect(start.style.background).toBe("var(--bg-0)");                     // it joins the start page beneath it
    expect(screen.queryByRole("button", { name: /^Close/ })).toBeNull();
    fireEvent.doubleClick(start);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByTitle("New tab"));                          // the + beside it stays
    expect(on.onNew).toHaveBeenCalledTimes(1);
  });

  it("move by the arrow keys and open with Enter", () => {
    const on = setup("a");
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);             // wraps
    fireEvent.keyDown(tabs[2], { key: "Enter" });
    expect(on.onSelect).toHaveBeenCalledWith("c");
  });
});
