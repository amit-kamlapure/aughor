/**
 * The host half. Three things the page cannot do for itself: read Pramanyx, tell the agent which connection a
 * conversation is about, and say to Pramanyx where the coworker is.
 *
 * A READ-ONLY RELAY from the coworker's page to the Pramanyx API.
 *
 * The page is served by the shell and Pramanyx by its own API, on another port — another origin to a browser. The
 * API's list of allowed origins is an operator's setting and is left alone; the page asks its own server, and the
 * server asks Pramanyx. Only what the first screen reads is relayed: a path that is not on the list below is
 * answered 404 here and never reaches the API. The shell hands a `resource` route GET and HEAD only, so nothing
 * relayed can write.
 */
const READS = [
  /^\/connections$/,          // which databases there are, to say whose questions these are
  /^\/suggestions$/,          // starter questions for one connection (cached; a first read may cost a model call)
  /^\/agents\/custom$/,       // a person's own agents
  /^\/investigations$/,       // recent questions
  /^\/metrics$/,              // a connection's metric definitions, to show the one an answer was held to
  /^\/receipt\/[A-Za-z0-9_-]+\/trace$/,   // what an answer stood on, as the platform itself resolves it
];

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * ONE WORKSPACE PER CONNECTION. The shell files a conversation under a workspace — a folder — and gives its agent
 * the `AGENTS.md` it finds there before the first question. So each Pramanyx connection gets a folder whose
 * `AGENTS.md` names that connection, and a workspace over it titled with the connection's name. Choosing where a
 * conversation happens, in the shell's own picker above the question box, is then choosing the connection, and the
 * agent is told it in its instructions and not in the person's question.
 *
 * Run at start. A connection added later appears on the next start; one that was removed keeps its workspace, and
 * the conversations in it, and Pramanyx answers that it no longer exists.
 */
async function workspacePerConnection(ctx, api) {
  const home = process.env.DSH_HOME || join(homedir(), ".dsh");
  const answer = await fetch(`${api}/connections`, { headers: { accept: "application/json" } });
  if (!answer.ok) throw new Error(`connections: ${answer.status}`);
  for (const connection of await answer.json()) {
    const id = String(connection.id || "");
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;          // an id becomes a folder name: nothing else is let through
    const name = String(connection.name || id);
    const folder = join(home, "connections", id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "AGENTS.md"), [
      `# ${name}`,
      "",
      `This conversation is about the connection "${name}". Its connection id is \`${id}\`.`,
      `Use \`${id}\` as the connection for every question, read and analysis in this conversation, unless the person names`,
      "another connection themselves.",
      "",
    ].join("\n"));
    const known = await ctx.workspaceRegistry.resolveByPath(folder);
    if (!known) await ctx.workspaceRegistry.create(folder, name);
    else if (known.title !== name) await known.setTitle(name);
  }
}

/**
 * SAYING WHERE THIS IS. The app leads here from the nine dots in its top bar, and for that Pramanyx has to know a
 * coworker is running and the address to open. The address is the one the shell prints for a person at start,
 * with the shell's own access in it. It is said to the API at start and every half minute after; the API forgets
 * it two minutes after the last time, so a coworker that has stopped is not offered.
 *
 * The API hands that address to the app's page. On this machine that is the same reach the address printed in the
 * terminal has; an install that serves the app to other machines must decide who may be given it first.
 */
function sayWhereThisIs(ctx, api) {
  ctx.inject(["webApp", "connection"], (at) => {
    const say = async () => {
      try {
        const url = String(at.connection.authenticatedUrl(at.webApp.getAdvertisedUrl()));
        await fetch(`${api}/coworker/address`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }),
        });
      } catch {
        // Pramanyx is not answering, or is older than this route: the app draws no way in, and this tries again.
      }
    };
    say();
    const again = setInterval(say, 30_000);
    again.unref?.();
    at.effect(() => () => clearInterval(again), "pramanyx-home: saying where the coworker is");
  });
}

/**
 * THE WAY IN FROM THE APP. The shell signs a person in with a cookie a browser will not send on an arrival from
 * another site — and the app, on its own address, is another site. Opened straight from the app, the shell's
 * address answered "authentication required". So the app opens this page instead: it is on the coworker's own
 * address, and what it does next — going to the shell's address with the shell's access — is then a move within
 * one site, which the cookie survives. The access and what the app carries arrive in the fragment, which is never
 * sent to a server; this page reads them and goes. It writes nothing and shows nothing.
 */
