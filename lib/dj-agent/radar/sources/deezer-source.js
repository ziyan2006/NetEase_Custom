/**
 * Deezer 榜单数据源 (免鉴权, 已验证可用)
 *
 * 数据通道 (按流派细分度):
 * - chart/113 (Dance 分类榜): 通用电子音乐热榜, 数据质量最佳
 * - radio/36891 (Deep House): tech_house / melodic_techno 等 House 系
 * - radio/648 (EDM): mainstage_edm
 * 曲目字段: artist / title / bpm / release_date / cover / rank (无调性信息)
 */

// 流派 → Deezer 数据通道
const DEEZER_CHANNELS = {
  tech_house: { type: "radio", id: 36891, label: "Deezer Deep House 电台" },
  melodic_techno: { type: "radio", id: 36891, label: "Deezer Deep House 电台" },
  afro_house: { type: "chart", id: 113, label: "Deezer Dance 全球榜" },
  bass_house_ukg: { type: "chart", id: 113, label: "Deezer Dance 全球榜" },
  drum_and_bass: { type: "chart", id: 113, label: "Deezer Dance 全球榜" },
  mainstage_edm: { type: "radio", id: 648, label: "Deezer EDM 电台" },
  peak_time_techno: { type: "chart", id: 113, label: "Deezer Dance 全球榜" },
  trance: { type: "chart", id: 113, label: "Deezer Dance 全球榜" },
  progressive_house: { type: "radio", id: 36891, label: "Deezer Deep House 电台" },
};

const DEFAULT_CHANNEL = { type: "chart", id: 113, label: "Deezer Dance 全球榜" };

/**
 * 抓取指定流派热榜 (Deezer 通道)
 * @param {string} genreKey - 规范化流派 key (如 "tech_house")
 * @returns {Promise<{ tracks: Array<object>, label: string }>}
 */
export async function fetchDeezerTracks(genreKey = "", options = {}) {
  const channel = DEEZER_CHANNELS[genreKey] || DEFAULT_CHANNEL;

  try {
    const base = channel.type === "radio"
      ? `https://api.deezer.com/radio/${channel.id}/tracks`
      : `https://api.deezer.com/chart/${channel.id}`;
    const res = await fetch(`${base}?limit=50`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { tracks: [], label: channel.label };

    const json = await res.json();
    const rawTracks = json?.tracks?.data || json?.data || [];
    const tracks = rawTracks
      .map((t, idx) => ({
        artist: t.artist?.name || "",
        title: t.title || "",
        version: "",
        label: "",
        bpm: t.bpm || null,
        key: "",
        releaseDate: t.release_date || "",
        url: t.link || "",
        coverUrl: t.album?.cover_medium || t.album?.cover || "",
        genre: genreKey || "",
        rank: idx + 1,
      }))
      .filter((t) => t.artist && t.title);

    return { tracks, label: channel.label };
  } catch {
    return { tracks: [], label: channel.label };
  }
}
