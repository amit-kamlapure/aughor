/**
 * The host half. Two things the page cannot do for itself: read Pramanyx, and tell the agent which connection a
 * conversation is about.
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
      `This conversation is about the Pramanyx connection "${name}". Its connection id is \`${id}\`.`,
      `Use \`${id}\` as the connection for every Pramanyx tool call in this conversation, unless the person names`,
      "another connection themselves.",
      "",
    ].join("\n"));
    const known = await ctx.workspaceRegistry.resolveByPath(folder);
    if (!known) await ctx.workspaceRegistry.create(folder, name);
    else if (known.title !== name) await known.setTitle(name);
  }
}

export const inject = ["webServer", "workspaceRegistry"];

export function apply(ctx) {
  const api = (process.env.PRAMANYX_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  workspacePerConnection(ctx, api).catch((error) => {
    // Pramanyx not answering at start is not a reason for the page not to open; it says so where it reads.
    console.warn(`pramanyx-home: no workspace per connection this start (${error?.message ?? error})`);
  });
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
        return new Response(JSON.stringify({ detail: "Pramanyx is not answering" }), {
          status: 502, headers: { "content-type": "application/json" },
        });
      }
    },
  }), "pramanyx-home: read-only relay");
}
