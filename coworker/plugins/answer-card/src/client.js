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
import {
  PANE, PANE_PATTERN, PaneBody, groundingOf, pageFor, PaneTitle, ResultGrid, button, faint, hasPane, idOf, line, openBeside, quiet, remember,
  rememberThing, setOpener, thingId, useChosen,
} from "./exhibit";

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
    return { answer: inOneShape(JSON.parse(text)), whole: true };
  } catch {
    const at = text.indexOf('\n  "receipt":');
    if (at < 0) return null;
    try {
      return { answer: inOneShape(JSON.parse(text.slice(0, at).replace(/,\s*$/, "") + "\n}")), whole: false };
    } catch {
      return null;
    }
  }
}

/**
 * A custom agent's answer names two things differently from `ask`'s: its sentence is `headline`, and its receipt
 * is a `receipt_id`. Read as `ask`'s, the card was titled with the question and said no receipt was kept.
 */
function inOneShape(answer) {
  if (!answer || typeof answer !== "object") return answer;
  const out = { ...answer };
  if (out.answer == null && typeof out.headline === "string" && out.headline) out.answer = out.headline;
  if (out.has_receipt == null && out.receipt_id) out.has_receipt = true;
  return out;
}

/**
 * The chart, drawn to the width it has — and drawn again when that width changes. A chart is laid out for a width
 * in pixels when it is drawn; when the right-hand pane opened and the conversation narrowed, the chart kept its
 * old width and ran off the edge of its card.
 */
function Chart({ answer, viz }) {
  const box = useRef(null);
  const [none, setNone] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let waiting = 0;
    const watch = new ResizeObserver(() => {
      clearTimeout(waiting);
      waiting = setTimeout(() => setWidth(Math.floor(el.clientWidth)), 120);
    });
    watch.observe(el);
    return () => { clearTimeout(waiting); watch.disconnect(); };
  }, []);
  useEffect(() => {
    if (!box.current) return undefined;
    let remove = null;
    try {
      remove = drawChart(box.current, {
        columns: answer.columns ?? [], rows: answer.rows ?? [], chart_type: answer.chart_type,
        chart_config: answer.chart_config, column_units: answer.column_units, title: null, viz,
      });
    } catch {
      remove = null;
    }
    setNone(!remove);
    return () => { if (remove) remove(); };
  }, [answer, viz, width]);
  return h("div", { style: { minWidth: 0 } },
    h("div", { ref: box, style: { width: "100%", minHeight: none ? 0 : 220, overflow: "hidden" } }),
    none ? h("div", { style: { ...quiet, padding: "8px 0" } },
      "These rows have no chart worth drawing. The table has them.") : null);
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
    row("Receipt", answer.has_receipt ? `Kept as ${answer.investigation_id || answer.receipt_id}` : "None kept"),
    cost ? row("Cost", `${cost.llm_calls} model calls, ${cost.total_tokens} tokens, ${cost.query_count} queries`) : null,
    whole ? null : row("Not shown", "The receipt was too long to show here whole."));
}

/**
 * A result in words, with nothing run: the question was declined ("X is not present in this data"), or it was
 * answered from the glossary. Such a result has no chart, table or SQL. It gets no card; in the work it is a row
 * that says "no query run" and opens to the words.
 */
const inWordsOnly = (answer) => !answer.sql && !(answer.rows ?? []).length;

