/**
 * SessionStore (SQLite 会话存储) 单元测试
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionStore } from "../lib/session-store.js";

function createTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-store-"));
  const store = new SessionStore(path.join(dir, "test.db"));
  return { store, dir };
}

test("SessionStore: 会话 CRUD", () => {
  const { store, dir } = createTempStore();
  try {
    const session = store.createSession();
    assert.ok(session.id.startsWith("sess_"));
    assert.equal(session.title, "新对话");
    assert.ok(session.createdAt > 0);

    // 读取
    assert.ok(store.getSession(session.id));
    assert.equal(store.getSession("not-exist"), null);

    // 重命名
    assert.ok(store.renameSession(session.id, "我的会话"));
    assert.equal(store.getSession(session.id).title, "我的会话");
    assert.equal(store.renameSession(session.id, "   "), false); // 空白标题拒绝
    assert.equal(store.renameSession("not-exist", "x"), false);

    // 列表
    const list = store.listSessions();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, session.id);
    assert.equal(list[0].messageCount, 0);

    // 删除
    assert.ok(store.deleteSession(session.id));
    assert.equal(store.getSession(session.id), null);
    assert.equal(store.deleteSession(session.id), false); // 重复删除
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStore: 消息追加/读取 + 首条消息自动标题", () => {
  const { store, dir } = createTempStore();
  try {
    const session = store.createSession();

    // 用户消息 → 自动生成标题 (前 20 字)
    const userMsg = store.appendMessage(session.id, {
      role: "user",
      content: "帮我推荐本周 Melodic Techno 热单",
    });
    assert.ok(userMsg.id.startsWith("msg_"));
    assert.equal(store.getSession(session.id).title, "帮我推荐本周 Melodic Techn");

    // 助手消息 → 完整对象 (含卡片与工具事件 JSON 字段)
    const card = { title: "测试卡片", tracks: [{ id: 1, name: "A", previewUrl: "" }] };
    const asstMsg = store.appendMessage(session.id, {
      role: "assistant",
      content: "推荐如下:",
      reasoning: "深度思考...",
      cardData: card,
      toolEvents: [
        { type: "tool_start", data: { id: "c1", tool: "genre_trend_radar", name: "热单雷达" } },
        { type: "tool_result", data: { id: "c1", tool: "genre_trend_radar", status: "success" } },
      ],
    });
    assert.ok(asstMsg.id);

    // 读取: 时间正序, JSON 字段正确还原
    const messages = store.getMessages(session.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[1].cardData.tracks[0].name, "A");
    assert.equal(messages[1].toolEvents.length, 2);
    assert.equal(messages[1].toolEvents[0].type, "tool_start");

    // 列表中的消息计数与 updated_at 刷新
    const list = store.listSessions();
    assert.equal(list[0].messageCount, 2);
    assert.ok(list[0].updatedAt >= session.createdAt);

    // 已有标题的会话不再被覆盖
    store.appendMessage(session.id, { role: "user", content: "继续问" });
    assert.equal(store.getSession(session.id).title, "帮我推荐本周 Melodic Techn");
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStore: 删除会话级联删除消息", () => {
  const { store, dir } = createTempStore();
  try {
    const session = store.createSession();
    store.appendMessage(session.id, { role: "user", content: "hi" });
    store.appendMessage(session.id, { role: "assistant", content: "hello" });
    assert.equal(store.getMessages(session.id).length, 2);

    store.deleteSession(session.id);
    assert.equal(store.getMessages(session.id).length, 0);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SessionStore: 多会话隔离", async () => {
  const { store, dir } = createTempStore();
  try {
    const s1 = store.createSession();
    store.appendMessage(s1.id, { role: "user", content: "A" });
    await new Promise((resolve) => setTimeout(resolve, 5)); // 保证 updated_at 可区分
    const s2 = store.createSession();
    store.appendMessage(s2.id, { role: "user", content: "B" });

    assert.equal(store.getMessages(s1.id).length, 1);
    assert.equal(store.getMessages(s2.id).length, 1);
    assert.equal(store.getMessages(s1.id)[0].content, "A");

    const list = store.listSessions();
    assert.equal(list.length, 2);
    // 最近更新的排前面
    assert.equal(list[0].id, s2.id);
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
