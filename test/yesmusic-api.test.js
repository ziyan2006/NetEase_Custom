import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../renderer/src/yesmusic-api.ts", import.meta.url), "utf8");
const javascript = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const api = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("YesMusic API normalizes real NetEase playlist and track fields", () => {
  assert.deepEqual(api.normalizeNeteasePlaylist({ id: 123, name: "Warm-up", coverImgUrl: "https://img/cover.jpg", trackCount: 32, creator: { userId: 9 } }), {
    id: "123", name: "Warm-up", coverUrl: "https://img/cover.jpg", trackCount: 32, ownerId: "9",
  });
  assert.deepEqual(api.normalizeNeteaseTrack({ track: { id: 88, name: "Opening", ar: [{ name: "A" }, { name: "B" }], al: { name: "Album", picUrl: "https://img/album.jpg" }, dt: 187000 } }), {
    id: "88", title: "Opening", artists: ["A", "B"], album: "Album", coverUrl: "https://img/album.jpg", durationMs: 187000,
  });
  assert.equal(api.normalizeNeteaseTrack({ name: "Missing ID" }), null);
});

test("authenticated GET uses x-cookie and keeps credentials out of the URL", async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.localStorage = { getItem: key => key === "netease_cookie" ? "MUSIC_U=test-value" : null };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, userId: 1, playlists: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await api.yesmusicApi.getPlaylists();
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.headers["x-cookie"], "MUSIC_U=test-value");
    assert.equal(calls[0].url.includes("cookie="), false);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test("mutations preserve the backend request contract and business errors reject", async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.localStorage = { getItem: () => "MUSIC_U=test-value" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200 }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await api.yesmusicApi.updatePlaylistTracks("add", "playlist-1", ["track-1"]);
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.op, "add");
    assert.equal(body.pid, "playlist-1");
    assert.deepEqual(body.trackIds, ["track-1"]);
    assert.equal(body.cookie, "MUSIC_U=test-value");
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 301, message: "登录失效" }), { status: 200 });
    await assert.rejects(api.yesmusicApi.getPlaylists(), /登录失效/);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test("search returns normalized real tracks without credentials in the URL", async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.localStorage = { getItem: () => "MUSIC_U=test-value" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, result: { songCount: 1, songs: [
      { id: 88, name: "Opening", ar: [{ name: "A" }], al: { name: "Album", picUrl: "https://img/album.jpg" }, dt: 187000 },
    ] } }), { status: 200 });
  };
  try {
    const result = await api.yesmusicApi.searchSongs(" Opening ");
    assert.equal(result.total, 1);
    assert.equal(result.songs[0].id, "88");
    assert.equal(result.songs[0].artists[0], "A");
    assert.equal(calls[0].options.headers["x-cookie"], undefined);
    assert.match(calls[0].url, /keywords=Opening/);
    assert.equal(calls[0].url.includes("MUSIC_U"), false);
    await assert.rejects(api.yesmusicApi.searchSongs("   "), /请输入歌曲名/);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test("song URL uses x-cookie, and an unavailable source is returned as null", async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.localStorage = { getItem: () => "MUSIC_U=test-value" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ code: 200, data: [{ id: 88, url: null }] }), { status: 200 });
  };
  try {
    assert.equal(await api.yesmusicApi.getSongUrl("88"), null);
    assert.equal(calls[0].options.headers["x-cookie"], "MUSIC_U=test-value");
    assert.equal(calls[0].url.includes("cookie="), false);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});

test("SSE parser handles split JSON, multiple frames, CRLF, data prefixes, and final buffered frames", () => {
  const events = [];
  const parser = new api.SseJsonParser(event => events.push(event));
  parser.push(`retry: 1000\r\n\r\ndata: {"type":"start","total":2}\r\n\r\ndata: {"type":"prog`);
  parser.push(`ress","overall":48}\n\n`);
  parser.push(`event: done\ndata: {"type":"done","successCount":2}`);
  parser.finish();
  assert.deepEqual(events, [
    { type: "start", total: 2 },
    { type: "progress", overall: 48 },
    { type: "done", successCount: 2 },
  ]);
});

test("playlist export sends credentials only in the POST body and requires a done event", async () => {
  const originalStorage = globalThis.localStorage;
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.localStorage = { getItem: () => "MUSIC_U=export-fixture" };
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const chunks = [
      `data: ${JSON.stringify({ type: "start", total: 2, overall: 0 })}\r\n\r\n`,
      `data: ${JSON.stringify({ type: "done", total: 2, completed: 2, successCount: 1, failedCount: 1, overall: 100 })}`,
    ];
    const stream = new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
  };
  try {
    const seen = [];
    await api.yesmusicApi.exportPlaylist({ id: "123", name: "Peak Hour", outputRoot: "D:\\\\DJ", jobId: "export-job-12345", resume: true }, event => seen.push(event));
    const body = JSON.parse(calls[0].options.body);
    assert.equal(calls[0].url, "/api/playlist/export");
    assert.equal(calls[0].options.headers.Accept, "text/event-stream");
    assert.deepEqual(body, { id: "123", name: "Peak Hour", outputRoot: "D:\\\\DJ", jobId: "export-job-12345", resume: true, cookie: "MUSIC_U=export-fixture" });
    assert.equal(calls[0].url.includes("MUSIC_U"), false);
    assert.equal(seen.at(-1).type, "done");

    globalThis.fetch = async () => new Response(`data: {"type":"start","total":1}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    await assert.rejects(api.yesmusicApi.exportPlaylist({ id: "123", name: "Peak Hour", outputRoot: "D:\\\\DJ" }, () => {}), /没有收到完成事件/);
  } finally {
    globalThis.localStorage = originalStorage;
    globalThis.fetch = originalFetch;
  }
});
