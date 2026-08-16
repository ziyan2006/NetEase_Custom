/**
 * Skill: 电子音乐流派热单与榜单雷达 (genre_trend_radar) — 真实数据版
 *
 * 工作流 (重构后):
 *   1. radar-pipeline 并行抓取多平台真实榜单 (Deezer/Spotify/Last.fm/Beatport)
 *   2. 归一化 + 跨源融合排序 → 真实热单 Top 12
 *   3. LLM 低温策展 (temperature 0.4): 只基于真实榜单数据做专业点评与精选
 *   4. 卡片数据 = 真实榜单曲目 (非 LLM 生成), 标注来源与抓取时间
 *   5. 全链路失败 → 旧版 LLM 生成兜底 (明确标注 "AI 生成")
 */

import { getRadarTracks } from "../radar/radar-pipeline.js";
import { batchMatchTracklist } from "../track-matcher.js";
import { streamChatCompletion } from "../llm-client.js";
import { getTrendingTracksByGenre } from "../trend-radar.js";

export const radarSkill = {
  name: "genre_trend_radar",
  displayName: "电子音乐流派热单与榜单雷达",
  shortDescription: "查询 Deezer/Spotify/Beatport 等多平台当下最新的电子音乐流派热单榜单 (真实数据)",
  triggersWhen: "用户要求推荐某种特定风格流派（如 Melodic Techno, Tech House, Afro House, Drum & Bass, Trance 等）的最新热单",
  parameters: {
    genre: { type: "string", description: "电子音乐流派名称 (如 Melodic Techno, Tech House, Drum & Bass 等)" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你是一位世界顶级的电子音乐 DJ 与音乐总监 (YesMusic DJ Copilot 雷达总监)。
你精通各大电子音乐流派、声效演进、厂牌生态与舞池现场反馈。

【核心原则 - 数据真实性】:
1. 系统会为你注入【真实榜单数据】(来自 Deezer/Spotify/Beatport/Last.fm 的实时抓取)。
2. 你只能基于这些真实数据曲目进行点评、精选与推荐。
3. 严禁编造榜单中不存在的曲目；若确需补充知识性曲目, 必须显式标注 [AI 备注]。
4. 点评要有信息量: 声效演进 (Bassline 质感/合成器 Lead/Drop 结构)、厂牌归属、BPM 与调性 (若提供) 的编排价值。

【输出规范】:
- 精选 4~6 首并给出专业理由, 语言精炼自信, 使用 DJ 行业术语。
- 正文中不要输出 JSON 代码块 (系统会自动使用真实榜单数据生成试听卡片)。
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, history, config, cookie, signal } = context;
    const genreInput = (params.genre || "").trim() || context.rawMessage.replace(/^(帮我|推荐|查|看看|来点|找|最新|本周|热门|热单|雷达)\s*/g, "").trim();

    if (onStream) {
      onStream({ type: "status", data: `正在并行抓取多平台真实榜单数据 (Deezer/Spotify/Beatport)...` });
      onStream({ type: "tool_progress", data: { id: context.toolCallId, message: `抓取 ${genreInput || "电子音乐"} 多平台真实热榜` } });
    }

    // ---------- 1. 真实数据管道 ----------
    let radar = null;
    try {
      radar = await getRadarTracks(genreInput || "mainstage_edm");
    } catch (err) {
      console.warn("[Radar Pipeline Warning]:", err.message);
    }

    const realTracks = radar?.tracks?.filter((t) => t.artist && t.title) || [];

    // ---------- 兜底: 真实管道失败 → 旧版 LLM 生成 (明确标注) ----------
    if (realTracks.length < 5) {
      if (onStream) {
        onStream({ type: "status", data: "实时榜单源暂不可用，切换到 AI 专家生成模式（数据为 AI 生成，仅供参考）..." });
      }
      return runLegacyFallback(genreInput, context);
    }

    const sourceText = radar.sourceLabels.join(" / ");
    const fetchedTime = new Date(radar.fetchedAt).toLocaleString("zh-CN", { hour12: false });

    if (onStream) {
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: `已从 ${sourceText} 获取 ${realTracks.length} 首真实热单 (融合排序)`,
        },
      });
    }

    // ---------- 2. 真实数据上下文 (Grounding) ----------
    const groundedData = realTracks
      .slice(0, 12)
      .map((t, idx) => {
        const bpm = t.bpm ? ` ${t.bpm}BPM` : "";
        const key = t.camelot ? ` ${t.camelot}` : t.key ? ` ${t.key}` : "";
        const label = t.label ? ` [${t.label}]` : "";
        const src = `(${t.sources.join("+")})`;
        return `${idx + 1}. ${t.artist} - ${t.title}${t.version ? ` (${t.version})` : ""}${bpm}${key}${label} ${src}`;
      })
      .join("\n");

    const messages = [
      {
        role: "system",
        content: `${this.detailedPrompt}\n\n【真实榜单数据】\n流派: ${radar.genreName}\n来源: ${sourceText}\n抓取时间: ${fetchedTime}\n${groundedData}`,
      },
      ...history,
      { role: "user", content: context.rawMessage },
    ];

    // ---------- 3. LLM 低温策展点评 (流式) ----------
    let fullText = "";
    let fullReasoning = "";

    try {
      await streamChatCompletion({
        messages,
        config: { ...config, temperature: 0.4 }, // 低温: 忠于真实数据
        signal,
        onReasoning: (chunk) => {
          fullReasoning += chunk;
          if (onStream) onStream({ type: "reasoning", data: chunk });
        },
        onContent: (chunk) => {
          fullText += chunk;
          if (onStream) onStream({ type: "text", data: chunk });
        },
        onComplete: (res) => {
          fullText = res.content;
        },
      });
    } catch (err) {
      fullText = fullText || `⚠️ AI 点评生成失败: ${err.message}`;
    }

    // ---------- 4. 真实榜单曲目匹配网易云 320k 并下发卡片 ----------
    const matchTargets = realTracks.slice(0, 12).map((t, idx) => ({
      trackNumber: idx + 1,
      artist: t.artist,
      title: t.title,
      remix: t.version || "",
      searchQuery: `${t.artist} ${t.title} ${t.version || ""}`.trim(),
      source: t.source || "",
      bpm: t.bpm || null,
      camelot: t.camelot || null,
      label: t.label || null,
    }));

    const matchRes = await batchMatchTracklist(matchTargets, cookie);

    const matchedSongs = matchRes.results
      .filter((r) => r.matched && r.song)
      .map((r) => ({
        trackNumber: r.trackNumber,
        id: r.song.id,
        name: r.song.name,
        artist: r.song.artist,
        album: r.song.album,
        coverUrl: r.song.coverUrl,
        durationMs: r.song.durationMs,
        previewUrl: r.song.previewUrl,
        playable320k: r.song.playable320k !== false,
        source: r.original?.source || "",
        bpm: r.original?.bpm || null,
        camelot: r.original?.camelot || null,
      }));

    const cardPayload = {
      title: `🔥 ${radar.genreName} 热单雷达`,
      subtitle: `数据来源: ${sourceText} · 抓取于 ${fetchedTime} · 网易云 320k 匹配 ${matchedSongs.length}/${matchTargets.length} 首`,
      sourceType: "trending_radar",
      tracks: matchedSongs,
      dataInfo: {
        sources: radar.sourceLabels,
        fetchedAt: radar.fetchedAt,
        cached: radar.cached,
        degraded: radar.degraded,
        totalReal: realTracks.length,
      },
    };

    if (onStream && matchedSongs.length > 0) {
      onStream({ type: "card", data: cardPayload });
    }

    return {
      type: "genre_radar",
      content: fullText,
      reasoning: fullReasoning,
      radar,
      card: cardPayload,
    };
  },
};

