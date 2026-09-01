import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { batchMatchTracklist } from "./track-matcher.js";

const setIntentPattern = /(排(?:一套|一张|一个|一首|歌|set)?|编排|选曲|推荐(?:一套|一张|一组|一份)(?:歌单|set|曲单)?|playlist|crate|dj\s*set|tracklist)/i;
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
    onStream?.({
      type: "tool_start",
      data: { id: data.callId, tool: data.name, name: data.name, params: paramsValue },
    });
    return;
  }

  if (event.type === "tool/result") {
    const content = Array.isArray(data.message?.content) ? data.message.content : [];
    const text = content.filter((block) => block?.type === "text").map((block) => block.text).join("\n");
    onStream?.({
      type: "tool_result",
      data: { id: data.message?.source?.callId, tool: data.message?.source?.callId, status: data.error ? "error" : "success", summary: text.slice(0, 500) },
    });
  }
}

function buildCratePrompt(message, history) {
  const prior = (history || [])
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .slice(-8)
    .map((item) => `${item.role === "user" ? "用户" : "助手"}: ${String(item.content || "")}`)
    .join("\n");
  return [
    "你是 YesMusic 的 DJ crate digger，负责真实曲目发现和 DJ Set 编排。",
    "排 Set 时必须先使用 search_netease_tracks 检索候选曲目；只有检索命中的曲目才能进入最终推荐。",
    "已知 BPM 和调性时使用 analyze_dj_transition，不要臆造未知的 BPM、调性、厂牌或发行信息。",
    "按能量曲线、BPM 和 Camelot 兼容性解释顺序，最后输出一个 ```json 代码块，内容为数组，每项包含 title、artist、version、bpm、camelot。",
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
      const harnessOptions = {
        launch: {
          command: process.execPath,
          args: [getSdkRuntimePath()],
          cwd: process.env.YESMUSIC_HARNESS_RUNTIME_DIR || process.env.DSH_HOME || process.cwd(),
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1",
            DEEPSEEK_API_KEY: apiKey,
            ...(config.baseUrl ? { DEEPSEEK_BASE_URL: config.baseUrl } : {}),
          },
          requestTimeoutMs: 300000,
        },
        cwd: process.env.YESMUSIC_HARNESS_RUNTIME_DIR || process.env.DSH_HOME || process.cwd(),
        provider: "deepseek-official",
        model,
        maxTokens: 8192,
      };
      this.#harness = this._createHarness ? this._createHarness(harnessOptions) : new DeepSeekHarness(harnessOptions);
    }

    const abortHandler = () => {
      this.close().catch(() => {});
    };
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      const harnessSessionId = sessionId || `yesmusic-${randomUUID()}`;
      const state = { hasVisibleText: false };
      const result = await this.#harness.run(buildCratePrompt(message, this.#sessions.has(harnessSessionId) ? [] : history), {
        sessionId: harnessSessionId,
        onNotification: (notification) => mapHarnessNotification(notification, state, onStream),
      });

      if (signal?.aborted) {
        throw new Error("操作已被用户中断");
      }

      if (!result.finalResponse?.trim()) {
        throw new Error("Harness 未返回可用的排 Set 结果");
      }
      this.#sessions.add(harnessSessionId);

      if (!state.hasVisibleText && result.finalResponse) onStream?.({ type: "text", data: result.finalResponse });

      let cardPayload = null;
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
        const matchedSongs = matchRes.results.filter((item) => item.matched && item.song).map((item, index) => ({
          trackNumber: index + 1,
          id: item.song.id,
          name: item.song.name,
          artist: item.song.artist,
          album: item.song.album,
          coverUrl: item.song.coverUrl,
          durationMs: item.song.durationMs,
          previewUrl: item.song.previewUrl,
          playable320k: item.playable320k,
        }));
        if (matchedSongs.length > 0) {
          cardPayload = {
            title: "🎧 Harness DJ Set 推荐",
            subtitle: `已通过本机网易云曲库匹配 ${matchedSongs.length} 首候选曲目。`,
            sourceType: "harness_crate_plan",
            tracks: matchedSongs,
          };
          onStream?.({
            type: "card",
            data: cardPayload,
          });
        }
      }

      return {
        type: "harness_crate_plan",
        content: result.finalResponse,
        sessionId: result.sessionId,
        card: cardPayload,
      };
    } finally {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
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
