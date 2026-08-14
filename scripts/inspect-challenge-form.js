import fs from 'fs';

const html = fs.readFileSync('scripts/1001tl_response.html', 'utf-8');

const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
console.log('Forms found:', forms.length);
forms.forEach((f, idx) => console.log(`Form ${idx + 1}:\n`, f));

const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
console.log('\nScripts found:', scripts.length);
scripts.forEach((s, idx) => {
  if (!s.includes('google') && !s.includes('analytics') && s.length < 3000) {
    console.log(`Script ${idx + 1} (${s.length} chars):\n`, s);
  }
});
