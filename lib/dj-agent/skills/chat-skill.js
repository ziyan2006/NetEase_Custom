/**
 * Skill: AI DJ 音乐总监自由对话与排歌 (general_dj_chat)
 */

import { streamChatCompletion } from "../llm-client.js";
import { batchMatchTracklist } from "../track-matcher.js";

export const chatSkill = {
  name: "general_dj_chat",
  displayName: "AI DJ 音乐总监自由对话与排歌",
  shortDescription: "提供通用的电子音乐咨询、现场排歌构想、制作理论、音乐厂牌分析与自由交流",
  triggersWhen: "用户进行通用的电子音乐交流、未明确指定特定工具的复杂场景排歌或制作咨询",
  parameters: {
    query: { type: "string", description: "用户的提问或对话内容" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你是一位世界顶级的专业电子音乐 DJ 与音乐总监 AI 助手 (YesMusic DJ Copilot)。
你精通各大电子音乐流派、音乐节能量曲线编排与俱乐部现场控制。

【严格禁止】：严禁输出任何“作为 AI 我无法获取数据”等免责声明！直接以自信专业的总监口吻交流。
【输出规范】：
- 当你的回答中包含推荐歌单或特定场景选曲时，请在正文中阐述选曲逻辑，并在文末附带标准的 JSON 歌曲清单代码块（系统将自动捕获并匹配网易云 320k 试听卡片）：
\`\`\`json
[
  { "title": "曲目名", "artist": "艺人名", "version": "Original Mix", "label": "厂牌名", "bpm": 126, "camelot": "8A" }
]
\`\`\`
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, history, config, cookie, signal } = context;

    const messages = [
      { role: "system", content: this.detailedPrompt },
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

    // 自动捕获可能生成的 JSON 歌曲清单并匹配网易云 320k 卡片
    await tryExtractAndEmitCard(fullText, cookie, onStream, "🎧 AI DJ 推荐歌单精选");

    return { type: "chat_completion", content: fullText, reasoning: fullReasoning };
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
          subtitle: `共为您匹配 ${matchedSongs.length} 首 320k 官方音频，支持在线试听与一键同步歌单：`,
          sourceType: "llm_recommendation",
          tracks: matchedSongs,
        },
      });
    }
  } catch {
    // ignore
  }
}
