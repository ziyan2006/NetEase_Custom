import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { batchMatchTracklist } from "./track-matcher.js";
import { eventsFromHarnessToolResult, extractHarnessToolOutput, playlistCardFromParsedSet } from "./harness-cards.js";

const setIntentPattern = /(排(?:一套|一张|一个|一首|歌|set)?|做(?:一套|一张|一个)?|帮我做|编排|选曲|推荐(?:一套|一张|一组|一份)(?:歌单|set|曲单)?|playlist|crate|dj\s*set|tracklist|(?:peak\s*time|高能量).{0,12}歌单)/i;
const excludedIntentPattern = /(1001tracklists|1001tl|tracklists\.net|camelot|调性|接歌)/i;

export function shouldRouteToHarnessCrate(message) {
  const text = String(message || "").trim();
  return Boolean(text) && setIntentPattern.test(text) && !excludedIntentPattern.test(text);
}

function getSdkRuntimePath() {
  const defaultPath = fileURLToPath(new URL("../../harness/sdk-runtime.mjs", import.meta.url));
  const unpackedPath = defaultPath.replace("app.asar", "app.asar.unpacked");
  if (existsSync(unpackedPath)) {
    return unpackedPath;
  }
  return defaultPath;
}

export function resolveHarnessNodeCommand() {
  if (!process.versions.electron) {
    return { command: process.execPath, runAsNode: false };
  }
  const candidates = [process.env.NODE_BINARY].filter(Boolean);
  if (process.platform === "win32") {
    candidates.push("C:\\Program Files\\nodejs\\node.exe");
  } else {
    candidates.push("/usr/bin/node", "/usr/local/bin/node");
  }
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return { command: candidate, runAsNode: false };
    }
  }
  try {
    const finder = process.platform === "win32" ? "where" : "which";
    const found = execFileSync(finder, ["node"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && existsSync(line));
    if (found) return { command: found, runAsNode: false };
  } catch {
    // fall through to Electron-as-Node
  }
  if (existsSync(process.execPath)) {
    return { command: process.execPath, runAsNode: true };
  }
  throw new Error("找不到可用的 Node.js，无法启动 DeepSeek Harness");
}

export function mapHarnessNotification(notification, state, onStream) {
  if (!notification || typeof notification !== "object") return;
  const params = notification.params || {};

  if (notification.method === "session.status") {
    if (params.status === "running") onStream?.({ type: "status", data: "Harness 正在检索曲目并编排过渡..." });
    return;
  }

  if (notification.method !== "session.event") return;
  const event = params.event;
  const data = event?.data || {};
  if (!event?.type) return;

  if (event.type === "assistant/chunk") {
    const chunk = data.chunk || {};
    if (chunk.type === "text-delta" && chunk.text) {
      state.hasVisibleText = true;
      onStream?.({ type: "text", data: chunk.text });
    } else if (chunk.type === "reasoning-delta" && chunk.text) {
      onStream?.({ type: "reasoning", data: chunk.text });
    }
    return;
  }

  if (event.type === "tool/call") {
    let paramsValue = {};
    try { paramsValue = JSON.parse(data.arguments || "{}"); } catch { /* keep raw call visible without trusting malformed JSON */ }
    if (state && data.callId && data.name) {
      state.toolNames = state.toolNames || {};
      state.toolNames[data.callId] = data.name;
    }
    onStream?.({
      type: "tool_start",
      data: { id: data.callId, tool: data.name, name: data.name, params: paramsValue },
    });
    return;
  }

  if (event.type === "tool/result") {
    const extracted = extractHarnessToolOutput(data);
    const toolName = extracted.name || state?.toolNames?.[extracted.callId] || "";
    onStream?.({
      type: "tool_result",
      data: {
        id: extracted.callId || data.message?.source?.callId,
        tool: toolName,
        name: toolName,
        status: extracted.isError ? "error" : "success",
        summary: extracted.text.slice(0, 500),
      },
    });
    if (state?.cardTasks && !extracted.isError) {
      state.cardTasks.push((async () => {
        const events = await eventsFromHarnessToolResult(toolName, extracted.text, {
          cookie: state.cookie || "",
          signal: state.signal,
        });
        for (const evt of events) {
          if (evt.type === "text") state.hasVisibleText = true;
          if (evt.type === "card") {
            state.emittedCard = true;
            state.lastCard = evt.data;
          }
          onStream?.(evt);
        }
      })());
    }
  }
}

function buildCopilotPrompt(message, history) {
  const prior = (history || [])
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .slice(-8)
    .map((item) => `${item.role === "user" ? "用户" : "助手"}: ${String(item.content || "")}`)
    .join("\n");
  return [
    "你是 YesMusic DJ Copilot。禁止编造现场、曲目、BPM 或调性。卡片由宿主根据工具 JSON 生成。",
    "任务匹配某个 skill 时，先调用 skill 工具加载正文，再按该 skill 的说明使用本机工具。",
    "可用 skill：search-live-sets、parse-setlist、camelot-mixing、plan-dj-crate、verify-1001tl。",
    prior ? `此前对话:\n${prior}` : "",
    `当前需求:\n${message}`,
  ].filter(Boolean).join("\n\n");
}

