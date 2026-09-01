/**
 * Normalization helpers for the restricted DeepSeek Harness music bridge.
 */

const maxSearchLimit = 20;

export function parseHarnessTrackSearchRequest(params = {}) {
  const query = String(params.query || "").trim();
  if (!query) throw new Error("缺少检索关键词");

  const requestedLimit = Number(params.limit ?? 10);
  const limit = Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 10;
  if (limit < 1 || limit > maxSearchLimit) {
    throw new Error("检索数量必须在 1 到 " + maxSearchLimit + " 首之间");
  }

  return { query, limit };
}

export function mapHarnessTrackSearchResults(query, songs = []) {
  const tracks = songs
    .filter((song) => song && song.id && song.name)
    .map((song) => ({
      id: song.id,
      title: song.name,
      artist: (song.ar || song.artists || []).map((artist) => artist?.name).filter(Boolean).join(" / "),
      album: song.al?.name || song.album?.name || "",
      durationMs: Number(song.dt || song.duration || 0),
      neteaseUrl: "https://music.163.com/#/song?id=" + song.id,
      verification: "catalog_match_only",
    }));

  return {
    query,
    tracks,
    verificationNotice: "结果仅表示网易云曲库检索命中，不替代曲目页面或发行页面的逐曲核验。",
  };
}
