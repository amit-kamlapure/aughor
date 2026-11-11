/**
 * The metric fields' one reading (2026-11-07). The fixture is LuxExperience's governed metrics as the live
 * install served them that day — names, labels, statuses and units as written.
 */
import { describe, expect, it } from "vitest";

import type { Metric } from "@/lib/api";
import {
  metricStanding, nearMetrics, normMetric, offeredMetrics, resolveMetric, shortUnit, standingSentence,
} from "@/lib/metricField";

const m = (name: string, label: string, status: string, unit: string, extra: Record<string, unknown> = {}) =>
  ({ name, label, status, unit, ...extra }) as unknown as Metric;

const LUX: Metric[] = [
  m("repeat_purchase_rate", "Repeat Purchase Rate", "approved", "ratio 0-1"),
  m("item_return_rate", "Item Return Rate", "approved", "ratio 0-1 (luxury fashion apparel typically 0.25-0.50)"),
  m("session_conversion_rate", "Session Conversion Rate", "approved", "ratio 0-1 (e-commerce typically 0.005-0.05)"),
  m("average_order_value_aov", "Average Order Value (AOV)", "approved", "EUR, typically 300-2000 for luxury multi-brand orders"),
  m("marketing_roas", "Marketing ROAS", "deprecated", "ratio (x multiple; healthy luxury e-commerce usually 2x-8x)",
    { measurable: false, measurable_why: "its date table dim_date is read only inside a filter" }),
  m("return_rate", "Return rate", "deprecated", "ratio"),
  m("gross_margin", "Gross Margin %", "approved", "percent 0-100", { measurable: false, measurable_why: "no date column" }),
  m("clv_90d", "Customer value, 90 days", "proposed", "EUR"),
];

describe("resolving a typed name the server's way", () => {
  it("is the exact name, else the name or label as `spec_for_metric` normalises them", () => {
    expect(resolveMetric("repeat_purchase_rate", LUX)).toMatchObject({ via: "name", metric: { name: "repeat_purchase_rate" } });
    expect(resolveMetric("Repeat Purchase Rate", LUX)).toMatchObject({ via: "label", metric: { name: "repeat_purchase_rate" } });
    expect(resolveMetric("repeat-purchase  rate", LUX).metric?.name).toBe("repeat_purchase_rate");
    // `record/mission._norm` splits on what is not a letter or digit; a run-together name meets nothing, there or here
    expect(normMetric("Repeat_Purchase-Rate")).toBe("repeat purchase rate");
    expect(resolveMetric("RepeatPurchaseRate", LUX).metric).toBeNull();
  });
});

describe("what the field says", () => {
  it("names the two names the user typed on 2026-11-07 for what they were", () => {
    const retention = metricStanding("Retention Rate", LUX);
    expect(retention.kind).toBe("unknown");
    // and offers no near miss: "Item Return Rate" shares letters, not meaning
    expect(retention.kind === "unknown" && retention.near).toEqual([]);
    expect(metricStanding("Marketing ROAS", LUX).kind).toBe("retired");
  });

  it("says approved, waiting for review, draft, or approved-but-unmeasured in the Semantic Layer's words", () => {
    expect(standingSentence(metricStanding("repeat_purchase_rate", LUX), "x")).toEqual(
      { tone: "quiet", text: "Repeat Purchase Rate · ratio · approved" });
    expect(standingSentence(metricStanding("clv_90d", LUX), "the mission cannot be measured")!.text)
      .toBe("Customer value, 90 days is waiting for review — the mission cannot be measured until it is approved");
    expect(standingSentence(metricStanding("gross_margin", LUX), "x")!.text)
      .toBe("Gross Margin % is approved, but it cannot be measured for a period: no date column");
    expect(standingSentence(metricStanding("nonsense", LUX), "the step fails")).toEqual(
      { tone: "warn", text: "Not a governed metric here — the step fails" });
  });

  it("is not a verdict mid-word, and is one once the field is left", () => {
    expect(metricStanding("repeat pur", LUX, { typing: true })).toEqual({ kind: "partial", matches: 1 });
    expect(metricStanding("repeat pur", LUX).kind).toBe("unknown");
  });

  it("offers a typo its metric, and only a close one", () => {
    expect(nearMetrics("Repeat Purchse Rate", LUX).map(x => x.name)).toEqual(["repeat_purchase_rate"]);
    expect(nearMetrics("Retention Rate", LUX)).toEqual([]);
  });
});

describe("the dropdown and the unit", () => {
  it("offers approved, then waiting for review — never a retired definition", () => {
    const names = offeredMetrics(LUX).map(x => x.name);
    expect(names).not.toContain("marketing_roas");
    expect(names).not.toContain("return_rate");
    expect(names.indexOf("clv_90d")).toBe(names.length - 1);
  });

  it("fills a unit box with the unit's leading word, not its description", () => {
    expect(shortUnit("EUR, typically 300-2000 for luxury multi-brand orders")).toBe("EUR");
    expect(shortUnit("ratio 0-1 (luxury fashion apparel typically 0.25-0.50)")).toBe("ratio");
    expect(shortUnit("%")).toBe("%");
    expect(shortUnit(null)).toBe("");
  });
});
