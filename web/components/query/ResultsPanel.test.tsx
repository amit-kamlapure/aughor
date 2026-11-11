// @vitest-environment jsdom
/**
 * DE-5d (ROADMAP §3.51) — what the results' figures line says about a cut result, and the two things it
 * offers next: "Count all rows" and "Load more". Both go to the server; the panel shows what came
 * back — a total with its as-of, a page handed to the owner of the results, or a refusal in the
 * server's own words. The API module is stubbed: the assertions are about what the panel asks for
 * and what it renders, never about the network.
 *
 * Since the editor was redone to CLARITY (2026-10-12) these sit on the figures line at the TOP of the
 * results (rows · time · the cut), the result's Copy and CSV beside them, and the ways out that were a
 * footer of buttons — another format, a chart, Pin, Schedule — behind one Tools ▾. An error is said once:
 * Failed, or Refused and why, with Quick fix on its row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { ResultsPanel, cutNote } from "./ResultsPanel";
import type { TypedQueryPage, TypedQueryResult } from "@/lib/api";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ index: i, start: i * 30, size: 30, key: i })),
    getTotalSize: () => count * 30,
  }),
}));
vi.mock("@/components/charts/ResultChartCard", () => ({ ResultChartCard: () => null }));

const api = vi.hoisted(() => ({
  countQueryRows: vi.fn(),
  loadMoreRows: vi.fn(),
  getColumnDistinct: vi.fn(),
  pinQueryToDashboard: vi.fn(),
  // The schedule popover reads this statement's schedules as it mounts, for the menu's "Schedule (n)".
  getMonitors: vi.fn(),
}));
// Partial: the panel's neighbours (the quick-fix panel) import other functions from the same
// module at load, and only the ones the panel calls are stubbed.
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

const SQL = "SELECT id FROM t ORDER BY id";

function result(over: Partial<TypedQueryResult> = {}): TypedQueryResult {
  return {
    columns: ["id"], columns_typed: [{ name: "id", type: "BIGINT" }],
    rows: [[1], [2], [3]], row_count: 3, truncated: true, cut_by: "limit",
    duration_ms: 4, sql: SQL, cached: false, error: null, caveats: [], format: "typed",
    ...over,
  };
}

/** Tools ▾ is Radix Themes' own menu, which reads its Theme. */
const renderPanel = (ui: React.ReactElement) => render(<Theme>{ui}</Theme>);

function mount(r: TypedQueryResult, extra: Partial<Parameters<typeof ResultsPanel>[0]> = {}) {
  return renderPanel(
    <ResultsPanel results={[r]} resultIdx={0} onResultIdx={() => {}} error="" running={false}
      connId="c1" pageSize={3} runKey={1} {...extra} />,
  );
}

beforeEach(() => {
  api.countQueryRows.mockReset();
  api.loadMoreRows.mockReset();
  api.pinQueryToDashboard.mockReset();
  api.getMonitors.mockReset();
  api.getMonitors.mockResolvedValue([]);
});

describe("DE-5d — the cut is said for what it is", () => {
  it("names the limit, the budget or the connector's cap", () => {
    expect(cutNote({ row_count: 500, cut_by: "limit" })).toBe("cut at 500 rows — more exist beyond this limit");
    expect(cutNote({ row_count: 10000, cut_by: "budget" }))
      .toBe("cut at 10,000 rows by this connection's row budget — more exist");
    expect(cutNote({ row_count: 500, cut_by: "cap" }))
      .toBe("cut at 500 rows — this connector returns at most that many a call, whatever the limit");
    expect(cutNote({ row_count: 500, cut_by: undefined })).toBe("truncated — more rows exist beyond this limit");
  });

  it("shows the note and both actions only on a cut result", () => {
    const { unmount } = mount(result({ cut_by: "budget", row_count: 10000 }), { onAppendRows: () => {} });
    expect(screen.getByTestId("cut-note")).toHaveTextContent("cut at 10,000 rows by this connection's row budget");
    expect(screen.getByTestId("count-all")).toHaveTextContent("Count all rows");
    expect(screen.getByTestId("load-more")).toHaveTextContent("Load 3 more");
    unmount();
    mount(result({ truncated: false, cut_by: null }), { onAppendRows: () => {} });
    expect(screen.queryByTestId("cut-note")).toBeNull();
    expect(screen.queryByTestId("count-all")).toBeNull();
    expect(screen.queryByTestId("load-more")).toBeNull();
  });

  it("offers no Load more when nobody owns the results", () => {
    mount(result());
    expect(screen.getByTestId("count-all")).toBeInTheDocument();
    expect(screen.queryByTestId("load-more")).toBeNull();
  });
});

