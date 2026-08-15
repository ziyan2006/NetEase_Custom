import { searchReal1001Tracklists, fetchReal1001Tracklist } from "../lib/dj-agent/real-1001tl-scraper.js";
import { batchMatchTracklist } from "../lib/dj-agent/track-matcher.js";

async function run() {
  console.log("=== 正在通过 1001Tracklists 抓取 Dimension @ DnB Allstars 360° ===");
  const targetUrl = "https://www.1001tracklists.com/tracklist/16tp2fxk/dimension-dnb-allstars-360-2026-07-16.html";
  
  const scraped = await fetchReal1001Tracklist(targetUrl, { filterUnreleased: true });
  console.log(`\n演出标题: ${scraped.title}`);
  console.log(`抓取曲目总数: ${scraped.totalCount}`);
  console.log(`自动过滤未发行 ID 数量: ${scraped.filteredCount}`);
  console.log(`有效曲目数量: ${scraped.tracks.length}`);

  console.log("\n=== 正在运行网易云 320k 严格置信度匹配 ===");
  const matchResult = await batchMatchTracklist(scraped.tracks);

  console.log(`\n=================== 匹配结果汇总 ===================`);
  console.log(`总有效曲目: ${matchResult.summary.total}`);
  console.log(`成功匹配: ${matchResult.summary.matched} (${matchResult.summary.matchRate})`);
  console.log(`未收录/无版权过滤: ${matchResult.summary.failed}`);
  console.log(`====================================================\n`);

  matchResult.results.forEach((r, idx) => {
    if (r.matched && r.song) {
      console.log(`[✔ 匹配 #${idx + 1}] [原始] ${r.original.raw}`);
      console.log(`          -> [网易云 320k] [ID:${r.song.id}] ${r.song.artist} - ${r.song.name} (评分:${r.score})`);
    } else {
      console.log(`[✖ 过滤 #${idx + 1}] [原始] ${r.original.raw}`);
      console.log(`          -> 原因: ${r.reason}`);
    }
  });
}

run().catch(console.error);
