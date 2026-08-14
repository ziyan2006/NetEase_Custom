/**
 * DJ Agent 意图路由与工作流调度引擎 (Agent Dispatcher)
 * 基于纯 LLM 自主选择链路与 Skill 渐进式披露 (Progressive Disclosure) 架构
 */

import { defaultSkillRegistry } from "./skills/index.js";
import { chatCompletion } from "./llm-client.js";

/**
 * 调度处理用户在 Copilot 中的输入
 * @param {object} params
 * @param {string} params.message - 用户输入消息
 * @param {Array<object>} params.history - 历史对话上下文
 * @param {string} params.cookie - 网易云 Cookie (用于 320k 匹配与建歌单)
 * @param {object} [params.config] - LLM 配置 { baseUrl, apiKey, model }
 * @param {Function} [params.onStream] - SSE 流式输出回调 ({ type: 'text'|'reasoning'|'card'|'status', data })
 * @param {AbortSignal} [params.signal] - 中断信号
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
    if (onStream) {
      onStream({
        type: "text",
        data: "请问有什么可以协助您的？您可以发送 1001Tracklists 现场链接、让我推荐特定风格热单、或咨询调性过渡建议。",
      });
    }
    return;
  }

  // --- Stage 1: LLM 技能自主决策 (极轻量 Prompt，极速推理) ---
  if (onStream) {
    onStream({ type: "status", data: "AI 思考中，正在自主分析自然语言意图并匹配专业 Skill 链路..." });
  }

  const catalogPrompt = defaultSkillRegistry.getLightweightCatalogPrompt();
  const decisionMessages = [
    { role: "system", content: catalogPrompt },
    ...history.slice(-4), // 携带上下文以支持多轮连贯决策
    { role: "user", content: text },
  ];

  let selectedSkillName = "general_dj_chat";
  let extractedParams = { query: text };
  let thought = "";

  try {
    const decisionRes = await chatCompletion({
      messages: decisionMessages,
      config: { ...config, temperature: 0.1 }, // 极低温度保证结构化稳定输出
    });

    const jsonMatch = /\{[\s\S]*\}/.exec(decisionRes.content);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);
      if (decision.skill && defaultSkillRegistry.get(decision.skill)) {
        selectedSkillName = decision.skill;
        extractedParams = decision.parameters || {};
        thought = decision.thought || "";
      }
    }
  } catch (err) {
    console.warn("[Skill Router Decision Warning]:", err.message);
  }

  const targetSkill = defaultSkillRegistry.get(selectedSkillName) || defaultSkillRegistry.get("general_dj_chat");

  if (onStream && thought) {
    onStream({
      type: "status",
      data: `⚡ [已激活 ${targetSkill.displayName}] ${thought}`,
    });
  }

  // --- Stage 2: 渐进式加载与执行该 Skill 的专属逻辑与详细 Prompt ---
  const context = {
    rawMessage: text,
    history,
    cookie,
    config,
    onStream,
    signal,
  };

  return await targetSkill.execute(extractedParams, context);
}
