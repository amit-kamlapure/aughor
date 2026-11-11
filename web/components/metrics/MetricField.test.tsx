// @vitest-environment jsdom
/**
 * The metric field (2026-11-07): it offers the connection's governed metrics as you type, stores a NAME, turns a
 * label typed by hand into its name when left, fills a unit box with the unit's word, and says what the server
 * will make of anything else.
 */
import { Theme } from "@radix-ui/themes";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Metric } from "@/lib/api";

const LUX = [
  { name: "repeat_purchase_rate", label: "Repeat Purchase Rate", status: "approved", unit: "ratio 0-1" },
  { name: "gmv", label: "GMV (EUR)", status: "approved", unit: "EUR" },
  { name: "marketing_roas", label: "Marketing ROAS", status: "deprecated", unit: "ratio" },
] as unknown as Metric[];

const getMetrics = vi.fn(async (_conn?: string) => LUX);
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMetrics: (conn?: string) => getMetrics(conn),
}));

import { clearMetricCache, MetricField, MetricListField } from "./MetricField";

function Harness({ initial = "", onUnit }: { initial?: string; onUnit?: (u: string) => void }) {
  const [v, setV] = useState(initial);
  return <Theme><MetricField id="f" connectionId="dcc63d83" value={v} onChange={setV} onUnit={onUnit}
    consequence="the mission cannot be measured until one is approved" />
    <output data-testid="stored">{v}</output></Theme>;
}

beforeEach(() => { clearMetricCache(); getMetrics.mockClear(); });

describe("MetricField", () => {
  it("offers the connection's governed metrics by name, never a retired one", async () => {
    const { container } = render(<Harness />);
    await waitFor(() => expect(container.querySelectorAll("datalist option").length).toBe(2));
    expect(getMetrics).toHaveBeenCalledWith("dcc63d83");
    const opts = [...container.querySelectorAll("datalist option")].map(o => [o.getAttribute("value"), o.getAttribute("label")]);
    expect(opts).toEqual([["gmv", "GMV (EUR) · EUR"], ["repeat_purchase_rate", "Repeat Purchase Rate · ratio"]]);
  });

  it("stores a picked name, fills the unit's word, and says it is approved", async () => {
    const onUnit = vi.fn();
    render(<Harness onUnit={onUnit} />);
    await waitFor(() => expect(getMetrics).toHaveBeenCalled());
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(document.querySelectorAll("datalist option").length).toBe(2));
    fireEvent.change(input, { target: { value: "repeat_purchase_rate" } });
    expect(screen.getByTestId("stored").textContent).toBe("repeat_purchase_rate");
    expect(onUnit).toHaveBeenCalledWith("ratio");
    expect(screen.getByTestId("metric-note").textContent).toBe("Repeat Purchase Rate · ratio · approved");
  });

  it("turns a label typed by hand into its name when the field is left", async () => {
    render(<Harness />);
    await waitFor(() => expect(document.querySelectorAll("datalist option").length).toBe(2));
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Repeat Purchase Rate" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("stored").textContent).toBe("repeat_purchase_rate");
  });

  it("says what a name no metric answers costs, and names a retired one", async () => {
    const { unmount } = render(<Harness initial="Retention Rate" />);
    await waitFor(() => expect(screen.getByTestId("metric-note").textContent)
      .toBe("Not a governed metric here — the mission cannot be measured until one is approved"));
    expect(screen.getByTestId("metric-note").getAttribute("data-tone")).toBe("warn");
    unmount();
    render(<Harness initial="Marketing ROAS" />);
    await waitFor(() => expect(screen.getByTestId("metric-note").textContent).toContain("is retired in the Semantic Layer"));
  });
});

describe("MetricListField", () => {
  it("adds a picked metric as a chip, flags one no metric answers, and removes one", async () => {
    function List() {
      const [v, setV] = useState("gmv, retention");
      return <Theme><MetricListField id="k" value={v} onChange={setV} consequence="decisions will not be matched" />
        <output data-testid="list">{v}</output></Theme>;
    }
    render(<List />);
    await waitFor(() => expect(document.querySelectorAll("datalist option").length).toBe(2));
    expect(getMetrics).toHaveBeenCalledWith(undefined);                     // a kind spans connections
    const chips = screen.getByTestId("metric-chips");
    expect(chips.textContent).toContain("GMV (EUR)");
    expect([...chips.children].find(c => c.textContent?.startsWith("retention"))?.getAttribute("title"))
      .toBe("Not a governed metric here — decisions will not be matched");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "repeat_purchase_rate" } });
    expect(screen.getByTestId("list").textContent).toBe("gmv, retention, repeat_purchase_rate");
    fireEvent.click(screen.getByRole("button", { name: "Remove retention" }));
    expect(screen.getByTestId("list").textContent).toBe("gmv, repeat_purchase_rate");
  });
});
