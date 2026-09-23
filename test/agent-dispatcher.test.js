import test from "node:test";
import assert from "node:assert/strict";
import { dispatchAgentWorkflow, preRouteAgentIntent } from "../lib/dj-agent/agent-dispatcher.js";

function setupMockLlm() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (!urlStr.includes("api.deepseek.com") && !urlStr.includes("/chat/completions")) {
      return originalFetch(url, options);
    }

    const body = JSON.parse(options.body || "{}");
    const isStream = Boolean(body.stream);
    const messages = body.messages || [];
    const userMsg = messages.find((m) => m.role === "user")?.content || "";
    const isSystemCatalog = messages.some((m) => (m.content || "").includes("Skill Catalog"));

    if (isSystemCatalog && !isStream) {
      let decision = { skill: "general_dj_chat", parameters: { query: userMsg }, thought: "通用对话" };
      if (userMsg.includes("01.") || userMsg.includes("Tiësto")) {
        decision = { skill: "1001tl_setlist_scraper", parameters: { text: userMsg }, thought: "解析现场曲目单" };
      } else if (userMsg.includes("8A") || userMsg.includes("调性")) {
        decision = { skill: "camelot_harmonic_mixing", parameters: { query: "8A" }, thought: "调性过渡建议" };
      }
      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: JSON.stringify(decision) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (isStream) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"这里是 Camelot 调性轮盘过渡指南与专业的调性建议。"}}]}\n\n`));
          controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: "OK" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return () => { globalThis.fetch = originalFetch; };
}

test("Agent Dispatcher: Multi-line text setlist extraction & card output", async () => {
  const restoreFetch = setupMockLlm();
  try {
    const sampleSet = `
01. Tiësto - The Business (220 KID Remix)
02. ID - ID
03. Fisher - Losing It
    `;

    const streamEvents = [];
    const result = await dispatchAgentWorkflow({
      message: sampleSet,
      onStream: (ev) => streamEvents.push(ev),
    });

    assert.equal(result.type, "tracklist_result");
    assert.ok(result.card);
    assert.ok(result.card.tracks.length > 0);
    assert.ok(streamEvents.some((e) => e.type === "card"));
  } finally {
    restoreFetch();
  }
});

test("Agent Dispatcher: Camelot Harmonic Transition detection", async () => {
  const streamEvents = [];
  const result = await dispatchAgentWorkflow({
    message: "推荐适合 8A 的接歌调性",
    onStream: (ev) => streamEvents.push(ev),
  });

  assert.equal(result.type, "camelot_analysis");
  assert.ok(result.content.includes("9A"));
  assert.ok(result.card?.compatible?.some((item) => item.camelot === "9A"));
  assert.ok(streamEvents.some((e) => e.type === "card"));
});

test("Agent Dispatcher: missing API key does not invent a crate", async () => {
  const events = [];
  const result = await dispatchAgentWorkflow({
    message: "帮我排一套 Melodic Techno",
    harnessRuntime: {},
    onStream: (ev) => events.push(ev),
  });
  assert.equal(result.type, "needs_api_key");
  assert.ok(events.some((e) => e.type === "text" && e.data.includes("API Key")));
});

test("Agent Dispatcher: preRoute detects setlist text, camelot, and 1001TL URL", () => {
  assert.equal(preRouteAgentIntent("01. A - B\n02. C - D").skill, "1001tl_setlist_scraper");
  assert.equal(preRouteAgentIntent("8A 接什么调").skill, "camelot_harmonic_mixing");
  assert.equal(
    preRouteAgentIntent("https://www.1001tracklists.com/tracklist/275yqjmt/example.html").skill,
    "1001tl_setlist_scraper"
  );
  assert.equal(preRouteAgentIntent("帮我查一下chase and status最近的演出").parameters.artist, "chase and status");
});

test("Agent Dispatcher: with API key, Copilot goes to Harness instead of script preRoute", async () => {
  const calls = [];
  const result = await dispatchAgentWorkflow({
    message: "帮我查一下chase and status最近的演出",
    config: { apiKey: "sk-test" },
    harnessRuntime: {
      run: async (params) => {
        calls.push(params.message);
        return { type: "harness_turn", content: "ok", card: { sourceType: "artist_sets_selector", sets: [] } };
      },
    },
  });
  assert.deepEqual(calls, ["帮我查一下chase and status最近的演出"]);
  assert.equal(result.type, "harness_turn");
});
