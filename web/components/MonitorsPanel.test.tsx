// @vitest-environment jsdom
/**
 * Monitors, redone to CLARITY.md: four figures (how many, open alerts, proven to fire, checks a day), then what needs
 * a person with its buttons on the row, then the monitors one line each with their detail behind Details — and the
 * Alerts view saying an alert that repeats once, with its count.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Metric, MonitorAlert, MonitorDef, MonitorProof } from "@/lib/api";
import { dayMonth } from "@/lib/monitorSummary";
import { optionsOf } from "@/lib/testing";

const monitor = (over: Partial<MonitorDef>): MonitorDef => ({
  id: "m1", conn_id: "c1", name: "Average Order Value", metric_name: null,
  custom_sql: "SELECT SAFE_DIVIDE(SUM(sale_price), COUNT(DISTINCT order_id)) FROM order_items", reanchor_window: false,
  check_cron: "0 * * * *", alert_on: "threshold_cross", warning_threshold: 86, critical_threshold: null, threshold_direction: "below",
  sigma_threshold: 2.5, history_days: 30, dimension_column: null, freshness_table: null, freshness_column: null,
  freshness_sla_hours: 24, drift_p_threshold: null, grace_period_hours: 4, notification_channel: "in_app", enabled: true,
  created_at: "2026-09-30T20:34:13Z", updated_at: "2026-09-30T20:34:13Z", ...over,
});
const MONITORS = [
  monitor({}),
  monitor({ id: "m2", name: "Units Sold anomaly watch", alert_on: "anomaly", check_cron: "0 9 * * *", sigma_threshold: 3 }),
];
const alert = (over: Partial<MonitorAlert>): MonitorAlert => ({
  id: "a1", monitor_id: "m1", monitor_name: "Average Order Value", conn_id: "c1", metric_name: null,
  triggered_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), alert_on: "threshold_cross", severity: "warning",
  current_value: 81.2, previous_value: 88.4, threshold: 86, message: "Average Order Value: 81.2 below warning threshold 86",
  caveat: null, acknowledged: false, acknowledged_at: null, ...over,
});
const ALERTS = [alert({ id: "a1" }), alert({ id: "a2" }), alert({ id: "a3" })];
const PROOFS: Record<string, MonitorProof> = {
  m1: { monitor_id: "m1", sentence: "never proven — no drill, no delivered alert", last_drill: null },
  m2: { monitor_id: "m2", sentence: "the rule fired in a drill on 2026-09-23T12:16:05+00:00; delivery not attempted",
    last_drill: { monitor_id: "m2", at: "2026-09-23T12:16:05+00:00", fired: true, delivered: null, detail: "", channel: "in_app" } },
};

const api = vi.hoisted(() => ({
  getMonitors: vi.fn(),
  getAllAlerts: vi.fn(),
  getMetrics: vi.fn(async (_conn?: string) => [] as Metric[]),
  getActionTriggers: vi.fn(async () => [] as { id: string; name: string; type: string; enabled: boolean }[]),
  getMonitorProof: vi.fn(),
  getQueryHistory: vi.fn(async () => []),
  acknowledgeAlert: vi.fn(async (id: string) => ({ id, acknowledged: true })),
  drillMonitor: vi.fn(async (id: string) => ({ monitor_id: id, at: "", fired: true, delivered: null, detail: "", channel: "in_app" })),
}));
vi.mock("@/lib/api", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));

import { MonitorsPanel } from "./MonitorsPanel";
import { InspectorHost, InspectorProvider } from "@/components/shell/Inspector";
import { clearMetricCache } from "@/components/metrics/MetricField";

afterEach(() => { vi.clearAllMocks(); });

function serve(alerts: MonitorAlert[] = ALERTS) {
  api.getMonitors.mockResolvedValue(MONITORS);
  api.getAllAlerts.mockResolvedValue(alerts);
  api.getMonitorProof.mockImplementation(async (id: string) => PROOFS[id]);
}
const panel = () => render(<Theme><InspectorProvider pageKey="monitors">
  <MonitorsPanel connId="c1" workspaceId="w1" /><InspectorHost />
</InspectorProvider></Theme>);

/** Open a monitor in the inspector (a click on its row) on one of its tabs — what its Details fold held until
 *  2026-11-10 (the Evidence → Action study's register and inspector). */