function Words({ answer, asked }) {
  const question = asked || answer.question || "";
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
    h("div", { style: { overflowWrap: "anywhere", whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" } }, answer.answer || "Nothing came back."),
    question ? h("div", { style: { ...quiet, fontSize: 12.5 } }, `Asked: ${question}`) : null,
    h("div", { style: { ...quiet, fontSize: 12.5 } }, "No query was run for this, so there is no chart, table or SQL."));
}

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
  if (props.phase !== "result") return h(Step, { kind: "rows", busy: true, title: asked ? `Asking: ${asked}` : "Asking" });
  const read = readAnswer(resultText(props.block));
  if (!read || props.block?.isError) {
    return h(Step, { kind: "rows", failed: true, title: asked || "A question" },
      h("pre", { style: { margin: 0, fontSize: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, resultText(props.block).slice(0, 2000) || "Nothing came back."));
  }
  const { answer } = read;
  if (inWordsOnly(answer)) {
    return h(Step, { kind: "rows", title: asked || answer.answer || "A question", note: "no query run" }, h(Words, { answer }));
  }
  const count = typeof answer.row_count === "number" ? answer.row_count : (answer.rows ?? []).length;
  return h(Step, { kind: "rows", title: answer.answer || asked || "An answer", note: `${count} ${count === 1 ? "row" : "rows"}` },
    h(Sql, { answer }), h(ResultGrid, { answer, compact: true }));
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

/**
 * Any other Pramanyx tool in the list of steps: named by what it does, opening to what came back. What came back
 * — a metric's definition, an object of the ontology, the Briefing, earlier findings — can be opened beside the
 * conversation, laid out to be read, as a tab that stays while the conversation goes on.
 */
function ToolStep(props) {
  const args = argsOf(props.block);
  const title = saidOf(props.toolName || "", args);
  const done = props.phase === "result";
  const text = done ? resultText(props.block) : "";
  const failed = Boolean(props.block?.isError);
  const id = thingId(props.toolName || "", args);
  let value = null;
  if (done && !failed && text) { try { value = JSON.parse(text); } catch { value = null; } }
  const opens = value !== null && typeof value === "object" && hasPane();
  useEffect(() => { if (opens) rememberThing(id, title, value); }, [opens, id, title, text]);
  if (!done) return h(Step, { kind: "read", busy: true, title });
  return h(Step, { kind: "read", title, failed },
    opens ? h("div", null, h("button", { type: "button", style: button(false), onClick: () => openBeside("thing", id) }, "Open beside the conversation")) : null,
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
/*
 * Folding the turn folds all of the work. The shell hides only the calls and leaves what was said between them
 * standing, so a "folded" turn was still a screen of working notes above the answer. A note that leads into
 * hidden calls is part of the work and goes with it; the last thing said — the answer — is followed by no calls
 * and stays.
 */
[data-chat-flow-kind="assistant-step"]:has(+ [data-step-process][hidden]) { display: none; }
/*
 * While a turn runs, its work is folded to one row: the latest call, or what is being said now. The shell keeps a
 * running turn wide open, so a long one pushed the question off the screen before there was an answer to read.
 * A running turn is the one whose fold has no button yet. "Show the work" on the running line opens it all.
 */
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-chat-flow-kind="assistant-step"]:has(+ [data-step-process]),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process]:has(~ [data-step-process]),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content] > :not(:last-child):not(:has(.pramanyx-step-busy)),
/* Calls made together finish in any order: the row shown is the last one still running, and the last row only when none is. */
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content] > :has(.pramanyx-step-busy):has(~ * .pramanyx-step-busy),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content]:has(.pramanyx-step-busy) > :last-child:not(:has(.pramanyx-step-busy)) {
  display: none;
}
.pramanyx-live-work {
  position: absolute; right: 0; top: 2px; font: inherit; font-size: 12px; padding: 2px 10px; border-radius: 4px;
  cursor: pointer; color: inherit; background: transparent;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
}
/* The pencil on a chart: there when the chart is pointed at or the pencil is reached by keyboard, as in the app. */
.pramanyx-exhibit-edit {
  position: absolute; top: 2px; right: 2px; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; color: inherit; opacity: 0;
  background: var(--dsw-alias-bg-base, #111113); border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
}
.pramanyx-exhibit-chart:hover .pramanyx-exhibit-edit, .pramanyx-exhibit-edit:focus-visible { opacity: 1; }
.pramanyx-step-busy {
  flex: none; width: 12px; height: 12px; border-radius: 50%; box-sizing: border-box;
  border: 1.5px solid currentColor; border-right-color: transparent; opacity: 0.7;
  animation: pramanyx-step-turn 0.9s linear infinite;
}
@keyframes pramanyx-step-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { /*
 * While a turn runs, its work is folded to one row: the latest call, or what is being said now. The shell keeps a
 * running turn wide open, so a long one pushed the question off the screen before there was an answer to read.
 * A running turn is the one whose fold has no button yet. "Show the work" on the running line opens it all.
 */
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-chat-flow-kind="assistant-step"]:has(+ [data-step-process]),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process]:has(~ [data-step-process]),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content] > :not(:last-child):not(:has(.pramanyx-step-busy)),
/* Calls made together finish in any order: the row shown is the last one still running, and the last row only when none is. */
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content] > :has(.pramanyx-step-busy):has(~ * .pramanyx-step-busy),
:root:not([data-pramanyx-live-work="open"]) [data-chat-flow-kind="turn-process"]:not(:has(button[data-turn-process])) ~ [data-step-process] [data-step-process-content]:has(.pramanyx-step-busy) > :last-child:not(:has(.pramanyx-step-busy)) {
  display: none;
}
.pramanyx-live-work {
  position: absolute; right: 0; top: 2px; font: inherit; font-size: 12px; padding: 2px 10px; border-radius: 4px;
  cursor: pointer; color: inherit; background: transparent;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
}
.pramanyx-step-busy { animation: none; } }
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

