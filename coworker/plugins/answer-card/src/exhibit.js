/**
 * An answer as an exhibit, the way a Data Canvas shows one: the chart, under it the tables read and the row count
 * with Table and SQL on the right; the table opens in place; the SQL and "Edit visualization" open beside the
 * conversation, as tabs of the shell's right-hand pane.
 *
 * This file holds what the card and the pane share: which answers this page has seen, what a person chose in the
 * editor for each, and the two things drawn in both places (the result grid and the editor).
 */
import { createElement as h, useEffect, useState, useSyncExternalStore } from "react";
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

/** An id for something a step read: made from the tool and what it was asked for. */
export function thingId(tool, args) {
  const text = `${tool}\n${JSON.stringify(args ?? {})}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `t${(hash >>> 0).toString(36)}`;
}

/** Remember what a step read — a metric's definition, an object, the Briefing — so a tab can show it. */
export function rememberThing(id, title, value) {
  if (SEEN.get(id)?.value === value) return;
  SEEN.set(id, { title, value });
  tell();
}

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
  const m = /^dsh-resource:\/\/pramanyx-answer\/(sql|viz|thing|ground)\/(.+)$/.exec(String(address || ""));
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

// ── what an answer stood on ──────────────────────────────────────────────────────────────────────────────────

/**
 * What an answer stood on, read from the receipt Pramanyx keeps for it: the tables and columns its SQL read, the
 * objects of the ontology it was grounded in, and the approved metrics it touched — and, for each of those,
 * whether the answer used the approved formula or departed from it. Metrics that were merely on offer are left
 * out: being available is not being used. Nothing here is inferred by this page; every item is a line of the
 * receipt, and an answer whose receipt did not reach the page says so.
 */
export function groundingOf(answer) {
  const lines = answer?.receipt?.lineage;
  if (!Array.isArray(lines)) return null;
  const after = (ref) => String(ref || "").split(":").slice(1).join(":");
  const out = { tables: [], columns: [], objects: [], findings: [], metrics: [] };
  for (const item of lines) {
    const name = after(item?.ref);
    if (!name) continue;
    if (item.relation === "input" && !out.tables.includes(name)) out.tables.push(name);
    else if (item.relation === "column") {
      let roles = [];
      try { roles = JSON.parse(item.detail || "{}").roles ?? []; } catch { roles = []; }
      out.columns.push({ name, roles });
    } else if (item.relation === "grounded_in_graph") {
      // The graph holds two kinds of thing an answer leans on: an object of the ontology, and an earlier finding.
      const into = String(item.ref).startsWith("finding:") ? out.findings : out.objects;
      if (!into.includes(name)) into.push(name);
    }
    else if (item.relation === "metric_drift") out.metrics.push({ name, departed: true, note: String(item.detail || "") });
    else if (item.relation === "metric_used" || item.relation === "trusted_metric") out.metrics.push({ name, departed: false, note: "" });
  }
  out.count = out.tables.length + out.columns.length + out.objects.length + out.findings.length + out.metrics.length;
  return out;
}

async function readPlatform(path) {
  const got = await fetch(`/pramanyx${path}`, { headers: { accept: "application/json" } });
  if (!got.ok) throw new Error(String(got.status));
  return got.json();
}

const when = (stamp) => { const d = new Date(stamp); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };
const code = { margin: 0, padding: 10, border: `1px solid ${line}`, borderRadius: 4, background: faint, fontSize: 12.5, lineHeight: 1.5,
               whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const tag = (strong) => ({ fontSize: 11.5, padding: "1px 7px", borderRadius: 4, border: `1px solid ${line}`, whiteSpace: "nowrap",
                           ...(strong ? { fontWeight: 600 } : quiet) });
const block = { border: `1px solid ${line}`, borderRadius: 6, padding: 12, display: "flex", flexDirection: "column", gap: 8 };

/** One metric the answer was held to: the definition, where it was fetched from, and what the answer ran instead. */
function MetricGrounding({ metric, definition, sql, connection }) {
  const approved = definition && definition.status === "approved" || Boolean(definition?.approved_by);
  const from = !definition ? "" : definition.connection && definition.connection !== "*"
    ? `Fetched from the semantic layer: this connection's own definition${definition.schema_name && definition.schema_name !== "*" ? `, dataset ${definition.schema_name}` : ""}.`
    : "Fetched from the semantic layer: the organisation-wide definition (this connection has none of its own).";
  return h("div", { style: block },
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
      h("span", { style: { fontWeight: 600, fontSize: 14 } }, definition?.label || metric.name),
      h("span", { style: { ...quiet, fontFamily: code.fontFamily, fontSize: 12 } }, metric.name),
      definition ? h("span", { style: tag(approved) }, approved ? "Approved" : `Not approved (${definition.status || "draft"})`) : null,
      h("span", { style: tag(metric.departed) }, metric.departed ? "Not used as approved" : "Used as approved")),
    definition ? h("div", { style: { ...quiet, fontSize: 12.5 } },
      [from, approved && definition.approved_by ? `Approved by ${definition.approved_by}${definition.approved_at ? ` on ${when(definition.approved_at)}` : ""}.` : "",
       definition.version ? `Version ${definition.version}.` : ""].filter(Boolean).join(" ")) : h("div", { style: quiet }, "Its definition could not be read just now."),
    definition ? h("div", null, h("div", { style: { ...quiet, fontSize: 12, paddingBottom: 4 } }, "The approved formula"), h("pre", { style: code }, definition.sql || "—")) : null,
    definition?.caveats ? h("div", { style: { fontSize: 12.5 } }, definition.caveats) : null,
    h("div", null, h("div", { style: { ...quiet, fontSize: 12, paddingBottom: 4 } }, "What this answer ran"), h("pre", { style: code }, sql || "No SQL came back with this answer.")),
    metric.departed ? h("div", { style: { fontSize: 12.5, fontWeight: 600 } },
      `Pramanyx's own check: ${metric.note || "the answer did not use the approved formula"}. Compare the two above before relying on the figure.`) : null,
    definition?.connection && connection && definition.connection !== "*" && definition.connection !== connection
      ? h("div", { style: { fontSize: 12.5, fontWeight: 600 } }, "This definition belongs to another connection.") : null);
}

