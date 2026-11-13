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
  const said = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (minutes < 60) return said(minutes || 1, "minute");
  if (minutes < 60 * 24) return said(Math.round(minutes / 60), "hour");
  return said(Math.round(minutes / 1440), "day");
}

/**
 * The first screen's look: the mark on a tile over a large headline, a roomier question box, and under it plain
 * rows and two cards with space in them. The headline, the tile and the box are the shell's, found by the names
 * its stylesheet gives them; if it renames them they keep the shell's own look and nothing breaks.
 */
const HOME_LOOK = `
[class*="composerHero"] { gap: 14px; }
[class*="composerHero"] [class*="_headline"] { flex-direction: column; gap: 22px; padding-bottom: 14px; }
[class*="composerHero"] [class*="_fishHitbox"] {
  width: 72px; height: 72px; border-radius: 14px; display: grid; place-items: center;
  color: var(--dsw-alias-brand-primary, #46a0c4);
  background: color-mix(in srgb, currentColor 9%, var(--dsw-alias-bg-base, #111113));
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent), 0 12px 32px rgba(0, 0, 0, 0.28);
}
[class*="composerHero"] [class*="_titleGroup"] { font-size: 34px; line-height: 1.15; font-weight: 400; letter-spacing: -0.01em; align-items: center; }
[class*="composerHero"] [data-composer-card] { border-radius: 10px; }
.pramanyx-home-row {
  display: flex; gap: 12px; align-items: center; width: 100%; text-align: left; font: inherit; color: inherit;
  cursor: pointer; background: transparent; border: 0; border-radius: 6px; padding: 9px 10px;
}
.pramanyx-home-row:hover, .pramanyx-home-row:focus-visible { background: color-mix(in srgb, currentColor 7%, transparent); }
.pramanyx-home-row:focus-visible { outline: 1px solid color-mix(in srgb, currentColor 40%, transparent); }
.pramanyx-home-row svg { flex: none; opacity: 0.62; }
`;

function wearHomeLook() {
  let style = document.getElementById("pramanyx-home-look");
  if (!style) {
    style = document.createElement("style");
    style.id = "pramanyx-home-look";
    document.head.appendChild(style);
  }
  style.textContent = HOME_LOOK;
}

const drawn = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
/** A four-pointed star: a question worth asking. */
const Spark = () => h("svg", drawn, h("path", { d: "M9 2.5c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6Z" }));
/** A speech bubble: a question that was asked. */
const Asked = () => h("svg", drawn, h("path", { d: "M3 4.5h12v8H8.5L5.5 15v-2.5H3z" }));

/** A suggested question: one plain line that writes itself into the box. */
function Row({ text, onPick }) {
  return h("button", { type: "button", className: "pramanyx-home-row", onClick: onPick, title: text, style: { fontSize: 14.5 } },
    h(Spark),
    h("span", { style: { flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, text));
}

/** A thing in a card: what it is, and under it where it is from and when. */
function Item({ icon, text, note, onPick }) {
  const one = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  return h("button", { type: "button", className: "pramanyx-home-row", onClick: onPick, title: text, style: { alignItems: "flex-start" } },
    h("span", { style: { paddingTop: 1, display: "inline-flex" } }, icon),
    h("span", { style: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } },
      h("span", { style: { ...one, fontSize: 14, fontWeight: 600 } }, text),
      note ? h("span", { style: { ...one, ...quiet, fontSize: 12.5 } }, note) : null));
}

function Card({ title, empty, children }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  return h("section", { style: { flex: "1 1 300px", minWidth: 0, border: `1px solid ${line}`, borderRadius: 10, padding: "16px 12px 10px", minHeight: 150, display: "flex", flexDirection: "column" } },
    h("div", { style: { ...quiet, fontSize: 13, padding: "0 10px 8px" } }, title),
    rows && rows.length ? h("div", { style: { display: "flex", flexDirection: "column", gap: 2 } }, rows)
      : h("div", { style: { ...quiet, flex: "1 1 auto", display: "grid", placeItems: "center", fontSize: 13, padding: "18px 10px" } }, empty));
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
      "Suggestions could not be read just now. You can still ask.");
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
  return h("div", { style: { display: "flex", flexDirection: "column", gap: 14, padding: `10px ${inset} 0`, fontSize: 13 } },
    settled ? h("div", { style: { ...quiet, fontSize: 12.5, padding: "0 10px" } }, `Questions for ${named(settled)}. Choose another connection above the box.`)
    : h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" } },
      h("label", { htmlFor: "pramanyx-connection", style: quiet }, "Questions for"),
      h("select", {
        id: "pramanyx-connection", value: chosen,
        onChange: (e) => { remember(e.target.value); setChosen(e.target.value); },
        style: { font: "inherit", color: "inherit", background: "transparent", border: `1px solid ${line}`, borderRadius: 4, padding: "3px 8px" },
      }, connections.map((c) => h("option", { key: c.id, value: c.id }, c.name)))),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 2 } },
      questions === null ? h("div", { style: { ...quiet, padding: "9px 10px" } }, "Reading the questions worth asking…")
        : questions.length ? questions.slice(0, QUESTIONS_SHOWN).map((q) => h(Row, { key: q.text, text: q.text, onPick: () => ask(q.text, shown) }))
          : h("div", { style: { ...quiet, padding: "9px 10px" } }, "No suggested questions for this connection yet.")),
    h("div", { style: { display: "flex", flexWrap: "wrap", gap: 16, paddingTop: 10 } },
      h(Card, { title: "Asked lately", empty: "Nothing has been asked yet." },
        (recent ?? []).slice(0, 4).map((r) => h(Item, {
          key: r.id, icon: h(Asked), text: r.question, note: [named(r.connection_id), ago(r.started_at)].filter(Boolean).join(" · "),
          onPick: () => ask(r.question, r.connection_id),
        }))),
      h(Card, { title: "Your agents", empty: "No agents yet." },
        (agents ?? []).slice(0, 4).map((a) => h(Item, {
          key: a.id, icon: h(AgentsIcon, { size: 18 }), text: a.name, note: a.connection_id ? named(a.connection_id) : "",
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
    h("p", { style: { ...quiet, margin: "4px 0 20px" } }, "Each agent answers the way it was set up."),
    down ? h("p", { style: quiet }, "The agents could not be read just now.")
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
  wearHomeLook();
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
