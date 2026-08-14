/**
 * Skill: 电子音乐流派热单与榜单雷达 (genre_trend_radar)
 */

import { getTrendingTracksByGenre, GENRE_PROFILES } from "../trend-radar.js";
import { batchMatchTracklist } from "../track-matcher.js";
import { streamChatCompletion } from "../llm-client.js";

export const radarSkill = {
  name: "genre_trend_radar",
  displayName: "电子音乐流派热单与榜单雷达",
  shortDescription: "查询 Beatport 及各大顶级厂牌当下最新的电子音乐流派热单榜单与播放数据",
  triggersWhen: "用户要求推荐某种特定风格流派（如 Melodic Techno, Tech House, Afro House, Drum & Bass, Trance 等）的最新热单",
  parameters: {
    genre: { type: "string", description: "电子音乐流派名称 (如 Melodic Techno, Tech House, Drum & Bass 等)" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你现在处于【Beatport / 顶级电子音乐厂牌热单雷达总监】模式。
你精通各大电子音乐板块当下最炙手可热的爆款单曲、制作手法与现场反馈。

【严禁】：严禁输出任何“作为 AI 无法实时联网”的废话模板！直接以绝对自信的专业总监口吻输出行业头部热单。
【输出规范】：
1. 深入点评该流派近期的声效演进（例如 Bassline 质感、合成器 Lead 编排、Drop 结构）。
2. 列出 4~6 首代表性爆款单曲，并在文末严格附带标准 JSON 歌曲清单代码块：
\`\`\`json
[
  { "title": "曲目名", "artist": "艺人名", "version": "Extended Mix", "label": "厂牌名", "bpm": 126, "camelot": "8A" }
]
\`\`\`
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, history, config, cookie, signal } = context;
    const genreInput = (params.genre || "").trim();

    // 检索内置专家曲库
    const radarData = getTrendingTracksByGenre(genreInput);

    let profileContext = "";
    if (radarData && radarData.profile) {
      profileContext = `
【流派行业档案与代表厂牌参考】:
- 流派: ${radarData.profile.name}
- 典型 BPM: ${radarData.profile.typicalBpm}
- 代表厂牌: ${radarData.profile.labels.join(", ")}
- 声音特征: ${radarData.profile.characteristics}
- 精选代表热单参考:
${radarData.tracks.slice(0, 5).map((t, idx) => `  ${idx + 1}. ${t.artist} - ${t.title} (${t.remix || "Original"}) [${t.label || ""}]`).join("\n")}
`.trim();
    }

    const messages = [
      { role: "system", content: `${this.detailedPrompt}\n\n${profileContext}` },
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
      onComplete: async (res) => {
        fullText = res.content;
      },
    });

    // 匹配网易云 320k 官方音频并下发卡片 (带 8s 超时保护)
    try {
      await Promise.race([
        tryExtractAndEmitCard(fullText, cookie, onStream, `🔥 ${radarData?.profile?.name || genreInput || "电子音乐"} 热单雷达精选`),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    } catch {
      // ignore card extraction error
    }

    return { type: "genre_radar", content: fullText, reasoning: fullReasoning };
  },
};

/**
 * 辅助函数：从文本中提取 JSON 歌曲数组并生成 320k 试听卡片
 */
async function tryExtractAndEmitCard(text, cookie, onStream, title) {
  const jsonMatch = /```json\s*([\s\S]*?)\s*```/.exec(text);
  if (!jsonMatch) return;

  try {
    const list = JSON.parse(jsonMatch[1]);
    if (!Array.isArray(list) || list.length === 0) return;

    const tracksToMatch = list.map((item, idx) => ({
      trackNumber: idx + 1,
      artist: item.artist || "",
      title: item.title || "",
      remix: item.version || "",
      searchQuery: `${item.artist || ""} ${item.title || ""} ${item.version || ""}`.trim(),
    }));

    const matchRes = await batchMatchTracklist(tracksToMatch, cookie);
    const matchedSongs = matchRes.results
      .filter((r) => r.matched && r.song)
      .map((r, idx) => ({
        trackNumber: idx + 1,
        id: r.song.id,
        name: r.song.name,
        artist: r.song.artist,
        album: r.song.album,
        coverUrl: r.song.coverUrl,
        durationMs: r.song.durationMs,
        previewUrl: r.song.previewUrl,
        playable320k: r.playable320k,
      }));

    if (matchedSongs.length > 0 && onStream) {
      onStream({
        type: "card",
        data: {
          title,
          subtitle: `共为您匹配 ${matchedSongs.length} 首 320k 官方热单，支持在线试听与一键同步歌单：`,
          sourceType: "trending_radar",
          tracks: matchedSongs,
        },
      });
    }
  } catch {
    // ignore
  }
}