/**
 * How grounded an answer is — not a picture of everything near it. Three things a person needs to judge a figure:
 *
 * 1. THE DEFINITIONS. Each metric the answer was held to: the approved formula, where it was fetched from (this
 *    connection's own definition or the organisation-wide one), who approved it and when — beside the SQL the
 *    answer actually ran, and Pramanyx's own check of whether it used the formula as approved.
 * 2. WHAT IT REFERENCED. The objects of the ontology the answer stood on, each with why it is here (the SQL read
 *    it, or the planner was shown it before writing the SQL) and its warrant — whether your schema declares it, a
 *    person asserted it, or a name match guessed it — and the columns read, by role.
 * 3. EARLIER FINDINGS, only when a person has confirmed them. An earlier finding is something Pramanyx computed
 *    once; shown to the planner it is context, not ground. Unconfirmed ones are counted, said to be unconfirmed,
 *    and kept behind a fold. (The user, 2026-11-13: "It's not the old findings that are very critical unless
 *    user has given an upvote.")
 *
 * The receipt comes with the answer. The definitions and the resolved references are read from Pramanyx when the
 * tab opens; if either cannot be read the tab says which, and shows what the receipt alone holds.
 */
function Grounding({ answer }) {
  const ground = groundingOf(answer);
  const receipt = answer?.receipt?.artifact?.id || "";
  const connection = answer?.connection || answer?.receipt?.artifact?.conn_id || "";
  const [definitions, setDefinitions] = useState(null);     // null = reading, false = could not
  const [trace, setTrace] = useState(null);
  useEffect(() => {
    let live = true;
    if (connection) readPlatform(`/metrics?connection_id=${encodeURIComponent(connection)}`).then((d) => live && setDefinitions(d)).catch(() => live && setDefinitions(false));
    else setDefinitions(false);
    if (receipt) readPlatform(`/receipt/${encodeURIComponent(receipt)}/trace`).then((d) => live && setTrace(d)).catch(() => live && setTrace(false));
    else setTrace(false);
    return () => { live = false; };
  }, [connection, receipt]);

  const title = h("div", null,
    h("div", { style: { fontSize: 15, fontWeight: 600 } }, "How this answer is grounded"),
    h("div", { style: { ...quiet, fontSize: 12.5, paddingTop: 2 } }, answer.answer || answer.question || ""));
  if (!ground) return h("div", { style: page }, title, h("div", { style: quiet }, "The receipt for this answer did not reach this page, so its grounding cannot be shown here."));

  const nodes = trace && Array.isArray(trace.nodes) ? trace.nodes : [];
  const referenced = nodes.filter((n) => n.kind !== "finding");
  const findings = nodes.filter((n) => n.kind === "finding");
  const confirmed = findings.filter((n) => n.warrant?.warrant === "human");
  const unconfirmed = findings.filter((n) => n.warrant?.warrant !== "human");
  const departed = ground.metrics.filter((m) => m.departed).length;
  const section = (name, note, body) => h("section", { style: { display: "flex", flexDirection: "column", gap: 8 } },
    h("div", null, h("div", { style: heading }, name), note ? h("div", { style: { ...quiet, fontSize: 12.5, paddingTop: 2 } }, note) : null), body);
  const nodeRow = (n) => h("div", { key: n.id, style: { ...block, gap: 4, padding: "9px 12px" } },
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
      h("span", { style: { fontWeight: 600 } }, n.label || n.id),
      h("span", { style: tag(false) }, n.kind),
      n.warrant?.label ? h("span", { style: tag(n.warrant.warrant === "human" || n.warrant.warrant === "declared"), title: n.warrant.detail || "" }, n.warrant.label) : null,
      n.present === false ? h("span", { style: tag(true) }, "No longer in the ontology") : null),
    h("div", { style: { ...quiet, fontSize: 12.5 } }, [n.why, n.warrant?.detail ? `Warrant: ${n.warrant.detail}.` : ""].filter(Boolean).join(" ")),
    n.kind === "finding" && n.summary ? h("div", { style: { fontSize: 12.5 } }, n.summary) : null);

  return h("div", { style: page }, title,
    h("div", { style: { ...block, gap: 4, background: faint } },
      h("div", { style: { fontWeight: 600 } },
        !ground.metrics.length ? "No approved definition applied to this question." :
        departed ? `${departed} of ${ground.metrics.length} approved ${ground.metrics.length === 1 ? "definition" : "definitions"} was not used as approved.`
                 : `${ground.metrics.length === 1 ? "The approved definition was" : `All ${ground.metrics.length} approved definitions were`} used as approved.`),
      h("div", { style: { ...quiet, fontSize: 12.5 } },
        `${ground.tables.length} ${ground.tables.length === 1 ? "table" : "tables"} and ${ground.columns.length} ${ground.columns.length === 1 ? "column" : "columns"} read. `
        + (trace ? `${confirmed.length} of ${findings.length} earlier findings shown to the planner were confirmed by a person.` : ""))),

    section("Metric definitions", "Each metric this answer was held to: its approved formula and where it came from, beside what the answer ran.",
      ground.metrics.length ? ground.metrics.map((m) => h(MetricGrounding, {
        key: m.name, metric: m, sql: answer.sql, connection,
        definition: Array.isArray(definitions) ? definitions.find((d) => d.name === m.name) ?? null : null,
      })) : h("div", { style: quiet }, "The receipt names no metric this answer was held to. Its figure is the SQL's own, with no approved definition behind it.")),
    definitions === false && ground.metrics.length ? h("div", { style: quiet }, "The definitions could not be read from Pramanyx just now; what is shown is the receipt's.") : null,

    section("Ontology referenced", "What the answer stood on, why it is here, and on what warrant.",
      trace === null ? h("div", { style: quiet }, "Reading what was referenced…")
        : trace === false || !trace.available ? h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
            h("div", { style: quiet }, "The references could not be resolved just now. From the receipt alone:"),
            [...ground.objects, ...ground.tables].map((t) => h("div", { key: t, style: { fontFamily: code.fontFamily, fontSize: 12.5 } }, t)))
        : referenced.length ? referenced.map(nodeRow) : h("div", { style: quiet }, "Nothing of the ontology was referenced.")),
    ground.columns.length ? h("div", { style: { display: "flex", flexDirection: "column" } },
      h("div", { style: { ...quiet, fontSize: 12, paddingBottom: 2 } }, "Columns the SQL read"),
      ground.columns.map((c) => h("div", { key: c.name, style: { display: "flex", gap: 10, padding: "5px 0", borderTop: `1px solid ${line}` } },
        h("span", { style: { fontFamily: code.fontFamily, fontSize: 12.5, flex: "0 0 50%", overflowWrap: "anywhere" } }, c.name),
        h("span", { style: quiet }, c.roles.length ? c.roles.join(", ") : "read")))) : null,

    trace && findings.length ? section("Earlier findings", "Something Pramanyx computed before is context for the planner, not ground, unless a person has confirmed it.",
      h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        confirmed.length ? confirmed.map(nodeRow) : h("div", null, `None of the ${findings.length} shown to the planner was confirmed by a person, so none counts as grounding.`),
        unconfirmed.length ? h("details", null,
          h("summary", { style: { cursor: "pointer", ...quiet } }, `${unconfirmed.length} unconfirmed, shown to the planner before it wrote the SQL`),
          h("div", { style: { display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 } }, unconfirmed.map(nodeRow))) : null)) : null);
}

