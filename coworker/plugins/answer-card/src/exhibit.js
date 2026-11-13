/**
 * An answer as an exhibit, the way a Data Canvas shows one: the chart, under it the tables read and the row count
 * with Table and SQL on the right; the table opens in place; the SQL and "Edit visualization" open beside the
 * conversation, as tabs of the shell's right-hand pane.
 *
 * This file holds what the card and the pane share: which answers this page has seen, what a person chose in the
 * editor for each, and the two things drawn in both places (the result grid and the editor).
 */
import { createElement as h, useState, useSyncExternalStore } from "react";
import { labelOf, numericColumns, vizChoices } from "./chart";

export const line = "color-mix(in srgb, currentColor 18%, transparent)";
export const faint = "color-mix(in srgb, currentColor 6%, transparent)";
export const quiet = { opacity: 0.68 };
export const button = (on) => ({
  font: "inherit", fontSize: 12, padding: "3px 10px", borderRadius: 4, cursor: "pointer", color: "inherit",
  border: `1px solid ${line}`, background: on ? "color-mix(in srgb, currentColor 14%, transparent)" : "transparent",
});

// ── what this page has seen, and what was chosen for it ──────────────────────────────────────────────────────

const SEEN = new Map();        // answer id → { answer, asked }
const CHOSEN = new Map();      // answer id → the editor's choices
const watching = new Set();
let turn = 0;
const tell = () => { turn += 1; watching.forEach((heard) => heard()); };
const watch = (heard) => { watching.add(heard); return () => watching.delete(heard); };
const KEPT = "pramanyx.coworker.viz.";

/** Re-draw whenever an answer is seen or a choice changes. */
export const useExhibits = () => useSyncExternalStore(watch, () => turn);

/** An id for an answer: its record's, when it has one; else one made from the question and the SQL. */
export function idOf(answer, asked) {
  if (answer?.investigation_id) return String(answer.investigation_id);
  const text = `${asked || answer?.question || ""}\n${answer?.sql || ""}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `q${(hash >>> 0).toString(36)}`;
}

export function remember(id, answer, asked) {
  if (SEEN.get(id)?.answer === answer) return;
  SEEN.set(id, { answer, asked });
  tell();
}

export const seen = (id) => SEEN.get(id) ?? null;

/** The editor's choices for an answer; what was chosen on an earlier visit is read back once. */
export function chosen(id) {
  if (!CHOSEN.has(id)) {
    let kept = null;
    try { kept = JSON.parse(localStorage.getItem(KEPT + id) || "null"); } catch { kept = null; }
    CHOSEN.set(id, kept && typeof kept === "object" ? kept : null);
  }
  return CHOSEN.get(id);
}

function choose(id, change) {
  const next = change === null ? null : { ...(chosen(id) ?? {}), ...change };
  CHOSEN.set(id, next);
  try {
    if (next) localStorage.setItem(KEPT + id, JSON.stringify(next)); else localStorage.removeItem(KEPT + id);
  } catch { /* the choice lasts this visit */ }
  tell();
}

// ── the pane: one kind of tab, addressed by what it shows and for which answer ───────────────────────────────

export const PANE = "pramanyx-answer";
export const PANE_PATTERN = "dsh-resource://pramanyx-answer/[\\s\\S]+";
export const addressOf = (what, id) => `dsh-resource://pramanyx-answer/${what}/${encodeURIComponent(id)}`;

export function readAddress(address) {
  const m = /^dsh-resource:\/\/pramanyx-answer\/(sql|viz)\/(.+)$/.exec(String(address || ""));
  if (!m) return null;
  let id = m[2];
  try { id = decodeURIComponent(m[2]); } catch { /* as it came */ }
  return { what: m[1], id };
}

/** Set at start, when the shell has a right-hand pane: opens a tab, and says whether it could. */
let opener = null;
export const setOpener = (open) => { opener = open; };
export const hasPane = () => opener !== null;
export function openBeside(what, id) {
  if (!opener) return false;
  try { opener(addressOf(what, id)); return true; } catch { return false; }
}

// ── the result grid ──────────────────────────────────────────────────────────────────────────────────────────

const ROWS_SHOWN = 50;
const said = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
/** A cell's number, or null: a decimal arrives from a warehouse as text. */
const numberOf = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
};
const show = (v, asNumber) => {
  if (v === null || v === undefined) return "";
  const n = asNumber ? numberOf(v) : null;
  return n === null ? String(v) : said.format(n);
};

function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

/**
 * The rows, as a grid a person can read and take away: a click on a heading sorts by it, Totals adds the sum of
 * each column of numbers, Copy and CSV carry the rows as they came (unsorted, unformatted — what was answered).
 */
