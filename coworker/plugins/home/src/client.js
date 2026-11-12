/**
 * The coworker's first screen and its Agents page. Under the question box: questions worth asking of one connection, the questions
 * asked lately, and a person's own agents. Everything on it is read from Pramanyx through this plugin's relay
 * (`lib/index.js`), and every item does one thing: it writes a question into the box. The connection is the one
 * the conversation is filed under — the shell's own picker above the box — and the agent already knows it. Nothing here asks anything
 * by itself — a person reads the question and sends it.
 *
 * The shell has no place under the question box on a new conversation: its one slot on that screen sits in the
 * row above it. This fills that slot with nothing visible and draws the block into an element it adds at the end
 * of the box's own column. That is a workaround, found by the column's class name; if the shell renames it the
 * block is drawn in the row above the box, where the slot is.
 */
import { createElement as h, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CHOSEN = "pramanyx.coworker.connection";
const QUESTIONS_SHOWN = 4;

const line = "color-mix(in srgb, currentColor 16%, transparent)";
const faint = "color-mix(in srgb, currentColor 5%, transparent)";
const quiet = { opacity: 0.66 };

async function read(path) {
  const answer = await fetch(`/pramanyx${path}`, { headers: { accept: "application/json" } });
  if (!answer.ok) throw new Error(`${path}: ${answer.status}`);
  return answer.json();
}

function remembered() {
  try { return localStorage.getItem(CHOSEN) || ""; } catch { return ""; }
}

function remember(id) {
  try { localStorage.setItem(CHOSEN, id); } catch { /* a private window: the choice lasts this visit */ }
}

/** How long ago, in the fewest words. */
function ago(stamp) {
  const then = Date.parse(stamp);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return `${minutes || 1}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

/** A row that writes a question into the box. It looks pressable before the pointer reaches it. */
function Row({ text, note, onPick }) {
  return h("button", {
    type: "button", onClick: onPick, title: text,
    style: {
      display: "flex", gap: 10, alignItems: "baseline", width: "100%", textAlign: "left", font: "inherit",
      fontSize: 13, color: "inherit", cursor: "pointer", padding: "7px 10px", background: "transparent",
      border: `1px solid ${line}`, borderRadius: 4,
    },
  },
    h("span", { style: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, text),
    note ? h("span", { style: { ...quiet, flex: "none", fontSize: 12 } }, note) : null);
}

function Card({ title, empty, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  return h("section", { style: { flex: "1 1 280px", minWidth: 0, border: `1px solid ${line}`, borderRadius: 6, padding: 12, background: faint } },
    h("div", { style: { ...quiet, fontSize: 12, paddingBottom: 8 } }, title),
    rows && rows.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, rows) : h("div", { style: { ...quiet, fontSize: 12.5 } }, empty));
}

function Block({ inputActions, here }) {
  const [connections, setConnections] = useState(null);
  const [chosen, setChosen] = useState(remembered);
  const [questions, setQuestions] = useState(null);
  const [recent, setRecent] = useState(null);
  const [agents, setAgents] = useState(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([read("/connections"), read("/investigations?limit=6"), read("/agents/custom")])
      .then(([all, asked, mine]) => {
        if (!live) return;
        setConnections(all); setRecent(asked); setAgents(mine.filter((a) => a.enabled !== false));
        // With no choice made here yet: the connection last asked about, since that is where the person was working.
        setChosen((now) => (now && all.some((c) => c.id === now)) ? now : (asked[0]?.connection_id || all[0]?.id || ""));
      })
      .catch(() => { if (live) setDown(true); });
    return () => { live = false; };
  }, []);

  const asked = (connections ?? []).some((c) => c.id === here) ? here : chosen;
  useEffect(() => {
    if (!asked) return undefined;
    let live = true;
    setQuestions(null);
    read(`/suggestions?connection_id=${encodeURIComponent(asked)}`)
      .then((got) => { if (live) setQuestions(got.suggestions ?? []); })
      .catch(() => { if (live) setQuestions([]); });
    return () => { live = false; };
  }, [asked]);

  if (down) {
    return h("div", { style: { ...quiet, fontSize: 12.5, paddingTop: 14 } },
      "Pramanyx is not answering, so there are no suggestions to show. You can still ask.");
  }
  if (!connections) return null;

  const named = (id) => connections.find((c) => c.id === id)?.name || id;
  // The connection this conversation is filed under, when it is one of the workspaces the host half makes for
  // each connection. The agent has been told it in its instructions, so a question about it is written plainly.
  // A question about ANOTHER connection still says which, in words, because nothing else would.
  const settled = connections.some((c) => c.id === here) ? here : "";
  const shown = settled || chosen;
  const ask = (question, id) =>
    inputActions?.setDraft?.(id === settled ? question : `${question} (on ${named(id)}, connection ${id})`);

  // Inset as the box above it is, so the block's edges meet the box's.
  const inset = "var(--dsh-composer-side-clearance, 14px)";
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 12, padding: `16px ${inset} 0`, fontSize: 13 } },
    settled ? h("div", { style: quiet }, `Questions for ${named(settled)}. Choose another connection above the box.`)
    : h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
      h("label", { htmlFor: "pramanyx-connection", style: quiet }, "Questions for"),
      h("select", {
        id: "pramanyx-connection", value: chosen,
        onChange: (e) => { remember(e.target.value); setChosen(e.target.value); },
        style: { font: "inherit", color: "inherit", background: "transparent", border: `1px solid ${line}`, borderRadius: 4, padding: "3px 8px" },
      }, connections.map((c) => h("option", { key: c.id, value: c.id }, c.name)))),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
      questions === null ? h("div", { style: quiet }, "Reading the questions worth asking…")
        : questions.length ? questions.slice(0, QUESTIONS_SHOWN).map((q) => h(Row, { key: q.text, text: q.text, onPick: () => ask(q.text, shown) }))
          : h("div", { style: quiet }, "Pramanyx has no suggested questions for this connection yet.")),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 12 } },
      h(Card, { title: "Asked lately", empty: "Nothing has been asked yet." },
        (recent ?? []).slice(0, 5).map((r) => h(Row, {
          key: r.id, text: r.question, note: `${named(r.connection_id)} · ${ago(r.started_at)}`,
          onPick: () => ask(r.question, r.connection_id),
        }))),
      h(Card, { title: "Your agents", empty: "No agents yet. They are made in Pramanyx." },
        (agents ?? []).slice(0, 5).map((a) => h(Row, {
          key: a.id, text: a.name, note: a.connection_id ? named(a.connection_id) : "",
          onPick: () => inputActions?.setDraft?.(`Ask the ${a.name} agent: `),
        })))));
}

/** The slot's occupant: nothing to see in the row above the box, and the block drawn below it. */
function Home(props) {
  const here = useRef(null);
  const [below, setBelow] = useState(null);
  const [inRow, setInRow] = useState(false);
  useEffect(() => {
    let column = here.current;
    while (column && !String(column.className).includes("composerStack")) column = column.parentElement;
    if (!column) { setInRow(true); return undefined; }
    const place = document.createElement("div");
    place.setAttribute("data-pramanyx-home", "");
    column.appendChild(place);
    setBelow(place);
    return () => { place.remove(); setBelow(null); };
  }, []);
  // The folder this conversation is filed under. The host half keeps one per connection, named by its id.
  const folder = props.useSessions?.((sessions) => sessions.byId?.[props.sessionId]?.cwd) || "";
  const filedUnder = /[\\/]connections[\\/]([A-Za-z0-9_-]+)[\\/]?$/.exec(folder)?.[1] ?? "";
  const block = h(Block, { inputActions: props.inputActions, here: filedUnder });
  return h("span", { ref: here }, below ? createPortal(block, below) : inRow ? block : null);
}

const AGENTS = "pramanyx-agents";

/** The sidebar's drawing for Agents: a plain head-and-two-eyes, in the colour of the text beside it. */
function AgentsIcon({ size = 16 }) {
  return h("svg", { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
    h("rect", { x: 2.5, y: 4.5, width: 11, height: 8.5, rx: 2 }),
    h("path", { d: "M8 4.5V2.5" }),
    h("path", { d: "M6 8.5v1M10 8.5v1" }));
}

/** The first sentence or so of what an agent was told it is for. */
function purpose(agent) {
  const text = String(agent.instructions || "").replace(/\s+/g, " ").trim();
  if (text.length <= 220) return text;
  const cut = text.slice(0, 220);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 120))}…`;
}

/**
 * The Agents page: a person's own agents, as Pramanyx keeps them. An agent is made and changed in Pramanyx; here
 * it is asked. The page uses the full width it is given.
 */
function AgentsPage({ ask }) {
  const [agents, setAgents] = useState(null);
  const [connections, setConnections] = useState([]);
  const [down, setDown] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([read("/agents/custom"), read("/connections")])
      .then(([mine, all]) => { if (live) { setAgents(mine.filter((a) => a.enabled !== false)); setConnections(all); } })
      .catch(() => { if (live) setDown(true); });
    return () => { live = false; };
  }, []);
  const named = (id) => connections.find((c) => c.id === id)?.name || id || "";
  const page = { height: "100%", overflow: "auto", boxSizing: "border-box", padding: "28px 32px", fontSize: 13.5,
                 color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-base)" };
  return h("div", { style: page },
    h("h1", { style: { margin: 0, fontSize: 20, fontWeight: 600 } }, "Agents"),
    h("p", { style: { ...quiet, margin: "4px 0 20px" } }, "Your agents answer as Pramanyx set them up. They are made and changed in Pramanyx."),
    down ? h("p", { style: quiet }, "Pramanyx is not answering, so the agents cannot be listed.")
      : agents === null ? h("p", { style: quiet }, "Reading your agents…")
        : !agents.length ? h("p", { style: quiet }, "There are no agents yet.")
          : h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 } },
              agents.map((agent) => h("section", {
                key: agent.id,
                style: { display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${line}`, borderRadius: 6, padding: 14, background: faint },
              },
                h("div", { style: { fontSize: 15, fontWeight: 600 } }, agent.name),
                agent.connection_id ? h("div", { style: { ...quiet, fontSize: 12 } }, `Answers on ${named(agent.connection_id)}`) : null,
                h("div", { style: { flex: "1 1 auto", lineHeight: 1.5 } }, purpose(agent) || "No description."),
                h("div", null, h("button", {
                  type: "button", onClick: () => ask(agent),
                  style: { font: "inherit", fontSize: 12.5, color: "inherit", cursor: "pointer", padding: "5px 12px", background: "transparent", border: `1px solid ${line}`, borderRadius: 4 },
                }, "Ask this agent"))))));
}

export const inject = ["slots", "uiWorkspace"];

export function apply(ctx) {
  ctx.slots.inject("conversation.hero.options", () =>
    ctx.slots.register({ name: "conversation.hero.options", id: "pramanyx-coworker-home" }, Home));

  // A sidebar entry and the page it opens share one id: the shell's sidebar owns the button and its label.
  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register({ name: "sidebar.panellist", id: AGENTS, order: 5, label: () => "Agents" }, AgentsIcon));
  ctx.slots.inject("main", () =>
    ctx.slots.register({
      name: "main", key: AGENTS,
      inject: () => ({
        // A new conversation with the question begun. Nothing is asked until a person finishes and sends it.
        ask: (agent) => ctx.uiWorkspace.startSession(void 0, { prompt: `Ask the ${agent.name} agent: `, whenDraftExists: "append" }),
      }),
    }, AgentsPage));
}