// ── a thing a step read, laid out to be read ─────────────────────────────────────────────────────────────────

const isScalar = (v) => v === null || ["string", "number", "boolean"].includes(typeof v);
const isCode = (key, v) => typeof v === "string" && (/sql|formula|expression|query/i.test(key) || /\bSELECT\b[\s\S]*\bFROM\b/i.test(v));
const pre = { margin: 0, padding: 10, border: `1px solid ${line}`, borderRadius: 4, background: faint, fontSize: 12.5, lineHeight: 1.55,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

/**
 * Whatever a tool handed back, as a page: its plain facts as a list of name and value, its SQL as SQL, a list of
 * like things as a grid that sorts, and what is inside it as its own section. Nothing is left out to make it
 * tidy and nothing is interpreted: this draws what came back, in the order it came.
 */
function Readable({ value, depth = 0 }) {
  if (isScalar(value)) return h("div", { style: { overflowWrap: "anywhere", whiteSpace: "pre-wrap" } }, value === null ? "—" : String(value));
  if (Array.isArray(value)) {
    if (!value.length) return h("div", { style: quiet }, "None");
    if (value.every(isScalar)) return h("div", { style: { overflowWrap: "anywhere" } }, value.map((v) => String(v)).join(", "));
    if (value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
      const columns = [...new Set(value.flatMap((row) => Object.keys(row)))].filter((c) => value.some((row) => isScalar(row[c]) && row[c] !== null && row[c] !== ""));
      if (columns.length) return h(ResultGrid, { compact: true, answer: { columns, rows: value.map((row) => columns.map((c) => (isScalar(row[c]) ? row[c] : JSON.stringify(row[c])))) } });
    }
    return h("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, value.map((v, i) => h(Readable, { key: i, value: v, depth: depth + 1 })));
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  const facts = entries.filter(([k, v]) => isScalar(v) && !isCode(k, v) && !(typeof v === "string" && v.length > 140));
  const rest = entries.filter((e) => !facts.includes(e));
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
    facts.length ? h("dl", { style: { margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 32%) 1fr", columnGap: 12, rowGap: 6 } },
      facts.flatMap(([k, v]) => [
        h("dt", { key: `${k}-n`, style: { ...quiet, margin: 0 } }, labelOf(k)),
        h("dd", { key: `${k}-v`, style: { margin: 0, overflowWrap: "anywhere" } }, v === null || v === "" ? "—" : String(v)),
      ])) : null,
    rest.map(([k, v]) => h("section", { key: k, style: { display: "flex", flexDirection: "column", gap: 6 } },
      h("div", { style: depth === 0 ? heading : { ...heading, ...quiet } }, labelOf(k)),
      isCode(k, v) ? h("pre", { style: pre }, v) : depth >= 3 && !isScalar(v) ? h("pre", { style: pre }, JSON.stringify(v, null, 2)) : h(Readable, { value: v, depth: depth + 1 }))));
}

function Thing({ title, value }) {
  return h("div", { style: page },
    h("div", { style: { fontSize: 15, fontWeight: 600 } }, title),
    typeof value === "string" ? h("pre", { style: pre }, value) : h(Readable, { value }));
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
      "This tab shows something from a conversation. Open that conversation and it is filled in; or close the tab.");
  }
  if (at.what === "thing") return h(Thing, { title: known.title, value: known.value });
  if (at.what === "ground") return h(Grounding, { answer: known.answer });
  return at.what === "viz" ? h(Editor, { id: at.id, answer: known.answer }) : h(SqlAndResult, { answer: known.answer });
}

/** A tab's name: what it shows, and of which answer. */
export function PaneTitle(props) {
  useExhibits();
  const at = addressIn(props);
  const known = at ? seen(at.id) : null;
  if (at?.what === "thing") return h("span", { title: known?.title || "" }, known?.title || "What was read");
  const of = known?.answer ?? null;
  const what = at?.what === "viz" ? "Edit visualization" : at?.what === "ground" ? "Grounding" : "SQL";
  const name = of ? (of.answer || of.question || "") : "";
  return h("span", { title: name ? `${what} — ${name}` : what }, name ? `${what} · ${name}` : what);
}

/** The choices made for one answer, re-read whenever any choice changes. */
export function useChosen(id) {
  useExhibits();
  return chosen(id);
}
