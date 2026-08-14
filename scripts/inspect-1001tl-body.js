import fs from 'fs';

const TEST_SET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

async function inspectHtml() {
  const res = await fetch(TEST_SET_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  const text = await res.text();
  console.log('Body length:', text.length);
  console.log('Body snippet (first 1000 chars):\n', text.slice(0, 1000));

  fs.writeFileSync('scripts/1001tl_response.html', text, 'utf-8');
  console.log('Saved to scripts/1001tl_response.html');
}

inspectHtml();
