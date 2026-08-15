/**
 * 通用 OpenAI 兼容大模型客户端 (Universal OpenAI-Compatible LLM Client)
 * 原生支持 DeepSeek (包含 reasoning_content 思考链)、OpenAI、通义千问、Ollama 等，提供 SSE 流式输出
 */

export const DEFAULT_LLM_CONFIG = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "sk-14d4fe9c926f48bda06a6ec402ff5072",
  model: "deepseek-v4-flash",
  thinkingEffort: "high", // 'off' | 'low' | 'medium' | 'high'
};

export const DJ_SYSTEM_PROMPT = `
你是一位世界顶级的专业电子音乐 DJ 与音乐制作人 AI 助手 (YesMusic DJ Copilot)。
你精通各大电子音乐流派 (Melodic Techno, Tech House, Afro House, Bass House, Drum & Bass, Trance, Progressive, Big Room, Hard Techno 等) 的风格特征、代表艺人与厂牌 (Afterlife, Defected, Keinemusik, STMPD, Experts Only, OWSLA, Drumcode 等)。
你熟练掌握 DJ Camelot 调性轮盘 (Camelot Harmonic Mixing Wheel)、BPM 容差过渡法则与 Setlist 能量流编排 (Warm-up -> Peak Time -> Cool Down)。

【严格禁止】：
- 严禁输出“作为 AI 我无法实时联网/抓取”、“我是一个 AI”、“抱歉我无法实时获取 Beatport 榜单”等机械式模板免责废话。你就是电子音乐领域顶级的 DJ 音乐总监，请直接以绝对自信、专业的口吻给出当前最火爆、最精准的行业选曲与见解。

【你的核心任务】：
1. 1001Tracklists 现场 Setlist 识别、解析与网易云歌单还原（自动剔除 ID 未发行曲目）。
2. 多流派风格热单挖掘与榜单趋势推荐。
3. 调性和谐过渡 (Camelot Key) 与 BPM 匹配建议。
4. 自然语言场景选曲（如“帮我排一张 126BPM 的 Melodic Techno 歌单”）。

【输出规范】：
- 语言专业、精炼、富有电子音乐审美与 DJ 行业术语。
- 当你为用户推荐或生成歌单/曲目列表时，请在正文中给出清晰的推荐理由，并在文末使用标准的 JSON 数据块输出歌曲清单（系统将自动提取该 JSON 并转为网易云 320k 试听卡片）：
\`\`\`json
[
  { "title": "曲目名", "artist": "艺人名", "version": "Extended Mix", "label": "厂牌名", "bpm": 126, "camelot": "8A" }
]
\`\`\`
- 严谨对待版本信息（清晰标注 Original Mix, Extended Mix, Club Mix 或指定 Remix）。
`.trim();

/**
 * 发送流式 Chat Completion 请求
 * @param {object} params
 * @param {Array<object>} params.messages - 对话历史数组 [{role: 'user', content: '...'}]
 * @param {object} [params.config] - { baseUrl, apiKey, model, temperature }
 * @param {Function} [params.onContent] - 正文内容流式回调 (chunk: string)
 * @param {Function} [params.onReasoning] - 思考过程流式回调 (chunk: string)
 * @param {Function} [params.onComplete] - 完成回调 ({ content: string, reasoning: string })
 * @param {Function} [params.onError] - 错误回调 (err)
 * @param {AbortSignal} [params.signal] - 中断信号
 */
