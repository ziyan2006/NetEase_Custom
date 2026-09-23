import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHarnessToolJson,
  artistSetsCardFromSearch,
  camelotCardFromEngine,
  eventsFromHarnessToolResult,
} from "../lib/dj-agent/harness-cards.js";
import { artistToDjSlugs } from "../lib/dj-agent/real-1001tl-scraper.js";
import { normalizeLiveSearchArtist, formatArtistDisplayName, isUnconfirmedArtistQuery, searchArtistRecentSets } from "../lib/dj-agent/tracklist-parser.js";
import { getCompatibleKeys } from "../lib/dj-agent/camelot-engine.js";
import { mapHarnessNotification } from "../lib/dj-agent/harness-runtime.js";

test("artist query: no per-artist whitelist; official spelling is not hardcoded", () => {
  assert.equal(normalizeLiveSearchArtist("帮我查一下chase and status最近的演出"), "chase and status");
  assert.equal(isUnconfirmedArtistQuery("帮我查一下chase and status最近的演出"), true);
  assert.equal(isUnconfirmedArtistQuery("Chase & Status"), false);
  assert.equal(isUnconfirmedArtistQuery("Chase&Status"), false);
  assert.equal(formatArtistDisplayName("Chase&Status"), "Chase&Status");
  const slugs = artistToDjSlugs("Chase&Status");
  assert.ok(slugs.includes("chasestatus"));
});

test("searchArtistRecentSets: rejects a full user sentence instead of guessing the artist", async () => {
  const result = await searchArtistRecentSets("帮我查一下chase and status最近的演出", { skipRealScraper: true });
  assert.equal(result.source, "needs_confirmation");
  assert.equal(result.sets.length, 0);
});

test("harness cards: 1001TL search payload becomes artist_sets_selector", () => {
  const mapped = artistSetsCardFromSearch({
    artist: "Chase & Status",
    source: "1001tracklists_cookie_http",
    sets: [{ title: "Rampage", url: "https://www.1001tracklists.com/tracklist/abc123/chase-status-rampage.html" }],
  });
  assert.equal(mapped.card.sourceType, "artist_sets_selector");
  assert.equal(mapped.card.sets.length, 1);
  assert.match(mapped.text, /Chase & Status/);
});

test("harness cards: needs_verify becomes setup_1001tl card", () => {
  const mapped = artistSetsCardFromSearch({ source: "needs_verify", artist: "FISHER", sets: [], error: "需要先验证" });
  assert.equal(mapped.card.sourceType, "setup_1001tl");
});

test("harness cards: needs_confirmation does not invent a setlist card", () => {
  const mapped = artistSetsCardFromSearch({ source: "needs_confirmation", artist: "查一下chase", sets: [], error: "请先确认" });
  assert.equal(mapped.card, null);
  assert.match(mapped.text, /确认/);
});

test("harness cards: camelot engine payload becomes camelot_analysis", () => {
  const mapped = camelotCardFromEngine({ key: "8A", compatible: getCompatibleKeys("8A") });
  assert.equal(mapped.card.sourceType, "camelot_analysis");
  assert.ok(mapped.card.compatible.some((item) => item.camelot === "9A"));
  assert.match(mapped.text, /8A/);
});

test("harness cards: tool JSON parser", () => {
  assert.equal(parseHarnessToolJson("not-json"), null);
  assert.deepEqual(parseHarnessToolJson('{"ready":false}'), { ready: false });
});

test("harness notification: DSH nested tool-result emits artist_sets card", async () => {
  const events = [];
  const state = { hasVisibleText: false, cardTasks: [], cookie: "", toolNames: { c1: "search_1001tl_sets" } };
  const payload = {
    artist: "Chase & Status",
    source: "1001tracklists_cookie_http",
    sets: [{ title: "Reading Festival", url: "https://www.1001tracklists.com/tracklist/abc123/chase-status-reading.html" }],
  };
  mapHarnessNotification({
    method: "session.event",
    params: {
      event: {
        type: "tool/result",
        data: {
          message: {
            source: { kind: "tool", callId: "c1" },
            content: [{
              type: "tool-result",
              toolCallId: "c1",
              content: [{ type: "text", text: JSON.stringify(payload) }],
            }],
          },
        },
      },
    },
  }, state, (evt) => events.push(evt));

  await Promise.all(state.cardTasks);
  const card = events.find((evt) => evt.type === "card")?.data;
  assert.equal(card?.sourceType, "artist_sets_selector");
  assert.equal(card.sets[0].url.includes("/tracklist/"), true);
  assert.equal(state.emittedCard, true);
});

test("harness cards: get_1001tl_status not ready emits setup card", async () => {
  const events = await eventsFromHarnessToolResult("get_1001tl_status", JSON.stringify({ ready: false, reason: "missing" }));
  assert.equal(events[0].data.sourceType, "setup_1001tl");
});
