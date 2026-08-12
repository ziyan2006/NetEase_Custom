import test from "node:test";
import assert from "node:assert/strict";
import { formatSongFilename, sanitizeFolderName } from "../lib/playlist-exporter.js";

test("sanitizeFolderName removes illegal path characters", () => {
  assert.equal(sanitizeFolderName("House: Best/2026?"), "House_ Best_2026_");
  assert.equal(sanitizeFolderName("   "), "Unassigned");
});

test("formatSongFilename produces Artist - Title.mp3", () => {
  assert.equal(formatSongFilename("David Guetta", "Titanium"), "David Guetta - Titanium.mp3");
  assert.equal(formatSongFilename("", "SoloTrack"), "Unknown Artist - SoloTrack.mp3");
});
