// @vitest-environment jsdom
/**
 * The Briefing as a running account (2026-11-12). A written edition the server reads as storylines is drawn as: its
 * own lead, what the storylines amount to, every figure on its part of the business, then each storyline with the
 * four things that make it something to act on — and the edition's blocks inside the storyline they belong to, drawn
 * by the same renderer, so nothing the page could do before is lost. Giving a storyline an owner and taking a decision
 * on it go through the doors that already keep those things: the metric's owner, the Record's decision.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BriefingEdition as Edition, EditionFigure, EditionStoryline } from "@/lib/api";

const api = vi.hoisted(() => ({
  readBriefingEdition: vi.fn(), writeBriefingEdition: vi.fn(), readBriefingGuide: vi.fn(), draftBriefingGuide: vi.fn(),
  getGroups: vi.fn(), putMyPreference: vi.fn(), drillBriefingEdition: vi.fn(), giveBriefingDecision: vi.fn(),
  setMetricOwner: vi.fn(), measureRange: vi.fn(), getBriefingDesk: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));
const record = vi.hoisted(() => ({ declareDecision: vi.fn() }));
vi.mock("@/lib/record", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/record")>()), ...record }));
vi.mock("@/components/brief/BriefSchedule", () => ({ BriefSchedule: () => null }));
vi.mock("@/lib/usePramanyxChat", () => ({ usePramanyxChat: () => ({ messages: [], status: "ready", sendMessage: () => Promise.resolve() }) }));
vi.mock("@/lib/objects", () => ({ getObjectCatalog: vi.fn(async () => ({ types: [] })), cachedObjectCatalog: vi.fn(async () => null) }));
const nav = vi.hoisted(() => ({ requestTab: vi.fn() }));
vi.mock("@/lib/navigate", () => nav);
vi.mock("@/components/charts/vega/VegaChart", () => ({
  VegaChart: ({ spec }: { spec: unknown }) => <div data-testid="vega" data-spec={JSON.stringify(spec)} />,
}));

import { BriefingEdition } from "./BriefingEdition";

const fig = (id: string, label: string, current: number, low: number, high: number, unit = "EUR"): EditionFigure => ({
  id, label, metric: id, unit, better: "up", why: "", current, previous: low, last_year: null, rel: 0.02, rel_last_year: null, n: 9,
  status: "final", z: 2, outside: current > high || current < low, floor: false, streak: 3, extreme: null, cells: {},
  usual: { mean: (low + high) / 2, low, high, n: 8, mean_text: "", low_text: String(low), high_text: String(high) },
  series: [{ label: "u1", start: "2026-10-26", value: low }, { label: "current", start: "2026-11-02", value: current }],
  current_text: String(current), previous_text: String(low), last_year_text: null, like_for_like: "", sql: "SELECT 1",
});
const FIGURES = [fig("orders", "Orders placed", 284, 259, 293, "count"), fig("delivery", "Order-to-delivery days", 6.82, 6.41, 6.67, "days")];
const story = (over: Partial<EditionStoryline>): EditionStoryline => ({
  id: "area:deliver", kind: "figures", stage: "deliver", stage_name: "Fulfilment", figures: ["delivery"], anchor: "delivery",
  metric: "order_to_delivery_days", head: "Order-to-delivery days read 6.82, above its usual 6.41–6.67.", called: true, status: "final",
  state: "developing", owner: "", owner_from: "", worth: { value: null, why: "not a money figure, so it is not priced" },
  decision: { taken: false, text: "Set an alert on express transit.", block: "dec" }, check: { state: "none", says: "Nothing is checked until a decision is taken." },
  trail: [{ when: "2026-11-02", kind: "read", says: "6.82", now: true }, { when: "", kind: "open", open: true, says: "Nobody owns Order-to-delivery days." }],
  blocks: ["why", "dec"], waits: true, ...over,
});
const PAUSE = story({ id: "decision:d1", kind: "decision", stage: "", stage_name: "", figures: [], anchor: "", metric: "",
  head: "Pause paid social on Mytheresa for October", state: "decided", owner: "Sidha Sadhak", owner_from: "decision", blocks: ["said"],
  worth: { value: null, why: "a decision is not priced here" }, waits: false,
  decision: { taken: true, id: "7b3f", text: "pause paid social on Mytheresa for October", decided: "2026-10-26", by: "Sidha Sadhak",
              owner: "Sidha Sadhak", review_on: "2026-11-26", expected: false, where: "decided in a Slack thread" },
  check: { state: "unscored", on: "2026-11-26", says: "No expected figure was declared when it was decided, so the review has nothing to score." },
  trail: [{ when: "2026-10-26", kind: "decision", says: "Decided: pause paid social", source: "decision_d1" }] });

const WRITTEN = (stories: EditionStoryline[]): Edition => ({
  built: true, composed: true, scope_key: "c",
  period: { period: "week", key: "k", preset: "last_week", label: "Weekly", start: "2026-11-02", end: "2026-11-09", last_day: "2026-11-08",
            covers: "the week 2026-11-02 to 2026-11-08", compared_with: "the week before", lag_days: 1, still_moving: [],
            measured: FIGURES, unmeasured: [] } as unknown as Edition["period"],
  reader: { group_id: "", name: "The organisation" },
  sources: { delivery: { id: "delivery", label: "Order-to-delivery days", kind: "check", columns: [], rows: [], sql: "SELECT 1", status: "final",
                         facts: {}, receipts: [], caveats: [], note: "", error: "", unit: "days", better: "down" },
             decision_d1: { id: "decision_d1", label: "Paid social", kind: "decision", columns: [], rows: [], sql: "", status: "final",
                            facts: { decision_id: "7b3f" }, receipts: [], caveats: [], note: "", error: "", unit: "", better: "none" } },
  blocks: [
    { id: "lead", type: "lead", text: "The week's one clear move is delivery: {6.82 days|delivery}." },
    { id: "why", type: "quiet", text: "Express transit holds the rise, at {6.82 days|delivery}." },
    { id: "dec", type: "decision", text: "Set an alert on express transit." },
    { id: "said", type: "quiet", text: "The pause sits beside the week, not because of it." },
    { id: "calm", type: "quiet", text: "Orders held inside their usual range." },
  ],
  stages: [{ id: "demand", name: "Demand", order: 0, figures: ["orders"] }, { id: "deliver", name: "Fulfilment", order: 1, figures: ["delivery"] }],
  storylines: stories, rest: ["calm"],
  guide: { version: 8, state: "published" }, model_steps: 7, queries: 4, generated_at: "2026-11-12T12:14:00Z", currency_code: "EUR",
});

beforeEach(() => {
  Object.values(api).forEach(f => f.mockReset());
  record.declareDecision.mockReset();
  api.getGroups.mockResolvedValue({ ladder: [], builtin_groups: [], groups: [
    { id: "supply-chain", name: "Supply chain", kind: "function", description: "", channel_trigger_id: "" },
    { id: "finance", name: "Finance", kind: "function", description: "", channel_trigger_id: "" }] });
  api.readBriefingGuide.mockResolvedValue({ available: true, guide: { checks: [] }, versions: [] });
  api.putMyPreference.mockResolvedValue(undefined);
  api.measureRange.mockResolvedValue({ period: { ...WRITTEN([]).period, measured: [], unmeasured: [] }, from_briefing: true });
  api.getBriefingDesk.mockResolvedValue({ as_of: "2026-11-12T13:00:00Z", trends: { items: [], more: 0 }, gaps: { items: [], more: 0 },
                                          decide: { items: [], more: 0 }, unread: {} });
});

const open = async (stories = [story({}), PAUSE]) => {
  api.readBriefingEdition.mockResolvedValue(WRITTEN(stories));
  render(<BriefingEdition connectionId="c" schema="lux" />);
  await screen.findByTestId("storylines");
};

describe("the Briefing as a running account", () => {
  it("opens on the edition's lead, then what its storylines amount to", async () => {
    await open();
    expect(screen.getByText(/The week's one clear move is delivery/)).toBeTruthy();
    expect(screen.getByTestId("tally-owned").textContent).toBe("1");          // the Record's decision has its owner
    expect(screen.getByTestId("tally-decided").textContent).toBe("1");
    expect(screen.getByTestId("tally-waiting").textContent).toBe("1");
    expect(screen.queryByTestId("edition-heading")).toBeNull();               // no "The edition" under a front: the account IS the page
  });

  it("lays every measured figure on its part of the business, a move marked and a figure inside left plain", async () => {
    await open();
    const stages = screen.getAllByTestId("business-stage");
    expect(stages.map(s => s.textContent!.slice(0, 12))).toEqual(["Demandall in", "Fulfilment1 "]);
    expect(within(stages[1]).getByText("usual 6.41–6.67")).toBeTruthy();
    expect(stages[1].querySelector("[data-called]")!.getAttribute("data-called")).toBe("yes");
  });

  it("says a storyline's owner, worth and next step on its row, and draws the edition's own blocks inside it", async () => {
    await open();
    const [delivery, pause] = screen.getAllByTestId("storyline");
    expect(within(delivery).getByTestId("storyline-owner").textContent).toBe("No owner");
    expect(within(delivery).getByTestId("storyline-step").textContent).toBe("Give it to a team");
    expect(within(pause).getByTestId("storyline-owner").textContent).toBe("Sidha Sadhak");
    // the first storyline is open: the four things, its chart, its blocks, its trail
    const four = within(delivery).getByTestId("storyline-four");
    expect(four.textContent).toContain("Proposed by this edition · not taken");
    expect(four.textContent).toContain("Nothing to check");
    expect(within(delivery).getByText(/Express transit holds the rise/)).toBeTruthy();
    expect(within(delivery).getByTestId("storyline-trail").textContent).toContain("Nobody owns Order-to-delivery days.");
    // a block no storyline holds is still on the page, under them
    expect(screen.getByText("Also in this edition")).toBeTruthy();
    expect(screen.getByText("Orders held inside their usual range.")).toBeTruthy();
    // every block is drawn exactly once
    expect(screen.getAllByText(/Express transit holds the rise/)).toHaveLength(1);
  });

  it("says when a decision has nothing to score, and opens it in the Record", async () => {
    await open();
    fireEvent.click(within(screen.getAllByTestId("storyline")[1]).getByTestId("storyline-row"));
    const pause = screen.getAllByTestId("storyline")[1];
    expect(within(pause).getByTestId("storyline-check").textContent).toContain("nothing to score");
    fireEvent.click(within(pause).getByText("Open the decision"));
    expect(nav.requestTab).toHaveBeenCalledWith("decisions", { id: "7b3f" });
  });

  it("gives a storyline to a team through the metric's own owner, then reads again", async () => {
    await open();
    api.setMetricOwner.mockResolvedValue({});
    api.readBriefingEdition.mockResolvedValue(WRITTEN([story({ owner: "Supply chain", owner_from: "metric", waits: true }), PAUSE]));
    const delivery = screen.getAllByTestId("storyline")[0];
    fireEvent.click(within(delivery).getByTestId("storyline-step"));
    fireEvent.click(within(delivery).getAllByTestId("storyline-give").find(b => b.textContent === "Supply chain")!);
    await waitFor(() => expect(api.setMetricOwner).toHaveBeenCalledWith("order_to_delivery_days", "c", "Supply chain", "lux"));
    await waitFor(() => expect(within(screen.getAllByTestId("storyline")[0]).getByTestId("storyline-owner").textContent).toBe("Supply chain"));
    expect(within(screen.getAllByTestId("storyline")[0]).getByTestId("storyline-step").textContent).toBe("Decide it");
  });

  it("takes a decision with what the figure is expected to read, booked before the fact", async () => {
    await open([story({ owner: "Supply chain", owner_from: "metric" }), PAUSE]);
    record.declareDecision.mockResolvedValue({});
    fireEvent.click(within(screen.getAllByTestId("storyline")[0]).getByTestId("storyline-step"));
    const form = await screen.findByTestId("decide-dialog");
    // it opens on the edition's own proposal, the storyline's owner and "back inside its usual range"
    expect((within(form).getByTestId("decide-text") as HTMLTextAreaElement).value).toBe("Set an alert on express transit.");
    fireEvent.click(within(form).getByTestId("decide-save"));
    await waitFor(() => expect(record.declareDecision).toHaveBeenCalledTimes(1));
    expect(record.declareDecision.mock.calls[0][0]).toMatchObject({
      chosen: "Set an alert on express transit.", owner: "Supply chain", objective: "order_to_delivery_days", connection_id: "c",
      schema_name: "lux", expectation: { metric: "order_to_delivery_days", direction: "down", low: 6.41, high: 6.67 },
      figure: { metric: "order_to_delivery_days", start: "2026-11-02", end: "2026-11-09" },
    });
    await waitFor(() => expect(api.readBriefingEdition).toHaveBeenCalledTimes(2));     // the storylines are read again
  });

  it("keeps the measured table one click away, and the desk under the storylines", async () => {
    await open();
    expect(screen.queryByTestId("brief-lead")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Measured table" }));
    expect(await screen.findByTestId("brief-lead")).toBeTruthy();
    expect(screen.queryByTestId("business-line")).toBeNull();
    expect(screen.getByTestId("brief-trends")).toBeTruthy();
    expect(screen.getByTestId("brief-waiting")).toBeTruthy();
    expect(api.measureRange).toHaveBeenCalledTimes(1);                         // drawn in three places, read once
  });

  it("says there is no storyline when every figure held and no decision is cited", async () => {
    api.readBriefingEdition.mockResolvedValue(WRITTEN([]));
    render(<BriefingEdition connectionId="c" schema="lux" />);
    expect((await screen.findByTestId("storylines-none")).textContent).toContain("no storyline to carry");
    expect(screen.getByTestId("tally-owned").textContent).toBe("0");
  });
});
