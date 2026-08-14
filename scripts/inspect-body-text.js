import fs from 'fs';

const html = fs.readFileSync('scripts/1001tl_response.html', 'utf-8');

// 打印所有 <h1> 到 <h4> 以及主要的 <div> id 和 class
const headings = html.match(/<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>/gi) || [];
console.log('Headings:', headings);

// 打印 body 中间部分
const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
if (bodyMatch) {
  const cleanBody = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('Clean body text (first 1000 chars):\n', cleanBody.slice(0, 1000));
}
