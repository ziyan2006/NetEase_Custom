/**
 * 热单雷达数据管道 (Radar Pipeline)
 * 编排: 并行抓取多平台 → 归一化 → 跨源融合排序 → TTL 缓存
 *
 * 降级链:
 *   1. TTL 缓存 (6h)
 *   2. 实时多源并行: Deezer(免鉴权) + Spotify + Last.fm + Beatport(快速尝试)
 *   3. Beatport 浏览器穿透 (慢, 仅在快速源结果不足时触发)
 *   4. 全失败 → 返回空, 由上层走 AI 生成兜底 (需明确标注)
 */

import { normalizeGenreKey, getPlatformParams, getSupportedGenres } from "./genre-map.js";
import { readChartCache, writeChartCache } from "./cache.js";
import { normalizeTrack, fuseTracks } from "./normalize.js";
import { fetchDeezerTracks } from "./sources/deezer-source.js";
import { fetchSpotifyTracks } from "./sources/spotify-source.js";
import { fetchLastfmTracks } from "./sources/lastfm-source.js";
import { fetchBeatportTracks } from "./sources/beatport-source.js";
import { fetchAppleTracks } from "./sources/apple-source.js";

const FAST_SOURCE_TIMEOUT_MS = 9000;
const MIN_TRACKS_BEFORE_BROWSER = 8;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * 获取某流派的多平台真实热单
 * @param {string} genreInput - 用户输入或流派档案 ID (如 "tech_house", "Melodic Techno")
 * @param {object} [options] - { noCache: boolean }
 * @returns {Promise<object>} {
 *   genreKey, genreName, tracks (归一化+融合排序后), sources: string[],
 *   fetchedAt, cached: boolean, degraded: boolean, error?: string
 * }
 */
export async function getRadarTracks(genreInput, options = {}) {
  const genreKey = normalizeGenreKey(genreInput);
  const displayName = genreKey ? genreKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : String(genreInput || "Electronic");
  if (!genreKey) {
    return {
      genreKey: null,
      genreName: displayName,
      tracks: [],
      sources: [],
      fetchedAt: Date.now(),
      cached: false,
      degraded: true,
      error: `未识别的流派: ${genreInput}`,
    };
  }

  const cacheKey = `radar_${genreKey}`;
  if (!options.noCache) {
    const cached = readChartCache(cacheKey, CACHE_TTL_MS);
    if (cached && cached.tracks && cached.tracks.length > 0) {
      return { ...cached, cached: true };
    }
  }

  const params = getPlatformParams(genreKey);
  const startedAt = Date.now();

  // ---- 快速源并行抓取 ----
  const fastResults = await Promise.allSettled([
    withTimeout(fetchDeezerTracks(genreKey), FAST_SOURCE_TIMEOUT_MS, "Deezer"),
    withTimeout(fetchSpotifyTracks(params.spotifySeeds), FAST_SOURCE_TIMEOUT_MS, "Spotify"),
    withTimeout(fetchLastfmTracks(params.lastfm), FAST_SOURCE_TIMEOUT_MS, "Last.fm"),
    withTimeout(fetchAppleTracks("us", 30), FAST_SOURCE_TIMEOUT_MS, "Apple Music"),
    // Beatport 快速尝试 (普通 HTTP, 可能 403/401 快速失败)
    params.beatport
      ? withTimeout(fetchBeatportTracks(params.beatport, { fastOnly: true }), 10000, "Beatport")
      : Promise.resolve([]),
  ]);

  let allRaw = [];
  const sourcesUsed = [];
  const sourceLabelMap = {};

  const srcDefs = [
    { name: "deezer", label: "Deezer 全球热榜", extract: (v) => (v && Array.isArray(v.tracks) ? v.tracks : []) },
    { name: "spotify", label: "Spotify 推荐引擎", extract: (v) => (Array.isArray(v) ? v : []) },
    { name: "lastfm", label: "Last.fm 周榜", extract: (v) => (Array.isArray(v) ? v : []) },
    { name: "apple", label: "Apple Music 全球热播", extract: (v) => (Array.isArray(v) ? v : []) },
    { name: "beatport", label: "Beatport Top 100", extract: (v) => (Array.isArray(v) ? v : []) },
  ];

  fastResults.forEach((res, idx) => {
    const def = srcDefs[idx];
    if (res.status === "fulfilled") {
      const items = def.extract(res.value);
      if (Array.isArray(items) && items.length > 0) {
        allRaw.push(...items.map((t) => ({ ...t, _source: def.name })));
        sourcesUsed.push(def.name);
        // Deezer 返回自定义标签 (Deep House 电台 / Dance 全球榜)
        if (def.name === "deezer" && res.value?.label) {
          sourceLabelMap.deezer = res.value.label;
        }
      }
    }
  });

  // ---- 快速源结果不足时, 尝试 Beatport 浏览器穿透 (慢) ----
  if (allRaw.length < MIN_TRACKS_BEFORE_BROWSER && params.beatport) {
    try {
      const bpTracks = await withTimeout(
        fetchBeatportTracks(params.beatport, {}),
        30000,
        "Beatport 浏览器穿透"
      );
      if (Array.isArray(bpTracks) && bpTracks.length > 0) {
        allRaw.push(...bpTracks.map((t) => ({ ...t, _source: "beatport" })));
        if (!sourcesUsed.includes("beatport")) sourcesUsed.push("beatport");
      }
    } catch (err) {
      console.warn("[Radar Pipeline] Beatport 浏览器穿透失败:", err.message);
    }
  }

  // ---- 归一化 + 融合排序 ----
  const normalized = allRaw
    .map((t) => {
      const source = t._source || "unknown";
      const { _source, ...rest } = t;
      return normalizeTrack(rest, source);
    })
    .filter(Boolean);

  const fused = fuseTracks(normalized, 12);

  const result = {
    genreKey,
    genreName: displayName,
    tracks: fused,
    sources: sourcesUsed,
    sourceLabels: sourcesUsed.map((s) => sourceLabelMap[s] || srcDefs.find((d) => d.name === s)?.label || s),
    fetchedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    cached: false,
    degraded: fused.length < 5,
  };

  // 有数据才写缓存 (避免缓存空结果)
  if (fused.length >= 5) {
    writeChartCache(cacheKey, { ...result, cached: false });
  }

  return result;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 兼容旧接口: 获取流派档案展示信息 */
export function getRadarGenres() {
  return getSupportedGenres();
}
