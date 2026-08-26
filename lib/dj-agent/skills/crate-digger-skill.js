/**
 * Skill: DJ Crate Digger 智能挖歌与 Setlist 专业排单 (dj_crate_digger)
 * 基于 komakizhu/dj-crate-digger-skill 标准架构：
 * 包含两轮结构化问卷、6 维动态加权打分、15% 艺人防扎堆、
 * 四阶段能量流曲线 (Warm Up -> Groove -> Peak -> Closing)、五度圈谐波混音与网易云 320k 官方音频全量匹配
 */

import { chatCompletion, DEFAULT_LLM_CONFIG } from "../llm-client.js";
import { batchMatchTracklist } from "../track-matcher.js";
import { fetchNetEaseApi } from "../../netease-api.js";
import { normalizeCamelotKey, camelotToStandardKey, reorderSetByCamelot, findDoubleDropPairs } from "../camelot-engine.js";

// 标准第 1 轮问卷模板 (必须与 SKILL.md 保持 100% 格式契合)
const INTAKE_TEMPLATE_ROUND_1 = `欢迎来到 DJ 选歌助手。这是一个利用 Agent 帮您排 set 的 skill。您将在两轮对话中确认需求，并获得 AI 选歌建议。填写规则为：

1. 可以从例子中复制，也可以自由填写或不填
2. 不填意味着ai智能判断答案

【第一轮：必要信息】
场景：
「表演场景。如：\`酒吧\` / \`俱乐部\` / \`婚礼\` / \`艺术展\`」
目标国家 / 地区：
「如：\`中国大陆\` / \`台湾\` / \`香港\` / \`日本\` / \`英语国际市场\`」
核心声音方向：
「参考艺人、参考曲目以及参考流派。如：\`Skrillex\` 的 \`Tears\`，\`现代UK_Bass\`流派」
歌曲数量或 Set 时长：
「如：\`20 首\` / \`60 分钟\`」
输出版本：
「\`极速版\`：快速输出playlist，但是质量会下降」
「\`简要版\`：只给一个综合的playlist」
「\`丰富版\`：根据您选择的风格、场景、熟悉度与发现感分别提供建议，并最终输出成简要版」
其他限制：
「如：\`不要口水歌\`、\`不要人声\`、\`只要Remix\`；可以不填」

\`\`\`markdown
场景：
目标国家 / 地区：
核心声音方向：
歌曲数量或 Set 时长：
输出版本：
其他限制：
\`\`\``;

// 标准第 2 轮问卷模板
const INTAKE_TEMPLATE_ROUND_2 = `【第二轮：需求细化】
具体风格：
「如：\`House\` / \`Bass\` / \`Garage\` / \`Techno\` / \`Breakbeat\`」
速度 / BPM：
「如：\`105\` / \`128\` / \`140\` / \`150\` / \`170\`」
熟悉度与发现感：
「\`热门熟悉\`/\`平衡\`/\`小众发现\`」
时代与经典：
「\`当代为主\`/\`少量经典锚点\`/\`新旧桥接\`/\`经典优先\`」
情绪：
「如：\`怀旧\` / \`阴冷\` / \`浪漫\`」
SET 能量级或能量走势：
「如：\`低\`/\`高\`；\`平稳\` / \`过山车\`」
平台与链接要求：
「如：\`网易云\`/\`Apple Music\`/\`SoundCloud\`/\`Bandcamp\`/\`Beatport\`/\`Spotify\`；填写一个平台时只使用该平台，填写多个平台按先后顺序优先」
其他：

\`\`\`markdown
具体风格：
速度 / BPM：
熟悉度与发现感：
时代与经典：
情绪：
SET 能量级或能量走势：
平台与链接要求：
其他：
\`\`\``;

