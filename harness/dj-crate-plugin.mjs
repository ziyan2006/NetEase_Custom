import { defineTool } from "@deepseek-ai/dsh-tools";

const defaultBridgeUrl = "http://127.0.0.1:4178";

function resolveBridgeUrl(pathname) {
  const url = new URL(process.env.YESMUSIC_AGENT_BRIDGE_URL || defaultBridgeUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("YESMUSIC_AGENT_BRIDGE_URL 只能指向本机服务");
  }
  return new URL(pathname, url).toString();
}

async function callBridge(pathname, payload, signal) {
  const response = await fetch(resolveBridgeUrl(pathname), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "本机音乐服务返回 HTTP " + response.status);
  return JSON.stringify(data);
}

export const name = "yesmusic-dj-crate-tools";
export const inject = ["tools"];

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "search_netease_tracks",
    description: "在本机网易云音乐目录中查找候选曲目。结果只代表曲库命中，不能视为外部发行页核验。",
    parameters: {
      query: { type: "string", required: true, description: "艺人、曲名、版本或风格相关的精确检索词" },
      limit: { type: "number", description: "返回曲目数，范围 1 到 20，默认 10" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/search-tracks", args, exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: "analyze_dj_transition",
    description: "计算两首已知 BPM 和调性的曲目之间的 Camelot 过渡建议；未知调性不应被补造。",
    parameters: {
      fromKey: { type: "string", required: true, description: "前一首曲目的标准调名或 Camelot 代码" },
      fromBpm: { type: "number", required: true, description: "前一首曲目的 BPM" },
      toKey: { type: "string", required: true, description: "后一首曲目的标准调名或 Camelot 代码" },
      toBpm: { type: "number", required: true, description: "后一首曲目的 BPM" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/analyze-transition", args, exec.signal);
    },
  }));
}
