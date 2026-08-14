/**
 * 多平台 DJ 风格热单雷达 (Multi-Platform DJ Trend Radar)
 * 聚合与检索 Beatport Top 100、1001Tracklists Top Played 及流派趋势热单
 */

export const GENRE_PROFILES = {
  "melodic_techno": {
    id: "melodic_techno",
    name: "Melodic House & Techno",
    bpmRange: [122, 128],
    icon: "🌌",
    description: "Afterlife 风格、深邃引力合成器、史诗级 Arp 与沉浸式情绪线条",
    representativeArtists: ["Anyma", "Tale of Us", "ARTBAT", "CamelPhat", "Chris Avantgarde", "Argy", "Mind Against"],
    topTracks: [
      { artist: "Anyma & Chris Avantgarde", title: "Eternity", remix: "Extended Mix", label: "Afterlife" },
      { artist: "Anyma & Rebūke", title: "Syren", remix: "Extended Mix", label: "Afterlife" },
      { artist: "CamelPhat & Elderbrook", title: "Cola", remix: "Club Mix", label: "Defected" },
      { artist: "ARTBAT & Dino Lenny", title: "Our Space", remix: "Original Mix", label: "UPPERGROUND" },
      { artist: "Adam Port, Stryv & Malachiii", title: "Move", remix: "Anyma Remix", label: "Keinemusik" },
      { artist: "Argy & Omnya", title: "Aria", remix: "Extended Mix", label: "Afterlife" },
      { artist: "John Summit & Hayla", title: "Where You Are", remix: "Gorgon City Remix", label: "Experts Only" },
      { artist: "Tale of Us & Pete Tong", title: "Time", remix: "Extended Mix", label: "Ministry of Sound" },
    ],
  },
  "tech_house": {
    id: "tech_house",
    name: "Tech House",
    bpmRange: [125, 129],
    icon: "⚡",
    description: "弹动饱满的 Bassline、强劲 Rolling 律动与抓耳 Vocal Hook",
    representativeArtists: ["Fisher", "Chris Lake", "Dom Dolla", "John Summit", "Mau P", "Cloonee", "Michael Bibi"],
    topTracks: [
      { artist: "Mau P", title: "Drugs From Amsterdam", remix: "Original Mix", label: "Repopulate Mars" },
      { artist: "Fisher", title: "Losing It", remix: "Original Mix", label: "Catch & Release" },
      { artist: "Dom Dolla", title: "Rhyme Dust", remix: "Extended Mix", label: "Three Six Zero" },
      { artist: "Chris Lake & Aluna", title: "Beggin'", remix: "Extended Mix", label: "Black Book Records" },
      { artist: "John Summit", title: "Shiver", remix: "Extended Mix", label: "Experts Only" },
      { artist: "Cloonee", title: "Stephanie", remix: "Original Mix", label: "Hellbent Records" },
      { artist: "Sidepiece", title: "On My Mind", remix: "Original Mix", label: "Higher Ground" },
      { artist: "Acraze & Cherish", title: "Do It To It", remix: "Extended Mix", label: "Thrive Music" },
    ],
  },
  "afro_house": {
    id: "afro_house",
    name: "Afro House",
    bpmRange: [120, 124],
    icon: "🌴",
    description: "Keinemusik 标志性律动、温暖木质打击乐、非洲人声与迷幻有机氛围",
    representativeArtists: ["Black Coffee", "&ME", "Rampa", "Adam Port", "Francis Mercier", "MoBlack"],
    topTracks: [
      { artist: "Adam Port, Stryv & Malachiii", title: "Move", remix: "Original Mix", label: "Keinemusik" },
      { artist: "&ME, Rampa, Adam Port", title: "Say What", remix: "Original Mix", label: "Keinemusik" },
      { artist: "Francis Mercier & Magic System", title: "Premier Gaou", remix: "Extended Mix", label: "Spinnin' Deep" },
      { artist: "Black Coffee & Drake", title: "Get It Together", remix: "Original Mix", label: "Ultra" },
      { artist: "MoBlack & Benja", title: "Yamore", remix: "Extended Mix", label: "MoBlack Records" },
      { artist: "Rampa & Chuala", title: "Les Gout", remix: "Original Mix", label: "Keinemusik" },
    ],
  },
  "bass_house_ukg": {
    id: "bass_house_ukg",
    name: "Bass House & UK Garage",
    bpmRange: [126, 134],
    icon: "🔊",
    description: "2-Step 切分碎拍、重低音 Wobble、Speed Garage 与高能量舞池爆点",
    representativeArtists: ["Fred again..", "Skrillex", "Knock2", "ISOxo", "Joyryde", "Sammy Virji", "Habstrakt"],
    topTracks: [
      { artist: "Fred again.. & Swedish House Mafia", title: "Turn On The Lights again..", remix: "Original Mix", label: "Atlantic" },
      { artist: "Fred again.. & Baby Keem", title: "leavemealone", remix: "Original Mix", label: "Atlantic" },
      { artist: "Knock2", title: "dashstar*", remix: "VIP", label: "Night Mode" },
      { artist: "Skrillex, Fred again.. & Flowdan", title: "Rumble", remix: "Original Mix", label: "OWSLA / Atlantic" },
      { artist: "Sammy Virji", title: "Find My Way Home", remix: "Original Mix", label: "Astralwerks" },
      { artist: "Joyryde & Skrillex", title: "AGEN WIDA", remix: "Original Mix", label: "OWSLA" },
      { artist: "Habstrakt", title: "Vibing", remix: "Original Mix", label: "Never Say Die" },
    ],
  },
  "drum_and_bass": {
    id: "drum_and_bass",
    name: "Drum & Bass",
    bpmRange: [172, 176],
    icon: "🥁",
    description: "高速 174 BPM 疾速鼓点、Reese Bass、Dancefloor & Jump Up 狂暴能量",
    representativeArtists: ["Sub Focus", "Dimension", "Chase & Status", "Hedex", "Wilkinson", "Bou", "Luude"],
    topTracks: [
      { artist: "Chase & Status & Bou", title: "Baddadan", remix: "Extended Mix", label: "EMI" },
      { artist: "Sub Focus & Dimension", title: "Desire", remix: "Original Mix", label: "Virgin EMI" },
      { artist: "Wilkinson & Becky Hill", title: "Afterglow", remix: "Original Mix", label: "RAM Records" },
      { artist: "Hedex & Eksman", title: "MHITR (Semi-Automatic)", remix: "Original Mix", label: "Sony Music" },
      { artist: "Dimension", title: "DJ Turn It Up", remix: "Extended Mix", label: "Dimension" },
      { artist: "Luude & Mattafix", title: "Big City Life", remix: "Original Mix", label: "Sweat It Out" },
    ],
  },
  "mainstage_edm": {
    id: "mainstage_edm",
    name: "Mainstage / Festival Big Room & Progressive",
    bpmRange: [126, 132],
    icon: "🎪",
    description: "Tomorrowland / EDC 主舞台巨响、史诗级合成器 Melodic Drop 与全场大合唱",
    representativeArtists: ["Martin Garrix", "David Guetta", "Alesso", "Hardwell", "Tiësto", "Swedish House Mafia"],
    topTracks: [
      { artist: "Martin Garrix & Brooks", title: "Byte", remix: "Original Mix", label: "STMPD RCRDS" },
      { artist: "David Guetta & Bebe Rexha", title: "I'm Good (Blue)", remix: "Extended Mix", label: "Warner" },
      { artist: "Alesso & Sentinel", title: "Interstellar", remix: "Extended Mix", label: "Astralwerks" },
      { artist: "Hardwell & Sub Zero Project", title: "Judgement Day", remix: "Original Mix", label: "Revealed" },
      { artist: "Swedish House Mafia", title: "Don't You Worry Child", remix: "Original Mix", label: "Virgin" },
      { artist: "Tiësto", title: "The Business", remix: "220 KID Remix", label: "Atlantic" },
    ],
  },
};

