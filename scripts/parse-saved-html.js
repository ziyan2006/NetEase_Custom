import fs from 'fs';
import { parse1001TracklistHtml } from '../lib/dj-agent/tracklist-parser.js';

const html = fs.readFileSync('scripts/1001tl_response.html', 'utf-8');
console.log('HTML size:', html.length);

// 查找 HTML 中的关键元素与曲目特征
const schemaMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
console.log('JSON-LD script tags found:', schemaMatch ? schemaMatch.length : 0);
if (schemaMatch) {
  schemaMatch.forEach((s, idx) => console.log(`Script ${idx + 1}:\n`, s.slice(0, 300)));
}

const trackRows = html.match(/class="[^"]*tlpItem[^"]*"/gi) || html.match(/itemprop="tracks"/gi) || html.match(/class="[^"]*trackValue[^"]*"/gi) || html.match(/data-track="[^"]*"/gi);
console.log('Track rows / markers found:', trackRows ? trackRows.length : 0);

// 测试已有的 parse1001TracklistHtml
const parsed = parse1001TracklistHtml(html, { filterUnreleased: false });
console.log('Parsed title:', parsed.title);
console.log('Parsed total count:', parsed.totalCount);
console.log('Parsed tracks (first 5):', parsed.tracks.slice(0, 5));
