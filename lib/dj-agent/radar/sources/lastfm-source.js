/**
 * Last.fm 榜单数据源 (tag 周榜, 需免费 API Key)
 * 配置: 环境变量 LASTFM_API_KEY
 * 端点: tag.gettoptracks (weekly)
 */

export async function fetchLastfmTracks(tag = "", options = {}) {
  const apiKey = process.env.LASTFM_API_KEY || "";
  if (!apiKey || !tag) return [];

  try {
    const params = new URLSearchParams({
      method: "tag.gettoptracks",
      tag,
      api_key: apiKey,
      format: "json",
      limit: "50",
    });
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const tracks = (json?.tracks?.track || []).map((t, idx) => ({
      artist: t.artist?.name || "",
      title: t.name || "",
      version: "",
      label: "",
      bpm: null,
      key: "",
      releaseDate: "",
      url: t.url || "",
      coverUrl: (t.image || []).find((i) => i.size === "large")?.["#text"] || "",
      genre: tag || "",
      rank: idx + 1,
    }));
    return tracks.filter((t) => t.artist && t.title);
  } catch {
    return [];
  }
}
