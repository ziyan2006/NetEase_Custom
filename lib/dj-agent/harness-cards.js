/**
 * Map DSH tool JSON onto the existing Copilot interactive cards.
 * Cards stay in the renderer; Harness only returns structured tool payloads.
 */

import { batchMatchTracklist } from "./track-matcher.js";
import { buildSetup1001tlCard, TL_VERIFY_ERROR } from "./tl-session.js";

export function parseHarnessToolJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function collectTextBlocks(blocks, into = []) {
  if (!Array.isArray(blocks)) return into;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && block.text) into.push(block.text);
    else if (block.type === "tool-result" && Array.isArray(block.content)) collectTextBlocks(block.content, into);
    else if (typeof block.text === "string") into.push(block.text);
  }
  return into;
}

export function extractHarnessToolOutput(data = {}) {
  const message = data.message || {};
  const text = collectTextBlocks(message.content).join("\n");
  const nested = Array.isArray(message.content) ? message.content.find((block) => block?.type === "tool-result") : null;
  const callId = message.source?.callId || nested?.toolCallId || "";
  const rawName = data.name || message.source?.name || nested?.name || "";
  const name = String(rawName).split(".").pop();
  return { text, name, callId, isError: Boolean(data.error || nested?.isError) };
}

function inferToolName(name, payload) {
  if (name) return name;
  if (!payload || typeof payload !== "object") return "";
  if (Array.isArray(payload.sets)) return "search_1001tl_sets";
  if (Array.isArray(payload.tracks) || payload.parsedSet) return "parse_1001tl_setlist";
  if (Array.isArray(payload.compatible)) return "analyze_camelot";
  if (typeof payload.ready === "boolean") return "get_1001tl_status";
  return "";
}

export function matchedSongsFromMatchRes(matchRes) {
  return (matchRes?.results || [])
    .filter((row) => row.matched && row.song)
    .map((row, idx) => ({
      trackNumber: idx + 1,
      id: row.song.id,
      name: row.song.name,
      artist: row.song.artist,
      album: row.song.album,
      coverUrl: row.song.coverUrl,
      durationMs: row.song.durationMs,
      previewUrl: row.song.previewUrl,
      playable320k: row.playable320k,
      rawQuery: row.original?.searchQuery || row.track?.searchQuery || "",
    }));
}

export function playlistCardFromParsedSet(parsedSet, matchRes) {
  const matchedSongs = matchedSongsFromMatchRes(matchRes);
  const source = parsedSet?.source || "";
  const sourceLabel = source.includes("1001") || source.includes("tracklist")
    ? "1001Tracklists 页面解析"
    : "用户粘贴的 Setlist 文本";
  return {
    title: parsedSet?.title || "Setlist",
    subtitle: `${sourceLabel} · 匹配 ${matchedSongs.length}/${parsedSet?.tracks?.length || 0} 首网易云曲目 (成功率 ${matchRes?.summary?.matchRate || "0%"})`,
    sourceType: source.includes("1001") || source.includes("tracklist") ? "1001tracklists" : "harness_crate_plan",
    tracksCount: matchedSongs.length,
    tracks: matchedSongs,
    originalSet: {
      title: parsedSet?.title,
      dj: parsedSet?.dj,
      totalCount: parsedSet?.totalCount,
      filteredCount: parsedSet?.filteredCount,
      reconstructed: false,
      source: parsedSet?.source || "pasted_text",
    },
  };
}

