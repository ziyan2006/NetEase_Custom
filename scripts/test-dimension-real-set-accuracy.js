import { searchReal1001Tracklists, fetchReal1001Tracklist } from "../lib/dj-agent/real-1001tl-scraper.js";
import { batchMatchTracklist } from "../lib/dj-agent/track-matcher.js";

async function main() {
  console.log("=== 1. 搜索 Dimension 现场列表 ===");
  const searchRes = await searchReal1001Tracklists("Dimension");
  console.log(`找到 ${searchRes.sets?.length || 0} 场现场:`);
  (searchRes.sets || []).forEach((s, idx) => {
    console.log(`  [${idx + 1}] ${s.title} (${s.date}) -> ${s.url}`);
  });

  const dnb360Set = (searchRes.sets || []).find(s => s.title.includes("DnB Allstars") || s.title.includes("360")) || searchRes.sets?.[0];
  if (!dnb360Set) {
    console.error("未找到对应现场！");
    return;
  }

  console.log(`\n=== 2. 抓取目标现场: ${dnb360Set.title} ===`);
  console.log(`URL: ${dnb360Set.url}`);

  const parsedSet = await fetchReal1001Tracklist(dnb360Set.url);
  console.log(`\n原始抓取总曲目数: ${parsedSet.totalCount}`);
  console.log(`未过滤/已过滤统计: 总数 ${parsedSet.tracks.length}, 过滤数: ${parsedSet.filteredCount}`);

  console.log("\n--- 逐曲检查 (原始抓取结果) ---");
  parsedSet.tracks.forEach((t, i) => {
    console.log(`#${i + 1} [Raw]: "${t.raw}" | [Artist]: "${t.artist}" | [Title]: "${t.title}" | [Query]: "${t.searchQuery}"`);
  });

  console.log("\n=== 3. 运行网易云 320k 匹配 ===");
  const matchRes = await batchMatchTracklist(parsedSet.tracks);
  console.log(`\n匹配结果总结: 成功 ${matchRes.summary.matchedCount} / ${matchRes.summary.total}`);

  console.log("\n--- 匹配详情分析 (找出异常/ID误匹配) ---");
  matchRes.results.forEach((r, i) => {
    if (r.matched && r.song) {
      console.log(`#${i + 1} [原始]: "${r.original.raw}" -> [匹配]: [ID: ${r.song.id}] "${r.song.artist} - ${r.song.name}" (${r.matchType})`);
    } else {
      console.log(`#${i + 1} [原始]: "${r.original.raw}" -> [未匹配]`);
    }
  });
}

main().catch(console.error);
