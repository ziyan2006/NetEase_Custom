import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getCached1001CookieHeader,
  saveCached1001Cookies,
  import1001tlCookies,
  isChallengeHtml,
  htmlHasRealTracklistLinks,
  parseCookieHeader,
  probe1001CookieHealth,
  get1001tlStatus,
  buildSetup1001tlCard,
} from "../lib/dj-agent/tl-session.js";
import {
  fetchReal1001Tracklist,
  searchReal1001Tracklists,
} from "../lib/dj-agent/real-1001tl-scraper.js";
import { searchArtistRecentSets, fetchAndParse1001TracklistUrl } from "../lib/dj-agent/tracklist-parser.js";
import { searchSkill } from "../lib/dj-agent/skills/search-skill.js";
import { scraperSkill } from "../lib/dj-agent/skills/scraper-skill.js";
import { createAppServer } from "../server.js";

const originalFetch = globalThis.fetch;
const originalSkip = process.env.YESMUSIC_SKIP_REAL_SCRAPER;
const originalAllow = process.env.YESMUSIC_ALLOW_PUPPETEER;
const originalCookiePath = process.env.YESMUSIC_1001TL_COOKIE_PATH;

function tempCookiePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tl-session-"));
  const file = path.join(dir, "cookies.json");
  process.env.YESMUSIC_1001TL_COOKIE_PATH = file;
  delete process.env.YESMUSIC_ALLOW_PUPPETEER;
  delete process.env.YESMUSIC_SKIP_REAL_SCRAPER;
  return { dir, file };
}

function restoreEnv() {
  globalThis.fetch = originalFetch;
  if (originalSkip === undefined) delete process.env.YESMUSIC_SKIP_REAL_SCRAPER;
  else process.env.YESMUSIC_SKIP_REAL_SCRAPER = originalSkip;
  if (originalAllow === undefined) delete process.env.YESMUSIC_ALLOW_PUPPETEER;
  else process.env.YESMUSIC_ALLOW_PUPPETEER = originalAllow;
  if (originalCookiePath === undefined) delete process.env.YESMUSIC_1001TL_COOKIE_PATH;
  else process.env.YESMUSIC_1001TL_COOKIE_PATH = originalCookiePath;
}

afterEach(() => {
  restoreEnv();
});

const DJ_HTML = `
  <html><body>
    <div class="bItm action oItm" onclick="window.open('/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html', '_self');">
      <img alt="Culture Shock @ EDC Las Vegas 2026-05-15 Artwork">
    </div>
  </body></html>
`;

test("tl-session: cookie roundtrip and header join", () => {
  tempCookiePath();
  saveCached1001Cookies([
    { name: "guid", value: "abc123" },
    { name: "cf_clearance", value: "tok", httpOnly: true, expirationDate: 2000000000 },
  ]);
  assert.equal(getCached1001CookieHeader(), "guid=abc123; cf_clearance=tok");
  const parsed = parseCookieHeader("guid=zzz; cf_clearance=one");
  assert.equal(parsed[0].name, "guid");
  assert.equal(parsed[1].value, "one");
  import1001tlCookies({ cookieHeader: "guid=from-header" });
  assert.equal(getCached1001CookieHeader(), "guid=from-header");
});

test("tl-session: challenge and real tracklist html detection", () => {
  assert.equal(isChallengeHtml("Please wait, you will be forwarded"), true);
  assert.equal(isChallengeHtml('<div id="challenge-running"></div>'), true);
  assert.equal(isChallengeHtml("<title>Just a moment...</title><p>cloudflare</p>"), true);
  assert.equal(isChallengeHtml(`Turnstile ${"x".repeat(100)}`), true);
  assert.equal(isChallengeHtml(DJ_HTML), false);
  assert.equal(htmlHasRealTracklistLinks(DJ_HTML), true);
  assert.equal(htmlHasRealTracklistLinks("/tracklist/dynamic/fake.html"), false);
});

test("tl-session: probe missing / challenge / ok without leaking cookie values", async () => {
  tempCookiePath();
  let missing = await probe1001CookieHealth();
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "missing");

  saveCached1001Cookies([{ name: "guid", value: "secret-value" }]);
  globalThis.fetch = async () => new Response("Please wait, you will be forwarded", { status: 200 });
  const challenged = await probe1001CookieHealth();
  assert.equal(challenged.ok, false);
  assert.equal(challenged.reason, "challenge");

  globalThis.fetch = async (url) => {
    assert.match(String(url), /1001tracklists\.com/);
    return new Response(DJ_HTML, { status: 200 });
  };
  const ok = await probe1001CookieHealth();
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, "ok");

  const status = await get1001tlStatus({ probe: false });
  assert.equal(status.ready, true);
  assert.equal(status.hasGuid, true);
  assert.deepEqual(status.cookieNames, ["guid"]);
  assert.equal(JSON.stringify(status).includes("secret-value"), false);
});

