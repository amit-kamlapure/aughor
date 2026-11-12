/**
 * The Pramanyx answer card — how the coworker shows what Pramanyx answered.
 *
 * The shell's model is quick, and it retells: a reader of its prose cannot tell a faithful retelling from an
 * invented one. On the first end-to-end run (2026-11-13) its reply described the SQL as counting distinct orders
 * and dropping null countries; there was no way to check that from the page, and it was doubted. With this card
 * the SQL is one click away, and the description turned out to be right. So the answer is not left to a
 * retelling: this view takes the `ask` tool's own result and draws it — the chart, the table, the SQL and how it
 * was answered — and the model writes around it.
 *
 * It registers a view for ONE wire tool name in the shell's `tool.call.toolview` slot. Nothing here calls
 * Pramanyx, a model or the network: it reads the result the tool already returned.
 */
import { createElement as h, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawChart } from "./chart";

const TOOL = "mcp__pramanyx__ask";
/**
 * The tools whose result is an answer: `ask`, and one `ask_<agent>` per custom agent, which answers through the
 * same door in the same shape. The agents are a person's own and change, so their names cannot be listed here.
 */
const ANSWERS = /^mcp__pramanyx__ask(_[a-z0-9_]+)?$/;
const ROWS_SHOWN = 50;

/** The tool result's text, whichever of the shell's two shapes carries it. */
function resultText(block) {
  if (!block) return "";
  if (typeof block.text === "string" && block.text) return block.text;
  const parts = Array.isArray(block.content) ? block.content : [];
  return parts.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("");
}

/**
 * The answer as an object, or null. A long result reaches the page cut short, and the cut falls in the receipt,
 * which is the last and largest field — so a result that does not parse is tried again without it. A result cut
 * inside the rows is not guessed at: the card says it could not read it.
 */
export function readAnswer(text) {
  if (!text) return null;
  try {
    return { answer: JSON.parse(text), whole: true };
  } catch {
    const at = text.indexOf('\n  "receipt":');
    if (at < 0) return null;
    try {
      return { answer: JSON.parse(text.slice(0, at).replace(/,\s*$/, "") + "\n}"), whole: false };
    } catch {
      return null;
    }
  }
}

const line = "color-mix(in srgb, currentColor 18%, transparent)";
const faint = "color-mix(in srgb, currentColor 6%, transparent)";
const quiet = { opacity: 0.68 };
const button = (on) => ({
  font: "inherit", fontSize: 12, padding: "3px 10px", borderRadius: 4, cursor: "pointer", color: "inherit",
  border: `1px solid ${line}`, background: on ? "color-mix(in srgb, currentColor 14%, transparent)" : "transparent",
});

function Chart({ answer }) {
  const box = useRef(null);
  const [none, setNone] = useState(false);
  useEffect(() => {
    if (!box.current) return undefined;
    let remove = null;
    try {
      remove = drawChart(box.current, {
        columns: answer.columns ?? [], rows: answer.rows ?? [], chart_type: answer.chart_type,
        chart_config: answer.chart_config, column_units: answer.column_units, title: null,
      });
    } catch {
      remove = null;
    }
    setNone(!remove);
    return () => { if (remove) remove(); };
  }, [answer]);
  return h("div", null,
    h("div", { ref: box, style: { width: "100%", minHeight: none ? 0 : 220 } }),
    none ? h("div", { style: { ...quiet, padding: "8px 0" } },
      "These rows have no chart worth drawing. The table has them.") : null);
}

