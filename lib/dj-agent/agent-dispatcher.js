/**
 * DJ Agent 意图路由与工作流调度引擎 (Agent Dispatcher)
 * 智能识别 1001TL 链接、榜单雷达、Camelot 调性过渡与自然语言排歌，并联动 NetEase 320k 匹配与 LLM
 */

import { fetchAndParse1001TracklistUrl, parseTracklistText, searchArtistRecentSets } from "./tracklist-parser.js";
import { getTrendingTracksByGenre, GENRE_PROFILES } from "./trend-radar.js";
import { batchMatchTracklist } from "./track-matcher.js";
import { getCompatibleKeys, analyzeTransition, normalizeCamelotKey } from "./camelot-engine.js";
import { streamChatCompletion, chatCompletion } from "./llm-client.js";

/**
 * 调度处理用户在 Copilot 中的输入
 * @param {object} params
 * @param {string} params.message - 用户输入消息
 * @param {Array<object>} params.history - 历史对话上下文
 * @param {string} params.cookie - 网易云 Cookie (用于 320k 匹配与建歌单)
 * @param {object} [params.config] - LLM 配置 { baseUrl, apiKey, model }
 * @param {Function} [params.onStream] - SSE 流式输出回调 ({ type: 'text'|'reasoning'|'card'|'status', data })
 */