export function ResultGrid({ answer, compact = false }) {
  const columns = answer.columns ?? [];
  const rows = answer.rows ?? [];
  const total = typeof answer.row_count === "number" ? answer.row_count : rows.length;
  const [by, setBy] = useState(null);                 // { at, down }
  const [totals, setTotals] = useState(false);
  const [copied, setCopied] = useState(false);
  const numeric = numericColumns(columns, rows);
  const ordered = by === null ? rows : [...rows].sort((a, b) => {
    const x = a[by.at], y = b[by.at];
    const p = numeric[by.at] ? numberOf(x) : null, q = numeric[by.at] ? numberOf(y) : null;
    const less = x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1
      : p !== null && q !== null ? p - q : String(x).localeCompare(String(y));
    return by.down ? -less : less;
  });
  const sortBy = (at) => setBy((was) => (was?.at !== at ? { at, down: numeric[at] } : was.down === numeric[at] ? { at, down: !was.down } : null));
  const copy = () => {
    const text = [columns, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  const csv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "pramanyx-answer.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const cell = { padding: compact ? "6px 10px" : "8px 12px", whiteSpace: "nowrap", borderTop: `1px solid ${line}` };
  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5, fontVariantNumeric: "tabular-nums" };
  const mark = (at) => (by?.at === at ? (by.down ? "↓" : "↑") : "↕");
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
      numeric.some(Boolean) ? h("button", { type: "button", "aria-pressed": totals, style: button(totals), onClick: () => setTotals((was) => !was) },
        totals ? "Σ Totals on" : "Σ Totals off") : null,
      h("span", { style: { flex: "1 1 auto" } }),
      h("button", { type: "button", style: button(false), onClick: copy }, copied ? "Copied" : "Copy"),
      h("button", { type: "button", style: button(false), onClick: csv }, "CSV")),
    h("div", { style: { overflowX: "auto", border: `1px solid ${line}`, borderRadius: 4 } },
      h("table", { style: { borderCollapse: "collapse", width: "100%", fontSize: 13 } },
        h("thead", null, h("tr", { style: { background: faint } },
          columns.map((c, i) => h("th", {
            key: c, scope: "col", "aria-sort": by?.at === i ? (by.down ? "descending" : "ascending") : "none",
            style: { ...cell, borderTop: 0, padding: 0, fontWeight: 600, textAlign: numeric[i] ? "right" : "left" },
          }, h("button", {
            type: "button", onClick: () => sortBy(i), title: `Sort by ${c}`,
            style: { font: "inherit", fontWeight: 600, color: "inherit", background: "transparent", border: 0, cursor: "pointer", width: "100%",
                     padding: compact ? "6px 10px" : "8px 12px", textAlign: "inherit", whiteSpace: "nowrap" },
          }, labelOf(c), h("span", { "aria-hidden": "true", style: { ...quiet, paddingLeft: 6 } }, mark(i))))))),
        h("tbody", null, ordered.slice(0, ROWS_SHOWN).map((r, n) => h("tr", { key: n },
          r.map((v, i) => h("td", { key: i, style: { ...cell, ...mono, textAlign: numeric[i] ? "right" : "left" } }, show(v, numeric[i])))))),
        totals ? h("tfoot", null, h("tr", { style: { background: faint } },
          columns.map((c, i) => h("td", { key: c, style: { ...cell, ...mono, fontWeight: 600, textAlign: numeric[i] ? "right" : "left" } },
            numeric[i] ? said.format(rows.reduce((sum, r) => sum + (numberOf(r[i]) ?? 0), 0)) : i === 0 ? "Total" : "")))) : null)),
    total > rows.length || rows.length > ROWS_SHOWN ? h("div", { style: { ...quiet, fontSize: 12 } },
      `${Math.min(rows.length, ROWS_SHOWN)} of ${total} rows shown. Totals, Copy and CSV are over the ${rows.length} that came back.`) : null);
}

// ── the pane's two bodies ────────────────────────────────────────────────────────────────────────────────────

const page = { height: "100%", overflow: "auto", boxSizing: "border-box", padding: "14px 16px 24px", fontSize: 13,
               color: "var(--dsw-alias-label-primary)", display: "flex", flexDirection: "column", gap: 14 };
const heading = { fontSize: 13, fontWeight: 600 };

function SqlAndResult({ answer }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(answer.sql || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return h("div", { style: page },
    h("div", { style: { fontSize: 15, fontWeight: 600 } }, answer.answer || answer.question || "Answer"),
    h(ResultGrid, { answer, compact: true }),
    h("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
      h("span", { style: heading }, "SQL"), h("span", { style: { flex: "1 1 auto" } }),
      answer.sql ? h("button", { type: "button", style: button(false), onClick: copy }, copied ? "Copied" : "Copy SQL") : null),
    h("pre", {
      style: { margin: 0, padding: 12, border: `1px solid ${line}`, borderRadius: 4, background: faint, fontSize: 12.5,
               lineHeight: 1.55, overflowX: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
    }, answer.sql || "No SQL came back with this answer."));
}

const field = { font: "inherit", fontSize: 13, color: "inherit", background: "transparent", border: `1px solid ${line}`,
                borderRadius: 4, padding: "7px 10px", width: "100%", boxSizing: "border-box" };

function Choice({ label, value, options, onChange, id }) {
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14, borderBottom: `1px solid ${line}` } },
    h("label", { htmlFor: id, style: heading }, label),
    h("select", { id, value, onChange: (e) => onChange(e.target.value), style: field },
      options.map((o) => h("option", { key: o.v, value: o.v }, o.t))));
}

