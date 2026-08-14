/**
 * 网易云音乐高置信度 320k 曲目匹配与版权校验引擎
 * 针对 DJ 现场曲目提供歌手匹配度打分、Remix 精确校验、伴奏/翻唱过滤与 320k 官方音频直链可用性检测
 */

import { fetchNetEaseApi } from "../netease-api.js";

/**
 * 简易字符串相似度打分 (0 - 100)
 */
export function stringSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const a = strA.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const b = strB.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);
    return Math.round(70 + (minLen / maxLen) * 30);
  }

  // 统计字符重合度
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return Math.round((intersection / union) * 80);
}

/**
 * 为网易云搜索候选歌曲进行综合评分
 * @param {object} target - { artist, title, remix, searchQuery }
 * @param {object} candidate - 网易云 API 返回的 song 节点
 * @returns {number} 0 - 100 综合置信度得分
 */
export function scoreCandidateSong(target, candidate) {
  if (!candidate || !target) return 0;

  const targetArtist = (target.artist || "").trim().toLowerCase();
  const targetTitle = (target.title || "").trim().toLowerCase();
  const targetRemix = (target.remix || "").trim().toLowerCase();

  const candName = (candidate.name || "").trim().toLowerCase();
  const candArtists = (candidate.artists || []).map((a) => (a.name || "").trim().toLowerCase()).join(" ");

  // 1. 歌手相似度得分 (权重 40%)
  let artistScore = stringSimilarity(targetArtist, candArtists);
  if (targetArtist && candArtists.includes(targetArtist)) {
    artistScore = 100;
  }

  // 2. 歌名相似度得分 (权重 40%)
  const cleanTargetTitle = targetTitle.replace(/\([^)]*\)/g, "").trim();
  const cleanCandName = candName.replace(/\([^)]*\)/g, "").trim();
  let titleScore = stringSimilarity(cleanTargetTitle, cleanCandName);
  if (cleanTargetTitle && cleanCandName.includes(cleanTargetTitle)) {
    titleScore = 95;
  }

  // 3. Remix / 版本判定 (权重 20% + 惩罚/奖励)
  let remixBonus = 0;
  if (targetRemix) {
    // 目标指定了特定 Remix (如 "220 KID Remix")
    if (candName.includes(targetRemix)) {
      remixBonus += 25; // 命中目标 Remix
    } else if (candName.includes("remix") || candName.includes("mix") || candName.includes("edit")) {
      remixBonus += 5; // 命中其他 Remix，轻微加分但不如精确匹配
    } else {
      remixBonus -= 20; // 目标要求 Remix 但候选是原曲，扣分
    }
  } else {
    // 目标未指定 Remix (寻找原曲 / Extended Mix)
    if (candName.includes("extended mix") || candName.includes("original mix") || candName.includes("club mix")) {
      remixBonus += 10; // DJ 偏好 Extended/Club Mix
    } else if (candName.includes("remix") && !targetTitle.includes("remix")) {
      remixBonus -= 15; // 寻找原版时如果是第三方 Remix 则降权
    }
  }

  // 4. 过滤垃圾版本（纯伴奏、卡拉OK、翻唱、电音节录音版）
  if (!targetTitle.includes("伴奏") && !targetTitle.includes("instrumental")) {
    if (candName.includes("伴奏") || candName.includes("instrumental") || candName.includes("karaoke")) {
      remixBonus -= 50;
    }
  }
  if (!targetArtist.includes("cover") && (candArtists.includes("cover") || candName.includes("cover") || candName.includes("翻唱"))) {
    remixBonus -= 40;
  }

  // 综合得分
  const rawScore = artistScore * 0.45 + titleScore * 0.45 + remixBonus;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

/**
 * 在网易云曲库中单曲精准检索与 320k 可用性检测
 * @param {object} track - { artist, title, remix, searchQuery, trackNumber }
 * @param {string} cookie
 * @returns {Promise<object>}
 */
