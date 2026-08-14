import { execFile } from 'child_process';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

console.log('========================================================================');
console.log('       使用本地真实 Chrome 引擎 (--headless=new) 抓取 1001Tracklists');
console.log('========================================================================\n');

const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  '--dump-dom',
  TARGET_URL,
];

console.log(`[EXEC] 启动本地 Chrome 渲染: ${TARGET_URL}...`);
const startTime = Date.now();

execFile(CHROME_PATH, args, { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }, (err, stdout, stderr) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (err) {
    console.error(`❌ Chrome 运行失败 (${duration}s):`, err.message);
    return;
  }

  console.log(`✅ Chrome 抓取完成 (${duration}s), 获取 DOM 字符数: ${stdout.length}`);
  fs.writeFileSync('scripts/chrome_dump.html', stdout, 'utf-8');

  const hasTurnstile = stdout.includes('Please wait, you will be forwarded') || stdout.includes('cf-browser-verification');
  const hasTracks = /class="[^"]*tlpItem[^"]*"|itemprop="tracks"|class="[^"]*trackValue[^"]*"/i.test(stdout);
  
  // 提取页面标题
  const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(stdout);
  const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

  console.log(`页面标题: "${title}"`);
  console.log(`是否卡在 Turnstile: ${hasTurnstile}`);
  console.log(`是否包含曲目节点: ${hasTracks}`);

  // 尝试提取部分歌名
  const trackMatches = stdout.match(/class="[^"]*trackValue[^"]*"[^>]*>([^<]+)<\/span>/gi) || [];
  console.log(`提取到 trackValue 数量: ${trackMatches.length}`);
  if (trackMatches.length > 0) {
    console.log('前 5 首曲目:');
    trackMatches.slice(0, 5).forEach((t, i) => console.log(`   🎵 #${i + 1} ${t.replace(/<[^>]+>/g, '').trim()}`));
  }
});
