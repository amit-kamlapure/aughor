// @vitest-environment jsdom
/**
 * A table's card, on hovering its `»` in the SQL editor's catalog (the user, 2026-11-09, with a reference console's card):
 * where the table lives, a copy of its name, its rows, columns and joins — a fact the rail does not hold left out, never
 * guessed — what the `»` will put in the editor, and Preview data. The hover itself is the tree's, tested with it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@/lib/testing";

import { CatalogTree, type CatalogTable } from "./CatalogTree";
import { TableCard, tableFacts } from "./TableCard";

const cols = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}` }));
const ORDERS: CatalogTable = { name: "lux.orders", schema: "lux", connectionLabel: "PostgreSQL", columns: cols(12),
  rowCount: "146,384", joinDegree: 5 };

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: vi.fn(async (t: string) => { written.push(t); }) },
  });
});

describe("a table's card", () => {
  it("says where the table lives and what it holds", () => {
    const onPreview = vi.fn();
    render(<TableCard table={ORDERS} onPreview={onPreview} />);
    const card = screen.getByTestId("table-card");
    expect(card).toHaveTextContent("orders");
    expect(card).toHaveTextContent("lux · PostgreSQL");
    expect(card.querySelector("dl")).toHaveTextContent("Rows146,384Columns12Joins5 related tables");
    expect(card).toHaveTextContent("» puts SELECT * FROM lux.orders LIMIT 100 in an empty editor, and the name at the cursor otherwise.");
    fireEvent.click(screen.getByRole("button", { name: /Preview data/ }));
    expect(onPreview).toHaveBeenCalledWith(ORDERS);
  });

  it("says a count or a column list it does not have, and leaves out joins it knows nothing of", () => {
    expect(tableFacts({ name: "t", columns: [], rowCount: null, isolated: true })).toEqual([
      ["Rows", "not counted"], ["Columns", "not read yet"], ["Joins", "none detected"]]);
    expect(tableFacts({ name: "t", columns: cols(2), rowCount: 9 })).toEqual([["Rows", "9"], ["Columns", "2"]]);
  });

  it("copies the table's schema-qualified name, and offers no preview where nothing would run it", async () => {
    render(<TableCard table={ORDERS} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy lux.orders" }));
    await waitFor(() => expect(written).toEqual(["lux.orders"]));
    expect(screen.queryByRole("button", { name: /Preview data/ })).toBeNull();
  });
});

describe("the » on a table's row", () => {
  it("is an icon a hand can hit, opens the card on hovering it, and either action closes the card", async () => {
    const onInsertTable = vi.fn();
    const onPreviewTable = vi.fn();
    render(<CatalogTree tables={[ORDERS]} catalogName="PostgreSQL" onInsertTable={onInsertTable} onPreviewTable={onPreviewTable} />);
    const arrow = screen.getByRole("button", { name: "Insert lux.orders" });
    expect(arrow.querySelector("svg")).not.toBeNull();
    expect(arrow.style.width).toBe("24px");
    fireEvent.pointerEnter(arrow, { pointerType: "mouse" });
    expect(await screen.findByTestId("table-card")).toHaveTextContent("lux · PostgreSQL");
    // either action closes the card: a pop-up does not outlive the next action
    fireEvent.click(arrow);
    expect(onInsertTable).toHaveBeenCalledWith(ORDERS);
    await waitFor(() => expect(screen.queryByTestId("table-card")).toBeNull());
    fireEvent.pointerEnter(arrow, { pointerType: "mouse" });
    const card = await screen.findByTestId("table-card");
    fireEvent.click(within(card).getByRole("button", { name: /Preview data/ }));
    expect(onPreviewTable).toHaveBeenCalledWith(ORDERS);
    await waitFor(() => expect(screen.queryByTestId("table-card")).toBeNull());
  });
});