/**
 * The control that opens a running turn's work, on the shell's own running line. The line is the shell's and has
 * no place for a plugin, so the button is put there by hand and put back if the shell redraws the line. Whether
 * the work is open is kept on the page's root and forgotten when the run ends: the next run starts folded.
 */
function foldRunningWork() {
  const root = document.documentElement;
  const KEY = "data-pramanyx-live-work";
  const words = () => (root.getAttribute(KEY) === "open" ? "Hide the work" : "Show the work");
  const tend = () => {
    const running = document.querySelector("[data-chat-running]:not([data-holding])");
    if (!running) { if (root.hasAttribute(KEY)) root.removeAttribute(KEY); return; }
    let control = running.querySelector(":scope > .pramanyx-live-work");
    if (!control) {
      control = document.createElement("button");
      control.type = "button";
      control.className = "pramanyx-live-work";
      control.addEventListener("click", () => {
        if (root.getAttribute(KEY) === "open") root.removeAttribute(KEY); else root.setAttribute(KEY, "open");
        control.textContent = words();
      });
      running.appendChild(control);
    }
    if (control.textContent !== words()) control.textContent = words();
  };
  new MutationObserver(tend).observe(document.body, { childList: true, subtree: true });
  tend();
}

const SAID = "pramanyx.coworker.said.";

async function say(path, body) {
  const answer = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!answer.ok) throw new Error(String(answer.status));
  return answer.json().catch(() => ({}));
}

/**
 * Was this right? The one thing a card writes. It goes to Pramanyx as the app's own control sends it: the
 * judgement to the answer's record, and — when a person says what was wrong, or gives the SQL that would have
 * been right — a verdict that later answers on the connection are given. What was said is remembered in this
 * browser by the answer's id, so a card reopened later says what was said and does not ask again.
 */
function Feedback({ answer }) {
  const id = String(answer.investigation_id || "");
  const connection = String(answer.connection || "");
  const kept = () => { try { return localStorage.getItem(SAID + id) || ""; } catch { return ""; } };
  const [said, setSaid] = useState(kept);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [fix, setFix] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!id || !connection) return null;

  const settle = (what) => { try { localStorage.setItem(SAID + id, what); } catch { /* said for this visit */ } setSaid(what); };
  const judge = async (verdict) => {
    setBusy(true); setFailed(false);
    try {
      const got = await say("/pramanyx-feedback", { connection, answer: id, verdict });
      if (verdict === "helpful") settle(got.accepted ? "right-kept" : "right");
      else { settle("wrong"); setAsking(true); }
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const explain = async () => {
    setBusy(true); setFailed(false);
    try {
      await say("/pramanyx-verdict", {
        connection, answer: id, verdict: fix.trim() ? "correct" : "reject", note: note.trim(),
        headline: answer.answer || "", sql: answer.sql || "", corrected_sql: fix.trim(),
      });
      settle(fix.trim() ? "corrected" : "explained"); setAsking(false);
    } catch { setFailed(true); } finally { setBusy(false); }
  };

  const SAYS = {
    "right": "You said this was right. Recorded.",
    "right-kept": "You said this was right. It is kept as an accepted answer.",
    "wrong": "You said this was wrong. Recorded.",
    "explained": "You said this was wrong, and why. Later answers on this connection are given it.",
    "corrected": "You gave the SQL that would have been right. Later answers on this connection are given it.",
  };
  const field = { font: "inherit", fontSize: 12.5, color: "inherit", background: "transparent", border: `1px solid ${line}`,
                  borderRadius: 4, padding: "6px 8px", width: "100%", boxSizing: "border-box", resize: "vertical" };
  return h("div", { style: { borderTop: `1px solid ${line}`, marginTop: 12, paddingTop: 10, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8 } },
    said && !asking ? h("div", { style: quiet }, SAYS[said] ?? SAYS.right)
      : !asking ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
          h("span", { style: quiet }, "Was this right?"),
          h("button", { type: "button", disabled: busy, style: button(false), onClick: () => judge("helpful") }, "Right"),
          h("button", { type: "button", disabled: busy, style: button(false), onClick: () => judge("unhelpful") }, "Wrong"))
        : null,
    asking ? h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
      h("div", { style: quiet }, SAYS.wrong),
      h("label", { htmlFor: `why-${id}` }, "What was wrong?"),
      h("textarea", { id: `why-${id}`, rows: 2, value: note, onChange: (e) => setNote(e.target.value), style: field }),
      h("label", { htmlFor: `fix-${id}` }, "The SQL that would have been right, if you have it"),
      h("textarea", { id: `fix-${id}`, rows: 3, value: fix, onChange: (e) => setFix(e.target.value), style: { ...field, fontFamily: "ui-monospace, monospace" } }),
      h("div", { style: { display: "flex", gap: 8 } },
        h("button", { type: "button", disabled: busy || !(note.trim() || fix.trim()), style: button(false), onClick: explain }, "Record it"),
        h("button", { type: "button", disabled: busy, style: button(false), onClick: () => setAsking(false) }, "Leave it at wrong"))) : null,
    failed ? h("div", null, "That was not recorded. Try again.") : null);
}