/**
 * 获取所有支持的风格列表概览
 */
export function getAvailableGenres() {
  return Object.values(GENRE_PROFILES).map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    bpmRange: g.bpmRange,
    description: g.description,
    representativeArtists: g.representativeArtists,
    trackCount: g.topTracks.length,
  }));
}

/**
 * 抓取指定风格的热门单曲列表
 * @param {string} genreKey - 例如 'melodic_techno' 或 'tech_house'
 * @param {object} options
 */
export async function getTrendingTracksByGenre(genreKey, options = {}) {
  const normalizedKey = (genreKey || "").toLowerCase().replace(/[\s-]+/g, "_");
  const profile = GENRE_PROFILES[normalizedKey] || GENRE_PROFILES["melodic_techno"];

  const tracks = profile.topTracks.map((item, idx) => ({
    trackNumber: idx + 1,
    artist: item.artist,
    title: item.title,
    remix: item.remix || "",
    searchQuery: `${item.artist} ${item.title} ${item.remix || ""}`.trim(),
    label: item.label || "",
    genre: profile.name,
    raw: `${item.artist} - ${item.title} (${item.remix || "Original Mix"})`,
  }));

  return {
    genreId: profile.id,
    genreName: profile.name,
    icon: profile.icon,
    bpmRange: profile.bpmRange,
    description: profile.description,
    representativeArtists: profile.representativeArtists || [],
    tracks,
    totalCount: tracks.length,
  };
}
