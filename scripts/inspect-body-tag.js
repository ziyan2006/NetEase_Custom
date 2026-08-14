import fs from 'fs';

const html = fs.readFileSync('scripts/culture_shock_set.html', 'utf-8');

const bodyMatch = /<body[^>]*>([\s\S]*?)<\/html>/i.exec(html);
if (bodyMatch) {
  console.log('Body HTML:\n', bodyMatch[1]);
} else {
  console.log('No body tag found. HTML length:', html.length);
}
