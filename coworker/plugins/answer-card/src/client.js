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
 * It registers a view per Pramanyx tool in the shell's `tool.call.toolview` slot: the card for a tool that answers,
 * and for every tool a named row in the list of steps, so the work reads down as what was done and what it came
 * to. Nothing here calls Pramanyx, a model or the network: it reads the result the tool already returned.
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
      for (const block of blocks) if (block?.kind === "tool-call") nameStepsOf(block.name);
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
  // In the list of steps: the answer as a named row that opens to its SQL and rows. At the end of the turn, once
  // that place exists: the whole card.
  return h("div", { ref: here },
    h(AnswerStep, props),
    tail ? createPortal(h(Card, props), tail) : null);
}

/** What a call was given, whichever of the shell's shapes carries it. Nothing readable is an empty object. */
function argsOf(block) {
  const parsed = (raw) => {
    try {
      // The shell hands a call's arguments as the pieces they streamed in as (`chunks`, with `object` once they are
      // whole), as a reader to be called, as a plain object, or as the text they arrived in.
      let given = typeof raw === "function" ? raw() : raw;
      if (given && typeof given === "object" && Array.isArray(given.chunks)) {
        if (given.object && typeof given.object === "object") return given.object;
        given = given.chunks.join("");
      }
      if (given && typeof given === "object") return given;
      const value = JSON.parse(given);
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
  for (const raw of [block?.args, block?.argsRaw, block?.call?.args, block?.call?.argsRaw]) {
    const found = parsed(raw);
    if (Object.keys(found).length) return found;
  }
  return {};
}

const ICONS = {
  // A grid: something was read off the data.
  rows: [["rect", { x: 2, y: 2.5, width: 12, height: 11, rx: 1.5 }], ["path", { d: "M2 6.5h12M6.5 6.5v7" }]],
  // A page: something was read that a person or the platform wrote.
  read: [["path", { d: "M4 2h6l3 3v9H4z" }], ["path", { d: "M6.5 8h4M6.5 10.5h4" }]],
};

function Icon({ kind, busy }) {
  if (busy) return h("span", { className: "pramanyx-step-busy", "aria-hidden": "true" });
  return h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.2,
                    strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", style: { flex: "none", opacity: 0.7 } },
    (ICONS[kind] ?? ICONS.read).map(([tag, attrs], i) => h(tag, { key: i, ...attrs })));
}

/**
 * One step of the work, as a row a person can read down: what was done, in words, and what it came to. It opens
 * when there is something behind it. A row looks pressable before the pointer reaches it.
 */
function Step({ kind, title, note, busy, failed, children }) {
  const [open, setOpen] = useState(false);
  const opens = Boolean(children);
  return h("div", { className: "pramanyx-step", style: { border: `1px solid ${line}`, borderRadius: 4, margin: "3px 0", fontSize: 13 } },
    h("button", {
      type: "button", disabled: !opens, "aria-expanded": opens ? open : undefined, onClick: () => setOpen((was) => !was),
      style: { display: "flex", gap: 8, alignItems: "center", width: "100%", textAlign: "left", font: "inherit", color: "inherit",
               background: open ? faint : "transparent", border: 0, padding: "7px 10px", cursor: opens ? "pointer" : "default" },
    },
      h(Icon, { kind, busy }),
      h("span", { style: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...(busy ? quiet : {}) } }, title),
      failed ? h("span", { style: { flex: "none", fontSize: 12 } }, "did not work") : note ? h("span", { style: { ...quiet, flex: "none", fontSize: 12 } }, note) : null),
    open && opens ? h("div", { style: { padding: 10, borderTop: `1px solid ${line}`, display: "flex", flexDirection: "column", gap: 10 } }, children) : null);
}

