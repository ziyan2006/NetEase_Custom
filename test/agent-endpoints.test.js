import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../server.js";

test("Server: Agent Endpoints", async (t) => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  t.after(() => {
    server.close();
  });

  // 1. GET /api/agent/trend-genres
  const genresRes = await fetch(`${baseUrl}/api/agent/trend-genres`);
  assert.equal(genresRes.status, 200);
  const genresData = await genresRes.json();
  assert.ok(Array.isArray(genresData.genres));
  assert.ok(genresData.genres.length >= 5);

  // 2. POST /api/agent/camelot
  const camelotRes = await fetch(`${baseUrl}/api/agent/camelot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "8A" }),
  });
  assert.equal(camelotRes.status, 200);
  const camelotData = await camelotRes.json();
  assert.equal(camelotData.key, "8A");
  assert.equal(camelotData.compatible.length, 6);

  // 3. POST /api/agent/camelot (Transition analysis)
  const transRes = await fetch(`${baseUrl}/api/agent/camelot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromKey: "8A", fromBpm: 126, toKey: "9A", toBpm: 128 }),
  });
  assert.equal(transRes.status, 200);
  const transData = await transRes.json();
  assert.equal(transData.from.key, "8A");
  assert.equal(transData.to.key, "9A");
  assert.ok(transData.totalScore >= 90);
});
