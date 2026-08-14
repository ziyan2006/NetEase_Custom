import fs from 'fs';

const html = fs.readFileSync('scripts/real_browser_dump.html', 'utf-8');

const matches = html.match(/href="(\/tracklist\/[a-zA-Z0-9]+\/[^"]+\.html)"/gi) || [];
console.log('Real 1001TL tracklist URLs found in page:');
matches.forEach(m => console.log('  ', m));
