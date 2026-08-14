import fs from 'fs';

const html = fs.readFileSync('scripts/culture_shock_set.html', 'utf-8');

console.log('Size:', html.length);
console.log('Title:', /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]);

// 寻找 #contentDiv or #main
const mainMatch = /<div id="contentDiv"[^>]*>([\s\S]*?)<\/body>/i.exec(html) || /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
if (mainMatch) {
  const content = mainMatch[1];
  console.log('Content snippet (first 2000 chars):\n');
  const textOnly = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
  console.log(textOnly.slice(0, 40).join('\n'));
}
