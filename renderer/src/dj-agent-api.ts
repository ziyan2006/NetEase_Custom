export type AgentSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
};

export type AgentMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string;
  cardData: Record<string, unknown> | null;
  toolEvents: AgentEvent[];
  createdAt: number;
};

export type AgentEvent = {
  type?: string;
  data?: unknown;
  [key: string]: unknown;
};

export class DjAgentApiError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
    this.name = "DjAgentApiError";
  }
}

type AgentConfig = {
  baseUrl: string;
  model: string;
  thinkingEffort: string;
  temperature: number;
  apiKey?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", headers: { Accept: "application/json", ...init.headers } });
  const payload = asRecord(await response.json().catch(() => null));
  if (!response.ok) throw new DjAgentApiError(String(payload.message || `Agent 请求失败（HTTP ${response.status}）`), response.status);
  return payload as T;
}

export class AgentSseParser {
  private buffer = "";
  constructor(private readonly onEvent: (event: AgentEvent) => void) {}
  push(chunk: string) {
    this.buffer += chunk;
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      this.parse(frame);
    }
  }
  finish() {
    if (this.buffer.trim()) this.parse(this.buffer);
    this.buffer = "";
  }
  private parse(frame: string) {
    const data = frame.split(/\r\n|\n|\r/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return;
    let value: unknown;
    try { value = JSON.parse(data); }
    catch { throw new DjAgentApiError("Agent 返回了无法解析的实时事件。", 502); }
    if (value && typeof value === "object" && !Array.isArray(value)) this.onEvent(value as AgentEvent);
  }
}

export const djAgentApi = {
  async listSessions(): Promise<AgentSession[]> {
    const result = await jsonRequest<{ sessions?: AgentSession[] }>("/api/sessions");
    return Array.isArray(result.sessions) ? result.sessions : [];
  },
  async createSession(title?: string): Promise<AgentSession> {
    const result = await jsonRequest<{ session?: AgentSession }>("/api/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(title ? { title } : {}),
    });
    if (!result.session?.id) throw new DjAgentApiError("服务端没有返回新会话信息。", 502);
    return result.session;
  },
  async getSession(id: string): Promise<{ session: AgentSession; messages: AgentMessage[] }> {
    const result = await jsonRequest<{ session?: AgentSession; messages?: AgentMessage[] }>(`/api/sessions/${encodeURIComponent(id)}`);
    if (!result.session?.id) throw new DjAgentApiError("服务端没有返回会话详情。", 502);
    return { session: result.session, messages: Array.isArray(result.messages) ? result.messages : [] };
  },
  async renameSession(id: string, title: string): Promise<AgentSession> {
    const result = await jsonRequest<{ session?: AgentSession }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
    });
    if (!result.session?.id) throw new DjAgentApiError("服务端没有返回重命名后的会话。", 502);
    return result.session;
  },
  async deleteSession(id: string): Promise<void> {
    await jsonRequest(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async tracklistStatus(): Promise<{ ready: boolean; reason?: string }> {
    const result = await jsonRequest<{ ready?: boolean; reason?: string }>("/api/agent/1001tl/status");
    return { ready: Boolean(result.ready), reason: result.reason };
  },
  async sendMessage(input: { sessionId: string; message: string; cookie: string; config: AgentConfig }, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
    const response = await fetch("/api/agent/chat", {
      method: "POST",
      headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
      credentials: "same-origin",
    });
    if (!response.ok) {
      const payload = asRecord(await response.json().catch(() => null));
      throw new DjAgentApiError(String(payload.message || `Agent 请求失败（HTTP ${response.status}）`), response.status);
    }
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
      throw new DjAgentApiError("Agent 服务没有返回实时对话流。", 502);
    }
    if (!response.body) throw new DjAgentApiError("Agent 服务没有提供实时对话流。", 502);
    let receivedDone = false;
    const parser = new AgentSseParser(event => {
      if (event.type === "done") receivedDone = true;
      onEvent(event);
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.finish();
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    }
    if (!receivedDone) throw new DjAgentApiError("Agent 连接结束，但没有收到完成事件。", 502);
  },
};
