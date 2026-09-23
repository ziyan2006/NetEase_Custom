process.env.NODE_ENV = "test";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer, resolveStaticPath } from "../server.js";

function createMultipartBody(fields) {
  const boundary = "----local-audio-converter-test";
  const chunks = [];

  for (const field of fields) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (field.fileName) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"; filename="${field.fileName}"\r\n`));
      chunks.push(Buffer.from("Content-Type: application/octet-stream\r\n\r\n"));
      chunks.push(field.value);
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}`));
    }
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return { boundary, body: Buffer.concat(chunks) };
}

function createSilenceWav() {
  const sampleRate = 8_000;
  const data = Buffer.alloc(sampleRate * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("rejects the supplied protected NCM file before invoking FFmpeg", async () => {
  const dummyNcm = Buffer.concat([Buffer.from("CTENFDAM"), Buffer.alloc(24)]);
  const { boundary, body } = createMultipartBody([
    { name: "format", value: "mp3" },
    { name: "file", fileName: "Baddadan.ncm", value: dummyNcm },
  ]);
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      supported: false,
      code: "PROTECTED_NCM",
      message: "检测到受保护的 NCM 文件；此工具不会解密或绕过访问控制。",
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("converts an unencrypted WAV upload to MP3 locally", async (t) => {
  const { boundary, body } = createMultipartBody([
    { name: "format", value: "mp3" },
    { name: "file", fileName: "sample.wav", value: createSilenceWav() },
  ]);
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/convert`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });

    // If ffmpeg is not installed on system, 500 is returned with descriptive message
    if (response.status === 500) {
      const err = await response.json();
      assert.ok(err.message.includes("转换失败"));
    } else {
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "audio/mpeg");
      assert.match(response.headers.get("content-disposition"), /sample\.mp3/);
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves the local conversion page through the explicit legacy fallback", async () => {
  const previousUiMode = process.env.YESMUSIC_UI;
  process.env.YESMUSIC_UI = "legacy";
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /本地音频转换/);
  } finally {
    try {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } finally {
      if (previousUiMode === undefined) delete process.env.YESMUSIC_UI;
      else process.env.YESMUSIC_UI = previousUiMode;
    }
  }
});

test("routes the root to the DJ UI by default and honors the legacy fallback", () => {
  assert.equal(resolveStaticPath("/"), "/dj/index.html");
  assert.equal(resolveStaticPath("/", "legacy"), "/index.html");
  assert.equal(resolveStaticPath("/dj/"), "/dj/index.html");
});

