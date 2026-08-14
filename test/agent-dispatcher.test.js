import test from "node:test";
import assert from "node:assert/strict";
import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";

test("Agent Dispatcher: Multi-line text setlist extraction & card output", async () => {
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

  assert.equal(result.type, "text_setlist");
  assert.ok(result.card);
  assert.equal(result.card.sourceType, "custom_setlist");
  assert.ok(result.card.tracks.length > 0);
  assert.ok(streamEvents.some((e) => e.type === "card"));
});

test("Agent Dispatcher: Camelot Harmonic Transition detection", async () => {
  const streamEvents = [];
  const result = await dispatchAgentWorkflow({
    message: "推荐适合 8A 的接歌调性",
    onStream: (ev) => streamEvents.push(ev),
  });

  assert.equal(result.type, "camelot");
  assert.equal(result.baseKey, "8A");
  assert.equal(result.compatible.length, 6);
  assert.ok(streamEvents.some((e) => e.type === "text" && e.data.includes("Camelot 调性轮盘过渡指南")));
});

test("Agent Dispatcher: Genre Radar intent detection", async () => {
  const streamEvents = [];
  const result = await dispatchAgentWorkflow({
    message: "帮我推荐本周 Melodic Techno 风格热门单曲",
    onStream: (ev) => streamEvents.push(ev),
  });

  assert.equal(result.type, "trend_radar");
  assert.ok(result.card);
  assert.ok(result.card.tracks.length > 0);
  assert.ok(streamEvents.some((e) => e.type === "card"));
});
