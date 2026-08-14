import fs from 'fs';

const html = fs.readFileSync('scripts/culture_shock_debug_final.html', 'utf-8');

const pos = html.indexOf('createSearchAc');
if (pos !== -1) {
  console.log('Found createSearchAc snippet:\n', html.slice(pos - 100, pos + 500));
} else {
  console.log('createSearchAc not in inline script.');
}

// 查找所有的 $.ajax or search api endpoints
const ajaxMatches = html.match(/url\s*:\s*['"][^'"]*search[^'"]*['"]/gi) || html.match(/\/ajax\/[^'"]+/gi) || [];
console.log('Ajax search endpoints found in JS:', ajaxMatches);
