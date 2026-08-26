---
name: netease-music-api
description: Use when integrating, calling, debugging, or extending NetEase Cloud Music (网易云音乐) REST APIs, handling QR code login authentication, managing user playlists, searching songs, extracting 320kbps MP3 audio URLs, or bypassing Alibaba CDN 403 Forbidden errors.
---

# NetEase Cloud Music API Reference & Integration Guide

## Overview

NetEase Cloud Music (网易云音乐) exposes RESTful endpoints under `https://music.163.com/api`. When integrated from custom applications or agents, three critical architectural constraints must be adhered to:

1. **PC Client Identity Injection**: Standard web requests lack PC headers, causing Alibaba CDN nodes (`m801.music.126.net` / `m704.music.126.net`) to reject audio stream playback with `403 Forbidden` (`X-Auth-Msg: auth failed - origin failed`). Every request must carry the PC system identifier:
   `os=pc; appver=2.9.7.199895; osver=10.0.19041.1415; MUSIC_U=...`
2. **Global Rate Limiting**: Sending back-to-back requests without delays triggers account-level IP throttling (manifesting as `cloudsearch` returning empty arrays). A minimum interval of **120ms (~8 req/s)** between outbound calls is mandatory.
3. **Payload Sanitization**: Playlist names must not exceed **36 characters** and must have Markdown headers (`###`, `**`), emojis, and trailing tags stripped before sending to `/playlist/create`.

---

## When to Use

- Interacting with NetEase Cloud Music endpoints directly via HTTP `fetch` or Axios.
- Implementing QR code login authentication and extracting persistent `MUSIC_U` cookies.
- Creating, reading, updating, or deleting user playlists in cloud storage.
- Searching songs by artist and title in the cloud catalog.
- Extracting official 320kbps high-bitrate MP3 or FLAC streaming URLs via `/song/enhance/player/url/v1`.
- Troubleshooting `403 Forbidden` errors during audio download from NetEase CDN servers.

---

## Quick Reference Table

| Category | Endpoint | Method | Key Parameters / Body | Key Response Fields |
|---|---|---|---|---|
| **Auth** | `/login/qrcode/unikey` | `GET/POST` | `type=1`, `timestamp` | `unikey` |
| **Auth** | `/login/qrcode/client/login` | `POST` | `key={unikey}`, `type=1` | `code` (800/801/802/803), `cookie` |
| **User** | `/user/playlist` | `GET` | `uid={uid}`, `limit=100` | `playlist: [{ id, name, trackCount, coverImgUrl }]` |
| **Playlist** | `/playlist/create` | `POST` | `name` (≤36 chars), `privacy=0` | `playlist: { id, name, coverImgUrl }` |
| **Playlist** | `/playlist/delete` | `POST` | `id={playlistId}` | `id`, `code: 200` |
| **Playlist** | `/v6/playlist/detail` | `GET` | `id={playlistId}`, `n=1000` | `playlist.tracks: [{ id, name, ar, al, dt }]` |
| **Tracks** | `/playlist/manipulate/tracks` | `POST` | `op="add"\|"del"`, `pid`, `trackIds="[id]"` | `count`, `code: 200` |
| **Search** | `/cloudsearch/pc` | `POST` | `s={keywords}`, `type=1`, `limit=30` | `result.songs: [{ id, name, ar, al, dt }]` |
| **Audio** | `/song/enhance/player/url/v1` | `POST` | `ids="[id]"`, `level="exhigh"`, `encodeType="flac"` | `data: [{ id, url, br: 320000, size, type }]` |

---

## Core Authentication & CDN 403 Bypass Mechanism

### The 403 Forbidden Origin Issue

When requesting 320k audio streams via `/song/enhance/player/url/v1`, the API returns a temporary CDN URL containing an authentication token:
```text
http://m801.music.126.net/20260826.../019dabd57...mp3
```

When fetching this URL, Alibaba Tengine CDN nodes validate the `authSecret` generated during the API call. If the original API call lacked `os=pc`, the signature is marked as unverified origin, returning:
```http
HTTP/1.1 403 Forbidden
X-Auth-Msg: auth failed - origin failed
```

### The Universal Cookie Rule

Always append the PC client identity to every outbound API cookie string:
```javascript
function formatNetEaseCookie(cookie = "") {
  if (cookie && cookie.includes("os=")) {
    return cookie;
  }
  const pcIdentity = "os=pc; appver=2.9.7.199895; osver=10.0.19041.1415";
  return cookie ? `${cookie}; ${pcIdentity}` : pcIdentity;
}
```

---

## Implementation Patterns (Node.js / Modern JS)

### 1. Robust Universal Client Wrapper

```javascript
// lib/netease-api.js
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 120; // ~8 requests/sec to avoid IP rate-limiting

async function rateLimit() {
  const now = Date.now();
  const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - lastRequestTime));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();
}

/**
 * Universal NetEase API Request Dispatcher
 */
export async function fetchNetEaseApi(endpoint, options = {}) {
  const { method = "GET", params = {}, body = null, cookie = "", timeout = 5000 } = options;
  const baseUrl = "https://music.163.com/api";

  await rateLimit();

  const query = new URLSearchParams(params).toString();
  const url = `${baseUrl}${endpoint}${query ? "?" + query : ""}`;

  const formattedCookie = cookie
    ? (cookie.includes("os=") ? cookie : `${cookie}; os=pc; appver=2.9.7.199895; osver=10.0.19041.1415`)
    : "os=pc; appver=2.9.7.199895; osver=10.0.19041.1415";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://music.163.com/",
    "Cookie": formattedCookie,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === "POST" && body ? new URLSearchParams(body).toString() : null,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`NetEase API Request Failed (${response.status})`);
    }

    const resJson = await response.json();

    // Extract updated Set-Cookie headers if present (for QR login)
    let cookieStr = "";
    if (typeof response.headers.getSetCookie === "function") {
      const setCookies = response.headers.getSetCookie();
      if (setCookies && setCookies.length > 0) {
        cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
      }
    } else {
      const rawCookie = response.headers.get("set-cookie");
      if (rawCookie) cookieStr = rawCookie.split(";")[0];
    }

    if (cookieStr) resJson.cookie = cookieStr;
    return resJson;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
```