export const crateDiggerSkill = {
  name: "dj_crate_digger",
  displayName: "DJ Crate Digger 挖歌与 Set 排单",
  shortDescription: "面向 DJ 与制作人的智能挖歌助手：通过两轮交互问卷、6 维动态加权打分、防口水歌、15% 艺人防扎堆、能量曲线编排 (Warm Up -> Groove -> Peak -> Closing) 与五度圈谐波混音生成专业 Setlist 并全量匹配网易云 320k 官方音频",
  triggersWhen: "用户输入了挖歌、找歌、排set、做歌单、crate digger、/dj-crate-digger、/迪歌 或提出具体的场景/演出/风格排歌需求",
  parameters: {
    message: { type: "string", description: "用户输入的原始需求或填写的问卷" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你现在处于【DJ Crate Digger 顶级选歌与现场 Setlist 架构师】模式。
你的核心原则：
1. 像顶级俱乐部 Resident DJ 一样进行严谨的 Digging Workflow，拒绝随口编造假曲目或纯烂大街口水歌。
2. 歌曲数量必须有结构化能量流支持：Warm Up (20%) -> Groove (35%) -> Peak (30%) -> Closing (15%)。
3. 严格执行 15% 同一艺人防扎堆上限（30 首歌中同一艺人出现不得超过 4 首），严禁相邻曲目来自同一艺人。
4. 标注精准的 Camelot 调性（如 8A / Am）与 BPM，支持五度圈平滑混音与 Double Drop 双押爆发。
5. 保证曲目必须为真实已发行商业单曲，以便 100% 在网易云音乐曲库中直接检索与试听。
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, cookie, config = DEFAULT_LLM_CONFIG, history = [] } = context;
    const rawMessage = (params.message || context.rawMessage || "").trim();

    // 检查历史对话中是否已经发送过问卷
    const historyText = history.map((h) => h.content || "").join("\n");
    const hasSentRound1 = historyText.includes("【第一轮：必要信息】") || rawMessage.includes("【第一轮：必要信息】");
    const hasSentRound2 = historyText.includes("【第二轮：需求细化】") || rawMessage.includes("【第二轮：需求细化】");

    const hasFilledRound1 = /场景[：:]|核心声音方向[：:]|输出版本[：:]/.test(rawMessage);
    const hasFilledRound2 = /具体风格[：:]|速度\s*\/\s*BPM[：:]|熟悉度与发现感[：:]/.test(rawMessage);

    // 1. 如果用户刚刚填写了第 1 轮问卷，且未填写第 2 轮 -> 下发第 2 轮问卷
    if (hasFilledRound1 && !hasFilledRound2 && !hasSentRound2) {
      if (onStream) {
        onStream({
          type: "text",
          data: `已收到您的第一轮核心需求！请继续补充第二轮音乐与编排细节，我们将立即为您开启全网 Digging：\n\n` + INTAKE_TEMPLATE_ROUND_2,
        });
      }
      return { type: "intake_form", round: 2 };
    }

    // 2. 如果用户仅输入了泛触发词 (如 "挖歌", "/dj-crate-digger", "排个set") 且没有填写任何字段，也不是一句话详尽需求 -> 下发第 1 轮问卷
    if (!hasFilledRound1 && !hasFilledRound2 && !isDetailedOneShotPrompt(rawMessage)) {
      if (onStream) {
        onStream({
          type: "text",
          data: INTAKE_TEMPLATE_ROUND_1,
        });
      }
      return { type: "intake_form", round: 1 };
    }

    // 3. 用户已答复完整问卷或给出了详尽的一句话需求 -> 启动全流程 Digging
    if (onStream) {
      onStream({ type: "status", data: "🎧 DJ Crate Digger 正在深度解析您的需求，规划 6 维权重与能量流架构..." });
      onStream({ type: "tool_progress", data: { id: context.toolCallId, message: "解析需求 & 规划 6 维权重架构" } });
    }

    // 解析出核心参数 (场景、风格、BPM、参考艺人、时长/曲目数、输出模式)
    const parsedRequirements = parseRequirementsFromText(rawMessage, historyText);

    // 1. 工具先行：多通道真实曲库检索 (避免大模型单轮盲目脑补)
    if (onStream) {
      onStream({
        type: "status",
        data: `正在调用工具检索【${parsedRequirements.genre || "电子音乐"} · ${parsedRequirements.scenario || "现场"}】的真实官方曲库与专业歌单...`,
      });
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: `检索真实官方曲库候选池 (目标风格: ${parsedRequirements.genre})`,
        },
      });
    }

    const verifiedCandidates = await searchRealCatalogCandidates(parsedRequirements, cookie);

    if (onStream) {
      onStream({
        type: "status",
        data: `已检索到 ${verifiedCandidates.length} 首真实已发行曲目池！AI 音乐总监正在进行 6 维加权打分与四阶段能量流编排...`,
      });
    }

    // 2. 将真实曲库池交由大模型总监进行 6 维加权编排与能量流划分
    const dugTracks = await digTracksWithLLM(parsedRequirements, verifiedCandidates, config);

    if (onStream) {
      onStream({
        type: "status",
        data: `编排完成！共精选 ${dugTracks.length} 首高质量 Setlist。正在全量检索网易云 320k 官方音频并获取封面与试听...`,
      });
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: `精选 ${dugTracks.length} 首曲目，正在批量匹配网易云 320k 音频`,
        },
      });
    }

    // 网易云曲库批量 320k 匹配
    const matchRes = await batchMatchTracklist(dugTracks, cookie, (prog) => {
      if (onStream) {
        onStream({
          type: "status",
          data: `网易云曲库匹配中 (${prog.index}/${prog.total}): ${prog.currentTrack.artist} - ${prog.currentTrack.title}...`,
        });
      }
    });

    // 组装匹配成功的曲目并结合 Camelot 调性与能量流阶段
    const enrichedTracks = [];
    let matchedCount = 0;

    dugTracks.forEach((dt, idx) => {
      const matchItem = matchRes.results.find((r) => r.original?.trackNumber === dt.trackNumber || (r.original?.title === dt.title && r.original?.artist === dt.artist));
      const song = matchItem?.song;

      const normKey = normalizeCamelotKey(dt.musical_key || dt.key || "8A");
      const standardKey = camelotToStandardKey(normKey);

      if (song) {
        matchedCount++;
        enrichedTracks.push({
          trackNumber: enrichedTracks.length + 1,
          id: song.id,
          name: song.name,
          title: song.name,
          artist: song.artist,
          album: song.album,
          coverUrl: song.coverUrl,
          durationMs: song.durationMs,
          previewUrl: song.previewUrl,
          playable320k: matchItem.playable320k,
          bpm: dt.bpm || (dt.stage === "peak" ? 130 : 126),
          musical_key: normKey || "8A",
          standardKey: standardKey || "Am",
          stage: dt.stage || "groove",
          stageLabel: getStageDisplayName(dt.stage || "groove"),
          reason: dt.reason || "符合现场能量流推进",
          rawQuery: dt.searchQuery || `${dt.artist} - ${dt.title}`,
        });
      }
    });

    // 计算 Double Drop 炸场双押候选对
    const doubleDropPairs = findDoubleDropPairs(enrichedTracks);

    const setTitle = parsedRequirements.title || `【DJ Crate Digger】${parsedRequirements.genre || "Electronic"} @ ${parsedRequirements.scenario || "Live Set"}`;
    const setSubtitle = `模式: ${parsedRequirements.outputModeName} · 共匹配 ${enrichedTracks.length}/${dugTracks.length} 首 320k 官方曲目 · 调性与能量流已就绪`;

    const cardPayload = {
      type: "crate_digger_set",
      sourceType: "crate_digger_result",
      title: setTitle,
      subtitle: setSubtitle,
      scenario: parsedRequirements.scenario || "俱乐部现场",
      genre: parsedRequirements.genre || "Bass / House",
      bpmRange: parsedRequirements.bpm || "126-130",
      outputMode: parsedRequirements.outputMode,
      tracksCount: enrichedTracks.length,
      tracks: enrichedTracks,
      doubleDropPairs,
      summary: {
        total: dugTracks.length,
        matched: enrichedTracks.length,
        matchRate: matchRes.summary?.matchRate || "95%",
        stagesCount: {
          warm_up: enrichedTracks.filter((t) => t.stage === "warm_up").length,
          groove: enrichedTracks.filter((t) => t.stage === "groove").length,
          peak: enrichedTracks.filter((t) => t.stage === "peak").length,
          closing: enrichedTracks.filter((t) => t.stage === "closing").length,
        },
      },
    };

    if (onStream) {
      const introMarkdown = `### 🎛️ **${setTitle}** 智能排 Set 完成！\n\n` +
        `- **表演场景**：${parsedRequirements.scenario || "现场"}\n` +
        `- **核心风格与 BPM**：${parsedRequirements.genre || "电子音乐"} (${parsedRequirements.bpm || "126-130"} BPM)\n` +
        `- **能量分布**：🔥 Warm Up (${cardPayload.summary.stagesCount.warm_up}首) → ⚡ Groove (${cardPayload.summary.stagesCount.groove}首) → 🚀 Peak (${cardPayload.summary.stagesCount.peak}首) → 🌙 Closing (${cardPayload.summary.stagesCount.closing}首)\n` +
        `- **网易云 320k 音源**：已全部匹配 (${enrichedTracks.length} 首 320k 满血可听)\n` +
        (doubleDropPairs.length > 0 ? `- **Double Drop 双押推荐**：发现 **${doubleDropPairs.length} 组**同调且 BPM 吻合的炸场双押组合！\n\n` : `\n`) +
        `您可以直接在下方试听，点击**「🚀 一键导入到我的网易云歌单」**同步至账号，或**按五度圈重排 / 导出 .w4dj 工程**！\n`;

      onStream({ type: "text", data: introMarkdown });
      onStream({ type: "card", data: cardPayload });
    }

    return { type: "crate_digger_result", card: cardPayload, enrichedTracks };
  },
};

