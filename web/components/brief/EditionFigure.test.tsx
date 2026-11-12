// @vitest-environment jsdom
/** Arc BG/BC — an edition's shapes, drawn from what was measured: the range last, a step coloured by its sign. */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditionFigure } from "@/lib/api";
import { bridgeSpec, lineMarkSpec, rangeBarsSpec } from "@/lib/briefingAccount";
import { Bridge, LineMark, Multiples, PairRows, RangeBars } from "./EditionFigure";

const FIG = { id: "aov", label: "Average order", better: "up", current: 645,
  usual: { mean: 590, low: 566, high: 614, n: 8, mean_text: "€590", low_text: "€566", high_text: "€614" },
  series: [{ label: "u1", start: "2026-10-05", value: 600 }, { label: "u2", start: "2026-10-12", value: null },
           { label: "current", start: "2026-10-19", value: 645 }] } as unknown as EditionFigure;

describe("EditionFigure", () => {
  it("draws each range that has a value, the range itself last, over its usual range", () => {
    // a Vega-Lite spec since 2026-11-12: what is drawn is what the spec says, read here as data
    const spec = rangeBarsSpec(FIG, { current: "#0a0", rest: "#999" })!;
    const layers = spec.layer as { mark: { type: string }; encoding: { color: { condition: { test: string; value: string }; value: string } } }[];
    const rows = (spec.data as { values: { value: number; last: boolean }[] }).values;
    expect(rows.map(r => r.value)).toEqual([600, 645]);              // the range with no value is not drawn as zero
    expect(rows.map(r => r.last)).toEqual([false, true]);
    const bars = layers.find(l => l.mark?.type === "bar")!;
    expect(bars.encoding.color).toEqual({ condition: { test: "datum.last", value: "#0a0" }, value: "#999" });
    expect(JSON.stringify(spec.layer)).toContain('"low":566,"high":614');   // its usual range, behind the bars
    expect(rangeBarsSpec({ ...FIG, series: FIG.series.slice(0, 2) }, { current: "", rest: "" })).toBeNull();   // one bar is no picture
    render(<RangeBars figure={FIG} period="week" />);
    expect(screen.getByTestId("edition-range-bars").getAttribute("aria-label")).toBe("Average order by week, this week last");
  });

  it("bridges a usual range to this one, each step coloured by its sign", () => {
    const steps = [{ label: "A usual range", value: 160960, kind: "base" as const }, { label: "Top clients", value: 9417, kind: "delta" as const },
                   { label: "Everyone else", value: -3388, kind: "delta" as const }, { label: "This range", value: 166989, kind: "total" as const }];
    const spec = bridgeSpec(steps, v => `€${Math.round(v / 100) / 10}k`, { base: "b", total: "t", up: "u", down: "d" })!;
    const rows = (spec.data as { values: { tone: string; shown: string; from: number; to: number }[] }).values;
    expect(rows.map(r => r.tone)).toEqual(["base", "up", "down", "total"]);
    expect(rows.map(r => r.shown)).toEqual(["€161k", "+€9.4k", "−€3.4k", "€167k"]);
    expect([rows[1].from, rows[1].to]).toEqual([160960, 170377]);       // a step starts where the one before it ended
    expect([rows[2].from, rows[2].to]).toEqual([170377, 166989]);
    expect(bridgeSpec(steps.slice(0, 1), String, { base: "", total: "", up: "", down: "" })).toBeNull();
    render(<Bridge steps={steps} fmt={String} />);
    expect(screen.getByTestId("edition-bridge")).toBeTruthy();
  });

  it("fades the rows a control has not chosen, and calls a segment of a few rows too few", () => {
    render(<PairRows better="up" fmt={v => String(v)} change={() => ""} dim={l => l !== "Mytheresa"}
      rows={[{ label: "Mytheresa", now: 38840, base: 29849 }, { label: "YOOX", now: 9845, base: 11051, thin: true }]} />);
    const rows = screen.getAllByRole("row");
    expect(rows[0].getAttribute("data-faded")).toBeNull();
    expect(rows[1].getAttribute("data-faded")).toBe("true");
    expect(rows[1].textContent).toContain("too few");
  });

  it("draws one small chart per series, each against its own usual", () => {
    const pts = (vals: number[]) => vals.map((v, i) => ({ x: `2026-10-${10 + i}`, v }));
    render(<Multiples fmt={v => `${v.toFixed(2)}%`} series={[{ name: "App", points: pts([6.8, 6.6, 6.7, 5.2]) },
                                                              { name: "Desktop", points: pts([2.0, 1.9, 2.1, 2.6]) }]} />);
    expect(screen.getByTestId("edition-multiples").textContent).toContain("App");
    expect(screen.getByTestId("edition-multiples").textContent).toContain("5.20%");
  });

  describe("drawn at the width it is shown", () => {
    // jsdom lays nothing out: give every box the width a full block has on the page, and a ResizeObserver that reads it
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
    const shownAt = (px: number) => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(px);
      vi.stubGlobal("ResizeObserver", class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} });
    };
    const POINTS = [{ x: "2026-10-05", v: 0.33 }, { x: "2026-10-12", v: 0.15 }, { x: "2026-10-19", v: 0.04 }];

    it("words a line's axis and its one mark in the figure's own unit", () => {
      const spec = lineMarkSpec(POINTS, v => `${(v * 100).toFixed(1)}%`, { at: "2026-10-12", text: "returns still arriving" })!;
      const text = JSON.stringify(spec);
      expect(text).toContain("33.0%");                                // the top of the axis, as the unit has it
      expect(text).toContain("4.0%");
      expect(text).toContain("returns still arriving");
      expect(JSON.stringify(lineMarkSpec(POINTS, String))).not.toContain("rule");   // no mark, no rule
      expect(lineMarkSpec(POINTS.slice(0, 1), String)).toBeNull();
      render(<LineMark points={POINTS} fmt={String} />);
      expect(screen.getByTestId("edition-line")).toBeTruthy();
    });
  });
});
