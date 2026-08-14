import fs from 'fs';

const html = fs.readFileSync('scripts/rss_latest.html', 'utf-8');

// 匹配所有 /tracklist/xxxxxx/ 链接
const setLinks = [];
const linkRegex = /href="(\/tracklist\/[a-zA-Z0-9]+\/[^"]+\.html)"/gi;
let match;
while ((match = linkRegex.exec(html)) !== null) {
  if (!setLinks.includes(match[1])) {
    setLinks.push(match[1]);
  }
}

console.log(`在 1001TL 主页共发现 ${setLinks.length} 个最新现场链接:`);
setLinks.slice(0, 15).forEach((link, idx) => {
  console.log(`  [${idx + 1}] https://www.1001tracklists.com${link}`);
});
