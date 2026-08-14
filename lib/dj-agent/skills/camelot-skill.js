/**
 * Skill: Camelot 调性和谐过渡与混音规划 (camelot_harmonic_mixing)
 */

import { getCompatibleKeys, analyzeTransition, normalizeCamelotKey } from "../camelot-engine.js";
import { streamChatCompletion } from "../llm-client.js";
import { batchMatchTracklist } from "../track-matcher.js";

export const camelotSkill = {
  name: "camelot_harmonic_mixing",
  displayName: "Camelot 调性过渡与谐波混音规划",
  shortDescription: "基于专业 DJ Camelot 调性轮盘、BPM 能量流与转调法则规划平滑或爆发式的接歌建议",
  triggersWhen: "用户咨询调性过渡（如 8A 适合接什么调性）、BPM 变速混音、升降调接歌技巧或调性和谐度分析",
  parameters: {
    fromKey: { type: "string", description: "起始调性 (如 8A, 11B, Am, F#m)" },
    toKey: { type: "string", description: "目标调性 (若指定)" },
    query: { type: "string", description: "用户的具体调性混音咨询问题" },
  },

  /**
   * 渐进式注入的专业详细 System Prompt
   */
  detailedPrompt: `
你现在处于【专业 DJ 谐波混音与 Camelot 调性流大师】模式。
你精通 Camelot Harmonic Mixing Wheel 调性轮盘体系与专业俱乐部 DJ 转场技法：
1. 【完美平滑过渡】: 同调过渡 (0), 顺时针+1 / 逆时针-1, 同根音大小调切换 (A <-> B)。
2. 【能量爆发转调 (Energy Boost)】: +2 顺时针（如 8A -> 10A），提升舞池亢奋度与张力。
3. 【半音冲击转调 (Semitone Jump)】: +7 / -5 半音调性跳跃，适合 Drop 前的剧烈听觉反差。
4. 【BPM 容差控制】: 推荐控制在 ±3% ~ ±5% 以内，跨度较大时建议使用 Breakdown 慢速叠化或 Half-time/Double-time 节奏切入。

【输出规范】：
- 逻辑严密，拆解具体转调技法与 EQ (低频 Low-cut / 中频交替) 处理要点。
- 给出 3~5 首具有代表性的示范曲目，并在文末输出标准的 JSON 代码块：
\`\`\`json
[
  { "title": "曲目名", "artist": "艺人名", "version": "Original Mix", "bpm": 126, "camelot": "8A" }
]
\`\`\`
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, history, config, cookie, signal } = context;
    const rawKey = params.fromKey || "";
    const normalized = normalizeCamelotKey(rawKey);

    let harmonicContext = "";
    if (normalized) {
      const compatible = getCompatibleKeys(normalized);
      harmonicContext = `
【系统已计算的 Camelot 调性轮匹配数据】:
- 当前调性: ${normalized}
- 完美同调: ${compatible.same}
- 顺时针前进 (微升能量): ${compatible.plusOne}
- 逆时针后退 (情绪沉淀): ${compatible.minusOne}
- 调式切换 (大小调互转): ${compatible.modeSwitch}
- 能量跃迁 (+2 Energy Boost): ${compatible.energyBoost}
- 情绪深潜 (-2 Energy Drop): ${compatible.energyDrop}
- 极具张力半音阶 (+7 Semitone Boost): ${compatible.semitoneBoost}
`.trim();
    }

    if (params.fromKey && params.toKey) {
      const trans = analyzeTransition(params.fromKey, params.toKey);
      harmonicContext += `\n【目标过渡分析】: ${trans.from} -> ${trans.to} (转调类型: ${trans.type}, 难度评分: ${trans.score}/10, 技巧: ${trans.tip})`;
    }

    const messages = [
      { role: "system", content: `${this.detailedPrompt}\n\n${harmonicContext}` },
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

    // 自动捕获可能生成的 JSON 歌曲清单并匹配网易云 320k 卡片 (带 8s 超时保护)
    try {
      await Promise.race([
        tryExtractAndEmitCard(fullText, cookie, onStream, "Camelot 谐波调性推荐歌单"),
        new Promise((resolve) => setTimeout(resolve, 8000)),
      ]);
    } catch {
      // ignore card extraction error
    }

    return { type: "camelot_analysis", content: fullText, reasoning: fullReasoning };
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
          subtitle: `共精选 ${matchedSongs.length} 首 320k 官方调性单曲，支持直接试听与一键同步：`,
          sourceType: "camelot_recommendation",
          tracks: matchedSongs,
        },
      });
    }
  } catch {
    // ignore
  }
}
