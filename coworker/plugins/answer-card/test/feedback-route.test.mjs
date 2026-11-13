/**
 * The answer card's write route, against a stand-in for Pramanyx. Nothing here reaches a real install: a verdict
 * is a person's statement, and a test does not make one.
 *
 *   node --test coworker/plugins/answer-card/test/
 *
 * What is held: what a person said goes on in exactly the body Pramanyx's two routes take (the bodies the app's
 * own control sends), nothing else rides along, and everything that is not that is refused before Pramanyx hears
 * of it.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";

let pramanyx, shell, heard;
const listen = (server) => new Promise((done) => server.listen(0, "127.0.0.1", () => done(server.address().port)));

before(async () => {
  heard = [];
  pramanyx = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    heard.push({ path: req.url, method: req.method, body: JSON.parse(raw || "{}") });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/chat/feedback" ? { ok: true, accepted: true } : { id: "v1" }));
  });
  process.env.PRAMANYX_API_URL = `http://127.0.0.1:${await listen(pramanyx)}`;
  const { apply } = await import("../lib/index.js");
  const routes = new Map();
  apply({ effect: (make) => make(), webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path); } } });
  shell = http.createServer((req, res) => {
    const route = routes.get(req.url);
    return route ? route.handler(req, res) : (res.writeHead(404), res.end());
  });
  shell.port = await listen(shell);
});

after(() => { pramanyx.close(); shell.close(); });

const say = (path, body, headers = { "content-type": "application/json" }, method = "POST") =>
  fetch(`http://127.0.0.1:${shell.port}${path}`, { method, headers, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });

test("a judgement goes on as the app's own control sends it", async () => {
  heard.length = 0;
  const answer = await say("/pramanyx-feedback", { connection: "conn-1", answer: "answer-1", verdict: "helpful", extra: "ignored" });
  assert.equal(answer.status, 200);
  assert.deepEqual(await answer.json(), { ok: true, accepted: true });
  assert.deepEqual(heard, [{ path: "/chat/feedback", method: "POST", body: { conn_id: "conn-1", turn_id: "answer-1", verdict: "helpful", note: "" } }]);
});

test("what was wrong, and the SQL that would have been right, go on as a verdict", async () => {
  heard.length = 0;
  const answer = await say("/pramanyx-verdict", {
    connection: "conn-1", answer: "answer-1", verdict: "correct", note: "wrong year", headline: "Top brands",
    sql: "SELECT 1", corrected_sql: "SELECT 2", agent_id: "not-the-callers-to-set",
  });
  assert.equal(answer.status, 200);
  assert.deepEqual(heard[0].body, {
    connection_id: "conn-1", investigation_id: "answer-1", verdict: "correct", note: "wrong year",
    headline: "Top brands", sql_source: "SELECT 1", corrected_sql: "SELECT 2",
  });
  assert.equal(heard[0].path, "/verify/verdict");
});

test("a long note is cut to what Pramanyx keeps, not refused", async () => {
  heard.length = 0;
  await say("/pramanyx-verdict", { connection: "c", answer: "a", verdict: "reject", note: "x".repeat(5000) });
  assert.equal(heard[0].body.note.length, 2000);
  await say("/pramanyx-feedback", { connection: "c", answer: "a", verdict: "unhelpful", note: "x".repeat(5000) });
  assert.equal(heard[1].body.note.length, 2000);
});

for (const [name, path, body, headers, method, status] of [
  ["a read", "/pramanyx-feedback", null, {}, "GET", 405],
  ["a body that is not JSON by its type", "/pramanyx-feedback", { connection: "c", answer: "a", verdict: "helpful" }, { "content-type": "text/plain" }, "POST", 415],
  ["a request a browser marks as another site's", "/pramanyx-feedback", { connection: "c", answer: "a", verdict: "helpful" }, { "content-type": "application/json", "sec-fetch-site": "cross-site" }, "POST", 403],
  ["a judgement it does not know", "/pramanyx-feedback", { connection: "c", answer: "a", verdict: "delete" }, undefined, "POST", 422],
  ["an accept sent to the route for what was wrong", "/pramanyx-verdict", { connection: "c", answer: "a", verdict: "accept" }, undefined, "POST", 422],
  ["an id that is a path", "/pramanyx-feedback", { connection: "../admin", answer: "a", verdict: "helpful" }, undefined, "POST", 422],
  ["an answer id that is a path, on a judgement", "/pramanyx-feedback", { connection: "c", answer: "a/b", verdict: "helpful" }, undefined, "POST", 422],
  ["a connection id that is a path, on a verdict", "/pramanyx-verdict", { connection: "c?x=1", answer: "a", verdict: "reject" }, undefined, "POST", 422],
  ["an answer with no id, on a verdict", "/pramanyx-verdict", { connection: "c", answer: "", verdict: "reject" }, undefined, "POST", 422],
  ["text that is not JSON", "/pramanyx-feedback", "{not json", undefined, "POST", 422],
  ["a body too long to be a verdict", "/pramanyx-verdict", { connection: "c", answer: "a", verdict: "reject", note: "x".repeat(40000) }, undefined, "POST", 413],
]) {
  test(`${name} is refused, and Pramanyx never hears of it`, async () => {
    heard.length = 0;
    const answer = await say(path, body, headers, method);
    assert.equal(answer.status, status);
    assert.deepEqual(heard, []);
  });
}

test("a request this page made is let through", async () => {
  heard.length = 0;
  const answer = await say("/pramanyx-feedback", { connection: "c", answer: "a", verdict: "unhelpful" },
    { "content-type": "application/json", "sec-fetch-site": "same-origin" });
  assert.equal(answer.status, 200);
  assert.equal(heard.length, 1);
});
