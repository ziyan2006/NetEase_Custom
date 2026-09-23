/**
 * DJ Agent 意图路由与工作流调度引擎 (Agent Dispatcher)
 * 基于纯 LLM 自主选择链路与 Skill 渐进式披露 (Progressive Disclosure) 架构
 */

import { defaultSkillRegistry } from "./skills/index.js";
import { chatCompletion } from "./llm-client.js";
import { shouldRouteToHarnessCrate } from "./harness-runtime.js";
import { extractCamelotKeyFromText } from "./camelot-engine.js";
import { normalizeLiveSearchArtist } from "./tracklist-parser.js";

function hasLlmKey(config = {}) {
  return Boolean(String(config.apiKey || process.env.DEEPSEEK_API_KEY || "").trim());
}

export function preRouteAgentIntent(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  const urlMatch = /https?:\/\/(?:www\.)?1001tracklists\.com\/tracklist\/[^\s\)]+/i.exec(trimmed);
  if (urlMatch) {
    return {
      skill: "1001tl_setlist_scraper",
      parameters: { url: urlMatch[0] },
      thought: "检测到 1001Tracklists 链接",
    };
  }

  const trackLikeLines = trimmed.split(/\r?\n/).filter((line) => /\s[-–—]\s/.test(line.trim()));
  if (trackLikeLines.length >= 2) {
    return {
      skill: "1001tl_setlist_scraper",
      parameters: { text: trimmed },
      thought: "检测到多行 Setlist 文本",
    };
  }

  if (/(camelot|接歌|调性|谐波)/i.test(trimmed) || extractCamelotKeyFromText(trimmed)) {
    if (!shouldRouteToHarnessCrate(trimmed)) {
      return {
        skill: "camelot_harmonic_mixing",
        parameters: { fromKey: extractCamelotKeyFromText(trimmed) || "", query: trimmed },
        thought: "检测到调性/接歌咨询",
      };
    }
  }

  if (/最近.+(?:演出|现场|setlist)|有什么.+(?:演出|现场)|现场演出/i.test(trimmed)) {
    const artist = normalizeLiveSearchArtist(trimmed) || trimmed;
    return {
      skill: "live_set_search",
      parameters: { artist },
      thought: "检测到艺人现场检索",
    };
  }

  return null;
}

/**
 * 调度处理用户在 Copilot 中的输入
 * @param {object} params
 * @param {string} params.message - 用户输入消息
 * @param {Array<object>} params.history - 历史对话上下文
 * @param {string} params.cookie - 网易云 Cookie (用于 320k 匹配与建歌单)
 * @param {object} [params.config] - LLM 配置 { baseUrl, apiKey, model }
 * @param {Function} [params.onStream] - SSE 流式输出回调 ({ type: 'text'|'reasoning'|'card'|'status', data })
 * @param {AbortSignal} [params.signal] - 中断信号
 * @param {object} [params.harnessRuntime] - DeepSeek Harness runtime
 * @param {string} [params.sessionId] - persisted Copilot session id
 */
export async function dispatchAgentWorkflow({
  message,
  history = [],
  cookie = "",
  config = {},
  onStream,
  signal,
  harnessRuntime,
  sessionId,
}) {
  const text = (message || "").trim();
  if (!text) {
    if (onStream) {
      onStream({
        type: "text",
        data: "请问有什么可以协助您的？您可以发送 1001Tracklists 现场链接、排一套 DJ Set、或咨询调性过渡建议。",
      });
    }
    return;
  }

  if (!hasLlmKey(config) && shouldRouteToHarnessCrate(text)) {
    onStream?.({
      type: "text",
      data: "排 Set 需要先在「模型配置」中填写 API Key。系统不会在未检索曲库的情况下编造歌单。",
    });
    return { type: "needs_api_key" };
  }

  if (hasLlmKey(config) && typeof harnessRuntime?.run === "function") {
    onStream?.({ type: "status", data: "已交给 DeepSeek Harness，由模型选择工具..." });
    try {
      return await harnessRuntime.run({ message: text, history, sessionId, config, cookie, signal, onStream });
    } catch (harnessError) {
      console.warn("[Harness Copilot]:", harnessError.message);
      onStream?.({
        type: "text",
        data: `Harness 暂不可用：${harnessError.message}\n不会回退到编造歌单。请稍后重试，或粘贴已有曲目文本。`,
      });
      return { type: "harness_unavailable", error: harnessError.message };
    }
  }

  const preRouted = preRouteAgentIntent(text);
  let selectedSkillName = preRouted?.skill || "general_dj_chat";
  let extractedParams = preRouted?.parameters || { query: text };
  let thought = preRouted?.thought || "";

  if (!preRouted) {
    if (!hasLlmKey(config)) {
      onStream?.({
        type: "text",
        data: "当前未配置模型 API Key。调性分析可直接发送如「8A 接什么调」；现场还原请粘贴 1001Tracklists 链接或曲目文本。",
      });
      return { type: "needs_api_key" };
    }

    if (onStream) {
      onStream({ type: "status", data: "正在分析意图并匹配 Skill..." });
    }

    try {
      const decisionRes = await chatCompletion({
        messages: [
          { role: "system", content: defaultSkillRegistry.getLightweightCatalogPrompt() },
          ...history.slice(-4),
          { role: "user", content: text },
        ],
        config: { ...config, temperature: 0.1 },
        jsonMode: true,
        timeoutMs: 25000,
        signal,
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
      onStream?.({
        type: "text",
        data: `意图识别失败：${err.message}。请改用更明确的指令，例如粘贴 Setlist、询问 8A 接歌，或配置可用的 API Key。`,
      });
      return { type: "router_failed", error: err.message };
    }
  }

  const targetSkill = defaultSkillRegistry.get(selectedSkillName) || defaultSkillRegistry.get("general_dj_chat");
  const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (onStream) {
    if (selectedSkillName !== "general_dj_chat") {
      onStream({
        type: "tool_start",
        data: {
          id: toolCallId,
          tool: targetSkill.name,
          name: targetSkill.displayName,
          params: extractedParams,
          thought,
        },
      });
    } else if (thought) {
      onStream({
        type: "status",
        data: `⚡ [${targetSkill.displayName}] ${thought}`,
      });
    }
  }

  // --- Stage 2: 渐进式加载与执行该 Skill 的专属逻辑与详细 Prompt ---
  const context = {
    rawMessage: text,
    history,
    cookie,
    config,
    toolCallId,
    onStream,
    signal,
  };

  try {
    const result = await targetSkill.execute(extractedParams, context);
    if (selectedSkillName !== "general_dj_chat" && onStream) {
      onStream({
        type: "tool_result",
        data: {
          id: toolCallId,
          tool: targetSkill.name,
          status: "success",
          summary: `执行完成 (${targetSkill.displayName})`,
        },
      });
    }
    return result;
  } catch (skillErr) {
    if (selectedSkillName !== "general_dj_chat" && onStream) {
      onStream({
        type: "tool_result",
        data: {
          id: toolCallId,
          tool: targetSkill.name,
          status: "error",
          summary: `执行异常: ${skillErr.message}`,
        },
      });
    }
    throw skillErr;
  }
}