test("streams realtime progress events while exporting a playlist (SSE)", async () => {
  const originalFetch = globalThis.fetch;
  const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]);
  let upstreamCallCount = 0;

  // 桩替所有上游请求：歌单详情 / 播放直链 / 音频下载（本地服务请求放行）
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.startsWith("http://127.0.0.1")) {
      return originalFetch(url, options);
    }
    upstreamCallCount++;
    if (urlStr.includes("/api/v6/playlist/detail")) {
      return new Response(JSON.stringify({
        code: 200,
        playlist: {
          name: "Test PL",
          tracks: [
            { id: 1001, name: "Song One", ar: [{ name: "Artist A" }] },
            { id: 1002, name: "Song Two", ar: [{ name: "Artist B" }] },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr.includes("/api/song/enhance/player/url/v1")) {
      return new Response(JSON.stringify({
        code: 200,
        data: [
          { id: 1001, url: "http://fake-cdn.local/1.mp3" },
          { id: 1002, url: "http://fake-cdn.local/2.mp3" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr.startsWith("http://fake-cdn.local/")) {
      return new Response(new Blob([mp3Bytes]), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }
    return new Response(JSON.stringify({ code: 200 }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/playlist/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ id: "123", name: "Test PL", outputRoot: "./test_export_temp", cookie: "MUSIC_U=x", jobId: "test-export-job-123" }),
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);

    const body = await response.text();
    const events = body
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));

    const types = events.map((e) => e.type);
    assert.equal(types[0], "start");
    assert.equal(events[0].total, 2);
    assert.ok(types.includes("urls"));
    assert.ok(types.includes("track"));
    assert.ok(types.includes("progress"));
    assert.ok(types.includes("track-done"));
    assert.equal(types[types.length - 1], "done");

    const doneEvt = events[events.length - 1];
    assert.equal(doneEvt.successCount, 2);
    assert.equal(doneEvt.failedCount, 0);
    assert.equal(doneEvt.overall, 100);

    const completedUpstreamCalls = upstreamCallCount;
    const resumed = await fetch(`http://127.0.0.1:${port}/api/playlist/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ id: "123", name: "Test PL", outputRoot: "./test_export_temp", cookie: "MUSIC_U=x", jobId: "test-export-job-123", resume: true }),
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.headers.get("x-export-job-id"), "test-export-job-123");
    const resumedEvents = (await resumed.text())
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()));
    assert.equal(resumedEvents.at(-1)?.type, "done", "reconnected clients receive the recorded completion event");
    assert.equal(upstreamCallCount, completedUpstreamCalls, "reattaching must not start a duplicate export");

    const unknownResume = await fetch(`http://127.0.0.1:${port}/api/playlist/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ id: "123", name: "Test PL", outputRoot: "./test_export_temp", cookie: "MUSIC_U=x", jobId: "unknown-export-job", resume: true }),
    });
    assert.equal(unknownResume.status, 404, "unknown resumed jobs must not be silently rerun");
    assert.match((await unknownResume.json()).message, /无法确认/);

    const progressEvts = events.filter((e) => e.type === "progress");
    assert.ok(progressEvts.length >= 2, "should emit per-track progress events");
    assert.ok(progressEvts.every((e) => e.speedBytesPerSec >= 0));
    assert.equal(progressEvts[progressEvts.length - 1].percent, 100);
  } finally {
    globalThis.fetch = originalFetch;
    const fs = await import("node:fs/promises");
    await fs.rm("./test_export_temp", { recursive: true, force: true }).catch(() => null);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("keeps an export alive after its SSE client disconnects and resumes the same job without duplicating it", async () => {
  const originalFetch = globalThis.fetch;
  const outputRoot = await mkdtemp(join(tmpdir(), "yesmusic-resume-export-"));
  let detailCalls = 0;
  let releaseDownload;
  let markDownloadStarted;
  const downloadBlocked = new Promise(resolve => { releaseDownload = resolve; });
  const downloadStarted = new Promise(resolve => { markDownloadStarted = resolve; });
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.startsWith("http://127.0.0.1")) return originalFetch(url, options);
    if (urlStr.includes("/api/v6/playlist/detail")) {
      detailCalls++;
      return new Response(JSON.stringify({ code: 200, playlist: { name: "Resume Fixture", tracks: [{ id: 321, name: "Slow Track", ar: [{ name: "Artist" }] }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr.includes("/api/song/enhance/player/url/v1")) {
      return new Response(JSON.stringify({ code: 200, data: [{ id: 321, url: "http://fake-cdn.local/slow.mp3" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr === "http://fake-cdn.local/slow.mp3") {
      markDownloadStarted();
      await downloadBlocked;
      return new Response(new Blob([Uint8Array.from([0x49, 0x44, 0x33, 1, 2, 3, 4, 5])]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    return new Response(JSON.stringify({ code: 200 }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const server = createAppServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const input = { id: "987", name: "Resume Fixture", outputRoot, cookie: "MUSIC_U=resume-test", jobId: "resume-job-123456" };
    const first = await fetch(`http://127.0.0.1:${port}/api/playlist/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify(input),
    });
    assert.equal(first.status, 200);
    const firstReader = first.body.getReader();
    const decoder = new TextDecoder();
    let firstBuffer = "";
    while (!firstBuffer.includes('"type":"track"')) {
      const { done, value } = await firstReader.read();
      assert.equal(done, false, "the initial stream should remain open during download");
      firstBuffer += decoder.decode(value, { stream: true });
    }
    await firstReader.cancel();
    await Promise.race([
      downloadStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error("download fixture did not start")), 2000)),
    ]);

    const resumed = await fetch(`http://127.0.0.1:${port}/api/playlist/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify({ ...input, resume: true }),
    });
    assert.equal(resumed.status, 200);
    assert.equal(resumed.headers.get("x-export-job-id"), input.jobId);
    releaseDownload();
    const resumedBody = await resumed.text();
    const resumedEvents = resumedBody.split("\n").filter(line => line.startsWith("data:")).map(line => JSON.parse(line.slice(5).trim()));
    assert.ok(resumedEvents.some(event => event.type === "track"), "the resumed stream starts with the last persisted stage");
    assert.equal(resumedEvents.at(-1)?.type, "done");
    assert.equal(detailCalls, 1, "reconnecting must not launch the same export twice");
  } finally {
    releaseDownload();
    globalThis.fetch = originalFetch;
    await rm(outputRoot, { recursive: true, force: true }).catch(() => null);
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("exports one authenticated song by ID directly into the configured output root", async () => {
  const originalFetch = globalThis.fetch;
  const outputRoot = await mkdtemp(join(tmpdir(), "yesmusic-single-export-"));
  const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 1, 2, 3, 4, 5, 6, 7, 8]);
  const upstreamCalls = [];
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.startsWith("http://127.0.0.1")) return originalFetch(url, options);
    upstreamCalls.push({ url: urlStr, options });
    if (urlStr.includes("/song/detail")) {
      return new Response(JSON.stringify({ code: 200, songs: [
        { id: 9081, name: "Fixture Opening", ar: [{ name: "Fixture Artist" }] },
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr.includes("/song/enhance/player/url/v1")) {
      return new Response(JSON.stringify({ code: 200, data: [{ id: 9081, url: "http://fake-cdn.local/fixture.mp3" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (urlStr.startsWith("http://fake-cdn.local/")) {
      return new Response(mp3Bytes, { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    throw new Error(`Unexpected upstream request: ${urlStr}`);
  };

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address();
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/song/export`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "9081", outputRoot }),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await readdir(outputRoot), []);

    const mismatchedId = await fetch(`http://127.0.0.1:${port}/api/song/export`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "9999", outputRoot, cookie: "MUSIC_U=fixture" }),
    });
    assert.equal(mismatchedId.status, 404);
    assert.deepEqual(await readdir(outputRoot), []);

    const response = await fetch(`http://127.0.0.1:${port}/api/song/export`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "9081", outputRoot, cookie: "MUSIC_U=fixture" }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.code, 200);
    assert.equal(result.fileName, "Fixture Artist - Fixture Opening.mp3");
    assert.equal(result.filePath, join(outputRoot, result.fileName));
    assert.deepEqual(await readFile(result.filePath), Buffer.from(mp3Bytes));
    assert.equal(upstreamCalls.length, 4);
    assert.ok(upstreamCalls.filter(({ url }) => url.includes("music.163.com/api/")).every(({ options }) => options.headers.Cookie.includes("MUSIC_U=fixture")));
  } finally {
    globalThis.fetch = originalFetch;
    await rm(outputRoot, { recursive: true, force: true });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