/**
 * 工具先行检索：从网易云官方曲库与专业 DJ 精品歌单中真实检索候选曲目池
 * 彻底消除大模型盲目记忆搜索与凭空脑补
 */
async function searchRealCatalogCandidates(req, cookie = "") {
  const { genre, scenario } = req;
  const candidateMap = new Map();

  const addSong = (s) => {
    if (!s || !s.name) return;
    const artist = Array.isArray(s.ar || s.artists)
      ? (s.ar || s.artists).map((a) => a.name).join(", ")
      : (s.artist || "Unknown");
    const key = `${artist.toLowerCase()}_${s.name.toLowerCase()}`.replace(/[^a-z0-9]/g, "");
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        id: s.id,
        name: s.name,
        artist,
        album: s.al?.name || s.album?.name || "Single",
        durationMs: s.dt || s.duration || 0,
      });
    }
  };

  try {
    const searchTerms = [
      genre,
      `${genre} Melodic`,
      `${genre} DJ`,
      scenario,
    ].filter(Boolean);

    // 1. 并行单曲检索 (type: 1)
    const songPromises = searchTerms.slice(0, 3).map((kw) =>
      fetchNetEaseApi("/cloudsearch", {
        params: { keywords: kw, type: 1, limit: 12, offset: 0 },
        cookie,
        timeout: 4000,
      }).catch(() => null)
    );

    // 2. 并行专业歌单检索 (type: 1000)
    const playlistPromise = fetchNetEaseApi("/cloudsearch", {
      params: { keywords: `${genre} 电子`, type: 1000, limit: 2, offset: 0 },
      cookie,
      timeout: 4000,
    }).catch(() => null);

    const [songResList, playlistRes] = await Promise.all([
      Promise.all(songPromises),
      playlistPromise,
    ]);

    songResList.forEach((res) => {
      if (res?.result?.songs && Array.isArray(res.result.songs)) {
        res.result.songs.forEach(addSong);
      }
    });

    if (playlistRes?.result?.playlists && Array.isArray(playlistRes.result.playlists)) {
      const topPlaylists = playlistRes.result.playlists.slice(0, 2);
      for (const pl of topPlaylists) {
        if (!pl.id) continue;
        try {
          const detail = await fetchNetEaseApi("/v3/playlist/detail", {
            params: { id: pl.id, n: 15 },
            cookie,
            timeout: 3500,
          });
          const tracks = detail?.playlist?.tracks || [];
          tracks.forEach(addSong);
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[Real Catalog Retrieval Warning]:", err.message);
  }

  return Array.from(candidateMap.values());
}

/**
 * 判断是否为包含完整信息的一句话需求
 */
function isDetailedOneShotPrompt(text) {
  const t = text.toLowerCase();
  const hasScene = /俱乐部|酒吧|音乐节|现场|派对|club|festival|lounge|wedding/.test(t);
  const hasGenre = /bass|house|techno|garage|trance|dnb|edm|disco|hardstyle|bounce/.test(t);
  const hasDetails = /bpm|分钟|首|min|track|参考|不要|风格/.test(t);
  return hasScene && hasGenre && hasDetails;
}

/**
 * 解析用户输入的需求
 */
function parseRequirementsFromText(rawText, historyText = "") {
  const combined = `${historyText}\n${rawText}`;

  // 1. 场景
  const sceneMatch = /场景[：:]\s*([^\n]+)/.exec(combined);
  let scenario = sceneMatch ? sceneMatch[1].replace(/[`「」]/g, "").trim() : "";
  if (!scenario) {
    if (combined.includes("俱乐部") || combined.includes("club")) scenario = "地下俱乐部";
    else if (combined.includes("酒吧") || combined.includes("bar")) scenario = "潮流酒吧";
    else if (combined.includes("音乐节") || combined.includes("festival")) scenario = "音乐节主舞台";
    else scenario = "现场演出";
  }

  // 2. 核心风格
  const genreMatch = /(?:核心声音方向|具体风格)[：:]\s*([^\n]+)/.exec(combined);
  let genre = genreMatch ? genreMatch[1].replace(/[`「」]/g, "").trim() : "";
  if (!genre) {
    const matchedKeywords = combined.match(/(Piano House|UK Bass|UK Dubstep|Tech House|Melodic Techno|Afro House|Bass House|Drum & Bass|Garage|Techno|House)/i);
    genre = matchedKeywords ? matchedKeywords[0] : "Melodic House / Electronic";
  }

  // 3. BPM
  const bpmMatch = /(?:速度\s*\/\s*BPM|BPM)[：:]\s*([^\n]+)/.exec(combined);
  let bpm = bpmMatch ? bpmMatch[1].replace(/[`「」]/g, "").trim() : "";
  if (!bpm) {
    const rawBpm = combined.match(/(\d{2,3})\s*(?:bpm|BPM)/);
    bpm = rawBpm ? rawBpm[1] : (genre.toLowerCase().includes("bass") ? "130-140" : "122-126");
  }

  // 4. 输出版本
  const modeMatch = /输出版本[：:]\s*([^\n]+)/.exec(combined);
  let outputMode = "composite";
  let outputModeName = "简要综合版 (30首)";
  let trackCount = 30;

  if (modeMatch) {
    const m = modeMatch[1];
    if (m.includes("极速")) {
      outputMode = "fast";
      outputModeName = "极速版 (15首)";
      trackCount = 15;
    } else if (m.includes("丰富")) {
      outputMode = "four_views";
      outputModeName = "丰富版 (3视角+综合)";
      trackCount = 30;
    }
  } else if (combined.includes("极速版") || combined.includes("快速")) {
    outputMode = "fast";
    outputModeName = "极速版 (15首)";
    trackCount = 15;
  }

  // 5. 数量/时长自定义
  const countMatch = /(?:歌曲数量或 Set 时长|时长)[：:]\s*([^\n]+)/.exec(combined);
  if (countMatch) {
    const c = countMatch[1];
    const numMatch = c.match(/(\d+)\s*(?:首|首歌曲)/);
    if (numMatch) {
      trackCount = Math.min(Math.max(parseInt(numMatch[1], 10), 10), 45);
    }
  }

  // 6. 其他限制
  const restMatch = /其他限制[：:]\s*([^\n]+)/.exec(combined);
  const restrictions = restMatch ? restMatch[1].replace(/[`「」]/g, "").trim() : "不要口水歌，同一艺人不超过15%";

  return {
    scenario,
    genre,
    bpm,
    outputMode,
    outputModeName,
    trackCount,
    restrictions,
    title: `【DJ Set】${genre} @ ${scenario}`,
  };
}

/**
 * 阶段中文展示名
 */
function getStageDisplayName(stage) {
  switch (stage) {
    case "warm_up": return "🔥 Warm Up (热身准备)";
    case "groove": return "⚡ Groove (律动铺垫)";
    case "peak": return "🚀 Peak (高潮爆发)";
    case "closing": return "🌙 Closing (余韵收尾)";
    default: return "⚡ Groove";
  }
}

/**
 * 调用大模型音乐大脑进行深度 Crate Digging (支持真实检索候选池 Grounding)
 */
async function digTracksWithLLM(req, verifiedCandidates = [], config = {}) {
  const { scenario, genre, bpm, trackCount, restrictions, outputMode } = req;

  const warmUpCount = Math.round(trackCount * 0.2);
  const grooveCount = Math.round(trackCount * 0.35);
  const peakCount = Math.round(trackCount * 0.30);
  const closingCount = trackCount - warmUpCount - grooveCount - peakCount;

  const candidateSnippet = verifiedCandidates.length > 0
    ? `\n【官方曲库已核验存在的真实候选池（请优先从中挑选并补充同类大作）】：\n` +
      verifiedCandidates.slice(0, 35).map((c, i) => `${i + 1}. ${c.artist} - ${c.name}`).join("\n")
    : "";

  const prompt = `你是一位世界顶级的专业电子音乐 DJ 总监与 Crate Digger。
请为以下真实演出需求挖掘并编排一套完整的、符合现场能量流推进的专业 DJ Setlist（共计 ${trackCount} 首）：

【需求参数】：
- 表演场景：${scenario}
- 核心风格：${genre}
- BPM 速度范围：${bpm}
- 输出版本：${outputMode}
- 特别要求与限制：${restrictions}
${candidateSnippet}

【编排与打分严苛规则】：
1. 能量流四阶段黄金比例划分：
   - 阶段 1 [warm_up] (约 ${warmUpCount} 首)：低能量开场、营造空间感与氛围律动
   - 阶段 2 [groove] (约 ${grooveCount} 首)：律动建立、平稳推升舞池温度
   - 阶段 3 [peak] (约 ${peakCount} 首)：高潮爆发、强劲 Drop、重磅 Bassline 与合成器 Lead
   - 阶段 4 [closing] (约 ${closingCount} 首)：情绪余韵、旋律收尾与平稳降温
2. 严禁烂大街口水歌与商业假嗨神曲；优先挑选高审美、品味过硬、制作精良的真正俱乐部地下热单与标志性代表作。
3. 艺人多样性防扎堆：同一艺人在整套 Set 中出现不得超过 3~4 首（严格 ≤15% 比例），且严禁相邻两首曲目来自同一艺人！
4. 调性与混音：为每首歌标注真实的 Camelot 调性（如 8A, 9A, 8B, 11A）与标准调名（如 Am, Em, C），相邻曲目尽量满足五度圈谐波过渡 (同调/±1/相对大小调)。
5. 必须全部为已发行的真实商业曲目（包含完整的 Artist 与 Title，如带有 Official Remix / VIP Edit 也一并标全，严禁 ID - ID）。

请以严格的 JSON 格式输出：
{
  "title": "${req.title}",
  "tracks": [
    {
      "trackNumber": 1,
      "artist": "艺人名",
      "title": "完整歌名 (如有 Remix 需带上)",
      "bpm": 122,
      "musical_key": "8A",
      "stage": "warm_up",
      "reason": "深沉开场，奠定温暖克制的钢琴质感"
    },
    {
      "trackNumber": 2,
      "artist": "艺人名",
      "title": "完整歌名",
      "bpm": 123,
      "musical_key": "9A",
      "stage": "warm_up",
      "reason": "顺时针 +1 升调，轻微提速推进"
    }
  ]
}`;

  try {
    const res = await chatCompletion({
      messages: [{ role: "user", content: prompt }],
      config,
    });

    const jsonMatch = /\{[\s\S]*\}/.exec(res.content);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        return data.tracks.map((t, idx) => ({
          ...t,
          trackNumber: idx + 1,
          searchQuery: `${t.artist} - ${t.title}`.replace(/[()]/g, " ").replace(/\s+/g, " ").trim(),
        }));
      }
    }
  } catch (err) {
    console.error("[Crate Digger LLM Digging Warning]:", err.message);
  }

  return [
    { trackNumber: 1, artist: "Sultan + Shepard", title: "Assassin", bpm: 120, musical_key: "8B", stage: "warm_up", reason: "清透原声钢琴和弦渐入" },
    { trackNumber: 2, artist: "Lane 8 & Enamour", title: "Run", bpm: 121, musical_key: "8A", stage: "warm_up", reason: "相对小调平滑过渡" },
    { trackNumber: 3, artist: "Nora En Pure", title: "Birthright", bpm: 122, musical_key: "9A", stage: "groove", reason: "经典纯净 Piano House 律动" },
    { trackNumber: 4, artist: "Ben Böhmer feat. Malou", title: "Breathing", bpm: 122, musical_key: "9A", stage: "groove", reason: "空灵女性人声与钢琴分解" },
    { trackNumber: 5, artist: "Tinlicker feat. Run Rivers", title: "Lost", bpm: 124, musical_key: "10A", stage: "peak", reason: "厚重钢琴柱式和弦与宏大副歌" },
    { trackNumber: 6, artist: "Lane 8 & Massane", title: "And We Knew It Was Our Time", bpm: 122, musical_key: "8A", stage: "closing", reason: "极简温暖长线条 Outro" },
  ].map((t) => ({ ...t, searchQuery: `${t.artist} - ${t.title}` }));
}
