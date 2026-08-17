import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlaylistOutputPath, downloadAndExportTrack } from "../lib/audio-exporter.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

// Helper to create a valid 1s MP3 buffer
async function createValidMp3Buffer() {
  const tempDir = await fs.mkdtemp(join(tmpdir(), "test-mp3-gen-"));
  const tempFile = join(tempDir, "silent.mp3");
  const p = spawn(ffmpegPath, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1", "-b:a", "320k", tempFile]);
  await new Promise((resolve) => p.on("close", resolve));
  const buf = await fs.readFile(tempFile);
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => null);
  return buf;
}

test("resolvePlaylistOutputPath creates subfolder under root directory", () => {
  const result = resolvePlaylistOutputPath("D:/DJ_Library", "House Hits 2026", "David Guetta", "Titanium");
  assert.match(result.playlistDir, /[\\/]House Hits 2026$/);
  assert.match(result.filePath, /[\\/]David Guetta - Titanium\.mp3$/);
});

test("downloadAndExportTrack conditionally sends Cookie header only to music.163.com", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const progressEvents = [];
  const validMp3 = await createValidMp3Buffer();

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(validMp3, {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    });
  };

  try {
    // Case 1: music.163.com 应该带有 Cookie
    await downloadAndExportTrack({
      outputRoot: "./test_temp",
      playlistName: "test_pl",
      artist: "Artist",
      title: "Title1",
      downloadUrl: "https://music.163.com/song/media/outer/url?id=1.mp3",
      cookie: "MUSIC_U=test_token",
      onProgress: (p) => progressEvents.push(p),
    });

    // 流式读取应按字节推送真实进度：最终 100%，字节数与文件大小一致
    assert.ok(progressEvents.length >= 1, "onProgress should be called at least once");
    const lastProgress = progressEvents[progressEvents.length - 1];
    assert.equal(lastProgress.percent, 100);
    assert.equal(lastProgress.downloaded, validMp3.length);
    assert.equal(lastProgress.phase, "processing");

    // Case 2: 126.net 应该不带 Cookie
    await downloadAndExportTrack({
      outputRoot: "./test_temp",
      playlistName: "test_pl",
      artist: "Artist",
      title: "Title2",
      downloadUrl: "http://m801.music.126.net/abc.mp3",
      cookie: "MUSIC_U=test_token",
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.headers["Cookie"], "MUSIC_U=test_token");
    assert.equal(requests[1].options.headers["Cookie"], undefined);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm("./test_temp", { recursive: true, force: true }).catch(() => null);
  }
});

test("downloadAndExportTrack embeds cover image and ID3 tags into MP3", async () => {
  const originalFetch = globalThis.fetch;
  const tempRoot = join(tmpdir(), `test_export_${Date.now()}`);
  const validMp3 = await createValidMp3Buffer();

  // 1x1 dummy jpeg bytes
  const dummyJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F, 0x00, 0xBF, 0x00, 0xFF, 0xD9]);

  globalThis.fetch = async (url) => {
    if (url.includes("cover.jpg")) {
      return new Response(dummyJpeg, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    return new Response(validMp3, { status: 200, headers: { "content-type": "audio/mpeg" } });
  };

  try {
    const res = await downloadAndExportTrack({
      outputRoot: tempRoot,
      playlistName: "DJ Hits",
      artist: "Sub Focus",
      title: "Desire",
      album: "Rampage 2026",
      coverUrl: "http://p1.music.126.net/cover.jpg",
      downloadUrl: "https://music.163.com/song/media/outer/url?id=999.mp3",
    });

    assert.ok(res.filePath);
    const fileStat = await fs.stat(res.filePath);
    assert.ok(fileStat.size > 0, "Exported file should exist and not be empty");

    // FFmpeg probe metadata verification
    const probe = spawn(ffmpegPath, ["-i", res.filePath]);
    let probeOutput = "";
    probe.stderr.on("data", (d) => probeOutput += d.toString());
    await new Promise((r) => probe.on("close", r));

    assert.match(probeOutput, /Sub Focus/i);
    assert.match(probeOutput, /Desire/i);
    assert.match(probeOutput, /Rampage 2026/i);
    assert.match(probeOutput, /attached pic/i);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => null);
  }
});
