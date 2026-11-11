import { describe, expect, it } from "vitest";

import { NUMBER_FORMATS, formatNumberAs } from "@/lib/format";
import { copyAs } from "@/lib/gridCopy";

describe("a number column's display format", () => {
  it("shows each format as a spreadsheet does, and the menu's examples read as stated", () => {
    const shown = Object.fromEntries(NUMBER_FORMATS.map(f => [f.label, formatNumberAs(f.example, f.id)]));
    expect(shown).toEqual({ None: "1240.35", Standard: "1,240.35", Compact: "12.4K", Currency: "$1,240.35",
      Percentage: "12.4%", Scientific: "1.2E3", Bytes: "1.21 KB" });
  });

  it("never changes a value that is not a number, and keeps a blank blank", () => {
    expect(formatNumberAs("n/a", "currency")).toBe("n/a");
    expect(formatNumberAs(null, "percent")).toBe("");
    expect(formatNumberAs("23.4", "standard")).toBe("23.4");
    expect(formatNumberAs(-1240.35, "currency", "€")).toBe("-€1,240.35");
    expect(formatNumberAs(0.0001, "scientific")).toBe("1.0E-4");
  });
});

describe("copy as", () => {
  const cols = ["platform", "mom_pct"];
  const rows = [["MR PORTER", 22.8], ["YOOX", null], ["a|b", 4.6]];

  it("carries the column names in every form, a null as each form spells it", () => {
    expect(copyAs("csv", cols, rows)).toBe("platform,mom_pct\r\nMR PORTER,22.8\r\nYOOX,\r\na|b,4.6");
    expect(copyAs("tsv", cols, rows)).toBe("platform\tmom_pct\nMR PORTER\t22.8\nYOOX\t\na|b\t4.6");
    expect(JSON.parse(copyAs("json", cols, rows))[1]).toEqual({ platform: "YOOX", mom_pct: null });
    expect(copyAs("markdown", cols, rows).split("\n")).toEqual(
      ["| platform | mom_pct |", "| --- | --- |", "| MR PORTER | 22.8 |", "| YOOX |  |", "| a\\|b | 4.6 |"]);
    expect(copyAs("sql", cols, rows)).toBe("VALUES\n  ('MR PORTER', 22.8),\n  ('YOOX', NULL),\n  ('a|b', 4.6)");
  });

  it("makes one column an IN list of its distinct values, and repeated names unique keys", () => {
    expect(copyAs("sql", ["platform"], [["YOOX"], ["YOOX"], ["O'Neil"]])).toBe("('YOOX', 'O''Neil')");
    expect(Object.keys(JSON.parse(copyAs("json", ["a", "a"], [[1, 2]]))[0])).toEqual(["a", "a_2"]);
  });
});