export function artistSetsCardFromSearch(searchResult, artist = "") {
  const name = searchResult?.artist || artist || "DJ";
  const sets = searchResult?.sets || [];
  if (searchResult?.source === "needs_verify") {
    return {
      text: searchResult.error || TL_VERIFY_ERROR,
      card: buildSetup1001tlCard(),
    };
  }
  if (searchResult?.source === "needs_confirmation") {
    return {
      text: searchResult.error || "请先确认艺人的官方写法，再检索现场。",
      card: null,
    };
  }
  if (!sets.length) {
    return {
      text: searchResult?.error
        || `未能从 1001Tracklists 检索到 ${name} 的真实现场。请粘贴现场链接或曲目文本。`,
      card: null,
    };
  }
  return {
    text: `### **${name}** 现场检索\n\n仅展示 1001Tracklists 原站命中的链接。点击「解析」会抓取该页曲目，失败时不会编造歌单。\n`,
    card: {
      title: `${name} 现场列表`,
      subtitle: `来源：1001Tracklists 原站检索，共 ${sets.length} 场`,
      sourceType: "artist_sets_selector",
      artist: name,
      source: searchResult.source,
      sets,
    },
  };
}

export function camelotCardFromEngine(payload) {
  const compatible = payload?.compatible || [];
  const fromKey = payload?.key || payload?.fromKey || "";
  if (!compatible.length) {
    return {
      text: payload?.error || "未识别到 Camelot 调性。请提供如 `8A`、`Am` 的调性。",
      card: null,
    };
  }
  const lines = [`当前调性：**${fromKey}**`];
  for (const item of compatible) {
    lines.push(`- ${item.camelot} (${item.standard}) · ${item.relation} · ${item.energyEffect}`);
  }
  if (payload?.transition) {
    const t = payload.transition;
    lines.push(`\n过渡 ${t.from?.key} → ${t.to?.key}：${t.keyRelation}，综合 ${t.totalScore}/100。`);
  }
  return {
    text: lines.join("\n"),
    card: {
      sourceType: "camelot_analysis",
      title: fromKey ? `Camelot ${fromKey} 过渡` : "Camelot 调性分析",
      fromKey,
      compatible,
      transition: payload.transition || null,
    },
  };
}

export async function eventsFromHarnessToolResult(toolName, rawText, { cookie = "", signal } = {}) {
  const payload = parseHarnessToolJson(rawText);
  const events = [];
  if (!payload || typeof payload !== "object") return events;
  const resolvedTool = inferToolName(String(toolName || "").split(".").pop(), payload);

  if (resolvedTool === "search_1001tl_sets") {
    const mapped = artistSetsCardFromSearch(payload, payload.artist);
    if (mapped.text) events.push({ type: "text", data: mapped.text });
    if (mapped.card) events.push({ type: "card", data: mapped.card });
    return events;
  }

  if (resolvedTool === "parse_1001tl_setlist") {
    if (payload.source === "needs_verify") {
      events.push({ type: "text", data: payload.error || TL_VERIFY_ERROR });
      events.push({ type: "card", data: buildSetup1001tlCard() });
      return events;
    }
    const tracks = payload.tracks || payload.parsedSet?.tracks || [];
    const parsedSet = payload.tracks ? payload : payload.parsedSet;
    if (!tracks.length) {
      events.push({
        type: "text",
        data: payload.error || "没有解析到已发行曲目。请提供可打开的 1001Tracklists 链接，或直接粘贴曲目文本。",
      });
      return events;
    }
    const matchRes = await batchMatchTracklist(tracks, cookie, undefined, signal);
    const card = playlistCardFromParsedSet(parsedSet, matchRes);
    events.push({
      type: "text",
      data: `### **${card.title}**\n\n- **来源**：${card.subtitle}\n\n仅展示检索命中的曲目。无直链的条目不会标记为 320k。\n`,
    });
    events.push({ type: "card", data: card });
    return events;
  }

  if (resolvedTool === "analyze_camelot") {
    const mapped = camelotCardFromEngine(payload);
    if (mapped.text) events.push({ type: "text", data: mapped.text });
    if (mapped.card) events.push({ type: "card", data: mapped.card });
    return events;
  }

  if (resolvedTool === "get_1001tl_status" && payload.ready === false) {
    events.push({ type: "card", data: buildSetup1001tlCard() });
    return events;
  }

  return events;
}
