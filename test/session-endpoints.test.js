/**
 * 会话管理 API 端点测试
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAppServer } from "../server.js";

test("Server: Session API 全链路", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "session-api-"));
  process.env.SESSION_DB_PATH = path.join(dir, "test.db");

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(() => {
    server.close();
    delete process.env.SESSION_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // 1. 空列表
  const emptyRes = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(emptyRes.status, 200);
  assert.deepEqual((await emptyRes.json()).sessions, []);

  // 2. 创建会话
  const createRes = await fetch(`${baseUrl}/api/sessions`, { method: "POST" });
  assert.equal(createRes.status, 200);
  const { session } = await createRes.json();
  assert.ok(session.id);
  assert.equal(session.title, "新对话");

  // 3. 列表包含新会话
  const listRes = await fetch(`${baseUrl}/api/sessions`);
  const { sessions } = await listRes.json();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, session.id);
  assert.equal(sessions[0].messageCount, 0);

  // 4. 详情 (空消息)
  const detailRes = await fetch(`${baseUrl}/api/sessions/${session.id}`);
  assert.equal(detailRes.status, 200);
  const detail = await detailRes.json();
  assert.equal(detail.session.id, session.id);
  assert.deepEqual(detail.messages, []);

  // 5. 重命名
  const renameRes = await fetch(`${baseUrl}/api/sessions/${session.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "周日排歌" }),
  });
  assert.equal(renameRes.status, 200);
  assert.equal((await renameRes.json()).session.title, "周日排歌");

  // 6. 不存在的会话 → 404
  assert.equal((await fetch(`${baseUrl}/api/sessions/not-exist`)).status, 404);
  const nfPatch = await fetch(`${baseUrl}/api/sessions/not-exist`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "x" }),
  });
  assert.equal(nfPatch.status, 404);

  // 7. 删除
  const delRes = await fetch(`${baseUrl}/api/sessions/${session.id}`, { method: "DELETE" });
  assert.equal(delRes.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/sessions`)).status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/sessions`)).json()).sessions, []);
  assert.equal((await fetch(`${baseUrl}/api/sessions/${session.id}`, { method: "DELETE" })).status, 404);
});
