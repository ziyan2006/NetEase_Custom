/**
 * Skill: 1001Tracklists 现场与文本歌单解析 (1001tl_setlist_scraper)
 */

import { fetchAndParse1001TracklistUrl, parseTracklistText } from "../tracklist-parser.js";
import { batchMatchTracklist } from "../track-matcher.js";

export const scraperSkill = {
  name: "1001tl_setlist_scraper",
  displayName: "1001TL 现场与文本歌单解析",
  shortDescription: "从 1001Tracklists 现场链接或长文本 Setlist 中解析真实曲目，过滤未发行 ID，并匹配网易云 320k 官方音频",
  triggersWhen: "用户输入了 1001Tracklists 链接、包含多首歌曲的现场歌单文本、或明确要求将某个演出制作成网易云歌单",
  parameters: {
    url: { type: "string", description: "1001Tracklists 现场链接 (若有)" },
    text: { type: "string", description: "多行现场曲目文本或歌单内容 (若有)" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你现在处于【1001Tracklists 现场曲目解析与歌单还原专家】模式。
你的核心任务是精准提取电子音乐 Live Set 中的所有真实发行曲目，彻底过滤未发行 Demo/ID 曲目，并为每首曲目梳理精准的艺人、歌名与混音版本信息。
输出必须具备专业 DJ 严谨度，确保每首已发行曲目能无缝与流媒体官方曲库进行 320k 匹配。
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, cookie } = context;
    let targetUrl = params.url || "";
    const rawText = params.text || context.rawMessage || "";

    // 自动从原始消息中检测 1001Tracklists URL
    if (!targetUrl && rawText) {
      const urlMatch = /https?:\/\/(?:www\.)?1001tracklists\.com\/tracklist\/[^\s\)]+/i.exec(rawText);
      if (urlMatch) {
        targetUrl = urlMatch[0];
      }
    }

    let parsedSet = null;

    if (targetUrl) {
      if (onStream) {
        onStream({ type: "status", data: `正在穿透抓取 1001Tracklists 现场页面: ${targetUrl}...` });
        onStream({ type: "tool_progress", data: { id: context.toolCallId, message: `抓取 1001Tracklists 现场页面: ${targetUrl}` } });
      }

      parsedSet = await fetchAndParse1001TracklistUrl(targetUrl, {
        filterUnreleased: true,
        onProgress: (msg) => {
          if (onStream) {
            onStream({ type: "status", data: msg });
            onStream({ type: "tool_progress", data: { id: context.toolCallId, message: msg } });
          }
        },
      });

      if (!parsedSet || !parsedSet.tracks || parsedSet.tracks.length === 0) {
        const errorMsg = `### ⚠️ 未能从该 1001Tracklists 页面提取到有效音轨\n\n- **目标链接**：${targetUrl}\n- **可能原因**：该演出页面尚在审核中、全场皆为未发行 ID、或网络访问受限。\n\n建议您直接粘贴包含曲目文本的 Setlist，或核对原站链接是否正确。`;
        if (onStream) {
          onStream({ type: "text", data: errorMsg });
        }
        return { type: "tracklist_result", error: "未提取到有效曲目", card: null };
      }
    } else {
      if (onStream) {
        onStream({ type: "status", data: "正在解析现场 Setlist 文本并提取有效曲目..." });
        onStream({ type: "tool_progress", data: { id: context.toolCallId, message: "解析现场 Setlist 文本" } });
      }
      parsedSet = parseTracklistText(rawText, { filterUnreleased: true });

      const titleMatch = /【([^】]+)】/.exec(rawText);
      const rawTitle = titleMatch ? titleMatch[1].trim() : "";
      parsedSet.title = rawTitle || "现场 Setlist";
      const djMatch = /^([^@\n]{2,40})\s+@/.exec(rawTitle || rawText);
      if (djMatch) parsedSet.dj = djMatch[1].trim();

      if (!parsedSet.tracks || parsedSet.tracks.length === 0) {
        const errorMsg = `### ⚠️ 未识别到有效曲目格式\n\n请提供标准的曲目列表文本（每行一首，格式如 \`01. Artist - Title\`）或 1001Tracklists 网页链接。`;
        if (onStream) {
          onStream({ type: "text", data: errorMsg });
        }
        return { type: "tracklist_result", error: "未识别到有效曲目格式", card: null };
      }
    }

    if (onStream) {
      onStream({
        type: "status",
        data: `解析完成！共提取 ${parsedSet.totalCount} 首曲目 (已自动过滤 ${parsedSet.filteredCount} 首未发行 ID)。正在全量匹配网易云 320k 官方音源...`,
      });
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: `提取到 ${parsedSet.totalCount} 首曲目 (过滤 ${parsedSet.filteredCount} 首 ID)，正在匹配网易云 320k 音源...`,
        },
      });
    }

    // 匹配网易云 320k 官方音频
    const matchRes = await batchMatchTracklist(parsedSet.tracks, cookie, (prog) => {
      if (onStream) {
        onStream({
          type: "status",
          data: `网易云曲库匹配中 (${prog.index}/${prog.total}): ${prog.currentTrack.artist} - ${prog.currentTrack.title}...`,
        });
        if (prog.index % 4 === 0 || prog.index === prog.total) {
          onStream({
            type: "tool_progress",
            data: {
              id: context.toolCallId,
              message: `匹配进度 (${prog.index}/${prog.total}): ${prog.currentTrack.artist} - ${prog.currentTrack.title}`,
            },
          });
        }
      }
    });

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
        rawQuery: r.original?.searchQuery || r.track?.searchQuery || "",
      }));

    const sourceLabel = "1001Tracklists 真实原站";

    const cardPayload = {
      title: parsedSet.title || "1001Tracklists 现场 Setlist 还原歌单",
      subtitle: `DJ: ${parsedSet.dj || "Featured Artist"} · 共匹配 ${matchedSongs.length}/${parsedSet.tracks.length} 首 320k 官方曲目 (成功率 ${matchRes.summary.matchRate})`,
      sourceType: "1001tracklists",
      tracksCount: matchedSongs.length,
      tracks: matchedSongs,
      originalSet: {
        title: parsedSet.title,
        dj: parsedSet.dj,
        totalCount: parsedSet.totalCount,
        filteredCount: parsedSet.filteredCount,
      },
    };

    if (onStream) {
      const summaryText = `### 🎧 **${parsedSet.title || "现场 Setlist"}** 现场还原完成\n\n- **现场来源**：${sourceLabel}\n- **总曲目**：${parsedSet.totalCount} 首 (已自动过滤 ${parsedSet.filteredCount} 首未发行 ID)\n- **网易云 320k 匹配成功**：${matchedSongs.length} 首 (成功率 **${matchRes.summary.matchRate}**)\n\n您可以在下方试听卡片中**直接播放 320k 官方高音质**，或点击**「一键同步至网易云」**将该 Setlist 保存为您的专属私有/公开歌单！\n`;
      onStream({ type: "text", data: summaryText });
      onStream({ type: "card", data: cardPayload });
    }

    return { type: "tracklist_result", parsedSet, matchRes, card: cardPayload };
  },
};