/** An answer in the list of steps: named by what Pramanyx found, opening to the SQL and the rows. */
function AnswerStep(props) {
  const asked = String(argsOf(props.block).question || "");
  if (props.phase !== "result") return h(Step, { kind: "rows", busy: true, title: asked ? `Asking Pramanyx: ${asked}` : "Asking Pramanyx" });
  const read = readAnswer(resultText(props.block));
  if (!read || props.block?.isError) {
    return h(Step, { kind: "rows", failed: true, title: asked || "A question to Pramanyx" },
      h("pre", { style: { margin: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, resultText(props.block).slice(0, 2000) || "Nothing came back."));
  }
  const { answer } = read;
  const count = typeof answer.row_count === "number" ? answer.row_count : (answer.rows ?? []).length;
  return h(Step, { kind: "rows", title: answer.answer || asked || "An answer from Pramanyx", note: `${count} ${count === 1 ? "row" : "rows"}` },
    h(Sql, { answer }), h(Table, { answer }));
}

/**
 * Pramanyx's other tools, in the words of what each does. A tool's wire name is `mcp__pramanyx__get_metric`; a
 * person reading the steps is told a metric's definition was read, and which. The second entry names the argument
 * that says which. A tool not listed is named from its own name, with the underscores taken out.
 */
const DOES = {
  deep_analysis: ["Ran a deep analysis", ["question"]],
  explore: ["Explored", ["question", "topic", "focus"]],
  explain: ["Asked how an answer was reached", ["investigation_id"]],
  get_metric: ["Read the definition of the metric", ["name", "metric", "metric_name"]],
  describe_entity: ["Read the object", ["entity", "name", "entity_id"]],
  get_object: ["Read the object", ["name", "object", "object_id", "id"]],
  list_objects: ["Listed the objects", ["kind", "type"]],
  search_graph: ["Searched what is already known about", ["query", "q", "question"]],
  list_findings: ["Read earlier findings", ["query", "table"]],
  list_trusted_queries: ["Read the trusted queries", []],
  get_table_health: ["Checked the health of the table", ["table", "table_name"]],
  table_popularity: ["Read which tables are used most", []],
  list_connections: ["Listed the connections", []],
  list_platform_connections: ["Listed the connections", []],
  get_briefing: ["Read the Briefing", []],
  get_investigation: ["Read an earlier analysis", ["investigation_id", "id"]],
  list_runs: ["Listed recent runs", []],
  inspect_run: ["Looked into a run", ["trace_id"]],
  read_run_span: ["Read one step of a run", ["span_id"]],
  get_job: ["Checked on a job", ["job_id", "id"]],
  list_jobs: ["Listed the jobs", []],
  read_claims: ["Read the Record", ["subject", "kind"]],
  read_contract: ["Read the agent contract", []],
  read_restatements: ["Read what was restated", []],
  post_claim: ["Wrote a claim to the Record", ["subject", "kind"]],
  answer_accuracy: ["Read how accurate answers have been", []],
  ground_agent: ["Read what an agent rests on", ["agent", "agent_id"]],
  investigation_cadence: ["Read how often analyses run", []],
  review_missed_move: ["Reviewed a missed move", ["id"]],
  platform_audit: ["Read the audit log", []],
  platform_guide: ["Read the platform guide", ["topic"]],
  platform_limits: ["Read the platform's limits", []],
  platform_premortem: ["Read the platform's pre-mortem", []],
  platform_runs: ["Read the platform's runs", []],
  platform_traces: ["Read the platform's traces", []],
  platform_usage: ["Read usage and spend", []],
};
const PREFIX = "mcp__pramanyx__";

function saidOf(toolName, args) {
  const short = toolName.startsWith(PREFIX) ? toolName.slice(PREFIX.length) : toolName;
  const [does, whichKeys] = DOES[short] ?? [short.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), []];
  const which = whichKeys.map((key) => args[key]).find((value) => typeof value === "string" && value.trim());
  return which ? `${does}: ${which}` : does;
}

/** Any other Pramanyx tool in the list of steps: named by what it does, opening to what came back. */
function ToolStep(props) {
  const title = saidOf(props.toolName || "", argsOf(props.block));
  if (props.phase !== "result") return h(Step, { kind: "read", busy: true, title });
  const text = resultText(props.block);
  return h(Step, { kind: "read", title, failed: Boolean(props.block?.isError) },
    text ? h("pre", { style: { margin: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 320, overflow: "auto" } },
      text.length > 6000 ? `${text.slice(0, 6000)}\n… and ${text.length - 6000} more characters, not shown` : text) : null);
}

/**
 * The steps as one line to read down. The shell lays a turn's work out as a column: the model's own sentence
 * (`assistant-step`), then a group holding the calls it made for it (`data-step-process`), then the next sentence.
 * A rule is drawn down the left of each sentence that is followed by a group, and of each group, with a dot at the
 * sentence — so the sentences read as the plan and the rows under each as what was done for it. The reply itself
 * is a sentence followed by no group, and is left as it is. Matched by the shell's own data attributes; if those
 * change, the column is drawn as the shell draws it.
 */
const STEPS_LOOK = `
[data-chat-flow-kind="assistant-step"]:has(+ [data-step-process]),
[data-step-process] {
  position: relative; margin-left: 7px; padding-left: 16px;
  border-left: 1px solid color-mix(in srgb, currentColor 22%, transparent);
}
/* The rule carries on across the gap the shell leaves between one row of the column and the next. */
[data-chat-flow-kind="assistant-step"]:has(+ [data-step-process])::after,
[data-step-process]:has(+ [data-chat-flow-kind="assistant-step"] + [data-step-process])::after {
  content: ""; position: absolute; left: -1px; top: 100%; height: var(--dsh-chat-flow-gap, 12px);
  border-left: 1px solid color-mix(in srgb, currentColor 22%, transparent);
}
[data-chat-flow-kind="assistant-step"]:has(+ [data-step-process])::before {
  content: ""; position: absolute; left: -4px; top: 0.72em; width: 7px; height: 7px; border-radius: 50%;
  background: color-mix(in srgb, currentColor 55%, var(--dsw-alias-bg-base, #111113));
}
/*
 * A group of calls is shown open, without its own "Called tools" fold. The turn already has one fold ("Completed
 * in …"); a second inside it, per group, meant a click for every row before any of the work could be read.
 */
[data-step-process]:has(> div > button[data-process-activity="tools"]) > [data-step-process-body] {
  content-visibility: visible !important; display: block !important; height: auto !important; overflow: visible !important;
}
[data-step-process] > div > button[data-process-activity="tools"] { display: none; }
.pramanyx-step-busy {
  flex: none; width: 12px; height: 12px; border-radius: 50%; box-sizing: border-box;
  border: 1.5px solid currentColor; border-right-color: transparent; opacity: 0.7;
  animation: pramanyx-step-turn 0.9s linear infinite;
}
@keyframes pramanyx-step-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pramanyx-step-busy { animation: none; } }
`;

function wearStepsLook() {
  let style = document.getElementById("pramanyx-steps-look");
  if (!style) {
    style = document.createElement("style");
    style.id = "pramanyx-steps-look";
    document.head.appendChild(style);
  }
  style.textContent = STEPS_LOOK;
}

function Card(props) {
  const [tab, setTab] = useState("chart");
  const frame = { border: `1px solid ${line}`, borderRadius: 6, padding: 12, margin: "6px 0", fontSize: 13 };
  const label = h("div", { style: { ...quiet, fontSize: 11, letterSpacing: "0.04em" } }, "PRAMANYX");

  if (props.phase !== "result") {
    const question = String(argsOf(props.block).question || "");
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

/**
 * Give one Pramanyx tool its row in the list of steps, once: the answer card for a tool that answers, a named
 * step for any other. Set by `apply`. A tool that is not Pramanyx's keeps the shell's own row.
 */
let nameStepsOf = () => {};

export function apply(ctx) {
  const named = new Set();
  nameStepsOf = (name) => {
    if (typeof name !== "string" || named.has(name) || !name.startsWith(PREFIX)) return;
    named.add(name);
    ctx.slots.inject("tool.call.toolview", () =>
      ctx.slots.register({ name: "tool.call.toolview", key: name }, ANSWERS.test(name) ? AnswerCard : ToolStep));
  };
  // The tools known when this was written are named from the first call. A view is keyed by exact tool name, so
  // one added to Pramanyx since — and each custom agent's — gets its view at the end of the first turn that calls it.
  nameStepsOf(TOOL);
  for (const short of Object.keys(DOES)) nameStepsOf(PREFIX + short);
  wearStepsLook();
  ctx.slots.inject("conversation.chat.turnTail", () =>
    ctx.slots.register({ name: "conversation.chat.turnTail", id: "pramanyx-coworker-answer-card" }, AnswerTail));
}
