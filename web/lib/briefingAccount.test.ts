/** The Briefing as a running account — the page-side reading of what the server says of an edition. */
import { describe, expect, it } from "vitest";

import type { EditionFigure, EditionStoryline } from "@/lib/api";
import * as vl from "vega-lite";

import {
  bridgeSpec, figureSpec, forReader, lineMarkSpec, multipleSpec, pairRowsSpec, progressSpec, rangeBarsSpec, scoreOf, sideOf,
  standingOf, tallyOf, trackOf,
} from "./briefingAccount";

const fig = (over: Partial<EditionFigure>): EditionFigure => ({
  id: "f", label: "F", metric: "f", unit: "EUR", better: "up", why: "", current: 110, previous: 100, last_year: null, rel: 0.1,
  rel_last_year: null, n: 1, status: "final", z: 1.2, outside: true, floor: false, streak: 1, extreme: null, cells: {},
  usual: { mean: 95, low: 90, high: 100, n: 8, mean_text: "95", low_text: "90", high_text: "100" },
  series: [{ label: "u1", start: "2026-10-26", value: 95 }, { label: "current", start: "2026-11-02", value: 110 }],
  current_text: "110", previous_text: "100", last_year_text: null, like_for_like: "", sql: "", ...over,
});
const story = (over: Partial<EditionStoryline>): EditionStoryline => ({
  id: "s", kind: "figures", stage: "a", stage_name: "A", figures: ["f"], anchor: "f", metric: "f", head: "F read 110.", called: true,
  status: "final", state: "new", owner: "", owner_from: "", worth: { value: null, why: "" }, decision: null,
  check: { state: "none", says: "" }, trail: [], blocks: [], waits: true, ...over,
});

describe("briefingAccount", () => {
  it("says where a figure stands, and which way is better only when someone has said", () => {
    expect([sideOf(fig({})), sideOf(fig({ current: 80 })), sideOf(fig({ current: 95 })), sideOf(fig({ usual: null }))]).toEqual([1, -1, 0, 0]);
    expect(standingOf(fig({}))).toBe("better");
    expect(standingOf(fig({ better: "down" }))).toBe("worse");
    expect(standingOf(fig({ better: "none" }))).toBe("plain");       // nobody said which way is good: no colour
    expect(standingOf(fig({ current: 95 }))).toBe("inside");
  });

  it("places the usual range and the mark on one track, the mark outside the band when the figure is", () => {
    const t = trackOf(fig({}))!;
    expect(t.low).toBeLessThan(t.high);
    expect(t.at).toBeGreaterThan(t.high);
    expect(trackOf(fig({ usual: null }))).toBeNull();
  });

  it("draws a figure's history as a spec: its usual band, its line, this range marked — and no axes on a row", () => {
    const spec = figureSpec(fig({}));
    const layers = spec.layer as { mark: { type: string } }[];
    expect(layers.map(l => l.mark.type)).toEqual(["rect", "line", "point", "text"]);
    expect((spec.data as { values: { last: boolean }[] }).values.map(v => v.last)).toEqual([false, true]);
    expect((figureSpec(fig({}), true).layer as unknown[]).length).toBe(3);                    // no words on a row's trend
    expect((figureSpec(fig({ usual: null })).layer as { mark: { type: string } }[])[0].mark.type).toBe("line");
  });

  it("counts what the storylines amount to, and puts a team's own first", () => {
    const all = [story({ id: "a", owner: "Finance", waits: false }), story({ id: "b", decision: { taken: false, text: "x" } }),
                 story({ id: "c", owner: "Supply chain", decision: { taken: true, text: "y" }, waits: false })];
    expect(tallyOf(all)).toEqual({ stories: 3, owned: 2, decisions: 2, decided: 1, waiting: 1 });
    expect(forReader(all, "supply chain").map(s => s.id)).toEqual(["c", "a", "b"]);
    expect(forReader(all, "").map(s => s.id)).toEqual(["a", "b", "c"]);    // the organisation reads the server's order
  });

  it("scores the range against its usual ranges, the farthest out first", () => {
    const s = scoreOf([fig({ id: "in", current: 95 }), fig({ id: "near", current: 101 }), fig({ id: "far", current: 140 }),
                       fig({ id: "low", current: 70 }), fig({ id: "unread", usual: null })]);
    expect([s.read, s.inside]).toEqual([4, 1]);
    expect(s.above.map(f => f.id)).toEqual(["far", "near"]);
    expect(s.below.map(f => f.id)).toEqual(["low"]);
  });

  it("writes specs the chart engine compiles — every figure the Briefing draws", () => {
    // A spec is data until the compiler reads it: `axis: null` on an encoding shared between layers threw only in the
    // browser (2026-11-12). Each is compiled here as VegaChart compiles it, at a width and a height.
    const pts = [{ x: "2026-10-19", v: 6.5 }, { x: "2026-10-26", v: 6.6 }, { x: "2026-11-02", v: 6.8 }];
    const colors = { thin: "#888", plain: "#48f", good: "#3a6", bad: "#d72" };
    const specs: Record<string, Record<string, unknown> | null> = {
      figure: figureSpec(fig({})), trend: figureSpec(fig({}), true), unread: figureSpec(fig({ usual: null })),
      ranges: rangeBarsSpec(fig({}), { current: "#3a6", rest: "#888" }),
      line: lineMarkSpec(pts, v => v.toFixed(2), { at: "2026-10-26", text: "carrier change" }),
      bridge: bridgeSpec([{ label: "Average days from order to ship", value: 1.12, kind: "base" }, { label: "to delivery", value: 5.7, kind: "delta" },
                          { label: "Order to delivery", value: 6.82, kind: "total" }], v => v.toFixed(2), { base: "#888", total: "#48f", up: "#3a6", down: "#d72" }),
      pairs: pairRowsSpec([{ label: "Mytheresa", now: 78, base: 74.5 }, { label: "YOOX", now: 112, base: 115.3, thin: true }],
                          { fmt: v => String(v), change: () => "+4.7%" }, "up", colors, l => l === "YOOX"),
      progress: progressSpec([{ label: "Q3 2026", v: 2100 }, { label: "Q3 2025", v: 1900 }], v => `€${v}`, { first: "#48f", rest: "#888" }),
      multiple: multipleSpec(pts, "#d72"),
    };
    for (const [name, spec] of Object.entries(specs)) {
      expect(spec, name).not.toBeNull();
      expect(() => vl.compile({ ...spec, width: 420, height: 160 } as unknown as Parameters<typeof vl.compile>[0]), name).not.toThrow();
    }
  });
});