/** A pencil, for "Edit visualization". */
const Pencil = () => h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
  h("path", { d: "M11.2 2.6l2.2 2.2-7.6 7.6-3 .8.8-3z" }), h("path", { d: "M9.8 4l2.2 2.2" }));

/**
 * An answer, as a Data Canvas shows one. The chart; under it the tables it read and how many rows, and on the
 * right Table and SQL. Table opens the rows in place. SQL opens the query and the rows beside the conversation,
 * in the shell's right-hand pane, and the pencil on the chart opens its editor there — where the shell has no
 * such pane, the SQL opens in place and there is no pencil.
 */
function Exhibit({ answer, whole, asked }) {
  const id = idOf(answer, asked);
  const viz = useChosen(id);
  const [open, setOpen] = useState("");
  useEffect(() => { remember(id, answer, asked); }, [id, answer, asked]);
  const frame = { border: `1px solid ${line}`, borderRadius: 6, padding: 12, margin: "6px 0", fontSize: 13 };
  const count = typeof answer.row_count === "number" ? answer.row_count : (answer.rows ?? []).length;
  const read = (answer.tables_used ?? []).join(", ");
  const toggle = (what) => setOpen((was) => (was === what ? "" : what));
  const ground = groundingOf(answer);
  const metrics = ground ? ground.metrics : [];
  // The ontology's objects the receipt names, then any table read that is not one of them under another spelling
  // (`orders` is the object `Order`).
  const same = (a, b) => a.toLowerCase().replace(/s$/, "") === b.toLowerCase().replace(/s$/, "");
  const objects = ground ? ground.objects : [];
  const tables = [...objects, ...(answer.tables_used ?? []).filter((t) => !objects.some((o) => same(o, t)))];
  const receipt = answer.receipt?.artifact?.id || "";
  const connection = String(answer.connection || answer.receipt?.artifact?.conn_id || "");
  return h("div", { style: frame },
    h("div", { style: { fontSize: 15, fontWeight: 600, padding: "0 0 10px" } }, answer.answer || answer.question || "Answer"),
    h("div", { className: "pramanyx-exhibit-chart", style: { position: "relative" } },
      h(Chart, { answer, viz }),
      hasPane() ? h("button", {
        type: "button", className: "pramanyx-exhibit-edit", "aria-label": "Edit visualization", title: "Edit visualization",
        onClick: () => openBeside("viz", id),
      }, h(Pencil)) : null),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingTop: 8 } },
      read ? h("span", { style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 } }, read) : null,
      h("span", { style: { ...quiet, fontSize: 12.5 } }, `${count} ${count === 1 ? "row" : "rows"}`),
      h("span", { style: { flex: "1 1 auto" } }),
      h("button", { type: "button", "aria-expanded": open === "table", style: button(open === "table"), onClick: () => toggle("table") },
        `${open === "table" ? "⌄" : "›"} Table`),
      h("button", { type: "button", style: button(open === "sql"), onClick: () => { if (!openBeside("sql", id)) toggle("sql"); } }, "SQL"),
      h("button", { type: "button", "aria-expanded": open === "how", style: button(open === "how"), onClick: () => toggle("how") }, "How it was answered"),
      receipt && hasPane() ? h("button", { type: "button", style: button(false), title: "The app's own page for how this number was produced",
        onClick: () => openBeside("page", pageFor.receipt(receipt)) }, "Why this number") : null),
    // What the answer was held to and what it read, each opening the app's own page for it beside the conversation.
    hasPane() && connection && (metrics.length || tables.length) ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", paddingTop: 8, fontSize: 12.5 } },
      metrics.map((m) => h("button", {
        key: `m-${m.name}`, type: "button", style: button(false), title: m.departed ? "The answer did not use this metric as approved. Opens its definition." : "Opens this metric's definition",
        onClick: () => openBeside("page", pageFor.metric(m.name, connection)),
      }, m.departed ? `Metric · ${m.name} · not used as approved` : `Metric · ${m.name}`)),
      tables.map((t) => h("button", {
        key: `t-${t}`, type: "button", style: button(false), title: "Opens this object in the ontology",
        onClick: () => openBeside("page", pageFor.type(t, connection)),
      }, `Ontology · ${t}`))) : null,
    open === "table" ? h("div", { style: { paddingTop: 10 } }, h(ResultGrid, { answer })) : null,
    open === "sql" ? h("div", { style: { paddingTop: 10 } }, h(Sql, { answer })) : null,
    open === "how" ? h("div", { style: { paddingTop: 10 } }, h(How, { answer, whole })) : null,
    h(Feedback, { answer }));
}

