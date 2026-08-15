import { fetchNetEaseApi } from "../lib/netease-api.js";
import { matchSingleTrack, scoreCandidateSong, stringSimilarity } from "../lib/dj-agent/track-matcher.js";

async function debugXRay() {
  const targetTrack = {
    trackNumber: 37,
    artist: "Sub Focus",
    title: "X-Ray (Metrik Remix)",
    remix: "Metrik Remix",
    searchQuery: "Sub Focus X-Ray Metrik Remix",
    raw: "Sub Focus - X-Ray (Metrik Remix)",
  };

  console.log("=== 1. 使用当前 matchSingleTrack 检索 ===");
  const matchRes = await matchSingleTrack(targetTrack);
  console.log("matchSingleTrack 结果:", JSON.stringify(matchRes, null, 2));

  console.log("\n=== 2. 多维度搜索词探测网易云实际返回 ===");
  const queries = [
    "Sub Focus X-Ray Metrik Remix",
    "Sub Focus X-Ray",
    "Sub Focus X Ray",
    "X-Ray Metrik Remix",
    "X-Ray Metrik",
    "X Ray Sub Focus",
    "Sub Focus Metrik X-Ray",
  ];

  for (const q of queries) {
    console.log(`\n--- 检索关键词: "${q}" ---`);
    try {
      const res = await fetchNetEaseApi("/cloudsearch/pc", {
        params: { s: q, type: 1, limit: 5, offset: 0 },
      });
      const songs = res?.result?.songs || [];
      if (songs.length === 0) {
        console.log("  [空结果]");
      } else {
        songs.forEach((s, idx) => {
          const art = (s.ar || s.artists || []).map(a => a.name).join(" & ");
          const normalizedCandidate = {
            id: s.id,
            name: s.name,
            artists: s.ar || s.artists || [],
            album: s.al || s.album || {},
          };
          const score = scoreCandidateSong(targetTrack, normalizedCandidate);
          console.log(`  [#${idx + 1}] ID:${s.id} | "${art} - ${s.name}" (专辑: ${s.al?.name || s.album?.name}) | 置信度得分: ${score}`);
        });
      }
    } catch (err) {
      console.error("  搜索报错:", err.message);
    }
  }
}

debugXRay().catch(console.error);
