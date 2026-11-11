// @vitest-environment jsdom
/**
 * A column filtered from its arrow, on a sheet opened: applying replaces only that column's conditions in the view's
 * filter — another column's stays, where it stood — and the toolbar's Filter count and the filter's words say the result.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Condition } from "@/lib/sheets";

const column = (id: string, name: string, kind: string) => ({
  id, name, kind, role: "stored", integer: false, description: "", source: name, currency: "", choices: [], hidden: false,
  expression: "", link: null, via: "", of: "", sheet: "", key: "", by: "", how: "", made_by: "",
});
const FILTER: Condition[] = [{ column: "c2", op: "gt", value: "50" }, { column: "c1", op: "in", value: ["delivered"] }];
const SHEET = {
  id: "s1", name: "Olist orders", table: "olist_orders", rows: 102, columns: [column("c0", "order_id", "text"),
    column("c1", "order_status", "choice"), column("c2", "Paid", "number")],
  came_from: "made from orders.csv", source: { kind: "file", file: "orders.csv", tab: "", rows: 102, sql: "", connection_id: "",
    schema_name: "", upload: {}, imported_at: "" },
  last_change: { id: "x", what: "made", by: "user:ana", at: "2026-11-09T00:00:00Z", origin: "" }, created_by: "user:ana",
  created_at: "2026-11-09T00:00:00Z", version: 1, shared_with: "workspace", access: "own", key: "", rules: [],
  views: [{ id: "v1", name: "Dear and delivered", filter: FILTER, sort: [], hidden: [], search: "", made_by: "", kind: "grid",
    group: "", date: "", card: [], shared: true, owner: "user:ana" }],
  view_rows: { v1: 40 }, rule_rows: {}, me: "user:ana",
};

vi.mock("@/lib/sheets", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/sheets")>()),
  readSheet: async () => SHEET,
  readChanges: async () => ({ changes: [], can_undo: "", can_redo: "" }),
  readRows: async () => ({ rows: [], total: 40, offset: 0, totals: {}, groups: [], changed: {}, columns: ["c0", "c1", "c2"],
    source_rows: 102 }),
  readColumnValues: async () => ({ column: "c1", values: [{ value: "canceled", count: 1 }, { value: "delivered", count: 36 },
    { value: "shipped", count: 3 }], blanks: 0, rows: 40, distinct: 3, more: 0 }),
}));

import { SheetView } from "./SheetView";

describe("a column filtered from its arrow", () => {
  it("replaces that column's conditions and keeps the other column's, where it stood", async () => {
    render(<SheetView sheetId="s1" onBack={() => {}} onOpen={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "The order_status column's menu — filtered" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "shipped" }));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByText("Filter: Paid > 50 · order_status is one of delivered, shipped")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filter · 2/ })).toBeInTheDocument();
    expect(screen.getByText("changed here, not kept")).toBeInTheDocument();

    // cleared from its menu: the other column's condition is all that is left
    fireEvent.click(screen.getByRole("button", { name: "The order_status column's menu — filtered" }));
    fireEvent.click(screen.getByRole("button", { name: /Clear filter from “order_status”/ }));
    expect(screen.getByText("Filter: Paid > 50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The order_status column's menu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "The Paid column's menu — filtered" })).toBeInTheDocument();
  });
});