const ENTER = `<!doctype html><meta charset="utf-8"><title>Pramanyx</title><script>
(function () {
  var said = new URLSearchParams(location.hash.slice(1));
  var access = said.get("t") || "";
  said.delete("t");
  var carried = said.toString();
  location.replace("./" + (access ? "?token=" + encodeURIComponent(access) : "") + (carried ? "#pramanyx:" + carried : ""));
})();
</script>`;

/**
 * A CONVERSATION IS HELD TO ITS CONNECTION. Telling the agent which connection a conversation is about is an
 * instruction, and an instruction is not a boundary: it could still list the connections and ask another one, and
 * it did. This is the boundary. Every call to one of Pramanyx's tools passes the shell's guard before it runs; a
 * call made from a connection's workspace that names another connection is refused there, with a sentence the
 * agent reads and can repeat to the person. A guard can only refuse — nothing later in the shell can turn the
 * refusal back into permission.
 *
 * What is held: the `connection` (or `connection_id`) a call names. A call that names none is let through for the
 * tool to answer as it does — except a custom agent's, which would otherwise answer on the agent's own connection.
 * A conversation that is not in a connection's workspace (the folder the shell was started in) is not held.
 */
const OURS = "mcp__pramanyx__";
const LISTS = /^mcp__pramanyx__list_(platform_)?connections$/;
const HELD_FOLDER = /[\\/]connections[\\/]([A-Za-z0-9_-]+)[\\/]?$/;

/** The refusal for one call from a conversation held to `held`, or undefined when the call may run. Pure. */
export function refusalFor(name, args, held) {
  if (!held || typeof name !== "string" || !name.startsWith(OURS) || LISTS.test(name)) return undefined;
  const given = args && typeof args === "object" ? (args.connection ?? args.connection_id) : undefined;
  const named = typeof given === "string" ? given.trim() : "";
  const here = `This conversation is held to the connection \`${held}\``;
  if (named && named !== held) {
    return `${here}. It cannot read \`${named}\`. Tell the person so: to ask about another connection they start a conversation on it.`;
  }
  if (!named && /^mcp__pramanyx__ask_[a-z0-9_]+$/.test(name)) {
    return `${here}. An agent answers on its own connection unless told otherwise: pass connection \`${held}\`, or tell the person this agent cannot be asked here.`;
  }
  return undefined;
}

function holdToConnection(ctx) {
  ctx.inject(["tools", "workingDirectory"], (at) => {
    at.effect(() => at.tools.guard((call) => {
      let folder = "";
      try { folder = call.agent ? String(at.workingDirectory.get(call.agent.session) || "") : ""; } catch { folder = ""; }
      return refusalFor(call.name, call.arguments, HELD_FOLDER.exec(folder)?.[1] ?? "");
    }), "pramanyx-home: a conversation is held to its connection");
  });
}

export const inject = ["webServer", "workspaceRegistry"];

export function apply(ctx) {
  const api = (process.env.PRAMANYX_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  workspacePerConnection(ctx, api).catch((error) => {
    // Pramanyx not answering at start is not a reason for the page not to open; it says so where it reads.
    console.warn(`pramanyx-home: no workspace per connection this start (${error?.message ?? error})`);
  });
  sayWhereThisIs(ctx, api);
  holdToConnection(ctx);
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/pramanyx-enter",
    handler: (req, res) => {
      if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
      return res.end(req.method === "HEAD" ? undefined : ENTER);
    },
  }), "pramanyx-home: the way in from the app");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/pramanyx",          // no trailing slash: the server matches the prefix itself, or the prefix and a "/"
    resource: async (request) => {
      const url = new URL(request.url);
      const path = url.pathname.slice("/pramanyx".length);
      if (!READS.some((allowed) => allowed.test(path))) return new Response("Not relayed", { status: 404 });
      try {
        const answer = await fetch(api + path + url.search, { headers: { accept: "application/json" } });
        return new Response(await answer.text(), {
          status: answer.status,
          headers: { "content-type": answer.headers.get("content-type") || "application/json", "cache-control": "no-store" },
        });
      } catch {
        return new Response(JSON.stringify({ detail: "The platform is not answering" }), {
          status: 502, headers: { "content-type": "application/json" },
        });
      }
    },
  }), "pramanyx-home: read-only relay");
}
