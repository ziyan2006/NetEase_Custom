/**
 * 流派映射表 (Genre Map)
 * 将用户输入/内置流派档案 ID 映射到各平台的标签、分类 ID 与搜索词。
 * 平台: Beatport / Deezer / Spotify / Last.fm
 */

// Beatport 流派 slug 与 ID (来自 beatport.com/genre/ 页面结构)
export const BEATPORT_GENRES = {
  "tech_house": { slug: "tech-house", id: 11 },
  "melodic_techno": { slug: "melodic-house-techno", id: 7 },
  "afro_house": { slug: "afro-house", id: 32 },
  "bass_house_ukg": { slug: "bass-house", id: 41 },
  "drum_and_bass": { slug: "drum-and-bass", id: 1 },
  "mainstage_edm": { slug: "big-room", id: 46 },
  "peak_time_techno": { slug: "hard-techno", id: 86 },
  "trance": { slug: "trance", id: 5 },
  "progressive_house": { slug: "progressive-house", id: 15 },
};

// Last.fm 标签 (tag.gettoptracks 使用)
export const LASTFM_TAGS = {
  "tech_house": "tech house",
  "melodic_techno": "melodic techno",
  "afro_house": "afro house",
  "bass_house_ukg": "bass house",
  "drum_and_bass": "drum and bass",
  "mainstage_edm": "big room",
  "peak_time_techno": "hard techno",
  "trance": "trance",
  "progressive_house": "progressive house",
};

// Deezer 流派名候选 (运行时按 /genre 接口匹配, 这里只是兜底名)
export const DEEZER_GENRE_NAMES = {
  "tech_house": ["Tech House"],
  "melodic_techno": ["Melodic House & Techno", "Techno"],
  "afro_house": ["Afro House"],
  "bass_house_ukg": ["Bass House", "House"],
  "drum_and_bass": ["Drum & Bass"],
  "mainstage_edm": ["Big Room", "Electro House"],
  "peak_time_techno": ["Hard Techno", "Techno"],
  "trance": ["Trance"],
  "progressive_house": ["Progressive House"],
};

// Spotify 推荐种子流派 (GET /recommendations seed_genres)
export const SPOTIFY_SEED_GENRES = {
  "tech_house": ["techhouse"],
  "melodic_techno": ["melodic techno", "techno"],
  "afro_house": ["afrohouse"],
  "bass_house_ukg": ["bass house", "uk garage"],
  "drum_and_bass": ["drum-and-bass"],
  "mainstage_edm": ["big room", "electro house"],
  "peak_time_techno": ["hard techno", "techno"],
  "trance": ["trance"],
  "progressive_house": ["progressive house"],
};

// 流派档案别名 → 规范 key (支持用户口语输入)
const GENRE_ALIASES = {
  "tech house": "tech_house",
  "techhouse": "tech_house",
  "melodic techno": "melodic_techno",
  "melodic house": "melodic_techno",
  "melodic house & techno": "melodic_techno",
  "melodic": "melodic_techno",
  "afro house": "afro_house",
  "afrohouse": "afro_house",
  "afro": "afro_house",
  "bass house": "bass_house_ukg",
  "basshouse": "bass_house_ukg",
  "uk garage": "bass_house_ukg",
  "ukg": "bass_house_ukg",
  "drum and bass": "drum_and_bass",
  "drum & bass": "drum_and_bass",
  "dnb": "drum_and_bass",
  "drum'n'bass": "drum_and_bass",
  "mainstage": "mainstage_edm",
  "big room": "mainstage_edm",
  "festival": "mainstage_edm",
  "edm": "mainstage_edm",
  "peak time": "peak_time_techno",
  "peak-time techno": "peak_time_techno",
  "hard techno": "peak_time_techno",
  "hardtechno": "peak_time_techno",
  "trance": "trance",
  "progressive house": "progressive_house",
  "progressive": "progressive_house",
};

/**
 * 规范化流派输入为内部 key (如 "tech_house")
 * @param {string} input - 用户输入或档案 ID
 * @returns {string|null}
 */
export function normalizeGenreKey(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  if (GENRE_ALIASES[raw]) return GENRE_ALIASES[raw];
  // 已经是内部 key 或 beatport slug
  const asKey = raw.replace(/[\s-]+/g, "_");
  if (GENRE_ALIASES[raw.replace(/\s+/g, " ")]) return GENRE_ALIASES[raw.replace(/\s+/g, " ")];
  if (Object.keys(BEATPORT_GENRES).includes(asKey)) return asKey;
  return null;
}

/**
 * 获取某流派的全平台参数
 * @param {string} genreKey - 规范化后的内部 key
 * @returns {object|null}
 */
export function getPlatformParams(genreKey) {
  if (!genreKey) return null;
  return {
    key: genreKey,
    beatport: BEATPORT_GENRES[genreKey] || null,
    lastfm: LASTFM_TAGS[genreKey] || null,
    deezerNames: DEEZER_GENRE_NAMES[genreKey] || [],
    spotifySeeds: SPOTIFY_SEED_GENRES[genreKey] || [],
  };
}

/**
 * 获取全部受支持流派概览
 */
export function getSupportedGenres() {
  return Object.keys(BEATPORT_GENRES).map((key) => ({
    key,
    beatport: BEATPORT_GENRES[key],
    lastfm: LASTFM_TAGS[key] || null,
  }));
}
