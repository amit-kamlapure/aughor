/**
 * Pramanyx's name, mark, wording and look, on the coworker's page.
 *
 * The shell gives a deployment with its own identity four places to stand, and this fills them: the mark and name
 * in the sidebar and the mark over a new conversation (slots), the words on that first screen (the `conversation`
 * dictionary), the tab's icon, and the look (the `--dsw-*` variables every part of the shell is drawn from).
 *
 * Two things the shell does not offer, and this file works around rather than through. Its product name in the
 * browser tab is a literal in its layout, so the tab title is corrected as it is written. And a dictionary cannot
 * be added to: a second registration of a namespace and language is refused, and the refusal takes the shell's
 * own conversation plugin down with it (seen: the page would not load). So our phrases are written into the
 * shell's dictionaries after it has registered them. Both fail quietly back to the shell's wording.
 */
import { createElement as h } from "react";
import mark from "../assets/mark.png";
import wordmark from "../assets/wordmark.png";

const NAME = "Pramanyx";
const SHELL_NAME = "DeepSeek Harness";

/** A one-colour artwork drawn in the text colour around it, so one file serves the dark theme and the light. */
function ink(url, width, height, label) {
  const paint = `url("${url}") center / contain no-repeat`;
  return h("span", {
    role: "img", "aria-label": label,
    style: { display: "inline-block", width, height, flex: "none", background: "currentColor", WebkitMask: paint, mask: paint },
  });
}

/** The mark is wider than it is tall (160 × 129); it is fitted inside the square the shell asks for. */
function Mark({ size, className }) {
  return h("span", { className, style: { display: "inline-flex", width: size, height: size, alignItems: "center", justifyContent: "center" } },
    ink(mark, size, Math.round(size * 129 / 160), NAME));
}

function Name() {
  return ink(wordmark, 82, 20, NAME);
}

/**
 * The look. Values are the app's dark theme as its page computes them (read from the running app, 2026-11-12):
 * the charcoal ground and its two steps up, the three text greys, the accent and its tint, and corners of a few
 * pixels where the shell's are 8 to 28. The light theme keeps the shell's own greys and takes only the accent,
 * the corners and the type — the app's light values were not measured, and a guess would be a second palette.
 * The attribute is written twice so these outrank the shell's own rule for it, whichever loads last.
 */
const LOOK = `
body {
  --dsw-radius-xs: 2px; --dsw-radius-sm: 3px; --dsw-radius-md: 4px; --dsw-radius-lg: 6px; --dsw-radius-xl: 6px;
  --dsw-radius-panel: 6px;
  --dsw-font-family: "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --dsw-font-family-brand: var(--dsw-font-family);
  --dsw-alias-link: #2b7fa3;
  --dsw-alias-state-business-primary: #2b7fa3;
}
body[data-ds-dark-theme][data-ds-dark-theme] {
  --dsw-alias-bg-base: #111113;
  --dsw-alias-bg-layer-1: #18191b;
  --dsw-alias-bg-layer-2: #212225;
  --dsw-alias-bg-layer-3: #2e3135;
  --dsw-alias-settings-card-fill: #212225;
  --dsw-alias-markdown-code-block: #18191b;
  --dsw-alias-markdown-inline-code: #212225;
  --dsw-alias-label-primary: #edeef0;
  --dsw-alias-label-secondary: #b0b4ba;
  --dsw-alias-label-tertiary: #8b9099;
  --dsw-alias-brand-primary: #edeef0;
  --dsw-alias-brand-text: #edeef0;
  --dsw-alias-link: #70c9e3;
  --dsw-alias-state-business-primary: #46a0c4;
  --dsw-alias-state-business-tertiary: #0f3747;
}
/*
 * The mark beside "…for 19s" while an answer is being worked on. The shell draws its own animal there and offers
 * no place to draw another, so its two drawings are hidden and a plain open ring turns in their box. The ring is
 * an SVG used as a mask, so it takes the row's own colour. Matched by the part of the class name the shell writes
 * by hand; if that changes, the shell's drawing simply shows again.
 */
[data-chat-running] [class*="_runningIcon"] > * { display: none !important; }
[data-chat-running] [class*="_runningIcon"]::before {
  content: "";
  position: absolute;
  inset: 0;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 2.25a5.75 5.75 0 1 0 5.75 5.75' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M8 2.25a5.75 5.75 0 1 0 5.75 5.75' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") center / contain no-repeat;
  animation: pramanyx-working 0.9s linear infinite;
}
@keyframes pramanyx-working { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  [data-chat-running] [class*="_runningIcon"]::before { animation: none; }
}
`;

function wearLook() {
  let style = document.getElementById("pramanyx-look");
  if (!style) {
    style = document.createElement("style");
    style.id = "pramanyx-look";
    document.head.appendChild(style);
  }
  style.textContent = LOOK;
  return () => style.remove();
}

/** The tab title, corrected as the shell writes it. The shell's name for itself is a literal in its layout. */
function nameTheTab() {
  const fix = () => {
    if (document.title.includes(SHELL_NAME)) document.title = document.title.split(SHELL_NAME).join(NAME);
  };
  fix();
  const title = document.querySelector("title");
  if (!title) return () => {};
  const watch = new MutationObserver(fix);
  watch.observe(title, { childList: true, characterData: true, subtree: true });
  return () => watch.disconnect();
}

/**
 * The tab's icon: the mark, centred on a square, in a colour the browser's own tab strip can show. The artwork is
 * one colour on nothing, so it is painted light for a dark browser and dark for a light one, and painted again
 * when that changes. Every icon link the shell wrote is pointed at it.
 */