---

### 2. QR Code Login Flow

```javascript
// Step 1: Request Unikey
export async function getQrKey() {
  const data = await fetchNetEaseApi("/login/qrcode/unikey", {
    method: "POST",
    body: { type: 1, timestamp: Date.now() },
  });
  return data.unikey; // e.g. "9b12a84f-xxxx-xxxx"
}

// Step 2: Generate Client Scannable URL
export function getQrCodeUrl(key) {
  return `https://music.163.com/login?codekey=${encodeURIComponent(key)}`;
}

// Step 3: Poll Login Status
export async function checkQrStatus(key) {
  const data = await fetchNetEaseApi("/login/qrcode/client/login", {
    method: "POST",
    body: { key, type: 1, timestamp: Date.now() },
  });
  
  // Status Code Mapping:
  // 800: Expired
  // 801: Waiting for scan
  // 802: Scanned, waiting for authorization on mobile app
  // 803: Authorized successfully, returns data.cookie (contains MUSIC_U)
  return {
    code: data.code,
    message: data.message,
    cookie: data.cookie || "",
  };
}
```

---

### 3. Song Search & Confidence Scoring

When querying songs for DJ setlists or titles with remix tags, search using `/cloudsearch/pc` and apply token matching:

```javascript
export async function searchSong(keywords, cookie = "") {
  const data = await fetchNetEaseApi("/cloudsearch/pc", {
    method: "POST",
    body: {
      s: keywords,
      type: 1, // Single track mode
      limit: 30,
      offset: 0,
    },
    cookie,
  });

  const songs = data?.result?.songs || [];
  return songs.map((s) => ({
    id: s.id,
    name: s.name,
    artist: s.ar?.map((a) => a.name).join(" / ") || "Unknown",
    album: s.al?.name || "",
    coverUrl: s.al?.picUrl || "",
    durationMs: s.dt || 0,
  }));
}
```

---

### 4. Fetching 320kbps Audio URLs

```javascript
export async function getSong320kUrl(songId, cookie = "") {
  const data = await fetchNetEaseApi("/song/enhance/player/url/v1", {
    method: "POST",
    body: {
      ids: JSON.stringify([Number(songId)]),
      level: "exhigh", // 320kbps MP3
      encodeType: "flac",
    },
    cookie,
  });

  const songData = data?.data?.[0];
  if (!songData || !songData.url) {
    return { playable: false, url: null, br: 0 };
  }

  return {
    playable: true,
    url: songData.url,
    br: songData.br, // 320000
    size: songData.size,
    type: songData.type,
  };
}
```

---

### 5. Managing Cloud Playlists

```javascript
// Clean playlist title to fit NetEase 36-character constraint
export function sanitizePlaylistName(rawName) {
  if (!rawName || typeof rawName !== "string") return "DJ Setlist";
  let clean = rawName
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/^###\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/[\u{1F300}-\u{1FAD6}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.slice(0, 36).trim() || "DJ Setlist";
}

// Create Playlist
export async function createPlaylist(name, cookie) {
  const safeName = sanitizePlaylistName(name);
  const res = await fetchNetEaseApi("/playlist/create", {
    method: "POST",
    body: { name: safeName, privacy: 0 },
    cookie,
  });
  return res.playlist; // { id, name, coverImgUrl }
}

// Add Tracks to Playlist
export async function addTracksToPlaylist(playlistId, trackIds, cookie) {
  return await fetchNetEaseApi("/playlist/manipulate/tracks", {
    method: "POST",
    body: {
      op: "add",
      pid: String(playlistId),
      trackIds: JSON.stringify(trackIds.map(Number)),
    },
    cookie,
  });
}
```

---

## Common Pitfalls & Solutions

| Symptom | Cause | Solution |
|---|---|---|
| `403 Forbidden` on CDN audio download | Outbound API call omitted `os=pc` header | Always inject `os=pc; appver=2.9.7.199895; osver=10.0.19041.1415` into the Cookie string. |
| `cloudsearch` returns 0 results on repeated queries | Rate limit exceeded (>10 req/s) | Enforce `rateLimit()` with a minimum 120ms gap between requests. |
| `playlist/create` returns `400 Bad Request` | Playlist name > 36 characters or contains invalid emoji bytes | Run `sanitizePlaylistName()` before calling the creation API. |
| Cookie not updating after QR code scan | `response.headers.get("set-cookie")` only returned single string | Use `response.headers.getSetCookie()` (Node 18.14+) to extract full array of cookies. |
| `trackIds` rejected by `/manipulate/tracks` | Passed raw array instead of JSON string | Format parameter as `JSON.stringify(trackIds)` (e.g. `"[2067954366]"`). |
