import { fetchReal1001Tracklist } from "../lib/dj-agent/real-1001tl-scraper.js";
import { matchSingleTrack, scoreCandidateSong } from "../lib/dj-agent/track-matcher.js";
import { fetchNetEaseApi } from "../lib/netease-api.js";

async function diagnose() {
  const targetUrl = "https://www.1001tracklists.com/tracklist/16tp2fxk/dimension-dnb-allstars-360-2026-07-16.html";
  console.log("=== 正在抓取现场曲目 ===");
  const scraped = await fetchReal1001Tracklist(targetUrl, { filterUnreleased: true });

  console.log(`总有效曲目: ${scraped.tracks.length}\n`);

  const failedTracks = [];

  for (let i = 0; i < scraped.tracks.length; i++) {
    const track = scraped.tracks[i];
    const matchRes = await matchSingleTrack(track);
    if (!matchRes.matched) {
      failedTracks.push({
        index: i + 1,
        track,
        matchRes,
      });
    }
  }

  console.log(`\n=================== 共 ${failedTracks.length} 首未匹配曲目深度诊断 ===================\n`);

  for (const item of failedTracks) {
    const { index, track, matchRes } = item;
    console.log(`-------------------------------------------------------------------`);
    console.log(`【#${index}】原始现场曲目: "${track.raw}"`);
    console.log(`  - 歌手: "${track.artist}" | 歌名: "${track.title}" | Remix: "${track.remix}"`);
    console.log(`  - 默认搜索词: "${track.searchQuery}"`);
    console.log(`  - 匹配失败判定: ${matchRes.reason}`);

    // 直接向网易云请求 3 种维度的搜索词探测
    const queryVariants = [
      track.searchQuery,
      `${track.artist} ${track.title.replace(/\([^)]*\)/g, "")}`.trim(),
      track.title.replace(/\([^)]*\)/g, "").trim(),
    ];

    let allCandidates = [];
    for (const q of queryVariants) {
      try {
        const res = await fetchNetEaseApi("/cloudsearch/pc", {
          params: { s: q, type: 1, limit: 5, offset: 0 },
        });
        const songs = res?.result?.songs || [];
        for (const s of songs) {
          if (!allCandidates.some(c => c.id === s.id)) {
            allCandidates.push({
              ...s,
              artists: s.ar || s.artists || [],
              album: s.al || s.album || {},
            });
          }
        }
      } catch (err) {
        // ignore
      }
    }

    if (allCandidates.length === 0) {
      console.log(`  🔍 网易云曲库状态: 【完全无任何搜索结果】（该曲目/版本未在网易云上架）`);
    } else {
      console.log(`  🔍 网易云搜索返回候选 (前 ${Math.min(3, allCandidates.length)} 首):`);
      allCandidates.slice(0, 3).forEach((cand, cIdx) => {
        const score = scoreCandidateSong(track, cand);
        const artStr = (cand.artists || []).map(a => a.name).join(" & ");
        console.log(`     [候选 ${cIdx + 1}] ID:${cand.id} | "${artStr} - ${cand.name}" | 综合评分: ${score}`);
      });

      // 归纳未能匹配的具体原因
      const topCand = allCandidates[0];
      const topScore = scoreCandidateSong(track, topCand);
      if (track.remix || track.title.toLowerCase().includes("remix") || track.title.toLowerCase().includes("vip") || track.title.toLowerCase().includes("edit")) {
        console.log(`  📌 深度归因: 【DJ 专属 Bootleg / VIP / 未官方发行 Remix】`);
        console.log(`     (现场为专属混音版本，网易云仅有原版或其他非官方版本，置信度校验严格拦截保真)`);
      } else if (topScore === 0) {
        console.log(`  📌 深度归因: 【网易云曲库无同名曲目，仅返回不相关歌手】`);
      } else {
        console.log(`  📌 深度归因: 【版权/相似度不足】(最高分 ${topScore} < 60)`);
      }
    }
  }
}

diagnose().catch(console.error);
