process.env.YESMUSIC_SKIP_REAL_SCRAPER = "1";
import test from "node:test";
import assert from "node:assert/strict";
import { searchArtistRecentSets } from "../lib/dj-agent/tracklist-parser.js";
import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";

test("Artist Sets Search: Retrieves recent sets for known DJ (e.g. Culture Shock)", async () => {
  const result = await searchArtistRecentSets("Culture Shock");
  assert.equal(result.artist, "Culture Shock");
  assert.ok(Array.isArray(result.sets));
  assert.ok(result.sets.length >= 2, "Should return at least 2 candidate sets");

  const firstSet = result.sets[0];
  assert.ok(firstSet.title.toLowerCase().includes("culture shock"));
  assert.ok(firstSet.url.includes("1001tracklists.com"));
  assert.ok(firstSet.trackCount > 0);
});

test("Artist Sets Search: General query generates valid candidate sets", async () => {
  const result = await searchArtistRecentSets("Fisher");
  assert.equal(result.artist, "Fisher");
  assert.ok(Array.isArray(result.sets));
  assert.ok(result.sets.length >= 1);
});

test("Agent Dispatcher: Intent recognition for '帮我看看culture shock最近的演出'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (!urlStr.includes("api.deepseek.com") && !urlStr.includes("/chat/completions")) {
      return originalFetch(url, options);
    }
    const decision = { skill: "live_set_search", parameters: { artist: "Culture Shock" }, thought: "检索现场" };
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: JSON.stringify(decision) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const events = [];
    const res = await dispatchAgentWorkflow({
      message: "帮我看看culture shock最近的演出",
      onStream: (evt) => events.push(evt),
    });

    assert.equal(res?.type, "artist_sets");
    assert.ok(res?.card);
    assert.equal(res.card.sourceType, "artist_sets_selector");
    assert.equal(res.card.artist, "Culture Shock");
    assert.ok(res.card.sets.length >= 2);

    // Check emitted SSE events
    const cardEvt = events.find((e) => e.type === "card");
    assert.ok(cardEvt);
    assert.equal(cardEvt.data.sourceType, "artist_sets_selector");
    assert.ok(events.some((e) => e.type === "text" && e.data.includes("Culture Shock")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
