import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://www.1001tracklists.com/tracklist/29b4vptk/culture-shock-rampage-open-air-belgium-2023-07-01.html';

async function testTurnstileClick() {
  console.log('========================================================================');
  console.log('       Turnstile 智能识别与自动交互穿透实测');
  console.log('========================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false, // 真实视窗模式（更容易通过 Cloudflare 交互行为检测）
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,850',
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    ],
    defaultViewport: { width: 1280, height: 850 }
  });

  try {
    const page = await browser.newPage();

    // 反自动化标记伪装
    await page.evaluateOnNewDocument(() => {
      delete Object.getPrototypeOf(navigator).webdriver;
      window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
    });

    console.log(`[NAVIGATE] 打开目标页面: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[MONITOR] 正在监控页面状态与 Turnstile iframe...');

    for (let i = 1; i <= 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const currentTitle = await page.title();
      const isChallenge = await page.evaluate(() => {
        return document.body ? document.body.innerText.includes('Please wait, you will be forwarded') : false;
      });

      console.log(`   [第 ${i} 秒] Title: "${currentTitle.slice(0, 50)}" | 是否在挑战页: ${isChallenge}`);

      // 尝试定位 Turnstile Iframe 并点击
      if (isChallenge) {
        try {
          const frames = page.frames();
          const turnstileFrame = frames.find(f => f.url().includes('challenges.cloudflare.com'));
          if (turnstileFrame) {
            console.log(`      🎯 发现 Turnstile Iframe: ${turnstileFrame.url().slice(0, 60)}...`);
            // 尝试在 iframe 内点击 checkbox
            const checkbox = await turnstileFrame.$('input[type="checkbox"], #challenge-stage, .ctp-checkbox-label, body');
            if (checkbox) {
              console.log('      👉 尝试触发 Turnstile 交互点击...');
              await checkbox.click().catch(() => {});
            }
          }
        } catch (e) {
          // ignore frame errors
        }
      } else if (!isChallenge && (currentTitle.includes('Culture Shock') || currentTitle.includes('Rampage') || currentTitle.includes('Tracklist'))) {
        console.log('\n🎉 [SUCCESS] 成功进入真实 1001Tracklists 现场页面！');
        break;
      }
    }

    // 检查页面最终曲目
    const finalTracks = await page.evaluate(() => {
      const results = [];
      const nodes = document.querySelectorAll('.tlpItem, .tlpTog');
      nodes.forEach((node, idx) => {
        const tv = node.querySelector('.trackValue, .tlpValue');
        const art = node.querySelector('.artItm, .artistValue');
        const remix = node.querySelector('.remixValue');
        if (tv || art) {
          results.push({
            trackNum: idx + 1,
            artist: art ? art.innerText.trim() : '',
            title: tv ? tv.innerText.trim() : '',
            remix: remix ? remix.innerText.trim() : ''
          });
        }
      });
      return {
        title: document.title,
        tracks: results
      };
    });

    console.log('\n========================================================================');
    console.log(`最终提取结果: 共捕获 ${finalTracks.tracks.length} 首真实现场曲目`);
    console.log('========================================================================');
    finalTracks.tracks.slice(0, 10).forEach(t => {
      console.log(`   🎵 #${t.trackNum} ${t.artist} - ${t.title} ${t.remix ? `(${t.remix})` : ''}`);
    });

    return finalTracks;
  } catch (err) {
    console.error('❌ 测试异常:', err.message);
  } finally {
    await browser.close();
  }
}

testTurnstileClick();
