import { fetchNetEaseApi } from "../lib/netease-api.js";
import { scoreCandidateSong } from "../lib/dj-agent/track-matcher.js";

async function testTrack(rawTitle, artist, title, remix) {
  console.log(`\n=================== 测试: "${artist} - ${title}" ===================`);
  // 1. 如果 title 包含括号内的完整信息（如 "X-Ray (Metrik Remix)"），构建最精确的搜索词
  const cleanParentheses = title.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const queries = [
    `${artist} ${cleanParentheses}`.trim(),
    `${artist} ${title.replace(/\([^)]*\)/g, "")}`.trim(),
  ];

  for (const q of queries) {
    console.log(`-> 搜索: "${q}"`);
    const res = await fetchNetEaseApi("/cloudsearch/pc", {
      params: { s: q, type: 1, limit: 10, offset: 0 },
    });
    const songs = res?.result?.songs || [];
    songs.slice(0, 3).forEach((s, idx) => {
      const art = (s.ar || s.artists || []).map(a => a.name).join(" & ");
      const cand = {
        id: s.id,
        name: s.name,
        artists: s.ar || s.artists || [],
        album: s.al || s.album || {},
      };
      const score = scoreCandidateSong({ artist, title, remix }, cand);
      console.log(`   [#${idx + 1}] [${score}分] ID:${s.id} | ${art} - ${s.name}`);
    });
  }
}

async function main() {
  await testTrack("Sub Focus - X-Ray (Metrik Remix)", "Sub Focus", "X-Ray (Metrik Remix)", "Metrik Remix");
  await testTrack("Morgan Seatree & Florence + The Machine - Say My Name (Sub Focus Remix)", "Morgan Seatree & Florence + The Machine", "Say My Name (Sub Focus Remix)", "Sub Focus Remix");
  await testTrack("Dean Turnley - Actin' Tough (Sub Focus Remix)", "Dean Turnley", "Actin' Tough (Sub Focus Remix)", "Sub Focus Remix");
  await testTrack("Culture Shock - Empire (VIP)", "Culture Shock", "Empire (VIP)", "VIP");
}

main().catch(console.error);
