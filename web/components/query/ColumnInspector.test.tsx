// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { columnOverview, profileColumn, sourcesOf } from "./ColumnInspector";
import type { PublicReceipt } from "@/lib/api";

const rows = [
  ["2026-11-08", 120.5, "shipped"],
  ["2026-11-07", 98, "shipped"],
  ["2026-11-06", null, "cancelled"],
  ["2026-11-05", 98, null],
];

describe("a result column's profile", () => {
  it("counts what the loaded rows hold — empties, distinct values, the range, the common values", () => {
    const n = profileColumn(rows, 1, "FLOAT64");
    expect(n).toMatchObject({ loaded: 4, empty: 1, distinct: 2, low: 98, high: 120.5 });
    expect(n.common).toEqual([{ value: 98, n: 2 }]);
    const d = profileColumn(rows, 0, "DATE");
    expect([d.low, d.high]).toEqual(["2026-11-05", "2026-11-08"]);   // a date reads as a range too
    const s = profileColumn(rows, 2, "STRING");
    expect(s.low).toBeNull();                                          // words have no range
    expect(s.common[0]).toEqual({ value: "shipped", n: 2 });
  });

  it("says the rows were cut when they were, so a sample is not read as the whole", () => {
    render(<>{columnOverview({ name: "revenue", type: "FLOAT64", profile: profileColumn(rows, 1, "FLOAT64"), truncated: true })}</>);
    expect(screen.getByText(/these are the loaded rows, not the whole result/)).toBeTruthy();
  });
});

describe("where a result column came from", () => {
  const receipt = {
    columns: {
      level: "column", note: null, tables_only: [],
      columns: [
        { table: "thelook.order_items", column: "sale_price", roles: ["output"], confidence: "certain", as: ["revenue"] },
        { table: "thelook.order_items", column: "created_at", roles: ["filter", "group"], confidence: "certain", as: ["day"] },
        { table: "thelook.orders", column: "status", roles: ["filter"], confidence: "certain", as: [] },
      ],
    },
  } as unknown as PublicReceipt;

  it("is the traced columns the receipt names it as — matched without case, filters left out", () => {
    expect(sourcesOf(receipt, "Revenue").map(c => c.column)).toEqual(["sale_price"]);
    expect(sourcesOf(receipt, "orders")).toEqual([]);
  });
});
