// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BriefFront, leadOf, rankedBy } from "./BriefFront";
import type { BriefingRangeMeasure } from "@/lib/api";

const api = vi.hoisted(() => ({ measureRange: vi.fn(), getBriefingDesk: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), ...api }));

const m = (metric: string, current: number | null, rel: number | null, status: BriefingRangeMeasure["status"] = "final") => ({
  name: metric[0].toUpperCase() + metric.slice(1), metric, unit: "", time_kind: "flow", confirmed: true, current, previous: 100,
  last_year: null, rel, rel_last_year: null, status, current_text: current == null ? undefined : `${current}`, previous_text: "100",
}) as BriefingRangeMeasure;

const PERIOD = {
  covers: "the week of 2–8 Nov", compared_with: "the week before", period: "week",
  start: "2026-11-02", end: "2026-11-09", previous_start: "2026-10-26", previous_end: "2026-11-02", unmeasured: [{ name: "Margin", reason: "it has no formula" }],
  measured: [m("orders", 120, 0.2), m("revenue", 900, -0.05, "provisional"), m("returns", 30, -0.4), m("aov", 70, null)],
};
const DESK = {
  connection_id: "thelook", schema: "thelook", as_of: "2026-11-09T21:33:15Z", unread: { record: "the Record could not be opened" },
  trends: { items: [{ kind: "answer", title: "Revenue fell 6.5% on 1 Nov", status: "Provisional", as_of: "2026-11-09",
                      source: { kind: "claim", ref: "f2b1", label: "Deep analysis" } }], more: 6 },
  gaps: { items: [{ kind: "disagree", title: "What was revenue in 2025?", text: "3 runs gave 3 answers.",
                    action: { verb: "Settle it", kind: "inquiry", ref: "a00a" }, source: { kind: "inquiry", ref: "a00a", label: "Inquiry" } }], more: 2 },
  decide: { items: [], more: 0 },
};

beforeEach(() => {
  api.measureRange.mockResolvedValue({ period: PERIOD, from_briefing: true, measured_at: "2026-11-09T19:40:24Z", scope_key: "k" });
  api.getBriefingDesk.mockResolvedValue(DESK);
});

describe("the Briefing's front: a lead figure, then the evidence ranked", () => {
  it("leads with the guide's first metric, and ranks the rest by the size of their change, the uncompared last", () => {
    const lead = leadOf(PERIOD.measured, "revenue");
    expect(lead?.metric).toBe("revenue");
    expect(leadOf(PERIOD.measured)?.metric).toBe("orders");                         // no guide: the first measured
    expect(rankedBy(PERIOD.measured, lead).map(x => x.metric)).toEqual(["returns", "orders", "aov"]);
  });

  it("draws the lead with its change and its freshness, the ranked table, what was recorded and what waits", async () => {
    render(<BriefFront connectionId="thelook" schema="thelook" range={{ preset: "last_week" }} leadMetric="revenue" />);
    expect(await screen.findByTestId("brief-lead-value")).toHaveTextContent("900");
    const lead = screen.getByTestId("brief-lead");
    expect(lead).toHaveTextContent("-5.0% against 26 Oct – 1 Nov (100)");
    expect(lead).toHaveTextContent("Provisional");
    expect(lead).toHaveTextContent("Cached · as the Briefing measured it, Mon 9 Nov at 19:40 UTC");
    expect(screen.getAllByTestId("brief-ranked-row").map(r => r.textContent?.split(/\d/)[0])).toEqual(["Returns", "Orders", "Aov"]);
    expect(screen.getByTestId("brief-unmeasured-row")).toHaveTextContent("not measured — it has no formula");
    await waitFor(() => expect(screen.getByTestId("brief-trends")).toHaveTextContent("Revenue fell 6.5% on 1 Nov"));
    expect(screen.getByTestId("brief-trends")).toHaveTextContent("6 more on the desk");
    const waiting = screen.getByTestId("brief-waiting");
    expect(within(waiting).getByText("Dispute")).toBeTruthy();
    expect(within(waiting).getByRole("button", { name: "Settle it" })).toBeTruthy();
    expect(screen.getByTestId("brief-unread")).toHaveTextContent("Not read: record — the Record could not be opened");
    // in short: counted, never written — 1 shown + 6 more recorded; 1 shown + 2 more waiting, one a dispute
    expect(screen.getByTestId("brief-short")).toHaveTextContent(
      "Revenue -5.0% against 26 Oct – 1 Nov. 7 answers and findings recorded in the last 30 days. 3 things wait on a person, 1 dispute among them. 2 other metrics moved 10% or more.");
  });

  it("says why there is no lead, and says a failed read in its place", async () => {
    api.measureRange.mockResolvedValue({ period: { ...PERIOD, measured: [], unmeasured: [] }, from_briefing: false, measured_at: null, scope_key: "k" });
    api.getBriefingDesk.mockRejectedValue(new Error("the desk is down"));
    render(<BriefFront connectionId="thelook" range={{ preset: "last_week" }} />);
    expect(await screen.findByText(/No approved metric is measured for the week of 2–8 Nov/)).toBeTruthy();
    expect(await screen.findByText(/The desk could not be read — the desk is down/)).toBeTruthy();
  });
});
