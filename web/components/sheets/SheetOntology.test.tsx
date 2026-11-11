// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readOnOntology = vi.fn();
const placeOnOntology = vi.fn();
vi.mock("@/lib/sheets", () => ({
  readOnOntology: (...a: unknown[]) => readOnOntology(...a),
  placeOnOntology: (...a: unknown[]) => placeOnOntology(...a),
}));
vi.mock("@/lib/navigate", () => ({ requestTab: vi.fn() }));

import { SheetOntologyButton, ontologyWords } from "./SheetOntology";

const COLUMNS = [
  { id: "c1", name: "order_id", kind: "text", role: "stored", hidden: false, rows: 3, filled: 3, distinct: 3, key: true, why: "" },
  { id: "c2", name: "order_status", kind: "text", role: "stored", hidden: false, rows: 3, filled: 3, distinct: 2, key: false,
    why: "order_status repeats a value: 2 distinct over 3 filled rows, so it is not one per object" },
  { id: "c3", name: "total", kind: "number", role: "computed", hidden: false, key: false,
    why: "total is computed, read from other values, so an edit of it could not be held to one per object" },
];

beforeEach(() => {
  readOnOntology.mockReset();
  placeOnOntology.mockReset();
});

describe("a sheet on the ontology", () => {
  it("says what the sheet is on the ontology as, a draft until published", () => {
    expect(ontologyWords([])).toBe("Put on the ontology");
    const p = { entity: "Order", display_name: "Order", key: "c1", key_property: "order_id", published: false };
    expect(ontologyWords([p])).toBe("On the ontology · Order (draft)");
    expect(ontologyWords([{ ...p, published: true }])).toBe("On the ontology · Order");
  });

  it("offers only a column that is one per object as the key, says why not of the rest, and places on request", async () => {
    readOnOntology.mockResolvedValue({ placed: [], columns: COLUMNS, scope: "default" });
    placeOnOntology.mockResolvedValue({ placed: [] });
    render(<SheetOntologyButton sheetId="s1" sheetName="Olist orders" editable />);
    fireEvent.click(await screen.findByRole("button", { name: /Put on the ontology/ }));
    const notKeys = screen.getByLabelText("Columns that cannot be the key");
    expect(notKeys).toHaveTextContent("order_status2 distinct of 3 filled");
    expect(notKeys).toHaveTextContent("totalcomputed, read from other columns");
    expect(within(notKeys).getByText("order_status").closest("[title]")).toHaveAttribute("title",
      expect.stringMatching(/repeats a value/));
    const place = screen.getByRole("button", { name: "Place on the ontology" });
    expect(place).toBeDisabled();                                   // a name first
    fireEvent.change(screen.getByLabelText("Entity name"), { target: { value: "Order" } });
    fireEvent.click(screen.getByRole("button", { name: "Place on the ontology" }));
    await waitFor(() => expect(placeOnOntology).toHaveBeenCalledTimes(1));
    expect(placeOnOntology).toHaveBeenCalledWith("s1", expect.objectContaining({ display_name: "Order", key: "c1",
      columns: ["c1", "c2", "c3"] }));
    expect(readOnOntology).toHaveBeenCalledTimes(2);                 // read again, so the bar says what it is now
  });

  it("says a sheet with no column one per object cannot be an entity yet, and why each is not", async () => {
    readOnOntology.mockResolvedValue({ placed: [], columns: COLUMNS.slice(1), scope: "default" });
    render(<SheetOntologyButton sheetId="s1" sheetName="Olist orders" editable />);
    fireEvent.click(await screen.findByRole("button", { name: /Put on the ontology/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("No column of this sheet is one per object");
    expect(screen.queryByRole("button", { name: "Place on the ontology" })).toBeNull();
  });

  it("offers a reader nothing to place, and tells them what a placed sheet is", async () => {
    readOnOntology.mockResolvedValue({ placed: [], columns: COLUMNS, scope: "default" });
    const { container } = render(<SheetOntologyButton sheetId="s1" sheetName="Olist orders" editable={false} />);
    await waitFor(() => expect(readOnOntology).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    readOnOntology.mockResolvedValue({ scope: "default", columns: COLUMNS,
      placed: [{ entity: "Order", display_name: "Order", key: "c1", key_property: "order_id", published: true }] });
    render(<SheetOntologyButton sheetId="s2" sheetName="Olist orders" editable={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /On the ontology · Order/ }));
    expect(screen.getByText(/two rows the same order_id is refused/)).toBeInTheDocument();
    expect(screen.getByText(/Removing the sheet leaves the entity on the ontology/)).toBeInTheDocument();
  });
});