function Card(props) {
  const frame = { border: `1px solid ${line}`, borderRadius: 6, padding: 12, margin: "6px 0", fontSize: 13 };
  const asked = String(argsOf(props.block).question || "");

  if (props.phase !== "result") {
    return h("div", { style: frame }, h("div", { style: quiet }, asked ? `Asking: ${asked}` : "Asking"));
  }

  const read = readAnswer(resultText(props.block));
  if (!read || props.block?.isError) {
    return h("div", { style: frame },
      h("div", null, props.block?.isError ? "This could not be answered." : "An answer came back, but this page could not read it."),
      props.inspect ? h("div", { style: { paddingTop: 8 } },
        h("button", { type: "button", style: button(false), onClick: props.inspect }, "Open the raw result")) : null);
  }

  // Nothing was run, so there is nothing to draw. It is a row in the work ("no query run"), not a card among the
  // answers: a card of words under the reply read as a finding, and a long one buried the real answers.
  if (inWordsOnly(read.answer)) return null;
  return h(Exhibit, { answer: read.answer, whole: read.whole, asked });
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
  foldRunningWork();
  // The shell's right-hand pane, when it has one: one kind of tab, for an answer's SQL and rows and for its chart's
  // editor. Without it the SQL opens in the card and there is no editor.
  ctx.inject(["sidebarRightTabs", "sidebarRight"], (at) => {
    at.effect(() => at.sidebarRightTabs.register({
      id: PANE, kind: PANE, patterns: [PANE_PATTERN], canOpen: () => true, title: () => "Answer",
    }), "pramanyx-answer-card: pane type");
    at.effect(() => at.slots.inject("sidebar.right.pane.tab", () =>
      at.slots.register({ name: "sidebar.right.pane.tab", key: PANE }, PaneBody)), "pramanyx-answer-card: pane body");
    at.effect(() => at.slots.inject("sidebar.right.pane.tab.title", () =>
      at.slots.register({ name: "sidebar.right.pane.tab.title", key: PANE }, PaneTitle)), "pramanyx-answer-card: pane title");
    setOpener((address) => at.sidebarRight.openResource(address));
    at.effect(() => () => setOpener(null), "pramanyx-answer-card: pane opener");
  });
  ctx.slots.inject("conversation.chat.turnTail", () =>
    ctx.slots.register({ name: "conversation.chat.turnTail", id: "pramanyx-coworker-answer-card" }, AnswerTail));
}
