import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlaylistOutputPath } from "../lib/audio-exporter.js";

test("resolvePlaylistOutputPath creates subfolder under root directory", () => {
  const result = resolvePlaylistOutputPath("D:/DJ_Library", "House Hits 2026", "David Guetta", "Titanium");
  assert.match(result.playlistDir, /[\\/]House Hits 2026$/);
  assert.match(result.filePath, /[\\/]David Guetta - Titanium\.mp3$/);
});