function toCsv(columns, rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

function Table({ answer }) {
  const columns = answer.columns ?? [];
  const rows = answer.rows ?? [];
  const total = typeof answer.row_count === "number" ? answer.row_count : rows.length;
  const [copied, setCopied] = useState(false);
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
  const cell = { padding: "5px 10px", textAlign: "left", whiteSpace: "nowrap", borderTop: `1px solid ${line}` };
  return h("div", null,
    h("div", { style: { overflowX: "auto", border: `1px solid ${line}`, borderRadius: 4 } },
      h("table", { style: { borderCollapse: "collapse", width: "100%", fontSize: 12.5 } },
        h("thead", null, h("tr", { style: { background: faint } },
          columns.map((c) => h("th", { key: c, style: { ...cell, borderTop: 0, fontWeight: 600 } }, c)))),
        h("tbody", null, rows.slice(0, ROWS_SHOWN).map((r, i) => h("tr", { key: i },
          r.map((v, j) => h("td", { key: j, style: { ...cell, fontVariantNumeric: "tabular-nums" } },
            v === null || v === undefined ? "" : String(v)))))))),
    h("div", { style: { display: "flex", gap: 8, alignItems: "center", paddingTop: 8 } },
      h("button", { type: "button", style: button(false), onClick: copy }, copied ? "Copied" : "Copy"),
      h("button", { type: "button", style: button(false), onClick: csv }, "CSV"),
      h("span", { style: { ...quiet, fontSize: 12 } },
        total > rows.length || rows.length > ROWS_SHOWN
          ? `${Math.min(rows.length, ROWS_SHOWN)} of ${total} rows shown; Copy and CSV carry ${rows.length}`
          : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`)));
}

function Sql({ answer }) {
  return h("pre", {
    style: { margin: 0, padding: 10, border: `1px solid ${line}`, borderRadius: 4, background: faint, fontSize: 12,
             overflowX: "auto", whiteSpace: "pre" },
  }, answer.sql || "No SQL came back with this answer.");
}

function How({ answer, whole }) {
  const steps = answer.analysis?.steps ?? [];
  const trusted = Array.isArray(answer.trusted_metrics) ? answer.trusted_metrics : [];
  const cost = answer.receipt?.artifact?.payload?.cost;
  const row = (label, value) => h("div", { style: { display: "flex", gap: 12, padding: "5px 0", borderTop: `1px solid ${line}` } },
    h("span", { style: { ...quiet, flex: "0 0 150px" } }, label), h("span", { style: { minWidth: 0 } }, value));
  return h("div", { style: { fontSize: 12.5 } },
    answer.analysis?.intent ? h("div", { style: { paddingBottom: 8 } }, answer.analysis.intent) : null,
    steps.length ? h("ol", { style: { margin: "0 0 8px", paddingLeft: 18 } }, steps.map((s, i) => h("li", { key: i }, s))) : null,
    row("Approved definitions", trusted.length
      ? trusted.map((t) => (typeof t === "string" ? t : t?.name || t?.label || JSON.stringify(t))).join(", ")
      : "None reported for this answer"),
    row("Tables read", (answer.tables_used ?? []).join(", ") || "Not reported"),
    row("Receipt", answer.has_receipt ? `Kept in Pramanyx as ${answer.investigation_id}` : "None kept"),
    cost ? row("Cost in Pramanyx", `${cost.llm_calls} model calls, ${cost.total_tokens} tokens, ${cost.query_count} queries`) : null,
    whole ? null : row("Not shown", "The receipt was too long to reach this page whole. Open it in Pramanyx."));
}

const TABS = [["chart", "Chart", Chart], ["table", "Table", Table], ["sql", "SQL", Sql], ["how", "How it was answered", How]];

const TAIL = "data-pramanyx-answers";

/**
 * Where a turn's answers are shown: an empty place at the end of the turn, which each answer card moves itself
 * into. The shell folds a finished turn's tool calls away twice over ("Completed", then "Called tools"), and an
 * answer nobody unfolds is an answer in name only.
 */
function AnswerTail(props) {
  // A view is registered per exact tool name, and an agent's tool is named after the agent. The end of a turn is
  // told the turn's calls, so it is where a name not yet seen gets its view.
  useEffect(() => {
    for (const step of props.turn?.steps ?? []) {
      const blocks = step?.data?.entries?.get?.("assistant-step")?.value?.blocks ?? [];
      for (const block of blocks) if (block?.kind === "tool-call") showAnswersOf(block.name);
    }
  });
  return h("div", { [TAIL]: "" });
}

/**
 * The end-of-turn place for one tool row: the first one after it in the page. Found from the page itself, because
 * the tool row is told its call and the tail its turn, and nothing tells either which of the other it belongs to.
 */
function tailAfter(node) {
  for (const tail of document.querySelectorAll(`[${TAIL}]`)) {
    if (node.compareDocumentPosition(tail) & Node.DOCUMENT_POSITION_FOLLOWING) return tail;
  }
  return null;
}

function AnswerCard(props) {
  const here = useRef(null);
  const [tail, setTail] = useState(null);
  useEffect(() => {
    // The end of a turn does not exist while the turn is still running, and a live answer arrives long before it:
    // a first version looked for three seconds and gave up, so every card of a live turn stayed folded away. The
    // page is watched instead, for as long as the row lives, and the place is found again if the shell redraws it.
    let timer = null;
    const look = () => {
      timer = null;
      const row = here.current;
      if (!row) return;
      setTail((now) => (now && now.isConnected ? now : tailAfter(row)));
    };
    const watch = new MutationObserver(() => { if (timer === null) timer = setTimeout(look, 200); });
    watch.observe(document.body, { childList: true, subtree: true });
    look();
    return () => { watch.disconnect(); if (timer !== null) clearTimeout(timer); };
  }, []);
  const card = h(Card, props);
  // In the tool list: one line that says where the answer is. Until the end of the turn exists, the card itself.
  return h("div", { ref: here },
    tail ? h("div", { style: { ...quiet, fontSize: 12.5, padding: "2px 0" } }, "Pramanyx answered — shown below the reply") : card,
    tail ? createPortal(card, tail) : null);
}

function Card(props) {
  const [tab, setTab] = useState("chart");
  const frame = { border: `1px solid ${line}`, borderRadius: 6, padding: 12, margin: "6px 0", fontSize: 13 };
  const label = h("div", { style: { ...quiet, fontSize: 11, letterSpacing: "0.04em" } }, "PRAMANYX");

  if (props.phase !== "result") {
    let question = "";
    try { question = props.block?.args?.question ?? ""; } catch { question = ""; }
    return h("div", { style: frame }, label, h("div", { style: quiet }, question ? `Asking: ${question}` : "Asking Pramanyx"));
  }

  const read = readAnswer(resultText(props.block));
  if (!read || props.block?.isError) {
    return h("div", { style: frame }, label,
      h("div", null, props.block?.isError ? "Pramanyx could not answer this." : "Pramanyx answered, but this page could not read the result as an answer."),
      props.inspect ? h("div", { style: { paddingTop: 8 } },
        h("button", { type: "button", style: button(false), onClick: props.inspect }, "Open the raw result")) : null);
  }

  const { answer, whole } = read;
  const View = (TABS.find(([key]) => key === tab) ?? TABS[0])[2];
  return h("div", { style: frame },
    label,
    h("div", { style: { fontSize: 15, fontWeight: 600, padding: "2px 0 10px" } }, answer.answer || answer.question || "Answer"),
    h("div", { role: "tablist", style: { display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 10 } },
      TABS.map(([key, name]) => h("button", {
        key, type: "button", role: "tab", "aria-selected": tab === key, style: button(tab === key), onClick: () => setTab(key),
      }, name))),
    h(View, { answer, whole }));
}

export const inject = ["slots"];

/** Take over the display of Pramanyx's `ask` tool. Every other tool keeps the shell's own row. */
/** Give one tool the answer card, once. Set by `apply`; a name that is not an answer tool is left alone. */
let showAnswersOf = () => {};

export function apply(ctx) {
  const shown = new Set();
  showAnswersOf = (name) => {
    if (typeof name !== "string" || shown.has(name) || !ANSWERS.test(name)) return;
    shown.add(name);
    ctx.slots.inject("tool.call.toolview", () =>
      ctx.slots.register({ name: "tool.call.toolview", key: name }, AnswerCard));
  };
  showAnswersOf(TOOL);
  ctx.slots.inject("conversation.chat.turnTail", () =>
    ctx.slots.register({ name: "conversation.chat.turnTail", id: "pramanyx-coworker-answer-card" }, AnswerTail));
}
