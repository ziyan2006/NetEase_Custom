import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAppServer } from "../server.js";

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
  const inputPath = "C:\\Users\\znong\\Desktop\\bgm\\VipSongsDownload\\Chase & Status,Bou,iRah - Baddadan.ncm";
  const { boundary, body } = createMultipartBody([
    { name: "format", value: "mp3" },
    { name: "file", fileName: "Baddadan.ncm", value: await readFile(inputPath) },
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

test("converts an unencrypted WAV upload to MP3 locally", async () => {
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

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.match(response.headers.get("content-disposition"), /sample\.mp3/);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves the local conversion page", async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /本地音频转换/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("streams realtime progress events while exporting a playlist (SSE)", async () => {
  const originalFetch = globalThis.fetch;
  const mp3Bytes = Uint8Array.from([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]);

  // 桩替所有上游请求：歌单详情 / 播放直链 / 音频下载（本地服务请求放行）
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    if (urlStr.startsWith("http://127.0.0.1")) {
      return originalFetch(url, options);
    }
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
      body: JSON.stringify({ id: "123", name: "Test PL", outputRoot: "./test_export_temp", cookie: "MUSIC_U=x" }),
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
