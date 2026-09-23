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
    description: "在本机网易云曲库检索候选曲目。排 Set 前先加载 plan-dj-crate skill。结果只是曲库命中。",
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

  ctx.tools.register(defineTool({
    name: "search_1001tl_sets",
    description: "按官方艺名检索 1001Tracklists 现场列表。调用前先加载 search-live-sets skill。",
    parameters: {
      artist: { type: "string", required: true, description: "已确认的官方艺名" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/search-sets", args, exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: "parse_1001tl_setlist",
    description: "解析 1001Tracklists 链接或粘贴的曲目文本。调用前先加载 parse-setlist skill。",
    parameters: {
      url: { type: "string", description: "https://www.1001tracklists.com/tracklist/... 链接" },
      text: { type: "string", description: "多行现场曲目文本" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/parse-setlist", args, exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: "analyze_camelot",
    description: "本地 Camelot 引擎。调用前先加载 camelot-mixing skill。",
    parameters: {
      key: { type: "string", description: "起始调性，如 8A、Am、F#m" },
      query: { type: "string", description: "用户原话，用于从文本里提取调性" },
      toKey: { type: "string", description: "可选目标调性" },
      fromBpm: { type: "number", description: "可选起始 BPM" },
      toBpm: { type: "number", description: "可选目标 BPM" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/analyze-camelot", args, exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: "get_1001tl_status",
    description: "查看 1001Tracklists Cookie 快路径是否可用。调用前可加载 verify-1001tl skill。",
    parameters: {},
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      return callBridge("/api/agent/harness/1001tl-status", args || {}, exec.signal);
    },
  }));
}