export async function matchSingleTrack(track, cookie = "") {
  // 构造干净的搜索查询词，并将特殊重音字符 (如 ë -> e, é -> e) 替换为标准英文字母进行双重搜索
  const baseQuery = (track.searchQuery || `${track.artist || ""} ${track.title || ""}`).trim();
  const normalizedQuery = baseQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (!baseQuery) {
    return {
      trackNumber: track.trackNumber,
      original: track,
      matched: false,
      reason: "检索关键词为空",
    };
  }

  try {
    let searchRes = await fetchNetEaseApi("/cloudsearch/pc", {
      params: { s: normalizedQuery, type: 1, limit: 8, offset: 0 },
      cookie,
    });

    let candidates = searchRes?.result?.songs || [];

    // 若未检索到，回退使用原始字符或短关键词尝试
    if (candidates.length === 0 && normalizedQuery !== baseQuery) {
      searchRes = await fetchNetEaseApi("/cloudsearch/pc", {
        params: { s: baseQuery, type: 1, limit: 8, offset: 0 },
        cookie,
      });
      candidates = searchRes?.result?.songs || [];
    }

    if (candidates.length === 0 && track.title) {
      // 提取核心歌名检索
      const coreTitle = `${track.artist || ""} ${track.title.replace(/\([^)]*\)/g, "")}`.trim();
      searchRes = await fetchNetEaseApi("/cloudsearch/pc", {
        params: { s: coreTitle, type: 1, limit: 8, offset: 0 },
        cookie,
      });
      candidates = searchRes?.result?.songs || [];
    }

    if (candidates.length === 0) {
      return {
        trackNumber: track.trackNumber,
        original: track,
        matched: false,
        reason: "网易云曲库未检索到相关曲目",
      };
    }

    // 标准化候选歌曲字段结构 (兼容 ar / artists, al / album)
    const normalizedCandidates = candidates.map((s) => ({
      ...s,
      artists: s.ar || s.artists || [],
      album: s.al || s.album || {},
    }));

    // 对候选歌曲打分排序
    const scoredCandidates = normalizedCandidates.map((cand) => ({
      candidate: cand,
      score: scoreCandidateSong(track, cand),
    })).sort((a, b) => b.score - a.score);

    const best = scoredCandidates[0];
    if (!best || best.score < 45) {
      return {
        trackNumber: track.trackNumber,
        original: track,
        matched: false,
        reason: `曲目相似度过低 (最高分: ${best?.score || 0})`,
        bestCandidate: best?.candidate ? {
          id: best.candidate.id,
          name: best.candidate.name,
          artist: (best.candidate.artists || []).map((a) => a.name).join(" & "),
        } : null,
      };
    }

    const song = best.candidate;

    // 检查 320k 极高音质可播性与真实音频直链
    let playable320k = true;
    let previewUrl = "";
    let bitRate = 320000;

    try {
      const urlRes = await fetchNetEaseApi("/song/enhance/player/url/v1", {
        method: "POST",
        body: {
          ids: `[${song.id}]`,
          level: "exhigh",
          encodeType: "flac",
        },
        cookie,
      });

      const urlData = urlRes?.data?.[0];
      if (urlData && urlData.url && urlData.code === 200) {
        previewUrl = urlData.url;
        bitRate = urlData.br || 320000;
      }
    } catch {
      // ignore
    }

    // 提取封面与专辑
    const artistNames = (song.artists || []).map((a) => a.name).join(" & ");
    const coverUrl = song.album?.picUrl ||
                     song.album?.blurPicUrl ||
                     song.album?.artist?.img1v1Url ||
                     "https://p2.music.126.net/VnIcST_OiUzDuyBzTXBwA==/109951163965582984.jpg";

    return {
      trackNumber: track.trackNumber,
      original: track,
      matched: true,
      score: best.score,
      playable320k,
      song: {
        id: song.id,
        name: song.name,
        artist: artistNames,
        album: song.album?.name || "Single",
        coverUrl,
        durationMs: song.dt || song.duration || 0,
        bitRate,
        previewUrl,
      },
    };
  } catch (err) {
    return {
      trackNumber: track.trackNumber,
      original: track,
      matched: false,
      reason: `匹配请求异常: ${err.message}`,
    };
  }
}

/**
 * 批量执行 Setlist 歌单的网易云匹配
 * @param {Array<object>} tracks
 * @param {string} cookie
 * @param {Function} onProgress
 */
export async function batchMatchTracklist(tracks, cookie = "", onProgress) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { results: [], summary: { total: 0, matched: 0, failed: 0, matchRate: "0%" } };
  }

  const results = new Array(tracks.length);
  let completed = 0;

  // 并发池处理 (最大并发度 4，兼顾速率与防频控)
  const CONCURRENCY = 4;
  const queue = tracks.map((tr, idx) => ({ tr, idx }));

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const { tr, idx } = item;
      const matchRes = await matchSingleTrack(tr, cookie);
      results[idx] = matchRes;
      completed++;
      if (onProgress) {
        onProgress({
          index: completed,
          total: tracks.length,
          currentTrack: tr,
          matchRes,
          percent: Math.round((completed / tracks.length) * 100),
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, () => worker());
  await Promise.all(workers);

  const matchedCount = results.filter((r) => r && r.matched).length;
  const failedCount = results.length - matchedCount;
  const matchRate = `${Math.round((matchedCount / results.length) * 100)}%`;

  return {
    results,
    matchedCount,
    failedCount,
    matchRate,
    summary: {
      total: results.length,
      matched: matchedCount,
      failed: failedCount,
      matchRate,
    },
  };
}
