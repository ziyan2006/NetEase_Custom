import fs from 'fs';

async function inspectSearch() {
  const res = await fetch('https://www.1001tracklists.com/search/result.php?search=culture+shock', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });

  const text = await res.text();
  console.log('Search Status:', res.status);
  console.log('Search text length:', text.length);
  fs.writeFileSync('scripts/search_result.html', text, 'utf-8');

  // 提取搜索到的 tracklist 或 dj 链接
  const links = text.match(/href="(\/[^"]+)"/g) || [];
  const tracklistLinks = links.filter(l => l.includes('tracklist') || l.includes('dj') || l.includes('source'));
  console.log('Tracklist/DJ links in search result:', tracklistLinks.length);
  tracklistLinks.slice(0, 20).forEach(l => console.log('   ', l));
}

inspectSearch();
