import fs from 'fs';

async function testSearchPost(query = 'Culture Shock') {
  console.log('========================================================================');
  console.log(`       测试 1001Tracklists 原生 POST 搜索接口: "${query}"`);
  console.log('========================================================================\n');

  const searchUrl = 'https://www.1001tracklists.com/search/result.php';
  const bodyParams = new URLSearchParams({
    main_search: query,
    search_selection: '1', // 1 = Tracklists (现场 Setlist 搜索)
  });

  const res = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Origin': 'https://www.1001tracklists.com',
      'Referer': 'https://www.1001tracklists.com/',
    },
    body: bodyParams.toString(),
  });

  console.log(`[HTTP ${res.status}] 响应状态`);
  const html = await res.text();
  console.log(`HTML 长度: ${html.length}`);
  fs.writeFileSync('scripts/search_post_result.html', html, 'utf-8');

  // 提取搜索结果中的所有 Setlist 链接
  const sets = [];
  const linkRegex = /<a[^>]*href="(\/tracklist\/[a-zA-Z0-9]+\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const rawUrl = `https://www.1001tracklists.com${match[1]}`;
    const rawTitle = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (rawTitle && rawTitle.length > 5 && !rawTitle.includes('1001Tracklists') && !sets.some(s => s.url === rawUrl)) {
      sets.push({
        title: rawTitle,
        url: rawUrl,
      });
    }
  }

  console.log(`\n🎉 成功从 POST 搜索接口直接获取到 ${sets.length} 场候选演出！`);
  sets.slice(0, 10).forEach((s, idx) => {
    console.log(`   🎪 [${idx + 1}] ${s.title}`);
    console.log(`       🔗 URL: ${s.url}`);
  });
}

testSearchPost('Culture Shock');
testSearchPost('Martin Garrix');
