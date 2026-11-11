// @vitest-environment jsdom
/**
 * The SQL editor's start page (the user, 2026-11-09): with no query tab open, Create new — one card that opens an empty
 * query tab — then Quick access, Recent or Saved, one list at a time, each row opening its statement in a new tab. It
 * was the results pane's starting point under the editor (CLARITY, 2026-10-12); the lists moved here, and beside them
 * the catalog in figures — its schemas, tables, columns and rows, and the largest tables (the user: "I want users to
 * understand the nature of the catalogue that they have"). The audit read is stubbed; the assertions are about what the
 * page lists and what a click hands back, never the network.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@/lib/testing";

import type { AuditRecord, SavedQuery } from "@/lib/api";

const api = vi.hoisted(() => ({ getQueryHistory: vi.fn(), describeStatements: vi.fn() }));
vi.mock("@/lib/api", () => api);

import { QueryStart } from "./QueryStart";

const run = (id: string, sql: string, over: Partial<AuditRecord> = {}): AuditRecord => ({
  id, ts: new Date(Date.now() - 3 * 3600_000).toISOString(), connection_id: "8233e4fd",
  hypothesis_id: "query_workbench", sql_digest: sql, sql_full: sql, verdict: "safe", row_count: 5, duration_ms: 768.86,
  error: null, ...over,
});
const saved = (id: string, name: string, spec: Record<string, unknown> = {}, sql = "SELECT 1"): SavedQuery => ({
  id, connection_id: "8233e4fd", name, sql, spec, created_at: "", updated_at: "",
});

function mount(over: Partial<Parameters<typeof QueryStart>[0]> = {}) {
  const p = {
    connId: "8233e4fd", connectionName: "theLook", refreshKey: 0,
    saved: [saved("q1", "Revenue by country", {}, "SELECT country,\n  SUM(sale_price) FROM order_items GROUP BY 1"),
      saved("q2", "Orders by brand", { primaryTable: "orders" })] as SavedQuery[] | null | undefined,
    onNewQuery: vi.fn(), onOpenRun: vi.fn(), onOpenSaved: vi.fn(), ...over,
  };
  render(<QueryStart {...p} />);
  return p;
}
const pill = (name: RegExp) => screen.getByRole("radio", { name });

beforeEach(() => {
  api.getQueryHistory.mockReset();
  api.describeStatements.mockReset().mockResolvedValue([]);
});

describe("the start page", () => {
  it("opens with Create new — one card with an edge that opens an empty query tab — then Quick access", async () => {
    api.getQueryHistory.mockResolvedValue([]);
    const p = mount();
    expect(screen.getByRole("heading", { name: "Create new" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Quick access" })).toBeInTheDocument();
    const card = screen.getByTestId("query-start-new");
    expect(card).toHaveTextContent("SQL query");
    expect(card.className).toContain("rt-variant-outline");               // a button at rest, with an edge
    fireEvent.click(card);
    expect(p.onNewQuery).toHaveBeenCalledTimes(1);
    expect(pill(/^Recent/)).toHaveAttribute("aria-checked", "true");       // Recent first, as the reference does
    expect(await screen.findByText("Nothing has run on theLook yet")).toBeInTheDocument();
  });

  it("lists recent runs once each, with the person's own statement — and opens it", async () => {
    api.getQueryHistory.mockResolvedValue([
      run("a", "SELECT * FROM (SELECT country FROM users) __q LIMIT 501"),
      run("b", "SELECT * FROM (SELECT country FROM users) __q LIMIT 501"),
      run("c", "DROP SCHEMA s CASCADE", { verdict: "blocked", row_count: 0, duration_ms: 0,
        error: "DROP statements are not permitted in read-only mode" }),
    ]);
    const p = mount();
    const list = await screen.findByTestId("query-start-runs");
    await waitFor(() => expect(within(list).getAllByRole("button")).toHaveLength(2));
    expect(api.getQueryHistory).toHaveBeenCalledWith("8233e4fd", 30);
    expect(list).toHaveTextContent("SELECT country FROM users");
    expect(list).toHaveTextContent("×2");
    expect(list).toHaveTextContent("blocked");
    expect(list).not.toHaveTextContent("safe");
    expect(pill(/^Recent/)).toHaveTextContent("Recent 2");                  // two statements, counted once each
    fireEvent.click(within(list).getByText("SELECT country FROM users"));
    expect(p.onOpenRun).toHaveBeenCalledWith("SELECT country FROM users");
  });

  it("Saved lists this connection's queries — the statement under each name — and opens one the Saved menu's way", async () => {
    api.getQueryHistory.mockResolvedValue([run("a", "SELECT 1")]);
    const p = mount();
    await screen.findByTestId("query-start-runs");
    expect(screen.queryByTestId("query-start-saved")).toBeNull();           // one list at a time
    fireEvent.click(pill(/^Saved/));
    const list = screen.getByTestId("query-start-saved");
    expect(screen.queryByTestId("query-start-runs")).toBeNull();
    expect(list).toHaveTextContent("Revenue by country");
    expect(list).toHaveTextContent("SELECT country, SUM(sale_price) FROM order_items GROUP BY 1");
    expect(list).toHaveTextContent("visual");                               // which editor it was written in
    fireEvent.click(within(list).getByText("Revenue by country"));
    expect(p.onOpenSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "q1" }));
    fireEvent.click(pill(/^Recent/));                                       // and back
    expect(screen.getByTestId("query-start-runs")).toHaveTextContent("SELECT 1");
  });

  it("an empty Saved list says what will show there", () => {
    api.getQueryHistory.mockResolvedValue([]);
    mount({ saved: [] });
    fireEvent.click(pill(/^Saved/));
    expect(screen.getByTestId("query-start-saved")).toHaveTextContent("None saved for theLook yet");
    expect(screen.getByTestId("query-start-saved")).toHaveTextContent("Save names the open tab's query");
  });

  it("a Saved list that could not be read says so, rather than 'none saved'", () => {
    api.getQueryHistory.mockResolvedValue([]);
    mount({ saved: null });
    fireEvent.click(pill(/^Saved/));
    expect(screen.getByTestId("query-start-saved")).toHaveTextContent("could not be read");
    expect(screen.getByTestId("query-start-saved")).not.toHaveTextContent("None saved");
  });

  it("says a failed read as a failed read, not as nothing run", async () => {
    api.getQueryHistory.mockRejectedValue(new Error("Reading the query history: 503"));
    mount();
    const list = await screen.findByTestId("query-start-runs");
    await waitFor(() => expect(list).toHaveTextContent("503"));
    expect(list).not.toHaveTextContent("Nothing has run");
  });

  it("prints each run on two lines — what it does in words, then the statement — and the statement alone when it does not say", async () => {
    api.getQueryHistory.mockResolvedValue([
      run("a", "SELECT * FROM (SELECT country, SUM(sale_price) AS sales FROM order_items GROUP BY 1) __q LIMIT 501"),
      run("b", "SELECT 1"),
    ]);
    api.describeStatements.mockResolvedValue(["Sales by country", ""]);
    mount();
    const list = await screen.findByTestId("query-start-runs");
    await waitFor(() => expect(within(list).getAllByTestId("query-start-run-words")[0]).toHaveTextContent("Sales by country"));
    expect(api.describeStatements).toHaveBeenCalledWith("8233e4fd",
      ["SELECT country, SUM(sale_price) AS sales FROM order_items GROUP BY 1", "SELECT 1"]);
    const [described, bare] = within(list).getAllByRole("button");
    expect(within(described).getByTestId("query-start-run-sql")).toHaveTextContent("SELECT country, SUM(sale_price)");
    expect(within(bare).queryByTestId("query-start-run-sql")).toBeNull();       // no words: the statement alone
    expect(within(bare).getByTestId("query-start-run-words")).toHaveTextContent("SELECT 1");
  });

  it("a description that fails leaves the statements on screen", async () => {
    api.getQueryHistory.mockResolvedValue([run("a", "SELECT country FROM users")]);
    api.describeStatements.mockRejectedValue(new Error("503"));
    mount();
    const list = await screen.findByTestId("query-start-runs");
    await waitFor(() => expect(list).toHaveTextContent("SELECT country FROM users"));
    expect(within(list).queryByTestId("query-start-run-sql")).toBeNull();
  });

  it("with no connection, the card waits and Quick access says to choose one", () => {
    mount({ connId: "" });
    expect(screen.getByTestId("query-start-new")).toBeDisabled();
    expect(screen.getByText("Choose a connection to start")).toBeInTheDocument();
    expect(api.getQueryHistory).not.toHaveBeenCalled();
  });

  it("beside Quick access, says what the catalog holds — each schema, the largest tables — and opens a query on a table", async () => {
    api.getQueryHistory.mockResolvedValue([]);
    const cols = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `c${i}` }));
    const onOpenTable = vi.fn();
    mount({
      onOpenTable,
      tables: [
        { name: "thelook.events", rowCount: 2426096, columns: cols(13) },
        { name: "thelook.orders", rowCount: 125303, columns: cols(9) },
        { name: "thelook.notes", rowCount: null, columns: cols(2), isolated: true },
        { name: "staging.users", rowCount: 100000, columns: cols(11) },
        { name: "staging.audit", rowCount: 7, columns: [] },              // in the catalog, its columns not read
      ],
      joins: [{ t1: "thelook.orders", t2: "thelook.events" }],
    });
    const catalog = screen.getByRole("region", { name: "Catalog" });
    expect(within(catalog).getByRole("heading", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByTestId("query-start-catalog-whole")).toHaveTextContent(
      "2 schemas · 5 tables · 35 columns in the 4 tables read · 2.7M rows in the 4 counted"
      + "1 pair of tables known to join · 1 table joining none");
    const schemas = screen.getByTestId("query-start-schemas");
    expect(schemas).toHaveTextContent(/^thelook · 3 tables2\.6Mstaging · 2 tables100\.0K$/);
    expect(within(schemas).getByTitle("thelook: 3 tables, 24 columns, 2,551,399 rows, 1 table not counted")).toBeInTheDocument();
    const largest = screen.getByTestId("query-start-tables");
    expect(within(largest).getAllByRole("button").map(b => b.textContent)).toEqual(
      ["thelook.events", "thelook.orders", "staging.users", "staging.audit", "thelook.notes"]);
    expect(largest).toHaveTextContent("not counted");
    fireEvent.click(within(largest).getByRole("button", { name: "thelook.orders" }));
    expect(onOpenTable).toHaveBeenCalledWith("thelook.orders");
    await waitFor(() => expect(api.getQueryHistory).toHaveBeenCalled());
  });

  it("says the catalog is being read, or that the connection has no tables — never an empty box", () => {
    api.getQueryHistory.mockResolvedValue([]);
    mount({ onOpenTable: vi.fn(), tables: [], tablesLoading: true });
    expect(within(screen.getByRole("region", { name: "Catalog" })).getByText(/Loading the catalog|Reading the catalog/i))
      .toBeInTheDocument();
    cleanup();
    mount({ onOpenTable: vi.fn(), tables: [] });
    expect(screen.getByRole("region", { name: "Catalog" })).toHaveTextContent("No tables in theLook.");
  });
});
