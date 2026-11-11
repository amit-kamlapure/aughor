// @vitest-environment jsdom
/**
 * The questions that missed every declared term, on the Semantic Layer's Knowledge tab (PENDING item 28; ROADMAP §6
 * item 62: near-matches stay unwired, and a person adds the word here). Pinned: each question newest first with when
 * and how often, the misses whose words aged out said as one line, the count beside how many are listed, the honest
 * empty line, and Add a synonym — a form over the page that sends the word and the declared term through the key door,
 * closes when it is kept, and says a refusal inside itself.
 *
 * The two reads are mocked; the write is the real `addSynonym` over a stubbed `fetch`, so the test reads the body that
 * would leave the browser — and nothing reaches a live API.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeclaredTerm, FramingMisses } from "@/lib/api";
import { choose, fireEvent, optionsOf, render, screen, waitFor, within } from "@/lib/testing";

const api = vi.hoisted(() => ({ getFramingMisses: vi.fn(), getDeclaredTerms: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  ...api,
}));

import { MissedQuestions } from "./MissedQuestions";

const MISSES: FramingMisses = {
  connection_id: "c1", misses: 30, note: "a question is shown only while the session log still keeps its run",
  recent: [
    { at: "2026-10-23T19:49:36Z", trace_id: "t1", question: "How many finished purchases were there?", scheduled: false,
      might_mean: [{ name: "completed_orders", label: "Completed orders", score: 1.4 }] },
    { at: "2026-10-03T14:24:54Z", trace_id: "t4", question: null, scheduled: false },
    { at: "2026-10-20T09:00:00Z", trace_id: "t2", question: "How many  finished purchases were there? ", scheduled: true },
    { at: "2026-10-09T09:00:49Z", trace_id: "t3", question: null, scheduled: false },
    { at: "2026-10-21T08:00:00Z", trace_id: "t5", question: "Which parcels went out late?", scheduled: false },
  ],
};
const TERMS: DeclaredTerm[] = [
  { kind: "rule", id: "completed_orders", label: "Completed orders" },
  { kind: "stage", id: "order_fulfilment.shipped", label: "Order Fulfilment · shipped" },
  { kind: "metric", id: "revenue", label: "revenue" },
  { kind: "entity", id: "User", label: "Customer" },
];

const fetchMock = vi.fn();
beforeEach(() => {
  api.getFramingMisses.mockReset().mockResolvedValue(MISSES);
  api.getDeclaredTerms.mockReset().mockResolvedValue(TERMS);
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const rows = () => screen.getAllByTestId("missed-question");

async function openOnFirst() {
  render(<MissedQuestions connId="c1" />);
  await screen.findAllByTestId("missed-question");
  const opener = within(rows()[0]).getByRole("button", { name: "Add a synonym" });
  expect(opener).toHaveAttribute("aria-haspopup", "dialog");
  fireEvent.click(opener);
  return screen.findByRole("dialog");
}

describe("the questions that missed every declared term", () => {
  it("lists each question newest first, with when and how often, and the ones whose words aged out as one line", async () => {
    render(<MissedQuestions connId="c1" />);
    await screen.findAllByTestId("missed-question");
    expect(api.getFramingMisses).toHaveBeenCalledWith("c1");
    expect(screen.getByText("30 questions missed · the newest 5 listed")).toBeInTheDocument();
    const [first, second, third] = rows();
    expect(rows()).toHaveLength(3);
    // the same words asked twice are one row — told how often, dated by the last, marked for the scheduled run
    expect(first).toHaveTextContent("“How many finished purchases were there?”");
    expect(first).toHaveTextContent("asked 2 times · the last on Fri 23 Oct at 19:49 UTC");
    expect(within(first).getByText("scheduled")).toBeInTheDocument();
    expect(second).toHaveTextContent("“Which parcels went out late?”");
    expect(second).toHaveTextContent("Wed 21 Oct at 08:00 UTC · asked once");
    // what the session log no longer keeps is said, once, and offers no synonym — there are no words to take one from
    expect(third).toHaveTextContent("What was asked is no longer kept");
    expect(third).toHaveTextContent("2 questions · Sat 3 Oct to Fri 9 Oct");
    expect(within(third).queryByRole("button", { name: "Add a synonym" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says no question missed, and why none could, when there are none", async () => {
    api.getFramingMisses.mockResolvedValue({ ...MISSES, misses: 0, recent: [] });
    const { unmount } = render(<MissedQuestions connId="c1" />);
    expect(await screen.findByText("No question missed every declared term.")).toBeInTheDocument();
    expect(screen.queryByTestId("missed-question")).not.toBeInTheDocument();
    unmount();
    // a connection that declares no rule or stage counts nothing: the empty line says so rather than reading as coverage
    api.getDeclaredTerms.mockResolvedValue(TERMS.filter(t => t.kind === "metric" || t.kind === "entity"));
    render(<MissedQuestions connId="c1" />);
    expect(await screen.findByText(/declares no business rule or process stage, so none is counted/)).toBeInTheDocument();
  });

  it("says a failed read with Retry, never as the empty line", async () => {
    api.getFramingMisses.mockRejectedValueOnce(new Error("the API is down"));
    render(<MissedQuestions connId="c1" />);
    expect(await screen.findByText(/Could not read the missed questions — the API is down/)).toBeInTheDocument();
    expect(screen.queryByText(/No question missed/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findAllByTestId("missed-question")).toHaveLength(3);
  });
});

describe("Add a synonym", () => {
  it("opens a form over the page, sends the word and the declared term through the key door, and closes when kept", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ kept: { subject_kind: "term", subject_id: "order_fulfilment.shipped",
      synonym: "went out", source: "human", note: "" } }) });
    const dialog = await openOnFirst();
    expect(within(dialog).getByText("Add a synonym")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("For “How many finished purchases were there?”");
    expect(dialog).toHaveTextContent("The near-match finder would offer Completed orders. It frames nothing by itself");
    const picker = within(dialog).getByRole("combobox", { name: "The declared term it means" });
    // the choices are what the connection declares, rules and stages first
    expect(optionsOf(picker).map(o => o.text)).toEqual(["Completed orders", "Order Fulfilment · shipped", "revenue", "Customer"]);
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();                                                     // no word yet
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Word or phrase" }), { target: { value: "  went out " } });
    await choose(picker, "stage|order_fulfilment.shipped");
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/ontology\/vocabulary\/key\?connection_id=c1$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ synonym: "went out", kind: "stage", subject: "order_fulfilment.shipped" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "“went out” now means Order Fulfilment · shipped: the next question worded so is framed on it.");
  });

  it("says a refusal inside the form, which stays open with what was typed", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400,
      json: async () => ({ detail: "rule 'completed_orders' is not one this scope declares" }) });
    const dialog = await openOnFirst();
    const field = within(dialog).getByRole("textbox", { name: "Word or phrase" });
    fireEvent.change(field, { target: { value: "finished purchases" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("rule 'completed_orders' is not one this scope declares");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(field).toHaveValue("finished purchases");
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)))
      .toEqual({ synonym: "finished purchases", kind: "rule", subject: "completed_orders" });   // the first choice, as shown
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says a word for a metric or an entity frames nothing, so the question stays counted", async () => {
    const dialog = await openOnFirst();
    expect(within(dialog).queryByText(/is still counted here/)).not.toBeInTheDocument();
    await choose(within(dialog).getByRole("combobox", { name: "The declared term it means" }), "metric|revenue");
    expect(within(dialog).getByText(/A word for a metric helps an answer find what it names/)).toBeInTheDocument();
  });
});
