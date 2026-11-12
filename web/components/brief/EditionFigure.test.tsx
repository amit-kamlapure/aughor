// @vitest-environment jsdom
/** Arc BG/BC — an edition's shapes, drawn from what was measured: the range last, a step coloured by its sign. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EditionFigure } from "@/lib/api";
import { bridgeSpec, lineMarkSpec, multipleOf, multipleSpec, pairRowsSpec, pairTone, progressSpec, rangeBarsSpec } from "@/lib/briefingAccount";
import { Bridge, LineMark, Multiples, PairRows, ProgressBars, RangeBars } from "./EditionFigure";

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
    const rows = [{ label: "Mytheresa", now: 38840, base: 29849 }, { label: "YOOX", now: 9845, base: 11051, thin: true },
                  { label: "MR PORTER", now: 900, base: 1000 }];
    const colors = { thin: "grey", plain: "blue", good: "green", bad: "amber" };
    const spec = pairRowsSpec(rows, { fmt: v => String(v), change: (a, b) => (a! >= b! ? "up" : "down") }, "up", colors, l => l !== "Mytheresa")!;
    const values = (spec.data as { values: { row: string; faded: boolean; tone: string; nowText: string; changeText: string }[] }).values;
    expect(values.map(v => v.faded)).toEqual([false, true, true]);
    expect(values.map(v => v.row)).toEqual(["Mytheresa", "YOOX · too few", "MR PORTER"]);
    expect(values.map(v => v.tone)).toEqual(["good", "thin", "bad"]);          // too few to call is never good or bad
    expect(values[0]).toMatchObject({ nowText: "38840", changeText: "up" });
    expect([pairTone(5, 9, "down"), pairTone(5, 9, "none")]).toEqual(["good", "plain"]);   // a fall is good where down is better
    expect(pairRowsSpec([], { fmt: String, change: () => "" }, "up", colors)).toBeNull();
    render(<PairRows better="up" fmt={v => String(v)} change={() => "+30%"} rows={rows} />);
    expect(screen.getByTestId("edition-pair-rows").getAttribute("aria-label")).toContain("YOOX (too few to call): 9845 against 11051");
  });

  it("draws one small chart per series, each against its own usual", () => {
    const pts = (vals: number[]) => vals.map((v, i) => ({ x: `2026-10-${10 + i}`, v }));
    render(<Multiples fmt={v => `${v.toFixed(2)}%`} series={[{ name: "App", points: pts([6.8, 6.6, 6.7, 5.2]) },
                                                              { name: "Desktop", points: pts([2.0, 1.9, 2.1, 2.6]) }]} />);
    expect(screen.getByTestId("edition-multiples").textContent).toContain("App");
    expect(screen.getByTestId("edition-multiples").textContent).toContain("5.20%");
    expect(screen.getByTestId("edition-multiples").textContent).toContain("usual 6.60%–6.80%");
    // each against its OWN usual: the periods before the last, a standard deviation either side
    expect(multipleOf(pts([6.8, 6.6, 6.7, 5.2]))).toMatchObject({ last: 5.2, tone: "below", band: true });
    expect(multipleOf(pts([2.0, 1.9, 2.1, 2.6])).tone).toBe("above");
    expect(multipleOf(pts([2.0, 2.6])).band).toBe(false);                      // one earlier period is no range
    const spec = multipleSpec(pts([6.8, 6.6, 6.7, 5.2]), "amber");
    expect((spec.data as { values: { last: boolean }[] }).values.map(v => v.last)).toEqual([false, false, false, true]);
    expect(JSON.stringify(spec)).toContain('"color":"amber"');
  });

  it("sets a few totals side by side, the first in the accent, each saying its figure", () => {
    const spec = progressSpec([{ label: "Q3 2026", v: 2100 }, { label: "Q3 2025", v: -1900 }], v => `€${v}`, { first: "blue", rest: "grey" })!;
    expect((spec.data as { values: unknown[] }).values).toEqual([
      { row: "Q3 2026", order: 0, value: 2100, shown: "€2100", first: true }, { row: "Q3 2025", order: 1, value: 1900, shown: "€-1900", first: false }]);
    expect(progressSpec([], String, { first: "", rest: "" })).toBeNull();
    render(<ProgressBars rows={[{ label: "Q3 2026", v: 2100 }]} fmt={v => `€${v}`} />);
    expect(screen.getByTestId("edition-progress").getAttribute("aria-label")).toBe("Q3 2026: €2100");
  });

  describe("a line over the periods read", () => {
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
