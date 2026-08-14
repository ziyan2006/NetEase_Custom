/**
 * 测试 1001Tracklists 艺人主页与搜索页直连抓取
 */

const DJ_URLS = [
  'https://www.1001tracklists.com/dj/cultureshock/index.html',
  'https://www.1001tracklists.com/dj/martingarrix/index.html',
  'https://www.1001tracklists.com/dj/anyma/index.html',
  'https://www.1001tracklists.com/dj/fisher/index.html',
  'https://www.1001tracklists.com/search/result.php?search=culture+shock',
];

async function testDjPages() {
  console.log('========================================================================');
  console.log('       1001Tracklists 艺人专页 (DJ Page) 直连抓取测试');
  console.log('========================================================================\n');

  for (const url of DJ_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      const text = await res.text();
      const isChallenge = text.includes('Please wait, you will be forwarded') || text.includes('Turnstile');
      console.log(`[HTTP ${res.status}] ${url}`);
      console.log(`   长度: ${text.length} | 盾挑战中: ${isChallenge}`);

      if (!isChallenge && text.length > 5000) {
        // 提取该艺人的所有近期现场列表
        const setMatches = text.match(/href="(\/tracklist\/[a-zA-Z0-9]+\/[^"]+\.html)"/gi) || [];
        const uniqueSets = [...new Set(setMatches)];
        console.log(`   🌟 成功抓取该艺人专页！发现 ${uniqueSets.length} 场真实 Setlist 链接:`);
        uniqueSets.slice(0, 5).forEach((s, idx) => console.log(`      [${idx + 1}] https://www.1001tracklists.com${s.replace('href="', '').replace('"', '')}`));
      }
    } catch (e) {
      console.log(`[ERR] ${url} - ${e.message}`);
    }
  }
}

testDjPages();
