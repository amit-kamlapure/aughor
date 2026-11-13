/**
 * The host half: the one thing the answer card writes — what a person said about an answer.
 *
 * "Right" and "Wrong" on a card go to Pramanyx exactly as the app's own control sends them: `/chat/feedback` for
 * the judgement, and `/verify/verdict` for what was wrong and, when a person gives one, the corrected SQL. Pramanyx
 * is another origin to the page, so the page asks its own server and the server asks Pramanyx.
 *
 * These are the only writes the coworker's page can make, so the route is narrow on purpose:
 *
 * - POST only, JSON only, and only from this page. A request a browser marks as coming from another site is
 *   refused: without that, any page open in the same browser could record a verdict in a person's name.
 * - The body sent on is rebuilt from the fields below, each checked — nothing a caller adds rides along.
 * - Two fixed destinations. No path, header or query of the caller's reaches Pramanyx.
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MOST = 32 * 1024;

const text = (value, most) => (typeof value === "string" ? value.slice(0, most) : "");

/** What each kind of saying sends on, or null when what was given is not that. */
const SAYINGS = {
  "/pramanyx-feedback": {
    to: "/chat/feedback",
    body: (said) => (ID.test(said.connection) && ID.test(said.answer) && ["helpful", "unhelpful"].includes(said.verdict)
      ? { conn_id: said.connection, turn_id: said.answer, verdict: said.verdict, note: text(said.note, 2000) } : null),
  },
  "/pramanyx-verdict": {
    to: "/verify/verdict",
    body: (said) => (ID.test(said.connection) && ID.test(said.answer) && ["correct", "reject"].includes(said.verdict)
      ? { connection_id: said.connection, investigation_id: said.answer, verdict: said.verdict,
          note: text(said.note, 2000), headline: text(said.headline, 300),
          sql_source: text(said.sql, 20000), corrected_sql: text(said.corrected_sql, 20000) } : null),
  },
};

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function read(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > MOST) return null;
    parts.push(part);
  }
  return Buffer.concat(parts).toString("utf8");
}

export const inject = ["webServer"];

export function apply(ctx) {
  const api = (process.env.PRAMANYX_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  for (const [path, saying] of Object.entries(SAYINGS)) {
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path,
      handler: async (req, res) => {
        if (req.method !== "POST") return reply(res, 405, { detail: "POST only" });
        const from = req.headers["sec-fetch-site"];
        if (from && from !== "same-origin") return reply(res, 403, { detail: "Only this page may say this" });
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) return reply(res, 415, { detail: "JSON only" });
        const raw = await read(req);
        if (raw === null) return reply(res, 413, { detail: "Too long" });
        let said;
        try { said = JSON.parse(raw); } catch { said = null; }
        const body = said && typeof said === "object" ? saying.body(said) : null;
        if (!body) return reply(res, 422, { detail: "Not something this route records" });
        try {
          const answer = await fetch(api + saying.to, {
            method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
          });
          const kept = await answer.text();
          res.writeHead(answer.status, { "content-type": answer.headers.get("content-type") || "application/json", "cache-control": "no-store" });
          return res.end(kept);
        } catch {
          return reply(res, 502, { detail: "Pramanyx is not answering" });
        }
      },
    }), `pramanyx-answer-card: ${path}`);
  }
}
