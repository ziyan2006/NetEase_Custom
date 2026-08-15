/**
 * Skill: 1001Tracklists 现场演出实时检索 (live_set_search)
 */

import { searchArtistRecentSets } from "../tracklist-parser.js";

export const searchSkill = {
  name: "live_set_search",
  displayName: "1001TL 现场演出实时检索",
  shortDescription: "在 1001Tracklists 上实时搜索指定 DJ/艺人近期的标志性现场演出 Setlist 列表",
  triggersWhen: "用户询问某位 DJ/艺人最近有什么演出、现场 Setlist、音乐节录音或要求推荐现场",
  parameters: {
    artist: { type: "string", description: "需要检索的 DJ/艺人名称 (例如 Culture Shock, Martin Garrix, Anyma)" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你现在处于【1001Tracklists 现场检索与音乐节精选专家】模式。
你的核心任务是帮用户定位目标 DJ/制作人在各大顶级音乐节（如 Tomorrowland, Ultra, EDC, Rampage, Defqon.1, Creamfields 等）的标志性现场演出。
向用户清晰介绍各场演出的时间、舞台定位与风格特点，引导用户点击一键解析并生成歌单。
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, config } = context;
    const artist = (params.artist || "").trim();

    if (!artist) {
      if (onStream) {
        onStream({ type: "text", data: "请告诉我您想检索哪位 DJ 或制作人的近期现场演出？" });
      }
      return { type: "empty_query" };
    }

    if (onStream) {
      onStream({ type: "status", data: `正在 1001Tracklists 实时检索 ${artist} 近期的代表性现场演出...` });
      onStream({ type: "tool_progress", data: { id: context.toolCallId, message: `在 1001Tracklists 上搜索 ${artist} 代表性现场演出` } });
    }

    const searchResult = await searchArtistRecentSets(artist, { config });
    const sets = searchResult.sets || [];

    if (onStream) {
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: `已获取 ${searchResult.artist || artist} 的 ${sets.length} 场标志性演出列表`,
        },
      });
    }

    const cardPayload = {
      title: `🎪 ${searchResult.artist || artist} 现场演出推荐列表`,
      subtitle: `已为您从 1001Tracklists 检索到 ${sets.length} 场标志性现场，点击即可一键解析并生成歌单：`,
      sourceType: "artist_sets_selector",
      artist: searchResult.artist || artist,
      sets,
    };

    if (onStream) {
      const introText = `### 🎪 **${searchResult.artist || artist}** 现场 Setlist 检索结果\n\n为您从 1001Tracklists 检索了 **${searchResult.artist || artist}** 近期的标志性现场演出。\n\n您可以查看下方现场列表，**点击任一演出右侧的「⚡ 解析并生成歌单」**，我将全自动为您提取完整曲目、过滤未发行 ID 并匹配网易云 320k 官方音源！\n`;
      onStream({ type: "text", data: introText });
      onStream({ type: "card", data: cardPayload });
    }

    return { type: "artist_sets", searchResult, card: cardPayload };
  },
};
