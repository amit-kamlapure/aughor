// @vitest-environment jsdom
/**
 * The SQL editor opens on a start page unless a tab is open, and nothing of history sits under the editor (the user,
 * 2026-11-09, with a reference console's start page: "lets have a layout similar to this for the opening of SQL editor,
 * unless a session has a tab/s open.. Actual SQL input component must not have a history component underneath it in
 * any case.. let the output structure be either empty or collapsed instead..").
 *
 * The editor itself is CodeMirror, which jsdom cannot lay out, so it is stubbed with a text area that keeps its contract:
 * the value it is handed, `onChange` per edit, and the insert API it publishes once on mount (inserting reaches the
 * document through `onChange`, as CM6's does). The parser worker and the guard linter are stubbed for the same reason.
 * Everything else is the real component: the tabs, the start page, the toolbar, the split, the results grid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@/lib/testing";

import type { AuditRecord, SavedQuery, TypedQueryResult } from "@/lib/api";

vi.mock("@/components/query/editor/SqlEditorPane", async () => {
  const React = await import("react");
  return {
    SqlEditorPane: (p: {
      value: string; onChange: (s: string) => void;
      onReady?: (api: { insert: (t: string) => void; focus: () => void; relint: () => void; cursorToEnd: () => void }) => void;
    }) => {
      const props = React.useRef(p);
      props.current = p;
      // A cursor as CodeMirror keeps one (`SqlEditorPane.test.tsx` holds the real editor to it): a document replaced from
      // outside leaves it where it was, at most at the new end; an insert lands at it and moves it past the text.
      const cursor = React.useRef(0);
      cursor.current = Math.min(cursor.current, p.value.length);
      React.useEffect(() => {
        p.onReady?.({
          insert: t => {
            const v = props.current.value;
            const at = Math.min(cursor.current, v.length);
            cursor.current = at + t.length;
            props.current.onChange(v.slice(0, at) + t + v.slice(at));
          },
          focus: () => {}, relint: () => {},
          cursorToEnd: () => { cursor.current = props.current.value.length; },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement("textarea", {
        "data-testid": "sql-editor", value: p.value,
        onChange: (e: { target: { value: string } }) => { cursor.current = e.target.value.length; p.onChange(e.target.value); },
      });
    },
  };
});
vi.mock("@/lib/query/parserClient", () => ({
  splitStatements: async (t: string) => [{ text: t, from: 0, to: t.length }],
  statementAt: (r: Array<{ text: string }>) => r[0],
  findParams: () => [],
  validateSql: async () => [],
  isMetadataStatement: () => false,
}));
vi.mock("@/components/query/editor/diagnostics", () => ({ sqlDiagnostics: () => [] }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => Array.from({ length: count }, (_, i) => ({ index: i, start: i * 30, size: 30, key: i })),
    getTotalSize: () => count * 30,
  }),
}));
vi.mock("@/components/charts/ResultChartCard", () => ({ ResultChartCard: () => null }));

const api = vi.hoisted(() => ({
  runWorkbenchQuery: vi.fn(), getQueryHistory: vi.fn(), describeStatements: vi.fn(), listSavedQueries: vi.fn(),
  askForSql: vi.fn(), validateQuery: vi.fn(), getMonitors: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<object>()), ...api }));

import { SqlMode, type TableActions } from "./SqlMode";

const CONN = "c1";
const TABS_KEY = `aug.sqledit.tabs:${CONN}`;
const DRAFT_KEY = `aug.sqledit.draft:${CONN}`;

const storeTabs = (tabs: Array<{ id: string; sql: string; name?: string }>) =>
  localStorage.setItem(TABS_KEY, JSON.stringify({
    v: 1, tabs: tabs.map(t => ({ name: "Query", touched: 1, ...t })), activeId: tabs[0]?.id ?? "",
  }));
const storedTabs = () => (JSON.parse(localStorage.getItem(TABS_KEY) ?? "null") as { tabs: unknown[] } | null)?.tabs;

const run = (id: string, sql: string): AuditRecord => ({
  id, ts: new Date(Date.now() - 3600_000).toISOString(), connection_id: CONN, hypothesis_id: "query_workbench",
  sql_digest: sql, sql_full: sql, verdict: "safe", row_count: 2, duration_ms: 12, error: null,
});
const savedQ: SavedQuery = {
  id: "q1", connection_id: CONN, name: "Revenue by country", sql: "SELECT country FROM orders", spec: {},
  created_at: "", updated_at: "",
};
const result = (): TypedQueryResult => ({
  columns: ["country"], columns_typed: [{ name: "country", type: "VARCHAR" }], rows: [["Brasil"], ["Japan"]],
  row_count: 2, truncated: false, cut_by: null, duration_ms: 12, sql: "SELECT country FROM users", cached: false,
  error: null, caveats: [], format: "typed",
});

function mount(over: Partial<Parameters<typeof SqlMode>[0]> = {}) {
  const onInsertReady = vi.fn<(insert: (text: string) => void) => void>();
  const p = {
    connId: CONN, engine: { conn_type: "duckdb" }, connectionName: "theLook", saved: [savedQ],
    onOpenSaved: vi.fn(), onInsertReady, ...over,
  };
  return { p, onInsertReady, ...render(<SqlMode {...p} />) };
}
const editor = () => screen.getByTestId("sql-editor") as HTMLTextAreaElement;
const column = () => screen.getByTestId("sql-editor-column");

beforeEach(() => {
  localStorage.clear();
  for (const f of Object.values(api)) f.mockReset();
  api.getQueryHistory.mockResolvedValue([]);
  api.describeStatements.mockResolvedValue([]);
  api.listSavedQueries.mockResolvedValue([]);
  api.getMonitors.mockResolvedValue([]);
  api.runWorkbenchQuery.mockResolvedValue(result());
});

describe("with no query tab open, the editor area is the start page", () => {
  it("on a connection's first opening; SQL query opens an empty tab, and the editor in place of the page", async () => {
    mount();
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["New tab"]);
    expect(screen.getByRole("tab", { name: "New tab" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("query-start")).toBeVisible();
    expect(column()).not.toBeVisible();                       // no toolbar, no editor, no results under the page
    fireEvent.click(screen.getByTestId("query-start-new"));
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(screen.queryByRole("tab", { name: "New tab" })).toBeNull();
    expect(screen.getAllByRole("tab").map(t => t.getAttribute("aria-label"))).toEqual(["Query"]);
    expect(column()).toBeVisible();
    expect(editor().value).toBe("");
  });

  it("a recent run opens its statement in a new tab; a saved one goes the Saved menu's way", async () => {
    api.getQueryHistory.mockResolvedValue([run("a", "SELECT * FROM (SELECT country FROM users) __q LIMIT 501")]);
    const { p } = mount();
    const recent = await screen.findByTestId("query-start-runs");
    fireEvent.click(await within(recent).findByText("SELECT country FROM users"));
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(editor().value).toBe("SELECT country FROM users");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Close History" }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Saved/ }));
    fireEvent.click(within(screen.getByTestId("query-start-saved")).getByText("Revenue by country"));
    expect(p.onOpenSaved).toHaveBeenCalledWith(savedQ);
  });

  it("beside the lists, the catalog; a table opens a query on it in a new tab, never run", async () => {
    mount({ startTables: [{ name: "thelook.users", rowCount: 100000, columns: [{ name: "id" }] },
      { name: "thelook.events", rowCount: 2426096, columns: [] }] });
    const largest = screen.getByTestId("query-start-tables");
    fireEvent.click(within(largest).getByRole("button", { name: "thelook.users" }));
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(editor().value).toBe("SELECT * FROM thelook.users LIMIT 100");
    expect(screen.getByRole("tab", { name: "users" })).toHaveAttribute("aria-selected", "true");
    expect(api.runWorkbenchQuery).not.toHaveBeenCalled();
  });

  it("a tab set none of whose tabs holds any SQL opens on it too — and one with SQL opens as it was", async () => {
    storeTabs([{ id: "t1", sql: "" }, { id: "t2", sql: "  \n" }]);
    const first = mount();
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["New tab"]);
    expect(screen.getByTestId("query-start")).toBeInTheDocument();
    first.unmount();
    storeTabs([{ id: "t1", sql: "" }, { id: "t2", sql: "SELECT 2" }]);
    mount();
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);       // the empty one beside it stays: the set is the person's
  });

  it("with no tab set at all, SE-1's single draft is still carried into a tab", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, sql: "SELECT legacy" }));
    mount();
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(editor().value).toBe("SELECT legacy");
  });

  it("the catalog rail's insert, with no tab to put it in, opens one holding the name", async () => {
    const { onInsertReady } = mount();
    await screen.findByTestId("query-start");
    const insert = onInsertReady.mock.calls.at(-1)![0];
    act(() => insert("thelook.users"));
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(editor().value).toBe("thelook.users");
    act(() => insert(" u"));                                     // with a tab open, it goes in at the cursor
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(editor().value).toBe("thelook.users u");
  });

  it("an insert handed over with a connection switch to one with no tabs opens a tab too", async () => {
    const { p, rerender } = mount();
    await screen.findByTestId("query-start");
    rerender(<SqlMode {...p} pendingInsert={{ text: "thelook.orders", nonce: 1 }} />);
    await waitFor(() => expect(screen.queryByTestId("query-start")).toBeNull());
    expect(editor().value).toBe("thelook.orders");
  });
});

describe("a table's » (the user, 2026-11-09)", () => {
  const actionsOf = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.at(-1)![0] as TableActions;

  it("puts a statement that reads the table into an empty tab, and the name alone into one holding SQL", async () => {
    storeTabs([{ id: "t1", sql: "" }, { id: "t2", sql: "SELECT 1" }]);
    const onTableActionsReady = vi.fn();
    mount({ onTableActionsReady });
    expect(editor().value).toBe("");
    act(() => actionsOf(onTableActionsReady).insert("lux.orders"));
    expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100");
    act(() => actionsOf(onTableActionsReady).insert("lux.customers"));     // SQL there now: the name, at the cursor
    expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100lux.customers");
    expect(api.runWorkbenchQuery).not.toHaveBeenCalled();
  });

  it("with no tab open, opens one holding the statement, named for the table, the cursor at its end", async () => {
    const onTableActionsReady = vi.fn();
    mount({ onTableActionsReady });
    await screen.findByTestId("query-start");
    act(() => actionsOf(onTableActionsReady).insert("lux.orders"));
    expect(screen.queryByTestId("query-start")).toBeNull();
    expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100");
    expect(screen.getByRole("tab", { name: "orders" })).toHaveAttribute("aria-selected", "true");
    // the next » goes after the statement, not in front of SELECT (seen live: "lux.customersSELECT * FROM …")
    act(() => actionsOf(onTableActionsReady).insert(" JOIN lux.customers"));
    expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100 JOIN lux.customers");
  });

  it("a tab opened from Preview data, a recent run or a hand-over takes the cursor at its end too", async () => {
    storeTabs([{ id: "t1", sql: "SELECT country FROM users" }]);
    const onTableActionsReady = vi.fn();
    const { p, rerender, onInsertReady } = mount({ onTableActionsReady });
    const insert = () => onInsertReady.mock.calls.at(-1)![0];
    act(() => actionsOf(onTableActionsReady).preview("lux.orders"));
    await waitFor(() => expect(api.runWorkbenchQuery).toHaveBeenCalled());
    act(() => insert()(" -- end"));
    expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100 -- end");
    // longer than where the cursor sat in the tab before, so only the opening can put the cursor at its end
    const handed = "SELECT order_id, status, total_amount FROM lux.orders WHERE status = 'open'";
    rerender(<SqlMode {...p} onTableActionsReady={onTableActionsReady} pendingOpen={{ sql: handed, name: "handed", nonce: 7 }} />);
    await waitFor(() => expect(editor().value).toBe(handed));
    act(() => insert()(" LIMIT 5"));
    expect(editor().value).toBe(`${handed} LIMIT 5`);
  });

  it("only a tab opening moves the cursor: switching to a tab already open leaves it where the editor had it", () => {
    const long = "SELECT order_id, status, total_amount FROM lux.orders";
    storeTabs([{ id: "t1", sql: "SELECT 1", name: "one" }, { id: "t2", sql: long, name: "two" }]);
    const { onInsertReady } = mount();
    fireEvent.click(screen.getByRole("tab", { name: "two" }));
    expect(editor().value).toBe(long);
    act(() => onInsertReady.mock.calls.at(-1)![0]("x"));
    expect(editor().value).toBe(`x${long}`);
  });

  it("Preview data opens the statement in a new tab and runs it there; the tab in progress is left as it was", async () => {
    storeTabs([{ id: "t1", sql: "SELECT country FROM users" }]);
    const onTableActionsReady = vi.fn();
    mount({ onTableActionsReady });
    act(() => actionsOf(onTableActionsReady).preview("lux.orders"));
    await waitFor(() => expect(api.runWorkbenchQuery).toHaveBeenCalledTimes(1));
    expect(api.runWorkbenchQuery).toHaveBeenCalledWith(CONN, "SELECT * FROM lux.orders LIMIT 100", 500, {}, expect.anything());
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "orders" })).toHaveAttribute("aria-selected", "true");
    expect((storedTabs() as Array<{ sql: string }> | undefined)?.[0]?.sql ?? "SELECT country FROM users")
      .toBe("SELECT country FROM users");
  });

  it("from another connection's table: the same rule once the switch lands, and Preview data still runs", async () => {
    const { p, rerender } = mount();
    await screen.findByTestId("query-start");
    rerender(<SqlMode {...p} pendingInsert={{ text: "lux.orders", nonce: 1, table: true }} />);
    await waitFor(() => expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100"));
    rerender(<SqlMode {...p} pendingInsert={{ text: "lux.users", nonce: 2, table: true }} />);
    await waitFor(() => expect(editor().value).toBe("SELECT * FROM lux.orders LIMIT 100\nlux.users"));
    rerender(<SqlMode {...p} pendingOpen={{ sql: "SELECT * FROM lux.items LIMIT 100", name: "items", nonce: 3, run: true }} />);
    await waitFor(() => expect(api.runWorkbenchQuery).toHaveBeenCalledWith(
      CONN, "SELECT * FROM lux.items LIMIT 100", 500, {}, expect.anything()));
  });
});

describe("with a tab open, nothing of history is under the editor", () => {
  it("before a run the results are folded to one line; the first run opens them on the grid", async () => {
    storeTabs([{ id: "t1", sql: "SELECT country FROM users" }]);
    mount();
    expect(editor().value).toBe("SELECT country FROM users");
    expect(screen.queryByTestId("query-start")).toBeNull();
    const col = column();
    for (const said of [/recent runs/i, /largest tables/i, /^saved$/i, /quick access/i]) {
      expect(within(col).queryByText(said)).toBeNull();
    }
    expect(screen.getByText("⌘↵ runs the statement under the cursor.")).not.toBeVisible();   // the pane, folded
    expect(screen.getByTestId("sql-output-rest")).toHaveTextContent("Results open here when a statement runs.");

    fireEvent.click(screen.getByTestId("sql-run"));
    expect(await screen.findByText("Brasil")).toBeVisible();
    expect(api.runWorkbenchQuery).toHaveBeenCalledWith(CONN, "SELECT country FROM users", 500, {}, expect.anything());
    expect(screen.queryByTestId("sql-output-rest")).toBeNull();
    expect(within(column()).queryByText(/recent runs|largest tables/i)).toBeNull();
  });

  it("closing the last tab opens the start page, takes its result with it, and stays closed on the next visit", async () => {
    storeTabs([{ id: "t1", sql: "SELECT country FROM users" }]);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, sql: "SELECT legacy" }));   // SE-1's key, left in place
    const first = mount();
    fireEvent.click(screen.getByTestId("sql-run"));
    await screen.findByText("Brasil");
    fireEvent.click(screen.getByRole("button", { name: "Close Query" }));
    expect(await screen.findByTestId("query-start")).toBeInTheDocument();
    expect(storedTabs()).toEqual([]);                        // written at once, not on the debounce

    fireEvent.click(screen.getByTestId("query-start-new"));
    expect(screen.queryByText("Brasil")).toBeNull();          // the closed tab's result went with it
    expect(screen.getByTestId("sql-output-rest")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close Query" }));
    first.unmount();
    mount();
    expect(screen.queryByDisplayValue("SELECT legacy")).toBeNull();          // the old key brings nothing back
    expect(screen.getAllByRole("tab").map(t => t.textContent)).toEqual(["New tab"]);
    expect(screen.getByTestId("query-start")).toBeInTheDocument();
  });
});
