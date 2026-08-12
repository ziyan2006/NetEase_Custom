import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlaylistOutputPath, downloadAndExportTrack } from "../lib/audio-exporter.js";

test("resolvePlaylistOutputPath creates subfolder under root directory", () => {
  const result = resolvePlaylistOutputPath("D:/DJ_Library", "House Hits 2026", "David Guetta", "Titanium");
  assert.match(result.playlistDir, /[\\/]House Hits 2026$/);
  assert.match(result.filePath, /[\\/]David Guetta - Titanium\.mp3$/);
});

test("downloadAndExportTrack conditionally sends Cookie header only to music.163.com", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      headers: new Map([["content-type", "audio/mpeg"]]),
      arrayBuffer: async () => Uint8Array.from([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0]).buffer,
    };
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
    });

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
    const fs = await import("node:fs/promises");
    await fs.rm("./test_temp", { recursive: true, force: true }).catch(() => null);
  }
});