function OnOff({ label, on, onChange }) {
  return h("div", { style: { display: "flex", alignItems: "center", paddingBottom: 14, borderBottom: `1px solid ${line}` } },
    h("span", { style: { ...heading, flex: "1 1 auto" } }, label),
    h("button", {
      type: "button", role: "switch", "aria-checked": on, "aria-label": label, onClick: () => onChange(!on),
      style: { width: 40, height: 22, borderRadius: 11, border: `1px solid ${line}`, padding: 2, cursor: "pointer", display: "flex",
               justifyContent: on ? "flex-end" : "flex-start", background: on ? "var(--dsw-alias-brand-primary, #46a0c4)" : "transparent" },
    }, h("span", { style: { width: 16, height: 16, borderRadius: "50%", background: on ? "#0b1a21" : "currentColor", opacity: on ? 1 : 0.55 } })));
}

/**
 * Edit visualization: what the chart is drawn as, which column is its axis and which is measured, a colour, its
 * labels and tooltip, and which way its bars run. What is offered is what the app's own chart vocabulary says this
 * grid can honestly be; a choice applies to the chart in the conversation as it is made, and is kept for the answer.
 */
function Editor({ id, answer }) {
  const now = chosen(id) ?? {};
  const offered = vizChoices(answer.columns ?? [], answer.rows ?? []);
  const set = (change) => choose(id, change);
  const columnsOf = (names) => names.map((c) => ({ v: c, t: labelOf(c) }));
  const way = now.orient || "";
  return h("div", { style: page },
    h("div", null,
      h("div", { style: { fontSize: 15, fontWeight: 600 } }, "Edit visualization"),
      h("div", { style: { ...quiet, fontSize: 12.5, paddingTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
        answer.answer || answer.question || "")),
    h(Choice, { id: `viz-type-${id}`, label: "Visualization", value: now.type || "", onChange: (v) => set({ type: v }),
                options: [{ v: "", t: "As answered" }, ...offered.types] }),
    h(Choice, { id: `viz-x-${id}`, label: "X axis", value: now.x || "", onChange: (v) => set({ x: v }),
                options: [{ v: "", t: "As answered" }, ...columnsOf(offered.dimensions)] }),
    h(Choice, { id: `viz-y-${id}`, label: "Y axis", value: now.y || "", onChange: (v) => set({ y: v }),
                options: [{ v: "", t: "As answered" }, ...columnsOf(offered.measures)] }),
    h(Choice, { id: `viz-color-${id}`, label: "Color", value: now.color || "", onChange: (v) => set({ color: v }),
                options: [{ v: "", t: "None" }, ...columnsOf(offered.dimensions)] }),
    h(OnOff, { label: "Labels", on: now.labels !== false, onChange: (on) => set({ labels: on }) }),
    h(OnOff, { label: "Tooltip", on: now.tooltip !== false, onChange: (on) => set({ tooltip: on }) }),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14, borderBottom: `1px solid ${line}` } },
      h("span", { style: heading }, "Orientation"),
      h("div", { role: "group", "aria-label": "Orientation", style: { display: "flex", gap: 6 } },
        [["", "Auto"], ["vertical", "Vertical"], ["horizontal", "Horizontal"]].map(([v, t]) =>
          h("button", { key: t, type: "button", "aria-pressed": way === v, style: button(way === v), onClick: () => set({ orient: v }) }, t)))),
    h("div", null, h("button", { type: "button", style: button(false), disabled: chosen(id) === null, onClick: () => choose(id, null) }, "Back to the chart as answered")));
}

function addressIn(props) {
  let info = null;
  try { info = props.useTabInfo?.((all) => all); } catch { info = null; }
  return readAddress(info?.tab?.navigation?.address ?? info?.tab?.contentId);
}

/** A tab's body: the SQL and the rows of an answer, or its chart's editor. */
export function PaneBody(props) {
  useExhibits();
  const at = addressIn(props);
  const known = at ? seen(at.id) : null;
  if (!at || !known) {
    return h("div", { style: { ...page, ...quiet } },
      "This tab shows an answer from a conversation. Open that conversation and it is filled in; or close the tab.");
  }
  return at.what === "viz" ? h(Editor, { id: at.id, answer: known.answer }) : h(SqlAndResult, { answer: known.answer });
}

/** A tab's name: what it shows, and of which answer. */
export function PaneTitle(props) {
  useExhibits();
  const at = addressIn(props);
  const of = at ? seen(at.id)?.answer : null;
  const what = at?.what === "viz" ? "Edit visualization" : "SQL";
  const name = of ? (of.answer || of.question || "") : "";
  return h("span", { title: name ? `${what} — ${name}` : what }, name ? `${what} · ${name}` : what);
}

/** The choices made for one answer, re-read whenever any choice changes. */
export function useChosen(id) {
  useExhibits();
  return chosen(id);
}