export async function streamChatCompletion({
  messages,
  config = {},
  onContent,
  onReasoning,
  onComplete,
  onError,
  signal,
}) {
  const activeConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...config,
  };

  const rawBase = (activeConfig.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/chat/completions")
    ? rawBase
    : (rawBase.endsWith("/v1") ? `${rawBase}/chat/completions` : `${rawBase}/v1/chat/completions`);

  // 确保注入 DJ 专业 System Prompt
  const formattedMessages = [...messages];
  if (!formattedMessages.some((m) => m.role === "system")) {
    formattedMessages.unshift({ role: "system", content: DJ_SYSTEM_PROMPT });
  }

  // 模型完全遵从用户配置 (如 deepseek-v4-flash, deepseek-v4-pro 等)
  const selectedModel = activeConfig.model || "deepseek-v4-flash";
  const thinkingEffort = activeConfig.thinkingEffort || "high";

  const payload = {
    model: selectedModel,
    messages: formattedMessages,
    stream: true,
    temperature: activeConfig.temperature ?? 0.7,
  };

  // 思考强度 (Reasoning Effort) 独立配置，不篡改模型名称
  if (thinkingEffort && thinkingEffort !== "off") {
    payload.reasoning_effort = thinkingEffort; // 'low' | 'medium' | 'high'
    const budgetMap = { low: 2048, medium: 8192, high: 24576 };
    if (budgetMap[thinkingEffort]) {
      payload.thinking = {
        type: "enabled",
        budget_tokens: budgetMap[thinkingEffort],
      };
    }
  } else if (thinkingEffort === "off") {
    payload.thinking = { type: "disabled" };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!response.ok) {
      let errDetail = "";
      try {
        const errJson = await response.json();
        errDetail = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      throw new Error(`LLM 接口调用失败 (HTTP ${response.status}): ${errDetail}`);
    }

    let fullContent = "";
    let fullReasoning = "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    let isStreamDone = false;
    while (!isStreamDone) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") {
          isStreamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed?.choices?.[0]?.delta;
          if (delta) {
            // 处理 DeepSeek 的 reasoning_content 思考链
            if (delta.reasoning_content) {
              fullReasoning += delta.reasoning_content;
              if (onReasoning) onReasoning(delta.reasoning_content);
            }
            // 处理常规回复 content
            if (delta.content) {
              fullContent += delta.content;
              if (onContent) onContent(delta.content);
            }
          }
        } catch {
          // ignore chunk parse error
        }
      }

      if (isStreamDone) {
        try {
          await reader.cancel();
        } catch {
          // ignore
        }
        break;
      }
    }

    if (onComplete) {
      onComplete({ content: fullContent, reasoning: fullReasoning });
    }

    return { content: fullContent, reasoning: fullReasoning };
  } catch (err) {
    if (signal?.aborted) {
      return { content: "", reasoning: "", aborted: true };
    }
    if (onError) onError(err);
    throw err;
  }
}

/**
 * 非流式单次请求（用于意图识别或结构化解析）
 */
export async function chatCompletion({
  messages,
  config = {},
  jsonMode = false,
}) {
  const activeConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...config,
  };

  const rawBase = (activeConfig.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/chat/completions")
    ? rawBase
    : (rawBase.endsWith("/v1") ? `${rawBase}/chat/completions` : `${rawBase}/v1/chat/completions`);

  const formattedMessages = [...messages];
  if (!formattedMessages.some((m) => m.role === "system")) {
    formattedMessages.unshift({ role: "system", content: DJ_SYSTEM_PROMPT });
  }

  const payload = {
    model: activeConfig.model || "deepseek-v4-flash",
    messages: formattedMessages,
    stream: false,
    temperature: activeConfig.temperature ?? 0.3,
  };

  if (jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${activeConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      let errDetail = "";
      try {
        const errJson = await response.json();
        errDetail = errJson?.error?.message || JSON.stringify(errJson);
      } catch {
        errDetail = await response.text();
      }
      throw new Error(`LLM 接口调用失败 (HTTP ${response.status}): ${errDetail}`);
    }

    const data = await response.json();
    const choice = data?.choices?.[0]?.message;
    return {
      content: choice?.content || "",
      reasoning: choice?.reasoning_content || "",
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * 获取服务商可用的在线模型列表 (OpenAI 兼容 GET /models 规范)
 */
export async function listAvailableModels(config = {}) {
  const activeConfig = {
    ...DEFAULT_LLM_CONFIG,
    ...config,
  };

  const rawBase = (activeConfig.baseUrl || "https://api.deepseek.com").replace(/\/+$/, "");
  const endpoint = rawBase.endsWith("/models")
    ? rawBase
    : (rawBase.endsWith("/v1") ? `${rawBase}/models` : `${rawBase}/models`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    let response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${activeConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      // 尝试 /v1/models 重试
      const altEndpoint = `${rawBase}/v1/models`;
      if (endpoint !== altEndpoint) {
        response = await fetch(altEndpoint, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${activeConfig.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });
      }
    }

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`获取模型列表失败 (HTTP ${response.status}): ${errText}`);
    }

    const data = await response.json();
    const rawList = data.data || data.models || [];
    const models = rawList.map((m) => (typeof m === "string" ? m : m.id)).filter(Boolean);
    return models.length > 0 ? models : ["deepseek-v4-flash", "deepseek-v4-pro"];
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