/**
 * 兜底: 旧版 LLM 生成模式 (实时数据源全部不可用时)
 */
async function runLegacyFallback(genreInput, context) {
  const { onStream, history, config, cookie, signal } = context;
  const genreData = getTrendingTracksByGenre(genreInput);

  let profileContext = "";
  if (genreData && genreData.profile) {
    profileContext = `
【流派行业档案与代表厂牌参考】:
- 流派: ${genreData.profile.name}
- 典型 BPM: ${genreData.profile.typicalBpm}
- 代表厂牌: ${genreData.profile.labels.join(", ")}
- 声音特征: ${genreData.profile.characteristics}
`.trim();
  }

  const messages = [
    {
      role: "system",
      content: `
你是一位世界顶级的专业电子音乐 DJ 与音乐总监 AI 助手 (YesMusic DJ Copilot)。
【重要提示】: 当前实时榜单源不可用, 你处于 AI 生成模式。你可以基于行业知识推荐热单,
但必须在回复开头明确标注: "⚠️ 实时榜单源暂不可用，以下为 AI 生成的推荐，仅供参考"。
${profileContext}
输出规范:
1. 深入点评该流派近期的声效演进。
2. 列出 4~6 首代表性爆款单曲。
`.trim(),
    },
    ...history,
    { role: "user", content: context.rawMessage },
  ];

  let fullText = "";
  let fullReasoning = "";

  await streamChatCompletion({
    messages,
    config,
    signal,
    onReasoning: (chunk) => {
      fullReasoning += chunk;
      if (onStream) onStream({ type: "reasoning", data: chunk });
    },
    onContent: (chunk) => {
      fullText += chunk;
      if (onStream) onStream({ type: "text", data: chunk });
    },
  });

  return { type: "genre_radar_fallback", content: fullText, reasoning: fullReasoning, degraded: true };
}
