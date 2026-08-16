/**
 * Apple Music RSS 榜单数据源 (免鉴权, 已验证可用)
 * 端点: https://rss.marketingtools.apple.com/api/v2/{country}/music/most-played/{n}/songs.json
 * 提供全球/地区热播榜 (非流派细分, 作为补充源)。
 * 注意: 该榜以流行/乡村为主, 因此只保留电子乐相关流派条目, 避免污染电子乐雷达。
 */

const ELECTRONIC_GENRE_RE =
  /\b(dance|electronic|edm|house|techno|trance|dubstep|drum|bass|garage|progressive|club|remix|hardstyle|electro)\b/i;

export async function fetchAppleTracks(country = "us", limit = 50, options = {}) {
  try {
    const url = `https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/${limit}/songs.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!res.ok) return [];

    const json = await res.json();
    const entries = json?.feed?.results || [];
    const tracks = entries
      .map((t, idx) => {
        const genreNames = (t.genres || [])
          .map((g) => (typeof g === "string" ? g : g.name))
          .filter(Boolean)
          .join(", ");
        return {
          artist: (t.artistName || "").trim(),
          title: (t.name || "").trim(),
          version: "",
          label: (t.recordLabel || "").trim(),
          bpm: null,
          key: "",
          releaseDate: t.releaseDate || "",
          url: t.url || "",
          coverUrl: t.artworkUrl100 || t.artworkUrl60 || "",
          genre: genreNames,
          rank: idx + 1,
        };
      })
      // 只保留电子乐相关流派条目
      .filter((t) => t.artist && t.title && ELECTRONIC_GENRE_RE.test(t.genre || ""));

    return tracks;
  } catch {
    return [];
  }
}
