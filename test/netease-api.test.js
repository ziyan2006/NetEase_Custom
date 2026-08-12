import test from "node:test";
import assert from "node:assert/strict";
import { formatQrCodeUrl, parsePlaylistResponse } from "../lib/netease-api.js";

test("formatQrCodeUrl generates valid QR image data URL", () => {
  const qrUrl = formatQrCodeUrl("unikey123");
  assert.match(qrUrl, /^https:\/\/music.163.com\/login\?codekey=unikey123/);
});

test("parsePlaylistResponse correctly maps netease playlists", () => {
  const mockApiData = {
    code: 200,
    playlist: [
      { id: 1001, name: "House Hits", trackCount: 25, coverImgUrl: "http://cover.jpg" },
      { id: 1002, name: "Techno Set", trackCount: 12, coverImgUrl: "http://cover2.jpg" },
    ]
  };

  const parsed = parsePlaylistResponse(mockApiData);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed[0], {
    id: 1001,
    name: "House Hits",
    trackCount: 25,
    coverUrl: "http://cover.jpg"
  });
});
