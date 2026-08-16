/**
 * 热单雷达模块测试 (genre-map / normalize / cache / pipeline)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGenreKey, getPlatformParams, getSupportedGenres } from "../lib/dj-agent/radar/genre-map.js";
import { normalizeTrack, fuseTracks } from "../lib/dj-agent/radar/normalize.js";
import { readChartCache, writeChartCache, clearChartCache } from "../lib/dj-agent/radar/cache.js";
import { getRadarTracks } from "../lib/dj-agent/radar/radar-pipeline.js";

test("Genre Map: 流派规范化", () => {
  assert.equal(normalizeGenreKey("Tech House"), "tech_house");
  assert.equal(normalizeGenreKey("techhouse"), "tech_house");
  assert.equal(normalizeGenreKey("Melodic Techno"), "melodic_techno");
  assert.equal(normalizeGenreKey("Drum & Bass"), "drum_and_bass");
  assert.equal(normalizeGenreKey("dnb"), "drum_and_bass");
  assert.equal(normalizeGenreKey("drum_and_bass"), "drum_and_bass");
  assert.equal(normalizeGenreKey("不存在的流派"), null);
});

test("Genre Map: 平台参数映射", () => {
  const p = getPlatformParams("tech_house");
  assert.ok(p);
  assert.deepEqual(p.beatport, { slug: "tech-house", id: 11 });
  assert.equal(p.lastfm, "tech house");
  assert.ok(p.spotifySeeds.includes("techhouse"));

  const genres = getSupportedGenres();
  assert.ok(genres.length >= 7);
  assert.ok(genres.some((g) => g.key === "drum_and_bass"));
});

test("Normalize: 统一 schema 与去重", () => {
  const raw = {
    artist: "Anyma",
    title: "Eternity",
    version: "Extended Mix",
    label: "Afterlife",
    bpm: 124,
    key: "F minor",
    rank: 3,
    coverUrl: "http://x/c.jpg",
  };
  const t = normalizeTrack(raw, "beatport");
  assert.ok(t);
  assert.equal(t.artist, "Anyma");
  assert.equal(t.camelot, "4A"); // F minor → 4A
  assert.equal(t.bpm, 124);
  assert.deepEqual(t.sources, ["beatport"]);
  assert.equal(t.rank, 3);
  assert.ok(t.searchQuery.includes("Anyma Eternity"));
  assert.ok(!t.searchQuery.includes("Extended Mix")); // 版本词被清洗掉, 便于搜索

  // 无效条目 (缺歌名/艺人) 返回 null
  assert.equal(normalizeTrack({ artist: "", title: "X" }, "deezer"), null);
});

test("Normalize: 跨源融合排序", () => {
  const t1 = normalizeTrack({ artist: "Anyma", title: "Eternity", rank: 1 }, "beatport");
  const t2 = normalizeTrack({ artist: "Anyma", title: "Eternity", rank: 2, bpm: 124 }, "deezer");
  const t3 = normalizeTrack({ artist: "Fisher", title: "Losing It", rank: 1 }, "deezer");

  const fused = fuseTracks([t3, t1, t2], 10);
  assert.equal(fused.length, 2);

  const an = fused.find((f) => f.artist === "Anyma");
  assert.ok(an);
  // 跨源合并: 双来源 + 取更优名次 + 补充 bpm
  assert.deepEqual(an.sources.sort(), ["beatport", "deezer"]);
  assert.equal(an.rank, 1);
  assert.equal(an.bpm, 124);
  // 双源命中 fusionScore 更高
  assert.ok(an.fusionScore > fused.find((f) => f.artist === "Fisher").fusionScore);
});

test("Chart Cache: TTL 读写与过期", () => {
  const key = "radar_test_cache";
  clearChartCache(key);
  assert.equal(readChartCache(key), null);

  writeChartCache(key, { tracks: [{ artist: "A", title: "B" }] });
  const hit = readChartCache(key, 60 * 1000);
  assert.ok(hit && hit.tracks.length === 1);
  assert.equal(hit.tracks[0].artist, "A");

  // 已过期
  const expired = readChartCache(key, -1000);
  assert.equal(expired, null);

  clearChartCache(key);
  assert.equal(readChartCache(key), null);
});

test("Radar Pipeline: 已识别流派返回结构化结果 (缓存优先, 不依赖网络)", async () => {
  // 先写入缓存, 保证测试不依赖网络
  writeChartCache("radar_tech_house", {
    genreKey: "tech_house",
    genreName: "Tech House",
    tracks: [
      {
        artist: "Test Artist",
        title: "Test Track",
        version: "Original Mix",
        sources: ["deezer"],
        source: "deezer",
        rank: 1,
        searchQuery: "Test Artist Test Track Original Mix",
      },
    ],
    sources: ["deezer"],
    sourceLabels: ["Deezer Deep House 电台"],
    fetchedAt: Date.now(),
    cached: false,
    degraded: false,
  });

  const res = await getRadarTracks("Tech House");
  assert.equal(res.genreKey, "tech_house");
  assert.equal(res.cached, true);
  assert.ok(res.tracks.length >= 1);
  assert.ok(Array.isArray(res.sourceLabels));

  clearChartCache("radar_tech_house");
});

test("Radar Pipeline: 未识别流派返回降级结果", async () => {
  const res = await getRadarTracks("完全不存在的流派");
  assert.equal(res.genreKey, null);
  assert.equal(res.degraded, true);
  assert.ok(res.error);
});
