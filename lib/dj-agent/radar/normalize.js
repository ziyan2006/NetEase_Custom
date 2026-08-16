/**
 * 多源榜单数据归一化与融合排序 (Normalize & Fusion Ranking)
 * 1. 将异构源数据转为统一 schema
 * 2. 跨源去重 (艺人+歌名相似度)
 * 3. 融合计分排序 (源权重 × 位置分 + 多源命中加成)
 */

import { stringSimilarity } from "../track-matcher.js";
import { normalizeCamelotKey } from "../camelot-engine.js";

// 各数据源可信度权重 (用于融合排序)
export const SOURCE_WEIGHTS = {
  beatport: 0.5,
  spotify: 0.2,
  tl1001: 0.15,
  deezer: 0.1,
  lastfm: 0.05,
};

const DEFAULT_WEIGHT = 0.1;

/** 规范化去重键: 小写 + 去标点 + 去 ft./feat. 参与艺人 */
function dedupKey(artist, title) {
  const cleanArtist = (artist || "")
    .toLowerCase()
    .replace(/\s+(ft\.?|feat\.?|featuring|with)\b.*$/i, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  const cleanTitle = (title || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return `${cleanArtist}|${cleanTitle}`;
}

/** 生成网易云搜索词 */
function buildSearchQuery(artist, title, version) {
  const cleanTitle = (title || "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const cleanVersion = (version || "")
    .replace(/^(original|extended|club|radio)\s+mix$/i, "")
    .replace(/[()]/g, " ")
    .trim();
  return `${artist || ""} ${cleanTitle} ${cleanVersion}`.replace(/\s+/g, " ").trim();
}

/**
 * 将单个源条目归一化为统一 schema
 * @param {object} raw - 源条目 (各 source 已做初步清洗)
 * @param {string} source - 来源标识
 * @returns {object} canonical track
 */
export function normalizeTrack(raw, source) {
  const artist = (raw.artist || raw.artists || "").trim();
  const title = (raw.title || raw.name || "").trim();
  if (!artist || !title) return null;

  const bpm = Number(raw.bpm) > 0 ? Math.round(Number(raw.bpm)) : null;
  const rawKey = (raw.key || raw.musicalKey || "").trim();
  const camelot = rawKey ? normalizeCamelotKey(rawKey) : null;

  const version = (raw.version || raw.mix || raw.mixName || "Original Mix").trim();

  return {
    artist,
    title,
    version,
    label: (raw.label || "").trim() || null,
    bpm,
    key: rawKey || null,
    camelot,
    source,
    sources: [source],
    rank: Number(raw.rank) > 0 ? Number(raw.rank) : null,
    releaseDate: (raw.releaseDate || raw.release_date || "").trim() || null,
    url: (raw.url || "").trim() || null,
    coverUrl: (raw.coverUrl || raw.cover || raw.image || "").trim() || null,
    genre: (raw.genre || "").trim() || null,
    searchQuery: buildSearchQuery(artist, title, version),
    dedupKey: dedupKey(artist, title),
  };
}

/**
 * 跨源去重 + 融合排序
 * @param {Array<object>} tracks - 归一化后的全部条目
 * @param {number} [limit] - 返回条数上限
 * @returns {Array<object>} 排序后的去重曲目
 */
export function fuseTracks(tracks, limit = 10) {
  const groups = new Map(); // dedupKey -> merged track

  for (const t of tracks) {
    if (!t) continue;
    let merged = null;
    // 先尝试相似度合并 (编辑距离 ≥ 0.85)
    for (const existing of groups.values()) {
      const artistSim = stringSimilarity(existing.artist, t.artist);
      const titleSim = stringSimilarity(existing.title, t.title);
      if (artistSim >= 0.85 && titleSim >= 0.85) {
        merged = existing;
        break;
      }
    }
    if (!merged) {
      merged = groups.get(t.dedupKey) || null;
    }
    if (!merged) {
      groups.set(t.dedupKey, { ...t });
      continue;
    }

    // 合并: 累积来源与名次
    if (!merged.sources.includes(t.source)) merged.sources.push(t.source);
    if (t.rank && (!merged.rank || t.rank < merged.rank)) {
      merged.rank = t.rank;
    }
    if (t.bpm && !merged.bpm) merged.bpm = t.bpm;
    if (t.camelot && !merged.camelot) merged.camelot = t.camelot;
    if (t.label && !merged.label) merged.label = t.label;
    if (t.coverUrl && !merged.coverUrl) merged.coverUrl = t.coverUrl;
    if (t.url && !merged.url) merged.url = t.url;
    if (t.releaseDate && !merged.releaseDate) merged.releaseDate = t.releaseDate;
  }

  const ranked = [...groups.values()].map((t) => {
    // 位置分: 名次越靠前越高 (rank 1 → 1.0)
    const positionScore = t.rank ? Math.max(0, 1 - (t.rank - 1) / 50) : 0.4;
    // 源权重: 取最高权重来源
    const weight = Math.max(...t.sources.map((s) => SOURCE_WEIGHTS[s] || DEFAULT_WEIGHT));
    // 多源命中加成: 每多一个来源 +15%
    const multiBonus = Math.min(0.3, (t.sources.length - 1) * 0.15);
    const fusionScore = weight * positionScore + multiBonus;
    return { ...t, fusionScore: Math.round(fusionScore * 1000) / 1000 };
  });

  return ranked.sort((a, b) => b.fusionScore - a.fusionScore).slice(0, limit);
}
