/**
 * 测试其他无反爬的现场 Setlist 数据库与镜像源 (如 MixesDB, Archive 等)
 */

async function testAlternativeSources() {
  console.log('========================================================================');
  console.log('       多源现场曲目库 (MixesDB / Web Archive) 连通性测试');
  console.log('========================================================================\n');

  // 1. 测试 MixesDB (全球最大的开放式 DJ 现场音轨数据库，无 Cloudflare 强盾)
  try {
    console.log('▶ [源 1] 测试 MixesDB 开放式搜索 API: "Culture Shock Rampage"...');
    const searchUrl = `https://www.mixesdb.com/db/index.php?title=Special:Search&search=Culture+Shock+Rampage`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log(`   MixesDB HTTP 状态: ${res.status}`);
    const text = await res.text();
    const hasResults = text.includes('mw-search-results') || text.includes('Culture Shock');
    console.log(`   搜索结果发现: ${hasResults} (页面长度: ${text.length})`);
  } catch (err) {
    console.log(`   MixesDB 请求异常: ${err.message}`);
  }

  // 2. 测试 Wayback Machine 对 1001TL 历史快照
  try {
    console.log('\n▶ [源 2] 测试 Wayback Machine Archive API...');
    const targetUrl = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';
    const archiveApi = `https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(archiveApi);
    const data = await res.json();
    console.log('   Archive.org 结果:', data.archived_snapshots?.closest?.available ? `找到快照: ${data.archived_snapshots.closest.url}` : '无快照');
  } catch (err) {
    console.log(`   Archive.org 请求异常: ${err.message}`);
  }
}

testAlternativeSources();
