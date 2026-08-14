import fs from 'fs';

const html = fs.readFileSync('scripts/culture_shock_set.html', 'utf-8');

// 查找所有的 <div class="..."> 看看曲目包裹在什么 class 里
const classes = new Set();
const classMatches = html.matchAll(/class="([^"]+)"/g);
for (const m of classMatches) {
  m[1].split(/\s+/).forEach(c => classes.add(c));
}

console.log('Unique CSS classes found in culture_shock_set.html:', Array.from(classes).filter(c => c.length > 2).slice(0, 50));

// 搜索任何包含歌手或歌名的地方 (e.g. "Renaissance", "Culture Shock", "Sub Focus", "Dimension", "Solar System")
const keywords = ['Renaissance', 'Sub Focus', 'Dimension', 'Solar System', 'Desire', 'Afterglow', 'Wilkinson', '1991'];
keywords.forEach(kw => {
  const count = (html.match(new RegExp(kw, 'gi')) || []).length;
  console.log(`Keyword "${kw}" count in HTML:`, count);
});

// 如果存在关键字，打印关键字周围的 HTML
const pos = html.indexOf('Renaissance');
if (pos !== -1) {
  console.log('\nHTML around "Renaissance":\n', html.slice(Math.max(0, pos - 200), pos + 300));
} else {
  // 查找任意 artistValue 或类似结构
  const artPos = html.indexOf('Culture Shock');
  console.log('\nHTML around "Culture Shock":\n', html.slice(Math.max(0, artPos - 200), artPos + 300));
}