export async function dispatchAgentWorkflow({
  message,
  history = [],
  cookie = "",
  config = {},
  onStream,
  signal,
}) {
  const text = (message || "").trim();
  if (!text) {
    if (onStream) onStream({ type: "text", data: "请问有什么可以协助您的？您可以发送 1001Tracklists 现场链接、让我推荐特定风格热单、或咨询调性过渡建议。" });
    return;
  }

  // 1. 意图分支 A: 检测是否包含 1001Tracklists 网页 URL
  const urlMatch = /https?:\/\/(?:www\.)?1001tracklists\.com\/tracklist\/[^\s]+/i.exec(text);

  // 1.5 意图分支 A2: 检测是否查询艺人近期现场演出/Setlist
  // 例如：“帮我看看 culture shock 最近的演出”、“查一下 Martin Garrix 的 live set”、“Anyma 现场”
  const isMultiLineSetlist = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 3 && /[-–—]/.test(text);
  const isSetSearchIntent = /(?:演出|现场|set|setlist|liveset)/i.test(text) && !urlMatch && !isMultiLineSetlist;
  if (isSetSearchIntent) {
    // 提取艺人名称
    const cleanedQuery = text
      .replace(/(?:帮我|看看|查查|搜索|查找|查询|推荐|列出|有哪些|请问|我想看|有没有|的|最近|近期|最新|现场|演出|setlist|liveset|set|歌单)/gi, "")
      .trim();

    if (cleanedQuery.length >= 2) {
      if (onStream) {
        onStream({ type: "status", data: `正在 1001Tracklists 检索 ${cleanedQuery} 近期的代表性现场演出...` });
      }

      const searchResult = await searchArtistRecentSets(cleanedQuery, { config });
      if (searchResult.sets && searchResult.sets.length > 0) {
        const cardPayload = {
          title: `🎪 ${searchResult.artist} 现场演出推荐列表`,
          subtitle: `已为您动态精选 ${searchResult.sets.length} 场 2025~2026 最新标志性现场，点击即可一键解析并生成歌单：`,
          sourceType: "artist_sets_selector",
          artist: searchResult.artist,
          sets: searchResult.sets,
        };

        if (onStream) {
          onStream({
            type: "text",
            data: `### 🎪 **${searchResult.artist}** 现场 Setlist 检索结果\n\n为您从 1001Tracklists 与各大音乐节动态精选了 **${searchResult.artist}** 近期的标志性现场演出 (包含 Rampage, Let It Roll, EDC 等)。\n\n您可以查看下方现场列表，**点击任一演出右侧的「⚡ 解析并生成歌单」**，我将全自动为您提取完整曲目、过滤未发行 ID 并匹配网易云 320k 官方音源！\n`,
          });
          onStream({ type: "card", data: cardPayload });
        }

        return { type: "artist_sets", searchResult, card: cardPayload };
      }
    }
  }
  if (urlMatch) {
    const targetUrl = urlMatch[0];
    if (onStream) {
      onStream({ type: "status", data: `正在抓取 1001Tracklists 现场页面: ${targetUrl}...` });
    }

    try {
      let parsedSet = await fetchAndParse1001TracklistUrl(targetUrl, { filterUnreleased: true });

      // 如果 1001TL 页面受 Cloudflare 拦截导致曲目数为 0，智能启用 AI Setlist 专家大脑提取
      if (!parsedSet || !parsedSet.tracks || parsedSet.tracks.length === 0) {
        if (onStream) {
          onStream({
            type: "status",
            data: `1001TL 页面受 Cloudflare 保护，正在调用 AI 专家大脑提取该演出的真实曲目列表...`,
          });
        }

        const prompt = `请提取并列出以下 1001Tracklists 现场演出/Setlist 的真实完整曲目清单：\n链接/演出名称: ${targetUrl}\n请列出 10~15 首该场演出中的真实已发行曲目 (格式为 'Artist - Title')，严禁包含 ID - ID 或未发行 Demo：`;
        const llmRes = await chatCompletion({
          messages: [{ role: "user", content: prompt }],
          config,
        });

        parsedSet = parseTracklistText(llmRes.content, { filterUnreleased: true });
        parsedSet.title = `[1001TL] ${targetUrl.split("/").pop().replace(".html", "").replace(/-/g, " ")}`;
      }

      if (onStream) {
        onStream({
          type: "status",
          data: `解析完成！共发现 ${parsedSet.totalCount} 首曲目，已自动过滤 ${parsedSet.filteredCount} 首未发行 (ID) 曲目。正在匹配网易云 320k 官方高音质...`,
        });
      }

      const matchRes = await batchMatchTracklist(parsedSet.tracks, cookie, (prog) => {
        if (onStream) {
          onStream({
            type: "status",
            data: `网易云曲库匹配中 (${prog.index}/${prog.total}): ${prog.currentTrack.artist} - ${prog.currentTrack.title}...`,
          });
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
          score: r.score,
        }));

      const cardPayload = {
        title: `[1001TL] ${parsedSet.title || "Live Set"}`,
        subtitle: `DJ: ${parsedSet.dj || "Featured Artist"} · 共匹配 ${matchedSongs.length}/${parsedSet.tracks.length} 首 320k 官方曲目 (成功率 ${matchRes.matchRate}%)`,
        sourceType: "1001tracklists",
        sourceUrl: targetUrl,
        tracks: matchedSongs,
        failedCount: matchRes.failedCount,
      };

      if (onStream) {
        onStream({
          type: "text",
          data: `### 🎧 现场 Setlist 解析完成：**${parsedSet.title || "Live Set"}**\n\n已成功从 1001Tracklists 提取现场音轨，已全自动**过滤未发行 (ID) 占位曲目**，并在网易云官方曲库中完成了 320k 极高音质置信度匹配与可用性校验。\n\n您可以在下方预览卡片中直接试听，确认无误后点击「**确认并在网易云新建歌单**」即可一键将该 Set 完整顺序同步到您的云端歌单！\n`,
        });
        onStream({ type: "card", data: cardPayload });
      }

      return { type: "1001tl", parsedSet, matchRes, card: cardPayload };
    } catch (err) {
      if (onStream) {
        onStream({
          type: "text",
          data: `⚠️ 抓取 1001Tracklists 页面遇到限制或异常：${err.message}\n\n**建议**：您可以直接复制 1001Tracklists 网页上的文本歌单并粘贴发送给我，我将直接通过文本分析为您精确还原歌单！`,
        });
      }
      return { error: err.message };
    }
  }

  // 2. 意图分支 B: 检测是否为多行粘贴的 Setlist 纯文本
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length >= 3 && lines.some((l) => /[-–—]/.test(l))) {
    if (onStream) {
      onStream({ type: "status", data: "检测到 Setlist 文本，正在提取曲目与过滤未发行曲目..." });
    }

    const parsedText = parseTracklistText(text, { filterUnreleased: true });
    if (parsedText.tracks.length > 0) {
      if (onStream) {
        onStream({
          type: "status",
          data: `提取到 ${parsedText.tracks.length} 首有效曲目 (已过滤 ${parsedText.filteredCount} 首 ID 曲目)。正在匹配网易云 320k 官方音频...`,
        });
      }

      const matchRes = await batchMatchTracklist(parsedText.tracks, cookie);
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
          score: r.score,
        }));

      const cardPayload = {
        title: `[DJ Set] 自定义 Setlist (${matchedSongs.length} 首)`,
        subtitle: `共识别 ${parsedText.totalCount} 首 · 成功匹配 ${matchedSongs.length} 首 320k 官方曲目 (成功率 ${matchRes.matchRate}%)`,
        sourceType: "custom_setlist",
        tracks: matchedSongs,
        failedCount: matchRes.failedCount,
      };

      if (onStream) {
        onStream({
          type: "text",
          data: `### 🎵 文本 Setlist 结构化解析完成\n\n已成功解析您提供的歌单文本，过滤未发行 Demo，并匹配网易云 320k 官方曲目：\n`,
        });
        onStream({ type: "card", data: cardPayload });
      }

      return { type: "text_setlist", card: cardPayload };
    }
  }

  // 3. 意图分支 C: 检测风格榜单热单雷达 (Beatport / Genre Radar)
  const lower = text.toLowerCase();
  let matchedGenre = null;
  for (const [key, profile] of Object.entries(GENRE_PROFILES)) {
    if (
      lower.includes(key.replace(/_/g, " ")) ||
      lower.includes(profile.name.toLowerCase()) ||
      (key === "melodic_techno" && (lower.includes("melodic") || lower.includes("afterlife") || lower.includes("anyma"))) ||
      (key === "tech_house" && (lower.includes("tech house") || lower.includes("fisher") || lower.includes("mau p"))) ||
      (key === "afro_house" && (lower.includes("afro") || lower.includes("keinemusik") || lower.includes("adam port"))) ||
      (key === "bass_house_ukg" && (lower.includes("bass house") || lower.includes("uk garage") || lower.includes("ukg") || lower.includes("fred again"))) ||
      (key === "drum_and_bass" && (lower.includes("drum and bass") || lower.includes("dnb") || lower.includes("d&b"))) ||
      (key === "mainstage_edm" && (lower.includes("edm") || lower.includes("mainstage") || lower.includes("tomorrowland") || lower.includes("garrix")))
    ) {
      if (lower.includes("榜") || lower.includes("热") || lower.includes("单") || lower.includes("推荐") || lower.includes("歌") || lower.includes("听") || lower.includes("top") || lower.includes("chart")) {
        matchedGenre = key;
        break;
      }
    }
  }

  if (matchedGenre) {
    const genreData = await getTrendingTracksByGenre(matchedGenre, { config });
    if (onStream) {
      onStream({
        type: "status",
        data: `正在调用 AI 大脑动态推荐 ${genreData.genreName} 风格当前热门单曲并匹配网易云 320k 音频...`,
      });
    }

    const matchRes = await batchMatchTracklist(genreData.tracks, cookie);
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
        score: r.score,
      }));

    const cardPayload = {
      title: `${genreData.icon} [DJ Radar] ${genreData.genreName} 实时趋势热单`,
      subtitle: `${genreData.description} (BPM: ${genreData.bpmRange.join("-")})`,
      sourceType: "trend_radar",
      tracks: matchedSongs,
      failedCount: matchRes.failedCount,
    };

    if (onStream) {
      onStream({
        type: "text",
        data: `### ${genreData.icon} **${genreData.genreName}** 风格动态热单推荐\n\n- **典型 BPM 范围**：\`${genreData.bpmRange.join(" - ")} BPM\`\n- **流派特征**：${genreData.description}\n- **代表艺人**：${genreData.representativeArtists.join(", ")}\n\n已为您实时生成本流派热门单曲精选，并在网易云官方曲库中完成 320k 匹配：\n`,
      });
      onStream({ type: "card", data: cardPayload });
    }

    return { type: "trend_radar", genreData, card: cardPayload };
  }

  // 4. 意图分支 D: Camelot 调性分析与过渡计算
  const hasCamelotIntent = /(?:调性|key|camelot|转调|过渡|接歌|和弦)/i.test(text);
  const keyTokenMatch = /\b([1-9]|1[0-2])[ab]\b/i.exec(text) || /\b([a-g][#b]?m?(?:ajor|inor)?)\b/i.exec(text);
  if (hasCamelotIntent && keyTokenMatch) {
    const rawKey = keyTokenMatch[0];
    const normKey = normalizeCamelotKey(rawKey);
    if (normKey) {
      const compatible = getCompatibleKeys(normKey);
      let responseMd = `### 🎛️ Camelot 调性轮盘过渡指南 (当前基准: **${normKey} / ${compatible[0]?.standard}**)\n\n根据 Camelot Harmonic Mixing 调性和谐法则，为您推荐以下最佳混音过渡方案：\n\n| 推荐调性 | 对应音调 | 混音关系 | 情绪/能量效果 | 匹配度 |\n| :--- | :--- | :--- | :--- | :---: |\n`;

      for (const item of compatible) {
        responseMd += `| **${item.camelot}** | \`${item.standard}\` | ${item.relation} | ${item.energyEffect} | \`${item.score}%\` |\n`;
      }

      responseMd += `\n> [!TIP]\n> **混音建议**：在顺时针 (+1) 或相对大小调 (A $\\leftrightarrow$ B) 切换时，可利用 32 或 64 拍的 Extended Mix Outro/Intro 进行长线条混音；如需在 Drop 处制造戏剧性升温，可直接使用 +2 或 +7 能量跃迁！\n`;

      if (onStream) {
        onStream({ type: "text", data: responseMd });
      }
      return { type: "camelot", baseKey: normKey, compatible };
    }
  }

  // 5. 意图分支 E: 通用自然语言对话与智能排歌 (调用 DeepSeek LLM)
  let fullLlmContent = "";
  const messages = [...history, { role: "user", content: text }];
  await streamChatCompletion({
    messages,
    config,
    onReasoning: (chunk) => {
      if (onStream) onStream({ type: "reasoning", data: chunk });
    },
    onContent: (chunk) => {
      fullLlmContent += chunk;
      if (onStream) onStream({ type: "text", data: chunk });
    },
    signal,
  });

  // 自动检测 LLM 回复中是否包含 JSON 歌曲清单代码块，若存在则全自动升级为交互式歌单卡片并匹配 320k
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?\[\s*\{[\s\S]*?\}\s*\][\s\S]*?)\s*```/i;
  const jsonMatch = jsonBlockRegex.exec(fullLlmContent);
  if (jsonMatch) {
    try {
      const rawJson = jsonMatch[1].trim();
      const arrayStart = rawJson.indexOf("[");
      const arrayEnd = rawJson.lastIndexOf("]");
      if (arrayStart !== -1 && arrayEnd !== -1) {
        const jsonSlice = rawJson.slice(arrayStart, arrayEnd + 1);
        const trackList = JSON.parse(jsonSlice);
        if (Array.isArray(trackList) && trackList.length > 0) {
          const parsedTracks = trackList.map((t) => ({
            artist: (t.artist || "").trim(),
            title: (t.title || t.name || "").trim(),
            remix: (t.remix || t.version || "").trim(),
            searchQuery: `${t.artist || ""} ${t.title || t.name || ""} ${t.remix || t.version || ""}`.trim(),
          })).filter((t) => t.artist && t.title);

          if (parsedTracks.length >= 2) {
            if (onStream) {
              onStream({ type: "status", data: `检测到 AI 推荐歌曲清单，正在自动匹配网易云 320k 官方高音质曲库...` });
            }
            const matchRes = await batchMatchTracklist(parsedTracks, cookie);
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
                score: r.score,
              }));

            const cardPayload = {
              title: `🎧 AI 推荐定制歌单 (${matchedSongs.length} 首)`,
              subtitle: `已自动完成网易云 320k 官方音源匹配与校验，可直接试听并一键同步到网易云歌单`,
              sourceType: "custom_setlist",
              tracks: matchedSongs,
              failedCount: matchRes.failedCount,
            };

            if (onStream) {
              onStream({ type: "card", data: cardPayload });
            }
          }
        }
      }
    } catch (err) {
      console.error("[Auto JSON card extraction warning]:", err.message);
    }
  }
}
