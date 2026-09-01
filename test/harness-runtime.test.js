import test from "node:test";
import assert from "node:assert/strict";
import { mapHarnessNotification, shouldRouteToHarnessCrate, HarnessRuntime } from "../lib/dj-agent/harness-runtime.js";

test("Harness crate routing: positive set-planning cases", () => {
  assert.equal(shouldRouteToHarnessCrate("帮我排一套 128 BPM 的 Melodic Techno"), true);
  assert.equal(shouldRouteToHarnessCrate("排一张 Peak Time Techno 歌单"), true);
  assert.equal(shouldRouteToHarnessCrate("推荐一套适合暖场的 Afro House set"), true);
  assert.equal(shouldRouteToHarnessCrate("帮我选曲编排"), true);
  assert.equal(shouldRouteToHarnessCrate("playlist for tonight"), true);
  assert.equal(shouldRouteToHarnessCrate("crate digging for tech house"), true);
  assert.equal(shouldRouteToHarnessCrate("DJ set 编排"), true);
  assert.equal(shouldRouteToHarnessCrate("tracklist 策划"), true);
});

test("Harness crate routing: negative cases (standalone recommendation and excluded intents)", () => {
  // 单独出现“推荐”不得触发 crate
  assert.equal(shouldRouteToHarnessCrate("推荐"), false);
  assert.equal(shouldRouteToHarnessCrate("推荐一些好听的歌"), false);
  assert.equal(shouldRouteToHarnessCrate("推荐几个 Melodic Techno 制作人"), false);
  assert.equal(shouldRouteToHarnessCrate("推荐适合 8A 的接歌调性"), false);
  assert.equal(shouldRouteToHarnessCrate("解析这个 1001Tracklists Set"), false);
  assert.equal(shouldRouteToHarnessCrate("8A 调性怎么接歌"), false);
});

test("Harness notifications map text, reasoning, and tool calls to Copilot events", () => {
  const events = [];
  const state = { hasVisibleText: false };
  mapHarnessNotification({
    method: "session.event",
    params: { event: { type: "assistant/chunk", data: { chunk: { type: "text-delta", text: "候选曲目" } } } },
  }, state, (event) => events.push(event));
  mapHarnessNotification({
    method: "session.event",
    params: { event: { type: "assistant/chunk", data: { chunk: { type: "reasoning-delta", text: "分析" } } } },
  }, state, (event) => events.push(event));
  mapHarnessNotification({
    method: "session.event",
    params: { event: { type: "tool/call", data: { callId: "call-1", name: "search_netease_tracks", arguments: '{"query":"Sub Focus"}' } } },
  }, state, (event) => events.push(event));

  assert.deepEqual(events, [
    { type: "text", data: "候选曲目" },
    { type: "reasoning", data: "分析" },
    { type: "tool_start", data: { id: "call-1", tool: "search_netease_tracks", name: "search_netease_tracks", params: { query: "Sub Focus" } } },
  ]);
  assert.equal(state.hasVisibleText, true);
});

test("HarnessRuntime: instance cache key includes apiKey, model, and baseUrl", async () => {
  const runtime = new HarnessRuntime();
  const optionsLog = [];
  runtime._createHarness = (options) => {
    optionsLog.push(options);
    return {
      run: async () => ({ finalResponse: "ok", sessionId: "s1" }),
      close: async () => {},
    };
  };

  await runtime.run({ message: "排一套歌", config: { apiKey: "key1", model: "model-a", baseUrl: "https://api.a.com" } });
  assert.equal(optionsLog.length, 1);
  assert.equal(optionsLog[0].model, "model-a");

  // Same config -> reused (no new instantiation)
  await runtime.run({ message: "排一套歌", config: { apiKey: "key1", model: "model-a", baseUrl: "https://api.a.com" } });
  assert.equal(optionsLog.length, 1);

  // Different model -> recreates harness
  await runtime.run({ message: "排一套歌", config: { apiKey: "key1", model: "model-b", baseUrl: "https://api.a.com" } });
  assert.equal(optionsLog.length, 2);

  // Different baseUrl -> recreates harness
  await runtime.run({ message: "排一套歌", config: { apiKey: "key1", model: "model-b", baseUrl: "https://api.b.com" } });
  assert.equal(optionsLog.length, 3);

  // Different apiKey -> recreates harness
  await runtime.run({ message: "排一套歌", config: { apiKey: "key2", model: "model-b", baseUrl: "https://api.b.com" } });
  assert.equal(optionsLog.length, 4);

  await runtime.close();
});

test("HarnessRuntime: returns card in result matching SSE card payload for sessionStore persistence", async () => {
  const runtime = new HarnessRuntime();
  const sseEvents = [];
  const fakeResponse = "Here is the set:\n\n```json\n[{\"title\":\"Renaissance\",\"artist\":\"Culture Shock\",\"version\":\"Original Mix\",\"bpm\":174,\"camelot\":\"8A\"}]\n```";
  runtime._createHarness = () => ({
    run: async () => ({
      finalResponse: fakeResponse,
      sessionId: "sess-123",
    }),
    close: async () => {},
  });

  const result = await runtime.run({
    message: "帮我排一套 DnB",
    sessionId: "sess-123",
    config: { apiKey: "test-key" },
    onStream: (evt) => sseEvents.push(evt),
  });

  assert.equal(result.type, "harness_crate_plan");
  assert.ok(result.content);
  // When card is emitted in SSE, result.card MUST also be populated
  const sseCard = sseEvents.find((e) => e.type === "card")?.data;
  if (sseCard) {
    assert.deepEqual(result.card, sseCard);
  }
  await runtime.close();
});

test("HarnessRuntime: handles AbortSignal and cleans up listener", async () => {
  const runtime = new HarnessRuntime();
  const controller = new AbortController();

  runtime._createHarness = () => ({
    run: async () => {
      controller.abort();
      throw new Error("Aborted");
    },
    close: async () => {},
  });

  await assert.rejects(
    () => runtime.run({
      message: "排一套歌",
      config: { apiKey: "test-key" },
      signal: controller.signal,
    })
  );

  await runtime.close();
});

test("HarnessRuntime: verifies packaged launch env and spawn parameters (Node mode & userData paths)", async () => {
  const runtime = new HarnessRuntime();
  let capturedOptions = null;
  runtime._createHarness = (options) => {
    capturedOptions = options;
    return {
      run: async () => ({ finalResponse: "OK", sessionId: "s-pack" }),
      close: async () => {},
    };
  };

  const fakeUserData = "C:\\Users\\test\\AppData\\Roaming\\YesMusic DJ Helper";
  process.env.DSH_HOME = `${fakeUserData}\\dsh-home`;
  process.env.YESMUSIC_HARNESS_RUNTIME_DIR = `${fakeUserData}\\harness-runtime`;

  try {
    await runtime.run({
      message: "排一套歌",
      config: { apiKey: "test-api-key", model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com" },
    });

    assert.ok(capturedOptions, "Harness options should be passed");
    assert.equal(capturedOptions.launch.env.ELECTRON_RUN_AS_NODE, "1");
    assert.equal(capturedOptions.launch.env.DEEPSEEK_API_KEY, "test-api-key");
    assert.equal(capturedOptions.launch.command, process.execPath);
    assert.equal(capturedOptions.launch.cwd, `${fakeUserData}\\harness-runtime`);
    assert.ok(capturedOptions.launch.args[0].includes("sdk-runtime.mjs"));
  } finally {
    delete process.env.DSH_HOME;
    delete process.env.YESMUSIC_HARNESS_RUNTIME_DIR;
    await runtime.close();
  }
});


