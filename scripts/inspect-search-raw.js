import fs from 'fs';

async function inspectSearchHtml() {
  const res = await fetch('https://www.1001tracklists.com/search/result.php?search=Culture+Shock', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });

  const html = await res.text();
  fs.writeFileSync('scripts/culture_shock_search_raw.html', html, 'utf-8');
  console.log('HTML size:', html.length);

  // 打印所有 a 标签
  const aTags = html.match(/<a[^>]+href="[^"]+"[^>]*>[\s\S]*?<\/a>/gi) || [];
  console.log('Total <a> tags found in search page:', aTags.length);
  aTags.slice(0, 30).forEach((a, i) => console.log(`   [${i + 1}] ${a.replace(/\s+/g, ' ').slice(0, 120)}`));
}

inspectSearchHtml();
