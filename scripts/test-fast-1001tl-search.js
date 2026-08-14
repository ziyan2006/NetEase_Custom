import { parse1001TracklistHtml } from '../lib/dj-agent/tracklist-parser.js';

async function testFastSearch(query = 'Culture Shock') {
  console.log('========================================================================');
  console.log(`       1001Tracklists 极速搜索接口实测: "${query}"`);
  console.log('========================================================================\n');

  const searchUrl = `https://www.1001tracklists.com/search/result.php?search=${encodeURIComponent(query)}`;
  const startTime = Date.now();

  const res = await fetch(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  const duration = Date.now() - startTime;
  console.log(`[HTTP ${res.status}] 耗时: ${duration}ms | 响应长度: ${res.headers.get('content-length') || 'chunked'}`);
  const html = await res.text();
  console.log(`HTML 字符总数: ${html.length}`);

  // 解析搜索结果中的现场候选
  const sets = [];
  // 匹配所有 <a href="/tracklist/xxxx/xxxx.html">
  const regex = /<a[^>]*href="(\/tracklist\/[a-zA-Z0-9]+\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawUrl = `https://www.1001tracklists.com${match[1]}`;
    const rawTitle = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (rawTitle && rawTitle.length > 5 && !rawTitle.includes('1001Tracklists') && !sets.some(s => s.url === rawUrl)) {
      sets.push({
        title: rawTitle,
        url: rawUrl,
      });
    }
  }

  console.log(`\n🎉 成功从 1001Tracklists 搜索接口直接获取到 ${sets.length} 场候选演出！`);
  sets.slice(0, 10).forEach((s, i) => {
    console.log(`   🎪 [${i + 1}] ${s.title}`);
    console.log(`       🔗 URL: ${s.url}`);
  });
}

testFastSearch('Culture Shock');
testFastSearch('Martin Garrix');
