"use client";

/**
 * One result column, in the shell's inspector (2026-11-10, ROADMAP §6 item 64; the SQL Editor mockup): what the rows on
 * screen hold in it, and where it came from — read off the run's signed receipt, the lineage the statement was traced
 * to. Opened from a column's menu ("Inspect column"); it stays open while the reader moves to another column.
 *
 * Everything it says about values is about the rows LOADED, and says so when the result was cut — a profile of 500
 * rows is not a profile of the table. Where it came from is the receipt's own words: traced to columns, traced only to
 * tables (with the receipt's reason), or not traced at all on a receipt written before columns were — each said, never
 * an empty list that reads as "no source".
 */
import { useEffect, useState } from "react";

import { InspectorFacts } from "@/components/shell/Inspector";
import { Button } from "@/components/ui/button";
import { getPublicReceipt, type PublicReceipt } from "@/lib/api";
import { countNoun, displayCellValue, formatCount, formatTableNumber, isNumericType } from "@/lib/format";

type Cell = string | number | boolean | null;

export interface ColumnProfile {
  loaded: number;
  empty: number;
  distinct: number;
  /** Lowest and highest, for numbers and for values that read as dates; null otherwise. */
  low: Cell; high: Cell;
  /** The most common values, most first — for a column that is not all distinct. */
  common: { value: Cell; n: number }[];
}

/** What the loaded rows hold in one column. Pure, so it is tested without a DOM. */
export function profileColumn(rows: readonly (readonly Cell[])[], idx: number, type?: string | null): ColumnProfile {
  const counts = new Map<string, { value: Cell; n: number }>();
  let empty = 0;
  let low: Cell = null, high: Cell = null;
  const numeric = isNumericType(type);
  for (const r of rows) {
    const v = r[idx] ?? null;
    if (v === null) { empty++; continue; }
    const key = typeof v === "string" ? `s:${v}` : `${typeof v}:${String(v)}`;
    const c = counts.get(key);
    if (c) c.n++; else counts.set(key, { value: v, n: 1 });
    if (numeric && typeof v === "number") {
      if (low === null || v < (low as number)) low = v;
      if (high === null || v > (high as number)) high = v;
    } else if (!numeric && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      if (low === null || v < (low as string)) low = v;
      if (high === null || v > (high as string)) high = v;
    }
  }
  const common = [...counts.values()].filter(c => c.n > 1).sort((a, b) => b.n - a.n).slice(0, 5);
  return { loaded: rows.length, empty, distinct: counts.size, low, high, common };
}

/** The receipt's sources for one output column: traced columns whose `as` names it. */
export function sourcesOf(receipt: PublicReceipt, column: string): PublicReceipt["columns"]["columns"] {
  const want = column.toLowerCase();
  return receipt.columns.columns.filter(c => c.as.some(a => a.toLowerCase() === want));
}

export function columnOverview({ name, type, profile, truncated }: {
  name: string; type?: string | null; profile: ColumnProfile; truncated: boolean;
}) {
  const v = (c: Cell) => (typeof c === "number" ? formatTableNumber(c) : displayCellValue(c));
  return (
    <>
      <InspectorFacts rows={[
        { label: "Column", value: <span className="aug-mono">{name}</span> },
        { label: "Type", value: type || "not said by the engine" },
        { label: "Rows loaded", value: formatCount(profile.loaded), note: truncated ? "The result was cut — these are the loaded rows, not the whole result." : undefined },
        { label: "Empty (null)", value: formatCount(profile.empty) },
        { label: "Distinct values", value: formatCount(profile.distinct) },
        ...(profile.low !== null ? [{ label: "Lowest", value: v(profile.low) }, { label: "Highest", value: v(profile.high) }] : []),
      ]} />
      {profile.common.length > 0 && (
        <InspectorFacts rows={profile.common.map(c => ({ label: v(c.value), value: countNoun(c.n, "row") }))} />
      )}
    </>
  );
}

/** Where the column came from, read off the run's receipt. */
export function ColumnSources({ receiptId, column }: { receiptId: string | null | undefined; column: string }) {
  const [state, setState] = useState<{ receipt: PublicReceipt | null; error?: string } | undefined>(undefined);
  useEffect(() => {
    if (!receiptId) return;
    let live = true;
    getPublicReceipt(receiptId)
      .then(r => { if (live) setState({ receipt: r }); })
      .catch(e => { if (live) setState({ receipt: null, error: e instanceof Error ? e.message : "read failed" }); });
    return () => { live = false; };
  }, [receiptId]);
  if (!receiptId) return <p className="aug-inspector-note">This run left no receipt, so where the column came from is not recorded.</p>;
  if (state === undefined) return <p className="aug-inspector-note">Reading the run&apos;s receipt…</p>;
  if (!state.receipt) return <p className="aug-inspector-note">Could not read the run&apos;s receipt{state.error ? ` — ${state.error}` : ""}.</p>;
  const r = state.receipt;
  const open = () => window.open(`/receipt/${encodeURIComponent(r.id)}`, "_blank", "noreferrer");
  const receiptLine = (
    <Button variant="link" size="xs" className="aug-mono" onClick={open} title="Open the run's signed receipt">
      Receipt {r.id.slice(0, 8)}
    </Button>
  );
  if (r.columns.level === null) {
    return <>
      <p className="aug-inspector-note">This receipt was written before columns were traced, so it says which tables were read, not which columns.</p>
      {r.input_tables.length > 0 && <InspectorFacts rows={r.input_tables.map(t => ({ label: "Read", value: <span className="aug-mono">{t}</span> }))} />}
      {receiptLine}
    </>;
  }
  if (r.columns.level === "table") {
    return <>
      <p className="aug-inspector-note">Traced to tables only{r.columns.note ? ` — ${r.columns.note}` : ""}.</p>
      <InspectorFacts rows={r.columns.tables_only.map(t => ({ label: t.roles.join(", ") || "read", value: <span className="aug-mono">{t.table}</span> }))} />
      {receiptLine}
    </>;
  }
  const from = sourcesOf(r, column);
  return <>
    {from.length > 0
      ? <InspectorFacts rows={from.map(c => ({
          label: c.roles.join(", ") || "read",
          value: <span className="aug-mono">{c.table}.{c.column}</span>,
          note: c.confidence && c.confidence !== "certain" ? `Traced as ${c.confidence}.` : undefined,
        }))} />
      : <p className="aug-inspector-note">The receipt traced no warehouse column to {column}: the statement computes it (a count, a constant, an expression), or the trace could not follow it.</p>}
    {receiptLine}
  </>;
}
