process.env.YESMUSIC_SKIP_REAL_SCRAPER = "1";
import test from "node:test";
import assert from "node:assert/strict";
import { searchArtistRecentSets } from "../lib/dj-agent/tracklist-parser.js";
import { parseArtistSetsFromDjHtml } from "../lib/dj-agent/real-1001tl-scraper.js";
import { dispatchAgentWorkflow } from "../lib/dj-agent/agent-dispatcher.js";

test("Artist Sets Search: DJ page HTML extracts real tracklist URLs", () => {
  const html = `
    <div class="bItm action oItm" onclick="window.open('/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html', '_self');">
      <img alt="Culture Shock @ EDC Las Vegas 2026-05-15 Artwork">
    </div>
    <div class="bItm" onclick="window.open('/tracklist/dynamic/fake-set.html', '_self');">
      <img alt="Fake Artwork">
    </div>
  `;
  const sets = parseArtistSetsFromDjHtml(html, "Culture Shock");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].url, "https://www.1001tracklists.com/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html");
  assert.match(sets[0].title, /Culture Shock/);
  assert.equal(sets[0].date, "2026-05-15");
});

test("Artist Sets Search: skipped scraper does not invent curated sets", async () => {
  const result = await searchArtistRecentSets("Culture Shock", { skipRealScraper: true });
  assert.equal(result.artist, "Culture Shock");
  assert.equal(result.source, "unavailable");
  assert.equal(result.sets.length, 0);
  assert.equal(JSON.stringify(result).includes("/tracklist/dynamic/"), false);
});

test("Artist Sets Search: unknown artist does not fall back to Track 01 templates", async () => {
  const result = await searchArtistRecentSets("Madeon", { skipRealScraper: true });
  assert.equal(result.source, "unavailable");
  assert.equal(result.sets.length, 0);
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
    assert.equal(res?.card, null);
    assert.equal(res.searchResult.source, "unavailable");
    assert.ok(events.some((e) => e.type === "text" && e.data.includes("Culture Shock")));
    assert.equal(events.some((e) => e.type === "card"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
