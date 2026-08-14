import fs from 'fs';

const html = fs.readFileSync('scripts/search_post_result.html', 'utf-8');

console.log('HTML size:', html.length);
console.log('Title:', /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);

// 查找所有的 <a> 标签和 class 包含 result 或 tracklist 的元素
const aTags = html.match(/<a[^>]+href="[^"]+"[^>]*>[\s\S]*?<\/a>/gi) || [];
console.log('Total <a> tags:', aTags.length);
aTags.forEach((a, idx) => console.log(`   [${idx + 1}] ${a.replace(/\s+/g, ' ').slice(0, 150)}`));