const inspect = async (row: HTMLElement, tab: string) => {
  fireEvent.click(row);
  const panel = await screen.findByRole("complementary");
  const t = within(panel).getByRole("tab", { name: tab });
  fireEvent.mouseDown(t);
  fireEvent.click(t);
  return panel;
};

describe("MonitorsPanel", () => {
  it("leads with four figures read from the monitors, their alerts and their proofs", async () => {
    serve();
    panel();
    await waitFor(() => expect(screen.getByTestId("fig-proven")).toHaveTextContent("1 of 2"));
    expect(screen.getByTestId("monitor-figures").children).toHaveLength(4);
    expect(screen.getByTestId("fig-monitors")).toHaveTextContent("2all on");
    expect(screen.getByTestId("fig-open")).toHaveTextContent("3");
    expect(screen.getByTestId("fig-proven")).toHaveTextContent("none delivered end to end");
    // one hourly (24) and one daily (1)
    expect(screen.getByTestId("fig-checks")).toHaveTextContent("25");
    expect(screen.getByTestId("fig-checks")).toHaveTextContent("1 hourly · 1 daily");
    // the scope the shell gave is the scope read
    expect(api.getMonitors).toHaveBeenCalledWith("c1", "w1");
  });

  it("puts open alerts and a monitor never proven under Needs you, with their buttons on the row", async () => {
    serve();
    panel();
    const open = await screen.findByTestId("needs-open");
    expect(open).toHaveTextContent("Average Order Value · 3 open alerts");
    fireEvent.click(within(open).getByRole("button", { name: "Acknowledge all" }));
    await waitFor(() => expect(api.acknowledgeAlert).toHaveBeenCalledTimes(3));

    const never = await screen.findByTestId("needs-never");
    expect(never).toHaveTextContent("1 monitor has never been proven to fire");
    fireEvent.click(within(never).getByRole("button", { name: "Check its rule" }));
    // a check proves the rule and sends nothing
    await waitFor(() => expect(api.drillMonitor).toHaveBeenCalledWith("m1", false));
  });

  it("draws each monitor as a row of the register — rule, schedule, proof, sends to — its detail in the inspector", async () => {
    serve();
    panel();
    await waitFor(() => expect(screen.getAllByTestId("monitor-row")).toHaveLength(2));
    const heads = screen.getAllByRole("columnheader").map(h => h.textContent);
    expect(heads.slice(0, 8)).toEqual(["On", "Monitor", "Rule", "Schedule", "Proof", "Last alert", "Sends to", ""]);
    const [aov, units] = screen.getAllByTestId("monitor-row");
    for (const said of ["Threshold · below 86", "hourly", "in-app", "watches its own query"]) expect(aov).toHaveTextContent(said);
    expect(within(aov).getByText("never proven")).toHaveAttribute("title", "never proven — no drill, no delivered alert");
    expect(within(aov).getByText("3 open")).toBeInTheDocument();
    expect(within(units).getByText("rule checked 23 Sep · not delivered")).toBeInTheDocument();
    // Edit, Delete and the three proofs live in the inspector's Actions; the query in its Definition
    expect(within(aov).queryByRole("button", { name: "Delete" })).toBeNull();
    const actions = await inspect(aov, "Actions");
    for (const name of ["Backtest", "Check rule", "Send test alert", "Edit", "Delete"]) {
      expect(within(actions).getByRole("button", { name })).toBeInTheDocument();
    }
    const def = await inspect(aov, "Definition");
    expect(within(def).getByTestId("monitor-sql")).toHaveTextContent("SAFE_DIVIDE(SUM(sale_price)");
    // its alerts as a log, each severity beside what it affects
    const log = await inspect(aov, "Activity");
    expect(within(log).getByTestId("monitor-alert-log")).toHaveTextContent("affects");
  });

  it("says an alert that repeats once, with its count, on the Alerts view", async () => {
    serve([...ALERTS, alert({ id: "old", acknowledged: true, monitor_id: "gone", monitor_name: "Active Customer Count",
      message: "Active Customer Count: 2.026e+04 above warning threshold 2e+04", triggered_at: "2026-08-24T06:00:00Z" })]);
    panel();
    fireEvent.click(within(await screen.findByTestId("needs-open")).getByRole("button", { name: "See alerts" }));
    const rows = await screen.findAllByTestId("alert-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("×3");
    expect(within(rows[0]).getByRole("button", { name: "Acknowledge 3" })).toBeInTheDocument();
    // humanised, and settled — and its monitor, gone, is said to be
    expect(rows[1]).toHaveTextContent("20,260 above warning threshold 20,000");
    expect(rows[1]).toHaveTextContent("acknowledged");
    expect(rows[1]).toHaveTextContent("since removed");
    expect(rows[0]).not.toHaveTextContent("since removed");
  });

  it("reads an alert a recovery closed as closed, and draws the recovery as one row with its own chip (TC-4)", async () => {
    const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    serve([
      alert({ id: "r1", alert_on: "recovered", severity: "info", triggered_at: at(1), closes: "b1", current_value: 90.1,
        previous_value: 81.2, message: "Average Order Value: back within its limit — read 90.1 (warning below 86). "
          + "Closes the warning alert of 2026-10-24 09:00 UTC, which read 81.2." }),
      alert({ id: "b1", triggered_at: at(50), closed_by: "r1", closed_at: at(1) }),
      alert({ id: "b2", triggered_at: at(80), acknowledged: true, current_value: 79,
        message: "Average Order Value: 79 below warning threshold 86" }),
    ]);
    panel();
    // nothing is open: the alert is closed by its recovery, and the recovery waits on nobody
    await waitFor(() => expect(screen.getByTestId("fig-open")).toHaveTextContent("0"));
    // "last" is the last alert that fired, two days back — not the recovery an hour ago
    expect(screen.getByTestId("fig-open")).toHaveTextContent(`1 acknowledged · 1 closed by a recovery · last ${dayMonth(at(50))}`);
    expect(screen.queryByTestId("needs-open")).toBeNull();
    // the recovery is no alert that fired: the twelve weeks count the two that did
    expect(screen.getByTestId("monitor-alert-weeks")).toHaveTextContent("2 alerts");
    expect(within(screen.getAllByTestId("monitor-row")[0]).queryByText(/open/)).toBeNull();
    expect(screen.getAllByTestId("monitor-row")[0]).toHaveTextContent("2d ago");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Alerts/ }));     // a Radix tab turns on the press, not the click
    const rows = await screen.findAllByTestId("alert-row");
    expect(rows).toHaveLength(3);
    const rec = rows.find(r => r.textContent?.includes("back within its limit"))!;
    expect(within(rec).getByText("recovered")).toBeInTheDocument();
    expect(within(rec).queryByRole("button")).toBeNull();
    expect(rec).not.toHaveTextContent("was 81.2");
    const closed = rows.find(r => r.textContent?.includes("81.2 below warning threshold"))!;
    expect(within(closed).getByText("closed")).toHaveAttribute("title", expect.stringMatching(/^Closed by a recovery/));
    expect(within(closed).queryByRole("button", { name: /Acknowledge/ })).toBeNull();
    expect(rows.find(r => r.textContent?.includes("79 below warning threshold"))).toHaveTextContent("acknowledged");
    expect(screen.getByTestId("alert-list")).toHaveTextContent("3 · 0 open");
  });

  it("keeps a run log of the connection's checks — when, how it ended, rows, time — said as statements, not monitors", async () => {
    serve();
    api.getQueryHistory.mockResolvedValue([
      { id: "a1", ts: "2026-11-10T09:00:04Z", connection_id: "c1", hypothesis_id: "__monitor__", sql_digest: "", sql_full: "SELECT 1 AS value",
        verdict: "safe", row_count: 1, duration_ms: 412.4, error: null },
      { id: "a2", ts: "2026-11-10T08:00:03Z", connection_id: "c1", hypothesis_id: "__monitor__", sql_digest: "", sql_full: "SELECT bad",
        verdict: "safe", row_count: null, duration_ms: 90, error: "column not found" },
    ] as never);
    panel();
    const log = await screen.findByTestId("monitor-run-log");
    await waitFor(() => expect(within(log).getAllByTestId("run-log-row")).toHaveLength(2));
    expect(log).toHaveTextContent("the latest 2 checks · 1 failed · the log names the statement, not the monitor");
    expect(within(log).getAllByTestId("run-log-row")[1]).toHaveTextContent("failed");
    expect(api.getQueryHistory).toHaveBeenCalledWith("c1", 40, "__monitor__");
  });

  it("says nothing needs the reader, in one line, when nothing does", async () => {
    serve([]);
    api.getMonitorProof.mockImplementation(async (id: string) => PROOFS.m2 && { ...PROOFS.m2, monitor_id: id });
    panel();
    await waitFor(() => expect(screen.getByTestId("monitor-needs"))
      .toHaveTextContent("Nothing needs you · no open alert, and every monitor has been seen to fire"));
    expect(screen.getByTestId("fig-open")).toHaveTextContent("none has fired here yet");
    // nothing to picture: the figure already says it
    expect(screen.queryByTestId("monitor-alert-weeks")).toBeNull();
  });

  it("says alerts of monitors since removed apart, never as the workspace's own (the Olist workspace, 2026-10-23)", async () => {
    const gone = (id: string, monitor_id: string, monitor_name: string, at: string) =>
      alert({ id, monitor_id, monitor_name, acknowledged: true, triggered_at: at, message: `${monitor_name}: 1 below warning threshold 2` });
    api.getMonitors.mockResolvedValue([monitor({ id: "gmv", name: "Monthly GMV floor" })]);
    api.getAllAlerts.mockResolvedValue([
      gone("o1", "acc", "Active Customer Count", new Date(Date.now() - 9 * 86_400_000).toISOString()),
      gone("o2", "acc", "Active Customer Count", new Date(Date.now() - 10 * 86_400_000).toISOString()),
      gone("o3", "demo", "WP-1b caveat demo", new Date(Date.now() - 200 * 86_400_000).toISOString()),
    ]);
    api.getMonitorProof.mockResolvedValue(PROOFS.m1);
    panel();
    await waitFor(() => expect(screen.getByTestId("fig-open")).toHaveTextContent("all from 2 monitors since removed"));
    expect(screen.getByTestId("fig-open")).toHaveTextContent("3 acknowledged");
    // the twelve weeks hold two of them, both from the one removed monitor
    expect(screen.getByTestId("monitor-alert-weeks")).toHaveTextContent("2 alerts · all from 1 monitor since removed");
  });

  it("offers the destinations that exist, and says a stored \"slack\" sends nowhere (ROADMAP §3.26)", async () => {
    api.getMonitors.mockResolvedValue([monitor({ notification_channel: "slack" })]);
    api.getAllAlerts.mockResolvedValue([]);
    api.getMonitorProof.mockResolvedValue(PROOFS.m1);
    api.getActionTriggers.mockResolvedValue([{ id: "trg-1", name: "Ops webhook", type: "webhook", enabled: true }]);
    panel();
    await waitFor(() => expect(screen.getByTestId("monitor-row")).toHaveTextContent('sends nowhere: no destination "slack"'));
    fireEvent.click(within(await inspect(screen.getByTestId("monitor-row"), "Actions")).getByRole("button", { name: "Edit" }));
    // Editing is the same form, in a dialog over the page.
    const dialog = await screen.findByRole("dialog", { name: "Edit monitor" });
    const offered = optionsOf(within(dialog).getByRole("combobox", { name: "Notification" })).map(o => o.text);
    expect(offered).toEqual(expect.arrayContaining(["In-app", "Ops webhook (webhook)", '"slack" — no such destination']));
    expect(offered).not.toContain("Slack");
    expect(offered).not.toContain("Email");
    expect(screen.getByText(/names no destination, so these alerts are sent nowhere/)).toBeInTheDocument();
  });

  it("writes a new monitor in a dialog over the page, titled once; Cancel puts the page back as it was", async () => {
    // The user, 2026-11-07: "a pop-up overlay where I enter the details". The form was a "Configure" tab that
    // replaced the page under it.
    serve();
    panel();
    await screen.findByTestId("monitors-overview");
    fireEvent.click(screen.getByRole("button", { name: "New monitor" }));
    const dialog = await screen.findByRole("dialog", { name: "New monitor" });
    expect(within(dialog).getByTestId("monitor-form")).toBeInTheDocument();
    expect(within(dialog).getAllByText("New monitor")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Create monitor" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Configure" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("monitors-overview")).toBeInTheDocument();
  });

  it("opens the same dialog from Create first monitor, when there is none", async () => {
    api.getMonitors.mockResolvedValue([]);
    api.getAllAlerts.mockResolvedValue([]);
    panel();
    fireEvent.click(await screen.findByRole("button", { name: "Create first monitor" }));
    const dialog = await screen.findByRole("dialog", { name: "New monitor" });
    expect(within(dialog).getByTestId("monitor-form")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("the monitor's metric", () => {
  // Measured 2026-11-08: the picker read every connection's metrics, so the five names LuxExperience and theLook both
  // define were offered twice — and a metric another connection owns, which a monitor here can never read: the
  // runner resolves the name in the monitor's own connection (`monitors/runner._metric_of`).
  const m = (name: string, label: string, status: string, connection: string) =>
    ({ name, label, status, connection, unit: "ratio" }) as unknown as Metric;
  const C1 = [m("return_rate", "Return rate", "deprecated", "c1"), m("item_return_rate", "Item Return Rate", "approved", "c1"),
              m("clv_90d", "Customer value, 90 days", "proposed", "c1"), m("aov", "Average order value", "approved", "c1")];
  const EVERY = [...C1, m("item_return_rate", "Item Return Rate", "approved", "c2"), m("gmv", "GMV", "approved", "c2")];
  const metricOptions = (dialog: HTMLElement) => {
    const select = within(dialog).getAllByRole("combobox").find(c => optionsOf(c).some(o => o.text === "Select a metric…"))!;
    return { select, texts: optionsOf(select).map(o => o.text) };
  };
  beforeEach(() => {
    clearMetricCache();
    api.getMetrics.mockImplementation(async (conn?: string) => (conn === "c1" ? C1 : conn ? [] : EVERY));
  });

  it("offers the monitor's own connection's metrics, each once, approved first — never a retired one", async () => {
    serve();
    panel();
    await screen.findByTestId("monitors-overview");
    fireEvent.click(screen.getByRole("button", { name: "New monitor" }));
    const dialog = await screen.findByRole("dialog", { name: "New monitor" });
    // Wait on the scoped read, never on the list: reading the list opens it, and a wait re-reads it every tick.
    await waitFor(() => expect(api.getMetrics).toHaveBeenCalledWith("c1"));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });        // the read lands
    expect(metricOptions(dialog).texts).toEqual(
      ["Select a metric…", "Average order value", "Item Return Rate", "Customer value, 90 days — waiting for review"]);
  });

  it("keeps an existing monitor's retired metric selected, and says it is retired", async () => {
    api.getMonitors.mockResolvedValue([monitor({ metric_name: "return_rate", custom_sql: null })]);
    api.getAllAlerts.mockResolvedValue([]);
    api.getMonitorProof.mockResolvedValue(PROOFS.m1);
    panel();
    await waitFor(() => expect(screen.getByTestId("monitor-row")).toBeInTheDocument());
    fireEvent.click(within(await inspect(screen.getByTestId("monitor-row"), "Actions")).getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit monitor" });
    // the closed control shows the monitor's metric, as it is stored, and why it is no longer offered
    await waitFor(() => expect(within(dialog).getAllByRole("combobox").map(c => c.textContent))
      .toContain("Return rate — retired in the Semantic Layer"));
    expect(metricOptions(dialog).texts.filter(t => t.startsWith("Return rate"))).toEqual(["Return rate — retired in the Semantic Layer"]);
  });
});
