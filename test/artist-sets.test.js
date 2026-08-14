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
});
