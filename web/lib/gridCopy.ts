/**
 * A grid's selection copied in a stated form — the "Copy as" of a results grid and a sheet (the user, 2026-11-09, on
 * a selection menu). Copy alone is TSV without the names, what every spreadsheet pastes; each form here carries the
 * column names. A NULL is a blank in CSV and TSV, `null` in JSON, `NULL` in SQL — never the `∅` the grid draws.
 */
import { toCsv } from "@/lib/query/csv";
import { sqlLiteral } from "@/lib/query/cellMenu";

export type Cell = string | number | boolean | null;
export type CopyForm = "csv" | "tsv" | "json" | "markdown" | "sql";

export const COPY_FORMS: readonly { id: CopyForm; label: string }[] = [
  { id: "csv", label: "CSV" },
  { id: "tsv", label: "TSV" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown table" },
  { id: "sql", label: "SQL values" },
];

const flat = (v: Cell) => (v === null || v === undefined ? "" : String(v).replace(/[\t\r\n]+/g, " "));

/** Names made unique, as JSON keys must be: a result may repeat one (`SELECT a, a`). */
function uniqueNames(columns: string[]): string[] {
  const seen = new Map<string, number>();
  return columns.map(c => {
    const n = (seen.get(c) ?? 0) + 1;
    seen.set(c, n);
    return n === 1 ? c : `${c}_${n}`;
  });
}

/** ``columns`` and ``rows`` in one form. SQL: one column is an IN list of its distinct values, several a VALUES list. */
export function copyAs(form: CopyForm, columns: string[], rows: readonly (readonly Cell[])[]): string {
  switch (form) {
    case "csv": return toCsv(columns, rows.map(r => [...r]));
    case "tsv": return [columns.map(flat).join("\t"), ...rows.map(r => r.map(flat).join("\t"))].join("\n");
    case "json": {
      const keys = uniqueNames(columns);
      return JSON.stringify(rows.map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null]))), null, 2);
    }
    case "markdown": {
      const esc = (v: Cell) => flat(v).replace(/\|/g, "\\|");
      return [`| ${columns.map(esc).join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`,
        ...rows.map(r => `| ${r.map(esc).join(" | ")} |`)].join("\n");
    }
    case "sql": {
      if (columns.length === 1) {
        const values = [...new Set(rows.map(r => sqlLiteral(r[0] ?? null)))];
        return `(${values.join(", ")})`;
      }
      return `VALUES\n${rows.map(r => `  (${r.map(v => sqlLiteral(v ?? null)).join(", ")})`).join(",\n")}`;
    }
  }
}
