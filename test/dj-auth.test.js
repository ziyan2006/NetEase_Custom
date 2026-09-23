import assert from "node:assert/strict";
import test from "node:test";
import { cookieFromQrPayload, DjAuthAdapter, normalizeCookieInput } from "../renderer/src/dj-auth.js";

test("normalizes only MUSIC_U credentials and reads cookies actually returned by QR login", () => {
  assert.equal(normalizeCookieInput("  user-token  "), "MUSIC_U=user-token");
  assert.equal(normalizeCookieInput("MUSIC_U=token; __csrf=csrf"), "MUSIC_U=token; __csrf=csrf");
  assert.equal(normalizeCookieInput("__csrf=csrf"), "");
  assert.equal(cookieFromQrPayload({ unikey: "qr-key" }), "", "the QR key must never be fabricated into a login cookie");
  assert.equal(cookieFromQrPayload({ cookies: [{ name: "MUSIC_U", value: "token" }, { name: "__csrf", value: "csrf" }] }), "MUSIC_U=token; __csrf=csrf");
});

test("validates the stored account and clears credentials only for authentication failures", async () => {
  let cookie = "";
  const adapter = new DjAuthAdapter({
    getPlaylists: async () => ({ userId: "1001", playlists: [{ id: "1" }, { id: "2" }] }),
    getCookie: () => cookie,
    saveCookie: value => { cookie = value; },
    clearCookie: () => { cookie = ""; },
  });
  assert.deepEqual(await adapter.validate("secret-token"), { status: "authenticated", userId: "1001", playlistCount: 2 });
  assert.equal(cookie, "MUSIC_U=secret-token");

  const invalid = await adapter.validate("csrf=not-a-login-cookie");
  assert.equal(invalid.status, "invalid");
  assert.equal(cookie, "MUSIC_U=secret-token");

  const expired = new DjAuthAdapter({
    getPlaylists: async () => { throw Object.assign(new Error("expired"), { status: 401 }); },
    getCookie: () => cookie,
    saveCookie: value => { cookie = value; },
    clearCookie: () => { cookie = ""; },
  });
  await assert.rejects(expired.validate("MUSIC_U=expired"), /expired/);
  assert.equal(cookie, "", "an expired credential is removed");
});

test("logout invalidates an in-flight validation so it cannot restore a stale account", async () => {
  let cookie = "";
  let resolvePlaylists;
  const adapter = new DjAuthAdapter({
    getPlaylists: () => new Promise(resolve => { resolvePlaylists = resolve; }),
    getCookie: () => cookie,
    saveCookie: value => { cookie = value; },
    clearCookie: () => { cookie = ""; },
  });
  const pending = adapter.validate("MUSIC_U=old-account");
  adapter.logout();
  resolvePlaylists({ userId: "1001", playlists: [] });
  assert.deepEqual(await pending, { status: "superseded" });
  assert.equal(cookie, "");
});