test("scraper: no cookie and puppeteer off returns needs_verify without fetch", async () => {
  tempCookiePath();
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  };

  const search = await searchReal1001Tracklists("Culture Shock");
  assert.equal(search.source, "needs_verify");
  assert.equal(search.sets.length, 0);
  assert.equal(fetchCalled, false);

  const page = await fetchReal1001Tracklist(
    "https://www.1001tracklists.com/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html"
  );
  assert.equal(page.source, "needs_verify");
  assert.equal(page.tracks.length, 0);
  assert.equal(fetchCalled, false);
});

test("scraper: cookie HTTP DJ page returns real sets", async () => {
  tempCookiePath();
  saveCached1001Cookies([{ name: "guid", value: "abc" }]);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/dj\/cultureshock\/index\.html/);
    return new Response(DJ_HTML, { status: 200 });
  };
  const search = await searchReal1001Tracklists("Culture Shock");
  assert.equal(search.source, "1001tracklists_cookie_http");
  assert.equal(search.sets.length, 1);
  assert.match(search.sets[0].url, /\/tracklist\/bv5flt1\//);
});

test("scraper: challenge HTML marks stale and returns needs_verify", async () => {
  tempCookiePath();
  saveCached1001Cookies([{ name: "guid", value: "abc" }]);
  globalThis.fetch = async () => new Response("Please wait, you will be forwarded", { status: 200 });
  const search = await searchReal1001Tracklists("Culture Shock");
  assert.equal(search.source, "needs_verify");
  const status = await get1001tlStatus({ probe: false });
  assert.equal(status.reason, "challenge");
  assert.equal(status.ready, false);
});

test("parser/skills: needs_verify is passed through as setup card, not invented sets", async () => {
  tempCookiePath();
  const parsed = await fetchAndParse1001TracklistUrl(
    "https://www.1001tracklists.com/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html"
  );
  assert.equal(parsed.source, "needs_verify");

  const recent = await searchArtistRecentSets("Culture Shock");
  assert.equal(recent.source, "needs_verify");
  assert.equal(recent.sets.length, 0);

  const events = [];
  const searchRes = await searchSkill.execute({ artist: "Culture Shock" }, {
    onStream: (evt) => events.push(evt),
  });
  assert.equal(searchRes.searchResult.source, "needs_verify");
  assert.equal(searchRes.card.sourceType, "setup_1001tl");
  assert.ok(events.some((evt) => evt.type === "card" && evt.data.sourceType === "setup_1001tl"));
  assert.equal(JSON.stringify(searchRes).includes("/tracklist/dynamic/"), false);

  const scrapeEvents = [];
  const scrapeRes = await scraperSkill.execute(
    { url: "https://www.1001tracklists.com/tracklist/bv5flt1/culture-shock-basspod-edc-las-vegas-united-states-2026-05-15.html" },
    { onStream: (evt) => scrapeEvents.push(evt) }
  );
  assert.equal(scrapeRes.type, "needs_verify");
  assert.equal(scrapeRes.card.sourceType, "setup_1001tl");
  assert.equal(buildSetup1001tlCard().sourceType, "setup_1001tl");
});

test("API: 1001tl status and cookie import do not echo cookie values", async () => {
  const { file } = tempCookiePath();
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("1001tracklists.com")) {
      return new Response(DJ_HTML, { status: 200 });
    }
    return originalFetch(url, options);
  };

  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const empty = await fetch(`${base}/api/agent/1001tl/status?probe=0`);
    assert.equal(empty.status, 200);
    const emptyData = await empty.json();
    assert.equal(emptyData.ready, false);
    assert.equal(emptyData.reason, "missing");

    const saved = await fetch(`${base}/api/agent/1001tl/cookies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookieHeader: "guid=super-secret; cf_clearance=tok" }),
    });
    assert.equal(saved.status, 200);
    const savedData = await saved.json();
    assert.equal(savedData.ready, true);
    assert.equal(JSON.stringify(savedData).includes("super-secret"), false);
    assert.equal(fs.existsSync(file), true);
    assert.ok(fs.readFileSync(file, "utf-8").includes("super-secret"));

    const bad = await fetch(`${base}/api/agent/1001tl/cookies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(bad.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
