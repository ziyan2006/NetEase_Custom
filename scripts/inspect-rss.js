import fs from 'fs';

async function inspectRss() {
  const res = await fetch('https://www.1001tracklists.com/rss/latest.xml', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const text = await res.text();
  console.log('RSS Status:', res.status);
  console.log('RSS text length:', text.length);
  fs.writeFileSync('scripts/rss_latest.html', text, 'utf-8');

  // 检查是否包含现场链接或曲目
  const links = text.match(/https:\/\/www\.1001tracklists\.com\/tracklist\/[^\s"']+/g) || [];
  console.log('Tracklist URLs found in RSS page:', links.length);
  console.log('Sample links (first 10):', links.slice(0, 10));

  const items = text.match(/<item>[\s\S]*?<\/item>/gi) || [];
  console.log('XML <item> tags found:', items.length);
}

inspectRss();
