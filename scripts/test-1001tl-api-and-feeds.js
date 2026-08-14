/**
 * 探测 1001Tracklists 内部接口、RSS、Ajax 端点与开放路由
 */

const ENDPOINTS = [
  'https://www.1001tracklists.com/rss/',
  'https://www.1001tracklists.com/rss/latest.xml',
  'https://www.1001tracklists.com/sitemap.xml',
  'https://www.1001tracklists.com/api/v1/',
  'https://www.1001tracklists.com/ajax/get_tracklist.php',
  'https://www.1001tracklists.com/ajax/search.php?q=culture+shock',
  'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html?format=json',
];

async function probeEndpoints() {
  console.log('========================================================================');
  console.log('       1001Tracklists 开放端点 / RSS / Ajax 探测');
  console.log('========================================================================\n');

  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, application/xml, text/xml, */*'
        }
      });
      const text = await res.text();
      const isChallenge = text.includes('Please wait, you will be forwarded') || text.includes('Cloudflare');
      console.log(`[${res.status}] ${ep} (长度: ${text.length}) | 盾拦截: ${isChallenge}`);
      if (!isChallenge && text.length > 50 && res.status < 400) {
        console.log(`   🌟 发现可用内容 snippet:\n${text.slice(0, 200)}\n`);
      }
    } catch (e) {
      console.log(`[ERR] ${ep} - ${e.message}`);
    }
  }
}

probeEndpoints();
