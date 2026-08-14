import { describe, it } from "node:test";
import assert from "node:assert";
import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";
import { defaultSkillRegistry } from "../lib/dj-agent/skills/index.js";

describe("纯 LLM Skill 注册中心与渐进式调度测试", () => {
  it("SkillRegistry 应包含全部 5 个基础技能定义", () => {
    const skills = defaultSkillRegistry.getAll();
    assert.strictEqual(skills.length, 5);

    const names = skills.map((s) => s.name);
    assert.ok(names.includes("1001tl_setlist_scraper"));
    assert.ok(names.includes("live_set_search"));
    assert.ok(names.includes("camelot_harmonic_mixing"));
    assert.ok(names.includes("genre_trend_radar"));
    assert.ok(names.includes("general_dj_chat"));
  });

  it("轻量级 Catalog 提示词应格式规范且包含触发场景说明", () => {
    const prompt = defaultSkillRegistry.getLightweightCatalogPrompt();
    assert.ok(prompt.includes("1001tl_setlist_scraper"));
    assert.ok(prompt.includes("live_set_search"));
    assert.ok(prompt.includes("camelot_harmonic_mixing"));
    assert.ok(prompt.includes("genre_trend_radar"));
    assert.ok(prompt.includes("general_dj_chat"));
    assert.ok(prompt.includes("Skill Catalog"));
  });

  it("场景 1 (演出检索): 自然语言模糊询问应自主决策并调用 live_set_search", { timeout: 180000 }, async () => {
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
    console.log("   ✅ 成功自主激活 live_set_search 并下发候选现场卡片");
  });

  it("场景 2 (调性过渡): 调性咨询应自主决策并调用 camelot_harmonic_mixing", { timeout: 180000 }, async () => {
    let outputText = "";
    const result = await dispatchAgentWorkflow({
      message: "我现在在 8A 调性，想要一个顺时针升能量的接歌方案",
      onStream: (event) => {
        if (event.type === "text") outputText += event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "camelot_analysis");
    assert.ok(outputText.length > 30);
    console.log("   ✅ 成功自主激活 camelot_harmonic_mixing 并完成调性推导");
  });

  it("场景 3 (风格雷达): 风格热单咨询应自主决策并调用 genre_trend_radar", { timeout: 180000 }, async () => {
    let outputText = "";
    const result = await dispatchAgentWorkflow({
      message: "推荐几首本周最火的 Tech House 风格热单",
      onStream: (event) => {
        if (event.type === "text") outputText += event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "genre_radar");
    assert.ok(outputText.length > 30);
    console.log("   ✅ 成功自主激活 genre_trend_radar 并完成流派分析");
  });

  it("场景 4 (自由对话): 电子音乐文化与通用咨询应自主决策并调用 general_dj_chat", { timeout: 180000 }, async () => {
    let outputText = "";
    const result = await dispatchAgentWorkflow({
      message: "聊聊你对当代 Afterlife 风格视觉现场与未来电子音乐发展的看法",
      onStream: (event) => {
        if (event.type === "text") outputText += event.data;
      },
    });

    assert.ok(result);
    assert.strictEqual(result.type, "chat_completion");
    assert.ok(outputText.length > 30);
    console.log("   ✅ 成功自主激活 general_dj_chat 并输出专业总监见解");
  });
});
