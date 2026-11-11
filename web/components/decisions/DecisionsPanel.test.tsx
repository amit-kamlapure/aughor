// @vitest-environment jsdom
/**
 * Recording, revising and declaring happen in a dialog over the page (the user, 2026-11-07: "a pop-up overlay where
 * I enter the details — at the moment everything is adjusted on the same plane"), each opened only by its button.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Connection } from "@/lib/api";
import type { DecisionDetail } from "@/lib/record";
import { fireEvent, render, screen, waitFor, within } from "@/lib/testing";

const rec = vi.hoisted(() => ({
  listDecisions: vi.fn(), listDecisionKinds: vi.fn(), listMeetingCandidates: vi.fn(), getNorthStar: vi.fn(),
  getDecision: vi.fn(), listScenarios: vi.fn(), getCalibration: vi.fn(), getInquiryView: vi.fn(),
  amendDecision: vi.fn(), bookScenario: vi.fn(), getPastCases: vi.fn(), proposeMeetingCandidates: vi.fn(),
}));
vi.mock("@/lib/record", async original => ({ ...(await original<typeof import("@/lib/record")>()), ...rec }));

const { DecisionsPanel } = await import("@/components/decisions/DecisionsPanel");

const CONNECTIONS = [{ id: "shop", name: "The shop" }] as unknown as Connection[];
const noop = () => undefined;
const DECISION = {
  id: "d1", key: "k", version: 1, question: "Do we extend the promotion?", owner: "", approvers: [],
  options: [{ id: "extend", description: "Extend it" }], chosen: "extend", dissent: [], relied_on: [], objective: "",
  decided_at: "2026-10-10T12:00:00Z", decided_by: "ana", review_on: "2026-12-10", expectation_claim: "", actions: [],
  outcome: "", reopened_by: "", source: { kind: "declared", ref: "d1", detail: "" }, connection_id: "shop", extra: {},
  recorded_at: "", superseded_by: "", relied_on_claims: [], expectation: null, outcome_record: null, reopened_by_claim: null,
} as unknown as DecisionDetail;

const panel = (openId: string | null = null) => render(
  <DecisionsPanel connections={CONNECTIONS} selectedConn="shop" openId={openId} onOpen={noop} onOpenClaim={noop} />,
);

beforeEach(() => {
  for (const f of Object.values(rec)) f.mockReset();
  rec.listDecisions.mockResolvedValue([]);
  rec.listDecisionKinds.mockResolvedValue({ kinds: [] });
  rec.listMeetingCandidates.mockResolvedValue({ candidates: [] });
  rec.getNorthStar.mockRejectedValue(new Error("not in this test"));
  rec.getDecision.mockResolvedValue(DECISION);
  rec.listScenarios.mockResolvedValue({ scenarios: [], predictions: [] });
  rec.getCalibration.mockResolvedValue([]);
  rec.getInquiryView.mockRejectedValue(new Error("not in this test"));
  rec.getPastCases.mockRejectedValue(new Error("not in this test"));
});

describe("forms in a dialog", () => {
  it("Record a decision opens a dialog holding the form, said once; Cancel closes it", async () => {
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Record a decision" }));
    const dialog = await screen.findByRole("dialog", { name: "Record a decision" });
    expect(within(dialog).getByTestId("declare-form")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Record a decision")).toHaveLength(1);
    expect(screen.getByTestId("decision-list")).not.toContainElement(within(dialog).getByTestId("declare-form"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Declare a kind opens a dialog holding the kind's form; Cancel closes it", async () => {
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Declare a kind" }));
    const dialog = await screen.findByRole("dialog", { name: "Declare a kind of decision" });
    expect(within(dialog).getByTestId("kind-form")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Declare it" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // the section's button still says what it does once the dialog is gone — it no longer turns into "Close"
    expect(screen.getByRole("button", { name: "Declare a kind" })).toBeInTheDocument();
  });

  it("Revise this decision opens the form in a dialog over the decision, its question filled in; Cancel closes it", async () => {
    panel("d1");
    fireEvent.click(await screen.findByRole("button", { name: "Revise this decision" }));
    const dialog = await screen.findByRole("dialog", { name: "Revise this decision" });
    expect(within(dialog).getByTestId("declare-form")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("What was being decided")).toHaveValue("Do we extend the promotion?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

// The user, 2026-11-07: an option, a dissent and a projection are added on a decision's page in a dialog over it, each
// opened only by its button — no form opens in place on the page.
describe("adding to a decision in a dialog", () => {
  const reader = (onOpen: (id: string | null) => void = noop) => render(
    <DecisionsPanel connections={CONNECTIONS} selectedConn="shop" openId="d1" onOpen={onOpen} onOpenClaim={noop} />,
  );
  /** Click a decision page's button and return the dialog it opens. */
  const openFrom = async (button: string, title: string) => {
    const b = await screen.findByRole("button", { name: button });
    expect(b).toHaveAttribute("aria-haspopup", "dialog");
    expect(b).not.toHaveAttribute("aria-expanded");
    fireEvent.click(b);
    return screen.findByRole("dialog", { name: title });
  };

  it("Add an option opens a dialog holding the option's field; Cancel leaves the options as they were", async () => {
    reader();
    const dialog = await openFrom("Add an option", "Add an option");
    expect(dialog).toHaveAttribute("data-testid", "decision-option-new");
    expect(within(dialog).getByLabelText("An option that was on the table")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add it" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rec.amendDecision).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("An option that was on the table")).toBeNull();
    expect(screen.getByText("Extend it")).toBeInTheDocument();
  });

  it("a refused option is said inside its dialog and goes with it; a saved one closes it and follows the decision",
    async () => {
      const onOpen = vi.fn();
      rec.amendDecision.mockRejectedValueOnce(new Error("the decision has been restated"))
        .mockResolvedValueOnce({ ...DECISION, id: "d2" });
      reader(onOpen);
      let dialog = await openFrom("Add an option", "Add an option");
      fireEvent.change(within(dialog).getByLabelText("An option that was on the table"), { target: { value: "End it" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
      expect(await within(dialog).findByRole("alert")).toHaveTextContent("the decision has been restated");
      fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      // Not moved to the page either (the page's own alert is the unmocked inquiry's read).
      expect(screen.queryByText("the decision has been restated")).toBeNull();
      dialog = await openFrom("Add an option", "Add an option");
      expect(within(dialog).queryByRole("alert")).toBeNull();
      fireEvent.change(within(dialog).getByLabelText("An option that was on the table"), { target: { value: "End it" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Add it" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(rec.amendDecision).toHaveBeenLastCalledWith("d1", { option: "End it" });
      expect(onOpen).toHaveBeenCalledWith("d2");
    });

  it("Record dissent opens a dialog holding who and why; Cancel closes it", async () => {
    reader();
    const dialog = await openFrom("Record dissent", "Record dissent");
    expect(dialog).toHaveAttribute("data-testid", "decision-dissent-new");
    expect(within(dialog).getByLabelText("Who disagreed")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Why")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Record it" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rec.amendDecision).not.toHaveBeenCalled();
    expect(screen.getByText("No dissent was recorded.")).toBeInTheDocument();
  });

  it("a refused dissent is said inside its dialog; a recorded one closes it and follows the decision", async () => {
    const onOpen = vi.fn();
    rec.amendDecision.mockRejectedValueOnce(new Error("name the person who disagreed"))
      .mockResolvedValueOnce({ ...DECISION, id: "d3" });
    reader(onOpen);
    const dialog = await openFrom("Record dissent", "Record dissent");
    fireEvent.change(within(dialog).getByLabelText("Who disagreed"), { target: { value: "ben" } });
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "too costly" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record it" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("name the person who disagreed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Record it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rec.amendDecision).toHaveBeenLastCalledWith("d1", { dissent: { who: "ben", why: "too costly" } });
    expect(onOpen).toHaveBeenCalledWith("d3");
  });

  it("Add a projection opens the projection's form in a dialog; Cancel closes it and the scenario reads as before",
    async () => {
      reader();
      expect(await screen.findByText(/^No scenario has been projected/)).toBeInTheDocument();
      const dialog = await openFrom("Add a projection", "Add a projection");
      expect(dialog).toHaveAttribute("data-testid", "projection-new");
      expect(within(dialog).getByLabelText("What it predicts")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Formula")).toBeInTheDocument();
      expect(within(dialog).getByLabelText("Inputs")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Book the projection" })).toBeDisabled();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(rec.bookScenario).not.toHaveBeenCalled();
      expect(screen.getByText(/^No scenario has been projected/)).toBeInTheDocument();
    });

  it("a refused projection is said inside its dialog; a booked one closes it and the scenario is read again", async () => {
    rec.bookScenario.mockRejectedValueOnce(new Error("credit is not an input")).mockResolvedValueOnce({});
    reader();
    const dialog = await openFrom("Add a projection", "Add a projection");
    fireEvent.change(within(dialog).getByLabelText("What it predicts"), { target: { value: "credit cost" } });
    fireEvent.change(within(dialog).getByLabelText("Formula"), { target: { value: "accounts * credit" } });
    fireEvent.change(within(dialog).getByLabelText("Inputs"), { target: { value: "accounts = 31" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Book the projection" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("credit is not an input");
    const scenarioReads = rec.listScenarios.mock.calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Book the projection" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rec.bookScenario).toHaveBeenLastCalledWith("d1",
      { method: "identity", metric: "credit cost", formula: "accounts * credit", inputs: { accounts: 31 }, unit: "" });
    await waitFor(() => expect(rec.listScenarios.mock.calls.length).toBeGreaterThan(scenarioReads));
  });
});

describe("a meeting's notes in a dialog", () => {
  const fill = (dialog: HTMLElement) => {
    fireEvent.change(within(dialog).getByLabelText("The meeting"), { target: { value: "Weekly trading" } });
    fireEvent.change(within(dialog).getByLabelText("Held on"), { target: { value: "2026-11-02" } });
    fireEvent.change(within(dialog).getByLabelText("Its notes"), { target: { value: "We agreed to stop the promotion." } });
  };

  it("Bring a meeting's notes opens a dialog holding the form; Cancel closes it", async () => {
    panel();
    const opener = await screen.findByRole("button", { name: "Bring a meeting's notes" });
    expect(opener).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByTestId("meeting-form")).toBeNull();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Bring a meeting's notes" });
    expect(within(dialog).getByTestId("meeting-form")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a refused read is said inside the dialog; a read one closes it and says what was proposed on the page", async () => {
    rec.proposeMeetingCandidates.mockRejectedValueOnce(new Error("no model is configured"));
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Bring a meeting's notes" }));
    const dialog = await screen.findByRole("dialog", { name: "Bring a meeting's notes" });
    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Find the decisions" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("no model is configured");
    expect(screen.queryByText(/proposed from/)).toBeNull();

    rec.proposeMeetingCandidates.mockResolvedValueOnce({ candidates: [{ id: "m1" }], cut: "", dropped: 0 });
    fireEvent.click(within(dialog).getByRole("button", { name: "Find the decisions" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("1 decision proposed from “Weekly trading”")).toBeInTheDocument();
    expect(rec.proposeMeetingCandidates).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Weekly trading", held_on: "2026-11-02" }));
  });
});
