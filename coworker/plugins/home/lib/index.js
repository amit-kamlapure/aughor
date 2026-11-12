/**
 * The host half: a read-only relay from the coworker's page to the Pramanyx API.
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

export const inject = ["webServer"];

export function apply(ctx) {
  const api = (process.env.PRAMANYX_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
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
