import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";
import { defaultSkillRegistry } from "../lib/dj-agent/skills/index.js";

describe("纯 LLM Skill 注册中心与渐进式调度测试", () => {
  let originalFetch;

  before(() => {
    process.env.YESMUSIC_SKIP_REAL_SCRAPER = "1";
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      const urlStr = String(url);
      if (!urlStr.includes("api.deepseek.com") && !urlStr.includes("/chat/completions")) {
        return originalFetch(url, options);
      }

      const body = JSON.parse(options.body || "{}");
      const isStream = Boolean(body.stream);
      const messages = body.messages || [];
      const userMsg = messages.find((m) => m.role === "user")?.content || "";
      const isSystemCatalog = messages.some((m) => (m.content || "").includes("Skill Catalog"));

      if (isSystemCatalog && !isStream) {
        let decision = { skill: "general_dj_chat", parameters: { query: userMsg }, thought: "通用对话" };
        if (userMsg.includes("Martin Garrix") || userMsg.includes("最近有什么代表性现场")) {
          decision = { skill: "live_set_search", parameters: { artist: "Martin Garrix" }, thought: "演出检索" };
        } else if (userMsg.includes("8A") || userMsg.includes("顺时针升能量")) {
          decision = { skill: "camelot_harmonic_mixing", parameters: { query: "8A" }, thought: "调性过渡推导" };
        }
        return new Response(JSON.stringify({
          choices: [{ message: { role: "assistant", content: JSON.stringify(decision) } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

      if (isStream) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"这里是专业的电子音乐与调性见解，涵盖了深度的技术细节与现场编排理论。"}}]}\n\n`));
            controller.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }

      return new Response(JSON.stringify({
        choices: [{ message: { role: "assistant", content: "OK" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });

  after(() => {
    globalThis.fetch = originalFetch;
    delete process.env.YESMUSIC_SKIP_REAL_SCRAPER;
  });

  it("SkillRegistry 应包含全部 4 个基础技能定义", () => {
    const skills = defaultSkillRegistry.getAll();
    assert.strictEqual(skills.length, 4);

    const names = skills.map((s) => s.name);
    assert.ok(names.includes("1001tl_setlist_scraper"));
    assert.ok(names.includes("live_set_search"));
    assert.ok(names.includes("camelot_harmonic_mixing"));
    assert.ok(names.includes("general_dj_chat"));
  });

  it("轻量级 Catalog 提示词应格式规范且包含触发场景说明", () => {
    const prompt = defaultSkillRegistry.getLightweightCatalogPrompt();
    assert.ok(prompt.includes("1001tl_setlist_scraper"));
    assert.ok(prompt.includes("live_set_search"));
    assert.ok(prompt.includes("camelot_harmonic_mixing"));
    assert.ok(prompt.includes("general_dj_chat"));
    assert.ok(prompt.includes("Skill Catalog"));
  });

  it("场景 1 (演出检索): 自然语言模糊询问应自主决策并调用 live_set_search", async () => {
    const statuses = [];
    let receivedCard = null;

    const result = await dispatchAgentWorkflow({
      message: "帮我看看 Martin Garrix 最近有什么代表性现场",
      onStream: (event) => {
        if (event.type === "status") statuses.push(event.data);
        if (event.type === "card") receivedCard = event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "artist_sets");
    assert.ok(receivedCard);
    assert.strictEqual(receivedCard.sourceType, "artist_sets_selector");
  });

  it("场景 2 (调性过渡): 调性咨询应自主决策并调用 camelot_harmonic_mixing", async () => {
    let outputText = "";
    const result = await dispatchAgentWorkflow({
      message: "我现在在 8A 调性，想要一个顺时针升能量的接歌方案",
      onStream: (event) => {
        if (event.type === "text") outputText += event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "camelot_analysis");
    assert.ok(outputText.length > 20);
  });

  it("场景 4 (自由对话): 电子音乐文化与通用咨询应自主决策并调用 general_dj_chat", async () => {
    let outputText = "";
    const result = await dispatchAgentWorkflow({
      message: "聊聊你对当代 Afterlife 风格视觉现场与未来电子音乐发展的看法",
      onStream: (event) => {
        if (event.type === "text") outputText += event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "chat_completion");
    assert.ok(outputText.length > 20);
  });
});
