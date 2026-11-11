// @vitest-environment jsdom
/**
 * A quick answer, as the Evidence → Action study draws one (§12.2–12.4; the user, 2026-11-10: "Actions and the Ask"):
 * the headline said as Narrative (the model wrote it from the rows), the figures said as Computed (the executed query's
 * own), and the answer's views — Results · Explanation · SQL · Evidence — with Results leading, so a direct lookup opens
 * on its figure. "Explain the data" and the "Methodology & details" fold are the Explanation and Evidence views now;
 * Open in SQL Editor puts the statement, as it ran, in a new editor tab without running it.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";

import { ChatMessage } from "@/components/ChatMessage";
import { EMPTY_TURN, type ChatTurn } from "@/lib/chatTurn";
import { OpenInQueryProvider } from "@/lib/openInQuery";

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
  }));
});

const TURN = {
  ...EMPTY_TURN, id: "t1", mode: "ask", status: "done",
  question: "Revenue by month this year",
  sql: "SELECT month, revenue FROM monthly_revenue ORDER BY month",
  columns: ["month", "revenue"],
  rows: [["2026-01", 100], ["2026-02", 120], ["2026-03", 90]],
  headline: "Revenue peaked in February at 120.",
  narrative: { narrative: "February led; March fell back.", anomalies: [], trend: "", confidence: "" },
  tablesUsed: ["thelook.monthly_revenue"],
  receiptId: "r1",
} as ChatTurn;

const pick = (name: RegExp) => {
  const t = screen.getByRole("tab", { name });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
};

describe("a quick answer's anatomy", () => {
  it("says the headline is narrative and the figures computed, and leads with Results", () => {
    render(<Theme><ChatMessage turn={TURN} connectionId="c1" /></Theme>);
    expect(screen.getByTestId("answer-narrative-label")).toHaveTextContent(/^Narrative\s*written by the model from the rows the query returned$/);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    ["Results · 3", "Explanation", "SQL", "Evidence"].forEach((n, i) => expect(tabs[i]).toHaveAccessibleName(n));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("answer-computed-label")).toHaveTextContent(/^Computed\s*from the executed query · 3 rows · reads thelook.monthly_revenue$/);
    expect(screen.queryByText("Explain the data")).not.toBeInTheDocument();
  });

  it("holds the narrative under Explanation, the statement under SQL, the details under Evidence", () => {
    render(<Theme><ChatMessage turn={TURN} connectionId="c1" /></Theme>);
    pick(/^Explanation/);
    expect(screen.getByTestId("answer-explanation")).toHaveTextContent("February led; March fell back.");
    expect(screen.getByTestId("answer-explanation-label")).toHaveTextContent(/^Narrative\s*written by the model from the rows$/);
    pick(/^SQL/);
    expect(screen.getByTestId("answer-sql")).toHaveTextContent(TURN.sql!);     // exactly as it ran — `month` not upper-cased
    pick(/^Evidence/);
    expect(screen.getByTestId("answer-evidence")).toHaveTextContent("Tables used");
  });

  it("says an explanation the platform summarised is computed, not the model's", () => {
    render(<Theme><ChatMessage turn={{ ...TURN, narrative: null } as ChatTurn} connectionId="c1" /></Theme>);
    pick(/^Explanation/);
    expect(screen.getByTestId("answer-explanation-label")).toHaveTextContent(/^Computed\s*summarised from the rows by the platform/);
  });

  it("does not call a headline with no query behind it, or a withheld one, the model's narrative", () => {
    const { unmount } = render(<Theme><ChatMessage turn={{ ...TURN, sql: null, columns: [], rows: [], headline: "Mytheresa isn't a franchise here." } as ChatTurn} connectionId="c1" /></Theme>);
    expect(screen.queryByTestId("answer-narrative-label")).not.toBeInTheDocument();
    unmount();
    render(<Theme><ChatMessage turn={{ ...TURN, guardReceipts: [{ guard: "numeric grounding", action: "withheld the answer", detail: "" }] } as ChatTurn} connectionId="c1" /></Theme>);
    expect(screen.queryByTestId("answer-narrative-label")).not.toBeInTheDocument();
  });

  it("opens the statement, as it ran, in the SQL Editor", () => {
    const open = vi.fn();
    render(<Theme><OpenInQueryProvider value={open}><ChatMessage turn={TURN} connectionId="c1" /></OpenInQueryProvider></Theme>);
    fireEvent.click(screen.getByTestId("answer-open-in-editor"));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ sql: TURN.sql, connId: "c1", mode: "sql" }));
  });
});
