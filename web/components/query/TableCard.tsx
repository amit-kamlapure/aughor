"use client";

/**
 * A table's details, on hovering its `»` in the SQL editor's catalog (the user, 2026-11-09, with a reference console's
 * card: "let the details of the table pop-out like the screenshot when hovered over the >> icon"): its name and where
 * it lives, a copy of its name, its rows, columns and joins, and Preview data — the table's first hundred rows, run in a
 * new tab. Drawn from what the rail already holds; nothing is read for it.
 */
import { useState } from "react";

import { MUTED, NUM } from "@/components/clarity/kit";
import { IcoTable } from "@/components/icons/catalog";
import type { CatalogTable } from "@/components/query/CatalogTree";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { countNoun, formatCount } from "@/lib/format";
import { rowsOf, tableStarter } from "@/lib/query/workbench";

/** Where a table lives — its schema, and its connection where the rail shows more than one. */
export function tablePlace(t: CatalogTable): { bare: string; where: string } {
  const dot = t.name.lastIndexOf(".");
  const bare = dot >= 0 ? t.name.slice(dot + 1) : t.name;
  const schema = t.schema ?? (dot >= 0 ? t.name.slice(0, dot) : "");
  return { bare, where: [schema, t.connectionLabel].filter(Boolean).join(" · ") };
}

/** The card's facts, a label and a value each; a fact the rail does not hold is left out rather than guessed. */
export function tableFacts(t: CatalogTable): Array<[string, string]> {
  const rows = rowsOf(t.rowCount);
  const facts: Array<[string, string]> = [
    ["Rows", rows == null ? "not counted" : formatCount(rows)],
    ["Columns", t.columns.length ? formatCount(t.columns.length) : "not read yet"],
  ];
  if (t.joinDegree) facts.push(["Joins", countNoun(t.joinDegree, "related table")]);
  else if (t.isolated) facts.push(["Joins", "none detected"]);
  return facts;
}

export function TableCard({ table, onPreview }: { table: CatalogTable; onPreview?: (t: CatalogTable) => void }) {
  const { bare, where } = tablePlace(table);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(table.name).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div data-testid="table-card" style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <span style={{ display: "inline-flex", padding: 6, borderRadius: "var(--r2)", background: "var(--bg-2)", flexShrink: 0 }}>
          <IcoTable size={18} />
        </span>
        <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
          <span className="aug-fs-ui font-mono" style={{ color: "var(--t1)", fontWeight: 600, overflowWrap: "anywhere" }}>{bare}</span>
          {where && <span className="aug-fs-xs font-mono" style={{ ...MUTED, overflowWrap: "anywhere" }}>{where}</span>}
        </span>
        <Button variant="ghost" size="icon" onClick={copy} aria-label={`Copy ${table.name}`}
          title={copied ? "Copied" : `Copy ${table.name}`}>
          <Icon name={copied ? "check" : "copy"} size={14} />
        </Button>
      </div>
      <dl className="aug-fs-sm" style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 16px", margin: 0 }}>
        {tableFacts(table).map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={MUTED}>{label}</dt>
            <dd style={{ margin: 0, color: "var(--t1)", ...NUM }}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="aug-fs-xs" style={MUTED}>
        <span style={{ color: "var(--t2)" }}>»</span> puts <span className="font-mono">{tableStarter(table.name)}</span> in an
        empty editor, and the name at the cursor otherwise.
      </div>
      {onPreview && (
        <Button variant="outline" size="sm" onClick={() => onPreview(table)} style={{ justifySelf: "start" }}
          title={`Runs ${tableStarter(table.name)} in a new tab`}>
          <Icon name="eye" size={14} /> Preview data
        </Button>
      )}
    </div>
  );
}