function extractTrackItems(text) {
  const match = /```json\s*([\s\S]*?)\s*```/.exec(text || "");
  if (!match) return [];
  try {
    const value = JSON.parse(match[1]);
    return Array.isArray(value) ? value.filter((item) => item && item.title) : [];
  } catch {
    return [];
  }
}

export class HarnessRuntime {
  #harness;
  #apiKey = "";
  #cacheKey = "";
  #sessions = new Set();

  async run({ message, history = [], sessionId, config = {}, cookie = "", signal, onStream }) {
    if (signal?.aborted) {
      throw new Error("操作已被用户中断");
    }

    const apiKey = String(config.apiKey || process.env.DEEPSEEK_API_KEY || "");
    if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，无法启动排 Set Harness");
    const model = config.model || "deepseek-v4-flash";
    const baseUrl = config.baseUrl || "https://api.deepseek.com";
    const cacheKey = `${apiKey}::${model}::${baseUrl}`;

    if (!this.#harness || this.#cacheKey !== cacheKey) {
      await this.close();
      this.#apiKey = apiKey;
      this.#cacheKey = cacheKey;
      const runtimeCwd = process.env.YESMUSIC_HARNESS_RUNTIME_DIR || process.env.DSH_HOME || process.cwd();
      if (!this._createHarness) {
        mkdirSync(runtimeCwd, { recursive: true });
      }
      const nodeLaunch = resolveHarnessNodeCommand();
      const launchEnv = {
        ...process.env,
        DEEPSEEK_API_KEY: apiKey,
        DSH_BUNDLED_SKILL_DIR: process.env.DSH_BUNDLED_SKILL_DIR
          || fileURLToPath(new URL("../../harness/skills", import.meta.url)),
        ...(config.baseUrl ? { DEEPSEEK_BASE_URL: config.baseUrl } : {}),
      };
      if (nodeLaunch.runAsNode) {
        launchEnv.ELECTRON_RUN_AS_NODE = "1";
      } else {
        delete launchEnv.ELECTRON_RUN_AS_NODE;
      }
      const harnessOptions = {
        launch: {
          command: nodeLaunch.command,
          args: [getSdkRuntimePath()],
          cwd: runtimeCwd,
          env: launchEnv,
          requestTimeoutMs: 300000,
        },
        cwd: runtimeCwd,
        provider: "deepseek-official",
        model,
        maxTokens: 8192,
      };
      this.#harness = this._createHarness ? this._createHarness(harnessOptions) : new DeepSeekHarness(harnessOptions);
    }

    const harnessSessionId = sessionId || `yesmusic-${randomUUID()}`;
    const state = {
      hasVisibleText: false,
      emittedCard: false,
      lastCard: null,
      cookie,
      signal,
      cardTasks: [],
      toolNames: {},
    };
    const result = await this.#harness.run(
      buildCopilotPrompt(message, this.#sessions.has(harnessSessionId) ? [] : history),
      {
        sessionId: harnessSessionId,
        onNotification: (notification) => mapHarnessNotification(notification, state, onStream),
      }
    );

    if (signal?.aborted) {
      throw new Error("操作已被用户中断");
    }

    if (state.cardTasks.length) {
      await Promise.all(state.cardTasks);
    }

    if (!result.finalResponse?.trim() && !state.hasVisibleText && !state.emittedCard) {
      throw new Error("Harness 未返回可用结果");
    }
    this.#sessions.add(harnessSessionId);

    if (!state.hasVisibleText && result.finalResponse) onStream?.({ type: "text", data: result.finalResponse });

    let cardPayload = state.lastCard;
    const items = extractTrackItems(result.finalResponse);
    if (items.length > 0) {
      const tracks = items.map((item, index) => ({
        trackNumber: index + 1,
        artist: item.artist || "",
        title: item.title || "",
        remix: item.version || "",
        searchQuery: `${item.artist || ""} ${item.title || ""} ${item.version || ""}`.trim(),
      }));
      const matchRes = await batchMatchTracklist(tracks, cookie, undefined, signal);
      const crateCard = playlistCardFromParsedSet({
        title: "🎧 Harness DJ Set 推荐",
        tracks,
        source: "harness_crate_plan",
        totalCount: tracks.length,
        filteredCount: 0,
      }, matchRes);
      crateCard.sourceType = "harness_crate_plan";
      crateCard.subtitle = `已通过本机网易云曲库匹配 ${crateCard.tracks.length} 首候选曲目。`;
      if (crateCard.tracks.length > 0) {
        cardPayload = crateCard;
        onStream?.({ type: "card", data: crateCard });
      }
    }

    return {
      type: items.length > 0 ? "harness_crate_plan" : "harness_turn",
      content: result.finalResponse || "",
      sessionId: result.sessionId,
      card: cardPayload,
    };
  }

  async close() {
    this.#sessions.clear();
    this.#cacheKey = "";
    if (this.#harness) {
      const harness = this.#harness;
      this.#harness = undefined;
      await harness.close().catch(() => {});
    }
  }
}
