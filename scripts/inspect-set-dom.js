import fs from 'fs';

const html = fs.readFileSync('scripts/culture_shock_set.html', 'utf-8');

console.log('HTML size:', html.length);
console.log('Title tag:', /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);

// 寻找页面中的主要容器和结构
const trackItemMatches = html.match(/class="[^"]*tlp[^"]*"/gi) || [];
console.log('class containing "tlp":', trackItemMatches.length);

const artMatches = html.match(/class="[^"]*art[^"]*"/gi) || [];
console.log('class containing "art":', artMatches.length);

// 提取所有带 " - " 的文本节点
const textMatches = html.match(/>([^<]+ - [^<]+)</g) || [];
console.log('Text nodes with " - ":', textMatches.length);
console.log('Sample text nodes (first 15):');
textMatches.slice(0, 15).forEach((t, i) => console.log(`   ${i + 1}. ${t.replace(/[<>]/g, '').trim()}`));

// 提取所有的链接
const links = html.match(/href="\/track\/[^"]+"/g) || [];
console.log('\nTrack links found (/track/...):', links.length);
links.slice(0, 10).forEach(l => console.log('   ', l));
