import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../renderer/src/dj-agent-api.ts", import.meta.url), "utf8");
const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const api = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("Agent session client uses server CRUD routes without copying sessions into browser storage", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (init.method === "POST") return new Response(JSON.stringify({ session: { id: "sess_1", title: "新对话" } }), { status: 200 });
    if (init.method === "PATCH") return new Response(JSON.stringify({ session: { id: "sess_1", title: "Warmup" } }), { status: 200 });
    if (init.method === "DELETE") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (String(url) === "/api/sessions") return new Response(JSON.stringify({ sessions: [{ id: "sess_1", title: "新对话" }] }), { status: 200 });
    return new Response(JSON.stringify({ session: { id: "sess_1", title: "新对话" }, messages: [] }), { status: 200 });
  };
  try {
    assert.equal((await api.djAgentApi.listSessions())[0].id, "sess_1");
    assert.equal((await api.djAgentApi.createSession()).id, "sess_1");
    assert.equal((await api.djAgentApi.getSession("sess_1")).messages.length, 0);
    assert.equal((await api.djAgentApi.renameSession("sess_1", "Warmup")).title, "Warmup");
    await api.djAgentApi.deleteSession("sess_1");
    assert.deepEqual(calls.map(call => call.url), ["/api/sessions", "/api/sessions", "/api/sessions/sess_1", "/api/sessions/sess_1", "/api/sessions/sess_1"]);
    assert.ok(calls.every(call => call.init.credentials === "same-origin"));
  } finally { globalThis.fetch = originalFetch; }
});

test("Agent SSE parser accepts split frames and streaming chat keeps secrets in its POST body", async () => {
  const events = [];
  const parser = new api.AgentSseParser(event => events.push(event));
  parser.push(`data: {"type":"text","data":"hello"}\r\n\r\ndata: {"type":"tool_start","data":{"tool":"search"}}\n\ndata: {"type":"car`);
  parser.push(`d","data":{"sourceType":"camelot_analysis"}}\n\n`);
  parser.push(`data: {"type":"done","sessionId":"sess_1"}`);
  parser.finish();
  assert.deepEqual(events.map(event => event.type), ["text", "tool_start", "card", "done"]);

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const body = [
      `data: ${JSON.stringify({ type: "text", data: "real fixture response" })}\n\n`,
      `data: ${JSON.stringify({ type: "done", sessionId: "sess_1" })}`,
    ].join("");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  try {
    const received = [];
    await api.djAgentApi.sendMessage({ sessionId: "sess_1", message: "hi", cookie: "MUSIC_U=fixture", config: { apiKey: "key-fixture", baseUrl: "https://api.example.test", model: "model-fixture", thinkingEffort: "high", temperature: 0.5 } }, event => received.push(event));
    assert.equal(calls[0].url, "/api/agent/chat");
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.cookie, "MUSIC_U=fixture");
    assert.equal(payload.config.apiKey, "key-fixture");
    assert.equal(calls[0].init.headers.Accept, "text/event-stream");
    assert.equal(received.at(-1).type, "done");
  } finally { globalThis.fetch = originalFetch; }
});

test("Agent stream ending without done is an incomplete result, never success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`data: {"type":"text","data":"partial"}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  try {
    await assert.rejects(api.djAgentApi.sendMessage({ sessionId: "sess_1", message: "hi", cookie: "", config: { baseUrl: "https://example.test", model: "x", thinkingEffort: "off", temperature: 0 } }, () => {}), /没有收到完成事件/);
  } finally { globalThis.fetch = originalFetch; }
});