describe("DE-5f — a result opened from a cell is a page of its own", () => {
  it("the pager names it, and its count runs with its own bound value", async () => {
    api.countQueryRows.mockResolvedValue({ total: 2, as_of: "2026-10-03T12:31:35+00:00", duration_ms: 1, sql: "", error: null, code: null });
    const related = result({
      sql: 'SELECT * FROM "orders" WHERE "buyer" = :v', params: { v: "c'1" },
      label: "orders rows related to customers.id = c'1", rows: [[1], [2]], row_count: 2,
      caveats: ["Related through customers.id = orders.buyer — 100% value overlap; declared foreign key."],
    });
    renderPanel(
      <ResultsPanel results={[result(), related]} resultIdx={1} onResultIdx={() => {}} error="" running={false}
        connId="c1" pageSize={3} runKey={1} params={{ lo: 0 }} />,
    );
    expect(screen.getByTestId("results-pager")).toHaveTextContent("Results 2 of 2 · orders rows related to customers.id = c'1");
    expect(screen.getByText(/Related through customers.id = orders.buyer/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("count-all"));
    await waitFor(() => expect(screen.getByTestId("count-result")).toHaveTextContent("2 rows in all"));
    expect(api.countQueryRows).toHaveBeenCalledWith("c1", 'SELECT * FROM "orders" WHERE "buyer" = :v', { v: "c'1" });
  });
});

describe("DE-close — a joined statement's columns are each their own table's", () => {
  it("offers related rows on a column DE-4's lineage traced, and reads its values from that table", async () => {
    api.getColumnDistinct.mockResolvedValue({ values: ["Complete", "Shipped", "Returned"], truncated: false });
    const joined = result({
      sql: "SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.buyer",
      columns: ["id", "name"],
      columns_typed: [
        { name: "id", type: "BIGINT", source: { table: "shop.orders", column: "id", confidence: "certain" } },
        { name: "name", type: "VARCHAR", source: { table: "shop.customers", column: "name", confidence: "certain" } },
      ],
      rows: [[1, "Ada"], [2, "Bo"]], row_count: 2, truncated: true, cut_by: "limit",
    });
    renderPanel(
      <ResultsPanel results={[joined]} resultIdx={0} onResultIdx={() => {}} error="" running={false}
        connId="c1" pageSize={2} runKey={1} onAppendResult={() => {}} />,
    );
    // A join: the one-table rule says nothing, the lineage says each column's table.
    fireEvent.contextMenu(screen.getByText("Ada"));
    expect(screen.getByTestId("cell-related")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    // The live read goes to the column's own table and schema — from the column's ▾, which a cut result links to it.
    fireEvent.click(screen.getAllByTestId("column-filter")[1]);
    expect(screen.getByTestId("column-filter-source")).toHaveTextContent("the result was cut, so more values may exist");
    fireEvent.click(screen.getByTestId("column-filter-live"));
    expect(screen.queryByTestId("column-filter-menu")).toBeNull();
    await waitFor(() => expect(api.getColumnDistinct).toHaveBeenCalledWith("c1", "customers", "name", "shop"));
    await waitFor(() => expect(screen.getByTestId("picker-source")).toHaveTextContent("From the table shop.customers, read live"));
  });
});

describe("DE-5d — Count all rows", () => {
  it("asks the server for the statement with the run's bound values and shows the total with its as-of", async () => {
    api.countQueryRows.mockResolvedValue({
      total: 12000, as_of: "2026-10-03T12:31:35+00:00", duration_ms: 4.7, sql: SQL, error: null, code: null,
    });
    mount(result(), { params: { lo: 0 } });
    fireEvent.click(screen.getByTestId("count-all"));
    await waitFor(() => expect(screen.getByTestId("count-result")).toHaveTextContent("12,000 rows in all · as of"));
    expect(api.countQueryRows).toHaveBeenCalledWith("c1", SQL, { lo: 0 });
  });

  it("shows a refusal in the server's words, never a zero", async () => {
    api.countQueryRows.mockResolvedValue({
      total: null, as_of: "2026-10-03T12:31:35+00:00", duration_ms: 1, sql: SQL,
      error: 'Binder Error: Referenced column "nope" not found', code: "FAILED",
    });
    mount(result());
    fireEvent.click(screen.getByTestId("count-all"));
    await waitFor(() => expect(screen.getByTestId("count-result"))
      .toHaveTextContent('Could not count — Binder Error: Referenced column "nope" not found'));
    expect(screen.getByTestId("count-result").textContent).not.toMatch(/\b0 rows/);
  });

  it("a failed request is said too", async () => {
    api.countQueryRows.mockRejectedValue(new Error("Query exceeded this connection's 60000ms time limit"));
    mount(result());
    fireEvent.click(screen.getByTestId("count-all"));
    await waitFor(() => expect(screen.getByTestId("count-result"))
      .toHaveTextContent("Could not count — Query exceeded this connection's 60000ms time limit"));
  });
});

describe("DE-5d — Load more", () => {
  const page = (over: Partial<TypedQueryPage> = {}): TypedQueryPage => ({
    ...result({ rows: [[4], [5]], row_count: 2, truncated: false, cut_by: null }),
    offset: 3, ordered: true, ...over,
  });

  it("asks for the next page after every row shown and hands it to the owner of the results", async () => {
    const onAppendRows = vi.fn();
    const p = page();
    api.loadMoreRows.mockResolvedValue(p);
    mount(result(), { onAppendRows, params: { lo: 0 } });
    fireEvent.click(screen.getByTestId("load-more"));
    await waitFor(() => expect(onAppendRows).toHaveBeenCalledWith(0, p));
    expect(api.loadMoreRows).toHaveBeenCalledWith("c1", SQL, 3, 3, { lo: 0 });
    expect(screen.queryByTestId("more-result")).toBeNull();
  });

  it("a refused page is said in the server's words and nothing is appended", async () => {
    const onAppendRows = vi.fn();
    api.loadMoreRows.mockResolvedValue(page({
      rows: [], row_count: 0, code: "PAGE_BILLED_AS_SCAN",
      error: "On BigQuery every statement is billed as a full scan of the tables it reads, so each page would cost what the whole result cost. Re-run with a higher limit instead — that is billed once.",
    }));
    mount(result(), { onAppendRows });
    fireEvent.click(screen.getByTestId("load-more"));
    await waitFor(() => expect(screen.getByTestId("more-result"))
      .toHaveTextContent("On BigQuery every statement is billed as a full scan"));
    expect(onAppendRows).not.toHaveBeenCalled();
  });

  it("the figures line's count follows the rows the owner appended", () => {
    // The owner (SqlMode) merges the page; the panel reads the merged result like any other.
    const merged = result({ rows: [[1], [2], [3], [4], [5]], row_count: 5, truncated: false, cut_by: null,
      caveats: ["This statement has no ORDER BY on its outermost query, so the engine may hand back its rows in another order each time — a page can repeat or skip rows. Add an ORDER BY for pages that join up exactly."] });
    mount(merged, { onAppendRows: () => {} });
    expect(screen.getByText("5 rows")).toBeInTheDocument();
    expect(screen.getByText(/no ORDER BY on its outermost query/)).toBeInTheDocument();
    expect(screen.queryByTestId("cut-note")).toBeNull();
  });
});

describe("CLARITY — the result opens on its figures", () => {
  it("says the count and the outcome first, and rows · time · the cut on one line at the grid's foot", () => {
    mount(result({ duration_ms: 768.9 }), { onAppendRows: () => {} });
    const line = screen.getByTestId("results-figures");
    expect(screen.getByTestId("results-rows")).toHaveTextContent("3 rows");
    expect(line).toHaveTextContent("769 ms");
    expect(line).toHaveTextContent("cut at 3 rows — more exist beyond this limit");
    // The SQL Editor mockup's order (2026-11-10): the views row — "Results 3" and how the run went — comes before the
    // grid; the figures line is the grid's foot.
    const grid = screen.getByTestId("grid-rownum-header");
    const views = screen.getByTestId("results-views");
    expect(views).toHaveTextContent("Results 3");
    expect(views.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.closest('[data-testid="grid-foot"]')).toBeTruthy();
    expect(grid.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a cached answer says cached, never a 0 ms run", () => {
    mount(result({ cached: true, duration_ms: 0, truncated: false, cut_by: null }));
    const line = screen.getByTestId("results-figures");
    expect(line).toHaveTextContent("cached");
    expect(line).not.toHaveTextContent("0 ms");
  });

  it("a statement that returned nothing says so once", () => {
    mount(result({ rows: [], row_count: 0, truncated: false, cut_by: null }));
    expect(screen.getByTestId("results-rows")).toHaveTextContent("No rows");
    expect(screen.queryByText("No rows returned.")).toBeNull();
  });

  it("every caveat is said, each once", () => {
    mount(result({ truncated: false, cut_by: null, caveats: ["Revenue is declared with status = 'Complete'.", "No ORDER BY."] }));
    const box = screen.getByTestId("results-caveats");
    expect(box).toHaveTextContent("Revenue is declared with status = 'Complete'.");
    expect(box).toHaveTextContent("No ORDER BY.");
    expect(box.textContent).not.toMatch(/notes:/);
  });

  it("offers Copy and CSV on the line itself", () => {
    mount(result({ truncated: false, cut_by: null }));
    expect(screen.getByTitle("Copy the table — pastes into a spreadsheet as cells")).toBeInTheDocument();
    expect(screen.getByTitle("Download the table as CSV")).toBeInTheDocument();
  });
});

describe("CLARITY — the result's ways out are one Tools ▾", () => {
  it("holds a chart, the other formats, Pin, Schedule and Keep as a sheet — each one opens what it did", async () => {
    api.pinQueryToDashboard.mockResolvedValue({});
    mount(result({ truncated: false, cut_by: null }));
    // No footer of buttons any more.
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.queryByTestId("results-schedule")).toBeNull();
    fireEvent.keyDown(screen.getByTestId("results-tools"), { key: "Enter" });
    const items = (await screen.findAllByRole("menuitem")).map(i => i.textContent);
    expect(items).toEqual(["Add a chart", "Other formats…", "Pin to the dashboard", "Schedule…", "Keep the rows as a sheet…"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin to the dashboard" }));
    await waitFor(() => expect(api.pinQueryToDashboard).toHaveBeenCalledWith("c1", SQL, "Query — t"));
  });

  it("Other formats opens every extractor, Schedule opens the schedule form", async () => {
    mount(result({ truncated: false, cut_by: null }));
    fireEvent.keyDown(screen.getByTestId("results-tools"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Other formats…" }));
    expect(screen.getByTestId("results-export-menu")).toHaveTextContent("JSON");
    expect(screen.getByTestId("results-export-menu")).toHaveTextContent("SQL INSERTs");
    fireEvent.keyDown(screen.getByTestId("results-tools"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Schedule…" }));
    expect(screen.getByTestId("schedule-popover")).toHaveTextContent("alerts on any change");
  });

  it("says how many schedules the statement already has", async () => {
    api.getMonitors.mockResolvedValue([
      { id: "m1", name: "Watch — t", custom_sql: `${SQL};`, check_cron: "0 9 * * *", enabled: true },
    ]);
    mount(result({ truncated: false, cut_by: null }));
    await waitFor(() => expect(api.getMonitors).toHaveBeenCalledWith("c1"));
    fireEvent.keyDown(screen.getByTestId("results-tools"), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Schedule (1)…" })).toBeInTheDocument();
  });
});

describe("CLARITY — an error is said once, a refusal as a refusal", () => {
  const failed = (error: string, failedSql = SQL) => renderPanel(
    <ResultsPanel results={[]} resultIdx={0} onResultIdx={() => {}} error={error} running={false}
      connId="c1" failedSql={failedSql} onApplyFix={() => {}} />,
  );

  it("a failure: the engine's words, once, with Quick fix on the same row", () => {
    failed('Binder Error: column "region" must appear in the GROUP BY clause');
    expect(screen.getByTestId("run-error-kind")).toHaveTextContent("Failed");
    expect(screen.getAllByText(/must appear in the GROUP BY clause/)).toHaveLength(1);
    const fix = screen.getByTestId("quick-fix");
    expect(fix).toHaveTextContent("Quick fix");
    expect(screen.getByTestId("run-error").contains(fix)).toBe(true);
  });

  it("a guard's block is a refusal, said without the platform's tag", () => {
    failed("[BLOCKED] DROP statements are not permitted in read-only mode", "DROP SCHEMA s");
    expect(screen.getByTestId("run-error-kind")).toHaveTextContent("Refused · blocked by a guard");
    expect(screen.getByTestId("run-error-message")).toHaveTextContent(/^DROP statements are not permitted in read-only mode$/);
  });

  it("a table turned off for analysis is said as such", () => {
    failed("[EXCLUDED] thelook.users is turned off for analysis — it is excluded (sensitive, by Ana). Turn it back on in the Catalog to use it.");
    expect(screen.getByTestId("run-error-kind")).toHaveTextContent("Refused · turned off for analysis");
    expect(screen.getByTestId("run-error-message")).toHaveTextContent("Turn it back on in the Catalog to use it.");
  });

  it("names the statement of a Run all that failed", () => {
    failed("Statement 2 of 3 failed: Parser Error: syntax error at end of input");
    expect(screen.getByTestId("run-error")).toHaveTextContent("statement 2 of 3");
    expect(screen.getByTestId("run-error-message")).toHaveTextContent(/^Parser Error: syntax error at end of input$/);
  });
});

// Was "before anything runs, the pane is a starting point" (CLARITY, 2026-10-12): the recent runs, saved queries and
// largest tables drew here. The user, 2026-11-09: "Actual SQL input component must not have a history component
// underneath it in any case" — they are the start page's now (QueryStart, with no tab open), and the pane takes no
// starting point at all.
describe("before anything runs, the pane is one line — never a history", () => {
  it("says how to run, and nothing else", () => {
    renderPanel(<ResultsPanel results={[]} resultIdx={0} onResultIdx={() => {}} error="" running={false} />);
    expect(screen.getByText("⌘↵ runs the statement under the cursor.")).toBeInTheDocument();
    expect(screen.queryByText(/recent runs|largest tables|saved/i)).toBeNull();
  });
});

describe("the ▾ at each column's head (2026-11-09) — a spreadsheet's AutoFilter, made of the same chips", () => {
  const orders = () => result({
    sql: "SELECT status, total FROM orders",
    columns: ["status", "total"],
    columns_typed: [{ name: "status", type: "VARCHAR" }, { name: "total", type: "BIGINT" }],
    rows: [["Complete", 10], ["Shipped", 9], [null, 100], ["Complete", 2]],
    row_count: 4, truncated: false, cut_by: null,
  });
  /** The arrows the reader sees, by column. */
  const arrow = (i: number) => screen.getAllByTestId("column-filter")[i];
  const cells = (col: number) => Array.from(document.querySelectorAll<HTMLElement>("[data-index]"))
    .map(row => row.children[col + 1]?.textContent ?? "");   // after the row number

  it("is there at rest with an edge; OK makes one chip, the rows narrow, the figures say so, the funnel shows", () => {
    mount(orders());
    expect(arrow(0).className).toContain("rt-variant-outline");
    expect(arrow(0).querySelector(".tabler-icon-chevron-down")).not.toBeNull();
    fireEvent.click(arrow(0));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shipped" }));
    fireEvent.click(screen.getByTestId("column-filter-ok"));
    expect(screen.getByText("status: 2 values")).toBeInTheDocument();          // the chip, in the chip bar
    expect(screen.getByTestId("results-rows")).toHaveTextContent("3 of 4 rows");
    expect(cells(0)).toEqual(["Complete", "∅", "Complete"]);
    expect(arrow(0)).toHaveAttribute("data-filtered", "true");
    expect(arrow(1)).not.toHaveAttribute("data-filtered");
    // Copy and CSV say they take what the chips leave.
    expect(screen.getByRole("button", { name: /copy/i })).toHaveTextContent("Copy shown");
  });

  it("opens again on its own filter, OK replaces its chip, and Clear takes it", () => {
    mount(orders());
    fireEvent.click(arrow(0));
    fireEvent.click(screen.getByRole("checkbox", { name: "Shipped" }));
    fireEvent.click(screen.getByTestId("column-filter-ok"));
    fireEvent.click(arrow(0));
    expect(screen.getByRole("checkbox", { name: "Shipped" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "(Blanks)" }));
    fireEvent.click(screen.getByTestId("column-filter-ok"));
    expect(screen.queryByText("status: 2 values")).toBeNull();                  // replaced, not added beside
    expect(screen.getByText('status is "Complete"')).toBeInTheDocument();
    expect(screen.getByTestId("results-rows")).toHaveTextContent("2 of 4 rows");
    fireEvent.click(arrow(0));
    fireEvent.click(screen.getByTestId("column-filter-clear"));
    expect(screen.queryByText('status is "Complete"')).toBeNull();
    expect(screen.getByTestId("results-rows")).toHaveTextContent("4 rows");
  });

  it("a number's condition narrows by size, and a checklist lists what the OTHER chips leave", () => {
    mount(orders());
    fireEvent.click(arrow(1));
    fireEvent.click(screen.getByTestId("column-condition-gt"));
    fireEvent.change(screen.getByLabelText("Number filters — the value"), { target: { value: "9" } });
    fireEvent.click(screen.getByTestId("column-filter-ok"));
    expect(screen.getByText("total > 9")).toBeInTheDocument();
    expect(cells(1)).toEqual(["10", "100"]);
    // status's checklist: the two rows total > 9 leaves.
    fireEvent.click(arrow(0));
    expect(screen.getAllByTestId("column-filter-value").map(el => el.textContent)).toEqual(["Complete1", "(Blanks)1"]);
    expect(screen.getByTestId("column-filter-source")).toHaveTextContent("From the 2 rows the other filters leave");
  });

  it("a typed chip on a column shows its funnel, and the column's Clear takes it too", () => {
    mount(orders());
    fireEvent.click(screen.getByTestId("results-filter-toggle"));
    const box = screen.getByLabelText("Filter the returned rows");
    fireEvent.change(box, { target: { value: "total > 5" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("results-rows")).toHaveTextContent("3 of 4 rows");
    expect(arrow(1)).toHaveAttribute("data-filtered", "true");
    fireEvent.click(arrow(1));
    fireEvent.click(screen.getByTestId("column-filter-clear"));
    expect(screen.getByTestId("results-rows")).toHaveTextContent("4 rows");
  });

  it("text sorts A → Z from the menu — a declared text column in text order — with the blank last both ways", () => {
    mount(result({
      sql: "SELECT n FROM t", columns: ["n"], columns_typed: [{ name: "n", type: "VARCHAR" }],
      rows: [["b"], ["C"], [null], ["a"]], row_count: 4, truncated: false, cut_by: null,
    }));
    fireEvent.click(arrow(0));
    expect(screen.getByTestId("column-sort-asc")).toHaveTextContent("A → Z");
    fireEvent.click(screen.getByTestId("column-sort-asc"));
    expect(cells(0)).toEqual(["a", "b", "C", "∅"]);
    fireEvent.click(arrow(0));
    fireEvent.click(screen.getByTestId("column-sort-desc"));
    expect(cells(0)).toEqual(["C", "b", "a", "∅"]);
  });

  it("numbers sort by size from the menu and from a click on the head, the blank last both ways", () => {
    mount(result({
      sql: "SELECT n FROM t", columns: ["n"], columns_typed: [{ name: "n", type: "DOUBLE" }],
      rows: [["10"], ["9"], [null], ["100"]], row_count: 4, truncated: false, cut_by: null,
    }));
    fireEvent.click(arrow(0));
    expect(screen.getByTestId("column-sort-asc")).toHaveTextContent("smallest → largest");
    fireEvent.click(screen.getByTestId("column-sort-desc"));
    expect(cells(0)).toEqual(["100", "10", "9", "∅"]);
    fireEvent.click(screen.getByTitle("n · DOUBLE — click to sort"));
    fireEvent.click(screen.getByTitle("n · DOUBLE — click to sort"));
    expect(cells(0).slice(0, 3)).toEqual(["9", "10", "100"]);
    expect(cells(0)[3]).toBe("∅");
  });
});

describe("one run seen five ways (2026-11-10, the SQL Editor mockup)", () => {
  it("offers Results, Chart, Profile, Execution and Logs, and says how the run went", () => {
    mount(result({ receipt_id: "4c2e2a494780" }), { verdict: { text: "Guards clean" }, readAt: "2026-11-09T19:40:24Z" });
    expect(screen.getByTestId("results-views")).toHaveTextContent("Results 3");
    expect(screen.getByTestId("results-status")).toHaveTextContent("Succeeded · 0.00 s");
    fireEvent.click(screen.getByTestId("results-view-profile"));
    // the profile is of the LOADED rows, and says so when the result was cut
    expect(screen.getByTestId("results-profile")).toHaveTextContent("this is the loaded rows, not the whole result");
    expect(screen.getAllByTestId("results-profile-row")[0]).toHaveTextContent("id");
    fireEvent.click(screen.getByTestId("results-view-execution"));
    const exec = screen.getByTestId("results-execution");
    expect(exec).toHaveTextContent("cut by the row limit");
    expect(exec).toHaveTextContent("Run on the warehouse, read Mon 9 Nov at 19:40 UTC");
    expect(exec).toHaveTextContent("Guards clean");
    expect(exec).toHaveTextContent("4c2e2a494780");
    fireEvent.click(screen.getByTestId("results-view-logs"));
    expect(screen.getAllByTestId("results-log-row")).toHaveLength(1);
  });

  it("says a cached result was not run again, and that its time is not kept", () => {
    mount(result({ cached: true, truncated: false, cut_by: null }));
    fireEvent.click(screen.getByTestId("results-view-execution"));
    expect(screen.getByTestId("results-execution")).toHaveTextContent("From the result cache — not run again; when it was measured is not kept");
  });

  it("draws the first chart from the Chart view", () => {
    mount(result());
    fireEvent.click(screen.getByTestId("results-view-chart"));
    expect(screen.queryByTestId("results-view-chart")).toBeNull();     // the chart is its own tab now
    expect(screen.getByRole("button", { name: "Chart 1" })).toHaveAttribute("aria-pressed", "true");
  });
});