function markTheTab() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const art = new Image();
  const paint = () => {
    const edge = 64;
    const canvas = document.createElement("canvas");
    canvas.width = edge; canvas.height = edge;
    const pen = canvas.getContext("2d");
    if (!pen) return;
    const width = 60, height = Math.round(width * 129 / 160);
    pen.drawImage(art, (edge - width) / 2, (edge - height) / 2, width, height);
    pen.globalCompositeOperation = "source-in";
    pen.fillStyle = dark.matches ? "#edeef0" : "#111113";
    pen.fillRect(0, 0, edge, edge);
    const url = canvas.toDataURL("image/png");
    let links = [...document.querySelectorAll('link[rel~="icon"]')];
    if (!links.length) {
      const link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      links = [link];
    }
    for (const link of links) { link.type = "image/png"; link.removeAttribute("sizes"); link.href = url; }
  };
  art.onload = paint;
  art.src = mark;
  dark.addEventListener("change", paint);
  return () => dark.removeEventListener("change", paint);
}

/**
 * Our words, by the shell's dictionary. The shell writes for someone about to build software, in sessions; a
 * person here asks about a business, in conversations.
 */
const WORDS = {
  conversation: {
    "hero.headline": "Ask your data anything",
    "hero.preview": "Coworker",
    "placeholder.hero": "Ask anything about your data, / for commands, @ for conversations",
  },
  sidebar: {
    "session.new": "New conversation",
    "session.new.label": "New conversation",
  },
  workspace: {
    "section.sessions": "Conversations",
    "search.placeholder": "Search conversations",
  },
};

/**
 * Dictionaries reworded by rule rather than key by key: the shell calls a scheduled run an "automation task" in
 * some forty phrases, and here it is a schedule. The article goes first, so "an automation task" does not become
 * "an schedule".
 */
const REWORDED = {
  "schedule.catalog": automationToSchedule,
  "schedule.manager": automationToSchedule,
};

function automationToSchedule(phrase) {
  return phrase
    .replace(/\ban automation task\b/g, "a schedule").replace(/\bAn automation task\b/g, "A schedule")
    .replace(/automation tasks/g, "schedules").replace(/Automation tasks/g, "Schedules")
    .replace(/automation task/g, "schedule").replace(/Automation task/g, "Schedule");
}

/**
 * Put our phrases in the shell's English dictionaries. It reaches into the locale service's own table, which is
 * not a promise the shell makes — so every step is allowed to find nothing, and then nothing changes. A phrase is
 * only ever written to what it should say, so running this again changes nothing more.
 */
function sayOurWords(locale) {
  try {
    let changed = false;
    const english = (namespace) => locale?.dicts?.get?.(namespace)?.get?.("en");
    for (const [namespace, words] of Object.entries(WORDS)) {
      const entries = english(namespace);
      if (!entries) continue;
      for (const [key, phrase] of Object.entries(words)) {
        if (entries[key] !== phrase) { entries[key] = phrase; changed = true; }
      }
    }
    for (const [namespace, reword] of Object.entries(REWORDED)) {
      const entries = english(namespace);
      if (!entries) continue;
      for (const [key, phrase] of Object.entries(entries)) {
        if (typeof phrase !== "string") continue;
        const ours = reword(phrase);
        if (ours !== phrase) { entries[key] = ours; changed = true; }
      }
    }
    if (changed) locale.publish?.(locale.snapshot?.active, false);
  } catch {
    // The shell's wording stands.
  }
}

/**
 * Other plugins register their dictionaries when they start, in an order this one is not told. The words are
 * said now and a few times more as the page settles; each pass after the first finds nothing left to change.
 */
function keepSayingOurWords(locale) {
  sayOurWords(locale);
  const timers = [300, 1200, 4000].map((wait) => setTimeout(() => sayOurWords(locale), wait));
  return () => timers.forEach(clearTimeout);
}

const VIEW = "dsh.workspace.view.v5";
const VIEW_SET = "pramanyx.coworker.view-set";

/**
 * Conversations in one list, newest first, the first time this page is opened in a browser. The shell's own
 * default files them under the folder each was started in, which means something to someone working in folders
 * and nothing to someone asking about a business. It is the shell's own view option, set once: a person who
 * picks another view afterwards keeps it.
 *
 * The shell reads its view before any plugin starts and keeps it in memory, so writing the stored copy changes
 * nothing on the page that is open (a first version did only that, and the first visit still showed folders).
 * The stored copy is written and the page is loaded once more, which a first visit shows as a brief flicker.
 */
function listConversationsNewestFirst() {
  try {
    if (localStorage.getItem(VIEW_SET)) return;
    localStorage.setItem(VIEW_SET, "1");
    const view = JSON.parse(localStorage.getItem(VIEW) || "{}");
    if (view.groupBy === "flat") return;
    localStorage.setItem(VIEW, JSON.stringify({ ...view, groupBy: "flat", orderBy: "updated" }));
    window.location.reload();
  } catch {
    // A browser that keeps nothing: the shell's default view stands.
  }
}

// `uiConversation` is asked for so this runs after the shell's conversation plugin has registered its dictionary.
export const inject = ["slots", "locale", "uiConversation"];

export function apply(ctx) {
  ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", function* () {
    yield ctx.slots.register({ name: "sidebar.brand.mark" }, Mark);
    yield ctx.slots.register({ name: "sidebar.brand.name" }, Name);
  }));
  ctx.slots.inject("conversation.hero.brand.mark", () =>
    ctx.slots.register({ name: "conversation.hero.brand.mark" }, Mark));
  listConversationsNewestFirst();
  const undo = [wearLook(), nameTheTab(), markTheTab(), keepSayingOurWords(ctx.locale)];
  ctx.on?.("dispose", () => undo.forEach((off) => off()));
}
