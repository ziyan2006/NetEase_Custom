/**
 * Skill: Camelot 调性和谐过渡与混音规划 (camelot_harmonic_mixing)
 */

import { getCompatibleKeys, analyzeTransition, normalizeCamelotKey, extractCamelotKeyFromText } from "../camelot-engine.js";
import { streamChatCompletion } from "../llm-client.js";

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
- 只解释系统已计算的 Camelot 结果。
- 不要编造示范曲目、BPM 或未出现在引擎结果中的调性。
`.trim(),

  /**
   * 业务执行入口
   */
  async execute(params, context) {
    const { onStream, history, config, signal } = context;
    const normalized = normalizeCamelotKey(params.fromKey) || extractCamelotKeyFromText(context.rawMessage || params.query || "");
    const compatible = normalized ? getCompatibleKeys(normalized) : [];
    const toKey = normalizeCamelotKey(params.toKey);
    const fromBpm = Number(params.fromBpm);
    const toBpm = Number(params.toBpm);
    const transition = normalized && toKey
      ? analyzeTransition(normalized, Number.isFinite(fromBpm) ? fromBpm : undefined, toKey, Number.isFinite(toBpm) ? toBpm : undefined)
      : null;

    const engineLines = [];
    if (normalized) {
      engineLines.push(`当前调性：**${normalized}**`);
      for (const item of compatible) {
        engineLines.push(`- ${item.camelot} (${item.standard}) · ${item.relation} · ${item.energyEffect}`);
      }
    } else {
      engineLines.push("未识别到 Camelot 调性。请提供如 `8A`、`Am` 的调性。");
    }
    if (transition) {
      engineLines.push(`\n过渡 ${transition.from.key} → ${transition.to.key}：${transition.keyRelation}，综合 ${transition.totalScore}/100。${transition.harmonicAdvice}`);
      if (transition.bpmAdvice) engineLines.push(transition.bpmAdvice);
    }

    const engineText = engineLines.join("\n");
    const cardPayload = {
      sourceType: "camelot_analysis",
      title: normalized ? `Camelot ${normalized} 过渡` : "Camelot 调性分析",
      fromKey: normalized,
      compatible,
      transition,
    };

    if (onStream) {
      onStream({
        type: "tool_progress",
        data: {
          id: context.toolCallId,
          message: normalized
            ? `本地引擎已计算 ${normalized} 的 ${compatible.length} 个兼容调`
            : "未解析到调性，跳过引擎卡片",
        },
      });
    }

    const hasKey = Boolean(String(config?.apiKey || process.env.DEEPSEEK_API_KEY || "").trim());
    let fullText = engineText;
    let fullReasoning = "";

    if (hasKey) {
      const harmonicContext = compatible.length
        ? compatible.map((item) => `${item.camelot} ${item.relation} (${item.standard})`).join("；")
        : "无引擎结果";
      try {
        await streamChatCompletion({
          messages: [
            { role: "system", content: `${this.detailedPrompt}\n\n只解释下列引擎结果，禁止编造曲目、BPM 或调性：\n${harmonicContext}` },
            ...history,
            { role: "user", content: context.rawMessage },
          ],
          config,
          signal,
          onReasoning: (chunk) => {
            fullReasoning += chunk;
            if (onStream) onStream({ type: "reasoning", data: chunk });
          },
          onContent: (chunk) => {
            if (onStream) onStream({ type: "text", data: chunk });
          },
          onComplete: (res) => {
            fullText = `${engineText}\n\n${res.content || ""}`.trim();
          },
        });
      } catch (err) {
        fullText = `${engineText}\n\n模型解释不可用：${err.message}`;
        if (onStream) onStream({ type: "text", data: fullText });
      }
    } else if (onStream) {
      onStream({ type: "text", data: engineText });
    }

    if (onStream && compatible.length > 0) {
      onStream({ type: "card", data: cardPayload });
    }

    return { type: "camelot_analysis", content: fullText, reasoning: fullReasoning, card: cardPayload };
  },
};
