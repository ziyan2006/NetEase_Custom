import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

async function testStealth() {
  console.log('========================================================================');
  console.log('       Puppeteer Stealth 插件穿透 1001Tracklists 实测');
  console.log('========================================================================\n');

  console.log(`[TARGET] ${TARGET_URL}`);
  console.log(`[LAUNCH] 启动带 Stealth 规避插件的 Chrome...`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new', // 测试现代无头模式
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ],
    defaultViewport: { width: 1920, height: 1080 },
  });

  try {
    const page = await browser.newPage();

    console.log('[NAVIGATE] 正在请求页面...');
    const res = await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 35000 });
    console.log(`[STATUS] HTTP Status: ${res ? res.status() : 'Unknown'}`);

    console.log('[MONITOR] 轮询页面标题与 Turnstile 状态 (最多 15 秒)...');
    let success = false;
    for (let i = 1; i <= 15; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const title = await page.title();
      const info = await page.evaluate(() => {
        const isTurnstile = document.body ? document.body.innerText.includes('Please wait, you will be forwarded') : false;
        const trackNodes = document.querySelectorAll('.tlpItem, .tlpTog, .artItm');
        return { isTurnstile, tracksCount: trackNodes.length, htmlLen: document.documentElement.outerHTML.length };
      });

      console.log(`   [第 ${i} 秒] Title: "${title.slice(0, 45)}" | 盾挑战中: ${info.isTurnstile} | 发现曲目节点数: ${info.tracksCount}`);

      if (!info.isTurnstile && info.tracksCount > 0) {
        success = true;
        break;
      }
    }

    // 提取曲目
    const data = await page.evaluate(() => {
      const results = [];
      const nodes = document.querySelectorAll('.tlpItem, .tlpTog');
      nodes.forEach((node, idx) => {
        const tv = node.querySelector('.trackValue, .tlpValue');
        const art = node.querySelector('.artItm, .artistValue');
        const remix = node.querySelector('.remixValue');
        if (tv || art) {
          results.push({
            trackNumber: idx + 1,
            artist: art ? art.innerText.trim() : '',
            title: tv ? tv.innerText.trim() : '',
            remix: remix ? remix.innerText.trim() : '',
          });
        }
      });
      return {
        title: document.title,
        tracks: results
      };
    });

    console.log('\n========================================================================');
    console.log(`🎉 [STEALTH RESULT] 提取到 ${data.tracks.length} 首真实现场曲目！`);
    console.log(`页面标题: ${data.title}`);
    console.log('========================================================================');
    data.tracks.slice(0, 10).forEach(t => {
      console.log(`   🎵 #${t.trackNumber} ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''}`);
    });

    return data;
  } catch (err) {
    console.error('❌ Stealth 测试异常:', err.message);
  } finally {
    await browser.close();
  }
}

testStealth();
