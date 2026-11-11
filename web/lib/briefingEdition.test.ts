/** Arc BG/BC — the words an edition's page puts around what the server measured. */
import { describe, expect, it } from "vitest";

import type { EditionBlock, EditionFigure, EditionSource } from "@/lib/api";
import {
  ORGANISATION, bridgeSteps, drillOptions, fmtChange, fmtValue, fromServerReader, groupIdOf, isAskable, parseCited, partFocus,
  partWords, readerOptions, toServerReader, toneOf, writeLabel,
} from "./briefingEdition";

const src = (over: Partial<EditionSource>): EditionSource => ({
  id: "s", label: "S", kind: "query", columns: [], rows: [], sql: "", status: "final", facts: {}, receipts: [],
  caveats: [], note: "", error: "", unit: "", better: "none", ...over,
});

describe("readers", () => {
  it("offers the organisation first, then function groups by name — never a built-in role", () => {
    expect(readerOptions([
      { id: "product", name: "Product", kind: "function" }, { id: "viewer", name: "Viewer", kind: "builtin" },
      { id: "finance", name: "Finance", kind: "function" },
    ])).toEqual([{ value: ORGANISATION, label: "The organisation" }, { value: "finance", label: "Finance" },
                 { value: "product", label: "Product" }]);
  });
  it("speaks the server's empty string for the organisation, both ways", () => {
    expect(toServerReader(ORGANISATION)).toBe("");
    expect(fromServerReader("")).toBe(ORGANISATION);
    expect(fromServerReader("finance")).toBe("finance");
  });
  it("makes a function group's id from a typed name", () => {
    expect(groupIdOf("Buying & Merchandising")).toBe("buying-merchandising");
  });
  it("names the button after the range", () => {
    expect(writeLabel("week", false)).toBe("Write this week's edition");
    expect(writeLabel("range", true)).toBe("Write this range's edition");
  });
  it("colours a figure only when the guide says which way is good", () => {
    const fig = { better: "up", current: 645, usual: { mean: 590 } } as unknown as EditionFigure;
    expect(toneOf(fig)).toBe("good");
    expect(toneOf({ ...fig, better: "none" })).toBe("neutral");
    // not read against its usual range, so not good or bad against it
    expect(toneOf({ ...fig, equal_age: { equal: false, why: "x" } })).toBe("neutral");
    expect(toneOf({ ...fig, equal_age: { equal: true, why: "" } })).toBe("good");
  });
});

describe("an edition's numbers", () => {
  it("words a value by its unit", () => {
    expect(fmtValue(0.0205, "ratio 0..1")).toBe("2.05%");
    expect(fmtValue(0.476, "ratio 0..1")).toBe("47.6%");
    expect(fmtValue(47.55, "%")).toBe("47.5%");
    expect(fmtValue(166988, "EUR")).toBe("€167.0K");
    expect(fmtValue(259, "")).toBe("259");
    expect(fmtValue(null, "EUR")).toBe("—");
  });
  it("words a change with its sign — a share in points", () => {
    expect(fmtChange(38840, 29849, "EUR")).toBe("+30%");
    expect(fmtChange(9845, 11051, "")).toBe("−11%");
    expect(fmtChange(0.0205, 0.0227, "ratio 0..1")).toBe("−0.22 pt");
  });
  it("reads citations out of the words", () => {
    expect(parseCited("Sales were {€167.0k|sales}, an ordinary week.")).toEqual([
      { text: "Sales were " }, { text: "€167.0k", source: "sales" }, { text: ", an ordinary week." }]);
  });
});

describe("bridges and drills", () => {
  const breakdown = src({ id: "by_top", kind: "breakdown", columns: ["segment", "this_range", "usual", "change", "change_pct", "rows", "too_few"],
    rows: [[true, 85349, 75932, 9417, 0.124, 70, false], [false, 81640, 85028, -3388, -0.04, 189, false]],
    facts: { check: "sales", by: "is_top", within: {} } });
  it("bridges a breakdown from its usual total through each segment to this range's total", () => {
    expect(bridgeSteps({ id: "b", type: "bridge", source: "by_top" }, { by_top: breakdown })).toEqual([
      { label: "A usual range", value: 160960, kind: "base" }, { label: "Yes", value: 9417, kind: "delta" },
      { label: "No", value: -3388, kind: "delta" }, { label: "This range", value: 166989, kind: "total" }]);
  });
  it("bridges a chain of checks through their differences", () => {
    const s = { a: src({ id: "a", label: "Sales", kind: "check", facts: { current: 166988 } }),
                b: src({ id: "b", label: "Net revenue", kind: "check", facts: { current: 150773 } }) };
    expect(bridgeSteps({ id: "x", type: "bridge", chain: ["a", "b"] } as EditionBlock, s).map(x => x.value))
      .toEqual([166988, -16215, 150773]);
  });
  it("offers a check's drill columns, and a breakdown's others within its top segment", () => {
    const check = src({ id: "sales", kind: "check" });
    const cols = { sales: ["platform", "is_top", "channel"] };
    expect(drillOptions({ id: "f", type: "figure", source: "sales" }, { sales: check }, cols).map(d => d.column))
      .toEqual(["platform", "is_top", "channel"]);
    expect(drillOptions({ id: "b", type: "bridge", source: "by_top" }, { by_top: breakdown }, cols))
      .toEqual([{ column: "platform", segment: true }, { column: "channel", segment: true }]);
    expect(drillOptions({ id: "t", type: "table", source: "q" }, { q: src({ id: "q" }) }, cols)).toEqual([]);
  });
});

describe("a part of an edition, as the ask names it (ROADMAP §6 item 46)", () => {
  const sales = src({ id: "sales", label: "Sales", kind: "check" });
  it("says a part by the drill it draws now, its title, its source's label, or its own words", () => {
    const fig: EditionBlock = { id: "f", type: "figure", source: "sales" };
    expect(partWords(fig, fig, sales)).toBe("Sales");                                     // untitled: its source's label
    const titled: EditionBlock = { ...fig, title: "Sales held at {€167.0k|sales}" };
    expect(partWords(titled, titled, sales)).toBe("Sales held at €167.0k");                // no citation marks
    const drill: EditionBlock = { id: "drill_x", type: "compare", source: "x", title: "Sales by platform, against usual" };
    expect(partWords(titled, drill, src({ id: "x", label: "Sales by platform", kind: "drill" }))).toBe("Sales by platform");
    const lead: EditionBlock = { id: "lead", type: "lead", text: `Sales were {€167.0k|sales}. ${"More words. ".repeat(10)}` };
    expect(partWords(lead, lead, sales)).toMatch(/^Sales were €167\.0k\. More words\..*…$/);   // its words, not a source's
    expect(partWords(lead, lead, sales).length).toBeLessThanOrEqual(80);
  });
  it("is sent as ids only: the block, the edition it is on, and the source it draws now", () => {
    expect(isAskable("control")).toBe(false);
    expect(isAskable("figure") && isAskable("lead") && isAskable("decision")).toBe(true);
    expect(partFocus({ id: "cmp", source: "stores", words: "Top clients" }, "range:last_week:2026-10-19..2026-10-25@leadership"))
      .toEqual({ kind: "briefing", id: "cmp", period: "range:last_week:2026-10-19..2026-10-25@leadership", source: "stores" });
    expect(partFocus({ id: "lead", words: "Sales were…" }, "range:last_week:2026-10-19..2026-10-25@"))
      .toEqual({ kind: "briefing", id: "lead", period: "range:last_week:2026-10-19..2026-10-25@" });
  });
});
