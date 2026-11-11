// @vitest-environment jsdom
/**
 * Writing and editing a mission happen in a dialog over the page (the user, 2026-11-07: "a pop-up overlay where I
 * enter the details — at the moment everything is adjusted on the same plane"), opened only by its button. The
 * dialog says what the form is and where it writes; the form does not say it a second time.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Connection } from "@/lib/api";
import type { MissionDetail } from "@/lib/record";
import { fireEvent, render, screen, waitFor, within } from "@/lib/testing";

const rec = vi.hoisted(() => ({
  listMissions: vi.fn(), getMissionTemplates: vi.fn(), getMission: vi.fn(), getMissionReport: vi.fn(),
}));
vi.mock("@/lib/record", async original => ({ ...(await original<typeof import("@/lib/record")>()), ...rec }));

const { MissionsPanel } = await import("@/components/missions/MissionsPanel");

const CONNECTIONS = [{ id: "shop", name: "The shop" }] as unknown as Connection[];
const noop = () => undefined;
const MISSION = {
  id: "m1", key: "mission:grow", version: 2, name: "Grow GMV", state: "proposed", runs: false,
  objective: { metric: "gmv", direction: "up", target: null, unit: "", by_when: "", text: "" },
  constraints: [], scope: { domain: "", segment: "", connections: ["shop"] }, owner: "",
  budget: { interruptions_per_week: 3, spend_per_month: null, spend_unit: "", authority_ceiling: {} }, watches: [],
  review: { cadence: "monthly", next_report_on: "", last_report: "", reports: [] }, written_by: "user:ana",
  opened_at: "", history: [], recorded_at: "", superseded_by: "", interruptions_this_week: 0,
  requested_version: 2, reports: [],
} as unknown as MissionDetail;

const panel = (openId: string | null = null) => render(
  <MissionsPanel connections={CONNECTIONS} selectedConn="shop" openId={openId} onOpen={noop} onOpenInquiry={noop}
    onOpenDecision={noop} onOpenClaim={noop} onOpenMonitors={noop} />,
);

beforeEach(() => {
  for (const f of Object.values(rec)) f.mockReset();
  rec.listMissions.mockResolvedValue([]);
  rec.getMissionTemplates.mockResolvedValue({ templates: [] });
  rec.getMission.mockResolvedValue(MISSION);
  rec.getMissionReport.mockResolvedValue({ report: null, note: "No report yet." });
});

describe("writing a mission", () => {
  it("Write a mission opens a dialog holding the form, saying where it writes once; Cancel closes it", async () => {
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Write a mission" }));
    const dialog = await screen.findByRole("dialog", { name: "Write a mission" });
    expect(within(dialog).getByTestId("mission-form")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("On The shop");
    // the dialog's title is the form's only heading — "Write a mission" is not said twice
    expect(within(dialog).getAllByText("Write a mission")).toHaveLength(1);
    expect(screen.getByTestId("mission-list")).not.toContainElement(within(dialog).getByTestId("mission-form"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Edit opens the same form in a dialog over the mission, with the version it writes; Cancel closes it", async () => {
    panel("m1");
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit this mission" });
    expect(within(dialog).getByTestId("mission-form")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Version 2 — saving writes version 3 and keeps this one");
    expect(within(dialog).getByRole("button", { name: "Save as a new version" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
