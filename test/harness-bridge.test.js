import test from "node:test";
import assert from "node:assert/strict";
import { mapHarnessTrackSearchResults, parseHarnessTrackSearchRequest } from "../lib/dj-agent/harness-bridge.js";

test("Harness bridge validates anonymous NetEase search input", () => {
  assert.deepEqual(parseHarnessTrackSearchRequest({ query: "  Sub Focus  ", limit: 12 }), {
    query: "Sub Focus",
    limit: 12,
  });
  assert.throws(() => parseHarnessTrackSearchRequest({ query: "" }), /缺少检索关键词/);
  assert.throws(() => parseHarnessTrackSearchRequest({ query: "test", limit: 21 }), /1 到 20/);
});

test("Harness bridge exposes catalog matches without claiming external verification", () => {
  const result = mapHarnessTrackSearchResults("Sub Focus", [{
    id: 42,
    name: "Vibration",
    ar: [{ name: "Sub Focus" }],
    al: { name: "Evolve" },
    dt: 221000,
  }]);

  assert.deepEqual(result.tracks, [{
    id: 42,
    title: "Vibration",
    artist: "Sub Focus",
    album: "Evolve",
    durationMs: 221000,
    neteaseUrl: "https://music.163.com/#/song?id=42",
    verification: "catalog_match_only",
  }]);
  assert.match(result.verificationNotice, /不替代/);
});
