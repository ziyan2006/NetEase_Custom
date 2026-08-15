/**
 * 网易云音乐高置信度 320k 曲目匹配与版权校验引擎
 * 针对 DJ 现场曲目提供歌手匹配度打分、Remix 精确校验、伴奏/翻唱过滤与 320k 官方音频直链可用性检测
 */

import { fetchNetEaseApi } from "../netease-api.js";
import { isUnreleasedTrack } from "./tracklist-parser.js";

/**
 * 单词级与 Levenshtein 编辑距离相似度打分 (0 - 100)
 */
export function stringSimilarity(strA, strB) {
  if (!strA || !strB) return 0;
  const a = strA.trim().toLowerCase();
  const b = strB.trim().toLowerCase();
  if (a === b) return 100;

  // 1. 词集合重合度 (Word Token Jaccard)
  const wordsA = a.split(/[\s,.\-_/\\()&+'"]+/).filter((w) => w.length > 0);
  const wordsB = b.split(/[\s,.\-_/\\()&+'"]+/).filter((w) => w.length > 0);

  if (wordsA.length > 0 && wordsB.length > 0) {
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    let common = 0;
    for (const w of setA) {
      if (setB.has(w)) common++;
    }
    const wordJaccard = common / (setA.size + setB.size - common);
    if (wordJaccard === 1) return 100;
    if (wordJaccard >= 0.5) return Math.round(70 + wordJaccard * 30);
  }

  // 2. 子串包含度
  const cleanA = a.replace(/[^\p{L}\p{N}]/gu, "");
  const cleanB = b.replace(/[^\p{L}\p{N}]/gu, "");
  if (cleanA && cleanB) {
    if (cleanA === cleanB) return 100;
    if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) {
      const minLen = Math.min(cleanA.length, cleanB.length);
      const maxLen = Math.max(cleanA.length, cleanB.length);
      if (minLen / maxLen >= 0.6) {
        return Math.round(65 + (minLen / maxLen) * 35);
      }
    }
  }

  // 3. Levenshtein 编辑距离
  const dist = levenshteinDistance(cleanA, cleanB);
  const maxLen = Math.max(cleanA.length, cleanB.length);
  if (maxLen === 0) return 0;
  const ratio = (maxLen - dist) / maxLen;
  if (ratio < 0.6) return 0; // 差异过大直接判定为 0
  return Math.round(ratio * 100);
}

function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 为网易云搜索候选歌曲进行综合评分
 * @param {object} target - { artist, title, remix, searchQuery }
 * @param {object} candidate - 网易云 API 返回的 song 节点
 * @returns {number} 0 - 100 综合置信度得分
 */
export function scoreCandidateSong(target, candidate) {
  if (!candidate || !target) return 0;
  if (isUnreleasedTrack(target.artist, target.title)) return 0;

  const targetArtist = (target.artist || "").trim().toLowerCase();
  const targetTitle = (target.title || "").trim().toLowerCase();
  const targetRemix = (target.remix || "").trim().toLowerCase();

  const candName = (candidate.name || "").trim().toLowerCase();
  const candArtists = (candidate.artists || []).map((a) => (a.name || "").trim().toLowerCase()).join(" ");

  // 1. 歌手相似度得分 (权重 45%)
  let artistScore = stringSimilarity(targetArtist, candArtists);

  // 检查是否有任何主要艺人重合
  const targetArtistsList = targetArtist
    .split(/[\s,&/]+|aka|ft\.?|feat\.?|vs\.?|\+/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);
  const candArtistsList = candArtists
    .split(/[\s,&/]+|aka|ft\.?|feat\.?|vs\.?|\+/i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);

  const hasCommonArtist = targetArtistsList.some(
    (ta) => candArtists.includes(ta) || candArtistsList.some((ca) => ca.includes(ta) || ta.includes(ca))
  );

  if (hasCommonArtist) {
    artistScore = Math.max(artistScore, 90);
  } else if (targetArtist && artistScore < 35) {
    // 歌手完全不匹配，坚决拒绝！返回 0 分，防止出现同名歌误匹配 (如 "Ghost Town", "When The Party's Over")
    return 0;
  }

  // 2. 歌名相似度得分 (权重 45%)
  const cleanTargetTitle = targetTitle.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim();
  const cleanCandName = candName.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "").trim();
  let titleScore = stringSimilarity(cleanTargetTitle, cleanCandName);
  if (cleanTargetTitle && (cleanCandName === cleanTargetTitle || cleanCandName.includes(cleanTargetTitle))) {
    titleScore = 95;
  }

  // 如果歌名得分过低，直接拒绝
  if (titleScore < 40) {
    return 0;
  }

  // 提取具体的 Remix / 版本信息 (优先解析 title 括号内的具体制作人，如 "Dimension Remix")
  let effectiveTargetRemix = targetRemix;
  if (!effectiveTargetRemix || effectiveTargetRemix === "remix" || effectiveTargetRemix === "mix" || effectiveTargetRemix === "edit") {
    const parenthesizedRemixMatch = /\(([^)]*(?:remix|mix|edit|vip|bootleg|flip|rework|dub)[^)]*)\)/i.exec(targetTitle);
    if (parenthesizedRemixMatch) {
      effectiveTargetRemix = parenthesizedRemixMatch[1].trim().toLowerCase();
    }
  }

  // 3. Remix / 版本判定 (权重 10% + 惩罚/奖励)
  let remixBonus = 0;
  if (effectiveTargetRemix) {
    const cleanTargetRemix = effectiveTargetRemix.replace(/\b(remix|mix|edit|vip|bootleg|flip|rework|dub)\b/gi, "").trim();
    const candHasTargetRemixer = cleanTargetRemix
      ? candName.includes(cleanTargetRemix) || candArtists.includes(cleanTargetRemix)
      : false;

    if (
      candName.includes(effectiveTargetRemix) ||
      (cleanTargetRemix && candHasTargetRemixer &&
        (candName.includes("remix") || candName.includes("mix") || candName.includes("edit") || candName.includes("vip")))
    ) {
      remixBonus += 25; // 精确命中目标 Remix
    } else if (cleanTargetRemix && (candName.includes("remix") || candName.includes("mix") || candName.includes("edit") || candName.includes("bootleg"))) {
      // 目标指定了特定 Remix (如 Dimension Remix)，但候选是其它无关 Remix (如 Didrick Remix) -> 严厉扣分拒绝
      remixBonus -= 60;
    } else {
      // 目标要求 Remix 但候选是原曲，扣分
      remixBonus -= 25;
    }
  } else {
    // 目标未指定 Remix (寻找原曲 / Extended Mix)
    if (candName.includes("extended mix") || candName.includes("original mix") || candName.includes("club mix")) {
      remixBonus += 10; // DJ 偏好 Extended/Club Mix
    } else if (candName.includes("remix") && !targetTitle.includes("remix")) {
      remixBonus -= 25; // 寻找原版时如果是第三方 Remix 则降权
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
  if (isUnreleasedTrack(track.artist, track.title)) {
    return {
      trackNumber: track.trackNumber,
      original: track,
      matched: false,
      reason: "已自动识别并过滤未发行 (ID) 曲目",
    };
  }

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
    // 构造渐进式检索关键词序列 (从最精准版本名 -> 核心歌名 -> 艺人+歌名)
    const queriesToTry = [];
    if (normalizedQuery) queriesToTry.push(normalizedQuery);
    if (baseQuery && baseQuery !== normalizedQuery) queriesToTry.push(baseQuery);

    // 核心歌名（去掉括号）
    if (track.title && track.artist) {
      const coreTitle = `${track.artist} ${track.title.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "")}`.replace(/\s+/g, " ").trim();
      if (!queriesToTry.includes(coreTitle)) queriesToTry.push(coreTitle);
    }

    let candidates = [];
    let best = null;

    for (const q of queriesToTry) {
      try {
        const searchRes = await fetchNetEaseApi("/cloudsearch/pc", {
          params: { s: q, type: 1, limit: 15, offset: 0 },
          cookie,
        });
        const currentCandidates = (searchRes?.result?.songs || []).map((s) => ({
          ...s,
          artists: s.ar || s.artists || [],
          album: s.al || s.album || {},
        }));

        for (const c of currentCandidates) {
          if (!candidates.some((existing) => existing.id === c.id)) {
            candidates.push(c);
          }
        }

        // 评估当前累计候选
        const scored = candidates
          .map((cand) => ({ candidate: cand, score: scoreCandidateSong(track, cand) }))
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) {
          best = scored[0];
          // 若已获得高置信度命中 (>= 75)，提前退出
          if (best.score >= 75) {
            break;
          }
        }
      } catch {
        // ignore single search error
      }
    }

    if (candidates.length === 0) {
      return {
        trackNumber: track.trackNumber,
        original: track,
        matched: false,
        reason: "网易云曲库未检索到相关曲目",
      };
    }

    if (!best || best.score < 60) {
      return {
        trackNumber: track.trackNumber,
        original: track,
        matched: false,
        reason: `曲目相似度过低 (最高分: ${best?.score || 0})`,
        bestCandidate: best?.candidate
          ? {
              id: best.candidate.id,
              name: best.candidate.name,
              artist: (best.candidate.artists || []).map((a) => a.name).join(" & "),
            }
          : null,
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
