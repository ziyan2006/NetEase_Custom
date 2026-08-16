/**
 * Spotify 榜单数据源 (官方 Web API, 需 client_credentials)
 * 配置: 环境变量 SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
 * 未配置时返回空 (由调用方降级)。
 * 端点: GET /recommendations?seed_genres=...&limit=50
 */

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  if (tokenCache.token && tokenCache.expiresAt > Date.now() + 60000) {
    return tokenCache.token;
  }

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    tokenCache = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
    };
    return tokenCache.token;
  } catch {
    return null;
  }
}

/**
 * 抓取指定流派推荐曲目
 * @param {Array<string>} seedGenres - Spotify 种子流派 (如 ["techhouse"])
 * @param {object} [options]
 * @returns {Promise<Array<object>>}
 */
export async function fetchSpotifyTracks(seedGenres = [], options = {}) {
  const seeds = (seedGenres || []).filter(Boolean);
  if (seeds.length === 0) return [];

  const token = await getAccessToken();
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      seed_genres: seeds.slice(0, 2).join(","),
      limit: "50",
      market: "US",
    });
    const res = await fetch(`https://api.spotify.com/v1/recommendations?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const tracks = (json?.tracks || []).map((t, idx) => ({
      artist: (t.artists || []).map((a) => a.name).join(" & "),
      title: t.name || "",
      version: t.album?.album_type === "single" ? "" : "Album Version",
      label: "",
      bpm: t.audio_features ? null : null, // 推荐接口不含 bpm
      key: "",
      releaseDate: t.album?.release_date || "",
      url: t.external_urls?.spotify || "",
      coverUrl: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || "",
      genre: seeds[0] || "",
      rank: idx + 1,
    }));
    return tracks.filter((t) => t.artist && t.title);
  } catch {
    return [];
  }
}
