// A conversation is held to its connection: what the guard refuses, and what it lets through.
import assert from "node:assert/strict";
import { test } from "node:test";
import { refusalFor } from "../lib/index.js";

const ask = "mcp__pramanyx__ask";

test("a call for the conversation's own connection runs", () => {
  assert.equal(refusalFor(ask, { question: "q", connection: "c1" }, "c1"), undefined);
  assert.equal(refusalFor("mcp__pramanyx__get_briefing", { connection_id: "c1" }, "c1"), undefined);
});

test("a call for another connection is refused, and the refusal names both", () => {
  const said = refusalFor(ask, { question: "q", connection: "other" }, "c1");
  assert.match(said, /held to the connection `c1`/);
  assert.match(said, /cannot read `other`/);
  assert.match(refusalFor("mcp__pramanyx__deep_analysis", { connection: "other" }, "c1"), /cannot read `other`/);
  assert.match(refusalFor("mcp__pramanyx__get_metric", { connection_id: "other" }, "c1"), /cannot read `other`/);
});

test("a custom agent asked without a connection is refused, since it would answer on its own", () => {
  assert.match(refusalFor("mcp__pramanyx__ask_margin_analyst", { question: "q" }, "c1"), /pass connection `c1`/);
  assert.equal(refusalFor("mcp__pramanyx__ask_margin_analyst", { question: "q", connection: "c1" }, "c1"), undefined);
  assert.match(refusalFor("mcp__pramanyx__ask_margin_analyst", { question: "q", connection: "c2" }, "c1"), /cannot read `c2`/);
});

test("a call that names no connection is left to the tool", () => {
  assert.equal(refusalFor("mcp__pramanyx__read_contract", {}, "c1"), undefined);
  assert.equal(refusalFor(ask, { question: "q" }, "c1"), undefined);
});

test("listing the connections is let through: their names are not their rows", () => {
  assert.equal(refusalFor("mcp__pramanyx__list_connections", {}, "c1"), undefined);
  assert.equal(refusalFor("mcp__pramanyx__list_platform_connections", { connection: "other" }, "c1"), undefined);
});

test("a conversation in no connection's workspace is not held", () => {
  assert.equal(refusalFor(ask, { question: "q", connection: "other" }, ""), undefined);
});

test("another plugin's tools are not this guard's business", () => {
  assert.equal(refusalFor("mcp__other__ask", { connection: "other" }, "c1"), undefined);
  assert.equal(refusalFor("todo_write", { connection: "other" }, "c1"), undefined);
});

test("a connection given as something other than text is not read as a match", () => {
  assert.equal(refusalFor(ask, { connection: { id: "other" } }, "c1"), undefined);
  assert.match(refusalFor(ask, { connection: " other " }, "c1"), /cannot read `other`/);
  assert.equal(refusalFor(ask, { connection: " c1 " }, "c1"), undefined);
});
